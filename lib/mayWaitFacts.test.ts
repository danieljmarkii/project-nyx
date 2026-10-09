// CUL-1629: the read behind call today's wait line, against the REAL statements over a real
// SQLite built from the shipped schema (the looksTimeline pattern): the claim under test is that
// the phone's own rows, unsynced ones included, reach the gates, and that a failed read refuses.
jest.mock('expo-file-system', () => ({ File: class {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

let mockRaw: InstanceType<typeof DatabaseSync>;
let mockServer: { data: { id: string }[] | null; error: { message: string } | null } = { data: [], error: null };

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).get(...(params as never[])) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).run(...(params as never[])),
  }),
}));
jest.mock('./supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: async () => mockServer }) }) },
}));

import { loadMayWaitFacts, MAY_WAIT_INCIDENT_TYPES } from './mayWaitFacts';
import * as fs from 'fs';
import * as path from 'path';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { mayWaitRefusalOf } from './mayWaitLine';

const PET = 'pet-1';
const HOUR = 3_600_000;
const ANCHOR = Date.UTC(2026, 6, 15, 21);
const NOW = ANCHOR + HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const PHOTO = '6f1c0d2e-1111-4a5b-9c3d-000000000001';

beforeEach(async () => {
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try { mockRaw.exec(sql); } catch { /* per-table upgrade */ }
  });
  mockServer = { data: [{ id: PHOTO }], error: null };
});

function seed(id: string, type: string, atMs: number, opts: { synced?: number; deletedAt?: string | null; confidence?: string } = {}) {
  mockRaw.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, source, created_at, updated_at, deleted_at, synced)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?)`,
  ).run(id, PET, type, iso(atMs), opts.confidence ?? 'witnessed', iso(atMs), iso(atMs), opts.deletedAt ?? null, opts.synced ?? 1);
}
function seedMeal(id: string, atMs: number, rating: string | null, synced = 1) {
  seed(id, 'meal', atMs);
  mockRaw.prepare(
    `INSERT INTO meals (id, event_id, pet_id, quantity, intake_rating, created_at, updated_at, synced) VALUES (?, ?, ?, 'unknown', ?, ?, ?, ?)`,
  ).run(`m-${id}`, id, PET, rating, iso(atMs), iso(atMs), synced);
}
function seedPhoto(id: string, eventId: string, synced = 1) {
  mockRaw.prepare(
    `INSERT INTO event_attachments (id, event_id, pet_id, local_uri, storage_path, synced) VALUES (?, ?, ?, 'file://x', 'p/x', ?)`,
  ).run(id, eventId, PET, synced);
}

describe('loadMayWaitFacts', () => {
  it('reads the anchor, the vomits, lethargy up to now, meals with ratings, and both photo sets', async () => {
    seed('v0', 'vomit', ANCHOR);
    seed('v1', 'vomit', ANCHOR - 6 * HOUR);
    seed('s1', 'diarrhea', ANCHOR - 2 * HOUR);
    seed('l1', 'lethargy', NOW - 5 * 60_000);
    seedMeal('meal1', ANCHOR - 3 * HOUR, 'all');
    seedPhoto(PHOTO, 'v0');
    const f = await loadMayWaitFacts('v0', PET, NOW);
    expect(f).not.toBeNull();
    expect(f!.anchorAt).toBe(iso(ANCHOR));
    expect(f!.vomits.map((v) => v.at).sort()).toEqual([iso(ANCHOR - 6 * HOUR), iso(ANCHOR)]);
    expect(f!.stoolAt).toEqual([iso(ANCHOR - 2 * HOUR)]);
    expect(f!.lethargyAt).toEqual([iso(NOW - 5 * 60_000)]);
    expect(f!.meals).toEqual([{ at: iso(ANCHOR - 3 * HOUR), rating: 'all' }]);
    expect(f!.serverAttachmentIds).toEqual([PHOTO]);
    expect(f!.localAttachmentIds).toEqual([PHOTO]);
    expect(f!.unsynced).toBe(false);
  });

  it('an UNSYNCED vomit is in the floor\'s rows and marks the read unsynced', async () => {
    seed('v0', 'vomit', ANCHOR);
    seed('v1', 'vomit', ANCHOR - 10 * 60_000, { synced: 0 });
    seedPhoto(PHOTO, 'v0');
    const f = await loadMayWaitFacts('v0', PET, NOW);
    expect(f!.vomits).toHaveLength(2);
    expect(f!.unsynced).toBe(true);
  });

  it.each<[string, () => void]>([
    ['an unsynced lethargy', () => seed('l1', 'lethargy', NOW - HOUR, { synced: 0 })],
    ['an unsynced meal rating', () => seedMeal('meal1', ANCHOR - HOUR, 'refused', 0)],
    ['an undone vomit the server has not heard of', () => seed('v9', 'vomit', ANCHOR - HOUR, { synced: 0, deletedAt: iso(NOW) })],
    ['a photo still in the upload queue', () => seedPhoto('6f1c0d2e-1111-4a5b-9c3d-000000000009', 'v0', 0)],
  ])('%s marks the read unsynced', async (_label, add) => {
    seed('v0', 'vomit', ANCHOR);
    seedPhoto(PHOTO, 'v0');
    add();
    const f = await loadMayWaitFacts('v0', PET, NOW);
    expect(f!.unsynced).toBe(true);
    const shown = {
        status: 'completed', tier: 'call_today', engine_flags: ['engines_v3_en3'], may_wait: true, edited_at: null, error: null,
        updated_at: iso(ANCHOR + 10 * 60_000), photo_set_key: PHOTO, ai_raw_payload: { read_photo_set_key: PHOTO },
    };
    expect(mayWaitRefusalOf({
      row: shown, freshRow: shown, facts: f, kind: 'vomit', petName: 'Nyx', species: 'dog', birthDate: null, nowMs: NOW, offsetAt: () => 0,
    })).not.toBeNull(); // 'unsynced', or 'photos' first for a queued photo (the sets differ)
  });

  it('a deleted vomit is not in the floor\'s rows once synced', async () => {
    seed('v0', 'vomit', ANCHOR);
    seed('v1', 'vomit', ANCHOR - HOUR, { deletedAt: iso(NOW - HOUR) });
    const f = await loadMayWaitFacts('v0', PET, NOW);
    expect(f!.vomits).toHaveLength(1);
    expect(f!.unsynced).toBe(false);
  });

  it('a failed server photo read is no answer (null), never "no photos"', async () => {
    seed('v0', 'vomit', ANCHOR);
    mockServer = { data: null, error: { message: 'offline' } };
    expect(await loadMayWaitFacts('v0', PET, NOW)).toBeNull();
  });

  it('an event the phone does not hold, or holds deleted, is no answer', async () => {
    expect(await loadMayWaitFacts('nope', PET, NOW)).toBeNull();
    seed('v0', 'vomit', ANCHOR, { deletedAt: iso(NOW) });
    expect(await loadMayWaitFacts('v0', PET, NOW)).toBeNull();
  });

  it('another pet\'s rows never reach it', async () => {
    seed('v0', 'vomit', ANCHOR);
    mockRaw.prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, source, created_at, updated_at, synced) VALUES ('x', 'pet-2', 'lethargy', ?, 'manual', ?, ?, 0)`,
    ).run(iso(NOW), iso(NOW), iso(NOW));
    const f = await loadMayWaitFacts('v0', PET, NOW);
    expect(f!.lethargyAt).toEqual([]);
    expect(f!.unsynced).toBe(false);
  });
});

describe('the read mirrors the server\'s (C-34)', () => {
  // incidentMayWaitEvidence.ts imports esm.sh, which the app's tsc cannot resolve, so its
  // list is read from the source by value: a leaf added there reds here.
  it('the incident types equal MAY_WAIT_INCIDENT_TYPES', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/_shared/incidentMayWaitEvidence.ts'), 'utf8');
    const m = /export const MAY_WAIT_INCIDENT_TYPES = \[([^\]]*)\]/.exec(src);
    expect(m).not.toBeNull();
    const server = m![1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    expect([...MAY_WAIT_INCIDENT_TYPES].sort()).toEqual(server.sort());
  });
});
