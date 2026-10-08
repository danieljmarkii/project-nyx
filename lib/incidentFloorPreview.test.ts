// Engines v3 PR-28b (CUL-1436): the phone's own floor and the one-arrival rule (spec §8.5,
// §8.7, §6 item 3). The pure halves are driven directly; the write-time preview and the
// raise-only shown record run against a REAL database (node:sqlite, C-35).

import { readFileSync } from 'fs';
import { join } from 'path';

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

// The copy reader's module holds the pull too; nothing here reaches the network.
jest.mock('./supabase', () => ({ supabase: {} }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import {
  boutReads,
  pickBoutArrival,
  previewFloorAfterWrite,
  previewForRead,
  FLOOR_CLAIM_RULE_VERSION,
  REFLOOR_WINDOW_HOURS,
} from './incidentFloorPreview';
import { readShownTiers, recordShownTiers } from './incidentTierShown';
import { FLOOR_READ_HOURS } from './incidentFloor';
import { TIER_RANK } from './incidentTier';
import { usePetStore } from '../store/petStore';

const HOUR = 3_600_000;
const T0 = Date.parse('2026-10-08T12:00:00.000Z');
const at = (h: number) => new Date(T0 + h * HOUR).toISOString();
const PET = 'pet-a';

describe('the constants answer the server’s questions (C-34), pinned to its source', () => {
  const shared = readFileSync(join(__dirname, '..', 'supabase', 'functions', '_shared', 'incident-analysis.ts'), 'utf8');
  const vomit = readFileSync(join(__dirname, '..', 'supabase', 'functions', 'analyze-vomit', 'index.ts'), 'utf8');

  it('the re-floor reach from lethargy or a meal is the server’s', () => {
    expect(shared).toContain(`export const REFLOOR_WINDOW_HOURS = ${REFLOOR_WINDOW_HOURS}\n`);
    // and a vomit reaches the floor's own read window, as the server's does
    expect(shared).toContain('export const REFLOOR_VOMIT_WINDOW_HOURS = FLOOR_READ_HOURS');
  });

  it('the claim’s rule version is the one analyze-vomit stamps', () => {
    expect(vomit).toContain(`ruleVersion: '${FLOOR_CLAIM_RULE_VERSION}',`);
  });
});

describe('boutReads — every vomit the trigger re-checks, with the call the floor gives it', () => {
  const species = 'cat';
  const birthDate = '2020-01-01';

  it('lethargy re-checks vomits within 24 h either side, and raises them to call now (T3)', () => {
    const reads = boutReads({
      trigger: { id: 'l1', type: 'lethargy', at: at(0) },
      vomits: [
        { id: 'before', at: at(-23), confidence: 'witnessed' },
        { id: 'after', at: at(20), confidence: 'witnessed' },
        { id: 'far', at: at(-30), confidence: 'witnessed' },
      ],
      lethargy: [{ id: 'l1', at: at(0) }],
      species,
      birthDate,
    });
    expect(reads.map((r) => [r.eventId, r.tier])).toEqual([
      ['before', 'call_now'],
      ['after', 'call_now'],
    ]);
    expect(reads[0].rowIds).toEqual(expect.arrayContaining(['before', 'after', 'l1']));
  });

  it('a vomit re-checks its neighbours within 72 h, so a third vomit lifts the two before it', () => {
    const vomits = [
      { id: 'v1', at: at(0), confidence: 'witnessed' },
      { id: 'v2', at: at(1), confidence: 'witnessed' },
      { id: 'v3', at: at(2), confidence: 'witnessed' },
    ];
    const reads = boutReads({ trigger: { id: 'v3', type: 'vomit', at: at(2) }, vomits, lethargy: [], species, birthDate });
    // T2: three onsets more than 30 min apart inside 4 hours → call now on all three.
    expect(reads.map((r) => [r.eventId, r.tier])).toEqual([
      ['v1', 'call_now'],
      ['v2', 'call_now'],
      ['v3', 'call_now'],
    ]);
  });

  it('a vomit the floor gives no call is absent: the phone says nothing calm (n=1)', () => {
    const reads = boutReads({
      trigger: { id: 'v1', type: 'vomit', at: at(0) },
      vomits: [{ id: 'v1', at: at(0), confidence: 'witnessed' }],
      lethargy: [],
      species,
      birthDate,
    });
    expect(reads).toEqual([]);
  });

  it('reads outside the reach are never floored, either spelling of an instant (C-40)', () => {
    const reads = boutReads({
      trigger: { id: 'l1', type: 'lethargy', at: '2026-10-08T12:00:00+00:00' },
      vomits: [{ id: 'edge', at: '2026-10-09T12:00:00.000Z', confidence: 'witnessed' }],
      lethargy: [{ id: 'l1', at: '2026-10-08T12:00:00+00:00' }],
      species,
      birthDate,
    });
    expect(reads.map((r) => r.eventId)).toEqual(['edge']);
    expect(REFLOOR_WINDOW_HOURS).toBe(24);
    expect(FLOOR_READ_HOURS).toBe(72);
  });
});

describe('pickBoutArrival — one arrival per bout (§8.7, GAP-33)', () => {
  const r = (eventId: string, h: number, tier: 'call_now' | 'call_today') => ({ eventId, at: at(h), tier });

  it('a re-run that raises several reads announces only the most recent', () => {
    const { announce, raised } = pickBoutArrival([r('a', 0, 'call_now'), r('c', 2, 'call_now'), r('b', 1, 'call_now')], new Map());
    expect(announce?.eventId).toBe('c');
    expect(raised.map((x) => x.eventId).sort()).toEqual(['a', 'b', 'c']);
  });

  it('among the LOUDEST raised: a later call today never speaks over an earlier call now', () => {
    const { announce } = pickBoutArrival([r('early', 0, 'call_now'), r('late', 3, 'call_today')], new Map());
    expect(announce?.eventId).toBe('early');
  });

  it('a read is raised only above what it already said: the same tier again is silent', () => {
    const prior = new Map([['a', TIER_RANK.call_now], ['b', TIER_RANK.call_today]]);
    const { announce, raised } = pickBoutArrival([r('a', 0, 'call_now'), r('b', 1, 'call_today')], prior);
    expect(announce).toBeNull();
    expect(raised).toEqual([]);
  });

  it('call today shown, call now stored: that arrives', () => {
    const { announce } = pickBoutArrival([r('a', 0, 'call_now')], new Map([['a', TIER_RANK.call_today]]));
    expect(announce?.eventId).toBe('a');
  });

  it('a tie on the instant falls back to id order, so the choice is stable', () => {
    const one = pickBoutArrival([r('x', 1, 'call_now'), r('y', 1, 'call_now')], new Map()).announce?.eventId;
    const two = pickBoutArrival([r('y', 1, 'call_now'), r('x', 1, 'call_now')], new Map()).announce?.eventId;
    expect(one).toBe(two);
  });
});

describe('previewForRead — the record’s own floor for one read', () => {
  it('matches the bout’s answer for the same read', () => {
    const vomits = [{ id: 'v1', at: at(0), confidence: 'witnessed' }];
    const lethargy = [{ id: 'l1', at: at(-10) }];
    expect(previewForRead({ eventId: 'v1', vomits, lethargy, species: 'dog', birthDate: '2020-01-01' })).toBe('call_now');
    expect(previewForRead({ eventId: 'v1', vomits, lethargy: [], species: 'dog', birthDate: '2020-01-01' })).toBeNull();
    expect(previewForRead({ eventId: 'missing', vomits, lethargy, species: 'dog', birthDate: '2020-01-01' })).toBeNull();
  });
});

describe('against the phone’s database', () => {
  beforeEach(async () => {
    mockDb = new DatabaseSync(':memory:');
    for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL]) mockDb.exec(sql);
    await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
    usePetStore.setState({
      pets: [{ id: PET, name: 'Mochi', species: 'cat', breed: null, date_of_birth: '2020-01-01', date_of_birth_precision: 'exact', sex: 'female', weight_kg: null, photo_path: null }],
    });
  });
  afterEach(() => {
    mockDb.close();
    usePetStore.setState({ pets: [] });
  });

  function seed(id: string, type: string, h: number, deleted = false): void {
    mockDb
      .prepare(
        `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, source, occurred_at_source, created_at, updated_at, synced, deleted_at)
         VALUES (?, ?, ?, ?, 'witnessed', 'manual', 'manual', ?, ?, 0, ?)`,
      )
      .run(id, PET, type, at(h), at(h), at(h), deleted ? at(h + 1) : null);
  }
  function marker(eventId: string): void {
    mockDb.prepare(`INSERT INTO incident_floor_queue (id, pet_id, event_id, created_at) VALUES (?, ?, ?, ?)`).run(`m-${eventId}`, PET, eventId, at(0));
  }

  it('lethargy after an earlier vomit: names that vomit’s read, records it shown, attaches the claim', async () => {
    seed('v1', 'vomit', -3);
    seed('l1', 'lethargy', 0);
    marker('l1');
    const said = await previewFloorAfterWrite('l1');
    expect(said).toEqual({ eventId: 'v1', vomitAt: at(-3), tier: 'call_now', self: false, device: true, petId: PET });
    expect(await readShownTiers(['v1'])).toEqual(new Map([['v1', 'call_now']]));
    const claim = JSON.parse(String(mockDb.prepare(`SELECT device_claim FROM incident_floor_queue WHERE event_id = 'l1'`).get()?.device_claim));
    expect(claim).toEqual({ rule: FLOOR_CLAIM_RULE_VERSION, reads: [{ event_id: 'v1', tier: 'call_now', row_ids: expect.arrayContaining(['v1', 'l1']) }] });
  });

  it('a second log in the same bout says nothing it already said', async () => {
    seed('v1', 'vomit', -3);
    seed('l1', 'lethargy', 0);
    marker('l1');
    expect(await previewFloorAfterWrite('l1')).not.toBeNull();
    seed('l2', 'lethargy', 1);
    marker('l2');
    expect(await previewFloorAfterWrite('l2')).toBeNull();
  });

  it('a stored call at the same tier silences the preview too (the phone’s copy counts)', async () => {
    seed('v1', 'vomit', -3);
    seed('l1', 'lethargy', 0);
    mockDb.prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at, tier) VALUES ('v1', 'completed', 'worth_a_call', ?, 'call_now')`).run(at(-2));
    expect(await previewFloorAfterWrite('l1')).toBeNull();
  });

  it('a deleted lethargy log raises nothing (the floor reads live rows only)', async () => {
    seed('v1', 'vomit', -3);
    seed('l1', 'lethargy', 0, true);
    expect(await previewFloorAfterWrite('l1')).toBeNull();
  });

  it('a pet this phone does not hold: no preview, never a guess at its species', async () => {
    usePetStore.setState({ pets: [] });
    seed('v1', 'vomit', -3);
    seed('l1', 'lethargy', 0);
    expect(await previewFloorAfterWrite('l1')).toBeNull();
  });

  it('the shown record is raise-only: a quieter write never steps it down', async () => {
    await recordShownTiers([{ eventId: 'v1', petId: PET, tier: 'call_now', source: 'device' }]);
    await recordShownTiers([{ eventId: 'v1', petId: PET, tier: 'call_today', source: 'server' }]);
    expect(await readShownTiers(['v1'])).toEqual(new Map([['v1', 'call_now']]));
    await recordShownTiers([{ eventId: 'v2', petId: PET, tier: 'call_today', source: 'server' }]);
    await recordShownTiers([{ eventId: 'v2', petId: PET, tier: 'call_now', source: 'server' }]);
    expect(await readShownTiers(['v2'])).toEqual(new Map([['v2', 'call_now']]));
  });
});
