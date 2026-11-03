// The scheduled draft sweep and the overdue check (CUL-2437, CUL-2465; spec §11.1).
//
// Moved here from generate-report/savedCopy.ts (CUL-2465): only this function runs it. The
// per-owner reaper that runs inside Preview (savedCopy.ts reapStaleDrafts) stays there.
//
// ONE ROW CANNOT HOLD THE REST (CUL-2465 instance 2). The sweep used to stop at the first failed
// batch, and every pass re-read the same oldest rows, so a draft that always failed blocked every
// draft behind it (measured: 120 drafts still there after 96 sweeps). Now each pass reads PAST the
// rows the pass before it listed (a keyset on created_at, id), a failed batch is retried one row at
// a time, and a row that still fails is counted and left for the next scheduled call. Each row is
// still object first, then row, so no object is ever left that no row names.
//
// THE OVERDUE CHECK (CUL-2465 instance 1). Whether any draft is past OVERDUE_MS: the outcome the
// sweep exists to produce, read straight off the table, so it is true whatever stopped the sweep
// (a rotated key, an undeployed function, Storage failing, a row that cannot be deleted). The
// daily workflow (.github/workflows/report-drafts-check.yml) asks it and opens a Linear issue.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DRAFT_TTL_MS, REAP_BATCH, VET_REPORTS_BUCKET } from '../generate-report/savedCopy.ts'

/** Passes one scheduled sweep may make (every 15 minutes): up to 1,000 drafts a call. What is
 *  left waits a quarter hour for the next call. */
export const REAP_MAX_PASSES = 20

/** A draft past this is overdue: its 24 h, the quarter hour between sweeps, and 45 minutes of
 *  slack, so a sweep that is merely running late never trips the check (PM ruling (a), CUL-2465). */
export const OVERDUE_MS = DRAFT_TTL_MS + 60 * 60 * 1000

export interface StaleDraft {
  id: string
  storage_path: string
  created_at: string
}

/** Where the last pass stopped: the next pass reads strictly after it. */
export type SweepCursor = { created_at: string; id: string } | null

/** What the sweep and the check need, and all they can reach. */
export interface SweepIO {
  listStaleDrafts(createdBeforeIso: string, limit: number, after: SweepCursor): Promise<StaleDraft[] | null>
  removeObjects(paths: string[]): Promise<boolean>
  deleteDrafts(ids: string[]): Promise<boolean>
  /** Drafts made before the instant, or null when the read failed. */
  countDraftsBefore(createdBeforeIso: string): Promise<number | null>
  now(): number
}

/**
 * The scheduled sweep's I/O: EVERY owner's drafts older than 24 h, oldest first. It has no pet or
 * maker to pair the rows with (C-27), because it acts for no one: what stands in for that pairing
 * is that it can only ever reach a row that is a DRAFT and PAST ITS DAY. Both filters are on the
 * read AND on the delete, so a row kept or made between the two never matches, and the one Storage
 * key it removes is the key its row names (113's `vet_reports_storage_path_is_row_key`).
 */
export function globalSweepIO(admin: SupabaseClient, now: () => number = () => Date.now()): SweepIO {
  const warn = (what: string, e: { message?: string } | null | unknown) =>
    console.warn(`vet_reports draft sweep: ${what}:`, (e as { message?: string } | null)?.message ?? String(e))
  const cutoff = () => new Date(now() - DRAFT_TTL_MS).toISOString()
  return {
    listStaleDrafts: async (createdBeforeIso, limit, after) => {
      // A capped pull, oldest first on a total key: what the cap leaves is read by the next pass
      // (guards/reportPullPagination.test.ts DELIBERATE_CAP 'reap-report-drafts/vet_reports').
      // The count is nothing this reads: the guard requires a registered cap to be counted, so
      // removing it reds the guard rather than saving a query.
      let q = admin.from('vet_reports').select('id, storage_path, created_at', { count: 'exact' })
        .eq('status', 'draft')
        .lt('created_at', createdBeforeIso)
      if (after !== null) {
        // Strictly after the cursor on (created_at, id). Both values came from this table's own
        // rows (a timestamptz string and a uuid), quoted so the timestamp's `:` and `+` stay literal.
        q = q.or(`created_at.gt."${after.created_at}",and(created_at.eq."${after.created_at}",id.gt.${after.id})`)
      }
      const { data, error } = await q
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .limit(limit)
      if (error) {
        warn('stale draft read failed', error)
        return null
      }
      return (data ?? []) as StaleDraft[]
    },
    removeObjects: async (paths) => {
      if (paths.length === 0) return true
      const { error } = await admin.storage.from(VET_REPORTS_BUCKET).remove(paths)
      if (error) warn('object remove failed', error)
      return !error
    },
    deleteDrafts: async (ids) => {
      if (ids.length === 0) return true
      const { error } = await admin.from('vet_reports').delete()
        .in('id', ids).eq('status', 'draft').lt('created_at', cutoff())
      if (error) warn('stale draft delete failed', error)
      return !error
    },
    countDraftsBefore: async (createdBeforeIso) => {
      // A head count: no row, id or path leaves the database, and nothing here can delete.
      const { count, error } = await admin.from('vet_reports').select('id', { count: 'exact', head: true })
        .eq('status', 'draft')
        .lt('created_at', createdBeforeIso)
      if (error || typeof count !== 'number') {
        warn('overdue count failed', error)
        return null
      }
      return count
    },
    now,
  }
}

export interface SweepResult {
  reaped: number
  /** Rows that failed even one at a time this sweep; the next scheduled call retries them. */
  failed: number
  passes: number
  /** False when a read failed or any row failed: the handler answers 500. */
  ok: boolean
  /** True when the pass cap stopped the sweep with a full batch still listed. */
  capped: boolean
}

/** One batch, all at once; on any failure, its rows one at a time. Object first, then row. */
async function reapBatch(io: SweepIO, batch: StaleDraft[]): Promise<{ reaped: number; failed: number }> {
  if (await io.removeObjects(batch.map((r) => r.storage_path))) {
    if (await io.deleteDrafts(batch.map((r) => r.id))) return { reaped: batch.length, failed: 0 }
  }
  let reaped = 0
  let failed = 0
  for (const row of batch) {
    // A row whose object will not go keeps its row, so the next sweep can still find the object.
    if ((await io.removeObjects([row.storage_path])) && (await io.deleteDrafts([row.id]))) reaped++
    else failed++
  }
  return { reaped, failed }
}

/** The scheduled sweep: batches until the stale drafts run out, a read fails, or the pass cap is
 *  spent. A failing row is skipped, never retried in a loop: one retry per row per sweep. */
export async function reapAllStaleDrafts(io: SweepIO, maxPasses: number = REAP_MAX_PASSES): Promise<SweepResult> {
  // One cutoff for the whole sweep, so the cursor walks one fixed set.
  const before = new Date(io.now() - DRAFT_TTL_MS).toISOString()
  let reaped = 0
  let failed = 0
  let after: SweepCursor = null
  for (let pass = 1; pass <= maxPasses; pass++) {
    const batch = await io.listStaleDrafts(before, REAP_BATCH, after)
    if (batch === null) return { reaped, failed, passes: pass, ok: false, capped: false }
    if (batch.length > 0) {
      const out = await reapBatch(io, batch)
      reaped += out.reaped
      failed += out.failed
      const last = batch[batch.length - 1]
      after = { created_at: last.created_at, id: last.id }
    }
    if (batch.length < REAP_BATCH) return { reaped, failed, passes: pass, ok: failed === 0, capped: false }
  }
  return { reaped, failed, passes: maxPasses, ok: failed === 0, capped: true }
}

/** Whether any draft is past OVERDUE_MS; null when the read failed. */
export async function anyOverdueDraft(io: Pick<SweepIO, 'countDraftsBefore' | 'now'>): Promise<boolean | null> {
  const n = await io.countDraftsBefore(new Date(io.now() - OVERDUE_MS).toISOString())
  return n === null ? null : n > 0
}
