// The trial chrome the FOOD LIBRARY renders — B-616 PR 3 (spec §2.1 + §2.4).
// Requirements: docs/nyx-food-library-trial-awareness-requirements.md.
// Design authority: mock screens A and D (docs/culprit-food-library-trial-mockups.html).
//
// PURE. Same reason `trialFoodsScreen.ts` is pure one PR over: the §4 copy pack is
// verbatim, and copy that lives inside a component is copy no test can hold still.
//
// ── WHAT THIS MODULE MAY AND MAY NOT DECIDE ─────────────────────────────────
//
// It may decide WORDS. It may not decide MEMBERSHIP — every function here asks
// `trialListMembership` / `trialListFoodsOn` (lib/trialAllowedSet.ts), which resolve
// through `allowedMembershipOn`, i.e. through rung 1 of the predicate itself (R2/D3).
// Nothing here re-derives, re-dates or re-filters a membership, so the Foods-tab chip,
// the detail row and the §2.2 screen cannot disagree about what is on the list.
//
// ── R1 IS THE WHOLE REVIEW BAR FOR THIS PR ──────────────────────────────────
//
// Positive marking only. Every function that could describe a food returns `null`
// for a food that is not on the list — there is no "off the list" string in this
// module and there must never be one. A closed-world predicate would happily mark
// the entire pantry, and G2 is two-sided: a mark's ABSENCE is not a verdict either.
// The type signatures carry that: `string | null`, never a `{ onList: boolean }`
// that invites a caller to render the false branch.
import { formatCalendarDate } from './utils';
import {
  trialListFoodsOn,
  trialListMembership,
  type TrialAllowedSet,
  type TrialListFood,
} from './trialAllowedSet';
import type { AllowedFood } from './dietTrial';
import { getDietTrialProgress } from './analytics';

// ── §4 copy pack, verbatim ──────────────────────────────────────────────────
//
// Typographic apostrophes (’) throughout, the app's standing convention in every
// shipped owner-facing string. The spec's markdown carries straight quotes because
// markdown does; that is a glyph, not a word.

/** FR-2, the `primary_diet` chip. */
export const TRIAL_CHIP_PRIMARY = 'Trial diet';
/** FR-2, every permitted role (`permitted_other`, `supplement`). They behave
 *  identically at rung 1 and the distinction is provenance for the vet report, not
 *  a rule the owner has to hold in their head — the same grouping §2.2 uses. */
export const TRIAL_CHIP_PERMITTED = 'Also allowed';

/**
 * FR-2 — the chip a library tile carries, or NULL for every other food.
 *
 * Null is the entire register of this function. An off-list food gets no chip, no
 * grey chip, no "not on the trial list" — R1, and the reason is not squeamishness:
 * the library is the whole pantry, the predicate is closed-world, and marking the
 * complement would paint a warning on every food an owner has ever fed.
 */
export function trialChipLabel(
  set: TrialAllowedSet,
  food: TrialListFood,
  atMs: number = Date.now(),
): string | null {
  const hit = trialListMembership(set, food, atMs);
  if (!hit) return null;
  return hit.role === 'primary_diet' ? TRIAL_CHIP_PRIMARY : TRIAL_CHIP_PERMITTED;
}

// ── The Foods-tab strip (§2.1 / FR-1, mock A) ───────────────────────────────

export interface FoodsTrialStripModel {
  /** `Diet trial — day 12 of 28`, prefixed with the pet's name on a multi-pet
   *  account (D7 — the library is per-account, the trial is not). */
  header: string;
  /** The list NAMED, not counted — `Royal Canin Hydrolyzed Protein HP, and 2
   *  more` (B-627). See `trialStripFoodsLine`. */
  line: string;
}

/**
 * The strip's second line, NAMING the foods on the list rather than counting
 * them (B-627).
 *
 * The count ("3 foods on the trial list") pointed at the 10-second answer — "which
 * foods?" — one tap away, on the wedge's own surface, instead of giving it. The
 * cold reviewer's reaction was literally *"Three. Okay… which three?"*, and they
 * scrolled the library before tapping through. So the line now leads with the food
 * an owner opens this tab to check.
 *
 * LEADS WITH THE PRESCRIBED DIET. `primary_diet` is the most identifying row and
 * the one the question is usually about, so it is named first regardless of the
 * set's stored order; a permitted-only set (no `primary_diet` row — legal, rare)
 * falls back to the first food in force. The remainder is a bare count, so a long
 * pet's-worth of extras never runs the line off the strip — the strip's own
 * `numberOfLines={1}` truncates it, which B-627 accepts as the cost of naming.
 *
 * Not "and 2 others" / "+2": "and N more" reads as a continuation of the named
 * food (the vet's list continues), where "+2" reads as a count badge — and a count
 * is the thing this line is replacing.
 *
 * Requires a non-empty set; `buildFoodsTrialStrip` guards the empty case (it
 * returns no strip at all rather than a line about zero foods) before calling.
 */
export function trialStripFoodsLine(foods: readonly AllowedFood[]): string {
  const lead = foods.find((f) => f.role === 'primary_diet') ?? foods[0];
  if (!lead) return '';
  const remaining = foods.length - 1;
  return remaining === 0 ? lead.label : `${lead.label}, and ${remaining} more`;
}

/**
 * FR-1's strip, or null when there is nothing to render.
 *
 * FOUR WAYS THIS RETURNS NULL, and the last one is the one worth stating:
 *
 *   • `unknown` — R2. A read that could not answer renders nothing.
 *   • `no_trial` — including a stale `status = 'active'` trial, which
 *     `loadTrialAllowedSet` has already gated through `isTrialRunning` (B-422).
 *     FR-4's clean disappearance is this, arriving for free.
 *   • no rows in force today — see below.
 *
 * A `ready` set with an empty in-force list would print a line about the record
 * (once "0 foods on the trial list"; now a naming line with nothing to name),
 * which is a CLAIM ABOUT THE RECORD rather than an absence of one — the same
 * failure `loadTrialAllowedSet` refuses one layer down by answering `unknown` for a
 * hydrating set. It is reachable here without any hydration problem at all: every
 * row date-gated out (a future `allowed_from`, or an `allowed_until` that has
 * passed) leaves a live trial with a legitimately empty set for today. The honest
 * rendering of "the list permits nothing today" is not a strip; it is no strip, and
 * the trial card still carries the trial.
 *
 * The day counter is `getDietTrialProgress` — the app's ONE day-math source
 * (B-421) — so this number is the number the trial card and the §2.2 subtitle are
 * showing, by construction rather than by coincidence. The second line NAMES the
 * foods (B-627) via `trialStripFoodsLine`, over the same in-force set the count was
 * taken from — so "which foods?" is answered on the strip rather than one tap away.
 */
export function buildFoodsTrialStrip(
  set: TrialAllowedSet,
  opts: { petName: string | null; multiPet: boolean },
  atMs: number = Date.now(),
): FoodsTrialStripModel | null {
  if (set.status !== 'ready') return null;

  const foods = trialListFoodsOn(set, atMs);
  if (foods.length === 0) return null;

  const progress = getDietTrialProgress(
    { startedAt: set.trial.startedAt, targetDurationDays: set.trial.targetDurationDays },
    atMs,
  );
  // The day clause degrades rather than fabricates: no target → no "of M"; no
  // parseable start → no day at all. The strip is still a true label and still the
  // way through to §2.2, which is what an owner needs from it.
  const dayClause =
    progress === null
      ? null
      : progress.targetDays > 0
        ? `day ${progress.dayCounter} of ${progress.targetDays}`
        : `day ${progress.dayCounter}`;

  // D7: the name only when the account holds more than one pet. On a single-pet
  // account "Biscuit's diet trial" is noise — there is no other trial it could be.
  const subject = opts.multiPet && opts.petName ? `${opts.petName}’s diet trial` : 'Diet trial';

  return {
    header: dayClause === null ? subject : `${subject} — ${dayClause}`,
    line: trialStripFoodsLine(foods),
  };
}

// ── Food detail (§2.4 / FR-13–FR-14, mock D) ────────────────────────────────

/**
 * FR-13 — the dated membership fact, or NULL for a food that is not on the list.
 *
 * The null branch is FR-13 itself: "For a food not on the list the row is
 * **absent** — never 'Not on the list'." A row that rendered the negative would be
 * the app volunteering a verdict about a food the vet never mentioned, on the
 * screen where an owner is most likely to read it as one.
 *
 * Unlike §2.2's `membershipFact`, this does NOT split "since" from "added" — §4
 * pins one string for this surface, and mock D shows a food added mid-trial reading
 * `since Jul 31`. That is not a loss of the D5 disclosure: the date IS the
 * disclosure here (it is the day membership starts, and it is visibly not the
 * trial's start date), and the full "earlier feedings keep the reading they already
 * have" sentence is stated at the moment it matters — in the confirm sheet, before
 * the write.
 */
export function trialMembershipLine(
  set: TrialAllowedSet,
  food: TrialListFood,
  petName: string,
  atMs: number = Date.now(),
): string | null {
  const hit = trialListMembership(set, food, atMs);
  if (!hit) return null;
  const onList = `On ${petName}’s trial list`;
  const date = formatCalendarDate(hit.allowedFrom);
  return date === null ? onList : `${onList} · since ${date}`;
}

/** FR-14's action label. The food is already known on this screen, so the tap goes
 *  straight to §2.3's confirm sheet — there is no picker step to pass through. */
export function addToTrialListLabel(petName: string): string {
  return `Add to ${petName}’s trial list`;
}
