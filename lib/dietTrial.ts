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
}

/** An overlapping `free_choice` feeding arrangement (§5.6). */
export interface TrialArrangement {
  foodItemId: string;
  foodKey: string | null;
  label: string | null;
  startedAt: string;
  endedAt?: string | null;
}

// ── The resolved context ─────────────────────────────────────────────────────

export interface TrialContext {
  trial: TrialSpec;
  allowedFoods: readonly AllowedFood[];
  species: TrialSpecies;
  /** Local-day index of `started_at`, or null when unparseable (which disables
   *  every window-dependent answer rather than guessing a day). */
  startDayIndex: number | null;
  /** Inclusive end of the window: `ended_at` when the trial has stopped. */
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
    for (const raw of food.proteins) {
      const key = canonicalizeProtein(raw);
      if (key) out.add(key);
    }
    // The designated primary is part of the diet even on a row whose array was
    // never captured — otherwise a manually-entered trial food with a main
    // protein and no ingredient panel sanctions nothing at all.
    const primary = canonicalizeProtein(food.primaryProtein);
    if (primary) out.add(primary);
  }
  return out;
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
      antigens: unsanctionedProteins(feeding.proteins, sanctioned),
      role: hit.food.role,
      matchedBy: hit.matchedBy,
      permittedBy: hit.food,
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
  const antigens = unsanctionedProteins(feeding.proteins, sanctioned);
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
    };
  }

  // Rung 3 — the modal case on a real library.
  return blank('off_diet_unrecognised', 'unrecognised', { offDiet: true });
}

function blank(
  verdict: FeedingVerdict,
  rung: ClassificationRung,
  over: { offDiet?: boolean; countsAsFeeding?: boolean } = {},
): FeedingClassification {
  return {
    verdict,
    rung,
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
  if (!isInTrialWindow(ctx, dayIndexOf(ctx, dose.occurredAt))) return null;
  const form = dose.form?.trim().toLowerCase() ?? null;
  const trigger: OralRouteTrigger | null =
    form === 'chewable' ? 'chewable' : dose.pairedEventId ? 'food_vehicle' : null;
  if (!trigger) return null;
  return {
    eventId: dose.eventId,
    occurredAt: dose.occurredAt,
    drugLabel: dose.drugLabel,
    trigger,
  };
}

// ── §5.5 — the standing contamination fact (D-A) ─────────────────────────────

export interface ContaminationFact {
  food: AllowedFood;
  /** Proteins in this food beyond its OWN designated primary. */
  extraProteins: string[];
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
    const intended = canonicalizeProtein(food.primaryProtein);
    if (!intended) continue;
    const extras = canonicalProteins(food.proteins).filter((k) => k !== intended);
    if (extras.length > 0) out.push({ food, extraProteins: extras });
  }
  return out;
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

export interface TrialFacts {
  range: TrialRange | null;
  coverage: TrialCoverage | null;
  exposures: TrialExposureSummary;
  oralRoute: OralRouteExposure[];
  contamination: ContaminationFact[];
  arrangementExposures: ArrangementExposure[];
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
// FLAGGED FOR DR. CHEN, in the shape §0.4 uses for P-1/P-2: these are clinical
// values, not product decisions. Ratification changes three constants and no
// schema, no migration, no shape.
export const COVERAGE_SUPPORTS = 0.8;
export const COVERAGE_FLOOR = 0.5;
export const MIN_INTERPRETABLE_DAYS = 7;

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
    coverage: null,
    exposures: empty,
    oralRoute: [],
    contamination: trialContamination(ctx),
    arrangementExposures: arrangementHits,
    interpretability: 'not_yet',
    belowCoverageFloor: false,
    intakeNotDirectlyObserved: (input.arrangements ?? []).length > 0,
  };
  if (ctx.startDayIndex === null) return base;

  const todayIndex = localDayIndexOf(new Date(input.nowMs).toISOString(), input.timeZone);
  if (todayIndex === null) return base;

  const scopeStartIndex = input.scopeStart
    ? localDayIndexOf(input.scopeStart, input.timeZone)
    : null;
  const scopeEndIndex = input.scopeEnd ? localDayIndexOf(input.scopeEnd, input.timeZone) : null;

  const startDayIndex = Math.max(ctx.startDayIndex, scopeStartIndex ?? ctx.startDayIndex);
  const upperBounds = [todayIndex, ctx.endDayIndex, scopeEndIndex].filter(
    (v): v is number => v !== null,
  );
  const endDayIndex = Math.min(...upperBounds);
  if (endDayIndex < startDayIndex) return base;

  const range: TrialRange = {
    startDayIndex,
    endDayIndex,
    daysElapsed: endDayIndex - startDayIndex + 1,
    clipped: startDayIndex > ctx.startDayIndex,
  };

  const coveredDays = new Set<number>();
  const items: TrialExposureItem[] = [];
  const antigens = new Map<string, AntigenTallyEntry>();
  let totalFeedings = 0;
  let offDiet = 0;
  let unclassifiable = 0;
  const byRung = { derived_protein: 0, unrecognised: 0 };

  for (const feeding of input.feedings) {
    const day = dayIndexOf(ctx, feeding.occurredAt);
    if (day === null || day < startDayIndex || day > endDayIndex) continue;

    // Coverage numerator — NON-TREAT feedings only (§5.1). On live data 82% of
    // feedings are treats, so a "days with food logged" count is clearable
    // entirely by treat data. A NULL `food_type` is NOT assumed to be a treat: it
    // is a feeding nobody has classified, and dropping it would under-report a
    // record the owner actually kept.
    if (feeding.foodType !== 'treat') coveredDays.add(day);

    const classification = classifyFeeding(ctx, feeding);
    if (classification.verdict === 'unclassifiable') {
      unclassifiable += 1;
      continue;
    }
    if (!classification.countsAsFeeding) continue;

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
    if (day === null || day < startDayIndex || day > endDayIndex) continue;
    const hit = classifyDose(ctx, dose);
    if (hit) oralRoute.push(hit);
  }

  return {
    ...base,
    range,
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
    interpretability,
    belowCoverageFloor: interpretability === 'does_not_support',
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
  if (facts.length === 0) return null;
  const proteins = new Set<string>();
  for (const f of facts) for (const p of f.extraProteins) proteins.add(p);
  const list = proteinPhrase([...proteins]);
  const onlyPrimary = facts.every((f) => f.food.role === 'primary_diet');
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
