import {
  deriveDisplayState,
  buildingIntro,
  noPatternIntro,
  staleIntro,
  confidenceTag,
  sampleLine,
  evidenceText,
  coverageCopy,
} from './signalCopy';
import type {
  CachedFinding,
  CorrelationFinding,
  IntakeDeclineFinding,
  ReflectionFinding,
  SymptomWorseningFinding,
  PostprandialTimingFinding,
  TimeOfDayClusteringFinding,
  RateMealsDiagnostic,
  StapleWashoutDiagnostic,
} from './signal';

const correlation = (over: Partial<CorrelationFinding> = {}): CorrelationFinding => ({
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
  matchedPairs: 4,
  symptomEventCount: 4,
  correlationWindowHours: 12,
  ...over,
});

const intakeDecline = (over: Partial<IntakeDeclineFinding> = {}): IntakeDeclineFinding => ({
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 2,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
  ...over,
});

const reflection = (over: Partial<ReflectionFinding> = {}): ReflectionFinding => ({
  type: 'reflection',
  priorityClass: 'insight',
  symptomType: 'vomit',
  currentCount: 4,
  priorCount: 4,
  direction: 'flat',
  windowDays: 7,
  ...over,
});

const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 4,
  priorCount: 2,
  currentDays: 2,
  priorDays: 2,
  trigger: 'more_episodes',
  tier: 'standard',
  windowDays: 7,
  ...over,
});

const postprandial = (over: Partial<PostprandialTimingFinding> = {}): PostprandialTimingFinding => ({
  type: 'postprandial_timing',
  priorityClass: 'insight',
  symptomType: 'vomit',
  rapidCount: 4,
  eligibleCount: 12,
  totalEpisodes: 14,
  rapidWindowMinutes: 30,
  lastTwoEligibleRapid: true,
  medianMinutesSinceFeeding: 18,
  feedingFormsInEvidence: ['dry treat'],
  windowDays: 60,
  ...over,
});

const timeofday = (over: Partial<TimeOfDayClusteringFinding> = {}): TimeOfDayClusteringFinding => ({
  type: 'timeofday_clustering',
  priorityClass: 'insight',
  symptomType: 'vomit',
  clusterStartLocalHour: 4,
  clusterWindowHours: 4,
  clusterCount: 5,
  eligibleCount: 8,
  totalEpisodes: 8,
  timezone: 'America/New_York',
  windowDays: 60,
  ...over,
});

const cached = (
  finding:
    | CorrelationFinding
    | IntakeDeclineFinding
    | ReflectionFinding
    | SymptomWorseningFinding
    | PostprandialTimingFinding
    | TimeOfDayClusteringFinding,
  rank = 0,
): CachedFinding => ({
  rank,
  text: 'placeholder sentence',
  finding,
});

// The clinical guardrail (clinical-guardrails Patterns 6/8): client-composed copy
// on a safety finding must never reassure, never call the pet "picky", never shout.
const REASSURANCE_RE = /\b(fine|okay|ok|healthy|all clear|nothing to worry|probably fine|no concern|don't worry|doing great|all good)\b/i;
const DISMISSIVE_RE = /\b(picky|fussy|finicky)\b/i;
// Correlation copy is associational only — no causal verbs.
const CAUSAL_RE = /\b(cause[sd]?|causing|because|due to|trigger(?:s|ed|ing)?|responsible for|allerg(?:y|ic)|intoleran(?:t|ce)|reacts? to|leads? to|results? in)\b/i;

describe('deriveDisplayState', () => {
  it('is live when any finding is present', () => {
    expect(deriveDisplayState([cached(correlation())], false, false)).toBe('live');
  });
  it('is building with no findings, recent activity, but little history', () => {
    expect(deriveDisplayState([], true, false)).toBe('building');
  });
  it('is no_pattern with no findings, recent activity, and substantial history (B-051)', () => {
    expect(deriveDisplayState([], true, true)).toBe('no_pattern');
  });
  it('is stale with no findings and no recent activity (regardless of history)', () => {
    expect(deriveDisplayState([], false, false)).toBe('stale');
    expect(deriveDisplayState([], false, true)).toBe('stale');
  });
});

describe('empty-state intros', () => {
  it('thread the pet name and never reassure or shout', () => {
    for (const s of [buildingIntro('Pixel'), noPatternIntro('Pixel'), staleIntro('Pixel')]) {
      expect(s).toContain('Pixel');
      expect(s.includes('!')).toBe(false);
      expect(REASSURANCE_RE.test(s)).toBe(false);
    }
  });
  it('no_pattern is about the data and forward-looking, not a wellness claim', () => {
    const s = noPatternIntro('Pixel');
    expect(s.toLowerCase()).toContain('no clear patterns');
    expect(s.toLowerCase()).toContain('yet');
  });
});

describe('confidenceTag', () => {
  it('tags an early correlation as provisional', () => {
    expect(confidenceTag(correlation({ tier: 'early' }))).toBe('Early pattern');
  });
  it('drops the qualifier on an established correlation', () => {
    expect(confidenceTag(correlation({ tier: 'established' }))).toBeNull();
  });
  it('gives a safety flag no confidence tag', () => {
    expect(confidenceTag(intakeDecline())).toBeNull();
  });
  it('gives a reflection no confidence tag (a count carries no tier)', () => {
    expect(confidenceTag(reflection())).toBeNull();
  });
});

describe('sampleLine', () => {
  it('shows episode + matched-day counts for a correlation, no causal language', () => {
    const s = sampleLine(correlation({ symptomEventCount: 5, matchedPairs: 6 }));
    expect(s).toContain('5 episodes');
    expect(s).toContain('6 matched days');
    expect(CAUSAL_RE.test(s)).toBe(false);
  });
  it('singularizes counts of one', () => {
    expect(sampleLine(correlation({ symptomEventCount: 1, matchedPairs: 1 }))).toBe(
      '1 episode across 1 matched day of logs',
    );
  });
  it('describes a consecutive-low decline by days', () => {
    expect(sampleLine(intakeDecline({ daysBelowBaseline: 2, ratedMealsConsidered: 9 }))).toContain(
      '2 days below the usual',
    );
  });
  it('handles a refusal with no rated-meal history gracefully', () => {
    expect(
      sampleLine(intakeDecline({ trigger: 'refused_normal_food', ratedMealsConsidered: 0 })),
    ).toBe('Compared with what you usually log');
  });
  it('shows a week-over-week count for a reflection, no causal/reassurance language', () => {
    const s = sampleLine(reflection({ currentCount: 4, priorCount: 5 }));
    expect(s).toBe('4 episodes this week, 5 last week');
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
});

describe('evidenceText — correlation', () => {
  it('is associational (never causal), names the food + window + pet, points to the vet', () => {
    const s = evidenceText(correlation({ protein: 'chicken', correlationWindowHours: 12 }), 'Pixel');
    expect(s).toContain('Pixel');
    expect(s).toContain('chicken');
    expect(s).toContain('12 hours');
    expect(s).toContain('vet');
    expect(s.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(s)).toBe(false);
  });
});

describe('evidenceText — intake-decline safety flag', () => {
  it('never reassures, never says picky, points to the vet (consecutive low)', () => {
    const s = evidenceText(intakeDecline({ trigger: 'consecutive_low' }), 'Pixel');
    expect(REASSURANCE_RE.test(s)).toBe(false);
    expect(DISMISSIVE_RE.test(s)).toBe(false);
    expect(s).toContain('vet');
    expect(s.includes('!')).toBe(false);
  });
  it('names the refused food and stays guardrail-clean (refusal)', () => {
    const s = evidenceText(
      intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: 'Tiki Cat salmon' }),
      'Pixel',
    );
    expect(s).toContain('Tiki Cat salmon');
    expect(REASSURANCE_RE.test(s)).toBe(false);
    expect(DISMISSIVE_RE.test(s)).toBe(false);
  });
});

describe('coverageCopy (B-053)', () => {
  const rateMeals = (over: Partial<RateMealsDiagnostic> = {}): RateMealsDiagnostic => ({
    type: 'rate_meals',
    actionability: 'action',
    ratedMeals: 1,
    ratedMealsNeeded: 4,
    ...over,
  });
  const stapleWashout = (over: Partial<StapleWashoutDiagnostic> = {}): StapleWashoutDiagnostic => ({
    type: 'staple_washout',
    actionability: 'explanation',
    protein: 'chicken',
    symptomEpisodes: 3,
    ...over,
  });

  it('rate_meals: names the pet, carries a calm action, never reassures or shouts', () => {
    const { why, action } = coverageCopy(rateMeals(), 'Nyx');
    expect(why).toContain('Nyx');
    expect(why.includes('!')).toBe(false);
    expect(REASSURANCE_RE.test(why)).toBe(false);
    expect(action).not.toBeNull();
    expect(action).toContain('Nyx');
    expect(action!.toLowerCase()).toContain('rat'); // "rating"/"rate"
    expect(action!.includes('!')).toBe(false);
    expect(REASSURANCE_RE.test(action!)).toBe(false);
  });

  it('staple_washout: EXPLANATION ONLY — no action, associational, never causal/reassuring', () => {
    const { why, action } = coverageCopy(stapleWashout({ protein: 'chicken' }), 'Nyx');
    expect(action).toBeNull(); // never a "vary the diet" ask
    expect(why).toContain('Nyx');
    expect(why).toContain('chicken');
    expect(why.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(why)).toBe(false); // associational, not causal
    expect(REASSURANCE_RE.test(why)).toBe(false); // coverage, never wellness
  });

  it('never reads as an all-clear for either diagnostic (§9 — coverage, not wellness)', () => {
    for (const d of [rateMeals(), stapleWashout()]) {
      const { why, action } = coverageCopy(d, 'Pixel');
      for (const s of [why, action].filter((x): x is string => x !== null)) {
        expect(REASSURANCE_RE.test(s)).toBe(false);
        expect(DISMISSIVE_RE.test(s)).toBe(false);
        expect(s.includes('!')).toBe(false);
      }
    }
  });
});

describe('evidenceText — reflection (B-051)', () => {
  it('flat: names the count + pet, never causal, never an all-clear', () => {
    const s = evidenceText(reflection({ direction: 'flat', currentCount: 4, priorCount: 4 }), 'Nyx');
    expect(s).toContain('Nyx');
    expect(s).toContain('4 episodes');
    expect(s).toContain('vomiting');
    expect(s.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
  it('improving: reads "down from N" but is still not a wellness verdict', () => {
    const s = evidenceText(reflection({ direction: 'improving', currentCount: 2, priorCount: 6 }), 'Nyx');
    expect(s).toContain('down from 6 episodes');
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
});

describe('sampleLine — symptom-worsening (④)', () => {
  it('shows the week-over-week EPISODE count for the more_episodes arm', () => {
    const s = sampleLine(worsening({ trigger: 'more_episodes', currentCount: 4, priorCount: 2 }));
    expect(s).toContain('4 episodes');
    expect(s).toContain('2 last week');
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
  it('shows the week-over-week DAY count for the more_days arm', () => {
    const s = sampleLine(worsening({ trigger: 'more_days', currentDays: 3, priorDays: 1 }));
    expect(s).toContain('3 days');
    expect(s).toContain('1 last week');
  });
});

describe('evidenceText — symptom-worsening (④)', () => {
  it('standard: names the rise, points to the vet, never causal, never reassures', () => {
    const s = evidenceText(worsening({ tier: 'standard', currentCount: 4, priorCount: 2 }), 'Nyx');
    expect(s).toContain('Nyx');
    expect(s).toContain('4 episodes');
    expect(s).toMatch(/word with your vet/i);
    expect(s.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
  it('standard with prior 0 reads "after none the week before", not reassurance', () => {
    const s = evidenceText(worsening({ tier: 'standard', currentCount: 3, priorCount: 0 }), 'Nyx');
    expect(s).toMatch(/after none the week before/i);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
  it('firm: leads with day density and the firmest calm ask', () => {
    const s = evidenceText(
      worsening({ tier: 'firm', currentCount: 6, priorCount: 2, currentDays: 5 }),
      'Nyx',
    );
    expect(s).toMatch(/5 days/i);
    expect(s).toMatch(/vet visit soon/i);
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
  it('firm via more_days on a falling count compares on DAYS, never "up from N episodes"', () => {
    const s = evidenceText(
      worsening({ tier: 'firm', trigger: 'more_days', currentCount: 4, priorCount: 6, currentDays: 4, priorDays: 2 }),
      'Nyx',
    );
    expect(s).toMatch(/on 4 days this week/i);
    expect(s).toMatch(/up from 2 days the week before/i);
    expect(/up from 6/.test(s)).toBe(false); // the episode count fell — never imply a rise
    expect(s).toMatch(/vet visit soon/i);
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
  it('soft (more_days): talks in days, gentlest ask', () => {
    const s = evidenceText(
      worsening({ tier: 'soft', trigger: 'more_days', currentDays: 3, priorDays: 1 }),
      'Nyx',
    );
    expect(s).toMatch(/3 days/i);
    expect(s).toMatch(/keeping an eye on/i);
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
  it('every tier/arm is guardrail-clean (never reassures/dismissive/causal, no "!")', () => {
    for (const tier of ['firm', 'standard', 'soft'] as const) {
      for (const trigger of ['more_episodes', 'more_days'] as const) {
        for (const priorCount of [0, 2]) {
          const s = evidenceText(
            worsening({ tier, trigger, currentCount: 5, priorCount, currentDays: 5, priorDays: 2 }),
            'Nyx',
          );
          expect(REASSURANCE_RE.test(s)).toBe(false);
          expect(DISMISSIVE_RE.test(s)).toBe(false);
          expect(CAUSAL_RE.test(s)).toBe(false);
          expect(s.includes('!')).toBe(false);
        }
      }
    }
  });
  it('carries no confidence tag (safety weight is shown by the rail + lead, not a tag)', () => {
    expect(confidenceTag(worsening())).toBe(null);
  });
});

// The ⑤ owner surface must read as TIMING anamnesis — never a food/cause/mechanism.
const MECHANISM_RE = /\b(regurgitat|reflux|esophag|eating speed|eats? too fast|wolf|gulp|bilious)\b/i;
const FOOD_RE = /\b(chicken|beef|turkey|lamb|duck|salmon|tuna|kibble|treats?|protein)\b/i;

describe('postprandial timing (⑤, B-078) — client copy', () => {
  it('sampleLine cites rapid over the TIMED denominator, never the raw total', () => {
    const s = sampleLine(postprandial({ rapidCount: 4, eligibleCount: 12, rapidWindowMinutes: 30 }));
    expect(s).toContain('4 of 12 timed episodes');
    expect(s).toContain('within 30 min of eating');
  });

  it('carries no confidence tag (a deterministic count shows its sample size, §2)', () => {
    expect(confidenceTag(postprandial())).toBeNull();
  });

  it('evidenceText shows the actual median timing + the honest denominator, points to the vet', () => {
    const s = evidenceText(
      postprandial({ totalEpisodes: 14, eligibleCount: 12, rapidCount: 4, medianMinutesSinceFeeding: 18 }),
      'Nyx',
    );
    expect(s).toContain('14 episodes');
    expect(s).toContain('12 could be timed');
    expect(s).toContain('about 18 minutes');
    expect(s).toMatch(/vet/i);
  });

  it('owner copy names timing only — never a food, cause, or mechanism (§9.1/§9.2)', () => {
    const s = evidenceText(postprandial({ feedingFormsInEvidence: ['dry treat', 'chicken kibble'] }), 'Nyx');
    expect(MECHANISM_RE.test(s)).toBe(false);
    expect(FOOD_RE.test(s)).toBe(false);
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(s.includes('!')).toBe(false);
    // The sample line is equally clean.
    const sl = sampleLine(postprandial());
    expect(MECHANISM_RE.test(sl)).toBe(false);
    expect(FOOD_RE.test(sl)).toBe(false);
  });

  it('ranks as a cap-subject insight, never on the safety rail', () => {
    expect(postprandial().priorityClass).toBe('insight');
  });
});

describe('time-of-day clustering (⑥, B-079) — client copy', () => {
  it('sampleLine cites the cluster over the TIMED denominator + the local band', () => {
    const s = sampleLine(timeofday({ clusterCount: 5, eligibleCount: 8, clusterStartLocalHour: 4 }));
    expect(s).toContain('5 of 8 timed episodes');
    expect(s).toContain('between 4am and 8am');
  });

  it('sampleLine renders a wrap-around band naturally', () => {
    const s = sampleLine(timeofday({ clusterStartLocalHour: 23 }));
    expect(s).toContain('between 11pm and 3am');
  });

  it('carries no confidence tag (a deterministic count shows its sample size, §2)', () => {
    expect(confidenceTag(timeofday())).toBeNull();
  });

  it('evidenceText shows the honest denominator + the clock band, points to the vet', () => {
    const s = evidenceText(
      timeofday({ totalEpisodes: 10, eligibleCount: 8, clusterCount: 5, clusterStartLocalHour: 4 }),
      'Nyx',
    );
    expect(s).toContain('10 episodes');
    expect(s).toContain('8 had a clear enough time');
    expect(s).toContain('between 4am and 8am');
    expect(s).toMatch(/vet/i);
  });

  it('owner copy names a clock band only — never a cause or mechanism (§4.5)', () => {
    const s = evidenceText(timeofday(), 'Nyx');
    expect(MECHANISM_RE.test(s)).toBe(false);
    expect(CAUSAL_RE.test(s)).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
    expect(s.includes('!')).toBe(false);
    const sl = sampleLine(timeofday());
    expect(MECHANISM_RE.test(sl)).toBe(false);
    expect(CAUSAL_RE.test(sl)).toBe(false);
  });

  it('ranks as a cap-subject insight, never on the safety rail', () => {
    expect(timeofday().priorityClass).toBe('insight');
  });
});
