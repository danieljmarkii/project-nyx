// Home's today read (`TODAY_EVENTS_SQL`) against the REAL local schema on node:sqlite, then
// through the pipeline Home draws from (`buildDayNodes`), so the fixture is a row the query
// actually produces (C-35) rather than a store row shaped by hand.
//
// What only the real query can show (History v2 HV-6 / CUL-1163):
//   • CUL-1121 on Home: Saturday 8 AM All, noon Refused, 5 PM All, one product. The run rule
//     keys on the recorded rating, and the rating lives on `meals`, so a read that does not
//     select it hands the rule three unrated bowls and the refusal folds into "3 meals".
//   • The dose names its course when it has no item (CUL-1124), never across pets.
//   • The dose's vehicle comes from its STORED pair, never a same-minute meal (GAP-3).
//   • A weight carries its value.
//
// Instants are built from LOCAL components (B-514): the day boundary is local midnight.

jest.mock('expo-file-system', () => ({ File: class {} }));
// The pipeline's module graph reaches lib/supabase (an import-time env guard) and lib/sync;
// nothing here makes a network call.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

import { buildDayNodes, type DayNode, type DayEvent } from './dayNodes';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { TODAY_EVENTS_SQL } from './todayEventsQuery';

const PET = 'pet-1';
const OTHER_PET = 'pet-2';
/** Saturday Sep 26, 2026, at a local wall-clock time. */
const at = (h: number, m = 0) => new Date(2026, 8, 26, h, m).toISOString();
const DAY_START = new Date(2026, 8, 26, 0, 0).toISOString();

let db: InstanceType<typeof DatabaseSync>;

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  db.exec(BASE_SCHEMA_SQL);
  db.exec(MEDICATION_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try {
      db.exec(sql);
    } catch {
      /* a per-table upgrade the base DDL already carries */
    }
  });
  db.prepare(`INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES (?, ?, ?, ?, ?)`).run(
    'rc-dry',
    'Royal Canin',
    'Selected Protein PR, Dry',
    'dry_kibble',
    'meal',
  );
  db.prepare(`INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES (?, ?, ?, ?, ?)`).run(
    'rc-wet',
    'Royal Canin',
    'Selected Protein PR, Wet',
    'wet_canned',
    'meal',
  );
});

function event(id: string, type: string, occurredAt: string, over: { pet?: string; deleted?: boolean; notes?: string } = {}) {
  db.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, notes,
                         source, created_at, updated_at, deleted_at, synced)
     VALUES (?, ?, ?, ?, 'witnessed', ?, 'manual', ?, ?, ?, 1)`,
  ).run(id, over.pet ?? PET, type, occurredAt, over.notes ?? null, occurredAt, occurredAt, over.deleted ? occurredAt : null);
}

function meal(id: string, occurredAt: string, food: string, intake: string | null, over: { deleted?: boolean } = {}) {
  event(id, 'meal', occurredAt, over);
  db.prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, intake_rating) VALUES (?, ?, ?, ?, ?)`).run(
    `m-${id}`,
    id,
    PET,
    food,
    intake,
  );
}

function dose(
  id: string,
  occurredAt: string,
  o: { item?: string | null; course?: string | null; adherence?: string | null; howGiven?: string | null; paired?: string | null },
) {
  event(id, 'medication', occurredAt);
  db.prepare(
    `INSERT INTO medication_administrations (id, event_id, pet_id, medication_id, medication_item_id, adherence, how_given, paired_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(`ma-${id}`, id, PET, o.course ?? null, o.item ?? null, o.adherence ?? null, o.howGiven ?? null, o.paired ?? null);
}

function readToday(): DayEvent[] {
  return db.prepare(TODAY_EVENTS_SQL).all(PET, DAY_START) as DayEvent[];
}

const NO_FACTS = {
  reads: { photographed: new Set<string>(), analysis: new Map(), working: new Set<string>() },
  timings: { feedings: [], freeFedSpans: [] },
};

/** A node's line as the day reads top to bottom: a run's ids, or a single id. */
const lineOf = (n: DayNode) => (n.kind === 'compact' ? n.ids : n.id);

describe("Home's today read carries what the row's rules read", () => {
  it('CUL-1121: Saturday 8 AM All, noon Refused, 5 PM All is three rows, the refusal its own', () => {
    meal('b8', at(8), 'rc-dry', 'all');
    meal('b12', at(12), 'rc-dry', 'refused');
    meal('b17', at(17), 'rc-dry', 'all');
    const rows = readToday();
    expect(rows.find((r) => r.id === 'b12')?.intake_rating).toBe('refused');
    const nodes = buildDayNodes(rows, NO_FACTS);
    expect(nodes.map(lineOf)).toEqual(['b8', 'b12', 'b17']);
    const noon = nodes[1];
    expect(noon.kind === 'event' && noon.intake).toBe('refused');
  });

  it('and two bowls eaten normally around it still share a line, named for their one product', () => {
    meal('b8', at(8), 'rc-dry', 'all');
    meal('b9', at(9), 'rc-wet', null);
    meal('b12', at(12), 'rc-dry', 'refused');
    const nodes = buildDayNodes(readToday(), NO_FACTS);
    expect(nodes.map(lineOf)).toEqual([['b8', 'b9'], 'b12']);
    const run = nodes[0];
    expect(run.kind).toBe('compact');
    if (run.kind === 'compact') {
      expect(run.title).toBe('2 meals');
      expect(run.detail).toBe('Royal Canin · Selected Protein PR');
      expect(run.formats).toBe('1 wet · 1 dry');
    }
  });

  it('a dose logged against a course typed in by hand names the course, never another pet’s', () => {
    db.prepare(`INSERT INTO medications (id, pet_id, drug_name, started_at) VALUES (?, ?, ?, ?)`).run(
      'rx-1',
      PET,
      'Prednisolone',
      at(0),
    );
    db.prepare(`INSERT INTO medications (id, pet_id, drug_name, started_at) VALUES (?, ?, ?, ?)`).run(
      'rx-other',
      OTHER_PET,
      'Someone else’s drug',
      at(0),
    );
    dose('d1', at(9), { course: 'rx-1', adherence: 'given' });
    dose('d2', at(10), { course: 'rx-other', adherence: 'refused' });
    const byId = new Map(buildDayNodes(readToday(), NO_FACTS).map((n) => [n.id, n]));
    expect(byId.get('d1')).toMatchObject({ title: 'Prednisolone' });
    // The course belongs to another pet: the join refuses it, and the row says only what it is.
    expect(byId.get('d2')).toMatchObject({ title: 'Medication' });
  });

  it('the vehicle is the stored pair: "in the 1:00 PM meal · picked at", and the meal says "with" the drug', () => {
    db.prepare(`INSERT INTO medication_items_cache (id, generic_name) VALUES (?, ?)`).run('pred', 'Prednisone');
    meal('lunch', at(13), 'rc-wet', 'picked');
    // A second meal at the SAME minute the dose was logged: never the vehicle (GAP-3).
    meal('decoy', at(13, 5), 'rc-dry', 'all');
    dose('d1', at(13, 5), { item: 'pred', adherence: 'partial', howGiven: 'in_food', paired: 'lunch' });
    const rows = readToday();
    expect(rows.find((r) => r.id === 'd1')).toMatchObject({ paired_event_id: 'lunch', paired_vehicle_intake: 'picked' });
    const byId = new Map(buildDayNodes(rows, NO_FACTS).map((n) => [n.id, n]));
    const d1 = byId.get('d1');
    expect(d1?.kind === 'event' && d1.dose).toMatchObject({
      adherence: 'partial',
      // The app's own clock format (`formatTime`, a two-digit hour): "01:00 PM".
      vehicle: expect.stringMatching(/^in the 0?1:00\s?PM meal$/),
      vehicleIntake: { phrase: 'picked at', tone: 'attn' },
    });
    expect(byId.get('lunch')).toMatchObject({ carries: 'with Prednisone' });
    expect(byId.get('decoy')).toMatchObject({ carries: null });
  });

  it('a soft-deleted vehicle drops out: the dose keeps its recorded vehicle and is never in doubt', () => {
    db.prepare(`INSERT INTO medication_items_cache (id, generic_name) VALUES (?, ?)`).run('pred', 'Prednisone');
    meal('lunch', at(13), 'rc-wet', 'refused', { deleted: true });
    dose('d1', at(13), { item: 'pred', adherence: null, howGiven: 'in_food', paired: 'lunch' });
    const rows = readToday();
    expect(rows.find((r) => r.id === 'lunch')).toBeUndefined();
    expect(rows.find((r) => r.id === 'd1')?.paired_vehicle_intake).toBeNull();
    const d1 = buildDayNodes(rows, NO_FACTS).find((n) => n.id === 'd1');
    expect(d1?.kind === 'event' && d1.dose).toMatchObject({ vehicle: 'in food', vehicleIntake: null, inDoubt: false });
  });

  it('a weight carries its value in pounds', () => {
    event('w1', 'weight_check', at(7));
    db.prepare(`INSERT INTO weight_checks (id, event_id, pet_id, weight_kg) VALUES (?, ?, ?, ?)`).run('wc-1', 'w1', PET, 4.5);
    const w1 = buildDayNodes(readToday(), NO_FACTS).find((n) => n.id === 'w1');
    expect(w1).toMatchObject({ title: 'Weight', detail: '9.9 lbs' });
  });

  it('one row per event: every join is one to one (a meal carrying two doses is still one meal)', () => {
    db.prepare(`INSERT INTO medication_items_cache (id, generic_name) VALUES (?, ?)`).run('pred', 'Prednisone');
    meal('lunch', at(13), 'rc-wet', 'all');
    dose('d1', at(13), { item: 'pred', adherence: 'given', paired: 'lunch' });
    dose('d2', at(13), { item: 'pred', adherence: 'given', paired: 'lunch' });
    const rows = readToday();
    expect(rows.map((r) => r.id).sort()).toEqual(['d1', 'd2', 'lunch']);
    expect(buildDayNodes(rows, NO_FACTS).find((n) => n.id === 'lunch')).toMatchObject({ carries: 'with 2 doses of Prednisone' });
  });
});
