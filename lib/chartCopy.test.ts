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
    answers: true,
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

  it('a day a bout continues into is never "no <noun>": it names the day the bout began (CUL-1226)', () => {
    const cont = facts({ continuesFrom: '2026-09-18' });
    expect(dayMarkA11yLabel(cont, 'vomiting')).toBe(`${date}, vomiting logged, part of the bout that began ${dateWord('2026-09-18')}`);
    expect(dayMarkA11yLabel(cont, 'vomiting')).not.toMatch(/\bno vomiting\b/);
    expect(dayMarkA11yLabel(cont, 'vomiting')).not.toMatch(NO_VERDICT);
    // A day with its own count speaks the count; the layer off hides both.
    expect(dayMarkA11yLabel(facts({ count: 1, continuesFrom: '2026-09-18' }), 'vomiting')).toBe(`${date}, vomiting logged 1 time`);
    expect(dayMarkA11yLabel(facts({ continuesFrom: '2026-09-18', symptomLayer: false }), 'vomiting')).toBe(`${date}, logged`);
    // No continuation: the old sentence, unchanged.
    expect(dayMarkA11yLabel(facts({ continuesFrom: null }), 'vomiting')).toBe(`${date}, logged, no vomiting`);
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
  /** The caller's absolute gate, in the readings' unit: 0.2 kg here (the card passes 0.5 lbs). */
  const NOISE = 0.2;
  const line = (readings: { value: number; occurredAt: string }[], unit = 'kg') => weightDeltaLine(weightBand(readings), unit, fmt, { model: weightBand(readings), noiseAbs: NOISE });

  it('speaks the delta with its percentage and the caveat inside BOTH of a home scale\'s bounds', () => {
    expect(line([r(4.6, '2026-07-03T08:00:00Z'), r(4.5, '2026-09-12T08:00:00Z')])).toBe(`Down 0.1 kg (2%) since 07-03 · ${HOME_SCALE_CAVEAT}`);
    expect(line([r(4.6, '2026-07-03T08:00:00Z'), r(4.7, '2026-09-12T08:00:00Z')])).toBe(`Up 0.1 kg (2%) since 07-03 · ${HOME_SCALE_CAVEAT}`);
  });

  // PMD-3 as GC-7 ruled it (CUL-1553): the caveat only at two readings or when readings
  // disagree in direction; runs stated; a strict bound on the stored unit.
  describe('the caveat never shrugs off a run (PMD-3, GC-7 item 4)', () => {
    const days = ['2026-07-03', '2026-07-17', '2026-07-31', '2026-08-14', '2026-08-28', '2026-09-11', '2026-09-25'];
    const series = (vals: number[]) => vals.map((v, i) => r(v, `${days[i]}T08:00:00Z`));

    it('three readings falling in order: the run is stated and the caveat is withheld, inside both bounds', () => {
      const run = line(series([4.6, 4.55, 4.5]));
      expect(run).toBe('Down 0.1 kg (2%) since 07-03 · lower at each of the last 2 readings');
      expect(run).not.toContain('home scale');
    });

    it('the critique\'s counterexample: six readings falling in strict order never read as scale noise', () => {
      const six = line(series([4.6, 4.58, 4.56, 4.54, 4.52, 4.5]));
      expect(six).toBe('Down 0.1 kg (2%) since 07-03 · lower at each of the last 5 readings');
      expect(six).not.toContain('home scale');
    });

    it('a run upward is stated the same way', () => {
      expect(line(series([4.4, 4.55, 4.7]))).toBe('Up 0.3 kg (7%) since 07-03 · higher at each of the last 2 readings');
      // Under a scale's own wobble overall, a rise is not announced (round 2).
      expect(line(series([4.5, 4.55, 4.6]))).toBe('Up 0.1 kg (2%) since 07-03');
    });

    it('three or more readings never get the caveat, even a true scatter: the scatter branch is withheld (CUL-1557)', () => {
      // Five adversarial rounds each walked a scatter heuristic around a sustained cat loss.
      expect(line(series([4.6, 4.66, 4.54, 4.66, 4.54]))).toBe('Down 0.1 kg (1%) since 07-03');
      // Ending low with no reading back above the start since the middle is not a scatter (round 3).
      expect(line(series([4.6, 4.65, 4.55, 4.6, 4.5]))).not.toContain('home scale');
    });

    it('a run at the end of a series that once moved the other way is still stated, and still no caveat', () => {
      const tail = line(series([4.6, 4.65, 4.6, 4.55, 4.5]));
      expect(tail).toBe('Down 0.1 kg (2%) since 07-03 · lower at each of the last 3 readings');
      expect(tail).not.toContain('home scale');
    });

    it('a series that only ever moved one way gets no caveat even when a flat step ends the run', () => {
      // The shipped §04 fixture: 4.6, 4.6, 4.5, 4.5, 4.4, 4.4. No step up, so it never reads as wobble.
      const stairs = line(series([4.6, 4.6, 4.5, 4.5, 4.4, 4.4]));
      expect(stairs).toBe('Down 0.2 kg (4%) since 07-03');
    });

    it('the adversarial pass: a steady loss ending in one 10 g up-tick never regains the caveat', () => {
      // A step-wise "both ways" test handed this the caveat; it never comes back to its start.
      expect(line(series([4.6, 4.55, 4.5, 4.45, 4.41, 4.42]))).toBe('Down 0.2 kg (4%) since 07-03');
      expect(line(series([4.6, 4.5, 4.42, 4.43, 4.42, 4.43]))).not.toContain('home scale');
      expect(line(series([5.0, 4.85, 4.9, 4.82]))).not.toContain('home scale');
    });

    it('the adversarial pass: a few grams of rise beside a large loss is never stated as a run', () => {
      // "up at each of the last 2 readings" beside a 24 % loss reads as recovery.
      expect(line(series([6.0, 4.5, 4.51, 4.52]))).toBe('Down 1.5 kg (25%) since 07-03 · 2 readings outside the band');
    });

    it('round 2: one 10 g reading above the start is not a scatter; the caveat stays off a steady loss', () => {
      expect(line(series([4.6, 4.62, 4.5, 4.45, 4.46]))).not.toContain('home scale');
      const seven = [5.0, 5.01, 4.96, 4.92, 4.88, 4.84, 4.83, 4.84].map((v, i) => r(v, `2026-${String(7 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}T08:00:00Z`));
      expect(line(seven)).not.toContain('home scale');
      expect(line(series([5.0, 4.95, 5.02, 4.97, 4.93, 4.89, 4.9]))).not.toContain('home scale');
    });

    it('round 2: scatters, balanced or padded, never get the caveat past two readings', () => {
      expect(line(series([4.6, 4.7, 4.5, 4.65, 4.55]))).not.toContain('home scale');
      expect(line(series([4.6, 4.61, 4.5, 4.62, 4.55]))).not.toContain('home scale');
      // Material on both sides but five of six below: a loss with one high reading, no caveat.
      expect(line(series([4.6, 4.7, 4.58, 4.56, 4.57, 4.55, 4.56]))).not.toContain('home scale');
    });

    it('round 2: a rise of a few grams after a dip is never stated as a run', () => {
      expect(line(series([4.0, 3.7, 3.8, 3.9, 4.01]))).not.toContain('higher at each');
    });

    it('round 2: when the stored readings and the drawn ones differ, the line never prints the caveat', () => {
      const shown = weightBand([r(8.8, '2026-07-04T08:00:00Z'), r(8.6, '2026-09-12T08:00:00Z')]);
      const stored = weightBand([r(0.01, '2026-07-03T08:00:00Z'), r(4.0, '2026-07-04T08:00:00Z'), r(3.9, '2026-09-12T08:00:00Z')]);
      const out = weightDeltaLine(shown, 'lbs', fmt, { model: stored, noiseAbs: 0.2 }) as string;
      expect(out).toBe('Down 0.2 lbs (2%) since 07-04');
    });

    it('round 3: a step-down loss is not a scatter, whatever its last step does', () => {
      // Three readings at the start, then three lower that never come back.
      for (const vals of [
        [4.0, 4.05, 4.01, 3.88, 3.84, 3.84],
        [4.0, 4.05, 4.02, 3.9, 3.84, 3.86],
        [4.0, 4.06, 4.03, 4.01, 3.9, 3.86, 3.84, 3.84],
        [6.5, 6.56, 6.52, 6.4, 6.32, 6.31, 6.32],
        [4.0, 4.05, 4.04, 3.95, 3.85, 3.85],
        [4.0, 4.05, 3.85, 3.85],
      ]) {
        const days7 = vals.map((v, i) => r(v, `2026-${String(7 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}T08:00:00Z`));
        expect(line(days7)).not.toContain('home scale');
      }
    });

    it('round 4: a step-down that holds its lower level at the end never reads as wobble, however it is padded', () => {
      const weekly = (vals: number[]) => vals.map((v, i) => r(v, `2026-${String(7 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}T08:00:00Z`));
      for (const vals of [
        [3.0, 3.01, 3.01, 3.01, 3.01, 3.06, 2.88, 2.87, 2.86, 2.87],
        [4.0, 4.01, 4.01, 4.01, 4.01, 4.06, 3.87, 3.86, 3.85, 3.86],
        [3.0, 3.01, 3.01, 3.01, 3.01, 3.01, 3.06, 2.88, 2.87, 2.88, 2.87, 2.88],
        [3.0, 3.01, 3.01, 3.01, 3.01, 3.06, 2.93, 2.9, 2.88, 2.89],
        [3.0, 3.01, 2.94, 3.06, 2.87, 2.88],
        [3.0, 3.06, 2.94, 3.06, 2.94, 3.06, 2.88, 2.87, 2.88],
      ]) {
        expect(line(weekly(vals))).not.toContain('home scale');
      }
    });

    it('round 5: a long sub-edge hold with one blip near the end never gets the caveat', () => {
      const weekly = (vals: number[]) => vals.map((v, i) => r(v, `2026-${String(7 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}T08:00:00Z`));
      for (const vals of [
        [4.0, 3.96, 3.96, 3.96, 3.96, 3.96, 3.96, 3.96, 3.96, 4.06, 3.83, 3.84],
        [4.0, 3.96, 3.96, 3.96, 3.96, 4.06, 3.85, 3.86],
        [4.0, 3.96, 3.96, 3.96, 3.96, 3.94, 4.06, 3.83],
        [2.5, 2.46, 2.46, 2.46, 2.46, 2.56, 2.4, 2.41],
        [4.0, 3.96, 3.96, 3.96, 4.06, 3.85, 4.01, 3.84],
      ]) {
        expect(line(weekly(vals))).not.toContain('home scale');
      }
    });

    it('round 3: the 5 % bound is strict in whole grams — an exact 5 % pair never gets the caveat', () => {
      // 0.15 / 3.0 is 0.04999999999999997 in binary; a float compare let it through.
      for (const [a, b] of [[1.4, 1.33], [2.6, 2.47], [2.8, 2.66], [3.0, 2.85], [3.4, 3.23], [3.8, 3.61]]) {
        expect(line([r(a, '2026-07-03T08:00:00Z'), r(b, '2026-09-12T08:00:00Z')])).not.toContain('home scale');
      }
    });

    it('round 3: the caveat never sits beside a percentage that reads as 5 %', () => {
      // 4.75 % is under the bound and displays "(5%)", a cat's workup number.
      expect(line([r(4.0, '2026-07-03T08:00:00Z'), r(3.81, '2026-09-12T08:00:00Z')])).toBe('Down 0.2 kg (5%) since 07-03');
      expect(line([r(4.0, '2026-07-03T08:00:00Z'), r(3.83, '2026-09-12T08:00:00Z')])).toContain(HOME_SCALE_CAVEAT);
    });

    it('a fall against an overall rise is stated, joined with "but"; it is the accusing half', () => {
      expect(line(series([4.0, 5.0, 4.8, 4.7]))).toBe('Up 0.7 kg (18%) since 07-03 · but lower at each of the last 2 readings · 2 readings outside the band');
    });

    it('"No change" is the stored fact, never the display\'s rounding', () => {
      const lbs = weightBand([r(9.9, '2026-07-03T08:00:00Z'), r(9.9, '2026-09-12T08:00:00Z')]);
      const kg = weightBand([r(4.49, '2026-07-03T08:00:00Z'), r(4.47, '2026-09-12T08:00:00Z')]);
      expect(weightDeltaLine(lbs, 'lbs', fmt, { model: kg, noiseAbs: 0.2 })).toBe(`Down less than 0.1 lbs since 07-03 · ${HOME_SCALE_CAVEAT}`);
    });

    it('a flat step ends a run: equal is not lower', () => {
      expect(line(series([4.7, 4.6, 4.6]))).not.toContain('at each of the last');
    });

    it('the absolute bound is STRICT and read in thousandths: exactly 0.2 kg is not under 0.2 kg', () => {
      // 4.6 − 4.4 is 0.19999999999999973 in binary; the edge is decided in grams.
      expect(line([r(4.6, '2026-07-03T08:00:00Z'), r(4.4, '2026-09-12T08:00:00Z')])).toBe('Down 0.2 kg (4%) since 07-03');
      expect(line([r(4.6, '2026-07-03T08:00:00Z'), r(4.401, '2026-09-12T08:00:00Z')])).toContain(HOME_SCALE_CAVEAT);
    });

    it('the fractional bound is STRICT: a move of exactly 5 % is not under 5 %', () => {
      // 2.0 → 1.9 kg is 0.1 kg (inside the absolute bound) and exactly 5 %.
      expect(line([r(2.0, '2026-07-03T08:00:00Z'), r(1.9, '2026-09-12T08:00:00Z')])).toBe('Down 0.1 kg (5%) since 07-03');
    });

    it('the gate reads the STORED readings, not the display\'s: a display move inside the bound cannot open it', () => {
      const lbs = weightBand([r(10.1, '2026-07-03T08:00:00Z'), r(9.7, '2026-09-12T08:00:00Z')]);
      const kg = weightBand([r(4.6, '2026-07-03T08:00:00Z'), r(4.4, '2026-09-12T08:00:00Z')]);
      // A generous display-unit bound would have let 0.4 lbs through; the kilograms decide.
      expect(weightDeltaLine(lbs, 'lbs', fmt, { model: kg, noiseAbs: 0.2 })).toBe('Down 0.4 lbs (4%) since 07-03');
    });
  });

  it('the fractional gate: past the noise bound a loss prints alone, with nothing that softens it (Dr. Chen)', () => {
    const loss = line([r(10, '2026-07-03T08:00:00Z'), r(8.5, '2026-09-12T08:00:00Z')]);
    expect(loss).toBe('Down 1.5 kg (15%) since 07-03');
    expect(loss).not.toContain('home scale');
    // Just inside the fractional bound on a pet where both gates agree: the caveat prints.
    const inside = line([r(4, '2026-07-03T08:00:00Z'), r(4 * (1 - HOME_SCALE_NOISE_FRAC) + 0.04, '2026-09-12T08:00:00Z')]);
    expect(inside).toContain(HOME_SCALE_CAVEAT);
  });

  it('the ABSOLUTE gate: a scale does not wobble 3.5 kg — a 70 kg dog down 5 % gets no caveat (C-34, the adversarial pass)', () => {
    const dog = line([r(70, '2026-07-03T08:00:00Z'), r(66.5, '2026-09-12T08:00:00Z')]);
    expect(dog).toBe('Down 3.5 kg (5%) since 07-03');
    expect(dog).not.toContain('home scale');
    const bigCat = line([r(9, '2026-07-03T08:00:00Z'), r(8.55, '2026-09-12T08:00:00Z')]);
    expect(bigCat).not.toContain('home scale');
    // And a 4.6 kg cat down 0.15 kg is inside both: the caveat prints.
    expect(line([r(4.6, '2026-07-03T08:00:00Z'), r(4.45, '2026-09-12T08:00:00Z')])).toContain(HOME_SCALE_CAVEAT);
  });

  it('"No change" is decided by the FACT, never by display rounding: a 300 g kitten down 20 g is a 7 % loss', () => {
    // 0.66 lbs → 0.616 lbs: Δ −0.044 rounds to 0.0 on the display; the fraction does not.
    const kitten = line([r(0.66, '2026-07-03T08:00:00Z'), r(0.616, '2026-09-12T08:00:00Z')], 'lbs');
    expect(kitten).toBe('Down less than 0.1 lbs (7%) since 07-03');
    expect(kitten).not.toContain('No change');
    expect(kitten).not.toContain('home scale');
    // An exactly equal pair is "No change"; a sub-precision move inside both gates keeps the caveat.
    expect(line([r(4.6, '2026-07-03T08:00:00Z'), r(4.6, '2026-09-12T08:00:00Z')])).toBe('No change since 07-03');
    expect(line([r(4.6, '2026-07-03T08:00:00Z'), r(4.62, '2026-09-12T08:00:00Z')])).toBe(`Up less than 0.1 kg since 07-03 · ${HOME_SCALE_CAVEAT}`);
  });

  it('a reading outside the band between the ends is disclosed — "No change" never stands alone over a 30 % dip', () => {
    const dip = line([r(5.0, '2026-07-03T08:00:00Z'), r(3.5, '2026-08-03T08:00:00Z'), r(5.0, '2026-09-12T08:00:00Z')]);
    expect(dip).toBe('No change since 07-03 · 1 reading outside the band');
  });

  it('no verdict words: down is not "lost", flat is "no change", never "steady"', () => {
    const m = line([r(10, '2026-07-03T08:00:00Z'), r(8.5, '2026-09-12T08:00:00Z')], 'lbs');
    expect(m).not.toMatch(/lost|gained|steady|stable|holding|improv|good|healthy|!/i);
  });

  it('null below two readings — one reading is a number, not a line', () => {
    expect(line([r(4.6, '2026-09-12T08:00:00Z')])).toBeNull();
    expect(line([])).toBeNull();
  });

  it('a zero or negative reading is not a weight: dropped by the band, never a flat line over it', () => {
    const m = weightBand([r(0, '2026-07-03T08:00:00Z'), r(4.5, '2026-09-12T08:00:00Z')]);
    expect(m.state).toBe('number');
    expect(m.points).toHaveLength(1);
    expect(weightBand([r(-1, '2026-07-03T08:00:00Z')]).state).toBe('empty');
  });
});

describe('dayMarkA11yLabel — logged is not answered, and a refusal is named (CUL-1553)', () => {
  const facts = (over: Partial<DayMarkFacts>): DayMarkFacts => ({
    dayKey: '2026-09-19',
    count: 0,
    coverage: 'logged',
    answers: true,
    medication: false,
    photo: 'none',
    symptomLayer: true,
    today: false,
    selected: false,
    ...over,
  });
  const date = dayMarkDateWord('2026-09-19');

  it('a logged day that answers nothing says "logged" and never "no <noun>" (CUL-1074 brief 2)', () => {
    expect(dayMarkA11yLabel(facts({ answers: false, medication: true }), 'vomiting')).toBe(`${date}, logged, medication`);
    expect(dayMarkA11yLabel(facts({ answers: false }), 'itching')).not.toMatch(/\bno itching\b/);
    // A count is still spoken on a day that holds the symptom: the row answers for itself.
    expect(dayMarkA11yLabel(facts({ answers: false, count: 2 }), 'vomiting')).toBe(`${date}, vomiting logged 2 times`);
  });

  it('a refused meal is counted in the words, and the lighter word is kept only for another meal', () => {
    expect(dayMarkA11yLabel(facts({ coverage: 'left_some', refusedMeals: 2 }), 'vomiting')).toBe(`${date}, logged, no vomiting, 2 meals refused`);
    expect(dayMarkA11yLabel(facts({ coverage: 'left_some', refusedMeals: 1, leftSomeMeals: 1 }), 'vomiting')).toBe(
      `${date}, logged, no vomiting, 1 meal refused, a meal left unfinished`,
    );
    expect(dayMarkA11yLabel(facts({ coverage: 'left_some', leftSomeMeals: 1 }), 'vomiting')).toBe(`${date}, logged, no vomiting, a meal left unfinished`);
    // With the Meals layer off the caller passes no split: the coverage's word stands.
    expect(dayMarkA11yLabel(facts({ coverage: 'left_some' }), 'vomiting')).toBe(`${date}, logged, no vomiting, a meal left unfinished`);
  });
});
