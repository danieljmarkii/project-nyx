// The Signal fold's strip copy (CUL-784 / CUL-785, fold spec §3.1 / §4 / FS-3 / FS-11) and
// the Back-because line (DF-8). Every clause is pinned verbatim per type, screened through
// the universal banned-vocabulary guard the med line uses, held under its FS-11 length cap
// at the type's realistic maximum (two-digit counts, the longest symptom word the type
// carries), and kept free of `!`, `%`, glyphs and every word on Dr. Chen's veto list.
//
// THE FS-3 BUILD GUARD lives here (the med-line precedent): every SAFETY finding type, in
// every variant it can take, must produce an ask line that is one of the ratified strings,
// and its spoken sentence must say it. The walk is over the whole InsightType table, so a
// safety type added without an ask fails the build rather than rendering a strip that
// dropped the vet.

import {
  STRIP_ASKS,
  STRIP_ASK_LINE_MAX,
  STRIP_COUNT_LINE_MAX,
  STRIP_NAME_LINE_MAX,
  FOLD_CAPTION,
  FOLD_CONTROL_HINT,
  FOLD_CONTROL_LABEL,
  STRIP_A11Y_HINT,
  backBecauseCopy,
  hasBannedSignalVocabulary,
  stripA11yLabel,
  stripAskLine,
  stripCountLine,
  stripDayLocal,
  stripDayUTC,
  stripNameLine,
} from './signalCopy';
import { MATERIAL_FIELDS, type BackBecauseReason } from './signalFold';
import type {
  CorrelationFinding,
  EmptyStomachTimingFinding,
  IncidentRedFlagFinding,
  InsightType,
  IntakeDeclineFinding,
  PostprandialTimingFinding,
  ReflectionFinding,
  SignalFinding,
  StoodDownMarker,
  SymptomChronicityFinding,
  SymptomWorseningFinding,
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
const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
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
  ...over,
});
const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 5,
  priorCount: 2,
  currentDays: 3,
  priorDays: 2,
  trigger: 'more_episodes',
  tier: 'standard',
  windowDays: 14,
  ...over,
});
const intake = (over: Partial<IntakeDeclineFinding> = {}): IntakeDeclineFinding => ({
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 1,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
  ...over,
});
const redFlag = (over: Partial<IncidentRedFlagFinding> = {}): IncidentRedFlagFinding => ({
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: '2026-09-01T08:00:00.000Z',
  flaggedIncidentCount: 2,
  windowDays: 14,
  ...over,
});
const stoodDown: StoodDownMarker = {
  type: 'stood_down',
  priorityClass: 'insight',
  symptomType: 'vomit',
  recencyDays: 14,
  tier: 'firm',
  lastEpisodeIso: '2026-08-19T11:00:00.000Z',
  stoodDownAt: '2026-09-03T12:00:00.000Z',
  formerRank: 0,
};

// B-514: the day boundary is LOCAL midnight, so a fixture for a local-day question is built
// from local components — this instant is Aug 26 at noon in whatever zone the test runs in
// (the CI matrix runs UTC+14 / +12:45 / −10), and the strip must print "Aug 26" in all of them.
const AUG_26_LOCAL_NOON = new Date(2026, 7, 26, 12, 0, 0).toISOString();
const LAST = { lastEpisodeIso: AUG_26_LOCAL_NOON };

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
  it('the a11y sentence joins name and count', () => {
    expect(stripA11yLabel(postprandial())).toBe('Vomiting soon after eating. 8 of 8 timed within 30 min of eating.');
  });
  it('a benign strip never carries an ask', () => {
    for (const f of [postprandial(), emptyStomach(), story(), timeofday(), correlation(), reflection(), trial()]) {
      expect(stripAskLine(f)).toBeNull();
    }
  });
  it('the stand-down marker has no strip at all (CUL-786: a line, not a card)', () => {
    expect(stripNameLine(stoodDown)).toBeNull();
    expect(stripCountLine(stoodDown)).toBeNull();
    expect(stripAskLine(stoodDown)).toBeNull();
    expect(stripA11yLabel(stoodDown)).toBeNull();
  });
});

// ── The safety strips (CUL-785, §4) — name, ask, compact count, the date ────────
describe('the safety strips — verbatim per type, the ask is the card’s own verb (DF-2)', () => {
  it('chronicity, firm: `Worth a vet visit`; standard: `Tell your vet` — the tier the card phrases on', () => {
    expect(stripNameLine(chronicity())).toBe('Recurring vomiting');
    expect(stripAskLine(chronicity({ tier: 'firm' }))).toBe('Worth a vet visit');
    expect(stripAskLine(chronicity({ tier: 'standard' }))).toBe('Tell your vet');
    expect(stripCountLine(chronicity(), LAST)).toBe('14 episodes, 5 of 8 weeks · last Aug 26');
    expect(stripCountLine(chronicity({ episodeCount: 1, activeWeeks: 1 }), LAST)).toBe('1 episode, 1 of 8 weeks · last Aug 26');
  });

  it('chronicity without a date from the record prints the count alone — never an invented day', () => {
    expect(stripCountLine(chronicity())).toBe('14 episodes, 5 of 8 weeks');
    expect(stripCountLine(chronicity(), { lastEpisodeIso: null })).toBe('14 episodes, 5 of 8 weeks');
    expect(stripCountLine(chronicity(), { lastEpisodeIso: 'garbage' })).toBe('14 episodes, 5 of 8 weeks');
  });

  it('worsening: the axis that rose, bare numbers; firm mirrors "booking a vet visit", the rest "a word with your vet"', () => {
    expect(stripNameLine(worsening())).toBe('Vomiting up this week');
    expect(stripCountLine(worsening(), LAST)).toBe('5 this week, 2 last week · last Aug 26');
    expect(stripCountLine(worsening({ trigger: 'more_days', currentDays: 5, priorDays: 3 }), LAST)).toBe(
      '5 days this week, 3 last week · last Aug 26',
    );
    expect(stripAskLine(worsening({ tier: 'firm' }))).toBe('Worth a vet visit');
    expect(stripAskLine(worsening({ tier: 'standard' }))).toBe('Tell your vet');
    expect(stripAskLine(worsening({ tier: 'soft' }))).toBe('Tell your vet');
  });

  it('a `New` worsening (zero prior) drops the "0 last week" pair, exactly as the face does (S10)', () => {
    expect(stripCountLine(worsening({ priorCount: 0, priorDays: 0, currentCount: 4 }), LAST)).toBe('4 this week · last Aug 26');
    expect(stripCountLine(worsening({ priorCount: 0, priorDays: 0, currentCount: 4 }))).not.toMatch(/0 last week/);
  });

  it('intake decline: both triggers carry `Check with your vet` — the verb the sentence carries on both', () => {
    expect(stripNameLine(intake())).toBe('Eating less than usual');
    expect(stripCountLine(intake({ daysBelowBaseline: 2, ratedMealsConsidered: 12 }))).toBe('2 days below the usual, 12 recent meals');
    expect(stripCountLine(intake())).toBe('1 day below the usual, 9 recent meals');
    expect(stripAskLine(intake())).toBe('Check with your vet');
    const refused = intake({ trigger: 'refused_normal_food', refusedFoodLabel: 'Royal Canin Renal', daysBelowBaseline: 0, ratedMealsConsidered: 7 });
    expect(stripNameLine(refused)).toBe('Refused the usual food');
    expect(stripCountLine(refused)).toBe('Compared with 7 recent meals');
    expect(stripCountLine(intake({ ...refused, ratedMealsConsidered: 0 }))).toBe('Compared with what you usually log');
    expect(stripAskLine(refused)).toBe('Check with your vet');
    // No food name on a strip (§4: no pet name, no free text) — the label lives on the card.
    expect(stripNameLine(refused)).not.toMatch(/Royal/);
    expect(stripCountLine(refused)).not.toMatch(/Royal/);
  });

  it('the red flag: what the photo showed, the family noun, an AI read of N, the photo record’s own UTC day', () => {
    expect(stripNameLine(redFlag())).toBe('Blood in a vomit photo');
    expect(stripNameLine(redFlag({ flags: ['foreign_material'], incidentType: 'stool' }))).toBe('Something unusual in a stool photo');
    // Blood leads when both are flagged — the engine's stable order and the more urgent read.
    expect(stripNameLine(redFlag({ flags: ['foreign_material', 'blood'] }))).toBe('Blood in a vomit photo');
    expect(stripAskLine(redFlag())).toBe('Call your vet');
    expect(stripCountLine(redFlag())).toBe('AI read of 2 logged photos · last Sep 1');
    expect(stripCountLine(redFlag({ flaggedIncidentCount: 1 }))).toBe('AI read of 1 logged photo · last Sep 1');
    // The strip's day is the SAME day the sentence and the phone script print (UTC), so the
    // three surfaces on one card agree — and it ignores the local-record context entirely.
    expect(stripCountLine(redFlag(), LAST)).toBe('AI read of 2 logged photos · last Sep 1');
    expect(stripCountLine(redFlag({ mostRecentFlaggedIso: '2026-08-31T23:30:00.000Z' }))).toBe('AI read of 2 logged photos · last Aug 31');
  });

  it('the spoken sentence says the ask and expands the month (§7)', () => {
    expect(stripA11yLabel(chronicity(), LAST)).toBe('Recurring vomiting. Worth a vet visit. 14 episodes, 5 of 8 weeks, last August 26.');
    expect(stripA11yLabel(worsening({ tier: 'standard' }), LAST)).toBe('Vomiting up this week. Tell your vet. 5 this week, 2 last week, last August 26.');
    expect(stripA11yLabel(intake())).toBe('Eating less than usual. Check with your vet. 1 day below the usual, 9 recent meals.');
    expect(stripA11yLabel(redFlag())).toBe('Blood in a vomit photo. Call your vet. AI read of 2 logged photos, last September 1.');
    expect(stripA11yLabel(chronicity())).toBe('Recurring vomiting. Worth a vet visit. 14 episodes, 5 of 8 weeks.');
  });
});

describe('the strip day (§3.4 / B-514) — the device-zone day for the record, the UTC day for the photo', () => {
  it('reads the local calendar day off local components, year-less', () => {
    expect(stripDayLocal(AUG_26_LOCAL_NOON)).toEqual({ short: 'Aug 26', spoken: 'August 26' });
    // Just after local midnight is still that local day, whatever the UTC string says.
    expect(stripDayLocal(new Date(2026, 8, 30, 0, 5).toISOString())).toEqual({ short: 'Sep 30', spoken: 'September 30' });
    expect(stripDayLocal(new Date(2026, 11, 31, 23, 55).toISOString())).toEqual({ short: 'Dec 31', spoken: 'December 31' });
  });
  it('reads the UTC day for the photo record, matching the phone script', () => {
    expect(stripDayUTC('2026-08-06T23:59:00.000Z')).toEqual({ short: 'Aug 6', spoken: 'August 6' });
    expect(stripDayUTC('2026-08-07T00:01:00.000Z')).toEqual({ short: 'Aug 7', spoken: 'August 7' });
  });
  it('an unparseable instant yields no day — the strip prints no date rather than a guess', () => {
    expect(stripDayLocal('not a date')).toBeNull();
    expect(stripDayUTC('')).toBeNull();
  });
  it('a date, never a counter: no "days since", "days ago", "clear" or "free" on any safety strip', () => {
    for (const f of [chronicity(), worsening(), intake(), redFlag()]) {
      const all = `${stripNameLine(f)} ${stripAskLine(f)} ${stripCountLine(f, LAST)} ${stripA11yLabel(f, LAST)}`;
      expect(all).not.toMatch(/days? (since|ago|clear|free)/i);
    }
  });
});

// ── FS-3 — a safety strip without its ask fails the build ──────────────────────
// Walked over EVERY InsightType (the fold's material table is exhaustive over the union), so
// a new safety type has to appear here with its ask before it can ship. The stand-down marker
// is the one non-card type and is asserted to have no strip at all.
const EVERY_TYPE: Record<InsightType, SignalFinding[]> = {
  symptom_chronicity: [chronicity({ tier: 'firm' }), chronicity({ tier: 'standard' }), chronicity({ symptomType: 'cough', coughVomitAdjacent: true })],
  symptom_worsening: [
    worsening({ tier: 'firm' }),
    worsening({ tier: 'standard' }),
    worsening({ tier: 'soft', trigger: 'more_days' }),
    worsening({ tier: 'firm', trigger: 'more_days' }),
    worsening({ priorCount: 0, priorDays: 0 }),
  ],
  intake_decline: [
    intake({ species: 'cat' }),
    intake({ species: 'dog', daysBelowBaseline: 2 }),
    intake({ trigger: 'refused_normal_food', refusedFoodLabel: 'Kibble', daysBelowBaseline: 0 }),
    intake({ trigger: 'refused_normal_food', refusedFoodLabel: null, daysBelowBaseline: 0, ratedMealsConsidered: 0 }),
  ],
  incident_red_flag: [
    redFlag(),
    redFlag({ flags: ['foreign_material'] }),
    redFlag({ flags: ['blood', 'foreign_material'], incidentType: 'stool' }),
    redFlag({ incidentType: 'stool', flaggedIncidentCount: 1 }),
  ],
  postprandial_timing: [postprandial()],
  timeofday_clustering: [timeofday()],
  empty_stomach_timing: [emptyStomach()],
  timing_story: [story()],
  food_symptom_correlation: [correlation()],
  reflection: [reflection()],
  trial_response: [trial()],
  stood_down: [stoodDown],
};

describe('FS-3 build guard — every safety strip says its ask, and only a ratified one', () => {
  const RATIFIED = new Set<string>(Object.values(STRIP_ASKS));

  it('the walk covers every InsightType the fold knows (a new type must be added here)', () => {
    expect(Object.keys(EVERY_TYPE).sort()).toEqual(Object.keys(MATERIAL_FIELDS).sort());
  });

  it.each(Object.entries(EVERY_TYPE))('%s', (type, variants) => {
    for (const f of variants) {
      if (type === 'stood_down') {
        expect(stripNameLine(f)).toBeNull();
        continue;
      }
      const name = stripNameLine(f);
      const ask = stripAskLine(f);
      const cnt = stripCountLine(f, LAST);
      const label = stripA11yLabel(f, LAST);
      expect(name).not.toBeNull();
      expect(cnt).not.toBeNull();
      expect(label).not.toBeNull();
      if (f.priorityClass === 'safety') {
        // The ask exists, is one of the signed strings, fits its line, and is SPOKEN.
        expect(ask).not.toBeNull();
        expect(RATIFIED.has(ask as string)).toBe(true);
        expect((ask as string).length).toBeLessThanOrEqual(STRIP_ASK_LINE_MAX);
        expect(label).toContain(`. ${ask}. `);
      } else {
        expect(ask).toBeNull();
        expect(label).not.toMatch(/vet/i);
      }
    }
  });

  it('the ratified set is exactly the four strings Dr. Chen signed, each under the ask cap', () => {
    expect(Object.values(STRIP_ASKS)).toEqual(['Worth a vet visit', 'Tell your vet', 'Check with your vet', 'Call your vet']);
    for (const a of Object.values(STRIP_ASKS)) {
      expect(a.length).toBeLessThanOrEqual(STRIP_ASK_LINE_MAX);
      expect(a).not.toMatch(/\n/);
      clean(a);
    }
  });

  it('a safety finding that somehow had no ask has no spoken label either — nothing to render', () => {
    // A future safety type reaching stripA11yLabel without a stripAskLine branch: the label is
    // withheld (the renderer then refuses the strip and the card stays open, FS-7).
    const foreign = { ...chronicity(), type: 'future_safety_lane' } as unknown as SignalFinding;
    expect(stripAskLine(foreign)).toBeNull();
    expect(stripA11yLabel(foreign)).toBeNull();
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
  // The safety strips (CUL-785): the spec's own worst cases — `Recurring skin irritation`,
  // `Check with your vet`, the longest count forms with the widest date (`Sep 30`).
  ['chronicity, longest symptom, two-digit counts, 8-week window', chronicity({ symptomType: 'skin_reaction', episodeCount: 99, activeWeeks: 8, tier: 'standard' })],
  // The days axis is bounded by the week (7 of 7), so its worst case is single-digit by construction.
  ['worsening, longest symptom, days axis, a full week', worsening({ symptomType: 'skin_reaction', trigger: 'more_days', currentDays: 7, priorDays: 6, tier: 'firm' })],
  ['worsening, episodes axis, two-digit pair', worsening({ symptomType: 'skin_reaction', currentCount: 24, priorCount: 10 })],
  ['intake, dog, two-digit meals', intake({ species: 'dog', daysBelowBaseline: 2, ratedMealsConsidered: 40 })],
  ['intake, refusal with no meals to compare', intake({ trigger: 'refused_normal_food', daysBelowBaseline: 0, ratedMealsConsidered: 0 })],
  ['red flag, foreign material in stool, two-digit photos, widest date', redFlag({ flags: ['foreign_material'], incidentType: 'stool', flaggedIncidentCount: 12, mostRecentFlaggedIso: '2026-09-30T12:00:00.000Z' })],
];
const WIDEST_DAY = { lastEpisodeIso: new Date(2026, 8, 30, 12).toISOString() };

describe('FS-11 — every strip line holds its cap at the type’s realistic maximum', () => {
  it.each(WORST)('%s', (_label, finding) => {
    const name = stripNameLine(finding) as string;
    const cnt = stripCountLine(finding, WIDEST_DAY) as string;
    const ask = stripAskLine(finding);
    expect(name.length).toBeLessThanOrEqual(STRIP_NAME_LINE_MAX);
    expect(cnt.length).toBeLessThanOrEqual(STRIP_COUNT_LINE_MAX);
    if (ask) expect(ask.length).toBeLessThanOrEqual(STRIP_ASK_LINE_MAX);
    // No line break inside a line — each is its own Text node, one line by construction.
    expect(name).not.toMatch(/\n/);
    expect(cnt).not.toMatch(/\n/);
    expect(ask ?? '').not.toMatch(/\n/);
  });

  it('the caps sit under the 375pt single-line bound with margin (the arithmetic in the source)', () => {
    // ~282pt of text column; Geist Medium 13pt ≈ 7.2pt/char → 39; Geist 11pt ≈ 6.1pt/char → 46;
    // the ask is Geist Regular 13pt ≈ 6.9pt/char → 40, and its cap is half that.
    expect(STRIP_NAME_LINE_MAX).toBeLessThanOrEqual(Math.floor(282 / 7.2));
    expect(STRIP_COUNT_LINE_MAX).toBeLessThanOrEqual(Math.floor(282 / 6.1));
    expect(STRIP_ASK_LINE_MAX).toBeLessThanOrEqual(Math.floor(282 / 6.9 / 2));
  });
});

describe('every strip clause and every fold string is guardrail-clean', () => {
  it('strip lines: no banned vocabulary, no "!", no vetoed word — every variant of every type', () => {
    for (const [, f] of WORST) {
      clean(stripNameLine(f) as string);
      clean(stripCountLine(f, WIDEST_DAY) as string);
      clean(stripA11yLabel(f, WIDEST_DAY) as string);
    }
    for (const variants of Object.values(EVERY_TYPE)) {
      for (const f of variants) {
        if (f.type === 'stood_down') continue;
        clean(stripNameLine(f) as string);
        clean(stripCountLine(f, LAST) as string);
        clean(stripA11yLabel(f, LAST) as string);
        const ask = stripAskLine(f);
        if (ask) clean(ask);
      }
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
