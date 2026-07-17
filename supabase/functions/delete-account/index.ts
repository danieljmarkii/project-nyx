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
// Order is load-bearing (FR-6): collect owned paths → purge Storage (best-effort)
// → delete the auth user LAST. A failed/partial run leaves the account intact and
// re-runnable, so health photos are never orphaned with their DB rows already
// cascaded away. The scoping/ordering logic is the pure ./plan.ts module
// (unit-tested in plan.test.ts); this file is the I/O shell.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildDeletionPlan, chunk, STORAGE_REMOVE_CHUNK, type OwnedStoragePaths } from './plan.ts'

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
// reaches the service-role purge. The pet/event/vet paths need no such guard: they come
// from pet-scoped rows.
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
    return { petPhotoPaths, eventAttachmentPaths: [], vetAttachmentPaths: [], vetReportPaths: [], medicationPhotoPaths, foodPhotoPaths, ownedFoodItemIds, ownerUserId: userId }
  }

  const [eventAttRes, vetAttRes, vetReportRes] = await Promise.all([
    adminClient.from('event_attachments').select('storage_path').in('pet_id', petIds),
    adminClient.from('vet_visit_attachments').select('storage_path').in('pet_id', petIds),
    adminClient.from('vet_reports').select('storage_path').in('pet_id', petIds),
  ])
  if (eventAttRes.error) throw new Error(`Failed to read event_attachments: ${eventAttRes.error.message}`)
  if (vetAttRes.error) throw new Error(`Failed to read vet_visit_attachments: ${vetAttRes.error.message}`)
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
    vetReportPaths,
    medicationPhotoPaths,
    foodPhotoPaths,
    ownedFoodItemIds,
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
  // local decode; we read no user/pet id from the request body at all, so a caller
  // can only ever delete THEMSELVES (confused-deputy guard — the
  // rls-privacy-reviewer's first attack).
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt)
  if (authErr || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
  }
  const userId = user.id

  try {
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
