// Engines v3 PR-36 (CUL-1419): the call record and its follow-up, written against a REAL
// database (node:sqlite over the app's own schema constants, C-35) and pushed through the
// shipped drains. What is pinned is the spec's acceptance (docs/nyx-care-state-requirements.md
// §11): one follow-up per escalation (AC 10), answered once on any phone, an expired row
// silent, and a push that names only 082's granted columns and waits for its parents.

const { DatabaseSync } = require('node:sqlite');

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}

let mockDb: RawDb;
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).run(...(params as never[]))),
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...(params as never[]))),
    getFirstAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).get(...(params as never[])) ?? null),
  }),
  getWatermark: jest.fn(),
  setWatermark: jest.fn(),
}));

const mockInserts: { table: string; row: Record<string, unknown> }[] = [];
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    from: jest.fn((table: string) => ({
      insert: (row: Record<string, unknown>) => {
        mockInserts.push({ table, row });
        return { select: async () => ({ data: [{ id: row.id as string }], error: null }) };
      },
    })),
  },
}));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import {
  answerFollowUp,
  normalizeCallNote,
  pushVetCalls,
  readCall,
  readCallsForPet,
  readIncidentCallState,
  recordCall,
  saveCallNote,
  undoCall,
} from './vetCalls';
import { CALL_NOTE_MAX, FOLLOW_UP_DUE_MS, FOLLOW_UP_EXPIRES_MS } from './vetCallState';

const PET = 'pet-a';
const H = 60 * 60 * 1000;
const T0 = Date.parse('2026-10-01T15:00:00.000Z');
let ids = 0;
const newId = () => `id-${++ids}`;

function event(id: string, atMs: number, opts: { type?: string; pet?: string; synced?: number } = {}): void {
  mockDb
    .prepare(`INSERT INTO events (id, pet_id, event_type, occurred_at, synced) VALUES (?, ?, ?, ?, ?)`)
    .run(id, opts.pet ?? PET, opts.type ?? 'vomit', new Date(atMs).toISOString(), opts.synced ?? 1);
}

/** The phone's copy of a read. `call_now` is a new-rule row (stamped with the EN-3 key). */
function verdict(eventId: string, kind: 'call_today' | 'call_now' | 'calm'): void {
  const rec = kind === 'calm' ? 'monitor' : 'worth_a_call';
  const tier = kind === 'call_now' ? 'call_now' : null;
  const flags = kind === 'call_now' ? JSON.stringify(['engines_v3_en3']) : null;
  mockDb
    .prepare(
      `INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at, tier, engine_flags)
       VALUES (?, 'completed', ?, ?, ?, ?)`,
    )
    .run(eventId, rec, new Date(T0).toISOString(), tier, flags);
}

function rows(table: string): Record<string, unknown>[] {
  return mockDb.prepare(`SELECT * FROM ${table} ORDER BY created_at, rowid`).all();
}

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  mockInserts.length = 0;
  ids = 0;
});
afterEach(() => mockDb.close());

describe('"I\'ve called"', () => {
  it('writes one call and one owed question, due 48 h and expiring 7 days after the tap', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    const now = T0 + H;
    const callId = await recordCall('v1', { now, newId });

    const calls = rows('vet_calls');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: callId, pet_id: PET, event_id: 'v1', note: null, supersedes: null, withdrawn: 0, synced: 0 });
    const ledger = rows('vet_call_follow_ups');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      vet_call_id: callId, event_id: 'v1', reason: 'called', status: 'owed', answer: null, worth_it: null,
      due_at: new Date(now + FOLLOW_UP_DUE_MS).toISOString(),
      expires_at: new Date(now + FOLLOW_UP_EXPIRES_MS).toISOString(),
    });
  });

  it('refuses a read that does not ask for a call, and a calm one never offers it', async () => {
    event('v1', T0);
    verdict('v1', 'calm');
    expect(await readIncidentCallState('v1')).toEqual({ callTier: false, covering: null });
    await expect(recordCall('v1', { now: T0, newId })).rejects.toThrow(/does not ask for a call/);
    expect(rows('vet_calls')).toHaveLength(0);
  });

  it('offers nothing on an event with no read on this phone, or one that is not an incident', async () => {
    event('v1', T0);
    event('m1', T0, { type: 'meal' });
    expect((await readIncidentCallState('v1')).callTier).toBe(false);
    expect((await readIncidentCallState('m1')).callTier).toBe(false);
  });
});

describe('one follow-up per escalation (§6.1, AC 10)', () => {
  it('three reads of one bout owe one follow-up, whichever read the owner taps', async () => {
    for (const [id, h] of [['v1', 0], ['v2', 6], ['v3', 20]] as const) {
      event(id, T0 + h * H);
      verdict(id, 'call_today');
    }
    // Tapped on the LAST read first: the call attaches to the bout's first read.
    const first = await recordCall('v3', { now: T0 + 21 * H, newId });
    expect(rows('vet_calls')[0].event_id).toBe('v1');
    expect(await recordCall('v1', { now: T0 + 22 * H, newId })).toBe(first);
    expect(await recordCall('v2', { now: T0 + 22 * H, newId })).toBe(first);
    expect(rows('vet_calls')).toHaveLength(1);
    expect(rows('vet_call_follow_ups')).toHaveLength(1);
    for (const id of ['v1', 'v2', 'v3']) {
      expect((await readIncidentCallState(id, T0 + 22 * H)).covering?.call.id).toBe(first);
    }
  });

  it('a bout is bounded from its first read, never chained', async () => {
    // 0 h, 20 h, 40 h: the third is 20 h after the second but 40 h after the first.
    for (const [id, h] of [['v1', 0], ['v2', 20], ['v3', 40]] as const) {
      event(id, T0 + h * H);
      verdict(id, 'call_today');
    }
    const first = await recordCall('v1', { now: T0 + H, newId });
    expect((await readIncidentCallState('v2', T0 + 41 * H)).covering?.call.id).toBe(first);
    expect((await readIncidentCallState('v3', T0 + 41 * H)).covering).toBeNull();
  });

  it('a louder read opens a new bout with its own follow-up', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    event('v2', T0 + 3 * H);
    verdict('v2', 'call_now');
    const first = await recordCall('v1', { now: T0 + H, newId });
    expect((await readIncidentCallState('v2', T0 + 4 * H)).covering).toBeNull();
    const second = await recordCall('v2', { now: T0 + 4 * H, newId });
    expect(second).not.toBe(first);
    expect(rows('vet_call_follow_ups').filter((r) => r.status === 'owed')).toHaveLength(2);
  });

  it('another family and another pet are other escalations', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    event('s1', T0 + H, { type: 'stool' });
    verdict('s1', 'call_today');
    event('b1', T0 + H, { pet: 'pet-b' });
    verdict('b1', 'call_today');
    await recordCall('v1', { now: T0 + H, newId });
    expect((await readIncidentCallState('s1', T0 + 2 * H)).covering).toBeNull();
    expect((await readIncidentCallState('b1', T0 + 2 * H)).covering).toBeNull();
  });
});

describe('Undo, the note, the answer', () => {
  beforeEach(() => {
    event('v1', T0);
    verdict('v1', 'call_today');
  });

  it('Undo writes a withdrawn call and a withdrawn ledger row; nothing is asked or listed', async () => {
    const callId = await recordCall('v1', { now: T0 + H, newId });
    await undoCall(callId, { now: T0 + 2 * H, newId });
    const calls = rows('vet_calls');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ supersedes: callId, withdrawn: 1, event_id: 'v1' });
    expect(rows('vet_call_follow_ups').map((r) => r.status)).toEqual(['owed', 'withdrawn']);
    expect(await readCallsForPet(PET, T0 + 60 * H)).toEqual([]);
    // The read offers "I've called" again: the owner took the call back.
    expect(await readIncidentCallState('v1', T0 + 3 * H)).toEqual({ callTier: true, covering: null });
  });

  it('a note is a new row; the latest stands; an emptied note is none', async () => {
    const callId = await recordCall('v1', { now: T0 + H, newId });
    await saveCallNote(callId, '  She said bring a sample.  ', { now: T0 + 2 * H, newId });
    expect((await readCall(callId, T0 + 3 * H))?.call.note).toBe('She said bring a sample.');
    await saveCallNote(callId, '   ', { now: T0 + 3 * H, newId });
    expect((await readCall(callId, T0 + 4 * H))?.call.note).toBeNull();
    expect(rows('vet_calls')).toHaveLength(3);
    expect(normalizeCallNote('x'.repeat(CALL_NOTE_MAX + 50))).toHaveLength(CALL_NOTE_MAX);
  });

  it('waits, is asked once due, and is silent once expired', async () => {
    const callId = await recordCall('v1', { now: T0, newId });
    expect((await readCall(callId, T0 + 47 * H))?.followUp.kind).toBe('waiting');
    expect((await readCall(callId, T0 + 48 * H))?.followUp.kind).toBe('due');
    expect((await readCall(callId, T0 + 7 * 24 * H))?.followUp.kind).toBe('expired');
    // Expiry is derived, never written (two phones would race an answer).
    expect(rows('vet_call_follow_ups').map((r) => r.status)).toEqual(['owed']);
  });

  it('is answered once; a second answer writes nothing and the first stands', async () => {
    const callId = await recordCall('v1', { now: T0, newId });
    expect(await answerFollowUp(callId, 'wants_to_see', 'yes', { now: T0 + 50 * H, newId })).toBe('saved');
    expect(await answerFollowUp(callId, 'keep_watching', null, { now: T0 + 51 * H, newId })).toBe('already_answered');
    expect((await readCall(callId, T0 + 52 * H))?.followUp).toEqual({ kind: 'answered', answer: 'wants_to_see', worthIt: 'yes' });
    expect(rows('vet_call_follow_ups').map((r) => r.status)).toEqual(['owed', 'answered']);
  });

  it('an answer pulled from another phone is never asked again here', async () => {
    const callId = await recordCall('v1', { now: T0, newId });
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups
           (id, pet_id, vet_call_id, event_id, reason, status, answer, worth_it, due_at, expires_at, created_at, synced)
         SELECT 'other-phone', pet_id, vet_call_id, event_id, reason, 'answered', 'could_not_reach', NULL, due_at, expires_at, ?, 1
           FROM vet_call_follow_ups WHERE vet_call_id = ?`,
      )
      .run(new Date(T0 + 49 * H).toISOString(), callId);
    expect((await readCall(callId, T0 + 50 * H))?.followUp.kind).toBe('answered');
    expect(await answerFollowUp(callId, 'started_treatment', null, { now: T0 + 50 * H, newId })).toBe('already_answered');
  });

  it('may still be answered from the call record after the question expired (mock 4e)', async () => {
    const callId = await recordCall('v1', { now: T0, newId });
    expect(await answerFollowUp(callId, 'something_else', 'did_not_say', { now: T0 + 9 * 24 * H, newId })).toBe('saved');
  });

  it('an undone call cannot be answered', async () => {
    const callId = await recordCall('v1', { now: T0, newId });
    await undoCall(callId, { now: T0 + H, newId });
    await expect(answerFollowUp(callId, 'keep_watching', null, { now: T0 + 50 * H, newId })).rejects.toThrow();
  });
});

describe('the push (082)', () => {
  it('sends only the granted columns, the call before its ledger', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    const callId = await recordCall('v1', { now: T0, newId });
    await answerFollowUp(callId, 'keep_watching', 'no', { now: T0 + 50 * H, newId });
    await pushVetCalls();
    expect(mockInserts.map((i) => i.table)).toEqual(['vet_calls', 'vet_call_follow_ups', 'vet_call_follow_ups']);
    expect(Object.keys(mockInserts[0].row).sort()).toEqual(
      ['called_on', 'event_id', 'id', 'note', 'pet_id', 'supersedes', 'withdrawn'].sort(),
    );
    expect(mockInserts[0].row.withdrawn).toBe(false);
    expect(Object.keys(mockInserts[1].row).sort()).toEqual(
      ['answer', 'due_at', 'event_id', 'expires_at', 'id', 'pet_id', 'reason', 'status', 'vet_call_id', 'worth_it'].sort(),
    );
    expect(rows('vet_calls').every((r) => r.synced === 1)).toBe(true);
    expect(rows('vet_call_follow_ups').every((r) => r.synced === 1)).toBe(true);
  });

  it('holds a call and its ledger while the event it names is still waiting to land', async () => {
    event('v1', T0, { synced: 0 });
    verdict('v1', 'call_today');
    await recordCall('v1', { now: T0, newId });
    await pushVetCalls();
    expect(mockInserts).toEqual([]);
    mockDb.prepare(`UPDATE events SET synced = 1 WHERE id = 'v1'`).run();
    await pushVetCalls();
    expect(mockInserts.map((i) => i.table)).toEqual(['vet_calls', 'vet_call_follow_ups']);
  });
});
