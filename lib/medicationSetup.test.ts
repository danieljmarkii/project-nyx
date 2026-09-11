// The local-first regimen write path (CUL-901 / VV-3).
//
// WHY A REAL ENGINE AND NOT A MOCKED `runAsync`. The acceptance criterion is that a
// regimen "lands as a local row with `synced = 0` and `vet_visit_id` in the same
// insert under a mocked-offline client" — and a mocked `runAsync` can only prove the
// SQL STRING says those things, never that a row exists afterwards. Column-count
// mismatches, a placeholder out of order, a NOT NULL the payload does not satisfy:
// all of them pass a string assertion and all of them lose the owner's medication in
// a clinic car park. So `node:sqlite` (Node ≥ 22 core, `require`'d to keep it off the
// babel/jest-expo path) runs the production `MEDICATION_SCHEMA_SQL`, and the
// assertions read rows back.
//
// AND THE QUEUE'S OWN PREDICATE, NOT A COPY OF IT. "The next cycle picks it up" is
// checked by running `drainMedicationsQueue`'s actual WHERE clause — `synced = 0 AND
// ${NOT_QUARANTINED_SQL}`, imported from `lib/syncQueue.ts` — against the fixture. A
// test that re-types the predicate it is checking is a tautology with fixtures
// (C-35): it would stay green if the quarantine column stopped being cleared.
//
// jest hoists jest.mock() above the imports, so anything a factory closes over must
// be `mock`-prefixed.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...a: unknown[]): Record<string, unknown>[];
    run(...a: unknown[]): unknown;
  };
  close(): void;
}

let mockDb: RawDb;
// RETURNS the run result, like the real `expo-sqlite` (`{ changes, lastInsertRowId }`).
// The first cut of this mock swallowed it, and that is precisely why the suite could
// not see the missing zero-row guard: a stand-in narrower than the API it stands in
// for makes the caller's use of the dropped half untestable, which is the same fixture
// lesson as C-35 from the other end. `node:sqlite` reports `changes` under the same
// name, so the shape below is real, not invented.
const mockRunAsync = jest.fn(async (sql: string, params: unknown[] = []) =>
  mockDb.prepare(sql).run(...(params as never[])) as { changes: number },
);
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: mockRunAsync,
    // The module writes and never reads; present so a future read fails loudly
    // rather than silently resolving undefined.
    getAllAsync: () => { throw new Error('medicationSetup does not read'); },
  }),
}));

// THE OFFLINE CLIENT. `syncPendingMedications` is the whole network surface this
// module touches, and with no signal its fetch rejects — so that is what the offline
// tests make it do. The module must still resolve, and the row must still be there.
const mockSyncMedications = jest.fn().mockResolvedValue(undefined);
jest.mock('./sync', () => ({
  syncPendingMedications: () => mockSyncMedications(),
}));

const mockSurfaceOffer = jest.fn().mockResolvedValue(undefined);
jest.mock('./dailyRecapOffer', () => ({
  surfaceOfferForValueMoment: (m: string) => mockSurfaceOffer(m),
}));

let mockIdSeq = 0;
// requireActual, not a hand-written stand-in: everything else this module imports
// from `./utils` is a pure function whose real behaviour is the thing under test
// (C-34 — the read is what needs stubbing, never the rule).
jest.mock('./utils', () => {
  const actual = jest.requireActual('./utils');
  return { ...actual, uuid: () => `regimen-${++mockIdSeq}` };
});

import { MEDICATION_SCHEMA_SQL, type RegimenWritePayload } from './medications';
import { NOT_QUARANTINED_SQL } from './syncQueue';
import { endRegimen, startRegimen, updateRegimen } from './medicationSetup';
import { useSyncStore } from '../store/syncStore';

const flush = () => new Promise((r) => setTimeout(r, 0));

function payload(overrides: Partial<RegimenWritePayload> = {}): RegimenWritePayload {
  return {
    medication_item_id: null,
    drug_name: 'prednisolone',
    dose_amount: '5 mg',
    route: 'oral',
    doses_per_day: 2,
    schedule_notes: 'with food',
    indication: 'itchy skin',
    prescribed_by: 'Dr. Chen',
    started_at: '2026-09-11',
    target_duration_days: 14,
    target_duration_doses: null,
    ...overrides,
  };
}

/** Exactly the rows `drainMedicationsQueue` would pick up, using its own predicate. */
function queued(): Record<string, unknown>[] {
  return mockDb
    .prepare(`SELECT * FROM medications WHERE synced = 0 AND ${NOT_QUARANTINED_SQL}`)
    .all();
}

function rowById(id: string): Record<string, unknown> | undefined {
  return mockDb.prepare('SELECT * FROM medications WHERE id = ?').all(id)[0];
}

/** A row already pushed and at rest, so an edit's re-queue is visible as a CHANGE.
 *  `sync_error` / `sync_attempts` carry a server refusal, because the quarantine is
 *  what an owner-visible correction has to clear to get the row moving again. */
function seedSyncedRow(id: string, updatedAt: string, quarantined = true): void {
  mockDb
    .prepare(
      `INSERT INTO medications
         (id, pet_id, drug_name, started_at, status, created_at, updated_at,
          synced, sync_attempts, sync_error)
       VALUES (?, 'pet-1', 'prednisolone', '2026-09-01', 'active', ?, ?, 1, ?, ?)`,
    )
    .run(id, updatedAt, updatedAt, quarantined ? 3 : 0, quarantined ? '23514' : null);
}

beforeEach(() => {
  mockIdSeq = 0;
  mockRunAsync.mockClear();
  mockSyncMedications.mockClear().mockResolvedValue(undefined);
  mockSurfaceOffer.mockClear();
  useSyncStore.setState({ hydrationTick: 0 });

  mockDb = new DatabaseSync(':memory:') as RawDb;
  mockDb.exec('PRAGMA foreign_keys = ON;');
  // The FK target medication_administrations needs; this suite never writes a dose.
  mockDb.exec('CREATE TABLE events (id TEXT PRIMARY KEY, deleted_at TEXT);');
  mockDb.exec(MEDICATION_SCHEMA_SQL);
});

afterEach(() => mockDb.close());

// ── The acceptance criterion (spec §7 AC 7's offline clause) ─────────────────

describe('startRegimen — offline', () => {
  it('lands a local row at synced = 0 with vet_visit_id, though the push rejects', async () => {
    // No signal: the flush's fetch fails. This is the branch that used to render
    // "Could not save" and write nothing at all.
    mockSyncMedications.mockRejectedValue(new Error('Network request failed'));

    const { id } = await startRegimen({
      petId: 'pet-1',
      payload: payload(),
      vetVisitId: 'visit-7',
    });
    await flush();

    expect(id).toBe('regimen-1');
    const row = rowById(id)!;
    expect(row).toBeDefined();
    expect(row.synced).toBe(0);
    expect(row.vet_visit_id).toBe('visit-7');
    expect(row.pet_id).toBe('pet-1');
    expect(row.drug_name).toBe('prednisolone');
    expect(row.status).toBe('active');
    expect(row.ended_at).toBeNull();
    // Every column the form carries reached the row — the placeholder-order check a
    // string assertion cannot make.
    expect(row.dose_amount).toBe('5 mg');
    expect(row.route).toBe('oral');
    expect(row.doses_per_day).toBe(2);
    expect(row.schedule_notes).toBe('with food');
    expect(row.indication).toBe('itchy skin');
    expect(row.prescribed_by).toBe('Dr. Chen');
    expect(row.started_at).toBe('2026-09-11');
    expect(row.target_duration_days).toBe(14);
    expect(row.target_duration_doses).toBeNull();
  });

  it('leaves the row where the next drain will find it', async () => {
    mockSyncMedications.mockRejectedValue(new Error('Network request failed'));
    const { id } = await startRegimen({ petId: 'pet-1', payload: payload() });
    await flush();

    // The queue's OWN predicate, not a restatement of it.
    expect(queued().map((r) => r.id)).toEqual([id]);
    // And it asked to flush — the row is queued AND kicked, not queued and forgotten.
    expect(mockSyncMedications).toHaveBeenCalledTimes(1);
  });

  it('does not reject when the push does — a failed flush is not a failed save', async () => {
    mockSyncMedications.mockRejectedValue(new Error('Network request failed'));
    await expect(startRegimen({ petId: 'pet-1', payload: payload() })).resolves.toEqual({
      id: 'regimen-1',
    });
  });

  it('writes vet_visit_id in the SAME insert — never a follow-up UPDATE', async () => {
    await startRegimen({ petId: 'pet-1', payload: payload(), vetVisitId: 'visit-7' });

    // One statement, not two. A second write carrying the link is a write a crash
    // between the two can lose, leaving a course whose provenance silently differs
    // from what the owner was shown (spec §5.1).
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql] = mockRunAsync.mock.calls[0];
    expect(sql).toMatch(/^\s*INSERT INTO medications/);
    expect(sql).toMatch(/vet_visit_id/);
    // Anchored to a STATEMENT, not the bare word: `updated_at` contains "update",
    // and a substring hunt for it fails on the correct code (this assertion did,
    // first time out).
    expect(sql).not.toMatch(/\bUPDATE\s+[A-Za-z_][\w.]*\s+SET\b/i);
  });

  it('stores a NULL link on the Pet-tab path, where there is no visit', async () => {
    const { id } = await startRegimen({ petId: 'pet-1', payload: payload() });
    // Null, never the string "undefined" — this column is read by the visit surfaces
    // and joined on.
    expect(rowById(id)!.vet_visit_id).toBeNull();
  });

  it('fires the med-course value moment once, from the write path', async () => {
    await startRegimen({ petId: 'pet-1', payload: payload() });
    expect(mockSurfaceOffer).toHaveBeenCalledTimes(1);
    expect(mockSurfaceOffer).toHaveBeenCalledWith('med_course');
  });

  it('bumps the hydration tick, so Home’s med strip sees the course immediately', async () => {
    await startRegimen({ petId: 'pet-1', payload: payload() });
    // The strip and the widget read the LOCAL mirror and re-read on this tick. Under
    // the old remote-first write they saw a new course only once hydration pulled it
    // back down, and offline never.
    expect(useSyncStore.getState().hydrationTick).toBe(1);
  });
});

// ── The edit path: the CUL-691 version-marking, and the quarantine re-arm ────

describe('updateRegimen', () => {
  it('moves updated_at and re-queues, clearing a server refusal', async () => {
    seedSyncedRow('med-1', '2026-09-01T00:00:00.000Z');
    await updateRegimen('med-1', payload({ dose_amount: '2.5 mg' }));

    const row = rowById('med-1')!;
    expect(row.dose_amount).toBe('2.5 mg');
    expect(row.synced).toBe(0);
    // `markSynced` matches `WHERE id = ? AND updated_at IS ?`, so an edit that did
    // not MOVE `updated_at` would let a push that raced it mark this row synced with
    // the old version still on the server — CUL-691, re-opened on this write path.
    expect(row.updated_at).not.toBe('2026-09-01T00:00:00.000Z');
    // And the quarantine pair is cleared in the SAME statement, or the owner's
    // correction is accepted on screen and the row never moves again (B-398).
    expect(row.sync_error).toBeNull();
    expect(row.sync_attempts).toBe(0);
    expect(queued().map((r) => r.id)).toEqual(['med-1']);
  });

  it('leaves the lifecycle columns alone — an edit is not an ending', async () => {
    seedSyncedRow('med-1', '2026-09-01T00:00:00.000Z');
    await updateRegimen('med-1', payload());

    const row = rowById('med-1')!;
    expect(row.status).toBe('active');
    expect(row.ended_at).toBeNull();
  });

  it('touches only the named regimen', async () => {
    seedSyncedRow('med-1', '2026-09-01T00:00:00.000Z');
    seedSyncedRow('med-2', '2026-09-01T00:00:00.000Z');
    await updateRegimen('med-1', payload({ drug_name: 'gabapentin' }));

    expect(rowById('med-2')!.drug_name).toBe('prednisolone');
    expect(rowById('med-2')!.synced).toBe(1);
  });

  it('is not a course start — no second value moment', async () => {
    seedSyncedRow('med-1', '2026-09-01T00:00:00.000Z');
    await updateRegimen('med-1', payload());
    expect(mockSurfaceOffer).not.toHaveBeenCalled();
  });
});

// ── Ending a course ─────────────────────────────────────────────────────────

describe('endRegimen', () => {
  it('ends via status/ended_at and re-queues — the row survives its own ending', async () => {
    seedSyncedRow('med-1', '2026-09-01T00:00:00.000Z');
    await endRegimen('med-1', '2026-09-11');

    const row = rowById('med-1')!;
    // Never a DELETE and never a soft delete (migration 020): the medication history
    // is built from ended courses, and B-140 exists because they used to vanish.
    expect(row).toBeDefined();
    expect(row.status).toBe('completed');
    expect(row.ended_at).toBe('2026-09-11');
    expect(row.synced).toBe(0);
    expect(row.updated_at).not.toBe('2026-09-01T00:00:00.000Z');
    expect(row.sync_error).toBeNull();
    expect(row.sync_attempts).toBe(0);
  });

  it('writes the day key it was GIVEN, never one derived from the clock', async () => {
    // B-441: `ended_at` is a DATE, and its day must come from the owner's local
    // calendar. This module deriving one itself is the bug in a new address, so the
    // caller owns it — including a back-dated end a future caller may pass.
    seedSyncedRow('med-1', '2026-09-01T00:00:00.000Z');
    await endRegimen('med-1', '2026-08-30');
    expect(rowById('med-1')!.ended_at).toBe('2026-08-30');
  });

  it('does not reject when the push does', async () => {
    seedSyncedRow('med-1', '2026-09-01T00:00:00.000Z');
    mockSyncMedications.mockRejectedValue(new Error('Network request failed'));
    await expect(endRegimen('med-1', '2026-09-11')).resolves.toBeUndefined();
    await flush();
    expect(queued().map((r) => r.id)).toEqual(['med-1']);
  });
});

// ── The branch both reviewers found, and no test covered ────────────────────
//
// Every test above seeds the row first, which is the C-35 trap in miniature: the
// happy fixture made the whole "target is not in the local mirror" branch invisible,
// and that branch is where the silent data loss lived. It is REACHABLE because the
// Pet-tab card offering Edit and End reads Supabase while these write SQLite, and
// nothing hydrates the mirror on tab focus.

describe('a write whose target the local mirror does not hold', () => {
  it('endRegimen throws rather than reporting an ending that happened nowhere', async () => {
    await expect(endRegimen('never-hydrated-here', '2026-09-11')).rejects.toThrow(
      /matched no local row/,
    );
  });

  it('updateRegimen throws rather than discarding the owner’s correction', async () => {
    await expect(updateRegimen('never-hydrated-here', payload())).rejects.toThrow(
      /matched no local row/,
    );
  });

  it('queues nothing and signals nothing when nothing was written', async () => {
    // The tick and the flush are AFTER the check on purpose: a hydration signal over
    // an absent row repaints the card as though the write had landed, and a flush
    // finding an empty queue is the thing that makes the failure look like success.
    await expect(endRegimen('never-hydrated-here', '2026-09-11')).rejects.toThrow();
    expect(queued()).toEqual([]);
    expect(mockSyncMedications).not.toHaveBeenCalled();
    expect(useSyncStore.getState().hydrationTick).toBe(0);
  });

  it('still writes, and does not throw, for a row the mirror DOES hold', async () => {
    // The other direction, so the guard cannot pass by refusing everything.
    seedSyncedRow('med-1', '2026-09-01T00:00:00.000Z');
    await expect(endRegimen('med-1', '2026-09-11')).resolves.toBeUndefined();
    expect(rowById('med-1')!.status).toBe('completed');
  });
});

// ── The fixture itself ──────────────────────────────────────────────────────

describe('the queue predicate this suite leans on', () => {
  it('excludes a quarantined row, so the re-arm assertions above are not vacuous', () => {
    // If `NOT_QUARANTINED_SQL` stopped excluding anything, every `queued()`
    // expectation would pass for the wrong reason.
    seedSyncedRow('med-q', '2026-09-01T00:00:00.000Z');
    mockDb.prepare("UPDATE medications SET synced = 0 WHERE id = 'med-q'").run();
    expect(queued()).toEqual([]);
  });
});
