// AI summary — deterministic fact packet, phrasing & guardrails (B-023 PR 4).
//
// The "Patterns" dashboard's AI-forward centerpiece (requirements §7): a short, warm
// narrative pinned at the top of the dashboard that synthesises the already-computed
// cards into a few plain sentences. This is the PURE half — kept free of remote/Deno
// imports (mirroring detection.ts / phrasing.ts) so it is unit-testable offline. It owns
// everything EXCEPT the live Claude call and DB I/O (those live in index.ts):
//   - buildSummaryPacket — assemble a DETERMINISTIC fact packet from the already-true
//     findings + server-side descriptive aggregates (the PR-1 metric set, recomputed
//     server-side over the same in-memory event arrays the detection engine used).
//   - summaryTemplate    — the deterministic multi-sentence fallback (and validation floor).
//   - summaryModelPayload + SUMMARY_TOOL/SUMMARY_SYSTEM — the model is handed the
//     already-true DRAFT sentences and asked only to JOIN + SMOOTH them, never to compute,
//     rank, or infer. (The §7 governing principle: "LLM as Phraser, never Analyst.")
//   - validateSummary    — defense-in-depth against model drift (clinical-guardrails
//     Pattern 8): reject any number not in the packet, any reassurance (incl. on absence),
//     any causal claim, any preference framing, any disease name, and — on a safety
//     summary — the silent removal of the "talk to your vet" routing.
//
// THE GROUNDING ARCHITECTURE (why this is safe). The summary's allowed-number set is
// derived FROM the deterministic clause text itself, so:
//   (a) the deterministic template trivially passes validateSummary, and
//   (b) the model may only re-use numbers that already appear in a true clause — anything
//       it invents falls outside the set and is rejected to the template.
// The model never sees a raw event log and never composes from raw fields; it smooths a
// list of already-true sentences. This is the WHOOP-weekly-narrative shape, the safest use
// of an LLM for this job (research §4.3), and it keeps the summary on the right side of
// every documented health-AI failure (Google liver-test retraction, Eight Sleep causal
// inference) precisely because the model never touches the math or the causation.
//
// GROUNDING BOUNDARY (v1, flagged for PM/adversarial review): the summary narrates only
// what the dashboard SHOWS — the symptom trajectory (counts + the symptom_worsening /
// intake_decline SAFETY findings, backed by the count + intake cards) and the descriptive
// intake story (top protein, finished-rate). Correlations and the timing detectors (⑤/⑥)
// live on the Home Signal, have NO dashboard card to back them in v1, and are deliberately
// NOT narrated here (§7 grounding: every claim is backed by a card the owner can see).
//
// Voice per nyx-voice; the n=1 / never-reassure-on-absence asymmetry per clinical-guardrails
// + §7/§11 of the requirements doc.

import type { Finding, MealEvent, SymptomEvent } from './detection.ts'
import { intakeScore } from './detection.ts'
import { SYMPTOM_LABEL, templateForFinding } from './phrasing.ts'
import { canonicalizeProtein } from './protein.ts'

const MS_PER_DAY = 86_400_000

// The dashboard's default range is the trailing-30-calendar-day "month" (requirements
// §13 #2). Trailing CALENDAR days, day-aligned (the B-084 lesson) — not a raw ms span,
// which would straddle one extra calendar day at a non-midnight `now`.
const MONTH_WINDOW_DAYS = 30

// Min-sample floors. MIRROR lib/analytics.ts ANALYTICS_FLOORS (which itself mirrors the
// Signal's intake baseline) so the summary's descriptive aggregates and the client cards
// share ONE floor and can never disagree — "top protein off 3 meals is noise" (§11 #5).
const MIN_MEALS_FOR_RANKING = 4
const MIN_RATED_MEALS_FOR_INTAKE_RATE = 4
// A meal is "finished" when rated `most` or `all` (intakeScore ≥ 3) — mirrors
// lib/analytics.ts FINISHED_SCORE.
const FINISHED_SCORE = 3

// Defensive bounds on the rendered summary (validateSummary). A real 2–4 sentence summary
// is comfortably inside these; they exist only to reject a degenerate / runaway model reply.
const MIN_SUMMARY_LEN = 20
const MAX_SUMMARY_LEN = 600
const MIN_SUMMARY_SENTENCES = 1 // a single strong safety sentence is a valid summary
const MAX_SUMMARY_SENTENCES = 4 // §7 caps the narrative at four sentences

// ── Trailing calendar month window ───────────────────────────────────────────────────

/** [startMs, endMs) for the trailing MONTH_WINDOW_DAYS calendar days ending on `now`'s UTC
 *  day. Day-aligned on both edges (exactly windowDays wide regardless of time-of-day),
 *  mirroring lib/analytics.ts calendarWindow('month'). */
export function monthWindowBounds(nowMs: number): { startMs: number; endMs: number } {
  const todayIndex = Math.floor(nowMs / MS_PER_DAY)
  return {
    startMs: (todayIndex - (MONTH_WINDOW_DAYS - 1)) * MS_PER_DAY,
    endMs: (todayIndex + 1) * MS_PER_DAY,
  }
}

// ── Number extraction (the grounding primitive) ────────────────────────────────────────
// Every number the summary may legitimately contain is derived from the deterministic
// clause text via this same extractor; validateSummary runs it over the model output and
// rejects any value not in that derived set. Handles both digit runs and the small
// number-WORDS the finding templates emit (e.g. templateIntakeDecline → "the last three
// days" via phrasing.ts numWord).

// Comprehensive cardinal map — NOT just the small words the templates emit, because the
// MODEL can spell out any integer. A short map (zero..twelve) let "thirteen days" escape
// grounding entirely (adversarial review, Claim 4a); this covers every spelled integer a
// summary could plausibly carry, so an out-of-range spelled number resolves to a value that
// then fails the allowed-set check rather than vanishing.
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, dozen: 12,
}

/** All numeric values appearing in `text` — digit runs (integer part) AND spelled number-
 *  words. Returns a Set for membership checks. A compound like "twenty-one" surfaces both 20
 *  and 1; if neither is in the allowed set the summary is rejected, which is the safe
 *  direction. Word-boundaried so "someone"/"once" never match "one", "tone" never "ten". */
export function extractNumbers(text: string): Set<number> {
  const out = new Set<number>()
  const digits = text.match(/\d+/g)
  if (digits) for (const d of digits) out.add(parseInt(d, 10))
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) out.add(value)
  }
  return out
}

/** Count of sentence-terminated segments — a coarse but robust sentence count. The
 *  clauses never contain abbreviations ("Dr.", "e.g.") or decimals, so splitting on
 *  terminal punctuation is exact for our copy. */
function sentenceCount(text: string): number {
  return text.split(/[.?!]+/).map((s) => s.trim()).filter((s) => s.length > 0).length
}

// ── Guardrail vocabulary (defense-in-depth; clinical-guardrails Pattern 8) ─────────────
// The deterministic template is guardrail-safe BY CONSTRUCTION; the MODEL is not. These
// mirror phrasing.ts validatePhrasing (which is not exported) and ADD the two summary-
// specific screens the kickoff names: preference framing (§11 #1 — intake is never
// "preference") and disease names (the FDA general-wellness line — §4.3 / §7).

// Reassurance vocabulary. The summary may NEVER reassure: not on a safety finding, and never
// on the ABSENCE of one ("absence ≠ wellness", the Google liver-test retraction, §7). The
// deterministic clauses carry none of this, so the template always passes; a model reply that
// drifts here falls back. SUBSTANTIALLY broadened after the PR-4 adversarial review found the
// lay/warm vocabulary a consumer model actually reaches for slipping past the original list
// (Claim 1): "settled", "steady", "great appetite", "nothing stood out", "good to see", etc.
// Keyword screens are not paraphrase-proof — restraint on the high-stakes cases (safety/quiet
// → template-only, shouldPhraseWithModel) is the structural backstop; this list hardens the
// one remaining model path (the non-safety reflection summary).
const REASSURANCE_RE =
  /\b(fine|okay|ok|healthy|health(?:ily)?|all clear|clean bill|nothing to (?:worry|flag|fear|report)|nothing (?:serious|concerning|of concern|amiss|wrong|to be concerned)|nothing (?:has |that )?stood out|probably fine|no (?:concerns?|issues?|problems?|worries|red flags?|cause for concern|news is good news)|don'?t worry|doing (?:great|well|fine|good|fab\w*)|all good|on the mend|mend|mending|thriving|flourish\w*|recover(?:s|ed|ing|y)?|much better|back to normal|right track|in (?:good|great|fine) (?:shape|health|form|spirits)|reassur\w*|rest easy|peace of mind|settled|steady|stable|comfortable|content|happy|encouraging|good (?:news|sign|to see)|looking (?:good|great|well|healthy)|looks? (?:good|great|fine|healthy)|as it should be|everything (?:in order|looks|is fine|is good|checks out)|in order|(?:strong|robust|great|good|healthy|hearty) appetite|(?:strong|good|hearty|enthusiastic) eater|eating (?:well|beautifully|great|nicely|happily|like a champ)|under control|no big deal|all is well|well overall|improv\w*|\bbetter\b|turn(?:ed|ing)? (?:a )?corner|good place|brighter|no need to (?:worry|fret|stress))\b/i
// Preference framing — intake is descriptive, NEVER a preference/like/favourite (§11 #1).
// Broadened after the review (Claim 6): "choosy", "selective", "turns up their nose",
// "drawn to", "craves", "gravitates", "goes for", "fan of" all slipped the original list.
const PREFERENCE_RE =
  /\b(picky|fussy|finicky|choos(?:y|ey)|select(?:ive)?|prefer(?:s|red|ence)?|favou?rite|likes?|loves?|enjoy(?:s|ed)?|fond of|keen on|partial to|fan of|drawn to|crav(?:e|es|ing)|gravitat\w*|turns? up (?:his|her|its|their|the)? ?nose|go(?:es|ing)? for|reach(?:es|ing)? for|tucks? into|wolf(?:s|ed|ing)? down|gobble\w*|devour\w*|happily eat\w*|chow(?:s|ed|ing)? down|scarf\w*)\b/i
// Causal claims — the summary is descriptive/associational, never causal (§4.3 / §7).
// Broadened after the review (Claim 2 — the Eight-Sleep bug): "linked to", "tied to", "set
// off by", "brought on by", "stems from", "sensitive to", "not tolerating", "making sick".
const CAUSAL_RE =
  /\b(cause[sd]?|causing|because|due to|trigger(?:s|ed|ing)?|responsible for|allerg(?:y|ic|ies)|intoleran(?:t|ce)|reacts? to|reaction to|leads? to|results? in|owing to|thanks to|link(?:s|ed)? to|connect(?:s|ed)? to|tied to|set off|sets off|brought on|bring(?:s|ing)? on|stem(?:s|med|ming)? from|lines? up with|in response to|attributable to|blam(?:e|ed|ing) (?:on|it)|culprit|sensitive to|sensitivity to|not agreeing|doesn'?t agree|tolerat\w*|disagree(?:s|d|ing)? with|mak(?:e|es|ing) \w+ sick|agree(?:s|d)? with|help(?:s|ing|ed)|switch(?:es|ed|ing)?|from (?:the |her |his |their |its )?(?:new )?(?:food|diet|treats?|kibble))\b/i
// Disease / diagnosis names — the FDA general-wellness charter: don't name a disease, don't
// assert abnormality (§4.3). Both the CLINICAL terms and — added after the PR-4 review
// (Claim 2) — the LAY vocabulary a consumer model actually reaches for ("tummy bug",
// "sensitive stomach", "food poisoning", "something they ate", "hairball", "unwell").
// "condition" is deliberately excluded (too common a benign word).
const DISEASE_RE =
  /\b(pancreatitis|gastritis|gastroenteritis|enteritis|colitis|ibd|inflammatory bowel|hepatic lipidosis|lipidosis|hepatitis|cholangitis|kidney disease|renal (?:disease|failure|insufficiency)|ckd|diabet\w*|hyperthyroid\w*|hypothyroid\w*|thyroid|cancer|tumou?r|lymphoma|neoplas\w*|carcinoma|ulcer\w*|obstruction|blockage|foreign body|megaesophagus|reflux|anaemia|anemia|addison\w*|cushing\w*|parvo\w*|giardia|parasit\w*|infection|infected|gastroparesis|disease|illness|disorder|syndrome|diagnos\w*|(?:tummy|stomach|gut) (?:bug|upset|issues?|trouble|problems?)|(?:tummy|stomach) ache|upset (?:tummy|stomach)|sensitive (?:tummy|stomach)|food poisoning|gi (?:upset|issues?|problems?|trouble)|something (?:he|she|they|it) ate|hairball\w*|unwell|under the weather|off colou?r|\bsick\b|\bbug\b)\b/i

// ── The fact packet ────────────────────────────────────────────────────────────────────

/** Which dashboard area backs a clause — lets the client render tappable "based on the
 *  cards below" grounding. Coarse (per-area, not per-claim) because v1 cards are
 *  display-only; per-card deep-linking lands with the card→detail follow-up (B-093). */
export type SummaryEvidenceKind = 'symptom' | 'intake'

export interface SummaryFactPacket {
  petName: string
  /** Already-true sentences, in display order. The template is these joined; the model is
   *  asked only to smooth them. Each is guardrail-safe by construction. */
  clauses: string[]
  /** Every number that may legitimately appear in the phrased summary — derived FROM the
   *  clauses, so the template passes validateSummary and the model can introduce no new ones. */
  allowedNumbers: number[]
  /** Distinct dashboard areas the summary draws from (for the grounding affordance). */
  evidence: SummaryEvidenceKind[]
  /** A safety finding (intake_decline / symptom_worsening) drives the summary — gates the
   *  mandatory vet-routing check in validateSummary and the omission of any intake stat that
   *  could read as reassurance alongside a concern. */
  hasSafety: boolean
  /** No finding drove the summary — it is purely descriptive/intake. Tunes the model's tone. */
  quiet: boolean
}

/** The cached summary shape (migration 018 ai_signals.summary). Null when there is nothing
 *  substantive to summarise — the client then renders its own "still gathering" state. */
export interface CachedSummary {
  text: string
  /** Provenance for observability — did the model phrasing pass, or did we fall back? */
  source: 'model' | 'template'
  evidence: SummaryEvidenceKind[]
  hasSafety: boolean
  quiet: boolean
}

// ── Descriptive intake aggregates (server-side mirror of the PR-1 cards) ───────────────
// Computed over the in-window meals the detection engine already loaded — NOT a second DB
// read. Each mirrors lib/analytics.ts exactly (same floors, same treat/free-fed exclusions,
// same canonicalization) so the summary's numbers match the cards it sits above.

/** Most-logged MEAL protein this month, canonicalized. Treats excluded (a treat's filler
 *  protein shouldn't dominate "what protein does Nyx eat" — §6.B / mirrors
 *  computeTopProteins). Below MIN_MEALS_FOR_RANKING identified meals → null. */
function topMealProtein(meals: MealEvent[]): { protein: string; count: number } | null {
  const byProtein = new Map<string, number>()
  let identified = 0
  for (const m of meals) {
    if (m.foodType === 'treat') continue
    const key = canonicalizeProtein(m.primaryProtein)
    if (key === null) continue
    identified += 1
    byProtein.set(key, (byProtein.get(key) ?? 0) + 1)
  }
  if (identified < MIN_MEALS_FOR_RANKING) return null
  let best: { protein: string; count: number } | null = null
  for (const [protein, count] of byProtein) {
    if (!best || count > best.count || (count === best.count && protein < best.protein)) {
      best = { protein, count }
    }
  }
  return best
}

/** Finished-rate over MEALS ONLY (§11 #1 — treats finish at a ceiling rate and would mask a
 *  meal refusal), free-fed excluded (§11 #6 — a free-fed bowl's intake isn't directly
 *  observed). Mirrors computeIntakeRate. Below the rated-meal floor → null. */
function finishedMealRate(
  meals: MealEvent[],
  freeFedFoodIds: ReadonlySet<string>,
): { finished: number; rated: number } | null {
  const denominator = meals.filter(
    (m) =>
      m.foodType !== 'treat' &&
      m.intakeRating != null &&
      !(m.foodItemId !== null && freeFedFoodIds.has(m.foodItemId)),
  )
  if (denominator.length < MIN_RATED_MEALS_FOR_INTAKE_RATE) return null
  const finished = denominator.filter((m) => intakeScore(m.intakeRating!) >= FINISHED_SCORE).length
  return { finished, rated: denominator.length }
}

/** Top adverse symptom by raw count in the month window (the descriptive fallback lead when
 *  no finding fired). Raw count — matches the count card the owner can scroll, never
 *  episode-collapsed (that's a correlation refinement). Returns null when nothing is logged. */
function topSymptomThisMonth(
  symptomEvents: SymptomEvent[],
  startMs: number,
  endMs: number,
): { type: string; count: number } | null {
  const counts = new Map<string, number>()
  for (const s of symptomEvents) {
    const ms = Date.parse(s.occurredAt)
    if (!Number.isFinite(ms) || ms < startMs || ms >= endMs) continue
    if (!(s.type in SYMPTOM_LABEL)) continue
    counts.set(s.type, (counts.get(s.type) ?? 0) + 1)
  }
  let best: { type: string; count: number } | null = null
  for (const [type, count] of counts) {
    if (!best || count > best.count || (count === best.count && type < best.type)) {
      best = { type, count }
    }
  }
  return best
}

// ── Deterministic clause builders ──────────────────────────────────────────────────────

function descriptiveSymptomClause(type: string, count: number, petName: string): string {
  // Descriptive count only — no prior, no trend (reflection ③ / worsening ④ own trends),
  // no reassurance, no cause. Honest absolute count from the card the owner can scroll.
  const label = SYMPTOM_LABEL[type as keyof typeof SYMPTOM_LABEL] ?? type
  const noun = count === 1 ? 'episode' : 'episodes'
  return `I've logged ${count} ${noun} of ${label} for ${petName} this month.`
}

function proteinClause(protein: string, petName: string): string {
  // Descriptive INTAKE, never preference (§11 #1): "most-logged", not "favourite"/"prefers".
  // No count in the clause (the card carries it) — fewer numbers, less grounding surface.
  const title = protein.charAt(0).toUpperCase() + protein.slice(1)
  return `${title} was ${petName}'s most-logged meal protein this month.`
}

function finishedRateClause(finished: number, rated: number, petName: string): string {
  // Descriptive count of finished meals. Only ever included when NO safety finding leads
  // (buildSummaryPacket) — a healthy-looking month rate must never dilute a current concern.
  return `${petName} finished most or all of ${finished} of ${rated} logged meals this month.`
}

function forwardTail(petName: string, hasSafety: boolean): string {
  // A warm, number-free forward-looking close so a single-clause summary still reads as a
  // summary (≥2 sentences) and the deterministic fallback never ends abruptly. Never
  // reassures; on a safety summary it reinforces watching, not "all clear".
  return hasSafety
    ? `I'll keep an eye on ${petName}'s logs with you.`
    : `Keep logging and I'll keep building the picture for ${petName}.`
}

// ── Packet assembly ────────────────────────────────────────────────────────────────────

export interface BuildSummaryArgs {
  petName: string
  /** The curated, ranked findings (safety first) the function is caching this run. */
  findings: Finding[]
  /** All in-lookback meals (mapped) — filtered to the month window here. */
  mealEvents: MealEvent[]
  /** All in-lookback symptom events (mapped) — filtered to the month window here. */
  symptomEvents: SymptomEvent[]
  /** Food ids currently free-fed for this pet (intake-rate exclusion, §11 #6). */
  freeFedFoodIds: ReadonlySet<string>
  nowMs: number
}

/**
 * Assemble the deterministic fact packet, or null when there is nothing substantive to
 * summarise (the client then owns the "still gathering" state — no server/client duplicate
 * building copy). Clause priority, capped at MAX_SUMMARY_SENTENCES:
 *   1. SAFETY findings (intake_decline, symptom_worsening) — verbatim from their already-
 *      guardrail-safe templates; NEVER dropped (Principle 3). Sets hasSafety.
 *   2. else a reflection finding's descriptive count.
 *   3. else, if symptoms were logged this month, a descriptive symptom count.
 *   4. the intake story (top protein always; finished-rate only when no safety leads).
 *   5. a forward-looking tail when fewer than two substantive clauses, so the fallback reads
 *      as a summary.
 */
export function buildSummaryPacket(args: BuildSummaryArgs): SummaryFactPacket | null {
  const { petName, findings, mealEvents, symptomEvents, freeFedFoodIds, nowMs } = args
  const { startMs, endMs } = monthWindowBounds(nowMs)

  const clauses: string[] = []
  const evidence = new Set<SummaryEvidenceKind>()
  let hasSafety = false
  let hasSymptomClause = false

  // 1. Safety findings — verbatim from the deterministic, guardrail-safe templates. In
  //    ranked order (the engine already ranks decline above worsening). Never dropped.
  for (const f of findings) {
    if (f.priorityClass !== 'safety') continue
    clauses.push(templateForFinding(f, petName))
    hasSafety = true
    hasSymptomClause = true
    evidence.add(f.type === 'intake_decline' ? 'intake' : 'symptom')
  }
  // Safety clauses are pushed first; this count lets the cap below never drop one (it only
  // trims trailing intake) — the invariant holds by construction, not by relying on the
  // engine's current ≤3-safety-findings emit count (adversarial review, latent cap finding).
  const safetyClauseCount = clauses.length

  // 2. else a reflection (flat/improving descriptive count).
  if (!hasSymptomClause) {
    const reflection = findings.find((f) => f.type === 'reflection')
    if (reflection) {
      clauses.push(templateForFinding(reflection, petName))
      hasSymptomClause = true
      evidence.add('symptom')
    }
  }

  // 3. else a descriptive symptom count from the card (only if something was logged).
  if (!hasSymptomClause) {
    const top = topSymptomThisMonth(symptomEvents, startMs, endMs)
    if (top) {
      clauses.push(descriptiveSymptomClause(top.type, top.count, petName))
      evidence.add('symptom')
    }
  }

  // 4. Intake story. Top protein always (neutral, descriptive); finished-rate only when no
  //    safety finding leads — a good-looking month rate must never sit next to a concern and
  //    read as reassurance.
  const inWindowMeals = mealEvents.filter((m) => {
    const ms = Date.parse(m.occurredAt)
    return Number.isFinite(ms) && ms >= startMs && ms < endMs
  })
  const protein = topMealProtein(inWindowMeals)
  if (protein && clauses.length < MAX_SUMMARY_SENTENCES) {
    clauses.push(proteinClause(protein.protein, petName))
    evidence.add('intake')
  }
  if (!hasSafety && clauses.length < MAX_SUMMARY_SENTENCES) {
    const rate = finishedMealRate(inWindowMeals, freeFedFoodIds)
    if (rate) {
      clauses.push(finishedRateClause(rate.finished, rate.rated, petName))
      evidence.add('intake')
    }
  }

  // Nothing substantive — let the client render its own building state.
  if (clauses.length === 0) return null

  // 5. Forward-looking tail so a lone clause still reads as a 2-sentence summary.
  if (clauses.length < 2) clauses.push(forwardTail(petName, hasSafety))

  // Cap to MAX_SUMMARY_SENTENCES, but NEVER drop a safety clause (Principle 3 > the layout
  // cap): keep every safety clause, then fill the remaining slots with trailing intake. In
  // the (unreachable) event safety clauses alone exceed the cap, they all still ship — an
  // over-long safety summary beats a dropped concern.
  const kept = [
    ...clauses.slice(0, safetyClauseCount),
    ...clauses.slice(safetyClauseCount, Math.max(safetyClauseCount, MAX_SUMMARY_SENTENCES)),
  ]

  // Derive the allowed-number set FROM the kept clauses — the grounding contract.
  const allowed = new Set<number>()
  for (const c of kept) for (const n of extractNumbers(c)) allowed.add(n)

  return {
    petName,
    clauses: kept,
    allowedNumbers: [...allowed],
    evidence: [...evidence],
    hasSafety,
    quiet: !hasSafety && !findings.some((f) => f.type === 'reflection'),
  }
}

// ── Deterministic template (fallback AND validation floor) ─────────────────────────────

export function summaryTemplate(packet: SummaryFactPacket): string {
  return packet.clauses.join(' ')
}

// ── Model payload + prompt (join/smooth ONLY — never compute) ──────────────────────────

export function summaryModelPayload(packet: SummaryFactPacket): Record<string, unknown> {
  return {
    pet_name: packet.petName,
    // The already-true sentences to weave together. The model rewrites for FLOW only.
    draft_sentences: packet.clauses,
    has_safety_concern: packet.hasSafety,
  }
}

export const SUMMARY_TOOL = {
  name: 'write_summary',
  description:
    'Return the owner-facing dashboard summary, woven from the provided already-true draft sentences.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'Two to four warm, plain-language sentences for the pet owner. No exclamation marks.',
      },
    },
    required: ['summary'],
  },
}

export const SUMMARY_SYSTEM =
  'You write the short summary at the top of Nyx, a calm pet-health app. You are given an ' +
  'ordered list of ALREADY-TRUE draft sentences about one specific pet. Your ONLY job is to ' +
  'weave them into a cohesive, warm summary of two to four sentences. You do NOT decide what ' +
  'is true, you do NOT compute or change any number, and you do NOT add any fact, number, ' +
  'food, symptom, cause, or reassurance that is not in the draft. Hard rules: ' +
  '(1) Use the pet\'s name; address the owner as "you". Plain language, never clinical jargon. ' +
  '(2) Preserve every number EXACTLY as written, attached to the SAME thing it describes, and ' +
  'keep each fact\'s time frame exactly ("this week" stays "this week", "this month" stays ' +
  '"this month"). Do not merge or recompute numbers. ' +
  '(3) No exclamation marks. Calm, never alarming, never cute. ' +
  '(4) NEVER reassure: never say or imply the pet is fine, okay, healthy, well, improving, or ' +
  'that the absence of a symptom means anything good. A quiet stretch is an observation, not an ' +
  'all-clear. ' +
  '(5) NEVER state or imply a cause, and never name a disease, condition, or diagnosis. ' +
  '(6) Intake is descriptive only — never call the pet "picky" or describe a food as a ' +
  'preference, favourite, or something the pet "likes". ' +
  '(7) If any draft sentence mentions the vet, KEEP that guidance in your summary. ' +
  'Call write_summary with your two-to-four-sentence summary.'

// ── Restraint: whether/which summaries the model phrases ───────────────────────────────
/**
 * v1 KILL-SWITCH: the AI summary ships TEMPLATE-ONLY. The model is not called at all.
 *
 * Two adversarial-review rounds showed `validateSummary`'s keyword screens cannot, on their
 * own, contain LLM drift on this surface: round 1 broke the safety/quiet paths (causal,
 * disease, number-swap inversion, reassurance-on-absence); round 2, after those paths were
 * made template-only, still broke the remaining reflection path (wellness verdicts like
 * "turned a corner", causal "the diet is helping", preference "wolfs down" all slipped the
 * broadened screens). The summary is a 2–3-clause DESCRIPTIVE COUNT whose deterministic
 * template already reads cleanly — so, exactly as `phraseFinding` (index.ts) already does for
 * every other count-statement finding (reflection ③ / worsening ④ / postprandial ⑤ /
 * time-of-day ⑥), we phrase it template-only and close the model path entirely rather than
 * playing keyword whack-a-mole. The model machinery + `validateSummary` are RETAINED, tested,
 * and gated off behind this one flag, ready to re-enable once a fact-bound (non-keyword)
 * grounding check exists OR the PM ratifies the residual.
 *
 * NOTE: this is a deviation from the kickoff's "phrase it with Haiku" directive — made under
 * the non-negotiable clinical-guardrails (never reassure / never causal), the project's own
 * template-only precedent for count statements, and the explicit recommendation of the
 * mandated adversarial review. Flagged for PM ratify/override.
 */
export const SUMMARY_MODEL_PHRASING_ENABLED = false

/**
 * Whether a packet is ELIGIBLE for model phrasing by SAFETY POLICY (separate from the v1
 * kill-switch above). SAFETY and QUIET summaries are never model-eligible: the concern copy
 * must be deterministic (as detection.ts templates worsening/decline), and a quiet summary
 * has no safety signal to warm up so every model sentence there is pure downside. Only a
 * non-safety reflection summary is eligible. The Edge Function gates the model call on BOTH
 * this AND `SUMMARY_MODEL_PHRASING_ENABLED`, so re-enabling the model never re-opens the
 * safety/quiet paths.
 */
export function shouldPhraseWithModel(packet: SummaryFactPacket): boolean {
  return !packet.hasSafety && !packet.quiet
}

// ── Validation (defense-in-depth; clinical-guardrails Pattern 8) ───────────────────────

/**
 * True iff the model's summary is safe to ship. Rejects (→ deterministic template):
 *   - structural: empty / too short / too long / has "!" / wrong sentence count.
 *   - any number not present in packet.allowedNumbers (the grounding contract — no
 *     fabricated or recomputed figure).
 *   - any reassurance (incl. on absence), preference framing, causal claim, or disease name.
 *   - on a safety summary: the silent removal of the "talk to your vet" routing.
 * The deterministic template passes by construction (allowedNumbers is derived from it and
 * the clauses carry none of the banned vocabulary) — verified by a test.
 */
export function validateSummary(text: string, packet: SummaryFactPacket): boolean {
  const t = (text ?? '').trim()
  if (t.length < MIN_SUMMARY_LEN || t.length > MAX_SUMMARY_LEN) return false
  if (t.includes('!')) return false // nyx-voice — no manufactured enthusiasm
  const sentences = sentenceCount(t)
  if (sentences < MIN_SUMMARY_SENTENCES || sentences > MAX_SUMMARY_SENTENCES) return false

  if (REASSURANCE_RE.test(t)) return false
  if (PREFERENCE_RE.test(t)) return false
  if (CAUSAL_RE.test(t)) return false
  if (DISEASE_RE.test(t)) return false

  // A safety summary must keep routing the owner to the vet — the model may not smooth the
  // concern into a bare observation. The template always says "vet" on a safety summary.
  if (packet.hasSafety && !/\bvet\b/i.test(t)) return false

  // Grounding: every number in the output must trace to a true clause.
  const allowed = new Set(packet.allowedNumbers)
  for (const n of extractNumbers(t)) {
    if (!allowed.has(n)) return false
  }
  return true
}
