// B-251 PR 9 — the age ⇄ DOB transforms + honest display. This is the clinically-
// sensitive extractable logic the spec makes mandatory: the whole reason the
// `date_of_birth_precision` column exists is so an APPROXIMATE age is never
// rendered as a witnessed birthday. The counterexample the Dr. Chen / Data
// Scientist sign-off names — enter "2 years" → it must read "~2yr", never
// "born July 6 2024" — is asserted directly at the bottom.
//
// All `now`/date fixtures are built with the LOCAL `new Date(y, mIndex, d)`
// constructor (not an ISO string) so the local-component math is timezone-stable
// under any test runner.

import {
  ageToDob,
  birthdayToDob,
  dateToYmd,
  formatAge,
  formatBirthdayField,
  resolveDobPrecisionOnSave,
} from './age';

// 2026-07-06, local midnight.
const NOW = new Date(2026, 6, 6);

describe('ageToDob — integer age → anchored approximate DOB (S6: today − duration)', () => {
  it('whole years anchor to the same month/day, N years back', () => {
    expect(ageToDob(2, 0, NOW)).toEqual({ dateOfBirth: '2024-07-06', precision: 'approximate' });
  });

  it('months-only subtract within the year', () => {
    expect(ageToDob(0, 3, NOW).dateOfBirth).toBe('2026-04-06');
  });

  it('years + months combine', () => {
    expect(ageToDob(1, 2, NOW).dateOfBirth).toBe('2025-05-06');
  });

  it('month underflow rolls the year back', () => {
    // now = Feb 15 2026; minus 3 months → Nov 15 2025.
    expect(ageToDob(0, 3, new Date(2026, 1, 15)).dateOfBirth).toBe('2025-11-15');
  });

  it('clamps the day to the target month length (never overflows a short month)', () => {
    // now = Mar 31 2026; minus 1 month → Feb, which has no 31st → clamp to Feb 28.
    expect(ageToDob(0, 1, new Date(2026, 2, 31)).dateOfBirth).toBe('2026-02-28');
  });

  it('handles a large age', () => {
    expect(ageToDob(20, 0, NOW).dateOfBirth).toBe('2006-07-06');
  });

  it('0/0 resolves to today but is still flagged approximate (never a real birthday)', () => {
    expect(ageToDob(0, 0, NOW)).toEqual({ dateOfBirth: '2026-07-06', precision: 'approximate' });
  });

  it('is ALWAYS approximate, regardless of the values entered', () => {
    for (const [y, m] of [[0, 1], [1, 0], [5, 7], [14, 11]] as const) {
      expect(ageToDob(y, m, NOW).precision).toBe('approximate');
    }
  });

  it('truncates fractional inputs rather than trusting them', () => {
    expect(ageToDob(2.9, 0, NOW).dateOfBirth).toBe('2024-07-06');
  });
});

describe('birthdayToDob — calendar pick → exact DOB', () => {
  it('stores the local calendar date the owner picked', () => {
    expect(birthdayToDob(new Date(2020, 0, 15))).toEqual({
      dateOfBirth: '2020-01-15',
      precision: 'exact',
    });
  });

  it('is ALWAYS exact', () => {
    expect(birthdayToDob(new Date(2023, 11, 31)).precision).toBe('exact');
  });

  it('zero-pads month and day', () => {
    expect(birthdayToDob(new Date(2021, 2, 5)).dateOfBirth).toBe('2021-03-05');
  });

  it('round-trips through dateToYmd', () => {
    const d = new Date(2019, 8, 9);
    expect(birthdayToDob(d).dateOfBirth).toBe(dateToYmd(d));
  });
});

describe('formatAge — derived age string, honest for both precisions', () => {
  it('null / unparseable / future → em dash', () => {
    expect(formatAge(null, 'exact', NOW)).toBe('—');
    expect(formatAge('not-a-date', 'exact', NOW)).toBe('—');
    expect(formatAge('2027-01-01', 'exact', NOW)).toBe('—'); // future birth
  });

  it('under a month', () => {
    expect(formatAge('2026-07-01', 'exact', NOW)).toBe('Under 1mo');
  });

  it('months only', () => {
    expect(formatAge('2026-04-06', 'exact', NOW)).toBe('3mo');
  });

  it('whole years', () => {
    expect(formatAge('2024-07-06', 'exact', NOW)).toBe('2yr');
  });

  it('years and months', () => {
    expect(formatAge('2024-04-06', 'exact', NOW)).toBe('2yr 3mo');
  });

  it('prefixes an approximate age with "~" — and only an approximate one', () => {
    expect(formatAge('2024-07-06', 'approximate', NOW)).toBe('~2yr');
    expect(formatAge('2024-04-06', 'approximate', NOW)).toBe('~2yr 3mo');
    expect(formatAge('2026-04-06', 'approximate', NOW)).toBe('~3mo');
    // exact never carries the hedge
    expect(formatAge('2024-07-06', 'exact', NOW)).not.toContain('~');
  });

  it('never renders a calendar date (it is an age, not a birthday)', () => {
    const out = formatAge('2024-07-06', 'approximate', NOW);
    expect(out).not.toMatch(/\d{4}/); // no year
    expect(out).not.toMatch(/January|July/);
  });
});

describe('formatBirthdayField — edit-surface field value', () => {
  it('exact → the full calendar date', () => {
    expect(formatBirthdayField('2020-01-15', 'exact')).toBe('January 15, 2020');
  });

  it('approximate → month + year behind an "About" hedge, no fabricated day', () => {
    expect(formatBirthdayField('2024-07-06', 'approximate')).toBe('About July 2024');
  });

  it('null / unparseable → null (caller shows its own placeholder)', () => {
    expect(formatBirthdayField(null)).toBeNull();
    expect(formatBirthdayField('garbage')).toBeNull();
  });
});

describe('resolveDobPrecisionOnSave — edit-surface precision merge (EditPetModal)', () => {
  it('a concrete calendar pick this session → exact (regardless of loaded precision)', () => {
    expect(resolveDobPrecisionOnSave(true, true, 'approximate')).toBe('exact');
    expect(resolveDobPrecisionOnSave(true, true, 'exact')).toBe('exact');
  });

  it('an untouched approximate DOB is PRESERVED — editing an unrelated field never promotes it', () => {
    expect(resolveDobPrecisionOnSave(true, false, 'approximate')).toBe('approximate');
  });

  it('an untouched exact DOB stays exact', () => {
    expect(resolveDobPrecisionOnSave(true, false, 'exact')).toBe('exact');
  });

  it('no date → the loaded precision is preserved unchanged (precision is moot)', () => {
    expect(resolveDobPrecisionOnSave(false, true, 'approximate')).toBe('approximate');
    expect(resolveDobPrecisionOnSave(false, false, 'exact')).toBe('exact');
  });
});

describe('honesty invariant — an approximate age is never a witnessed birthday', () => {
  it('the Dr. Chen counterexample: "2 years" → "~2yr" / "About July 2024", NEVER "July 6, 2024"', () => {
    const { dateOfBirth, precision } = ageToDob(2, 0, NOW);
    expect(precision).toBe('approximate');

    // Age chip reads as an estimate…
    expect(formatAge(dateOfBirth, precision, NOW)).toBe('~2yr');

    // …and the edit field never asserts the fabricated day.
    const field = formatBirthdayField(dateOfBirth, precision);
    expect(field).toBe('About July 2024');
    expect(field).not.toMatch(/July\s+\d{1,2},/); // no "July 6, 2024" witnessed-birthday form
  });

  it('an EXACT birthday keeps its full date (the honesty rule does not hide real ones)', () => {
    const { dateOfBirth, precision } = birthdayToDob(new Date(2020, 0, 15));
    expect(formatBirthdayField(dateOfBirth, precision)).toBe('January 15, 2020');
  });
});
