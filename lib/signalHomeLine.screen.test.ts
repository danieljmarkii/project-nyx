// GC-4 PR 2 (CUL-1569): Home's Signal row states the screen's counts. The row reads the
// screen's own model (`loadSignalRowScreen` → `loadSignalScreen`), so the parity below is over
// the real builder: for one record and one clock, the row's headline IS the screen's title, and
// every number on the row's count line is one the screen's sentence states, under the same
// window. Property-tested over engine-shaped findings and random records, in day keys only
// (C-29), so the three CI zones see one calendar.

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn() }) }));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { buildSignalScreenModel, type SignalScreenEpisode, type SignalScreenInput } from './signalScreen';
import type { CachedFinding, ReflectionFinding, SymptomChronicityFinding, SymptomWorseningFinding, TrialResponseFinding } from './signal';
import { countedHomePair, type CountedFinding } from './signalCounts';
import { signalHomeLine, signalHomeLineFromScreen, type SignalHomeLine } from './signalHomeLine';
import type { SignalTrialWindow } from './signalWindows';
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

function episode(dayKey: string, hour = 9): SignalScreenEpisode {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) throw new Error(dayKey);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 11);
  return { eventId: `ev-${dayKey}-${hour}`, occurredAt: d.toISOString(), dayKey, minutesSinceMeal: null, photo: null };
}

const cachedOf = (finding: CachedFinding['finding']): CachedFinding => ({ rank: 0, text: 'The engine’s own sentence.', finding });

const MONDAY = '2026-09-21';

function inputOf(over: Partial<SignalScreenInput> & Pick<SignalScreenInput, 'cached' | 'episodes' | 'today'>): SignalScreenInput {
  const loggedDays: string[] = [];
  for (let i = -120; i <= 0; i++) loggedDays.push(shift(over.today, i));
  return {
    petName: 'Nyx',
    trial: null,
    loggedDays,
    gateLoggedDays: loggedDays,
    recordStart: shift(over.today, -300),
    verdicts: {},
    doses: [],
    notEating: false,
    trialVomitingLine: null,
    trialUnanswered: false,
    masking: null,
    generatedOn: null,
    countedAtMs: new Date(2026, 8, 21, 9, 14).getTime(),
    generatedAtMs: new Date(2026, 8, 21, 1, 2).getTime(),
    ...over,
  };
}

/** The row as SignalRow draws it once the screen's read has answered. */
function rowOf(model: ReturnType<typeof buildSignalScreenModel>): SignalHomeLine {
  const base = signalHomeLine(model.finding, null) as SignalHomeLine;
  return signalHomeLineFromScreen(base, model);
}

const numbersIn = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);

const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 3,
  spanDays: 40,
  activeWeeks: 2,
  symptomDays: 3,
  daysSinceLastEpisode: 30,
  firstOnsetIso: '2026-08-01T00:00:00Z',
  tier: 'standard',
  windowDays: 56,
  ...over,
});
const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 2,
  priorCount: 6,
  currentDays: 2,
  priorDays: 6,
  trigger: 'more_episodes',
  tier: 'standard',
  windowDays: 7,
  ...over,
});
const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 1,
  priorCount: 6,
  direction: 'flat',
  windowDays: 7,
  ...over,
});

describe('PARITY — the row states the screen’s counts (CUL-1569)', () => {
  it('over random engine-shaped findings and records: one title, and no number the sentence does not state', () => {
    const rnd = lcg(0x1569);
    let composedSeen = 0;
    let priorSeen = 0;
    let engineSeen = 0;
    for (let t = 0; t < 500; t++) {
      const today = shift(MONDAY, Math.floor(rnd() * 300) - 150);
      const pick = rnd();
      const tiers = ['standard', 'soft', 'firm'] as const;
      // Engine numbers low enough that the escalate-only gate often lets the recount speak, and
      // sometimes high enough that it does not (both branches are walked).
      const lo = () => Math.floor(rnd() * 8);
      const finding: CountedFinding =
        pick < 0.35
          ? chronicity({
              tier: rnd() < 0.5 ? 'firm' : 'standard',
              episodeCount: lo(),
              activeWeeks: Math.floor(rnd() * 5),
              daysSinceLastEpisode: Math.floor(rnd() * 40),
            })
          : pick < 0.7
            ? (() => {
                // Engine-shaped (`resolveWorseningTier`): standard ⇔ more_episodes, soft ⇔ more_days.
                const tier = tiers[Math.floor(rnd() * 3)];
                const trigger = tier === 'standard' ? 'more_episodes' : tier === 'soft' ? 'more_days' : rnd() < 0.5 ? 'more_days' : 'more_episodes';
                return worsening({ tier, trigger, currentCount: lo(), currentDays: Math.min(7, lo()), priorCount: lo(), priorDays: Math.min(7, lo()) });
              })()
            : reflection({ direction: rnd() < 0.5 ? 'flat' : 'improving', currentCount: lo(), priorCount: lo() });
      const days: string[] = [];
      const n = Math.floor(rnd() * 30);
      for (let i = 0; i < n; i++) days.push(shift(today, -Math.floor(rnd() * 70)));
      const model = buildSignalScreenModel(
        inputOf({ cached: cachedOf(finding), today, episodes: days.map((d, i) => episode(d, 6 + (i % 12))), notEating: rnd() < 0.2 ? null : false }),
      );
      const row = rowOf(model);

      // One title: the door is named what the screen it opens is named.
      expect(row.headline).toBe(model.title);
      // The ask is the finding's, never re-derived from a recount.
      expect(row.ask).toBe((signalHomeLine(finding, null) as SignalHomeLine).ask);

      if (model.composed) {
        composedSeen++;
        const said = numbersIn(model.sentence);
        // Every number on the row is one the sentence states.
        for (const x of numbersIn(`${row.headline} ${row.count ?? ''}`)) expect(said).toContain(x);
        // The earlier window is on the row exactly where the sentence stated it.
        const rowPrior = /the 7 before/.test(row.count ?? '');
        expect(rowPrior).toBe(/the 7 before/.test(model.sentence));
        if (rowPrior) priorSeen++;
        // The reflection's drawn pair follows the same verdict, in the same numbers.
        if (finding.type === 'reflection') {
          const pair = countedHomePair(model.composed.counts, model.composed.priorStated);
          expect(pair != null).toBe(rowPrior);
          if (pair) for (const x of [pair.recent, pair.prior]) expect(said).toContain(x);
        }
        // One window vocabulary: the screen's, never the engine's calendar words.
        expect(`${row.headline} ${row.count ?? ''}`).not.toMatch(/this week|last week|week before|\bsince\b/);
      } else {
        engineSeen++;
        // The gate said no: the screen keeps the engine's words, and so does the row.
        expect(row.count).toBe((signalHomeLine(finding, null) as SignalHomeLine).count);
      }
    }
    // Non-vacuity: both branches, and a stated prior, were walked.
    expect(composedSeen).toBeGreaterThan(50);
    expect(engineSeen).toBeGreaterThan(50);
    expect(priorSeen).toBeGreaterThan(10);
  });

  it('the issue’s case: "12 episodes since August" becomes the weeks the title names', () => {
    // 12 episodes over the last 8 weeks, the engine's own 3 before its window not among them.
    const today = MONDAY;
    const days = Array.from({ length: 12 }, (_, i) => shift(today, -4 * i - 1));
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(chronicity({ episodeCount: 12, activeWeeks: 5, daysSinceLastEpisode: 1, tier: 'firm' })), today, episodes: days.map((d) => episode(d)) }));
    expect(model.composed).not.toBeNull();
    const row = rowOf(model);
    expect(row.headline).toBe(model.title);
    expect(row.count).toBe('12 episodes in those weeks');
    expect(model.sentence).toContain('12 episodes in those weeks');
  });

  it('a worsening that has since fallen: the row prints no earlier window, as the sentence prints none (GC-3)', () => {
    const today = MONDAY;
    // 3 in the last 7 days, 5 in the 7 before — a fall under a safety card.
    const days = [0, 1, 2, 7, 8, 9, 10, 11].map((d) => shift(today, -d));
    const f = worsening({ tier: 'firm', trigger: 'more_episodes', currentCount: 3, currentDays: 3, priorCount: 1, priorDays: 1 });
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(f), today, episodes: days.map((d) => episode(d)) }));
    expect(model.composed).not.toBeNull();
    const row = rowOf(model);
    expect(row.count).toBe('3 episodes');
    expect(model.sentence).not.toMatch(/7 before/);
  });
});

describe('the trial row reads the strip’s counts, where the screen does (CUL-1569)', () => {
  const trialWindow = (today: string): SignalTrialWindow => ({ startDay: shift(today, -29), identity: 'Rabbit trial', dayCounter: 30, targetDays: 56, foodLabel: null });
  const trialCard: TrialResponseFinding = {
    type: 'trial_response',
    priorityClass: 'insight',
    trialDayNumber: 28,
    targetDurationDays: 56,
    trialLoggedDays: 28,
    baselineLoggedDays: 40,
    baselineWindowDays: 49,
    pooledTrialCount: 9,
    pooledBaselineCount: 30,
    rapid: { trial: 2, baseline: 9 },
    long: { trial: 0, baseline: 0 },
    rapidWindowMinutes: 30,
    longGapHours: 6,
    treatShare: { trial: null, baseline: null },
    mealsPerDay: { trial: null, baseline: null },
    comparisonDirection: 'fewer_during_trial',
    trialWindowDays: 28,
  };

  it('prints the strip’s sentence, verbatim, where the screen’s Why prints it — never the engine’s pair beside it', () => {
    const today = MONDAY;
    const line = "Vomiting: 4 in the trial's 30 days · 20 in the 49 days before, a longer stretch.";
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(trialCard), today, trial: trialWindow(today), episodes: [], trialVomitingLine: line }));
    expect(model.why).toContain(line);
    expect(model.trialLineShown).toBe(line);
    const row = rowOf(model);
    expect(row.headline).toBe(model.title);
    expect(row.count).toBe("Vomiting: 4 in the trial's 30 days · 20 in the 49 days before, a longer stretch");
    expect(row.count).not.toMatch(/\b9\b|\b30 in\b/);
  });

  it('where the strip withholds its sentence, the screen states none and the row keeps the finding’s own line', () => {
    const today = MONDAY;
    const model = buildSignalScreenModel(inputOf({ cached: cachedOf(trialCard), today, trial: trialWindow(today), episodes: [], trialVomitingLine: null }));
    expect(model.trialLineShown).toBeNull();
    expect(rowOf(model).count).toBe((signalHomeLine(trialCard, null) as SignalHomeLine).count);
  });
});
