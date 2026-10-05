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
    // The real expo-sqlite shape: BEGIN, the callback, COMMIT, and ROLLBACK on a throw.
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => {
      mockDb.exec('BEGIN');
      try {
        await fn();
        mockDb.exec('COMMIT');
      } catch (e) {
        mockDb.exec('ROLLBACK');
        throw e;
      }
    }),
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
import { readDueFollowUp } from './vetCallReads';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CALL_NOTE_MAX, FOLLOW_UP_DUE_MS, FOLLOW_UP_EXPIRES_MS, callRecordsOf, followUpStateOf } from './vetCallState';

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
function verdict(eventId: string, kind: 'call_today' | 'call_now' | 'calm', replace = false): void {
  if (replace) mockDb.prepare(`DELETE FROM event_ai_verdicts WHERE event_id = ?`).run(eventId);
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

/** A call pulled from another phone, carrying the cover that phone stored at its tap (084). */
function pulledCall(id: string, eventId: string, atMs: number, cover: { rank: 1 | 2; fromMs: number }): void {
  mockDb
    .prepare(
      `INSERT INTO vet_calls
         (id, pet_id, called_on, event_id, note, supersedes, withdrawn, covers_rank, covers_from, created_at, synced)
       VALUES (?, ?, '2026-10-01', ?, NULL, NULL, 0, ?, ?, ?, 1)`,
    )
    .run(id, PET, eventId, cover.rank, new Date(cover.fromMs).toISOString(), new Date(atMs).toISOString());
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
      ['called_on', 'covers_from', 'covers_rank', 'event_id', 'id', 'note', 'pet_id', 'supersedes', 'withdrawn'].sort(),
    );
    expect(mockInserts[0].row.withdrawn).toBe(false);
    // The cover is the bout's first read's, as shown at the tap; made_here stays on the phone.
    expect(mockInserts[0].row).toMatchObject({ covers_rank: 1, covers_from: new Date(T0).toISOString() });
    expect(Object.keys(mockInserts[1].row).sort()).toEqual(
      ['answer', 'due_at', 'event_id', 'expires_at', 'id', 'pet_id', 'reason', 'status', 'vet_call_id', 'worth_it'].sort(),
    );
    expect(rows('vet_calls').every((r) => r.synced === 1)).toBe(true);
    expect(rows('vet_call_follow_ups').every((r) => r.synced === 1)).toBe(true);
  });

  it('pushes the cover on the call only: a note edit and an Undo carry none (084\'s CHECK)', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    const callId = await recordCall('v1', { now: T0, newId });
    await saveCallNote(callId, 'She said to bring him in', { now: T0 + H, newId });
    await undoCall(callId, { now: T0 + 2 * H, newId });
    await pushVetCalls();
    const calls = mockInserts.filter((i) => i.table === 'vet_calls').map((i) => i.row);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({ supersedes: null, covers_rank: 1 });
    for (const c of calls.slice(1)) expect(c).toMatchObject({ supersedes: callId, covers_rank: null, covers_from: null });
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

describe('the adversarial pass (2026-10-05)', () => {
  it('P1: a later raise of the called read never stretches the call over a new call-now read', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    event('v2', T0 + 3 * H);
    verdict('v2', 'call_now');
    await recordCall('v1', { now: T0 + H, newId });
    // The 24 h re-floor raises v1 to call now after the call was made.
    verdict('v1', 'call_now', true);
    expect((await readIncidentCallState('v2', T0 + 4 * H)).covering).toBeNull();
    // v1 itself now asks louder than the call was made at: offered again.
    expect((await readIncidentCallState('v1', T0 + 4 * H)).covering).toBeNull();
  });

  it('a pulled call covers exactly its stored cover: never a louder read, never past the bout', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    event('v2', T0 + 2 * H);
    verdict('v2', 'call_now');
    event('v3', T0 + 25 * H);
    verdict('v3', 'call_today');
    pulledCall('remote', 'v1', T0 + H, { rank: 1, fromMs: T0 });
    expect((await readIncidentCallState('v1', T0 + 3 * H)).covering?.call.id).toBe('remote');
    // Louder than the cover: its own escalation, offered here.
    expect((await readIncidentCallState('v2', T0 + 3 * H)).covering).toBeNull();
    // Past the cover's 24 hours: offered.
    expect((await readIncidentCallState('v3', T0 + 26 * H)).covering).toBeNull();
    // The cover never moves with the anchor's tier: a raise of v1 leaves the call where it was.
    verdict('v1', 'call_now', true);
    expect((await readIncidentCallState('v1', T0 + 4 * H)).covering).toBeNull();
    verdict('v1', 'call_today', true);
    expect((await readIncidentCallState('v1', T0 + 4 * H)).covering?.call.id).toBe('remote');
  });

  it('calls share a question only when their stored covers are identical (ruling A)', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    pulledCall('a', 'v1', T0 + H, { rank: 1, fromMs: T0 });
    pulledCall('e', 'v1', T0 + 2 * H, { rank: 1, fromMs: T0 });
    pulledCall('b', 'v1', T0 + 21 * H, { rank: 1, fromMs: T0 + 20 * H });
    pulledCall('d', 'v1', T0 + 3 * H, { rank: 2, fromMs: T0 });
    const groups = (await readCallsForPet(PET, T0 + 42 * H)).map((v) => v.memberIds.sort()).sort();
    // e stored a's exact cover: one question. b starts 20 h later and d is louder: each
    // asks its own, however near.
    expect(groups).toEqual([['a', 'e'], ['b'], ['d']]);
  });
  it('a call whose root carries no cover covers nothing, and is still listed', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    mockDb
      .prepare(
        `INSERT INTO vet_calls (id, pet_id, called_on, event_id, note, supersedes, withdrawn, created_at, synced)
         VALUES ('bare', ?, '2026-10-01', 'v1', NULL, NULL, 0, ?, 1)`,
      )
      .run(PET, new Date(T0 + H).toISOString());
    expect((await readIncidentCallState('v1', T0 + 2 * H)).covering).toBeNull();
    expect((await readCallsForPet(PET, T0 + 2 * H)).map((v) => [v.call.id, v.rank])).toEqual([['bare', null]]);
  });

  it('P2: the anchor is the tapped read\'s own bout, walked forward, never the bout before', async () => {
    for (const [id, h] of [['r1', 0], ['r2', 20], ['r3', 30], ['r4', 50]] as const) {
      event(id, T0 + h * H);
      verdict(id, 'call_today');
    }
    await recordCall('r3', { now: T0 + 31 * H, newId });
    // r3 opens bout 2 (30 h after r1), so the call anchors on r3 and covers r4 (20 h later).
    expect(rows('vet_calls')[0].event_id).toBe('r3');
    expect((await readIncidentCallState('r4', T0 + 51 * H)).covering).not.toBeNull();
    expect((await readIncidentCallState('r2', T0 + 51 * H)).covering).toBeNull();
  });

  it('P3: a soft-deleted anchor still bounds its bout', async () => {
    event('a', T0);
    verdict('a', 'call_today');
    event('b', T0 + 2 * H);
    verdict('b', 'call_today');
    await recordCall('a', { now: T0 + H, newId });
    mockDb.prepare(`UPDATE events SET deleted_at = ? WHERE id = 'a'`).run(new Date(T0 + 3 * H).toISOString());
    expect((await readIncidentCallState('b', T0 + 4 * H)).covering).not.toBeNull();
    expect(await recordCall('b', { now: T0 + 4 * H, newId })).toBe(rows('vet_calls')[0].id);
    expect(rows('vet_calls')).toHaveLength(1);
  });

  it('P4: two phones calling one bout are one escalation, and an answer to either is never re-asked', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    const mine = await recordCall('v1', { now: T0, newId });
    // The other phone's call and owed row, pulled.
    pulledCall('theirs', 'v1', T0 + 1000, { rank: 1, fromMs: T0 });
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, due_at, expires_at, created_at, synced)
         VALUES ('theirs-owed', ?, 'theirs', 'v1', 'called', 'owed', ?, ?, ?, 1)`,
      )
      .run(PET, new Date(T0 + 48 * H).toISOString(), new Date(T0 + 7 * 24 * H).toISOString(), new Date(T0).toISOString());
    expect(await readCallsForPet(PET, T0 + 50 * H)).toHaveLength(1);
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, answer, due_at, expires_at, created_at, synced)
         VALUES ('theirs-ans', ?, 'theirs', 'v1', 'called', 'answered', 'keep_watching', ?, ?, ?, 1)`,
      )
      .run(PET, new Date(T0 + 48 * H).toISOString(), new Date(T0 + 7 * 24 * H).toISOString(), new Date(T0 + 49 * H).toISOString());
    const views = await readCallsForPet(PET, T0 + 50 * H);
    expect(views).toHaveLength(1);
    expect(views[0].followUp.kind).toBe('answered');
    expect((await readCall(mine, T0 + 50 * H))?.followUp.kind).toBe('answered');
  });

  it('P5: an Undo racing an answer from another phone never takes the answer off the record', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    const callId = await recordCall('v1', { now: T0, newId });
    await undoCall(callId, { now: T0 + 50 * H, newId });
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, answer, due_at, expires_at, created_at, synced)
         VALUES ('other-ans', ?, ?, 'v1', 'called', 'answered', 'wants_to_see', ?, ?, ?, 1)`,
      )
      .run(PET, callId, new Date(T0 + 48 * H).toISOString(), new Date(T0 + 7 * 24 * H).toISOString(), new Date(T0 + 49 * H).toISOString());
    const views = await readCallsForPet(PET, T0 + 51 * H);
    expect(views.map((v) => v.followUp.kind)).toEqual(['answered']);
    expect((await readIncidentCallState('v1', T0 + 51 * H)).covering?.call.id).toBe(callId);
  });

  it('refuses to take back an answered call on this phone', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    const callId = await recordCall('v1', { now: T0, newId });
    await answerFollowUp(callId, 'keep_watching', null, { now: T0 + 50 * H, newId });
    await expect(undoCall(callId, { now: T0 + 51 * H, newId })).rejects.toThrow(/answered/);
  });

  it('writes the call and its owed row together, or neither', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    // A ledger id that collides with an existing row makes the second insert fail.
    let n = 0;
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, due_at, expires_at, created_at, synced)
         VALUES ('dup', ?, NULL, 'v1', 'sampled', 'owed', 'x', 'y', 'z', 1)`,
      )
      .run(PET);
    await expect(recordCall('v1', { now: T0, newId: () => (++n === 1 ? 'call-x' : 'dup') })).rejects.toThrow();
    expect(rows('vet_calls')).toHaveLength(0);
  });
});

describe('the second adversarial pass (2026-10-05)', () => {
  const pulled = (id: string, eventId: string, atMs: number) =>
    pulledCall(id, eventId, atMs, { rank: 2, fromMs: T0 });
  const pulledLedger = (id: string, callId: string, eventId: string, status: string, answer: string | null, atMs: number) =>
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, answer, due_at, expires_at, created_at, synced)
         VALUES (?, ?, ?, ?, 'called', ?, ?, ?, ?, ?, 1)`,
      )
      .run(id, PET, callId, eventId, status, answer, new Date(T0 + 48 * H).toISOString(), new Date(T0 + 7 * 24 * H).toISOString(), new Date(atMs).toISOString());

  it('1: a raise, then a louder read, then a tap: the new call covers it and owes its own question', async () => {
    event('e1', T0);
    verdict('e1', 'call_today');
    const c1 = await recordCall('e1', { now: T0 + H, newId });
    verdict('e1', 'call_now', true);
    event('e2', T0 + 3 * H);
    verdict('e2', 'call_now');
    expect((await readIncidentCallState('e2', T0 + 4 * H)).covering).toBeNull();
    const c2 = await recordCall('e2', { now: T0 + 4 * H, newId });
    expect(c2).not.toBe(c1);
    expect((await readIncidentCallState('e2', T0 + 5 * H)).covering?.call.id).toBe(c2);
    // A second tap is the same call, never a third.
    expect(await recordCall('e2', { now: T0 + 5 * H, newId })).toBe(c2);
    // Answering the call-today call does not answer the call-now escalation.
    await answerFollowUp(c1, 'keep_watching', null, { now: T0 + 50 * H, newId });
    const views = await readCallsForPet(PET, T0 + 52 * H);
    expect(views.map((v) => [v.call.id, v.followUp.kind]).sort()).toEqual([[c1, 'answered'], [c2, 'due']].sort());
  });

  it('2: an answered call-now call pulled from another phone is never offered again', async () => {
    event('e1', T0);
    verdict('e1', 'call_now');
    pulled('remote', 'e1', T0 + H);
    pulledLedger('remote-owed', 'remote', 'e1', 'owed', null, T0 + H);
    pulledLedger('remote-ans', 'remote', 'e1', 'answered', 'wants_to_see', T0 + 49 * H);
    const s = await readIncidentCallState('e1', T0 + 50 * H);
    expect(s.covering?.followUp.kind).toBe('answered');
  });

  it('3: two phones on one call-now read are one escalation, whichever id sorts first', async () => {
    for (const remoteId of ['aaa', 'zzz']) {
      mockDb.exec('DELETE FROM vet_calls; DELETE FROM vet_call_follow_ups; DELETE FROM events; DELETE FROM event_ai_verdicts;');
      event('e1', T0);
      verdict('e1', 'call_now');
      pulled(remoteId, 'e1', T0 + H);
      pulledLedger(`${remoteId}-owed`, remoteId, 'e1', 'owed', null, T0 + H);
      const mine = await recordCall('e1', { now: T0 + 2 * H, newId });
      expect(mine).toBe(remoteId); // already covered: no second call
      expect(await readCallsForPet(PET, T0 + 50 * H)).toHaveLength(1);
    }
  });

  it('6: a soft-deleted first read does not start the next tap\'s bout; the new call asks its own question', async () => {
    event('e0', T0);
    verdict('e0', 'call_today');
    event('e1', T0 + 10 * H);
    verdict('e1', 'call_today');
    await recordCall('e0', { now: T0 + H, newId });
    mockDb.prepare(`UPDATE events SET deleted_at = ? WHERE id = 'e0'`).run(new Date(T0 + 11 * H).toISOString());
    event('e2', T0 + 30 * H);
    verdict('e2', 'call_today');
    // The tap walks LIVE reads only (CUL-1604's deleted-anchor call): e0 is gone, so e2's bout
    // starts at e1. e2 is past the first call's stored cover, so it gets its own call.
    const c1 = await recordCall('e2', { now: T0 + 31 * H, newId });
    expect(rows('vet_calls').map((r) => r.event_id)).toEqual(['e0', 'e1']);
    expect(await readCallsForPet(PET, T0 + 80 * H)).toHaveLength(2);
    expect((await readIncidentCallState('e2', T0 + 32 * H)).covering?.call.id).toBe(c1);
  });
});

describe('the third adversarial pass (2026-10-05)', () => {
  const theirs = (answer: string | null, rank: 1 | 2 = 1) => {
    pulledCall('theirs', 'v1', T0 + 2 * H, { rank, fromMs: T0 });
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, due_at, expires_at, created_at, synced)
         VALUES ('theirs-owed', ?, 'theirs', 'v1', 'called', 'owed', ?, ?, ?, 1)`,
      )
      .run(PET, new Date(T0 + 48 * H).toISOString(), new Date(T0 + 7 * 24 * H).toISOString(), new Date(T0 + 2 * H).toISOString());
    if (answer) {
      mockDb
        .prepare(
          `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, answer, due_at, expires_at, created_at, synced)
           VALUES ('theirs-ans', ?, 'theirs', 'v1', 'called', 'answered', ?, ?, ?, ?, 1)`,
        )
        .run(PET, answer, new Date(T0 + 48 * H).toISOString(), new Date(T0 + 7 * 24 * H).toISOString(), new Date(T0 + 49 * H).toISOString());
    }
  };

  it('1: two phones on one escalation stay one after the anchor is raised; the answer is never re-asked', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    await recordCall('v1', { now: T0 + H, newId });
    theirs('keep_watching');
    verdict('v1', 'call_now', true);
    const views = await readCallsForPet(PET, T0 + 50 * H);
    expect(views.map((v) => v.followUp.kind)).toEqual(['answered']);
    expect(views[0].calls).toBe(2);
  });

  it('1b: unanswered, it is still one owed question after the raise', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    await recordCall('v1', { now: T0 + H, newId });
    theirs(null);
    verdict('v1', 'call_now', true);
    expect((await readCallsForPet(PET, T0 + 50 * H)).map((v) => v.followUp.kind)).toEqual(['due']);
  });

  it('4: a pulled, answered call keeps covering its bout when its anchor is re-read lower', async () => {
    event('v1', T0);
    verdict('v1', 'call_now');
    event('v2', T0 + 2 * H);
    verdict('v2', 'call_now');
    theirs('wants_to_see', 2);
    verdict('v1', 'call_today', true);
    expect((await readIncidentCallState('v2', T0 + 50 * H)).covering?.followUp.kind).toBe('answered');
  });
});

describe('the fourth adversarial pass (2026-10-05)', () => {
  it('A: an earlier read whose verdict lands after the call is offered its own call and question', async () => {
    event('e0', T0);
    event('e1', T0 + 2 * H);
    verdict('e1', 'call_today');
    const c = await recordCall('e1', { now: T0 + 3 * H, newId });
    verdict('e0', 'call_today'); // e0's read lands late, before the stored cover's start
    expect((await readIncidentCallState('e0', T0 + 4 * H)).covering).toBeNull();
    const c0 = await recordCall('e0', { now: T0 + 4 * H, newId });
    expect(c0).not.toBe(c);
    // A second tap is the same call, never a third.
    expect(await recordCall('e0', { now: T0 + 5 * H, newId })).toBe(c0);
    expect((await readCallsForPet(PET, T0 + 60 * H)).map((v) => v.memberIds)).toHaveLength(2);
  });
  it('A2: an answered call stays answered when a late earlier read gets its own call', async () => {
    event('e0', T0);
    event('e1', T0 + 2 * H);
    verdict('e1', 'call_today');
    const c = await recordCall('e1', { now: T0 + 3 * H, newId });
    await answerFollowUp(c, 'could_not_reach', null, { now: T0 + 50 * H, newId });
    verdict('e0', 'call_today');
    const c0 = await recordCall('e0', { now: T0 + 51 * H, newId });
    const byId = new Map((await readCallsForPet(PET, T0 + 52 * H)).map((v) => [v.call.id, v.followUp.kind]));
    expect(byId.get(c)).toBe('answered');
    expect(byId.get(c0)).toBe('waiting');
  });
  it('C: one answer answers every call in the escalation, so no phone asks again', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    const mine = await recordCall('v1', { now: T0, newId });
    pulledCall('theirs', 'v1', T0 + H, { rank: 1, fromMs: T0 });
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, due_at, expires_at, created_at, synced)
         VALUES ('theirs-owed', ?, 'theirs', 'v1', 'called', 'owed', ?, ?, ?, 1)`,
      )
      .run(PET, new Date(T0 + 48 * H).toISOString(), new Date(T0 + 7 * 24 * H).toISOString(), new Date(T0 + H).toISOString());
    await answerFollowUp(mine, 'keep_watching', null, { now: T0 + 50 * H, newId });
    const answeredFor = rows('vet_call_follow_ups').filter((r) => r.status === 'answered').map((r) => r.vet_call_id).sort();
    expect(answeredFor).toEqual([mine, 'theirs'].sort());
  });

  it('D: a call shown from another phone is not this phone\'s to take back', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    pulledCall('theirs', 'v1', T0 + H, { rank: 1, fromMs: T0 });
    const v = await readCall('theirs', T0 + 2 * H);
    expect(v?.ownCall).toBe(false);
    // And the writer refuses it, whatever the screen offers.
    await expect(undoCall('theirs', { now: T0 + 3 * H, newId })).rejects.toThrow(/only the phone that made/);
    expect(rows('vet_calls')).toHaveLength(1);
  });
});

describe('the sixth and seventh adversarial passes (2026-10-05, on the stored cover)', () => {
  const owedRow = (id: string, callId: string, eventId: string, calledMs: number) =>
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, due_at, expires_at, created_at, synced)
         VALUES (?, ?, ?, ?, 'called', 'owed', ?, ?, ?, 1)`,
      )
      .run(id, PET, callId, eventId, new Date(calledMs + 48 * H).toISOString(), new Date(calledMs + 7 * 24 * H).toISOString(), new Date(calledMs).toISOString());

  it('R: an answer, once shown, is never un-shown by calls that arrive later', async () => {
    event('e1', T0 + 10 * H);
    verdict('e1', 'call_today');
    const c1 = await recordCall('e1', { now: T0 + 11 * H, newId });
    await answerFollowUp(c1, 'keep_watching', null, { now: T0 + 60 * H, newId });
    // Another phone's call, made without e1, pulled after the answer: its own question.
    event('e2', T0 + 30 * H);
    verdict('e2', 'call_today');
    pulledCall('c2', 'e2', T0 + 31 * H, { rank: 1, fromMs: T0 + 30 * H });
    owedRow('c2-owed', 'c2', 'e2', T0 + 31 * H);
    event('e0', T0);
    verdict('e0', 'call_today');
    const c0 = await recordCall('e0', { now: T0 + 91 * H, newId });
    const byId = new Map((await readCallsForPet(PET, T0 + 92 * H)).map((v) => [v.call.id, v.followUp.kind]));
    expect(byId.get(c1)).toBe('answered');
    expect(byId.get('c2')).toBe('due');
    expect(byId.get(c0)).toBe('waiting');
    // c2 can be answered: nothing borrowed c1's answer for it.
    expect(await answerFollowUp('c2', 'wants_to_see', null, { now: T0 + 93 * H, newId })).toBe('saved');
  });

  it('X1: a later call inside a louder, uncalled bout asks its own question (ruling A)', async () => {
    event('a', T0);
    verdict('a', 'call_today');
    const ca = await recordCall('a', { now: T0 + H, newId });
    event('n', T0 + 5 * H);
    verdict('n', 'call_now');
    await answerFollowUp(ca, 'keep_watching', null, { now: T0 + 50 * H, newId });
    event('r', T0 + 26 * H);
    verdict('r', 'call_today');
    expect((await readIncidentCallState('r', T0 + 27 * H)).covering).toBeNull();
    const cx = await recordCall('r', { now: T0 + 27 * H, newId });
    const byId = new Map((await readCallsForPet(PET, T0 + 80 * H)).map((v) => [v.call.id, v.followUp.kind]));
    expect(byId.get(ca)).toBe('answered');
    expect(byId.get(cx)).toBe('due');
    expect(await answerFollowUp(cx, 'wants_to_see', null, { now: T0 + 81 * H, newId })).toBe('saved');
  });
  it('B: a call tapped on a call-today read never silences a call-now read in its bout', async () => {
    event('r1', T0);
    verdict('r1', 'call_now');
    event('r2', T0 + 5 * H);
    verdict('r2', 'call_today');
    await recordCall('r2', { now: T0 + 6 * H, newId });
    expect(rows('vet_calls')[0]).toMatchObject({ event_id: 'r1', covers_rank: 1 });
    expect((await readIncidentCallState('r2', T0 + 7 * H)).covering).not.toBeNull();
    expect((await readIncidentCallState('r1', T0 + 7 * H)).covering).toBeNull();
    event('r3', T0 + 20 * H);
    verdict('r3', 'call_now');
    expect((await readIncidentCallState('r3', T0 + 21 * H)).covering).toBeNull();
  });

  it('K: two phones that stored different ranks for one read each ask their own question', async () => {
    event('v1', T0);
    verdict('v1', 'call_now');
    const a = await recordCall('v1', { now: T0 + H, newId });
    pulledCall('b', 'v1', T0 + H, { rank: 1, fromMs: T0 });
    owedRow('b-owed', 'b', 'v1', T0 + H);
    await answerFollowUp(a, 'wants_to_see', 'yes', { now: T0 + 50 * H, newId });
    const byId = new Map((await readCallsForPet(PET, T0 + 51 * H)).map((v) => [v.call.id, v.followUp.kind]));
    expect(byId.get(a)).toBe('answered');
    expect(byId.get('b')).toBe('due');
  });
  it('a quieter answer never answers a louder call', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    const a = await recordCall('v1', { now: T0 + H, newId });
    pulledCall('b', 'v1', T0 + 2 * H, { rank: 2, fromMs: T0 });
    owedRow('b-owed', 'b', 'v1', T0 + 2 * H);
    await answerFollowUp(a, 'keep_watching', null, { now: T0 + 50 * H, newId });
    const byId = new Map((await readCallsForPet(PET, T0 + 51 * H)).map((v) => [v.call.id, v.followUp.kind]));
    expect(byId.get(a)).toBe('answered');
    expect(byId.get('b')).toBe('due');
  });

  it('every phone holding the same rows shows the same note, whatever the row order', () => {
    const at = new Date(T0).toISOString();
    const root = { id: 'c', pet_id: PET, called_on: '2026-10-01', event_id: 'v', note: null, supersedes: null, withdrawn: 0, covers_rank: 1, covers_from: at, created_at: at };
    const later = new Date(T0 + H).toISOString();
    const e1 = { ...root, id: 'n1', note: 'first', supersedes: 'c', covers_rank: null, covers_from: null, created_at: later };
    const e2 = { ...root, id: 'n2', note: 'second', supersedes: 'c', covers_rank: null, covers_from: null, created_at: later };
    expect(callRecordsOf([root, e1, e2])[0].note).toBe('second');
    expect(callRecordsOf([root, e2, e1])[0].note).toBe('second');
  });

  it('D: every phone holding the same rows shows the same answer', () => {
    const call = callRecordsOf([{
      id: 'c', pet_id: PET, called_on: '2026-10-01', event_id: 'v', note: null, supersedes: null, withdrawn: 0,
      covers_rank: 1, covers_from: new Date(T0).toISOString(), created_at: new Date(T0).toISOString(),
    }])[0];
    const base = { pet_id: PET, vet_call_id: 'c', event_id: 'v', reason: 'called', status: 'answered', worth_it: null, due_at: '', expires_at: '' };
    const same = '2026-10-03T10:11:00.000Z';
    const rowsAB = [
      { ...base, id: 'rb', answer: 'wants_to_see', created_at: same },
      { ...base, id: 'ra', answer: 'keep_watching', created_at: same },
    ];
    const one = followUpStateOf(call, rowsAB, T0 + 100 * H);
    expect(followUpStateOf(call, [...rowsAB].reverse(), T0 + 100 * H)).toEqual(one);
    expect(one).toMatchObject({ kind: 'answered', answer: 'keep_watching' });
  });

  it('D: the pull adopts the server created_at on this phone\'s own rows and changes nothing else', () => {
    const src = readFileSync(join(__dirname, 'sync.ts'), 'utf8');
    for (const table of ['vet_calls', 'vet_call_follow_ups'] as const) {
      const at = src.indexOf(`\`INSERT INTO ${table}\n         (id, pet_id,`);
      expect(at).toBeGreaterThan(-1);
      const sql = src.slice(at + 1, src.indexOf('`', at + 1));
      expect(sql).toMatch(/ON CONFLICT\(id\) DO UPDATE SET created_at = excluded\.created_at/);
      expect(sql).not.toMatch(/SET[^`]*,/);
    }
    event('v1', T0);
    verdict('v1', 'call_today');
    const local = '2026-10-03T10:00:00.000Z';
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, answer, due_at, expires_at, created_at, synced)
         VALUES ('mine', ?, 'c', 'v1', 'called', 'answered', 'keep_watching', 'd', 'e', ?, 0)`,
      )
      .run(PET, local);
    const at = src.indexOf('`INSERT INTO vet_call_follow_ups\n         (id, pet_id, vet_call_id');
    const sql = src.slice(at + 1, src.indexOf('`', at + 1));
    // The server's copy, as pulled: the same row with the server's stamp.
    mockDb.prepare(sql).run('mine', PET, 'c', 'v1', 'called', 'answered', 'wants_to_see', null, 'd', 'e', '2026-10-03T10:30:00+00:00');
    expect(rows('vet_call_follow_ups')[0]).toMatchObject({
      created_at: '2026-10-03T10:30:00+00:00', answer: 'keep_watching', synced: 0,
    });
  });
});

describe('the eighth adversarial pass (2026-10-05, one question per call)', () => {
  const owed = (id: string, callId: string, calledMs: number) =>
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, due_at, expires_at, created_at, synced)
         VALUES (?, ?, ?, 'v1', 'called', 'owed', ?, ?, ?, 1)`,
      )
      .run(id, PET, callId, new Date(calledMs + 48 * H).toISOString(), new Date(calledMs + 7 * 24 * H).toISOString(), new Date(calledMs).toISOString());
  const answer = (id: string, callId: string, ans: string, atMs: number) =>
    mockDb
      .prepare(
        `INSERT INTO vet_call_follow_ups (id, pet_id, vet_call_id, event_id, reason, status, answer, due_at, expires_at, created_at, synced)
         VALUES (?, ?, ?, 'v1', 'called', 'answered', ?, ?, ?, ?, 1)`,
      )
      .run(id, PET, callId, ans, new Date(T0 + 48 * H).toISOString(), new Date(T0 + 7 * 24 * H).toISOString(), new Date(atMs).toISOString());

  it('1: a member whose owed row has not landed never hides the question another member owes', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    // a-C first, so neither row order nor id order can stand in for the rule.
    pulledCall('a-C', 'v1', T0 + H, { rank: 1, fromMs: T0 }); // its owed row still in flight
    pulledCall('z-A', 'v1', T0 + H, { rank: 1, fromMs: T0 });
    owed('z-A-owed', 'z-A', T0 + H);
    const views = await readCallsForPet(PET, T0 + 50 * H);
    expect(views).toHaveLength(1);
    expect(views[0].followUp.kind).toBe('due');
    expect((await readDueFollowUp(PET, T0 + 50 * H))?.memberIds).toEqual(['a-C', 'z-A']);
  });

  it('2: the answer shown is the one recorded first across the group, never a later one by id', async () => {
    event('v1', T0);
    verdict('v1', 'call_today');
    pulledCall('a-C', 'v1', T0 + H, { rank: 1, fromMs: T0 });
    pulledCall('z-A', 'v1', T0 + H, { rank: 1, fromMs: T0 });
    answer('z-A-ans', 'z-A', 'wants_to_see', T0 + 50 * H);
    expect((await readCallsForPet(PET, T0 + 51 * H))[0].followUp).toMatchObject({ answer: 'wants_to_see' });
    answer('a-C-ans', 'a-C', 'keep_watching', T0 + 55 * H);
    expect((await readCallsForPet(PET, T0 + 56 * H))[0].followUp).toMatchObject({ answer: 'wants_to_see' });
  });

  it('3: the incident screen and Home pick the same call whatever order the rows arrived in', async () => {
    const pick = async (order: string[]) => {
      mockDb.exec('DELETE FROM vet_calls; DELETE FROM vet_call_follow_ups; DELETE FROM events; DELETE FROM event_ai_verdicts;');
      event('v1', T0);
      verdict('v1', 'call_today');
      event('v3', T0 + 3 * H);
      verdict('v3', 'call_today');
      for (const id of order) {
        pulledCall(id, 'v1', T0 + H, { rank: 1, fromMs: id === 'A' ? T0 : T0 + 2 * H });
        owed(`${id}-owed`, id, T0 + H);
      }
      answer('A-ans', 'A', 'keep_watching', T0 + 50 * H);
      const s = await readIncidentCallState('v3', T0 + 51 * H);
      const list = (await readCallsForPet(PET, T0 + 51 * H)).map((v) => v.call.id);
      return { covering: s.covering?.call.id, list };
    };
    expect(await pick(['A', 'C'])).toEqual(await pick(['C', 'A']));
  });
});
