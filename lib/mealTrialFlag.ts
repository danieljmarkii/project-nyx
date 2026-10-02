// The log-time trial heads-up, landed on the meal card that is already showing —
// the ONE orchestration both meal-entry paths call (CUL-354 / B-711).
//
// WHY ONE FUNCTION. `app/log.tsx` (the picker path) and `components/log/FAB.tsx`
// (the quick-add path) each used to carry a byte-identical `applyTrialFlag`, with a
// "kept identical to the other path on purpose" comment on both. That is the shape
// that produced B-710: the two copies drifted once — the FAB path reveals its card
// synchronously and never needed to wait, the picker path defers its reveal behind
// `delayMs`, and the copy that did not wait dropped the heads-up on the app's main
// meal-logging path. A comment asking two files to stay identical is not a
// mechanism; one definition is. `lib/mealTrialFlag.test.ts` pins the order below
// AND scans both screens for a local re-copy.
//
// WHY THIS FILE AND NOT `lib/trialContaminant.ts`. The evaluator and the ledger
// live there, but `store/momentStore.ts` imports that module at runtime
// (`forgetFlaggedFoodInTrial`, for Undo), so a function there that reaches back
// into the store would close an import cycle. This module sits above both.
//
// THE ORDER IS THE CONTRACT — every step gates the next, and the ledger write is
// LAST:
//   1. evaluate — one context read + one food-record read (B-693). No flag → done.
//   2. wait for the card — `whenMealCardVisible` resolves the instant the card for
//      THIS event reveals, and `false` when a newer log superseded it. On the picker
//      path the reveal is deferred (`delayMs`) while the evaluation above is an
//      all-local read that resolves first, so a bare patch would hit a
//      not-yet-revealed card and the heads-up would be silently dropped (B-710). On
//      the FAB path this resolves at once; the guard is the same either way.
//   3. patch — `patchTrialFlag` lands only on the visible, un-undone card for this
//      event and reports whether it did.
//   4. extend the dwell so the owner can read it.
//   5. spend the budget — `noteTrialFlagShown` records the one-heads-up-per-food-
//      per-trial ledger (rule 3) ONLY once the heads-up is genuinely on screen.
//      Recording earlier re-opens "a suppressed heads-up consumed the budget for a
//      heads-up that was never given" (`trialContaminant.ts`, evaluateMealLogTimeFlag).
//
// Fire-and-forget by design at both call sites: the meal is written and the card is
// up before this runs, and it is strictly additive information (Principle 1 — the
// log never waits on it). The returned outcome exists so a test can assert which
// gate stopped it; callers `void` it.
import { useMomentStore, MEAL_FLAGGED_DURATION_MS, whenMealCardVisible } from '../store/momentStore';
import { evaluateMealLogTimeFlag, noteTrialFlagShown } from './trialContaminant';

export interface MealTrialFlagArgs {
  /** The just-logged meal's event id — the card this heads-up may land on. */
  eventId: string;
  petId: string;
  foodId: string;
  /** The meal's occurred_at, ISO. */
  occurredAt: string;
}

/** Which gate the orchestration stopped at. `shown` is the only outcome that spends
 *  the food's heads-up budget. */
export type MealTrialFlagOutcome =
  | 'no_flag'        // step 1: nothing to say about this meal
  | 'card_gone'      // step 2: a newer log superseded the card before it revealed
  | 'patch_refused'  // step 3: the card was dismissed / undone / not this meal's
  | 'shown';         // steps 3–5: on screen, dwell extended, budget spent

export async function applyMealTrialFlag(args: MealTrialFlagArgs): Promise<MealTrialFlagOutcome> {
  const { eventId, petId, foodId, occurredAt } = args;
  const flag = await evaluateMealLogTimeFlag({ petId, foodId, occurredAt });
  if (!flag) return 'no_flag';
  if (!(await whenMealCardVisible(eventId))) return 'card_gone';
  // Read the store at the moment of the patch, not through a render-time hook
  // binding: this runs after the calling screen may already have unmounted (the
  // picker path dismisses /log before the card reveals).
  const { patchTrialFlag, rescheduleHide } = useMomentStore.getState();
  if (!patchTrialFlag(eventId, flag)) return 'patch_refused';
  rescheduleHide(MEAL_FLAGGED_DURATION_MS);
  await noteTrialFlagShown(flag);
  return 'shown';
}
