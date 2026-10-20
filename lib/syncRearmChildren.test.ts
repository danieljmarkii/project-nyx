// CUL-2032 — a parent that lands gives its stuck attached entries one fresh try, across every
// gated child queue.
//
// A refused parent holds nothing (`parentLandedSql`, `visitLandedSql`), so its child goes up
// and, when the server has never seen the parent, is refused itself: most of these by a
// same-pet guard's terminal 23514, the re-check marker by a budgeted edge 404. CUL-1986 gave
// meals, weigh-ins and looks a fresh try when their log lands; every other link stayed parked
// for good, among them the answer to "Has she eaten?" under a vomit (an intake signal). This
// file drives the production drains and hydration in lib/sync.ts over the runtime schema in
// node:sqlite, against an emulated server:
//
//   • every link in PARENT_LINKS: the parent lands through its own drain and re-arms the
//     child parked on a refusal it explains, and nothing else;
//   • the answer under a vomit, end to end: refused behind a refused log, fixed, landed;
//   • the race: a parent that lands while its child's refusal is in flight leaves the child
//     un-parked, on an insert-only child (no version) and a visit-linked one;
//   • another device lands the fixed parent: the pull re-arms the child, per hydrated parent.
//
// CUL-2046 widens the walk to the children the push never holds (REARM_ONLY_LINKS): a dose
// behind its course or its log, and the photos on a log or a visit. Each parks on a budgeted
// 23503 behind a refused parent, and every test above runs over them too; the Refused dose
// gets its own end to end below, and so does its exemption from holding.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;
type ServerError = { code?: string; message: string };
type ServerAnswer = { data: { id: string }[] | null; error: ServerError | null };

const mockLocal = { db: null as InstanceType<typeof DatabaseSync> | null };

const mockInvokeOk = async (..._args: unknown[]): Promise<{ data: unknown; error: unknown }> =>
  ({ data: { results: [] }, error: null });
/** The edge function the re-check marker calls; a test swaps `fn` for one request. */
const mockInvoke = { fn: mockInvokeOk };

const mockServer = {
  rows: new Map<string, Map<string, Row>>(),
  /** A row named here (by id) is refused with this. */
  refuse: new Map<string, ServerError>(),
  /** Runs once, after the server has answered a write to the named table and before the
   *  client sees the answer: what happens on the phone in the network gap. */
  inGap: new Map<string, () => Promise<void>>(),
  /** Whether the same-pet guards below run. Off for the per-link walk, whose rows carry
   *  placeholder links the guards would refuse. */
  guarded: false,
};

/** Runs once, right after a local read whose SQL starts with the key: what happens on the
 *  phone between a drain's queue read and its next step. */
const mockAfterRead = new Map<string, () => void>();

function fkMessage(table: string, column: string): string {
  return `insert or update on table "${table}" violates foreign key constraint "${table}_${column}_fkey"`;
}

function mockServerTable(table: string): Map<string, Row> {
  if (!mockServer.rows.has(table)) mockServer.rows.set(table, new Map());
  return mockServer.rows.get(table)!;
}

/** The same-pet guards these tests lean on: a child naming a parent the server lacks. */
const mockGuarded: Record<string, { parent: string; column: string }[]> = {
  intake_checks: [{ parent: 'events', column: 'event_id' }],
  vet_calls: [{ parent: 'events', column: 'event_id' }],
  vet_appointments: [{ parent: 'vet_visits', column: 'vet_visit_id' }],
};

/** The plain foreign keys these tests lean on: a 23503 naming the constraint, as Postgres does. */
const mockForeignKeys: Record<string, { parent: string; column: string }[]> = {
  medication_administrations: [{ parent: 'medications', column: 'medication_id' }],
};

function mockServerRefusal(table: string, row: Row): ServerError | null {
  const refused = mockServer.refuse.get(String(row.id));
  if (refused) return refused;
  for (const { parent, column } of mockServer.guarded ? mockGuarded[table] ?? [] : []) {
    if (row[column] != null && !mockServerTable(parent).has(String(row[column]))) {
      return { code: '23514', message: `${table}: ${column} must reference a ${parent} row for the same pet` };
    }
  }
  for (const { parent, column } of mockServer.guarded ? mockForeignKeys[table] ?? [] : []) {
    if (row[column] != null && !mockServerTable(parent).has(String(row[column]))) {
      return { code: '23503', message: fkMessage(table, column) };
    }
  }
  return null;
}

async function mockServerWrite(table: string, payload: Row[]): Promise<ServerAnswer> {
  let answer: ServerAnswer = { data: payload.map((r) => ({ id: String(r.id) })), error: null };
  for (const row of payload) {
    const refused = mockServerRefusal(table, row);
    if (refused) answer = { data: null, error: refused };
  }
  if (!answer.error) for (const row of payload) mockServerTable(table).set(String(row.id), { ...row });
  const gap = payload.length === 1 ? mockServer.inGap.get(table) : undefined;
  if (gap) {
    mockServer.inGap.delete(table);
    await gap();
  }
  return answer;
}

/** A pull: every server row of the table, whatever the range or watermark asks. */
function mockServerSelect(table: string) {
  const answer = () => Promise.resolve({ data: [...mockServerTable(table).values()], error: null });
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'range', 'gte', 'eq', 'in', 'is', 'gt', 'lt', 'lte', 'limit']) {
    chain[m] = () => chain;
  }
  chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => answer().then(ok, bad);
  return chain;
}

function mockServerFrom(table: string) {
  const write = (payload: Row | Row[]) => ({
    select: () => mockServerWrite(table, Array.isArray(payload) ? payload : [payload]),
  });
  return {
    ...mockServerSelect(table),
    upsert: write,
    insert: write,
    update: () => ({ eq: async () => ({ error: null }) }),
    // syncNow's stale-capture sweep; nothing here holds one.
    delete: () => mockServerSelect('__nothing'),
  };
}

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
      const rows = db().prepare(sql).all(...(params as never[]));
      for (const [prefix, hook] of mockAfterRead) {
        if (sql.trimStart().startsWith(prefix)) {
          mockAfterRead.delete(prefix);
          hook();
        }
      }
      return rows;
    },
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      db().prepare(sql).get(...(params as never[])) ?? null,
    execAsync: async (sql: string) => {
      db().exec(sql);
    },
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  };
}

jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => mockAdapter() }));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table: string) => mockServerFrom(table),
    rpc: async () => ({ data: null, error: null }),
    functions: { invoke: (...args: unknown[]) => mockInvoke.fn(...args) },
  },
}));
jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
jest.mock('./coldStart', () => ({ markRecordHydrated: jest.fn(async () => undefined) }));
jest.mock('./readCopy', () => ({
  pullReadCopies: jest.fn(async () => undefined),
  pullReadCopyFor: jest.fn(async () => undefined),
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import {
  PARENT_GATED_QUEUES,
  PARENT_LINKS,
  REARM_LINKS,
  REARM_ONLY_LINKS,
  pushGuardColumn,
  type ParentLink,
} from './syncQueue';
import {
  __resetChildRearmStateForTests,
  hydrateFromCloud,
  syncNow,
  syncPendingCareAcknowledgements,
  syncPendingDietTrials,
  syncPendingEvents,
  syncPendingIncidentFloors,
  syncPendingIntakeChecks,
  syncPendingMedicationAdministrations,
  syncPendingMedications,
  syncPendingVetAppointments,
  syncPendingVetCalls,
  syncPendingVetVisits,
} from './sync';

const PET = 'pet-1';
const T0 = '2026-10-18T08:00:00.000Z';
const T1 = '2026-10-18T09:00:00.000Z';
const T2 = '2026-10-18T10:00:00.000Z';
const REFUSED: ServerError = { code: '22P02', message: 'invalid input value for enum' };
const REFUSAL_TEXT = `${REFUSED.code}: ${REFUSED.message}`;

/** Each parent's own drain: how a parent lands. A link whose parent is missing here fails
 *  the coverage test below, so a new gate cannot arrive without a landing to re-arm it. */
const PARENT_DRAINS: Record<string, () => Promise<void>> = {
  events: syncPendingEvents,
  vet_visits: syncPendingVetVisits,
  medications: syncPendingMedications,
  diet_trials: syncPendingDietTrials,
  vet_calls: syncPendingVetCalls,
  care_acknowledgements: syncPendingCareAcknowledgements,
};

/** Insert a row, filling every required column the caller did not name. */
function insert(table: string, values: Row): void {
  const db = mockLocal.db!;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string; type: string; notnull: number; dflt_value: unknown;
  }[];
  const row: Row = {};
  for (const c of cols) {
    if (c.notnull && c.dflt_value === null) row[c.name] = /INT|REAL|NUM/i.test(c.type) ? 0 : `${c.name}-x`;
  }
  for (const c of cols) if (c.name === 'created_at' || c.name === 'updated_at') row[c.name] = T0;
  for (const c of cols) if (c.name === 'pet_id') row[c.name] = PET;
  Object.assign(row, values);
  const keys = Object.keys(row).filter((k) => cols.some((c) => c.name === k));
  db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(
    ...keys.map((k) => row[k] as never),
  );
}

const localRow = (table: string, id: string) =>
  mockLocal.db!.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row;
const hasColumn = (table: string, column: string) =>
  (mockLocal.db!.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);

/** Let the fire-and-forget drains a landing starts (sendWhatWaitedOnVisits, the trial's
 *  foods) finish before the test reads the store. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

/** What a parked child carries for this link: the refusal its missing parent explains. */
function parentCausedError(link: ParentLink): { sync_error: string; sync_attempts: number } {
  if (link.child === 'incident_floor_queue') {
    return { sync_error: 'refloor-404: Event not found (unsent after 25 attempts)', sync_attempts: 25 };
  }
  // An ungated child meets the plain foreign key, budgeted, and parks when the budget runs out.
  if (REARM_ONLY_LINKS.includes(link)) {
    return { sync_error: `23503: ${fkMessage(link.child, link.column)} (unsent after 25 attempts)`, sync_attempts: 25 };
  }
  return { sync_error: `23514: ${link.child}: ${link.column} must reference a ${link.parent} row for the same pet`, sync_attempts: 0 };
}

/** The owner fixes a refused parent: the write-path contract clears its error, and an LWW
 *  row's version moves. An insert-only parent cannot be edited; it leaves its refusal when its
 *  own parent lands and re-arms it, which reads the same here. */
function fixParent(table: string, id: string): void {
  const moves = pushGuardColumn(table) === 'updated_at' ? ', updated_at = ?' : '';
  mockLocal.db!.prepare(
    `UPDATE ${table} SET synced = 0, sync_attempts = 0, sync_error = NULL${moves} WHERE id = ?`,
  ).run(...((moves ? [T2, id] : [id]) as never[]));
}

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
  mockServer.rows.clear();
  mockServer.refuse.clear();
  mockServer.inGap.clear();
  mockServer.guarded = false;
  mockAfterRead.clear();
  mockInvoke.fn = mockInvokeOk;
  __resetChildRearmStateForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  await settle();
  jest.restoreAllMocks();
  mockLocal.db?.close();
  mockLocal.db = null;
});

it('every link a child can be refused through has a parent drain that lands it', () => {
  const missing = REARM_LINKS.filter((l) => !PARENT_DRAINS[l.parent]).map((l) => `${l.child}.${l.column}`);
  expect(missing).toEqual([]);
  // The instances CUL-2032 and CUL-2046 list, so the derivation cannot quietly drop one.
  const named = REARM_LINKS.map((l) => `${l.child}.${l.column}→${l.parent}`);
  expect(named).toEqual(expect.arrayContaining([
    'intake_checks.event_id→events',
    'vet_calls.event_id→events',
    'vet_calls.supersedes→vet_calls',
    'vet_call_follow_ups.event_id→events',
    'vet_call_follow_ups.vet_call_id→vet_calls',
    'incident_floor_queue.event_id→events',
    'care_acknowledgements.diet_trial_id→diet_trials',
    'care_acknowledgements.medication_id→medications',
    'care_acknowledgements.retracts→care_acknowledgements',
    'diet_trial_foods.diet_trial_id→diet_trials',
    'vet_appointments.vet_visit_id→vet_visits',
    'medications.vet_visit_id→vet_visits',
    'diet_trials.vet_visit_id→vet_visits',
    'vet_documents.vet_visit_id→vet_visits',
    'care_acknowledgements.vet_visit_id→vet_visits',
    'meals.event_id→events',
    'weight_checks.event_id→events',
    'looks.event_id→events',
    'medication_administrations.medication_id→medications',
    'medication_administrations.event_id→events',
    'medication_administrations.paired_event_id→events',
    'event_attachments.event_id→events',
    'vet_visit_attachments.vet_visit_id→vet_visits',
  ]));
});

it('the ungated children are re-armed only: never held, never parked on a refused parent', () => {
  const ungated = [...new Set(REARM_ONLY_LINKS.map((l) => l.child))];
  // The push gate and the parking context read PARENT_LINKS; none of these is in either.
  expect(ungated.filter((c) => c in PARENT_GATED_QUEUES)).toEqual([]);
  expect(PARENT_LINKS.filter((l) => ungated.includes(l.child))).toEqual([]);
});

describe.each(REARM_LINKS.map((l) => [`${l.child}.${l.column} → ${l.parent}`, l] as const))(
  '%s',
  (_name, link) => {
    // A dose is its own log's child, one per log (a local foreign key, unique).
    const ownLog = (id: string): Row => {
      if (link.child !== 'medication_administrations' || link.column === 'event_id') return {};
      insert('events', { id: `ev-${id}`, event_type: 'medication', synced: 1 });
      return { event_id: `ev-${id}` };
    };
    const child = (id: string, parentId: string, values: Row) =>
      insert(link.child, { id, ...ownLog(id), [link.column]: parentId, synced: 0, ...values });

    // Each child behind its own parent: meals, weigh-ins, looks and a trial's foods hold one
    // row per parent. `p-own` lands beside `p-fixed`, so its child's fault is its own.
    beforeEach(() => {
      for (const id of ['p-fixed', 'p-own', 'p-still']) insert(link.parent, { id, synced: 0, sync_error: REFUSAL_TEXT });
      child('c-fixed', 'p-fixed', { ...parentCausedError(link), updated_at: T1 });
      child('c-own', 'p-own', { sync_error: '42501: new row violates row-level security policy', sync_attempts: 25 });
      child('c-still', 'p-still', parentCausedError(link));
    });

    it('a parent that lands gives the child it explains a fresh try, and nothing else', async () => {
      fixParent(link.parent, 'p-fixed');
      fixParent(link.parent, 'p-own');
      await PARENT_DRAINS[link.parent]();
      await settle();
      expect(localRow(link.parent, 'p-fixed')).toMatchObject({ synced: 1 });
      expect(localRow(link.parent, 'p-own')).toMatchObject({ synced: 1 });
      const fixed = localRow(link.child, 'c-fixed');
      // Re-armed: it either waits for its drain with a clean budget or has already gone up
      // behind its parent. Never parked.
      expect(fixed.sync_error).toBeNull();
      if (fixed.synced === 0) expect(fixed.sync_attempts).toBe(0);
      // Re-armed, not rewritten: the version markSynced compares is still the owner's.
      if (hasColumn(link.child, 'updated_at') && fixed.synced === 0) expect(fixed.updated_at).toBe(T1);
      // A fault of its own stays parked.
      expect(localRow(link.child, 'c-own')).toMatchObject({ sync_attempts: 25 });
      expect(String(localRow(link.child, 'c-own').sync_error)).toMatch(/^42501/);
      // Another parent's child, whose parent is still refused, stays parked.
      expect(localRow(link.child, 'c-still').sync_error).toBe(parentCausedError(link).sync_error);
    });

    // The other-device half, for every parent a pull can bring (an insert-only parent is
    // minted on this phone, so no other device can land it).
    if (['events', 'vet_visits', 'medications', 'diet_trials'].includes(link.parent)) {
      it('another device lands the fixed parent: the pull re-arms the child, the local parent stays refused', async () => {
        for (const id of ['p-fixed', 'p-own']) {
          mockServerTable(link.parent).set(id, { id, pet_id: PET, created_at: T0, updated_at: T2 });
        }
        await hydrateFromCloud();
        // Hydration never rewrites a row at synced = 0, so this phone's copy stays refused.
        expect(localRow(link.parent, 'p-fixed')).toMatchObject({ synced: 0, sync_error: REFUSAL_TEXT });
        expect(localRow(link.child, 'c-fixed')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });
        expect(String(localRow(link.child, 'c-own').sync_error)).toMatch(/^42501/);
        expect(localRow(link.child, 'c-still').sync_error).toBe(parentCausedError(link).sync_error);
      });
    }
  },
);

describe('the answer to "Has she eaten?" under a vomit, end to end', () => {
  beforeEach(() => {
    mockServer.guarded = true;
  });
  const answer = () => insert('intake_checks', {
    id: 'ic1', event_id: 'e1', synced: 0, sync_error: null, updated_at: T1,
  });

  it('refused behind a log the server never saw, then sent again and landed once the log is fixed and lands', async () => {
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    answer();
    await syncPendingIntakeChecks();
    expect(String(localRow('intake_checks', 'ic1').sync_error)).toMatch(/^23514/);
    // Parked: the next drain asks the server nothing.
    await syncPendingIntakeChecks();
    expect(mockServerTable('intake_checks').has('ic1')).toBe(false);

    fixParent('events', 'e1');
    await syncPendingEvents();
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0, updated_at: T1 });
    await syncPendingIntakeChecks();
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 1 });
    expect(mockServerTable('intake_checks').has('ic1')).toBe(true);
  });

  it('a refusal the missing log cannot explain is not re-armed', async () => {
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    insert('intake_checks', { id: 'ic1', event_id: 'e1', synced: 0, sync_error: '22P02: invalid input value for enum intake_answer' });
    fixParent('events', 'e1');
    await syncPendingEvents();
    expect(String(localRow('intake_checks', 'ic1').sync_error)).toMatch(/^22P02/);
  });

  it('is not parked when its log is fixed and lands while the refusal is in flight', async () => {
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    answer();
    // A sibling behind a landed log, so the batch is refused and isolates: ic1 then goes alone,
    // and the gap opens on its own answer.
    insert('events', { id: 'e2', event_type: 'vomit', synced: 1 });
    mockServerTable('events').set('e2', { id: 'e2' });
    insert('intake_checks', { id: 'ic2', event_id: 'e2', synced: 0, sync_error: null });
    mockServer.inGap.set('intake_checks', async () => {
      fixParent('events', 'e1');
      await syncPendingEvents();
    });
    await syncPendingIntakeChecks();
    expect(localRow('events', 'e1')).toMatchObject({ synced: 1 });
    // The ordinary budget, not a quarantine, and the next drain lands it.
    // Re-armed with a clean budget, never parked, and the next drain lands it.
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });
    await syncPendingIntakeChecks();
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 1 });
  });

  it('is not parked when its log is fixed after the queue read and lands while the answer is in flight', async () => {
    // Adversarial pass 1 (A): the fix lands between the queue read and the parent snapshot,
    // so the snapshot sees no refused log; the log then lands in the answer's write gap, and
    // its re-arm cannot see a row still in flight. The mark taken before the read catches it.
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    answer();
    insert('events', { id: 'e2', event_type: 'vomit', synced: 1 });
    mockServerTable('events').set('e2', { id: 'e2' });
    insert('intake_checks', { id: 'ic2', event_id: 'e2', synced: 0, sync_error: null });
    mockAfterRead.set('SELECT * FROM intake_checks', () => fixParent('events', 'e1'));
    mockServer.inGap.set('intake_checks', async () => {
      await syncPendingEvents();
    });
    await syncPendingIntakeChecks();
    expect(localRow('events', 'e1')).toMatchObject({ synced: 1 });
    // Re-armed with a clean budget, never parked, and the next drain lands it.
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });
    await syncPendingIntakeChecks();
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 1 });
  });

  it('a 23514 behind a log that is not refused here is still terminal', async () => {
    // The log reads landed on this phone, so nothing explains the refusal but the row.
    insert('events', { id: 'e1', event_type: 'vomit', synced: 1 });
    answer();
    await syncPendingIntakeChecks();
    expect(String(localRow('intake_checks', 'ic1').sync_error)).toMatch(/^23514/);
  });
});

describe('a Refused dose behind a refused course, end to end (CUL-2046)', () => {
  beforeEach(() => {
    mockServer.guarded = true;
    // The dose's own log is on the server; only its course is missing.
    insert('events', { id: 'ev-d1', event_type: 'medication', synced: 1 });
    mockServerTable('events').set('ev-d1', { id: 'ev-d1' });
  });
  const refusedDose = (attempts: number) => insert('medication_administrations', {
    id: 'd1', event_id: 'ev-d1', medication_id: 'm1', adherence: 'refused',
    synced: 0, sync_error: null, sync_attempts: attempts, updated_at: T1,
  });

  it('parks after its budget, then is sent again and lands once the course is fixed and lands', async () => {
    insert('medications', { id: 'm1', synced: 0, sync_error: REFUSAL_TEXT });
    refusedDose(24);
    await syncPendingMedicationAdministrations();
    expect(String(localRow('medication_administrations', 'd1').sync_error)).toMatch(/^23503: .*medication_id/);
    // Parked: the next drain asks the server nothing.
    await syncPendingMedicationAdministrations();
    expect(mockServerTable('medication_administrations').has('d1')).toBe(false);

    fixParent('medications', 'm1');
    await syncPendingMedications();
    // Re-armed, not rewritten: the Refused rating and its version are still the owner's.
    expect(localRow('medication_administrations', 'd1')).toMatchObject({
      synced: 0, sync_error: null, sync_attempts: 0, updated_at: T1, adherence: 'refused',
    });
    await syncPendingMedicationAdministrations();
    expect(localRow('medication_administrations', 'd1')).toMatchObject({ synced: 1 });
    expect(mockServerTable('medication_administrations').get('d1')).toMatchObject({ adherence: 'refused' });
  });

  it('is never held for its course: behind a course still waiting to land, it goes up and spends its own attempt', async () => {
    insert('medications', { id: 'm1', synced: 0, sync_error: null });
    refusedDose(0);
    await syncPendingMedicationAdministrations();
    expect(localRow('medication_administrations', 'd1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 1 });
  });

  it('a dose an earlier build parked under a course that has since landed is sent on the next sync', async () => {
    insert('medications', { id: 'm1', synced: 1 });
    mockServerTable('medications').set('m1', { id: 'm1' });
    insert('medication_administrations', {
      id: 'd1', event_id: 'ev-d1', medication_id: 'm1', adherence: 'refused', synced: 0, sync_attempts: 25,
      sync_error: `23503: ${fkMessage('medication_administrations', 'medication_id')} (unsent after 25 attempts)`,
    });
    await syncNow();
    expect(localRow('medication_administrations', 'd1')).toMatchObject({ synced: 1 });
  });
});

describe('the race on the other shapes of child', () => {
  beforeEach(() => {
    mockServer.guarded = true;
  });
  it('an "I\'ve called" (insert-only, no version) is not parked when its log lands while the refusal is in flight', async () => {
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    insert('vet_calls', { id: 'call1', event_id: 'e1', supersedes: null, synced: 0, sync_error: null });
    mockServer.inGap.set('vet_calls', async () => {
      fixParent('events', 'e1');
      await syncPendingEvents();
      // Stop the drain's own re-select from landing it in this run, so the budget is visible.
      mockServer.refuse.set('call1', { message: 'network down' });
    });
    await syncPendingVetCalls();
    expect(localRow('vet_calls', 'call1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });
    mockServer.refuse.clear();
    await syncPendingVetCalls();
    expect(localRow('vet_calls', 'call1')).toMatchObject({ synced: 1 });
  });

  it('an "I\'ve called" behind a log that stays refused is parked on the first try', async () => {
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    insert('vet_calls', { id: 'call1', event_id: 'e1', supersedes: null, synced: 0, sync_error: null });
    await syncPendingVetCalls();
    expect(String(localRow('vet_calls', 'call1').sync_error)).toMatch(/^23514/);
  });

  it('an appointment is not parked when its visit lands and is refused again on a newer edit while the refusal is in flight', async () => {
    insert('vet_visits', { id: 'v1', synced: 0, sync_error: REFUSAL_TEXT });
    insert('vet_appointments', { id: 'a1', vet_visit_id: 'v1', questions: null, synced: 0, sync_error: null });
    // A sibling naming no visit, so the batch is refused and isolates, and the gap opens on a1's own answer.
    insert('vet_appointments', { id: 'a2', vet_visit_id: null, questions: null, synced: 0, sync_error: null });
    mockServer.inGap.set('vet_appointments', async () => {
      fixParent('vet_visits', 'v1');
      await syncPendingVetVisits(); // the fix lands
      mockLocal.db!.prepare(`UPDATE vet_visits SET updated_at = ?, synced = 0 WHERE id = 'v1'`).run(T1 + 'x');
      mockServer.refuse.set('v1', REFUSED);
      await syncPendingVetVisits(); // the next edit is refused
    });
    await syncPendingVetAppointments();
    await settle();
    // The refused version is not the one the queue read saw: not parked here.
    const a = localRow('vet_appointments', 'a1');
    expect(a.sync_error).toBeNull();
    await syncPendingVetAppointments();
    expect(localRow('vet_appointments', 'a1')).toMatchObject({ synced: 1 });
  });
});

describe('the re-arm is bounded and catches what an earlier build left parked', () => {
  beforeEach(() => {
    mockServer.guarded = true;
  });

  it('a pull that re-reads the same server version re-arms once, not every cycle (adversarial pass 1, B)', async () => {
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    mockServerTable('events').set('e1', { id: 'e1', pet_id: PET, created_at: T0, updated_at: T2 });
    // Its own fault: refused whatever the log does.
    insert('intake_checks', { id: 'ic1', event_id: 'e1', synced: 0, sync_error: '23514: answer out of range' });
    mockServer.refuse.set('ic1', { code: '23514', message: 'answer out of range' });
    await hydrateFromCloud();
    expect(localRow('intake_checks', 'ic1').sync_error).toBeNull();
    await syncPendingIntakeChecks();
    expect(String(localRow('intake_checks', 'ic1').sync_error)).toMatch(/^23514/);
    // The overlap re-reads e1 at the same version: nothing re-armed this time.
    await hydrateFromCloud();
    expect(String(localRow('intake_checks', 'ic1').sync_error)).toMatch(/^23514/);
    // A new server version of e1 (another fix elsewhere) earns one more try.
    mockServerTable('events').get('e1')!.updated_at = '2026-10-18T11:00:00.000Z';
    await hydrateFromCloud();
    expect(localRow('intake_checks', 'ic1').sync_error).toBeNull();
  });

  it('an answer an earlier build parked under a log that has since landed is sent on the next sync (adversarial pass 1, C)', async () => {
    insert('events', { id: 'e1', event_type: 'vomit', synced: 1 });
    mockServerTable('events').set('e1', { id: 'e1' });
    insert('intake_checks', { id: 'ic1', event_id: 'e1', synced: 0, sync_error: '23514: intake_checks: event_id must reference a events row for the same pet' });
    insert('intake_checks', { id: 'ic-own', event_id: 'e1', synced: 0, sync_error: '42501: new row violates row-level security policy' });
    await syncNow();
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 1 });
    expect(String(localRow('intake_checks', 'ic-own').sync_error)).toMatch(/^42501/);
  });
});

describe('a refusal whose parent lands in flight never spends the attempt that parks it (adversarial pass 2)', () => {
  beforeEach(() => {
    mockServer.guarded = true;
  });

  it('R1: a re-check on its last attempt, whose log lands while the 404 is in flight, is sent again', async () => {
    await syncNow(); // this process has already run its once-per-launch sweep
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    insert('incident_floor_queue', { id: 'f1', event_id: 'e1', synced: 0, sync_error: null, sync_attempts: 24 });
    mockInvoke.fn = async () => {
      mockInvoke.fn = mockInvokeOk;
      fixParent('events', 'e1');
      await syncPendingEvents();
      return { data: null, error: Object.assign(new Error('Event not found'), { context: { status: 404 } }) };
    };
    await syncPendingIncidentFloors();
    expect(localRow('events', 'e1')).toMatchObject({ synced: 1 });
    // Re-armed with a clean budget, never parked, and the next run lands it.
    expect(localRow('incident_floor_queue', 'f1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });
    await syncPendingIncidentFloors();
    expect(localRow('incident_floor_queue', 'f1')).toMatchObject({ synced: 1 });
  });

  it('R2: an answer on its last attempt, whose log lands while the refusal is in flight, is not parked', async () => {
    await syncNow();
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    insert('intake_checks', { id: 'ic1', event_id: 'e1', synced: 0, sync_error: null, sync_attempts: 24 });
    insert('events', { id: 'e2', event_type: 'vomit', synced: 1 });
    mockServerTable('events').set('e2', { id: 'e2' });
    insert('intake_checks', { id: 'ic2', event_id: 'e2', synced: 0, sync_error: null });
    mockServer.inGap.set('intake_checks', async () => {
      fixParent('events', 'e1');
      await syncPendingEvents();
    });
    await syncPendingIntakeChecks();
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 0 });
    await syncPendingIntakeChecks();
    expect(localRow('intake_checks', 'ic1')).toMatchObject({ synced: 1 });
  });

  it('a 404 on a re-check whose log has not landed still spends its attempt', async () => {
    insert('events', { id: 'e1', event_type: 'vomit', synced: 0, sync_error: REFUSAL_TEXT });
    insert('incident_floor_queue', { id: 'f1', event_id: 'e1', synced: 0, sync_error: null, sync_attempts: 3 });
    mockInvoke.fn = async () =>
      ({ data: null, error: Object.assign(new Error('Event not found'), { context: { status: 404 } }) });
    await syncPendingIncidentFloors();
    expect(localRow('incident_floor_queue', 'f1')).toMatchObject({ synced: 0, sync_error: null, sync_attempts: 4 });
  });
});
