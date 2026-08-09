import {
  deriveDisplayState,
  buildingIntro,
  buildingDayNumber,
  buildingHeadline,
  buildingHeadlineLead,
  buildingDayCount,
  BUILDING_SUB,
  BUILDING_WATCHING_FOR,
  BUILDING_FLOOR,
  NO_PATTERN_HEADLINE,
  NO_PATTERN_SUB,
  noPatternIntro,
  staleIntro,
  ackUpdatingCopy,
  isNewWorsening,
  worseningNewSampleLine,
  confidenceTag,
  sampleLine,
  evidenceText,
  proteinCluster,
  isJointCandidate,
  displayProteinName,
  coverageCopy,
  selectCrossPetSafetyFinding,
  bannerCopy,
  validateBannerPhrasing,
  signalFindingsSignature,
  hasUnseenFinding,
  dotLaneModel,
  timingReceiptDegrades,
  timingCompareRows,
  timingControlDisclosure,
  dotLaneA11yLabel,
  stackedCompareA11yLabel,
  phoneScript,
  isTimingFinding,
  DOT_LANE_MAX,
  type BannerSafetyFinding,
} from './signalCopy';
import type {
  CachedFinding,
  CorrelationFinding,
  IncidentRedFlagFinding,
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

const incidentRedFlag = (
  over: Partial<IncidentRedFlagFinding> = {},
): IncidentRedFlagFinding => ({
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: '2026-07-16T08:00:00.000Z',
  flaggedIncidentCount: 1,
  windowDays: 14,
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
    | IncidentRedFlagFinding
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

// ── SR-2 empty states (B-721 §6 / §9) ─────────────────────────────────────────
describe('buildingDayNumber (B-721 §6 — B-421 day math)', () => {
  // B-514: both instants are built from LOCAL components at the same time of day, so
  // the local-day difference is invariant under the CI runner's zone.
  it('is Day 1 the day the first event is logged (day-1-inclusive floor)', () => {
    const now = new Date(2026, 6, 10, 12, 0);
    const first = new Date(2026, 6, 10, 9, 0);
    expect(buildingDayNumber(first.toISOString(), now.getTime())).toBe(1);
  });
  it('counts inclusive local days from the first event', () => {
    const now = new Date(2026, 6, 10, 12, 0);
    const first = new Date(2026, 6, 8, 12, 0); // 8, 9, 10 → Day 3
    expect(buildingDayNumber(first.toISOString(), now.getTime())).toBe(3);
  });
  it('never returns 0 or negative even if the first event reads later than now', () => {
    const now = new Date(2026, 6, 8, 12, 0);
    const first = new Date(2026, 6, 10, 12, 0);
    expect(buildingDayNumber(first.toISOString(), now.getTime())).toBe(1);
  });
  it('falls back to Day 1 on a missing / malformed first-event stamp (never a guessed day)', () => {
    const now = new Date(2026, 6, 10, 12, 0).getTime();
    expect(buildingDayNumber(null, now)).toBe(1);
    expect(buildingDayNumber('not-a-date', now)).toBe(1);
  });
});

describe('E1 headline (§9 verbatim, pluralised)', () => {
  it('composes the verbatim §9 sentence from its two visual parts', () => {
    expect(buildingHeadlineLead('Nyx')).toBe("We're getting to know Nyx.");
    expect(buildingDayCount(3, 11)).toBe('Day 3 — 11 events so far.');
    expect(buildingHeadline('Nyx', 3, 11)).toBe(
      "We're getting to know Nyx. Day 3 — 11 events so far.",
    );
  });
  it('pluralises the event count (1 event, not 1 events)', () => {
    expect(buildingDayCount(1, 1)).toBe('Day 1 — 1 event so far.');
    expect(buildingDayCount(2, 0)).toBe('Day 2 — 0 events so far.');
  });
  it('threads the pet name, never shouts or reassures', () => {
    const s = buildingHeadline('Pixel', 4, 9);
    expect(s).toContain('Pixel');
    expect(s.includes('!')).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
  });
});

describe('E1/E2 empty-state copy (§9 verbatim; absence ≠ wellness)', () => {
  it('E1 sub, watching-for rows and floor are the verbatim §9 strings', () => {
    expect(BUILDING_SUB).toBe(
      "Patterns usually start appearing within the first week. Here's what we're watching for:",
    );
    expect([...BUILDING_WATCHING_FOR]).toEqual([
      'Timing — do symptoms follow meals, and how closely',
      'Food connections — what tends to come before a reaction',
      'Change — this week against last, counted from your logs',
    ]);
    expect(BUILDING_FLOOR).toBe("If something needs attention sooner, it won't wait for the week.");
  });
  it('the E1 floor is the safety-honesty line — points at attention, never reassures/shouts', () => {
    expect(BUILDING_FLOOR.toLowerCase()).toContain('attention');
    expect(BUILDING_FLOOR.includes('!')).toBe(false);
    expect(REASSURANCE_RE.test(BUILDING_FLOOR)).toBe(false);
  });
  it('every E1 string is guardrail-clean (no exclamation, no reassurance vocabulary)', () => {
    for (const s of [BUILDING_SUB, ...BUILDING_WATCHING_FOR, BUILDING_FLOOR]) {
      expect(s.includes('!')).toBe(false);
      expect(REASSURANCE_RE.test(s)).toBe(false);
    }
  });
  it('E2 is the verbatim shipped B-284 §9 "Signal — empty" copy', () => {
    expect(NO_PATTERN_HEADLINE).toBe(
      'No established patterns yet. Nothing in the last month of logs has cleared our evidence bar.',
    );
    expect(NO_PATTERN_SUB).toBe(
      "That isn't an all-clear — keep logging, and the moment something clears it, it'll be here.",
    );
  });
  it('E2 says absence is not wellness — the "isn\'t an all-clear" clause is present, no exclamation', () => {
    expect(NO_PATTERN_SUB.toLowerCase()).toContain("isn't an all-clear");
    expect(NO_PATTERN_HEADLINE.includes('!')).toBe(false);
    expect(NO_PATTERN_SUB.includes('!')).toBe(false);
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

describe('ackUpdatingCopy (SR-3 §5.3 / §9) — the post-log acknowledgment line', () => {
  it('is the verbatim §9 string with the pet name and a single ellipsis, no exclamation', () => {
    expect(ackUpdatingCopy('Nyx')).toBe("Noted — updating Nyx's picture…");
    expect(ackUpdatingCopy('Mochi')).toBe("Noted — updating Mochi's picture…");
  });
  it('is guardrail-clean (no exclamation, no reassurance/causal vocabulary — absence ≠ wellness)', () => {
    for (const name of ['Nyx', 'Mochi', 'Pixel']) {
      const s = ackUpdatingCopy(name);
      expect(s.includes('!')).toBe(false);
      expect(REASSURANCE_RE.test(s)).toBe(false);
      expect(CAUSAL_RE.test(s)).toBe(false);
    }
  });
});

describe('isNewWorsening + worseningNewSampleLine (SR-3 §3.2 — client-derived New)', () => {
  it('is New only when a worsening finding had zero prior episodes', () => {
    expect(isNewWorsening(worsening({ priorCount: 0 }))).toBe(true);
    expect(isNewWorsening(worsening({ priorCount: 2 }))).toBe(false);
    expect(isNewWorsening(worsening({ priorCount: 1 }))).toBe(false);
  });
  it('is never New for a non-worsening finding (the other New cases are v2)', () => {
    // reflection carries a priorCount of 0 too, but the New chip is worsening-only in v1.
    expect(isNewWorsening(reflection({ priorCount: 0 }))).toBe(false);
    expect(isNewWorsening(correlation())).toBe(false);
    expect(isNewWorsening(intakeDecline())).toBe(false);
  });
  it('the New sample line states the current count only — never the "0 last week" pair it replaces', () => {
    // more_episodes arm (the shape priorCount === 0 actually produces).
    const s = worseningNewSampleLine(worsening({ priorCount: 0, currentCount: 4, trigger: 'more_episodes' }));
    expect(s).toBe('4 episodes this week');
    expect(s).not.toContain('last week');
    expect(s).not.toContain('0');
  });
  it('states the count on the axis that rose (days for the more_days arm), singularised', () => {
    expect(
      worseningNewSampleLine(worsening({ priorCount: 0, currentDays: 5, trigger: 'more_days' })),
    ).toBe('5 days this week');
    expect(
      worseningNewSampleLine(worsening({ priorCount: 0, currentCount: 1, trigger: 'more_episodes' })),
    ).toBe('1 episode this week');
  });
  it('the New sample line is guardrail-clean (no exclamation / reassurance / causal)', () => {
    const s = worseningNewSampleLine(worsening({ priorCount: 0 }));
    expect(s.includes('!')).toBe(false);
    expect(REASSURANCE_RE.test(s)).toBe(false);
    expect(CAUSAL_RE.test(s)).toBe(false);
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

describe('B-351 slice 6 — the joint candidate (D5)', () => {
  const joint = (over: Partial<CorrelationFinding> = {}) =>
    correlation({
      protein: 'chicken and duck',
      proteins: ['chicken', 'duck'],
      jointCandidate: true,
      jointGuidance: 'feed_apart',
      ...over,
    });

  it('proteinCluster falls back to [protein] for a finding cached before slice 6', () => {
    // ai_signals has a 24h TTL, so pre-slice-6 rows are read for at least a day after
    // deploy — and indefinitely if regeneration keeps failing. They must render, not blank.
    expect(proteinCluster(correlation({ protein: 'chicken' }))).toEqual(['chicken']);
    expect(proteinCluster(correlation({ protein: 'chicken', proteins: [] }))).toEqual(['chicken']);
    expect(isJointCandidate(correlation({ protein: 'chicken' }))).toBe(false);
  });

  it('isJointCandidate needs BOTH the flag and a real cluster (a lone member is not a pair)', () => {
    expect(isJointCandidate(joint())).toBe(true);
    // Defensive: a malformed row claiming jointness with one protein renders as a normal
    // single-protein card rather than a linked pair with nothing to link.
    expect(isJointCandidate(correlation({ jointCandidate: true, proteins: ['chicken'] }))).toBe(false);
  });

  it('evidenceText explains WHY the proteins cannot be separated, names both, stays associational', () => {
    const s = evidenceText(joint(), 'Pixel');
    expect(s).toContain('chicken');
    expect(s).toContain('duck');
    expect(s).toContain("can't tell them apart");
    expect(s).toContain('vet');
    expect(s.includes('!')).toBe(false);
    expect(CAUSAL_RE.test(s)).toBe(false);
  });

  it('never forecloses "neither" — the pattern could be driven by something not on the list', () => {
    // An earlier draft said "it's both of them or either one", which is a stronger claim
    // than an associational finding supports.
    expect(evidenceText(joint(), 'Pixel')).not.toContain('either one');
  });

  it('on an ACTIVE DIET TRIAL the tap-through never suggests feeding them apart', () => {
    // The client half of the slice-6 adversarial pass's highest-severity finding: the app
    // must not suggest varying a vet-directed elimination diet, on any surface.
    const s = evidenceText(joint({ jointGuidance: 'ask_vet' }), 'Pixel');
    expect(s).not.toMatch(/feeding one without the other/i);
    expect(s).not.toMatch(/separate them/i);
    expect(s).toContain('vet');
    expect(s).toContain('chicken');
    expect(s).toContain('duck');
  });

  it('an ABSENT jointGuidance degrades to the safe branch, not the trial-breaking one', () => {
    const s = evidenceText(joint({ jointGuidance: undefined }), 'Pixel');
    expect(s).not.toMatch(/feeding one without the other/i);
    expect(s).toContain('vet');
  });

  it('evidenceText never reassures about a member it did not single out', () => {
    // There is no un-named member — that is the whole design — so no wellness verdict
    // about "the other one" can appear.
    const s = evidenceText(joint(), 'Pixel');
    expect(/\b(fine|okay|all clear|nothing to worry|no concern|rule(d)? out)\b/i.test(s)).toBe(false);
  });

  it("a single-protein finding gets NO can't-separate clause (regression fence)", () => {
    const s = evidenceText(correlation({ protein: 'chicken' }), 'Pixel');
    expect(s).not.toContain('always turn up together');
  });

  it('displayProteinName title-cases a canonical key for the linked-pair chips', () => {
    expect(displayProteinName('chicken')).toBe('Chicken');
    expect(displayProteinName('')).toBe('');
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

describe('incident_red_flag (B-340) — client copy', () => {
  it('sampleLine shows the AI-read provenance + the episode-collapsed count, singular/plural', () => {
    expect(sampleLine(incidentRedFlag({ flaggedIncidentCount: 1 }))).toBe(
      'From an AI read of 1 logged photo',
    );
    expect(sampleLine(incidentRedFlag({ flaggedIncidentCount: 2 }))).toBe(
      'From an AI read of 2 logged photos',
    );
  });

  it('sampleLine never reassures, never causal, never shouts', () => {
    for (const n of [1, 2, 5]) {
      const s = sampleLine(incidentRedFlag({ flaggedIncidentCount: n }));
      expect(REASSURANCE_RE.test(s)).toBe(false);
      expect(CAUSAL_RE.test(s)).toBe(false);
      expect(s.includes('!')).toBe(false);
    }
  });

  it('evidenceText names the flag + symptom + pet, is honest about the AI read, points to the vet', () => {
    const s = evidenceText(incidentRedFlag({ flags: ['blood'] }), 'Pixel');
    expect(s).toContain('Pixel');
    expect(s).toContain('vomiting');
    expect(s).toContain('possible blood');
    expect(s.toLowerCase()).toContain('not a diagnosis');
    expect(s).toContain('vet');
  });

  it('evidenceText phrases foreign material and the both-flags union (blood before foreign)', () => {
    expect(evidenceText(incidentRedFlag({ flags: ['foreign_material'] }), 'Pixel')).toContain(
      'possible foreign material',
    );
    const both = evidenceText(incidentRedFlag({ flags: ['blood', 'foreign_material'] }), 'Pixel');
    expect(both).toContain('possible blood and possible foreign material');
  });

  it('evidenceText reads a single photo (n=1) distinctly from multiple flagged bouts', () => {
    expect(evidenceText(incidentRedFlag({ flaggedIncidentCount: 1 }), 'Pixel')).toContain(
      'a single photo',
    );
    const plural = evidenceText(incidentRedFlag({ flaggedIncidentCount: 3 }), 'Pixel');
    expect(plural).toContain('Photos you logged');
  });

  it('evidenceText is guardrail-clean across flag sets and counts (never reassures/causal/shouts)', () => {
    for (const flags of [['blood'], ['foreign_material'], ['blood', 'foreign_material']] as const) {
      for (const flaggedIncidentCount of [1, 2]) {
        const s = evidenceText(incidentRedFlag({ flags: [...flags], flaggedIncidentCount }), 'Nyx');
        expect(REASSURANCE_RE.test(s)).toBe(false);
        expect(DISMISSIVE_RE.test(s)).toBe(false);
        expect(CAUSAL_RE.test(s)).toBe(false);
        expect(s.includes('!')).toBe(false);
      }
    }
  });

  it('carries no confidence tag (a safety flag shows weight by the rail + lead, not a tag)', () => {
    expect(confidenceTag(incidentRedFlag())).toBeNull();
  });
});

describe('incident_red_flag (B-364) — stool client copy', () => {
  const stoolFlag = (over: Partial<IncidentRedFlagFinding> = {}): IncidentRedFlagFinding =>
    incidentRedFlag({ incidentType: 'stool', ...over });

  it('evidenceText reads the NEUTRAL "stool", never "loose stool" (a formed stool can bleed too)', () => {
    const s = evidenceText(stoolFlag({ flags: ['blood'] }), 'Pixel');
    expect(s).toContain("Pixel's stool");
    expect(s.toLowerCase()).not.toContain('loose stool');
    expect(s).toContain('possible blood');
    expect(s.toLowerCase()).toContain('not a diagnosis');
    expect(s).toContain('vet');
  });

  it('evidenceText is guardrail-clean for stool across flag sets/counts (never reassures/causal/shouts)', () => {
    for (const flags of [['blood'], ['foreign_material'], ['blood', 'foreign_material']] as const) {
      for (const flaggedIncidentCount of [1, 2]) {
        const s = evidenceText(stoolFlag({ flags: [...flags], flaggedIncidentCount }), 'Nyx');
        expect(s.toLowerCase()).not.toContain('loose stool');
        expect(REASSURANCE_RE.test(s)).toBe(false);
        expect(DISMISSIVE_RE.test(s)).toBe(false);
        expect(CAUSAL_RE.test(s)).toBe(false);
        expect(s.includes('!')).toBe(false);
      }
    }
  });

  it('sampleLine (AI-read provenance) is unchanged by family — same honest photo count', () => {
    expect(sampleLine(stoolFlag({ flaggedIncidentCount: 1 }))).toBe('From an AI read of 1 logged photo');
    expect(sampleLine(stoolFlag({ flaggedIncidentCount: 2 }))).toBe('From an AI read of 2 logged photos');
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
  incidentRedFlag({ flags: ['blood'], flaggedIncidentCount: 1 }),
  incidentRedFlag({ flags: ['foreign_material'], flaggedIncidentCount: 1 }),
  incidentRedFlag({ flags: ['blood', 'foreign_material'], flaggedIncidentCount: 2 }),
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
  ...(['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction'] as const).flatMap(
    (symptomType) => [
      chronicity({ tier: 'firm', symptomType }),
      chronicity({ tier: 'standard', symptomType }),
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

  it('selects a single symptom_chronicity candidate — the lane can now cross over (B-191)', () => {
    // The whole point of B-191: a secondary pet whose ONLY safety finding is a
    // weeks-long unresolved course must raise the banner, not stay silent.
    const sel = selectCrossPetSafetyFinding([candidate('A', [chronicity()])]);
    expect(sel?.finding.type).toBe('symptom_chronicity');
  });

  it('selects a single incident_red_flag candidate — a photographed red flag can cross over (B-340)', () => {
    // A secondary pet whose only flag is a photographed blood / foreign-body red flag must be able
    // to raise the banner (same rationale as B-191), not stay silent on a detail screen.
    const sel = selectCrossPetSafetyFinding([candidate('A', [incidentRedFlag()])]);
    expect(sel?.finding.type).toBe('incident_red_flag');
  });

  it('B-364: a secondary pet\'s STOOL red flag also raises the banner, with a guardrail-clean sentence', () => {
    // Stool inherits the cross-pet allow-list (same InsightType); the banner rest ("has a logged
    // photo showing possible blood — worth a look") is family-agnostic, so it reads cleanly for stool.
    const stoolFlag = incidentRedFlag({ incidentType: 'stool', flags: ['blood'] });
    const sel = selectCrossPetSafetyFinding([candidate('A', [stoolFlag])]);
    expect(sel?.finding.type).toBe('incident_red_flag');
    const { text } = bannerCopy(sel!.finding, sel!.pet.name);
    expect(text).toContain('possible blood');
    expect(text.includes('!')).toBe(false);
    expect(REASSURANCE_RE.test(text)).toBe(false);
    expect(CAUSAL_RE.test(text)).toBe(false);
  });

  it('incident_red_flag leads every other safety lane, within a pet and across pets (SAFETY_TYPE_ORDER)', () => {
    // Mirrors the engine: incident_red_flag (0) > intake_decline (1) > chronicity (2) > worsening (3).
    const within = candidate('A', [worsening(), intakeDecline(), chronicity(), incidentRedFlag()]);
    expect(selectCrossPetSafetyFinding([within])?.finding.type).toBe('incident_red_flag');
    // Across pets, order-independent: the red-flag pet wins over an intake_decline pet either way.
    const flagPet = candidate('flag', [incidentRedFlag()]);
    const declinePet = candidate('decline', [intakeDecline()]);
    expect(selectCrossPetSafetyFinding([declinePet, flagPet])?.pet.id).toBe('flag');
    expect(selectCrossPetSafetyFinding([flagPet, declinePet])?.pet.id).toBe('flag');
  });

  it('within one pet with BOTH safety findings, picks intake_decline over worsening (§4 ranking)', () => {
    // worsening passed FIRST (rank 0) — class priority must still pick intake_decline,
    // never the lower-priority finding just because it leads the pet's own stack.
    const both = candidate('A', [worsening(), intakeDecline()]);
    expect(selectCrossPetSafetyFinding([both])?.finding.type).toBe('intake_decline');
  });

  it('within one pet, chronicity outranks worsening but yields to intake_decline (SAFETY_TYPE_ORDER)', () => {
    // The banner priority mirrors the engine's per-pet SAFETY_TYPE_ORDER exactly:
    // intake_decline (0) > symptom_chronicity (1) > symptom_worsening (2).
    const chronicVsWorsen = candidate('A', [worsening(), chronicity()]);
    expect(selectCrossPetSafetyFinding([chronicVsWorsen])?.finding.type).toBe('symptom_chronicity');
    const declineVsChronic = candidate('B', [chronicity(), intakeDecline()]);
    expect(selectCrossPetSafetyFinding([declineVsChronic])?.finding.type).toBe('intake_decline');
  });

  it('across two pets, intake_decline outranks worsening regardless of list order (§4)', () => {
    const declinePet = candidate('decline', [intakeDecline()]);
    const worsenPet = candidate('worsen', [worsening()]);
    expect(selectCrossPetSafetyFinding([worsenPet, declinePet])?.pet.id).toBe('decline');
    expect(selectCrossPetSafetyFinding([declinePet, worsenPet])?.pet.id).toBe('decline');
  });

  it('across pets, chronicity beats worsening but loses to intake_decline, order-independent (B-191)', () => {
    const chronicPet = candidate('chronic', [chronicity()]);
    const worsenPet = candidate('worsen', [worsening()]);
    const declinePet = candidate('decline', [intakeDecline()]);
    // chronicity > worsening
    expect(selectCrossPetSafetyFinding([worsenPet, chronicPet])?.pet.id).toBe('chronic');
    expect(selectCrossPetSafetyFinding([chronicPet, worsenPet])?.pet.id).toBe('chronic');
    // intake_decline > chronicity
    expect(selectCrossPetSafetyFinding([chronicPet, declinePet])?.pet.id).toBe('decline');
    expect(selectCrossPetSafetyFinding([declinePet, chronicPet])?.pet.id).toBe('decline');
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

  it('symptom_chronicity — names the symptom + onset month, reads as a recurring course (B-191)', () => {
    // Anchored to the onset MONTH (matching the pet's own chronicity Signal copy),
    // so the teaser reads as duration, not a week-over-week delta.
    const c = bannerCopy(
      chronicity({ symptomType: 'vomit', firstOnsetIso: '2026-05-15T08:00:00.000Z' }),
      'Pixel',
    );
    expect(c.text).toBe('Pixel has had recurring vomiting since May — worth a look.');
    expect(c.text.startsWith('Pixel')).toBe(true);
  });

  it('symptom_chronicity — a bad onset ISO degrades to "then", never crashes or leaks a raw date', () => {
    const c = bannerCopy(chronicity({ firstOnsetIso: 'not-a-date' }), 'Pixel');
    expect(c.text).toContain('since then');
    expect(validateBannerPhrasing(c.text)).toBe(true);
  });

  it('incident_red_flag — names what the photo showed, starts with the pet name, singular/plural', () => {
    const one = bannerCopy(incidentRedFlag({ flags: ['blood'], flaggedIncidentCount: 1 }), 'Pixel');
    expect(one.text).toBe('Pixel has a logged photo showing possible blood — worth a look.');
    const many = bannerCopy(
      incidentRedFlag({ flags: ['blood', 'foreign_material'], flaggedIncidentCount: 2 }),
      'Pixel',
    );
    expect(many.text).toBe(
      'Pixel has logged photos showing possible blood and possible foreign material — worth a look.',
    );
    expect(validateBannerPhrasing(one.text)).toBe(true);
    expect(validateBannerPhrasing(many.text)).toBe(true);
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

// ══════════════════════════════════════════════════════════════════════════════
// Receipts (SR-1, B-721) — the pure evidence models.
// ══════════════════════════════════════════════════════════════════════════════
// The geometry and copy behind the Signal design-uplift strips. These are derived
// from the finding's EXISTING counts (no payload change), so the invariants under
// test are: one dot per timeable episode split correctly by the window; the A→C
// degradation at the legibility cap; both compare counts printed; the un-timeable
// remainder always disclosed; and the safety phone-script held to the same guardrail
// screen the rest of the safety copy is (never reassures / dismisses / blames / shouts).

describe('isTimingFinding', () => {
  it('is true for the two timing types only', () => {
    expect(isTimingFinding(postprandial())).toBe(true);
    expect(isTimingFinding(timeofday())).toBe(true);
    expect(isTimingFinding(correlation())).toBe(false);
    expect(isTimingFinding(worsening())).toBe(false);
    expect(isTimingFinding(reflection())).toBe(false);
    expect(isTimingFinding(intakeDecline())).toBe(false);
  });
});

describe('dotLaneModel — Shape A geometry', () => {
  it('postprandial: one dot per timeable episode, split in/out of the window', () => {
    const m = dotLaneModel(postprandial({ rapidCount: 4, eligibleCount: 12 }));
    // 12 timeable episodes → 12 dots; 4 within the window, 8 outside (never the raw total).
    expect(m.dots).toHaveLength(12);
    expect(m.dots.filter((d) => d.inWindow)).toHaveLength(4);
    expect(m.dots.filter((d) => !d.inWindow)).toHaveLength(8);
  });

  it('postprandial: the window is a single band anchored at the start of the lane', () => {
    const m = dotLaneModel(postprandial({ rapidWindowMinutes: 30 }));
    expect(m.bands).toHaveLength(1);
    expect(m.bands[0].start).toBe(0);
    expect(m.bands[0].end).toBeGreaterThan(0);
    expect(m.bands[0].end).toBeLessThanOrEqual(0.5);
    expect(m.axis).toEqual(['ate', '30m', '2h+']);
  });

  it('postprandial: in-window dots fall inside the band, out dots outside it', () => {
    const m = dotLaneModel(postprandial({ rapidCount: 3, eligibleCount: 9 }));
    const bandEnd = m.bands[0].end;
    for (const d of m.dots) {
      if (d.inWindow) expect(d.pos).toBeLessThanOrEqual(bandEnd + 1e-9);
      else expect(d.pos).toBeGreaterThanOrEqual(bandEnd - 1e-9);
    }
    // Dots are returned left-to-right so the render order is stable.
    const positions = m.dots.map((d) => d.pos);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // Every position is a real lane fraction.
    for (const p of positions) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('timeofday: a non-wrapping band is one segment; dots split by the clock band', () => {
    const m = dotLaneModel(timeofday({ clusterStartLocalHour: 4, clusterWindowHours: 4, clusterCount: 5, eligibleCount: 8 }));
    expect(m.bands).toHaveLength(1);
    expect(m.bands[0].start).toBeCloseTo(4 / 24, 6);
    expect(m.bands[0].end).toBeCloseTo(8 / 24, 6);
    expect(m.dots).toHaveLength(8);
    expect(m.dots.filter((d) => d.inWindow)).toHaveLength(5);
    expect(m.axis).toEqual(['12am', '12pm', '12am']);
  });

  it('timeofday: a band that crosses midnight is drawn as two segments (no lost band)', () => {
    // 11pm + 4h → 3am wraps the lane edge.
    const m = dotLaneModel(timeofday({ clusterStartLocalHour: 23, clusterWindowHours: 4, clusterCount: 4, eligibleCount: 6 }));
    expect(m.bands).toHaveLength(2);
    expect(m.bands.some((b) => b.end === 1)).toBe(true); // the pre-midnight segment reaches the edge
    expect(m.bands.some((b) => b.start === 0)).toBe(true); // the post-midnight segment starts at the edge
    // In-window dots land inside one of the two segments.
    const inBand = (p: number) => m.bands.some((b) => p >= b.start - 1e-9 && p <= b.end + 1e-9);
    for (const d of m.dots.filter((x) => x.inWindow)) expect(inBand(d.pos)).toBe(true);
    expect(m.dots.filter((d) => d.inWindow)).toHaveLength(4);
  });

  it('clamps a malformed cache (rapidCount > eligibleCount) rather than drawing negative dots', () => {
    const m = dotLaneModel(postprandial({ rapidCount: 20, eligibleCount: 5 }));
    expect(m.dots).toHaveLength(5);
    expect(m.dots.filter((d) => d.inWindow)).toHaveLength(5); // capped at eligible, never 20
    expect(m.dots.filter((d) => !d.inWindow)).toHaveLength(0);
  });
});

describe('timingReceiptDegrades — the A→C legibility cap (§4 / cap±1)', () => {
  it('renders the dot lane at exactly the cap', () => {
    expect(timingReceiptDegrades(postprandial({ eligibleCount: DOT_LANE_MAX }))).toBe(false);
    expect(timingReceiptDegrades(timeofday({ eligibleCount: DOT_LANE_MAX }))).toBe(false);
  });
  it('degrades to the compare one past the cap', () => {
    expect(timingReceiptDegrades(postprandial({ eligibleCount: DOT_LANE_MAX + 1 }))).toBe(true);
    expect(timingReceiptDegrades(timeofday({ eligibleCount: DOT_LANE_MAX + 1 }))).toBe(true);
  });
});

describe('timingCompareRows — Shape C, both counts printed', () => {
  it('postprandial: pattern side (rose/concern) vs the rest (muted), counts printed', () => {
    const [inRow, outRow] = timingCompareRows(postprandial({ rapidCount: 4, eligibleCount: 12, rapidWindowMinutes: 30 }));
    expect(inRow).toEqual({ label: 'Within 30 min of eating', count: 4, tone: 'concern' });
    expect(outRow).toEqual({ label: 'Timed, but later', count: 8, tone: 'muted' });
  });

  it('timeofday: the clock range labels the pattern side; other times are the control', () => {
    const [inRow, outRow] = timingCompareRows(timeofday({ clusterStartLocalHour: 4, clusterWindowHours: 4, clusterCount: 5, eligibleCount: 8 }));
    expect(inRow).toEqual({ label: '4am–8am', count: 5, tone: 'concern' });
    expect(outRow).toEqual({ label: 'Other times of day', count: 3, tone: 'muted' });
  });

  it('never emits a negative control count from a malformed cache', () => {
    const [, outRow] = timingCompareRows(postprandial({ rapidCount: 20, eligibleCount: 5 }));
    expect(outRow.count).toBe(0);
  });
});

describe('timingControlDisclosure — the honest un-timeable remainder', () => {
  it('names the episodes that were not near any logged meal', () => {
    expect(timingControlDisclosure(postprandial({ eligibleCount: 12, totalEpisodes: 14 }))).toBe(
      "2 episodes weren't near any logged meal",
    );
  });
  it('singularises (subject-verb agreement at one)', () => {
    expect(timingControlDisclosure(postprandial({ eligibleCount: 12, totalEpisodes: 13 }))).toBe(
      "1 episode wasn't near any logged meal",
    );
  });
  it('names the episodes with no clear time for time-of-day', () => {
    expect(timingControlDisclosure(timeofday({ eligibleCount: 8, totalEpisodes: 11 }))).toBe(
      "3 episodes didn't have a clear enough time to place",
    );
  });
  it('is null when every episode was timeable (nothing to disclose)', () => {
    expect(timingControlDisclosure(postprandial({ eligibleCount: 12, totalEpisodes: 12 }))).toBeNull();
    expect(timingControlDisclosure(timeofday({ eligibleCount: 8, totalEpisodes: 8 }))).toBeNull();
  });
});

describe('a11y labels are full sentences (§11)', () => {
  it('dot lane reads its split as a sentence', () => {
    expect(dotLaneA11yLabel(postprandial({ rapidCount: 4, eligibleCount: 12, rapidWindowMinutes: 30 }))).toBe(
      '4 of 12 timed episodes fell within 30 minutes of eating.',
    );
    expect(dotLaneA11yLabel(timeofday({ clusterStartLocalHour: 4, clusterWindowHours: 4, clusterCount: 5, eligibleCount: 8 }))).toBe(
      '5 of 8 timed episodes fell between 4am and 8am.',
    );
  });
  it('stacked compare reads its labelled counts in order', () => {
    const rows = timingCompareRows(postprandial({ rapidCount: 4, eligibleCount: 12, rapidWindowMinutes: 30 }));
    expect(stackedCompareA11yLabel(rows)).toBe('Within 30 min of eating, 4; Timed, but later, 8.');
  });
});

describe('phoneScript — the safety phone-call facts (§4/§9)', () => {
  it('is null for every non-safety type (the script is safety-only)', () => {
    expect(phoneScript(correlation(), 'Nyx')).toBeNull();
    expect(phoneScript(reflection(), 'Nyx')).toBeNull();
    expect(phoneScript(postprandial(), 'Nyx')).toBeNull();
    expect(phoneScript(timeofday(), 'Nyx')).toBeNull();
  });

  it('worsening: symptom + this-week/last-week counts + window, NO recency (payload has none)', () => {
    const facts = phoneScript(worsening({ symptomType: 'vomit', currentCount: 5, priorCount: 2, currentDays: 3, windowDays: 14 }), 'Nyx');
    expect(facts).toEqual([
      { label: 'Sign', value: 'vomiting' },
      { label: 'This week', value: '5 episodes on 3 days' },
      { label: 'Week before', value: '2 episodes' },
      { label: 'Watched over', value: 'the last 14 days' },
    ]);
    // recency renders only where the payload carries it — worsening never does.
    expect(facts?.some((f) => f.label === 'Most recent')).toBe(false);
  });

  it('worsening (more_days arm): talks in days, never miscounts on the episode axis', () => {
    const facts = phoneScript(worsening({ trigger: 'more_days', currentDays: 4, priorDays: 2, symptomType: 'itch' }), 'Nyx');
    expect(facts).toContainEqual({ label: 'This week', value: '4 days with itching' });
    expect(facts).toContainEqual({ label: 'Week before', value: '2 days' });
  });

  it('chronicity: carries the recency line (payload has daysSinceLastEpisode)', () => {
    const facts = phoneScript(chronicity({ daysSinceLastEpisode: 1, episodeCount: 20, activeWeeks: 6, windowDays: 56, firstOnsetIso: '2026-05-15T08:00:00.000Z' }), 'Nyx');
    expect(facts).toContainEqual({ label: 'Ongoing since', value: 'May' });
    expect(facts).toContainEqual({ label: 'How often', value: '20 episodes across 6 of 8 weeks' });
    expect(facts).toContainEqual({ label: 'Most recent', value: 'yesterday' });
  });

  it('incident_red_flag: carries what a photo showed + a most-recent date', () => {
    const facts = phoneScript(incidentRedFlag({ flags: ['blood'], incidentType: 'vomit', flaggedIncidentCount: 2, mostRecentFlaggedIso: '2026-07-16T08:00:00.000Z' }), 'Nyx');
    expect(facts).toContainEqual({ label: 'What a photo showed', value: "possible blood in Nyx's vomiting" });
    expect(facts).toContainEqual({ label: 'From', value: '2 logged photos' });
    expect(facts).toContainEqual({ label: 'Most recent', value: 'July 16' });
  });

  it('intake_decline (refusal): names the refused food, capping a long free-text label', () => {
    const longLabel = 'Some Very Long Brand Name Premium Grain-Free Ocean Whitefish Recipe';
    const facts = phoneScript(intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: longLabel, ratedMealsConsidered: 9 }), 'Nyx');
    expect(facts?.[0]).toEqual({ label: 'Concern', value: 'refused a food normally eaten' });
    const food = facts?.find((f) => f.label === 'Food');
    expect(food).toBeTruthy();
    expect((food?.value.length ?? 0)).toBeLessThanOrEqual(40);
  });

  it('intake_decline (consecutive low): span + comparison, no invented recency', () => {
    const facts = phoneScript(intakeDecline({ trigger: 'consecutive_low', daysBelowBaseline: 3, ratedMealsConsidered: 9 }), 'Nyx');
    expect(facts).toEqual([
      { label: 'Concern', value: 'eating less than usual' },
      { label: 'How long', value: '3 days below the usual' },
      { label: 'Compared with', value: '9 recent meals' },
    ]);
  });

  it('every safety phone-script string passes the guardrail screen (never reassures/dismisses/blames)', () => {
    const safety: BannerSafetyFinding[] = [
      worsening(),
      worsening({ trigger: 'more_days' }),
      chronicity(),
      incidentRedFlag(),
      incidentRedFlag({ flags: ['blood', 'foreign_material'], incidentType: 'stool' }),
      intakeDecline({ trigger: 'consecutive_low' }),
      intakeDecline({ trigger: 'refused_normal_food', refusedFoodLabel: 'Chicken & Rice' }),
    ];
    for (const f of safety) {
      const facts = phoneScript(f, 'Nyx');
      expect(facts).not.toBeNull();
      const blob = facts!.map((x) => `${x.label} ${x.value}`).join(' ');
      expect(blob).not.toMatch(REASSURANCE_RE);
      expect(blob).not.toMatch(DISMISSIVE_RE);
      expect(blob).not.toMatch(CAUSAL_RE);
      expect(blob).not.toContain('!');
    }
  });
});
