// The intake door's sheet — every string an owner reads in it (CUL-870 / N-3b;
// docs/nyx-daily-look-requirements.md §3.1a, §4.5; the round-4 mock's §01 sheet).
//
// Held here rather than in the component for the reason every other copy module in
// `lib/` exists: the strings are testable without a renderer, and `nyx-voice` has one
// file to read. No database import — a copy test should not need expo-sqlite.
//
// ── THE TWO SENTENCES THAT ARE NOT DECORATION ────────────────────────────────
// Both were findings, not ideas. The round-4 product read: "the intake sheet named a
// food, not a meal, and never said that closing saved nothing."
//
//   • THE TITLE says which meal. The door is on a card about *right now*, so an owner
//     could reasonably read the sheet as amending the breakfast she logged at seven.
//     It is always a NEW meal at now, and the first line says so (§3.1a).
//   • *Nothing is saved until you pick how much* says the sheet is inert. It has to be
//     said BEFORE she picks, because the arm tap is the save and there is no second
//     confirm to discover it at.
//
// And the third, conditional one: an owner who came through a door labelled *Didn't
// eat* and closed the sheet "had every reason to believe she had told the app so"
// (rounds 3 and 4, one layer each). What she actually told it is on the Noticed card,
// still selected — so when there is something to keep, the sheet says it is kept.

import { petPronouns, formatTime } from './utils';
import type { IntakePrefillSource } from './intakeFirstMeal';

/** The first line — *Meal · 7:12, now*. A NEW meal at the given instant, never an edit
 *  of an earlier one (§3.1a, design-locked to the mock). The instant is passed in rather
 *  than read from the clock here so the string and the row that gets written cannot
 *  disagree: a displayed timestamp is a promise (C-10). */
export function intakeSheetTitle(at: Date): string {
  return `Meal · ${formatTime(at)}, now`;
}

/** Under the title, in the owner's terms rather than the app's. Says the one thing the
 *  title's "now" only implies. */
export const INTAKE_SHEET_NEW_MEAL = 'A new meal — not a change to one you logged earlier.';

/**
 * The food row's line — the food, and WHY it is the one showing.
 *
 * The reason is not a flourish: the food is one tap to change, so the owner has to be
 * able to tell what she would be changing away from. Under a trial it also does the
 * work §4.5 asks of it — naming the diet as the diet, so a rating against a topper is a
 * deliberate act rather than an unnoticed default.
 */
export function intakeSheetFoodLine(
  label: string,
  source: IntakePrefillSource,
  sex: 'male' | 'female' | 'unknown',
): string {
  return source === 'trial_diet'
    ? `${label} · the trial diet`
    : `${label} · ${petPronouns(sex).possessive} most recent food`;
}

/** The food control. A chevron, because it goes somewhere (the picker) — the same
 *  caret/chevron rule the Noticed card's own row obeys (§3.1a). */
export const INTAKE_SHEET_CHANGE_FOOD = 'Change food ›';

/** The question the arms answer. Names the pet (Pattern 1) and asks what she DID, never
 *  how she felt about it — "picky" and every preference reading of a refusal is out by
 *  construction (`clinical-guardrails`: intake is not preference). */
export function intakeSheetQuestion(petName: string): string {
  return `How much did ${petName} eat?`;
}

/** The sheet is inert until an arm is chosen, and says so before she chooses. */
export const INTAKE_SHEET_NOTHING_SAVED = 'Nothing is saved until you pick how much.';

/** Rendered only when the Noticed card actually has words selected — a reassurance
 *  about an empty card would be a claim about nothing. */
export const INTAKE_SHEET_CARD_KEPT = 'What you tapped on Home stays where it is.';

/**
 * The way out, NAMING ITS DESTINATION — the mock's own label for this sheet
 * specifically (`docs/culprit-daily-look-mockups.html`: `isRouter ? '‹ Back to Noticed'
 * : 'Close'`).
 *
 * The first cut shipped a bare *Close*, reasoned against "Cancel" — which was the right
 * argument (nothing is pending, so there is nothing to cancel) applied to the wrong
 * alternative. The design authority's label was never *Cancel*: it says where the tap
 * goes, which is the entire content of the question this sheet raises. She came from the
 * Noticed card mid-answer; the way back should say she is going back to it.
 */
export const INTAKE_SHEET_BACK = '‹ Back to Noticed';

/** The food step — a pet with no meals ever, or an owner who tapped *Change food ›*
 *  (§4.5). Forward-looking rather than an apology for not knowing (Pattern 3). */
export const INTAKE_SHEET_FOOD_STEP_TITLE = 'Which food?';

export function intakeSheetFoodStepLine(petName: string): string {
  return `Then you'll say how much ${petName} ate.`;
}
