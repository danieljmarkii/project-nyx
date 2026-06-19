// Supabase Edge Function — delete-account
// In-app account deletion (B-039 PR 1). Satisfies Apple Guideline 5.1.1(v)
// (in-app account deletion) and GDPR Art. 17 (right to erasure).
//
// Hard-delete (PM 2026-06-19): purge the user's Storage objects, then delete the
// `auth.users` row, which fires the existing `ON DELETE CASCADE` FK graph — every
// pet-data table cascades from `auth.users`/`pets` — so there is NO table-by-table
// delete loop and NO new schema. `food_items` + `nyx-food-photos` survive (global
// catalog; `created_by_user_id → SET NULL`).
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

// Gather every Storage object owned by this user, scoped STRICTLY through
// `pets.user_id = userId` (FR-3). The admin client bypasses RLS, so these WHERE
// clauses ARE the entire access boundary — they replicate, by hand, the
// pet-ownership RLS policy ("pet_id IN (SELECT id FROM pets WHERE user_id = …)")
// that protects these tables for ordinary reads. Paths come only from owned rows,
// never from client input, and this runs BEFORE any delete because the cascade
// will destroy the rows that hold these paths.
async function collectOwnedPaths(adminClient: SupabaseClient, userId: string): Promise<OwnedStoragePaths> {
  // The user's pets: their own photos, and the ownership scope for the child
  // tables below.
  const { data: pets, error: petsErr } = await adminClient
    .from('pets')
    .select('id, photo_path')
    .eq('user_id', userId)
  if (petsErr) throw new Error(`Failed to read pets: ${petsErr.message}`)

  const petIds = (pets ?? []).map((p) => p.id as string)
  const petPhotoPaths = (pets ?? []).map((p) => p.photo_path as string | null)

  // No pets ⇒ no pet-scoped objects. Skip the child queries (an empty `.in()` is
  // a wasted round-trip) and return just the — possibly empty — pet photos.
  if (petIds.length === 0) {
    return { petPhotoPaths, eventAttachmentPaths: [], vetAttachmentPaths: [], vetReportPaths: [] }
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
