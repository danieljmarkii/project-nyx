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
import { useMealScreenFlagStore } from '../store/mealScreenFlagStore';
import { getDb } from './db';
import type { TrialFoodSelection } from './dietTrialSetup';
import {
  evaluateBowlLogTimeFlag,
  evaluateMealLogTimeFlag,
  forgetFlaggedFoodInTrial,
  forgetFlagsSpentByEvent,
  noteTrialFlagShown,
  type BowlFlagComponent,
  type LogTimeTrialFlag,
} from './trialContaminant';

/** Where an edit's heads-up lands (CUL-2088): the completion card when the edit was made
 *  on it, the meal's own screen when it was made there or on the edit screen. */
export type HeadsUpSurface = 'card' | 'meal_screen';

export interface MealTrialFlagArgs {
  /** The just-logged meal's event id — the card this heads-up may land on. */
  eventId: string;
  petId: string;
  /** A plain meal's food. Ignored when `components` is given. */
  foodId: string | null;
  /** A MIXED BOWL's foods (spec §5.2): every one is evaluated, and the heads-up names
   *  the offending one. Absent for a plain meal. */
  components?: readonly BowlFlagComponent[];
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
  const { eventId, petId, foodId, components, occurredAt } = args;
  const flag = components && components.length > 0
    ? await evaluateBowlLogTimeFlag({ petId, components, occurredAt })
    : foodId
      ? await evaluateMealLogTimeFlag({ petId, foodId, occurredAt })
      : null;
  if (!flag) return 'no_flag';
  if (!(await whenMealCardVisible(eventId))) return 'card_gone';
  // Read the store at the moment of the patch, not through a render-time hook
  // binding: this runs after the calling screen may already have unmounted (the
  // picker path dismisses /log before the card reveals).
  const { patchTrialFlag, rescheduleHide } = useMomentStore.getState();
  if (!patchTrialFlag(eventId, flag)) return 'patch_refused';
  rescheduleHide(MEAL_FLAGGED_DURATION_MS);
  await noteTrialFlagShown(flag, eventId);
  return 'shown';
}

/** What a bowl edit's re-run did to the card (CUL-2086). `replaced` and `cleared` both
 *  give the displaced food its one warning back. `handed`: the heads-up now waits for the
 *  meal's own screen (CUL-2088), which spends it only once it shows. */
export type BowlEditFlagOutcome = MealTrialFlagOutcome | 'replaced' | 'cleared' | 'superseded' | 'handed';

export interface BowlEditFlagArgs extends MealTrialFlagArgs {
  /** Every food in the bowl AFTER the edit, so the card can tell whether the food its
   *  heads-up names is still in it. */
  bowlFoodIds: readonly string[];
  /** Defaults to the card. `meal_screen` never waits for a card: the edit was made away
   *  from one, and a 3 s wait would land the line after the screen has come back. */
  surface?: HeadsUpSurface;
}

/**
 * The heads-up after a BOWL EDIT (Mixed meals row 5, CUL-2086): the writer re-runs it
 * over the new bowl, and the card it lands on may already show one.
 *
 * `applyMealTrialFlag` never replaces a heads-up, and for a fresh log that is right. After
 * an edit it is wrong in two ways the adversarial pass on row 4 found: the flagged food can
 * leave the bowl (the card warns about a food that is not in the meal, and that food's one
 * warning for the trial is used up, so its real feeding later gets none), and a stronger
 * flag (a protein the trial excludes) can arrive behind a weaker one (off the list) and
 * wait until that food is fed again. So the store's `patchBowlTrialFlag` may replace in
 * exactly those two cases, and this function gives the displaced food its budget back.
 *
 * The same order as the log path, with the ledger last: the displaced food is forgotten
 * only once the card has dropped its line, and the new one is spent only once it shows.
 */
export async function applyBowlEditTrialFlag(args: BowlEditFlagArgs): Promise<BowlEditFlagOutcome> {
  const { eventId, petId, foodId, components, occurredAt, bowlFoodIds } = args;
  // Only the NEWEST edit of a bowl may touch its card (CUL-2086, pass 1, R2): two quick
  // edits can finish out of order, and an older one would patch against a bowl that no
  // longer exists, pulling a warning off a meal that still holds the food.
  const current = claimEdit(eventId);

  const flag = components && components.length > 0
    ? await evaluateBowlLogTimeFlag({ petId, components, occurredAt })
    : foodId
      ? await evaluateMealLogTimeFlag({ petId, foodId, occurredAt })
      : null;
  if (!current()) return 'superseded';
  // Whatever the card does, a food this meal spent and the bowl no longer holds gets its
  // warning back, even when the edit was made away from the card (R6). After the
  // newest-edit check, so a superseded edit never gives back a food the final bowl holds.
  // A food put back by a LATER edit after this ran stays unspent: one extra heads-up.
  await forgetFlagsSpentByEvent(eventId, bowlFoodIds);
  if (args.surface === 'meal_screen') {
    if (!(await handToMealScreen(eventId, flag, current))) return 'superseded';
    return flag ? 'handed' : 'no_flag';
  }
  // The card may be between screens (the first mix returns it 450 ms after the picker
  // closes), so wait for it as the log path does. An edit made off the card waits out
  // the timeout and lands nothing, which spends nothing.
  if (!(await whenMealCardVisible(eventId))) return flag ? 'card_gone' : 'no_flag';
  if (!current()) return 'superseded';
  const { patchBowlTrialFlag } = useMomentStore.getState();
  const { landed, displaced } = patchBowlTrialFlag(eventId, flag, bowlFoodIds);
  if (displaced) await forgetFlaggedFoodInTrial(displaced.trialId, displaced.foodId);
  if (!landed || !flag) return displaced ? 'cleared' : flag ? 'patch_refused' : 'no_flag';
  // Spend only what is STILL on screen (R1): a second edit, an Undo or a newer meal can
  // have taken this flag off the card during the forget above.
  const after = useMomentStore.getState();
  const stillShown =
    after.visible && !after.removed && after.undoing !== eventId &&
    after.payload?.kind === 'meal' && after.payload.eventId === eventId &&
    after.payload.trialFlag === flag;
  if (!stillShown) return displaced ? 'cleared' : 'patch_refused';
  after.rescheduleHide(MEAL_FLAGGED_DURATION_MS);
  await noteTrialFlagShown(flag, eventId);
  return displaced ? 'replaced' : 'shown';
}

/**
 * The heads-up after a PLAIN meal's food is changed on the edit screen (CUL-2088,
 * instance 1). There is no card, so the flag goes to the meal's own screen, which the edit
 * screen returns to. The caller has already given back what this meal spent on the food it
 * replaced (`forgetFlagsSpentByEvent`, CUL-2087), so the evaluation sees today's ledger.
 * A change to a food with nothing to say clears a heads-up an earlier change left waiting.
 * Never throws into the save.
 */
export async function applyMealScreenTrialFlag(
  eventId: string,
  foodId: string,
): Promise<'no_flag' | 'handed' | 'superseded'> {
  const current = claimEdit(eventId);
  try {
    // The meal's own pet and time, read from the record (C-9), never the active pet.
    const event = await getDb().getFirstAsync<{ pet_id: string; occurred_at: string }>(
      'SELECT pet_id, occurred_at FROM events WHERE id = ?',
      [eventId],
    );
    const flag = event
      ? await evaluateMealLogTimeFlag({ petId: event.pet_id, foodId, occurredAt: event.occurred_at })
      : null;
    if (!(await handToMealScreen(eventId, flag, current))) return 'superseded';
    return flag ? 'handed' : 'no_flag';
  } catch (e) {
    console.warn('[mealTrialFlag] meal-screen heads-up failed:', e);
    return 'no_flag';
  }
}

/**
 * Leave the newest edit's verdict for the meal's screen: a flag waits there, null clears
 * one an older edit left. Spends nothing: `TrialHeadsUpLine` spends once it is on screen.
 * False when a newer edit took over while the food was read.
 */
async function handToMealScreen(
  eventId: string,
  flag: LogTimeTrialFlag | null,
  current: () => boolean,
): Promise<boolean> {
  const food = flag ? await readTrialFoodSelection(flag.foodId) : null;
  if (!current()) return false;
  useMealScreenFlagStore.getState().put(eventId, flag ? { flag, food } : null);
  return true;
}

/** The flagged food as the add-to-list sheet writes it. Null when its row is not on this
 *  phone or the read fails; the line then shows without its add door. */
async function readTrialFoodSelection(foodId: string): Promise<TrialFoodSelection | null> {
  try {
    const row = await getDb().getFirstAsync<{ brand: string | null; product_name: string | null; food_type: string | null }>(
      'SELECT brand, product_name, food_type FROM food_items_cache WHERE id = ?',
      [foodId],
    );
    if (!row) return null;
    return { id: foodId, brand: row.brand ?? '', product_name: row.product_name ?? '', food_type: row.food_type };
  } catch (e) {
    console.warn('[mealTrialFlag] flagged food read failed:', e);
    return null;
  }
}

/** Claim the newest edit of a meal; the returned check is false once a later one claims. */
function claimEdit(eventId: string): () => boolean {
  const seq = (editSeq.get(eventId) ?? 0) + 1;
  editSeq.set(eventId, seq);
  return () => editSeq.get(eventId) === seq;
}

/** The newest edit per meal (see `applyBowlEditTrialFlag`). Grows by one small entry per
 *  meal edited in a session, which is bounded by what an owner can tap. */
const editSeq = new Map<string, number>();
