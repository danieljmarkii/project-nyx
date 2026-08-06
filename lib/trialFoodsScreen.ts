// "What {pet} can eat" and its mid-trial add — B-616 PR 2 (spec §2.2/§2.3).
// Requirements: docs/nyx-food-library-trial-awareness-requirements.md.
// Design authority: mock screens B and C (docs/culprit-food-library-trial-mockups.html).
//
// PURE. Every string this track's two new surfaces render is built here, for the
// same reason `dietTrialCard.ts` and `dietTrialCompletion.ts` exist: the copy pack
// (§4) is verbatim and the C6 line is LOCKED, and copy that lives inside a
// component is copy no test can hold still.
//
// ── WHAT THIS MODULE MAY AND MAY NOT DECIDE ─────────────────────────────────
//
// It may decide LAYOUT and WORDS. It may not decide MEMBERSHIP: `trialListFoodsOn`
// hands it the rows, resolved through `allowedMembershipOn` (R2/D3), and nothing
// here re-derives, re-filters or re-dates them. The one computation it does own is
// which day of the trial a row's `allowed_from` falls on — and even that is
// delegated to `getDietTrialProgress`, the app's single day-math source (B-421),
// called with that day's instant rather than re-implemented for a past date. §5
// edge 7 requires the sheet's "day N" to equal the card's counter; the only way to
// guarantee that is to ask the same function.
//
// ── THE TWO REGISTERS, AND THE LINE BETWEEN THEM ────────────────────────────
//
// Every string here is about the LIST — what is on it, and since when (R1,
// positive marking only). Nothing is about the pet's behaviour, the owner's
// choices, or whether an addition is wise. Dr. Chen's note on mock screen C is the
// governing one: the dated record IS the safety mechanism, and copy that
// second-guesses the vet's call ("are you sure this fits the trial?") would judge
// the owner for following it. So the sheet states consequences and asks nothing.
import { getDietTrialProgress } from './analytics';
import type { AllowedFood, TrialFoodRole } from './dietTrial';
import { trialListFoodsOn, type TrialAllowedSet, type TrialAllowedSetTrial } from './trialAllowedSet';
import { dayKeyToLocalDate, formatLongDate, toLocalDayKey } from './utils';

// ── §4 copy pack, verbatim ──────────────────────────────────────────────────
//
// One glyph-level deviation, applied throughout: apostrophes are typographic (’),
// which is the app's standing convention in every shipped owner-facing string.
// The spec's markdown carries straight quotes because markdown does; that is a
// rendering detail, not a word, and "LOCKED" governs the words.

/** FR-7. LOCKED (C6) and rendered on THIS SCREEN ONLY — it is the sentence that
 *  names the itemisation to the owner, and repeating it on a tab or a tile would
 *  turn a disclosure into decoration. Do not reword. */
export const TRIAL_FOODS_DISCLOSURE =
  'While the trial runs, Culprit records which feedings matched the trial diet ' +
  'and which didn’t, with dates. That’s the part your vet needs.';

/** FR-9 — a designed empty state, not a gap (Principle 5). Forward-looking and
 *  honest: an empty extras group is the NORMAL shape of a strict elimination
 *  trial, so it may not read as something missing. */
export const TRIAL_FOODS_EMPTY_EXTRAS =
  'Just the trial diet for now. If your vet okays an extra, add it here.';

export const TRIAL_FOODS_ADD_ACTION = 'Add a food to the list';
export const TRIAL_FOODS_GROUP_PRIMARY = 'Trial diet';
export const TRIAL_FOODS_GROUP_PERMITTED = 'Also allowed';

export const ADD_TRIAL_FOOD_CONFIRM = 'Add to the list';
export const ADD_TRIAL_FOOD_CANCEL = 'Not now';

/**
 * B-628 — the one line that frames WHOSE call a mid-trial add is.
 *
 * The add flow said nothing about legitimacy from either entry point. FR-9's vet
 * framing ("If your vet okays an extra, add it here") lives only on §2.2's empty
 * "Also allowed" group — so it is gone the moment a first extra exists, and it is
 * never seen at all by an owner who enters from food detail (FR-14). That left an
 * anxious owner with nothing to hang legitimacy on at the moment of the write.
 *
 * This is the fix, placed on the CONFIRM SHEET because both entry points share it
 * (PR 2's screen and PR 3's food detail build the model from `buildAddTrialFoodSheet`
 * and render the same `AddTrialFoodSheet`) — so one line covers every path to an
 * add, including the §2.2 second-add case the empty state has already vacated.
 *
 * It is NOT a wisdom-check, and that distinction is the whole design. D5 and Dr.
 * Chen's mock-C note forbid "are you sure this fits the trial?" — second-guessing
 * the vet's call judges the owner for following it. This line does the opposite: it
 * states that extras ARE the vet's call (legitimacy, not interrogation) and that
 * Culprit's job is only to date the record (reinforcing the "Earlier feedings" fact
 * and C6, and keeping the app out of the role of arbiter). It never asks whether
 * THIS food fits, never blocks, never marks anything off-diet.
 */
export const ADD_TRIAL_FOOD_CAPTION = 'Extras are your vet’s call — Culprit just records the dates.';

/** A write that did not land. Plain cause, a concrete next action, no error code —
 *  and deliberately NOT silent: the sheet closing over a failed insert would leave
 *  an owner believing a food is permitted when the record says it isn't, which is
 *  the one disagreement between screen and record this whole track exists to
 *  prevent. The row is local-first, so "in a moment" is honest — this is a device
 *  write failing, not the network. */
export const ADD_TRIAL_FOOD_ERROR = 'That didn’t save. Try again in a moment.';

// ── The screen (§2.2, mock B) ───────────────────────────────────────────────

export interface TrialFoodsRow {
  /** Stable React key. The trial row's own id-or-key identity, which is what the
   *  list is deduped on — never the array index, which reorders under an add. */
  key: string;
  /** `diet_trial_foods.food_label`, captured at write time so it survives the
   *  food's deletion (§3.2). §5 edge 1 turns on this: an ARCHIVED food is hidden
   *  from the library's tiles but must still be named here, because a list
   *  membership is a fact about the trial, not a library read. */
  label: string;
  /** FR-6's dated membership fact. */
  fact: string;
}

export interface TrialFoodsGroup {
  title: string;
  rows: TrialFoodsRow[];
  /** Rendered instead of rows when the group is empty. Null when an empty group
   *  should simply not appear — which is the `Trial diet` group's case: a running
   *  trial with no primary diet is not a state to narrate, it is an unhydrated
   *  read, and `loadTrialAllowedSet` already answers `unknown` for it. */
  emptyState: string | null;
}

export interface TrialFoodsScreenModel {
  title: string;
  /** "Diet trial · day 12 of 28", or null when the trial carries no target to
   *  count toward — a `day 12 of 0` line is worse than no line. */
  subtitle: string | null;
  groups: TrialFoodsGroup[];
  addLabel: string;
  disclosure: string;
}

/** Both permitted roles group together under `Also allowed` — they behave
 *  identically at rung 1 and the distinction is provenance for the vet report, not
 *  a rule the owner has to hold in their head (`permittedRoleForFood`'s own note).
 *  `supplement` lands here too rather than in an unnamed third group. */
function isPrimary(role: TrialFoodRole): boolean {
  return role === 'primary_diet';
}

/**
 * Which day of the trial a local day key falls on, via the ONE day-math source.
 *
 * `getDietTrialProgress` is asked for that day's instant rather than for `now`,
 * so the number this returns for today is — by construction, not by coincidence —
 * the same number the trial card is showing on the profile screen (§5 edge 7). A
 * local re-derivation (`indexOf(dayKey) - indexOf(startedAt) + 1`) would be three
 * lines and would be the second answer in the app to "what day is it", which is
 * exactly the drift B-421 consolidated away.
 *
 * Null when either date is unparseable — the caller then omits the clause rather
 * than printing a fabricated day.
 */
export function trialDayOn(trial: TrialAllowedSetTrial, dayKey: string): number | null {
  const d = dayKeyToLocalDate(dayKey);
  if (!d) return null;
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    d.getTime(),
  );
  return progress?.dayCounter ?? null;
}

/**
 * FR-6's dated fact for one row.
 *
 * TWO READINGS, and the split is D5's whole disclosure. A food that has been on
 * the list since the trial opened reads "On the list since Jul 19" — it is part of
 * what the vet prescribed. A food added later reads "Added Jul 31, day 12", which
 * names the day membership STARTED, and that is the visible half of the promise
 * the write path keeps: `allowed_from` is today, so the feedings before it keep
 * the reading they already have. A mid-trial add rendered as a plain "since" would
 * read as though the food had always been permitted, which is the amnesty the
 * confirm sheet explicitly denies.
 *
 * The split is computed from the DAY, not from a flag: day ≤ 1 is the trial's own
 * opening set (and a backdated start keeps that reading, since every founding row
 * is written at `started_at`). Nothing on the row records "this was an add", so
 * inferring it from a stored boolean would mean adding one.
 */
export function membershipFact(trial: TrialAllowedSetTrial, food: AllowedFood): string {
  const date = formatLongDate(food.allowedFrom);
  if (!date) return 'On the list';
  const day = trialDayOn(trial, food.allowedFrom);
  if (day === null || day <= 1) return `On the list since ${date}`;
  return `Added ${date}, day ${day}`;
}

/** The dedupe identity `trialListFoodsOn` grouped on, reused as the React key so
 *  the two cannot disagree about how many rows there are. */
function rowKey(food: AllowedFood): string {
  return food.foodKey ?? food.foodItemId;
}

/**
 * The §2.2 screen, built from an allowed set that is already `ready`.
 *
 * Callers hold the `ready` check themselves (the screen has a state to render for
 * `unknown` and a different one for `no_trial`), so this takes the resolved trial
 * and its rows rather than the union — a model builder that could return null for
 * "not loaded yet" invites a surface to render the null as emptiness, which is the
 * guess R2 forbids.
 */
export function buildTrialFoodsScreen(
  petName: string,
  set: TrialAllowedSet,
  atMs: number = Date.now(),
): TrialFoodsScreenModel | null {
  if (set.status !== 'ready') return null;
  const rows = trialListFoodsOn(set, atMs);
  const progress = getDietTrialProgress(
    { startedAt: set.trial.startedAt, targetDurationDays: set.trial.targetDurationDays },
    atMs,
  );

  const toRow = (f: AllowedFood): TrialFoodsRow => ({
    key: rowKey(f),
    label: f.label,
    fact: membershipFact(set.trial, f),
  });

  return {
    title: trialFoodsTitle(petName),
    subtitle:
      progress && progress.targetDays > 0
        ? `Diet trial · day ${progress.dayCounter} of ${progress.targetDays}`
        : null,
    groups: [
      {
        title: TRIAL_FOODS_GROUP_PRIMARY,
        rows: rows.filter((f) => isPrimary(f.role)).map(toRow),
        emptyState: null,
      },
      {
        title: TRIAL_FOODS_GROUP_PERMITTED,
        rows: rows.filter((f) => !isPrimary(f.role)).map(toRow),
        emptyState: TRIAL_FOODS_EMPTY_EXTRAS,
      },
    ],
    addLabel: TRIAL_FOODS_ADD_ACTION,
    disclosure: TRIAL_FOODS_DISCLOSURE,
  };
}

// ── The confirm sheet (§2.3 / FR-11, mock C) ────────────────────────────────

export interface AddTrialFoodSheetModel {
  title: string;
  /** EXACTLY THREE, and the count is an acceptance criterion. FR-11: the sheet
   *  states the food, when membership starts, and what happens to earlier
   *  feedings — and asks nothing else. No role question (Principle 1: the role is
   *  inferred from the food's own type), and no wisdom-check. */
  rows: { label: string; value: string }[];
  /** B-628 — the legitimacy line. Framing, not a fourth fact and not an action, so
   *  the FR-11 "exactly three facts / two actions" contract is intact. */
  caption: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * The FR-11 sheet.
 *
 * `Earlier feedings — Keep the reading they already have` is the load-bearing
 * line, and it is unconditional on purpose. It is true on day 1 (there are no
 * earlier feedings to re-read, so nothing is being claimed) and it is the whole
 * point on day 40, where the alternative reading — that adding the food today
 * forgives the twelve times it was fed before — is precisely what `addTrialFood`
 * refuses to do by writing `allowed_from` = today. Making the line conditional
 * would delete the promise on exactly the days an owner might have hoped for the
 * amnesty.
 */
export function buildAddTrialFoodSheet(
  petName: string,
  foodLabel: string,
  trial: TrialAllowedSetTrial,
  nowMs: number = Date.now(),
): AddTrialFoodSheetModel {
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    nowMs,
  );
  // The LOCAL day, because that is the day key `addTrialFood` will write. Naming
  // a different date here than the row records is the one way this sheet could
  // lie, and it would only show up near midnight.
  const today = formatLongDate(toLocalDayKey(new Date(nowMs)));
  const joins = [
    today ? `Today, ${today}` : 'Today',
    progress ? `day ${progress.dayCounter}` : null,
  ]
    .filter((p): p is string => p !== null)
    .join(' · ');

  return {
    title: `Add to ${petName}’s trial list?`,
    rows: [
      { label: 'Food', value: foodLabel },
      { label: 'Joins the list', value: joins },
      { label: 'Earlier feedings', value: 'Keep the reading they already have' },
    ],
    caption: ADD_TRIAL_FOOD_CAPTION,
    confirmLabel: ADD_TRIAL_FOOD_CONFIRM,
    cancelLabel: ADD_TRIAL_FOOD_CANCEL,
  };
}

/** The picker's note when the owner taps a food that is already on the list. A
 *  FACT about the list, in the same register as every other string here — never
 *  "you already added that". */
export function alreadyOnListNote(foodLabel: string): string {
  return `${foodLabel} is already on the list.`;
}

/** The screen with no trial to describe — reachable only by a trial ending while
 *  the owner is standing on it (FR-4 arriving as a state rather than a stale
 *  list). Designed, not blank (Principle 5): it says what is true now AND what
 *  this screen is for, so the owner leaves knowing where the list will be rather
 *  than wondering what they broke. */
/** "What {pet} can eat" — the screen's identity, shown in the nav header (B-616
 *  consistency pass; aligned with the exposures screen's nav-title pattern) and
 *  carried on the model from this same source so the two never drift. */
export function trialFoodsTitle(petName: string): string {
  return `What ${petName} can eat`;
}

export function noTrialLine(petName: string): string {
  return `${petName} isn’t on a diet trial right now. When one is running, the foods it allows show up here.`;
}
