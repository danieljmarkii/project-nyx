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
  fileVerdict,
  GRACE_MS,
  goneFromRead,
  isSweepableRoot,
  KEY_SEGMENTS,
  runLine,
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

Deno.test('folders proved gone but not reached are counted, and nothing else is touched', async () => {
  const calls: Calls = { removed: [], listed: [] }
  let reads = 0
  const io = fakeIO(baseWorld(), calls)
  // The clock passes the deadline once the owner reads are done.
  const report = await runSweep(
    { ...io, probeUser: (id) => (reads++, io.probeUser(id)) },
    { now: () => (reads >= 2 ? NOW + 10 : NOW), deadline: NOW + 1 },
  )
  assertEquals(calls.removed, [])
  const notReached = Object.values(report.left).reduce((n, b) => n + (b.folder_not_reached ?? 0), 0)
  // The dead pet in two buckets and the dead user: the food bucket comes after the
  // drug labels in rule order, so it was never listed and counts as a bucket.
  assertEquals(notReached, 3)
  assertEquals(report.left[STORAGE_BUCKETS.foodPhotos]?.bucket_not_reached, 1)
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
