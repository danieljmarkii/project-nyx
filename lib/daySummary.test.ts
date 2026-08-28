// Day Summary builder tests (B-661 PR 4). The load-bearing, bug-prone parts are
// the LOCAL-day clip (B-421) and the zero-log copy's G2 safety — both provable
// without a database. Timezone assertions are B-514-honest: they pass an explicit
// `timeZone` or build instants from local components, never a bare UTC literal
// standing in for a local-day question.

// The builder is pure, but it imports describeDayEvent (lib/dayEvents), whose
// `pluralize` import transitively drags in lib/analytics → lib/sync → lib/supabase,
// which throws at import time without env. Stub the leaf so the pure builder runs
// with no database or config (the same mock the other lib builders use).
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import type { TimelineRow } from './db';
import {
  buildDaySummary,
  buildAnchoredDaySummary,
  buildLeadLine,
  buildCountChips,
  buildTrialStrip,
  buildForwardLine,
  buildRecapMedStrips,
  localDayBoundsIso,
  resolveDaySummaryAnchorMs,
  petZeroLogLine,
  DAY_SUMMARY_ZERO_LOG,
  daySummaryEmptyTitle,
  type DaySummaryPetInput,
  type DaySummaryRow,
} from './daySummary';
import { trialIdentityLabel, type TrialCardTrial } from './dietTrialCard';
import type { TrialExposureItem } from './dietTrial';
import type { MedStripInput, MedStripModel } from './medStrip';
import { EVENT_TYPES, SYMPTOM_TYPES, type EventTypeKey } from '../constants/eventTypes';

// Minimal TimelineRow factory — only the columns the builder + describeDayEvent
// read need real values; everything else defaults to the null a non-matching join
// produces. `paired_dose_count` is NOT NULL in the shape, so it defaults to 0.
function mkRow(over: Partial<TimelineRow> & { id: string; occurred_at: string }): TimelineRow {
  return {
    pet_id: 'pet-1',
    event_type: 'vomit',
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: null,
    notes: null,
    source: 'now',
    deleted_at: null,
    created_at: over.occurred_at,
    updated_at: over.occurred_at,
    food_item_id: null,
    quantity: null,
    food_brand: null,
    food_product_name: null,
    food_type: null,
    food_format: null,
    intake_rating: null,
    weight_kg: null,
    medication_item_id: null,
    adherence: null,
    how_given: null,
    paired_event_id: null,
    paired_vehicle_intake: null,
    paired_food_name: null,
    drug_generic_name: null,
    drug_brand_name: null,
    paired_dose_count: 0,
    paired_dose_event_id: null,
    paired_dose_drug_name: null,
    ...over,
  };
}

const pet = (id: string, name: string, rows: TimelineRow[]): DaySummaryPetInput => ({
  pet: { id, name, species: 'dog' },
  rows,
});

describe('buildDaySummary — local-day clip (B-421)', () => {
  it("keeps only events on the owner's local day, dropping earlier/later ones", () => {
    // Explicit UTC zone → the assertion is pinned to UTC on every runner.
    const nowMs = Date.parse('2026-08-02T12:00:00Z');
    const rows = [
      mkRow({ id: 'today-a', occurred_at: '2026-08-02T09:00:00Z' }),
      mkRow({ id: 'today-b', occurred_at: '2026-08-02T23:30:00Z' }),
      mkRow({ id: 'yesterday', occurred_at: '2026-08-01T23:00:00Z' }),
      mkRow({ id: 'tomorrow', occurred_at: '2026-08-03T00:30:00Z' }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: 'UTC' });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['today-a', 'today-b']);
    expect(model.sections[0].isZeroLog).toBe(false);
  });

  it('the local-day boundary is the OWNER’s zone, not UTC (same instant, two zones)', () => {
    // now 05:00Z; a single event 9h earlier at 20:00Z the previous UTC day.
    const nowMs = Date.parse('2026-08-02T05:00:00Z');
    const rows = [mkRow({ id: 'e', occurred_at: '2026-08-01T20:00:00Z' })];

    // In UTC the event is YESTERDAY (Aug 1 vs now Aug 2) → excluded.
    const utc = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: 'UTC' });
    expect(utc.sections[0].rows).toHaveLength(0);
    expect(utc.isEmpty).toBe(true);

    // In America/Los_Angeles (UTC-7) both now (Aug 1 22:00) and the event (Aug 1
    // 13:00) fall on Aug 1 local → the SAME local day → included. Same rows, same
    // now, different answer purely because the day boundary moved.
    const la = buildDaySummary({
      pets: [pet('pet-1', 'Biscuit', rows)],
      nowMs,
      timeZone: 'America/Los_Angeles',
    });
    expect(la.sections[0].rows.map((r) => r.id)).toEqual(['e']);
    expect(la.isEmpty).toBe(false);
  });

  it('buckets by local components on the device path (no timeZone arg)', () => {
    // Instants built from LOCAL components — honest under any runner zone, because
    // the assertion is about the local day and no zone is passed (device zone).
    const nowMs = new Date(2026, 7, 2, 14, 0).getTime();
    const rows = [
      mkRow({ id: 'today', occurred_at: new Date(2026, 7, 2, 8, 0).toISOString() }),
      mkRow({ id: 'last-night', occurred_at: new Date(2026, 7, 1, 23, 0).toISOString() }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['today']);
  });

  it('drops an unparseable occurred_at rather than throwing', () => {
    const nowMs = Date.parse('2026-08-02T12:00:00Z');
    const rows = [
      mkRow({ id: 'good', occurred_at: '2026-08-02T09:00:00Z' }),
      mkRow({ id: 'bad', occurred_at: 'not-a-date' }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: 'UTC' });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['good']);
  });
});

describe('buildDaySummary — soft delete + ordering + reuse', () => {
  const nowMs = Date.parse('2026-08-02T20:00:00Z');
  const tz = 'UTC';

  it('never shows a soft-deleted event', () => {
    const rows = [
      mkRow({ id: 'live', occurred_at: '2026-08-02T09:00:00Z' }),
      mkRow({ id: 'gone', occurred_at: '2026-08-02T10:00:00Z', deleted_at: '2026-08-02T11:00:00Z' }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: tz });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['live']);
  });

  it('orders rows earliest-first regardless of input order', () => {
    const rows = [
      mkRow({ id: 'evening', occurred_at: '2026-08-02T19:00:00Z' }),
      mkRow({ id: 'morning', occurred_at: '2026-08-02T07:00:00Z' }),
      mkRow({ id: 'noon', occurred_at: '2026-08-02T12:00:00Z' }),
    ];
    const model = buildDaySummary({ pets: [pet('pet-1', 'Biscuit', rows)], nowMs, timeZone: tz });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['morning', 'noon', 'evening']);
  });

  it('carries the event id (the doorway target) and describeDayEvent’s display', () => {
    const rows = [
      mkRow({
        id: 'meal-1',
        event_type: 'meal',
        occurred_at: '2026-08-02T08:00:00Z',
        food_brand: 'Hill’s',
        food_product_name: 'i/d',
        food_type: 'meal',
        intake_rating: 'refused',
      }),
    ];
    const [row] = buildDaySummary({
      pets: [pet('pet-1', 'Biscuit', rows)],
      nowMs,
      timeZone: tz,
    }).sections[0].rows;
    expect(row.id).toBe('meal-1');
    expect(row.title).toBe('Hill’s · i/d');
    // A refusal is surfaced plainly (describeDayEvent's INTAKE_PHRASE), never softened.
    expect(row.detail).toBe('refused');
    expect(row.category).toBe('meal');
  });
});

describe('buildDaySummary — multi-pet sections (§5.3)', () => {
  const nowMs = Date.parse('2026-08-02T20:00:00Z');
  const tz = 'UTC';

  it('renders one section per pet, in the input (active-first) order', () => {
    const model = buildDaySummary({
      pets: [
        pet('pet-2', 'Rex', [mkRow({ id: 'r1', pet_id: 'pet-2', occurred_at: '2026-08-02T09:00:00Z' })]),
        pet('pet-1', 'Biscuit', [mkRow({ id: 'b1', occurred_at: '2026-08-02T10:00:00Z' })]),
      ],
      nowMs,
      timeZone: tz,
    });
    expect(model.petCount).toBe(2);
    expect(model.sections.map((s) => s.petName)).toEqual(['Rex', 'Biscuit']);
    expect(model.isEmpty).toBe(false);
  });

  it('marks a pet with nothing today as zero-log without emptying the screen', () => {
    const model = buildDaySummary({
      pets: [
        pet('pet-1', 'Biscuit', [mkRow({ id: 'b1', occurred_at: '2026-08-02T10:00:00Z' })]),
        pet('pet-2', 'Rex', []),
      ],
      nowMs,
      timeZone: tz,
    });
    expect(model.sections[0].isZeroLog).toBe(false);
    expect(model.sections[1].isZeroLog).toBe(true);
    // One pet logged → the whole screen is NOT the empty state.
    expect(model.isEmpty).toBe(false);
  });

  it('is the whole-screen empty state only when NO pet has anything today', () => {
    const model = buildDaySummary({
      pets: [pet('pet-1', 'Biscuit', []), pet('pet-2', 'Rex', [])],
      nowMs,
      timeZone: tz,
    });
    expect(model.isEmpty).toBe(true);
  });

  it('treats an account with no pets as the (vacuous) empty state, never a crash', () => {
    const model = buildDaySummary({ pets: [], nowMs, timeZone: tz });
    // The rich single-pet fields default off on an empty/multi-pet model (DR-1 §2).
    expect(model).toEqual({
      sections: [],
      isEmpty: true,
      petCount: 0,
      lead: null,
      chips: [],
      trialStrip: null,
      medStrips: [],
      forward: null,
    });
  });

  it('never shows another pet’s row under this pet (defense-in-depth pet scope)', () => {
    // A row whose pet_id disagrees with its bucket is dropped — the guard against a
    // future combined-query refactor cross-wiring two pets' records. The loader
    // scopes per pet today, so this can only be exercised by handing the builder a
    // deliberately mis-bucketed row.
    const model = buildDaySummary({
      pets: [
        pet('pet-1', 'Biscuit', [
          mkRow({ id: 'mine', pet_id: 'pet-1', occurred_at: '2026-08-02T09:00:00Z' }),
          mkRow({ id: 'not-mine', pet_id: 'pet-2', occurred_at: '2026-08-02T10:00:00Z' }),
        ]),
      ],
      nowMs,
      timeZone: tz,
    });
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['mine']);
  });
});

describe('localDayBoundsIso (device-zone prefetch bounds)', () => {
  it('returns local-midnight-today .. local-midnight-tomorrow (B-514: built from components)', () => {
    const now = new Date(2026, 7, 2, 14, 30, 15);
    const { after, before } = localDayBoundsIso(now.getTime());
    expect(after).toBe(new Date(2026, 7, 2, 0, 0, 0, 0).toISOString());
    expect(before).toBe(new Date(2026, 7, 3, 0, 0, 0, 0).toISOString());
  });

  it('advances the date by exactly one local day across a month boundary', () => {
    const now = new Date(2026, 7, 31, 21, 0);
    const { after, before } = localDayBoundsIso(now.getTime());
    expect(after).toBe(new Date(2026, 7, 31, 0, 0).toISOString());
    expect(before).toBe(new Date(2026, 8, 1, 0, 0).toISOString());
  });
});

describe('resolveDaySummaryAnchorMs — the fire-day anchor + staleness clamp (B-672)', () => {
  // B-514-honest: UTC-pinned assertions pass an explicit `timeZone` with `Z`
  // instants; the device-path cases build instants from LOCAL components with no
  // zone, so the local-DAY difference the clamp reads is invariant under any CI zone.

  it('falls back to now when there is no fired-for instant (pre-B-672 default)', () => {
    const nowMs = Date.parse('2026-08-02T12:00:00Z');
    expect(resolveDaySummaryAnchorMs({ firedForMs: null, nowMs, timeZone: 'UTC' })).toBe(nowMs);
    expect(resolveDaySummaryAnchorMs({ firedForMs: undefined, nowMs, timeZone: 'UTC' })).toBe(nowMs);
  });

  it('keeps a same-day tap on the fired-for day (age 0)', () => {
    const firedForMs = Date.parse('2026-08-01T21:00:00Z'); // 9pm fire
    const nowMs = Date.parse('2026-08-01T21:05:00Z'); //      tapped 5 min later
    expect(resolveDaySummaryAnchorMs({ firedForMs, nowMs, timeZone: 'UTC' })).toBe(firedForMs);
  });

  it('the 12:40am tap opens YESTERDAY, the fired-for day (age 1 — the wedge case)', () => {
    // A 9pm Saturday notification tapped at 12:40am Sunday must open Saturday's
    // record, not a near-empty Sunday (the "the app lost my logs" false-empty).
    const firedForMs = Date.parse('2026-08-01T21:00:00Z'); // Sat 9pm
    const nowMs = Date.parse('2026-08-02T00:40:00Z'); //      Sun 12:40am
    expect(resolveDaySummaryAnchorMs({ firedForMs, nowMs, timeZone: 'UTC' })).toBe(firedForMs);
  });

  it('a 2-day-old tap clamps to TODAY, not a days-old summary (age 2)', () => {
    const firedForMs = Date.parse('2026-08-01T21:00:00Z'); // Sat 9pm
    const nowMs = Date.parse('2026-08-03T08:00:00Z'); //      Mon morning
    expect(resolveDaySummaryAnchorMs({ firedForMs, nowMs, timeZone: 'UTC' })).toBe(nowMs);
  });

  it('clamps a future fired-for instant to now (defensive — bad clock/payload)', () => {
    const nowMs = Date.parse('2026-08-01T21:00:00Z');
    const firedForMs = Date.parse('2026-08-02T21:00:00Z'); // tomorrow
    expect(resolveDaySummaryAnchorMs({ firedForMs, nowMs, timeZone: 'UTC' })).toBe(nowMs);
  });

  it('falls back to now for a non-finite fired-for instant', () => {
    const nowMs = Date.parse('2026-08-02T12:00:00Z');
    expect(resolveDaySummaryAnchorMs({ firedForMs: NaN, nowMs, timeZone: 'UTC' })).toBe(nowMs);
  });

  it('anchors cross-midnight on the DEVICE path too (local components, no timeZone)', () => {
    // The production path: device zone IS the owner's midnight. Both instants are
    // built from local components, so the assertion holds under UTC+14 / UTC−10 CI.
    const firedForMs = new Date(2026, 7, 1, 21, 0).getTime(); // Sat 9pm local
    const nowAge1 = new Date(2026, 7, 2, 0, 40).getTime(); //   Sun 12:40am local
    expect(resolveDaySummaryAnchorMs({ firedForMs, nowMs: nowAge1 })).toBe(firedForMs);

    const nowAge2 = new Date(2026, 7, 3, 8, 0).getTime(); //    Mon morning local
    expect(resolveDaySummaryAnchorMs({ firedForMs, nowMs: nowAge2 })).toBe(nowAge2);
  });
});

describe('buildAnchoredDaySummary — anchor + empty-fired-day fallback (B-672 / R-4)', () => {
  // UTC-pinned (explicit timeZone + Z instants). The tap window: a Sat 9pm
  // notification tapped at 12:40am Sunday (age 1). Rows span BOTH days (the loader
  // fetches the fired-for-day-through-today window), so the fallback can re-clip.
  const firedForMs = Date.parse('2026-08-01T21:00:00Z'); // Sat 9pm — the fired-for day
  const nowMs = Date.parse('2026-08-02T00:40:00Z'); //      Sun 12:40am — age 1
  const satRow = mkRow({ id: 'sat', occurred_at: '2026-08-01T18:00:00Z' });
  const sunRow = mkRow({ id: 'sun', occurred_at: '2026-08-02T00:05:00Z' }); // logged after midnight
  const tz = 'UTC';

  it('renders the fired-for day when it HAS rows (B-672 — the whole point)', () => {
    const { model, renderedMs } = buildAnchoredDaySummary({
      pets: [pet('pet-1', 'Biscuit', [satRow, sunRow])],
      firedForMs,
      nowMs,
      timeZone: tz,
    });
    // Saturday has a row → it wins; Sunday's row is correctly not on Saturday's summary.
    expect(renderedMs).toBe(firedForMs);
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['sat']);
    expect(model.isEmpty).toBe(false);
  });

  it('falls back to TODAY when the fired-for day is empty but today has a fresh log (finding #1)', () => {
    // Saturday empty; the owner logged a symptom at 12:05am Sunday. Anchoring to the
    // empty Saturday would hide it behind "nothing in the record" — so today wins.
    const { model, renderedMs } = buildAnchoredDaySummary({
      pets: [pet('pet-1', 'Biscuit', [sunRow])],
      firedForMs,
      nowMs,
      timeZone: tz,
    });
    expect(renderedMs).toBe(nowMs);
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['sun']);
    expect(model.isEmpty).toBe(false);
  });

  it('renders TODAY (empty) when both days are empty — the empty state names today honestly', () => {
    const { model, renderedMs } = buildAnchoredDaySummary({
      pets: [pet('pet-1', 'Biscuit', [])],
      firedForMs,
      nowMs,
      timeZone: tz,
    });
    // The fallback lands on today, so the "…record today" copy is accurate.
    expect(renderedMs).toBe(nowMs);
    expect(model.isEmpty).toBe(true);
  });

  it('a same-day (age-0) tap renders today; no fallback path', () => {
    const sameDayFire = Date.parse('2026-08-02T21:00:00Z'); // Sun 9pm
    const sameDayNow = Date.parse('2026-08-02T21:05:00Z'); //  Sun 9:05pm
    const { model, renderedMs } = buildAnchoredDaySummary({
      pets: [pet('pet-1', 'Biscuit', [sunRow])],
      firedForMs: sameDayFire,
      nowMs: sameDayNow,
      timeZone: tz,
    });
    expect(renderedMs).toBe(sameDayFire);
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['sun']);
  });

  it('no fired-for instant → today (pre-B-672 default), even with an empty today', () => {
    const { renderedMs } = buildAnchoredDaySummary({
      pets: [pet('pet-1', 'Biscuit', [])],
      firedForMs: null,
      nowMs,
      timeZone: tz,
    });
    // No anchor → nowMs; not treated as an "empty past day", so no fallback churn.
    expect(renderedMs).toBe(nowMs);
  });

  it('a ≥2-day-old tap renders today, never the stale day (even if the stale day had rows)', () => {
    const staleFire = Date.parse('2026-07-31T21:00:00Z'); // Fri — 2 days before Sunday
    const friRow = mkRow({ id: 'fri', occurred_at: '2026-07-31T18:00:00Z' });
    const { model, renderedMs } = buildAnchoredDaySummary({
      pets: [pet('pet-1', 'Biscuit', [friRow, sunRow])],
      firedForMs: staleFire,
      nowMs, // Sunday
      timeZone: tz,
    });
    expect(renderedMs).toBe(nowMs);
    expect(model.sections[0].rows.map((r) => r.id)).toEqual(['sun']);
  });
});

describe('zero-log copy — G2: record state, never a wellness verdict', () => {
  // The clinical-guardrails invariant applied to an empty day: nothing here may
  // read a silent record as reassurance. This is the enforcement, not the review.
  const FORBIDDEN = [
    'all clear', 'all quiet', 'all good', 'nothing wrong', 'healthy', 'fine',
    'great', 'perfect', 'no problems', 'no issues', 'well', "you're good",
  ];
  const strings = [
    DAY_SUMMARY_ZERO_LOG.title,
    DAY_SUMMARY_ZERO_LOG.body,
    DAY_SUMMARY_ZERO_LOG.cta,
    petZeroLogLine('Biscuit'),
    daySummaryEmptyTitle('Biscuit'),
    daySummaryEmptyTitle(null),
  ];

  it('contains no reassurance / wellness-verdict language', () => {
    for (const s of strings) {
      const lower = s.toLowerCase();
      for (const bad of FORBIDDEN) {
        expect(lower).not.toContain(bad);
      }
    }
  });

  it('uses no exclamation marks (nyx-voice)', () => {
    for (const s of strings) expect(s).not.toContain('!');
  });

  it('names the pet in the per-pet line (a record fact about THIS pet’s day)', () => {
    expect(petZeroLogLine('Biscuit')).toContain('Biscuit');
    expect(petZeroLogLine('Biscuit').toLowerCase()).toContain('record');
  });

  it('names the pet in the single-pet empty title, stays neutral without one', () => {
    // Pattern 1 — the single-pet zero-log title names the pet (the wedge owner's
    // commonest empty state); a no-pet / multi-pet-all-empty screen can't pick one.
    expect(daySummaryEmptyTitle('Biscuit')).toContain('Biscuit');
    expect(daySummaryEmptyTitle(null)).toBe(DAY_SUMMARY_ZERO_LOG.title);
    expect(daySummaryEmptyTitle(undefined)).toBe(DAY_SUMMARY_ZERO_LOG.title);
    // A title, not the inline sentence — no trailing period.
    expect(daySummaryEmptyTitle('Biscuit').endsWith('.')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The rich single-pet recap (DR-1 §2 — C0 lead, C2 chips, C3 trial strip,
// C4 med strips, C5 forward line). The lead-line PRECEDENCE and the G2 register
// are the load-bearing, provable-without-a-DB parts.
// ═══════════════════════════════════════════════════════════════════════════

// A DaySummaryRow fixture (the describeDayEvent shape + id + sub-line).
function dsr(
  over: Partial<DaySummaryRow> & {
    id: string;
    category: DaySummaryRow['category'];
    eventType: string;
  },
): DaySummaryRow {
  return {
    title: 'Event',
    formatTag: null,
    detail: null,
    time: '9:00 AM',
    timeMs: 0,
    subline: null,
    ...over,
  } as DaySummaryRow;
}

// A running-trial RecapTrialFacts literal (structural — the internal type is
// consumed by the exported builders).
const tf = (over?: Partial<{ name: string; dayCounter: number; targetDays: number }>) => ({
  name: 'Whitefish trial',
  dayCounter: 12,
  targetDays: 28,
  ...over,
});

describe('buildLeadLine (C0) — fixed precedence: symptom → trial → counts', () => {
  it('a single symptom leads, named, with its time', () => {
    const rows = [
      dsr({ id: 'm1', category: 'meal', eventType: 'meal', time: '7:30 AM' }),
      dsr({ id: 'v1', category: 'symptom', eventType: 'vomit', time: '9:15 AM' }),
    ];
    expect(buildLeadLine(rows, 'Biscuit', null)).toBe(
      'One vomit in Biscuit’s record today — 9:15 AM.',
    );
  });

  it('multiple of one symptom drop the time and pluralise', () => {
    const rows = [
      dsr({ id: 'v1', category: 'symptom', eventType: 'vomit', time: '9:15 AM' }),
      dsr({ id: 'v2', category: 'symptom', eventType: 'vomit', time: '2:00 PM' }),
    ];
    expect(buildLeadLine(rows, 'Biscuit', null)).toBe('Two vomits in Biscuit’s record today.');
  });

  it('multiple symptom types read in GI-first order', () => {
    const rows = [
      dsr({ id: 's1', category: 'symptom', eventType: 'diarrhea' }),
      dsr({ id: 'v1', category: 'symptom', eventType: 'vomit' }),
      dsr({ id: 'v2', category: 'symptom', eventType: 'vomit' }),
    ];
    expect(buildLeadLine(rows, 'Mochi', null)).toBe(
      'Two vomits and one loose stool in Mochi’s record today.',
    );
  });

  it('a symptom OUTRANKS a running trial (precedence, not additive)', () => {
    const rows = [
      dsr({ id: 'm1', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'v1', category: 'symptom', eventType: 'vomit', time: '9:15 AM' }),
    ];
    // trial passed but the symptom still leads.
    expect(buildLeadLine(rows, 'Biscuit', tf())).toBe(
      'One vomit in Biscuit’s record today — 9:15 AM.',
    );
  });

  it('with no symptom, a running trial anchors the day on its day + meal count', () => {
    const rows = [
      dsr({ id: 'm1', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'm2', category: 'meal', eventType: 'meal' }),
      dsr({ id: 't1', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'd1', category: 'medication', eventType: 'medication' }),
    ];
    expect(buildLeadLine(rows, 'Biscuit', tf())).toBe(
      'Day 12 of the Whitefish trial — three meals in Biscuit’s record.',
    );
  });

  it('the trial lead drops the meal clause when no meal was logged', () => {
    const rows = [dsr({ id: 'd1', category: 'medication', eventType: 'medication' })];
    expect(buildLeadLine(rows, 'Biscuit', tf())).toBe('Day 12 of the Whitefish trial.');
  });

  it('with no symptom and no trial, the day’s counts lead', () => {
    const rows = [
      dsr({ id: 'm1', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'm2', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'm3', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'd1', category: 'medication', eventType: 'medication' }),
    ];
    expect(buildLeadLine(rows, 'Biscuit', null)).toBe(
      'Three meals and one dose in Biscuit’s record today.',
    );
  });

  it('an empty row set yields no lead (the screen renders the zero-log state)', () => {
    expect(buildLeadLine([], 'Biscuit', null)).toBeNull();
  });

  // Intake-is-not-preference at the headline: a refused bowl (detail === 'refused')
  // is surfaced in the lead, never buried as an ordinary "meal" (PROVISIONAL — flagged
  // for clinical-guardrails / Dr. Chen).
  describe('refusal surfacing (the wedge’s bad day)', () => {
    const refused = (id: string) => dsr({ id, category: 'meal', eventType: 'meal', detail: 'refused' });
    const eaten = (id: string) => dsr({ id, category: 'meal', eventType: 'meal', detail: 'all eaten' });

    it('a FULL-refusal trial day names the refusal, never reads as a fed day', () => {
      const rows = [refused('m1'), refused('m2'), refused('m3')];
      expect(buildLeadLine(rows, 'Biscuit', tf())).toBe(
        'Day 12 of the Whitefish trial — three meals in Biscuit’s record, all refused.',
      );
    });

    it('a partial-refusal trial day names how many were refused', () => {
      const rows = [refused('m1'), refused('m2'), eaten('m3')];
      expect(buildLeadLine(rows, 'Biscuit', tf())).toBe(
        'Day 12 of the Whitefish trial — three meals in Biscuit’s record, two refused.',
      );
    });

    it('surfaces refusal in the counts tier too (no trial)', () => {
      const rows = [refused('m1'), refused('m2'), dsr({ id: 'd1', category: 'medication', eventType: 'medication' })];
      expect(buildLeadLine(rows, 'Biscuit', null)).toBe(
        'Two meals and one dose in Biscuit’s record today, all refused.',
      );
    });

    it('an all-eaten day adds NO clause (the mock frame-1 lead is unchanged)', () => {
      const rows = [eaten('m1'), eaten('m2'), eaten('m3')];
      expect(buildLeadLine(rows, 'Biscuit', tf())).toBe(
        'Day 12 of the Whitefish trial — three meals in Biscuit’s record.',
      );
    });
  });
});

describe('C0 symptom-set coverage — the recap must not wash a clinical symptom (CUL-27)', () => {
  // The lead line's tier-1 precedence asks "is this a symptom?" via eventTintCategory →
  // SYMPTOM_TYPES. The rest of the clinical stack (generate-report REPORT_SYMPTOM_TYPES,
  // generate-signal CORRELATION_SYMPTOM_TYPES, hooks/useTrend) counts a BROADER set that
  // also includes `scratch` + `skin_reaction` — the canonical food-allergy outcomes. If
  // one of those becomes loggable (added to EVENT_TYPES / the quick-log) WITHOUT being
  // added to SYMPTOM_TYPES, its day washes to a neutral "one event" lead instead of
  // leading as a symptom — reassurance-by-omission, the exact failure C0 precedence
  // exists to prevent (adversarial-reviewer, CUL-27). They are UN-loggable today (absent
  // from EVENT_TYPES, so this holds), which is why this is a build-time TRIPWIRE, not a
  // live bug: it fails the moment either type is exposed but not classified as a symptom.
  const CLINICAL_SYMPTOM_TYPES = [
    'vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'lethargy',
    // W1 (CUL-675): cough + sneeze became loggable AND classified in the same PR
    // (the §6 pairing rule) — listed here so removing either from SYMPTOM_TYPES
    // later trips this wire exactly as it would for the GI core.
    'cough', 'sneeze',
  ] as const;

  it('every clinical symptom that is loggable today is classified as a symptom', () => {
    for (const t of CLINICAL_SYMPTOM_TYPES) {
      if (t in EVENT_TYPES) {
        // Loggable (in the picker) ⇒ MUST be a recap symptom, or its day washes to
        // a neutral lead. Fails if someone removes a live symptom from SYMPTOM_TYPES
        // or exposes scratch/skin_reaction without classifying it.
        expect(SYMPTOM_TYPES.has(t as EventTypeKey)).toBe(true);
      }
    }
  });

  it('names the reconciliation debt for the currently un-loggable clinical symptoms', () => {
    // Documents the known gap: scratch/skin_reaction are clinical symptoms the report
    // counts but the picker does not yet expose. When they are exposed, the guard above
    // turns red — the fix (add to SYMPTOM_TYPES + SYMPTOM_NOUN/CHIP_ORDER) rides that
    // picker work (backlog), not this finish pass. This assertion just pins the premise
    // so the tripwire's reasoning can't silently rot.
    const unloggable = CLINICAL_SYMPTOM_TYPES.filter((t) => !(t in EVENT_TYPES));
    expect(unloggable).toEqual(['scratch', 'skin_reaction']);
  });
});

describe('buildCountChips (C2) — per-category, symptom-toned, never totalled', () => {
  it('names each symptom, then meals, then doses — symptoms lead', () => {
    const rows = [
      dsr({ id: 'm1', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'm2', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'v1', category: 'symptom', eventType: 'vomit' }),
      dsr({ id: 'd1', category: 'medication', eventType: 'medication' }),
    ];
    const chips = buildCountChips(rows);
    expect(chips).toEqual([
      { key: 'vomit', label: '1 vomit', tone: 'symptom' },
      { key: 'meal', label: '2 meals', tone: 'neutral' },
      { key: 'medication', label: '1 dose', tone: 'neutral' },
    ]);
  });

  it('never emits a grand-total chip', () => {
    const rows = [
      dsr({ id: 'm1', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'v1', category: 'symptom', eventType: 'vomit' }),
    ];
    const labels = buildCountChips(rows).map((c) => c.label);
    expect(labels).not.toContain('2 events');
    expect(labels.some((l) => /total/i.test(l))).toBe(false);
  });
});

describe('buildTrialStrip (C3) — day-position + floor meal count, no ratio', () => {
  it('renders Day N of M · K trial-diet meals', () => {
    expect(buildTrialStrip(tf(), 2)).toEqual({
      title: 'Whitefish trial',
      fact: 'Day 12 of 28 · 2 trial-diet meals logged today',
    });
  });

  it('singularises one meal, and states zero honestly (a floor, never a verdict)', () => {
    expect(buildTrialStrip(tf(), 1).fact).toBe('Day 12 of 28 · 1 trial-diet meal logged today');
    expect(buildTrialStrip(tf(), 0).fact).toBe('Day 12 of 28 · 0 trial-diet meals logged today');
  });

  it('past target reads as an overrun, not "day 30 of 28"', () => {
    expect(buildTrialStrip(tf({ dayCounter: 30, targetDays: 28 }), 1).fact).toBe(
      'Day 30 — 2 days past · 1 trial-diet meal logged today',
    );
  });
});

describe('buildForwardLine (C5) — a real tomorrow-fact only', () => {
  it('names tomorrow’s within-target trial day', () => {
    expect(buildForwardLine(tf())).toBe('Tomorrow is day 13 of the trial.');
  });

  it('is absent at or past the target (never a manufactured day M+1)', () => {
    expect(buildForwardLine(tf({ dayCounter: 28, targetDays: 28 }))).toBeNull();
    expect(buildForwardLine(tf({ dayCounter: 30, targetDays: 28 }))).toBeNull();
  });

  it('is absent with no running trial', () => {
    expect(buildForwardLine(null)).toBeNull();
  });
});

describe('buildRecapMedStrips (C4) — inherits resolveMedStrips, drops the write', () => {
  function mkMed(over: Partial<MedStripModel> & { key: string }): MedStripModel {
    return {
      drugName: 'Amoxicillin',
      header: 'Amoxicillin · day 5 of 14',
      progressFraction: null,
      line: '2 of 2 doses logged today',
      collapsed: false,
      withholding: [],
      confirm: null,
      ...over,
    } as MedStripModel;
  }

  it('maps the model header/line onto a flat strip', () => {
    expect(buildRecapMedStrips([mkMed({ key: 'a' })])).toEqual([
      {
        key: 'a',
        title: 'Amoxicillin · day 5 of 14',
        fact: '2 of 2 doses logged today',
        isConcern: false,
      },
    ]);
  });

  it('flags a withholding fact as concern (never a cheery line over a refusal)', () => {
    const [strip] = buildRecapMedStrips([
      mkMed({ key: 'a', line: 'Yesterday’s dose refused', withholding: ['refused_dose'] as never }),
    ]);
    expect(strip.isConcern).toBe(true);
  });

  it('a collapsed course carries its fact in the header, no second line', () => {
    const [strip] = buildRecapMedStrips([
      mkMed({ key: 'a', header: 'Amoxicillin · 2 doses logged today', line: null, collapsed: true }),
    ]);
    expect(strip.fact).toBeNull();
    expect(strip.isConcern).toBe(false);
  });
});

describe('buildDaySummary — the rich single-pet recap end-to-end (§2)', () => {
  const nowMs = Date.parse('2026-08-15T12:00:00Z'); // Aug 15 → trial day 12
  const tz = 'UTC';

  function mkTrial(over?: Partial<TrialCardTrial>): TrialCardTrial {
    return {
      status: 'active',
      startedAt: '2026-08-04', // day 1 → Aug 15 is day 12
      targetDurationDays: 28,
      trialProtein: { protein: 'whitefish', source: null },
      ...over,
    } as TrialCardTrial;
  }
  function mkItem(eventId: string, occurredAt: string, verdict: string, role: string | null): TrialExposureItem {
    return { eventId, occurredAt, label: null, classification: { verdict, role } } as unknown as TrialExposureItem;
  }
  const meal = (id: string, occurred_at: string, over?: Partial<TimelineRow>) =>
    mkRow({ id, occurred_at, event_type: 'meal', food_type: 'meal', food_product_name: 'Whitefish', ...over });

  // The mock's trial-day frame: 2 prescribed-diet meals + a treat + a dose.
  const trialDayPet = (): DaySummaryPetInput => ({
    pet: { id: 'pet-1', name: 'Biscuit', species: 'dog' },
    rows: [
      meal('m1', '2026-08-15T07:42:00Z'),
      mkRow({ id: 'd1', occurred_at: '2026-08-15T08:05:00Z', event_type: 'medication', drug_generic_name: 'Apoquel', adherence: 'given' }),
      mkRow({ id: 't1', occurred_at: '2026-08-15T13:20:00Z', event_type: 'meal', food_type: 'treat' }),
      meal('m2', '2026-08-15T18:35:00Z'),
    ],
    trial: mkTrial(),
    trialItems: [
      mkItem('m1', '2026-08-15T07:42:00Z', 'permitted', 'primary_diet'),
      mkItem('m2', '2026-08-15T18:35:00Z', 'permitted', 'primary_diet'),
      mkItem('t1', '2026-08-15T13:20:00Z', 'permitted', 'permitted_treat'), // permitted, NOT the diet
      mkItem('m0', '2026-08-14T07:00:00Z', 'permitted', 'primary_diet'), // yesterday → excluded
    ],
  });

  it('marks only TODAY’s prescribed-diet meals "Trial diet" (positive marking, D2)', () => {
    const { sections } = buildDaySummary({ pets: [trialDayPet()], nowMs, timeZone: tz });
    const byId = Object.fromEntries(sections[0].rows.map((r) => [r.id, r.subline]));
    expect(byId).toEqual({ m1: 'Trial diet', m2: 'Trial diet', t1: null, d1: null });
  });

  it('the strip count EQUALS the number of "Trial diet" rows (one fact, two renders)', () => {
    const model = buildDaySummary({ pets: [trialDayPet()], nowMs, timeZone: tz });
    const marked = model.sections[0].rows.filter((r) => r.subline === 'Trial diet').length;
    expect(marked).toBe(2);
    expect(model.trialStrip).toEqual({
      title: trialIdentityLabel(mkTrial()),
      fact: 'Day 12 of 28 · 2 trial-diet meals logged today',
    });
  });

  it('composes the lead, chips and forward line from the same day', () => {
    const model = buildDaySummary({ pets: [trialDayPet()], nowMs, timeZone: tz });
    expect(model.lead).toBe('Day 12 of the Whitefish trial — three meals in Biscuit’s record.');
    expect(model.chips).toEqual([
      { key: 'meal', label: '3 meals', tone: 'neutral' },
      { key: 'medication', label: '1 dose', tone: 'neutral' },
    ]);
    expect(model.forward).toBe('Tomorrow is day 13 of the trial.');
  });

  it('a symptom day leads with the symptom and carries no trial strip/forward', () => {
    const pet1: DaySummaryPetInput = {
      pet: { id: 'pet-1', name: 'Biscuit', species: 'dog' },
      rows: [
        meal('m1', '2026-08-15T07:30:00Z', { intake_rating: 'refused' }),
        mkRow({ id: 'v1', occurred_at: '2026-08-15T09:15:00Z', event_type: 'vomit' }),
        meal('m2', '2026-08-15T18:20:00Z', { intake_rating: 'some' }),
      ],
      // no trial
    };
    const model = buildDaySummary({ pets: [pet1], nowMs, timeZone: tz });
    // The appended time comes from describeDayEvent, which formats in the DEVICE zone
    // (B-514) — so assert the STRUCTURE here, not a runner-zone-dependent clock value.
    // The exact single-symptom format is pinned by the buildLeadLine unit test above.
    expect(model.lead).toMatch(/^One vomit in Biscuit’s record today — .+\.$/);
    expect(model.chips[0]).toEqual({ key: 'vomit', label: '1 vomit', tone: 'symptom' });
    expect(model.trialStrip).toBeNull();
    expect(model.forward).toBeNull();
    expect(model.sections[0].rows.every((r) => r.subline === null)).toBe(true);
  });

  it('a NON-running trial (completed) mints no strip, forward, or sub-lines', () => {
    const p = trialDayPet();
    p.trial = mkTrial({ status: 'completed', endedAt: '2026-08-10' });
    const model = buildDaySummary({ pets: [p], nowMs, timeZone: tz });
    expect(model.trialStrip).toBeNull();
    expect(model.forward).toBeNull();
    expect(model.sections[0].rows.every((r) => r.subline === null)).toBe(true);
  });

  it('multi-pet renders plain per-pet spines — no lead/chips/strips/forward/sub-lines', () => {
    const a = trialDayPet(); // even carrying trial data…
    const b: DaySummaryPetInput = { pet: { id: 'pet-2', name: 'Mochi', species: 'cat' }, rows: [] };
    const model = buildDaySummary({ pets: [a, b], nowMs, timeZone: tz });
    expect(model.petCount).toBe(2);
    expect(model.lead).toBeNull();
    expect(model.chips).toEqual([]);
    expect(model.trialStrip).toBeNull();
    expect(model.medStrips).toEqual([]);
    expect(model.forward).toBeNull();
    // …the sub-lines stay off the multi-pet path (mock §2).
    expect(model.sections[0].rows.every((r) => r.subline === null)).toBe(true);
    expect(model.sections[1].isZeroLog).toBe(true);
  });

  it('the med strip day-math uses the RENDERED day, not the medInput’s baked nowMs', () => {
    // The med input is loaded against a wide window and carries a load-time nowMs; the
    // builder overrides it with the rendered day (the B-672 anchor). Bake a STALE, later
    // nowMs (Aug 20 → course day 17, past its 14-day target) and render an earlier day
    // (Aug 15 → day 12): the strip must read the rendered day, never the stale one.
    const medInput = {
      petId: 'pet-1',
      regimens: [
        {
          id: 'reg',
          medication_item_id: 'amox',
          drug_name: 'Amoxicillin',
          dose_amount: '250 mg',
          doses_per_day: 2,
          started_at: '2026-08-04',
          target_duration_days: 14,
        },
      ],
      doses: [],
      items: { amox: { generic_name: 'Amoxicillin', brand_name: null } },
      nowMs: Date.parse('2026-08-20T12:00:00Z'), // STALE — would render "day 17 … past"
      timeZone: 'UTC',
    } as MedStripInput;
    const petInput: DaySummaryPetInput = {
      pet: { id: 'pet-1', name: 'Biscuit', species: 'dog' },
      rows: [meal('m1', '2026-08-15T08:00:00Z')],
      medInput,
    };
    const model = buildDaySummary({ pets: [petInput], nowMs, timeZone: tz });
    expect(model.medStrips).toHaveLength(1);
    expect(model.medStrips[0].title).toContain('day 12 of 14');
  });

  it('G2 / Change-Contract: no surface string is a verdict, arrow or percentage', () => {
    // The guarantee is over the SPACE the recap can render, not one all-eaten example
    // (CUL-27 adversarial: the old test was single-fixture and skipped model.medStrips).
    // Cover the all-eaten trial day (the full model), a full-refusal trial day + a
    // partial-refusal counts day (mealRefusalClause), a multi-symptom day, and the
    // med-strip builder incl. a withholding (concern) fact — the strings the old test
    // excluded.
    const refusedMeal = (id: string) => dsr({ id, category: 'meal', eventType: 'meal', detail: 'refused' });
    const eatenMeal = (id: string) => dsr({ id, category: 'meal', eventType: 'meal', detail: 'all eaten' });
    const symptomRow = (id: string, eventType: string) =>
      dsr({ id, category: 'symptom', eventType, detail: null, time: '8:00 AM' });

    const strings: (string | null | undefined)[] = [];

    // 1 — the all-eaten trial day: the whole model, INCLUDING medStrips (empty here, but
    // the med-strip strings are added explicitly below so the scan covers them).
    const trialModel = buildDaySummary({ pets: [trialDayPet()], nowMs, timeZone: tz });
    strings.push(
      trialModel.lead,
      trialModel.forward,
      trialModel.trialStrip?.fact,
      trialModel.trialStrip?.title,
      ...trialModel.chips.map((c) => c.label),
      ...trialModel.sections[0].rows.map((r) => r.subline),
      ...trialModel.medStrips.flatMap((m) => [m.title, m.fact]),
    );

    // 2 — lead lines exercising the refusal clause + the multi-symptom tier.
    strings.push(
      buildLeadLine([refusedMeal('m1'), refusedMeal('m2'), refusedMeal('m3')], 'Biscuit', tf()), // "all refused"
      buildLeadLine([eatenMeal('m1'), refusedMeal('m2')], 'Biscuit', null), // "one refused"
      buildLeadLine(
        [symptomRow('s1', 'vomit'), symptomRow('s2', 'diarrhea'), symptomRow('s3', 'lethargy')],
        'Biscuit',
        null,
      ),
    );

    // 3 — the med-strip builder directly, incl. a withholding fact painted as concern
    // (the strings the old test omitted entirely).
    const medStrips = buildRecapMedStrips([
      { key: 'a', header: 'Amoxicillin · day 5 of 14', line: 'Dose 5 of 14 logged today', withholding: [], collapsed: false },
      { key: 'b', header: 'Gabapentin · 2 doses logged today', line: null, withholding: [], collapsed: true },
      { key: 'c', header: 'Insulin', line: 'Yesterday’s dose refused', withholding: ['refused_dose'], collapsed: false },
    ] as unknown as MedStripModel[]);
    strings.push(...medStrips.flatMap((m) => [m.title, m.fact]));

    const present = strings.filter((s): s is string => typeof s === 'string');
    expect(present.length).toBeGreaterThan(12); // a fixture silently emptying must fail loud

    // No reassurance / wellness verdict (clinical-guardrails G2), no comparison verdicts.
    const BANNED = [
      'all clear', 'all quiet', 'all good', 'healthy', 'looks good', 'looking good',
      'no concerns', 'nothing wrong', 'doing great', 'improving', 'improved',
      'getting better', 'worse', 'worsening', 'normal', 'great',
    ];
    for (const s of present) {
      const lower = s.toLowerCase();
      for (const bad of BANNED) expect(lower).not.toContain(bad);
      // The Change-Contract grammar: no arrows, no percentages, no exclamation.
      expect(s).not.toMatch(/[↑↓→%!]/);
    }
  });
});

// ── W1 real nouns (PR-3a landed them — this was the CUL-675 interim-fallback pin) ──
// PR-2 shipped capture with the noun FALLBACK carrying cough ("1 cough" via the
// lowercased label, un-pluralised); PR-3a moved both into SYMPTOM_NOUN /
// SYMPTOM_CHIP_ORDER. The singular is identical either way, so the PLURAL is the
// case that proves the real noun is live — the fallback would have said "2 cough".
describe('W1 — cough chips count and read through the real nouns (PR-3a)', () => {
  it('renders a symptom-toned "1 cough" chip ahead of meals (symptoms lead)', () => {
    const rows = [
      dsr({ id: 'm1', category: 'meal', eventType: 'meal' }),
      dsr({ id: 'c1', category: 'symptom', eventType: 'cough' }),
    ];
    const chips = buildCountChips(rows);
    expect(chips[0]).toEqual({ key: 'cough', label: '1 cough', tone: 'symptom' });
  });

  it('pluralises through the noun table — "2 coughs", not the fallback\'s "2 cough"', () => {
    const rows = [
      dsr({ id: 'c1', category: 'symptom', eventType: 'cough' }),
      dsr({ id: 'c2', category: 'symptom', eventType: 'cough' }),
      dsr({ id: 's1', category: 'symptom', eventType: 'sneeze' }),
    ];
    const chips = buildCountChips(rows);
    expect(chips[0]).toEqual({ key: 'cough', label: '2 coughs', tone: 'symptom' });
    expect(chips[1]).toEqual({ key: 'sneeze', label: '1 sneeze', tone: 'symptom' });
  });

  it('chip order slots the respiratory pair after the GI pair (family order)', () => {
    const rows = [
      dsr({ id: 'l1', category: 'symptom', eventType: 'lethargy' }),
      dsr({ id: 'c1', category: 'symptom', eventType: 'cough' }),
      dsr({ id: 'v1', category: 'symptom', eventType: 'vomit' }),
    ];
    const chips = buildCountChips(rows);
    expect(chips.map((c) => c.key)).toEqual(['vomit', 'cough', 'lethargy']);
  });
});
