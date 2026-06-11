// AI Signal — phrasing, curation & guardrail logic (B-045, Step 2).
//
// The PURE half of the generate-signal Edge Function, kept free of remote/Deno
// imports (mirroring detection.ts) so it is unit-testable offline. It owns
// everything that turns a ranked set of already-true findings into the cached,
// owner-facing card set EXCEPT the live Claude call and DB I/O (those live in
// index.ts):
//   - templated sentences — the deterministic fallback AND the validation floor
//   - validatePhrasing — defense-in-depth against model drift (clinical-
//     guardrails Pattern 8): the model may not reassure on a safety finding,
//     soften a decline into "picky", or make a causal claim on a correlation
//   - curateFindings — the §3.2 visible-card cap, with safety NEVER dropped
//   - the phrasing prompt + payload (no raw event log ever reaches the model)
//
// Voice rules per the nyx-voice skill; clinical no-reassure asymmetry per the
// clinical-guardrails skill + §9 of the requirements doc.

import type {
  Finding,
  CorrelationFinding,
  IntakeDeclineFinding,
  ReflectionFinding,
  SymptomWorseningFinding,
  PostprandialTimingFinding,
  RankedFinding,
  SymptomType,
} from './detection.ts'

// §3.2 visible-card cap: governs the LOW/MEDIUM-priority insight set only.
// Safety/concern findings are exempt — never withheld to honor the cap.
export const VISIBLE_CARD_CAP = 4

// ── Cached shape (matches migration 015 ai_signals.findings) ──────────────────
export interface CachedFinding {
  rank: number
  text: string
  finding: Finding
}

// ── Voice: plain-language symptom labels (nyx-voice Pattern 5) ────────────────
// The owner reads "loose stool", never the stored enum "diarrhea".
export const SYMPTOM_LABEL: Record<SymptomType, string> = {
  vomit: 'vomiting',
  diarrhea: 'loose stool',
  itch: 'itching',
  scratch: 'scratching',
  skin_reaction: 'skin irritation',
}

function numWord(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'][n] ?? String(n)
}

// ── Templated sentences (deterministic fallback AND validation floor) ─────────
// Guardrail-compliant by construction: associational-only for correlations,
// never-reassure / never-"picky" for the safety flag, no exclamation marks.
// These are what ship when the LLM is down or its sentence fails validation.

export function templateCorrelation(f: CorrelationFinding, petName: string): string {
  const symptom = SYMPTOM_LABEL[f.symptomType]
  const window = Math.round(f.correlationWindowHours)
  if (f.tier === 'established') {
    return `${petName}'s ${symptom} has tended to follow meals with ${f.protein}, across ${f.matchedPairs} matched days of logs.`
  }
  return `${petName}'s ${symptom} has tended to follow meals with ${f.protein} within about ${window} hours — an early pattern worth keeping an eye on as you keep logging.`
}

export function templateIntakeDecline(f: IntakeDeclineFinding, petName: string): string {
  // Safety finding: calm, clear, points toward keeping an eye on it + the vet.
  // Never reassures, never frames reduced eating as fussiness.
  if (f.trigger === 'refused_normal_food') {
    const food = f.refusedFoodLabel ?? 'a food they usually finish'
    return `${petName} just turned down ${food}, which ${petName} normally eats — worth keeping an eye on, and a word with your vet if it carries on.`
  }
  const span = f.daysBelowBaseline <= 1 ? 'today' : `the last ${numWord(f.daysBelowBaseline)} days`
  return `${petName} has eaten less than usual ${span} — worth keeping an eye on, and a word with your vet if it carries on.`
}

export function templateReflection(f: ReflectionFinding, petName: string): string {
  // Descriptive count only (B-051 / §7.1 rung ②). Never causal, never reassuring,
  // never an absence-of-symptom all-clear. Plain symptom word, specific numbers.
  const symptom = SYMPTOM_LABEL[f.symptomType]
  const noun = f.currentCount === 1 ? 'episode' : 'episodes'
  if (f.direction === 'improving') {
    return `We've logged ${f.currentCount} ${noun} of ${symptom} for ${petName} this week, down from ${f.priorCount} last week.`
  }
  return `We've logged ${f.currentCount} ${noun} of ${symptom} for ${petName} this week — about the same as last week.`
}

export function templateWorsening(f: SymptomWorseningFinding, petName: string): string {
  // Detector ④ — descriptive frequency, routed to concern. Never causal, never a
  // severity verdict ("worse"), never reassures. Urgency rides the resolved tier
  // (density-anchored, decided in the engine). Calm register mirrors intake-decline.
  const symptom = SYMPTOM_LABEL[f.symptomType]
  const episodeNoun = f.currentCount === 1 ? 'episode' : 'episodes'

  if (f.tier === 'firm') {
    // Dense current week — symptoms on most days. Phrase the rise on the axis that
    // ACTUALLY rose (the trigger): for more_days the episode count is flat-or-FALLING
    // (density did the lifting), so an "up from {priorCount}" episode clause would be a
    // miscount — compare on days instead (adversarial review, B-reshaped firm wart).
    if (f.trigger === 'more_days') {
      return `${petName} has had ${symptom} on ${f.currentDays} of the last ${f.windowDays} days, up from ${f.priorDays} the week before — worth booking a vet visit soon.`
    }
    // more_episodes — the count rose; lead with day density, carry the episode count.
    const priorClause =
      f.priorCount === 0 ? 'after none last week' : `up from ${f.priorCount} last week`
    return `${petName} has had ${symptom} on ${f.currentDays} of the last ${f.windowDays} days (${f.currentCount} ${episodeNoun}), ${priorClause} — worth booking a vet visit soon.`
  }

  if (f.tier === 'soft') {
    // The more_days-only arm (same episode count, more spread), not dense. priorDays ≥ 1
    // by construction here (the counts are flat at ≥ worseningMinEpisodes).
    return `${petName} has had ${symptom} on ${f.currentDays} separate days this week, up from ${f.priorDays} last week — worth keeping an eye on, and a word with your vet if it carries on.`
  }

  // 'standard' — an episode-count rise, not dense.
  const priorClause =
    f.priorCount === 0 ? 'after none last week' : `up from ${f.priorCount} last week`
  return `${petName} has had ${f.currentCount} ${episodeNoun} of ${symptom} this week, ${priorClause} — worth a word with your vet.`
}

export function templatePostprandialTiming(f: PostprandialTimingFinding, petName: string): string {
  // Detector ⑤ (B-078) — template-only (no LLM, like ③/④). Names TIMING ONLY: never a
  // food/protein/brand/form (§9.1 — those ride feedingFormsInEvidence into the vet report),
  // never causal ("of eating" is a timing reference, not "because of"), never a mechanism
  // word ("regurgitation"/"eating speed" — §9.2), never inverted on a below-floor result
  // (that case never reaches here — the engine stays silent). Honest denominator: "we could
  // time" (the eligible count), never the raw episode count.
  const symptom = SYMPTOM_LABEL[f.symptomType]
  const lastTwo = f.lastTwoEligibleRapid ? ', including the last two' : ''
  return `${f.rapidCount} of the ${f.eligibleCount} ${symptom} episodes we could time for ${petName} happened within ${f.rapidWindowMinutes} minutes of eating${lastTwo} — a timing pattern worth mentioning to your vet.`
}

export function templateForFinding(finding: Finding, petName: string): string {
  switch (finding.type) {
    case 'food_symptom_correlation':
      return templateCorrelation(finding, petName)
    case 'intake_decline':
      return templateIntakeDecline(finding, petName)
    case 'reflection':
      return templateReflection(finding, petName)
    case 'symptom_worsening':
      return templateWorsening(finding, petName)
    case 'postprandial_timing':
      return templatePostprandialTiming(finding, petName)
  }
}

export function buildBuildingText(petName: string, hasRecentActivity: boolean): string {
  // Empty findings → building/stale, never an all-clear (§9). Distinguish the
  // two states so the cached single line is honest for any pre-Step-3 reader.
  if (!hasRecentActivity) {
    return `Not enough recent logs to show a pattern for ${petName} yet — log today and we'll keep building the picture.`
  }
  return `We're still getting to know ${petName} — keep logging and the first patterns will start to surface.`
}

// ── Phrasing validation (defense in depth; clinical-guardrails Pattern 8) ─────
// The template is guardrail-safe by construction; the MODEL is not. Any model
// sentence that asserts wellness on a safety finding, softens it to "picky",
// makes a causal claim on a correlation, or shouts is REJECTED to the template.
// The invariant is a code check + a test assertion, not a comment.

// Broadened after the B-051 adversarial review surfaced reassurance *synonyms* the
// model slipped past the original list ("on the mend", "thriving", "much better").
// This is a keyword screen, not a paraphrase-proof guarantee — the structural
// defense for the reflection layer is that it is phrased template-only (index.ts),
// never by the model. This list still hardens the model-phrased safety/correlation
// paths against the obvious wellness vocabulary.
const REASSURANCE_RE =
  /\b(fine|okay|ok|healthy|all clear|nothing to worry|nothing serious|probably fine|no concern|don't worry|doing great|doing well|all good|on the mend|mend|mending|thriving|recover(?:s|ed|ing)?|much better|back to normal|right track)\b/i
const DISMISSIVE_RE = /\b(picky|fussy|finicky)\b/i
const CAUSAL_RE =
  /\b(cause[sd]?|causing|because|due to|trigger(?:s|ed|ing)?|responsible for|allerg(?:y|ic)|intoleran(?:t|ce)|reacts? to|leads? to|results? in)\b/i
// Detector ⑤ (B-078) must never imply a MECHANISM — the card reports a timing pattern
// for the vet to interpret, never "regurgitation"/"reflux"/"eating speed" (§9.2 / kickoff).
const MECHANISM_RE =
  /\b(regurgitat\w*|reflux|esophag\w*|megaesophagus|eating speed|eats? too fast|wolf(?:s|ed|ing)? (?:it )?down|gulp\w*|swallow\w* too fast|bilious|empty stomach)\b/i
// …nor name a FOOD/protein/form (§9.1 — owner copy is timing-only; form rides the vet
// report). A timing claim that mentions a protein or form is a model drift back to
// attribution. "eating" is a timing reference, not a food, so it is not screened.
const FOOD_NAMING_RE =
  /\b(chicken|beef|turkey|lamb|duck|salmon|tuna|whitefish|fish|pork|rabbit|venison|bison|kibble|treats?|dry food|wet food|protein)\b/i

export function validatePhrasing(text: string, finding: Finding): boolean {
  const t = text?.trim() ?? ''
  if (t.length < 8 || t.length > 320) return false
  if (t.includes('!')) return false // nyx-voice Pattern 4 — no manufactured enthusiasm
  if (finding.priorityClass === 'safety') {
    // Never reassure on a safety flag; never reframe a decline as fussiness.
    if (REASSURANCE_RE.test(t) || DISMISSIVE_RE.test(t)) return false
  }
  if (finding.type === 'food_symptom_correlation') {
    // Associational only — the model may not assert causation.
    if (CAUSAL_RE.test(t)) return false
  }
  if (finding.type === 'reflection') {
    // A reflection is a descriptive count (B-051): it may not assert a cause, and
    // — crucially — may not reassure. "Same as last week" is a count, not an
    // all-clear; the reduction of a symptom is never a wellness verdict (§9).
    if (CAUSAL_RE.test(t) || REASSURANCE_RE.test(t)) return false
  }
  if (finding.type === 'symptom_worsening') {
    // Detector ④ is a descriptive frequency rise routed to concern. Reassurance/
    // "picky" are already barred by the safety branch above; it ALSO may not assert
    // a cause (it is frequency, never causation). Defense-in-depth: ④ is template-
    // only (index.ts) so the model is never in this loop, but if that ever changes
    // this screen still holds the never-causal line.
    if (CAUSAL_RE.test(t)) return false
  }
  if (finding.type === 'postprandial_timing') {
    // Detector ⑤ (B-078) is a descriptive TIMING count — anamnesis, never mechanism.
    // It may not assert a cause, imply a mechanism ('regurgitation'/'eating speed'),
    // name a food/protein/form (§9.1), or reassure (a below-floor result is silence,
    // never "not meal-related"). Template-only (index.ts) so the model is never in this
    // loop — but if that ever changes, this screen holds all four lines.
    if (CAUSAL_RE.test(t) || MECHANISM_RE.test(t) || FOOD_NAMING_RE.test(t) || REASSURANCE_RE.test(t)) {
      return false
    }
  }
  return true
}

// ── Curation & cap (§3.2 + §5) ────────────────────────────────────────────────
// The detection engine has already RANKED (safety first). Curation only trims
// the low/medium-priority tail to the visible cap; every safety finding stays.
export function curateFindings(ranked: RankedFinding[], cap = VISIBLE_CARD_CAP): RankedFinding[] {
  let insightCount = 0
  const kept: Finding[] = []
  for (const r of ranked) {
    if (r.finding.priorityClass === 'safety') {
      kept.push(r.finding) // never dropped — high-priority override
    } else if (insightCount < cap) {
      kept.push(r.finding)
      insightCount++
    }
  }
  return kept.map((finding, i) => ({ finding, rank: i }))
}

// ── Phrasing prompt + payload (no raw logs — only the already-true finding) ───

export function phrasingPayload(finding: Finding, petName: string): Record<string, unknown> {
  if (finding.type === 'food_symptom_correlation') {
    return {
      insight_type: 'food_symptom_correlation',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      protein: finding.protein,
      evidence_tier: finding.tier, // 'early' | 'established'
      window_hours: Math.round(finding.correlationWindowHours),
      matched_days: finding.matchedPairs,
      symptom_episodes: finding.symptomEventCount,
      relationship: 'associational', // the symptom TENDS TO FOLLOW the food; NOT causal
    }
  }
  if (finding.type === 'reflection') {
    return {
      insight_type: 'reflection',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      count_this_week: finding.currentCount,
      count_last_week: finding.priorCount,
      direction: finding.direction, // 'flat' | 'improving' (never 'worsening' — suppressed upstream)
      relationship: 'descriptive_count', // a count we are noting — NOT a cause and NOT an all-clear
    }
  }
  if (finding.type === 'symptom_worsening') {
    // Template-only (index.ts), so this payload is never actually sent to the model;
    // kept for shape-correctness and parity with the other types.
    return {
      insight_type: 'symptom_worsening',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      count_this_week: finding.currentCount,
      count_last_week: finding.priorCount,
      days_this_week: finding.currentDays,
      days_last_week: finding.priorDays,
      tier: finding.tier, // 'firm' | 'standard' | 'soft' — urgency register
      relationship: 'descriptive_count', // a frequency we are noting — NOT a cause
      severity: 'calm_safety_flag', // surface clearly, never reassure
    }
  }
  if (finding.type === 'postprandial_timing') {
    // Template-only (index.ts), so this payload is never actually sent to the model;
    // kept for shape-correctness and parity. Deliberately carries TIMING ONLY — no food
    // form (§9.1: form stays in feedingFormsInEvidence for the vet report, never the claim).
    return {
      insight_type: 'postprandial_timing',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      rapid_count: finding.rapidCount,
      eligible_count: finding.eligibleCount,
      window_minutes: finding.rapidWindowMinutes,
      including_last_two: finding.lastTwoEligibleRapid,
      relationship: 'associational_timing', // a timing pattern we are noting — NOT a cause, NOT a mechanism
    }
  }
  return {
    insight_type: 'intake_decline',
    pet_name: petName,
    trigger: finding.trigger, // 'consecutive_low' | 'refused_normal_food'
    species: finding.species,
    days_eating_less: finding.daysBelowBaseline,
    refused_food: finding.refusedFoodLabel,
    severity: 'calm_safety_flag', // surface clearly, never reassure, never "picky"
  }
}

export const PHRASE_TOOL = {
  name: 'phrase_insight',
  description:
    'Return the single owner-facing sentence for this already-verified pet-health insight.',
  input_schema: {
    type: 'object',
    properties: {
      sentence: {
        type: 'string',
        description: 'One warm, plain-language sentence for the pet owner. No exclamation marks.',
      },
    },
    required: ['sentence'],
  },
}

export const PHRASING_SYSTEM =
  'You write one sentence of copy for Nyx, a calm pet-health app. You are given ONE ' +
  'already-verified finding about a specific pet, as structured JSON. Your only job is to ' +
  'phrase it as a single, warm, plain-language sentence for the owner. You do NOT decide ' +
  'whether the finding is true — it already is. You may not add any fact, number, food, ' +
  'symptom, cause, or reassurance that is not in the JSON. Hard rules: ' +
  '(1) Use the pet\'s name; address the owner as "you". ' +
  '(2) Plain language, never clinical jargon (say "vomiting" not "emesis", "loose stool" not "diarrhea"). ' +
  '(3) No exclamation marks. Calm, never alarming, never cute. Exactly one sentence. ' +
  '(4) For a food_symptom_correlation: ASSOCIATIONAL ONLY — say the symptom "tends to follow" ' +
  'meals with the protein. NEVER say or imply the food causes, triggers, or is responsible for the ' +
  'symptom, and never call it an allergy or intolerance. If evidence_tier is "early", say it is an ' +
  'early pattern worth keeping an eye on. ' +
  '(5) For an intake_decline: surface it calmly and clearly and point toward keeping an eye on it ' +
  'and a word with the vet. NEVER reassure, NEVER say the pet is fine/okay/healthy, NEVER call the ' +
  'pet "picky" or frame eating less as fussiness. ' +
  '(6) For a reflection: state the COUNT of episodes this week and compare it to last week as a plain ' +
  'fact — "about the same as last week" when direction is "flat", "fewer than last week" when ' +
  '"improving". It is DESCRIPTIVE ONLY: NEVER suggest or imply a cause, and NEVER reassure — do not say ' +
  'the pet is fine/okay/healthy/all clear, and never imply that fewer or unchanged symptoms mean the pet ' +
  'is well. It is a count you are noting together, not a verdict. ' +
  'Call phrase_insight with your one sentence.'
