// The Signal fold's strip copy (CUL-784, fold spec §3.1 / §4 / FS-11) and the Back-because
// line (DF-8). Every clause is pinned verbatim per type, screened through the universal
// banned-vocabulary guard the med line uses, held under its FS-11 length cap at the type's
// realistic maximum (two-digit counts, the longest symptom word the type carries), and
// kept free of `!`, `%`, glyphs and every word on Dr. Chen's veto list.

import {
  STRIP_COUNT_LINE_MAX,
  STRIP_NAME_LINE_MAX,
  FOLD_CAPTION,
  FOLD_CONTROL_HINT,
  FOLD_CONTROL_LABEL,
  STRIP_A11Y_HINT,
  backBecauseCopy,
  hasBannedSignalVocabulary,
  stripA11yLabel,
  stripCountLine,
  stripNameLine,
} from './signalCopy';
import type { BackBecauseReason } from './signalFold';
import type {
  CorrelationFinding,
  EmptyStomachTimingFinding,
  IncidentRedFlagFinding,
  IntakeDeclineFinding,
  PostprandialTimingFinding,
  ReflectionFinding,
  SignalFinding,
  SymptomChronicityFinding,
  TimeOfDayClusteringFinding,
  TimingStoryFinding,
  TrialResponseFinding,
} from './signal';

// The §4 veto list — never on any fold surface.
const VETOED = /\b(resolved|cleared|all clear|settled|better|improving|quieter|down|dismissed|hidden|snoozed|reminder|seen|nothing new)\b|↓|%|days? (clear|free)|streak/i;

function clean(s: string): void {
  expect(hasBannedSignalVocabulary(s)).toBe(false);
  expect(s).not.toMatch(/!/);
  expect(s).not.toMatch(VETOED);
}

const postprandial = (over: Partial<PostprandialTimingFinding> = {}): PostprandialTimingFinding => ({
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 8,
  eligibleCount: 8,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 14,
  feedingFormsInEvidence: [],
  windowDays: 60,
  ...over,
});
const emptyStomach = (over: Partial<EmptyStomachTimingFinding> = {}): EmptyStomachTimingFinding => ({
  type: 'empty_stomach_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  longCount: 7,
  eligibleCount: 20,
  bandCounts: { rapid: 3, mid: 10, long: 7 },
  totalEpisodes: 26,
  longGapHours: 6,
  lastTwoEligibleLong: false,
  medianHoursSinceFeeding: 9,
  feedingFormsInEvidence: [],
  windowDays: 60,
  ...over,
});
const story = (over: Partial<TimingStoryFinding> = {}): TimingStoryFinding => ({
  type: 'timing_story',
  priorityClass: 'insight',
  symptomType: 'vomit',
  bandCounts: { rapid: 7, mid: 6, long: 7 },
  eligibleCount: 20,
  totalEpisodes: 26,
  rapidWindowMinutes: 30,
  longGapHours: 6,
  windowDays: 60,
  rapid: { count: 7, medianMinutesSinceFeeding: 12, lastTwoEligible: true, feedingFormsInEvidence: [] },
  long: { count: 7, medianHoursSinceFeeding: 9, lastTwoEligible: false, feedingFormsInEvidence: [] },
  ...over,
});
const timeofday = (over: Partial<TimeOfDayClusteringFinding> = {}): TimeOfDayClusteringFinding => ({
  type: 'timeofday_clustering',
  priorityClass: 'insight',
  symptomType: 'vomit',
  clusterStartLocalHour: 2,
  clusterWindowHours: 4,
  clusterCount: 6,
  eligibleCount: 9,
  totalEpisodes: 12,
  timezone: 'America/New_York',
  windowDays: 60,
  ...over,
});
const correlation = (over: Partial<CorrelationFinding> = {}): CorrelationFinding => ({
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
  matchedPairs: 4,
  symptomEventCount: 5,
  correlationWindowHours: 12,
  ...over,
});
const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 2,
  priorCount: 5,
  direction: 'improving',
  windowDays: 14,
  ...over,
});
const trial = (over: Partial<TrialResponseFinding> = {}): TrialResponseFinding => ({
  type: 'trial_response',
  priorityClass: 'insight',
  trialDayNumber: 31,
  targetDurationDays: 42,
  trialLoggedDays: 28,
  baselineLoggedDays: 40,
  baselineWindowDays: 49,
  pooledTrialCount: 4,
  pooledBaselineCount: 12,
  rapid: { trial: 2, baseline: 8 },
  long: { trial: 1, baseline: 2 },
  rapidWindowMinutes: 30,
  longGapHours: 6,
  treatShare: { trial: null, baseline: null },
  mealsPerDay: { trial: null, baseline: null },
  comparisonDirection: 'fewer_during_trial',
  trialWindowDays: 31,
  ...over,
});
const chronicity: SymptomChronicityFinding = {
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 14,
  spanDays: 56,
  activeWeeks: 5,
  symptomDays: 12,
  daysSinceLastEpisode: 3,
  firstOnsetIso: '2026-07-05T00:00:00.000Z',
  tier: 'firm',
  windowDays: 56,
};
const intake: IntakeDeclineFinding = {
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 3,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
};
const redFlag: IncidentRedFlagFinding = {
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: '2026-09-01T08:00:00.000Z',
  flaggedIncidentCount: 2,
  windowDays: 14,
};

describe('stripNameLine / stripCountLine — verbatim per benign type (§4)', () => {
  it('postprandial timing', () => {
    expect(stripNameLine(postprandial())).toBe('Vomiting soon after eating');
    expect(stripCountLine(postprandial())).toBe('8 of 8 timed within 30 min of eating');
  });
  it('empty-stomach timing', () => {
    expect(stripNameLine(emptyStomach())).toBe('Vomiting long after eating');
    expect(stripCountLine(emptyStomach())).toBe('7 of 20 timed 6h or more after eating');
  });
  it('the combined timing story', () => {
    expect(stripNameLine(story())).toBe('Vomiting soon or hours after eating');
    expect(stripCountLine(story())).toBe('7 soon · 6 between · 7 long, of 20 timed');
  });
  it('time-of-day clustering names the local band', () => {
    expect(stripNameLine(timeofday())).toBe('Vomiting between 2am and 6am');
    expect(stripCountLine(timeofday())).toBe('6 of 9 timed between 2am and 6am');
  });
  it('correlation names the protein and the symptom, and pluralises honestly', () => {
    expect(stripNameLine(correlation())).toBe('Vomiting after chicken');
    expect(stripCountLine(correlation())).toBe('5 episodes across 4 matched days');
    expect(stripCountLine(correlation({ symptomEventCount: 1, matchedPairs: 1 }))).toBe('1 episode across 1 matched day');
  });
  it('a joint candidate names EVERY member (FS-11’s one wrap exception)', () => {
    const joint = correlation({ protein: 'chicken and duck', proteins: ['chicken', 'duck'], jointCandidate: true });
    expect(stripNameLine(joint)).toBe('Vomiting after chicken and duck');
  });
  it('reflection keeps the week pair — and drops the incomparable prior when density withheld it', () => {
    expect(stripNameLine(reflection())).toBe('Vomiting, week over week');
    expect(stripCountLine(reflection())).toBe('2 this week, 5 last week');
    const withheld = reflection({ density: { comparable: false, currentLoggingDays: 3, priorLoggingDays: 7 } });
    expect(stripCountLine(withheld)).toBe('2 this week');
  });
  it('trial response: day badge form + the time-ordered pooled pair', () => {
    expect(stripNameLine(trial())).toBe('Trial diet — day 31 of 42');
    expect(stripNameLine(trial({ targetDurationDays: null }))).toBe('Trial diet — day 31');
    expect(stripCountLine(trial())).toBe('4 during the trial, 12 before');
  });
  it('the safety types return null on this build (PR 2 adds the ask-bearing forms)', () => {
    for (const f of [chronicity, intake, redFlag] as SignalFinding[]) {
      expect(stripNameLine(f)).toBeNull();
      expect(stripCountLine(f)).toBeNull();
      expect(stripA11yLabel(f)).toBeNull();
    }
  });
  it('the a11y sentence joins name and count', () => {
    expect(stripA11yLabel(postprandial())).toBe('Vomiting soon after eating. 8 of 8 timed within 30 min of eating.');
  });
});

// ── FS-11 — one line at 375pt, nothing truncated ──────────────────────────────
// Each type at its realistic MAXIMUM: two-digit counts everywhere, the longest symptom
// word the type can carry (the timing lanes are vomit-scoped by the engine; reflection and
// correlation take any symptom, so `skin_reaction` is their worst case), the widest clock
// band words.
const WORST: Array<[string, SignalFinding]> = [
  ['postprandial', postprandial({ rapidCount: 12, eligibleCount: 14 })],
  ['empty stomach', emptyStomach({ longCount: 12, eligibleCount: 24 })],
  ['timing story', story({ bandCounts: { rapid: 12, mid: 10, long: 11 }, eligibleCount: 33 })],
  ['time of day, wrap-around band', timeofday({ clusterStartLocalHour: 23, clusterWindowHours: 4, clusterCount: 12, eligibleCount: 14 })],
  ['time of day, two-digit hours', timeofday({ clusterStartLocalHour: 10, clusterWindowHours: 4, clusterCount: 12, eligibleCount: 14 })],
  ['correlation, longest symptom + a long protein', correlation({ symptomType: 'skin_reaction', protein: 'sweet potato', symptomEventCount: 12, matchedPairs: 10 })],
  ['reflection, longest symptom', reflection({ symptomType: 'skin_reaction', currentCount: 12, priorCount: 10 })],
  ['trial, two-digit day + counts', trial({ trialDayNumber: 84, targetDurationDays: 84, pooledTrialCount: 12, pooledBaselineCount: 20 })],
];

describe('FS-11 — every strip line holds its cap at the type’s realistic maximum', () => {
  it.each(WORST)('%s', (_label, finding) => {
    const name = stripNameLine(finding) as string;
    const cnt = stripCountLine(finding) as string;
    expect(name.length).toBeLessThanOrEqual(STRIP_NAME_LINE_MAX);
    expect(cnt.length).toBeLessThanOrEqual(STRIP_COUNT_LINE_MAX);
    // No line break inside a line — each is its own Text node, one line by construction.
    expect(name).not.toMatch(/\n/);
    expect(cnt).not.toMatch(/\n/);
  });

  it('the caps sit under the 375pt single-line bound with margin (the arithmetic in the source)', () => {
    // ~282pt of text column; Geist Medium 13pt ≈ 7.2pt/char → 39; Geist 11pt ≈ 6.1pt/char → 46.
    expect(STRIP_NAME_LINE_MAX).toBeLessThanOrEqual(Math.floor(282 / 7.2));
    expect(STRIP_COUNT_LINE_MAX).toBeLessThanOrEqual(Math.floor(282 / 6.1));
  });
});

describe('every strip clause and every fold string is guardrail-clean', () => {
  it('strip lines: no banned vocabulary, no "!", no vetoed word', () => {
    for (const [, f] of WORST) {
      clean(stripNameLine(f) as string);
      clean(stripCountLine(f) as string);
      clean(stripA11yLabel(f) as string);
    }
  });
  it('the controls, caption and hints', () => {
    for (const s of [FOLD_CONTROL_LABEL, FOLD_CONTROL_HINT, FOLD_CAPTION, STRIP_A11Y_HINT]) clean(s);
    expect(FOLD_CONTROL_LABEL).toBe('Keep it compact');
    expect(FOLD_CAPTION).toBe('It comes back on its own when the picture changes.');
  });
  it('every Back-because line, verbatim and clean', () => {
    const expected: Record<BackBecauseReason, string> = {
      new_episode: 'Back because a new episode was logged.',
      new_week: "Back because a new week's counts are in.",
      tier_established: 'Back because this pattern is now established.',
      ask_changed: 'Back because the vet ask changed.',
      trial_counts: 'Back because the trial counts moved.',
      intake_day: 'Back because another day came in below the usual.',
      photo_record: 'Back because the photo record changed.',
      timing_changed: 'Back because the timing changed.',
    };
    for (const [reason, line] of Object.entries(expected) as Array<[BackBecauseReason, string]>) {
      expect(backBecauseCopy(reason)).toBe(line);
      clean(line);
    }
  });
});
