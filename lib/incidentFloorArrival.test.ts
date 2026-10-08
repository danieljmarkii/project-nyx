// Engines v3 PR-28b (CUL-1436): the server's re-check answer, said once (spec §8.7, §6 item
// 3), against a REAL database (node:sqlite, C-35) and the real completion register.
//
// Pinned: the most recent raised read of the bout is said, on the card of the log that
// raised it, only while that card is up; a stored tier at or below what the phone already
// showed says nothing; and a tier is recorded as shown only when it was said.

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
}));
jest.mock('./supabase', () => ({ supabase: {} }));

// The server's stored reads, copied to the phone the way the pull would.
let mockServerReads: Record<string, { recommendation: string; tier: string | null }> = {};
jest.mock('./sync', () => ({
  refreshReadCopyOutcome: jest.fn(async (eventId: string) => {
    const r = mockServerReads[eventId];
    if (!r) return 'unchanged';
    mockDb
      .prepare(
        `INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at, tier)
         VALUES (?, 'completed', ?, '2026-10-08T13:00:00.000Z', ?)
         ON CONFLICT(event_id) DO UPDATE SET recommendation = excluded.recommendation, tier = excluded.tier, updated_at = excluded.updated_at`,
      )
      .run(eventId, r.recommendation, r.tier);
    return 'changed';
  }),
}));
// The register's other dependencies, inert here.
jest.mock('./undoLog', () => ({ reverseLoggedEvent: jest.fn() }));
jest.mock('./haptics', () => ({ commitRoutine: jest.fn(), commitSymptom: jest.fn(), destructiveConfirm: jest.fn(), selectChip: jest.fn() }));
jest.mock('./trialContaminant', () => ({ forgetFlaggedFoodInTrial: jest.fn() }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { onFloorLanded } from './incidentFloorArrival';
import { readShownTiers, recordShownTiers } from './incidentTierShown';
import { useMomentStore } from '../store/momentStore';

const PET = 'pet-a';
const live = () => false;
// The register records a shown line fire-and-forget; let that write settle.
const flushWrites = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function seedVomit(id: string, at: string): void {
  mockDb
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, source, occurred_at_source, created_at, updated_at, synced)
       VALUES (?, ?, 'vomit', ?, 'manual', 'manual', ?, ?, 1)`,
    )
    .run(id, PET, at, at, at);
}

function showCardFor(eventId: string): void {
  useMomentStore.getState().showNamed({
    tone: 'calm',
    eventId,
    petId: PET,
    occurredAt: '2026-10-08T12:00:00.000Z',
    record: { kind: 'event', typeLabel: 'Lethargy', confidence: 'witnessed', earliest: null, latest: null },
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockDb = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  mockServerReads = {};
  useMomentStore.getState().hide();
  seedVomit('v1', '2026-10-08T08:00:00.000Z');
  seedVomit('v2', '2026-10-08T10:00:00.000Z');
});
afterEach(() => {
  mockDb.close();
  jest.useRealTimers();
});

const floorLine = () => {
  const p = useMomentStore.getState().payload;
  return p && p.kind === 'named' ? p.floorLine : undefined;
};

it('a re-run that raises two reads of one bout says the most recent, on the raising log’s card', async () => {
  showCardFor('l1');
  mockServerReads = { v1: { recommendation: 'worth_a_call', tier: 'call_now' }, v2: { recommendation: 'worth_a_call', tier: 'call_now' } };
  await onFloorLanded({ triggerEventId: 'l1', petId: PET, eventIds: ['v1', 'v2'], stale: live });
  expect(floorLine()).toEqual({
    eventId: 'v2', vomitAt: '2026-10-08T10:00:00.000Z', tier: 'call_now', self: false, device: false, petId: PET,
    raised: [{ eventId: 'v1', tier: 'call_now' }, { eventId: 'v2', tier: 'call_now' }],
  });
  // Both recorded as said (by the register, as the card took the line), so neither arrives again.
  await flushWrites();
  expect(await readShownTiers(['v1', 'v2'])).toEqual(new Map([['v1', 'call_now'], ['v2', 'call_now']]));
});

it('a stored tier at what the phone already showed says nothing (the preview was the arrival)', async () => {
  showCardFor('l1');
  await recordShownTiers([{ eventId: 'v2', petId: PET, tier: 'call_now', source: 'device' }]);
  mockServerReads = { v2: { recommendation: 'worth_a_call', tier: 'call_now' } };
  await onFloorLanded({ triggerEventId: 'l1', petId: PET, eventIds: ['v2'], stale: live });
  expect(floorLine()).toBeUndefined();
});

it('a stored tier above what the phone showed arrives', async () => {
  showCardFor('l1');
  await recordShownTiers([{ eventId: 'v2', petId: PET, tier: 'call_today', source: 'device' }]);
  mockServerReads = { v2: { recommendation: 'worth_a_call', tier: 'call_now' } };
  await onFloorLanded({ triggerEventId: 'l1', petId: PET, eventIds: ['v2'], stale: live });
  expect(floorLine()).toEqual(expect.objectContaining({ eventId: 'v2', tier: 'call_now' }));
});

it('a quiet stored read says nothing (nothing calm is announced)', async () => {
  showCardFor('l1');
  mockServerReads = { v2: { recommendation: 'not_enough_to_say', tier: 'not_enough_to_say' } };
  await onFloorLanded({ triggerEventId: 'l1', petId: PET, eventIds: ['v2'], stale: live });
  expect(floorLine()).toBeUndefined();
});

it('with no card up for the raising log, nothing is said and nothing is recorded as said', async () => {
  showCardFor('someone-else');
  mockServerReads = { v2: { recommendation: 'worth_a_call', tier: 'call_now' } };
  await onFloorLanded({ triggerEventId: 'l1', petId: PET, eventIds: ['v2'], stale: live });
  expect(floorLine()).toBeUndefined();
  await flushWrites();
  expect(await readShownTiers(['v2'])).toEqual(new Map());
});

it('the card holds while the call is on it (a floor on every later reschedule)', async () => {
  showCardFor('l1');
  mockServerReads = { v2: { recommendation: 'worth_a_call', tier: 'call_now' } };
  await onFloorLanded({ triggerEventId: 'l1', petId: PET, eventIds: ['v2'], stale: live });
  useMomentStore.getState().rescheduleHide(1500);
  jest.advanceTimersByTime(2000);
  expect(useMomentStore.getState().visible).toBe(true);
  jest.advanceTimersByTime(7000);
  expect(useMomentStore.getState().visible).toBe(false);
});

it('a sign-out between the copy and the sentence says nothing', async () => {
  showCardFor('l1');
  mockServerReads = { v2: { recommendation: 'worth_a_call', tier: 'call_now' } };
  await onFloorLanded({ triggerEventId: 'l1', petId: PET, eventIds: ['v2'], stale: () => true });
  expect(floorLine()).toBeUndefined();
});

it('a card already saying call now never drops to a newly raised call today', async () => {
  useMomentStore.getState().showNamed({
    tone: 'calm', eventId: 'l1', petId: PET, occurredAt: '2026-10-08T12:00:00.000Z',
    record: { kind: 'event', typeLabel: 'Lethargy', confidence: 'witnessed', earliest: null, latest: null },
    floorLine: { eventId: 'v1', vomitAt: '2026-10-08T08:00:00.000Z', tier: 'call_now', self: false, device: true, petId: PET, raised: [{ eventId: 'v1', tier: 'call_now' }] },
  });
  mockServerReads = { v2: { recommendation: 'worth_a_call', tier: 'call_today' } };
  await onFloorLanded({ triggerEventId: 'l1', petId: PET, eventIds: ['v2'], stale: live });
  expect(floorLine()).toEqual(expect.objectContaining({ eventId: 'v1', tier: 'call_now' }));
});

it('a card revealed with the phone’s line records it as said; a card never shown records nothing', async () => {
  useMomentStore.getState().showNamed(
    {
      tone: 'calm', eventId: 'l1', petId: PET, occurredAt: '2026-10-08T12:00:00.000Z',
      record: { kind: 'event', typeLabel: 'Lethargy', confidence: 'witnessed', earliest: null, latest: null },
      floorLine: { eventId: 'v1', vomitAt: '2026-10-08T08:00:00.000Z', tier: 'call_now', self: false, device: true, petId: PET, raised: [{ eventId: 'v1', tier: 'call_now' }] },
    },
    { delayMs: 300 },
  );
  await flushWrites();
  expect(await readShownTiers(['v1'])).toEqual(new Map());
  jest.advanceTimersByTime(300);
  await flushWrites();
  expect(await readShownTiers(['v1'])).toEqual(new Map([['v1', 'call_now']]));
});
