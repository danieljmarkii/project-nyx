// CUL-2846: the "rebuild owed" marker, on a real node:sqlite database built from the app's own
// schema (C-35). The settle rule is the one that matters: a rebuild clears only the token it
// captured, and only once nothing for the pet is still unsent.

const { DatabaseSync } = require('node:sqlite');

let mockDb: {
  exec(sql: string): void;
  prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] };
  close(): void;
};
jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...(params as never[])),
    runAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).run(...(params as never[])),
  }),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { LOCAL_WIPE_TABLES } from './hydration';
import {
  clearSignalUnseen,
  markSignalUnseen,
  markSignalUnseenIfAbsent,
  readSignalUnseenToken,
} from './signalUnseen';

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(BASE_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
});
afterEach(() => mockDb.close());

function unsentEvent(petId: string) {
  mockDb
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, created_at, updated_at, synced)
       VALUES (?, ?, 'vomit', '2026-11-20T17:00:00.000Z', '2026-11-20T17:00:00.000Z', '2026-11-20T17:00:00.000Z', 0)`,
    )
    .run(`e-${petId}`, petId);
}
function unsentVisit(petId: string) {
  mockDb
    .prepare(
      `INSERT INTO vet_visits (id, pet_id, visited_at, channel, created_at, updated_at, synced)
       VALUES (?, ?, '2026-11-20', 'phone', '2026-11-20T17:00:00.000Z', '2026-11-20T17:00:00.000Z', 0)`,
    )
    .run(`v-${petId}`, petId);
}

describe('the rebuild owed (CUL-2846)', () => {
  it('nothing owed reads null', async () => {
    expect(await readSignalUnseenToken('nyx')).toBeNull();
  });

  it('a write owes a rebuild; a later write owes it under a NEW token', async () => {
    await markSignalUnseen('nyx');
    const first = await readSignalUnseenToken('nyx');
    expect(first).not.toBeNull();
    await markSignalUnseen('nyx');
    const second = await readSignalUnseenToken('nyx');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it('a drain keeps the token already owed, owes one when none is, and says which it newly owed', async () => {
    await markSignalUnseen('nyx');
    const owed = await readSignalUnseenToken('nyx');
    expect(await markSignalUnseenIfAbsent(['nyx', 'milo', 'milo', ''])).toEqual(['milo']);
    expect(await readSignalUnseenToken('nyx')).toBe(owed);
    expect(await readSignalUnseenToken('milo')).not.toBeNull();
  });

  it('pass 1 (B1): a visit pushed while a rebuild runs under an earlier token stays owed after it settles', async () => {
    // A meal armed T1; rebuild R captured T1 and started reading. The owner corrects the exam to
    // a call; the visits drain owes a FRESH token and the visit lands (synced) mid-build. R
    // succeeds and settles T1 — but its read started before the visit landed.
    await markSignalUnseen('nyx');
    const captured = (await readSignalUnseenToken('nyx')) as string;
    await markSignalUnseen('nyx'); // the visits drain, before its push
    await clearSignalUnseen('nyx', captured); // nothing unsent any more: the visit landed
    expect(await readSignalUnseenToken('nyx')).not.toBeNull();
  });

  it('a row the server refused for good does not hold the debt (it would rebuild every launch)', async () => {
    await markSignalUnseen('nyx');
    const captured = (await readSignalUnseenToken('nyx')) as string;
    unsentEvent('nyx');
    mockDb.prepare(`UPDATE events SET sync_error = '23514: refused' WHERE pet_id = 'nyx'`).run();
    await clearSignalUnseen('nyx', captured);
    expect(await readSignalUnseenToken('nyx')).toBeNull();
  });

  it('a rebuild settles only the token it captured: a write made during it stays owed', async () => {
    await markSignalUnseen('nyx');
    const captured = (await readSignalUnseenToken('nyx')) as string;
    await markSignalUnseen('nyx'); // written while the rebuild ran
    await clearSignalUnseen('nyx', captured);
    expect(await readSignalUnseenToken('nyx')).not.toBeNull();
  });

  it('a rebuild that captured the current token settles it', async () => {
    await markSignalUnseen('nyx');
    await clearSignalUnseen('nyx', (await readSignalUnseenToken('nyx')) as string);
    expect(await readSignalUnseenToken('nyx')).toBeNull();
  });

  it('a row still unsent keeps the debt: the build read a server that does not hold it', async () => {
    await markSignalUnseen('nyx');
    const captured = (await readSignalUnseenToken('nyx')) as string;
    unsentEvent('nyx');
    await clearSignalUnseen('nyx', captured);
    expect(await readSignalUnseenToken('nyx')).toBe(captured);
  });

  it('an unpushed visit keeps the debt too (the rebuild does not flush visits)', async () => {
    await markSignalUnseen('nyx');
    const captured = (await readSignalUnseenToken('nyx')) as string;
    unsentVisit('nyx');
    await clearSignalUnseen('nyx', captured);
    expect(await readSignalUnseenToken('nyx')).toBe(captured);
  });

  it('another pet’s unsent row does not hold this pet’s debt', async () => {
    await markSignalUnseen('nyx');
    unsentEvent('milo');
    await clearSignalUnseen('nyx', (await readSignalUnseenToken('nyx')) as string);
    expect(await readSignalUnseenToken('nyx')).toBeNull();
  });

  it('is wiped on sign-out', () => {
    expect(LOCAL_WIPE_TABLES).toContain('signal_unseen_writes');
  });
});
