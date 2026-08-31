// CUL-642 — the lookup the shared reversal uses to answer "whose Signal cache is
// now out of date?", tested against a real engine rather than a regex.
//
// WHAT IT IS HERE TO CATCH. The obvious implementation is a call to the existing
// `getEventById`, and that read ends `WHERE e.id = ? AND e.deleted_at IS NULL`.
// `reverseLoggedEvent` asks AFTER the tombstone is written, so the reuse answers
// `null` every single time: the regen never fires, nothing errors, and the diff
// reads as the fix. That is the CUL-641 failure shape — a delete path that is
// locally complete and quietly missing its half — so the property is pinned where
// it can only be satisfied by real behaviour.
//
// node:sqlite (Node >= 22) gives a real engine; the events DDL comes from the real
// BASE_SCHEMA_SQL, so the column set under test is the shipped one (the
// updateEvent.test.ts / cacheFlush.test.ts pattern). db.ts imports expo-sqlite and
// expo-file-system at module load and neither resolves under jest-expo's node
// runner; the function writes through the injected handle, so stubbing them to
// satisfy the import graph is sufficient.
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { getEventPetId } from './db';
import { BASE_SCHEMA_SQL } from './localSchema';

type RawDb = InstanceType<typeof DatabaseSync>;

// getEventPetId only ever calls getFirstAsync; Pick<> keeps the injected surface to
// exactly that, so this adapter is the whole contract.
function adapter(db: RawDb) {
  return {
    async getFirstAsync(sql: string, params: (string | number | null)[]) {
      return db.prepare(sql).get(...params) ?? null;
    },
  } as unknown as Parameters<typeof getEventPetId>[1];
}

function freshDb(): RawDb {
  const db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA_SQL);
  return db;
}

function insertEvent(db: RawDb, id: string, petId: string, deletedAt: string | null): void {
  db.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, created_at, updated_at, deleted_at, synced)
     VALUES (?, ?, 'vomit', '2026-08-30T12:00:00.000Z', '2026-08-30T12:00:00.000Z',
             '2026-08-30T12:00:00.000Z', ?, 0)`,
  ).run(id, petId, deletedAt);
}

describe('getEventPetId (CUL-642)', () => {
  it('finds the pet of an event that is ALREADY soft-deleted', async () => {
    // The load-bearing case, and the only one the caller ever hits: the reversal
    // writes the tombstone first, then asks whose cache to refresh.
    const db = freshDb();
    insertEvent(db, 'ev-1', 'pet-a', '2026-08-30T12:05:00.000Z');
    await expect(getEventPetId('ev-1', adapter(db))).resolves.toBe('pet-a');
    db.close();
  });

  it('finds the pet of a live event too — deletedness is simply not its question', async () => {
    const db = freshDb();
    insertEvent(db, 'ev-2', 'pet-b', null);
    await expect(getEventPetId('ev-2', adapter(db))).resolves.toBe('pet-b');
    db.close();
  });

  it('answers null for an id no local row carries — an unknown pet, never a guess', async () => {
    // The caller must be able to tell "this pet" from "no idea": falling back to the
    // active pet on this answer is the wrong-pet class (CUL-574), and it would
    // refresh a cache that was never stale while leaving the stale one alone.
    const db = freshDb();
    insertEvent(db, 'ev-3', 'pet-c', null);
    await expect(getEventPetId('ev-missing', adapter(db))).resolves.toBeNull();
    db.close();
  });

  it('answers the row it was asked for when several pets have events', async () => {
    // A one-row fixture cannot tell a correct lookup from one that returns whatever
    // the table holds first, which is exactly what `LIMIT 1` with no predicate does.
    const db = freshDb();
    insertEvent(db, 'ev-4', 'pet-a', null);
    insertEvent(db, 'ev-5', 'pet-b', '2026-08-30T13:00:00.000Z');
    insertEvent(db, 'ev-6', 'pet-c', null);
    await expect(getEventPetId('ev-5', adapter(db))).resolves.toBe('pet-b');
    db.close();
  });
});
