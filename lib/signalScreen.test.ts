// The Signal screen's model and loader (D2-3 · CUL-1065). The pure builder is driven
// over a fixture shaped exactly like the loader's own output (C-35), on the mock's
// Thursday with the mock's 55-day rabbit trial; the reads are driven against a mocked
// local DB. Since HV-5 (CUL-1162) the verdicts are the phone's copy too, so the screen
// issues no server read at all, and the loader test says so.
//
// Timezone honesty (B-514): the builder takes day keys; the loader tests build instants
// at LOCAL noon (`new Date(y, m, d, 12)`), so the day key the loader derives is the
// calendar day in every CI zone.

const mockGetAllAsync = jest.fn();
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: (...a: unknown[]) => mockGetAllAsync(...a) }) }));

const mockFrom = jest.fn();
jest.mock('./supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));

const mockReadSignalCache = jest.fn();
jest.mock('./signal', () => {
  const actual = jest.requireActual('./signal');
  return { ...actual, readSignalCache: (...a: unknown[]) => mockReadSignalCache(...a) };
});

const mockReadFeedingRows = jest.fn();
const mockReadFreeFedSpans = jest.fn();
jest.mock('./patternsTiming', () => {
  const actual = jest.requireActual('./patternsTiming');
  return {
    ...actual,
    readFeedingRows: (...a: unknown[]) => mockReadFeedingRows(...a),
    readFreeFedSpans: (...a: unknown[]) => mockReadFreeFedSpans(...a),
  };
});

const mockLoadTrialPredicateFacts = jest.fn();
const mockLoadDietTrialFacts = jest.fn();
jest.mock('./dietTrialFacts', () => ({
  loadTrialPredicateFacts: (...a: unknown[]) => mockLoadTrialPredicateFacts(...a),
  loadDietTrialFacts: (...a: unknown[]) => mockLoadDietTrialFacts(...a),
}));

/** The strip loader's trial-less answer — the card's state 0 (`loadDietTrialFacts`' `base`). */
const trialLessFacts = { trial: null, nowMs: Date.now(), petName: 'Nyx', species: 'cat', petObjectPronoun: 'her', otherPetNames: [] };

import {
  boutMembers,
  buildSignalScreenModel,
  doseDatesPhrase,
  loadSignalScreen,
  medicationLines,
  medicationWindowSpec,
  readLoggedDays,
  correlationWindowLine,
  UNSUPPORTED_LINE,
  readSignalEpisodes,
  readTileVerdicts,
  readVerdicts,
  safeLabel,
  trialLine,
  whyLines,
  type SignalScreenEpisode,
  type SignalScreenInput,
  type SignalScreenModel,
  withheldLines,
} from './signalScreen';
import type { CachedFinding, IntakeDeclineFinding, SymptomChronicityFinding, TrialResponseFinding } from './signal';
import { hasTitleVerdictWord } from './signalTitle';
import type { SignalTrialWindow } from './signalWindows';
import { signalCompareSpec } from './signalWindows';
import { LOOK_EVENT_TYPE } from './monthReads';
import { dayKeyFromIndex, formatCalendarDate, localDayIndexOf, toLocalDayKey } from './utils';
import { usePetStore } from '../store/petStore';
import { isAnimalNotEating, type TrialCardInput } from './dietTrialCard';
import { claimAnalysisChain } from './analysisChain';

const idx = (key: string): number => {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(key);
  return i;
};
const shift = (key: string, days: number): string => dayKeyFromIndex(idx(key) + days);

// The mock's day: Thursday, September 17; the trial started Saturday, July 25 (day 55).
const THURSDAY = '2026-09-17';
const TRIAL_START = '2026-07-25';

const trial = (over: Partial<SignalTrialWindow> = {}): SignalTrialWindow => ({
  startDay: TRIAL_START,
  identity: 'Rabbit trial',
  dayCounter: 55,
  targetDays: 56,
  foodLabel: 'Royal Canin Selected Protein PR',
  ...over,
});

const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 21,
  spanDays: 55,
  activeWeeks: 7,
  symptomDays: 18,
  daysSinceLastEpisode: 0,
  firstOnsetIso: '2026-07-01T00:00:00Z',
  tier: 'firm',
  windowDays: 56,
  ...over,
});

// A BENIGN vomiting finding over the default 56-day lookback — the screen's drawn compare
// is a benign finding's (CUL-1216).
const postprandial = (): CachedFinding['finding'] => ({
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 9,
  eligibleCount: 10,
  totalEpisodes: 12,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: false,
  medianMinutesSinceFeeding: 12,
  feedingFormsInEvidence: [],
  windowDays: 56,
});

const cachedOf = (finding: CachedFinding['finding'], text = 'Nyx has vomited 21 times in the trial’s 55 days, against 19 in the 55 before.'): CachedFinding => ({
  rank: 0,
  text,
  finding,
});

/** An episode on `dayKey` at `hour` local. */
function episode(dayKey: string, hour: number, over: Partial<SignalScreenEpisode> = {}): SignalScreenEpisode {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) throw new Error(dayKey);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 11);
  return {
    eventId: `ev-${dayKey}-${hour}`,
    occurredAt: d.toISOString(),
    dayKey,
    minutesSinceMeal: null,
    photo: null,
    ...over,
  };
}

/** The mock's record: 21 episodes in the trial, 19 before, nine photographed, every day logged. */
function mockInput(over: Partial<SignalScreenInput> = {}): SignalScreenInput {
  const episodes: SignalScreenEpisode[] = [];
  // 21 in the trial's 55 days (indexes 0..54 from the start), 19 in the 55 before.
  for (let i = 0; i < 21; i++) episodes.push(episode(shift(TRIAL_START, (i * 13) % 55), 17, { minutesSinceMeal: i % 3 === 0 ? 3 + i : null }));
  for (let i = 0; i < 19; i++) episodes.push(episode(shift(TRIAL_START, -1 - ((i * 7) % 55)), 9, { minutesSinceMeal: i % 2 === 0 ? 30 + i * 20 : null }));
  // Nine photographed, all in the trial; four with reads.
  const photographed = episodes.slice(0, 9);
  for (const e of photographed) e.photo = { localUri: null, storagePath: `pet/${e.eventId}/photo.jpg` };
  const verdicts: Record<string, 'worth_a_call' | 'monitor' | 'not_enough_to_say' | null> = {
    [photographed[0].eventId]: 'monitor',
    [photographed[1].eventId]: 'monitor',
    [photographed[2].eventId]: 'worth_a_call',
    [photographed[3].eventId]: 'not_enough_to_say',
    [photographed[4].eventId]: null, // pending
  };
  const loggedDays: string[] = [];
  for (let i = -70; i <= 0; i++) loggedDays.push(shift(THURSDAY, i));
  return {
    cached: cachedOf(chronicity()),
    petName: 'Nyx',
    today: THURSDAY,
    trial: trial(),
    episodes,
    loggedDays,
    recordStart: shift(THURSDAY, -200),
    verdicts,
    doses: [],
    // The gate's days follow the coverage days unless a case says otherwise: every
    // fixture day here holds a symptom or a meal.
    gateLoggedDays: over.loggedDays ?? loggedDays,
    notEating: false,
    trialVomitingLine: null,
    trialUnanswered: false,
    ...over,
  };
}

/** Every owner-facing string the model can put on the screen, for the greps. */
function everyString(m: SignalScreenModel): string[] {
  const out: string[] = [m.title, m.weekLine ?? '', ...m.why];
  if (m.compare) for (const w of m.compare.windows) out.push(w.label, w.coverageLine);
  if (m.lanes) for (const l of m.lanes.lanes) out.push(l.label, l.timedLine);
  if (m.episodes) out.push(m.episodes.countLine);
  return out.filter((s) => s.length > 0);
}

describe('buildSignalScreenModel — the mock’s Thursday', () => {
  const model = buildSignalScreenModel(mockInput());

  it('the title, the sentence, the noun', () => {
    // D2 (CUL-1270): the title names the claim, from the fields the sentence is built from.
    expect(model.title).toBe('Vomiting in 7 of the last 8 weeks');
    expect(model.sentence).toMatch(/^Nyx has vomited 21 times/);
    expect(model.noun).toBe('vomiting');
    expect(model.safety).toBe(true);
    expect(model.identity).toBe('symptom_chronicity:vomit');
  });

  it('the weekly bars cover the trial, and the line reads the last two bars', () => {
    expect(model.weekly?.weeks).toHaveLength(9);
    expect(model.weekly?.firstKey).toBe('2026-07-19');
    expect(model.weekly?.mark?.slot).toBeCloseTo(6 / 7, 6);
    const weeks = model.weekly?.weeks ?? [];
    const last = weeks[weeks.length - 1];
    const prev = weeks[weeks.length - 2];
    expect(model.weekLine).toBe(`${last.count} this week so far · ${prev.count} last week`);
  });

  // CUL-1216 (BRK-39 / BRK-5): a safety screen's one compare is the engine's, in its phone
  // script; and on a running trial no compare is drawn over the screen's own windows at all.
  it('no drawn compare: a safety finding’s compare is the engine’s, and a trial’s is the strip’s sentence', () => {
    expect(model.compare).toBeNull();
    expect(model.compareWithheld).toBeNull();
    const benign = buildSignalScreenModel(mockInput({ cached: cachedOf(postprandial()) }));
    expect(benign.compare).toBeNull();
  });

  it('the lanes: before the trial · in it, every episode on its lane, the untimed ones counted', () => {
    // A SAFETY screen draws one undivided lane (its one compare is the engine's — BRK-39);
    // the split is a benign finding's, and only while the in-trial lane does not fall (F2).
    expect(model.lanes?.lanes.map((l) => l.label)).toEqual(['The last 56 days']);
    const benign = buildSignalScreenModel(mockInput({ cached: cachedOf(postprandial()) }));
    const lanes = benign.lanes?.lanes ?? [];
    expect(lanes.map((l) => l.label)).toEqual(['Before the trial', 'In the trial']);
    expect(lanes[1].total).toBe(21);
    expect(lanes[1].timedCount).toBe(7);
    expect(lanes[1].untimedCount).toBe(14);
    expect(lanes[0].total).toBe(19);
    expect(lanes[0].timedCount).toBe(10);
  });

  it('the episodes: “21, nine photographed”, each tile its OWN read, newest first', () => {
    // The gallery's population is the chart's: the episodes inside the drawn weeks (the
    // trial's 21 plus the days of the first drawn week before it), never the whole record.
    const drawn = model.weekly?.total ?? 0;
    expect(drawn).toBe(24);
    expect(model.episodes?.total).toBe(drawn);
    expect(model.episodes?.photographedCount).toBe(9);
    expect(model.episodes?.countLine).toBe('24 in these 9 weeks, nine photographed');
    const tiles = model.episodes?.tiles ?? [];
    expect(tiles).toHaveLength(9);
    for (let i = 1; i < tiles.length; i++) {
      expect(Date.parse(tiles[i - 1].occurredAt)).toBeGreaterThanOrEqual(Date.parse(tiles[i].occurredAt));
    }
    const byId = new Map(tiles.map((t) => [t.eventId, t]));
    const photographed = mockInput().episodes.slice(0, 9);
    expect(byId.get(photographed[2].eventId)?.verdict).toBe('worth_a_call');
    expect(byId.get(photographed[0].eventId)?.verdict).toBe('monitor');
    expect(byId.get(photographed[4].eventId)?.verdict).toBeNull();
    expect(byId.get(photographed[8].eventId)?.verdict).toBeNull();
    expect(tiles[0].dateWord).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(tiles[0].timeWord.length).toBeGreaterThan(0);
  });

  it('“Why this is a Signal”: the shipped why, the compare as counts, the diet line — and no medication when none was dosed', () => {
    expect(model.why[0].length).toBeGreaterThan(0);
    // Both windows' logged days are NAMED in the sentence (B3: a diligent baseline against
    // a drifting trial reads as an improvement from the bars alone).
    // No "Compared as counts, not a verdict" on a safety screen (BRK-39): it read calm
    // directly above the ask. And no compare line on a trial (BRK-5).
    expect(model.why.join(' ')).not.toMatch(/Two windows|not a verdict/);
    expect(model.why).toContain('A diet change is one of several things that can move this.');
    expect(model.why[model.why.length - 1]).toBe('Day 55 of 56 on Royal Canin Selected Protein PR.');
    expect(model.why.join(' ')).not.toMatch(/was given/);
  });

  it('a photographed count of zero says so; a count past twelve is a numeral', () => {
    const none = buildSignalScreenModel(mockInput({ episodes: mockInput().episodes.map((e) => ({ ...e, photo: null })) }));
    expect(none.episodes?.countLine).toBe('24 in these 9 weeks, none photographed');
    const all = buildSignalScreenModel(
      mockInput({ episodes: mockInput().episodes.map((e) => ({ ...e, photo: { localUri: null, storagePath: 'p' } })) }),
    );
    expect(all.episodes?.countLine).toBe('24 in these 9 weeks, 24 photographed');
    expect(all.episodes?.tiles.map((t) => t.verdict).filter((v) => v != null)).toHaveLength(4);
  });
});

describe('the medication inside the window (Dr. Chen’s condition on round 3)', () => {
  it('Cerenia on four days inside the trial window is named, with its dates', () => {
    const doses = ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'].map((dayKey) => ({ drugLabel: 'Cerenia', dayKey }));
    const model = buildSignalScreenModel(mockInput({ doses }));
    expect(model.why).toContain("Cerenia was given Sep 9–12, inside the trial's 55 days.");
    // It sits after the shipped why and before the diet line — read before the diet.
    const i = model.why.findIndex((l) => l.startsWith('Cerenia'));
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(model.why.findIndex((l) => l.startsWith('Day 55')));
  });

  it('a course before the trial says so, one across the start says both windows', () => {
    const before = medicationLines(mockInput({ doses: [{ drugLabel: 'Cerenia', dayKey: shift(TRIAL_START, -3) }] }));
    // On a trial the windows are the ones the printed trial sentence counts: the strip's 49
    // days before the trial and the trial's own days (CUL-1216, BRK-5).
    expect(before).toEqual(['Cerenia was given Jul 22, inside the 49 days before the trial.']);
    const across = medicationLines(
      mockInput({ doses: [{ drugLabel: 'Cerenia', dayKey: shift(TRIAL_START, -1) }, { drugLabel: 'Cerenia', dayKey: TRIAL_START }] }),
    );
    expect(across).toEqual(['Cerenia was given Jul 24–25, across both windows.']);
  });

  it('a dose outside both windows is not named; two drugs are two lines; a scattered course says its span', () => {
    const lines = medicationLines(
      mockInput({
        doses: [
          { drugLabel: 'Cerenia', dayKey: shift(TRIAL_START, -200) },
          { drugLabel: 'Metronidazole', dayKey: '2026-09-01' },
          { drugLabel: 'Metronidazole', dayKey: '2026-09-04' },
          { drugLabel: 'Prednisolone', dayKey: '2026-08-20' },
        ],
      }),
    );
    expect(lines).toEqual([
      "Metronidazole was given on 2 days between Sep 1 and Sep 4, inside the trial's 55 days.",
      "Prednisolone was given Aug 20, inside the trial's 55 days.",
    ]);
  });

  it('without a trial the halves are named; a strength token in a drug name is REPAIRED, never the line dropped (B5)', () => {
    const lines = medicationLines(
      mockInput({ trial: null, doses: [{ drugLabel: 'Baytril 2.5%', dayKey: THURSDAY }, { drugLabel: 'Cerenia', dayKey: shift(THURSDAY, -40) }] }),
    );
    expect(lines).toEqual(['Baytril was given Sep 17, inside the recent 28 days.', 'Cerenia was given Aug 8, inside the 28 days before.']);
    // The confounder disclosure survives an ordinary injectable's strength; the diet line
    // survives a "95%" single-protein food; a label that is ONLY a percentage is dropped.
    expect(trialLine(trial({ foodLabel: 'Weruva 95% Chicken Paté' }))).toBe('Day 55 of 56 on Weruva Chicken Paté.');
    expect(trialLine(trial({ foodLabel: '100%' }))).toBe('Day 55 of 56.');
    expect(safeLabel('Baytril 2.5%')).toBe('Baytril');
    expect(safeLabel('Metacam 1,5 %')).toBe('Metacam');
    expect(safeLabel('Vomit ↓ fix')).toBeNull();
    expect(safeLabel('')).toBeNull();
    const model = buildSignalScreenModel(mockInput({ trial: trial({ foodLabel: '50%' }) }));
    expect(model.why[model.why.length - 1]).toBe('Day 55 of 56.');
  });

  it('the window edges (M13): the before window’s first day is in, the day before it is out, today is in', () => {
    const [before] = medicationWindowSpec({ cached: cachedOf(chronicity()), today: THURSDAY, trial: trial() });
    expect(before.startDay).toBe(shift(TRIAL_START, -49));
    const first = before.startDay;
    const inLines = medicationLines(mockInput({ doses: [{ drugLabel: 'Cerenia', dayKey: first }, { drugLabel: 'Cerenia', dayKey: THURSDAY }] }));
    expect(inLines).toEqual([`Cerenia was given on 2 days between ${formatCalendarDate(first)} and Sep 17, across both windows.`]);
    expect(medicationLines(mockInput({ doses: [{ drugLabel: 'Cerenia', dayKey: shift(first, -1) }] }))).toEqual([]);
    expect(medicationLines(mockInput({ doses: [{ drugLabel: 'Cerenia', dayKey: shift(THURSDAY, 1) }] }))).toEqual([]);
  });

  it('the dose-day phrase: one day, a run, a scatter', () => {
    expect(doseDatesPhrase(['2026-09-09'])).toBe('Sep 9');
    expect(doseDatesPhrase(['2026-09-12', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-11'])).toBe('Sep 9–12');
    expect(doseDatesPhrase(['2026-09-09', '2026-09-20'])).toBe('on 2 days between Sep 9 and Sep 20');
    expect(doseDatesPhrase(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])).toBe('Sep 29–Oct 2');
  });
});

describe('the diet line', () => {
  it('never renders completion language at the target, and past it says the shipped strip’s words', () => {
    expect(trialLine(trial({ dayCounter: 56 }))).toBe('Day 56 of 56 on Royal Canin Selected Protein PR.');
    expect(trialLine(trial({ dayCounter: 60 }))).toBe('Day 60 — 4 days past the window you set on Royal Canin Selected Protein PR.');
    expect(trialLine(trial({ dayCounter: 57 }))).toBe('Day 57 — 1 day past the window you set on Royal Canin Selected Protein PR.');
    expect(trialLine(trial({ foodLabel: null }))).toBe('Day 55 of 56.');
    expect(trialLine(trial({ targetDays: 0, foodLabel: null }))).toBe('Day 55.');
  });

  it('a trial under the floor: no compare, one lane, and the floor said in Why (B1 — never two one-day bars)', () => {
    const young = trial({ dayCounter: 1, startDay: THURSDAY });
    const model = buildSignalScreenModel(mockInput({ trial: young }));
    expect(model.title).toBe('Vomiting in 7 of the last 8 weeks');
    expect(model.compare).toBeNull();
    expect(model.lanes?.lanes.map((l) => l.label)).toEqual(['The last 56 days']);
    expect(model.why).toContain('Day 1 of the rabbit trial — fewer than 7 days in, so there is no before-and-during compare yet.');
    expect(model.why.join(' ')).not.toMatch(/Two windows/);
    expect(model.why[model.why.length - 1]).toBe('Day 1 of 56 on Royal Canin Selected Protein PR.');
    expect(model.weekly?.mark?.day).toBe(THURSDAY);
  });

  it('a future-dated episode is on neither the bars nor the gallery (B6, C-4)', () => {
    const base = mockInput();
    const model = buildSignalScreenModel({ ...base, episodes: [...base.episodes, episode(shift(THURSDAY, 1), 9), episode(shift(THURSDAY, 3), 9, { photo: { localUri: null, storagePath: 'p' } })] });
    expect(model.weekly?.after).toBe(2);
    expect(model.episodes?.total).toBe(model.weekly?.total);
    expect(model.episodes?.photographedCount).toBe(9);
  });

  it('is absent without a trial, and so is the diet-change sentence; the compare is the two halves', () => {
    const model = buildSignalScreenModel(mockInput({ trial: null }));
    expect(model.title).toBe('Vomiting in 7 of the last 8 weeks');
    expect(model.weekly?.mark ?? null).toBeNull();
    expect(model.why.join(' ')).not.toMatch(/Day \d+|diet change/);
    // A safety finding draws no local compare (BRK-39); a benign one draws the two halves.
    expect(model.compare).toBeNull();
    const benign = buildSignalScreenModel(mockInput({ trial: null, cached: cachedOf(postprandial()) }));
    expect(benign.compare?.windows.map((w) => w.label)).toEqual(['The 28 days before', 'The recent 28 days']);
    expect(model.lanes?.lanes.map((l) => l.label)).toEqual(['The last 56 days']);
  });
});

describe('other findings', () => {
  it('a cough draws the bars but no lanes — nothing times a cough against a meal', () => {
    const model = buildSignalScreenModel(mockInput({ cached: cachedOf(chronicity({ symptomType: 'cough' })) }));
    expect(model.noun).toBe('coughing');
    expect(model.weekly).not.toBeNull();
    // Safety, so its one compare is the engine's, in the script (BRK-39).
    expect(model.compare).toBeNull();
    expect(model.lanes).toBeNull();
    expect(model.episodes).not.toBeNull();
  });

  it('an intake decline counts no symptom: title + sentence + why, no charts, no gallery', () => {
    const intake: IntakeDeclineFinding = {
      type: 'intake_decline',
      priorityClass: 'safety',
      trigger: 'consecutive_low',
      species: 'cat',
      daysBelowBaseline: 3,
      refusedFoodLabel: null,
      ratedMealsConsidered: 9,
    };
    const model = buildSignalScreenModel(mockInput({ cached: cachedOf(intake, 'Nyx has eaten less than usual for 3 days.') }));
    expect(model.title).toBe('Eating less than usual');
    expect(model.weekly).toBeNull();
    expect(model.compare).toBeNull();
    expect(model.lanes).toBeNull();
    expect(model.episodes).toBeNull();
    expect(model.why.length).toBeGreaterThanOrEqual(1);
    expect(model.why.join(' ')).not.toMatch(/Two windows/);
  });

  it('the trial card counts vomiting and names the trial', () => {
    const t: TrialResponseFinding = {
      type: 'trial_response',
      priorityClass: 'insight',
      trialDayNumber: 55,
      targetDurationDays: 56,
      trialLoggedDays: 51,
      baselineLoggedDays: 44,
      baselineWindowDays: 55,
      pooledTrialCount: 21,
      pooledBaselineCount: 19,
      rapid: { trial: 7, baseline: 6 },
      long: { trial: 0, baseline: 0 },
      rapidWindowMinutes: 30,
      longGapHours: 6,
      treatShare: { trial: null, baseline: null },
      mealsPerDay: { trial: null, baseline: null },
      comparisonDirection: 'more_during_trial',
      trialWindowDays: 55,
    };
    const model = buildSignalScreenModel(mockInput({ cached: cachedOf(t) }));
    expect(model.title).toBe('Rabbit trial, day 55 of 56');
    expect(model.noun).toBe('vomiting');
    expect(model.lanes).not.toBeNull();
  });
});

// CUL-1218: a correlation's population is its matched episodes. The screen used to draw every
// vomit's bars, a compare, lanes and a gallery under "Vomiting after chicken" (20 bars under
// 4 matched pairs); now it draws no count at all and says where the matched days came from.
describe('CUL-1218 — a correlation screen counts nothing its finding did not', () => {
  const correlation: CachedFinding['finding'] = {
    type: 'food_symptom_correlation',
    priorityClass: 'insight',
    tier: 'established',
    symptomType: 'vomit',
    protein: 'chicken',
    matchedPairs: 4,
    symptomEventCount: 20,
    correlationWindowHours: 12,
  };

  it('no bars, no line, no compare, no lanes, no gallery — the title, the sentence and the why', () => {
    const m = buildSignalScreenModel(mockInput({ cached: cachedOf(correlation), trial: null }));
    expect(m.title).toBe('Vomiting after chicken');
    expect(m.weekly).toBeNull();
    expect(m.weekLine).toBeNull();
    expect(m.compare).toBeNull();
    expect(m.lanes).toBeNull();
    expect(m.episodes).toBeNull();
    expect(m.why).toContain(correlationWindowLine('Nyx'));
    expect(correlationWindowLine('Nyx')).toBe("The pattern comes from the last 180 days of Nyx's logs.");
  });

  // Adversarial pass: its medication lines named "the recent 28 days", a window the finding
  // never counted, and missed a dose on a matched day months back.
  it('names no medication window — the screen’s windows are not the finding’s', () => {
    const doses = [{ drugLabel: 'Cerenia', dayKey: shift(THURSDAY, -3) }];
    const m = buildSignalScreenModel(mockInput({ cached: cachedOf(correlation), trial: null, doses }));
    expect(m.why.some((l) => /was given/.test(l))).toBe(false);
    // The same doses DO reach a non-correlation's why, so the absence above is the rule.
    const other = buildSignalScreenModel(mockInput({ cached: cachedOf(postprandial()), trial: null, doses }));
    expect(other.why.some((l) => /was given/.test(l))).toBe(true);
  });

  it('the window line is a correlation’s alone', () => {
    const m = buildSignalScreenModel(mockInput({ cached: cachedOf(postprandial()), trial: null }));
    expect(m.why).not.toContain(correlationWindowLine('Nyx'));
  });
});

// CUL-1217 (GC-3): a worsening never draws a fall. It is safety-class, so the screen draws no
// local compare at all (its one compare is the engine's), and on a 7-day window there are no
// 3-day halves to draw.
describe('CUL-1217 — a worsening draws no compare', () => {
  it('a 7-day worsening, with more in its earlier half than its later one, draws nothing to fall', () => {
    const worsening: CachedFinding['finding'] = {
      type: 'symptom_worsening',
      priorityClass: 'safety',
      symptomType: 'vomit',
      currentCount: 5,
      priorCount: 2,
      currentDays: 4,
      priorDays: 2,
      trigger: 'more_episodes',
      tier: 'standard',
      windowDays: 7,
    };
    const eps = [-6, -5, -5, -4].map((d) => episode(shift(THURSDAY, d), 9)).concat([episode(shift(THURSDAY, -1), 9)]);
    const m = buildSignalScreenModel(mockInput({ cached: cachedOf(worsening), trial: null, episodes: eps }));
    expect(m.compare).toBeNull();
    expect(m.compareWithheld).toBeNull();
  });
});

describe('what the screen may never say', () => {
  const variants: SignalScreenInput[] = [
    mockInput(),
    mockInput({ trial: null }),
    mockInput({ doses: [{ drugLabel: 'Cerenia', dayKey: '2026-09-09' }] }),
    mockInput({ cached: cachedOf(chronicity({ symptomType: 'cough' })) }),
    mockInput({ trial: trial({ dayCounter: 70 }) }),
  ];

  it('no aggregate verdict anywhere — “the other” never appears (Dr. Chen: it reassures by aggregation)', () => {
    for (const v of variants) {
      for (const s of everyString(buildSignalScreenModel(v))) expect(s.toLowerCase()).not.toContain('the other');
    }
  });

  it('no verdict word in any client-composed line, no exclamation mark', () => {
    for (const v of variants) {
      const m = buildSignalScreenModel(v);
      // The shipped `evidenceText` is the server-sanctioned why and carries the vet ask
      // ("worth"), so it is held to the guardrail screen, not the title's list.
      const composed = everyString(m).filter((s) => s !== m.why[0]);
      for (const s of composed) {
        expect(hasTitleVerdictWord(s)).toBe(false);
        expect(s).not.toMatch(/!/);
      }
    }
  });

  it('the model has no field for a summary verdict — the type is one read per tile', () => {
    const m = buildSignalScreenModel(mockInput());
    expect(Object.keys(m.episodes ?? {}).sort()).toEqual(['countLine', 'photographedCount', 'tiles', 'total']);
  });
});

// ── The reads ─────────────────────────────────────────────────────────────────

/** The copy's rows, as the local read answers them. */
const verdictRow = (event_id: string, status: string, recommendation: string | null) => ({
  event_id,
  status,
  recommendation,
  updated_at: '2026-09-17T12:00:00+00:00',
});

describe('readVerdicts — the phone’s copy, through the one read predicate (HV-5 / CUL-1162)', () => {
  beforeEach(() => {
    mockGetAllAsync.mockReset();
    mockFrom.mockReset();
  });

  it('answers every id from the copy: the rose, the calm words, and “no read yet”, with no server read', async () => {
    mockGetAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        /FROM event_ai_verdicts/.test(sql)
          ? [
              verdictRow('e1', 'completed', 'worth_a_call'),
              verdictRow('e2', 'completed', 'monitor'),
              verdictRow('e3', 'uncertain', 'not_enough_to_say'),
              // A failed re-read beside a calm verdict: the calm words may describe a
              // replaced photo, so they do not stand (CUL-812).
              verdictRow('e4', 'failed', 'monitor'),
              // A failed re-read beside an escalation: the rose stands (CUL-812).
              verdictRow('e5', 'failed', 'worth_a_call'),
              verdictRow('e6', 'pending', null),
              // A verdict this build does not know: the rose's words, never a blank tile.
              verdictRow('e7', 'completed', 'looks_fine_to_me'),
            ]
          : [],
      ),
    );
    const out = await readVerdicts(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'], 'vomit');
    expect(out).toEqual({
      e1: 'worth_a_call',
      e2: 'monitor',
      e3: 'not_enough_to_say',
      e4: null,
      e5: 'worth_a_call',
      e6: null,
      e7: 'worth_a_call',
      e8: null,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('a read in flight takes the calm words off a tile, and never the rose', async () => {
    mockGetAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(
        /FROM event_ai_verdicts/.test(sql)
          ? [verdictRow('calm', 'completed', 'monitor'), verdictRow('rose', 'completed', 'worth_a_call')]
          : [],
      ),
    );
    const calmClaim = claimAnalysisChain('calm');
    const roseClaim = claimAnalysisChain('rose');
    try {
      expect(await readVerdicts(['calm', 'rose'], 'vomit')).toEqual({ calm: null, rose: 'worth_a_call' });
    } finally {
      calmClaim?.settle(true);
      roseClaim?.settle(true);
    }
    expect(await readVerdicts(['calm'], 'vomit')).toEqual({ calm: 'monitor' });
  });

  it('a copy that cannot be read answers nothing and never throws the screen', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      mockGetAllAsync.mockRejectedValue(new Error('SQLITE_BUSY'));
      await expect(readVerdicts(['e1'], 'vomit')).resolves.toEqual({});
      expect(warn).toHaveBeenCalledWith('[signal-screen] read copy failed:', expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });

  it('asks nothing for nothing', async () => {
    expect(await readVerdicts([], 'vomit')).toEqual({});
    expect(mockGetAllAsync).not.toHaveBeenCalled();
  });
});

describe('readTileVerdicts — a tile is read across its whole bout (F3 on #912)', () => {
  const copyWith = (rows: ReturnType<typeof verdictRow>[]) =>
    mockGetAllAsync.mockImplementation((sql: string) => Promise.resolve(/FROM event_ai_verdicts/.test(sql) ? rows : []));
  beforeEach(() => {
    mockGetAllAsync.mockReset();
    mockFrom.mockReset();
  });

  it('two photographed rows, the tile’s calm and the other’s escalated: the tile carries the rose', async () => {
    copyWith([verdictRow('a', 'completed', 'monitor'), verdictRow('a2', 'completed', 'worth_a_call')]);
    expect(await readTileVerdicts([{ eventId: 'a', boutIds: ['a', 'a2'] }], 'vomit')).toEqual({ a: 'worth_a_call' });
  });

  it('the tile’s photo unread and a photoless row’s contextual read escalated: the tile carries the rose', async () => {
    copyWith([verdictRow('first', 'completed', 'worth_a_call')]);
    expect(await readTileVerdicts([{ eventId: 'photo', boutIds: ['first', 'photo'] }], 'vomit')).toEqual({ photo: 'worth_a_call' });
  });

  it('nothing calmer crosses rows: another row’s calm read never speaks for this photo', async () => {
    copyWith([verdictRow('first', 'completed', 'monitor')]);
    expect(await readTileVerdicts([{ eventId: 'photo', boutIds: ['first', 'photo'] }], 'vomit')).toEqual({ photo: null });
    copyWith([verdictRow('photo', 'completed', 'monitor'), verdictRow('first', 'completed', 'not_enough_to_say')]);
    expect(await readTileVerdicts([{ eventId: 'photo', boutIds: ['first', 'photo'] }], 'vomit')).toEqual({ photo: 'monitor' });
  });

  it('a tile with no bout listed is its own row, and every row is read once, locally', async () => {
    copyWith([verdictRow('solo', 'completed', 'monitor'), verdictRow('x2', 'failed', 'worth_a_call')]);
    const out = await readTileVerdicts(
      [
        { eventId: 'solo' },
        { eventId: 'x1', boutIds: ['x1', 'x2'] },
      ],
      'vomit',
    );
    expect(out).toEqual({ solo: 'monitor', x1: 'worth_a_call' });
    const copyCalls = mockGetAllAsync.mock.calls.filter(([sql]) => /FROM event_ai_verdicts/.test(sql as string));
    expect(copyCalls).toHaveLength(1);
    expect([...(copyCalls[0][1] as string[])].sort()).toEqual(['solo', 'x1', 'x2']);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('the local reads', () => {
  const noon = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

  beforeEach(() => {
    mockGetAllAsync.mockReset();
    mockReadFeedingRows.mockReset();
    mockReadFreeFedSpans.mockReset();
  });

  it('readSignalEpisodes: a re-logged bout is one episode, its photo found ON THE SECOND ROW (B2), vomiting timed through the one predicate', async () => {
    mockGetAllAsync
      .mockResolvedValueOnce([
        { id: 'a', occurred_at: noon(2026, 9, 17, 17, 11), occurred_at_confidence: 'witnessed' },
        { id: 'a2', occurred_at: noon(2026, 9, 17, 17, 31), occurred_at_confidence: 'witnessed' }, // 20 min later: same bout
        { id: 'b', occurred_at: noon(2026, 9, 15, 10, 58), occurred_at_confidence: 'witnessed' },
        { id: 'c', occurred_at: 'garbage', occurred_at_confidence: null },
      ])
      // The photo is on the re-log, not the bout's first row.
      .mockResolvedValueOnce([
        { event_id: 'a2', local_uri: null, storage_path: 'p/a2.jpg' },
        { event_id: 'b', local_uri: 'file:///b.jpg', storage_path: 'p/b.jpg' },
      ]);
    mockReadFeedingRows.mockResolvedValue([
      { ms: Date.parse(noon(2026, 9, 17, 17, 7)), confidence: 'witnessed', form: 'kibble', foodType: 'meal' },
    ]);
    mockReadFreeFedSpans.mockResolvedValue([]);

    const episodes = await readSignalEpisodes('pet-1', 'vomit');
    expect(episodes).toHaveLength(2);
    // The bout is ONE episode, timed from its first row, and its tile is the row that
    // holds the photo — so the read is looked up for `a2` and the tile opens `a2`.
    const bout = episodes.find((e) => e.dayKey === '2026-09-17');
    const b = episodes.find((e) => e.eventId === 'b');
    expect(bout?.eventId).toBe('a2');
    expect(bout?.minutesSinceMeal).toBe(4);
    expect(bout?.photo).toEqual({ localUri: null, storagePath: 'p/a2.jpg' });
    expect(b?.minutesSinceMeal).toBeNull();
    expect(b?.photo).toEqual({ localUri: 'file:///b.jpg', storagePath: 'p/b.jpg' });
    // Each episode carries its whole bout, so its tile can be read across every row of it.
    expect(bout?.boutIds).toEqual(['a', 'a2']);
    expect(b?.boutIds).toEqual(['b']);
    // The attachment read is scoped to the pet AND EVERY row of every bout.
    const [sql, params] = mockGetAllAsync.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/event_attachments/);
    expect(params).toEqual(['pet-1', 'a', 'a2', 'b']);
  });

  it('boutMembers walks the collapse’s own chained gap: a slow drip is one bout, a gap starts another', () => {
    const rows = [
      { id: 'r1', ms: 0 },
      { id: 'r2', ms: 60 * 60_000 },
      { id: 'r3', ms: 2 * 60 * 60_000 },
      { id: 'r4', ms: 12 * 60 * 60_000 },
    ];
    const reps = [rows[0], rows[3]];
    const m = boutMembers(rows, reps, 6);
    expect(m.get('r1')).toEqual(['r1', 'r2', 'r3']);
    expect(m.get('r4')).toEqual(['r4']);
  });

  it('readSignalEpisodes: a cough is never timed — the feeding read is not issued', async () => {
    mockGetAllAsync.mockResolvedValueOnce([{ id: 'k', occurred_at: noon(2026, 9, 17), occurred_at_confidence: null }]).mockResolvedValueOnce([]);
    const episodes = await readSignalEpisodes('pet-1', 'cough');
    expect(episodes[0].minutesSinceMeal).toBeNull();
    expect(mockReadFeedingRows).not.toHaveBeenCalled();
  });

  // CUL-1212 (inverted): a look is NOT a logged day. It joins no other surface's coverage
  // line (the daily-look spec §5.6, floor 5); the month and the vet report exclude it, and
  // the Signal counted it, so a look-every-day owner saw 17 of 17 above "logged 3 of 17".
  it('readLoggedDays: a look is never a logged day, and never the record’s start (CUL-1212)', async () => {
    mockGetAllAsync.mockResolvedValueOnce([{ occurred_at: noon(2026, 9, 17) }, { occurred_at: noon(2026, 9, 17, 20) }, { occurred_at: noon(2026, 9, 10) }]);
    const out = await readLoggedDays('pet-1');
    expect(out.loggedDays).toEqual(['2026-09-10', '2026-09-17']);
    expect(out.recordStart).toBe('2026-09-10');
    // ONE read, over events alone — the looks table is never joined in.
    expect(mockGetAllAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockGetAllAsync.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/\blooks\b/);
    // The look's own `check_in` row is excluded by type, and an undone row by `deleted_at`.
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/event_type != \?/);
    expect(params).toEqual(['pet-1', LOOK_EVENT_TYPE]);
  });

  // Sam's counterexample, end to end through the builder: a look answered every day of
  // Sep 1–17, meals on three of them. The rows the read returns are the meals; the bars'
  // ticks and the record's start follow them, never the looks.
  it('CUL-1212: a look-every-day record reads as logged on its meal days only', async () => {
    const mealDays = [3, 9, 15];
    mockGetAllAsync.mockImplementationOnce((sql: string, params: unknown[]) => {
      const rows = [
        ...Array.from({ length: 17 }, (_, i) => ({ occurred_at: noon(2026, 9, i + 1), event_type: LOOK_EVENT_TYPE })),
        ...mealDays.map((d) => ({ occurred_at: noon(2026, 9, d, 8), event_type: 'meal' })),
      ];
      // The SQL's own filter, applied as SQLite would: the excluded type is the second param.
      const excluded = /event_type != \?/.test(sql) ? params[1] : null;
      return Promise.resolve(rows.filter((r) => r.event_type !== excluded));
    });
    const out = await readLoggedDays('pet-1');
    expect(out.loggedDays).toEqual(mealDays.map((d) => `2026-09-${String(d).padStart(2, '0')}`));
    expect(out.recordStart).toBe('2026-09-03');
  });
});

describe('loadSignalScreen', () => {
  const pets = [
    { id: 'pet-1', name: 'Nyx', species: 'cat', sex: 'female' },
    { id: 'pet-2', name: 'Other', species: 'dog', sex: 'male' },
  ];

  beforeEach(() => {
    mockGetAllAsync.mockReset();
    mockReadSignalCache.mockReset();
    mockLoadTrialPredicateFacts.mockReset();
    mockLoadDietTrialFacts.mockReset();
    mockLoadDietTrialFacts.mockResolvedValue(trialLessFacts);
    mockReadFeedingRows.mockResolvedValue([]);
    mockReadFreeFedSpans.mockResolvedValue([]);
    // C-9: the ACTIVE pet is the other one; the screen must name the route's pet.
    usePetStore.setState({ pets: pets as never, activePet: pets[1] as never });
  });

  // CUL-1218 (G10 extended): a finding this build cannot title is refused, never a blank
  // screen titled "Signal" — and never "missing", because it has not gone anywhere.
  it('unsupported when the finding’s type has no title rule, and nothing is read', async () => {
    mockReadSignalCache.mockResolvedValue({
      findings: [{ rank: 0, text: 'Gaps between vomiting episodes are getting shorter.', finding: { type: 'gap_shortening', priorityClass: 'insight', symptomType: 'vomit' } }],
    });
    const out = await loadSignalScreen('pet-1', 'gap_shortening:vomit');
    expect(out).toEqual({ status: 'unsupported', petName: 'Nyx' });
    expect(mockGetAllAsync).not.toHaveBeenCalled();
    expect(UNSUPPORTED_LINE).toBe("I can't show this kind of signal yet.");
  });

  it('missing when the cache holds no such finding', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(chronicity({ symptomType: 'cough' }))] });
    const out = await loadSignalScreen('pet-1', 'symptom_chronicity:vomit');
    expect(out).toEqual({ status: 'missing', petName: 'Nyx' });
  });

  it('ready: the finding found by identity, the record read, the pet named from the route (C-9), the doses from the window', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [{ ...cachedOf(chronicity()), rank: 3 }] });
    // The trial is anchored to the REAL today (C-29, CUL-832), on day 59: the day it stood at
    // when this fixture was written with TRIAL_START (2026-07-25, on 2026-09-21). The loader
    // asks isTrialRunning against the wall clock, so the pinned start stopped running 56 days
    // past its target (TRIAL_OVERRUN_GRACE_DAYS) and this title assertion went red from
    // 2026-11-14 under a skewed-clock run. Day 59 keeps the dose bound below honest: the
    // earlier window sits before the trial, so the read reaches back well past 100 days.
    const today = toLocalDayKey(new Date());
    // The trial row arrives with the strip's facts: ONE read of it (CUL-1216 review).
    mockLoadDietTrialFacts.mockResolvedValue({
      ...trialLessFacts,
      trial: { id: 't', status: 'active', startedAt: shift(today, -58), endedAt: null, targetDurationDays: 56, foodLabel: 'Rabbit & Pea', trialProtein: { protein: 'rabbit', source: 'stored' } },
    });
    mockGetAllAsync.mockImplementation((sql: string) => {
      if (/FROM events\s+WHERE pet_id = \? AND event_type/.test(sql)) return Promise.resolve([{ id: 'v1', occurred_at: new Date().toISOString(), occurred_at_confidence: null }]);
      if (/event_attachments/.test(sql)) return Promise.resolve([{ event_id: 'v1', local_uri: null, storage_path: 'p/v1.jpg' }]);
      if (/FROM looks/.test(sql)) return Promise.resolve([]);
      if (/medication_administrations/.test(sql)) return Promise.resolve([{ occurred_at: new Date().toISOString(), generic_name: 'maropitant', brand_name: 'Cerenia' }]);
      if (/FROM event_ai_verdicts/.test(sql)) return Promise.resolve([verdictRow('v1', 'completed', 'monitor')]);
      return Promise.resolve([{ occurred_at: new Date().toISOString() }]);
    });
    mockFrom.mockReset();

    const out = await loadSignalScreen('pet-1', 'symptom_chronicity:vomit');
    expect(out.status).toBe('ready');
    if (out.status !== 'ready') return;
    expect(out.petName).toBe('Nyx');
    expect(out.model.title).toBe('Vomiting in 7 of the last 8 weeks');
    // The running trial reached the model (the title no longer names it — D2): its start marks the bars.
    expect(out.model.weekly?.mark).toBeTruthy();
    expect(out.model.episodes?.tiles[0]).toMatchObject({ eventId: 'v1', verdict: 'monitor' });
    // The verdict came off the phone: the screen made no server read at all (HV-5).
    expect(mockFrom).not.toHaveBeenCalled();
    expect(out.model.weekLine).toMatch(/^1 this week/);
    expect(out.model.why.some((l) => l.startsWith(`Cerenia was given ${expect.anything() && ''}`) || /^Cerenia was given/.test(l))).toBe(true);
    expect(out.model.why[out.model.why.length - 1]).toMatch(/on Rabbit & Pea\.$/);
    // Doses are read from a day before the earlier window's first day, delivered only.
    const doseCall = mockGetAllAsync.mock.calls.find(([sql]) => /medication_administrations/.test(sql as string)) as [string, unknown[]];
    expect(doseCall[0]).toMatch(/adherence IN \('given', 'partial'\)/);
    // C-40: the bound compares the fixed-width prefix, never the two spellings whole.
    expect(doseCall[0]).toMatch(/substr\(e\.occurred_at, 1, 19\) >= substr\(\?, 1, 19\)/);
    expect(Date.parse(doseCall[1][2] as string)).toBeLessThan(Date.parse(`${today}T00:00:00Z`) - 100 * 86_400_000);
    expect(mockLoadDietTrialFacts).toHaveBeenCalledWith(expect.objectContaining({ pet: expect.objectContaining({ id: 'pet-1', name: 'Nyx', species: 'cat' }) }));
    // The screen never reads the trial row a second time.
    expect(mockLoadTrialPredicateFacts).not.toHaveBeenCalled();
  });

  it('a tile carries the rose its bout holds on another row, and reads it off the phone (F3 on #912)', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(chronicity())] });
    // A vomit logged without a photo, its contextual read escalated; re-logged twenty
    // minutes later WITH the photo, whose own read said monitor. One bout, one tile.
    const first = new Date(Date.now() - 20 * 60_000).toISOString();
    const relog = new Date().toISOString();
    mockGetAllAsync.mockImplementation((sql: string) => {
      if (/FROM events\s+WHERE pet_id = \? AND event_type/.test(sql))
        return Promise.resolve([
          { id: 'v0', occurred_at: first, occurred_at_confidence: 'witnessed' },
          { id: 'v1', occurred_at: relog, occurred_at_confidence: 'witnessed' },
        ]);
      if (/event_attachments/.test(sql)) return Promise.resolve([{ event_id: 'v1', local_uri: null, storage_path: 'p/v1.jpg' }]);
      if (/FROM event_ai_verdicts/.test(sql))
        return Promise.resolve([verdictRow('v1', 'completed', 'monitor'), verdictRow('v0', 'completed', 'worth_a_call')]);
      return Promise.resolve([]);
    });
    mockFrom.mockReset();
    const out = await loadSignalScreen('pet-1', 'symptom_chronicity:vomit');
    expect(out.status).toBe('ready');
    if (out.status !== 'ready') return;
    expect(out.model.episodes?.tiles).toHaveLength(1);
    expect(out.model.episodes?.tiles[0]).toMatchObject({ eventId: 'v1', verdict: 'worth_a_call' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('a trial that is not running today gives no trial window, and a failed trial read does not fail the screen', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(chronicity())] });
    mockLoadDietTrialFacts.mockResolvedValue({
      ...trialLessFacts,
      trial: { id: 't', status: 'completed', startedAt: '2026-01-01', endedAt: '2026-02-01', targetDurationDays: 30, foodLabel: null, trialProtein: null },
    });
    mockGetAllAsync.mockResolvedValue([]);
    const ended = await loadSignalScreen('pet-1', 'symptom_chronicity:vomit');
    expect(ended.status === 'ready' && ended.model.title).toBe('Vomiting in 7 of the last 8 weeks');
    expect(ended.status === 'ready' && (ended.model.weekly?.mark ?? null)).toBeNull();

    mockLoadDietTrialFacts.mockRejectedValue(new Error('sqlite'));
    const failed = await loadSignalScreen('pet-1', 'symptom_chronicity:vomit');
    expect(failed.status).toBe('ready');
    expect(failed.status === 'ready' && (failed.model.weekly?.mark ?? null)).toBeNull();
  });
});

// ── CUL-1216 — the screen carries the withholding rules the shipped card honoured ──────────
// Each case is one of the issue's counterexamples, driven through the real builder over a
// fixture the loader could hand over (C-35): day keys, every episode on a logged day.
describe('CUL-1216 — a falling pair on the screen carries its gates', () => {
  const everyDay = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => shift(THURSDAY, from + i));
  // Off a trial: the halves of the 56-day lookback are THU-55..THU-28 and THU-27..THU.
  const fallingEpisodes = [
    ...[-50, -45, -40, -38, -35, -33, -31, -29].map((d) => episode(shift(THURSDAY, d), 9)),
    ...[-10, -2].map((d) => episode(shift(THURSDAY, d), 9)),
  ];
  const benign = (over: Partial<SignalScreenInput> = {}) =>
    mockInput({ cached: cachedOf(postprandial()), trial: null, episodes: fallingEpisodes, loggedDays: everyDay(-70, 0), ...over });

  it('an eating pet, evenly logged: the halves are drawn, with the counts-not-a-verdict line (benign only)', () => {
    const m = buildSignalScreenModel(benign());
    expect(m.compareWithheld).toBeNull();
    expect(m.compare?.windows.map((w) => w.count)).toEqual([8, 2]);
    expect(m.why).toContain('Two windows of 28 days, with symptoms or meals logged on 28 and 28 of them. Compared as counts, not a verdict on how Nyx is doing.');
  });

  // Adversarial pass on CUL-1212 (C-12): the strips now PRINT the gate's days, so a failed
  // gate read is unanswered, never "logged on 0 and 0" beside real episodes — no compare.
  it('a failed gate read draws no compare and prints no zero-logged windows line', () => {
    // A RISING pair: no falling-pair gate withholds it, so only the flag can.
    const rising = [-20, -3, -2, -1].map((d) => episode(shift(THURSDAY, d), 9));
    const m = buildSignalScreenModel(benign({ episodes: rising, gateLoggedDays: [], gateUnanswered: true }));
    expect(m.compare).toBeNull();
    expect(m.why.join(' ')).not.toMatch(/logged on 0 and 0/);
    // The same record with the gate unanswered-but-unflagged would print exactly that line.
    const unflagged = buildSignalScreenModel(benign({ episodes: rising, gateLoggedDays: [] }));
    expect(unflagged.compare).not.toBeNull();
    expect(unflagged.why.join(' ')).toMatch(/logged on 0 and 0/);
  });

  // CUL-1212: the compare's strips answer the comparison-gate question, not coverage. A record
  // logged every day (doses, weights) but with symptoms or meals on only some days must not
  // read "logged 28 of 28" beside a count the gate could not vouch for.
  it('CUL-1212: the compare strips and the why count the gate’s days, never the coverage days', () => {
    const gate = everyDay(-55, 0).filter((_, i) => i % 4 !== 0);
    const m = buildSignalScreenModel(benign({ gateLoggedDays: gate }));
    expect(m.compareWithheld).toBeNull();
    expect(m.compare).not.toBeNull();
    const [a, b] = m.compare!.windows;
    expect(a.loggedCount).toBe(21);
    expect(b.loggedCount).toBe(21);
    expect(a.coverageLine).toBe('logged 21 of 28 days');
    expect(m.why).toContain('Two windows of 28 days, with symptoms or meals logged on 21 and 21 of them. Compared as counts, not a verdict on how Nyx is doing.');
    // The bars' ticks still read coverage: every day.
    expect(m.weekly?.weeks.every((w) => w.days.every((d) => d !== 'unlogged'))).toBe(true);
  });

  it('BRK-6: a falling vomit pair beside a not-eating record is not drawn, and the screen says why', () => {
    const m = buildSignalScreenModel(benign({ notEating: true }));
    expect(m.compare).toBeNull();
    expect(m.compareWithheld).toBe('not_eating');
    expect(m.why.join(' ')).toMatch(/hasn't been eating normally, so the vomiting counts aren't compared here/);
    expect(m.why.join(' ')).not.toMatch(/Two windows|not a verdict/);
  });

  it('BRK-6, fail closed: facts that did not answer withhold the pair and never claim the pet is not eating', () => {
    const m = buildSignalScreenModel(benign({ notEating: null }));
    expect(m.compare).toBeNull();
    expect(m.compareWithheld).toBe('not_eating_unknown');
    expect(m.why.join(' ')).toMatch(/We couldn't check how Nyx has been eating/);
    expect(m.why.join(' ')).not.toMatch(/hasn't been eating/);
    expect(m.withholdFallingVomit).toBe(true);
  });

  it('BRK-4: a falling pair over unevenly logged windows is not drawn (the 4-of-7-days drop)', () => {
    // The earlier half logged every day; the recent half on 12 of 28.
    const logged = [...everyDay(-70, -28), ...everyDay(-27, 0).filter((_, i) => i % 7 < 3)];
    const m = buildSignalScreenModel(benign({ loggedDays: logged }));
    expect(m.compare).toBeNull();
    expect(m.compareWithheld).toBe('density');
    expect(m.why.join(' ')).toContain(
      "Two windows of 28 days, with symptoms or meals logged on 28 and 12 of them. The recent one was logged on fewer days, so their counts aren't compared here",
    );
  });

  // Adversarial pass F5: the gate is symmetric, so a fall is also withheld when the RECENT
  // window was logged more; the line must not then say "fewer logged days" of it.
  it('F5: the density line names the window that was logged less — never "fewer" of the one logged more', () => {
    const logged = [...everyDay(-70, -28).filter((_, i) => i % 7 < 3), ...everyDay(-27, 0)];
    const m = buildSignalScreenModel(benign({ loggedDays: logged }));
    expect(m.compareWithheld).toBe('density');
    const why = m.why.join(' ');
    expect(why).toContain("Logged that unevenly, their counts aren't compared here.");
    expect(why).not.toMatch(/recent one was logged on fewer days/);
  });

  // Adversarial pass F3: coverage (a dose, a look) is not the gate's denominator.
  it('F3: a window whose coverage is full but whose symptom-or-meal days are thin withholds as thin', () => {
    const gate = [...everyDay(-70, -28), shift(THURSDAY, -3)];
    const m = buildSignalScreenModel(benign({ gateLoggedDays: gate }));
    expect(m.compareWithheld).toBe('thin');
    expect(m.why.join(' ')).toContain("with symptoms or meals logged on 28 and 1 of them. That's too few logged days to compare their counts.");
  });

  // CUL-1359 (supersedes F4's reflection compare): a reflection draws NO compare. Its claim is
  // the engine's week pair, already in the sentence; the screen used to halve its window into
  // two 3-day strips beside "down from N the week before" — one population counted twice. The
  // engine's own density disclosure still reaches the why; no second windows line does.
  it('CUL-1359: a reflection draws no compare and states no second windows line, whatever its window', () => {
    for (const windowDays of [7, 14]) {
      const reflection: CachedFinding['finding'] = {
        type: 'reflection',
        priorityClass: 'insight',
        symptomType: 'vomit',
        currentCount: 1,
        priorCount: 4,
        direction: 'improving',
        windowDays,
        density: { comparable: true, currentLoggingDays: 7, priorLoggingDays: 6 },
      };
      const eps = [-12, -11, -9, -8].map((d) => episode(shift(THURSDAY, d), 9)).concat([episode(shift(THURSDAY, -2), 9)]);
      const m = buildSignalScreenModel(benign({ cached: cachedOf(reflection), episodes: eps }));
      expect(m.compare).toBeNull();
      expect(m.compareWithheld).toBeNull();
      const why = m.why.join(' ');
      expect(why).toContain('Counted from days you logged: 7 this week, 6 last.');
      expect(why).not.toMatch(/Two windows of/);
    }
  });

  // Adversarial pass F2: the trial lanes are a before/during pair; a falling split is one lane.
  it('F2: on a trial, a falling before/in-trial lane split is drawn as one lane; a rising one stays split', () => {
    const t = trial({ dayCounter: 20, startDay: shift(THURSDAY, -19) });
    const before = [-38, -35, -30, -25, -21].map((d) => episode(shift(THURSDAY, d), 9, { minutesSinceMeal: 10 }));
    const inTrial = [episode(shift(THURSDAY, -5), 9, { minutesSinceMeal: 10 })];
    const falling = buildSignalScreenModel(mockInput({ cached: cachedOf(postprandial()), trial: t, episodes: [...before, ...inTrial] }));
    expect(falling.lanes?.lanes.map((l) => l.label)).toEqual(['The last 56 days']);
    const rising = buildSignalScreenModel(mockInput({ cached: cachedOf(postprandial()), trial: t, episodes: [...inTrial, ...before.map((e) => ({ ...e, dayKey: shift(e.dayKey, 20), eventId: `${e.eventId}-t` }))] }));
    expect(rising.lanes?.lanes.map((l) => l.label)).toEqual(['Before the trial', 'In the trial']);
  });

  it('the week line takes the same gate: a falling vomit week pair beside a not-eating record prints this week alone', () => {
    const lastWeek = [-5, -6, -7].map((d) => episode(shift(THURSDAY, d), 9)); // Thursday Sep 17: Sun Sep 13..Thu is this week
    const m = buildSignalScreenModel(benign({ episodes: lastWeek, notEating: true }));
    expect(m.weekLine).not.toMatch(/last week/);
    const eating = buildSignalScreenModel(benign({ episodes: lastWeek, notEating: false }));
    expect(eating.weekLine).toMatch(/· 3 last week$/);
  });

  it('a RISE is never withheld, not even beside a not-eating record (escalation is the safe direction)', () => {
    const rising = [episode(shift(THURSDAY, -40), 9), ...[-9, -6, -3, -1].map((d) => episode(shift(THURSDAY, d), 9))];
    const m = buildSignalScreenModel(benign({ episodes: rising, notEating: true }));
    expect(m.compareWithheld).toBeNull();
    expect(m.compare?.windows.map((w) => w.count)).toEqual([1, 4]);
  });

  it('a cough pair is not the not-eating gate’s: it falls, the pet is not eating, it is drawn', () => {
    const m = buildSignalScreenModel(benign({ cached: cachedOf({ ...(postprandial() as object), symptomType: 'cough' } as CachedFinding['finding']), notEating: true }));
    expect(m.compareWithheld).toBeNull();
    expect(m.compare).not.toBeNull();
  });

  it('BRK-4: a falling reflection’s screen prints the engine’s density line and, on a trial, the adjacency', () => {
    const reflection: CachedFinding['finding'] = {
      type: 'reflection',
      priorityClass: 'insight',
      symptomType: 'vomit',
      currentCount: 1,
      priorCount: 5,
      direction: 'improving',
      windowDays: 14,
      density: { comparable: false, currentLoggingDays: 4, priorLoggingDays: 7 },
    };
    const m = buildSignalScreenModel(mockInput({ cached: cachedOf(reflection), trial: trial({ dayCounter: 9, startDay: shift(THURSDAY, -8) }) }));
    const why = m.why.join(' ');
    expect(why).not.toMatch(/down from/);
    expect(why).toContain("You also logged on fewer days this week, so we're not comparing it with last week");
    expect(why).toContain("A quieter week partway through a diet trial isn't the trial's verdict");
  });

  it('BRK-5: on a running trial nothing is drawn — the strip’s sentence verbatim, or nothing when the strip withholds it', () => {
    const line = "Vomiting: 3 in the trial's 42 days · 11 in the 49 days before, a longer stretch.";
    const on = buildSignalScreenModel(mockInput({ cached: cachedOf(postprandial()), trialVomitingLine: line }));
    expect(on.compare).toBeNull();
    expect(on.why).toContain(line);
    // The strip withheld it (a thin baseline, uneven logging, a pet not eating): the screen says nothing comparing.
    const off = buildSignalScreenModel(mockInput({ cached: cachedOf(postprandial()), trialVomitingLine: null }));
    expect(off.compare).toBeNull();
    expect(off.why.join(' ')).not.toMatch(/days before|Two windows|Vomiting:/);
  });

  it('the strip’s vomiting sentence is a vomiting sentence: never on a cough screen, never on a safety screen', () => {
    const line = "Vomiting: 3 in the trial's 42 days.";
    const cough = buildSignalScreenModel(mockInput({ cached: cachedOf({ ...(postprandial() as object), symptomType: 'cough' } as CachedFinding['finding']), trialVomitingLine: line }));
    expect(cough.why).not.toContain(line);
    const safety = buildSignalScreenModel(mockInput({ trialVomitingLine: line }));
    expect(safety.why).not.toContain(line);
  });

  it('BRK-39: a safety screen draws no local compare and never says "not a verdict"; its script withholds a falling vomit compare beside a not-eating record', () => {
    const easing = chronicity({ compare: { recentCount: 5, priorCount: 12, recentLoggingDays: 15, priorLoggingDays: 28, halfDays: 28, comparable: false } });
    const m = buildSignalScreenModel(mockInput({ cached: cachedOf(easing), trial: null }));
    expect(m.compare).toBeNull();
    expect(m.why.join(' ')).not.toMatch(/not a verdict|Two windows/);
    expect(m.withholdFallingVomit).toBe(false);
    expect(buildSignalScreenModel(mockInput({ cached: cachedOf(easing), trial: null, notEating: true })).withholdFallingVomit).toBe(true);
  });

  it('past the cap the medication windows are apart, and a dose in the gap is in neither', () => {
    const long = trial({ dayCounter: 120, startDay: shift(THURSDAY, -119) });
    const [before, during] = medicationWindowSpec({ cached: cachedOf(postprandial()), today: THURSDAY, trial: long });
    expect(before).toMatchObject({ label: 'The 49 days before the trial', startDay: shift(THURSDAY, -168), days: 49 });
    expect(during).toMatchObject({ label: "The trial's last 84 days", startDay: shift(THURSDAY, -83), days: 84 });
    const gap = medicationLines(mockInput({ cached: cachedOf(postprandial()), trial: long, doses: [{ drugLabel: 'Cerenia', dayKey: shift(THURSDAY, -100) }] }));
    expect(gap).toEqual([]);
  });
});

describe('CUL-1216 — the loader reads the not-eating register for the ROUTE’s pet, failing closed', () => {
  const pets = [
    { id: 'pet-1', name: 'Nyx', species: 'cat', sex: 'female' },
    { id: 'pet-2', name: 'Other', species: 'dog', sex: 'male' },
  ];
  beforeEach(() => {
    mockGetAllAsync.mockReset();
    mockGetAllAsync.mockResolvedValue([]);
    mockReadSignalCache.mockReset();
    mockLoadTrialPredicateFacts.mockReset();
    mockLoadTrialPredicateFacts.mockResolvedValue(null);
    mockLoadDietTrialFacts.mockReset();
    mockReadFeedingRows.mockResolvedValue([]);
    mockReadFreeFedSpans.mockResolvedValue([]);
    usePetStore.setState({ pets: pets as never, activePet: pets[1] as never });
  });

  it('asks the trial facts for the route’s pet, not the active one', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(postprandial())] });
    mockLoadDietTrialFacts.mockResolvedValue(trialLessFacts);
    const out = await loadSignalScreen('pet-1', 'postprandial_timing:vomit');
    expect(mockLoadDietTrialFacts).toHaveBeenCalledWith(expect.objectContaining({ pet: expect.objectContaining({ id: 'pet-1' }) }));
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.model.withholdFallingVomit).toBe(false);
  });

  it('a failed facts read is unanswered for the trial too: the model is told, so a falling line withholds (N1)', async () => {
    // A COUGH finding: the not-eating gate is vomit-only, so only the unanswered trial can withhold.
    mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(chronicity({ symptomType: 'cough' }))] });
    mockLoadDietTrialFacts.mockRejectedValue(new Error('sqlite'));
    // A pinned Thursday (C-29): five arrived days this week clear the gate's floor, so the
    // only thing that can withhold the falling cough line is the unanswered trial.
    const NOW = new Date(2026, 8, 17, 12).getTime();
    const today = toLocalDayKey(new Date(NOW));
    const dow = new Date(NOW).getDay();
    mockGetAllAsync.mockImplementation((sql: string) => {
      // Three coughs last week, none this week, every day a meal: a falling week pair.
      if (/FROM events\s+WHERE pet_id = \? AND event_type = \?/.test(sql))
        return Promise.resolve([1, 2, 3].map((d) => ({ id: `v${d}`, occurred_at: new Date(NOW - (dow + d) * 86_400_000).toISOString(), occurred_at_confidence: null })));
      if (/event_type IN/.test(sql) || /SELECT occurred_at FROM events WHERE pet_id = \? AND deleted_at IS NULL$/.test(sql))
        return Promise.resolve(Array.from({ length: 30 }, (_, i) => ({ occurred_at: new Date(NOW - i * 86_400_000).toISOString() })));
      return Promise.resolve([]);
    });
    const out = await loadSignalScreen('pet-1', 'symptom_chronicity:cough', NOW);
    if (out.status !== 'ready') throw new Error(out.status);
    expect(today).toBe('2026-09-17');
    expect(out.model.weekLine).toMatch(/^0 this week so far$/);
  });

  it('a failed facts read is "not answered": the register withholds', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(postprandial())] });
    mockLoadDietTrialFacts.mockRejectedValue(new Error('sqlite'));
    const out = await loadSignalScreen('pet-1', 'postprandial_timing:vomit');
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.model.withholdFallingVomit).toBe(true);
  });

  it('on a running trial the strip’s own vomiting sentence reaches Why, verbatim, and nothing is drawn', async () => {
    const today = toLocalDayKey(new Date());
    const running = { id: 't', status: 'active', startedAt: shift(today, -20), endedAt: null, targetDurationDays: 56, foodLabel: null };
    mockLoadDietTrialFacts.mockResolvedValue({
      ...trialLessFacts,
      nowMs: Date.now(),
      trial: running,
      trialResponse: {
        trialDayNumber: 21,
        trialCount: 3,
        trialLastEpisodeDayIndex: null,
        baselineCount: 11,
        trialLoggedDays: 21,
        baselineLoggedDays: 49,
        baselineWindowDays: 49,
        densityComparable: true,
      },
    });
    mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(postprandial())] });
    const out = await loadSignalScreen('pet-1', 'postprandial_timing:vomit');
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.model.compare).toBeNull();
    expect(out.model.why).toContain("Vomiting: 3 in the trial's 21 days · 11 in the 49 days before, a longer stretch.");
  });

  // TS-9 (CUL-1305, adversarial pass): the route is reachable without Home's stack in between
  // (the trial screen's Signal door a beat stale, a card tapped as a regen lands, a deep link),
  // and the sentence is the server's, drawn whole. So the loader answers only for a finding
  // Home would draw: the same predicate (`visibleFindings`), the same register, failing closed.
  describe('a finding Home withholds is not in the picture here either', () => {
    const trialPair = (dir: 'fewer_during_trial' | 'more_during_trial'): CachedFinding =>
      cachedOf({
        type: 'trial_response',
        priorityClass: 'insight',
        trialDayNumber: 21,
        targetDurationDays: 56,
        trialLoggedDays: 21,
        baselineLoggedDays: 49,
        baselineWindowDays: 49,
        pooledTrialCount: 1,
        pooledBaselineCount: 11,
        rapid: { trial: 0, baseline: 4 },
        long: { trial: 0, baseline: 0 },
        rapidWindowMinutes: 30,
        longGapHours: 6,
        treatShare: { trial: null, baseline: null },
        mealsPerDay: { trial: null, baseline: null },
        comparisonDirection: dir,
        trialWindowDays: 21,
      } as TrialResponseFinding);
    const refusing = (): TrialCardInput => {
      const today = toLocalDayKey(new Date());
      return {
        ...trialLessFacts,
        species: 'cat',
        nowMs: Date.now(),
        trial: { id: 't', status: 'active', startedAt: shift(today, -20), endedAt: null, targetDurationDays: 56, foodLabel: null },
        trialDietRefusal: { refusedFeedings: 4, ratedFeedings: 5, days: 2, population: 'trial_diet' },
      } as TrialCardInput;
    };
    const eating = (): TrialCardInput => ({ ...refusing(), trialDietRefusal: null }) as TrialCardInput;

    it('the fixtures are the two registers they claim to be', () => {
      expect(isAnimalNotEating(refusing())).toBe(true);
      expect(isAnimalNotEating(eating())).toBe(false);
    });

    it('a falling trial pair over a refusing cat is WITHHELD (never "missing"); the same pair over an eating one is ready', async () => {
      mockReadSignalCache.mockResolvedValue({ findings: [trialPair('fewer_during_trial')] });
      mockLoadDietTrialFacts.mockResolvedValue(refusing());
      expect(await loadSignalScreen('pet-1', 'trial_response')).toEqual({ status: 'withheld', petName: 'Nyx' });
      mockLoadDietTrialFacts.mockResolvedValue(eating());
      expect((await loadSignalScreen('pet-1', 'trial_response')).status).toBe('ready');
    });

    it('a rising pair over a refusing cat stays (escalation is never withheld)', async () => {
      mockReadSignalCache.mockResolvedValue({ findings: [trialPair('more_during_trial')] });
      mockLoadDietTrialFacts.mockResolvedValue(refusing());
      expect((await loadSignalScreen('pet-1', 'trial_response')).status).toBe('ready');
    });

    it('the Signal’s own intake decline withholds the falling pair, whatever the trial facts said', async () => {
      const decline = cachedOf(
        { type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 3, refusedFoodLabel: null, ratedMealsConsidered: 9 },
        'Nyx has eaten less than usual for 3 days.',
      );
      mockReadSignalCache.mockResolvedValue({ findings: [decline, { ...trialPair('fewer_during_trial'), rank: 1 }] });
      mockLoadDietTrialFacts.mockResolvedValue(eating());
      expect((await loadSignalScreen('pet-1', 'trial_response')).status).toBe('withheld');
    });

    // Fail closed, but never as a permanent-sounding "gone": an unanswered register is a failed
    // read, which the screen shows with Try again (C-37: return the reason).
    it('a trial facts read that fails never draws the falling pair and never calls it gone: the load rejects', async () => {
      mockReadSignalCache.mockResolvedValue({ findings: [trialPair('fewer_during_trial')] });
      mockLoadDietTrialFacts.mockRejectedValue(new Error('sqlite'));
      await expect(loadSignalScreen('pet-1', 'trial_response')).rejects.toThrow(/not answered/);
    });

    it('a cold start before the pet list loads rejects the same way (the screen re-runs when pets arrive)', async () => {
      usePetStore.setState({ pets: [] as never, activePet: null as never });
      mockReadSignalCache.mockResolvedValue({ findings: [trialPair('fewer_during_trial')] });
      await expect(loadSignalScreen('pet-1', 'trial_response')).rejects.toThrow(/not answered/);
    });

    it('a pet the loaded list does not hold (archived) is missing, never a Try again that cannot succeed', async () => {
      mockReadSignalCache.mockResolvedValue({ findings: [trialPair('fewer_during_trial')] });
      expect((await loadSignalScreen('pet-archived', 'trial_response')).status).toBe('missing');
    });

    it('findings Home keeps over a refusing cat still render; only an expired stood-down line is missing', async () => {
      mockLoadDietTrialFacts.mockResolvedValue(refusing());
      mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(postprandial())] });
      expect((await loadSignalScreen('pet-1', 'postprandial_timing:vomit')).status).toBe('ready');
    });

    it('the withheld copy explains, points to the vet, and never reassures', () => {
      const lines = withheldLines('Nyx');
      expect(lines).toEqual([
        "This one is set aside while Nyx may not be eating. Fewer vomits from an empty stomach isn't a sign of getting better.",
        "If you're worried about Nyx, your vet is the best call.",
      ]);
      expect(lines.join(' ')).not.toMatch(/!|\d/);
    });

    // CUL-1360: the cache still holds rabbit's pair (counted just after midnight today, on its
    // day 21 — `trialPair`'s day, rabbit having started twenty days ago) and the owner then
    // replaced rabbit with chicken. The screen reads the SAME anchor Home's stack
    // does: the falling pair is not in the picture, the rising pair speaks in its own day.
    describe('a trial finding counted over a trial since replaced', () => {
      const today = () => toLocalDayKey(new Date());
      // Past the lag band after local midnight, so the engine's day is today's (C-29: built
      // from local components, the same instant in every CI zone's terms).
      const countedToday = (): string => {
        const [y, m, d] = today().split('-').map(Number);
        return new Date(y, m - 1, d, 0, 30).toISOString();
      };
      const chickenToday = (): TrialCardInput =>
        ({
          ...eating(),
          trial: { id: 't2', status: 'active', startedAt: today(), endedAt: null, targetDurationDays: 56, foodLabel: null, trialProtein: { protein: 'chicken', source: 'owner' } },
        }) as TrialCardInput;
      const DIET_CHANGE_LINE = 'A diet change is one of several things that can move this.';
      const rabbitRow = (dir: 'fewer_during_trial' | 'more_during_trial') => ({ findings: [trialPair(dir)], generatedAt: countedToday() });

      it('the falling pair is missing (not withheld: no reason about eating is true of it)', async () => {
        mockReadSignalCache.mockResolvedValue(rabbitRow('fewer_during_trial'));
        mockLoadDietTrialFacts.mockResolvedValue(chickenToday());
        expect(await loadSignalScreen('pet-1', 'trial_response')).toEqual({ status: 'missing', petName: 'Nyx' });
      });

      it('the rising pair is ready, titled by its own day and drawn with no trial window', async () => {
        mockReadSignalCache.mockResolvedValue(rabbitRow('more_during_trial'));
        mockLoadDietTrialFacts.mockResolvedValue(chickenToday());
        const out = await loadSignalScreen('pet-1', 'trial_response');
        if (out.status !== 'ready') throw new Error(out.status);
        expect(out.model.title).toBe('Diet trial, day 21 of 56');
        // No trial window: none of the running trial's lines, which name chicken's day.
        expect(out.model.why).not.toContain(DIET_CHANGE_LINE);
      });

      it('the same pair over the trial it counted keeps the running trial’s name and window', async () => {
        mockReadSignalCache.mockResolvedValue(rabbitRow('fewer_during_trial'));
        mockLoadDietTrialFacts.mockResolvedValue({
          ...eating(),
          trial: { ...eating().trial, trialProtein: { protein: 'rabbit', source: 'owner' } },
        } as TrialCardInput);
        const out = await loadSignalScreen('pet-1', 'trial_response');
        if (out.status !== 'ready') throw new Error(out.status);
        expect(out.model.title).toBe('Rabbit trial, day 21 of 56');
        expect(out.model.why).toContain(DIET_CHANGE_LINE);
      });
    });
  });

  it('an intake decline in the pet’s Signal withholds, whatever the trial facts said', async () => {
    const decline: CachedFinding = cachedOf(
      { type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 3, refusedFoodLabel: null, ratedMealsConsidered: 9 },
      'Nyx has eaten less than usual for 3 days.',
    );
    mockReadSignalCache.mockResolvedValue({ findings: [decline, { ...cachedOf(postprandial()), rank: 1 }] });
    mockLoadDietTrialFacts.mockResolvedValue(trialLessFacts);
    const out = await loadSignalScreen('pet-1', 'postprandial_timing:vomit');
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.model.withholdFallingVomit).toBe(true);
  });
});
