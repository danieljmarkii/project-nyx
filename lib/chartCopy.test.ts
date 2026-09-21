// The chart family's words (CUL-1064), branch by branch — a screen-reader user must hear
// every count, the denominator and the disclosure, and never a verdict.

import {
  compareBarsA11yLabel,
  dateWord,
  dayMarkA11yLabel,
  dayMarkDateWord,
  lanesBucketCaption,
  markWord,
  timingLanesA11yLabel,
  weeklyBarsA11yLabel,
  weeklyOutsideLine,
  weightDotsA11yLabel,
  weightWord,
  type DayMarkFacts,
} from './chartCopy';
import { compareWindows, laneDots, weeklyBuckets, weightBand } from './chartModels';

const laneOf = (label: string, timed: number[], total: number) => ({ label, episodeMinutes: [...timed, ...Array<null>(Math.max(0, total - timed.length)).fill(null)] });

const NO_VERDICT = /\b(fair|fairly|better|worse|improv\w*|clear|fine|good|bad|normal|healthy|okay)\b|!/i;

describe('weeklyBarsA11yLabel', () => {
  const model = weeklyBuckets({
    episodeDays: ['2026-09-06', '2026-09-06', '2026-09-21', '2026-08-01', '2026-10-30'],
    loggedDays: ['2026-09-06', '2026-09-20'],
    weeksEnding: '2026-09-22',
    today: '2026-09-22',
    weeks: 3,
    mark: { day: '2026-09-12', label: 'trial · Sep 12' },
  });

  it('speaks the window, the counts, the total, the coverage, the partial week, the mark and the outside', () => {
    const label = weeklyBarsA11yLabel(model, 'vomiting');
    expect(label).toContain('Vomiting by week, 3 weeks from Sep 6 to Sep 26, weeks starting Sunday.');
    expect(label).toContain('Counts by week: 2, 0, 1. 3 in these 3 weeks.');
    expect(label).not.toContain('in all'); // a window total is never spoken as a record total (CUL-223)
    expect(label).toContain('Days logged per week: 1 of 7, 0 of 7, 1 of 3.');
    expect(label).toContain('The week of Sep 20 has 3 days so far.');
    expect(label).toContain('Trial · Sep 12.');
    expect(label).toContain('1 earlier episode not in these weeks · 1 episode dated after what is drawn.');
    expect(weeklyOutsideLine(model)).toBe('1 earlier episode not in these weeks · 1 episode dated after what is drawn');
    expect(label).not.toMatch(NO_VERDICT);
  });

  it('pluralises the week, the earlier and the later episodes', () => {
    const one = weeklyBuckets({ episodeDays: ['2026-08-01', '2026-08-02'], loggedDays: [], weeksEnding: '2026-09-22', today: '2026-09-30', weeks: 1 });
    const label = weeklyBarsA11yLabel(one, 'vomiting');
    expect(label).toContain('1 week from');
    expect(label).toContain('2 earlier episodes not in these weeks.');
    expect(label).not.toContain('so far');
    expect(label).not.toContain('dated after');
    expect(weeklyOutsideLine(weeklyBuckets({ episodeDays: [], loggedDays: [], weeksEnding: '2026-09-22', today: '2026-09-30', weeks: 1 }))).toBeNull();
  });

  it('a mark off the chart is placed in words; a wholly-ahead week reads "not yet"; days before the record are said', () => {
    const m = weeklyBuckets({
      episodeDays: [],
      loggedDays: ['2026-09-13'],
      weeksEnding: '2026-09-26',
      today: '2026-09-15',
      weeks: 3,
      mark: { day: '2026-06-01', label: 'trial · Jun 1' },
      recordStart: '2026-09-10',
    });
    expect(markWord(m.mark!)).toBe('trial · Jun 1, before these weeks');
    const label = weeklyBarsA11yLabel(m, 'vomiting');
    expect(label).toContain('Trial · Jun 1, before these weeks.');
    expect(label).toContain('Days logged per week: 0 of 3, 1 of 3, not yet.');
    expect(label).toContain('The week of Sep 13 has 3 days so far.');
    expect(label).toContain('4 days before the record began, not counted.');
    const after = weeklyBuckets({ episodeDays: [], loggedDays: [], weeksEnding: '2026-09-26', today: '2026-09-26', weeks: 1, mark: { day: '2026-12-01', label: 'trial · Dec 1' } });
    expect(markWord(after.mark!)).toBe('trial · Dec 1, after these weeks');
  });
});

describe('compareBarsA11yLabel', () => {
  it('names the noun once, then each window with its count and its coverage', () => {
    const model = compareWindows(
      { label: 'The 5 days before', startDay: '2026-07-01', days: 5, episodeDays: ['2026-07-02'], loggedDays: ['2026-07-01'] },
      { label: "The trial's 5 days", startDay: '2026-07-06', days: 5, episodeDays: [], loggedDays: [] },
    );
    expect(compareBarsA11yLabel(model, 'vomiting')).toBe(
      "Vomiting: 1 in the 5 days before, logged 1 of 5 days; 0 in the trial's 5 days, logged 0 of 5 days.",
    );
    expect(compareBarsA11yLabel(model, 'vomiting')).not.toMatch(NO_VERDICT);
  });
});

describe('timingLanesA11yLabel + lanesBucketCaption', () => {
  it('reads each lane with its denominator and three buckets, then the untimed disclosure', () => {
    const a = laneDots(laneOf('Before the trial', [10, 100, 400], 5));
    const b = laneDots(laneOf('In the trial', [5], 4));
    const label = timingLanesA11yLabel([a, b], 30, 6);
    expect(label).toBe(
      'Timed from meals. Before the trial: 3 timed of 5. 1 under 30 minutes, 1 between 30 minutes and 6 hours, 1 after 6 hours. In the trial: 1 timed of 4. 1 under 30 minutes, 0 between 30 minutes and 6 hours, 0 after 6 hours. ' +
        "2 + 3 episodes couldn't be timed against a meal — they aren't on the lanes.",
    );
    expect(lanesBucketCaption(30, 6)).toBe('The counts under each lane: under 30 min · 30 min to 6 h · over 6 h.');
  });
});

describe('dayMarkA11yLabel', () => {
  const facts = (over: Partial<DayMarkFacts>): DayMarkFacts => ({
    dayKey: '2026-09-19',
    count: 0,
    coverage: 'logged',
    medication: false,
    photo: 'none',
    symptomLayer: true,
    today: false,
    selected: false,
    ...over,
  });
  const date = dayMarkDateWord('2026-09-19');

  it('builds the date from the key\'s own parts (a Saturday), and falls back to the key', () => {
    expect(date).toMatch(/Saturday/);
    expect(date).toMatch(/19/);
    expect(dayMarkDateWord('nope')).toBe('nope');
  });

  it('a logged day with episodes speaks the count; without, "logged, no <noun>"', () => {
    expect(dayMarkA11yLabel(facts({ count: 2 }), 'vomiting')).toBe(`${date}, vomiting logged 2 times`);
    expect(dayMarkA11yLabel(facts({ count: 1 }), 'vomiting')).toBe(`${date}, vomiting logged 1 time`);
    expect(dayMarkA11yLabel(facts({}), 'vomiting')).toBe(`${date}, logged, no vomiting`);
  });

  it('the layer off says "logged" and nothing about what it hid', () => {
    expect(dayMarkA11yLabel(facts({ count: 2, symptomLayer: false }), 'vomiting')).toBe(`${date}, logged`);
  });

  it('unlogged and ahead are spoken as such, whatever the count', () => {
    expect(dayMarkA11yLabel(facts({ count: 3, coverage: 'unlogged' }), 'vomiting')).toBe(`${date}, nothing logged`);
    expect(dayMarkA11yLabel(facts({ count: 3, coverage: 'ahead' }), 'vomiting')).toBe(`${date}, ahead`);
  });

  it('a meal left unfinished, medication, the photo, worth a call, today and selected each add their clause', () => {
    const label = dayMarkA11yLabel(
      facts({ count: 1, coverage: 'left_some', medication: true, photo: 'worth_a_call', today: true, selected: true }),
      'vomiting',
    );
    expect(label).toBe(`${date}, today, vomiting logged 1 time, a meal left unfinished, medication, photographed, read as worth a call, selected`);
    expect(dayMarkA11yLabel(facts({ photo: 'seen' }), 'vomiting')).toBe(`${date}, logged, no vomiting, photographed`);
    expect(label).not.toMatch(NO_VERDICT);
  });
});

describe('weightDotsA11yLabel + weightWord', () => {
  const r = (value: number, iso: string) => ({ value, occurredAt: iso });
  const dateOf = (iso: string) => iso.slice(0, 10);

  it('one decimal and the caller\'s unit', () => {
    expect(weightWord(4.6, 'kg')).toBe('4.6 kg');
    expect(weightWord(10, 'lbs')).toBe('10.0 lbs');
  });

  it('empty, one reading, and the band with a clipped reading disclosed', () => {
    expect(weightDotsA11yLabel(weightBand([]), 'kg', dateOf)).toBe('Weight, no readings.');
    expect(weightDotsA11yLabel(weightBand([r(4.6, '2026-09-12T08:00:00Z')]), 'kg', dateOf)).toBe('Weight, one reading: 4.6 kg on 2026-09-12.');
    const three = weightBand([r(4.6, '2026-07-03T08:00:00Z'), r(4.5, '2026-08-03T08:00:00Z'), r(3.0, '2026-09-12T08:00:00Z')]);
    expect(weightDotsA11yLabel(three, 'kg', dateOf)).toBe(
      'Weight, 3 readings from 2026-07-03 to 2026-09-12, drawn by date on a band from 10 percent below to 10 percent above the first reading: 4.6 kg to 3.0 kg. 1 reading outside the band, drawn at its edge.',
    );
    const two = weightBand([r(4.6, '2026-07-03T08:00:00Z'), r(4.5, '2026-08-03T08:00:00Z')]);
    expect(weightDotsA11yLabel(two, 'kg', dateOf)).not.toContain('outside the band');
    expect(weightDotsA11yLabel(two, 'kg', dateOf)).not.toMatch(/down|up|since/i); // the delta is the caller's
  });
});

describe('dateWord', () => {
  it('formats a key and falls back to it rather than "Invalid Date"', () => {
    expect(dateWord('2026-09-06')).toBe('Sep 6');
    expect(dateWord('not-a-key')).toBe('not-a-key');
  });
});

describe('weightDeltaLine (D2-5)', () => {
  const { weightBand } = jest.requireActual('./chartModels') as typeof import('./chartModels');
  const { weightDeltaLine, HOME_SCALE_CAVEAT, HOME_SCALE_NOISE_FRAC } = jest.requireActual('./chartCopy') as typeof import('./chartCopy');
  const fmt = (iso: string) => iso.slice(5, 10);
  const r = (value: number, occurredAt: string) => ({ value, occurredAt });

  it('speaks the delta with its percentage and the caveat inside a home scale\'s noise', () => {
    const m = weightBand([r(4.6, '2026-07-03T08:00:00Z'), r(4.5, '2026-08-03T08:00:00Z'), r(4.4, '2026-09-12T08:00:00Z')]);
    expect(weightDeltaLine(m, 'kg', fmt)).toBe(`Down 0.2 kg (4%) since 07-03 · ${HOME_SCALE_CAVEAT}`);
    const up = weightBand([r(4.6, '2026-07-03T08:00:00Z'), r(4.7, '2026-09-12T08:00:00Z')]);
    expect(weightDeltaLine(up, 'kg', fmt)).toBe(`Up 0.1 kg (2%) since 07-03 · ${HOME_SCALE_CAVEAT}`);
  });

  it('the caveat is GATED: past the noise bound a loss prints alone, with nothing that softens it (Dr. Chen)', () => {
    const loss = weightBand([r(10, '2026-07-03T08:00:00Z'), r(8.5, '2026-09-12T08:00:00Z')]);
    const line = weightDeltaLine(loss, 'lbs', fmt);
    expect(line).toBe('Down 1.5 lbs (15%) since 07-03');
    expect(line).not.toContain('home scale');
    // The bound itself is inclusive and named once.
    const atBound = weightBand([r(10, '2026-07-03T08:00:00Z'), r(10 * (1 - HOME_SCALE_NOISE_FRAC), '2026-09-12T08:00:00Z')]);
    expect(weightDeltaLine(atBound, 'lbs', fmt)).toContain(HOME_SCALE_CAVEAT);
    const pastBound = weightBand([r(10, '2026-07-03T08:00:00Z'), r(10 * (1 - HOME_SCALE_NOISE_FRAC) - 0.1, '2026-09-12T08:00:00Z')]);
    expect(weightDeltaLine(pastBound, 'lbs', fmt)).not.toContain(HOME_SCALE_CAVEAT);
  });

  it('no verdict words: down is not "lost", flat is "no change", never "steady"', () => {
    const flat = weightBand([r(4.6, '2026-07-03T08:00:00Z'), r(4.62, '2026-09-12T08:00:00Z')]);
    expect(weightDeltaLine(flat, 'kg', fmt)).toBe('No change since 07-03');
    const m = weightBand([r(10, '2026-07-03T08:00:00Z'), r(8.5, '2026-09-12T08:00:00Z')]);
    expect(weightDeltaLine(m, 'lbs', fmt)).not.toMatch(/lost|gained|steady|stable|holding|improv|good|healthy|!/i);
  });

  it('null below two readings — one reading is a number, not a line', () => {
    expect(weightDeltaLine(weightBand([r(4.6, '2026-09-12T08:00:00Z')]), 'kg', fmt)).toBeNull();
    expect(weightDeltaLine(weightBand([]), 'kg', fmt)).toBeNull();
  });
});
