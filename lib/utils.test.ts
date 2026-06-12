import {
  archiveConfirmBody,
  deriveOccurredAt,
  describeOccurredAt,
  formatTime,
  petAgeShort,
  petIdentityLine,
  petPronouns,
} from './utils';

const at = (iso: string) => new Date(iso);

// Build a DOB exactly `m` whole months before today. petAgeShort diffs by
// calendar month and ignores day-of-month, so a fixed day (15th) keeps the
// expectation stable regardless of which day the test runs.
const monthsAgo = (m: number): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - m, 15).toISOString().slice(0, 10);
};

describe('deriveOccurredAt', () => {
  it('returns the point for witnessed events', () => {
    const point = at('2026-05-18T07:42:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'witnessed', point, earliest: null, latest: null }).toISOString(),
    ).toBe(point.toISOString());
  });

  it('returns the point for estimated events (found, rough single time)', () => {
    const point = at('2026-05-18T04:00:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'estimated', point, earliest: null, latest: null }).toISOString(),
    ).toBe(point.toISOString());
  });

  it('returns the latest edge for a bounded window (no invented midpoint)', () => {
    // 2pm–4pm bedroom case -> "by 4pm", not a synthesized 3pm
    const earliest = at('2026-05-18T14:00:00.000Z');
    const latest = at('2026-05-18T16:00:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'window', point: new Date(), earliest, latest }).toISOString(),
    ).toBe(latest.toISOString());
  });

  it('returns latest for an open-ended "sometime before now" window', () => {
    const latest = at('2026-05-18T07:42:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'window', point: new Date(), earliest: null, latest }).toISOString(),
    ).toBe(latest.toISOString());
  });

  it('returns earliest when only the lower edge is known', () => {
    const earliest = at('2026-05-18T09:00:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'window', point: new Date(), earliest, latest: null }).toISOString(),
    ).toBe(earliest.toISOString());
  });

  it('falls back to the point for a degenerate window with no edges', () => {
    const point = at('2026-05-18T12:00:00.000Z');
    expect(
      deriveOccurredAt({ confidence: 'window', point, earliest: null, latest: null }).toISOString(),
    ).toBe(point.toISOString());
  });
});

describe('describeOccurredAt', () => {
  // Times are formatted with the local timezone, so assert against formatTime
  // rather than hardcoding a clock value the CI box might render differently.
  const t = (iso: string) => formatTime(at(iso));

  it('renders witnessed events as the exact point with no tag', () => {
    const iso = '2026-05-18T14:14:00.000Z';
    const d = describeOccurredAt({ confidence: 'witnessed', occurredAt: iso });
    expect(d.primary).toBe(t(iso));
    expect(d.compact).toBe(t(iso));
    expect(d.tag).toBeNull();
    expect(d.isExact).toBe(true);
  });

  it('prefixes estimated events with ~ and tags them, not exact', () => {
    const iso = '2026-05-18T04:00:00.000Z';
    const d = describeOccurredAt({ confidence: 'estimated', occurredAt: iso });
    expect(d.primary).toBe(`~${t(iso)}`);
    expect(d.tag).toBe('estimated');
    expect(d.isExact).toBe(false);
  });

  it('renders a bounded window as a range', () => {
    const e = '2026-05-18T13:00:00.000Z';
    const l = '2026-05-18T15:00:00.000Z';
    const d = describeOccurredAt({ confidence: 'window', occurredAt: l, earliest: e, latest: l });
    expect(d.primary).toBe(`between ${t(e)} and ${t(l)}`);
    expect(d.compact).toBe(`${t(e)}–${t(l)}`);
    expect(d.tag).toBe('approximate');
    expect(d.isExact).toBe(false);
  });

  it('renders an open-ended "found by" window with only the latest edge', () => {
    const l = '2026-05-18T15:00:00.000Z';
    const d = describeOccurredAt({ confidence: 'window', occurredAt: l, earliest: null, latest: l });
    expect(d.primary).toBe(`found by ${t(l)}`);
    expect(d.compact).toBe(`by ${t(l)}`);
    expect(d.tag).toBe('approximate');
  });

  it('falls back to the exact point for legacy/unclassified (null) rows', () => {
    const iso = '2026-05-18T09:30:00.000Z';
    const d = describeOccurredAt({ confidence: null, occurredAt: iso });
    expect(d.primary).toBe(t(iso));
    expect(d.tag).toBeNull();
    expect(d.isExact).toBe(true);
  });

  it('falls back to the exact point for a degenerate edgeless window', () => {
    const iso = '2026-05-18T12:00:00.000Z';
    const d = describeOccurredAt({ confidence: 'window', occurredAt: iso, earliest: null, latest: null });
    expect(d.primary).toBe(t(iso));
    expect(d.tag).toBeNull();
    expect(d.isExact).toBe(true);
  });
});

describe('petAgeShort', () => {
  it('returns null when there is no DOB', () => {
    expect(petAgeShort(null)).toBeNull();
  });

  it('returns null for a malformed DOB rather than NaN', () => {
    expect(petAgeShort('not-a-date')).toBeNull();
  });

  it('returns null for a future DOB instead of "0 mo"', () => {
    expect(petAgeShort(monthsAgo(-6))).toBeNull();
  });

  it('renders the youngest band as "Under 1 mo"', () => {
    expect(petAgeShort(monthsAgo(0))).toBe('Under 1 mo');
  });

  it('renders months under a year', () => {
    expect(petAgeShort(monthsAgo(3))).toBe('3 mo');
  });

  it('renders exactly one year as the singular "1 yr"', () => {
    expect(petAgeShort(monthsAgo(12))).toBe('1 yr');
  });

  it('renders multiple years, dropping the trailing months', () => {
    expect(petAgeShort(monthsAgo(50))).toBe('4 yrs');
  });
});

describe('petIdentityLine', () => {
  it('joins breed and age with a separator', () => {
    expect(
      petIdentityLine({ species: 'dog', breed: 'Mixed breed', date_of_birth: monthsAgo(50) }),
    ).toBe('Mixed breed · 4 yrs');
  });

  it('shows breed alone when DOB is missing', () => {
    expect(
      petIdentityLine({ species: 'dog', breed: 'Beagle', date_of_birth: null }),
    ).toBe('Beagle');
  });

  it('shows age alone when breed is missing', () => {
    expect(
      petIdentityLine({ species: 'cat', breed: null, date_of_birth: monthsAgo(50) }),
    ).toBe('4 yrs');
  });

  it('treats a blank breed as missing and falls back to species', () => {
    expect(
      petIdentityLine({ species: 'dog', breed: '   ', date_of_birth: null }),
    ).toBe('Dog');
  });

  it('falls back to the species word when nothing else is known', () => {
    expect(petIdentityLine({ species: 'cat', breed: null, date_of_birth: null })).toBe('Cat');
  });

  it('returns an empty string for "other" with no detail, so the line is dropped', () => {
    expect(petIdentityLine({ species: 'other', breed: null, date_of_birth: null })).toBe('');
  });
});

describe('petPronouns / archiveConfirmBody', () => {
  it('female reads exactly as the approved mock (B4)', () => {
    expect(archiveConfirmBody({ sex: 'female' })).toBe(
      'Her history stays safe, and she comes off your pet list. You can bring her back anytime from Archived pets.',
    );
  });

  it('male swaps every pronoun, keeping the singular verb', () => {
    expect(archiveConfirmBody({ sex: 'male' })).toBe(
      'His history stays safe, and he comes off your pet list. You can bring him back anytime from Archived pets.',
    );
  });

  it('unknown takes singular they WITH the plural verb form ("they come")', () => {
    expect(archiveConfirmBody({ sex: 'unknown' })).toBe(
      'Their history stays safe, and they come off your pet list. You can bring them back anytime from Archived pets.',
    );
  });

  it('copy carries no exclamation marks (nyx-voice)', () => {
    (['female', 'male', 'unknown'] as const).forEach((sex) => {
      expect(archiveConfirmBody({ sex })).not.toContain('!');
    });
  });

  it('pronoun sets are internally consistent', () => {
    expect(petPronouns('female')).toEqual({ subject: 'she', object: 'her', possessive: 'her', comesVerb: 'comes' });
    expect(petPronouns('male')).toEqual({ subject: 'he', object: 'him', possessive: 'his', comesVerb: 'comes' });
    expect(petPronouns('unknown')).toEqual({ subject: 'they', object: 'them', possessive: 'their', comesVerb: 'come' });
  });
});
