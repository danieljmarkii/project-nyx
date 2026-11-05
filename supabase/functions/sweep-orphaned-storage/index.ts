// Supabase Edge Function — sweep-orphaned-storage
//
// The periodic orphaned-storage sweep (CUL-2421; the backstop CUL-231 and
// delete-account's post-delete sweep both name). It removes files whose owning row
// (pet, food item, auth user) is proved gone; every rule for what counts as proved is
// in ./plan.ts, which is pure and unit-tested. This file is the I/O shell.
//
// Who can call it: the platform's verify_jwt gate admits any valid project JWT, the
// public anon key included, which is how the daily pg_cron job reaches it with no new
// secret. That is safe by construction: the only thing read from the request is the
// fixed run marker (plan.ts gate), never an id or a path, so a caller cannot point it
// at a folder; a call can only remove files that are already due; a run starts only in
// the schedule's daily window; and the reply is 204 with no body, so it tells a caller
// nothing about what it found. The run line in the function's own log carries counts
// only (plan.ts runLine). A call without the marker (the deploy's smoke POST) gets a
// 400 with an error body and does nothing.
//
// The daily check (CUL-2521): `{ check: 'overdue' }`, in its own window (plan.ts gate),
// runs the same pass with a remove that deletes nothing and answers 204 (nothing due was
// left) or 200 `{ overdue, incomplete }`. It reveals two bits, never a count, a path or
// an id.
//
// One run at a time per worker: a second request while one runs gets 204 and does
// nothing, so a burst of calls cannot multiply the Storage load. Two workers can still
// overlap; every step is idempotent (a remove of an object already removed removes
// nothing), so overlap only repeats work.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sweepBudget, userProbeOf } from '../delete-account/plan.ts'
import { checkLine, checkVerdict, gate, runLine, runStartOf, runSweep, type SweepIO, type TimedLister } from './plan.ts'

const WORKER_STARTED_AT = Date.now()
let running = false

function timedLister(admin: SupabaseClient, bucket: string): TimedLister {
  return async (prefix, offset, limit) => {
    const files = admin.storage.from(bucket)
    const { data, error } = await files.list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`list failed: ${error.message}`)
    return (data ?? []).map((e) => ({
      name: e.name,
      // storage-api returns a folder with a null id; supabase-js types id as string.
      id: (e.id as string | null) ?? null,
      createdAt: (e.created_at as string | null) ?? null,
      updatedAt: (e.updated_at as string | null) ?? null,
    }))
  }
}

// CUL-2521: the check's IO. The real reads, and a remove that deletes NOTHING: it
// answers every key as removed, so the report's `removed` counts what the morning run
// left behind. Built from sweepIO so the reads can never drift from the run's.
function checkIO(admin: SupabaseClient): SweepIO {
  return { ...sweepIO(admin), remove: (_bucket, keys) => Promise.resolve(keys.length) }
}

function sweepIO(admin: SupabaseClient): SweepIO {
  return {
    async listBuckets() {
      const { data, error } = await admin.storage.listBuckets()
      if (error) throw new Error(`listBuckets failed: ${error.message}`)
      return (data ?? []).map((b) => b.id)
    },
    listerFor: (bucket) => timedLister(admin, bucket),
    async liveIds(table, ids) {
      // Each table named as a literal, so the read-words write scan (CUL-1323) can see
      // that this function only ever reads `pets` and `food_items`.
      const query = table === 'pets' ? admin.from('pets') : admin.from('food_items')
      const { data, count, error } = await query.select('id', { count: 'exact' }).in('id', ids)
      return {
        ids: data ? data.map((r: { id: string }) => r.id) : null,
        count: typeof count === 'number' ? count : null,
        error: error ? error.message : null,
      }
    },
    async retiredFoods(ids) {
      const { data, count, error } = await admin
        .from('food_item_retired_ids')
        .select('id, owner_id', { count: 'exact' })
        .in('id', ids)
      return {
        rows: data ? data.map((r: { id: string; owner_id: string | null }) => ({ id: r.id, owner: r.owner_id })) : null,
        count: typeof count === 'number' ? count : null,
        error: error ? error.message : null,
      }
    },
    async probeUser(id) {
      const { data, error } = await admin.auth.admin.getUserById(id)
      return userProbeOf({ user: data?.user ?? null, error: error ? { code: (error as { code?: string }).code } : null })
    },
    async remove(bucket, keys) {
      const { data, error } = await admin.storage.from(bucket).remove(keys)
      if (error) throw new Error(`remove failed: ${error.message}`)
      return (data ?? []).length
    },
  }
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now()
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const verdict = gate(body, startedAt)
  if (verdict === 'not_a_run') return Response.json({ error: 'Not a scheduled sweep run' }, { status: 400 })
  if (verdict === 'outside_window') return Response.json({ error: 'Outside the run window' }, { status: 400 })
  // A check that finds the worker busy cannot answer; 503 reads as "could not run" to
  // the check, never as the clean 204.
  if (running) return new Response(null, { status: verdict === 'check' ? 503 : 204 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('sweep-orphaned-storage: missing required env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    return new Response(null, { status: 500 })
  }

  running = true
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { deadline, cutoff } = sweepBudget(startedAt, WORKER_STARTED_AT)
    if (verdict === 'check') {
      // Read-only: checkIO's remove deletes nothing. Age is judged at today's run start.
      const report = await runSweep(checkIO(admin), { now: Date.now, deadline, cutoff, asOf: runStartOf(startedAt) })
      console.log(checkLine(report))
      const { overdue, incomplete } = checkVerdict(report)
      // Two bits and no counts: a caller learns only whether to call a person.
      if (!overdue && !incomplete) return new Response(null, { status: 204 })
      return Response.json({ overdue, incomplete }, { status: 200 })
    }
    const report = await runSweep(sweepIO(admin), { now: Date.now, deadline, cutoff })
    console.log(runLine(report))
    return new Response(null, { status: 204 })
  } catch (e) {
    // runSweep never throws by design; this names a regression without a path or id.
    console.error(`sweep-orphaned-storage: run failed: ${e instanceof Error ? e.name : 'unknown'}`)
    return new Response(null, { status: 500 })
  } finally {
    running = false
  }
})
