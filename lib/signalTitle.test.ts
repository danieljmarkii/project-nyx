// The Signal's title never verdicts (D2-3 · CUL-1065). Property-tested: every finding
// type × every symptom word × trial / no trial, every title against the verdict list,
// and the list itself is checked to be the one the issue names.

import type {
  CorrelationFinding,
  EmptyStomachTimingFinding,
  IncidentRedFlagFinding,
  IntakeDeclineFinding,
  PostprandialTimingFinding,
  ReflectionFinding,
  SignalFinding,
  SignalSymptomType,
  StoodDownMarker,
  SymptomChronicityFinding,
  SymptomWorseningFinding,
  TimeOfDayClusteringFinding,
  TimingStoryFinding,
  TrialResponseFinding,
} from './signal';
import { hasTitleVerdictWord, signalTitle, TITLE_VERDICT_WORDS } from './signalTitle';
import type { SignalTrialWindow } from './signalWindows';

const SYMPTOMS: SignalSymptomType[] = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough', 'sneeze'];

const trial = (over: Partial<SignalTrialWindow> = {}): SignalTrialWindow => ({
  startDay: '2026-07-25',
  identity: 'Rabbit trial',
  dayCounter: 55,
  targetDays: 56,
  foodLabel: 'Royal Canin Selected Protein PR',
  ...over,
});

/** Every finding type the union holds, for one symptom word. */
function everyType(symptomType: SignalSymptomType): SignalFinding[] {
  const chronicity: SymptomChronicityFinding = {
    type: 'symptom_chronicity',
    priorityClass: 'safety',
    symptomType,
    episodeCount: 14,
    spanDays: 40,
    activeWeeks: 5,
    symptomDays: 12,
    daysSinceLastEpisode: 1,
    firstOnsetIso: '2026-08-01T00:00:00Z',
    tier: 'firm',
    windowDays: 56,
  };
  const worsening: SymptomWorseningFinding = {
    type: 'symptom_worsening',
    priorityClass: 'safety',
    symptomType,
    currentCount: 5,
    priorCount: 0,
    currentDays: 4,
    priorDays: 0,
    trigger: 'more_days',
    tier: 'firm',
    windowDays: 14,
  };
  const reflection: ReflectionFinding = {
    type: 'reflection',
    priorityClass: 'insight',
    symptomType,
    currentCount: 2,
    priorCount: 5,
    direction: 'improving',
    windowDays: 14,
  };
  const postprandial: PostprandialTimingFinding = {
    type: 'postprandial_timing',
    priorityClass: 'insight',
    symptomType,
    rapidCount: 5,
    eligibleCount: 8,
    totalEpisodes: 9,
    rapidWindowMinutes: 30,
    lastTwoEligibleRapid: true,
    medianMinutesSinceFeeding: 12,
    feedingFormsInEvidence: [],
    windowDays: 56,
  };
  const clock: TimeOfDayClusteringFinding = {
    type: 'timeofday_clustering',
    priorityClass: 'insight',
    symptomType,
    clusterStartLocalHour: 2,
    clusterWindowHours: 4,
    clusterCount: 4,
    eligibleCount: 6,
    totalEpisodes: 6,
    timezone: 'America/Chicago',
    windowDays: 56,
  };
  const empty: EmptyStomachTimingFinding = {
    type: 'empty_stomach_timing',
    priorityClass: 'insight',
    symptomType,
    longCount: 4,
    eligibleCount: 6,
    bandCounts: { rapid: 1, mid: 1, long: 4 },
    totalEpisodes: 8,
    longGapHours: 6,
    lastTwoEligibleLong: true,
    medianHoursSinceFeeding: 8,
    feedingFormsInEvidence: [],
    windowDays: 56,
  };
  const story: TimingStoryFinding = {
    type: 'timing_story',
    priorityClass: 'insight',
    symptomType,
    bandCounts: { rapid: 3, mid: 1, long: 3 },
    eligibleCount: 7,
    totalEpisodes: 9,
    rapidWindowMinutes: 30,
    longGapHours: 6,
    windowDays: 56,
    rapid: { count: 3, medianMinutesSinceFeeding: 10, lastTwoEligible: false, feedingFormsInEvidence: [] },
    long: { count: 3, medianHoursSinceFeeding: 8, lastTwoEligible: false, feedingFormsInEvidence: [] },
  };
  const correlation: CorrelationFinding = {
    type: 'food_symptom_correlation',
    priorityClass: 'insight',
    tier: 'early',
    symptomType,
    protein: 'chicken and duck',
    proteins: ['chicken', 'duck'],
    jointCandidate: true,
    matchedPairs: 4,
    symptomEventCount: 4,
    correlationWindowHours: 12,
  };
  const stood: StoodDownMarker = {
    type: 'stood_down',
    priorityClass: 'insight',
    symptomType,
    recencyDays: 9,
    tier: 'standard',
    lastEpisodeIso: '2026-09-01T00:00:00Z',
    stoodDownAt: '2026-09-10T00:00:00Z',
    formerRank: 0,
  };
  const trialCard: TrialResponseFinding = {
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
    comparisonDirection: 'fewer_during_trial',
    trialWindowDays: 55,
  };
  const intakeLow: IntakeDeclineFinding = {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 3,
    refusedFoodLabel: null,
    ratedMealsConsidered: 9,
  };
  const intakeRefused: IntakeDeclineFinding = { ...intakeLow, trigger: 'refused_normal_food', refusedFoodLabel: 'Kibble' };
  const redFlag: IncidentRedFlagFinding = {
    type: 'incident_red_flag',
    priorityClass: 'safety',
    incidentType: 'vomit',
    flags: ['blood', 'foreign_material'],
    mostRecentFlaggedIso: '2026-09-16T00:00:00Z',
    flaggedIncidentCount: 1,
    windowDays: 14,
  };
  const stoolFlag: IncidentRedFlagFinding = { ...redFlag, incidentType: 'stool', flags: ['foreign_material'] };
  return [chronicity, worsening, reflection, postprandial, clock, empty, story, correlation, stood, trialCard, intakeLow, intakeRefused, redFlag, stoolFlag];
}

describe('signalTitle — names the finding’s claim (D2, CUL-1270)', () => {
  it('the ruled titles: “Vomiting in 5 of the last 8 weeks”, “Vomiting soon after meals”', () => {
    const all = everyType('vomit');
    expect(signalTitle(all[0], null)).toBe('Vomiting in 5 of the last 8 weeks');
    expect(signalTitle(all[3], null)).toBe('Vomiting soon after meals');
  });

  it('the two vomiting findings that read as twins no longer share a title', () => {
    const [chronicity, , , postprandial] = everyType('vomit');
    expect(signalTitle(chronicity, null)).not.toBe(signalTitle(postprandial, null));
  });

  it('a symptom finding’s claim is the same claim on a trial day — the trial’s day lives on its strip', () => {
    for (const f of everyType('vomit').filter((x) => x.type !== 'trial_response' && x.type !== 'stood_down')) {
      expect(signalTitle(f, trial())).toBe(signalTitle(f, null));
    }
  });

  it('worsening: each tier on the axis its sentence leads with, never the strip’s “up”', () => {
    const worsening = everyType('cough')[1] as SymptomWorseningFinding;
    expect(signalTitle(worsening, null)).toBe('Coughing on 4 of the last 14 days');
    expect(signalTitle({ ...worsening, tier: 'soft' }, null)).toBe('Coughing on 4 separate days this week');
    expect(signalTitle({ ...worsening, tier: 'standard' }, null)).toBe('Coughing, 5 episodes this week');
    expect(signalTitle({ ...worsening, tier: 'standard', currentCount: 1 }, null)).toBe('Coughing, 1 episode this week');
  });

  it('the frequency comparison stays count-free (its lead card prints the bars’ own line)', () => {
    expect(signalTitle(everyType('vomit')[2], null)).toBe('Vomiting, week over week');
  });

  it('the timing claims', () => {
    const all = everyType('vomit');
    expect(signalTitle(all[4], null)).toBe('Vomiting between 2am and 6am');
    expect(signalTitle(all[5], null)).toBe('Vomiting long after meals');
    expect(signalTitle(all[6], null)).toBe('Vomiting soon or long after meals');
  });

  it('a correlation names its pairing as a sequence, never an attribution, and names every member', () => {
    expect(signalTitle(everyType('itch')[7], null)).toBe('Itching after chicken and duck');
  });

  it('the stand-down marker keeps the thing-and-window form (never a door)', () => {
    const stood = everyType('vomit')[8];
    expect(signalTitle(stood, null)).toBe('Vomiting, the last 8 weeks');
    expect(signalTitle(stood, trial())).toBe('Vomiting, day 55 of the rabbit trial');
  });

  it('the trial card is the trial: identity + day; the day never renders completion language', () => {
    const trialCard = everyType('vomit')[9];
    expect(signalTitle(trialCard, trial())).toBe('Rabbit trial, day 55 of 56');
    expect(signalTitle(trialCard, trial({ dayCounter: 56 }))).toBe('Rabbit trial, day 56 of 56');
    expect(signalTitle(trialCard, trial({ dayCounter: 60 }))).toBe('Rabbit trial, day 60 of 56');
    // Cache only (no local trial read): the finding's own day count, the generic identity.
    expect(signalTitle(trialCard, null)).toBe('Diet trial, day 55 of 56');
  });

  it('the photo read says the sentence’s own “possible”, and its family noun', () => {
    const all = everyType('vomit');
    expect(signalTitle(all[12], null)).toBe('Possible blood and possible foreign material in a vomit photo');
    expect(signalTitle(all[13], null)).toBe('Possible foreign material in a stool photo');
    expect(signalTitle({ ...(all[13] as IncidentRedFlagFinding), flags: ['blood'], flaggedIncidentCount: 3 }, null)).toBe(
      'Possible blood in stool photos',
    );
  });

  it('intake keeps its shipped name — a fact about the record', () => {
    const all = everyType('vomit');
    expect(signalTitle(all[10], null)).toBe('Eating less than usual');
    expect(signalTitle(all[11], null)).toBe('Refused the usual food');
  });
});

describe('PROPERTY: no title carries a verdict word — every type × every symptom × trial state', () => {
  it('holds', () => {
    const trials: (SignalTrialWindow | null)[] = [null, trial(), trial({ identity: 'Diet trial', dayCounter: 60, targetDays: 56 })];
    let checked = 0;
    for (const symptom of SYMPTOMS) {
      for (const finding of everyType(symptom)) {
        for (const t of trials) {
          const title = signalTitle(finding, t);
          expect(title.length).toBeGreaterThan(0);
          expect(hasTitleVerdictWord(title)).toBe(false);
          expect(title).not.toMatch(/!/);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(SYMPTOMS.length * 14 * trials.length);
  });

  it('the list is pinned by content — deleting a word is a decision here, never a drift (the property test reads the same list, C-34)', () => {
    expect([...TITLE_VERDICT_WORDS]).toEqual([
      'down', 'up', 'better', 'worse', 'worsening', 'improving', 'improved', 'fewer', 'more', 'quieter', 'calmer',
      'resolved', 'cleared', 'clear', 'settled', 'normal', 'fine', 'good', 'bad', 'rising', 'falling', 'spike', 'done', 'complete',
    ]);
    // And each one, on its own, is caught in a title-shaped sentence.
    for (const w of TITLE_VERDICT_WORDS) expect(hasTitleVerdictWord(`Vomiting, ${w} this week`)).toBe(true);
  });

  it('the list holds every word the issue names, and the predicate reads them as whole words', () => {
    for (const w of ['down', 'up', 'better', 'worse', 'improving', 'fewer', 'more']) expect(TITLE_VERDICT_WORDS).toContain(w);
    expect(hasTitleVerdictWord('Vomiting, up this week')).toBe(true);
    expect(hasTitleVerdictWord('Vomiting is 20% down')).toBe(true);
    expect(hasTitleVerdictWord('Vomiting ↓')).toBe(true);
    // A whole-word screen: "update" and "upset" are not "up".
    expect(hasTitleVerdictWord('An update on an upset stomach')).toBe(false);
    expect(hasTitleVerdictWord('Vomiting, day 55 of the rabbit trial')).toBe(false);
  });
});
