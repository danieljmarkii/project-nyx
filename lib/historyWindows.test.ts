// History's window table (CUL-1160; spec §3.9, AC 28, AC 31's window half).
//
// FIXTURES ARE ONES THE REAL CALLER COULD HAND OVER (C-35). `today` is derived exactly as
// the screen derives it, `toLocalDayKey` over an instant built from LOCAL components
// (C-29), so the non-UTC CI job's clocks decide nothing. The trial facts come from the
// real `computeTrialFacts` rather than a hand-typed `exposureRange`, so "a trial that
// ended yesterday" is the predicate's own answer about such a trial. The visit bound
// comes from `latestVisitBefore`, the only thing that can mint one.
//
// The main table is the mock's own (round 5's `BOUNDS`, Nyx's real record through Mon
// Sep 21): the screen and its design authority agree on every window by construction.

/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

import { blankComments } from '../guards/blankComments';
import { computeTrialFacts, type TrialSpec } from './dietTrial';
import {
  ALL_TIME,
  monthGroups,
  offeredWindows,
  resolveWindow,
  sameWindow,
  weekStartOf,
  windowBounds,
  windowFromParam,
  windowLabel,
  windowParam,
  type HistoryWindowKey,
  type WindowBounds,
  type WindowFacts,
} from './historyWindows';
import { localDayIndexOf, toLocalDayKey } from './utils';
import { latestVisitBefore } from './visitWindow';

/** Local noon on a calendar day: the instant the screen would hold at lunchtime. */
const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0);

/** A trial's facts as the real predicate computes them for a pet with no feedings yet. */
function trialFacts(spec: Partial<TrialSpec> & { startedAt: string }, now: Date) {
  return computeTrialFacts({
    trial: { id: 'trial-1', ...spec },
    allowedFoods: [],
    feedings: [],
    nowMs: now.getTime(),
  });
}

/** Nyx's record, round 5: first logged May 14, a trial since Jul 26, a visit Sep 16. */
const NOW = localNoon(2026, 9, 21);
const TODAY = toLocalDayKey(NOW);
const NYX: WindowFacts = {
  today: TODAY,
  firstRecordDay: '2026-05-14',
  trial: trialFacts({ startedAt: '2026-07-26', targetDurationDays: 84 }, NOW),
  sinceVisit: latestVisitBefore(['2026-09-16'], TODAY),
};

const b = (fromDay: string, toDay: string): WindowBounds => ({ fromDay, toDay });

/** Inclusive count of local days in a window. */
const dayCount = (w: WindowBounds) =>
  (localDayIndexOf(w.toDay) as number) - (localDayIndexOf(w.fromDay) as number) + 1;

describe('the window table (spec §3.9), over the mock’s own record', () => {
  it('today is the fixture the mock was drawn on', () => {
    expect(TODAY).toBe('2026-09-21');
  });

  it.each<[string, HistoryWindowKey, WindowBounds]>([
    ['All time', { kind: 'all' }, b('2026-05-14', '2026-09-21')],
    ['Today', { kind: 'today' }, b('2026-09-21', '2026-09-21')],
    ['Last 7 days', { kind: 'last', days: 7 }, b('2026-09-15', '2026-09-21')],
    ['Last 14 days', { kind: 'last', days: 14 }, b('2026-09-08', '2026-09-21')],
    ['Last 30 days', { kind: 'last', days: 30 }, b('2026-08-23', '2026-09-21')],
    ['Since the trial started', { kind: 'trial' }, b('2026-07-26', '2026-09-21')],
    ['Since the last vet visit', { kind: 'visit' }, b('2026-09-16', '2026-09-21')],
    ['September (clipped at today)', { kind: 'month', month: '2026-09' }, b('2026-09-01', '2026-09-21')],
    ['August', { kind: 'month', month: '2026-08' }, b('2026-08-01', '2026-08-31')],
    ['May (clipped at the record’s start)', { kind: 'month', month: '2026-05' }, b('2026-05-14', '2026-05-31')],
  ])('%s', (_name, key, expected) => {
    expect(windowBounds(key, NYX)).toEqual(expected);
  });

  it('the rolling windows are N local days, never N × 24 hours', () => {
    for (const days of [7, 14, 30] as const) {
      expect(dayCount(windowBounds({ kind: 'last', days }, NYX) as WindowBounds)).toBe(days);
    }
  });

  it('a month the record never reached, or has not reached yet, is not offered', () => {
    expect(windowBounds({ kind: 'month', month: '2026-04' }, NYX)).toBeNull();
    expect(windowBounds({ kind: 'month', month: '2026-10' }, NYX)).toBeNull();
    expect(windowBounds({ kind: 'month', month: '2026-13' }, NYX)).toBeNull();
  });
});

describe('never before the record (GAP-24) — the Data Scientist lens', () => {
  const young: WindowFacts = { ...NYX, firstRecordDay: '2026-09-19' };

  it('every window starts no earlier than the pet’s first record', () => {
    const keys: HistoryWindowKey[] = [
      { kind: 'all' },
      { kind: 'last', days: 7 },
      { kind: 'last', days: 30 },
      { kind: 'trial' }, // started Jul 26, long before this record
      { kind: 'visit' }, // Sep 16, before it too
      { kind: 'month', month: '2026-09' },
    ];
    for (const key of keys) {
      expect(windowBounds(key, young)).toEqual(b('2026-09-19', '2026-09-21'));
    }
  });

  it('a clipped window keeps its own name and anchor: only the bounds move', () => {
    expect(windowLabel({ kind: 'trial' }, young)?.short).toBe('Since Jul 26');
    expect(windowLabel({ kind: 'last', days: 30 }, young)?.long).toBe('Last 30 days');
  });

  it('an empty record puts nothing before today in any window, and offers no month', () => {
    const empty: WindowFacts = { ...NYX, firstRecordDay: null };
    expect(windowBounds({ kind: 'all' }, empty)).toEqual(b(TODAY, TODAY));
    expect(windowBounds({ kind: 'last', days: 30 }, empty)).toEqual(b(TODAY, TODAY));
    expect(windowBounds({ kind: 'month', month: '2026-09' }, empty)).toBeNull();
    expect(monthGroups(empty)).toEqual([]);
    expect(windowLabel({ kind: 'all' }, empty)?.sheetSub).toBeNull();
  });

  it('a first record dated after today never inverts a window', () => {
    const skewed: WindowFacts = { ...NYX, firstRecordDay: '2026-09-25' };
    expect(windowBounds({ kind: 'all' }, skewed)).toEqual(b(TODAY, TODAY));
    expect(windowBounds({ kind: 'last', days: 7 }, skewed)).toEqual(b(TODAY, TODAY));
    expect(windowLabel({ kind: 'all' }, skewed)?.sheetSub).toBe('since Sep 21');
  });
});

describe('since the last vet visit (H-11) — a same-day visit', () => {
  it('a visit saved today anchors nothing today: the window is not offered', () => {
    const facts: WindowFacts = { ...NYX, sinceVisit: latestVisitBefore([TODAY], TODAY) };
    expect(windowBounds({ kind: 'visit' }, facts)).toBeNull();
    expect(offeredWindows(facts)).not.toContainEqual({ kind: 'visit' });
  });

  it('with an earlier visit on record, today’s is skipped and the earlier one anchors', () => {
    const facts: WindowFacts = {
      ...NYX,
      sinceVisit: latestVisitBefore(['2026-09-02', TODAY], TODAY),
    };
    expect(windowBounds({ kind: 'visit' }, facts)).toEqual(b('2026-09-02', TODAY));
  });

  it('the day after, today’s visit is the anchor, and its day is in the window', () => {
    const tomorrow = toLocalDayKey(localNoon(2026, 9, 22));
    const facts: WindowFacts = {
      ...NYX,
      today: tomorrow,
      sinceVisit: latestVisitBefore(['2026-09-02', TODAY], tomorrow),
    };
    expect(windowBounds({ kind: 'visit' }, facts)).toEqual(b(TODAY, tomorrow));
  });

  it('a bound computed for a later day than today is refused, not trusted', () => {
    // A stale-clock mismatch between the read and the render: the window table re-checks
    // "strictly before today" instead of assuming whoever minted the bound agreed.
    const facts: WindowFacts = { ...NYX, sinceVisit: latestVisitBefore([TODAY], '2026-09-22') };
    expect(windowBounds({ kind: 'visit' }, facts)).toBeNull();
  });

  it('a pet with no visit has no visit row (PMD-17)', () => {
    expect(offeredWindows({ ...NYX, sinceVisit: null })).not.toContainEqual({ kind: 'visit' });
  });
});

describe('since the trial started — `exposureRange`, while it reaches today', () => {
  it('a trial that ended YESTERDAY is not offered today', () => {
    const yesterday = toLocalDayKey(localNoon(2026, 9, 20));
    const facts: WindowFacts = {
      ...NYX,
      trial: trialFacts({ startedAt: '2026-07-26', endedAt: yesterday, targetDurationDays: 56 }, NOW),
    };
    // The predicate's own answer: the evidence stops at the end, so the range does too.
    expect(facts.trial?.exposureRange?.endDayIndex).toBe(localDayIndexOf(yesterday));
    expect(windowBounds({ kind: 'trial' }, facts)).toBeNull();
    expect(offeredWindows(facts)).not.toContainEqual({ kind: 'trial' });
  });

  it('a trial that ended TODAY still reaches today, so it is offered through today', () => {
    const facts: WindowFacts = {
      ...NYX,
      trial: trialFacts({ startedAt: '2026-07-26', endedAt: TODAY, targetDurationDays: 56 }, NOW),
    };
    expect(windowBounds({ kind: 'trial' }, facts)).toEqual(b('2026-07-26', TODAY));
  });

  it('a trial that has not started yet is not offered', () => {
    const facts: WindowFacts = {
      ...NYX,
      trial: trialFacts({ startedAt: '2026-09-28', targetDurationDays: 56 }, NOW),
    };
    expect(windowBounds({ kind: 'trial' }, facts)).toBeNull();
  });

  it('a trial that started today is a one-day window', () => {
    const facts: WindowFacts = {
      ...NYX,
      trial: trialFacts({ startedAt: TODAY, targetDurationDays: 28 }, NOW),
    };
    expect(windowBounds({ kind: 'trial' }, facts)).toEqual(b(TODAY, TODAY));
    expect(windowLabel({ kind: 'trial' }, facts)?.short).toBe('Since Sep 21');
  });

  it('a trial nobody ended, long past its planned end, is still offered (evidence, not belief)', () => {
    // 28 days planned from Mar 1 and never closed: the effective end is long gone, but the
    // record since Mar 1 is the record, and a window over it claims nothing (header).
    const facts: WindowFacts = {
      ...NYX,
      firstRecordDay: '2026-02-20',
      trial: trialFacts({ startedAt: '2026-03-01', targetDurationDays: 28 }, NOW),
    };
    expect(windowBounds({ kind: 'trial' }, facts)).toEqual(b('2026-03-01', TODAY));
  });

  it('reads `exposureRange` only: the coverage `range` is never consulted', () => {
    // The type makes the other field unreadable; this pins the source too, so widening
    // the parameter to `TrialFacts` and reaching for `.range` reds here as well as in
    // review (diet-trial spec §5, the B-494 lineage).
    const src = blankComments(readFileSync(join(__dirname, 'historyWindows.ts'), 'utf8'));
    expect(src).toMatch(/\.exposureRange\b/);
    expect(src).not.toMatch(/\.range\b/);
  });
});

describe('names (H-10): one long and one short per window, anchored windows keep their date', () => {
  it.each<[HistoryWindowKey, { long: string; short: string; anchor: string | null; sheetTitle: string; sheetSub: string | null }]>([
    [{ kind: 'all' }, { long: 'All time', short: 'All time', anchor: null, sheetTitle: 'All time', sheetSub: 'since May 14' }],
    [{ kind: 'today' }, { long: 'Today', short: 'Today', anchor: null, sheetTitle: 'Today', sheetSub: null }],
    [{ kind: 'last', days: 14 }, { long: 'Last 14 days', short: 'Last 14 days', anchor: null, sheetTitle: 'Last 14 days', sheetSub: null }],
    [{ kind: 'trial' }, { long: 'Since the trial started', short: 'Since Jul 26', anchor: 'Jul 26', sheetTitle: 'Since the trial started', sheetSub: 'Jul 26' }],
    [{ kind: 'visit' }, { long: 'Since the last vet visit', short: 'Since Sep 16', anchor: 'Sep 16', sheetTitle: 'Since the last vet visit', sheetSub: 'Sep 16' }],
    [{ kind: 'month', month: '2026-09' }, { long: 'September', short: 'September', anchor: null, sheetTitle: 'September', sheetSub: null }],
    [{ kind: 'month', month: '2026-05' }, { long: 'May', short: 'May', anchor: null, sheetTitle: 'May', sheetSub: 'from May 14' }],
  ])('%j', (key, expected) => {
    expect(windowLabel(key, NYX)).toEqual(expected);
  });

  it('a window that is not offered has no name', () => {
    expect(windowLabel({ kind: 'visit' }, { ...NYX, sinceVisit: null })).toBeNull();
  });

  describe('read on Jan 5, 2027 (the fixture crossing Jan 1)', () => {
    const NOW_2027 = localNoon(2027, 1, 5);
    const TODAY_2027 = toLocalDayKey(NOW_2027);
    const facts: WindowFacts = {
      today: TODAY_2027,
      firstRecordDay: '2026-11-20',
      trial: trialFacts({ startedAt: '2026-12-27', targetDurationDays: 56 }, NOW_2027),
      sinceVisit: latestVisitBefore(['2026-12-30'], TODAY_2027),
    };

    it('an anchor outside the current year carries its year everywhere', () => {
      expect(windowLabel({ kind: 'trial' }, facts)).toMatchObject({
        short: 'Since Dec 27, 2026',
        anchor: 'Dec 27, 2026',
      });
      expect(windowLabel({ kind: 'visit' }, facts)?.short).toBe('Since Dec 30, 2026');
      expect(windowLabel({ kind: 'all' }, facts)?.sheetSub).toBe('since Nov 20, 2026');
    });

    it('a last-year month is stamped on the pill and bare under its year on the sheet', () => {
      expect(windowLabel({ kind: 'month', month: '2026-12' }, facts)).toMatchObject({
        long: 'December 2026',
        short: 'December 2026',
        sheetTitle: 'December',
      });
      expect(windowLabel({ kind: 'month', month: '2027-01' }, facts)?.short).toBe('January');
    });

    it('months group under their year, newest first', () => {
      expect(monthGroups(facts)).toEqual([
        { year: 2027, subhead: '2027', months: [{ kind: 'month', month: '2027-01' }] },
        {
          year: 2026,
          subhead: '2026',
          months: [
            { kind: 'month', month: '2026-12' },
            { kind: 'month', month: '2026-11' },
          ],
        },
      ]);
    });

    it('the rolling windows cross the new year as days', () => {
      expect(windowBounds({ kind: 'last', days: 14 }, facts)).toEqual(b('2026-12-23', '2027-01-05'));
    });
  });
});

describe('the sheet', () => {
  it('offers the fixed rows in order, the trial and visit rows only where they exist', () => {
    expect(offeredWindows(NYX)).toEqual([
      { kind: 'all' },
      { kind: 'today' },
      { kind: 'last', days: 7 },
      { kind: 'last', days: 14 },
      { kind: 'last', days: 30 },
      { kind: 'trial' },
      { kind: 'visit' },
    ]);
    expect(offeredWindows({ ...NYX, trial: null, sinceVisit: null })).toEqual([
      { kind: 'all' },
      { kind: 'today' },
      { kind: 'last', days: 7 },
      { kind: 'last', days: 14 },
      { kind: 'last', days: 30 },
    ]);
  });

  it('lists every month from this one back to the record’s first, under one year', () => {
    expect(monthGroups(NYX)).toEqual([
      {
        year: 2026,
        subhead: '2026',
        months: ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05'].map((month) => ({
          kind: 'month',
          month,
        })),
      },
    ]);
  });
});

describe('resolveWindow — the window that applies', () => {
  it('an offered window applies as asked', () => {
    const w = resolveWindow({ kind: 'trial' }, NYX);
    expect(w).toMatchObject({ key: { kind: 'trial' }, bounds: b('2026-07-26', TODAY), fellBack: false });
  });

  it('a window no longer offered falls back to All time and says so', () => {
    const w = resolveWindow({ kind: 'trial' }, { ...NYX, trial: null });
    expect(w).toEqual({
      key: ALL_TIME,
      bounds: b('2026-05-14', TODAY),
      label: windowLabel(ALL_TIME, NYX),
      fellBack: true,
    });
  });

  it('places no window at all on an unreadable today', () => {
    expect(resolveWindow(ALL_TIME, { ...NYX, today: '2026-02-30' })).toBeNull();
    expect(windowBounds(ALL_TIME, { ...NYX, today: 'today' })).toBeNull();
  });
});

describe('weekStartOf — the strip pages by the week, Sunday first', () => {
  it.each([
    ['2026-09-21', '2026-09-20'], // Monday → the Sunday before
    ['2026-09-20', '2026-09-20'], // a Sunday is its own week's start
    ['2026-09-26', '2026-09-20'], // Saturday
    ['2027-01-01', '2026-12-27'], // across a new year
    ['1970-01-01', '1969-12-28'], // index 0, and a negative index
  ])('%s → %s', (day, sunday) => {
    expect(weekStartOf(day)).toBe(sunday);
  });

  it('refuses a malformed day', () => {
    expect(weekStartOf('2026-02-30')).toBeNull();
  });
});

describe('the window as a link parameter', () => {
  it('round-trips every window', () => {
    const keys: HistoryWindowKey[] = [
      { kind: 'all' },
      { kind: 'today' },
      { kind: 'last', days: 7 },
      { kind: 'last', days: 14 },
      { kind: 'last', days: 30 },
      { kind: 'trial' },
      { kind: 'visit' },
      { kind: 'month', month: '2026-08' },
    ];
    for (const key of keys) {
      expect(windowFromParam(windowParam(key))).toEqual(key);
    }
  });

  it('keeps v1’s vocabulary, so a link already in the app lands on the same window', () => {
    // lib/lookCard.ts sends window=today; Ask sends 7d and 30d (lib/ask.ts historyWindow).
    expect(windowFromParam('today')).toEqual({ kind: 'today' });
    expect(windowFromParam('7d')).toEqual({ kind: 'last', days: 7 });
    expect(windowFromParam('30d')).toEqual({ kind: 'last', days: 30 });
  });

  it('degrades anything else to All time, as v1 does, rather than hiding rows', () => {
    for (const bad of [undefined, null, '', 'all', '90d', '2026-13', 'since_trial_start']) {
      expect(windowFromParam(bad)).toEqual(ALL_TIME);
    }
  });

  it('sameWindow compares identities', () => {
    expect(sameWindow({ kind: 'last', days: 7 }, windowFromParam('7d'))).toBe(true);
    expect(sameWindow({ kind: 'month', month: '2026-08' }, { kind: 'month', month: '2026-09' })).toBe(false);
  });
});

// ── Across the running zone's DST transitions (CUL-948's pattern) ────────────────
//
// "Last 7 days" is seven local days, never 7 × 24 hours. That difference only exists
// where the clock changes, and it cannot be staged from inside a test (jest resolves the
// zone once per worker), so these cases find the RUNNING zone's own transitions. They
// bite in the non-UTC CI job's `Pacific/Chatham` run and skip, visibly, in a zone with no
// DST. Each case also asserts that the naive `now − 6 × 24h` lands on a different day at
// the instant chosen, so a pass means the table held where a clock-arithmetic window
// would not, rather than on a day where the two agree.

/** Local days in `year` whose midnight-to-midnight length is not 24 hours. */
function oddLengthDays(year: number): { day: Date; hours: number }[] {
  const out: { day: Date; hours: number }[] = [];
  for (let i = 0; i < 366; i++) {
    const day = new Date(year, 0, 1 + i);
    if (day.getFullYear() !== year) break;
    const ms = new Date(year, 0, 2 + i).getTime() - day.getTime();
    if (ms !== 86_400_000) out.push({ day, hours: ms / 3_600_000 });
  }
  return out;
}

// A fixed year, never the clock's (C-29).
const TRANSITIONS = oddLengthDays(2027);
const SHORT_DAY = TRANSITIONS.find((t) => t.hours < 24);
const LONG_DAY = TRANSITIONS.find((t) => t.hours > 24);

/**
 * "Last 7 days" read three days after an odd-length day, at the local minute where a
 * 7 × 24h window would slip: just after midnight after a 23-hour day, just before
 * midnight after a 25-hour one.
 */
function lastSevenAcross(odd: Date, hour: number, minute: number) {
  const now = new Date(odd.getFullYear(), odd.getMonth(), odd.getDate() + 3, hour, minute);
  const today = toLocalDayKey(now);
  const bounds = windowBounds({ kind: 'last', days: 7 }, { ...NYX, today, firstRecordDay: '2026-01-01' });
  const calendar = toLocalDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 12));
  const naive = toLocalDayKey(new Date(now.getTime() - 6 * 86_400_000));
  return { bounds, today, calendar, naive };
}

describe('Last 7 days across the running zone’s DST transitions', () => {
  const knownDstZone = ['Pacific/Chatham', 'America/New_York'].includes(process.env.TZ ?? '');
  (knownDstZone ? it : it.skip)('finds a 23-hour and a 25-hour day in a zone that observes DST', () => {
    expect(SHORT_DAY?.hours).toBe(23);
    expect(LONG_DAY?.hours).toBe(25);
  });

  (SHORT_DAY ? it : it.skip)('a 23-hour day inside the window moves neither end', () => {
    const r = lastSevenAcross((SHORT_DAY as { day: Date }).day, 0, 30);
    expect(r.naive).not.toBe(r.calendar); // the fixture bites
    expect(r.bounds).toEqual({ fromDay: r.calendar, toDay: r.today });
    expect(dayCount(r.bounds as WindowBounds)).toBe(7);
  });

  (LONG_DAY ? it : it.skip)('a 25-hour day inside the window moves neither end', () => {
    const r = lastSevenAcross((LONG_DAY as { day: Date }).day, 23, 30);
    expect(r.naive).not.toBe(r.calendar); // the fixture bites
    expect(r.bounds).toEqual({ fromDay: r.calendar, toDay: r.today });
    expect(dayCount(r.bounds as WindowBounds)).toBe(7);
  });
});
