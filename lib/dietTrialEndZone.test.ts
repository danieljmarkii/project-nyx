// CUL-2094 — a trial's length is counted in the OWNER's days, whatever zone reads it.
//
// `ended_at` and `started_at` are DATE columns, written from the writing device's own
// local day (`endActiveTrial` → `toLocalDayKey`), so both ends of the trial are already
// owner-local and `localDayIndexOf` reads them zone-free. "Today" is not: it is the
// READER's local day. When the owner's end date is ahead of the reader's today (a
// report run in a zone still on the previous day), `min(today, end)` cut the trial one
// day short, and the report printed "Marked complete at day 55 — 1 day short of the
// 56-day window" over a trial that ran all 56.
//
// Every instant below is a literal UTC string and every zone is fixed-offset
// (America/Phoenix is UTC−7 all year, Pacific/Noumea UTC+11), so no assertion depends
// on the runner's own zone or on a DST transition.
import { createHash } from 'crypto';
import {
  computeTrialFacts,
  type AllowedFood,
  type TrialFacts,
  type TrialFeeding,
  type TrialSpec,
} from './dietTrial';
import { dayKeyFromIndex, localDayIndexOf } from './utils';

const UTC_MINUS_7 = 'America/Phoenix';
const UTC_PLUS_11 = 'Pacific/Noumea';

const DUCK: AllowedFood = {
  foodItemId: 'dry-duck',
  foodKey: 'royal caninduck dry',
  label: 'Royal Canin Duck Dry',
  role: 'primary_diet',
  allowedFrom: '2026-01-01',
  allowedUntil: null,
  primaryProtein: 'duck',
  proteins: ['duck'],
};

function dayIdx(day: string): number {
  const i = localDayIndexOf(day);
  if (i === null) throw new Error(`unparseable fixture day ${day}`);
  return i;
}

/** One meal a day at `hourUtc` on each fixture day. The caller picks the hour that
 *  is local midday in the report's zone, so every meal sits on the day it names. */
function dailyMeals(fromDay: string, toDay: string, hourUtc: number): TrialFeeding[] {
  const out: TrialFeeding[] = [];
  for (let d = dayIdx(fromDay); d <= dayIdx(toDay); d += 1) {
    const iso = `${dayKeyFromIndex(d)}T${String(hourUtc).padStart(2, '0')}:00:00.000Z`;
    out.push({
      eventId: `m-${d}`,
      occurredAt: iso,
      foodItemId: DUCK.foodItemId,
      foodKey: DUCK.foodKey,
      label: DUCK.label,
      foodType: 'meal',
      proteins: ['duck'],
    });
  }
  return out;
}

/** The hour (UTC) that lands at local midday in each report zone. */
const MIDDAY_UTC: Record<string, number> = { [UTC_MINUS_7]: 19, [UTC_PLUS_11]: 1, UTC: 12 };

function facts(args: {
  trial: TrialSpec;
  nowIso: string;
  timeZone: string;
  mealsFrom: string;
  mealsTo: string;
  scopeStart?: string | null;
  scopeEnd?: string | null;
}): TrialFacts {
  return computeTrialFacts({
    trial: args.trial,
    allowedFoods: [DUCK],
    feedings: dailyMeals(args.mealsFrom, args.mealsTo, MIDDAY_UTC[args.timeZone]),
    nowMs: Date.parse(args.nowIso),
    scopeStart: args.scopeStart ?? null,
    scopeEnd: args.scopeEnd ?? null,
    timeZone: args.timeZone,
  });
}

// ── Direction 1: a full-length trial is never called short ──────────────────
//
// 56-day dog trial from May 9; day 56 is Jul 3. The owner taps "complete" just after
// midnight on Jul 3 in a zone AHEAD of the report's, so `ended_at` is '2026-07-03'
// while the report's own calendar still reads Jul 2.
describe('CUL-2094 direction 1 — the end date is ahead of the reader’s today', () => {
  const FULL: TrialSpec = {
    id: 't-full',
    startedAt: '2026-05-09',
    endedAt: '2026-07-03',
    targetDurationDays: 56,
    species: 'dog',
  };

  it.each([
    // Writer in Noumea (UTC+11) at 09:30 Jul 3 = 22:30Z Jul 2 → Phoenix 15:30 Jul 2.
    [UTC_MINUS_7, '2026-07-02T23:30:00.000Z'],
    // Writer on Kiritimati (UTC+14) at 00:30 Jul 3 = 10:30Z Jul 2 → Noumea 21:30 Jul 2.
    [UTC_PLUS_11, '2026-07-02T10:45:00.000Z'],
  ])('counts all 56 days when the report runs in %s', (tz, nowIso) => {
    // The fixture is only a test of the bug if the reader really is a day behind.
    expect(localDayIndexOf(nowIso, tz)).toBe(dayIdx('2026-07-02'));
    const f = facts({ trial: FULL, nowIso, timeZone: tz, mealsFrom: '2026-05-09', mealsTo: '2026-07-01' });
    expect(f.trialDaysElapsed).toBe(56);
    // Nothing of a full-record report falls "after" it: the end is the owner's, not a
    // window the report closed early (the render's "as of" suffix keys on this).
    expect(f.trialDaysOutsideRange).toEqual({ before: 0, after: 0 });
    // The evidence end — the report's "N days, of a 56-day window" — reaches day 56.
    expect(f.range!.endDayIndex).toBe(dayIdx('2026-07-03'));
  });

  it('is unchanged when the same report runs a day later in the reader’s zone', () => {
    const f = facts({
      trial: FULL,
      nowIso: '2026-07-03T23:30:00.000Z',
      timeZone: UTC_MINUS_7,
      mealsFrom: '2026-05-09',
      mealsTo: '2026-07-03',
    });
    expect(f.trialDaysElapsed).toBe(56);
    expect(f.trialDaysOutsideRange).toEqual({ before: 0, after: 0 });
  });

  it('still counts the owner’s days when the report window ends on the reader’s today', () => {
    // `resolveScope` closes every report at the reader's today; that bound is "now",
    // not a window the owner chose, so it must not cut the owner's last day off.
    const f = facts({
      trial: FULL,
      nowIso: '2026-07-02T23:30:00.000Z',
      timeZone: UTC_MINUS_7,
      mealsFrom: '2026-05-09',
      mealsTo: '2026-07-01',
      scopeStart: '2026-04-04',
      scopeEnd: '2026-07-02',
    });
    expect(f.trialDaysElapsed).toBe(56);
    expect(f.trialDaysOutsideRange).toEqual({ before: 0, after: 0 });
  });

  it('keeps a window the owner closed in the past as a window', () => {
    // A hand-picked window ending Jun 20 still leaves 13 trial days after it.
    const f = facts({
      trial: FULL,
      nowIso: '2026-07-02T23:30:00.000Z',
      timeZone: UTC_MINUS_7,
      mealsFrom: '2026-05-09',
      mealsTo: '2026-07-01',
      scopeStart: '2026-05-09',
      scopeEnd: '2026-06-20',
    });
    expect(f.trialDaysElapsed).toBe(56);
    expect(f.trialDaysOutsideRange.after).toBe(dayIdx('2026-07-03') - dayIdx('2026-06-20'));
  });

  it('counts an end two days ahead — the widest real gap between two zones’ dates', () => {
    // UTC+14 vs UTC−12 is 26 hours: a Kiritimati tap at 00:30 Jul 4 is 22:30 Jul 2 on
    // Baker Island, so an honest end date can sit two days past the reader's today.
    const f = facts({
      trial: { ...FULL, endedAt: '2026-07-04', targetDurationDays: 57 },
      nowIso: '2026-07-02T23:30:00.000Z',
      timeZone: UTC_MINUS_7,
      mealsFrom: '2026-05-09',
      mealsTo: '2026-07-01',
    });
    expect(f.trialDaysElapsed).toBe(57);
  });

  it('does not count a corrupt end further ahead than any zone can be', () => {
    // Three days past the reader's today is not the owner's clock. It keeps the old
    // clamp to the reader's today: the shorter count, which says "short", never "complete".
    const f = facts({
      trial: { ...FULL, endedAt: '2026-07-20' },
      nowIso: '2026-07-02T23:30:00.000Z',
      timeZone: UTC_MINUS_7,
      mealsFrom: '2026-05-09',
      mealsTo: '2026-07-01',
    });
    expect(f.trialDaysElapsed).toBe(55);
  });
});

// ── Direction 2: a trial ended short is never called complete ───────────────
//
// 28-day trial from Jun 6; day 27 is Jul 2. The owner stops it at 22:00 on Jul 2 in a
// zone BEHIND the report's, so `ended_at` is '2026-07-02' while the reader is on Jul 3.
describe('CUL-2094 direction 2 — the end date is behind the reader’s today', () => {
  const SHORT: TrialSpec = {
    id: 't-short',
    startedAt: '2026-06-06',
    endedAt: '2026-07-02',
    targetDurationDays: 28,
    species: 'dog',
  };

  it.each([
    // Writer in Pago Pago (UTC−11) at 22:00 Jul 2 = 09:00Z Jul 3 → Phoenix 02:00 Jul 3.
    [UTC_MINUS_7, '2026-07-03T09:05:00.000Z'],
    // Writer in New York (UTC−4) at 22:00 Jul 2 = 02:00Z Jul 3 → Noumea 13:00 Jul 3.
    [UTC_PLUS_11, '2026-07-03T02:05:00.000Z'],
  ])('counts 27 of 28 when the report runs in %s', (tz, nowIso) => {
    expect(localDayIndexOf(nowIso, tz)).toBe(dayIdx('2026-07-03'));
    const f = facts({ trial: SHORT, nowIso, timeZone: tz, mealsFrom: '2026-06-06', mealsTo: '2026-07-02' });
    expect(f.trialDaysElapsed).toBe(27);
    expect(f.trialDaysElapsed).toBeLessThan(SHORT.targetDurationDays!);
    expect(f.range!.endDayIndex).toBe(dayIdx('2026-07-02'));
  });
});

// ── Before / after: every other trial reads exactly as it did ───────────────
//
// The digests below were captured from `main` BEFORE the fix (commit a8efdd9) by
// running this grid with CUL2094_CAPTURE=1. Every case has its end on or before the
// reader's today, or no end at all, so the fix must leave every field byte-identical.
const GRID_TRIALS: Record<string, TrialSpec> = {
  active: { id: 'g-active', startedAt: '2026-05-09', targetDurationDays: 56, species: 'dog' },
  activeOverrun: { id: 'g-over', startedAt: '2026-03-01', targetDurationDays: 56, species: 'cat' },
  endedPast: { id: 'g-past', startedAt: '2026-05-09', endedAt: '2026-06-20', targetDurationDays: 56, species: 'dog' },
  endedToday: { id: 'g-today', startedAt: '2026-05-09', endedAt: '2026-07-02', targetDurationDays: 56, species: 'dog' },
  endedOnTarget: { id: 'g-target', startedAt: '2026-05-08', endedAt: '2026-07-02', targetDurationDays: 56, species: 'dog' },
};
const GRID_SCOPES: Record<string, { scopeStart: string | null; scopeEnd: string | null }> = {
  none: { scopeStart: null, scopeEnd: null },
  toToday: { scopeStart: '2026-04-04', scopeEnd: '2026-07-02' },
  sinceVisit: { scopeStart: '2026-06-01', scopeEnd: '2026-07-02' },
  pastWindow: { scopeStart: '2026-05-15', scopeEnd: '2026-06-10' },
};
const GRID_ZONES = [UTC_MINUS_7, UTC_PLUS_11, 'UTC'];

function digest(f: TrialFacts): string {
  return createHash('sha256').update(JSON.stringify(f)).digest('hex').slice(0, 16);
}

function gridCases(): Array<[string, TrialFacts]> {
  const out: Array<[string, TrialFacts]> = [];
  for (const [tName, trial] of Object.entries(GRID_TRIALS)) {
    for (const [sName, scope] of Object.entries(GRID_SCOPES)) {
      for (const tz of GRID_ZONES) {
        // Midday Jul 2 in each zone, so the reader's today is Jul 2 everywhere.
        const nowIso = `2026-07-02T${String(MIDDAY_UTC[tz]).padStart(2, '0')}:30:00.000Z`;
        out.push([
          `${tName}/${sName}/${tz}`,
          facts({ trial, nowIso, timeZone: tz, mealsFrom: '2026-03-01', mealsTo: '2026-07-02', ...scope }),
        ]);
      }
    }
  }
  return out;
}

const GOLDEN: Record<string, string> = {
  'active/none/America/Phoenix': '4c94fa8a038404ed',
  'active/none/Pacific/Noumea': '4c94fa8a038404ed',
  'active/none/UTC': '4c94fa8a038404ed',
  'active/toToday/America/Phoenix': '4c94fa8a038404ed',
  'active/toToday/Pacific/Noumea': '4c94fa8a038404ed',
  'active/toToday/UTC': '4c94fa8a038404ed',
  'active/sinceVisit/America/Phoenix': 'cbcda1ffcdb48b9e',
  'active/sinceVisit/Pacific/Noumea': 'cbcda1ffcdb48b9e',
  'active/sinceVisit/UTC': 'cbcda1ffcdb48b9e',
  'active/pastWindow/America/Phoenix': 'bab25060ede99d06',
  'active/pastWindow/Pacific/Noumea': 'bab25060ede99d06',
  'active/pastWindow/UTC': 'bab25060ede99d06',
  'activeOverrun/none/America/Phoenix': '1220562f8a879f2f',
  'activeOverrun/none/Pacific/Noumea': '1220562f8a879f2f',
  'activeOverrun/none/UTC': '1220562f8a879f2f',
  'activeOverrun/toToday/America/Phoenix': '20986021e75bb1ca',
  'activeOverrun/toToday/Pacific/Noumea': '20986021e75bb1ca',
  'activeOverrun/toToday/UTC': '20986021e75bb1ca',
  'activeOverrun/sinceVisit/America/Phoenix': '9eb8366346521edb',
  'activeOverrun/sinceVisit/Pacific/Noumea': '9eb8366346521edb',
  'activeOverrun/sinceVisit/UTC': '9eb8366346521edb',
  'activeOverrun/pastWindow/America/Phoenix': '372a98c1f4a26293',
  'activeOverrun/pastWindow/Pacific/Noumea': '372a98c1f4a26293',
  'activeOverrun/pastWindow/UTC': '372a98c1f4a26293',
  'endedPast/none/America/Phoenix': '7b1a1e7b6deaa4df',
  'endedPast/none/Pacific/Noumea': '7b1a1e7b6deaa4df',
  'endedPast/none/UTC': '7b1a1e7b6deaa4df',
  'endedPast/toToday/America/Phoenix': '7b1a1e7b6deaa4df',
  'endedPast/toToday/Pacific/Noumea': '7b1a1e7b6deaa4df',
  'endedPast/toToday/UTC': '7b1a1e7b6deaa4df',
  'endedPast/sinceVisit/America/Phoenix': 'de77a510f4c73de8',
  'endedPast/sinceVisit/Pacific/Noumea': 'de77a510f4c73de8',
  'endedPast/sinceVisit/UTC': 'de77a510f4c73de8',
  'endedPast/pastWindow/America/Phoenix': '9eba7789031007ce',
  'endedPast/pastWindow/Pacific/Noumea': '9eba7789031007ce',
  'endedPast/pastWindow/UTC': '9eba7789031007ce',
  'endedToday/none/America/Phoenix': '4c94fa8a038404ed',
  'endedToday/none/Pacific/Noumea': '4c94fa8a038404ed',
  'endedToday/none/UTC': '4c94fa8a038404ed',
  'endedToday/toToday/America/Phoenix': '4c94fa8a038404ed',
  'endedToday/toToday/Pacific/Noumea': '4c94fa8a038404ed',
  'endedToday/toToday/UTC': '4c94fa8a038404ed',
  'endedToday/sinceVisit/America/Phoenix': 'cbcda1ffcdb48b9e',
  'endedToday/sinceVisit/Pacific/Noumea': 'cbcda1ffcdb48b9e',
  'endedToday/sinceVisit/UTC': 'cbcda1ffcdb48b9e',
  'endedToday/pastWindow/America/Phoenix': 'bab25060ede99d06',
  'endedToday/pastWindow/Pacific/Noumea': 'bab25060ede99d06',
  'endedToday/pastWindow/UTC': 'bab25060ede99d06',
  'endedOnTarget/none/America/Phoenix': '969df257b471693e',
  'endedOnTarget/none/Pacific/Noumea': '969df257b471693e',
  'endedOnTarget/none/UTC': '969df257b471693e',
  'endedOnTarget/toToday/America/Phoenix': '969df257b471693e',
  'endedOnTarget/toToday/Pacific/Noumea': '969df257b471693e',
  'endedOnTarget/toToday/UTC': '969df257b471693e',
  'endedOnTarget/sinceVisit/America/Phoenix': '04e87361a499ea70',
  'endedOnTarget/sinceVisit/Pacific/Noumea': '04e87361a499ea70',
  'endedOnTarget/sinceVisit/UTC': '04e87361a499ea70',
  'endedOnTarget/pastWindow/America/Phoenix': '8c8e0cd72be6a5af',
  'endedOnTarget/pastWindow/Pacific/Noumea': '8c8e0cd72be6a5af',
  'endedOnTarget/pastWindow/UTC': '8c8e0cd72be6a5af',
};

describe('CUL-2094 before/after — trials the fix must not touch', () => {
  const cases = gridCases();

  if (process.env.CUL2094_CAPTURE === '1') {
    it('prints the digests', () => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(Object.fromEntries(cases.map(([k, f]) => [k, digest(f)])), null, 2));
    });
    return;
  }

  it('covers the whole grid', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual(cases.map(([k]) => k).sort());
  });

  it.each(cases)('%s is byte-identical to main', (key, f) => {
    expect(digest(f)).toBe(GOLDEN[key]);
  });
});
