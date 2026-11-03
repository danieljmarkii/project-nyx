// The scheduled sweep and the overdue check (CUL-2437, CUL-2465). Run with:
//   deno test supabase/functions/reap-report-drafts/sweep.test.ts
//
// A fake I/O that behaves like the table: a keyset read in (created_at, id) order, a delete that
// matches only drafts past their day, and rows that can be made to fail (an object that will not
// go, a row that will not delete) to stand in for a future trigger, constraint or FK.

import { strict as assert } from 'node:assert'
import { DRAFT_TTL_MS, REAP_BATCH } from '../generate-report/savedCopy.ts'
import {
  anyOverdueDraft,
  globalSweepIO,
  OVERDUE_MS,
  REAP_MAX_PASSES,
  reapAllStaleDrafts,
  type StaleDraft,
  type SweepIO,
} from './sweep.ts'

const PET = '11111111-2222-4333-8444-555555555555'
const NOW = Date.parse('2026-11-03T12:00:00Z')
const OLD = '2000-01-01T00:00:00+00:00'

interface Row extends StaleDraft {
  status: 'draft' | 'kept'
}

function fakeIO(opts: { stuckObjects?: string[]; stuckRows?: string[]; failRead?: boolean } = {}) {
  const rows = new Map<string, Row>()
  const objects = new Set<string>()
  const stuckObjects = new Set(opts.stuckObjects ?? [])
  const stuckRows = new Set(opts.stuckRows ?? [])
  const log: string[] = []
  const cmp = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  const cutoff = () => new Date(NOW - DRAFT_TTL_MS).toISOString()
  const io: SweepIO = {
    listStaleDrafts: async (before, limit, after) => {
      log.push(`list after=${after?.id ?? '-'}`)
      if (opts.failRead) return null
      return [...rows.values()]
        .filter((r) => r.status === 'draft' && r.created_at < before && (after === null || cmp(r, after) > 0))
        .sort(cmp).slice(0, limit)
        .map(({ id, storage_path, created_at }) => ({ id, storage_path, created_at }))
    },
    removeObjects: async (paths) => {
      log.push(`remove ${paths.length}`)
      if (paths.some((p) => stuckObjects.has(p))) return false
      for (const p of paths) objects.delete(p)
      return true
    },
    deleteDrafts: async (ids) => {
      log.push(`delete ${ids.length}`)
      if (ids.some((id) => stuckRows.has(id))) return false
      for (const id of ids) {
        const r = rows.get(id)
        if (r && r.status === 'draft' && r.created_at < cutoff()) rows.delete(id)
      }
      return true
    },
    countDraftsBefore: async (before) => [...rows.values()].filter((r) => r.status === 'draft' && r.created_at < before).length,
    now: () => NOW,
  }
  const add = (id: string, created_at = OLD, status: Row['status'] = 'draft') => {
    rows.set(id, { id, storage_path: `${PET}/${id}.html`, created_at, status })
    objects.add(`${PET}/${id}.html`)
  }
  return { io, rows, objects, log, add }
}

function staleDrafts(f: ReturnType<typeof fakeIO>, n: number) {
  for (let i = 0; i < n; i++) f.add(`s-${String(i).padStart(4, '0')}`)
}

// ── The sweep ────────────────────────────────────────────────────────────────

Deno.test('the sweep batches until the stale drafts run out and never touches a kept copy or a fresh draft', async () => {
  const f = fakeIO()
  staleDrafts(f, REAP_BATCH * 2 + 7)
  f.add('k', OLD, 'kept')
  f.add('fresh', new Date(NOW - 60_000).toISOString())
  const out = await reapAllStaleDrafts(f.io)
  assert.deepEqual(out, { reaped: REAP_BATCH * 2 + 7, failed: 0, passes: 3, ok: true, capped: false })
  assert.deepEqual([...f.rows.keys()].sort(), ['fresh', 'k'])
  assert.deepEqual([...f.objects].sort(), [`${PET}/fresh.html`, `${PET}/k.html`])
  // Every batch removes its objects before it deletes its rows.
  const steps = f.log.filter((l) => !l.startsWith('list')).map((l) => l.split(' ')[0])
  assert.deepEqual(steps, ['remove', 'delete', 'remove', 'delete', 'remove', 'delete'])
})

Deno.test('the sweep stops at its pass cap and says so', async () => {
  const f = fakeIO()
  staleDrafts(f, REAP_BATCH * 3)
  assert.deepEqual(await reapAllStaleDrafts(f.io, 2), { reaped: REAP_BATCH * 2, failed: 0, passes: 2, ok: true, capped: true })
  assert.equal(f.rows.size, REAP_BATCH)
})

Deno.test('ONE ROW THAT WILL NOT DELETE NO LONGER HOLDS THE REST (CUL-2465 instance 2)', async () => {
  // The reviewer's measurement was 120 drafts still there after 96 sweeps behind one stuck row.
  // The stuck row is the OLDEST, so the old sweep failed on its first batch every time.
  const f = fakeIO({ stuckRows: ['s-0000'] })
  staleDrafts(f, 120)
  const out = await reapAllStaleDrafts(f.io)
  assert.deepEqual(out, { reaped: 119, failed: 1, passes: 3, ok: false, capped: false })
  assert.deepEqual([...f.rows.keys()], ['s-0000'])
  // Its object went (object first), and its row stays for the overdue check to find.
  assert.equal(f.objects.size, 0)
  assert.equal(await anyOverdueDraft(f.io), true)
})

Deno.test('an object that will not go keeps its row, and the rest of its batch still leaves', async () => {
  const f = fakeIO({ stuckObjects: [`${PET}/s-0003.html`] })
  staleDrafts(f, 10)
  const out = await reapAllStaleDrafts(f.io)
  assert.deepEqual(out, { reaped: 9, failed: 1, passes: 1, ok: false, capped: false })
  assert.deepEqual([...f.rows.keys()], ['s-0003'])
  assert.deepEqual([...f.objects], [`${PET}/s-0003.html`])
})

Deno.test('a full batch of stuck rows does not stop the sweep reading past it', async () => {
  const stuck = Array.from({ length: REAP_BATCH }, (_, i) => `s-${String(i).padStart(4, '0')}`)
  const f = fakeIO({ stuckRows: stuck })
  staleDrafts(f, REAP_BATCH + 5)
  const out = await reapAllStaleDrafts(f.io)
  assert.deepEqual(out, { reaped: 5, failed: REAP_BATCH, passes: 2, ok: false, capped: false })
  // The second read starts after the last row the first one listed.
  assert.ok(f.log.includes(`list after=s-${String(REAP_BATCH - 1).padStart(4, '0')}`))
})

Deno.test('a failing row is tried once per sweep, never in a loop', async () => {
  const f = fakeIO({ stuckRows: ['s-0000'] })
  staleDrafts(f, 1)
  await reapAllStaleDrafts(f.io)
  // The batch try, then the one-row retry: two deletes, then the sweep ends.
  assert.equal(f.log.filter((l) => l.startsWith('delete')).length, 2)
  assert.ok(f.log.filter((l) => l.startsWith('list')).length <= REAP_MAX_PASSES)
})

Deno.test('a read that fails reports it rather than ending clean; nothing stale is a clean sweep', async () => {
  const f = fakeIO({ failRead: true })
  staleDrafts(f, 3)
  assert.equal((await reapAllStaleDrafts(f.io)).ok, false)
  assert.equal(f.rows.size, 3)
  assert.deepEqual(await reapAllStaleDrafts(fakeIO().io), { reaped: 0, failed: 0, passes: 1, ok: true, capped: false })
})

// ── The overdue check ────────────────────────────────────────────────────────

Deno.test('the overdue check trips past 25 h and not before; a kept copy never trips it', async () => {
  const f = fakeIO()
  f.add('k', OLD, 'kept')
  f.add('due', new Date(NOW - DRAFT_TTL_MS - 30 * 60_000).toISOString()) // past 24 h, inside 25 h
  assert.equal(await anyOverdueDraft(f.io), false)
  f.add('late', new Date(NOW - OVERDUE_MS - 1).toISOString())
  assert.equal(await anyOverdueDraft(f.io), true)
  assert.equal(OVERDUE_MS, 25 * 60 * 60 * 1000)
})

Deno.test('a failed count is unknown, never "none overdue"', async () => {
  assert.equal(await anyOverdueDraft({ countDraftsBefore: async () => null, now: () => NOW }), null)
})

// ── The real I/O against a recording client ──────────────────────────────────

function recordingClient(calls: string[], rows: unknown[] = [], count = 0) {
  const chain = (verb: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'lt', 'in', 'or', 'order', 'limit', 'delete']) {
      q[m] = (...args: unknown[]) => {
        calls.push(`${verb}.${m}(${JSON.stringify(args)})`)
        if (m === 'limit' || (verb === 'delete' && m === 'lt')) return Promise.resolve({ data: rows, error: null })
        // The head count ends on its second filter.
        if (verb === 'count' && m === 'lt') return Promise.resolve({ count, error: null })
        return q
      }
    }
    return q
  }
  const state = { verb: 'read' }
  const removed: string[][] = []
  const admin = {
    from: (t: string) => {
      assert.equal(t, 'vet_reports')
      return chain(state.verb)
    },
    storage: {
      from: (b: string) => {
        assert.equal(b, 'nyx-vet-reports')
        return { remove: async (p: string[]) => { removed.push(p); return { error: null } } }
      },
    },
  }
  return { admin, state, removed }
}

Deno.test('the global sweep reads and deletes only DRAFTS PAST THEIR DAY, oldest first, past its cursor', async () => {
  // The two filters are what stands in for C-27's owner pairing, so deleting either from the read
  // or the delete reds here.
  const calls: string[] = []
  const row = { id: 'd', storage_path: `${PET}/d.html`, created_at: OLD }
  const c = recordingClient(calls, [row])
  const io = globalSweepIO(c.admin as never, () => NOW)
  const cutoff = new Date(NOW - DRAFT_TTL_MS).toISOString()
  assert.deepEqual(await io.listStaleDrafts(cutoff, 50, null), [row])
  assert.ok(calls.includes(`read.eq(["status","draft"])`))
  assert.ok(calls.includes(`read.lt(["created_at","${cutoff}"])`))
  assert.ok(calls.includes(`read.order(["created_at",{"ascending":true}])`))
  assert.ok(calls.includes(`read.order(["id",{"ascending":true}])`))
  assert.ok(!calls.some((l) => l.startsWith('read.or(')), 'the first pass has no cursor')

  calls.length = 0
  await io.listStaleDrafts(cutoff, 50, { created_at: OLD, id: 'd' })
  assert.ok(calls.includes(`read.or(["created_at.gt.\\"${OLD}\\",and(created_at.eq.\\"${OLD}\\",id.gt.d)"])`), calls.join('\n'))
  assert.ok(calls.includes(`read.eq(["status","draft"])`), 'the cursor never replaces the filters')

  calls.length = 0
  c.state.verb = 'delete'
  assert.equal(await io.removeObjects([`${PET}/d.html`]), true)
  assert.deepEqual(c.removed, [[`${PET}/d.html`]])
  assert.equal(await io.deleteDrafts(['d']), true)
  assert.ok(calls.includes(`delete.in(["id",["d"]])`))
  assert.ok(calls.includes(`delete.eq(["status","draft"])`))
  assert.ok(calls.includes(`delete.lt(["created_at","${cutoff}"])`))
})

Deno.test('the overdue count is a head count over drafts only, and deletes nothing', async () => {
  const calls: string[] = []
  const c = recordingClient(calls, [], 2)
  c.state.verb = 'count'
  const io = globalSweepIO(c.admin as never, () => NOW)
  const before = new Date(NOW - OVERDUE_MS).toISOString()
  assert.equal(await io.countDraftsBefore(before), 2)
  assert.ok(calls.includes(`count.select(["id",{"count":"exact","head":true}])`))
  assert.ok(calls.includes(`count.eq(["status","draft"])`))
  assert.ok(calls.includes(`count.lt(["created_at","${before}"])`))
  assert.ok(!calls.some((l) => l.includes('.delete(')))
  assert.equal(await anyOverdueDraft(io), true)
})
