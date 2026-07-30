// The ONE off-diet predicate (B-417 PR 5). Spec: docs/nyx-diet-trial-requirements.md
// §5.1 (the two metrics), §5.2 (G2 — what the app may say), §5.3 (the four rungs),
// §5.4 (food identity), §5.5 (the standing fact + D-A/D-B), §5.6 (free-fed +
// multi-pet), §6 (the clinical invariants), §7 (what the vet report renders).
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// §5.3, verbatim: "`classifyFeeding` lives in `lib/dietTrial.ts` as a shared pure
// module imported by the client, `generate-report` and `ask` — ONE
// implementation, not one documented intention." At the time that was written the
// repo held three different answers to "was this feeding off the trial diet", one
// of them shipped (`generate-report/report.ts:2246`'s `confounderFeedings`, which
// counts every treat and every human food, never consults the trial, lists the
// vet-PERMITTED treat as a contaminant, and cannot see a different-brand kibble
// fed as a meal at all). This module is the single definition those three
// collapse into. PR 7 re-bases the report onto it; B-351's log-time flag
// (`lib/trialContaminant.ts`) is already a consumer.
//
// PURE AND DEPENDENCY-FREE, and that is a hard constraint rather than a
// preference: `lib/trialContaminant.ts` imports AsyncStorage, `./supabase` and
// `./db` at module scope, which makes it unreachable from a Deno Edge Function —
// which is exactly how the third contradictory definition came to be written. So
// everything here takes plain data and returns plain data, and the `.ts` import
// extensions are load-bearing (Deno will not resolve an extensionless specifier;
// Metro and `moduleResolution: "bundler"` both accept one).
//
// ── THE RULE ABOVE THE RUNGS (§5.3) ──────────────────────────────────────────
//
// THE ALLOWED SET IS THE ONLY PERMIT PATH. The protein arm may only ADD an
// off-diet verdict; it can never remove one. The chain is CLOSED-WORLD, not
// permit/deny: an unknown, unread or empty protein set yields SILENCE from the
// protein arm and falls through to `off_diet_unrecognised` — never to an
// all-clear (B-351 D10, PM-ratified). There is no input to this module that
// produces "this feeding was definitely fine because we found nothing".
//
// ── THE TWO PROTEIN SETS, WHICH ARE NOT THE SAME SET ─────────────────────────
//
// This is the trap in the whole file, so it is stated once here and referenced
// from both call sites:
//
//   sanctionedProteins — the union of EVERY protein of EVERY `primary_diet`
//     food active on the day in question. The rung-2 comparator. NEVER widened
//     by a permitted extra (§5.5 D-A), or the allowed list becomes a
//     self-granted loophole: a vet-approved chicken treat would silently
//     sanction chicken for every other food in the library.
//
//   intendedProteins — each food's OWN owner-designated `primary_protein`. The
//     comparator for the STANDING CONTAMINATION FACT (§5.5), which asks a
//     different question: "does this food list more than it says on the front?"
//     Comparing a food against `sanctionedProteins` would be vacuous — a duck
//     formula that also lists chicken puts chicken INTO the union, so it could
//     never flag itself.
//
// Same inputs, two questions, two answers. Merging them re-opens B-351 shape ①.
import { canonicalizeProtein } from './protein.ts';
import { dropKinOfPrimary, partitionKinOfPrimary, proteinSourceBase } from './proteinRelation.ts';
import { localDayIndexOf } from './utils.ts';

// ── Inputs ───────────────────────────────────────────────────────────────────

export type TrialFoodRole =
  | 'primary_diet'
  | 'permitted_treat'
  | 'permitted_other'
  | 'supplement';

export type TrialSpecies = 'dog' | 'cat' | 'other';

/** One row of `diet_trial_foods`, plus the food's own protein evidence. */
export interface AllowedFood {
  foodItemId: string;
  /** Case-folded brand+product (`lib/food.foodIntakeKey`) — the §5.4 identity.
   *  Null when the food row has not hydrated; membership then falls back to the
   *  id, which is the pre-existing behaviour and not a new hazard. */
  foodKey: string | null;
  /** `diet_trial_foods.food_label`, captured at write time (it outlives the food). */
  label: string;
  role: TrialFoodRole;
  /** 'YYYY-MM-DD'. Membership is DATED — see `membershipOn`. */
  allowedFrom: string;
  allowedUntil: string | null;
  /** The owner-DESIGNATED main protein, never `proteins[0]`. See §5.5 / the
   *  `resolveTargetProtein` docstring in `lib/trialProtein.ts`: on a cleared
   *  designation `proteins[0]` is a protein the owner explicitly un-designated,
   *  and reading it would invert every check. */
  primaryProtein: string | null;
  /** The food's whole captured array. §5.3: the comparison is over FULL ARRAYS. */
  proteins: readonly string[];
}

export interface TrialSpec {
  id: string;
  /** 'YYYY-MM-DD' (the DATE column) or ISO. Day 1 of EXCLUSIVE feeding. */
  startedAt: string;
  /** Written on both completed and abandoned trials (§3.1). */
  endedAt?: string | null;
  /** First day of the transition ONTO the diet. Excluded from the exposure
   *  window BY CONSTRUCTION: the window opens at `startedAt`, and the transition
   *  is by definition the days before it. Carried so a surface can say so. */
  transitionStartedAt?: string | null;
  targetDurationDays?: number;
  species?: TrialSpecies;
}

/** One logged feeding — a `meal` event joined to `meals` and the food cache. */
export interface TrialFeeding {
  eventId: string;
  /** ISO instant. Bucketed to the owner's LOCAL day (§5.1, B-421). */
  occurredAt: string;
  foodItemId: string | null;
  foodKey: string | null;
  label: string | null;
  /** `food_items.food_type` — 'meal' | 'treat' | 'other' | null. */
  foodType: string | null;
  proteins: readonly string[];
  /** `meals.intake_rating` — the WSAVA 5-point scale, IN FULL:
   *  `refused | picked | some | most | all`, or null when unrated.
   *
   *  The five values are written out because getting them wrong is not a typo
   *  here. The first cut of `trialDietRefusal` tested `=== 'refused'` under a
   *  docstring that listed only four of them — no `picked` — so a cat rated
   *  "picked at it" on every bowl for fourteen days was invisible to this lane,
   *  and each `picked` rating additionally RAISED the denominator and pushed the
   *  refusal share down. A cat that picks was scored more viable than one that
   *  refuses outright, which is backwards: partial anorexia is the presentation
   *  an owner does not call about.
   *
   *  §5.1's fourth definitional correction: "coverage does not read intake, and
   *  must". It still does not enter the coverage RATIO — a bowl put down and
   *  refused is a day the owner kept the record, and scoring it as a gap would
   *  punish the most diligent owner in the app. What it feeds is
   *  `trialDietRefusal` below, which is what stops the clean two-fact card
   *  rendering over an animal that has not eaten. */
  intakeRating?: string | null;
}

/** One logged dose, for rung 4 (C3 — the oral route). */
export interface TrialDose {
  eventId: string;
  occurredAt: string;
  drugLabel: string | null;
  /** `medication_items.form`. 'chewable' is the ruled trigger. */
  form: string | null;
  /** B-156's shipped pairing: the food this dose was given inside. */
  pairedEventId: string | null;
  /** `medication_administrations.adherence` — the `dose_adherence` enum IN FULL:
   *  `given | partial | missed | refused`, or NULL for a dose whose answer is
   *  still unconfirmed. `partial` is owner-selectable and was missing from the
   *  first cut's docstring AND its check, which dropped a half-chewed flavoured
   *  chewable — unambiguously an exposure. See `classifyDose`. */
  adherence?: string | null;
  /** The paired vehicle's food identity, when there is one. Without it rung 4
   *  cannot tell a pill hidden in peanut butter from a pill hidden in the
   *  PRESCRIBED DIET — see `classifyDose`. */
  vehicleFoodItemId?: string | null;
  vehicleFoodKey?: string | null;
}

/** An overlapping `free_choice` feeding arrangement (§5.6). */
export interface TrialArrangement {
  foodItemId: string;
  foodKey: string | null;
  label: string | null;
  startedAt: string;
  endedAt?: string | null;
}

// ── B-422 — the effective end ────────────────────────────────────────────────
//
// NOTHING AUTO-COMPLETES A TRIAL. The §4.3 milestone is action-first and
// deliberately never expires, so `status = 'active'` is a lifecycle fact that
// only an owner tap can clear — and with most trials never formally completed,
// STALE-ACTIVE IS THE STEADY STATE, not an edge case. Every surface that read
// `status = 'active'` as "the pet is on this diet today" therefore kept acting
// on a trial that finished months ago:
//
//   • the widget's one-tap rows kept naming the trial diet for every unlogged
//     slot, so a habitual tap WROTE a meal event naming a food the pet has not
//     eaten since spring — write-path corruption of the record the vet reads,
//     not a display bug;
//   • three Signal detectors (staple washout, meal-type collapse, diet churn)
//     stayed suppressed forever and a weak correlation stayed promoted to band 1;
//   • the coverage denominator grew with the calendar, so a well-run 8-week trial
//     drifted below `COVERAGE_FLOOR` and stayed there — and §5.2 rules the
//     exposure count a FLOOR, so a permanently sub-floor trial suppresses the
//     record claim forever.
//
// So: a trial has an EFFECTIVE END even when nobody ended it.
//
// ── WHAT THIS DOES *NOT* DO ─────────────────────────────────────────────────
//
// IT BOUNDS BELIEF AND ONE DENOMINATOR. IT NEVER BOUNDS EVIDENCE — and this is
// the line the first cut of B-422 got wrong, so it is stated before anything
// else. That version applied the effective end to `buildTrialContext.endDayIndex`
// (which `isInTrialWindow` reads) and to the card's SQL reads, so the app stopped
// SEEING the record on a trial nobody ended. An `adversarial-reviewer` pass
// turned that single decision into four reassurance-direction failures:
//
//   • a cat refusing 38 of 38 rated bowls past the effective end had those
//     refusals never read — `trialDietRefusal` went null, coverage read 100%,
//     and `mayStateRecordClean` flipped FALSE → TRUE, so the card rendered the
//     clean two-fact presentation over an anorexic cat;
//   • a flavoured chewable logged after the last meal was dropped from the dose
//     loop, and because `oralRoute` is one of the five withholding clauses,
//     losing it turned silence into an affirmative "all N matched" claim;
//   • a since-visit report scope starting past the target end collapsed the
//     range below its own start, so `buildTrialBlock` returned null and the
//     whole trial section vanished — with an in-scope off-diet exposure in it;
//   • the present-tense refusal register spoke from data four months stale,
//     because its recency window was anchored on the clipped end.
//
// Every one of those DELETED A LOGGED FINDING to make a denominator behave, and
// §5.2 rules the exposure count a floor that may only ever move toward
// disclosing more. So: the effective end reaches `isTrialRunning` (belief) and
// `computeTrialFacts`'s coverage tail clip (one denominator), and nothing else.
//
// It also does not end the trial, and it must never remove the card. §4.3 is
// explicit that the
// milestone "never expires and re-surfaces until acted on" — the Pet-tab card is
// the ONLY way an owner can tell Culprit the trial is done, so a card that
// forgot an overrun trial would strand the record in the exact state this
// constant exists to bound. `status` stays the lifecycle authority: it governs
// migration 040's one-active-trial index, the card's presence, the completion
// sheet (`profile.tsx`'s `sheetTrial`) and the start modal's end-and-continue
// takeover (`dietTrialSetup.getActiveTrialForPet`). None of those consult this.
//
// ── WHY A FLAT CONSTANT ─────────────────────────────────────────────────────
//
// Keying the grace on `indication` was considered and rejected on a hard
// constraint, not on taste: `indication` is diagnosis-grade and is DELIBERATELY
// absent from the widget's App Group projection (`ACTIVE_DIET_TRIAL_QUERY`, PR
// 1's RLS review). A grace only some readers can compute is a second definition
// by construction. `(started_at, target_duration_days)` is the one pair every
// reader already has, so every reader reaches the same answer.

/**
 * How long past its own target an un-ended trial is still treated as running.
 *
 * FIFTY-SIX DAYS, and the number is derived from the CLINIC rather than from the
 * UI. The first cut used 28 — sized off §4.3's named one-tap extensions (+28d
 * skin / +14d GI) on the reasoning that the grace must outlast the extension the
 * owner meant to tap — and the adversarial pass showed that argument sizes the
 * grace off the SKIN case and then applies it to a GI trial whose real shortfall
 * is twice as long:
 *
 *   dog·gut default = 28d (P-1) · ACVIM 2026: continue ≥12 weeks before
 *   transitioning away = 84 days = target + 56.
 *
 * At 28 the app stopped believing that trial on day 56 of a course a vet had
 * asked to run to day 84 — and the observable was not a soft degradation: the
 * vet report's trial block VANISHED at day 71 (effective end + the 14-day
 * `TRIAL_ANCHOR_GRACE_DAYS`), so the report's own first question, "is this diet
 * trial working?", went unanswered in the middle of the intervention.
 *
 * 56 covers every cell in the P-1 table against its own clinical ceiling:
 * dog·gut 28→84, cat·gut 42→98, dog·skin and cat·skin 56→112 (against an 8–12
 * week band that tops out at 84). The accepted cost is the other direction, and
 * it is bounded where it used to be unbounded: an ABANDONED trial keeps its
 * widget one-tap row and its detector suppressions for up to eight weeks past
 * its target instead of forever.
 *
 * The sanctioned way to move the window is still the extension tap, which moves
 * `target_duration_days` and therefore moves this for every reader at once.
 *
 * PROVISIONAL, in the sense §0.4 uses: a clinical tolerance, flagged for Dr.
 * Chen (B-593). It is a lookup constant — no schema, no migration, no stored
 * value.
 */
export const TRIAL_OVERRUN_GRACE_DAYS = 56;

/**
 * The last local day on which an un-ended trial is still treated as running.
 *
 * Null means THERE IS NO EFFECTIVE END, which is the honest answer in both
 * degraded cases and is deliberately the non-disruptive one:
 *
 *  • an unparseable `started_at` — we cannot place the trial in time at all, and
 *    a staleness claim we cannot support must not be made (every window-dependent
 *    answer is already disabled by `startDayIndex === null`);
 *  • `target_duration_days <= 0` — a trial with no target has no window to
 *    overrun. `getDietTrialProgress` already treats 0 as "never completes"
 *    (`complete = targetDays > 0 && …`), and the column is `INTEGER NOT NULL`
 *    with no CHECK (migration 001), so 0 and negatives are reachable via sync.
 *
 * Day 1 IS the start day (§5.1), so the target's own last day is
 * `start + target - 1` and the grace is added after it.
 *
 * `trialTargetEndDayIndex` is the same value WITHOUT the grace — the trial's own
 * prescribed last day. The two are not interchangeable and the split is the
 * point: the grace governs how long we keep BELIEVING an un-ended trial runs,
 * and it must never reach a denominator. See `computeTrialFacts`'s tail clip.
 */
export function trialTargetEndDayIndex(
  trial: { startedAt: string; targetDurationDays?: number | null },
  timeZone?: string,
): number | null {
  const startIndex = localDayIndexOf(trial.startedAt, timeZone);
  if (startIndex === null) return null;
  const target = Math.floor(Number(trial.targetDurationDays ?? 0));
  if (!Number.isFinite(target) || target <= 0) return null;
  return startIndex + target - 1;
}

export function trialEffectiveEndDayIndex(
  trial: { startedAt: string; targetDurationDays?: number | null },
  timeZone?: string,
): number | null {
  const targetEnd = trialTargetEndDayIndex(trial, timeZone);
  return targetEnd === null ? null : targetEnd + TRIAL_OVERRUN_GRACE_DAYS;
}

/**
 * Is this trial running TODAY — the one question every behavioural reader asks.
 *
 * `status` is optional because several callers filter it in SQL and never select
 * the column back (the widget's `ACTIVE_DIET_TRIAL_QUERY`, `generate-signal`'s
 * probe). Absent therefore means "the caller's query already established this is
 * the active row". A caller that HAS the column must pass it — a terminal trial
 * is never running regardless of its dates.
 *
 * An unreadable clock (`nowMs` non-finite) or an absent effective end answers
 * TRUE: this predicate exists to WITHDRAW behaviour from a trial we can prove is
 * over, and proving nothing is not proving it is over. Every failure direction
 * here lands on the shipped behaviour rather than on a new, unasked-for silence.
 */
export function isTrialRunning(
  trial: {
    startedAt: string;
    targetDurationDays?: number | null;
    status?: string | null;
    endedAt?: string | null;
  },
  nowMs: number,
  timeZone?: string,
): boolean {
  if (trial.status != null && trial.status !== 'active') return false;
  // `Number.isFinite` BEFORE `new Date(nowMs)`: `new Date(NaN).toISOString()`
  // THROWS `RangeError`, so an unreadable clock would take the caller down
  // rather than fall through to the documented `true`. Caught by this function's
  // own suite, which is the reason the degraded-input case is tested at all.
  if (!Number.isFinite(nowMs)) return true;
  const todayIndex = localDayIndexOf(new Date(nowMs).toISOString(), timeZone);
  if (todayIndex === null) return true;
  // An `ended_at` on a row still marked active is a sync artefact, but it is an
  // owner-authored fact and it only ever ends the trial EARLIER than the
  // effective end would. Honour it.
  if (trial.endedAt != null && trial.endedAt !== '') {
    const endedIndex = localDayIndexOf(trial.endedAt, timeZone);
    if (endedIndex !== null && todayIndex > endedIndex) return false;
  }
  const effectiveEnd = trialEffectiveEndDayIndex(trial, timeZone);
  if (effectiveEnd === null) return true;
  return todayIndex <= effectiveEnd;
}

// ── The resolved context ─────────────────────────────────────────────────────

export interface TrialContext {
  trial: TrialSpec;
  allowedFoods: readonly AllowedFood[];
  species: TrialSpecies;
  /** Local-day index of `started_at`, or null when unparseable (which disables
   *  every window-dependent answer rather than guessing a day). */
  startDayIndex: number | null;
  /** Inclusive end of the window: the EARLIER of `ended_at` and the B-422
   *  effective end. Null only when neither is knowable — an open trial whose
   *  target cannot bound it, which `computeTrialFacts` then bounds at today. */
  endDayIndex: number | null;
  timeZone?: string;
}

/** Resolve a trial + its allowed set into the context every predicate takes.
 *
 *  `timeZone` is optional and every CLIENT caller omits it — the device's zone is
 *  the owner's midnight, which is the production path (B-421). It exists so the
 *  Edge Functions can bucket by `user_profiles.timezone` and reach the same
 *  answer as the phone rather than a UTC one. */
export function buildTrialContext(
  trial: TrialSpec,
  allowedFoods: readonly AllowedFood[],
  opts?: { timeZone?: string },
): TrialContext {
  const timeZone = opts?.timeZone;
  return {
    trial,
    allowedFoods,
    species: trial.species ?? 'other',
    startDayIndex: localDayIndexOf(trial.startedAt, timeZone),
    // THE DECLARED END ONLY — the B-422 effective end deliberately does NOT
    // appear here, and the first cut of B-422 put it here and was wrong.
    //
    // This bound feeds `isInTrialWindow`, which gates `classifyFeeding`,
    // `classifyDose`, `allowedFoodsOn` and `arrangementExposures` — i.e. it
    // decides what the app is allowed to SEE. Capping it at the effective end
    // made the app stop reading the record on a trial nobody ended, and the
    // adversarial pass priced that immediately: a cat refusing 38 of 38 rated
    // bowls across 19 days, past a stale trial's effective end, had
    // `trialDietRefusal` go null and `mayStateRecordClean` flip FALSE → TRUE.
    // The card then rendered the clean two-fact presentation over an anorexic
    // cat — reassurance-on-absence, produced by the fix.
    //
    // The effective end bounds BELIEF (`isTrialRunning`, read by the widget, the
    // Signal engine, the report's trial selection and the contaminant context)
    // and it bounds ONE DENOMINATOR (`computeTrialFacts`'s coverage end). It
    // never bounds evidence.
    endDayIndex: trial.endedAt ? localDayIndexOf(trial.endedAt, timeZone) : null,
    timeZone,
  };
}

/** Local-day index of an instant or date-only string, on the context's clock. */
export function dayIndexOf(ctx: TrialContext, value: string): number | null {
  return localDayIndexOf(value, ctx.timeZone);
}

/**
 * Is this day inside the trial's window?
 *
 * Lower bound is `started_at` — the first day of EXCLUSIVE feeding — so the
 * transition window is excluded by construction rather than by owner discipline
 * (migration 040's `transition_started_at` comment). Upper bound is `ended_at`
 * when the trial has stopped; an open trial has no upper bound here, and the
 * caller's `nowMs` is what bounds it in `computeTrialFacts`.
 */
export function isInTrialWindow(ctx: TrialContext, dayIndex: number | null): boolean {
  if (dayIndex === null || ctx.startDayIndex === null) return false;
  if (dayIndex < ctx.startDayIndex) return false;
  if (ctx.endDayIndex !== null && dayIndex > ctx.endDayIndex) return false;
  return true;
}

// ── Membership (rung 1) and the two protein sets ─────────────────────────────

/** Is this allowed-set row in force on `dayIndex`? (§3.2 — membership is DATED.)
 *
 *  Without the date gate, editing the allowed set RETROACTIVELY REWRITES the
 *  trial's exposure history: add the contraband on day 13 and twelve prior
 *  exposures silently re-score as permitted, the card flips to clean, and the
 *  vet-report appendix empties — with nothing on the page saying so.
 *
 *  ⚠️ B-456 IS OPEN HERE, AND THIS PR DELIBERATELY DOES NOT RULE IT. PR 3 opens
 *  every row's membership at the trial's `started_at`, for every role. That is
 *  necessary for `primary_diet` (a back-dated trial would otherwise render its own
 *  prescribed diet as un-permitted for the days before the owner told the app).
 *  Applied to a permitted EXTRA it also retroactively permits that treat across
 *  the whole back-dated span — which biases the exposure floor DOWNWARD, and §5.2
 *  says the count is a floor, never a total.
 *
 *  The alternative (open a `permitted_*` row on its CREATION day) over-counts,
 *  which is honest for a floor but flags a food the vet may genuinely have
 *  permitted from day one — the false-accusation direction §6.9 weighs heavily.
 *  Both directions have a real clinical cost, the backlog routes the call to
 *  Dr. Chen, and the behaviour here is what PR 3 already shipped — so this reads
 *  the column as written rather than inventing a per-role semantic. The ruling is
 *  a change to the `allowed_from` WRITE in `lib/dietTrialSetup.ts`, not to this
 *  predicate. */
function membershipOn(food: AllowedFood, dayIndex: number, timeZone?: string): boolean {
  const from = localDayIndexOf(food.allowedFrom, timeZone);
  // An unparseable `allowed_from` must not silently permit a food forever. It is
  // NOT NULL with a DEFAULT server-side, so this is a corrupt-value path; the
  // safe direction is to drop the row from the permit set (the feeding then falls
  // through the chain and is RECORDED), never to widen it.
  if (from === null || dayIndex < from) return false;
  if (food.allowedUntil) {
    const until = localDayIndexOf(food.allowedUntil, timeZone);
    // An unparseable `allowed_until` is treated as "still allowed" — the column
    // is nullable and only ever written to END a membership, so a corrupt value
    // means we cannot tell WHEN it ended, not that it never started.
    if (until !== null && dayIndex > until) return false;
  }
  return true;
}

/** The allowed-set rows in force on a given local day. */
export function allowedFoodsOn(ctx: TrialContext, dayIndex: number): AllowedFood[] {
  return ctx.allowedFoods.filter((f) => membershipOn(f, dayIndex, ctx.timeZone));
}

/**
 * §5.3 rung 2's comparator: the union of every protein of every `primary_diet`
 * food in force on this day.
 *
 * NOT widened by permitted extras — see the module header. A dark set (no
 * primary food has a captured array) means rung 2 simply cannot fire, and the
 * feeding falls to rung 3 and is still recorded. That costs ATTRIBUTION, not
 * detection (§5.3).
 */
export function sanctionedProteinsOn(ctx: TrialContext, dayIndex: number): Set<string> {
  const out = new Set<string>();
  for (const food of allowedFoodsOn(ctx, dayIndex)) {
    if (food.role !== 'primary_diet') continue;
    // A FOOD WITH NO DESIGNATED PRIMARY CONTRIBUTES NOTHING, and that is the fix
    // for the worst self-consistency break the adversarial pass found. Consider a
    // trial food carrying `['duck','chicken']` with a NULL `primary_protein` —
    // reachable three ways the code itself names (an AI extraction that designated
    // nothing, slice 3's "clear the main protein", an unresolved row). Unioning
    // its whole array would put CHICKEN into the sanctioned set, so:
    //   • the contaminant sanctions itself, and every chicken chew for the next
    //     eight weeks classifies with `antigens: []`;
    //   • `trialContamination` skips the same food (it has no comparator), so
    //     D-A — the entire reason B-351 shape ① exists — goes silent too;
    //   • and nothing anywhere tells the owner the check is off.
    // Requiring the designation makes the two sets agree: a food we cannot
    // evaluate for contamination is a food we do not let define the diet. The
    // sanctioned set can then come back EMPTY, which disables the protein arm and
    // fires `trialDietNote`'s B9 disclosure — silence plus a sentence, never a
    // confident wrong answer (D10).
    // ONE PREDICATE, not three. The third adversarial pass found the split: this
    // asked `canonicalizeProtein != null` while `isUncharacterizedTrialDiet` had
    // moved to `proteinSourceBase != null`, so a bare-process primary was
    // "uncharacterized" for the disclosure and "characterized" here. The page
    // then printed "no main protein on file" and "the trial diet also lists
    // Chicken and Soy" ONE ROW APART — R7's own defect #1, computed from the
    // comparator the row above disclaims.
    if (isUncharacterizedTrialDiet(food)) continue;
    const primary = canonicalizeProtein(food.primaryProtein);
    if (!primary) continue;
    // The designated primary is part of the diet even on a row whose array was
    // never captured — otherwise a manually-entered trial food with a main
    // protein and no ingredient panel sanctions nothing at all.
    out.add(primary);
    // B-529/R7. A KIN TERM OF THIS FOOD'S OWN PRIMARY DOES NOT ENTER THE
    // SANCTIONED SET. A hydrolysed diet's label routinely yields both keys —
    // `hydrolyzed chicken` on the front, a panel term that canonicalizes to
    // `chicken` — and unioning both put INTACT CHICKEN into the set that
    // sanctions every other food in the library. A plain chicken chew fed
    // through such a trial then lost its attribution: it still landed off-diet
    // via rung 3, but `antigens` came back empty and the vet report's tally
    // never named chicken, which is the single protein a reader of an
    // elimination trial is looking for. Intact protein is exactly what a
    // hydrolysed trial excludes, so the intact term must keep its power to
    // flag OTHER foods.
    //
    // The food's own feedings do not become self-accusing as a result: rung 1
    // absorbs the same kinship against the food that permitted them (see
    // `classifyFeeding`). The two absorptions are a matched pair — changing one
    // without the other either re-opens this false negative or re-opens the
    // false self-contamination it was paired with.
    const { extra } = partitionKinOfPrimary(canonicalProteins(food.proteins), primary);
    for (const key of extra) out.add(key);
  }
  return out;
}

/**
 * The `primary_diet` foods in force on this day that we cannot fold into the
 * sanctioned set — i.e. those carrying no usable designated primary.
 *
 * R7(c)'s TRIGGER. `sanctionedProteinsOn` skips such a food entirely (it has no
 * comparator, and unioning its bare array would let a contaminant sanction
 * itself). The cost of skipping it, which B-529 found on `main`, is that the
 * food's OWN proteins are then outside the sanctioned set — so every feeding of
 * the prescribed diet tallies its own protein as "an antigen the trial diet does
 * not contain", once per feeding, for the length of the trial. The reproduction:
 * a duck trial with a designated kibble and an undesignated wet food of the same
 * line reported `duck liver` ×N as an antigen, with `trialContamination`
 * returning nothing to explain it.
 *
 * NARROW BY CONSTRUCTION, and the narrowness is the ruling's own purpose clause
 * ("never confidently counts the prescribed diet's own protein"). It fires on a
 * MISSING DESIGNATION, not on an unread ingredient panel. A `primary_diet` food
 * with a designated primary and an empty array is a different and much more
 * common state — nothing of it is dropped from the sanctioned set, so it cannot
 * produce this miscount — and the over-claim it does carry ("we may not have
 * read everything this diet contains") is already governed by D10's completeness
 * gate and rendered as the report's incompleteness qualifier. Widening the
 * silence to cover it would darken the antigen tally on nearly every real trial
 * and buy nothing this defect is about.
 */
/** Distinct allowed-set rows, first occurrence wins — the labels a disclosure
 *  names, deduped across the days it was collected from. */
function dedupeAllowedFoods(foods: readonly AllowedFood[]): AllowedFood[] {
  const seen = new Set<string>();
  const out: AllowedFood[] = [];
  for (const f of foods) {
    if (seen.has(f.foodItemId)) continue;
    seen.add(f.foodItemId);
    out.push(f);
  }
  return out;
}

export function isUncharacterizedTrialDiet(food: AllowedFood): boolean {
  if (food.role !== 'primary_diet') return false;
  // A PROCESS WORD IS NOT A DESIGNATION. `canonicalizeProtein('hydrolyzed')` is
  // `'hydrolyzed'` — non-null, so a bare-process primary passed the old test and
  // the food was treated as characterized. The second adversarial pass executed
  // what that costs on the very diet class this ruling is about: a `primary_diet`
  // row designated `hydrolyzed` with panel `['hydrolyzed','chicken','soy']`
  // sanctioned CHICKEN for the whole library, so an intact-chicken chew on a
  // hydrolysed trial classified with `antigens: []` and no disclosure anywhere —
  // verbatim the false negative `sanctionedProteinsOn`'s R7 comment says the kin
  // rule exists to prevent. (`render.test.ts` already uses `'hydrolyzed'` as a
  // fixture primary, so the shape is one the codebase models.)
  //
  // The honest test is therefore whether the value names a SOURCE, not whether it
  // canonicalizes: a primary with no usable source base characterizes nothing.
  // Pre-existing rather than a regression, and the safe direction — the arm goes
  // dark and SAYS SO, where before it answered confidently and wrongly.
  return proteinSourceBase(food.primaryProtein) == null;
}

export function uncharacterizedTrialDietFoods(ctx: TrialContext, dayIndex: number): AllowedFood[] {
  return allowedFoodsOn(ctx, dayIndex).filter(isUncharacterizedTrialDiet);
}

/**
 * The same question over a RANGE rather than one day — every `primary_diet` food
 * lacking a designation whose membership overlaps `[fromDay, toDay]`.
 *
 * WHY A RANGE VERSION EXISTS. The disclosure that explains a paused antigen arm
 * must cover every day the arm was actually dark, and membership is DATED: a
 * trial food swapped out on day 10 leaves ten days of missing attribution that a
 * `today`-anchored check cannot see, because that row is no longer in force. The
 * adversarial pass executed exactly that — day-5 feedings silenced, day-25
 * feedings attributed, and the card showing no pause sentence at all. A
 * disclosure that disappears while the hole it explains remains is worse than no
 * disclosure, because the page then reads as though nothing was ever wrong.
 */
export function uncharacterizedTrialDietFoodsInRange(
  ctx: TrialContext,
  fromDay: number,
  toDay: number,
): AllowedFood[] {
  return ctx.allowedFoods.filter((f) => {
    if (!isUncharacterizedTrialDiet(f)) return false;
    const from = localDayIndexOf(f.allowedFrom, ctx.timeZone);
    if (from === null || from > toDay) return false;
    if (f.allowedUntil) {
      const until = localDayIndexOf(f.allowedUntil, ctx.timeZone);
      if (until !== null && until < fromDay) return false;
    }
    return true;
  });
}

/** Canonical, de-duplicated, order-preserving protein keys of a food. */
function canonicalProteins(proteins: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of proteins) {
    const key = canonicalizeProtein(raw);
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** The members of `proteins` that the sanctioned set does not contain. Order is
 *  preserved (prominence order, as captured) so copy names the most prominent
 *  antigen first. */
export function unsanctionedProteins(
  proteins: readonly string[],
  sanctioned: ReadonlySet<string>,
): string[] {
  return canonicalProteins(proteins).filter((key) => !sanctioned.has(key));
}

/**
 * The §5.4 identity key: case-folded brand + product, separated by US (U+001F).
 *
 * THIS IS THE SAME FORMULA AS `lib/food.foodIntakeKey`, RESTATED — not a second
 * definition by choice. `lib/food.ts` is unreachable from a Deno Edge Function:
 * it carries `import type { … } from './db'`, which is both extensionless (Deno
 * will not resolve it) and pulls the expo-sqlite stack into the type graph. So
 * `generate-report` cannot call the client's copy, and the alternative — letting
 * the Edge Function inline the formula itself — is exactly how the repo ended up
 * with three off-diet predicates in the first place.
 *
 * Restating it HERE, in the one module both sides already import, keeps the
 * duplication down to one line in one place with a test that pins it:
 * `lib/dietTrialFoodKey.test.ts` asserts `trialFoodKey === foodIntakeKey` over a
 * cross-product of casings and blanks, so a change to either one fails jest.
 */
export function trialFoodKey(brand: string | null, productName: string | null): string {
  return `${(brand ?? '').toLowerCase()}\u001F${(productName ?? '').toLowerCase()}`;
}

/** A brand+product key is only an identity if it actually names something.
 *  `foodIntakeKey('','')` is the bare separator, and brand/product are NOT NULL
 *  but not NON-EMPTY — so two blank-named rows would otherwise collide and the
 *  second would be silently treated as a trial food and never recorded. That is
 *  the dangerous direction. (Carried verbatim from `lib/trialContaminant.ts`,
 *  where the same hole was found.) */
function isUsableFoodKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && key.replace(/\u001F/g, '').trim().length > 0;
}

/**
 * §5.4 — identity is the case-folded brand+product, NOT the UUID.
 *
 * Matching the raw `food_item_id` breaks on an action the app actively
 * encourages: re-photographing the bag mints a new row, the picker's
 * `MAX(photo_path)` tie-break starts projecting it, and every remaining meal of
 * the PRESCRIBED diet flags off-diet on a 100%-compliant owner. Four duplicate
 * brand+product groups already exist in a 59-row library.
 *
 * The id is still checked FIRST, and that is not redundancy: when a food row has
 * not hydrated locally the join yields a null `foodKey` while `meals.food_item_id`
 * is still present, so the id is the only identity available — and without it an
 * un-hydrated library would classify the trial diet itself as an exposure.
 */
function matchAllowed(
  candidates: readonly AllowedFood[],
  foodItemId: string | null,
  foodKey: string | null,
): { food: AllowedFood; matchedBy: 'food_id' | 'food_key' } | null {
  if (foodItemId) {
    const byId = candidates.find((f) => f.foodItemId === foodItemId);
    if (byId) return { food: byId, matchedBy: 'food_id' };
  }
  if (isUsableFoodKey(foodKey)) {
    const byKey = candidates.find((f) => isUsableFoodKey(f.foodKey) && f.foodKey === foodKey);
    if (byKey) return { food: byKey, matchedBy: 'food_key' };
  }
  return null;
}

// ── The classification (§5.3) ────────────────────────────────────────────────

export type FeedingVerdict =
  /** In the allowed set on this date (rung 1). Counted, never silenced. */
  | 'permitted'
  /** Carries a protein the trial diet does not (rung 2). */
  | 'off_diet_protein'
  /** Neither (rung 3) — "not recognised as trial food", never a contaminant
   *  assertion. This is the MODAL case on a real library, not the edge case. */
  | 'off_diet_unrecognised'
  /** The feeding names no food at all, so there is nothing to classify. Excluded
   *  from BOTH sides of the exposure ratio — see `TrialExposureSummary`. */
  | 'unclassifiable'
  /** Outside `started_at … ended_at`. Not a verdict about the food. */
  | 'out_of_window';

export type ClassificationRung =
  | 'allowed_set'
  | 'derived_protein'
  | 'unrecognised'
  | 'no_identity'
  | 'out_of_window';

export interface FeedingClassification {
  verdict: FeedingVerdict;
  /** Which rung decided it. §5.3: "every flag must be tappable to its reason,
   *  naming which rung fired" — a flag the owner cannot interrogate is an
   *  unfalsifiable accusation. This field is what makes that renderable. */
  rung: ClassificationRung;
  /** Counted in the exposure NUMERATOR. */
  offDiet: boolean;
  /** Counted in the exposure DENOMINATOR. */
  countsAsFeeding: boolean;
  /** D-B — unsanctioned proteins carried by this feeding, recorded EVEN WHEN THE
   *  VERDICT IS `permitted`. See `classifyFeeding`. */
  antigens: string[];
  /** The allowed-set role, when rung 1 matched. Provenance for §7's rendering. */
  role: TrialFoodRole | null;
  /** How rung 1 matched, for the reason sheet (§5.4's duplicate-capture case). */
  matchedBy: 'food_id' | 'food_key' | null;
  /** The allowed-set row that permitted it, for copy. */
  permittedBy: AllowedFood | null;
  /**
   * Was the antigen arm actually CONSULTED for this feeding? (B-529/R7(c).)
   *
   * False means the arm was dark — `antigens: []` here is "we did not check",
   * NOT "we checked and found nothing". The distinction is invisible in the
   * array itself, and the third adversarial pass executed what that costs: the
   * vet report's appendix C renders a per-row reason, and its rung-3 branch says
   * "its label carries nothing the trial diet does not" whenever the panel was
   * read — an affirmative all-clear that the silence rule made reachable for
   * feedings nothing had examined. A correct `Chicken ×5 / "Protein not in the
   * trial diet"` became `[] / "carries nothing the trial diet does not"` on
   * byte-identical input. Any surface rendering a REASON must gate on this.
   */
  attributionChecked: boolean;
}

/**
 * THE predicate. Four rungs, in order, closed-world.
 *
 * 1. In `diet_trial_foods` on the feeding's date → `permitted`, stop — AND record
 *    any unsanctioned protein it carries as an antigen (D-B).
 * 2. Carries a protein outside the sanctioned set → `off_diet_protein`.
 * 3. Neither → `off_diet_unrecognised`.
 * 4. The oral route is `classifyDose`, below — a medication is not a feeding and
 *    `diet_trial_foods` (a set of `food_items`) structurally cannot hold one.
 *
 * D-B — RECORD THE ANTIGEN, KEEP THE VERDICT. Rung 1's `stop` is what makes a
 * vet-approved treat permitted, counted, and never protein-checked; without the
 * antigen record, six dental chews a day reads as a clean elimination to both
 * owner and vet. That is a STRONGER false negative than the one this feature
 * replaces, because it arrives with the authority of a two-fact presentation. The
 * verdict nonetheless stays `permitted`: the feeding was vet-approved, and
 * flagging it would score the OWNER for following instructions (§6.9).
 * Compliance is about the owner and stays clean; antigen exposure is about the
 * animal and stays complete.
 */
export function classifyFeeding(
  ctx: TrialContext,
  feeding: TrialFeeding,
): FeedingClassification {
  const dayIndex = dayIndexOf(ctx, feeding.occurredAt);
  if (!isInTrialWindow(ctx, dayIndex)) {
    return blank('out_of_window', 'out_of_window', { countsAsFeeding: false });
  }
  const day = dayIndex as number;
  const sanctioned = sanctionedProteinsOn(ctx, day);
  // AN EMPTY SANCTIONED SET TURNS THE PROTEIN ARM OFF, it does not turn it on.
  // Empty means "nothing here can say what the trial diet is built on" — no
  // `primary_diet` row has hydrated, or none carries a designated primary. Under
  // a naive set difference EVERY protein is then unsanctioned, so every food in
  // the library would be reported as carrying a contaminant, and the vet report's
  // antigen tally would attribute exposures against a diet nobody has
  // characterised. That is the inversion `resolveTargetProtein` documents at the
  // single-protein scale, arriving at set scale.
  //
  // Dark, not permissive: rung 3 still RECORDS the feeding. §5.3's own words —
  // "a dark rung 2 costs attribution, not detection".
  //
  // R7(c) — THE SILENCE RULE, the second reason the arm goes dark, and it applies
  // to RUNG 2 ONLY. An in-force `primary_diet` food with no designated primary is
  // dropped from the sanctioned set, which makes that set a PARTIAL view of the
  // prescribed diet — and a partial view cannot support a confident claim about
  // what the trial diet does NOT contain. A rung-2 feeding is off the allowed
  // list either way, so going quiet here costs the protein NAME while rung 3
  // still records the feeding: attribution, not detection, exactly as §5.3 frames
  // the trade.
  //
  // ⚠️ IT MUST NOT REACH RUNG 1, and the first cut of this ruling did — justified
  // by a comment claiming "every feeding is still recorded by rung 3", which is
  // FALSE for a permitted feeding. A rung-1 hit STOPS at rung 1; its antigen list
  // is the only channel it has. The adversarial pass executed the cost: a 40-day
  // duck trial with two vet-approved chicken dental chews a day went from
  // `chicken ×80` to an EMPTY tally, while `mayStateRecordClean` stayed true and
  // the report printed "All 120 matched the trial diet or a permitted food" in
  // bold — the six-dental-chews-a-day false negative this module's own docstring
  // names, reintroduced one empty column away. Silence on rung 1 is not lost
  // attribution, it is lost DETECTION, and it is the reassurance direction
  // `clinical-guardrails` forbids.
  const canAttribute = sanctioned.size > 0;
  const canAttributeUnrecognised =
    canAttribute && uncharacterizedTrialDietFoods(ctx, day).length === 0;

  // Rung 1 — the ONLY permit path.
  const hit = matchAllowed(allowedFoodsOn(ctx, day), feeding.foodItemId, feeding.foodKey);
  if (hit) {
    return {
      verdict: 'permitted',
      rung: 'allowed_set',
      offDiet: false,
      countsAsFeeding: true,
      // D-B. A `primary_diet` food's own proteins are IN the sanctioned set by
      // construction, so this is empty for the trial diet — which is C2 holding
      // by construction rather than by a special case: the trial diet's own
      // contamination is a trial-level standing fact (`trialContamination`),
      // never a per-feeding verdict fired 100+ times across 56 days.
      //
      // B-529/R7: "by construction" now needs the kinship, because
      // `sanctionedProteinsOn` deliberately withholds a kin term of the food's
      // own primary from the sanctioned set (so it can still flag OTHER foods).
      // Absorbing the same kinship HERE, against the food that actually
      // permitted this feeding, is what keeps that from rebounding onto the
      // prescribed diet as a self-accusation once per feeding. Scope matters:
      // the comparator is `hit.food.primaryProtein` — this food's own
      // designation — never the trial target in general, so a vet-approved
      // rabbit jerky that also lists chicken keeps its D-A/D-B antigen record
      // exactly as before.
      //
      // `dropKinOfPrimary`, NOT `partitionKinOfPrimary` — the permitting food's
      // OWN primary must survive here. On a duck trial the rabbit jerky's
      // `rabbit` is itself a genuine antigen, and the partition helper drops the
      // primary because there it is the comparator. Using it here deleted that
      // exposure from the vet report; the existing D-B test caught it.
      //
      // R7(c) AT RUNG 1 IS PER-FOOD, NOT GLOBAL. The defect the silence rule
      // exists for is narrow: a `primary_diet` food with no designation is
      // skipped by `sanctionedProteinsOn`, so ITS OWN proteins fall outside the
      // sanctioned set and every feeding of the prescribed diet tallies them as
      // "an antigen the trial diet does not contain" (`duck liver ×56` off a duck
      // trial's own wet food). Silencing exactly that feeding fixes it. Silencing
      // EVERY permitted feeding because some other row is missing a field is what
      // deleted the 80 chicken chews — a different food, fully characterized,
      // whose exposure the record knew about.
      antigens:
        canAttribute && !isUncharacterizedTrialDiet(hit.food)
          ? dropKinOfPrimary(
              unsanctionedProteins(feeding.proteins, sanctioned),
              hit.food.primaryProtein,
            )
          : [],
      role: hit.food.role,
      matchedBy: hit.matchedBy,
      permittedBy: hit.food,
      // Rung 1 consults the arm unless THIS feeding's own permitting food is the
      // uncharacterized one (the per-food scoping from the first repair).
      attributionChecked: canAttribute && !isUncharacterizedTrialDiet(hit.food),
    };
  }

  // A feeding that names no food carries no claim in either direction. Recording
  // it as an exposure would accuse an owner of a contamination on the strength of
  // a record-keeping gap (§6.9); silently counting it as "matched" would be the
  // reassurance G2 deletes. It is excluded from both sides and DISCLOSED as its
  // own count (§5.2 — the exposure figure is a floor, never a total).
  if (!feeding.foodItemId && !isUsableFoodKey(feeding.foodKey)) {
    return blank('unclassifiable', 'no_identity', { countsAsFeeding: false });
  }

  // Rung 2 — the derived protein arm. It may only ADD a verdict; an empty or
  // unread array is SILENCE and falls through to rung 3, never to an all-clear.
  const antigens = canAttributeUnrecognised
    ? unsanctionedProteins(feeding.proteins, sanctioned)
    : [];
  if (antigens.length > 0) {
    return {
      verdict: 'off_diet_protein',
      rung: 'derived_protein',
      offDiet: true,
      countsAsFeeding: true,
      antigens,
      role: null,
      matchedBy: null,
      permittedBy: null,
      attributionChecked: canAttributeUnrecognised,
    };
  }

  // Rung 3 — the modal case on a real library.
  return blank('off_diet_unrecognised', 'unrecognised', {
    offDiet: true,
    attributionChecked: canAttributeUnrecognised,
  });
}

function blank(
  verdict: FeedingVerdict,
  rung: ClassificationRung,
  over: { offDiet?: boolean; countsAsFeeding?: boolean; attributionChecked?: boolean } = {},
): FeedingClassification {
  return {
    verdict,
    rung,
    // Default TRUE for the rungs that never consult the arm (out-of-window, no
    // identity): there is no dark-arm claim to qualify. Rung 3 passes it
    // explicitly, because that is the rung whose copy makes an affirmative
    // statement about what the label carries.
    attributionChecked: over.attributionChecked ?? true,
    offDiet: over.offDiet ?? false,
    countsAsFeeding: over.countsAsFeeding ?? true,
    antigens: [],
    role: null,
    matchedBy: null,
    permittedBy: null,
  };
}

// ── Rung 4 — the oral route (C3) ─────────────────────────────────────────────

export type OralRouteTrigger = 'chewable' | 'food_vehicle';

export interface OralRouteExposure {
  eventId: string;
  occurredAt: string;
  drugLabel: string | null;
  trigger: OralRouteTrigger;
}

/**
 * §5.3 rung 4, C3 (PM override — detect the oral route in v1).
 *
 * An in-window dose whose item carries `form = 'chewable'`, OR any dose carrying
 * a `paired_event_id` food vehicle (B-156's shipped pairing), enters the exposure
 * set. Zero new schema: `medication_items.form` already ships 'chewable' as an
 * owner-selectable value.
 *
 * IT IS NEVER A REASON TO SKIP A DOSE (§6.8). A missed critical dose is a worse
 * outcome than a contaminated trial. `oralRouteCopy` below is the only sanctioned
 * phrasing, and it points at the vet for a substitution — never at the next dose.
 *
 * Returned SEPARATELY from feedings and never folded into the feeding ratio: a
 * dose is not a feeding, and adding it to the numerator of a feedings-over-
 * feedings fraction would make `offDiet > totalFeedings` reachable.
 *
 * What this cannot see (B-419): flavoured NON-chewable forms — a flavoured liquid
 * antibiotic, a flavoured tablet. That residual is named on every surface by the
 * blind-spot qualifier, and `docs/…-requirements.md` §5.3's note stands: the
 * SUBSTITUTION beats the detection. A detector firing on day 14 is fourteen days
 * after the exposure it reports; the setup line acts on day 0.
 */
export function classifyDose(ctx: TrialContext, dose: TrialDose): OralRouteExposure | null {
  const dayIndex = dayIndexOf(ctx, dose.occurredAt);
  if (!isInTrialWindow(ctx, dayIndex)) return null;

  // A DOSE THAT DID NOT GO IN CARRIED NOTHING WITH IT — and "did not go in" is
  // defined ONCE, in `generate-signal/detection.ts:458`, over the same events:
  // `missed` and `refused` are off board, and `given` / `partial` / **null** are
  // ON. The `dose_adherence` enum is `given | partial | missed | refused`
  // (migration 020), and the first cut of this check tested `!== 'given'` — which
  // dropped a HALF-CHEWED flavoured chewable (unambiguously an exposure) and
  // dropped an unrated dose, while its comment claimed to be preventing exactly
  // the contradictory second definition it was creating.
  //
  // NULL IS ON BOARD HERE, and the asymmetry with B-156's fail-safe is deliberate.
  // For a COMPLIANCE detector an unconfirmed dose must never read as given (there
  // is no path to a reassuring verdict). For a CLOSED-WORLD EXPOSURE detector the
  // safe direction is the opposite: an unrated logged dose is a logged
  // administration, not an absence, and treating it as absent would quietly
  // restore the "all N matched" sentence. Same value, two questions, two correct
  // answers — which is why the rule is imported from the surface that already
  // ruled it rather than re-decided here.
  const adherence = dose.adherence?.trim().toLowerCase() ?? null;
  if (adherence === 'missed' || adherence === 'refused') return null;

  const form = dose.form?.trim().toLowerCase() ?? null;
  if (form === 'chewable') {
    return { eventId: dose.eventId, occurredAt: dose.occurredAt, drugLabel: dose.drugLabel, trigger: 'chewable' };
  }
  if (!dose.pairedEventId) return null;

  // THE VEHICLE HAS TO BE OFF THE LIST TO BE AN EXPOSURE. A daily pill hidden in
  // the PRESCRIBED DIET is the commonest way an owner gives a tablet on an
  // elimination trial, and counting it produced 56 oral-route exposures across a
  // 56-day trial — C2's alarm-fatigue failure (never fire on the food the owner
  // cannot stop feeding) applied to rungs 1–3 and forgotten at rung 4. The
  // vehicle resolves on the same identity rule as rung 1, so a re-photographed
  // bag of the trial diet is still the trial diet here too.
  const day = dayIndex as number;
  if (matchAllowed(allowedFoodsOn(ctx, day), dose.vehicleFoodItemId ?? null, dose.vehicleFoodKey ?? null)) {
    return null;
  }
  // An UNKNOWN vehicle still counts: the food was not on the list as far as
  // anything can tell, and the closed-world rule says record it. What is lost is
  // attribution, not detection.
  return { eventId: dose.eventId, occurredAt: dose.occurredAt, drugLabel: dose.drugLabel, trigger: 'food_vehicle' };
}

// ── §5.5 — the standing contamination fact (D-A) ─────────────────────────────

export interface ContaminationFact {
  food: AllowedFood;
  /** Proteins in this food beyond its OWN designated primary, EXCLUDING terms
   *  that name the primary's own source at a different stage of processing
   *  (B-529/R7 — see `derivedFromPrimary`). */
  extraProteins: string[];
  /** B-529/R7 — label terms absorbed as the primary's own source: the `chicken`
   *  on a `hydrolyzed chicken` diet's panel. NOT a contamination and never
   *  counted as one, but carried rather than discarded so the suppression stays
   *  inspectable.
   *
   *  No surface renders this as its own sentence today, and it does not need to:
   *  every surface that suppresses on kinship also prints the food's full
   *  protein set verbatim (the report's appendix B, the food detail screen), so
   *  both terms are already on the page — only the claim that their
   *  co-occurrence is a contamination is gone. A future surface that suppresses
   *  WITHOUT showing the set owes the reader a sentence built from this field. */
  derivedFromPrimary: string[];
}

/**
 * Shape ① — a food on the allowed list lists more than it says on the front.
 *
 * COMPUTED ONCE PER TRIAL, NEVER PER FEEDING (C2). Evaluated per feeding it fires
 * on the PRESCRIBED food 100+ times across a 56-day trial — the alarm-fatigue
 * failure inverted onto the one food the owner cannot stop feeding, which trains
 * them to ignore the flag that matters on day 22.
 *
 * D-A: computed over `primary_diet` rows AND PERMITTED EXTRAS. The vet-approved
 * rabbit jerky that also lists chicken fat is exactly as trial-invalidating as a
 * contaminated primary diet, and less likely to be noticed. Cost: one more set
 * union, no new alarm surface, no per-feeding verdict.
 *
 * The comparator is the food's OWN `primaryProtein`, not `sanctionedProteins` —
 * see the module header. A food with no designated primary is skipped entirely:
 * with nothing to compare against, "everything in it is extra" is not a finding,
 * it is an artefact (and D10 forbids turning an unread record into a claim).
 */
export function trialContamination(ctx: TrialContext): ContaminationFact[] {
  const out: ContaminationFact[] = [];
  for (const food of ctx.allowedFoods) {
    // Same one predicate as `sanctionedProteinsOn` (see the note there): a food
    // whose primary names no SOURCE has no usable comparator, so "everything in
    // it is extra" is an artefact, not a finding.
    if (isUncharacterizedTrialDiet(food)) continue;
    const intended = canonicalizeProtein(food.primaryProtein);
    if (!intended) continue;
    // B-529/R7. A hydrolysed prescription diet lists its own source twice — the
    // front of pack designates `hydrolyzed chicken`, the panel yields `chicken`
    // — and a bare set difference read that as the trial food contaminating its
    // own trial. The B-417 cold read acted on it and reached the wrong clinical
    // conclusion (re-run, where the record said proceed to rechallenge), and the
    // caveat it generated additionally suppressed the earned interpretability
    // statement. The kin term is partitioned out of the FINDING and returned as
    // a DISCLOSURE instead; it is never silently dropped.
    //
    // The comparator is this food's own designation, so the suppression cannot
    // travel: an intact-chicken treat fed through the same trial is compared
    // against the sanctioned set, not against this food, and still flags.
    const { extra, derivedFromPrimary } = partitionKinOfPrimary(
      canonicalProteins(food.proteins),
      intended,
    );
    if (extra.length > 0 || derivedFromPrimary.length > 0) {
      out.push({ food, extraProteins: extra, derivedFromPrimary });
    }
  }
  return out;
}

/** The contamination facts that are FINDINGS — the subset carrying a genuine
 *  extra protein. A fact with only `derivedFromPrimary` is a record disclosure
 *  and must never reach an alarm surface, so every alarm-side consumer filters
 *  through this rather than testing `.length` on the array. */
export function contaminationFindings(
  facts: readonly ContaminationFact[],
): ContaminationFact[] {
  return facts.filter((f) => f.extraProteins.length > 0);
}

// ── §5.6 — free-fed arrangements ─────────────────────────────────────────────

export interface ArrangementExposure {
  arrangement: TrialArrangement;
  label: string | null;
}

/**
 * §5.6: "an arrangement whose food is NOT in the allowed set is itself a standing
 * off-diet exposure." A free-choice bowl of something off the trial diet is a
 * continuous exposure that emits no meal events at all, so it is invisible to
 * every count above — the one exposure the feeding log structurally cannot hold.
 *
 * Resolved against membership on the arrangement's OWN start day, on the same
 * identity rule as rung 1.
 */
export function arrangementExposures(
  ctx: TrialContext,
  arrangements: readonly TrialArrangement[],
): ArrangementExposure[] {
  const out: ArrangementExposure[] = [];
  for (const a of arrangements) {
    const day = dayIndexOf(ctx, a.startedAt);
    // An arrangement that started before the trial is still in force DURING it,
    // so membership resolves on the trial's first day in that case rather than
    // dropping the arrangement.
    const on = day !== null && ctx.startDayIndex !== null ? Math.max(day, ctx.startDayIndex) : null;
    if (on === null) continue;
    if (matchAllowed(allowedFoodsOn(ctx, on), a.foodItemId, a.foodKey)) continue;
    out.push({ arrangement: a, label: a.label });
  }
  return out;
}

// ── §5.1 — the two metrics, over ONE overlap range ───────────────────────────

export interface TrialRange {
  startDayIndex: number;
  endDayIndex: number;
  daysElapsed: number;
  /** True when the range starts later than the trial did — i.e. a report scope
   *  or a first log clipped it. §5.1: RENDER THE RANGE EXPLICITLY. */
  clipped: boolean;
  /**
   * B-422 — the trial has a target, nobody ended it, and today is past its
   * target end. The range shown is therefore the trial's own window while the
   * day counter keeps climbing.
   *
   * Exposed rather than kept private because §5.1's "render the range
   * explicitly" cuts both ways: a card reading "Meals logged on 56 of 56 days"
   * under "Day 84 of 56" owes the owner the sentence that says why the two
   * denominators differ. No surface consumes this yet — the copy needs a mock
   * round, and this PR deliberately ships the behaviour without inventing
   * undrawn strings (B-592).
   */
  closedByOverrun: boolean;
}

export interface TrialCoverage {
  /** Distinct local days in range carrying ≥1 logged NON-TREAT feeding. */
  daysLogged: number;
  /** Days elapsed in the SAME range — the two sides are one clock and one
   *  range. v0.9 computed a window-scoped numerator over a trial-scoped
   *  denominator, so a well-logged 8-week trial with a week-4 recheck rendered
   *  "27 / 56". */
  daysElapsed: number;
  fraction: number;
}

export interface AntigenTallyEntry {
  protein: string;
  /** Feedings carrying it, off-diet and permitted alike. */
  feedings: number;
  /** How many of those came from a PERMITTED food (D-B). Lets §7 render
   *  "6 poultry exposures, all from an approved treat" — a finding available
   *  from no other surface. */
  fromPermitted: number;
}

export interface TrialExposureItem {
  eventId: string;
  occurredAt: string;
  label: string | null;
  classification: FeedingClassification;
}

export interface TrialExposureSummary {
  /** Every CLASSIFIABLE in-range feeding, treats included (§5.1). */
  totalFeedings: number;
  /** How many were classified off-diet. A FLOOR, NEVER A TOTAL (§5.2). */
  offDiet: number;
  byRung: { derived_protein: number; unrecognised: number };
  /** Feedings naming no food at all — excluded from both sides above and
   *  disclosed rather than absorbed into either. */
  unclassifiable: number;
  items: TrialExposureItem[];
  mostRecent: TrialExposureItem | null;
  antigenTally: AntigenTallyEntry[];
}

/** §7.2's three-way statement. Strictly about the RECORD — never about the pet
 *  and never about the owner (§6.1/§6.9). `not_yet` is the two-sided state:
 *  Culprit may neither claim a clean trial NOR raise an absence-based alarm. */
export type Interpretability =
  | 'supports'
  | 'partially_supports'
  | 'does_not_support'
  | 'not_yet';

/**
 * §5.2 proof #1, made computable — the fact that stops the clean two-fact card
 * rendering over an animal that has not eaten.
 *
 * WHY THIS EXISTS AND IS NOT DELEGATED. §5.2 says the composition with intake is
 * structural: a live `IntakeDeclineFlag` REPLACES the adherence line. The
 * replacement is structural on the card — but the detector behind it,
 * `lib/analytics.detectIntakeDecline`, is a RELATIVE-decline detector, and the
 * adversarial pass ran the spec's own worked example through it: a cat refusing
 * the new hydrolyzed diet twice a day for 14 days, every bowl logged and rated
 * `refused`, returns `{ status: 'none' }`. Trigger A needs recent days BELOW a
 * higher baseline, and a diet refused from day 1 is uniformly low, not declining.
 * Trigger B needs a prior mean for THAT FOOD, and a never-eaten trial diet has
 * none. Worse, the chronic case DECAYS INTO the clean case: a pet that ate
 * normally and then refused from trial start fires for about three days and then
 * goes quiet, so the card upgrades from the safety state to the clean state
 * exactly as the anorexia becomes chronic.
 *
 * So the trial owns a second, NON-CLINICAL path, which §6.5 explicitly sanctions:
 * *"a second path may surface 'this diet isn't being eaten' as a TRIAL-VIABILITY
 * fact pointing at the vet, without softening the first."* It never softens to
 * preference (intake is not preference), never replaces `detectIntakeDecline`,
 * and its only job on the card is to make the affirmative claim unsayable.
 */
export interface TrialDietRefusal {
  /** In-window feedings of the measured population left unfinished. */
  refusedFeedings: number;
  /** In-window feedings of the measured population carrying ANY rating. */
  ratedFeedings: number;
  /** Distinct local days those refusals fall on. */
  days: number;
  /** WHICH POPULATION THE COUNTS ARE OVER — see `TrialRefusalPopulation`. Every
   *  surface that renders this fact must branch on it: the counts mean different
   *  things, and copy that names "the trial diet" over a `meal_record` fact
   *  asserts an identity the app has just admitted it could not resolve. */
  population: TrialRefusalPopulation;
}

/**
 * B-530 — WHICH FEEDINGS THE REFUSAL LANE COUNTED, AND WHY THERE ARE TWO ANSWERS.
 *
 * The lane's natural population is `primary_diet` feedings: the prescribed diet
 * going untouched is the finding. That population is produced by rung 1, so it
 * exists only when FOOD IDENTITY RESOLVES — and when identity misses, it does not
 * degrade, it EMPTIES. The pre-ship review executed it: a 21-day all-refused cat
 * behind a re-photographed bag (new UUID, "z/d" → "z/d Feline Food") produced
 * `trialDietRefusal === null`, and the 42 refused bowls of the PRESCRIBED diet
 * re-rendered as owner-blamed off-diet exposures. The sickest patient in the app
 * fell out of the one lane built to catch her, because a photo was retaken.
 *
 * WHAT THIS FIXES, STATED NARROWLY, because two `adversarial-reviewer` rounds
 * falsified the wider claim it originally carried. When the app has ALREADY
 * concluded it cannot identify the trial diet at all (`allowedSetUnavailable` — no
 * usable `primary_diet` row, or one that matched nothing across ten-plus feedings),
 * the same floors are measured over the MEAL RECORD instead: every in-range
 * non-treat feeding, identity or no identity. That covers the un-hydrated allowed
 * set and the bag that never matched once.
 *
 * IT IS NOT "THE LANE NO LONGER DEPENDS ON THE MATCH", which is what an earlier
 * draft of this docstring claimed. A partial match — including the ordinary case
 * where the owner logged some feedings before re-photographing the bag — keeps the
 * narrow population non-empty, and the lane still misses. Two attempts to widen the
 * gate were executed against and both broke (see the selection site below for the
 * counterexamples). The honest scope is: this fallback speaks where the app KNOWS
 * it is blind, and B-529 is what makes it blind less often.
 *
 * WHAT THAT COSTS, IN BOTH DIRECTIONS — and the second one is the dangerous half,
 * so it is stated first. An earlier draft of this docstring named only the
 * over-fire, and `adversarial-reviewer` was right that a PR disclosing one side of
 * its own trade has not disclosed the trade.
 *
 *   • UNDER-FIRE (reassuring, the dangerous direction). The wide population is a
 *     SHARE over every non-treat feeding, so a substitute the pet DOES eat sits in
 *     the denominator. A cat refusing its hydrolysate while an owner tops her up
 *     with tuna twice a day dilutes below `REFUSAL_SHARE` and the lane goes quiet —
 *     executed: 14 of 14 prescribed bowls refused across 14 days, 28 tuna meals
 *     finished, `rangeRefusal` null. The narrow population is immune to this by
 *     construction (tuna is not `primary_diet`), so "the same floors over the meal
 *     record" is NOT a like-for-like substitution: the floors mean something
 *     different over a mixed population. It is not a regression — the shipped
 *     behaviour there is also silence — but it is the canonical diet-trial failure
 *     mode, and the honest repair is a DURATION criterion rather than a share,
 *     which is Dr. Chen's open call in B-575. Tracked as B-579.
 *
 *   • OVER-FIRE (alarming, the survivable direction). The wider population cannot
 *     name the food, so a cat refusing a rival kibble while eating its hydrolysate
 *     reads the same as one refusing the hydrolysate. Reachable only under
 *     `allowedSetUnavailable` — a state every surface already treats as degraded,
 *     and where `mayClaimAllMatched` has already returned false.
 *
 * The alternative to both is the measured one: silence over an animal that is not
 * eating.
 *
 * WHAT IT DOES NOT COST. R1a is untouched — both populations count RATED feedings
 * only, so an owner who never taps intake is still never told her cat isn't
 * eating. Absence of data does not alarm in either population. And the fallback can
 * only ever ADD disclosure: it is reachable exclusively from the state where the
 * narrow population is EMPTY, so there is no record that fired before and is quiet
 * now.
 *
 * ⚠️ TWO THINGS IT DELIBERATELY DOES NOT FIX. Both were executed against this code,
 * both are UNDER-fire, and neither is a regression — the shipped behaviour in both
 * is silence, so the fallback is still strictly more disclosure than before. They
 * are named here so the gap reads as a known limit rather than as coverage. Both
 * have one root cause, food identity, which is B-529's PR; the residual is B-579.
 *
 *   1. THE PARTIAL MISS, IN BOTH ITS FORMS. Sequential — the owner logged some
 *      feedings before re-photographing the bag, so `narrow.feedings > 0` and the
 *      gate stays shut over a cat refusing everything since. Concurrent — a trial
 *      is often a wet AND a dry of the same diet (§4.1), so re-shooting only the
 *      dry leaves the wet matching and a cat eating the wet while refusing the dry
 *      reads as eating. Both need to know which food was the trial diet.
 *
 *   2. DILUTION — the under-fire named above. Restated here because it is the one
 *      residual the per-window rule does NOT touch: it is a property of the wide
 *      population's denominator, not of when the fallback engages.
 *
 * Same shape as `TrialIntakeRating`'s narrow/wide pair, and for the same reason:
 * ask the narrow question when there is a narrow population to ask it of, and fall
 * back to the wide one when there is not.
 */
export type TrialRefusalPopulation =
  /** `primary_diet` feedings — the prescribed diet itself. */
  | 'trial_diet'
  /** Every non-treat feeding in range, because the trial diet could not be
   *  identified. A fact about the MEAL RECORD, which is all it may claim. */
  | 'meal_record';

/**
 * How much of the meal record carries an intake rating (R1b).
 *
 * THIS IS WHAT MAKES `trialDietRefusal` REACHABLE, and that is the only reason it
 * is computed. The refusal lane above fires on RATED feedings only — deliberately,
 * because an owner who never rates intake must never be told her cat isn't eating
 * (R1a: absence of data never alarms). The cost of that rule is that a diligent
 * owner who taps "logged" and moves on is invisible to the one lane that would
 * catch a refused prescription diet, and nothing in the app ever tells her the tap
 * exists. So the record's own rated share is disclosed, and a surface can teach
 * the tap BEFORE anything is wrong.
 *
 * MEASURED OVER NON-TREAT FEEDINGS, not over `primary_diet` ones. The refusal
 * lane's own denominator is the narrower set, but a surface cannot teach off it
 * alone: when the allowed set has not hydrated — or a re-photographed bag has
 * broken food identity (B-530) — there are zero `primary_diet` feedings and the
 * share is 0/0, so the teach line would go silent on exactly the record that needs
 * it most. The wider denominator is also what the copy may honestly claim: this is
 * a fact about the MEAL RECORD, and it says nothing about the trial diet or the
 * animal.
 */
export interface TrialIntakeRating {
  /** In-window non-treat feedings carrying any `intake_rating`. */
  rated: number;
  /** In-window non-treat feedings, rated or not. */
  feedings: number;
  /**
   * The same two counts over `primary_diet` feedings only — the population the
   * refusal lane ACTUALLY reads.
   *
   * BOTH ARE NEEDED, and the counterexample that proves it: an owner who logs two
   * unrated bowls of the prescribed diet and three rated permitted toppers a day
   * has a 60% rated share overall and a 0% rated share where it counts. The wide
   * denominator alone suppresses the teach line on precisely the record whose
   * viability is unknowable — the opposite of its job. The narrow denominator
   * alone goes to 0/0 whenever food identity misses (an un-hydrated allowed set,
   * a re-photographed bag), which silences it just as wrongly.
   *
   * So a surface asks the narrow question when there is a narrow population to
   * ask it of, and falls back to the wide one when there is not.
   */
  primaryRated: number;
  primaryFeedings: number;
}

export interface TrialFacts {
  /** The COVERAGE range — head-clipped (§10 S3) and, on an overrun trial,
   *  tail-clipped (B-422). This is the denominator's window and nothing else's.
   *  A consumer that needs to know which rows the counts were computed over wants
   *  `exposureRange`. */
  range: TrialRange | null;
  /**
   * THE EVIDENCE WINDOW — every row every count below was computed over.
   *
   * Exposed because the alternative was measured and it is a trap. `range` is
   * clipped at both ends for reasons that belong to the COVERAGE metric, and
   * `generate-report` re-used it as an evidence bound in four places — so a
   * logged off-diet exposure past the effective end was COUNTED in `offDiet` and
   * DELETED from Appendix C, the protein tally and the chart. Emptying the
   * itemisation then unlocked the affirmative "Every one of the N feedings
   * matched" empty-state, which the report had never printed before. §5.2 rules
   * the exposure count a floor; a consumer that re-derives the window is how the
   * floor moves the wrong way without the module ever being wrong.
   *
   * Null on the same paths `range` is null.
   */
  exposureRange: { startDayIndex: number; endDayIndex: number } | null;
  coverage: TrialCoverage | null;
  exposures: TrialExposureSummary;
  oralRoute: OralRouteExposure[];
  contamination: ContaminationFact[];
  arrangementExposures: ArrangementExposure[];
  /** Null unless the floors below are cleared. Presence-only, like everything
   *  else here: its absence is not evidence the pet is eating.
   *
   *  A NOW-FACT: bounded to the last `REFUSAL_WINDOW_DAYS` of the range, because
   *  what it drives is a live register about the pet today. For the question
   *  "was this diet eaten over the trial", see `rangeRefusal`. */
  trialDietRefusal: TrialDietRefusal | null;
  /**
   * The same fact over the WHOLE range — a history, not a now-fact.
   *
   * WHY BOTH EXIST, and why conflating them shipped a defect twice. A trial where
   * the diet went unfinished for six weeks and was then eaten for the last two
   * has `trialDietRefusal === null` (the recency window sees only the good
   * fortnight) while the record plainly shows a diet that was not eaten. Any
   * surface that asks "may I state this record was clean" must ask the RANGE
   * question; only a surface asking "what is happening to this animal now" may
   * ask the recency one.
   *
   * `generate-report` computed exactly this locally, for exactly this reason, and
   * the card consumed only the now-fact — so a completed trial with 84 of 112
   * prescribed feedings logged unfinished rendered "all 112 matched the trial
   * diet or a permitted food" on the card while the report withheld it. One
   * record, two surfaces, opposite answers, with the card taking the reassuring
   * one. It lives here now, once, and the report reads it from here.
   *
   * THE 12h EPISODE GUARD IS DELIBERATELY DROPPED. It protects the now-fact
   * against a midnight-straddling single episode; over a whole trial that is not
   * the failure mode — a multi-week refusal is.
   */
  rangeRefusal: TrialDietRefusal | null;
  /**
   * True when `rangeRefusal`'s refusals span more than one EPISODE.
   *
   * `trialDietRefusal` carries `REFUSAL_MIN_SPAN_MS` because "two distinct local
   * days" is a calendar-boundary test, not an episode test — three refusals at
   * 20:00, 22:00 and 00:00 are one four-hour bout that reads as two days.
   * `rangeRefusal` drops that guard deliberately, which is right for a HISTORY
   * and wrong the moment a live present-tense register reads it: one bout would
   * otherwise fire "needs a call today" for the next 36 days over a cat that ate
   * throughout.
   *
   * So the span travels with the fact, and the live register (R1) requires it
   * while the report — a history — continues to ignore it.
   */
  rangeRefusalSpansEpisodes: boolean;
  /**
   * Feedings inside the RECENCY window that were actually FINISHED — direct
   * evidence the diet is being eaten now.
   *
   * MEASURED OVER WHICHEVER POPULATION SPOKE (B-530): `primary_diet` feedings
   * normally, the whole non-treat meal record when food identity missed. It is one
   * half of a ratio with `recentRatedFeedings`, and both halves always come from
   * the same population as the fact they stand down — see `TrialRefusalPopulation`.
   *
   * FINISHED, NOT MERELY RATED, and the distinction is the whole point. An
   * earlier cut counted every rating, so two MORE logged refusals inside the
   * window stood the safety register down — more evidence of refusal bought less
   * disclosure, and the register was present at 0 recent ratings, absent at 1–2,
   * present again at 3+. A dead zone occupied by the refusing cat.
   *
   * IT EXISTS TO STOP SILENCE CANCELLING AN ALARM. `trialDietRefusal` is
   * recency-bounded, so an owner who documents 42 refusals and then stops tapping
   * intake empties that window and the live safety register vanishes — the card
   * returning to a clean two-fact state over a cat that is still refusing. That
   * is verbatim the "chronic case decays into the clean case" defect the refusal
   * register was built to prevent, reached through the rating door instead of the
   * baseline one.
   *
   * R1a says absence of ratings must never ALARM. It does not license absence of
   * ratings CANCELLING an alarm that already fired on logged evidence. Zero here
   * is what lets a surface tell those two apart: no recent ratings means no new
   * evidence, not evidence of recovery.
   *
   * IT IS A NUMERATOR AND MUST NEVER BE READ ALONE. Its denominator is
   * `recentRatedFeedings`, and the two exist as a pair because reading this one
   * by itself is exactly the defect `adversarial-reviewer` executed on the first
   * cut: a bare `=== 0` test meant ONE finished bowl stood down a register that
   * had fired on sixty logged refusals. See `recentRatedFeedings`.
   */
  recentFinishedFeedings: number;
  /**
   * Feedings inside the RECENCY window carrying ANY rating — the denominator
   * `recentFinishedFeedings` is measured against, over the same population (B-530).
   *
   * ── WHY THE PAIR, AND WHY THIS IS NOT A NEW THRESHOLD ──────────────────────
   * `adversarial-reviewer` broke the first cut on its SHAPE rather than on its
   * inputs: firing carries four guards (`REFUSAL_MIN_RATED`, `REFUSAL_MIN_DAYS`,
   * `REFUSAL_SHARE`, `REFUSAL_MIN_SPAN_MS`) while standing down carried none — a
   * bare "is there one finished bowl?". On a lane whose safe error direction is
   * toward firing, the OFF predicate was the loosest test in the module. Executed:
   * a cat with 60 of 60 bowls refused across 30 days, then a single `most` bowl,
   * rendered a clean card reading "Meals logged on 44 of 44 days… 2 weeks to go."
   *
   * Two further defects fell out of the same shape — logging a refusal AND a good
   * meal disclosed LESS than logging nothing at all, and the register flickered
   * on/off across a record with NO new data in it.
   *
   * The repair is SYMMETRY, not a new number: standing down now asks the same
   * question firing asks, in the opposite direction, against the SAME ratified
   * constants — `REFUSAL_MIN_RATED` recent ratings, and a finished share clearing
   * `1 - REFUSAL_SHARE`. Nothing clinical was invented here, which is the point:
   * the reviewer's finding was that the shape was indefensible, and a mirror of an
   * already-ratified floor is the one repair that needs no new ruling.
   *
   * WHAT THIS DELIBERATELY DOES NOT FIX, so nobody reads silence as coverage: a
   * pet that genuinely recovers, and whose owner then stops rating, sees the
   * register RETURN once the good ratings age out of this window — the history
   * still says the diet went uneaten and nothing current contradicts it. That is
   * over-firing on a safety lane, which is the survivable direction, and it is
   * `R1a` read strictly: absence of ratings is not evidence of recovery. Making
   * the range fact itself expire needs a recency threshold, which IS a clinical
   * number — B-572, and Dr. Chen's.
   */
  recentRatedFeedings: number;
  /** R1b — the rated share of the meal record. Null when there is nothing in
   *  range to have rated, which is not the same as "nothing is rated". */
  intakeRating: TrialIntakeRating | null;
  /**
   * True when the trial has nothing usable to define the diet WITH, so every
   * rung-1 lookup necessarily misses and "off-diet" stops being a measurement.
   *
   * TWO DISJUNCTS, AND THE SECOND ONE IS THE ONE THAT WAS MISSING. No
   * `primary_diet` row at all is the obvious case. The harder and commoner one is
   * a row that IS there and matches NOTHING — a stale `food_item_id` whose food
   * never hydrated, a `allowed_from` dated after the window, a re-photographed bag
   * (B-530). The first cut of this fact checked only the first disjunct, so a
   * half-hydrated set sailed through and 110 feedings of the prescribed diet
   * rendered "0 matched, 110 did not" on a fully compliant owner.
   *
   * `generate-report` has always had both, and the reconciliation floor with it;
   * this is that guard, moved here so the card asks it too.
   *
   * IT IS NOT A QUIET STATE, it is the loudest possible wrong answer. With an
   * empty or half-hydrated set every feeding falls through to rung 3, so 40
   * feedings of the PRESCRIBED diet classify "0 matched, 40 did not" and a
   * perfectly compliant owner is accused of total non-adherence — on the card and
   * on the vet's artifact alike. It is reachable in normal operation:
   * `diet_trials` can hydrate before `diet_trial_foods` does, and `lib/sync.ts`
   * swallows a failed hydration step.
   *
   * A `primary_diet` row is required, not merely a row: rung 2's comparator is
   * built from those alone, so a trial whose only rows are permitted extras has
   * nothing to compare against either.
   */
  allowedSetUnavailable: boolean;
  /**
   * B-529/R7(c) — the `primary_diet` foods in force ANYWHERE in this range that
   * carry no designated main protein, so the antigen arm was dark for at least
   * part of it.
   *
   * WHY IT IS A FACT AND NOT JUST A PREDICATE. The silence rule makes rung 2 stop
   * naming proteins. A surface that simply prints fewer antigens is getting
   * quieter without saying so — the B9 failure ("the most unknown state must not
   * get the least disclosure"), and on the vet report specifically the B-494 rule
   * that a page teaching the reader to scan a zone may not leave that zone
   * silent. The adversarial pass found the first cut discharged this on the
   * owner's card and NOWHERE on the vet's page, which is the surface the ruling
   * exists to protect. Carried here so `generate-report` and the card read the
   * same fact.
   *
   * RANGE-anchored, not now-anchored: membership is dated, so a trial food
   * swapped out on day 10 leaves ten days of missing attribution that a `today`
   * check cannot see.
   */
  antigenAttributionPaused: AllowedFood[];
  /** B-529 — the antigen arm was dark for at least one classified feeding in
   *  range, whether or not an allowed-row can be NAMED as the cause (a
   *  `primary_diet` membership gap darkens it with nothing to name). This is the
   *  gate; `antigenAttributionPaused` is only the label.
   *
   *  B-596 WIDENED IT FROM "a feeding was silenced" TO "the check did not happen".
   *  An uncharacterized `primary_diet` row that is in force but never fed silences
   *  no feeding, and still costs a finding: `trialContamination` skips it, so its
   *  own label is never read. Both holes now darken the arm, because a reader
   *  cannot tell them apart and neither one is a negative result. */
  antigenArmDark: boolean;
  /**
   * True when a free-choice arrangement is in force AT THE END OF THE RANGE, as
   * opposed to `intakeNotDirectlyObserved`, which is true if one overlapped the
   * range at any point.
   *
   * THE TWO ANSWER DIFFERENT QUESTIONS AND A SURFACE NEEDS BOTH. The CLAIM is
   * about the whole window, so a bowl that was down for three days and then
   * removed must withhold it — nothing could observe intake during those days,
   * ever. The COPY is present-tense ("grazes from a bowl that's topped up"), so
   * it must key on now: an earlier cut widened the arrangement read to overlap
   * without widening this predicate, and a bowl removed on day 3 latched the
   * free-fed state for the remaining 38 days — describing an owner's 82 logged
   * meals as bowl top-ups and deleting her coverage ratio.
   */
  intakeNotDirectlyObservedNow: boolean;
  /** §10 S3 — days between `started_at` and the first logged feeding. Reported
   *  as UNTRACKED, never counted as failure, and excluded from the range. */
  untrackedDaysBeforeFirstLog: number;
  interpretability: Interpretability;
  /** §5.2's floor. Gates §7.2's statement — NOT the counts, NOT the card's
   *  facts, and no alarm in either direction. */
  belowCoverageFloor: boolean;
  /** True when a free-choice arrangement overlaps the window: the coverage RATIO
   *  has no denominator and must be REPLACED, not annotated (§5.6, mirroring
   *  `lib/analytics` invariant #6). */
  intakeNotDirectlyObserved: boolean;
}

// ── The coverage floor (P-3 — provisional, pending Dr. Chen) ─────────────────
//
// §5.2 left this number deliberately undefined ("three defensible definitions of
// coverage read 100% / 84% / 19% over the same 70 days of live data") and made
// PR 5 pin the metric FIRST and then set the floor. The metric is pinned above:
// distinct local days with ≥1 non-treat feeding, over days elapsed, on one
// overlap range. These are the thresholds over that pinned metric.
//
// Two anchors, and both are about the RECORD rather than the pet:
//
//   • 80% is the conventional documentation-adequacy threshold in adherence
//     measurement (PDC/MPR ≥ 0.8 is the standard cut-point for calling a
//     medication record adequate). Borrowing the cut-point for a LOG is a much
//     weaker claim than borrowing it for a patient, which is why it is safe to
//     borrow: nothing here says the pet was 80% compliant, only that four days
//     in five carry a meal.
//   • Below 50% a record cannot distinguish a clean trial from an untracked one:
//     more days are missing than present, so the modal day in the window has no
//     data at all. ACVIM's ≥2 weeks of EXCLUSIVE feeding cannot be evidenced by
//     a log that is silent on most of them.
//
// MIN_INTERPRETABLE_DAYS is the two-sided guard §5.2 requires. A ratio over one,
// two or three days is noise in both directions: on day 3 a single missed
// breakfast reads as 33% coverage, and firing a "not enough logged" state there
// hands the emptiest card in the app to an owner on day 3 of 56. Below the
// minimum the answer is `not_yet` — no claim, no alarm.
//
// ONE CAVEAT BELONGS IN THE FLAG ALONGSIDE THE NUMBERS, raised by the
// adversarial pass: `COVERAGE_SUPPORTS` sits over a DAY-GRANULAR metric that
// SATURATES on the first meal of the day (§5.2's own proof #3). So "supports
// interpreting it" is affirmable for a once-a-day logger whose partner slips an
// unlogged jerky every evening — the exact under-capturing profile the floor
// exists to catch. That is the single affirmative adequacy claim this module
// makes, and whether 0.8 over a saturating metric is the right bar for it is a
// clinical question, not an arithmetic one.
//
// FLAGGED FOR DR. CHEN, in the shape §0.4 uses for P-1/P-2: these are clinical
// values, not product decisions. Ratification changes three constants and no
// schema, no migration, no shape.
export const COVERAGE_SUPPORTS = 0.8;
export const COVERAGE_FLOOR = 0.5;
export const MIN_INTERPRETABLE_DAYS = 7;

/** The WSAVA ordinal, mirroring `lib/analytics.INTAKE_SCORE`. Duplicated rather
 *  than imported because `lib/analytics.ts` pulls `expo-sqlite` and this module
 *  must stay Deno-importable.
 *
 *  ⚠️ IT IS NOT PINNED TO THE ORIGINAL, and an earlier docstring here claimed it
 *  was. `INTAKE_SCORE` and `FINISHED_SCORE` are module-private in `analytics.ts`,
 *  so no test can compare them; the suite asserts this copy against literals,
 *  which would stay green if analytics moved its bar tomorrow. One divergence
 *  already exists and is deliberate: `analytics.isFinishedMeal` scores an unknown
 *  rating `?? 0` (not finished), while `feedingWasFinished` returns null
 *  (excluded from both sides) — a rate wants a denominator, a floor wants
 *  honesty. Exporting the constants from analytics and comparing them is the real
 *  fix; it belongs with B-474, which is where this value gets consumed. */
const INTAKE_SCORE: Record<string, number> = {
  refused: 0,
  picked: 1,
  some: 2,
  most: 3,
  all: 4,
};
/** `most` / `all` — the same bar `lib/analytics.FINISHED_SCORE` uses. */
const FINISHED_SCORE = 3;

/** Was this feeding actually EATEN? Unrated returns null — unknown, not eaten
 *  and not refused, so it enters neither side of the refusal share. */
export function feedingWasFinished(intakeRating: string | null | undefined): boolean | null {
  if (intakeRating == null) return null;
  const score = INTAKE_SCORE[intakeRating.trim().toLowerCase()];
  return score === undefined ? null : score >= FINISHED_SCORE;
}

/** Floors for the trial-viability fact above. Deliberately conservative in the
 *  direction of FIRING: what firing does is withhold an affirmative claim, and
 *  silence is cheap. Three rated samples across two distinct days stops one bad
 *  dinner reading as refusal; the half-share stops a fussy week reading as one.
 *  The §5.2 worked example (two refused bowls a day) clears all three on day 2. */
/**
 * How many classifiable in-range feedings make "the primary diet permitted none
 * of them" evidence of a cold cache rather than of a genuinely all-off-diet
 * trial.
 *
 * Deliberately low and deliberately NOT clinical. It is an arithmetic statement
 * about the plausibility of a JOIN, not about a pet: an owner who logged ten
 * feedings inside a trial fed the prescribed diet at least once. Below it the
 * honest answer is that we cannot tell, and every surface withholds the reading
 * either way — so the number only decides whether a surface SAYS the allowed list
 * is missing or stays quiet, never whether an exposure is counted.
 *
 * Lived in `generate-report/trial.ts` until B-533, where it was half of a guard
 * the client did not have.
 */
export const UNHYDRATED_SET_FLOOR = 10;

export const REFUSAL_MIN_RATED = 3;
export const REFUSAL_MIN_DAYS = 2;
export const REFUSAL_SHARE = 0.5;

/** RECENCY BOUND. Without one the counters accumulate over the whole range with
 *  no decay, so a two-day wobble during the transition week LATCHES the card into
 *  a viability state for the remaining fifty days — measured on a cat that then
 *  ate every meal for forty-eight of them. Fourteen days is the shortest window
 *  that still spans the clinical picture the fact is about (ACVIM's response
 *  window is 10–14 days) and short enough that recovery clears it. */
export const REFUSAL_WINDOW_DAYS = 14;

/** EPISODE GUARD. "Two distinct local days" is a calendar-boundary test, not an
 *  episode test: a bowl refused at 20:00 and 22:00 and re-offered at midnight is
 *  ONE bout that satisfies it in four hours.
 *
 *  TWELVE HOURS, NOT TWENTY. The first cut used 20h and the adversarial pass
 *  priced it: a cat refusing dinner at 18:00, breakfast at 08:00 and lunch at
 *  12:00 spans 18h — three refusals across two days, a third of the way into the
 *  feline 48h hepatic-lipidosis window — and went silent. `detectIntakeDecline`
 *  is structurally blind there (a brand-new trial diet has no baseline to decline
 *  from), so this lane is the only thing watching. 12h still rejects the
 *  midnight-straddle artefact the guard exists for, and it does not cost a real
 *  overnight refusal. */
export const REFUSAL_MIN_SPAN_MS = 12 * 60 * 60 * 1000;

export function interpretabilityOf(coverage: TrialCoverage | null): Interpretability {
  if (!coverage || coverage.daysElapsed < MIN_INTERPRETABLE_DAYS) return 'not_yet';
  if (coverage.fraction >= COVERAGE_SUPPORTS) return 'supports';
  if (coverage.fraction >= COVERAGE_FLOOR) return 'partially_supports';
  return 'does_not_support';
}

export interface TrialFactsInput {
  trial: TrialSpec;
  allowedFoods: readonly AllowedFood[];
  feedings: readonly TrialFeeding[];
  doses?: readonly TrialDose[];
  arrangements?: readonly TrialArrangement[];
  nowMs: number;
  /** Optional report/scope lower bound ('YYYY-MM-DD' or ISO). The range is
   *  `max(scopeStart, trial.startedAt) … min(scopeEnd, ended_at ?? today)`. */
  scopeStart?: string | null;
  scopeEnd?: string | null;
  timeZone?: string;
}

/**
 * Both §5.1 facts, over ONE overlap range, from one pass of the log.
 *
 * The two metrics are INDEPENDENT and never blend into one number (D2/§6.9).
 * They do not even share a sentence: coverage is DAYS WITH MEALS (treats
 * excluded from the numerator) and exposure is ALL FEEDINGS (treats included), so
 * a treat-only day is excluded from one and included in the other — and 15.7% of
 * live covered days are treat-only, which is why the welded v0.97 sentence was
 * false in a common case.
 */
/**
 * One population's refusal arithmetic (B-530). Both the narrow (`primary_diet`)
 * and wide (whole meal record) populations are accumulated through this same
 * shape, so the two can never drift into different definitions of "not eaten" —
 * which is the failure this module exists to prevent, one level down.
 */
interface RefusalCounters {
  /** Population size, rated or not — R1b's denominator. */
  feedings: number;
  /** Population members carrying any rating — R1b's numerator. */
  rated: number;
  /** RECENCY window (`REFUSAL_WINDOW_DAYS`) — the now-fact. */
  recentRated: number;
  recentNotFinished: number;
  /** Direct evidence the diet IS being eaten now; the stand-down numerator. */
  recentFinished: number;
  recentDays: Set<number>;
  recentStamps: number[];
  /** The WHOLE RANGE — the history. No recency bound. */
  rangeRated: number;
  rangeNotFinished: number;
  rangeDays: Set<number>;
  rangeStamps: number[];
}

function emptyRefusalCounters(): RefusalCounters {
  return {
    feedings: 0,
    rated: 0,
    recentRated: 0,
    recentNotFinished: 0,
    recentFinished: 0,
    recentDays: new Set<number>(),
    recentStamps: [],
    rangeRated: 0,
    rangeNotFinished: 0,
    rangeDays: new Set<number>(),
    rangeStamps: [],
  };
}

/**
 * Fold one feeding into one population's counters.
 *
 * THE PREDICATE IS "NOT FINISHED", NOT "REFUSED". `refused` alone misses the cat
 * that picks at every bowl for two weeks — and, because every non-refused rating
 * still counted toward the denominator, `picked` ratings actively SUPPRESSED the
 * fact. Not-finished (`refused` / `picked` / `some`) is the same bar
 * `lib/analytics` already uses for "did this pet finish a meal", so the two
 * surfaces cannot disagree about whether a diet is being eaten.
 */
function tallyRefusal(
  c: RefusalCounters,
  feeding: TrialFeeding,
  day: number,
  recencyStart: number,
): void {
  const finished = feedingWasFinished(feeding.intakeRating);
  c.feedings += 1;
  if (finished === null) return;
  c.rated += 1;
  c.rangeRated += 1;
  if (!finished) {
    c.rangeNotFinished += 1;
    c.rangeDays.add(day);
    c.rangeStamps.push(Date.parse(feeding.occurredAt));
  }
  if (day < recencyStart) return;
  c.recentRated += 1;
  if (finished) {
    c.recentFinished += 1;
    return;
  }
  c.recentNotFinished += 1;
  c.recentDays.add(day);
  c.recentStamps.push(Date.parse(feeding.occurredAt));
}

function spanMsOf(stamps: readonly number[]): number {
  return stamps.length > 1 ? Math.max(...stamps) - Math.min(...stamps) : 0;
}

export function computeTrialFacts(input: TrialFactsInput): TrialFacts {
  const ctx = buildTrialContext(input.trial, input.allowedFoods, { timeZone: input.timeZone });
  const empty: TrialExposureSummary = {
    totalFeedings: 0,
    offDiet: 0,
    byRung: { derived_protein: 0, unrecognised: 0 },
    unclassifiable: 0,
    items: [],
    mostRecent: null,
    antigenTally: [],
  };

  const arrangementHits = arrangementExposures(ctx, input.arrangements ?? []);
  const base: TrialFacts = {
    range: null,
    exposureRange: null,
    coverage: null,
    exposures: empty,
    oralRoute: [],
    contamination: trialContamination(ctx),
    arrangementExposures: arrangementHits,
    trialDietRefusal: null,
    rangeRefusal: null,
    rangeRefusalSpansEpisodes: false,
    recentFinishedFeedings: 0,
    recentRatedFeedings: 0,
    // Null, not a zeroed object — "nothing in range to have rated" and "nothing
    // rated" are different facts, and only the second is worth teaching about. A
    // surface handed a zeroed object would divide by zero and teach the tap on
    // day 1 of an empty trial.
    intakeRating: null,
    // Computed on the CONTEXT, so it is correct even on the early-return paths
    // below (an unparseable start date, a range that closed before it opened).
    // Those are exactly the degraded states where a surface must not assume the
    // allowed set was fine.
    allowedSetUnavailable: !ctx.allowedFoods.some((f) => f.role === 'primary_diet'),
    antigenAttributionPaused: [],
    antigenArmDark: false,
    untrackedDaysBeforeFirstLog: 0,
    interpretability: 'not_yet',
    belowCoverageFloor: false,
    intakeNotDirectlyObserved: (input.arrangements ?? []).length > 0,
    // On the early-return paths there is no range to be "at the end of", so the
    // present-tense flag falls back to the same answer. Those paths render no
    // free-fed copy anyway (there is no day line to hang it on).
    intakeNotDirectlyObservedNow: (input.arrangements ?? []).length > 0,
  };
  if (ctx.startDayIndex === null) return base;

  const todayIndex = localDayIndexOf(new Date(input.nowMs).toISOString(), input.timeZone);
  if (todayIndex === null) return base;

  const scopeStartIndex = input.scopeStart
    ? localDayIndexOf(input.scopeStart, input.timeZone)
    : null;
  const scopeEndIndex = input.scopeEnd ? localDayIndexOf(input.scopeEnd, input.timeZone) : null;

  const scopedStart = Math.max(ctx.startDayIndex, scopeStartIndex ?? ctx.startDayIndex);
  const upperBounds = [todayIndex, ctx.endDayIndex, scopeEndIndex].filter(
    (v): v is number => v !== null,
  );
  // ── THE EVIDENCE END ────────────────────────────────────────────────────────
  //
  // What the app is allowed to SEE: today, the declared end, the report scope.
  // The B-422 effective end is deliberately absent — see `buildTrialContext`.
  // Every count below (feedings, doses, arrangements, both refusal populations)
  // is bounded by THIS, so no logged finding is ever deleted to make a
  // denominator behave. §5.2 rules the exposure count a floor, and a floor may
  // only ever move toward disclosing more.
  const evidenceEnd = Math.min(...upperBounds);
  if (evidenceEnd < scopedStart) return base;

  // §10 S3 — COVERAGE REPORTS FROM `max(trial start, first log)`, and the
  // pre-adoption span is NAMED AS UNTRACKED rather than counted as failure.
  //
  // The case this exists for is the normal vet-directed setup, not an edge: the
  // owner is handed the diet at the clinic, back-dates the trial to the day the
  // vet started it, and begins logging when they get home. Denominating from
  // `started_at` scores them for the days before the app existed on their phone —
  // 1 of 15 days, `does_not_support`, and the sentence reaches the vet report
  // verbatim. Days the owner could not have logged are not a gap in their record.
  //
  // The clip is bounded by the FIRST LOG, so it can never hide a genuine gap in
  // the middle or at the end of a trial — only the head, and only up to the first
  // day there is any evidence the app was in use.
  //
  // AND IT ANCHORS ON THE SAME EVENT SET AS THE NUMERATOR — non-treat feedings.
  // Anchoring on ALL feedings let a single logged treat on day 9 erase eight
  // untracked days from the DENOMINATOR, which is strictly worse than the
  // treat-clearable numerator §5.1 already forbids: 7 of 8 days, `supports`,
  // rendered two lines under "Day 16 of 56".
  const loggedDays = input.feedings
    .filter((f) => f.foodType !== 'treat')
    .map((f) => dayIndexOf(ctx, f.occurredAt))
    .filter((d): d is number => d !== null && d >= scopedStart && d <= evidenceEnd);
  const firstLoggedDay = loggedDays.length > 0 ? Math.min(...loggedDays) : null;

  // ── B-422 — THE TAIL CLIP: the grace may never reach a denominator ──────────
  //
  // The COVERAGE denominator alone stops at the trial's own prescribed window.
  // Denominating over the effective end instead charges the owner for our
  // inference: a trial run perfectly for its prescribed 56 days and then simply
  // never closed rendered "logged on 56 of 84 days" — 67%, `partially_supports`
  // instead of `supports`. On the artifact that matters the harm is sharper than
  // a percentage: a vet who prescribed eight weeks and reads a denominator of
  // eighty-four concludes the owner ran a longer, sloppier trial than they did.
  //
  // THE WINDOW CLOSES AT THE TARGET END. Full stop — no evidence extension.
  //
  // Round 2 shipped `max(targetEnd, lastMealDay)` on the reasoning that "an owner
  // still logging on day 70 was still running it on day 70". Round 3 falsified
  // that anchor three ways, and all three are the same defect: ONE datum is not
  // evidence a trial ran two months longer.
  //
  //   • a 28-day trial with only 5 of its 28 prescribed days logged, followed by
  //     two months of ordinary daily logging, read "60 of 84 days",
  //     `partially_supports`, `belowCoverageFloor` FALSE and `mayStateRecordClean`
  //     TRUE — and printed "all 60 matched". Post-trial days had become trial
  //     coverage, so the numerator clamp added in round 2 was simply defeated
  //     through the denominator instead. §5.2's record claim, un-suppressed on
  //     exactly the under-capturing owner the floor exists to catch;
  //   • one ordinary meal of the pet's REGULAR food 60 days after a perfect
  //     28-day trial (the modal post-trial event) pushed 28/28 `supports` to
  //     28/84 `does_not_support` — the mirror harm, and the same defect. Round 1
  //     had already killed the all-FEEDING anchor because a single treat did
  //     this; switching to meals only narrowed which single datum could;
  //   • C5's logging-density disclosure inherited it, telling a vet that logging
  //     collapsed to 0/42 in the back half of a trial the owner logged every
  //     prescribed day of.
  //
  // "The trial ran this long" has exactly one authority, and it is not a log
  // line: it is `target_duration_days`, which §4.3's milestone lets an owner move
  // with one tap ("Keep going — 4 more weeks"). That is the sanctioned way to
  // extend the window, it moves it for every reader at once, and it cannot be
  // triggered by a stray meal. An owner who genuinely runs long without tapping
  // has their COVERAGE measured over the window their vet prescribed — which is
  // the number that motivated this clip in the first place, since a vet who
  // prescribed eight weeks should not read a denominator of twelve. Everything
  // they logged past the target is still EVIDENCE; it is only not coverage.
  //
  // ── THE CLAIM-GATE CONSEQUENCE, ANSWERED (round 4) ─────────────────────────
  //
  // Round 4 executed the cost of this clip: a trial logged on all 56 prescribed
  // days and then silent for 145 read 56/201 `does_not_support` on main and
  // 56/56 `supports` here, with `mayStateRecordClean` flipping to true — so the
  // clip changes what the report SAYS, which smells like the evidence-bound rule
  // violated through `interpretability`. The answer is that BOTH extremes are
  // statements, and main's was the false one: "too sparse to read as a clean
  // elimination" over a window with zero gaps asserts gaps that do not exist,
  // and it is the exact filed harm (a floor the calendar alone pushes a perfect
  // record under, forever). The claim over the trial's own window is true; what
  // must never be hidden is the SILENCE AFTER it. That disclosure deliberately
  // does not live in this denominator — it lives beside the verdict: the C5
  // logging-density line spans the EVIDENCE window (so a blackout renders as a
  // zero back half), §7.2's sentence scopes itself "of the trial window", and
  // the day counter carries `daysPastTarget` in the same block. Complete-over-
  // the-window and silent-since-the-window are two facts; the report states
  // both rather than letting either erase the other. The card's counterpart
  // sentence is B-592, upgraded by this finding from cosmetic to load-bearing.
  //
  // Only for a trial nobody ended: a declared end is the owner's own window, and
  // days between their last log and the end they named are genuine gaps rather
  // than inference. And only when the target end is inside the range at all —
  // when a report scope starts AFTER the target end (a since-visit window on an
  // old trial) the scope is already the binding constraint, and clipping there
  // collapsed the range below its own start and returned NO TRIAL BLOCK AT ALL,
  // taking an in-scope off-diet exposure with it.
  const targetEnd = trialTargetEndDayIndex(ctx.trial, input.timeZone);
  const overrunUnended = !ctx.trial.endedAt && targetEnd !== null && evidenceEnd > targetEnd;
  let endDayIndex = evidenceEnd;
  if (overrunUnended && targetEnd !== null && targetEnd >= scopedStart) {
    endDayIndex = Math.min(evidenceEnd, Math.max(scopedStart, targetEnd));
  }

  // THE HEAD CLIP RESOLVES *INSIDE* THE COVERAGE WINDOW, and the ordering is
  // load-bearing. `firstLoggedDay` is drawn from the evidence window, which can
  // now extend past the coverage end — so an owner who drifted off the app and
  // re-engaged after the effective end had a head clip LATER than the tail clip
  // and the range inverted: `daysElapsed: -88`, rendered as "Meals logged on 30
  // of -88 days". A range whose end precedes its start is not a degraded answer,
  // it is a nonsense one, so the clip only moves the head for a log that is
  // actually inside the window being described.
  const headCandidates = loggedDays.filter((d) => d <= endDayIndex);
  const startDayIndex = headCandidates.length > 0 ? Math.min(...headCandidates) : scopedStart;
  const untrackedDaysBeforeFirstLog = startDayIndex - scopedStart;

  // THE CLIP MOVES THE COVERAGE DENOMINATOR ONLY — it must not move the exposure
  // window. §5.1's whole point is that the two metrics have their OWN
  // denominators: coverage is days-with-meals over days-elapsed, exposure is
  // feedings over feedings. Letting the clip bound the feeding loop as well would
  // silently DROP a treat fed on day 2 of a trial whose first meal was logged on
  // day 3 — a real logged exposure, deleted from a count §5.2 rules a floor,
  // which is the one direction a floor may never move. That was already true of
  // the head clip; B-422's tail clip inherits it, which is why every loop below
  // bounds on `evidenceEnd` and only `range`/`coverage` use `endDayIndex`.
  const exposureStart = scopedStart;
  const exposureRange = { startDayIndex: exposureStart, endDayIndex: evidenceEnd };
  const range: TrialRange = {
    startDayIndex,
    endDayIndex,
    daysElapsed: endDayIndex - startDayIndex + 1,
    clipped: startDayIndex > ctx.startDayIndex,
    // B-422 — un-ended, has a target, and the calendar has moved past it. True
    // even when the clip itself did nothing (a scope starting past the target),
    // because it describes the TRIAL's state, which is what a surface discloses.
    closedByOverrun: overrunUnended,
  };

  const coveredDays = new Set<number>();
  // B-529/R7(c): the days where the arm was actually DARK for a feeding we
  // classified. The disclosure is derived from this rather than from membership
  // overlap — the third adversarial pass found that overlap alone made a
  // 32-of-32-days-logged, zero-off-diet trial lose its clean read for its whole
  // life because one allowed row sat on the list for ONE day with no main
  // protein and no feeding anywhere near it. A disclosure has to describe a gap
  // that exists in the record, not one that could have existed.
  const darkDays = new Set<number>();
  const items: TrialExposureItem[] = [];
  const antigens = new Map<string, AntigenTallyEntry>();
  let totalFeedings = 0;
  let offDiet = 0;
  let unclassifiable = 0;
  const byRung = { derived_protein: 0, unrecognised: 0 };
  // THE TWO REFUSAL POPULATIONS (B-530), accumulated in one pass and chosen from
  // once at the bottom. See `TrialRefusalPopulation` for why both exist: the
  // narrow one is the finding, the wide one is what stops the finding vanishing
  // when food identity misses.
  const narrow = emptyRefusalCounters();
  const wide = emptyRefusalCounters();
  // The viability fact is about the pet NOW, not about the whole trial.
  // ANCHORED ON THE EVIDENCE END, NOT THE COVERAGE END (B-422). This comment's
  // claim — the fact is about the pet NOW — is only true if "now" is the last day
  // the app can see. Anchoring it on the clipped coverage end instead let the
  // present-tense viability register ("this diet isn't being eaten", "needs a call
  // today") speak from data four months stale, on a cat that had recovered and
  // eaten every bowl since — and structurally excluded the `recentFinished`
  // evidence that is the register's own way to stand down.
  const refusalWindowStart = Math.max(startDayIndex, evidenceEnd - REFUSAL_WINDOW_DAYS + 1);

  for (const feeding of input.feedings) {
    const day = dayIndexOf(ctx, feeding.occurredAt);
    if (day === null || day < exposureStart || day > evidenceEnd) continue;

    // Coverage numerator — NON-TREAT feedings only (§5.1). On live data 82% of
    // feedings are treats, so a "days with food logged" count is clearable
    // entirely by treat data. A NULL `food_type` is NOT assumed to be a treat: it
    // is a feeding nobody has classified, and dropping it would under-report a
    // record the owner actually kept.
    //
    // AND IT DOES NOT READ `intakeRating`, deliberately: a bowl put down and
    // refused is a day the owner kept the record. Scoring it as a gap would
    // punish the most diligent owner in the app for the pet's illness. The
    // refusal is carried by `trialDietRefusal` instead, which is a fact about the
    // ANIMAL rather than a hole in the RECORD.
    // BOUNDED BY THE COVERAGE END, NOT THE EVIDENCE END. The numerator and the
    // denominator must be the same window or the ratio is not a ratio: with the
    // numerator running to `evidenceEnd` and `daysElapsed` stopping at the tail
    // clip, an owner who kept logging after the trial was over scored MORE days
    // than had elapsed — 100 of 112, `supports`, on a record that read 19 of 56
    // and `does_not_support` the moment they tapped Complete on the same data.
    // Post-trial logging was un-suppressing §5.2's record claim.
    if (feeding.foodType !== 'treat' && day >= startDayIndex && day <= endDayIndex) {
      coveredDays.add(day);
    }

    // R1b's denominator, on the SAME rows the coverage numerator walks and with
    // the same treat exclusion — a treat nobody rated is not a gap in the record
    // this teaches about. Counted from `startDayIndex` (the clipped head) rather
    // than `exposureStart`, so days the owner could not have logged cannot drag
    // the rated share down and fire a teach line about a record that did not
    // exist yet.
    //
    // AND IT IS THE WIDE REFUSAL POPULATION (B-530). One walk, one membership
    // test: the record R1b teaches about and the record the refusal lane falls
    // back to when identity misses are THE SAME SET, deliberately, so a surface
    // can never teach the tap off one denominator and speak from another.
    if (feeding.foodType !== 'treat' && day >= startDayIndex) {
      tallyRefusal(wide, feeding, day, refusalWindowStart);
    }

    const classification = classifyFeeding(ctx, feeding);
    if (classification.verdict === 'unclassifiable') {
      unclassifiable += 1;
      continue;
    }
    // DERIVED FROM THE FLAG, NOT FROM A PROXY FOR IT. The previous cut keyed on
    // "was an uncharacterized food in force that day", which is neither
    // sufficient nor necessary, and the fourth adversarial pass executed both
    // halves of the error:
    //   • NOT SUFFICIENT — `classifyFeeding` also goes dark when the sanctioned
    //     set is EMPTY, which happens on a `primary_diet` MEMBERSHIP GAP (no
    //     trial-diet row in force at all). Migration 040's ratified rule makes
    //     that reachable: "removing a food is an UPDATE, re-adding it later is a
    //     NEW ROW with a later allowed_from". Measured: four real chicken-chew
    //     exposures deleted from the tally with `antigenAttributionPaused`
    //     empty, no paused row, no caveat, and the affirmative clean sentence
    //     still in bold — the exact failure the first repair existed to prevent,
    //     re-entered through the other door.
    //   • NOT NECESSARY — a ghost row in force for one day on a fully-logged,
    //     zero-off-diet trial fired the disclosure although nothing was silenced.
    // The flag is set by the same branch that silences, so it cannot disagree
    // with it.
    //
    // B-596 IS FIXED BELOW, NOT HERE — see `contaminationSuppressed`. What this
    // branch cannot see is the row that is in force and NEVER FED: no feeding is
    // silenced, so `darkDays` stays empty, so the arm was not dark by this test —
    // while `trialContamination` skipped that same row and a genuine "the trial
    // diet also lists Beef" finding disappeared with no paused row and no §7.2
    // caveat in its place. The silenced FEEDING and the suppressed FINDING are two
    // different holes, and this flag only ever knew about the first.
    if (!classification.attributionChecked) {
      const d = dayIndexOf(ctx, feeding.occurredAt);
      if (d !== null) darkDays.add(d);
    }
    if (!classification.countsAsFeeding) continue;

    // The NARROW population — feedings of the TRIAL DIET only. A refused chicken
    // chew says nothing about whether the prescribed food is being eaten. Also
    // R1b's narrow denominator, and `allowedSetUnavailable`'s second disjunct: a
    // `primary_diet` row that matches NOTHING is the same fact as no row at all,
    // and commoner.
    if (classification.role === 'primary_diet' && day >= startDayIndex) {
      tallyRefusal(narrow, feeding, day, refusalWindowStart);
    }

    totalFeedings += 1;
    const item: TrialExposureItem = {
      eventId: feeding.eventId,
      occurredAt: feeding.occurredAt,
      label: feeding.label,
      classification,
    };
    if (classification.offDiet) {
      offDiet += 1;
      if (classification.rung === 'derived_protein') byRung.derived_protein += 1;
      if (classification.rung === 'unrecognised') byRung.unrecognised += 1;
      items.push(item);
    }
    // D-B — the tally counts the ANTIGEN, on permitted and off-diet feedings
    // alike. This is the half that keeps "compliance is about the owner" and
    // "exposure is about the animal" structurally separate.
    for (const protein of classification.antigens) {
      const entry = antigens.get(protein) ?? { protein, feedings: 0, fromPermitted: 0 };
      entry.feedings += 1;
      if (classification.verdict === 'permitted') entry.fromPermitted += 1;
      antigens.set(protein, entry);
    }
  }

  items.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const coverage: TrialCoverage = {
    daysLogged: coveredDays.size,
    daysElapsed: range.daysElapsed,
    fraction: range.daysElapsed > 0 ? coveredDays.size / range.daysElapsed : 0,
  };
  const interpretability = interpretabilityOf(coverage);

  const oralRoute: OralRouteExposure[] = [];
  for (const dose of input.doses ?? []) {
    const day = dayIndexOf(ctx, dose.occurredAt);
    if (day === null || day < exposureStart || day > evidenceEnd) continue;
    const hit = classifyDose(ctx, dose);
    if (hit) oralRoute.push(hit);
  }

  const allowedSetUnavailable =
    base.allowedSetUnavailable || (narrow.feedings === 0 && totalFeedings >= UNHYDRATED_SET_FLOOR);

  // ── B-596 — A SUPPRESSED FINDING DARKENS THE ARM, NOT ONLY A SILENCED FEEDING ──
  //
  // `trialContamination` SKIPS an uncharacterized `primary_diet` row (correctly: with no
  // source base there is no comparator, so "everything on this label is extra" would be an
  // artefact, not a finding). But skipping is not free. The fifth adversarial pass on
  // B-529 executed the case where the row is in force and never fed: nothing is silenced,
  // `darkDays` is empty, `antigenArmDark` is false — and a genuine *"the trial food also
  // lists Beef"* finding vanishes with NO paused row and NO §7.2 caveat in its place,
  // while "all N matched" and "supports interpreting it" both stand. The quiet direction.
  //
  // `primary_protein = 'hydrolyzed protein'` is the literal product name of the most-
  // prescribed canine hydrolysate, so this is the ordinary shape of the diet class the
  // whole feature is about, not an exotic one.
  //
  // The disclosure is keyed to the SUPPRESSION, so it cannot over-fire on a row that had
  // nothing to suppress: a row whose panel was never captured carries no protein term, so
  // there was no finding to lose and no reason to darken the arm. (A row that WAS fed is
  // already covered by `darkDays`; this only ever adds the never-fed case, plus the case
  // where the row's own days hold no classified feeding at all.)
  const contaminationSuppressed = uncharacterizedTrialDietFoodsInRange(
    ctx,
    exposureStart,
    evidenceEnd,
  ).filter((f) => canonicalProteins(f.proteins).length > 0);

  // ── B-530: WHICH POPULATION SPEAKS ─────────────────────────────────────────
  //
  // ONE POPULATION, FOR BOTH WINDOWS, CHOSEN ON `allowedSetUnavailable` — and the
  // narrowness of that gate is a deliberate retreat, taken after TWO
  // `adversarial-reviewer` rounds broke two successive attempts to widen it. The
  // history is recorded here because the next person to look at this will have the
  // same idea, and it is the wrong one without B-529.
  //
  //   ROUND 1 broke the gate for being too narrow. `allowedSetUnavailable`'s second
  //   disjunct needs `narrow.feedings === 0` over the WHOLE range, so a single
  //   historical match disables the fallback permanently — and the realistic
  //   ordering of a re-photographed bag has matches before the re-shoot and none
  //   after. Executed: ate for seven days, bag re-shot, refused 42 of 42 bowls over
  //   three weeks → both facts null, empty safety band.
  //
  //   ROUND 2 broke the repair. Choosing PER WINDOW on `narrow.recentRated > 0`
  //   moved the veto rather than removing it (a re-shoot inside the last 14 days is
  //   still silent on 26 consecutive refused bowls — and that interval is exactly
  //   where a newly-refusing cat lives); it made the selector a RATING-PRESENCE
  //   test, so an owner who logs 64 bowls of the prescription unrated and rates
  //   three refused rival meals routed the feline lipidosis escalation onto the
  //   rival food; and it let the two facts come from DIFFERENT populations, which
  //   the report's `rangeRefusal`-first precedence then rendered ~9× quieter than
  //   the owner's card on 62% of mixed records.
  //
  // The two failing directions are not reconcilable here, and the executed pair
  // shows why: 2 matched feedings beside 24 unmatched refused ones WANTS the
  // fallback, while 64 matched unrated ones beside 3 unmatched refused ones does
  // NOT — and the only thing separating them is knowing which food was the trial
  // diet. That is B-529's job, not a threshold to be guessed at inside this PR. A
  // share test is the obvious next idea and is the one that cannot distinguish a
  // broken join from a genuinely dirty trial.
  //
  // So the gate stays where round 1 put it: the fallback speaks only where the
  // module has ALREADY concluded it cannot identify the diet at all — no usable
  // `primary_diet` row, or one that matched nothing across ten-plus feedings. That
  // is conservative, its failure mode is SILENCE (the status quo, never a
  // regression), and it carries no over-fire. Everything it misses is filed as
  // B-579 and gated on B-529.
  //
  // ONE population for both facts is load-bearing on its own: `rangeRefusal` and
  // `trialDietRefusal` are read together by `lib/dietTrialCard.ts` and by
  // `generate-report`, with opposite precedence, so two facts measured over
  // different rows put a smaller, staler number on the vet's safety band than the
  // one on the owner's card. The same coupling covers the stand-down pair
  // (`recentFinished / recentRated`) and the episode span.
  const population: TrialRefusalPopulation = allowedSetUnavailable ? 'meal_record' : 'trial_diet';
  const pop = allowedSetUnavailable ? wide : narrow;

  const trialDietRefusal: TrialDietRefusal | null =
    pop.recentRated >= REFUSAL_MIN_RATED &&
    pop.recentDays.size >= REFUSAL_MIN_DAYS &&
    spanMsOf(pop.recentStamps) >= REFUSAL_MIN_SPAN_MS &&
    pop.recentNotFinished / pop.recentRated >= REFUSAL_SHARE
      ? {
          refusedFeedings: pop.recentNotFinished,
          ratedFeedings: pop.recentRated,
          days: pop.recentDays.size,
          population,
        }
      : null;

  // Same floors, no span guard — see `TrialFacts.rangeRefusal`.
  const rangeRefusal: TrialDietRefusal | null =
    pop.rangeRated >= REFUSAL_MIN_RATED &&
    pop.rangeDays.size >= REFUSAL_MIN_DAYS &&
    pop.rangeNotFinished / pop.rangeRated >= REFUSAL_SHARE
      ? {
          refusedFeedings: pop.rangeNotFinished,
          ratedFeedings: pop.rangeRated,
          days: pop.rangeDays.size,
          population,
        }
      : null;

  return {
    ...base,
    range,
    exposureRange,
    coverage,
    exposures: {
      totalFeedings,
      offDiet,
      byRung,
      unclassifiable,
      items,
      mostRecent: items.length > 0 ? items[items.length - 1] : null,
      antigenTally: [...antigens.values()].sort((a, b) => b.feedings - a.feedings),
    },
    oralRoute,
    trialDietRefusal,
    rangeRefusal,
    // Measured on the RANGE fact's own stamps, not the recency window's — the live
    // register reads `rangeRefusal` on the stand-down path, so the span guard has
    // to be about the same refusals it would speak from.
    rangeRefusalSpansEpisodes: spanMsOf(pop.rangeStamps) >= REFUSAL_MIN_SPAN_MS,
    recentFinishedFeedings: pop.recentFinished,
    // The same window and the same rows as `recentFinishedFeedings` — they are a
    // ratio, so a denominator drawn from anywhere else would be a silent lie.
    recentRatedFeedings: pop.recentRated,
    // Null, not `{ rated: 0, feedings: 0 }` — see the field on `TrialFacts`.
    // R1b always reports the WIDE record and the NARROW trial-diet slice, whichever
    // population the refusal lane spoke from: the teach line is a fact about the
    // meal record, and it must read the same whether or not identity resolved.
    intakeRating: wide.feedings > 0
      ? {
          rated: wide.rated,
          feedings: wide.feedings,
          primaryRated: narrow.rated,
          primaryFeedings: narrow.feedings,
        }
      : null,
    untrackedDaysBeforeFirstLog,
    interpretability,
    belowCoverageFloor: interpretability === 'does_not_support',
    // THE SECOND DISJUNCT (see the field's docstring): a `primary_diet` row that
    // matches nothing is the same fact as no row at all, and commoner. The floor
    // is what keeps it from firing on a young trial that simply has not been fed
    // the diet yet — an owner who logged ten feedings inside a trial fed the
    // prescribed diet at least once, so zero primary-diet matches across ten-plus
    // feedings is evidence of a cold cache rather than of adherence.
    // Resolved above, because B-530's population choice reads it.
    allowedSetUnavailable,
    // Derived from the days the arm was ACTUALLY dark for a classified feeding,
    // deduped by allowed-row. Keyed on `attributionChecked` — the flag the loop
    // sets when it silences — rather than on a proxy for it: the fourth
    // adversarial pass showed a proxy both MISSES the `primary_diet` membership
    // gap (no row in force → empty sanctioned set → dark, with nothing to name)
    // and FIRES on a ghost row where nothing was silenced.
    antigenAttributionPaused: dedupeAllowedFoods([
      ...[...darkDays].flatMap((d) => uncharacterizedTrialDietFoods(ctx, d)),
      ...contaminationSuppressed,
    ]),
    // THE BOOLEAN, NOT THE LIST, IS WHAT GATES A CLAIM. On a membership gap the
    // arm is dark and there is NO allowed-row to name, so the list is empty
    // while the record is exactly as unchecked — gating on `.length` let that
    // state keep the affirmative sentence. Every surface that withholds or
    // discloses reads this; the list only decides whether the disclosure can
    // name a food or has to say "no trial diet was on the list".
    antigenArmDark: darkDays.size > 0 || contaminationSuppressed.length > 0,
    // In force AT THE END of the range — the present-tense question, so it too
    // asks about the EVIDENCE end rather than the clipped coverage end (B-422):
    // a bowl removed after the target end is a fact the app can see, and a
    // present-tense flag must not be answered from a date in the past.
    intakeNotDirectlyObservedNow: (input.arrangements ?? []).some((a) => {
      const end = a.endedAt ? localDayIndexOf(a.endedAt, input.timeZone) : null;
      return end === null || end >= evidenceEnd;
    }),
  };
}

// ── §5.5's named counterexample: exposure ↔ symptom juxtaposition ─────────────
//
// The `adversarial-reviewer` counterexample this PR was told to hold against, in
// the spec's own words: "exposure↔symptom juxtaposition must use a 1–14 day
// FORWARD window, species-dependent, NEVER same-day and NEVER a nearest-preceding
// -meal join — this repo shipped that exact attribution bug once under three
// ceremonial sign-offs."
//
// So the helper exists HERE, in the shared module, rather than being re-derived
// by whichever surface first wants to draw the two series together (§7's trial
// block is the next one). The window is the oral-food-challenge time-to-flare
// evidence: dog TTF90 14 days, cat TTF90 7 days (Olivry & Mueller). `other`
// takes the wider window — a longer window over-includes, which costs precision;
// a shorter one MISSES a real flare, and on a safety surface those are not
// symmetric costs.
//
// SAME-DAY IS EXCLUDED (`delta >= 1`) and that is the ruled behaviour, not an
// off-by-one. Its cost is real and worth stating: an immediate post-prandial GI
// reaction is not juxtaposed. The reason it is excluded anyway is that same-day
// admits the nearest-preceding-meal shape through the back door — on a day with
// four feedings, "the symptom and the exposure share a date" attributes the
// symptom to whichever feeding is nearest, which is the bug named above.
export const CHALLENGE_WINDOW_DAYS: Record<TrialSpecies, number> = {
  dog: 14,
  cat: 7,
  other: 14,
};

/**
 * Could a symptom on `symptomDayIndex` be a flare from an exposure on
 * `exposureDayIndex`? FORWARD ONLY, never same-day, never backwards.
 *
 * This answers "is this pair worth SHOWING SIDE BY SIDE", and nothing else. It is
 * not a cause, not an attribution and not a finding: §6.1 says Culprit never
 * scores the trial, and §5.2's blind-spot rule means an unlogged exposure is
 * always possible, so no pairing here can be exclusive.
 */
export function isWithinChallengeWindow(
  exposureDayIndex: number,
  symptomDayIndex: number,
  species: TrialSpecies,
): boolean {
  const delta = symptomDayIndex - exposureDayIndex;
  return delta >= 1 && delta <= CHALLENGE_WINDOW_DAYS[species];
}

// ── Copy (nyx-voice + clinical-guardrails) ───────────────────────────────────
//
// Three register rules govern every string below, and they are the same three
// `lib/trialContaminant.ts` carries:
//
//   (a) DESCRIPTIVE, NEVER ALARMIST. Culprit has no danger state and this is not
//       where one gets invented.
//   (b) NEVER REASSURING, AND NEVER NEGATIVE ABOUT THE WORLD. There is no string
//       here with a negative form — no "no off-diet foods", no "nothing else
//       found", no "clean" — because there is no state in which we could honestly
//       say it (G2, ruled as a RULE and not a threshold). Absence of a logged
//       exposure is not evidence of absence.
//   (c) RECORD AND CONTINUE (§6.7). No copy on any surface may imply the trial is
//       voided, compromised or must be restarted — no consulted source instructs
//       a restart — and no QUANTIFIED reassurance ("a small amount probably won't
//       matter"), because the cross-contact threshold is explicitly unknown.

/** "chicken" · "chicken and salmon" · "chicken, salmon and beef". */
export function proteinPhrase(keys: readonly string[]): string {
  if (keys.length === 0) return '';
  if (keys.length === 1) return keys[0];
  return `${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
}

export interface VerdictReason {
  /** Which rung fired, in the owner's words. */
  title: string;
  body: string;
}

/**
 * §5.3: "every flag must be tappable to its reason, naming which rung fired."
 * A flag the owner cannot interrogate is an unfalsifiable accusation.
 *
 * Rung 3 gets a designed FIRST-CLASS treatment rather than a fallback string,
 * because it is the MODAL case on a real library: most foods carry no captured
 * protein panel, so "we don't recognise this as part of the trial" is what an
 * owner will read most often. It states what Culprit knows (this food is not on
 * the list) and explicitly not what it does not (whether the food is a problem).
 */
export function explainVerdict(
  classification: FeedingClassification,
  foodLabel: string | null,
): VerdictReason | null {
  const food = foodLabel ?? 'This food';
  switch (classification.rung) {
    case 'allowed_set': {
      const where = classification.role === 'primary_diet' ? 'the trial diet' : "the allowed list";
      const base = `${food} is on ${where}, so it’s counted as part of the trial.`;
      if (classification.antigens.length === 0) {
        return { title: 'On the allowed list', body: base };
      }
      // D-B rendered: the verdict is unchanged, and the antigen is still named.
      // Deliberately NOT phrased as a mistake — the owner was told to feed this.
      return {
        title: 'On the allowed list',
        body:
          `${base} It also lists ${proteinPhrase(classification.antigens)}, which is worth ` +
          'a mention at the recheck — your vet decides whether it matters.',
      };
    }
    case 'derived_protein':
      return {
        title: `Lists ${proteinPhrase(classification.antigens)}`,
        body:
          `${food} isn’t on the trial’s list, and its ingredients include ` +
          `${proteinPhrase(classification.antigens)}. Logged for your vet.`,
      };
    case 'unrecognised':
      return {
        title: 'Not recognised as trial food',
        body:
          `${food} isn’t on the trial’s list. Culprit hasn’t read its ingredients, so ` +
          "there’s nothing more it can say about it — it’s recorded either way.",
      };
    case 'no_identity':
      return {
        title: 'No food recorded',
        body:
          'This feeding has no food attached, so there’s nothing to check it against. ' +
          'Adding the food would put it in the record.',
      };
    default:
      return null;
  }
}

/**
 * §6.8 — an oral-route exposure is NEVER a reason to skip a dose.
 *
 * "A missed critical dose is a worse outcome than a contaminated trial." The copy
 * names the fact and points at the vet FOR A SUBSTITUTION — never at the next
 * dose. This composes with B-117's missed-critical-dose escalation rather than
 * competing with it.
 */
export function oralRouteCopy(exposure: OralRouteExposure): VerdictReason {
  const drug = exposure.drugLabel ?? 'This medication';
  const how =
    exposure.trigger === 'chewable'
      ? `${drug} is a chewable, and chewables are flavoured with something.`
      : `${drug} was given inside food, so whatever it was hidden in counts too.`;
  return {
    title: 'Given by mouth during the trial',
    body:
      `${how} Keep giving it exactly as prescribed — ask your vet whether there’s an ` +
      'unflavoured version to switch to.',
  };
}

/**
 * §5.5's standing fact, in the register of disclosure rather than accusation.
 *
 * D-A: the same sentence covers a contaminated PRIMARY diet and a contaminated
 * PERMITTED EXTRA, because the clinical consequence is identical and the extra is
 * the one nobody is watching.
 */
export function contaminationNote(
  facts: readonly ContaminationFact[],
  /** Omitted where the surface has no pet name to hand; the copy then names the
   *  allowed list rather than the pet, which reads correctly either way. */
  petName?: string | null,
): { title: string; body: string } | null {
  // B-529/R7: FINDINGS only. A fact carrying nothing but `derivedFromPrimary`
  // (a hydrolysed diet naming its own source twice) is a record disclosure, and
  // routing it here would restate the false accusation this ruling removed.
  const findings = contaminationFindings(facts);
  if (findings.length === 0) return null;
  const proteins = new Set<string>();
  for (const f of findings) for (const p of f.extraProteins) proteins.add(p);
  const list = proteinPhrase([...proteins]);
  const onlyPrimary = findings.every((f) => f.food.role === 'primary_diet');
  const whose = petName ? `${petName}’s allowed list` : 'the allowed list';
  return {
    title: onlyPrimary ? `The trial food also lists ${list}` : `A food on the list also has ${list}`,
    body: onlyPrimary
      ? `A food that also lists ${list} can keep the trial from giving a clean answer. ` +
        'Worth raising with your vet.'
      : `One of the foods on ${whose} also lists ${list}. Worth raising with your vet.`,
  };
}

/**
 * §7.2 — the one sentence the report carries about whether this LOG supports
 * interpreting this trial.
 *
 * "Uninterpretable, not negative" is the distinction a specialist draws first,
 * and v0.9 had the inputs for it with nowhere to say it. Strictly a statement
 * about the RECORD: never about the pet (§6.1) and never about the owner (§6.9),
 * which is why every variant below has "this record"/"this log" as its subject
 * and none of them contains a percentage, a grade or a verdict on the trial.
 */
export function interpretabilityStatement(facts: TrialFacts): string | null {
  if (!facts.coverage || !facts.range) return null;
  const { daysLogged, daysElapsed } = facts.coverage;
  const days = `${daysLogged} of ${daysElapsed} days`;
  switch (facts.interpretability) {
    case 'supports':
      return `This record covers ${days} of the trial window and supports interpreting it.`;
    case 'partially_supports':
      return (
        `This record covers ${days} of the trial window — enough to read alongside the ` +
        'rest of the history, not enough to stand on its own.'
      );
    case 'does_not_support':
      return (
        `This record covers ${days} of the trial window, which does not support ` +
        'interpreting this trial either way — the gaps are larger than the record.'
      );
    case 'not_yet':
    default:
      return null;
  }
}

/**
 * MAY A SURFACE STATE THE AFFIRMATIVE "all N matched" SENTENCE?
 *
 * The rule lives here, once, because the adversarial pass found that every break
 * at the wiring boundary was the same break: `computeTrialFacts` returns five
 * disclosure channels — `unclassifiable`, `oralRoute`, `arrangementExposures`,
 * `trialDietRefusal`, `antigenTally` — and only `offDiet` reached a surface. So
 * the module's care about "a floor, never a total" was discarded one call later
 * and the unqualified sentence rendered anyway.
 *
 * Every clause below is a case where the app HAS computed a reason the sentence
 * is false, and would otherwise have said it:
 *
 *   • `trialDietRefusal` — §5.2 proof #1. A cat refusing the hydrolyzed diet
 *     twice a day for fourteen days, every bowl dutifully logged, otherwise reads
 *     100% coverage / 0 exposures: a maximally clean trial rendered over a
 *     starving animal, seven times past the feline 48h hepatic-lipidosis window.
 *   • `arrangementExposures` — §5.6. A free-choice bowl of something off the list
 *     is a CONTINUOUS exposure that emits no meal events, so it is invisible to
 *     every count above. It was computed, and then the card said "all 12 were the
 *     trial diet".
 *   • `oralRoute` — C3. The blind-spot qualifier tells the reader that flavoured
 *     products "aren't visible here", so the one oral exposure that IS visible
 *     must not be the one dropped.
 *   • `unclassifiable` — a feeding naming no food is neither matched nor
 *     off-diet, and folding it into "all N matched" is the reassurance G2 deletes.
 *
 * This is a one-directional gate: it can only ever WITHHOLD a claim. There is no
 * input that makes it turn a claim on.
 */
export function mayClaimAllMatched(facts: TrialFacts): boolean {
  if (facts.trialDietRefusal) return false;
  // THE RANGE FACT, NOT ONLY THE NOW-FACT. A trial whose diet went unfinished for
  // six weeks and was then eaten for the last two clears the recency window and
  // fails this. Adding it here rather than at each call site is the whole point of
  // the function: `generate-report` had this clause and the card did not.
  if (facts.rangeRefusal) return false;
  // An empty permit set makes rung 1 miss by construction, so "matched" is not a
  // measurement — it is an artefact of a cold cache.
  if (facts.allowedSetUnavailable) return false;
  // B-529/R7(c). "All N matched the trial diet or a permitted food" must not
  // compose with a DARK ANTIGEN ARM. The adversarial pass executed the
  // composition: a trial with one undesignated `primary_diet` row rendered that
  // sentence in bold over an empty antigen tally, so the reader was told the
  // record was clean by a page that had stopped looking. The affirmative claim
  // is exactly what §5.2's G2 gate exists to withhold when the record cannot
  // support it.
  if (facts.antigenArmDark) return false;
  if (facts.arrangementExposures.length > 0) return false;
  if (facts.oralRoute.length > 0) return false;
  if (facts.exposures.unclassifiable > 0) return false;
  // ANY free-choice bowl, not only an off-list one. The first cut gated on
  // `arrangementExposures`, which is empty when the bowl IS the trial diet — the
  // tightly-controlled feline trial the free-fed state exists for. In that state
  // BOTH intake lanes are structurally blind (a topped-up bowl produces no rated
  // feedings, and `detectIntakeDecline` excludes free-fed foods by invariant #6),
  // so the app was affirming "all 14 were the trial diet" over an animal nothing
  // in it can observe eating. Unobservable is not clean.
  if (facts.intakeNotDirectlyObserved) return false;
  return true;
}

/**
 * MAY A SURFACE STATE THAT THIS RECORD WAS CLEAN?
 *
 * `mayClaimAllMatched` asks whether the app has computed a reason the sentence is
 * FALSE. This asks the further question every owner-facing and vet-facing surface
 * actually needs: is the record good enough for the sentence to MEAN anything?
 *
 * The two extra clauses are both cases where the sentence is technically true and
 * substantively misleading, and both were found by executing them:
 *
 *   • `interpretability` — `belowCoverageFloor` is `does_not_support` and nothing
 *     else, so `not_yet` sailed through every gate. Day 3 of 56 with three clean
 *     feedings rendered "all 3 matched the trial diet or a permitted food"; the
 *     sub-floor card rendered "There isn't enough logged yet for your vet to read
 *     much into this" and then, one line down, "all 10 matched" — contradicting
 *     itself in adjacent sentences.
 *   • `stoppedForRefusal` — a trial the owner ENDED because the pet would not eat
 *     it cannot have its days read as clean ones, whatever the counts say.
 *
 * LIVED IN `generate-report/trial.ts` UNTIL NOW, as `mayStateRecordClean`, with a
 * comment claiming "`lib/dietTrialFacts.ts` gates the card on exactly this". It
 * did not — the card asked only the weaker question, so the same record produced a
 * withheld claim on the vet's page and an affirmative one on the owner's card.
 * That is the drift a shared module exists to prevent, so the gate moves here and
 * both surfaces call it.
 */
export function mayStateRecordClean(
  facts: TrialFacts,
  opts?: { stoppedForRefusal?: boolean },
): boolean {
  if (!mayClaimAllMatched(facts)) return false;
  if (opts?.stoppedForRefusal) return false;
  return facts.interpretability === 'supports' || facts.interpretability === 'partially_supports';
}

/**
 * §6.5's SECOND, non-clinical path: "this diet isn't being eaten", as a
 * trial-VIABILITY fact pointing at the vet.
 *
 * Three rules govern this string and none of them is negotiable:
 *   • It never softens toward preference. No "picky", no "fussy", no "doesn't
 *     seem to like it" — decline is frequently a DISEASE signal, and the trial is
 *     not a reason to reclassify it as taste.
 *   • It does not replace `detectIntakeDecline`, which owns the clinical lane and
 *     whose flag is checked first by every surface that renders both.
 *   • It reports the RECORD ("left unfinished" — see the widening below), not a
 *     diagnosis, and the action it names is the vet — a different hydrolysate is
 *     the standard answer, and that is a decision only the vet can make.
 */
export function trialViabilityHeadline(refusal: TrialDietRefusal): string {
  // "LEFT UNFINISHED", NOT "REFUSED". The predicate widened to not-finished
  // (`refused` / `picked` / `some`) so it could see the cat that picks — but the
  // copy kept saying "logged as refused", which asserts something the record does
  // not contain about three meals the owner rated "ate some". §6.5's rule for
  // this string is that it reports the RECORD; the string has to widen with the
  // predicate or it stops doing that.
  //
  // AND IT CARRIES ITS OWN DENOMINATOR (B-533). R1a is that this register fires
  // on LOGGED EVIDENCE ONLY, and a headline that states a numerator alone hides
  // the evidence base it rests on: "19 meals were left unfinished" reads the same
  // whether the owner rated 22 feedings or 500. The denominator is what lets an
  // owner check the claim against her own memory — and it is the same disclosure
  // discipline §5.1 applies to every other count on the card, where a number
  // without its denominator is the defect, not the shorthand.
  const n = refusal.refusedFeedings;
  // THE NOUN FOLLOWS THE POPULATION (B-530). Over `meal_record` the app has just
  // concluded it cannot tell which food was the trial diet, so calling these
  // "trial-diet feedings" would assert the very identity the fallback exists
  // because it could not establish. "Meals" is what the record supports, and it is
  // the same word the owner sees on the log.
  const wide = refusal.population === 'meal_record';
  const unit = wide ? 'meal' : 'feeding';
  const qualified = wide ? 'meals' : 'trial-diet feedings';
  const meals = n === 1 ? `1 ${unit}` : `${n} ${unit}s`;
  // `days` is DISTINCT DAYS carrying an unfinished feeding, not a span — so the
  // phrasing has to be "across N days", never "over the last N days", which would
  // assert a window the number is not measuring.
  const when = refusal.days === 1 ? 'on a single day' : `across ${refusal.days} days`;
  // THE WORST CASE MUST NOT READ AS THE CLUMSIEST SENTENCE. When every rated
  // feeding was left unfinished — the canonical refusing patient, and the most
  // serious shape this fact takes — "28 feedings of the 28 trial-diet feedings
  // you've rated" is arithmetic where the reader needs a statement.
  if (n === refusal.ratedFeedings) {
    return refusal.ratedFeedings === 1
      ? `The one ${wide ? 'meal' : 'trial-diet feeding'} you’ve rated was left unfinished.`
      : `Every one of the ${refusal.ratedFeedings} ${qualified} you’ve rated was ` +
        `left unfinished, ${when}.`;
  }
  return `${meals} of the ${refusal.ratedFeedings} ${qualified} you’ve rated were left unfinished, ${when}.`;
}

/**
 * The body under `trialViabilityHeadline` — species-aware, and the register is
 * the whole point of splitting it out.
 *
 * THE FELINE LINE IS NOT DECORATION, AND IT SAYS "TODAY". A cat off its food is
 * on the 48h hepatic-lipidosis clock — and THIS lane is the only watcher on it
 * for the patient that matters most, because `detectIntakeDecline` is
 * structurally blind to a diet refused from day 1. An earlier draft said "soon"
 * while the sibling clinical lane said "today" over the same animal; the
 * canonical fixture (a cat 12 days into refusing its hydrolysate) is many times
 * past that window, so "soon" was the quieter word on the more urgent case. For a
 * safety lane the safe error direction is toward firing, and toward the sooner
 * word. The dog register does not borrow the feline clock.
 *
 * WHAT IT MAY NOT SAY, and the trap the design-locked mock walked into: "a cat
 * eating this little". The record here is about the TRIAL DIET going unfinished —
 * a cat that refuses the hydrolysate and clears a bowl of chicken every night
 * produces exactly this fact, and telling that owner her cat is barely eating is
 * an over-claim in the alarming direction. Escalation is sanctioned by
 * `clinical-guardrails`; inventing a fact to escalate on is not. So the sentence
 * escalates on what IS on the record — the prescribed food going untouched.
 *
 * NOR MAY IT SAY "won't eat". That was the opening clause of the first draft, and
 * it is a VOLITIONAL frame — it locates the cause in the animal's choice, which is
 * one short step from "picky" on the lane whose first rule is that it never
 * softens toward preference. "Isn't eating" reports the same record and asserts
 * nothing about why.
 *
 * The closing sentence is load-bearing rather than polite: the card has just
 * withheld the adherence line, and a surface that goes quiet without saying it
 * went quiet reads as a record with nothing in it.
 *
 * AND THE CLOSING SENTENCE HAS BEEN WRONG TWICE, so it is worth stating what it
 * may claim. Draft 1: "Culprit isn't showing the trial numbers" — falsified the
 * moment the state stopped deleting the off-diet count, which renders one line
 * below. Draft 2: "isn't showing how closely the diet was followed" — falsified
 * by the same line, because an off-diet tally IS a statement about how closely
 * the diet was followed.
 *
 * What this state actually withholds is the READING: no coverage ratio, no
 * clean-run statement, no adherence verdict. It still discloses counts. So the
 * sentence claims exactly that and nothing wider — the same shape
 * `refusalWithheldLine` uses on the terminal card ("isn't showing how clean
 * these 18 days were"), which has been correct all along.
 */
export function trialViabilityNote(
  petName: string,
  species: TrialSpecies,
  /** B-530. `meal_record` means the app could not identify the trial diet, so this
   *  note may not claim the trial diet is the food going untouched. Defaults to the
   *  narrow population — the fact this string was written for. */
  population: TrialRefusalPopulation = 'trial_diet',
): string {
  const call =
    species === 'cat'
      ? `a cat that isn’t eating what’s put down needs a call today`
      : `it’s worth a call to your vet`;
  // THE WIDE POPULATION MAY NOT NAME THE DIET, AND MUST SAY WHY IT CAN'T. The
  // escalation is identical — the pet is not eating what is put down, which is the
  // clinical fact and is fully on the record either way — but the ATTRIBUTION is
  // not available, and a note that quietly borrows the narrow sentence would
  // assert an identity the app just admitted it could not resolve. Disclosing the
  // gap also tells the owner something actionable: re-adding the diet to the
  // trial's food list is what restores the named finding.
  if (population === 'meal_record') {
    return (
      `Culprit can’t match these meals to the foods on this trial’s list, so it can’t ` +
      `name which one went untouched — but what ${petName} is being offered isn’t ` +
      `being eaten, and ${call}, whatever the trial is doing. Culprit isn’t reading ` +
      'these days as a clean run while this is going on.'
    );
  }
  return (
    `A diet ${petName} isn’t eating can’t answer the question the trial was ` +
    `started for — and ${call}, whatever the trial is doing. Culprit isn’t ` +
    'reading these days as a clean run while this is going on.'
  );
}
