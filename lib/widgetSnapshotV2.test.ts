// Widget V2 snapshot builders — pure logic, timezone-honest (B-514).
//
// Shapes pinned to docs/nyx-widget-requirements.md v2.0 §3. Every assertion pins an
// EXPLICIT `timeZone` so the suite means the same under the `App (jest, non-UTC
// timezones)` CI job as at UTC; the tz-honesty tests prove the builders READ that
// zone (the same instant buckets under a different local day when the zone changes,
// which a UTC-keyed implementation could not do).

// widgetSnapshotV2 imports getDietTrialProgress from ./analytics, which at module
// scope pulls in ./db (→ expo-sqlite) and ./feedingArrangements (→ ./sync →
// ./supabase, which throws without env). Stub both, as the sibling pure suites do.
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { localDayIndexOf } from './utils';
import type { ActiveTrialInfo } from './widgetResolution';
import type { WidgetSlotRow } from './widgetSnapshot';
import {
  buildSevenDays,
  buildTodayByClass,
  buildTrialSnapshot,
  buildUpNext,
  buildWidgetSnapshotV2,
  WIDGET_SEVEN_DAYS,
  type TodayEventRow,
} from './widgetSnapshotV2';

const NOON_UTC = Date.parse('2026-07-24T12:00:00.000Z');
const PLUS_14 = 'Pacific/Kiritimati'; // UTC+14, no DST
const MINUS_10 = 'Pacific/Honolulu'; // UTC−10, no DST

function te(eventClass: TodayEventRow['eventClass'], occurredAt: string, name: string | null = null): TodayEventRow {
  return { eventClass, occurredAt, name };
}

function slot(label: string, loggedAt: string | null, expectedWindow: string | null = null): WidgetSlotRow {
  return { label, loggedAt, expectedWindow };
}

describe('buildTodayByClass', () => {
  it('folds today (device-local) events into per-class {count,lastAt,names,times}', () => {
    const events = [
      te('meal', '2026-07-24T08:00:00.000Z', 'Kibble'),
      te('meal', '2026-07-24T12:00:00.000Z', 'Wet food'),
      te('meal', '2026-07-24T09:00:00.000Z', null), // counted, but unnamed → no name/time
      te('treat', '2026-07-24T15:00:00.000Z', 'Dentastix'),
      te('meal', '2026-07-23T20:00:00.000Z', 'Yesterday'), // excluded
    ];
    const out = buildTodayByClass({ events, nowMs: NOON_UTC, timeZone: 'UTC' });
    expect(out.meals.count).toBe(3); // all three of today's meals, incl. the unnamed one
    expect(out.meals.lastAt).toBe('2026-07-24T12:00:00.000Z');
    expect(out.meals.names).toEqual(['Wet food', 'Kibble']); // most-recent-first, named only
    expect(out.meals.times).toEqual(['2026-07-24T12:00:00.000Z', '2026-07-24T08:00:00.000Z']);
    expect(out.treats.count).toBe(1);
    expect(out.meds.count).toBe(0);
    expect(out.meds.expectedToday).toBeNull();
  });

  it('passes the med cadence denominator through and defaults it to null', () => {
    const events = [te('med', '2026-07-24T08:00:00.000Z', 'Amoxicillin')];
    expect(buildTodayByClass({ events, nowMs: NOON_UTC, timeZone: 'UTC', medExpectedToday: 2 }).meds).toMatchObject({
      count: 1,
      expectedToday: 2,
    });
    expect(buildTodayByClass({ events, nowMs: NOON_UTC, timeZone: 'UTC' }).meds.expectedToday).toBeNull();
  });

  it('sets the symptom leading type to the most recent symptom’s type', () => {
    const events = [
      te('symptom', '2026-07-24T10:00:00.000Z', 'Vomiting'),
      te('symptom', '2026-07-24T14:00:00.000Z', 'Diarrhea'),
    ];
    const out = buildTodayByClass({ events, nowMs: NOON_UTC, timeZone: 'UTC' });
    expect(out.symptoms.count).toBe(2);
    expect(out.symptoms.leadingType).toBe('Diarrhea');
    expect(out.symptoms.names).toEqual(['Diarrhea', 'Vomiting']);
  });

  it('renders an empty day as zeroed facts with null recency and no leading type', () => {
    const out = buildTodayByClass({ events: [], nowMs: NOON_UTC, timeZone: 'UTC' });
    expect(out.meals).toEqual({ count: 0, lastAt: null, names: [], times: [] });
    expect(out.symptoms.leadingType).toBeNull();
    expect(out.meds.expectedToday).toBeNull();
  });

  it('reads the injected zone — the SAME instant is today in one zone, not another', () => {
    const events = [te('meal', '2026-07-25T06:00:00.000Z', 'Kibble')];
    expect(buildTodayByClass({ events, nowMs: NOON_UTC, timeZone: 'UTC' }).meals.count).toBe(0);
    expect(buildTodayByClass({ events, nowMs: NOON_UTC, timeZone: PLUS_14 }).meals.count).toBe(1);
  });
});

describe('buildUpNext', () => {
  it('returns the first unlogged learned window as {label, approxTime}', () => {
    const slots = [slot('Breakfast', '2026-07-24T07:30:00.000Z', '~7a'), slot('Dinner', null, '~6p')];
    expect(buildUpNext({ slots })).toEqual({ label: 'Dinner', approxTime: '~6p' });
  });

  it('skips a slot with no learned window (no guessed tile)', () => {
    const slots = [slot('Dinner', null, null)];
    expect(buildUpNext({ slots })).toBeNull();
  });

  it('is null when every learned window is logged', () => {
    const slots = [slot('Breakfast', '2026-07-24T07:30:00.000Z', '~7a')];
    expect(buildUpNext({ slots })).toBeNull();
  });

  it('is null for a pet with no learned windows', () => {
    expect(buildUpNext({ slots: [] })).toBeNull();
  });
});

describe('buildSevenDays', () => {
  it('returns 7 local days oldest-first, today last, with the right keys', () => {
    const days = buildSevenDays({ events: [], nowMs: NOON_UTC, timeZone: 'UTC' });
    expect(days).toHaveLength(WIDGET_SEVEN_DAYS);
    expect(days[0].dayKey).toBe('2026-07-18');
    expect(days[6].dayKey).toBe('2026-07-24');
    expect(days.every((d) => d.logged === false && d.symptomLogged === false)).toBe(true);
  });

  it('sets logged and symptomLogged per local day and drops out-of-window rows', () => {
    const events = [
      { occurredAt: '2026-07-24T08:00:00.000Z', isSymptom: false }, // today: a tick
      { occurredAt: '2026-07-24T09:00:00.000Z', isSymptom: true }, // today: also a rose pip
      { occurredAt: '2026-07-20T10:00:00.000Z', isSymptom: false }, // tick only
      { occurredAt: '2026-07-17T10:00:00.000Z', isSymptom: false }, // before window — dropped
      { occurredAt: '2026-07-25T10:00:00.000Z', isSymptom: false }, // future — dropped
    ];
    const byKey = Object.fromEntries(buildSevenDays({ events, nowMs: NOON_UTC, timeZone: 'UTC' }).map((d) => [d.dayKey, d]));
    expect(byKey['2026-07-24']).toMatchObject({ logged: true, symptomLogged: true });
    expect(byKey['2026-07-20']).toMatchObject({ logged: true, symptomLogged: false });
    expect(byKey['2026-07-18']).toMatchObject({ logged: false, symptomLogged: false });
    // Nothing leaked in from the dropped rows.
    expect(Object.values(byKey).filter((d) => d.logged)).toHaveLength(2);
  });

  it('reads the injected zone — the same instant pips a different local day', () => {
    // 2026-07-24T06:00Z: UTC → the 24th; UTC−10 → 2026-07-23 20:00 → the 23rd.
    const events = [{ occurredAt: '2026-07-24T06:00:00.000Z', isSymptom: false }];
    const utc = Object.fromEntries(buildSevenDays({ events, nowMs: NOON_UTC, timeZone: 'UTC' }).map((d) => [d.dayKey, d.logged]));
    const hnl = Object.fromEntries(buildSevenDays({ events, nowMs: NOON_UTC, timeZone: MINUS_10 }).map((d) => [d.dayKey, d.logged]));
    expect(utc['2026-07-24']).toBe(true);
    expect(utc['2026-07-23']).toBe(false);
    expect(hnl['2026-07-23']).toBe(true);
    expect(hnl['2026-07-24']).toBe(false);
  });
});

describe('buildTrialSnapshot', () => {
  const running: ActiveTrialInfo = {
    startedAt: '2026-07-13',
    targetDurationDays: 28,
    foodItemId: 'food-1',
    foodLabel: "Hill's z/d",
  };
  const coverage = { daysLogged: 10, daysElapsed: 12 };

  it('projects day/target from progress and the coverage numbers from the lib', () => {
    const start = localDayIndexOf('2026-07-13', 'UTC')!;
    const snap = buildTrialSnapshot({
      trial: running,
      nowMs: NOON_UTC,
      timeZone: 'UTC',
      coverage,
      coveredDayIndices: [start, start + 2, start + 5],
    });
    expect(snap).toMatchObject({ day: 12, target: 28, daysLogged: 10, daysElapsed: 12 });
    expect(snap!.stripDays).toHaveLength(12); // one per elapsed day
    expect(snap!.stripDays[0].logged).toBe(true);
    expect(snap!.stripDays[2].logged).toBe(true);
    expect(snap!.stripDays[5].logged).toBe(true);
    expect(snap!.stripDays[1].logged).toBe(false);
  });

  it('takes daysLogged from coverage, never recomputes it from the strip set (AC 5)', () => {
    const start = localDayIndexOf('2026-07-13', 'UTC')!;
    const snap = buildTrialSnapshot({
      trial: running,
      nowMs: NOON_UTC,
      timeZone: 'UTC',
      // Deliberately inconsistent: coverage says 99, the set paints only 1 dot.
      coverage: { daysLogged: 99, daysElapsed: 12 },
      coveredDayIndices: [start],
    });
    expect(snap!.daysLogged).toBe(99); // the card's number wins — no third definition
    expect(snap!.stripDays.filter((d) => d.logged)).toHaveLength(1);
  });

  it('is null for no trial, no coverage, or a stale trial (B-422)', () => {
    expect(buildTrialSnapshot({ trial: null, nowMs: NOON_UTC, timeZone: 'UTC', coverage })).toBeNull();
    expect(buildTrialSnapshot({ trial: running, nowMs: NOON_UTC, timeZone: 'UTC', coverage: null })).toBeNull();
    const stale = { ...running, startedAt: '2026-01-01' };
    expect(buildTrialSnapshot({ trial: stale, nowMs: NOON_UTC, timeZone: 'UTC', coverage })).toBeNull();
  });

  it('paints an all-hollow strip when no covered days are supplied', () => {
    const snap = buildTrialSnapshot({ trial: running, nowMs: NOON_UTC, timeZone: 'UTC', coverage });
    expect(snap!.stripDays).toHaveLength(12);
    expect(snap!.stripDays.every((d) => d.logged === false)).toBe(true);
  });

  it('reads the injected zone for the day counter', () => {
    const t: ActiveTrialInfo = { ...running, startedAt: '2026-07-24' };
    expect(buildTrialSnapshot({ trial: t, nowMs: NOON_UTC, timeZone: 'UTC', coverage: { daysLogged: 1, daysElapsed: 1 } })?.day).toBe(1);
    expect(buildTrialSnapshot({ trial: t, nowMs: NOON_UTC, timeZone: PLUS_14, coverage: { daysLogged: 1, daysElapsed: 2 } })?.day).toBe(2);
  });
});

describe('buildWidgetSnapshotV2', () => {
  it('assembles the four fields from one input', () => {
    const start = localDayIndexOf('2026-07-13', 'UTC')!;
    const v2 = buildWidgetSnapshotV2({
      today: [te('meal', '2026-07-24T08:00:00.000Z', 'Kibble'), te('symptom', '2026-07-24T10:00:00.000Z', 'Vomiting')],
      medExpectedToday: 2,
      slots: [slot('Dinner', null, '~6p')],
      sevenDayEvents: [{ occurredAt: '2026-07-24T08:00:00.000Z', isSymptom: true }],
      trial: { startedAt: '2026-07-13', targetDurationDays: 28, foodItemId: 'f', foodLabel: 'z/d' },
      trialCoverage: { daysLogged: 8, daysElapsed: 12 },
      trialCoveredDayIndices: [start],
      nowMs: NOON_UTC,
      timeZone: 'UTC',
    });
    expect(v2.todayByClass.meals.count).toBe(1);
    expect(v2.todayByClass.symptoms.leadingType).toBe('Vomiting');
    expect(v2.todayByClass.meds.expectedToday).toBe(2);
    expect(v2.upNext).toEqual({ label: 'Dinner', approxTime: '~6p' });
    expect(v2.sevenDays).toHaveLength(WIDGET_SEVEN_DAYS);
    expect(v2.sevenDays[6]).toMatchObject({ dayKey: '2026-07-24', logged: true, symptomLogged: true });
    expect(v2.trial).toMatchObject({ day: 12, target: 28, daysLogged: 8, daysElapsed: 12 });
  });
});
