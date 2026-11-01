// CUL-2329: the swept-id re-read. Run with:
// deno test supabase/functions/delete-account/sweepIds.test.ts
//
// The fake reader answers the way PostgREST does (ids, an exact count, an error), so
// each test drives the real readSweepIds and then the real buildPrefixSweep: the claim
// under test is the folder list the post-delete sweep would empty.

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildPrefixSweep, mergeSweepIds, STORAGE_BUCKETS } from './plan.ts'
import { RETIRED_ID_CHUNK, readSweepIds, type IdRead, type OwnedRowRead, type SweepIdReader } from './sweepIds.ts'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PET = 'aaaaaaaa-0000-4000-8000-000000000001'
const LIVE_FOOD = 'bbbbbbbb-0000-4000-8000-000000000001'
const RETIRED_FOOD = 'cccccccc-0000-4000-8000-000000000001'
const CLAIMED_BY_OTHER = 'dddddddd-0000-4000-8000-000000000001'

type Table = 'pets' | 'food_items' | 'food_item_retired_ids'
interface Fixture {
  owned: Partial<Record<Table, IdRead>>
  live?: Array<{ id: string; owner: string | null }>
  liveOverride?: (ids: string[]) => OwnedRowRead
}

const full = (ids: string[]): IdRead => ({ ids, count: ids.length, error: null })

function fakeReader(f: Fixture, calls: { live: string[][] } = { live: [] }): SweepIdReader {
  return {
    ownedIds(table, ownerColumn, userId) {
      // The owner column is part of the claim: the wrong one reads someone else's ids.
      const expected = { pets: 'user_id', food_items: 'created_by_user_id', food_item_retired_ids: 'owner_id' }[table]
      if (ownerColumn !== expected || userId !== ME) throw new Error(`unexpected read ${table}.${ownerColumn}=${userId}`)
      return Promise.resolve(f.owned[table] ?? full([]))
    },
    liveFoodOwners(ids) {
      calls.live.push(ids)
      if (f.liveOverride) return Promise.resolve(f.liveOverride(ids))
      const rows = (f.live ?? []).filter((r) => ids.includes(r.id))
      return Promise.resolve({ rows, count: rows.length, error: null })
    },
  }
}

const foodRoots = (ids: Awaited<ReturnType<typeof readSweepIds>>) =>
  buildPrefixSweep(ids).filter((s) => s.bucket === STORAGE_BUCKETS.foodPhotos).map((s) => s.root).sort()

Deno.test('a food the owner deleted earlier has its photo folder swept', async () => {
  const ids = await readSweepIds(
    fakeReader({ owned: { pets: full([PET]), food_items: full([LIVE_FOOD]), food_item_retired_ids: full([RETIRED_FOOD]) } }),
    ME,
  )
  assertEquals(foodRoots(ids), [LIVE_FOOD, RETIRED_FOOD].sort())
  assert(buildPrefixSweep(ids).some((s) => s.bucket === STORAGE_BUCKETS.foodPhotos && s.root === RETIRED_FOOD))
  assertEquals(ids.petIds, [PET])
})

Deno.test('the retired folder survives the merge with step 1 ids', async () => {
  const reread = await readSweepIds(fakeReader({ owned: { food_item_retired_ids: full([RETIRED_FOOD]) } }), ME)
  const merged = mergeSweepIds({ petIds: [PET], foodItemIds: [LIVE_FOOD], userId: ME }, reread)
  assertEquals(foodRoots(merged), [LIVE_FOOD, RETIRED_FOOD].sort())
})

Deno.test("a retired id now held live by another account is not swept", async () => {
  const ids = await readSweepIds(
    fakeReader({
      owned: { food_item_retired_ids: full([RETIRED_FOOD, CLAIMED_BY_OTHER]) },
      live: [{ id: CLAIMED_BY_OTHER, owner: OTHER }],
    }),
    ME,
  )
  assertEquals(foodRoots(ids), [RETIRED_FOOD])
})

Deno.test('a retired id held live by no account is not swept', async () => {
  const ids = await readSweepIds(
    fakeReader({ owned: { food_item_retired_ids: full([CLAIMED_BY_OTHER]) }, live: [{ id: CLAIMED_BY_OTHER, owner: null }] }),
    ME,
  )
  assertEquals(foodRoots(ids), [])
})

Deno.test('a retired id the owner re-created is swept once', async () => {
  const ids = await readSweepIds(
    fakeReader({
      owned: { food_items: full([RETIRED_FOOD]), food_item_retired_ids: full([RETIRED_FOOD]) },
      live: [{ id: RETIRED_FOOD, owner: ME }],
    }),
    ME,
  )
  assertEquals(foodRoots(ids), [RETIRED_FOOD])
})

Deno.test('an empty ledger changes nothing and skips the owner read', async () => {
  const calls = { live: [] as string[][] }
  const ids = await readSweepIds(fakeReader({ owned: { food_items: full([LIVE_FOOD]) } }, calls), ME)
  assertEquals(foodRoots(ids), [LIVE_FOOD])
  assertEquals(calls.live.length, 0)
})

Deno.test('the ledger read error throws, before the delete', async () => {
  await assertRejects(
    () => readSweepIds(fakeReader({ owned: { food_item_retired_ids: { ids: null, count: null, error: 'boom' } } }), ME),
    Error,
    'food_item_retired_ids: boom',
  )
})

Deno.test('a short ledger read throws', async () => {
  await assertRejects(
    () => readSweepIds(fakeReader({ owned: { food_item_retired_ids: { ids: [RETIRED_FOOD], count: 2, error: null } } }), ME),
    Error,
    'every food_item_retired_ids id',
  )
})

Deno.test('a ledger read with no count throws', async () => {
  await assertRejects(
    () => readSweepIds(fakeReader({ owned: { food_item_retired_ids: { ids: [RETIRED_FOOD], count: null, error: null } } }), ME),
    Error,
    'count absent',
  )
})

Deno.test('a failed or short live-owner read throws rather than sweep a folder it could not check', async () => {
  const owned = { food_item_retired_ids: full([CLAIMED_BY_OTHER]) }
  await assertRejects(
    () => readSweepIds(fakeReader({ owned, liveOverride: () => ({ rows: null, count: null, error: 'down' }) }), ME),
    Error,
    'live owners',
  )
  await assertRejects(
    () => readSweepIds(fakeReader({ owned, liveOverride: () => ({ rows: [], count: 1, error: null }) }), ME),
    Error,
    'live retired food_items',
  )
})

Deno.test('the live-owner check runs over every retired id, in chunks', async () => {
  const many = Array.from({ length: RETIRED_ID_CHUNK * 2 + 5 }, (_, i) =>
    `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}`)
  const last = many[many.length - 1]
  const calls = { live: [] as string[][] }
  const ids = await readSweepIds(
    fakeReader({ owned: { food_item_retired_ids: full(many) }, live: [{ id: last, owner: OTHER }] }, calls),
    ME,
  )
  assertEquals(calls.live.length, 3)
  assert(calls.live.every((c) => c.length <= RETIRED_ID_CHUNK))
  assertEquals(ids.foodItemIds.length, many.length - 1)
  assert(!ids.foodItemIds.includes(last))
})

Deno.test('pets and food_items reads keep their errors and short-read checks', async () => {
  await assertRejects(() => readSweepIds(fakeReader({ owned: { pets: { ids: null, count: null, error: 'x' } } }), ME), Error, 'pets: x')
  await assertRejects(
    () => readSweepIds(fakeReader({ owned: { food_items: { ids: [], count: 3, error: null } } }), ME),
    Error,
    'every food_items id',
  )
})
