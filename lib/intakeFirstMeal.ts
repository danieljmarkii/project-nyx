// The intake door's PRE-FILL — which food the *Didn't eat ›* sheet opens with
// (CUL-870 / N-3b; docs/nyx-daily-look-requirements.md §3.1a, §4.5).
//
// ── WHAT THE PRE-FILL IS FOR ─────────────────────────────────────────────────
// Confirmation over entry (Principle 2): the owner came through a door labelled
// *Didn't eat*, and the app should already know which bowl she means. The RATING is
// never pre-filled — that is the owner's, always (§4.5, the B-156 G1 shape) — so the
// only thing decided here is the FOOD.
//
// ── WHY IT FAILS CLOSED ──────────────────────────────────────────────────────
// Every uncertain answer is `null`, which opens the sheet at the FOOD STEP instead
// (§4.5's "a pet with no meals ever"). That costs a tap. The alternative costs the
// record: §4.5's named hazard is the wedge user rating *Refused* against a TOPPER
// during an elimination trial, which contaminates the trial on the exact owner the
// product is for. A guessed pre-fill is a guess the owner has to notice and correct in
// a two-tap flow; the food step is a question she cannot answer wrongly by not reading.
//
// So the three uncertain states all return null rather than reaching for the newest
// food: a trial whose allowed set has not hydrated (`unknown`), a running trial with no
// `primary_diet` in force today, and a read that threw.
//
// ── WHY `primary_diet` ONLY ──────────────────────────────────────────────────
// "The trial diet" is the diet, not everything the trial permits. `permitted_treat` is
// a treat; `permitted_other` is where `narrowTrialFoodRole` puts a role this build
// cannot read (B-556), so pre-filling one would name a food as the trial diet on the
// strength of not understanding it. Membership itself is asked through the ONE shipped
// predicate (`trialListMembership`) — never a second matcher here (§5.4 / the
// `matchAllowed` rule).

import { getPickerFoodById, getRecentFoods, type PickerFood } from './db';
import {
  loadTrialAllowedSet,
  trialListFoodsOn,
  trialListMembership,
  type TrialAllowedSet,
} from './trialAllowedSet';

/** Why this food is the one offered. The sheet SAYS which (§4.5: the food is one tap to
 *  change, so the owner has to be able to see what she is changing away from). */
export type IntakePrefillSource = 'trial_diet' | 'recent_meal';

export interface IntakePrefill {
  food: PickerFood;
  source: IntakePrefillSource;
}

/**
 * How many distinct foods to look back over.
 *
 * `getRecentFoods` groups by food — one row per food, ordered by this pet's last meal of
 * it — so this is a count of FOODS, not of meals, and a household's rotation is small
 * (the picker's own shelf caps at 12). It is set well past that because the scan has to
 * survive a run of treats and, during a trial, a run of off-list foods before it reaches
 * the one it wants; a short cap would silently degrade to the food step for a pet whose
 * library is wide.
 */
export const PREFILL_SCAN_LIMIT = 25;

/** What the decision resolved to, before the trial fallback's own read. Split from
 *  `loadIntakePrefill` so every RULE above is testable without a database. */
export type IntakePrefillDecision =
  | { kind: 'food'; food: PickerFood; source: IntakePrefillSource }
  /** A running trial whose diet this pet has no meal row for yet — day one of a trial.
   *  The id is a `food_items_cache` id; the loader reads the row. */
  | { kind: 'trial_food'; foodItemId: string }
  | { kind: 'none' };

/** A treat is never the pre-fill (§4.5), and neither is an unclassified or `other` food:
 *  a refusal attributed to a supplement is a refusal the record cannot use, and the
 *  intake detectors read non-treat MEALS. `'meal'` is the whole eligible set. */
function isMealType(food: PickerFood): boolean {
  return food.food_type === 'meal';
}

/**
 * THE RULES, over rows somebody else read.
 *
 * `recents` is `getRecentFoods(petId, null, …)` — newest first, archived already
 * dropped, no time bound (the FAB quick-log's unbounded shelf, not the picker's
 * time-bounded "recent" section — §4.5 names the difference).
 */
export function decideIntakePrefill(
  recents: readonly PickerFood[],
  trial: TrialAllowedSet,
  nowMs: number = Date.now(),
): IntakePrefillDecision {
  // Not "no trial" — "we do not know yet". `loadTrialAllowedSet` returns this for a read
  // that threw AND for a live trial whose `diet_trial_foods` have not hydrated, which is
  // a real state on a fresh install or a re-login. Treating it as "no trial" is exactly
  // how a topper becomes the pre-fill on a trial pet.
  if (trial.status === 'unknown') return { kind: 'none' };

  if (trial.status === 'ready') {
    const diet = trialListFoodsOn(trial, nowMs).filter((f) => f.role === 'primary_diet');
    // A running trial the record cannot name a diet for. The sanctioned comparator is
    // already dark in this state everywhere else (B9 discloses it); here it simply means
    // there is no trial diet to offer, and the non-trial food underneath it is the one
    // §4.5 forbids.
    if (diet.length === 0) return { kind: 'none' };

    const eaten = recents.find(
      (r) =>
        isMealType(r) &&
        trialListMembership(trial, { id: r.id, brand: r.brand, productName: r.product_name }, nowMs)
          ?.role === 'primary_diet',
    );
    if (eaten) return { kind: 'food', food: eaten, source: 'trial_diet' };

    // Day one: the trial is running and this pet has eaten none of its diet yet, so no
    // meal row reaches the food. `trialListFoodsOn` is ordered by `allowed_from` then id,
    // so this is the diet the trial STARTED with rather than a mid-trial addition.
    return { kind: 'trial_food', foodItemId: diet[0].foodItemId };
  }

  const recent = recents.find(isMealType);
  return recent ? { kind: 'food', food: recent, source: 'recent_meal' } : { kind: 'none' };
}

/**
 * The pre-fill, or `null` for "open at the food step".
 *
 * Never throws: every failure is the food step, which is a working screen. A door that
 * errors is worse than a door that asks.
 */
export async function loadIntakePrefill(
  petId: string,
  nowMs: number = Date.now(),
): Promise<IntakePrefill | null> {
  let decision: IntakePrefillDecision;
  try {
    const [recents, trial] = await Promise.all([
      getRecentFoods(petId, null, PREFILL_SCAN_LIMIT),
      loadTrialAllowedSet(petId, nowMs),
    ]);
    decision = decideIntakePrefill(recents, trial, nowMs);
  } catch (e) {
    console.error('[intakeFirstMeal] pre-fill read failed; opening at the food step:', e);
    return null;
  }

  if (decision.kind === 'none') return null;
  if (decision.kind === 'food') return { food: decision.food, source: decision.source };

  try {
    const food = await getPickerFoodById(decision.foodItemId);
    // Null when the trial's diet row points at a food this device has not mirrored yet,
    // or at one the owner has since archived. Both are the food step, not a nameless chip.
    return food ? { food, source: 'trial_diet' } : null;
  } catch (e) {
    console.error('[intakeFirstMeal] trial-diet food read failed:', e);
    return null;
  }
}
