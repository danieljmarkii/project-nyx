// Supabase Edge Function — delete-account
// In-app account deletion (B-039 PR 1). Satisfies Apple Guideline 5.1.1(v)
// (in-app account deletion) and GDPR Art. 17 (right to erasure).
//
// Hard-delete (PM 2026-06-19): purge the user's Storage objects, then delete the
// `auth.users` row, which fires the existing `ON DELETE CASCADE` FK graph — every
// pet-data table cascades from `auth.users`/`pets` — so there is NO table-by-table
// delete loop and NO new schema. `medication_items` ROWS survive with attribution
// nulled (`created_by_user_id → SET NULL`), but their drug-LABEL photos do NOT — a
// prescription label is per-user PII (clinic/owner/pet names), so `nyx-medication-photos`
// joins the PURGE list (B-127).
//
// B-354 FR-7 (2026-07-16): once the food/med catalogs went PER-ACCOUNT (migration 033),
// `food_items` is the user's own data — migration 033 flipped its FK to `ON DELETE
// CASCADE`, so the ROWS are hard-deleted by the cascade, and this function now PURGES
// `nyx-food-photos` too (inverting the old FR-4 "preserve the global catalog" carve-out).
// So `nyx-food-photos` and `nyx-medication-photos` are BOTH purged here; the only
// remaining asymmetry is that a medication catalog ROW survives (SET NULL) while a food
// ROW is deleted (CASCADE) — the label photos of both are erased.
//
// Dual client, mirroring analyze-vomit: a `userClient` (caller JWT) used ONLY to
// verify identity, and an `adminClient` (service role) for the privileged Storage
// purge + auth delete. The `userId` comes from the VERIFIED token, never the
// request body (FR-2, confused-deputy guard) — the function reads no id from the
// body at all, so a caller can only ever delete THEMSELVES.
//
// B-119 (re-auth hardening): before ANY delete, re-verify the account PASSWORD.
// Type-to-confirm DELETE (the client's own gate) defends an accidental tap; it
// does nothing against an unlocked/stolen phone whose holder already has a valid
// session — and a client-side check ALONE would be bypassable by anyone who lifts
// the session token and calls this function directly. So the password is sent
// with the request and this function re-verifies it server-side against the
// token-holder's OWN email (from the verified token, never the body) on a fresh
// anon client; a wrong/absent password returns 401 and nothing is deleted. This
// is the ONE value read from the body — still never an id, so the confused-deputy
// guard holds — and it is never logged. Unlike change-password, deletion is our
// own endpoint with no Supabase "Secure password change" backstop, so this
// server-side re-verify is the only place the direct-API bypass can be closed.
// (Apple/passwordless re-confirm is B-120, gated to Apple Sign-In shipping; every
// account today is email+password, so password IS the factor.)
//
// Order is load-bearing (FR-6): collect owned paths → purge Storage (best-effort)
// → delete the auth user LAST. A failed/partial run leaves the account intact and
// re-runnable, so health photos are never orphaned with their DB rows already
// cascaded away. The scoping/ordering logic is the pure ./plan.ts module
// (unit-tested in plan.test.ts); this file is the I/O shell.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildDeletionPlan, chunk, extractPassword, STORAGE_REMOVE_CHUNK, type OwnedStoragePaths } from './plan.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Gather every Storage object owned by this user (FR-3), via distinct ownership
// scopes: `pets.user_id = userId` for the pet-health objects (pet photos + event/vet
// attachments + vet-report PDFs), and `created_by_user_id = userId` for BOTH catalog
// tables' label photos — `medication_items` (drug labels, B-127) and, since the
// per-account re-scope, `food_items` (food labels, B-354 FR-7). Neither catalog has a
// `pet_id`, so the creator IS the ownership key. The admin client bypasses RLS, so
// these WHERE clauses ARE the entire access boundary — they replicate, by hand, the RLS
// policies that protect these tables for ordinary reads (pet-ownership for the
// pet-scoped tables; creator-locked for both catalogs, migrations 020/033). Paths come
// only from owned rows, never from client input, and this runs BEFORE any delete because
// the cascade will destroy the rows that hold these paths.
//
// ⚠ One caveat on "never from client input": for BOTH catalogs the path VALUES inside an
// owned row ARE attacker-influenceable — each is an authenticated-writable catalog with
// an unconstrained `photo_paths` TEXT[] (RLS gates which ROW you write, not the column
// CONTENTS), so a crafted owned row could reference another user's path string. We pass
// two scope keys through to plan.ts: `ownerUserId` (the verified-JWT uid) re-scopes the
// medication paths to the deleting user's own `{uid}/` prefix (B-128), and
// `ownedFoodItemIds` re-scopes the food paths to the set of food ids this user created
// (B-354 FR-7, food paths being `{foodItemId}/…`) — so a crafted cross-tenant path never
// reaches the service-role purge. An earlier revision claimed the
// pet/event/vet-attachment/vet-report paths "need no such guard: they come from
// pet-scoped rows" — wrong on its own terms (B-431 finding 4): row ownership is
// pet-scoped, the column VALUE is not. The pet-photo list is now re-scoped too, via
// `ownedPetIds` → scopePetPhotoPaths (B-463): migration 042's CHECK closed the plain
// cross-tenant form at the write path, but it is a prefix test that admits a `..`
// traversal key, and the purge must not depend on the CHECK staying in place. The
// event/vet-attachment lists remain un-scoped at this consumer — their prefix CHECKs
// (025/043) carry the same traversal residual, and their guards are their own
// three-segment shapes, tracked as B-660 rather than lifted blindly from this PR.
//
// `vet_documents` (B-478) is pet-scoped too, and is nonetheless re-scoped via a third
// key, `ownedPetIds`. Not because the ROW source is untrusted, but because
// `storage_path`'s `starts_with` CHECK is a PREFIX test that admits
// `{ownPetId}/../{victimPetId}/x.pdf` — its first FOLDER segment is a pet the caller
// owns. scopeVetDocumentPaths closes that by requiring the whole
// `{pet_id}/{document_id}.{ext}` shape (exactly two segments), rather than leaving the
// boundary to depend on Storage treating keys as opaque. Note it is the SHAPE test,
// not a first-segment test, that does the work — a first-segment filter keeps the
// traversal key, which is what an earlier revision of this got wrong.
// Read EVERY `storage_path` a pet-scoped table holds for these pets, paging past
// PostgREST's row cap.
//
// ⚠ This paginates on purpose, and the un-paginated version was a real erasure hole
// (found by the VF-1 rls-privacy-reviewer). PostgREST applies a `Max rows` cap to
// every request; a plain `.select().in(...)` silently returns only the first page,
// and the surplus objects then survive the purge while the function still returns
// `ok: true` with a `removed` count that reads like success. Silent under-deletion is
// the one failure mode an erasure path must not have. The app's own hydration
// (`lib/sync.ts` fetchAllRows) has paged for exactly this reason since B-054; this
// function had not, which was an inconsistency rather than a decision.
//
// B-478 is what made it worth fixing now rather than filing: §4.4 makes
// `vet_documents` the first table where ONE document is N ROWS (one per page of a
// multi-page discharge sheet or an N-screenshot email thread), so a real library
// reaches the cap far sooner than events or attachments ever did — and AC 8 asks for
// "zero objects, verified count, not assumed."
//
// Ordered by `id` (stable and unique) so pages neither skip nor duplicate — the same
// argument fetchAllRows makes. A page shorter than the request size ends the walk;
// note that if the server cap is BELOW `PATH_PAGE` every page comes back short, so
// the request size is deliberately kept small enough to sit under any plausible cap.
const PATH_PAGE = 500
async function readAllOwnedPaths(
  adminClient: SupabaseClient,
  table: string,
  petIds: string[],
): Promise<{ data: { storage_path: string }[] | null; error: { message: string } | null }> {
  const out: { storage_path: string }[] = []
  for (let from = 0; ; from += PATH_PAGE) {
    const { data, error } = await adminClient
      .from(table)
      .select('storage_path')
      .in('pet_id', petIds)
      .order('id', { ascending: true })
      .range(from, from + PATH_PAGE - 1)
    // Surface the error rather than returning a partial list: every caller below
    // decides for itself whether a read failure is fatal, and a silently truncated
    // list would look exactly like a complete one.
    if (error) return { data: null, error }
    const page = (data ?? []) as { storage_path: string }[]
    out.push(...page)
    if (page.length < PATH_PAGE) break
  }
  return { data: out, error: null }
}

async function collectOwnedPaths(adminClient: SupabaseClient, userId: string): Promise<OwnedStoragePaths> {
  // Three independent top-level reads, in parallel: the user's pets (their own photos
  // PLUS the ownership scope for the child tables below), and the medication_items and
  // food_items the user created.
  //
  // Both catalogs are scoped by `created_by_user_id`, NOT `pet_id` — neither has a
  // `pet_id` (B-127 / B-354). Two consequences: (1) a user with ZERO pets can still have
  // contributed catalog rows whose label photos are their data/PII, so these gathers must
  // NOT sit behind the `petIds === 0` early return; (2) they must run BEFORE the auth-user
  // delete — they already do, as FR-6 collects every path first — because that delete
  // cascades/nulls the rows that hold these paths, orphaning the photos with no row left
  // to find them by (food rows CASCADE-delete since migration 033; medication rows survive
  // via SET NULL, but their photo_paths would be gone from memory just the same).
  const [petsRes, medItemsRes, foodItemsRes] = await Promise.all([
    adminClient.from('pets').select('id, photo_path').eq('user_id', userId),
    adminClient.from('medication_items').select('photo_paths').eq('created_by_user_id', userId),
    // food_items is now PER-ACCOUNT (migration 033) — `created_by_user_id` is the
    // ownership scope, same as medication_items. Read the user's OWN food rows to (a)
    // collect their label photos for the purge (B-354 FR-7) and (b) build the owned-id
    // SET that scopeFoodPaths uses to reject a crafted cross-tenant `{victimFoodId}/…`
    // path. Like meds, this is NOT pet-scoped, so it must sit ABOVE the no-pets early
    // return and run BEFORE the auth delete (the FK CASCADE will hard-delete these rows).
    adminClient.from('food_items').select('id, photo_paths').eq('created_by_user_id', userId),
  ])
  if (petsRes.error) throw new Error(`Failed to read pets: ${petsRes.error.message}`)
  // medication_items exists today (migration 020, applied to live DB) — unlike the
  // forward-looking vet_reports below, a read error here is a REAL failure. Throw so
  // the whole run aborts and retries (idempotent, FR-6) rather than silently skipping
  // the prescription-label purge and leaking PII.
  if (medItemsRes.error) throw new Error(`Failed to read medication_items: ${medItemsRes.error.message}`)
  // food_items likewise exists today (migration 001, per-account since 033) — a read
  // error is a REAL failure: skipping it would leak the user's food-label photos and,
  // worse, an EMPTY owned-id set would make scopeFoodPaths drop EVERY food path, so a
  // silent degrade could look like a clean purge while erasing nothing. Throw and retry.
  if (foodItemsRes.error) throw new Error(`Failed to read food_items: ${foodItemsRes.error.message}`)

  const petIds = (petsRes.data ?? []).map((p) => p.id as string)
  const petPhotoPaths = (petsRes.data ?? []).map((p) => p.photo_path as string | null)
  // photo_paths is a TEXT[] per drug row — flatten every owned row's array into the
  // single flat list the pure plan consumes. It is NOT NULL DEFAULT '{}' at the DB
  // level, but guard against a null defensively; cleanPaths drops blanks/dupes.
  const medicationPhotoPaths = (medItemsRes.data ?? []).flatMap(
    (m) => (m.photo_paths as (string | null)[] | null) ?? [],
  )
  // Same flatten for food label photos, PLUS the owned-food-id set that scopeFoodPaths
  // keys on. Both come from the same owned rows so a path and its permitting id always
  // travel together — an owned row's photos are only ever purged under an id we vouch for.
  const ownedFoodItemIds = (foodItemsRes.data ?? []).map((f) => f.id as string)
  const foodPhotoPaths = (foodItemsRes.data ?? []).flatMap(
    (f) => (f.photo_paths as (string | null)[] | null) ?? [],
  )

  // No pets ⇒ no pet-scoped objects. Skip the child queries (an empty `.in()` is
  // a wasted round-trip) and return just the — possibly empty — pet photos. The
  // medication AND food label photos are NOT pet-scoped, so they still ride this
  // early return (a user with zero pets can still have contributed catalog rows).
  if (petIds.length === 0) {
    return { petPhotoPaths, eventAttachmentPaths: [], vetAttachmentPaths: [], vetDocumentPaths: [], vetReportPaths: [], medicationPhotoPaths, foodPhotoPaths, ownedFoodItemIds, ownedPetIds: petIds, ownerUserId: userId }
  }

  const [eventAttRes, vetAttRes, vetDocRes, vetReportRes] = await Promise.all([
    readAllOwnedPaths(adminClient, 'event_attachments', petIds),
    readAllOwnedPaths(adminClient, 'vet_visit_attachments', petIds),
    // B-478 VF-1 — the Vet Files library. Pet-scoped exactly like the two above.
    readAllOwnedPaths(adminClient, 'vet_documents', petIds),
    readAllOwnedPaths(adminClient, 'vet_reports', petIds),
  ])
  if (eventAttRes.error) throw new Error(`Failed to read event_attachments: ${eventAttRes.error.message}`)
  if (vetAttRes.error) throw new Error(`Failed to read vet_visit_attachments: ${vetAttRes.error.message}`)
  // vet_documents is a HARD failure, NOT the tolerated degrade vet_reports gets below.
  // The distinction is deliberate. vet_reports is tolerated because its table genuinely
  // does not exist yet (Step 9), so a read error there is the expected state rather
  // than a fault. `vet_documents` ships in migration 044, in the same PR as this
  // change and applied before it is deployed — so a read error here means something is
  // actually wrong, and degrading it to "no documents" would let the run report a
  // clean deletion while leaving every one of this owner's lab results and
  // vaccination certificates sitting in the bucket. Silence in the direction of "we
  // erased it" is the one failure mode an erasure path must not have (§6.2: verified
  // in QA, not assumed). Throw so the whole run aborts and retries — it is idempotent
  // by construction (FR-6: the auth delete is last), so the account survives intact.
  if (vetDocRes.error) throw new Error(`Failed to read vet_documents: ${vetDocRes.error.message}`)
  // vet_reports is forward-looking (Step 9). Degrade a read error to "no PDFs"
  // rather than fail the whole deletion — there are no rows today, and when Step 9
  // ships the table read succeeds normally. The actual PDF removal is best-effort
  // below regardless.
  let vetReportPaths: (string | null)[] = []
  if (vetReportRes.error) {
    console.warn('delete-account: vet_reports read failed (forward-looking, tolerated):', vetReportRes.error.message)
  } else {
    vetReportPaths = (vetReportRes.data ?? []).map((r) => r.storage_path as string)
  }

  return {
    petPhotoPaths,
    eventAttachmentPaths: (eventAttRes.data ?? []).map((r) => r.storage_path as string),
    vetAttachmentPaths: (vetAttRes.data ?? []).map((r) => r.storage_path as string),
    vetDocumentPaths: (vetDocRes.data ?? []).map((r) => r.storage_path as string),
    vetReportPaths,
    medicationPhotoPaths,
    foodPhotoPaths,
    ownedFoodItemIds,
    // The same pet ids that scoped the reads above, passed through so
    // scopeVetDocumentPaths and scopePetPhotoPaths (B-463) can re-check each
    // vet-document / pet-photo key against them — a path and the ids that permit it
    // always travel together. Both validate the whole two-segment shape, not just
    // the leading segment; a first-segment-only test keeps the `..` traversal key
    // (see plan.ts).
    ownedPetIds: petIds,
    ownerUserId: userId,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }

  // Fail fast on a misconfigured deployment rather than constructing a client with
  // an undefined key and surfacing an opaque downstream error. The service-role key
  // in particular MUST be present — without it every privileged op below would be
  // unauthenticated. Mirrors the lib/supabase.ts fail-fast pattern.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('delete-account: missing required env (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)')
    return Response.json({ error: 'Server misconfigured' }, { status: 500, headers: CORS_HEADERS })
  }

  // userClient: used ONLY to verify the caller's identity from their JWT. It never
  // reads or deletes data — the admin client does that.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  // adminClient: service role — Storage purge + auth delete (privileged ops).
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // FR-2: identity from the VERIFIED token, never the body. getUser(jwt) performs a
  // server-side verification against the auth server (signature + expiry), not a
  // local decode; we read no user/pet id from the request body at all (only the
  // B-119 password, re-verified below), so a caller can only ever delete
  // THEMSELVES (confused-deputy guard — the rls-privacy-reviewer's first attack).
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt)
  if (authErr || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }
  const userId = user.id

  try {
    // 0. Re-auth (B-119) — BEFORE any delete, so a failed re-auth leaves the
    //    account fully intact. Read the password (the ONLY thing read from the
    //    body, and never an id) via the pure, unit-tested extractPassword, which
    //    fails closed on a missing/empty/non-string value. req.json() itself
    //    throws on an empty body — caught here to the same closed 401.
    let password: string | null = null
    try {
      password = extractPassword(await req.json())
    } catch {
      // No or invalid JSON body → password stays null → 401 below.
    }
    if (!password) {
      return Response.json({ error: 'reauth_required' }, { status: 401, headers: CORS_HEADERS })
    }
    // The email comes from the VERIFIED token, never the body. Every Nyx account
    // today is email+password (social auth is flag-off), so this is the re-auth
    // factor. A token with no email can't be password-verified — fail closed
    // (there are no such accounts today) rather than skip the check; the
    // Apple/passwordless re-confirm path is B-120, gated to Apple Sign-In.
    if (!user.email) {
      return Response.json({ error: 'reauth_unavailable' }, { status: 401, headers: CORS_HEADERS })
    }
    // Verify on a FRESH anon client (no caller Authorization header) so the
    // existing session never interacts with the sign-in. A wrong password returns
    // an auth error → 401, and NOTHING below runs. Brute force is bounded by
    // GoTrue's existing per-account sign-in rate limits (identical to the login
    // endpoint), and a caller can only ever target their own account (email from
    // their own token). The password is never logged.
    const reauthClient = createClient(supabaseUrl, anonKey)
    const { error: reauthErr } = await reauthClient.auth.signInWithPassword({
      email: user.email,
      password,
    })
    if (reauthErr) {
      // Do not echo the provider string or distinguish wrong-password from other
      // auth failures in the response; the account is intact and re-runnable.
      console.warn('delete-account: re-auth failed for user', userId)
      return Response.json({ error: 'reauth_failed' }, { status: 401, headers: CORS_HEADERS })
    }

    // 1. Collect owned Storage paths BEFORE any delete (FR-3).
    const ownedPaths = await collectOwnedPaths(adminClient, userId)

    // 2. Build the ordered plan: purges first, auth delete last and once (FR-6).
    const plan = buildDeletionPlan(ownedPaths)

    // 3. Execute. Storage purges are best-effort (FR-5): aggregate failures and
    //    never abort on a missing/failed object or a not-yet-created bucket. The
    //    auth-user delete is the ONLY fatal step (FR-7).
    let removed = 0
    const storageFailures: string[] = []
    let authDeleted = false

    for (const step of plan) {
      if (step.kind === 'purge-bucket') {
        // Batch the removal so one rejected chunk can't drop the rest of the bucket.
        for (const batch of chunk(step.paths, STORAGE_REMOVE_CHUNK)) {
          try {
            const { data, error } = await adminClient.storage.from(step.bucket).remove(batch)
            if (error) storageFailures.push(`${step.bucket}: ${error.message}`)
            else removed += data?.length ?? 0
          } catch (e) {
            // A non-existent bucket (nyx-vet-reports before Step 9) may throw
            // rather than return an error — tolerate it; this is best-effort.
            storageFailures.push(`${step.bucket}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      } else if (step.kind === 'delete-auth-user') {
        // delete-auth-user — LAST. Fires the FK cascade that erases every DB row.
        const { error } = await adminClient.auth.admin.deleteUser(userId)
        if (error) throw new Error(`auth.admin.deleteUser failed: ${error.message}`)
        authDeleted = true
      } else {
        // Exhaustiveness guard: a future DeletionStep kind must never silently fall
        // through to the destructive auth delete. `never` makes this a compile-time
        // error if plan.ts adds a step without handling it here.
        const _exhaustive: never = step
        throw new Error(`Unknown deletion step: ${JSON.stringify(_exhaustive)}`)
      }
    }

    if (storageFailures.length > 0) {
      // Not fatal: the auth user (and every DB row) is gone; these objects are
      // orphaned and get reaped by the periodic sweep (B-121). Log so it can.
      console.warn(
        `delete-account: ${storageFailures.length} storage purge failure(s) for user ${userId}:`,
        storageFailures.join('; '),
      )
    }

    // FR-7: ok:true ONLY when the auth user is actually deleted. This guard is
    // defense-in-depth — buildDeletionPlan always emits exactly one terminal
    // delete-auth-user step (unit-pinned) — so it only trips if a future plan.ts
    // regression drops it; it is not a reachable path today.
    if (!authDeleted) throw new Error('auth user was not deleted')
    // `removed` is an informational object count, not an authoritative audit
    // figure: a retried run (AC-9) legitimately removes 0 because the prior run
    // already cleared the objects. The health signal is `failed`, logged above.
    return Response.json({ ok: true, storage: { removed, failed: storageFailures.length } }, { headers: CORS_HEADERS })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('delete-account error:', message)
    // FR-7: honest failure. The account is intact (the auth delete is last) and
    // the run is safe to retry — paths are re-collected from the surviving rows.
    return Response.json({ error: 'Account deletion failed', detail: message }, { status: 500, headers: CORS_HEADERS })
  }
})
