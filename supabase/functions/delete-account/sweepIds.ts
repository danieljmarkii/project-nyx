// The ids whose folders delete-account's post-delete sweep lists (CUL-2314), read
// from the database. Its own module so the reads are unit-tested against an injected
// reader (sweepIds.test.ts) without booting the handler; index.ts wires the real one.
//
// CUL-2329: a food the account hard-deleted BEFORE deletion began (reapStalePendingFoods,
// the CUL-146 leftovers) has no food_items row, so its `{foodId}/` folder in
// nyx-food-photos was never swept. Migration 106's food_item_retired_ids ledger names
// those ids with their owner; the service role keeps SELECT on it. So the retired ids
// are read too and unioned into the food roots.

import { chunk, type SweepIds } from './plan.ts'

export interface IdRead {
  ids: string[] | null
  count: number | null
  error: string | null
}

export interface OwnedRow {
  id: string
  owner: string | null
}

export interface OwnedRowRead {
  rows: OwnedRow[] | null
  count: number | null
  error: string | null
}

// The three reads, narrowed to what this module needs. Every read asks for an exact
// count, which is what proves it complete (C-42).
export interface SweepIdReader {
  // `select id where <ownerColumn> = userId`, count exact.
  ownedIds(table: 'pets' | 'food_items' | 'food_item_retired_ids', ownerColumn: string, userId: string): Promise<IdRead>
  // `select id, created_by_user_id from food_items where id in ids`, count exact.
  liveFoodOwners(ids: string[]): Promise<OwnedRowRead>
}

// Kept well under PostgREST's URL limit: one uuid is 36 characters plus a comma.
export const RETIRED_ID_CHUNK = 100

function complete(table: string, read: { count: number | null }, got: number): void {
  if (typeof read.count !== 'number' || got < read.count) {
    throw new Error(`Failed to re-read every ${table} id (read ${got}, count ${read.count ?? 'absent'})`)
  }
}

// Re-read immediately before the auth delete, AFTER the purge loop (the long window),
// so a pet or food created while the purge ran still has its folder swept. THROWS on a
// read error or a short read: this runs before the delete, so the account survives and
// the call retries.
export async function readSweepIds(reader: SweepIdReader, userId: string): Promise<SweepIds> {
  const [pets, foods, retired] = await Promise.all([
    reader.ownedIds('pets', 'user_id', userId),
    reader.ownedIds('food_items', 'created_by_user_id', userId),
    reader.ownedIds('food_item_retired_ids', 'owner_id', userId),
  ])
  for (const [table, read] of [['pets', pets], ['food_items', foods], ['food_item_retired_ids', retired]] as const) {
    if (read.error) throw new Error(`Failed to re-read ${table}: ${read.error}`)
    complete(table, read, (read.ids ?? []).length)
  }

  // A retired id held live by ANOTHER account (or by no account) is not this account's
  // folder. 106's guard refuses that claim, and production had none on 2026-11-01, but
  // a claim made before 106 was applied could exist; sweeping it would erase someone
  // else's photos. A short read here throws too: a missed row would sweep that folder.
  const retiredIds = [...new Set(retired.ids ?? [])]
  const notOurs = new Set<string>()
  for (const batch of chunk(retiredIds, RETIRED_ID_CHUNK)) {
    const live = await reader.liveFoodOwners(batch)
    if (live.error) throw new Error(`Failed to read live owners of retired food ids: ${live.error}`)
    complete('live retired food_items', live, (live.rows ?? []).length)
    for (const row of live.rows ?? []) if (row.owner !== userId) notOurs.add(row.id)
  }

  return {
    petIds: pets.ids ?? [],
    foodItemIds: [...new Set([...(foods.ids ?? []), ...retiredIds.filter((id) => !notOurs.has(id))])],
    userId,
  }
}
