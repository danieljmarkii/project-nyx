// The vet report's diet-trial adapter (B-417 PR 7). Spec: §7 + §7.2.
//
// ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
//
// `docs/nyx-vet-report-requirements.md:21` names the report's FIRST clinical
// question: "Is this diet trial working?" Until PR 1–5 there was no substrate to
// answer it — `diet_trials` held zero rows in production and the report's off-diet
// computation (`report.ts`'s `confounderFeedings`) never consulted the trial at
// all. It counted every treat and every human food, so it listed the vet-PERMITTED
// treat as a contaminant and could not see a different-brand kibble fed as a meal.
//
// This module is the seam between the report and `lib/dietTrial.ts` — the ONE
// shared predicate (§5.3 D4), which the client and `ask` already import. It holds
// NO opinion about what "off-diet" means: every verdict on this page comes from
// `classifyFeeding`, and every threshold from `computeTrialFacts`. What it does
// own is the shape §7 renders: the two-element block (C4), the coverage/exposure
// split (§5.1), the antigen tally (D-B), the permitted-food counts, the allowed
// set with its effective dates, and the medication overlap.
//
// ── WHY IT IMPORTS NOTHING FROM report.ts ────────────────────────────────────
//
// `report.ts` imports THIS file (for `TrialBlock`), so a back-import would make a
// module cycle out of two files that both run at import time. The input shapes
// below are therefore declared structurally and narrowly: `ReportDietTrialInput`,
// `ReportEventInput` and `MedicationAdherence` all satisfy them by structure, and
// the narrowing doubles as documentation of exactly which columns the trial answer
// depends on.
//
// ── THE TWO RULES THAT GOVERN EVERY NUMBER BELOW ─────────────────────────────
//
//   G2 (§5.2), ruled as a RULE and not a threshold: the NEGATIVE claim is never
//   rendered, at any coverage, on any surface. There is no field here whose
//   meaning is "no off-diet foods were eaten" — `offDiet` is a FLOOR, and
//   `mayClaimAllMatched` is the one-directional gate that can only ever withhold
//   the affirmative sentence. Two-sided: below the coverage floor the report may
//   neither claim a clean trial nor raise an absence-based alarm.
//
//   §6.1: Culprit never scores the trial. Coverage, exposures and the symptom
//   trend are three separate facts; the owner reports the outcome; the vet decides
//   what it means. Nothing computed here is a verdict, and `interpretability` is a
//   statement about the RECORD, never about the pet and never about the owner.
import {
  buildTrialContext,
  classifyFeeding,
  computeTrialFacts,
  dayIndexOf,
  feedingWasFinished,
  interpretabilityStatement,
  isWithinChallengeWindow,
  mayClaimAllMatched,
  mayStateRecordClean,
  trialEffectiveEndDayIndex,
  trialFoodKey,
  CHALLENGE_WINDOW_DAYS,
  UNHYDRATED_SET_FLOOR,
  REFUSAL_MIN_DAYS,
  REFUSAL_MIN_RATED,
  REFUSAL_SHARE,
  type AllowedFood,
  type AntigenTallyEntry,
  type ContaminationFact,
  type FeedingClassification,
  type Interpretability,
  type OralRouteExposure,
  type TrialDietRefusal,
  type TrialDose,
  type TrialFeeding,
  type TrialFoodRole,
  type TrialSpecies,
} from '../../../lib/dietTrial.ts'
export type { ContaminationFact } from '../../../lib/dietTrial.ts'
import { localDayIndexOf } from '../../../lib/utils.ts'

const MS_PER_DAY = 86_400_000


// ── Narrow input shapes (structurally satisfied by report.ts's rows) ─────────

export interface TrialFoodSource {
  foodItemId: string
  foodLabel: string
  role: string
  allowedFrom: string
  allowedUntil: string | null
  primaryProtein: string | null
  brand: string | null
  productName: string | null
  proteins?: string[] | null
}

export interface TrialSource {
  id: string
  startedAt: string
  targetDurationDays: number
  status: string
  completedAt: string | null
  endedAt?: string | null
  vetName: string | null
  foodLabel?: string | null
  indication?: 'skin' | 'gi' | 'other' | null
  outcome?: 'improved' | 'no_change' | 'worse' | 'unsure' | null
  outcomeNotes?: string | null
  stoppedReason?: string | null
  allowedFoods?: TrialFoodSource[]
}

export interface TrialMealSource {
  id: string
  occurredAt: string
  meal: {
    foodItemId: string | null
    intakeRating: string | null
    foodType: string | null
    brand: string | null
    productName: string | null
    proteins?: string[] | null
  } | null
}

export interface TrialDoseSource {
  eventId: string
  occurredAt: string
  medicationItemId: string | null
  adherence: string | null
  pairedEventId: string | null
}

export interface TrialMedItemSource {
  id: string
  genericName: string | null
  brandName: string | null
  form?: string | null
}

export interface TrialMedicationSource {
  drugName: string
  isSupplement: boolean
  startedAt: string
  endedAt: string | null
  indication: string | null
}

export interface TrialArrangementSource {
  foodItemId: string
  foodLabel: string | null
  method: string
  activeFrom: string | null
  activeUntil: string | null
}

// ── The rendered shape ───────────────────────────────────────────────────────

/** A medication or supplement whose span overlaps the trial window (§7, element 1).
 *
 *  EXPLICITLY NOT JUDGED. Antipruritics are permitted throughout a trial and a
 *  2–3 week prednisolone course is a documented protocol, so an app that flagged
 *  steroids as a compliance violation would be scolding an owner for following
 *  their vet. Without this block a derm trial is unreadable: a steroid course and
 *  a successful elimination produce the identical improving curve. */
export interface TrialMedicationOverlap {
  drugName: string
  isSupplement: boolean
  /** As recorded; null only when the regimen predates any recorded start. */
  startedAt: string | null
  endedAt: string | null
  /** The overlap span, clipped to the trial window. */
  fromDate: string
  toDate: string
  daysOverlapping: number
  /** Still running at the window end — the "is this confound still in play?" answer. */
  activeAtWindowEnd: boolean
  overlapsLast7Days: boolean
  /**
   * PRESENCE-ONLY. True when the drug's name matches a known antibacterial AND the
   * trial's indication is 'gi'. §7: "a steroid's effect withdraws, a course of
   * metronidazole's effect on the microbiome does not."
   *
   * FALSE IS NOT A CLAIM. The match is over a name list, so an unlisted or
   * misspelled antibiotic reads false; no copy anywhere may say a trial was free of
   * antibiotics. The flag only ever ADDS a sentence.
   */
  antibacterialInGiTrial: boolean
}

/** One permitted food, with the count §7 asks for ("DentaStix — 168 feedings"). */
export interface TrialPermittedFood {
  label: string
  role: TrialFoodRole
  allowedFrom: string
  allowedUntil: string | null
  /** In-range feedings that rung 1 permitted via this row. */
  feedings: number
  /** The row opened after the trial did — §7's "the set changed after started_at". */
  addedAfterStart: boolean
  /** The row's membership was closed before the window ended. */
  endedBeforeWindowEnd: boolean
  /**
   * The protein set read from this food's label, and whether a label was read at all.
   *
   * Rendered ON the allowed list because there is nowhere else it can go. Appendix B's
   * protein table holds MEAL foods only, so page 1's trailing "Full protein sets in
   * appendix B" pointed a vet at a table that does not contain the treats — and round 4
   * found the second-most-fed item in the record ("Royal Canin Hydrolyzed Treats ×39")
   * with no ingredient data anywhere in the document. The same page warns that "a
   * vet-approved extra that carries a second protein is as trial-invalidating as a
   * contaminated primary diet, and less likely to be noticed", so withholding the set
   * for 39 feedings defeats the report's own stated hazard. Empty + `panelRead: false`
   * is silence about an unread label, never an all-clear (D10).
   */
  proteins: string[]
  panelRead: boolean
}

/** C5, ruled: the symptom trend is rendered AGAINST logging density over the same
 *  window. An owner-logged event stream decays with attention — highest at trial
 *  start, lowest by week 6 — so a falling symptom count is biased toward apparent
 *  improvement and a vet cannot tell a real remission from a tiring owner.
 *  Measure and disclose the bias; do NOT correct it with an owner-scored severity
 *  instrument the app has refused on every event type (A-1 REJECTED). */
export interface TrialLoggingDensity {
  /**
   * TWO SERIES, AND NO VERDICT — because there is no third series to adjudicate with.
   *
   * The cold read broke both single-series versions of this, in opposite directions,
   * and the pair of failures is the finding:
   *
   * - denominating on ALL events let habitual, app-prompted meal logging saturate it,
   *   so a 12 → 1 itch collapse rendered *"Logging held up … a change in symptom
   *   counts is not explained by a change in how often anything was logged"* — the
   *   report certifying the exact artefact C5 exists to disclose;
   * - denominating on NON-MEAL events fixed the saturation and bought a worse bug: on
   *   a pet whose only discretionary logs ARE its symptoms, the series **is** the
   *   symptom series (11 + 6 = the 17 charted symptom events), so *"Logging fell over
   *   the trial, so a fall in symptom counts cannot be separated from the fall in
   *   logging"* is a tautology that revokes the trial's own result. A vet reading it
   *   tells the owner six weeks were wasted.
   *
   * Neither verdict was in C5, which says the trend is *rendered against* density — not
   * adjudicated by it. Round 4 deleted the verdict and rendered both series, naming the
   * circularity in the non-meal one rather than hiding inside it. **Round 5 rejected
   * that too, and was right:** naming a defect does not repair it. Its label
   * ("any other event") was also simply false — treats are meal-typed, and doses and
   * weigh-ins are not in the event table at all, so on both artifacts the series was
   * *exactly* the symptom count (Cooper 11/6 = his 11 and 6 symptom days; Mira 2/3 =
   * her 5 vomiting days), while 65 treat feedings, 3 weigh-ins and 2 doses went
   * uncounted. A row that prints the symptom count and then says "read the symptom
   * counts below against these" induces the misreading it exists to prevent.
   *
   * So only the MEAL series survives. It is the one that answers C5's actual question —
   * did the owner keep logging? — without circling, because it is independent of the
   * symptom count by construction: 43-of-43 across both halves really does mean nobody
   * disengaged, and 16-of-16 → 0-of-16 really does mean they did. The symptom charts
   * already carry their own days-logged denominators. A second series that is either
   * circular or empty adds nothing a vet can use.
   */
  meals: { firstHalf: { daysLogged: number; days: number }; lastHalf: { daysLogged: number; days: number } }
}

/** One off-diet feeding, resolved by `classifyFeeding` (§5.3). */
export interface TrialExposure {
  eventId: string
  occurredAt: string
  dayIndex: number
  label: string | null
  classification: FeedingClassification
  /**
   * A symptom was logged inside the species' forward challenge window after this
   * feeding (`isWithinChallengeWindow` — dog 14d, cat 7d, forward only, never
   * same-day). TIMING ONLY. It is not a cause, not an attribution and not a
   * finding: an unlogged exposure is always possible, so no pairing can be
   * exclusive. It exists so the two series can be read side by side rather than
   * re-derived by whichever surface draws them next.
   */
  symptomInChallengeWindow: boolean
  /**
   * #6 — rung 3 fires for TWO different reasons and the copy asserted only one.
   * `off_diet_unrecognised` means "not on the list", and that is reached both when no
   * ingredient panel was ever captured AND when the panel WAS read and carried nothing
   * unsanctioned. The adversarial pass produced the contradiction from §5.4's own
   * premise: an owner re-photographs the bag, extraction mints a duplicate row, and
   * Appendix C rendered `Not on the trial's list; ingredients not read | Soy | ×23` —
   * the cell saying the ingredients were not read, beside the protein that was read,
   * for 23 feedings of the prescribed diet. That is this PR's own new AC ("every
   * caption is checked against the code beneath it") failing inside the PR that added
   * it, and it hides the duplicate the vet most needs to spot.
   */
  panelWasRead: boolean
  /**
   * The date this same food *did* become permitted, when it is later than this
   * feeding — so the Why column can name the reason that actually placed the row here.
   * `null` when the food is never on the list (the ordinary case).
   */
  permittedLaterFrom: string | null
}

export interface TrialBlock {
  id: string
  status: 'active' | 'completed' | 'abandoned'
  startedAt: string
  /** `ended_at` (B-455) — present on BOTH completed and abandoned trials. */
  endedAt: string | null
  targetDurationDays: number
  vetName: string | null
  indication: 'skin' | 'gi' | 'other' | null
  species: TrialSpecies

  /** Every `primary_diet` label in force over the range (a real trial is often a
   *  wet and a dry of the same diet — §4.1's multi-food ruling). Falls back to
   *  `diet_trials.food_label` when the allowed set never hydrated. */
  trialDietLabels: string[]

  /** Day N as of the window end. NEVER rendered as "day N of M" when it exceeds
   *  the target — see `daysPastTarget` (B-457's sibling on the report). */
  dayCounter: number
  daysPastTarget: number

  /** The ONE overlap range both §5.1 metrics are computed over (`max(scope start,
   *  trial start, first log) … min(today, ended_at, scope end)`), rendered
   *  explicitly because a window-scoped numerator over a trial-scoped denominator
   *  is what made a well-logged 8-week trial read "27 / 56". */
  rangeStartDate: string
  rangeEndDate: string
  /** The range starts later than the trial did (a report scope or a first log clipped it). */
  rangeClipped: boolean
  /** §10 S3 — days between `started_at` and the first log, reported as UNTRACKED
   *  rather than counted as failure. */
  untrackedDaysBeforeFirstLog: number

  coverage: { daysLogged: number; daysElapsed: number } | null
  exposures: {
    totalFeedings: number
    /** A FLOOR, never a total (§5.2). */
    offDiet: number
    byRung: { derived_protein: number; unrecognised: number }
    /**
     * Exposures whose food IS on the allowed list, just not on the day it was fed — the
     * THIRD reason a row can be here, orthogonal to the two rungs and not counted by
     * either. Round 5 caught page 1 saying "Of those 4: 4 carried a protein the trial
     * diet does not" while appendix C's Why column showed three protein rows and one
     * dated-membership row, so a vet cross-checking got 4 against 3 and the timing
     * violation never surfaced on page 1 at all.
     */
    fedBeforePermitted: number
    /** Feedings naming no food — excluded from BOTH sides above and disclosed. */
    unclassifiable: number
    items: TrialExposure[]
  }
  antigenTally: AntigenTallyEntry[]
  permittedFoods: TrialPermittedFood[]
  allowedSetChangedAfterStart: boolean
  /** The allowed set never arrived (or holds no usable `primary_diet` row), so
   *  §5.3 could not run. Everything exposure-shaped is withheld and the report
   *  says so — silence, never a clean read. */
  allowedSetUnavailable: boolean

  interpretability: Interpretability
  /** §7.2's one sentence. Null below `MIN_INTERPRETABLE_DAYS` (`not_yet`). */
  interpretabilityStatement: string | null
  belowCoverageFloor: boolean
  /** PR 5's one-directional gate, verbatim: FALSE ⇒ the module computed a reason
   *  the affirmative sentence is false (a refused trial diet, an off-list bowl, an
   *  oral-route dose, a feeding naming no food). */
  mayClaimAllMatched: boolean
  /**
   * THE GATE EVERY SURFACE ON THIS REPORT ASKS. `mayClaimAllMatched` plus the three
   * report-level reasons the sentence is unsayable that PR 5 has no way to know
   * about:
   *
   *   • the allowed set never arrived — nothing was checked against anything;
   *   • the record is below the coverage floor — §5.2 is TWO-SIDED, and more days
   *     missing than present cannot evidence a clean elimination any more than it
   *     can evidence a dirty one;
   *   • the trial was STOPPED because the pet would not eat it — a diet that was
   *     not eaten cannot be read as one that was followed, and that is a rule, not
   *     a copy preference (the round-1b Jordan finding: "All 54 matched the trial
   *     diet" rendered three lines above "wouldn't eat it").
   *
   * It exists as ONE field because the affirmative sentence has three renderers —
   * the At-a-glance tile, the page-1 record line, and Appendix C's empty row — and
   * a rule re-derived in three places is a rule that will hold in two of them. The
   * refusal case is exactly how that was found.
   */
  mayStateRecordClean: boolean

  oralRoute: OralRouteExposure[]
  arrangementExposures: Array<{ label: string | null }>
  contamination: ContaminationFact[]
  trialDietRefusal: TrialDietRefusal | null
  /**
   * THE SAME FACT, OVER THE WHOLE RANGE — because a report is a history and PR 5's
   * `trialDietRefusal` is a now-fact.
   *
   * `REFUSAL_WINDOW_DAYS = 14` is a recency bound, and it is right for the CARD: it
   * exists so a wobble during the transition week cannot latch the card into a
   * viability state for the remaining fifty days. Consumed by a REPORT it silently
   * changes meaning. The adversarial pass produced it: a cat that refused every bowl
   * for days 1–21 of a 42-day trial and then ate normally rendered `84 feedings in
   * total — 64 matched, 20 did not` plus *"supports interpreting it"*, with the word
   * "refused" appearing nowhere in the trial block — and `weightDuringTrial`, which
   * only renders inside the refusal branch, vanished with it.
   *
   * That directly violates this PR's own rule: an adherence figure of ANY shape reads
   * a diet that went uneaten as one that was followed. The rule was being enforced
   * for 14 days out of a 56-day document.
   *
   * Same floors, same `feedingWasFinished` predicate — only the window differs, so
   * there is one definition of "not being eaten" and two windows over it, each named.
   */
  rangeRefusal: TrialDietRefusal | null
  /**
   * Does `rangeRefusal` span more than one EPISODE (`REFUSAL_MIN_SPAN_MS`)?
   *
   * ABSENT FROM THIS INTERFACE UNTIL B-494 NEEDED IT, and its absence was a defect the
   * moment `rangeRefusal` stopped merely narrating the trial block. The range fact drops
   * the span guard deliberately — right for a HISTORY, where a multi-week refusal is the
   * failure mode — but B-494 promoted the same fact to an above-the-fold ESCALATION, and
   * `dietTrialCard.ts` refuses to let a present-tense register speak without it. Executed:
   * three refusals in one 3.5-hour bout straddling local midnight fired the vet report's
   * safety band ("Diet not eaten … across 2 days", plus the feline lipidosis window) over a
   * record the owner's own card is silent on. One record, two surfaces, opposite answers,
   * with the VET's artifact taking the louder one — and the report could not add the guard
   * because the fact it needed was not on this type.
   */
  rangeRefusalSpansEpisodes: boolean
  /** PR 3's token. `refused` is load-bearing: §4.3 routes it to the intake-decline
   *  HEALTH lane and forbids rendering it as a compliance outcome. */
  stoppedReason: string | null
  outcome: 'improved' | 'no_change' | 'worse' | 'unsure' | null
  outcomeNotes: string | null

  medicationOverlap: TrialMedicationOverlap[]
  loggingDensity: TrialLoggingDensity | null
  /** The species' forward challenge window in days — the legend for
   *  `symptomInChallengeWindow`. */
  challengeWindowDays: number
  /**
   * The dagger's HONEST base rate: the share of in-range days on which a feeding would
   * have earned the marker, i.e. days with any symptom inside the following
   * `challengeWindowDays`. Percent, 0–100.
   *
   * The footnote used to disclose the SYMPTOM-DAY rate instead (17 of 46 days, 37%),
   * which is a different quantity and always the smaller one — cold read round 6 worked
   * the real figure out by hand from appendix A and got **83%**: itching ran May 21 –
   * Jun 25 with no gap wider than 5 days, so every feeding date from May 18 to Jun 24
   * qualified. Disclosing 37% where the operative rate is 83% makes "it marks 3 of 4
   * rows" read as selective when it is very nearly unavoidable — in the footnote whose
   * entire purpose is to admit the marker does not discriminate on a dense record.
   */
  challengeMarkerBaseRatePct: number
}

// ── Trial selection ──────────────────────────────────────────────────────────

/**
 * Which trial does this report describe?
 *
 * The old answer was `dietTrials.find(t => t.status === 'active')`, which has a
 * failure mode §11 names outright: "the day after the owner taps Complete, the
 * trial section, coverage, off-diet list and clinical framing all vanish and the
 * window falls to the 90-day fallback. The most valuable report this feature
 * produces would be the one it destroys." PR 6 (the completion milestone) is
 * gated on this function existing.
 *
 * So: the trial whose SPAN OVERLAPS THE WINDOW, active or ended. An active trial
 * wins over an ended one (a pet has at most one active trial — migration 040's
 * UNIQUE partial index); among equals, the most recent start.
 */
/**
 * The trial's LAST DAY — declared or effective (B-422).
 *
 * `trialEndValue` answers "when did the owner say it ended", which is null for
 * every trial nobody ended — and since nothing auto-completes a trial, that is
 * the STEADY STATE rather than an edge. Read literally it means a trial started
 * eighteen months ago and never closed is still "running" today, so it wins the
 * `active` rank forever, anchors every report on itself, and never ages out of
 * the ended-trial grace because it never enters it.
 *
 * So the last day is the EARLIER of the declared end and the B-422 effective
 * end. Deriving one value here, rather than adding a second staleness branch to
 * each caller, is what keeps the grace machinery singular: an overrun trial is
 * simply a trial that ended on its effective end, and `endedGraceDays` /
 * `TRIAL_ANCHOR_GRACE_DAYS` then govern its afterlife exactly as they govern a
 * completed one.
 */
export function trialLastDayNum(t: TrialSource, timeZone: string | null): number | null {
  const ends = [
    dayIndexOfValue(trialEndValue(t), timeZone),
    trialEffectiveEndDayIndex(
      { startedAt: t.startedAt, targetDurationDays: t.targetDurationDays },
      timeZone ?? undefined,
    ),
  ].filter((v): v is number => v !== null)
  return ends.length > 0 ? Math.min(...ends) : null
}

export function selectReportTrial<T extends TrialSource>(
  trials: readonly T[],
  window: { startDayNum: number; endDayNum: number },
  timeZone: string | null,
  /** How long after a trial ENDS it still describes the report. Must match
   *  `report.TRIAL_ANCHOR_GRACE_DAYS`, or the window can be anchored on a trial the
   *  block then refuses to render (or the reverse). */
  endedGraceDays = 14,
): T | null {
  let best: T | null = null
  let bestKey: [number, number, string] = [-1, -Infinity, '']
  for (const t of trials) {
    const startDn = dayIndexOfValue(t.startedAt, timeZone)
    if (startDn === null) continue
    const endDn = dayIndexOfValue(trialEndValue(t), timeZone)
    // An open-ended trial runs through the window end; one that ended before the
    // window opened never overlaps.
    const spanEnd = endDn ?? window.endDayNum
    if (startDn > window.endDayNum || spanEnd < window.startDayNum) continue
    // ── B-422 DELIBERATELY DOES NOT REACH THIS TEST ────────────────────────────
    //
    // A first cut ranked on `isTrialRunning` here, so an un-ended trial aged out
    // at its effective end + `endedGraceDays` exactly as a completed one does.
    // The symmetry is tidy and it is the wrong answer, because of WHAT this
    // function gates: the trial block carries `trial_diet_refusal`, and dropping
    // the block drops the SAFETY FLAG with it.
    //
    // The adversarial pass rendered the consequence on the canonical case — an
    // 8-year-old cat who has refused every one of ~336 logged bowls of the
    // prescribed diet since day 1 and is refusing today. Her trial had aged out,
    // so `snap.safetyFlags` went from `['trial_diet_refusal']` to `[]`, and the
    // legend flipped from "absence of a flag is never shown as an all-clear" to
    // "nothing is printed here when no flag fired". Her OWNER's card still fired
    // the refusal headline off the same record. One record, two answers, and the
    // vet is the one who loses the finding.
    //
    // That is precisely what the PM's B-494 ruling forbids: a report that teaches
    // the reader to scan a zone may not leave that zone silent on a patient the
    // record already knows is in trouble. It also inverts the ruling's own
    // reasoning, since an owner still logging refusals daily is the strongest
    // possible evidence the trial has NOT stopped — the record contradicts the
    // inference, and evidence outranks inference.
    //
    // So the rule for the report is: GATE THE ANCHOR, NEVER GATE THE DISCLOSURE.
    // `resolveScope` rung 2 is gated (a stale trial must not define a two-year
    // report window — falling to the 90-day fallback loses nothing), and this
    // stays on `status`. Whether an un-ended trial should eventually stop being
    // the report's SUBJECT is a real question, but it is a Dr. Chen + cold-read
    // question that belongs with B-538's grace windows → B-594.
    const running = t.status === 'active'
    // OVERLAP IS NOT ENOUGH FOR AN ENDED TRIAL. A 90-day fallback window catches
    // the tail of a trial that finished ten weeks ago, and framing the whole report
    // as that trial's result would be a worse answer than framing it as symptom
    // monitoring: the trial describes three of the report's thirteen weeks. The
    // report belongs to a trial that is running, or one that has only just stopped.
    if (!running && (endDn === null || window.endDayNum - endDn > endedGraceDays)) continue
    // Ties break on `id`, matching `resolveScope` rung 2 — the query has no ORDER BY,
    // so two ended trials with the same start otherwise resolve by array order and the
    // report flips on a re-order (the B-188 shape, and the pair must not disagree).
    const key: [number, number, string] = [running ? 1 : 0, startDn, t.id]
    if (
      key[0] > bestKey[0] ||
      (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
      (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])
    ) {
      best = t
      bestKey = key
    }
  }
  return best
}

/** `ended_at` first (written on BOTH outcomes, §3.1), `completed_at` as the
 *  pre-migration-040 fallback. B-455 is exactly the absence of the first term. */
export function trialEndValue(t: TrialSource): string | null {
  return t.endedAt ?? t.completedAt ?? null
}

// ── The build ────────────────────────────────────────────────────────────────

export interface BuildTrialBlockArgs {
  trial: TrialSource
  species: TrialSpecies
  /** Deduped, window-scoped meal events — the SAME set page 1 counts, so the two
   *  can never disagree about how many feedings there were. */
  meals: readonly TrialMealSource[]
  /** Every deduped event, for the vehicle lookup (rung 4) — a paired vehicle may
   *  sit just outside the meal projection. */
  eventsById: ReadonlyMap<string, TrialMealSource>
  doses: readonly TrialDoseSource[]
  medicationItems: readonly TrialMedItemSource[]
  medications: readonly TrialMedicationSource[]
  arrangements: readonly TrialArrangementSource[]
  /** C5's density series: local-day indices of days carrying a meal-type event. The
   *  only series that answers "did the owner keep logging?" without circling back on
   *  the symptom count it would be checking — see `TrialLoggingDensity`. */
  mealLoggedDayIndices: readonly number[]
  /** Local-day indices of every in-window symptom event. */
  symptomDayIndices: readonly number[]
  scope: { startDate: string; endDate: string; endDayNum: number }
  nowMs: number
  timeZone: string | null
}

export function buildTrialBlock(args: BuildTrialBlockArgs): TrialBlock | null {
  const { trial, species, timeZone } = args
  const tz = timeZone ?? undefined
  const endedAt = trialEndValue(trial)

  const allowedFoods = mapAllowedFoods(trial.allowedFoods ?? [])
  const ctx = buildTrialContext(
    {
      id: trial.id,
      startedAt: trial.startedAt,
      endedAt,
      targetDurationDays: trial.targetDurationDays,
      species,
    },
    allowedFoods,
    { timeZone: tz },
  )
  if (ctx.startDayIndex === null) return null

  const feedings = args.meals.filter((e) => e.meal).map(toTrialFeeding)
  const doses = mapDoses(args.doses, args.medicationItems, args.eventsById)
  const arrangements = args.arrangements
    .filter((a) => a.method === 'free_choice')
    // OVERLAP THE TRIAL, not merely exist. `arrangementExposures` never reads
    // `endedAt`, so a bowl removed eight days BEFORE the trial started — or set down
    // after it ended — rendered "available alongside the trial — continuously" and
    // drove §7.2's "exclusive feeding cannot be established at any coverage". Worse,
    // `report.ts` date-filters these same rows for `DietSummary.freeFed`, so one
    // document said zero free-fed arrangements in the Diet section and a continuous
    // off-list bowl in the trial block. Filtered HERE rather than in the shared
    // predicate: the trial's window is the report's business, not the predicate's.
    .filter((a) => {
      const from = dayIndexOfValue(a.activeFrom, timeZone)
      const until = dayIndexOfValue(a.activeUntil, timeZone)
      // A null `activeFrom` is a standing bowl of unrecorded origin (B-233) — treat
      // it as present from before the trial, which is the whole point of that null.
      const spanStart = from ?? -Infinity
      const spanEnd = until ?? Infinity
      const trialStart = ctx.startDayIndex as number
      const trialEnd = ctx.endDayIndex ?? localDayIndexOf(new Date(args.nowMs).toISOString(), tz) ?? trialStart
      return spanStart <= trialEnd && spanEnd >= trialStart
    })
    .map((a) => ({
      foodItemId: a.foodItemId,
      // Arrangements carry no brand/product on this input, so identity is the id
      // alone — which `matchAllowed` checks FIRST anyway. The §5.4 key only matters
      // for a re-photographed duplicate, and an arrangement points at one row.
      foodKey: null,
      label: a.foodLabel,
      // A bowl whose start was never recorded is still down DURING the trial
      // (B-233: `active_from` is when the owner first LOGGED the food, not when
      // the diet started), so it resolves on the trial's own first day rather
      // than being dropped for want of a date.
      startedAt: a.activeFrom ?? trial.startedAt,
      endedAt: a.activeUntil,
    }))

  const facts = computeTrialFacts({
    trial: {
      id: trial.id,
      startedAt: trial.startedAt,
      endedAt,
      targetDurationDays: trial.targetDurationDays,
      species,
    },
    allowedFoods,
    feedings,
    doses,
    arrangements,
    nowMs: args.nowMs,
    scopeStart: args.scope.startDate,
    scopeEnd: args.scope.endDate,
    timeZone: tz,
  })
  if (!facts.range) return null

  // §5.3 CANNOT RUN WITHOUT A USABLE ALLOWED SET, and the failure is not silent —
  // it is loud in the WRONG direction. With an empty or half-hydrated set every
  // feeding falls to rung 3, so 40 feedings of the PRESCRIBED diet render as "0
  // matched, 40 did not" and the vet reads a catastrophic adherence failure off a
  // cold cache. `lib/dietTrialFacts.ts` gates the card on exactly this; the report
  // is the surface where getting it wrong is most expensive.
  //
  // A `primary_diet` row is required, not merely a row: the sanctioned protein set
  // (rung 2's comparator) is built from those alone, and a trial whose only rows
  // are permitted extras has nothing to define the diet with.
  const hasPrimary = allowedFoods.some((f) => f.role === 'primary_diet')

  const { startDayIndex, endDayIndex } = facts.range
  // ITEMISATION WALKS THE EVIDENCE WINDOW, NOT THE COVERAGE RANGE (B-422).
  //
  // `facts.range` is clipped at both ends — head by §10 S3, tail by B-422's
  // overrun rule — and both clips belong to the COVERAGE denominator. Using it
  // here re-applied them as an evidence bound, and the adversarial pass rendered
  // the result: a table-chicken feeding logged five days past the effective end
  // on a trial the app still called active was COUNTED in `offDiet` (which comes
  // from the module) and MISSING from `exposures.items` (which comes from this
  // loop) — so page 1 read "1 / 124 — dates in appendix C" while Appendix C read
  // "Every one of the 124 feedings logged in this window matched the trial diet
  // or a permitted food." Emptying the itemisation had unlocked an affirmative
  // all-clear the report has never otherwise printed, and `confounderFeedings`,
  // the protein tally and the protein-over-time chart inherited it from here.
  const evidence = facts.exposureRange ?? { startDayIndex, endDayIndex }
  const inRange = (dn: number | null): dn is number =>
    dn !== null && dn >= evidence.startDayIndex && dn <= evidence.endDayIndex

  // A SECOND PASS OVER THE SAME PREDICATE, not a second predicate. `computeTrialFacts`
  // returns the aggregates; the render also needs per-row provenance (which allowed
  // row permitted a feeding, so §7 can print "DentaStix — 168 feedings"). Both call
  // `classifyFeeding` with the same context over the same range, so they cannot
  // disagree — and the alternative, widening PR 5's return shape from a consumer,
  // is how a shared module stops being shared.
  const permittedCounts = new Map<string, number>()
  const symptomDays = [...new Set(args.symptomDayIndices)]
  const exposures: TrialExposure[] = []
  for (const e of args.meals) {
    if (!e.meal) continue
    const dn = dayIndexOf(ctx, e.occurredAt)
    if (!inRange(dn)) continue
    const classification = classifyFeeding(ctx, toTrialFeeding(e))
    if (classification.verdict === 'permitted' && classification.permittedBy) {
      const key = allowedRowKey(classification.permittedBy)
      permittedCounts.set(key, (permittedCounts.get(key) ?? 0) + 1)
    }
    if (!classification.offDiet) continue
    exposures.push({
      eventId: e.id,
      occurredAt: e.occurredAt,
      dayIndex: dn,
      label: mealLabel(e),
      classification,
      // §5.5's named counterexample, held: the juxtaposition is a 1–14 day FORWARD
      // window, species-dependent, never same-day and never a nearest-preceding-meal
      // join. The day indices come from `dayIndexOf(ctx, …)` — the owner's local
      // midnight on the report's clock — never a UTC epoch-day, which is the
      // two-day disagreement B-421 exists to kill.
      symptomInChallengeWindow: symptomDays.some((sd) => isWithinChallengeWindow(dn, sd, species)),
      // A non-empty captured array IS the panel having been read — the same signal
      // rung 2 keys on. Empty means nothing to say; non-empty and still rung 3 means
      // "read, and nothing in it is outside the trial diet", which is a different
      // sentence and a much more interesting one.
      panelWasRead: (e.meal.proteins ?? []).length > 0,
      // THE OPERATIVE REASON, WHICH IS NEITHER RUNG. This same food IS on the allowed
      // list — just not on this day. §7's dated-membership rule is what makes that
      // possible ("feedings are scored against the list in force on the day"), and
      // cold-read round 4 caught the Why column asserting the wrong check because of
      // it: a Jun 2 DentaStix rendered "Protein not in the trial diet" while page 1
      // listed the identical food as a "permitted treat (from Jun 8) ×25", and those 25
      // later feedings of the identical protein set are correctly absent from this
      // table. A vet cannot reconcile those two lines, and the protein reason is the
      // misleading half — the feeding is here because it predates permission.
      //
      // Computed in the ADAPTER, from the allowed rows plus this feeding's day. The
      // shared predicate is untouched: it answers "off-diet on this day?", and this
      // answers "would it have been permitted later?", which is a report-shaped
      // question about how to explain the row.
      // ASKED OF THE ONE PREDICATE, not answered by a second copy of its identity
      // rules. Re-implementing `matchAllowed`'s food_id-then-food_key match here is
      // precisely the duplication this PR exists to delete, so instead the same
      // feeding is re-classified as if fed on each later `allowedFrom` date and the
      // predicate's own verdict is read back. Distinct dates are a handful at most.
      permittedLaterFrom: (() => {
        const laterDates = [
          ...new Set(
            allowedFoods
              .map((f) => f.allowedFrom)
              .filter((from) => {
                const fromDn = dayIndexOfValue(from, timeZone)
                return fromDn !== null && fromDn > dn
              }),
          ),
        ].sort()
        for (const from of laterDates) {
          const asIfLater = classifyFeeding(ctx, { ...toTrialFeeding(e), occurredAt: from })
          if (asIfLater.verdict === 'permitted') return from
        }
        return null
      })(),
    })
  }
  exposures.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId))

  // #7 — THE RECONCILIATION GUARD the `allowedSetUnavailable` comment already
  // promised and did not implement. It tested only "is there a `primary_diet` row",
  // while claiming to cover the "empty OR half-hydrated set" case where 40 feedings of
  // the PRESCRIBED diet render as "0 matched, 40 did not". With a thin food join —
  // the exact state `mapAllowedFoods` documents with `foodKey: null` — the adversarial
  // pass got `154 / 154 Feedings not matched to the trial diet` and §7.2 "supports
  // interpreting it".
  //
  // The cheapest possible guard is the one `permittedFoods` had already computed and
  // thrown away: if a `primary_diet` row exists and permitted NONE of a substantial
  // number of feedings, the set did not hydrate — because an owner who logged dozens
  // of feedings on a trial fed the trial diet at least once. It cannot mistake a real
  // finding for a cold cache: a real all-off-diet trial still has its feedings in
  // Appendix C, and what is withheld is the CLAIM, never the record.
  const primaryPermitted = allowedFoods
    .filter((f) => f.role === 'primary_diet')
    .reduce((n, f) => n + (permittedCounts.get(allowedRowKey(f)) ?? 0), 0)
  const allowedSetUnavailable =
    !hasPrimary || (primaryPermitted === 0 && facts.exposures.totalFeedings >= UNHYDRATED_SET_FLOOR)

  const permittedFoods: TrialPermittedFood[] = allowedFoods
    .map((f) => ({
      label: f.label,
      role: f.role,
      allowedFrom: f.allowedFrom,
      allowedUntil: f.allowedUntil,
      feedings: permittedCounts.get(allowedRowKey(f)) ?? 0,
      addedAfterStart: openedAfter(f.allowedFrom, trial.startedAt, tz),
      endedBeforeWindowEnd:
        f.allowedUntil !== null && (dayIndexOfValue(f.allowedUntil, timeZone) ?? Infinity) < endDayIndex,
      proteins: [...(f.proteins ?? [])],
      panelRead: (f.proteins ?? []).length > 0,
    }))
    .sort(
      (a, b) =>
        roleOrder(a.role) - roleOrder(b.role) || b.feedings - a.feedings || a.label.localeCompare(b.label),
    )

  // #2's computation, RE-BASED ONTO THE SHARED MODULE (B-533).
  //
  // This was a local loop here — same floors, same `feedingWasFinished`, same
  // dropped 12h guard, same clipped range — and it was the ONLY place the
  // whole-range refusal existed. That is precisely why the card could ship an
  // "all 112 matched" claim over a record this file would have withheld: the
  // report had the right question and the client had no way to ask it.
  //
  // `computeTrialFacts` now returns `rangeRefusal` over the same range this loop
  // walked (`facts.range.startDayIndex … endDayIndex`, i.e. `inRange`), so the
  // loop is deleted rather than duplicated. Behaviour here is unchanged; what
  // changes is that there is one implementation for both surfaces to be wrong or
  // right together.
  const rangeRefusal: TrialDietRefusal | null = facts.rangeRefusal

  // OFF THE EVIDENCE END, so the report's day counter matches the card's
  // `getDietTrialProgress` (G5). Taking it off the clipped coverage end made the
  // report say "day 112 — 56 days past" where the card said "Day 123 of 56": the
  // report understated the trial's staleness by exactly the overrun it was
  // reporting, which is the one number on that block a vet reads for recency.
  const dayCounter = Math.max(1, evidence.endDayIndex - ctx.startDayIndex + 1)
  const target = trial.targetDurationDays > 0 ? trial.targetDurationDays : 0

  return {
    id: trial.id,
    status: normaliseStatus(trial.status),
    startedAt: trial.startedAt,
    endedAt,
    targetDurationDays: trial.targetDurationDays,
    vetName: trial.vetName,
    indication: trial.indication ?? null,
    species,
    trialDietLabels: trialDietLabels(allowedFoods, trial.foodLabel ?? null),
    dayCounter,
    // NEVER "day 61 of 56". Dr. Chen on the design lock: "an app that renders Day
    // 61 of 56 tells me nobody is reading it" — and with 70–80% of trials
    // abandoned, stale-active is the steady state, not the edge case.
    daysPastTarget: target > 0 ? Math.max(0, dayCounter - target) : 0,
    rangeStartDate: dayKeyFromIndex(startDayIndex),
    rangeEndDate: dayKeyFromIndex(endDayIndex),
    rangeClipped: facts.range.clipped,
    untrackedDaysBeforeFirstLog: facts.untrackedDaysBeforeFirstLog,
    coverage: facts.coverage
      ? { daysLogged: facts.coverage.daysLogged, daysElapsed: facts.coverage.daysElapsed }
      : null,
    exposures: {
      totalFeedings: facts.exposures.totalFeedings,
      offDiet: facts.exposures.offDiet,
      byRung: facts.exposures.byRung,
      fedBeforePermitted: exposures.filter((x) => x.permittedLaterFrom !== null).length,
      unclassifiable: facts.exposures.unclassifiable,
      items: exposures,
    },
    antigenTally: facts.exposures.antigenTally,
    permittedFoods,
    allowedSetChangedAfterStart: permittedFoods.some((f) => f.addedAfterStart || f.endedBeforeWindowEnd),
    allowedSetUnavailable,
    interpretability: facts.interpretability,
    interpretabilityStatement: interpretabilityStatement(facts),
    belowCoverageFloor: facts.belowCoverageFloor,
    mayClaimAllMatched: mayClaimAllMatched(facts),
    // RE-BASED ONTO THE SHARED GATE (B-533). The three clauses that used to live
    // here — the interpretability floor, the range refusal, and the unreadable
    // permit set — are now inside `mayStateRecordClean` / `mayClaimAllMatched` in
    // `lib/dietTrial.ts`, so the card asks the identical question. This comment's
    // predecessor claimed "`lib/dietTrialFacts.ts` gates the card on exactly
    // this"; it did not, and an executed counterexample proved it. `stoppedReason`
    // is the one input the module cannot see, so it is still passed in.
    //
    // `allowedSetUnavailable` is kept in the `&&` belt-and-braces. The comment
    // here previously claimed this file's derivation was "narrower than the
    // module's" — it was the exact inverse, a strict SUPERSET, because the module
    // checked only `!hasPrimary` while this file also caught the half-hydrated set
    // (a primary row that matches nothing across ten-plus feedings). That gap is
    // what let the card render "0 matched, 110 did not" on a compliant owner. Both
    // disjuncts now live in `computeTrialFacts`; this local one is retained
    // because it counts PERMITTED feedings per allowed ROW, which is a finer
    // reconciliation than the module's role-level count and costs nothing to keep.
    mayStateRecordClean:
      mayStateRecordClean(facts, { stoppedForRefusal: trial.stoppedReason === 'refused' }) &&
      !allowedSetUnavailable &&
      // INTERPRETABILITY, NOT JUST THE FLOOR. `belowCoverageFloor` is
      // `interpretability === 'does_not_support'` and nothing else, so `not_yet` —
      // the state PR 5's own docstring calls "two-sided: Culprit may neither claim a
      // clean trial NOR raise an absence-based alarm" — sailed straight through all
      // three renderers. The adversarial pass proved it on THIS PR's own fixture:
      // day 3 of 56 rendered "all 3 matched the trial diet or a permitted food" while
      // the interpretability callout stayed deliberately silent, and the test asserted
      // the silence by checking only that the callout was absent — the page spoke two
      // rows above where the test looked.
      //
      // The clipped-range case is why this matters beyond a young trial: a week-6
      // recheck two days before the report clips the range to 3 of 46 days, so the
      // page read "day 46 of 56" beside "All matched" while four real exposures
      // (table chicken ×2, a rival kibble) appeared NOWHERE on the document. The
      // recheck is exactly when this report gets sent.
      // The interpretability floor, `stoppedReason !== 'refused'` and
      // `rangeRefusal === null` all moved into `mayStateRecordClean` above.
      true,
    oralRoute: facts.oralRoute,
    arrangementExposures: facts.arrangementExposures.map((a) => ({ label: a.label })),
    contamination: facts.contamination,
    trialDietRefusal: facts.trialDietRefusal,
    rangeRefusal,
    rangeRefusalSpansEpisodes: facts.rangeRefusalSpansEpisodes,
    stoppedReason: trial.stoppedReason ?? null,
    outcome: trial.outcome ?? null,
    outcomeNotes: trial.outcomeNotes ?? null,
    medicationOverlap: medicationOverlap(
      args.medications,
      // THE TRIAL'S OWN SPAN, not the logged range. `startDayIndex` is
      // `max(scope start, trial start)`, which is right for coverage and exposures —
      // both are statements about the RECORD — and wrong for a drug overlap, which is
      // a statement about the WORLD. A course does not pause on days the owner did not
      // log. Round 5: a trial that began May 18 with logging from May 21 rendered
      // "Apoquel · overlapping May 21–Jul 2 · 43 d" for a 46-day overlap, understating
      // the exact confound the §7.2 callout below it rests on.
      // …and B-422's tail clip is wrong here for exactly the same reason: it is a
      // COVERAGE bound, and a drug course does not stop because a trial overran
      // its target. Off the clipped end an Apoquel course running the whole
      // logged span rendered "Jun 1 – Sep 20 · 112 d" for a 123-day overlap.
      { startDayIndex: ctx.startDayIndex as number, endDayIndex: evidence.endDayIndex },
      trial.indication ?? null,
      args.scope.endDayNum,
      timeZone,
    ),
    loggingDensity: loggingDensity(args.mealLoggedDayIndices, startDayIndex, endDayIndex),
    challengeWindowDays: CHALLENGE_WINDOW_DAYS[species],
    challengeMarkerBaseRatePct: (() => {
      const total = endDayIndex - (ctx.startDayIndex as number) + 1
      if (total <= 0) return 0
      let qualifying = 0
      for (let dn = ctx.startDayIndex as number; dn <= endDayIndex; dn++) {
        if (symptomDays.some((sd) => isWithinChallengeWindow(dn, sd, species))) qualifying += 1
      }
      return Math.round((qualifying / total) * 100)
    })(),
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normaliseStatus(status: string): TrialBlock['status'] {
  return status === 'completed' || status === 'abandoned' ? status : 'active'
}

function roleOrder(role: TrialFoodRole): number {
  switch (role) {
    case 'primary_diet':
      return 0
    case 'permitted_treat':
      return 1
    case 'permitted_other':
      return 2
    default:
      return 3
  }
}

/** A row is identified by food + role + start, matching migration 040's UNIQUE —
 *  two dated windows for the same treat are two rows and must count separately. */
function allowedRowKey(f: AllowedFood): string {
  return `${f.foodItemId}|${f.role}|${f.allowedFrom}`
}

function mapAllowedFoods(rows: readonly TrialFoodSource[]): AllowedFood[] {
  return rows.map((r) => ({
    foodItemId: r.foodItemId,
    // Null — not a blank key — when the food row did not join, so membership falls
    // back to the id rather than colliding on the bare separator (`isUsableFoodKey`).
    foodKey: r.brand !== null || r.productName !== null ? trialFoodKey(r.brand, r.productName) : null,
    label: r.foodLabel,
    role: normaliseRole(r.role),
    allowedFrom: r.allowedFrom,
    allowedUntil: r.allowedUntil,
    primaryProtein: r.primaryProtein,
    proteins: r.proteins ?? [],
  }))
}

/** An unrecognised role must NOT become `primary_diet`: that would let an unknown
 *  value widen the sanctioned protein set, which is the one direction §5.5 D-A
 *  forbids. It falls to `permitted_other` — permitted, but never diet-defining. */
function normaliseRole(role: string): TrialFoodRole {
  switch (role) {
    case 'primary_diet':
    case 'permitted_treat':
    case 'permitted_other':
    case 'supplement':
      return role
    default:
      return 'permitted_other'
  }
}

function toTrialFeeding(e: TrialMealSource): TrialFeeding {
  const m = e.meal!
  return {
    eventId: e.id,
    occurredAt: e.occurredAt,
    foodItemId: m.foodItemId,
    foodKey: m.brand !== null || m.productName !== null ? trialFoodKey(m.brand, m.productName) : null,
    label: mealLabel(e),
    foodType: m.foodType,
    proteins: m.proteins ?? [],
    intakeRating: m.intakeRating,
  }
}

function mealLabel(e: TrialMealSource): string | null {
  const m = e.meal
  if (!m) return null
  const label = `${m.brand ?? ''} ${m.productName ?? ''}`.trim()
  return label.length > 0 ? label : null
}

/** Rung 4's inputs (C3). `form` comes from the medication_items catalog; the
 *  vehicle's identity from B-156's `paired_event_id`. Without the vehicle a daily
 *  pill hidden in the PRESCRIBED DIET counts as an exposure every day of the
 *  trial — C2's alarm-fatigue failure applied to the one food the owner cannot
 *  stop feeding. */
function mapDoses(
  doses: readonly TrialDoseSource[],
  items: readonly TrialMedItemSource[],
  eventsById: ReadonlyMap<string, TrialMealSource>,
): TrialDose[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  return doses.map((d) => {
    const item = d.medicationItemId ? byId.get(d.medicationItemId) ?? null : null
    const vehicle = d.pairedEventId ? eventsById.get(d.pairedEventId) ?? null : null
    const vm = vehicle?.meal ?? null
    return {
      eventId: d.eventId,
      occurredAt: d.occurredAt,
      drugLabel: item?.brandName ?? item?.genericName ?? null,
      form: item?.form ?? null,
      pairedEventId: d.pairedEventId,
      adherence: d.adherence,
      vehicleFoodItemId: vm?.foodItemId ?? null,
      vehicleFoodKey:
        vm && (vm.brand !== null || vm.productName !== null) ? trialFoodKey(vm.brand, vm.productName) : null,
    }
  })
}

function trialDietLabels(allowed: readonly AllowedFood[], fallback: string | null): string[] {
  const labels = allowed
    .filter((f) => f.role === 'primary_diet')
    .map((f) => f.label.trim())
    .filter((l) => l.length > 0)
  const deduped = [...new Set(labels)]
  if (deduped.length > 0) return deduped
  return fallback && fallback.trim().length > 0 ? [fallback.trim()] : []
}

function openedAfter(allowedFrom: string, startedAt: string, tz: string | undefined): boolean {
  const from = dayIndexOfValue(allowedFrom, tz ?? null)
  const start = dayIndexOfValue(startedAt, tz ?? null)
  return from !== null && start !== null && from > start
}

/** The §7 element the trial block re-sites rather than adds.
 *
 *  Every field here is descriptive. The one judgement-adjacent value is
 *  `antibacterialInGiTrial`, which is presence-only and additive. */
function medicationOverlap(
  medications: readonly TrialMedicationSource[],
  range: { startDayIndex: number; endDayIndex: number },
  indication: 'skin' | 'gi' | 'other' | null,
  scopeEndDayNum: number,
  timeZone: string | null,
): TrialMedicationOverlap[] {
  const out: TrialMedicationOverlap[] = []
  for (const m of medications) {
    const startDn = dayIndexOfValue(m.startedAt, timeZone)
    const endDn = m.endedAt ? dayIndexOfValue(m.endedAt, timeZone) : null
    // An unrecorded start is a STANDING course, not an absent one — the steroid
    // begun before the range and running throughout is precisely the confound that
    // makes a derm trial unreadable, so it is never dropped for want of a date.
    const spanStart = startDn ?? -Infinity
    const spanEnd = endDn ?? scopeEndDayNum
    if (spanStart > range.endDayIndex || spanEnd < range.startDayIndex) continue
    const from = Math.max(spanStart, range.startDayIndex)
    const to = Math.min(spanEnd, range.endDayIndex)
    out.push({
      drugName: m.drugName,
      isSupplement: m.isSupplement,
      startedAt: startDn === null ? null : m.startedAt,
      endedAt: m.endedAt,
      fromDate: dayKeyFromIndex(from),
      toDate: dayKeyFromIndex(to),
      daysOverlapping: to - from + 1,
      activeAtWindowEnd: endDn === null || endDn >= range.endDayIndex,
      overlapsLast7Days: to >= range.endDayIndex - 6,
      antibacterialInGiTrial: indication === 'gi' && looksAntibacterial(m.drugName),
    })
  }
  return out.sort(
    (a, b) => a.fromDate.localeCompare(b.fromDate) || a.drugName.localeCompare(b.drugName),
  )
}

/**
 * Presence-only name match against the antibacterials a small-animal GI patient
 * actually receives (generic stems + the brands owners type instead).
 *
 * A NEGATIVE IS NOT A FINDING. This is a name list, not a drug database: an
 * unlisted, misspelled or compounded antibiotic reads false, so no copy built on
 * it may ever say a trial was antibiotic-free. It can only add a sentence to a GI
 * trial that already renders the drug by name in the overlap list above.
 */
const ANTIBACTERIAL_STEMS = [
  'metronidazol',
  'flagyl',
  'tylosin',
  'tylan',
  'amoxicillin',
  'clavulan',
  'clavamox',
  'synulox',
  'enrofloxacin',
  'baytril',
  'marbofloxacin',
  'zeniquin',
  'doxycyclin',
  'tetracyclin',
  'cephalexin',
  'cefalexin',
  'cefpodoxime',
  'simplicef',
  'cefovecin',
  'convenia',
  'clindamycin',
  'antirobe',
  'azithromycin',
  'erythromycin',
  'trimethoprim',
  'sulfamethoxazole',
  'sulfadiazine',
  'chloramphenicol',
  'rifaximin',
  'neomycin',
  'gentamicin',
  'nitrofurantoin',
]

export function looksAntibacterial(drugName: string): boolean {
  const n = drugName.toLowerCase()
  return ANTIBACTERIAL_STEMS.some((s) => n.includes(s))
}

/** C5's disclosure. Split at the range midpoint, the same first-half/last-half
 *  shape the symptom delta uses, so the two are read against each other. */
/**
 * C5's disclosure, and the denominator is the whole design.
 *
 * IT COUNTS DISCRETIONARY LOGGING, NOT ANY LOG. Denominating on every event was the
 * adversarial pass's fourth break, and it inverted the mechanism into its opposite:
 * on a diet trial, meal logging is habitual and app-prompted, so it saturates the
 * denominator — a 42-day trial with meals logged twice daily and an itch count
 * collapsing 12 → 1 rendered "Logging held up across the trial, so a change in
 * symptom counts is not explained by a change in how often anything was logged."
 * That is the report affirmatively certifying the exact artefact C5 exists to
 * disclose, on the modal tiring owner, in the direction that ends a trial early.
 *
 * One series, no verdict — see the interface note for why the second one was deleted
 * rather than caveated.
 */
function loggingDensity(
  mealDayIndices: readonly number[],
  startDayIndex: number,
  endDayIndex: number,
): TrialLoggingDensity | null {
  const days = endDayIndex - startDayIndex + 1
  // Under a fortnight the halves are too short for the comparison to mean anything,
  // and a spurious density note on a two-week trial would discredit a record that is
  // fine. Silence, not a weak claim.
  if (days < 14) return null
  const firstDays = Math.floor(days / 2)
  const lastDays = days - firstDays
  const mid = startDayIndex + firstDays
  const split = (indices: readonly number[]) => {
    let first = 0
    let last = 0
    const seen = new Set<number>()
    for (const dn of indices) {
      if (dn < startDayIndex || dn > endDayIndex || seen.has(dn)) continue
      seen.add(dn)
      if (dn < mid) first += 1
      else last += 1
    }
    return {
      firstHalf: { daysLogged: first, days: firstDays },
      lastHalf: { daysLogged: last, days: lastDays },
    }
  }
  return { meals: split(mealDayIndices) }
}

/** Local-day index of a DATE or instant, on the report's clock — the SAME helper
 *  `dayIndexOf` resolves to, for the callers that have no trial context yet
 *  (`selectReportTrial` runs before one exists). */
function dayIndexOfValue(value: string | null, timeZone: string | null): number | null {
  if (!value) return null
  return localDayIndexOf(value, timeZone ?? undefined)
}

function dayKeyFromIndex(dayIndex: number): string {
  return new Date(dayIndex * MS_PER_DAY).toISOString().slice(0, 10)
}
