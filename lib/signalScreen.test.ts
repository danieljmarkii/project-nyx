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
jest.mock('./dietTrialFacts', () => ({ loadTrialPredicateFacts: (...a: unknown[]) => mockLoadTrialPredicateFacts(...a) }));

import {
  boutMembers,
  buildSignalScreenModel,
  doseDatesPhrase,
  loadSignalScreen,
  medicationLines,
  readLoggedDays,
  readSignalEpisodes,
  readTileVerdicts,
  readVerdicts,
  safeLabel,
  trialLine,
  whyLines,
  type SignalScreenEpisode,
  type SignalScreenInput,
  type SignalScreenModel,
} from './signalScreen';
import type { CachedFinding, IntakeDeclineFinding, SymptomChronicityFinding, TrialResponseFinding } from './signal';
import { hasTitleVerdictWord } from './signalTitle';
import type { SignalTrialWindow } from './signalWindows';
import { signalCompareSpec } from './signalWindows';
import { dayKeyFromIndex, formatCalendarDate, localDayIndexOf, toLocalDayKey } from './utils';
import { usePetStore } from '../store/petStore';
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
    expect(model.title).toBe('Vomiting, day 55 of the rabbit trial');
    expect(model.sentence).toMatch(/^Nyx has vomited 21 times/);
    expect(model.noun).toBe('vomiting');
    expect(model.safety).toBe(true);
    expect(model.foldable).toBe(true);
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

  it('the compare: the trial’s 55 days against the 55 before, logged days shown, nothing adjudicated', () => {
    if (!model.compare) throw new Error('no compare');
    const [before, during] = model.compare.windows;
    expect(before.label).toBe('The 55 days before');
    expect(during.label).toBe("The trial's 55 days");
    expect(during.count).toBe(21);
    expect(before.count).toBe(19);
    expect(during.coverageLine).toBe('logged 55 of 55 days');
    expect(before.coverageLine).toBe('logged 16 of 55 days');
    for (const w of model.compare?.windows ?? []) expect(`${w.label} ${w.coverageLine}`).not.toMatch(/\bfair/i);
  });

  it('the lanes: before the trial · in it, every episode on its lane, the untimed ones counted', () => {
    const lanes = model.lanes?.lanes ?? [];
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
    expect(model.why).toContain('Two windows of 55 days, logged on 16 and 55 of them. Compared as counts, not a verdict on how Nyx is doing.');
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
    // It sits between the compare line and the diet line — read before the diet.
    const i = model.why.findIndex((l) => l.startsWith('Cerenia'));
    expect(i).toBeGreaterThan(model.why.findIndex((l) => l.startsWith('Two windows')));
    expect(i).toBeLessThan(model.why.findIndex((l) => l.startsWith('Day 55')));
  });

  it('a course before the trial says so, one across the start says both windows', () => {
    const before = medicationLines(mockInput({ doses: [{ drugLabel: 'Cerenia', dayKey: shift(TRIAL_START, -3) }] }));
    expect(before).toEqual([`Cerenia was given ${expect.any(String) && 'Jul 22'}, inside the 55 days before.`]);
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
    const [before] = signalCompareSpec(chronicity(), THURSDAY, trial());
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
    expect(model.title).toBe('Vomiting, day 1 of the rabbit trial');
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
    expect(model.title).toBe('Vomiting, the last 8 weeks');
    expect(model.why.join(' ')).not.toMatch(/Day \d+|diet change/);
    expect(model.compare?.windows.map((w) => w.label)).toEqual(['The 28 days before', 'The recent 28 days']);
    expect(model.lanes?.lanes.map((l) => l.label)).toEqual(['The last 56 days']);
  });
});

describe('other findings', () => {
  it('a cough draws the bars and the compare but no lanes — nothing times a cough against a meal', () => {
    const model = buildSignalScreenModel(mockInput({ cached: cachedOf(chronicity({ symptomType: 'cough' })) }));
    expect(model.noun).toBe('coughing');
    expect(model.weekly).not.toBeNull();
    expect(model.compare).not.toBeNull();
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
    expect(model.foldable).toBe(false);
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

  it('readLoggedDays: an event day or an answered look is a logged day; the first is the record’s start', async () => {
    mockGetAllAsync
      .mockResolvedValueOnce([{ occurred_at: noon(2026, 9, 17) }, { occurred_at: noon(2026, 9, 17, 20) }, { occurred_at: noon(2026, 9, 10) }])
      .mockResolvedValueOnce([{ local_day: '2026-09-12' }, { local_day: 'nope' }]);
    const out = await readLoggedDays('pet-1');
    expect(out.loggedDays).toEqual(['2026-09-10', '2026-09-12', '2026-09-17']);
    expect(out.recordStart).toBe('2026-09-10');
    // An UNDONE look is not a logged day (M20): the looks read joins the parent event and
    // keeps only live ones — a string literal nothing else red-flags, pinned here (C-37).
    const [, looksSql] = mockGetAllAsync.mock.calls.map((c) => c[0] as string);
    expect(looksSql).toMatch(/JOIN events e ON e\.id = l\.event_id/);
    expect(looksSql).toMatch(/e\.deleted_at IS NULL/);
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
    mockReadFeedingRows.mockResolvedValue([]);
    mockReadFreeFedSpans.mockResolvedValue([]);
    // C-9: the ACTIVE pet is the other one; the screen must name the route's pet.
    usePetStore.setState({ pets: pets as never, activePet: pets[1] as never });
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
    mockLoadTrialPredicateFacts.mockResolvedValue({
      trial: { id: 't', status: 'active', startedAt: shift(today, -58), endedAt: null, targetDurationDays: 56, foodLabel: 'Rabbit & Pea', trialProtein: { protein: 'rabbit', source: 'stored' } },
      stoppedForRefusal: false,
      facts: null,
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
    expect(out.model.title).toMatch(/^Vomiting, day \d+ of the rabbit trial$/);
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
    expect(mockLoadTrialPredicateFacts).toHaveBeenCalledWith(expect.objectContaining({ id: 'pet-1', name: 'Nyx', species: 'cat' }), expect.any(Number));
  });

  it('a tile carries the rose its bout holds on another row, and reads it off the phone (F3 on #912)', async () => {
    mockReadSignalCache.mockResolvedValue({ findings: [cachedOf(chronicity())] });
    mockLoadTrialPredicateFacts.mockResolvedValue({ trial: null, stoppedForRefusal: false, facts: null });
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
    mockLoadTrialPredicateFacts.mockResolvedValue({
      trial: { id: 't', status: 'completed', startedAt: '2026-01-01', endedAt: '2026-02-01', targetDurationDays: 30, foodLabel: null, trialProtein: null },
      stoppedForRefusal: false,
      facts: null,
    });
    mockGetAllAsync.mockResolvedValue([]);
    const ended = await loadSignalScreen('pet-1', 'symptom_chronicity:vomit');
    expect(ended.status === 'ready' && ended.model.title).toBe('Vomiting, the last 8 weeks');

    mockLoadTrialPredicateFacts.mockRejectedValue(new Error('sqlite'));
    const failed = await loadSignalScreen('pet-1', 'symptom_chronicity:vomit');
    expect(failed.status).toBe('ready');
  });
});
