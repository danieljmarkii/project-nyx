// What holding a row for its vet visit does to the rows BESIDE it (the code review of
// d8992fa, release QA 2026-10-02).
//
// d8992fa holds a row that names a visit until the visit lands, because the server's
// same-pet guard refuses it with a TERMINAL 23514 otherwise. This file drives the hold's
// neighbours end to end: the production write paths (`logVetVisit`, `linkTrialToVisit`,
// `endActiveTrial`, `startDietTrial`), which fire their own pushes exactly as they do on
// the phone, and the production drains in lib/sync.ts, over the runtime schema in
// node:sqlite, against an emulated server that refuses what the real one refuses:
//
//   • 040's one-active-trial index — a second active trial for a pet is 23505;
//   • 066 / 067's visit guard — a row naming a visit the server lacks is 23514;
//   • 041's allowed-food guard — a food naming a trial the server lacks is 23514. A
//     BEFORE trigger, so it fires ahead of the foreign key: the refusal is 23514, never
//     the non-terminal 23503.
//
// All three are TERMINAL on this client, so every case here is about a row quarantined
// on its first try ("couldn't be saved", with no door to fix it), not one that waits a
// cycle. The food cache is left empty, so the food pre-sync never makes a request.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;
type ServerError = { code?: string; message: string };
type ServerAnswer = { data: { id: string }[] | null; error: ServerError | null };

// `mock`-prefixed so the factories below may read them; they are read at call time.
const mockLocal = {
  db: null as InstanceType<typeof DatabaseSync> | null,
  /** Every local read, in order. A drain is seen to run by its queue read. */
  reads: [] as string[],
};

const mockServer = {
  rows: new Map<string, Map<string, Row>>(),
  /** Every write request the server received, in order, with the ids it carried. */
  writes: [] as { table: string; ids: string[] }[],
  /** When set, the answer to every `vet_visits` write: a dropped connection, a write a
   *  policy filtered, a refusal. */
  visitAnswer: null as ServerAnswer | null,
  /** A write to a table named here waits until the test opens it: a slow request. */
  slow: new Map<string, { gate: Promise<void>; open: () => void }>(),
};

function mockServerTable(table: string): Map<string, Row> {
  if (!mockServer.rows.has(table)) mockServer.rows.set(table, new Map());
  return mockServer.rows.get(table)!;
}

/** The server's refusal of one row, by the triggers it runs before the write. */
function mockServerRefusal(table: string, row: Row): ServerError | null {
  if (row.vet_visit_id != null) {
    const visit = mockServerTable('vet_visits').get(String(row.vet_visit_id));
    if (!visit || visit.pet_id !== row.pet_id) {
      return {
        code: '23514',
        message: `vet_visit_id ${row.vet_visit_id} must reference a vet visit for the same pet (${row.pet_id})`,
      };
    }
  }
  if (table === 'diet_trial_foods') {
    const trial = mockServerTable('diet_trials').get(String(row.diet_trial_id));
    if (!trial || trial.pet_id !== row.pet_id) {
      return {
        code: '23514',
        message: `diet_trial_id ${row.diet_trial_id} must reference a diet trial for the same pet (${row.pet_id})`,
      };
    }
  }
  return null;
}

/** One upsert statement: every row lands, or none does. */
function mockServerWrite(table: string, payload: Row[]): ServerAnswer {
  mockServer.writes.push({ table, ids: payload.map((r) => String(r.id)) });
  if (table === 'vet_visits' && mockServer.visitAnswer) return mockServer.visitAnswer;
  const staged = new Map([...mockServerTable(table)].map(([id, r]) => [id, { ...r }]));
  for (const row of payload) {
    const refused = mockServerRefusal(table, row);
    if (refused) return { data: null, error: refused };
    staged.set(String(row.id), { ...(staged.get(String(row.id)) ?? {}), ...row });
    // A unique index is checked row by row, so the order inside a statement counts too.
    if (table === 'diet_trials'
      && [...staged.values()].filter((t) => t.pet_id === row.pet_id && t.status === 'active').length > 1) {
      return {
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_diet_trials_active"' },
      };
    }
  }
  mockServer.rows.set(table, staged);
  return { data: payload.map((r) => ({ id: String(r.id) })), error: null };
}

function mockServerFrom(table: string) {
  return {
    upsert: (payload: Row | Row[]) => ({
      select: async () => {
        await mockServer.slow.get(table)?.gate;
        return mockServerWrite(table, Array.isArray(payload) ? payload : [payload]);
      },
    }),
  };
}

/** The expo-sqlite surface the write paths and drains use, over node:sqlite. Returns
 *  `{ changes }` as expo-sqlite does: a narrower mock hides the zero-row branches (C-39). */
function mockAdapter() {
  const db = () => {
    if (!mockLocal.db) throw new Error('no local database');
    return mockLocal.db;
  };
  return {
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = db().prepare(sql).run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getAllAsync: async (sql: string, params: unknown[] = []) => {
      mockLocal.reads.push(sql);
      return db().prepare(sql).all(...(params as never[]));
    },
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      db().prepare(sql).get(...(params as never[])) ?? null,
    execAsync: async (sql: string) => {
      db().exec(sql);
    },
    withTransactionAsync: async (cb: () => Promise<void>) => {
      db().exec('BEGIN');
      try {
        await cb();
        db().exec('COMMIT');
      } catch (e) {
        db().exec('ROLLBACK');
        throw e;
      }
    },
  };
}

jest.mock('./db', () => ({
  getDb: () => mockAdapter(),
  getWatermark: async () => null,
  setWatermark: async () => undefined,
}));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table: string) => mockServerFrom(table),
  },
}));
jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('./dailyRecapOffer', () => ({
  surfaceOfferForValueMoment: jest.fn().mockResolvedValue(undefined),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { syncPendingDietTrialFoods, syncPendingDietTrials, syncPendingVetVisits } from './sync';
import { endActiveTrial, startDietTrial, type StartTrialInput } from './dietTrialSetup';
import { linkTrialToVisit, logVetVisit } from './vetVisits';

const PET = 'pet-1';
const TODAY = '2026-10-01';

function trialInput(foodId: string, startedAt: string): StartTrialInput {
  return {
    petId: PET,
    primaryFoods: [{ id: foodId, brand: `Brand ${foodId}`, product_name: 'Dry', food_type: 'dry' }],
    permittedFoods: [],
    indication: 'skin',
    targetDurationDays: 56,
    startedAt,
    vetName: null,
    targetProtein: null,
  };
}

/** Let every push the write paths fired run to its end. The drains only await the
 *  adapters above, which resolve on the microtask queue, so a macrotask turn drains them. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

/** A dropped connection: no SQLSTATE, so it costs the row nothing. */
const DROPPED: ServerAnswer = { data: null, error: { message: 'TypeError: Network request failed' } };

/** Make every write to `table` wait until the returned function is called. */
function slowWrites(table: string): () => void {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  mockServer.slow.set(table, { gate, open });
  return open;
}

/** How many times each queue was read for a push: one read per drain run. */
function drainRuns(): Record<string, number> {
  const runs: Record<string, number> = {};
  for (const sql of mockLocal.reads) {
    const m = /^\s*SELECT \* FROM (\w+) WHERE synced = 0/.exec(sql);
    if (m) runs[m[1]] = (runs[m[1]] ?? 0) + 1;
  }
  return runs;
}

const writesTo = (table: string) => mockServer.writes.filter((w) => w.table === table).map((w) => w.ids);
const serverRow = (table: string, id: string) => mockServerTable(table).get(id);
const localRow = (table: string, id: string) =>
  mockLocal.db!.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row;
const foodsOf = (trialId: string) =>
  (mockLocal.db!.prepare('SELECT id FROM diet_trial_foods WHERE diet_trial_id = ?').all(trialId) as { id: string }[])
    .map((r) => r.id);

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
  mockLocal.reads.length = 0;
  mockServer.rows.clear();
  mockServer.writes.length = 0;
  mockServer.visitAnswer = null;
  mockServer.slow.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  for (const { open } of mockServer.slow.values()) open();
  await settle();
  jest.restoreAllMocks();
  mockLocal.db?.close();
  mockLocal.db = null;
});

// Code review item 1. Trial A is linked to a visit that has not landed and then ended
// (the after-visit screen's *Ended*: `linkTrialToVisit`, then `endActiveTrial`), and trial
// B is started with no link. The drain pushes an ending before a start so the server
// never sees two active trials, but it can only order what its queue read returns.
describe('a trial started beside an ending that waits on its visit', () => {
  let trialA: string;
  let trialB: string;
  let visit: string;

  beforeEach(async () => {
    // Trial A, started weeks ago, has long since landed.
    trialA = await startDietTrial(trialInput('food-a', '2026-08-06'));
    await settle();
    expect(serverRow('diet_trials', trialA)).toMatchObject({ status: 'active' });
    expect(localRow('diet_trials', trialA)).toMatchObject({ synced: 1 });
    mockServer.writes.length = 0;

    // The after-visit screen: the visit is minted and its push goes out, and the network
    // drops it. A dropped connection costs the visit nothing; it is simply still unsent.
    mockServer.visitAnswer = DROPPED;
    visit = await logVetVisit({ petId: PET, visitedAt: TODAY });
    await syncPendingVetVisits();
    // *Ended*: the link first, then the ending, whose own push fires at once.
    await linkTrialToVisit(trialA, visit);
    await endActiveTrial({ trialId: trialA, reason: 'vet_advised', endedOn: TODAY });
    await settle();
    // Trial B, before the visit has landed. Its push fires at once too.
    trialB = await startDietTrial(trialInput('food-b', TODAY));
    await settle();
    expect(localRow('vet_visits', visit)).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });
  });

  it('sends neither trial while the visit is unsent: the trials table sees no request at all', () => {
    expect(writesTo('diet_trials')).toEqual([]);
    // Both still queued and clean: waiting, not refused.
    expect(localRow('diet_trials', trialA)).toMatchObject({ status: 'abandoned', synced: 0, sync_error: null });
    expect(localRow('diet_trials', trialB)).toMatchObject({ status: 'active', synced: 0, sync_error: null });
  });

  it('sends both once the visit lands, the ending first, and quarantines neither', async () => {
    mockServer.visitAnswer = null;
    await syncPendingVetVisits();
    await syncPendingDietTrials();
    await settle();

    expect(serverRow('vet_visits', visit)).toBeDefined();
    expect(writesTo('diet_trials')).toEqual([[trialA], [trialB]]);
    expect(serverRow('diet_trials', trialA)).toMatchObject({ status: 'abandoned', vet_visit_id: visit });
    expect(serverRow('diet_trials', trialB)).toMatchObject({ status: 'active' });
    expect(localRow('diet_trials', trialA)).toMatchObject({ synced: 1, sync_error: null });
    expect(localRow('diet_trials', trialB)).toMatchObject({ synced: 1, sync_error: null });
    expect(foodsOf(trialB)).toHaveLength(1);
  });

  // Code review item 3. `startDietTrial` pushes the trial, then its allowed set. B is
  // held, so its food would otherwise go out alone and meet 041's trigger.
  it("holds B's allowed food while B waits, and sends it once B has landed", async () => {
    const [food] = foodsOf(trialB);
    expect(food).toBeDefined();
    expect(writesTo('diet_trial_foods')).toEqual([]);
    expect(localRow('diet_trial_foods', food)).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });

    mockServer.visitAnswer = null;
    await syncPendingVetVisits();
    await syncPendingDietTrials();
    await syncPendingDietTrialFoods();
    await settle();

    expect(writesTo('diet_trial_foods')).toEqual([[food]]);
    expect(serverRow('diet_trial_foods', food)).toMatchObject({ diet_trial_id: trialB });
    expect(localRow('diet_trial_foods', food)).toMatchObject({ synced: 1, sync_error: null });
  });

  // Code review item 2. The trials' own pushes were held and do not come back by
  // themselves; nothing here but the visit's push is called.
  it("needs no other push: the visit landing sends A, then B, then B's food", async () => {
    const [food] = foodsOf(trialB);
    mockServer.visitAnswer = null;
    await syncPendingVetVisits();
    await settle();

    expect(writesTo('diet_trials')).toEqual([[trialA], [trialB]]);
    expect(writesTo('diet_trial_foods')).toEqual([[food]]);
    expect(localRow('diet_trials', trialA)).toMatchObject({ synced: 1, sync_error: null });
    expect(localRow('diet_trials', trialB)).toMatchObject({ synced: 1, sync_error: null });
    expect(localRow('diet_trial_foods', food)).toMatchObject({ synced: 1, sync_error: null });
  });
});

// Code review item 2: when a visit lands, the queues that wait on visits are sent at
// once, each through its public entry point. A drain run is seen by its queue read.
describe('a visit landing sends what waited on it', () => {
  /** The visits drain's own two reads: its rows, then its photos. */
  const VISITS_DRAIN = { vet_visits: 1, vet_visit_attachments: 1 };

  it('runs each queue that waits on a visit exactly once, and the visits queue only once', async () => {
    await logVetVisit({ petId: PET, visitedAt: TODAY });
    await syncPendingVetVisits();
    await settle();

    expect(drainRuns()).toEqual({
      ...VISITS_DRAIN,
      vet_appointments: 1,
      vet_documents: 1,
      medications: 1,
      medication_administrations: 1,
      diet_trials: 1,
      diet_trial_foods: 1,
    });
  });

  it.each([
    ['the connection drops', DROPPED],
    ['a policy filters the write (no row comes back)', { data: [], error: null }],
    ['the server refuses the visit', { data: null, error: { code: '23514', message: 'refused' } }],
  ] as [string, ServerAnswer][])('runs none of them when nothing lands: %s', async (_case, answer) => {
    mockServer.visitAnswer = answer;
    await logVetVisit({ petId: PET, visitedAt: TODAY });
    await syncPendingVetVisits();
    await settle();

    expect(writesTo('vet_visits').length).toBeGreaterThan(0); // the visit did go out
    expect(drainRuns()).toEqual(VISITS_DRAIN);
  });

  it('runs none of them when there is no visit to send', async () => {
    await syncPendingVetVisits();
    await settle();
    expect(drainRuns()).toEqual(VISITS_DRAIN);
  });

  it('follows a run already in flight rather than starting a second beside it (C-24)', async () => {
    // A trial whose push is on the wire, slowly, when the visit lands.
    const openTrials = slowWrites('diet_trials');
    await startDietTrial(trialInput('food-c', TODAY));
    await settle();
    expect(drainRuns().diet_trials).toBe(1);

    await logVetVisit({ petId: PET, visitedAt: TODAY });
    await syncPendingVetVisits();
    await settle();
    // The visit's run waits behind the one on the wire; a second read beside it would be
    // two drains of one queue at once.
    expect(drainRuns().diet_trials).toBe(1);

    openTrials();
    await settle();
    expect(drainRuns().diet_trials).toBe(2);
  });
});
