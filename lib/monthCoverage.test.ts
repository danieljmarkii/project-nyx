// lib/monthCoverage.ts — the coverage door's population (D2-4 / CUL-1066).
//
// TIMEZONE HONESTY (C-29): the question here IS a local-day question, so every fixture
// is built from LOCAL components (never a UTC literal) and the assertions follow the
// runner's own zone — the non-UTC CI job runs this unchanged under Kiritimati / Chatham /
// Honolulu.

import { monthCoverage, monthCoverageLine } from './monthCoverage';

/** A local instant on a given day of a fixed month, at a given local hour. */
function local(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 8, day, hour, minute, 0, 0); // September 2026, local
}

describe('monthCoverage', () => {
  const now = local(17, 18, 30).getTime();

  it('counts distinct logged days this month to date, however much was logged on each', () => {
    const rows = [
      local(1, 8), local(1, 20), // one day, two rows
      local(2, 9),
      local(10, 23, 59), // the last minute still belongs to the 10th
      local(17, 7), // today
    ].map((d) => d.toISOString());
    expect(monthCoverage(rows, now)).toEqual({ monthLabel: 'September', logged: 4, elapsed: 17 });
  });

  it('never counts a day outside the month, or a day after today', () => {
    const rows = [
      new Date(2026, 7, 31, 23, 30).toISOString(), // August 31, local
      local(18, 0, 30).toISOString(), // tomorrow, thirty minutes in
      local(17, 23, 59).toISOString(), // today, still today
    ];
    expect(monthCoverage(rows, now)).toEqual({ monthLabel: 'September', logged: 1, elapsed: 17 });
  });

  it('ignores an unparseable instant rather than counting or crashing', () => {
    expect(monthCoverage(['not a date', local(3, 12).toISOString()], now).logged).toBe(1);
  });

  it('the first of the month reads in the singular', () => {
    const first = local(1, 9).getTime();
    expect(monthCoverageLine(monthCoverage([local(1, 8).toISOString()], first))).toBe(
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
    const iso = '2026-09-17T03:30:00Z';
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
