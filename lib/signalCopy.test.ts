import {
  deriveDisplayState,
  buildingIntro,
  staleIntro,
  confidenceTag,
  sampleLine,
  evidenceText,
} from './signalCopy';
import type {
  CachedFinding,
  CorrelationFinding,
  IntakeDeclineFinding,
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

const cached = (finding: CorrelationFinding | IntakeDeclineFinding, rank = 0): CachedFinding => ({
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
    expect(deriveDisplayState([cached(correlation())], false)).toBe('live');
  });
  it('is building with no findings but recent activity', () => {
    expect(deriveDisplayState([], true)).toBe('building');
  });
  it('is stale with no findings and no recent activity', () => {
    expect(deriveDisplayState([], false)).toBe('stale');
  });
});

describe('building / stale intros', () => {
  it('thread the pet name and never reassure or shout', () => {
    for (const s of [buildingIntro('Pixel'), staleIntro('Pixel')]) {
      expect(s).toContain('Pixel');
      expect(s.includes('!')).toBe(false);
      expect(REASSURANCE_RE.test(s)).toBe(false);
    }
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
