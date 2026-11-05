// CUL-2421: the orphaned-storage sweep. Run with:
// deno test supabase/functions/sweep-orphaned-storage/plan.test.ts
//
// The fake answers the way the real services do: Storage lists one folder level per
// call with a null id for folders and pages by offset; PostgREST compares uuids
// case-blind and returns the stored lowercase id; GoTrue answers `user_not_found` for a
// missing user. Every test drives the real runSweep and asserts what Storage was asked
// to REMOVE, since that is the only claim that can delete a live file.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { STORAGE_BUCKETS, type UserProbe } from '../delete-account/plan.ts'
import {
  BUCKET_RULES,
  CHECK_BLIND_REASONS,
  CHECK_STUCK_REASONS,
  CHECK_HOUR_UTC,
  CHECK_MARKER,
  CHECK_MINUTE_UTC,
  CHECK_WINDOW_MIN,
  checkLine,
  checkVerdict,
  fileVerdict,
  GRACE_MS,
  goneFromRead,
  isSweepableRoot,
  KEY_SEGMENTS,
  gate,
  rotatedRules,
  RUN_HOUR_UTC,
  RUN_MARKER,
  RUN_MINUTE_UTC,
  RUN_WINDOW_MIN,
  runLine,
  runStartOf,
  runSweep,
  type LiveIdRead,
  type SweepIO,
  type TimedEntry,
} from './plan.ts'

const NOW = Date.parse('2026-11-02T12:00:00Z')
const OLD = '2026-10-01T00:00:00Z'
const FRESH = new Date(NOW - 60 * 60 * 1000).toISOString() // an hour ago

const LIVE_PET = 'aaaaaaaa-0000-4000-8000-000000000001'
const DEAD_PET = 'aaaaaaaa-0000-4000-8000-000000000002'
const LIVE_FOOD = 'bbbbbbbb-0000-4000-8000-000000000001'
const DEAD_FOOD = 'bbbbbbbb-0000-4000-8000-000000000002'
const LIVE_USER = 'cccccccc-0000-4000-8000-000000000001'
const DEAD_USER = 'cccccccc-0000-4000-8000-000000000002'

interface FakeObject {
  createdAt: string | null
  updatedAt: string | null
}

interface World {
  // bucket → key → timestamps
  objects: Record<string, Record<string, FakeObject>>
  pets: string[]
  foods: string[]
  users: Record<string, UserProbe>
  // food_item_retired_ids: id → owner (null: no owner)
  retired: Record<string, string | null>
  retiredOverride?: () => import('./plan.ts').RetiredRead
  extraBuckets?: string[]
  failBucketList?: boolean
  failList?: Set<string>
  liveIdsOverride?: (table: string, ids: string[]) => LiveIdRead
  failRemove?: Set<string>
  removeShort?: number
  pageSize?: number
}

interface Calls {
  removed: Array<{ bucket: string; keys: string[] }>
  listed: Array<{ bucket: string; prefix: string }>
}

function obj(createdAt: string | null = OLD, updatedAt: string | null = createdAt): FakeObject {
  return { createdAt, updatedAt }
}

function fakeIO(w: World, calls: Calls = { removed: [], listed: [] }): SweepIO {
  const known = Object.values(STORAGE_BUCKETS) as string[]
  return {
    listBuckets() {
      if (w.failBucketList) return Promise.reject(new Error('boom'))
      return Promise.resolve([...known, ...(w.extraBuckets ?? [])])
    },
    listerFor(bucket) {
      return (prefix, offset, limit) => {
        calls.listed.push({ bucket, prefix })
        if (w.failList?.has(`${bucket}:${prefix}`)) return Promise.reject(new Error('list error'))
        const all = Object.entries(w.objects[bucket] ?? {})
        const base = prefix === '' ? '' : `${prefix}/`
        const children = new Map<string, TimedEntry>()
        for (const [key, o] of all) {
          if (!key.startsWith(base)) continue
          const rest = key.slice(base.length)
          const slash = rest.indexOf('/')
          if (slash === -1) children.set(rest, { name: rest, id: `id:${key}`, createdAt: o.createdAt, updatedAt: o.updatedAt })
          else {
            const name = rest.slice(0, slash)
            if (!children.has(name)) children.set(name, { name, id: null, createdAt: null, updatedAt: null })
          }
        }
        const sorted = [...children.values()].sort((a, b) => a.name.localeCompare(b.name))
        const size = Math.min(limit, w.pageSize ?? limit)
        return Promise.resolve(sorted.slice(offset, offset + size))
      }
    },
    liveIds(table, ids) {
      if (w.liveIdsOverride) return Promise.resolve(w.liveIdsOverride(table, ids))
      const rows = table === 'pets' ? w.pets : w.foods
      // Postgres compares uuids case-blind and returns the stored (lowercase) value.
      const hit = rows.filter((r) => ids.some((i) => i.toLowerCase() === r))
      return Promise.resolve({ ids: hit, count: hit.length, error: null })
    },
    retiredFoods(ids) {
      if (w.retiredOverride) return Promise.resolve(w.retiredOverride())
      const rows = ids.filter((i) => i in w.retired).map((id) => ({ id, owner: w.retired[id] }))
      return Promise.resolve({ rows, count: rows.length, error: null })
    },
    probeUser(id) {
      return Promise.resolve(w.users[id] ?? 'unknown')
    },
    remove(bucket, keys) {
      if (w.failRemove?.has(bucket)) return Promise.reject(new Error('remove error'))
      calls.removed.push({ bucket, keys })
      for (const k of keys) delete w.objects[bucket]?.[k]
      return Promise.resolve(w.removeShort !== undefined ? Math.min(w.removeShort, keys.length) : keys.length)
    },
  }
}

const run = (w: World, calls?: Calls, extra: Partial<{ deadline: number }> = {}) =>
  runSweep(fakeIO(w, calls), { now: () => NOW, ...extra })

const removedKeys = (calls: Calls, bucket?: string) =>
  calls.removed.filter((r) => !bucket || r.bucket === bucket).flatMap((r) => r.keys).sort()

function baseWorld(): World {
  return {
    objects: {
      [STORAGE_BUCKETS.eventAttachments]: {
        [`${LIVE_PET}/e1/a1.jpg`]: obj(),
        [`${DEAD_PET}/e1/a1.jpg`]: obj(),
        [`${DEAD_PET}/e2/a2.jpg`]: obj(),
      },
      [STORAGE_BUCKETS.petPhotos]: { [`${LIVE_PET}/profile.jpg`]: obj(), [`${DEAD_PET}/profile.jpg`]: obj() },
      [STORAGE_BUCKETS.foodPhotos]: { [`${LIVE_FOOD}/0-front.jpg`]: obj(), [`${DEAD_FOOD}/0-front.jpg`]: obj() },
      [STORAGE_BUCKETS.medicationPhotos]: {
        [`${LIVE_USER}/m1/label.jpg`]: obj(),
        [`${DEAD_USER}/m1/label.jpg`]: obj(),
      },
    },
    pets: [LIVE_PET],
    foods: [LIVE_FOOD],
    users: { [LIVE_USER]: 'present', [DEAD_USER]: 'gone' },
    // The dead food belonged to the deleted account.
    retired: { [DEAD_FOOD]: DEAD_USER },
  }
}

// ── The golden path ──────────────────────────────────────────────────────────

Deno.test('removes the old files under gone owners and nothing under live ones', async () => {
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(baseWorld(), calls)
  assertEquals(removedKeys(calls), [
    `${DEAD_PET}/e1/a1.jpg`,
    `${DEAD_PET}/e2/a2.jpg`,
    `${DEAD_PET}/profile.jpg`,
    `${DEAD_FOOD}/0-front.jpg`,
    `${DEAD_USER}/m1/label.jpg`,
  ].sort())
  assertEquals(report.removed[STORAGE_BUCKETS.eventAttachments], 2)
  assertEquals(report.folders[STORAGE_BUCKETS.eventAttachments], { live: 1, gone: 1 })
  assertEquals(report.folders[STORAGE_BUCKETS.medicationPhotos], { live: 1, gone: 1 })
})

Deno.test('a live owner\'s folder is never walked, only the top level is listed', async () => {
  const calls: Calls = { removed: [], listed: [] }
  await run(baseWorld(), calls)
  for (const live of [LIVE_PET, LIVE_FOOD, LIVE_USER]) {
    assert(!calls.listed.some((l) => l.prefix.startsWith(live)), `walked live folder ${live}`)
  }
})

Deno.test('every removed key sits under a folder proved gone', async () => {
  const calls: Calls = { removed: [], listed: [] }
  await run(baseWorld(), calls)
  for (const k of removedKeys(calls)) {
    assert([DEAD_PET, DEAD_FOOD, DEAD_USER].includes(k.split('/')[0]), k)
  }
})

// ── Attempts to make it delete a live file ───────────────────────────────────

Deno.test('an UPPERCASE folder of a live pet is left: Postgres would match it case-blind', async () => {
  const w = baseWorld()
  w.objects[STORAGE_BUCKETS.petPhotos] = { [`${LIVE_PET.toUpperCase()}/profile.jpg`]: obj() }
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.petPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.petPhotos]?.folder_unknown_shape, 1)
})

Deno.test('a read that returns a row it was not asked for proves nothing', () => {
  assertEquals(goneFromRead([DEAD_PET], { ids: [LIVE_PET], count: 1, error: null }), null)
  assertEquals(goneFromRead([LIVE_PET.toUpperCase()], { ids: [LIVE_PET], count: 1, error: null }), null)
})

Deno.test('an owner read error leaves every folder in the batch', async () => {
  const w = baseWorld()
  w.liveIdsOverride = () => ({ ids: null, count: null, error: 'timeout' })
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.eventAttachments), [])
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.foodPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.eventAttachments]?.folder_owner_unread, 2)
})

Deno.test('a read with no count, or a count that disagrees with its rows, proves nothing', async () => {
  for (const bad of [
    { ids: [], count: null, error: null },
    { ids: [], count: 1, error: null }, // a max-rows cut: the live row is missing from the page
    { ids: null, count: 0, error: null },
  ] as LiveIdRead[]) {
    const w = baseWorld()
    w.liveIdsOverride = () => bad
    const calls: Calls = { removed: [], listed: [] }
    await run(w, calls)
    assertEquals(removedKeys(calls, STORAGE_BUCKETS.petPhotos), [], JSON.stringify(bad))
  }
})

Deno.test('a thrown owner read leaves the batch', async () => {
  const io = fakeIO(baseWorld())
  const calls: string[] = []
  const report = await runSweep(
    { ...io, liveIds: () => Promise.reject(new Error('net')), remove: (b, k) => (calls.push(...k), Promise.resolve(k.length)) },
    { now: () => NOW },
  )
  assert(calls.every((k) => k.startsWith(DEAD_USER)), calls.join(','))
  assertEquals(report.left[STORAGE_BUCKETS.foodPhotos]?.folder_owner_unread, 2)
})

Deno.test('a user probe that is not user_not_found leaves the drug-label folder', async () => {
  for (const probe of ['unknown', 'present'] as UserProbe[]) {
    const w = baseWorld()
    w.users[DEAD_USER] = probe
    const calls: Calls = { removed: [], listed: [] }
    await run(w, calls)
    assertEquals(removedKeys(calls, STORAGE_BUCKETS.medicationPhotos), [], probe)
  }
})

Deno.test('a thrown user probe leaves the folder', async () => {
  const io = fakeIO(baseWorld())
  const calls: Calls = { removed: [], listed: [] }
  const report = await runSweep(
    {
      ...io,
      probeUser: () => Promise.reject(new Error('net')),
      remove: (b, k) => (calls.removed.push({ bucket: b, keys: k }), Promise.resolve(k.length)),
    },
    { now: () => NOW },
  )
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.medicationPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.medicationPhotos]?.folder_owner_unread, 2)
})

Deno.test('a folder name that is not a lowercase uuid is never acted on', () => {
  for (const name of ['', '.', '..', 'abc', `${DEAD_PET}x`, ` ${DEAD_PET}`, DEAD_PET.toUpperCase(), `${DEAD_PET}/x`]) {
    assert(!isSweepableRoot(name), name)
  }
  assert(isSweepableRoot(DEAD_PET))
})

// ── The grace period and the file shape ──────────────────────────────────────

Deno.test('a file inside the grace period stays, even under a gone owner', async () => {
  const w = baseWorld()
  w.objects[STORAGE_BUCKETS.petPhotos] = { [`${DEAD_PET}/profile.jpg`]: obj(FRESH) }
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.petPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.petPhotos]?.file_in_grace, 1)
})

Deno.test('an overwrite restarts the grace period (the newer timestamp wins)', () => {
  assertEquals(fileVerdict(`${DEAD_PET}/p.jpg`, 2, obj(OLD, FRESH), NOW), 'file_in_grace')
  assertEquals(fileVerdict(`${DEAD_PET}/p.jpg`, 2, obj(FRESH, OLD), NOW), 'file_in_grace')
})

Deno.test('the grace boundary: just inside stays, just past goes', () => {
  const inside = new Date(NOW - GRACE_MS + 1).toISOString()
  const past = new Date(NOW - GRACE_MS).toISOString()
  assertEquals(fileVerdict(`${DEAD_PET}/p.jpg`, 2, obj(inside), NOW), 'file_in_grace')
  assertEquals(fileVerdict(`${DEAD_PET}/p.jpg`, 2, obj(past), NOW), 'remove')
})

Deno.test('a future timestamp is not old', () => {
  assertEquals(fileVerdict(`${DEAD_PET}/p.jpg`, 2, obj('2027-01-01T00:00:00Z'), NOW), 'file_in_grace')
})

Deno.test('a file with no readable timestamp stays', async () => {
  assertEquals(fileVerdict(`${DEAD_PET}/p.jpg`, 2, obj(null, null), NOW), 'file_no_timestamp')
  assertEquals(fileVerdict(`${DEAD_PET}/p.jpg`, 2, obj('not a date', ''), NOW), 'file_no_timestamp')
  assertEquals(fileVerdict(`${DEAD_PET}/p.jpg`, 2, undefined, NOW), 'file_no_timestamp')
  const w = baseWorld()
  w.objects[STORAGE_BUCKETS.foodPhotos] = { [`${DEAD_FOOD}/0.jpg`]: obj(null, null) }
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.foodPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.foodPhotos]?.file_no_timestamp, 1)
})

Deno.test('a key of the wrong depth for its bucket stays', async () => {
  const w = baseWorld()
  w.objects[STORAGE_BUCKETS.petPhotos] = {
    [`${DEAD_PET}/profile.jpg`]: obj(),
    [`${DEAD_PET}/extra/deep.jpg`]: obj(),
  }
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.petPhotos), [`${DEAD_PET}/profile.jpg`])
  assertEquals(report.left[STORAGE_BUCKETS.petPhotos]?.file_unknown_shape, 1)
})

Deno.test('every bucket delete-account knows has a key depth, and the rules cover them all', () => {
  assertEquals(Object.keys(KEY_SEGMENTS).sort(), Object.keys(STORAGE_BUCKETS).sort())
  assertEquals(BUCKET_RULES.map((r) => r.bucket).sort(), (Object.values(STORAGE_BUCKETS) as string[]).sort())
})

// ── Buckets, listings, removes, time ─────────────────────────────────────────

Deno.test('an unknown bucket is reported and never listed', async () => {
  const w = baseWorld()
  w.extraBuckets = ['nyx-something-new']
  w.objects['nyx-something-new'] = { [`${DEAD_PET}/x.jpg`]: obj() }
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assert(!calls.listed.some((l) => l.bucket === 'nyx-something-new'))
  assertEquals(removedKeys(calls, 'nyx-something-new'), [])
  assertEquals(report.left['nyx-something-new']?.bucket_unknown, 1)
})

Deno.test('a failed bucket list still sweeps the known buckets', async () => {
  const w = baseWorld()
  w.failBucketList = true
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(report.left['*']?.bucket_list_failed, 1)
  assert(removedKeys(calls).includes(`${DEAD_PET}/profile.jpg`))
})

Deno.test('a failed top-level listing leaves that bucket alone', async () => {
  const w = baseWorld()
  w.failList = new Set([`${STORAGE_BUCKETS.petPhotos}:`])
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.petPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.petPhotos]?.bucket_list_failed, 1)
})

Deno.test('a failed sub-folder listing is a gap: its siblings still go, it is reported', async () => {
  const w = baseWorld()
  w.failList = new Set([`${STORAGE_BUCKETS.eventAttachments}:${DEAD_PET}/e2`])
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.eventAttachments), [`${DEAD_PET}/e1/a1.jpg`])
  assertEquals(report.left[STORAGE_BUCKETS.eventAttachments]?.folder_walk_gap, 1)
})

Deno.test('a file at a bucket\'s top level is left and counted', async () => {
  const w = baseWorld()
  w.objects[STORAGE_BUCKETS.petPhotos] = { 'stray.jpg': obj() }
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.petPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.petPhotos]?.file_at_root, 1)
})

Deno.test('the top level pages to the end, even when the server caps a page short', async () => {
  const w = baseWorld()
  const dead: string[] = []
  const objs: Record<string, ReturnType<typeof obj>> = {}
  for (let i = 0; i < 250; i++) {
    const id = `dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`
    dead.push(id)
    objs[`${id}/profile.jpg`] = obj()
  }
  objs[`${LIVE_PET}/profile.jpg`] = obj()
  w.objects = { [STORAGE_BUCKETS.petPhotos]: objs }
  w.pageSize = 7
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.petPhotos).length, 250)
  assertEquals(report.folders[STORAGE_BUCKETS.petPhotos], { live: 1, gone: 250 })
  assert(!removedKeys(calls).includes(`${LIVE_PET}/profile.jpg`))
})

Deno.test('a failed remove is counted, and the next folder still runs', async () => {
  const w = baseWorld()
  w.failRemove = new Set([STORAGE_BUCKETS.petPhotos])
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(report.left[STORAGE_BUCKETS.petPhotos]?.file_remove_failed, 1)
  assert(removedKeys(calls).includes(`${DEAD_FOOD}/0-front.jpg`))
})

Deno.test('a remove that removes fewer than asked counts the rest as left', async () => {
  const w = baseWorld()
  w.removeShort = 1
  const report = await run(w)
  assertEquals(report.removed[STORAGE_BUCKETS.eventAttachments], 1)
  assertEquals(report.left[STORAGE_BUCKETS.eventAttachments]?.file_remove_failed, 1)
})

Deno.test('past the deadline no folder starts; each is counted as not reached', async () => {
  const calls: Calls = { removed: [], listed: [] }
  let t = NOW
  const report = await runSweep(fakeIO(baseWorld(), calls), {
    now: () => t,
    deadline: NOW + 1,
  })
  // The deadline is not passed, so this run sweeps everything; now one that is.
  assert(removedKeys(calls).length > 0)
  const calls2: Calls = { removed: [], listed: [] }
  t = NOW + 10
  const late = await runSweep(fakeIO(baseWorld(), calls2), { now: () => t, deadline: NOW + 1 })
  assertEquals(calls2.removed, [])
  assertEquals(late.left[STORAGE_BUCKETS.petPhotos]?.bucket_not_reached, 1)
  assert(report)
})

Deno.test('a run that runs out of time mid-way has still removed something, and counts the rest', async () => {
  const calls: Calls = { removed: [], listed: [] }
  const io = fakeIO(baseWorld(), calls)
  let removes = 0
  const report = await runSweep(
    { ...io, remove: (b, k) => (removes++, io.remove(b, k)) },
    // The clock passes the deadline as soon as the first folder is removed.
    { now: () => (removes >= 1 ? NOW + 10 : NOW), deadline: NOW + 1 },
  )
  assertEquals(calls.removed.length, 1)
  const count = (r: 'folder_not_reached' | 'bucket_not_reached') =>
    Object.values(report.left).reduce((n, b) => n + (b[r] ?? 0), 0)
  assert(count('bucket_not_reached') + count('folder_not_reached') > 0)
})

Deno.test('the starting bucket rotates by day, so no bucket is always last', () => {
  const firsts = new Set<string>()
  for (let d = 0; d < BUCKET_RULES.length; d++) {
    const order = rotatedRules(NOW + d * 86_400_000)
    assertEquals(order.map((r) => r.bucket).sort(), BUCKET_RULES.map((r) => r.bucket).sort())
    firsts.add(order[0].bucket)
  }
  assertEquals(firsts.size, BUCKET_RULES.length)
})

// ── Food ids can come back for their owner (rls-privacy-reviewer F3) ─────────

Deno.test('a dead food of a LIVE account is left: its owner may re-create the id', async () => {
  const w = baseWorld()
  w.retired = { [DEAD_FOOD]: LIVE_USER }
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.foodPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.foodPhotos]?.folder_owner_may_return, 1)
})

Deno.test('a missing food with no ledger row is left', async () => {
  const w = baseWorld()
  w.retired = {}
  const calls: Calls = { removed: [], listed: [] }
  const report = await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.foodPhotos), [])
  assertEquals(report.left[STORAGE_BUCKETS.foodPhotos]?.folder_not_retired, 1)
})

Deno.test('a ledger row with no owner can never be re-created, so it goes', async () => {
  const w = baseWorld()
  w.retired = { [DEAD_FOOD]: null }
  const calls: Calls = { removed: [], listed: [] }
  await run(w, calls)
  assertEquals(removedKeys(calls, STORAGE_BUCKETS.foodPhotos), [`${DEAD_FOOD}/0-front.jpg`])
})

Deno.test('a ledger owner whose probe is unknown, or a ledger read that proves nothing, leaves the food', async () => {
  for (const tweak of [
    (w: World) => (w.users[DEAD_USER] = 'unknown'),
    (w: World) => (w.retiredOverride = () => ({ rows: null, count: null, error: 'boom' })),
    (w: World) => (w.retiredOverride = () => ({ rows: [], count: 1, error: null })),
    // A page cut short by max-rows: the row shown says no owner, the count says more exist.
    (w: World) => (w.retiredOverride = () => ({ rows: [{ id: DEAD_FOOD, owner: null }], count: 2, error: null })),
    (w: World) => (w.retiredOverride = () => ({ rows: [{ id: LIVE_FOOD, owner: null }], count: 1, error: null })),
  ]) {
    const w = baseWorld()
    tweak(w)
    const calls: Calls = { removed: [], listed: [] }
    await run(w, calls)
    assertEquals(removedKeys(calls, STORAGE_BUCKETS.foodPhotos), [])
  }
})

// ── The request gate (rls-privacy-reviewer F1, F2) ───────────────────────────

Deno.test('only the marker, inside the daily window, starts a run', () => {
  const at = (h: number, m: number) => Date.UTC(2026, 10, 2, h, m, 0)
  const body = { run: RUN_MARKER }
  assertEquals(gate(body, at(RUN_HOUR_UTC, RUN_MINUTE_UTC)), 'run')
  assertEquals(gate(body, at(RUN_HOUR_UTC, RUN_MINUTE_UTC + RUN_WINDOW_MIN - 1)), 'run')
  assertEquals(gate(body, at(RUN_HOUR_UTC, RUN_MINUTE_UTC + RUN_WINDOW_MIN)), 'outside_window')
  assertEquals(gate(body, at(RUN_HOUR_UTC, RUN_MINUTE_UTC - 1)), 'outside_window')
  // The deploy's smoke POST is `{}`.
  for (const b of [{}, null, 'sweep-orphaned-storage', { run: 'x' }, []]) {
    assertEquals(gate(b, at(RUN_HOUR_UTC, RUN_MINUTE_UTC)), 'not_a_run', JSON.stringify(b))
  }
})

// ── The run line ─────────────────────────────────────────────────────────────

Deno.test('the run line carries counts only: no id, no path, no file name', async () => {
  const w = baseWorld()
  w.objects[STORAGE_BUCKETS.petPhotos][`${DEAD_PET}/fresh.jpg`] = obj(FRESH)
  const line = runLine(await run(w))
  for (const secret of [LIVE_PET, DEAD_PET, LIVE_FOOD, DEAD_FOOD, LIVE_USER, DEAD_USER, 'profile.jpg', 'fresh.jpg', 'a1.jpg']) {
    assert(!line.includes(secret), `run line leaks ${secret}`)
  }
  const parsed = JSON.parse(line)
  assertEquals(parsed.event, 'sweep-orphaned-storage.run')
  assertEquals(parsed.left[STORAGE_BUCKETS.petPhotos].file_in_grace, 1)
})

Deno.test('a re-run after a full sweep removes nothing more', async () => {
  const w = baseWorld()
  await run(w)
  const calls: Calls = { removed: [], listed: [] }
  await run(w, calls)
  assertEquals(calls.removed, [])
})

// ── CUL-2328: an upload that commits after the account's deletion ─────────────
//
// delete-account empties every owned folder after the auth delete. An upload whose
// INSERT check passed before the cascade could still commit after that listing, if
// storage-api commits a streamed upload late. Whether it can is untested against
// production; this sweep is the backstop either way: the pet row is gone (and 116
// retires its id), so the folder is proved gone and the file leaves once its own
// timestamp is past the grace period, however long the upload took.

Deno.test('CUL-2328: a vet document that lands after the deletion is kept through grace, then removed', async () => {
  const deletedAt = NOW - 2 * 60 * 60 * 1000
  const landedAt = new Date(deletedAt + 10 * 60 * 1000).toISOString() // 10 min after the delete
  const key = `${DEAD_PET}/dddddddd-0000-4000-8000-000000000001.pdf`
  const world = (): World => ({
    objects: { [STORAGE_BUCKETS.vetDocuments]: { [key]: obj(landedAt) } },
    pets: [],
    foods: [],
    users: {},
    retired: {},
  })

  // The next morning's run, inside grace: kept, and counted as such.
  const early: Calls = { removed: [], listed: [] }
  const report = await runSweep(fakeIO(world(), early), { now: () => NOW })
  assertEquals(removedKeys(early), [])
  assertEquals(report.left[STORAGE_BUCKETS.vetDocuments]?.file_in_grace, 1)

  // The first run past grace: removed.
  const late: Calls = { removed: [], listed: [] }
  await runSweep(fakeIO(world(), late), { now: () => Date.parse(landedAt) + GRACE_MS + 60_000 })
  assertEquals(removedKeys(late, STORAGE_BUCKETS.vetDocuments), [key])
})

// ── CUL-2521: the daily check ────────────────────────────────────────────────

const atCheck = (h: number, m: number) => Date.UTC(2026, 10, 2, h, m)

Deno.test('CUL-2521: the check has its own window and never passes as a run', () => {
  const body = { check: CHECK_MARKER }
  assertEquals(gate(body, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC)), 'check')
  assertEquals(gate(body, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + CHECK_WINDOW_MIN - 1)), 'check')
  assertEquals(gate(body, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + CHECK_WINDOW_MIN)), 'outside_window')
  assertEquals(gate(body, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC - 1)), 'outside_window')
  // In the RUN window a check body is still a check, so it is outside its window: a
  // check can never start a deleting run.
  assertEquals(gate(body, atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC)), 'outside_window')
  // And a run body in the check window is not a run.
  assertEquals(gate({ run: RUN_MARKER }, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC)), 'outside_window')
  for (const b of [{ check: 'x' }, { check: true }, { check: RUN_MARKER }]) {
    assertEquals(gate(b, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC)), 'not_a_run', JSON.stringify(b))
  }
  // The two windows do not overlap.
  assert(CHECK_HOUR_UTC * 60 + CHECK_MINUTE_UTC >= RUN_HOUR_UTC * 60 + RUN_MINUTE_UTC + RUN_WINDOW_MIN)
  assert(CHECK_HOUR_UTC * 60 + CHECK_MINUTE_UTC + CHECK_WINDOW_MIN <= 24 * 60)
})

Deno.test('CUL-2521: runStartOf is the same UTC day\'s run start', () => {
  assertEquals(runStartOf(atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 30)), atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC))
  assertEquals(runStartOf(Date.UTC(2026, 10, 2, 23, 59)), atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC))
})

// The check as index.ts runs it: the real pass, a remove that deletes nothing, age
// judged at the morning run's start.
async function check(w: World, checkAt: number) {
  const io = fakeIO(w)
  const report = await runSweep({ ...io, remove: (_b, keys) => Promise.resolve(keys.length) }, {
    now: () => checkAt,
    asOf: runStartOf(checkAt),
  })
  return { report, verdict: checkVerdict(report) }
}

Deno.test('CUL-2521: a file the morning run should have removed is overdue; the check deletes nothing', async () => {
  const checkAt = atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 5)
  const w = baseWorld() // gone owners with OLD files: a morning run would have removed them
  const before = JSON.stringify(w.objects)
  const { verdict } = await check(w, checkAt)
  assertEquals(verdict, { overdue: true, incomplete: false })
  assertEquals(JSON.stringify(w.objects), before)
})

Deno.test('CUL-2521: after a good morning run the check is clean', async () => {
  const w = baseWorld()
  await runSweep(fakeIO(w), { now: () => atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC + 1) })
  const { verdict } = await check(w, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 5))
  assertEquals(verdict, { overdue: false, incomplete: false })
})

Deno.test('CUL-2521: a file not yet due at the run\'s start is not overdue, even if due by the check', async () => {
  const runStart = atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC)
  const key = `${DEAD_PET}/profile.jpg`
  const w: World = {
    // Past grace at the check (12:12), not at the run (09:23): the run rightly kept it.
    objects: { [STORAGE_BUCKETS.petPhotos]: { [key]: obj(new Date(runStart - GRACE_MS + 60 * 60 * 1000).toISOString()) } },
    pets: [],
    foods: [],
    users: {},
    retired: {},
  }
  const { verdict, report } = await check(w, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 5))
  assertEquals(verdict, { overdue: false, incomplete: false })
  assertEquals(report.left[STORAGE_BUCKETS.petPhotos]?.file_in_grace, 1)
  // One minute earlier and it was due at the run: overdue.
  w.objects[STORAGE_BUCKETS.petPhotos][key] = obj(new Date(runStart - GRACE_MS - 60_000).toISOString())
  assertEquals((await check(w, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 5))).verdict.overdue, true)
})

Deno.test('CUL-2521: a check that cannot read is incomplete, never clean', async () => {
  const at = atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 5)
  const w = baseWorld()
  await runSweep(fakeIO(w), { now: () => atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC + 1) })

  const listFails = { ...w, failList: new Set([`${STORAGE_BUCKETS.petPhotos}:`]) }
  assertEquals((await check(listFails, at)).verdict.incomplete, true)

  const ownerFails = { ...w, liveIdsOverride: () => ({ ids: null, count: null, error: 'down' }) }
  assertEquals((await check(ownerFails, at)).verdict.incomplete, true)

  const bucketsFail = { ...w, failBucketList: true }
  assertEquals((await check(bucketsFail, at)).verdict.incomplete, true)
})

Deno.test('CUL-2521: checkVerdict reads every blind reason, and only those', () => {
  for (const r of CHECK_BLIND_REASONS) {
    assertEquals(checkVerdict({ removed: {}, folders: {}, left: { b: { [r]: 1 } } }).incomplete, true, r)
  }
  for (const r of CHECK_STUCK_REASONS) {
    assertEquals(checkVerdict({ removed: {}, folders: {}, left: { b: { [r]: 1 } } }), { overdue: true, incomplete: false }, r)
  }
  for (const r of ['file_in_grace', 'folder_owner_may_return'] as const) {
    assertEquals(checkVerdict({ removed: {}, folders: {}, left: { b: { [r]: 3 } } }), { overdue: false, incomplete: false }, r)
  }
  assertEquals(checkVerdict({ removed: { b: 0 }, folders: {}, left: {} }).overdue, false)
  assertEquals(checkVerdict({ removed: { b: 1 }, folders: {}, left: {} }).overdue, true)
})

Deno.test('CUL-2521: the check line carries counts only', async () => {
  const { report } = await check(baseWorld(), atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 5))
  const line = checkLine(report)
  for (const secret of [LIVE_PET, DEAD_PET, LIVE_FOOD, DEAD_FOOD, LIVE_USER, DEAD_USER, 'profile.jpg', 'a1.jpg']) {
    assert(!line.includes(secret), `check line leaks ${secret}`)
  }
  assertEquals(JSON.parse(line).event, 'sweep-orphaned-storage.check')
})

Deno.test('index.ts — CUL-2521: the check runs on an IO whose remove deletes nothing', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  const io = src.slice(src.indexOf('function checkIO('), src.indexOf('function sweepIO('))
  assert(/remove: \(_bucket, keys\) => Promise\.resolve\(keys\.length\)/.test(io), io)
  assert(!/\.remove\(/.test(io), 'checkIO calls a real remove')
  const branch = src.slice(src.indexOf("if (verdict === 'check') {"), src.indexOf('const report = await runSweep(sweepIO(admin)'))
  assert(branch.includes('runSweep(checkIO(admin)'), branch)
  assert(branch.includes('asOf: runStartOf(startedAt)'), branch)
  assert(!branch.includes('sweepIO('), 'the check branch reaches the deleting IO')
})

Deno.test('CUL-2521 F2: a deleted pet\'s file at a depth its bucket never writes is overdue, not clean', async () => {
  const runStart = atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC)
  const w: World = {
    // nyx-vet-documents is two segments; a drifted writer's three-segment key no run removes.
    objects: { [STORAGE_BUCKETS.vetDocuments]: { [`${DEAD_PET}/r1/report.pdf`]: obj(OLD) } },
    pets: [],
    foods: [],
    users: {},
    retired: {},
  }
  // The morning run leaves it (it cannot remove an unknown shape)...
  const calls: Calls = { removed: [], listed: [] }
  await runSweep(fakeIO(w, calls), { now: () => runStart + 60_000 })
  assertEquals(removedKeys(calls), [])
  // ...and the check says so.
  assertEquals((await check(w, atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 5))).verdict, { overdue: true, incomplete: false })
})

Deno.test('CUL-2521 F2 stopgap: an unknown bucket and a non-uuid folder read as overdue', async () => {
  const at = atCheck(CHECK_HOUR_UTC, CHECK_MINUTE_UTC + 5)
  const w = baseWorld()
  await runSweep(fakeIO(w), { now: () => atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC + 1) })
  assertEquals((await check(w, at)).verdict, { overdue: false, incomplete: false })
  assertEquals((await check({ ...w, extraBuckets: ['nyx-something-new'] }, at)).verdict.overdue, true)
  const odd = baseWorld()
  await runSweep(fakeIO(odd), { now: () => atCheck(RUN_HOUR_UTC, RUN_MINUTE_UTC + 1) })
  odd.objects[STORAGE_BUCKETS.petPhotos]['not-a-uuid/x.jpg'] = obj()
  assertEquals((await check(odd, at)).verdict.overdue, true)
})
