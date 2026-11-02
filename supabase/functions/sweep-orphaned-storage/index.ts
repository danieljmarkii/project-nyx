// Supabase Edge Function — sweep-orphaned-storage
//
// The periodic orphaned-storage sweep (CUL-2421; the backstop CUL-231 and
// delete-account's post-delete sweep both name). It removes files whose owning row
// (pet, food item, auth user) is proved gone; every rule for what counts as proved is
// in ./plan.ts, which is pure and unit-tested. This file is the I/O shell.
//
// Who can call it: the platform's verify_jwt gate admits any valid project JWT, the
// public anon key included, which is how the daily pg_cron job reaches it with no new
// secret. That is safe by construction: the function reads NOTHING from the request
// (no body, no query, no header beyond the gate), so a caller cannot point it at a
// folder; a call can only remove files that are already due; and the reply is 204
// with no body, so it tells a caller nothing about what it found. The run line in the
// function's own log carries counts only (plan.ts runLine).
//
// One run at a time per worker: a second request while one runs gets 204 and does
// nothing, so a burst of calls cannot multiply the Storage load. Two workers can still
// overlap; every step is idempotent (a remove of an object already removed removes
// nothing), so overlap only repeats work.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sweepBudget, userProbeOf } from '../delete-account/plan.ts'
import { runLine, runSweep, type SweepIO, type TimedLister } from './plan.ts'

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

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now()
  if (running) return new Response(null, { status: 204 })

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
