// The *Change the window* sheet's logic — CUL-1040 (spec §4.2, D1a/D3a/D4a).
//
// docs/nyx-trial-extension-requirements.md §4.1, §4.2, §4.3 ·
// docs/culprit-trial-extension-mockups.html §2–§4 (design authority) ·
// track home CUL-156.
//
// ── WHY A PURE MODULE AND NOT LOGIC INSIDE THE SHEET ───────────────────────────
//
// Everything the sheet DECIDES lives here: which totals are offered, which one is
// the current window, what the end date is, and what the two refusals say. The
// component only draws it. That split is not tidiness — the forward-only rule
// (TE-3/D3a) is the reason the sheet exists in the shape it does, and a rule that
// can only be exercised through a renderer is a rule that gets tested through
// `fireEvent.press` on whichever chips happen to be mounted. Here it is a
// function over integers.
//
// ── TOTALS, NEVER DELTAS (TE-2/D1a) ───────────────────────────────────────────
//
// Every number in and out of this module is the trial's WHOLE new length. A vet
// says "take it to twelve weeks", never "add twenty-eight days", and D1's ruling
// note is explicit about why a mid-trial delta cannot even be phrased honestly:
// `nextTargetDays` extends from `max(currentTarget, dayCounter)`, so on day 53 of
// 56 a "+4 weeks" chip writes 84 while the owner reads it as day 81. The
// milestone keeps its delta because at the milestone the two coincide.

import { toLocalDayKey, dayKeyToLocalDate } from './utils';
// The PURE date module, never `./dietTrialSetup` — that file's `./sync` edge throws
// at load without the Expo env, and `lib/dietTrialCard.ts` imports this one (C-26).
import { trialEndDayKey, formatTrialEndDate } from './trialWindowDates';

/**
 * The closed ladder of whole-week totals the sheet offers, in days.
 *
 * WHOLE WEEKS BECAUSE THE INSTRUCTION IS IN WEEKS. Every clinical window an owner
 * is handed is named in weeks ("eight weeks", "twelve weeks"), and
 * `extensionPhrase` already speaks the milestone's extension that way for the same
 * reason.
 *
 * The ladder covers all three `defaultDurationDays` values as members — dog·gi 28,
 * cat·gi 42, skin 56 — so an owner on any default sees their own window on the
 * ladder rather than as an odd number bolted onto the end of it.
 */
export const WINDOW_LADDER_DAYS = [28, 42, 56, 70, 84, 112] as const;

/**
 * The hard ceiling on the free-entry total — 52 weeks. PM-ruled 2026-09-17,
 * option (a), on the brief CUL-1039's handoff asked for.
 *
 * IT IS A TYPO CATCHER, NOT A CLINICAL LIMIT, and the distinction governs the copy
 * (`windowRefusalLine`'s ceiling arm says what Culprit RECORDS, never what a trial
 * should be — asserted in its test, not just intended here).
 * `changeTrialWindow` bounds only at `PG_INT4_MAX` — the column's own bound — and
 * deliberately left the product number here, because a value the write path
 * invented would be a clinical judgment made by a predicate.
 *
 * WHY A CEILING AT ALL, given D3a. Forward-only makes a typo UN-CORRECTABLE: a
 * fat-fingered `840` where the owner meant `84` writes a 2.3-year elimination
 * window, the card reads *Day 53 of 840*, the report renders it as the prescribed
 * window, and the only path back down is `Replace the trial` — which ends the
 * episode and splits the record, costing exactly the continuity TE-1 exists to
 * protect. D3 ruled forward-only knowingly; this is where that ruling's cost lands,
 * and the sheet is the only surface that can stop it.
 *
 * WHY 365 AND NOT LOWER. Past a year a "trial" is a permanent diet, which is a
 * different thing with a different ending — so the bound can be stated without the
 * app asserting how long a trial may clinically run (TE-5/TE-7). A tighter bound
 * (26 weeks was the alternative) would refuse a long window a vet actually named.
 */
export const WINDOW_MAX_DAYS = 365;

/** One chip. `days` is a TOTAL; `isCurrent` marks the window the trial has now. */
export interface WindowOption {
  /** The trial's whole length if this chip is chosen. */
  days: number;
  /** "12 weeks", or "53 days" for a total that is not whole weeks. */
  label: string;
  /** The window's last day, 'YYYY-MM-DD'. Null when `startDayKey` is unparseable. */
  endDayKey: string | null;
  /**
   * The window the trial has right now — present and marked on EVERY open, so
   * "leave it alone" is an explicit option rather than the Cancel button (§4.2,
   * and the filter-UX rule that a default is an option).
   *
   * It is the one option that may sit at or below the forward floor, and it is
   * never submittable. Choosing it is the owner saying "nothing changes", which
   * `saveStateFor` renders as a stated reason rather than a silent no-op write.
   */
  isCurrent: boolean;
}

export interface WindowOptionsInput {
  /** `diet_trials.target_duration_days` as stored. */
  currentTargetDays: number;
  /** The trial's day counter — `getDietTrialProgress().dayCounter`. */
  dayCounter: number;
  /** The trial's first day, 'YYYY-MM-DD'. */
  startDayKey: string;
}

/**
 * The forward floor a new total must strictly clear — `max(currentTarget, dayCounter)`.
 *
 * MIRRORED FROM `changeTrialWindow`, AND THE SAME QUESTION, SO IT IS A MIRROR AND
 * NOT A SECOND CONSTANT (C-34). Both ask "what is the lowest total that is a real
 * forward move for this trial today", and the write path reads it from the record
 * while the sheet reads it from the hydrated card. Where they disagree the record
 * wins, which is why the predicate keeps its own SELECT and this one is the
 * courtesy that stops the owner meeting a refusal they could have been shown.
 *
 * Each half earns its place: above the current TARGET closes §5.2's laundering
 * path; above the current DAY is the binding half in overrun (day 61 of 56), where
 * the target alone would permit a window that leaves the card in the state it was
 * opened from.
 */
export function windowFloorDays(input: {
  currentTargetDays: number;
  dayCounter: number;
}): number {
  const target = Number.isFinite(input.currentTargetDays)
    ? Math.floor(input.currentTargetDays)
    : 0;
  const day = Number.isFinite(input.dayCounter) ? Math.floor(input.dayCounter) : 0;
  return Math.max(target, day);
}

/** "12 weeks" for whole weeks; "53 days" otherwise. Days is the honest unit for a
 *  total that is not a whole number of weeks — rounding 53 to "8 weeks" would print
 *  the same label as the 56 it is not. */
export function windowLabel(days: number): string {
  const whole = Math.floor(days);
  if (whole % 7 === 0) {
    const weeks = whole / 7;
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  return whole === 1 ? '1 day' : `${whole} days`;
}

/**
 * The chips, in ascending order of total.
 *
 * FORWARD-ONLY IS AN ABSENCE, NOT A DISABLED CHIP (TE-3). The spine says the sheet
 * "offers no total at or below the current window", so a backward total is not
 * rendered dimmed with an explanation — it is not on the sheet. A dimmed chip is a
 * control that exists and is unavailable (C-7), and a total the product has ruled
 * out is neither. The refusal copy below is for the ONE path that can still
 * produce a backward number: free entry, where the owner types it.
 *
 * The current window is the exception and is always included — see `isCurrent`.
 */
export function windowOptionsFor(input: WindowOptionsInput): WindowOption[] {
  const floor = windowFloorDays(input);
  const current = Number.isFinite(input.currentTargetDays)
    ? Math.floor(input.currentTargetDays)
    : 0;

  const totals = new Set<number>(
    WINDOW_LADDER_DAYS.filter((d) => d > floor && d <= WINDOW_MAX_DAYS),
  );
  // Unconditional, and BEFORE the sort, so the current window keeps its place in
  // the ladder rather than appearing at an end. It can coincide with a ladder
  // member (56 is both), which is what the Set is for.
  if (current > 0) totals.add(current);

  return [...totals]
    .sort((a, b) => a - b)
    .map((days) => ({
      days,
      label: windowLabel(days),
      endDayKey: trialEndDayKey(input.startDayKey, days),
      isCurrent: days === current,
    }));
}

/**
 * One option, for a total that is not on the ladder — the free-entry path.
 *
 * Exists so free entry gets the SAME end date the chips get, through the same
 * code, rather than the sheet deriving one for itself. The end date is null above
 * the ceiling by design: a date rendered beside a refusal is a window the app has
 * just said it will not record.
 */
export function windowOptionFor(args: {
  days: number;
  startDayKey: string;
  currentTargetDays: number;
}): WindowOption | null {
  const days = Math.floor(args.days);
  if (!Number.isFinite(args.days) || days < 1) return null;
  return {
    days,
    label: windowLabel(days),
    endDayKey: days <= WINDOW_MAX_DAYS ? trialEndDayKey(args.startDayKey, days) : null,
    isCurrent: days === Math.floor(args.currentTargetDays),
  };
}

/** True when the ladder offered nothing forward and free entry is the only way on.
 *  Reachable on a long-overrun trial (day 200 of 112): every preset is behind the
 *  day counter, so the sheet must say so rather than render one lonely marked chip
 *  and no way forward (Principle 5 — an empty state is a feature). */
export function ladderIsExhausted(options: WindowOption[]): boolean {
  return options.every((o) => o.isCurrent);
}

// ── The end-date line (§4.2) ──────────────────────────────────────────────────

/**
 * "12 weeks — ends 17 October." plus, on a forward move, "That is 28 more days
 * than the window you set."
 *
 * THE END DATE IS THE THING THE OWNER PLANS AROUND, which is why §4.2 requires it
 * on every option and `durationHelperLine` already names a date rather than a day
 * count on the start form. `trialEndDayKey` / `formatTrialEndDate` do the math —
 * there is no new date arithmetic in this track.
 *
 * The second sentence is the delta, stated ONCE, as a consequence rather than as
 * an input (TE-2). It is also the free-entry legibility beat: a typed `840` renders
 * "120 weeks — ends 12 January 2029. That is 784 more days than the window you
 * set.", which is where an absurd number becomes visible — in the line the design
 * already requires, so `Save` stays confirm-free (§4.2).
 */
export function windowSummaryLines(args: {
  option: WindowOption;
  currentTargetDays: number;
  now?: Date;
}): string[] {
  const { option, currentTargetDays } = args;
  const now = args.now ?? new Date();
  const end = option.endDayKey ? formatTrialEndDate(option.endDayKey, now) : null;
  const lines: string[] = [
    end ? `${option.label} — ends ${end}.` : `${option.label}.`,
  ];
  const extra = Math.floor(option.days) - Math.floor(currentTargetDays);
  if (extra > 0) {
    lines.push(
      `That is ${extra === 1 ? '1 more day' : `${extra} more days`} than the window you set.`,
    );
  }
  return lines;
}

// ── The refusals (§4.2, D3a) ─────────────────────────────────────────────────
//
// PHRASED FROM STRUCTURED FIELDS, NEVER FROM A THROWN MESSAGE. `TrialWindowRefused`
// carries `reason` / `requestedDays` / `floorDays` / `currentTargetDays` /
// `dayCounter` precisely so the sheet can build its own sentence, and
// `guards/ownerFacingCopy.test.ts` fails the build on a display sink reading a
// string off an error — `message` is a diagnostic (CUL-1039's handoff, point 2).
//
// THERE ARE TWO SENTENCES AND THE REASON CODE IS NOT WHAT TELLS THEM APART. The
// write path returns one `not_forward` for both, so the sheet compares the typed
// total against the two halves of the floor itself: below the day counter is "we
// are already past that day", below the stored window is "that is shorter than the
// window you set". They are different facts and an owner who typed 40 on day 53 of
// 56 is wrong in a different way than one who typed 50.

export interface RefusalInput {
  /** The total the owner typed. */
  requestedDays: number;
  currentTargetDays: number;
  dayCounter: number;
  petName: string;
}

/**
 * Why this total cannot be saved — or null when it can.
 *
 * ORDER IS LOAD-BEARING: the ceiling is checked before the floor so a typed `0`
 * is answered by the floor (the owner's real mistake) and a typed `9999` by the
 * ceiling, and the day counter is checked before the stored window because in
 * overrun the day counter is the binding half and naming the window there would
 * quote a number the trial has already passed.
 */
export function windowRefusalLine(input: RefusalInput): string | null {
  const requested = Math.floor(input.requestedDays);
  const day = Math.floor(input.dayCounter);
  const target = Math.floor(input.currentTargetDays);
  const name = input.petName || 'your pet';

  if (!Number.isFinite(input.requestedDays) || requested < 1) {
    return 'Enter the trial’s whole length in days.';
  }
  if (requested > WINDOW_MAX_DAYS) {
    // No clinical claim: what Culprit records, not what a trial should be.
    return `Culprit records a trial up to ${WINDOW_MAX_DAYS} days. For longer than that, your vet is the best call.`;
  }
  if (requested <= day) {
    return `${name} is already on day ${day}.`;
  }
  if (requested <= target) {
    return `That is shorter than the ${target}-day window you set. To end this trial and start a new one, use Replace the trial.`;
  }
  return null;
}

/**
 * The sentence for a write the PREDICATE refused — the arms the sheet's own gate
 * could not have known about.
 *
 * IT TAKES FIELDS, NOT THE ERROR. `TrialWindowRefused` lives in
 * `lib/dietTrialSetup.ts`, whose `./sync` edge throws at load without the Expo env,
 * and this module is imported by the pure card resolver (C-26). Taking the fields
 * also makes the shape of the contract visible: `message` is a diagnostic and never
 * reaches a display sink (`guards/ownerFacingCopy.test.ts`).
 *
 * THE FOUR ARMS ARE FOUR DIFFERENT FACTS, and three of them mean the CARD IS STALE
 * rather than that the owner did something wrong:
 *
 *   • `not_forward` — the row's window already meets or beats what was asked. The
 *     sheet gates against the hydrated card; a sync that landed between the open
 *     and the Save is exactly this. Re-uses the two live sentences, off `dayCounter`
 *     and `currentTargetDays`, so the wording is the field's wording;
 *   • `not_running` — the trial was ended, here or on another device;
 *   • `not_found` — the row is gone;
 *   • `out_of_range` — the column's own int4 bound. Unreachable behind
 *     `WINDOW_MAX_DAYS`, and stated anyway rather than left to a fallthrough,
 *     because an arm with no sentence is how a silent failure ships.
 */
export function windowRefusedLine(input: {
  reason: 'not_found' | 'not_running' | 'not_forward' | 'out_of_range';
  requestedDays: number;
  currentTargetDays: number | null;
  dayCounter: number | null;
  petName: string;
}): string {
  const name = input.petName || 'your pet';
  switch (input.reason) {
    case 'not_forward': {
      const line = windowRefusalLine({
        requestedDays: input.requestedDays,
        currentTargetDays: input.currentTargetDays ?? 0,
        dayCounter: input.dayCounter ?? 0,
        petName: name,
      });
      // Null means the total WAS forward of the fields we were handed, which only
      // happens when they are absent — so it falls back to the stale-card sentence
      // rather than reporting success on a write that did not happen.
      return line ?? `${name}’s trial has a different window now. Have a look and try again.`;
    }
    case 'not_running':
      return `${name}’s trial has ended, so its window cannot change.`;
    case 'not_found':
      return `Culprit could not find that trial. Pull down to refresh and have another look.`;
    case 'out_of_range':
      return `Culprit records a trial up to ${WINDOW_MAX_DAYS} days. For longer than that, your vet is the best call.`;
    default: {
      // Exhaustive: a new refusal reason fails to compile here rather than
      // silently inheriting another arm's sentence.
      const _exhaustive: never = input.reason;
      return _exhaustive;
    }
  }
}

// ── `Save` (§4.2) ────────────────────────────────────────────────────────────

/**
 * Whether `Save` can fire, and — when it cannot — the reason, stated.
 *
 * `disabled` IS THE RIGHT CLAIM HERE AND THE REASON IS ALWAYS RENDERED (C-7). A
 * control that exists and is unavailable is exactly what this is, on every arm:
 * the owner has a `Save` in front of them and it is waiting on something. So the
 * reason is never a dimmed button on its own — the caller draws `reason` beside it.
 *
 * The no-change arm is the one worth naming: picking the current window is a
 * legitimate answer ("leave it alone"), and answering it with a stated line beats
 * either a silent no-op write — which would stamp `target_duration_set_at` and make
 * every downstream reader say the window moved when it did not — or a refusal that
 * implies the owner did something wrong.
 */
export function saveStateFor(input: {
  /** The chosen total, or null while nothing is chosen. */
  selectedDays: number | null;
  currentTargetDays: number;
  dayCounter: number;
  petName: string;
}): { canSave: boolean; reason: string | null } {
  if (input.selectedDays === null) {
    return { canSave: false, reason: null };
  }
  if (Math.floor(input.selectedDays) === Math.floor(input.currentTargetDays)) {
    return { canSave: false, reason: 'That is the window you have now.' };
  }
  const refusal = windowRefusalLine({
    requestedDays: input.selectedDays,
    currentTargetDays: input.currentTargetDays,
    dayCounter: input.dayCounter,
    petName: input.petName,
  });
  return refusal ? { canSave: false, reason: refusal } : { canSave: true, reason: null };
}

// ── The card's line after the change (§4.3) ──────────────────────────────────

/**
 * "The window now runs to 17 October." — or null.
 *
 * ONE LINE, FOR THE REST OF THE DAY THE WINDOW MOVED, AND NO LONGER. §4.3 and the
 * mock both draw the rejected version explicitly ("Nice work — 31 days to go.
 * You've got this!"), so there is no ambiguity: no cheer, no `!`, no countdown, no
 * coverage restated beside it (TE-7). The bar retreating from 95% to 63% is the
 * truth and is not dressed as a setback.
 *
 * THE COMPARISON IS LOCAL DAY TO LOCAL DAY, PARSED ON BOTH SIDES (C-40). The stamp
 * is written by `changeTrialWindow` as `toISOString()` (`…T04:00:00.000Z`) and
 * comes back from PostgREST as `…T04:00:00+00:00`; the two are the same instant and
 * differ as text, so neither side is ever compared as a string. Going through a
 * local day key rather than a millisecond bound is what makes "the rest of that
 * day" mean the owner's own calendar day (the `getDietTrialProgress` boundary), and
 * it is a day-EQUALITY test rather than an elapsed-time one for the same reason.
 */
export function windowMovedTodayLine(args: {
  /** `diet_trials.target_duration_set_at`, in either ISO spelling. Null = never moved. */
  targetDurationSetAt: string | null | undefined;
  /** The window the trial has now. */
  currentTargetDays: number;
  startDayKey: string;
  nowMs: number;
}): string | null {
  const { targetDurationSetAt } = args;
  if (!targetDurationSetAt) return null;
  if (!Number.isFinite(args.nowMs)) return null;

  const movedAt = new Date(targetDurationSetAt);
  if (Number.isNaN(movedAt.getTime())) return null;
  const now = new Date(args.nowMs);
  if (toLocalDayKey(movedAt) !== toLocalDayKey(now)) return null;

  const endDayKey = trialEndDayKey(args.startDayKey, args.currentTargetDays);
  if (!endDayKey) return null;
  // Guard against a stamp from a window that has already ended: the line is
  // present-tense about a window that "now runs to" a date, and a date in the past
  // is not something a window runs to.
  const end = dayKeyToLocalDate(endDayKey);
  if (!end || toLocalDayKey(end) < toLocalDayKey(now)) return null;

  const formatted = formatTrialEndDate(endDayKey, now);
  return formatted ? `The window now runs to ${formatted}.` : null;
}
