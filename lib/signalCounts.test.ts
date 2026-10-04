// GC-4 (CUL-1217): the one count. Every number the screen's composed title and sentence state
// for a named window equals the drawn chart's count under that label — property-tested over
// engine-shaped findings and random records, in day keys only (C-29), so the three CI zones
// see one calendar. The counterexamples from the issue are pinned by name.

import { signalCountsOf, countedSentence, countedTitle, countedUnitLine, countedAtLine, isCountedFinding, type CountedFinding } from './signalCounts';
import { signalWeeks } from './signalWindows';
import { weekLineWithheld } from './signalWithhold';
import { hasBannedSignalVocabulary } from './signalCopy';
import type { ReflectionFinding, SignalFinding, SymptomChronicityFinding, SymptomWorseningFinding } from './signal';
import { dayKeyFromIndex, localDayIndexOf } from './utils';

const idx = (key: string): number => {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(key);
  return i;
};
const shift = (key: string, days: number): string => dayKeyFromIndex(idx(key) + days);

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const MONDAY = '2026-09-21';

// Engine-shaped payloads: the fields the engine emits, with numbers the screen must NOT echo.
const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 99,
  spanDays: 40,
  activeWeeks: 77,
  symptomDays: 12,
  daysSinceLastEpisode: 1,
  firstOnsetIso: '2026-08-01T00:00:00Z',
  tier: 'standard',
  windowDays: 56,
  ...over,
});
const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 91,
  priorCount: 92,
  currentDays: 93,
  priorDays: 94,
  trigger: 'more_episodes',
  tier: 'standard',
  windowDays: 7,
  ...over,
});
const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 81,
  priorCount: 82,
  direction: 'flat',
  windowDays: 7,
  ...over,
});

function compose(finding: CountedFinding, today: string, episodeDays: string[], loggedDays: string[] = [], notEating: boolean | null = false) {
  const weekly = signalWeeks({ finding, today, trial: null, episodeDays, loggedDays });
  const withheld = weekLineWithheld(weekly, {
    finding,
    symptom: finding.symptomType,
    notEating,
    gateLoggedDays: loggedDays,
    trial: null,
    trialUnanswered: false,
  });
  const c = signalCountsOf(finding, weekly, episodeDays, today);
  return { weekly, c, withheld, title: countedTitle(finding, c), sentence: countedSentence(finding, c, 'Nyx', withheld != null) };
}

const numbersIn = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);

describe('GC-4 — the issue’s counterexamples', () => {
  it('BRK-3: Tuesday to Saturday after 2 the week before, read Monday — the sentence and the bars say 5 and 2', () => {
    const run = [-6, -5, -4, -3, -2].map((d) => shift(MONDAY, d));
    const before = [shift(MONDAY, -9), shift(MONDAY, -12)];
    const { weekly, sentence, title } = compose(worsening(), MONDAY, [...run, ...before]);
    const n = weekly.weeks.length;
    expect(weekly.weeks[n - 1].count).toBe(5);
    expect(weekly.weeks[n - 2].count).toBe(2);
    expect(title).toBe('Vomiting, 5 episodes in the last 7 days');
    expect(sentence).toBe('Nyx has had 5 episodes of vomiting in the last 7 days, and 2 in the 7 before — worth a word with your vet.');
  });

  it('BRK-5 / WBC-1: one onset every 6 days over 56 days — the title counts the eight bars it sits over', () => {
    const days: string[] = [];
    for (let d = 0; d < 56; d += 6) days.push(shift(MONDAY, -d));
    const { weekly, title, c } = compose(chronicity(), MONDAY, days);
    expect(weekly.weeks).toHaveLength(8);
    const nonEmpty = weekly.weeks.filter((w) => w.count > 0).length;
    expect(c.activeWeeks).toBe(nonEmpty);
    expect(title).toBe(`Vomiting in ${nonEmpty} of the last 8 weeks`);
    // Never the engine's greedy count, whatever the payload carries.
    expect(title).not.toContain('77');
  });

  it('"12 episodes since August": the count names the window it was counted over, never a month', () => {
    const days = ['2026-08-02', '2026-08-04', '2026-08-05'];
    for (let d = 0; d < 12; d++) days.push(shift('2026-10-01', -d * 4));
    const today = '2026-10-02';
    const { sentence, c } = compose(chronicity(), today, days);
    expect(sentence).not.toMatch(/since/i);
    expect(sentence).toContain(`${c.lookbackEpisodes} episodes in those weeks`);
    // The three early-August episodes fall before the eight weeks and are not in its count.
    expect(c.lookbackEpisodes).toBe(12);
  });

  it('GC-3: a worsening that has since fallen never prints the earlier window', () => {
    const recent = [shift(MONDAY, -1)];
    const prior = [-8, -9, -10].map((d) => shift(MONDAY, d));
    for (const tier of ['standard', 'soft', 'firm'] as const) {
      const { sentence, c } = compose(worsening({ tier, trigger: tier === 'standard' ? 'more_episodes' : 'more_days' }), MONDAY, [...recent, ...prior]);
      expect(c.prior?.episodes).toBe(3);
      expect(sentence).not.toMatch(/the 7 before/);
      // The ask is the engine's, kept: a recount never quiets an escalation.
      expect(sentence).toMatch(/worth/);
    }
  });

  it('a zero earlier window is the New fact, never paired (B-727)', () => {
    const { sentence } = compose(worsening(), MONDAY, [shift(MONDAY, -1), shift(MONDAY, -2)]);
    expect(sentence).toBe('Nyx has had 2 episodes of vomiting in the last 7 days — worth a word with your vet.');
  });

  it('a falling reflection pair beside a not-eating record prints the recent count alone (CUL-1216)', () => {
    const prior = [-8, -9, -10].map((d) => shift(MONDAY, d));
    const loggedDays = Array.from({ length: 14 }, (_, i) => shift(MONDAY, -i));
    expect(compose(reflection(), MONDAY, prior, loggedDays, false).sentence).toMatch(/^We've logged 0 episodes of vomiting for Nyx in the last 7 days, and 3 in the 7 before\./);
    expect(compose(reflection(), MONDAY, prior, loggedDays, true).sentence).toMatch(/^We've logged 0 episodes of vomiting for Nyx in the last 7 days\./);
  });

  it('the cough↔vomit adjacency survives the recount, in the engine’s words', () => {
    const { sentence } = compose(chronicity({ coughVomitAdjacent: true }), MONDAY, [MONDAY]);
    expect(sentence).toContain('Coughing is logged too — a cough can look like retching or end in vomiting. Mention both.');
  });
});

describe('GC-4 — PROPERTY: every stated number is the chart’s count under its label', () => {
  it('over random engine-shaped findings and records', () => {
    const rnd = lcg(0x1217);
    for (let t = 0; t < 400; t++) {
      const today = shift(MONDAY, Math.floor(rnd() * 400) - 200);
      const pick = rnd();
      const tiers = ['standard', 'soft', 'firm'] as const;
      const finding: CountedFinding =
        pick < 0.4
          ? chronicity({ tier: rnd() < 0.5 ? 'firm' : 'standard', windowDays: 7 * (1 + Math.floor(rnd() * 12)) })
          : pick < 0.75
            ? (() => {
                // Engine-shaped (`resolveWorseningTier`): standard ⇔ more_episodes, soft ⇔ more_days,
                // firm either (C-35: no fixture the engine cannot emit).
                const tier = tiers[Math.floor(rnd() * 3)];
                const trigger = tier === 'standard' ? 'more_episodes' : tier === 'soft' ? 'more_days' : rnd() < 0.5 ? 'more_days' : 'more_episodes';
                return worsening({ tier, trigger });
              })()
            : reflection({ direction: rnd() < 0.5 ? 'flat' : 'improving' });
      const episodeDays: string[] = [];
      const n = Math.floor(rnd() * 40);
      for (let i = 0; i < n; i++) episodeDays.push(shift(today, -Math.floor(rnd() * 100) + (rnd() < 0.03 ? 3 : 0)));
      const loggedDays = Array.from({ length: 100 }, (_, i) => shift(today, -i)).filter(() => rnd() < 0.8);
      const { weekly, c, withheld, title, sentence } = compose(finding, today, episodeDays, loggedDays, rnd() < 0.3 ? true : false);
      const bars = weekly.weeks;
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      const distinct = (from: string, to: string) => new Set(episodeDays.filter((k) => idx(k) >= idx(from) && idx(k) <= idx(to))).size;

      // The windows are the bars: the last bar ends today and is 7 days.
      expect(last.endKey).toBe(today);
      expect(c.recent).toEqual({ episodes: last.count, days: distinct(last.startKey, last.endKey) });
      expect(c.prior).toEqual({ episodes: prev.count, days: distinct(prev.startKey, prev.endKey) });
      const lookback = bars.slice(bars.length - c.lookbackWeeks);
      expect(c.lookbackEpisodes).toBe(lookback.reduce((a, b) => a + b.count, 0));
      expect(c.activeWeeks).toBe(lookback.filter((b) => b.count > 0).length);

      // Every number in the title is one the sentence states too (CUL-1270's parity), and every
      // number in the sentence is one of the chart's counts under the label it is spoken with.
      const allowed = new Set<number>([7, c.lookbackWeeks, c.activeWeeks, c.lookbackEpisodes, c.recent.episodes, c.recent.days, prev.count, c.prior?.days ?? -1]);
      if (c.daysSinceLast != null) allowed.add(c.daysSinceLast);
      for (const x of numbersIn(sentence)) expect(allowed.has(x)).toBe(true);
      for (const x of numbersIn(title)) expect(numbersIn(sentence)).toContain(x);

      // Never a payload number (the fixtures' 77 / 81–99 are all impossible from ≤ 40 episodes).
      for (const x of numbersIn(`${title} ${sentence}`)) expect(x).toBeLessThan(77);

      // A safety finding never prints a fall; an insight prints the pair only where the gates let it.
      const priorSaid = /the 7 before/.test(sentence);
      // The axis is the trigger's (the third pass): the one that rose, as the engine and the script say it.
      const axis = finding.type === 'symptom_worsening' && finding.tier !== 'standard' && finding.trigger === 'more_days' ? 'days' : 'episodes';
      if (priorSaid && finding.priorityClass === 'safety') {
        // Strictly below: a flat pair under a safety card reads calmer than "up from".
        expect((c.prior as { days: number; episodes: number })[axis]).toBeLessThan(c.recent[axis]);
      }
      if (priorSaid && finding.priorityClass === 'insight') expect(withheld).toBeNull();
      // And never above the engine's own earlier count on that axis (the second pass).
      if (priorSaid) {
        const engineDays = axis === 'days';
        const stated = engineDays ? (c.prior as { days: number }).days : (c.prior as { episodes: number }).episodes;
        const bound = finding.type === 'symptom_worsening' ? (engineDays ? finding.priorDays : finding.priorCount) : finding.type === 'reflection' ? finding.priorCount : -1;
        expect(stated).toBeLessThanOrEqual(bound);
      }

      // The voice: no "times" over an episode count, no "this week", nothing the vocabulary bans.
      expect(`${title} ${sentence}`).not.toMatch(/\btimes?\b|this week|last week|since|!/);
      expect(hasBannedSignalVocabulary(sentence)).toBe(false);
    }
  });
});

describe('the rest of the module', () => {
  it('counts only the frequency claims whose window the bars draw', () => {
    expect(isCountedFinding(chronicity())).toBe(true);
    expect(isCountedFinding(worsening())).toBe(true);
    expect(isCountedFinding(reflection())).toBe(true);
    const burden = { type: 'symptom_burden', priorityClass: 'safety' } as unknown as SignalFinding;
    expect(isCountedFinding(burden)).toBe(false);
  });

  it('the unit line names the bar and the episode; the counted-at line names the time', () => {
    expect(countedUnitLine()).toBe(
      'Each bar is 7 days, the last one ending today. Entries of the same sign logged within 3 hours of each other count as one episode.',
    );
    expect(countedAtLine(new Date(2026, 8, 21, 9, 14).getTime())).toMatch(/^Counted at .*9.*14.*\.$/);
  });
});
