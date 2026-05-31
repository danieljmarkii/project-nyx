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

export function templateForFinding(finding: Finding, petName: string): string {
  return finding.type === 'food_symptom_correlation'
    ? templateCorrelation(finding, petName)
    : templateIntakeDecline(finding, petName)
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

const REASSURANCE_RE =
  /\b(fine|okay|ok|healthy|all clear|nothing to worry|probably fine|no concern|don't worry|doing great|all good)\b/i
const DISMISSIVE_RE = /\b(picky|fussy|finicky)\b/i
const CAUSAL_RE =
  /\b(cause[sd]?|causing|because|due to|trigger(?:s|ed|ing)?|responsible for|allerg(?:y|ic)|intoleran(?:t|ce)|reacts? to|leads? to|results? in)\b/i

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
  'Call phrase_insight with your one sentence.'
