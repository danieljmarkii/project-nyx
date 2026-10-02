// lib/monthCoverage.ts — the coverage door's population (D2-4 / CUL-1066).
//
// TIMEZONE HONESTY (C-29): the question here IS a local-day question, so every fixture
// is built from LOCAL components (never a UTC literal) and the assertions follow the
// runner's own zone — the non-UTC CI job runs this unchanged under Kiritimati / Chatham /
// Honolulu.

// The model reads the event category (`./dayEvents`), whose closure reaches `./supabase`,
// which throws at import with no env — stubbed at the boundary (the daySummary.test pattern).
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { coverageWindow, monthCoverage, monthCoverageLine, type MonthRow } from './monthCoverage';

/** A local instant on a given day of a fixed month, at a given local hour. */
function local(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 8, day, hour, minute, 0, 0); // September 2026, local
}
const meal = (d: Date): MonthRow => ({ occurredAt: d.toISOString(), eventType: 'meal' });
const look = (d: Date): MonthRow => ({ occurredAt: d.toISOString(), eventType: 'check_in' });
const rawRow = (occurredAt: string): MonthRow => ({ occurredAt, eventType: 'vomit' });

/** An ISO instant for a local day of the fixture month — a record start. */
const at = (day: number, hour = 9): string => local(day, hour).toISOString();
/** A record that began long before the month: the window opens on the 1st. */
const OLD_RECORD = new Date(2026, 5, 3, 9).toISOString(); // June 3, local

describe('monthCoverage — the window runs from the record’s start (or the 1st) through YESTERDAY (CUL-1221)', () => {
  const now = local(17, 18, 30).getTime();

  it('counts distinct logged days in the window, however much was logged on each', () => {
    const rows = [
      local(1, 8), local(1, 20), // one day, two rows
      local(2, 9),
      local(10, 23, 59), // the last minute still belongs to the 10th
      local(16, 7), // yesterday: the window's last day
    ].map(meal);
    expect(monthCoverage(rows, OLD_RECORD, now)).toEqual({
      kind: 'counted', monthLabel: 'September', logged: 4, days: 16,
    });
  });

  it('TODAY is in neither number — logged or not (PM ruling (a), 2026-09-27; History v2 R-1)', () => {
    // Before anything is logged today, today is not a miss…
    const quiet = monthCoverage([meal(local(16, 8))], OLD_RECORD, now);
    expect(quiet).toEqual({ kind: 'counted', monthLabel: 'September', logged: 1, days: 16 });
    // …and a log today does not move the numerator either: the ratio is not gated on the
    // thing it counts (C-3). The Today card above the door speaks for today.
    const withToday = monthCoverage([meal(local(16, 8)), meal(local(17, 7))], OLD_RECORD, now);
    expect(withToday).toEqual(quiet);
  });

  it('never counts a day outside the month, or a day dated ahead', () => {
    const rows = [
      meal(new Date(2026, 7, 31, 23, 30)), // August 31, local
      meal(local(18, 0, 30)), // tomorrow
      meal(local(16, 23, 59)), // yesterday, its last minute
    ];
    expect(monthCoverage(rows, OLD_RECORD, now)).toEqual({
      kind: 'counted', monthLabel: 'September', logged: 1, days: 16,
    });
  });

  it('a pet created mid-month: days before the record are NOT in the denominator (BRK-22)', () => {
    // The record began on the 10th; the window is the 10th..16th, seven days.
    const rows = [meal(local(10, 8)), meal(local(12, 8)), meal(local(16, 8))];
    expect(monthCoverage(rows, at(10), now)).toEqual({
      kind: 'counted', monthLabel: 'September', logged: 3, days: 7,
    });
    expect(monthCoverageLine(monthCoverage(rows, at(10), now))).toBe('September · logged 3 of 7 days');
  });

  it('the critique’s counterexample: the first breakfast on the 25th is not "1 of 25"', () => {
    const on25 = local(25, 8, 5).getTime();
    const c = monthCoverage([meal(local(25, 8))], at(25, 8), on25);
    expect(c).toEqual({ kind: 'record_starts_today', monthLabel: 'September' });
    expect(monthCoverageLine(c)).toBe('September · the record starts today');
    // The next day, the window is one day long and it was logged.
    const on26 = local(26, 9).getTime();
    expect(monthCoverageLine(monthCoverage([meal(local(25, 8))], at(25, 8), on26))).toBe(
      'September · logged 1 of 1 day',
    );
  });

  it('the first of the month over an older record: no finished day yet, so no ratio', () => {
    const first = local(1, 9).getTime();
    const c = monthCoverage([meal(local(1, 8))], OLD_RECORD, first);
    expect(c).toEqual({ kind: 'month_starts_today', monthLabel: 'September' });
    expect(monthCoverageLine(c)).toBe('September · the month starts today');
    // The 2nd: one finished day.
    const second = local(2, 9).getTime();
    expect(monthCoverageLine(monthCoverage([meal(local(1, 8))], OLD_RECORD, second))).toBe(
      'September · logged 1 of 1 day',
    );
  });

  it('an empty record gets the month’s invitation, never a ratio (Principle 5)', () => {
    const c = monthCoverage([], null, now);
    expect(c).toEqual({ kind: 'empty', monthLabel: 'September' });
    expect(monthCoverageLine(c)).toBe('September · the month fills in from the first entry');
  });

  it('a record whose only events are dated ahead has not started', () => {
    expect(monthCoverage([meal(local(20, 8))], at(20, 8), now).kind).toBe('empty');
  });

  it('an unparseable record start reads as no record, never as a confident window', () => {
    expect(monthCoverage([meal(local(3, 8))], 'not a date', now).kind).toBe('empty');
  });

  it('a look NEVER counts as a logged day — floor 5, §5.6: a look joins no other surface’s coverage line', () => {
    // Sam's September: the look answered every morning, meals on the 3rd, 10th and 14th.
    // The first draft of this module read "logged 17 of 17 days" under a Today card
    // reading "Nothing logged yet today" (the adversarial pass, F1). The honest answer is
    // the three days that hold an event.
    const rows: MonthRow[] = [];
    for (let d = 1; d <= 17; d++) rows.push(look(local(d, 8)));
    for (const d of [3, 10, 14]) rows.push(meal(local(d, 18)));
    expect(monthCoverage(rows, OLD_RECORD, now)).toEqual({
      kind: 'counted', monthLabel: 'September', logged: 3, days: 16,
    });
    // A month of looks alone is a month with nothing logged.
    expect(monthCoverage(rows.filter((r) => r.eventType === 'check_in'), OLD_RECORD, now)).toEqual({
      kind: 'counted', monthLabel: 'September', logged: 0, days: 16,
    });
  });

  it('ignores an unparseable instant rather than counting or crashing', () => {
    const c = monthCoverage([rawRow('not a date'), meal(local(3, 12))], OLD_RECORD, now);
    expect(c.kind === 'counted' && c.logged).toBe(1);
  });

  it('speaks the door line, in the singular for one day', () => {
    expect(monthCoverageLine({ kind: 'counted', monthLabel: 'September', logged: 15, days: 17 })).toBe(
      'September · logged 15 of 17 days',
    );
    expect(monthCoverageLine({ kind: 'counted', monthLabel: 'September', logged: 0, days: 1 })).toBe(
      'September · logged 0 of 1 day',
    );
  });
});

describe('coverageWindow — one rule for which of the month’s days can be counted', () => {
  it('opens on the later of the 1st and the record’s first day, and closes yesterday', () => {
    const now = local(17, 18).getTime();
    const mid = coverageWindow(at(10), now);
    expect(mid.toIdx - mid.fromIdx + 1).toBe(7); // the 10th..16th
    expect(mid.toIdx).toBe(mid.todayIdx - 1);
    const old = coverageWindow(OLD_RECORD, now);
    expect(old.fromIdx).toBe(old.monthStartIdx);
    expect(old.toIdx - old.fromIdx + 1).toBe(16);
    expect(coverageWindow(null, now).recordStartIdx).toBeNull();
  });
});

describe('the window in an explicit zone (the fixture pins it, not the runner — C-29)', () => {
  it('a UTC+14 device just after midnight: today is the 18th, the window ends on the 17th', () => {
    // 2026-09-17T10:05Z is 00:05 on Sep 18 in Kiritimati (UTC+14) — minutes into the day.
    const nowZ = Date.parse('2026-09-17T10:05:00Z');
    // A meal at 23:30 Sep 17 Kiritimati (09:30Z) is YESTERDAY there: counted.
    // A meal at 00:02 Sep 18 Kiritimati (10:02Z) is TODAY there: not counted.
    const rows = [rawRow('2026-09-17T09:30:00Z'), rawRow('2026-09-17T10:02:00Z')];
    expect(monthCoverage(rows, '2026-08-01T00:00:00Z', nowZ, 'Pacific/Kiritimati')).toEqual({
      kind: 'counted', monthLabel: 'September', logged: 1, days: 17,
    });
    // The same instant in Honolulu (UTC−10) is 00:05 on Sep 17: the window ends the 16th,
    // and both meals are Sep 16 23:30 / Sep 17 00:02 there — one counted, one today.
    expect(monthCoverage(rows, '2026-08-01T00:00:00Z', nowZ, 'Pacific/Honolulu')).toEqual({
      kind: 'counted', monthLabel: 'September', logged: 1, days: 16,
    });
  });

  it('a record that started "yesterday" in UTC may start TODAY in the owner’s zone', () => {
    // 2026-09-17T11:00Z: 01:00 Sep 18 in Kiritimati. The first event at 10:30Z is 00:30
    // Sep 18 there — the record starts today, whatever UTC's calendar says.
    const nowZ = Date.parse('2026-09-17T11:00:00Z');
    const first = '2026-09-17T10:30:00+00:00'; // PostgREST's spelling (C-40): parsed, not compared
    expect(monthCoverage([rawRow(first)], first, nowZ, 'Pacific/Kiritimati')).toEqual({
      kind: 'record_starts_today', monthLabel: 'September',
    });
  });
});
