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
  interpretabilityStatement,
  isWithinChallengeWindow,
  mayClaimAllMatched,
  trialFoodKey,
  CHALLENGE_WINDOW_DAYS,
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
}

/** C5, ruled: the symptom trend is rendered AGAINST logging density over the same
 *  window. An owner-logged event stream decays with attention — highest at trial
 *  start, lowest by week 6 — so a falling symptom count is biased toward apparent
 *  improvement and a vet cannot tell a real remission from a tiring owner.
 *  Measure and disclose the bias; do NOT correct it with an owner-scored severity
 *  instrument the app has refused on every event type (A-1 REJECTED). */
export interface TrialLoggingDensity {
  firstHalf: { daysLogged: number; days: number }
  lastHalf: { daysLogged: number; days: number }
  /** Logging fell between halves — the direction that makes a symptom drop
   *  uninterpretable. Compared as RATES, since the halves can differ by a day. */
  loggingFell: boolean
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
  let bestKey: [number, number] = [-1, -Infinity]
  for (const t of trials) {
    const startDn = dayIndexOfValue(t.startedAt, timeZone)
    if (startDn === null) continue
    const endDn = dayIndexOfValue(trialEndValue(t), timeZone)
    // An open-ended trial runs through the window end; one that ended before the
    // window opened never overlaps.
    const spanEnd = endDn ?? window.endDayNum
    if (startDn > window.endDayNum || spanEnd < window.startDayNum) continue
    // OVERLAP IS NOT ENOUGH FOR AN ENDED TRIAL. A 90-day fallback window catches
    // the tail of a trial that finished ten weeks ago, and framing the whole report
    // as that trial's result would be a worse answer than framing it as symptom
    // monitoring: the trial describes three of the report's thirteen weeks. The
    // report belongs to a trial that is running, or one that has only just stopped.
    if (t.status !== 'active' && (endDn === null || window.endDayNum - endDn > endedGraceDays)) continue
    const key: [number, number] = [t.status === 'active' ? 1 : 0, startDn]
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
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
  /** Local-day indices of every logged event in the window (any type) — the C5
   *  density denominator's numerator. */
  loggedDayIndices: readonly number[]
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
  const allowedSetUnavailable = !allowedFoods.some((f) => f.role === 'primary_diet')

  const { startDayIndex, endDayIndex } = facts.range
  const inRange = (dn: number | null): dn is number =>
    dn !== null && dn >= startDayIndex && dn <= endDayIndex

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
    })
  }
  exposures.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId))

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
    }))
    .sort(
      (a, b) =>
        roleOrder(a.role) - roleOrder(b.role) || b.feedings - a.feedings || a.label.localeCompare(b.label),
    )

  const dayCounter = Math.max(1, endDayIndex - ctx.startDayIndex + 1)
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
    mayStateRecordClean:
      mayClaimAllMatched(facts) &&
      !allowedSetUnavailable &&
      !facts.belowCoverageFloor &&
      trial.stoppedReason !== 'refused',
    oralRoute: facts.oralRoute,
    arrangementExposures: facts.arrangementExposures.map((a) => ({ label: a.label })),
    contamination: facts.contamination,
    trialDietRefusal: facts.trialDietRefusal,
    stoppedReason: trial.stoppedReason ?? null,
    outcome: trial.outcome ?? null,
    outcomeNotes: trial.outcomeNotes ?? null,
    medicationOverlap: medicationOverlap(
      args.medications,
      { startDayIndex, endDayIndex },
      trial.indication ?? null,
      args.scope.endDayNum,
      timeZone,
    ),
    loggingDensity: loggingDensity(args.loggedDayIndices, startDayIndex, endDayIndex),
    challengeWindowDays: CHALLENGE_WINDOW_DAYS[species],
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
function loggingDensity(
  loggedDayIndices: readonly number[],
  startDayIndex: number,
  endDayIndex: number,
): TrialLoggingDensity | null {
  const days = endDayIndex - startDayIndex + 1
  // Under a fortnight the halves are too short for a rate comparison to mean
  // anything, and a spurious "logging fell" caveat on a two-week trial would
  // discredit a record that is fine. Silence, not a weak claim.
  if (days < 14) return null
  const firstDays = Math.floor(days / 2)
  const mid = startDayIndex + firstDays
  let first = 0
  let last = 0
  const seen = new Set<number>()
  for (const dn of loggedDayIndices) {
    if (dn < startDayIndex || dn > endDayIndex || seen.has(dn)) continue
    seen.add(dn)
    if (dn < mid) first += 1
    else last += 1
  }
  const lastDays = days - firstDays
  const firstRate = firstDays > 0 ? first / firstDays : 0
  const lastRate = lastDays > 0 ? last / lastDays : 0
  return {
    firstHalf: { daysLogged: first, days: firstDays },
    lastHalf: { daysLogged: last, days: lastDays },
    loggingFell: lastRate < firstRate,
  }
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
