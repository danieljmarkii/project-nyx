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
  SymptomChronicityFinding,
  PostprandialTimingFinding,
  EmptyStomachTimingFinding,
  TimingStoryFinding,
  TrialResponseFinding,
  GapShorteningFinding,
  TimeOfDayClusteringFinding,
  IncidentRedFlagFinding,
  IncidentFlagKind,
  IncidentCategory,
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
  if (f.jointCandidate) {
    // JOINT CANDIDATE (B-351 slice 6, D5). These proteins are always fed together in
    // this pet's logs, so the matched set cannot tell them apart — and the sentence must
    // not pretend otherwise. Two rules govern this copy:
    //   • Name EVERY member, never a representative. Naming one would credit it falsely
    //     AND exonerate the other by omission, on the wedge's own surface.
    //   • End on the ACTION, not the ambiguity (D5: "action-led, never ambiguity-led").
    //     "We can't separate them" is a dead end for an owner; "feed one without the
    //     other" is the one thing that actually resolves it — and it resolves it in the
    //     engine too, since a single window where they differ splits the cluster.
    // Deliberately NOT causal ("tended to follow", never "trigger"/"reaction") and
    // deliberately never reassuring about the un-named member — there is no un-named
    // member.
    const lead =
      f.tier === 'established'
        ? `${petName}'s ${symptom} has tended to follow meals with ${f.protein}, across ${f.matchedPairs} matched days of logs`
        : `${petName}'s ${symptom} has tended to follow meals with ${f.protein} within about ${window} hours`
    // The ACTION is chosen by the engine, never here (f.jointGuidance). On an active diet
    // trial the app must not tell the owner to vary a vet-directed elimination diet — it
    // routes them to the person who can actually change it. `ask_vet` is also the honest
    // default for an unset/unknown guidance, so a finding cached before this field existed
    // degrades to the safe branch rather than the trial-breaking one.
    if (f.jointGuidance === 'feed_apart') {
      // Deliberately "start to separate them", not "tell them apart": separation only
      // registers on a day the matcher selects as a case or control window, so the owner
      // may feed them apart once and see nothing change. Promising a result we cannot
      // guarantee on the next regeneration would be a promise the engine can silently break.
      return `${lead} — they're always fed together, so feeding one without the other is what would start to separate them.`
    }
    return `${lead} — they're always fed together, so which one it is isn't clear yet. Worth raising with your vet before changing anything.`
  }
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
    // SR-4 falling-comparison density gate (B-721 §3.3). A FALLING reflection states its
    // week-over-week comparison ONLY when this week was logged with density comparable to
    // last week. When density FELL (`density.comparable === false`), the "down from N last
    // week" clause is WITHHELD — a quieter-looking week may just be a less-logged one, and
    // minting a reassuring fall out of that is exactly the false reassurance §3.3 forbids
    // (fail-toward-escalation: withhold, never soften). The client (SR-5) says why in the
    // expanded state. The gate fires ONLY on an explicit `comparable === false`, so an
    // ABSENT `density` (an old cached finding, or a null compute) renders the comparison
    // exactly as before SR-4 — the gate can only ever REMOVE a comparison, never add one,
    // which is why it is safe flag-on AND flag-off (§7). Only the FALLING arm is gated: a
    // flat "about the same" is not a reassuring claim of improvement (§3.2 — falling only).
    if (f.density?.comparable === false) {
      return `We've logged ${f.currentCount} ${noun} of ${symptom} for ${petName} this week.`
    }
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

// UTC month names for the chronicity "since {month}" anchor (UTC, matching the engine's
// UTC day-bucketing). A concrete, trust-building, non-clinical onset anchor (§4.1).
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
function onsetMonth(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'then' : MONTH_NAMES[d.getUTCMonth()]
}

// A concrete "Month Day" anchor (UTC, matching onsetMonth's UTC bucketing) for the red-flag card.
// UTC here can be off-by-one from the owner's local date at the day boundary; the PR-2 copy pass
// (with the pet's timezone in hand) localizes it — this template ships the safe, honest UTC day.
function onsetDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'a recent day'
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`
}

// Plain, calm phrasing for each visible red-flag kind — "possible" because these are AI reads of
// a single photo, not confirmed findings (matches the detail-screen "AI · unconfirmed" register).
const INCIDENT_FLAG_PHRASE: Record<IncidentFlagKind, string> = {
  blood: 'possible blood',
  foreign_material: 'possible foreign material',
}

// Owner-facing noun for a per-incident red-flag card, by family (B-340 vomit / B-364 stool). NOT
// SYMPTOM_LABEL: stool must read the NEUTRAL "stool", never "loose stool" — blood is a red flag in a
// FORMED stool as much as in diarrhoea (the finding's family collapses stool_normal + diarrhea), so
// the card must not assert a consistency it didn't measure. "vomiting" matches SYMPTOM_LABEL.vomit.
const INCIDENT_NOUN: Record<IncidentCategory, string> = {
  vomit: 'vomiting',
  stool: 'stool',
}

export function templateIncidentRedFlag(f: IncidentRedFlagFinding, petName: string): string {
  // Detector — per-incident visual red flag (B-340). SAFETY class, template-only (no LLM, like
  // ③–⑦) — a structural never-reassure guarantee. ESCALATE-ON-PRESENCE: it names what the photo
  // showed and routes to the vet. NEVER reassures, NEVER diagnoses, NEVER assigns a cause ("showed
  // possible blood" is a visible finding, not "the food caused it"). "Possible" keeps it an
  // unconfirmed AI read. Derived upstream from the owner-editable structured fields, so an owner
  // override clears the card by construction. Finalized voice is PR 2 (Designer + Dr. Chen +
  // nyx-voice); this template is the guardrail-clean floor + the deterministic fallback.
  const symptom = INCIDENT_NOUN[f.incidentType] // 'vomiting' | 'stool' (neutral — never "loose stool")
  const phrase =
    f.flags.length === 2
      ? `${INCIDENT_FLAG_PHRASE.blood} and ${INCIDENT_FLAG_PHRASE.foreign_material}`
      : INCIDENT_FLAG_PHRASE[f.flags[0]]
  const when = onsetDay(f.mostRecentFlaggedIso)
  const lead =
    f.flaggedIncidentCount === 1
      ? `A photo you logged of ${petName}'s ${symptom} showed ${phrase}, on ${when}`
      : `Photos you logged of ${petName}'s ${symptom} have shown ${phrase}, most recently on ${when}`
  return `${lead} — worth a call to your vet. This is a read of your logs, not a diagnosis.`
}

export function templateChronicity(f: SymptomChronicityFinding, petName: string): string {
  // Detector ⑦ (B-182) — template-only (no LLM, like ③/④/⑤/⑥), a structural never-reassure
  // guarantee. Names DURATION + RECURRENCE + COUNT, routed to the vet. NEVER causal, never a
  // mechanism/severity verdict, never a diagnosis, never reassures. The honest denominator is
  // ACTIVE WEEKS over the lookback ("N of the last M weeks"), never an implied continuity the
  // data can't support; "since {month}" anchors the first logged onset (concrete, trust-building,
  // non-clinical — §4.1). Urgency rides the resolved tier (duration-anchored, decided in the
  // engine). Finalized voice (PR 3 — Designer + Dr. Chen + nyx-voice); the matching client copy
  // (metricText/evidenceText) lives in lib/signalCopy.ts and validatePhrasing screens this path.
  const symptom = SYMPTOM_LABEL[f.symptomType]
  const windowWeeks = Math.round(f.windowDays / 7)
  const noun = f.episodeCount === 1 ? 'episode' : 'episodes'
  const vetAsk = f.tier === 'firm' ? 'worth booking a vet visit' : 'worth a word with your vet'
  return `We've logged ${symptom} for ${petName} across ${f.activeWeeks} of the last ${windowWeeks} weeks — ${f.episodeCount} ${noun} since ${onsetMonth(f.firstOnsetIso)}. A symptom that keeps recurring over weeks is ${vetAsk}. This is a read of your logs, not a diagnosis.`
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

// Plain 12-hour clock label for a local hour 0..23: 0→'12am', 4→'4am', 12→'12pm', 23→'11pm'.
// Pure presentation; mirrored on the client (lib/signalCopy.ts) — keep the two in sync.
export function clockHourLabel(hour: number): string {
  const norm = ((Math.round(hour) % 24) + 24) % 24
  const period = norm < 12 ? 'am' : 'pm'
  const h12 = norm % 12 === 0 ? 12 : norm % 12
  return `${h12}${period}`
}

// The cluster band in plain words, e.g. start 4 width 4 → "between 4am and 8am"; a
// wrap-around start 23 width 4 → "between 11pm and 3am". The upper bound is the window's
// exclusive end (start + width), which reads naturally as the span ("a 4-hour window from 4am").
export function localHourBand(startHour: number, windowHours: number): string {
  const end = (startHour + windowHours) % 24
  return `between ${clockHourLabel(startHour)} and ${clockHourLabel(end)}`
}

export function templateTimeOfDayClustering(f: TimeOfDayClusteringFinding, petName: string): string {
  // Detector ⑥ (B-079) — template-only (no LLM, like ③/④/⑤). Names a CLOCK BAND only:
  // never a cause ("happened between 4am and 8am" is a timing reference, not "because"),
  // never a mechanism word ('bilious'/'empty stomach' — §4.5), never inverted on a
  // below-floor result (that case never reaches here — the engine stays silent). Honest
  // denominator: "timed episodes" (the witnessed/placeable count), never the raw total.
  const symptom = SYMPTOM_LABEL[f.symptomType]
  const band = localHourBand(f.clusterStartLocalHour, f.clusterWindowHours)
  return `${f.clusterCount} of ${petName}'s ${f.eligibleCount} timed ${symptom} episodes happened ${band} — a timing pattern worth mentioning to your vet.`
}

export function templateEmptyStomachTiming(f: EmptyStomachTimingFinding, petName: string): string {
  // Detector L1 (Signals v2 / CUL-7 — the ⑤ mirror) — template-only (no LLM, like ③/④/⑤/⑥). Names
  // TIMING ONLY: "N or more hours after eating" is a timing reference, never the syndrome
  // ('bilious'/'empty stomach' — banned by MECHANISM_RE), never a food/form (§9.1), never a cause,
  // never a feeding-schedule SUGGESTION (G3). Honest denominator: "we could time" (the eligible
  // count). Below-floor never reaches here (the engine stays silent).
  const symptom = SYMPTOM_LABEL[f.symptomType]
  const lastTwo = f.lastTwoEligibleLong ? ', including the last two' : ''
  return `${f.longCount} of the ${f.eligibleCount} ${symptom} episodes we could time for ${petName} happened ${f.longGapHours} or more hours after eating${lastTwo} — a timing pattern worth mentioning to your vet.`
}

export function templateTimingStory(f: TimingStoryFinding, petName: string): string {
  // The combined timing card (Signals v2 / CUL-7 — a same-symptom ⑤ + L1 merge) — template-only.
  // Carries BOTH phenotypes count-anchored over the ONE eligible denominator; same guardrail class
  // as its parts (timing only, no mechanism/food/cause/suggestion). The two clauses are the A2
  // Shape-C compare in words.
  const symptom = SYMPTOM_LABEL[f.symptomType]
  return `Of the ${f.eligibleCount} ${symptom} episodes we could time for ${petName}, ${f.rapid.count} happened within ${f.rapidWindowMinutes} minutes of eating and ${f.long.count} happened ${f.longGapHours} or more hours after — a timing pattern worth mentioning to your vet.`
}

export function templateTrialResponse(f: TrialResponseFinding, petName: string): string {
  // The trial-response lane (Signals v2 / CUL-8 — L2, the wedge) — template-only (no LLM, like
  // ③/④/⑤/⑥/⑦). The phrasing contract Dr. Chen ratifies (spec §2 L2): COUNT-ANCHORED, TIME-ORDERED,
  // NEVER VERDICTED. It states the two pooled counts in time order (during the trial / before it) and
  // routes to the vet — it NEVER says "working"/"helping"/"improvement"/"ruled out"/"clean", never
  // "better"/"worse", never names the diet or a food (G1: no attribution). It is deliberately
  // DIRECTION-NEUTRAL: the reader sees which count is higher; the copy asserts no judgment about it
  // (Guilford 2001 — diet response alone is not proof; RTM — a calm stretch happens on its own; the
  // three-things-changed confound is the vet's to weigh, disclosed in the client expand, PR 6).
  // Indication-blind: the day-count is context, NEVER an assessment-point verdict. The card only
  // exists when the pooled contrast changed materially (detectTrialResponse), so a comparison is
  // always licensed here; the counts-only state is the standing Pet-tab line (PR 6), not this card.
  const trialNoun = f.pooledTrialCount === 1 ? 'episode' : 'episodes'
  const dayNoun = f.trialDayNumber === 1 ? 'day' : 'days'
  const baselineWeeks = Math.max(1, Math.round(f.baselineWindowDays / 7))
  const weekNoun = baselineWeeks === 1 ? 'week' : 'weeks'
  // Names vomiting specifically — the burden is VOMIT-only (the round-2 masking fix), so "symptom
  // episodes" would over-claim a whole-body read the count does not support.
  return `We've logged ${f.pooledTrialCount} ${trialNoun} of vomiting for ${petName} in the ${f.trialDayNumber} ${dayNoun} since the trial began, compared with ${f.pooledBaselineCount} across the ${baselineWeeks} ${weekNoun} before it — worth reviewing with your vet.`
}

/** Render one inter-episode gap (hours) as a friendly value + unit. ≥24h → whole days, else whole
 *  hours — so a sub-day gap never reads as a dishonest "0 days". Rounding can make two genuinely-
 *  distinct gaps display equal (a cosmetic limit of the fallback; the exact gaps ride in the payload
 *  for the client, CUL-12+, and the closer states the direction the numbers may round away). */
function formatGapUnit(hours: number): { value: number; unit: 'day' | 'hour' } {
  if (hours >= 24) return { value: Math.max(1, Math.round(hours / 24)), unit: 'day' }
  return { value: Math.max(1, Math.round(hours)), unit: 'hour' }
}

/** "6 days, then 3, then 2" (unit stated once when uniform) or "3 days, then 18 hours, then 9 hours"
 *  (each unit stated when the run crosses the day/hour boundary — an honest big shortening). */
function formatGapSequence(hoursSeq: readonly number[]): string {
  const parts = hoursSeq.map(formatGapUnit)
  const uniform = parts.every((p) => p.unit === parts[0].unit)
  if (uniform) {
    const [head, ...rest] = parts
    const first = `${head.value} ${head.unit}${head.value === 1 ? '' : 's'}`
    return [first, ...rest.map((p) => String(p.value))].join(', then ')
  }
  return parts.map((p) => `${p.value} ${p.unit}${p.value === 1 ? '' : 's'}`).join(', then ')
}

export function templateGapShortening(f: GapShorteningFinding, petName: string): string {
  // The gap-shortening lane (Signals v2 / CUL-10 — L4, the sub-floor lane) — template-only (no LLM,
  // like ③/④/⑤/⑥/⑦), itself a structural never-reassure guarantee. The D2 mock's form: state the
  // recent inter-episode gaps as PLAIN COUNTS in time order and let the numbers speak — no verdict
  // word ("worsening"/"worse"/"getting worse"), no cause (G1), no mechanism, no syndrome name (G3),
  // and — because the lane fires ONLY on shortening — no reassuring "settling"/"improving" is ever
  // reachable (G5, escalate-only). The closer is understated (a WATCHING row, not a full card): it
  // flags the pattern without alarming and without an imperative to log more (G8 register). The exact
  // gaps ride in the payload for the client; this fallback rounds to whole days/hours.
  const symptom = SYMPTOM_LABEL[f.symptomType]
  const sequence = formatGapSequence(f.recentGapsHours)
  return `For ${petName}, the gaps between ${symptom} episodes have been ${sequence} — a pattern worth keeping an eye on.`
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
    case 'symptom_chronicity':
      return templateChronicity(finding, petName)
    case 'postprandial_timing':
      return templatePostprandialTiming(finding, petName)
    case 'empty_stomach_timing':
      return templateEmptyStomachTiming(finding, petName)
    case 'timing_story':
      return templateTimingStory(finding, petName)
    case 'trial_response':
      return templateTrialResponse(finding, petName)
    case 'gap_shortening':
      return templateGapShortening(finding, petName)
    case 'timeofday_clustering':
      return templateTimeOfDayClustering(finding, petName)
    case 'incident_red_flag':
      return templateIncidentRedFlag(finding, petName)
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
// The trial-response lane (CUL-8) is a COUNT COMPARISON, never a verdict on the trial. This screen
// bars the verdict vocabulary the phrasing contract names verbatim — "working"/"helping"/
// "improvement"/"ruled out"/"clean" — plus its obvious kin (better/worse, resolved, cleared, cured,
// fixed, effective, responding, on the mend). The domain rule behind the ban: diet response alone is
// not proof of food sensitivity (Guilford 2001's improved-without-relapse arm), and a calm stretch
// happens on its own (regression to the mean) — so the engine states counts and lets the vet judge,
// and NEVER judges for them. Screened in addition to CAUSAL/MECHANISM/FOOD/REASSURANCE.
const TRIAL_VERDICT_RE =
  /\b(works?|worked|working|helps?|helped|helping|helpful|improv\w+|better|worse|worsen\w*|resolv\w+|clear(?:ed|ing|s)?|clean|cured?|curing|cures|fixe[ds]|fixing|success\w*|fail\w+|respond\w+|effective|ineffective|on the mend|turn(?:ed|ing) a corner)\b|\brule[ds]?\s+out\b/i
// SR-4 (B-721 §3.5, spine S3/S5) — UNIVERSALLY banned Signal vocabulary, screened on EVERY
// finding type. Change lives in the phrased, counted sentence, never a direction glyph
// (S5), and the sample line is the honest confidence display, never a percentage or
// composite score (S3). No Signal template emits either; this screen holds the line against
// any model-phrased drift (correlation / intake) and pins the templates against regressions.
const GLYPH_RE = /[↑↓→←➘➚➔⬆⬇]|->|<-|\bslope\b/i
const PERCENT_RE = /%|\bpercent(?:ages?|iles?)?\b/i

/** True when `text` carries any universally-banned Signal vocabulary (glyphs / percentages,
 *  §3.5). Exported so the SR-4 guardrail-coverage tests can screen the med-on-board line and
 *  the density-withheld sentence — copy that isn't itself a finding sentence — with the same
 *  screen validatePhrasing applies. */
export function hasBannedSignalVocabulary(text: string): boolean {
  const t = text ?? ''
  return GLYPH_RE.test(t) || PERCENT_RE.test(t)
}

export function validatePhrasing(text: string, finding: Finding): boolean {
  const t = text?.trim() ?? ''
  if (t.length < 8 || t.length > 320) return false
  if (t.includes('!')) return false // nyx-voice Pattern 4 — no manufactured enthusiasm
  if (hasBannedSignalVocabulary(t)) return false // §3.5 — no glyphs, no percentages, any type
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
  if (finding.type === 'symptom_chronicity') {
    // Detector ⑦ (B-182) is a descriptive DURATION/RECURRENCE statement routed to the vet.
    // Reassurance/"picky" are already barred by the safety branch above; it ALSO may not
    // assert a cause, imply a mechanism, or name a food/protein/form — chronicity is a
    // frequency-over-weeks claim, never causal, never a mechanism/severity verdict, never a
    // diagnosis (§4.7 #3). Template-only (index.ts) so the model is never in this loop, but
    // if that ever changes this screen holds all three lines.
    if (CAUSAL_RE.test(t) || MECHANISM_RE.test(t) || FOOD_NAMING_RE.test(t)) return false
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
  if (finding.type === 'empty_stomach_timing' || finding.type === 'timing_story') {
    // Signals v2 (CUL-7) — L1 (empty-stomach) and the merged timing_story are descriptive TIMING
    // counts, the same guardrail class as ⑤. Crucially, MECHANISM_RE bars 'empty stomach' / 'bilious':
    // the lane names the TIMING BAND ("6 or more hours after eating"), never the syndrome the vet
    // infers from it. No cause, no food/form (§9.1), no reassurance (below-floor is silence).
    // Template-only, but the screen holds all four lines if the model is ever in this loop.
    if (CAUSAL_RE.test(t) || MECHANISM_RE.test(t) || FOOD_NAMING_RE.test(t) || REASSURANCE_RE.test(t)) {
      return false
    }
  }
  if (finding.type === 'timeofday_clustering') {
    // Detector ⑥ (B-079) is a descriptive CLOCK-BAND count — anamnesis, never mechanism.
    // It may not assert a cause, imply a mechanism ('bilious'/'empty stomach' — §4.5), or
    // reassure (a below-floor result is silence, never "no particular time of day").
    // Template-only (index.ts) so the model is never in this loop — but if that ever
    // changes, this screen holds the line.
    if (CAUSAL_RE.test(t) || MECHANISM_RE.test(t) || REASSURANCE_RE.test(t)) return false
  }
  if (finding.type === 'incident_red_flag') {
    // Detector — per-incident visual red flag (B-340) is a SAFETY finding naming what a photo
    // VISIBLY showed, routed to the vet. Reassurance/"picky" are already barred by the safety
    // branch above; it ALSO may not assert a CAUSE — it reports a visible finding ("showed
    // possible blood"), never "the food caused it" — nor drift into a MECHANISM verdict or name a
    // FOOD/protein (a visible read is not an attribution). Template-only (index.ts) so the model is
    // never in this loop, but if that ever changes this screen holds all three lines (parity with
    // ⑤/⑦'s screens — defense-in-depth even for a currently-dormant path).
    if (CAUSAL_RE.test(t) || MECHANISM_RE.test(t) || FOOD_NAMING_RE.test(t)) return false
  }
  if (finding.type === 'trial_response') {
    // The trial-response lane (CUL-8) is a COUNT-ANCHORED comparison the vet interprets — never a
    // verdict. Beyond the universal glyph/percent screen it may not: assert a CAUSE (G1 — no
    // attribution to the diet, a food, or a med), imply a MECHANISM, name a FOOD/protein/form,
    // REASSURE, or VERDICT the trial ("working"/"helping"/"improvement"/"ruled out"/"clean" and kin).
    // It is 'insight' class, so the safety-branch reassurance screen does NOT run for it — the
    // REASSURANCE_RE test here is what holds that line. Template-only (index.ts) so the model is never
    // in this loop, but the screen holds all five lines if that ever changes.
    if (
      CAUSAL_RE.test(t) ||
      MECHANISM_RE.test(t) ||
      FOOD_NAMING_RE.test(t) ||
      REASSURANCE_RE.test(t) ||
      TRIAL_VERDICT_RE.test(t)
    ) {
      return false
    }
  }
  if (finding.type === 'gap_shortening') {
    // The gap-shortening lane (CUL-10) is a descriptive count of INTER-EPISODE GAPS routed as a quiet
    // watching row. It is 'insight' class, so the safety-branch reassurance screen does NOT run for it —
    // the REASSURANCE_RE test here is what holds the never-reassure line, which matters doubly because
    // the lane is escalate-only (a "settling"/"improving" sentence must never appear, and firing only on
    // SHORTENING makes it structurally unreachable — this screen is the defense-in-depth). It also may
    // not assert a CAUSE (G1 — the shortening is attributed to nothing), imply a MECHANISM, name a
    // FOOD/protein/form, or VERDICT the trend as clinical worsening (TRIAL_VERDICT_RE covers "worse"/
    // "worsening"/"worsened" and kin — the numbers state the pattern; the copy never judges it G3).
    // Template-only (index.ts) so the model is never in this loop; the screen holds all five lines
    // if that ever changes.
    if (
      CAUSAL_RE.test(t) ||
      MECHANISM_RE.test(t) ||
      FOOD_NAMING_RE.test(t) ||
      REASSURANCE_RE.test(t) ||
      TRIAL_VERDICT_RE.test(t)
    ) {
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
      // B-351 slice 6 — the machine-readable cluster. A joint candidate is phrased
      // TEMPLATE-ONLY (index.ts) so this never actually reaches the model today; it is
      // sent anyway, with the matching PHRASING_SYSTEM rule, so that the payload can
      // never quietly become the reason a future routing change loses a member.
      proteins: finding.proteins,
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
  if (finding.type === 'symptom_chronicity') {
    // Template-only (index.ts), so this payload is never actually sent to the model; kept
    // for shape-correctness and parity. Carries DURATION/RECURRENCE/COUNT only — no cause,
    // no mechanism, no severity verdict (§4.7). Also narrows the union so the intake_decline
    // fallthrough below stays well-typed.
    return {
      insight_type: 'symptom_chronicity',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      active_weeks: finding.activeWeeks,
      window_weeks: Math.round(finding.windowDays / 7),
      episode_count: finding.episodeCount,
      span_days: finding.spanDays,
      tier: finding.tier, // 'firm' | 'standard' — duration-anchored urgency register
      relationship: 'descriptive_duration', // a recurrence over weeks we are noting — NOT a cause
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
  if (finding.type === 'timeofday_clustering') {
    // Template-only (index.ts), so this payload is never actually sent to the model; kept
    // for shape-correctness and parity. Carries the CLOCK BAND only — no mechanism, no cause.
    return {
      insight_type: 'timeofday_clustering',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      cluster_count: finding.clusterCount,
      eligible_count: finding.eligibleCount,
      cluster_start_local_hour: finding.clusterStartLocalHour,
      cluster_window_hours: finding.clusterWindowHours,
      relationship: 'associational_timing', // a clock pattern we are noting — NOT a cause, NOT a mechanism
    }
  }
  if (finding.type === 'empty_stomach_timing') {
    // Signals v2 (CUL-7). Template-only, so never sent to the model; kept for shape-parity. Carries
    // TIMING ONLY (no food form — forms ride feedingFormsInEvidence into the vet report, §9.1).
    return {
      insight_type: 'empty_stomach_timing',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      long_count: finding.longCount,
      eligible_count: finding.eligibleCount,
      long_gap_hours: finding.longGapHours,
      including_last_two: finding.lastTwoEligibleLong,
      relationship: 'associational_timing', // a timing pattern we are noting — NOT a cause, NOT a mechanism
    }
  }
  if (finding.type === 'timing_story') {
    // Signals v2 (CUL-7) — the merged ⑤ + L1 card. Template-only; both phenotypes' counts, timing only.
    return {
      insight_type: 'timing_story',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      rapid_count: finding.rapid.count,
      long_count: finding.long.count,
      eligible_count: finding.eligibleCount,
      window_minutes: finding.rapidWindowMinutes,
      long_gap_hours: finding.longGapHours,
      relationship: 'associational_timing', // two timing patterns we are noting — NOT a cause, NOT a mechanism
    }
  }
  if (finding.type === 'trial_response') {
    // Signals v2 (CUL-8) — template-only (index.ts), so never actually sent to the model; kept for
    // shape-parity. Carries the COUNTS + day-count ONLY — there is deliberately NO verdict/direction
    // field asking the model to judge the trial (the reader sees which count is higher; the copy
    // never says). relationship is a descriptive count comparison, never a cause and never a verdict.
    return {
      insight_type: 'trial_response',
      pet_name: petName,
      trial_day_number: finding.trialDayNumber,
      target_duration_days: finding.targetDurationDays,
      pooled_trial_count: finding.pooledTrialCount,
      pooled_baseline_count: finding.pooledBaselineCount,
      baseline_window_days: finding.baselineWindowDays,
      relationship: 'descriptive_count', // a count comparison we are noting — NOT a cause, NOT a verdict
    }
  }
  if (finding.type === 'gap_shortening') {
    // Signals v2 (CUL-10) — template-only (index.ts), so never actually sent to the model; kept for
    // shape-parity, and explicit so it never falls through to the intake_decline default below. Carries
    // the GAPS + median ONLY — no verdict/direction field asking the model to judge the trend (the
    // numbers state the shortening; the copy never says "worsening"). Descriptive count, never a cause.
    return {
      insight_type: 'gap_shortening',
      pet_name: petName,
      symptom: SYMPTOM_LABEL[finding.symptomType],
      recent_gaps_hours: finding.recentGapsHours,
      median_gap_hours: finding.medianGapHours,
      episode_count: finding.episodeCount,
      relationship: 'descriptive_count', // inter-episode gaps we are noting — NOT a cause, NOT a verdict
    }
  }
  if (finding.type === 'incident_red_flag') {
    // Template-only (index.ts), so this payload is never actually sent to the model; kept for
    // shape-correctness and parity. Carries the visible FLAG + recency only — no cause, no
    // diagnosis, no severity verdict beyond the calm safety-flag marker.
    return {
      insight_type: 'incident_red_flag',
      pet_name: petName,
      incident: INCIDENT_NOUN[finding.incidentType],
      flags: finding.flags, // ('blood' | 'foreign_material')[]
      flagged_incident_count: finding.flaggedIncidentCount,
      relationship: 'visible_finding', // what the photo showed — NOT a cause, NOT a diagnosis
      severity: 'calm_safety_flag', // surface clearly, route to vet, never reassure
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
  'early pattern worth keeping an eye on. If "proteins" holds MORE THAN ONE protein, they are always ' +
  'fed together and cannot be told apart: name EVERY one of them, never single one out and never ' +
  'leave one unmentioned, and close by saying that feeding one without the other would tell them ' +
  'apart. ' +
  '(5) For an intake_decline: surface it calmly and clearly and point toward keeping an eye on it ' +
  'and a word with the vet. NEVER reassure, NEVER say the pet is fine/okay/healthy, NEVER call the ' +
  'pet "picky" or frame eating less as fussiness. ' +
  '(6) For a reflection: state the COUNT of episodes this week and compare it to last week as a plain ' +
  'fact — "about the same as last week" when direction is "flat", "fewer than last week" when ' +
  '"improving". It is DESCRIPTIVE ONLY: NEVER suggest or imply a cause, and NEVER reassure — do not say ' +
  'the pet is fine/okay/healthy/all clear, and never imply that fewer or unchanged symptoms mean the pet ' +
  'is well. It is a count you are noting together, not a verdict. ' +
  'Call phrase_insight with your one sentence.'
