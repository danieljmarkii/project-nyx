import {
  deriveDisplayState,
  buildingIntro,
  noPatternIntro,
  staleIntro,
  confidenceTag,
  sampleLine,
  evidenceText,
  coverageCopy,
  selectCrossPetSafetyFinding,
  bannerCopy,
  validateBannerPhrasing,
  signalFindingsSignature,
  hasUnseenFinding,
  type BannerSafetyFinding,
} from './signalCopy';
import type {
  CachedFinding,
  CorrelationFinding,
  IntakeDeclineFinding,
  ReflectionFinding,
  SymptomWorseningFinding,
  SymptomChronicityFinding,
  PostprandialTimingFinding,
  TimeOfDayClusteringFinding,
  RateMealsDiagnostic,
  StapleWashoutDiagnostic,
  MealTypeCollapseDiagnostic,
  DietChurnDiagnostic,
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

const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 20,
  spanDays: 42,
  activeWeeks: 6,
  symptomDays: 18,
  daysSinceLastEpisode: 0,
  firstOnsetIso: '2026-05-15T08:00:00.000Z',
  tier: 'firm',
  windowDays: 56,
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
    | SymptomChronicityFinding
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
// Kept IDENTICAL to the server's screen in phrasing.ts (REASSURANCE_RE/DISMISSIVE_RE/
// CAUSAL_RE) so client-template copy is held to the same bar the model-phrased paths
// are, and a future copy edit can't drift past the weaker subset (adversarial review).
const REASSURANCE_RE =
  /\b(fine|okay|ok|healthy|all clear|nothing to worry|nothing serious|probably fine|no concern|don't worry|doing great|doing well|all good|on the mend|mend|mending|thriving|recover(?:s|ed|ing)?|much better|back to normal|right track)\b/i;
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

describe('signalFindingsSignature + hasUnseenFinding (B-284 §3 pulse contract)', () => {
  it('is order-independent by rank — the same ranked set signs identically regardless of array order', () => {
    const a = [cached(correlation(), 0), cached(intakeDecline(), 1)];
    const b = [cached(intakeDecline(), 1), cached(correlation(), 0)];
    expect(signalFindingsSignature(a)).toBe(signalFindingsSignature(b));
  });

  it('changes when a finding appears, resolves, or reorders by rank', () => {
    const base = signalFindingsSignature([cached(correlation(), 0)]);
    const withNew = signalFindingsSignature([cached(correlation(), 0), cached(intakeDecline(), 1)]);
    const reordered = signalFindingsSignature([cached(intakeDecline(), 0), cached(correlation(), 1)]);
    expect(withNew).not.toBe(base);
    expect(reordered).not.toBe(base);
    expect(reordered).not.toBe(withNew);
  });

  it('never pulses when nothing has landed (building/no_pattern/stale)', () => {
    expect(hasUnseenFinding('building', [], undefined)).toBe(false);
    expect(hasUnseenFinding('no_pattern', [], undefined)).toBe(false);
    expect(hasUnseenFinding('stale', [], undefined)).toBe(false);
  });

  it('is unseen on first arrival (no seenSignature recorded yet)', () => {
    const findings = [cached(correlation())];
    expect(hasUnseenFinding('live', findings, undefined)).toBe(true);
  });

  it('flips to seen once the current signature matches what was recorded', () => {
    const findings = [cached(correlation())];
    const sig = signalFindingsSignature(findings);
    expect(hasUnseenFinding('live', findings, sig)).toBe(false);
  });

  it('re-arms on a genuinely new finding set even if a prior one was seen', () => {
    const seenSig = signalFindingsSignature([cached(correlation(), 0)]);
    const nowFindings = [cached(correlation(), 0), cached(intakeDecline(), 1)];
    expect(hasUnseenFinding('live', nowFindings, seenSig)).toBe(true);
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
    stapleSource: 'meals',
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

  // B-070: the copy register must match where the staple actually shows up. The headline
  // danger is a FALSE "every meal" claim on a treat-borne staple — it can misdirect an
  // elimination-diet talk (the owner switches the meal protein while the chicken keeps
  // arriving as treats). All three registers stay explanation-only and never causal/reassuring.
  it('staple_washout (B-070): meal-borne staple may say "in most meals"', () => {
    const { why } = coverageCopy(stapleWashout({ protein: 'chicken', stapleSource: 'meals' }), 'Nyx');
    expect(why).toContain('in most meals');
  });

  it('staple_washout (B-070): a TREAT-borne staple never claims "every/most meals" — names the treats', () => {
    const { why, action } = coverageCopy(stapleWashout({ protein: 'chicken', stapleSource: 'treats' }), 'Nyx');
    expect(why).toContain('chicken');
    expect(why.toLowerCase()).toContain('treats'); // the honest texture
    // The crux of B-070: the treat-borne register must NOT assert the chicken is in her meals.
    expect(why).not.toContain('in most meals');
    expect(why).not.toContain('every meal');
    expect(action).toBeNull(); // "cut the treats" would be a diet-varying ask — never
    expect(CAUSAL_RE.test(why)).toBe(false);
    expect(REASSURANCE_RE.test(why)).toBe(false);
  });

  it('staple_washout (B-070): a mixed-source staple uses the neutral day-based register', () => {
    const { why } = coverageCopy(stapleWashout({ protein: 'chicken', stapleSource: 'mixed' }), 'Nyx');
    expect(why).toContain('most days');
    expect(why).not.toContain('in most meals');
    expect(why).not.toContain('every meal');
  });

  it('staple_washout (B-070): a pre-B-070 cached row (no stapleSource) falls to the safe register', () => {
    // A staple_washout cached before B-070 shipped has no stapleSource (client field is
    // optional; 24h TTL bounds the window). It must default to the safe day-based register,
    // NEVER the false "every meal" claim — the worst thing to surface on stale data.
    const { why } = coverageCopy(stapleWashout({ protein: 'chicken', stapleSource: undefined }), 'Nyx');
    expect(why).toContain('most days');
    expect(why).not.toContain('in most meals');
    expect(why).not.toContain('every meal');
    expect(REASSURANCE_RE.test(why)).toBe(false);
  });

  it('never reads as an all-clear for either diagnostic (§9 — coverage, not wellness)', () => {
    for (const d of [
      rateMeals(),
      stapleWashout({ stapleSource: 'meals' }),
      stapleWashout({ stapleSource: 'treats' }),
      stapleWashout({ stapleSource: 'mixed' }),
    ]) {
      const { why, action } = coverageCopy(d, 'Pixel');
      for (const s of [why, action].filter((x): x is string => x !== null)) {
        expect(REASSURANCE_RE.test(s)).toBe(false);
        expect(DISMISSIVE_RE.test(s)).toBe(false);
        expect(s.includes('!')).toBe(false);
      }
    }
  });

  // ── B-080 diet-structure observations (coverage lane per §9.3) ──────────────
  const collapse = (
    over: Partial<MealTypeCollapseDiagnostic> = {},
  ): MealTypeCollapseDiagnostic => ({
    type: 'meal_type_collapse',
    actionability: 'explanation',
    gapDays: 6,
    loggedDays: 8,
    treatsPerDayMedian: 2,
    windowDays: 10,
    ...over,
  });
  const churn = (over: Partial<DietChurnDiagnostic> = {}): DietChurnDiagnostic => ({
    type: 'diet_churn',
    actionability: 'explanation',
    novelFoodCount: 3,
    symptomEpisodesInWindow: 2,
    windowDays: 14,
    ...over,
  });

  it('meal_type_collapse: names the pet + the specific count, never causal/reassuring/shouting', () => {
    const { why, action } = coverageCopy(collapse({ gapDays: 6, windowDays: 10 }), 'Nyx');
    expect(why).toContain('Nyx');
    expect(why).toContain('6 of the last 10 days');
    expect(why.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(why)).toBe(false);
    expect(REASSURANCE_RE.test(why)).toBe(false);
    expect(action).not.toBeNull();
    expect(action!.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(action!)).toBe(false);
    expect(REASSURANCE_RE.test(action!)).toBe(false);
  });

  it('meal_type_collapse: carries the NON-NEGOTIABLE log-only acknowledgement (§5.1)', () => {
    // The engine sees only the log; the copy must hedge that it cannot know what was
    // actually eaten ("if that's the full picture" / "if {pet} ate more than you logged").
    const { action } = coverageCopy(collapse(), 'Nyx');
    expect(action).not.toBeNull();
    expect(action!.toLowerCase()).toContain('full picture');
    expect(action!.toLowerCase()).toContain('more than you logged');
    expect(action!.toLowerCase()).toContain('vet');
  });

  it('diet_churn: names the new-food count, warm + non-judgmental, never causal/reassuring', () => {
    const { why, action } = coverageCopy(churn({ novelFoodCount: 3 }), 'Nyx');
    expect(why).toContain('Nyx');
    expect(why).toContain('3 new foods');
    expect(why.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(why)).toBe(false);
    expect(REASSURANCE_RE.test(why)).toBe(false);
    expect(action).not.toBeNull();
    expect(action!.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(action!)).toBe(false);
    expect(REASSURANCE_RE.test(action!)).toBe(false);
  });

  it('diet_churn: pluralizes a single new food correctly', () => {
    const { why } = coverageCopy(churn({ novelFoodCount: 1 }), 'Nyx');
    expect(why).toContain('1 new food ');
    expect(why).not.toContain('1 new foods');
  });

  it('diet_churn: the window in the copy is driven by windowDays, never hardcoded', () => {
    expect(coverageCopy(churn({ windowDays: 14 }), 'Nyx').why).toContain('the last 14 days');
    // If churnWindowDays is ever tuned, the copy must follow it (regression for the
    // hardcoded "two weeks" the code review caught).
    expect(coverageCopy(churn({ windowDays: 21 }), 'Nyx').why).toContain('the last 21 days');
  });

  it('never reads as an all-clear for the diet-structure diagnostics either (§9)', () => {
    for (const d of [collapse(), churn()]) {
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

// The ⑤/⑥ owner surface must read as TIMING anamnesis — never a food/cause/mechanism.
// Includes "empty stomach" for ⑥ parity with the server-side phrasing guardrail (§4.5).
const MECHANISM_RE =
  /\b(regurgitat|reflux|esophag|eating speed|eats? too fast|wolf|gulp|bilious|empty.?stomach)\b/i;
const FOOD_RE = /\b(chicken|beef|turkey|lamb|duck|salmon|tuna|kibble|treats?|protein)\b/i;

describe('symptom-chronicity (⑦, B-182) — client copy', () => {
  it('sampleLine cites episodes over the honest active-weeks-over-lookback denominator', () => {
    const s = sampleLine(chronicity({ episodeCount: 20, activeWeeks: 6, windowDays: 56 }));
    expect(s).toContain('20 episodes');
    // Same denominator wording as the evidence + server template ("of the last N weeks").
    expect(s).toContain('across 6 of the last 8 weeks');
  });

  it('evidenceText names the onset month, duration, recurrence + ongoing recency, points to the vet (firm)', () => {
    const s = evidenceText(
      chronicity({
        tier: 'firm',
        episodeCount: 20,
        activeWeeks: 6,
        windowDays: 56,
        daysSinceLastEpisode: 0,
        firstOnsetIso: '2026-05-15T08:00:00.000Z',
      }),
      'Nyx',
    );
    expect(s).toContain('Nyx');
    expect(s).toMatch(/since May/i); // the onset anchor the main card sentence also carries
    expect(s).toContain('20 episodes');
    expect(s).toContain('6 of the last 8 weeks');
    expect(s).toMatch(/most recent today/i);
    expect(s).toMatch(/keeps recurring over weeks/i);
    expect(s).toMatch(/booking a vet visit/i);
    expect(s).toMatch(/not a diagnosis/i);
  });

  it('evidenceText uses the gentler ask for the standard tier', () => {
    const s = evidenceText(chronicity({ tier: 'standard', activeWeeks: 3, episodeCount: 6 }), 'Nyx');
    expect(s).toMatch(/word with your vet/i);
    expect(/booking a vet visit/i.test(s)).toBe(false);
  });

  it('recency reads "yesterday" and "N days ago", reinforcing ongoing (never "resolved")', () => {
    expect(evidenceText(chronicity({ daysSinceLastEpisode: 1 }), 'Nyx')).toMatch(/most recent yesterday/i);
    expect(evidenceText(chronicity({ daysSinceLastEpisode: 9 }), 'Nyx')).toMatch(/most recent 9 days ago/i);
  });

  it('carries no confidence tag (a deterministic safety count shows its own weight)', () => {
    expect(confidenceTag(chronicity())).toBeNull();
  });

  it('every tier/symptom/recency is guardrail-clean (never reassures/dismissive/causal/mechanism/food, no "!")', () => {
    for (const tier of ['firm', 'standard'] as const) {
      for (const symptomType of ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction'] as const) {
        for (const daysSinceLastEpisode of [0, 1, 7]) {
          const f = chronicity({ tier, symptomType, daysSinceLastEpisode, episodeCount: 8, activeWeeks: 4 });
          for (const s of [evidenceText(f, 'Nyx'), sampleLine(f)]) {
            expect(REASSURANCE_RE.test(s)).toBe(false);
            expect(DISMISSIVE_RE.test(s)).toBe(false);
            expect(CAUSAL_RE.test(s)).toBe(false);
            expect(MECHANISM_RE.test(s)).toBe(false);
            expect(FOOD_RE.test(s)).toBe(false);
            expect(s.includes('!')).toBe(false);
          }
        }
      }
    }
  });

  it('rides the SAFETY rail (priorityClass), leading the surface', () => {
    expect(chronicity().priorityClass).toBe('safety');
  });
});

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

// ── Cross-pet safety banner (multi-pet §4, mock A3) ───────────────────────────
// This is a clinical escalation surface — the selection/ranking is adversarial-
// review-mandatory (§4). These assertions encode the contract the reviewer attacks.

// Banner-specific alarm vocabulary (mirror of BANNER_ALARM_RE in signalCopy.ts).
const ALARM_RE =
  /\b(emergency|urgent(?:ly)?|immediately|right away|danger(?:ous)?|critical|severe|asap|rush|alarm(?:ing)?)\b/i;

type AnyFinding = Parameters<typeof cached>[0];
const candidate = (id: string, findings: AnyFinding[]) => ({
  pet: { id, name: id },
  findings: findings.map((f, i) => cached(f, i)),
});

// Every banner copy variant, for the guardrail sweep.
const ALL_BANNER_FINDINGS: BannerSafetyFinding[] = [
  intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: 'salmon pâté' }),
  intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: null }),
  intakeDecline({ trigger: 'consecutive_low', daysBelowBaseline: 1 }),
  intakeDecline({ trigger: 'consecutive_low', daysBelowBaseline: 4 }),
  ...(['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction'] as const).flatMap(
    (symptomType) => [
      worsening({ trigger: 'more_episodes', symptomType }),
      worsening({ trigger: 'more_days', symptomType }),
    ],
  ),
];

describe('selectCrossPetSafetyFinding', () => {
  it('returns null with no candidates', () => {
    expect(selectCrossPetSafetyFinding([])).toBeNull();
  });

  it('returns null when no candidate has a safety finding — non-safety classes never cross over (§4)', () => {
    // The whole point: reflections, correlations and descriptive timing lanes must
    // NOT raise a cross-pet banner, even when they are a pet's only findings.
    const onlyInsights = candidate('A', [
      correlation(),
      reflection(),
      postprandial(),
      timeofday(),
    ]);
    expect(selectCrossPetSafetyFinding([onlyInsights])).toBeNull();
  });

  it('selects a single intake_decline candidate', () => {
    const sel = selectCrossPetSafetyFinding([candidate('A', [intakeDecline()])]);
    expect(sel?.pet.id).toBe('A');
    expect(sel?.finding.type).toBe('intake_decline');
  });

  it('selects a single symptom_worsening candidate', () => {
    const sel = selectCrossPetSafetyFinding([candidate('A', [worsening()])]);
    expect(sel?.finding.type).toBe('symptom_worsening');
  });

  it('within one pet with BOTH safety findings, picks intake_decline over worsening (§4 ranking)', () => {
    // worsening passed FIRST (rank 0) — class priority must still pick intake_decline,
    // never the lower-priority finding just because it leads the pet's own stack.
    const both = candidate('A', [worsening(), intakeDecline()]);
    expect(selectCrossPetSafetyFinding([both])?.finding.type).toBe('intake_decline');
  });

  it('across two pets, intake_decline outranks worsening regardless of list order (§4)', () => {
    const declinePet = candidate('decline', [intakeDecline()]);
    const worsenPet = candidate('worsen', [worsening()]);
    expect(selectCrossPetSafetyFinding([worsenPet, declinePet])?.pet.id).toBe('decline');
    expect(selectCrossPetSafetyFinding([declinePet, worsenPet])?.pet.id).toBe('decline');
  });

  it('never stacks — returns exactly one finding even when several pets qualify', () => {
    const sel = selectCrossPetSafetyFinding([
      candidate('A', [worsening()]),
      candidate('B', [intakeDecline()]),
      candidate('C', [worsening()]),
    ]);
    // The return type is a single SelectedBanner, not an array — one banner, by type.
    expect(sel?.pet.id).toBe('B');
  });

  it('breaks same-class ties by candidate order (oldest-first), deterministically', () => {
    const a = candidate('A', [intakeDecline({ daysBelowBaseline: 2 })]);
    const b = candidate('B', [intakeDecline({ daysBelowBaseline: 9 })]);
    expect(selectCrossPetSafetyFinding([a, b])?.pet.id).toBe('A');
    expect(selectCrossPetSafetyFinding([b, a])?.pet.id).toBe('B');
  });

  it('selects the safety finding when it is mixed with non-safety findings', () => {
    const mixed = candidate('A', [correlation(), intakeDecline(), reflection()]);
    expect(selectCrossPetSafetyFinding([mixed])?.finding.type).toBe('intake_decline');
  });

  it('a pet with only non-safety findings is skipped, but another with a safety finding still wins', () => {
    const noisy = candidate('noisy', [correlation(), reflection(), timeofday()]);
    const real = candidate('real', [worsening()]);
    expect(selectCrossPetSafetyFinding([noisy, real])?.pet.id).toBe('real');
  });
});

describe('bannerCopy', () => {
  it('intake_decline / refused — names the food and starts with the pet name', () => {
    const c = bannerCopy(
      intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: 'tuna pâté' }),
      'Juniper',
    );
    expect(c.text.startsWith('Juniper')).toBe(true);
    expect(c.text).toContain('tuna pâté');
    expect(c.text).toMatch(/worth a look/);
  });

  it('intake_decline / refused with no label — reads naturally, no doubled clause (code-review fix)', () => {
    const c = bannerCopy(
      intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: null }),
      'Juniper',
    );
    expect(c.text).toBe('Juniper turned down a meal they usually finish — worth a look.');
    // The trailing ", which they usually finish" clause is dropped in the no-label
    // case so "usually finish" never appears twice.
    expect(c.text).not.toContain('finish, which');
    expect(c.text.match(/usually finish/g)?.length).toBe(1);
  });

  it('intake_decline / refused with a very long label — truncates so a real banner is never silently suppressed', () => {
    const longLabel =
      'Super Premium Grain-Free Wild-Caught Pacific Salmon & Sweet Potato Recipe Pâté (Limited Ingredient)';
    const c = bannerCopy(
      intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: longLabel }),
      'Juniper',
    );
    expect(c.text).toContain('…'); // label was truncated
    // The whole point: the finding is real, so the banner must still pass the
    // length-capped guardrail (it must NOT fail-safe to silence on a long label).
    expect(validateBannerPhrasing(c.text)).toBe(true);
  });

  it('intake_decline / consecutive_low — says "today" for one day, "for N days" otherwise', () => {
    expect(bannerCopy(intakeDecline({ daysBelowBaseline: 1 }), 'Pixel').text).toContain('today');
    expect(bannerCopy(intakeDecline({ daysBelowBaseline: 3 }), 'Pixel').text).toContain('for 3 days');
  });

  it('symptom_worsening — names the symptom and the axis that rose (days vs episodes)', () => {
    const days = bannerCopy(worsening({ trigger: 'more_days', symptomType: 'vomit' }), 'Pixel').text;
    expect(days).toContain('vomiting on more days this week than last');
    const eps = bannerCopy(worsening({ trigger: 'more_episodes', symptomType: 'itch' }), 'Pixel').text;
    expect(eps).toContain('more itching this week than last');
  });

  it('text === petName + rest for every variant (the bold-name render invariant)', () => {
    for (const f of ALL_BANNER_FINDINGS) {
      const c = bannerCopy(f, 'Pixel');
      expect(c.text).toBe(`Pixel${c.rest}`);
      expect(c.text.startsWith('Pixel')).toBe(true);
    }
  });

  it('every variant is guardrail-clean: never reassures, never "picky", never causal, never alarms, never shouts (§4)', () => {
    // The adversarial-as-test: the banner can ONLY escalate attention. If any
    // variant ever drifts into reassurance / cause / alarm, this fails loudly.
    for (const f of ALL_BANNER_FINDINGS) {
      const { text } = bannerCopy(f, 'Pixel');
      expect(text.includes('!')).toBe(false);
      expect(REASSURANCE_RE.test(text)).toBe(false);
      expect(DISMISSIVE_RE.test(text)).toBe(false);
      expect(CAUSAL_RE.test(text)).toBe(false);
      expect(ALARM_RE.test(text)).toBe(false);
      // And it passes the runtime guardrail screen the hook applies.
      expect(validateBannerPhrasing(text)).toBe(true);
    }
  });
});

describe('validateBannerPhrasing', () => {
  it('accepts a clean, calm banner sentence', () => {
    expect(validateBannerPhrasing('Juniper has eaten less than usual for 3 days — worth a look.')).toBe(true);
  });

  it('rejects an exclamation mark (no manufactured alarm)', () => {
    expect(validateBannerPhrasing('Juniper has eaten less than usual — worth a look!')).toBe(false);
  });

  it('rejects reassurance on this safety surface (absence ≠ wellness)', () => {
    expect(validateBannerPhrasing('Juniper is probably fine — worth a look.')).toBe(false);
    expect(validateBannerPhrasing('Juniper is doing well this week.')).toBe(false);
  });

  it('rejects "picky"/"fussy" framing of an intake decline', () => {
    expect(validateBannerPhrasing('Juniper is just being picky lately.')).toBe(false);
  });

  it('rejects a causal claim', () => {
    expect(validateBannerPhrasing("Juniper's vomiting is caused by the new food.")).toBe(false);
    expect(validateBannerPhrasing('Juniper threw up because of dinner.')).toBe(false);
  });

  it('rejects alarm/urgency vocabulary (§4: never alarm)', () => {
    expect(validateBannerPhrasing('Juniper — emergency, see a vet immediately.')).toBe(false);
    expect(validateBannerPhrasing('Juniper needs urgent care right away.')).toBe(false);
  });

  it('rejects too-short and too-long strings', () => {
    expect(validateBannerPhrasing('hi')).toBe(false);
    expect(validateBannerPhrasing('a'.repeat(201))).toBe(false);
  });
});
