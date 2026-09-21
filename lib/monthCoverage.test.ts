// lib/monthCoverage.ts — the coverage door's population (D2-4 / CUL-1066).
//
// TIMEZONE HONESTY (C-29): the question here IS a local-day question, so every fixture
// is built from LOCAL components (never a UTC literal) and the assertions follow the
// runner's own zone — the non-UTC CI job runs this unchanged under Kiritimati / Chatham /
// Honolulu.

// The model reads the event category (`./dayEvents`), whose closure reaches `./supabase`,
// which throws at import with no env — stubbed at the boundary (the daySummary.test pattern).
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { monthCoverage, monthCoverageLine, type MonthRow } from './monthCoverage';

/** A local instant on a given day of a fixed month, at a given local hour. */
function local(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 8, day, hour, minute, 0, 0); // September 2026, local
}
const meal = (d: Date): MonthRow => ({ occurredAt: d.toISOString(), eventType: 'meal' });
const look = (d: Date): MonthRow => ({ occurredAt: d.toISOString(), eventType: 'check_in' });
const rawRow = (occurredAt: string): MonthRow => ({ occurredAt, eventType: 'vomit' });

describe('monthCoverage', () => {
  const now = local(17, 18, 30).getTime();

  it('counts distinct logged days this month to date, however much was logged on each', () => {
    const rows = [
      local(1, 8), local(1, 20), // one day, two rows
      local(2, 9),
      local(10, 23, 59), // the last minute still belongs to the 10th
      local(17, 7), // today
    ].map(meal);
    expect(monthCoverage(rows, now)).toEqual({ monthLabel: 'September', logged: 4, elapsed: 17 });
  });

  it('never counts a day outside the month, or a day after today', () => {
    const rows = [
      meal(new Date(2026, 7, 31, 23, 30)), // August 31, local
      meal(local(18, 0, 30)), // tomorrow, thirty minutes in
      meal(local(17, 23, 59)), // today, still today
    ];
    expect(monthCoverage(rows, now)).toEqual({ monthLabel: 'September', logged: 1, elapsed: 17 });
  });

  it('a look NEVER counts as a logged day — floor 5, §5.6: a look joins no other surface’s coverage line', () => {
    // Sam's September: the look answered every morning, meals on the 3rd, 10th and 14th.
    // The first draft of this module read "logged 17 of 17 days" under a Today card
    // reading "Nothing logged yet today" (the adversarial pass, F1). The honest answer is
    // the three days that hold an event.
    const rows: MonthRow[] = [];
    for (let d = 1; d <= 17; d++) rows.push(look(local(d, 8)));
    for (const d of [3, 10, 14]) rows.push(meal(local(d, 18)));
    expect(monthCoverage(rows, now)).toEqual({ monthLabel: 'September', logged: 3, elapsed: 17 });
    // A month of looks alone is a month with nothing logged.
    expect(monthCoverage(rows.filter((r) => r.eventType === 'check_in'), now).logged).toBe(0);
  });

  it('ignores an unparseable instant rather than counting or crashing', () => {
    expect(monthCoverage([rawRow('not a date'), meal(local(3, 12))], now).logged).toBe(1);
  });

  it('the first of the month reads in the singular', () => {
    const first = local(1, 9).getTime();
    expect(monthCoverageLine(monthCoverage([meal(local(1, 8))], first))).toBe(
      'September · logged 1 of 1 day',
    );
  });

  it('speaks the door line', () => {
    expect(monthCoverageLine({ monthLabel: 'September', logged: 15, elapsed: 17 })).toBe(
      'September · logged 15 of 17 days',
    );
  });

  it('honours an explicit zone for the day boundary (the fixture pins it, not the runner)', () => {
    // 2026-09-17T03:30Z is Sep 16 in Honolulu (UTC−10) and Sep 17 in Kiritimati (UTC+14).
    const nowZ = Date.parse('2026-09-17T12:00:00Z');
    const iso = rawRow('2026-09-17T03:30:00Z');
    expect(monthCoverage([iso], nowZ, 'Pacific/Honolulu')).toEqual({
      monthLabel: 'September', logged: 1, elapsed: 17,
    });
    // Same instant in a zone where "today" is the 18th: the row is the 17th, still counted.
    const nowKiritimati = Date.parse('2026-09-17T12:00:00Z'); // 02:00 Sep 18 in Kiritimati
    expect(monthCoverage([iso], nowKiritimati, 'Pacific/Kiritimati')).toEqual({
      monthLabel: 'September', logged: 1, elapsed: 18,
    });
  });
});
