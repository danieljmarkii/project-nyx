// The one date formatter (H-10, CUL-1160; spec §3.9, AC 31).
//
// Every input is a local day key, so these fixtures are zone-free by construction: the
// module never resolves an instant, and the same table holds under every clock the
// non-UTC CI job runs (C-29). The fixture that matters most crosses Jan 1, because that
// is the one week a year when a bare date is ambiguous.

import {
  RECORD_RANGE_DASH,
  recordDay,
  recordMonth,
  recordMonthUnderYear,
  recordRange,
  recordWeekday,
  recordYearOf,
} from './recordDates';

// "Today" on each side of a new year: the mock's own H-10 frame is read on Jan 5, 2027.
const IN_2026 = '2026-09-21';
const IN_2027 = '2027-01-05';

describe('recordDay — bare in the current year, stamped outside it', () => {
  it.each([
    ['2026-09-16', IN_2026, 'Sep 16'],
    ['2026-01-01', IN_2026, 'Jan 1'],
    ['2026-12-31', IN_2026, 'Dec 31'],
    ['2025-12-31', IN_2026, 'Dec 31, 2025'],
    // Across Jan 1: the same day reads bare in its own year and stamped the next.
    ['2026-12-31', IN_2027, 'Dec 31, 2026'],
    ['2027-01-01', IN_2027, 'Jan 1'],
    // A future year is not the current year either (a trial ending next year).
    ['2027-02-12', IN_2026, 'Feb 12, 2027'],
  ])('%s read on %s → %s', (day, today, expected) => {
    expect(recordDay(day, today)).toBe(expected);
  });

  it('reads the current year off the LOCAL day key, not a clock', () => {
    // 11 PM on Dec 31 in a zone behind UTC is already Jan 1 in UTC. The caller hands
    // over the local key, so the year that decides the stamp is the owner's.
    expect(recordDay('2026-12-30', '2026-12-31')).toBe('Dec 30');
    expect(recordDay('2026-12-30', '2027-01-01')).toBe('Dec 30, 2026');
  });
});

describe('recordWeekday — the day header', () => {
  it.each([
    ['2026-09-21', IN_2026, 'Mon, Sep 21'],
    ['2026-09-20', IN_2026, 'Sun, Sep 20'],
    ['2026-12-31', IN_2027, 'Thu, Dec 31, 2026'],
    ['2027-01-01', IN_2027, 'Fri, Jan 1'],
    // A leap day: the calendar parts come from Date.UTC, never from a local parse.
    ['2028-02-29', '2028-03-01', 'Tue, Feb 29'],
  ])('%s read on %s → %s', (day, today, expected) => {
    expect(recordWeekday(day, today)).toBe(expected);
  });
});

describe('recordRange — the year stated once', () => {
  it.each([
    // one month, the current year
    ['2026-09-13', '2026-09-16', IN_2026, 'Sep 13 – 16'],
    // two months, the current year
    ['2026-08-30', '2026-09-05', IN_2026, 'Aug 30 – Sep 5'],
    // one other year: stated once, at the end, never on both sides
    ['2025-09-13', '2025-09-16', IN_2026, 'Sep 13 – 16, 2025'],
    ['2025-08-30', '2025-09-05', IN_2026, 'Aug 30 – Sep 5, 2025'],
    // H-10's own example: across Jan 1, read on Jan 5, 2027
    ['2026-12-27', '2027-01-02', IN_2027, 'Dec 27, 2026 – Jan 2'],
    // the same range read before the new year: now the END is the other year
    ['2026-12-27', '2027-01-02', IN_2026, 'Dec 27 – Jan 2, 2027'],
    // two years, neither current: both stamped, because they differ
    ['2024-12-27', '2025-01-02', IN_2026, 'Dec 27, 2024 – Jan 2, 2025'],
    // a one-day range is a day
    ['2026-09-16', '2026-09-16', IN_2026, 'Sep 16'],
    ['2025-09-16', '2025-09-16', IN_2026, 'Sep 16, 2025'],
  ])('%s → %s read on %s → %s', (from, to, today, expected) => {
    expect(recordRange(from, to, today)).toBe(expected);
  });

  it('names a year exactly when a range touches another year, and never twice', () => {
    // The property the rule exists for, over every pair of weekly days in a span that
    // crosses two new years, read from both sides of one of them.
    const days: string[] = [];
    for (let d = new Date(Date.UTC(2025, 10, 1)); d <= new Date(Date.UTC(2027, 1, 28)); ) {
      days.push(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + 86_400_000 * 7);
    }
    // Violations are collected and asserted once: one `expect` per pair made this the
    // slowest case in the file for no extra information.
    const violations: string[] = [];
    for (const today of [IN_2026, IN_2027]) {
      const currentYear = Number(today.slice(0, 4));
      for (const from of days) {
        for (const to of days) {
          if (from > to) continue;
          const text = recordRange(from, to, today);
          if (text === null) {
            violations.push(`${from}..${to} @${today}: null`);
            continue;
          }
          // Any range touching another year names it; a range wholly inside this year
          // names none. (A same-year range carries its one year at the END, which
          // covers a bare start: "Aug 30 – Sep 5, 2025".)
          const years = [...text.matchAll(/\b(\d{4})\b/g)].map((m) => Number(m[1]));
          const touchesAnotherYear =
            Number(from.slice(0, 4)) !== currentYear || Number(to.slice(0, 4)) !== currentYear;
          if (touchesAnotherYear !== years.length > 0) {
            violations.push(`${from}..${to} @${today}: "${text}"`);
          }
          // Stated once: a year never appears twice, and there is one dash at most.
          if (new Set(years).size !== years.length || text.split(RECORD_RANGE_DASH).length > 2) {
            violations.push(`${from}..${to} @${today}: "${text}" repeats`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('returns null for an inverted range rather than print a window the record never had', () => {
    expect(recordRange('2026-09-16', '2026-09-13', IN_2026)).toBeNull();
  });

  it('orders the two ends as days, not as text', () => {
    // Both parse, so text order would agree here; the assertion is that the function's
    // answer does not depend on it (C-40's rule, kept even where it would be harmless).
    expect(recordRange('2026-09-30', '2026-10-01', IN_2026)).toBe('Sep 30 – Oct 1');
  });
});

describe('recordMonth and recordMonthUnderYear', () => {
  it.each([
    ['2026-09', IN_2026, 'September'],
    ['2025-09', IN_2026, 'September 2025'],
    ['2026-12', IN_2027, 'December 2026'],
    ['2027-01', IN_2027, 'January'],
  ])('recordMonth(%s) read on %s → %s', (month, today, expected) => {
    expect(recordMonth(month, today)).toBe(expected);
  });

  it('under its year subhead, a month is always bare', () => {
    expect(recordMonthUnderYear('2025-09')).toBe('September');
    expect(recordMonthUnderYear('2026-05')).toBe('May');
  });
});

describe('a malformed key is refused, never guessed', () => {
  it.each([
    '2026-02-30', // Date would roll it to Mar 2
    '2026-13-01',
    '2026-9-16', // not the fixed-width shape a DATE column produces
    '0099-01-01', // Date.UTC maps two-digit years onto the 1900s
    '2026-09-16T00:00:00.000Z', // an instant is not a day key
    '',
  ])('%p → null', (bad) => {
    expect(recordDay(bad, IN_2026)).toBeNull();
    expect(recordWeekday(bad, IN_2026)).toBeNull();
    expect(recordRange(bad, '2026-09-20', IN_2026)).toBeNull();
    expect(recordRange('2026-09-01', bad, IN_2026)).toBeNull();
    expect(recordYearOf(bad)).toBeNull();
  });

  it.each(['2026-13', '2026-00', '2026-9', ''])('month %p → null', (bad) => {
    expect(recordMonth(bad, IN_2026)).toBeNull();
    expect(recordMonthUnderYear(bad)).toBeNull();
  });

  it('an unreadable today stamps the year rather than dropping it', () => {
    // The date is fine; only the year rule is in doubt, so fail toward the unambiguous
    // string. A missing year is the harm this module exists to remove.
    expect(recordDay('2026-09-16', 'not-a-day')).toBe('Sep 16, 2026');
    expect(recordRange('2026-09-13', '2026-09-16', '')).toBe('Sep 13 – 16, 2026');
    expect(recordMonth('2026-09', '')).toBe('September 2026');
  });
});
