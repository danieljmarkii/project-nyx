import { create } from 'zustand';
import { commitRoutine, commitSymptom, destructiveConfirm, selectChip } from '../lib/haptics';
import { reverseLoggedEvent } from '../lib/undoLog';
import { forgetFlaggedFoodInTrial } from '../lib/trialContaminant';
import { useEventStore } from './eventStore';
import type { IntakeRating } from '../components/log/IntakeChipRow';
import type { DoseAdherence } from '../components/log/AdherenceChipRow';
import type { DoseVehicle, DoubleDoseResult } from '../lib/medications';
import type { LogTimeTrialFlag } from '../lib/trialContaminant';
import type { LoggedRecord } from '../lib/completionCard';

// The earned completion surface, played after a successful log on any path so
// the fastest taps get the same closure as the full flow (B-063). One store
// drives two presentations (B-064):
//
//   - 'named' — the R1 NAMED CARD (CUL-606): the warmed bottom card, over a
//     dimmed Home, for every full-screen commit that isn't a meal or a dose —
//     symptom logs and weight checks. It speaks the record's own sentence
//     ("Vomit · found by 5:33 PM", "Weight · 12.4 lbs") derived through
//     lib/completionCard, plus "Saved to {pet}'s record", and carries Change
//     time. Tone-aware per the Designer decision (2026-06-07):
//       · 'celebrate' — the warm-gold beat. For routine / non-symptom logs,
//         where confirming the act of tracking is a small reward.
//       · 'calm' — the same mark WITHOUT the festive gold, for symptom logs
//         (vomit, diarrhea, lethargy, itch) and weight checks: we acknowledge
//         the log quietly and never celebrate a worrying event, and a weight is
//         never a number to congratulate (Principle 4; the Calm/Oura bar).
//     Rendered by <NamedCompletionCard/>.
//
//     THIS REPLACED THE FULL-SCREEN WHITE TAKEOVER (the old 'beat' payload +
//     <CompletionMoment/>, retired 2026-08-23). That surface flashed the entire
//     screen solid white for 1.4s and blocked input — a camera flash for the
//     owner logging a 2am vomit one-handed in a dark bedroom, and the single
//     worst moment in Jordan's capture brief. It also threw away the sentence:
//     the app knew exactly what it had saved and said "Logged".
//
//   - 'meal' — a NON-BLOCKING warmed bottom card that carries the same gold
//     warmth PLUS the meal follow-ups: the optional WSAVA intake chip row and a
//     subtle "Change time" affordance. This replaces the old standalone post-log
//     toast so a meal log is ONE warm surface, not a full-screen beat chased by a
//     separate toast (B-064). Rendered by <MealCompletionCard/>.
//
//   - 'medication' — the dose sibling of 'meal' (B-117 PR 3): the same warmed
//     bottom card carrying the adherence chip row (given / partial / missed /
//     refused) as the confirm-over-entry follow-up to a one-tap dose log.
//     Rendered by <MedicationCompletionCard/>.
//
// All three presentations are interactive bottom cards; none of them takes the screen.
// "Intake is not preference" is preserved end to end — intake stays optional,
// default-null, never pre-stamped, captured at peak recall. B-064 changed the
// carrier surface, NOT the capture; B-014's three Designer conditions carry over
// unchanged (skippable, default-null, visually subordinate to the logged act).
export type MomentTone = 'celebrate' | 'calm';

export interface NamedPayload {
  kind: 'named';
  tone: MomentTone;
  eventId: string;
  // The pet this record was written for, captured at log time (immutable) — the
  // same reason MealPayload carries it. The card names THIS pet in "Saved to
  // {pet}'s record", never a re-read active pet: a queue-then-switch would
  // otherwise print another animal's name on a card about this one.
  petId: string;
  // ISO UTC of the logged event's occurred_at.
  occurredAt: string;
  // What was written — structured, never a pre-composed display string, so no
  // log path can hand this card a bare "Logged". The sentence is derived from it
  // through lib/completionCard → lib/logCopy → describeOccurredAt (§5's sentence
  // rule; see that module's header for why the shape is the enforcement).
  record: LoggedRecord;
  // WEIGHT ONLY (CUL-641) — the `pets.weight_kg` snapshot this reading displaced
  // when it was written, captured at the log site from the write-time pet.
  //
  // It lives here and NOT on `LoggedRecord` deliberately: that type is the
  // sentence source and carries only what the ROW says (CUL-606's shape rule), and
  // a displaced denormalized snapshot is a side-effect ledger, not part of the
  // record. Putting it there would also make it reachable by
  // `summarizeLoggedRecord`, which has no business knowing it.
  //
  // Undo needs it because on a first-ever weigh-in there is no remaining reading
  // to reconcile to, and the profile weight this log overwrote is the only correct
  // answer. ABSENT and `null` mean different things — absent is "nobody knows",
  // `null` is "it was genuinely unset" — so this is read with an explicit
  // `undefined` check, never `?? null`.
  previousSnapshotKg?: number | null;
}

export interface MealPayload {
  kind: 'meal';
  eventId: string;
  // The pet this meal was logged for, captured at log time (immutable). Carried so
  // the "+ gave a med with this" combo (B-156 PR B2b) can bind its linked dose to the
  // SAME pet as the meal — the migration-023 same-pet trigger requires it — using the
  // meal's pet rather than a re-read active pet that could have been switched (the
  // multi-pet wrong-pet guard, queue-then-switch edge).
  petId: string;
  // ISO UTC of the logged event's occurred_at.
  occurredAt: string;
  // food_items.food_type of the just-logged food, or null if unclassified.
  // Drives whether the intake chip row renders — 'meal' and 'treat' get it
  // (B-014; treats added 2026-05-23). 'other' and null opt out.
  foodType: 'meal' | 'treat' | 'other' | null;
  // Brand + product of the just-logged food, surfaced as a one-glance reminder
  // of what was logged. Optional/nullable: unnamed foods fall back to "Logged".
  foodBrand?: string | null;
  foodProductName?: string | null;
  // B-568 — food_items.format of the just-logged food. Brand + product do NOT identify
  // a food: a prescription line stocked wet and dry shares both, so the confirmation
  // could not name which one it had just recorded. Optional/nullable like the pair above.
  foodFormat?: string | null;
  // In-flight intake rating. Starts null; updated optimistically via
  // patchIntakeRating when the owner taps a chip.
  intakeRating: IntakeRating | null;
  // B-351 slice 4 / B-693 — the Tier-2 log-time trial heads-up, resolved by
  // evaluateMealLogTimeFlag AFTER the meal was committed and patched in at show
  // time. One of two kinds (the union): the CONTENTS flag ("this has chicken")
  // stays passive prose, and the MEMBERSHIP flag ("this isn't on the trial list",
  // B-693) adds one affordance — the "+ Add to the trial list" line into the
  // shipped confirm sheet. Absent/null means nothing to say, which is NEVER an
  // all-clear: the evaluator returns null for every uncertainty too (offline,
  // unread panel, no trial, stale trial), so the card must not — and does not —
  // render any negative form. Neither kind ever gates the log (Principle 1 — the
  // log stays one tap; the meal is already saved before this resolves).
  trialFlag?: LogTimeTrialFlag | null;
}

export interface MedicationPayload {
  kind: 'medication';
  eventId: string;
  // The pet + drug this dose was written for, captured at log time (immutable) — the
  // same reason MealPayload carries petId. Both are needed to RE-RUN the §6.4
  // double-dose check when the owner changes adherence ON the card: the detector is
  // keyed on (pet, drug, given), so a downgrade off 'given' must be able to CLEAR a
  // note the card is already showing, rather than leave it standing over a dose the
  // owner just said was missed. medicationItemId is null for a free-text regimen's
  // dose (no library item to group siblings on) — the check simply can't fire there.
  petId: string;
  medicationItemId: string | null;
  // ISO UTC of the logged dose's occurred_at.
  occurredAt: string;
  // The OWNER-FACING drug name for the card's "Logged · {drug}" line — a one-glance
  // reminder of what was logged. Resolved at the call site through drugDisplayName
  // (B-171: brand when present, generic otherwise), so this field carries a
  // display-ready string, exactly like pairedFoodName below — the card renders it and
  // never re-derives a name.
  drugName: string;
  // In-flight adherence. Unlike intake (which starts null), a one-tap dose log
  // starts 'given' — the owner's affirmative tap = "I gave this dose." Updated
  // optimistically via patchAdherence when the owner downgrades on the card.
  adherence: DoseAdherence | null;
  // In-flight dose vehicle (B-156 Slice B). Starts null — the one-tap path doesn't
  // ask, and an unrecorded vehicle is a clean NULL (it's descriptive, never inferred).
  // Optionally set via patchHowGiven when the owner taps the card's vehicle chips.
  // For a combo dose (B-156 PR B2b) it starts at the vehicle inferred from the food
  // (in_food / in_treat), pre-selected on the card for the owner to confirm or change.
  howGiven: DoseVehicle | null;
  // B-156 Slice C (the combo) — when this dose was logged WITH a meal/treat (the
  // "+ gave a med with this" path), the co-logged food's display name, so the
  // completion card frames it as "Logged together · {drug} · with {food}" — the link
  // made legible. Absent/null for a standalone dose, which renders the normal
  // "Logged · {drug}" header. Display-only context; the authoritative link lives on
  // the dose's paired_event_id (written by insertMedicationDose), not here.
  pairedFoodName?: string | null;
  // B-156 PR B3 — the linked vehicle's intake rating at log time (the WSAVA scale,
  // refused/picked/some/most/all), or null for a standalone dose / unrated vehicle.
  // Typed loosely as the stored TEXT (not the IntakeRating union) because it's a raw
  // snapshot of meals.intake_rating, consumed only through the garbage-safe
  // isComboDoseInDoubt — a stray/legacy value can never fabricate an in-doubt state.
  // The card derives the IN-DOUBT state from this + adherence: a refused/picked vehicle
  // with a null adherence sharpens the prompt to "Did {pet} still get it?" and never
  // pre-lights a 'given'. Authoritative vehicle truth is re-read live at the resurface
  // surfaces (History row + detail note); this is the snapshot the card uses.
  vehicleIntake?: string | null;
  // B-157 (CUL-284) — the §6.4 double-dose check for THIS dose, resolved by
  // getDoubleDoseFlag AFTER the dose was committed and patched onto the card that is
  // already showing (the meal card's trialFlag shape). Absent/null means the check
  // has not resolved, or found nothing — which is NEVER an all-clear: the detector
  // deliberately UNDER-fires (a wide-gap double on a sparse schedule is not flagged;
  // see lib/medications.ts), so the card must not — and does not — render any
  // negative "no repeat" form. Purely informational and non-blocking: the dose is
  // already saved, the note asks nothing, and its durable home is the dose's detail
  // screen, which recomputes it on every focus.
  doubleDose?: DoubleDoseResult | null;
}

export type MomentPayload = NamedPayload | MealPayload | MedicationPayload;

interface ShowOpts {
  delayMs?: number;
  durationMs?: number;
}

/**
 * What `undo()` did, so a card can tell a real failure from a no-op.
 *
 * 'removed'  — the event is soft-deleted; the card is showing its removal line.
 * 'failed'   — the local write threw. The card is unchanged and the caller owes
 *              the owner a word (a silent no-op here would read as "removed").
 * 'ignored'  — nothing to undo (no card, already removed, a second tap racing
 *              the first). NOT a failure, and must never surface an error.
 */
export type UndoResult = 'removed' | 'failed' | 'ignored';

interface MomentState {
  visible: boolean;
  payload: MomentPayload | null;
  // CUL-612 — the card has been undone and is showing its removal line instead of
  // its confirmation. Reset by present(), so it describes THIS card only.
  removed: boolean;
  // The R1 named card (CUL-606) — symptom logs + weight checks. Takes the
  // RECORD, not a sentence: the card derives what it says (§5's sentence rule).
  showNamed: (payload: Omit<NamedPayload, 'kind'>, opts?: ShowOpts) => void;
  // Warmed bottom card carrying intake + "Change time" (meal / treat logs, B-064).
  showMeal: (payload: Omit<MealPayload, 'kind'>, opts?: ShowOpts) => void;
  // Warmed bottom card carrying the adherence chip row (dose logs, B-117 PR 3).
  showMedication: (payload: Omit<MedicationPayload, 'kind'>, opts?: ShowOpts) => void;
  hide: () => void;
  // CUL-612 — reverse the log this card is announcing: soft-delete the event, drop
  // it from Today, and swap the card to its removal line for a short read.
  //
  // It lives HERE rather than in the three cards for the same reason the commit
  // haptic lives in present(): a future log path should inherit Undo by virtue of
  // showing a card at all, and the invariants below should be stated once.
  //
  // TAKES THE EVENT ID THE CARD RENDERED, and refuses if it is no longer the one
  // on screen — the same contract patchTrialFlag and patchDoubleDose carry, for
  // the same reason, and this is the action that most needs it. `present()` swaps
  // the payload IN PLACE, so a second log completing between the paint the owner
  // is looking at and the touch-up that fires would otherwise delete the row that
  // replaced it: an irreversible action against a record the owner never saw.
  // Found by the access-control red-team, which noted this was the only unguarded
  // action in a store that guards every patch.
  undo: (eventId: string) => Promise<UndoResult>;
  // Mutates the in-flight card's occurredAt after a "Change time" edit so the
  // card reflects the new time before dismissing. All three cards carry a
  // "Change time" backfill affordance (the dose card gained it to match the meal
  // card; the named card gained it when it replaced the takeover, which offered
  // none at all).
  patchOccurredAt: (occurredAt: string) => void;
  // Re-states the NAMED card's record after a time edit that legitimately moved
  // the B-010 columns. No-op on the other payloads.
  patchRecord: (record: LoggedRecord) => void;
  // Mutates the in-flight MEAL card's intakeRating after a chip tap. Pair with
  // rescheduleHide() for a visible confirmation window. No-op on a beat payload.
  patchIntakeRating: (rating: IntakeRating | null) => void;
  // B-351 slice 4 — land the trial-contaminant heads-up on a card that is ALREADY
  // showing. The card fires the instant the meal is written; the check (which may
  // need one network round-trip on a cold cache) patches in when it resolves, so
  // nothing about the log path ever waits on it. Guarded by eventId: a second log
  // during the wait replaces the payload, and a late answer for the PREVIOUS meal
  // must not decorate the new one. Returns whether it landed, so the caller only
  // spends rule 3's one-per-food budget on a heads-up actually rendered. Takes
  // either kind of the log-time union (contents or membership, B-693).
  patchTrialFlag: (eventId: string, flag: LogTimeTrialFlag) => boolean;
  // Mutates the in-flight MEDICATION card's adherence after a chip tap. Pair with
  // rescheduleHide() for a visible confirmation window. No-op on other payloads.
  patchAdherence: (adherence: DoseAdherence | null) => void;
  // Mutates the in-flight MEDICATION card's vehicle (how_given) after a chip tap.
  // null clears it (optional row). Pair with rescheduleHide(). No-op on other payloads.
  patchHowGiven: (howGiven: DoseVehicle | null) => void;
  // B-157 (CUL-284) — land the §6.4 double-dose check on a medication card that is
  // ALREADY showing (the patchTrialFlag shape). Takes the WHOLE result, not just a
  // conflict, because this is also the CLEAR path: re-running the check after the
  // owner downgrades adherence off 'given' returns a no-conflict result, and patching
  // that is what retires a note the card is already showing. Extends the dwell itself
  // on a conflict — see MEDICATION_FLAGGED_DURATION_MS. Returns whether it landed.
  //
  // THREE preconditions, all of them load-bearing:
  //   • eventId — a late answer for the PREVIOUS dose must never decorate the dose
  //     that replaced it.
  //   • visible — a dismissed card is not patched (no safety prose during the fade).
  //   • computedForAdherence — the adherence the result was computed AGAINST must
  //     still be the one on the card. Every caller fires an independent async read, so
  //     two quick chip taps have two rechecks in flight with no ordering guarantee
  //     between them; without this, a Given→Missed pair whose reads resolve out of
  //     order leaves the CONFLICT note standing over a dose the owner just marked
  //     missed — a false claim about the record, and the exact staleness this whole
  //     recompute path exists to prevent. Rejecting the mismatch is safe because the
  //     tap that caused it fired its own recheck, and that one carries the truth.
  patchDoubleDose: (
    eventId: string,
    result: DoubleDoseResult,
    computedForAdherence: DoseAdherence | null,
  ) => boolean;
  // Reschedules the hide timer to fire `durationMs` from now — used to hold the
  // meal card open ~1.5s after a chip tap so the selection is confirmed visibly.
  // While the dwell is PAUSED this banks the duration instead of arming a timer
  // (see pauseDwell), so a chip's confirm hold cannot restart the clock under the
  // owner's own finger.
  rescheduleHide: (durationMs: number) => void;
  // CUL-614 / §5 "Dwell" — the auto-dismiss stops while the owner is touching the
  // card, and any interaction resets it. Called from the card's root touch handlers,
  // never from a press handler: the point is to cover the whole gesture, including
  // the reading pause between two chip taps.
  pauseDwell: () => void;
  resumeDwell: () => void;
}

// Named-card dwell. The retired white takeover held 1.4s — right for a terminal,
// non-interactive flash, wrong for this card: it carries a sentence to read and a
// "Change time" affordance to reach, so it takes the meal card's interactive
// window. The two numbers are the same for the same reason, and neither is a
// "moment" cap any more — the 2s earned-moment ceiling governed a surface that
// OWNED the screen. This one doesn't (see NamedCompletionCard: the scrim is
// pointerEvents="none", Home stays live underneath), so the dwell is sized by
// what there is to do, not by how long the app may hold the owner hostage.
const NAMED_DURATION_MS = 5000;
// Meal-card dwell: longer because it's interactive — the owner needs time to
// read the five WSAVA labels and tap deliberately before it auto-dismisses
// (mirrors the retired toast's 5s window).
const MEAL_DURATION_MS = 5000;
// Meal-card dwell when a B-351 trial-contaminant heads-up is riding along: the
// same card now carries two more lines of prose that the owner has not seen
// before and cannot get back by tapping (the note is passive by design). 7s reads
// them at a calm pace without turning a completion beat into a modal. Applied in
// showMeal rather than at each call site so a future meal-entry path cannot ship
// a flagged card that flashes past — the same can't-forget reasoning that puts
// every meal path through showMeal in the first place.
export const MEAL_FLAGGED_DURATION_MS = 7000;
// Medication-card dwell: same rationale as the meal card — interactive (the
// adherence chip row needs reading + a deliberate tap before auto-dismiss).
const MEDICATION_DURATION_MS = 5000;
// Medication-card dwell once the B-157 double-dose note is riding along: the card now
// carries a line of safety prose the owner has not seen before and cannot get back by
// tapping (the note is passive by design; its durable home is the dose detail screen).
// 7s reads it at a calm pace without turning a completion beat into a modal — the same
// number, for the same reason, as MEAL_FLAGGED_DURATION_MS.
//
// Applied INSIDE patchDoubleDose rather than at each call site, deliberately: there are
// already two card-showing dose paths (the picker and the regimen card) plus the card's
// own post-downgrade recompute, and a future third could otherwise ship a safety note
// that flashes past in 5s. Same can't-forget reasoning that puts the meal card's
// flagged duration in showMeal instead of its callers.
export const MEDICATION_FLAGGED_DURATION_MS = 7000;
// How long a fire-and-forget flag evaluation waits for the meal card to actually
// appear before giving up (see whenMealCardVisible). Sized well above the picker
// path's ~450ms reveal defer: a card that has not appeared by now was superseded
// by a newer log, and the wait resolves false so the caller skips the patch — and,
// with it, rule 3's ledger spend — rather than hang.
const CARD_REVEAL_WAIT_MS = 3000;

// How long the removal line holds after Undo (CUL-612). Deliberately SHORTER than
// any confirmation dwell: the card is now saying two words about a thing that is
// already gone, and there is nothing left on it to read, tap or answer. Long
// enough to register that the tap took effect, short enough that the reversal
// does not outstay the log it reversed.
export const REMOVED_DURATION_MS = 2400;

// ── The dwell clock (CUL-614 · §5 "Dwell") ──────────────────────────────────
// The auto-dismiss PAUSES while the owner is touching the card, and any interaction
// resets it. The problem it solves is the dose card's: nine chips (four adherence,
// four vehicle, plus the time affordance) inside a 5s window, where each tap re-armed
// only CHIP_CONFIRM_HOLD_MS — so an owner reading the labels before their second tap
// watched the card leave under their finger, and an unanswered adherence row lands
// `unconfirmed` (B-156 G1). That fail-safe is exactly right and is NOT what this
// changes: this buys the owner the time to answer, it does not change what silence
// means.
//
// It lives HERE rather than in each card for the reason the commit haptic does
// (CUL-604): the timer is the store's, so a card that grows a new control inherits
// the pause with it instead of re-deriving a rule about its own dismissal.
//
// Module-scoped, like the timers themselves — none of it is rendered, so putting it
// in the store's state would re-render three cards on every finger-down.
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
// The watchdog that force-resumes a pause whose touch-end never arrived (see below).
let pauseCeilingTimer: ReturnType<typeof setTimeout> | null = null;
// Wall-clock deadline of the armed hide, so a pause can bank what was LEFT rather
// than restart from a fixed number. null whenever no hide is armed.
let hideDeadlineAt: number | null = null;
let dwellPaused = false;
// What resumeDwell will arm: the remaining window at pause time, raised by any
// rescheduleHide that arrived while paused (a chip's confirm hold).
let bankedDurationMs = 0;

// What an interaction RESETS the dwell to. All three cards share the same 5s
// interactive dwell, so this is one number rather than a per-kind lookup; a card
// carrying a longer window (the flagged 7s) keeps it, because resumeDwell takes the
// MAX of this and what was banked — the reset is a floor, never a truncation.
const TOUCH_RESET_DWELL_MS = 5000;

// The longest a pause may hold the card open with no touch-end. A touch that begins
// on the card and ends somewhere the card never hears about — a DateTimePicker Modal
// mounting over it mid-gesture, a JS-thread stall that swallows the responder's end
// event — would otherwise strand the card on screen forever, because the hide timer
// is cleared and only resumeDwell re-arms it. Generous enough that no real reading
// pause trips it, short enough that the failure is a card that lingers rather than
// one that never leaves. The pause is a convenience; the dismissal is the contract.
const PAUSE_CEILING_MS = 20000;

function clearPauseCeiling() {
  if (pauseCeilingTimer) { clearTimeout(pauseCeilingTimer); pauseCeilingTimer = null; }
}
// Undo's synchronous re-entry latch (CUL-612). `removed` cannot do this job on its
// own: it is only set AFTER the soft-delete resolves (a reversal must never be shown
// before it has happened), which leaves an await-shaped window in which a second tap
// would issue a second delete. This latches on the first tap instead.
let undoInFlight = false;

function clearTimers() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
  clearPauseCeiling();
  // A new card (or an explicit hide) starts from a clean clock. Without this, a card
  // presented while the previous one was paused would inherit `dwellPaused` and never
  // arm a hide of its own — a finger on a dismissed card silently stranding its
  // successor.
  hideDeadlineAt = null;
  dwellPaused = false;
  bankedDurationMs = 0;
}

function clearHideTimer() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  hideDeadlineAt = null;
}

/**
 * Arm the dismiss timer — the ONLY way this module schedules a hide.
 *
 * Two things it does that a bare `hideTimer = setTimeout(...)` did not, both
 * found by the adversarial pass on CUL-612:
 *
 *   1. CLEARS FIRST. `undo()` armed the removal dwell after awaiting the write,
 *      and a chip tap landing DURING that await had already armed its own 1.5s
 *      confirm hold — so two timers ran at once. Every other caller happened to
 *      clear first; the invariant was real but unenforced, and the one path that
 *      broke it was the new one.
 *   2. Nulls the handle ONLY IF IT IS STILL OURS. This is what made (1) escalate
 *      from a redundant timer into a card being killed: the earlier timer fired,
 *      ran `hideTimer = null`, and thereby dropped the module's only reference to
 *      the LATER one. `present()`'s `clearTimers()` then found null and could not
 *      cancel it, so a stray hide from the previous card landed on a brand-new
 *      one ~1s after the owner logged it — the card simply vanished.
 *
 * Both fixes are structural rather than a patch at the call site, so a future
 * scheduling path cannot reintroduce either half.
 *
 * It also records `hideDeadlineAt` (CUL-614), which is what lets `pauseDwell` bank the
 * REMAINING window instead of restarting from a constant. Two PRs extracted this helper
 * independently and each solved a different half; the merged version keeps both, because
 * the CUL-614 half needs a deadline and the CUL-612 half needs the guarded null.
 */
function armHide(set: (partial: Partial<MomentState>) => void, durationMs: number) {
  clearHideTimer();
  // An explicit arm SUPERSEDES a pause, and saying so here is what keeps the invariant
  // "a hide is armed ⇒ the dwell is not paused" true by construction rather than by
  // coincidence. It is a no-op on every path but one: `rescheduleHide` banks and
  // returns while paused so it never reaches here, and `present()` has already cleared
  // through `clearTimers()`. The exception is `undo()`, which arms the removal dwell
  // directly — and Undo is a TAP, so `pauseDwell` has already fired on its touch-start
  // and the removal line then unmounts the handler that would have resumed it. Without
  // this, that pause outlives its card, leaving a watchdog to fire ~20s later against a
  // card that is already gone.
  clearPauseCeiling();
  dwellPaused = false;
  bankedDurationMs = 0;
  // CUL-614 — the wall-clock deadline, so `pauseDwell` can bank what was LEFT rather
  // than restart from a fixed number. Set here, in the single place a hide is armed,
  // so it cannot drift from `hideTimer`.
  hideDeadlineAt = Date.now() + durationMs;
  const mine: ReturnType<typeof setTimeout> = setTimeout(() => {
    set({ visible: false });
    // The same is-it-still-ours guard as the handle below, for the same reason: a
    // stale timer that nulled the deadline would leave the LIVE hide with no recorded
    // end, and a pause during it would bank 0. That errs toward a longer window (the
    // reset floor still applies), but it is the same class of bug as (2) above and is
    // cheaper to close than to reason about.
    if (hideTimer === mine) { hideTimer = null; hideDeadlineAt = null; }
  }, durationMs);
  hideTimer = mine;
}

// The commit haptic for a payload (CUL-604 · §5.6). Derived from the payload rather
// than passed in by the caller, so a FUTURE log path gets the right haptic by virtue
// of showing a card at all — the same can't-forget reasoning that puts the meal card's
// flagged duration in showMeal rather than at its call sites.
//
// The tone split is the whole point and is not an implementation detail: a 'calm' beat
// is what a symptom log renders, and it takes the SINGLE SOFT TAP, never the success
// double-tap. We acknowledge a 2am vomit log; we never congratulate it (Principle 4 —
// the same rule that withholds the gold glow from that beat).
//
// Meal and dose cards are routine commits by construction — there is no symptom path
// through them — so they take the success pattern.
function playCommitHaptic(payload: MomentPayload) {
  if (payload.kind === 'named' && payload.tone === 'calm') commitSymptom();
  else commitRoutine();
}

// Shared present/dismiss scheduling for both presentations. delayMs lets a
// caller dismiss its modal first so the root overlay isn't briefly occluded by
// the still-presented modal on iOS.
function present(
  set: (partial: Partial<MomentState>) => void,
  payload: MomentPayload,
  opts: ShowOpts | undefined,
  defaultDuration: number,
) {
  clearTimers();
  const delay = opts?.delayMs ?? 0;
  const duration = opts?.durationMs ?? defaultDuration;
  const reveal = () => {
    // Fired WITH the reveal, not with the call: on the picker path the reveal is
    // deferred ~450ms behind the dismissing /log modal, and a buzz half a second
    // ahead of its own card reads as a stray one. It also means a card superseded
    // before it ever appeared (a second log during the delay clears showTimer)
    // plays no haptic at all — one commit, one buzz.
    playCommitHaptic(payload);
    // `removed: false` is not housekeeping — it is what stops a superseded card's
    // removal line leaking onto the next log. A card that was undone keeps its
    // payload through the fade, so a second log arriving during that fade would
    // otherwise render its own confirmation under the word "Removed".
    set({ visible: true, payload, removed: false });
    // A new card is a new undo target, so the previous card's in-flight latch must
    // not gate it. (It also keeps the latch from leaking between tests, which a
    // bare module-level flag otherwise does.)
    undoInFlight = false;
    armHide(set, duration);
  };
  if (delay > 0) showTimer = setTimeout(reveal, delay);
  else reveal();
}

export const useMomentStore = create<MomentState>((set) => ({
  visible: false,
  payload: null,
  removed: false,
  showNamed: (payload, opts) =>
    present(set, { kind: 'named', ...payload }, opts, NAMED_DURATION_MS),
  showMeal: (payload, opts) =>
    present(
      set,
      { kind: 'meal', ...payload },
      opts,
      payload.trialFlag ? MEAL_FLAGGED_DURATION_MS : MEAL_DURATION_MS,
    ),
  showMedication: (payload, opts) =>
    present(set, { kind: 'medication', ...payload }, opts, MEDICATION_DURATION_MS),
  hide: () => {
    clearTimers();
    set({ visible: false });
  },
  undo: async (eventId) => {
    const before = useMomentStore.getState();
    const payload = before.payload;
    // Nothing to reverse, a stale target, or a second tap racing the first.
    // 'ignored', never 'failed' — a card that shows an error for a tap that did
    // nothing wrong teaches the owner that Undo is unreliable.
    if (!payload || !before.visible || before.removed || undoInFlight) return 'ignored';
    // The card that rendered this control must still be the card on screen.
    if (payload.eventId !== eventId) return 'ignored';
    undoInFlight = true;
    // Rigid, on the tap — because on this surface the tap IS the destructive
    // confirm (§5.6). The History/detail Remove withholds it until the alert's
    // confirm for the opposite reason: there, a live Cancel is still on screen.
    destructiveConfirm();
    // Hold the card open across the write. Without this, a reversal issued in the
    // last few hundred ms of the dwell could land on a card that has already
    // faded, and the owner would never see it take.
    clearHideTimer();
    try {
      // CUL-641 — a reversed weigh-in has to take `pets.weight_kg` with it, or the
      // Profile chip and the next weigh-in's pre-fill go on offering the number the
      // owner just undid. reverseLoggedEvent decides for itself whether this event
      // was a weight check; all this card contributes is the one fact only it holds
      // — what that write displaced. `!== undefined`, not `??`: a payload that
      // carried `null` is saying the pet genuinely had no weight on file, and that
      // is a value to restore, not a missing one.
      await reverseLoggedEvent(
        payload.eventId,
        payload.kind === 'named' && payload.previousSnapshotKg !== undefined
          ? { restoreWeightSnapshotToKg: payload.previousSnapshotKg }
          : undefined,
      );
    } catch (e) {
      console.error('[moment] undo failed:', e);
      undoInFlight = false;
      // Leave the card exactly as it was — including its controls — and give the
      // owner a fresh window to read the alert and try again. Showing the removal
      // line here would be the one unrecoverable lie this surface can tell: the
      // row is still in the record, and the owner has been told it isn't.
      useMomentStore.getState().rescheduleHide(NAMED_DURATION_MS);
      return 'failed';
    }
    undoInFlight = false;
    // ── GIVE THE TRIAL HEADS-UP BACK ────────────────────────────────────────
    // Rule 3 spends a food's one-per-trial budget when the panel RENDERS, and on
    // this card the panel is what prompts the Undo — the owner reads "Off the
    // trial list", realises they tapped the wrong tile, and reverses it. Leaving
    // the budget spent would mean the food is silently spoken-for on a feeding
    // that never happened, and the real feeding weeks later gets no heads-up.
    // Fire-and-forget in the same direction as the write it reverses.
    if (payload.kind === 'meal' && payload.trialFlag) {
      const { trialId, foodId } = payload.trialFlag;
      forgetFlaggedFoodInTrial(trialId, foodId).catch(console.error);
    }
    // The reversal itself is unconditional — the event is gone and should be.
    // Everything BELOW is about the card, so it only applies if this is still the
    // card that asked. A second log during the write replaced the payload, and
    // stamping 'Removed' on it would describe the wrong row (the same staleness
    // discipline patchDoubleDose applies to its own late answer).
    const after = useMomentStore.getState();
    useEventStore.getState().removeFromToday(payload.eventId);
    if (after.payload?.eventId !== payload.eventId || !after.visible) return 'removed';
    set({ removed: true });
    // armHide, not a bare setTimeout: a chip tap landing during the await above
    // may have armed its own confirm hold, and two live timers here is what the
    // adversarial pass turned into a vanished card (see armHide).
    armHide(set, REMOVED_DURATION_MS);
    return 'removed';
  },
  // ── NO PATCH LANDS ON A REMOVED CARD (CUL-612) ────────────────────────────
  // Stated once, applied to every patch below. Two of them (patchTrialFlag,
  // patchDoubleDose) arrive on their own from an async read and CANNOT be stopped
  // by unmounting a control — a trial heads-up resolving a beat after Undo would
  // decorate a meal that no longer exists, and burn that food's one-per-trial
  // ledger budget on a card nobody can act on. The rest are only reachable from
  // controls the removal line unmounts, and are guarded anyway: an invariant with
  // exceptions is one nobody can check.
  patchOccurredAt: (occurredAt) =>
    set((state) =>
      state.payload && !state.removed
        ? { payload: { ...state.payload, occurredAt } }
        : {}
    ),
  // The named card's twin of patchOccurredAt for the confidence columns: a
  // "found by" edit moves the discovery bound WITH the point (see
  // resolveNamedTimeEdit), so the card's sentence has to re-derive off the new
  // window or it would keep speaking the old one for the rest of its dwell.
  patchRecord: (record) =>
    set((state) =>
      state.payload?.kind === 'named' && !state.removed
        ? { payload: { ...state.payload, record } }
        : {}
    ),
  patchIntakeRating: (intakeRating) => {
    // The chip tick fires only when the patch actually lands on a meal card — a no-op
    // patch (wrong payload kind) must not buzz. Read outside `set` so the updater
    // stays pure, the way patchTrialFlag/patchDoubleDose already do it.
    const s = useMomentStore.getState();
    if (s.payload?.kind !== 'meal' || s.removed) return;
    selectChip();
    set((state) =>
      state.payload?.kind === 'meal'
        ? { payload: { ...state.payload, intakeRating } }
        : {}
    );
  },
  patchTrialFlag: (eventId, trialFlag) => {
    const state = useMomentStore.getState();
    if (state.payload?.kind !== 'meal' || state.payload.eventId !== eventId) return false;
    // Also require the card to still be visible — patching a dismissed card would
    // burn the food's one heads-up on something nobody saw. Same for an UNDONE one
    // (CUL-612): the meal it would describe is soft-deleted.
    if (!state.visible || state.removed) return false;
    set({ payload: { ...state.payload, trialFlag } });
    return true;
  },
  patchAdherence: (adherence) => {
    const s = useMomentStore.getState();
    if (s.payload?.kind !== 'medication' || s.removed) return;
    selectChip();
    set((state) =>
      state.payload?.kind === 'medication'
        ? { payload: { ...state.payload, adherence } }
        : {}
    );
  },
  patchHowGiven: (howGiven) => {
    const s = useMomentStore.getState();
    if (s.payload?.kind !== 'medication' || s.removed) return;
    selectChip();
    set((state) =>
      state.payload?.kind === 'medication'
        ? { payload: { ...state.payload, howGiven } }
        : {}
    );
  },
  patchDoubleDose: (eventId, doubleDose, computedForAdherence) => {
    const state = useMomentStore.getState();
    if (state.payload?.kind !== 'medication' || state.payload.eventId !== eventId) return false;
    // A dismissed card must not be patched — landing a note on it would put safety
    // prose on screen during the fade-out, or nowhere at all. Nor an UNDONE one
    // (CUL-612): a double-dose note over a dose the owner just removed is a claim
    // about a row that is no longer in the record — and the removal is itself the
    // correct response to a double, so the note has nothing left to warn about.
    if (!state.visible || state.removed) return false;
    // The result must describe the dose as it now stands (see the interface note).
    if (state.payload.adherence !== computedForAdherence) return false;
    set({ payload: { ...state.payload, doubleDose } });
    // Only a CONFLICT buys more time. The clear path (a downgrade off 'given' retiring
    // the note) must leave the chip-tap's own shorter confirm hold alone — extending
    // the dwell to read a note that just disappeared would be the opposite of calm.
    if (doubleDose.conflict) useMomentStore.getState().rescheduleHide(MEDICATION_FLAGGED_DURATION_MS);
    return true;
  },
  rescheduleHide: (durationMs) => {
    // B-157 (CUL-284) — a card carrying an unread safety note has a FLOOR on its dwell,
    // and it is enforced here rather than at the call sites.
    //
    // The adversarial pass broke the first cut on exactly this: patchDoubleDose armed
    // the 7s flagged window, and then a tap on the OPTIONAL "How was it given?" row —
    // a purely descriptive control with no knowledge of the note — called
    // rescheduleHide(1500) unconditionally and dismissed the card ~2s after the note
    // appeared. The note is ~18 words, History carries no double-dose indicator, and
    // the owner has no cue to visit the dose detail screen, so for that owner the flag
    // was simply gone. Putting the 7s inside patchDoubleDose was supposed to stop a
    // safety note flashing past; it did not, because a later, shorter reschedule wins.
    //
    // So the rule is a floor, not a set: a confirm hold may only ever LENGTHEN the
    // window while a conflict is on screen. Bounded — it re-arms from the last tap, and
    // the owner doing the tapping is engaged with the card.
    const state = useMomentStore.getState();
    const floorMs =
      state.payload?.kind === 'medication' && state.payload.doubleDose?.conflict
        ? MEDICATION_FLAGGED_DURATION_MS
        : 0;
    const next = Math.max(durationMs, floorMs);
    // CUL-614 — while the dwell is PAUSED, bank the request instead of arming it.
    // Every chip handler calls rescheduleHide(CHIP_CONFIRM_HOLD_MS) from its onPress,
    // which fires between the card's touch-start and touch-end; arming there would
    // restart a 1.5s clock underneath the owner's own finger, i.e. re-create the exact
    // bug the pause exists to fix. Banking the MAX keeps a conflict floor (or a longer
    // hold) that arrived mid-gesture from being lost at resume.
    if (dwellPaused) {
      bankedDurationMs = Math.max(bankedDurationMs, next);
      return;
    }
    armHide(set, next);
  },
  // ── §5 "Dwell": the timer stops while the owner is touching the card ──────────
  //
  // Called from the card root's onTouchStart / onTouchEnd+onTouchCancel, deliberately
  // NOT from press handlers: touch events fire for the WHOLE gesture and bubble from
  // every child, so the pause covers the reading pause between two chip taps — which
  // is where the window was actually being lost — and needs no per-control wiring.
  //
  // ONE FLAG, NOT A TOUCH COUNT — a deliberate choice, not an oversight. With two
  // fingers on the card, the first `onTouchEnd` resumes while the second is still down,
  // so the clock restarts under a resting finger. A counter would model that literally,
  // and would buy a worse failure: a single missed touch-end (the Modal case below)
  // leaks the count permanently, and every later gesture then pauses a card that can
  // never resume — the strand this design is built to avoid, made routine. The flag's
  // error is bounded and points the safe way: the owner still gets a full fresh window
  // from the release, exactly as a one-finger gesture would.
  pauseDwell: () => {
    if (dwellPaused) return; // a second finger down mid-gesture must not re-bank
    // Nothing to pause once the card is dismissing: `visible` is already false while
    // the payload lingers for the fade, and a touch landing then must not revive it.
    if (!useMomentStore.getState().visible) return;
    bankedDurationMs = Math.max(
      bankedDurationMs,
      hideDeadlineAt !== null ? Math.max(hideDeadlineAt - Date.now(), 0) : 0,
    );
    clearHideTimer();
    dwellPaused = true;
    // See PAUSE_CEILING_MS: a touch-end that never arrives must not strand the card.
    pauseCeilingTimer = setTimeout(() => {
      pauseCeilingTimer = null;
      useMomentStore.getState().resumeDwell();
    }, PAUSE_CEILING_MS);
  },
  resumeDwell: () => {
    if (!dwellPaused) return;
    dwellPaused = false;
    clearPauseCeiling();
    const banked = bankedDurationMs;
    bankedDurationMs = 0;
    // "Any interaction resets it" — the owner gets a full interactive window back from
    // the moment they lift, not the scraps of the one their gesture interrupted. MAX,
    // not assignment, so a flagged 7s window or a banked confirm hold survives; and it
    // routes through rescheduleHide so the double-dose conflict floor still applies.
    useMomentStore.getState().rescheduleHide(Math.max(banked, TOUCH_RESET_DWELL_MS));
  },
}));

/**
 * Resolve once the MEAL card for `eventId` is actually on screen — `true` when it
 * is (now, or after a deferred reveal), `false` if it was superseded or never
 * shown within `timeoutMs`.
 *
 * WHY THIS EXISTS. `patchTrialFlag` only lands on a card that is already visible —
 * that is its whole contract, and it is right: a not-yet-revealed or dismissed
 * card must never be patched, or a heads-up decorates the wrong meal / burns its
 * one-per-trial ledger budget on something nobody saw. The FAB quick-log reveals
 * the card SYNCHRONOUSLY, so its fire-and-forget flag evaluation always patches a
 * live card. The picker path (`app/log.tsx`) defers the reveal behind `delayMs` so
 * the dismissing `/log` modal doesn't occlude the card on iOS — and since B-417
 * PR 2 removed the trial context's network read, the evaluation became an all-LOCAL
 * read that resolves in a few milliseconds, i.e. BEFORE the reveal. A bare patch
 * then hit an invisible card, returned false, and the log-time trial warning was
 * silently dropped on the app's main food-logging path (the FAB never saw it,
 * having no `delayMs`). Callers await this so the patch runs the instant the card
 * is genuinely visible and never before — immediately on the FAB path, ~450ms
 * later on the picker path.
 *
 * Bounded on purpose: a second log during the wait cancels the first card's reveal
 * (`present` clears the show timer), and this must then resolve `false` rather than
 * hang — the caller skips the patch AND `noteTrialFlagShown`, so a warning nobody
 * saw can't be marked shown. `subscribe` fires on every `set`, so the deferred
 * `reveal()`'s `set({ visible: true, payload })` wakes it exactly once.
 */
export function whenMealCardVisible(
  eventId: string,
  timeoutMs = CARD_REVEAL_WAIT_MS,
): Promise<boolean> {
  return whenCardVisible('meal', eventId, timeoutMs);
}

/**
 * The MEDICATION twin of whenMealCardVisible, for B-157's log-time double-dose note
 * (CUL-284). Same contract, same reason: the picker path defers the dose card's reveal
 * behind `delayMs` to clear the dismissing /log modal on iOS, while getDoubleDoseFlag
 * is an all-LOCAL SQLite read that resolves in a few milliseconds — so a bare patch
 * would hit a not-yet-revealed card and the safety note would be silently dropped on
 * the app's main dose-logging path. The regimen-card path (profile.tsx) reveals
 * synchronously and resolves immediately.
 */
export function whenMedicationCardVisible(
  eventId: string,
  timeoutMs = CARD_REVEAL_WAIT_MS,
): Promise<boolean> {
  return whenCardVisible('medication', eventId, timeoutMs);
}

// The shared body of the two waiters above. Kept generic over the payload kind rather
// than duplicated per card: the subtle parts (arm the timeout BEFORE subscribing,
// idempotent finish, never reject) are exactly the parts a copy would get wrong.
function whenCardVisible(
  kind: 'meal' | 'medication',
  eventId: string,
  timeoutMs: number,
): Promise<boolean> {
  const isUp = (s: MomentState) =>
    s.visible && s.payload?.kind === kind && s.payload.eventId === eventId;
  if (isUp(useMomentStore.getState())) return Promise.resolve(true);
  // Never rejects, by construction: the executor has no throwing operations and
  // never calls a reject — it only ever resolves true/false. That is the contract
  // the fire-and-forget callers rely on (they await it without a catch), so keep it.
  return new Promise((resolve) => {
    let settled = false;
    let unsub = () => {};
    function finish(v: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(v);
    }
    // Scheduled before subscribe so the timeout is armed even if a subscribe
    // callback were to fire synchronously (zustand's does not, but finish() is
    // safe either way — it is idempotent and clears whichever fires second).
    const timer = setTimeout(() => finish(false), timeoutMs);
    unsub = useMomentStore.subscribe((s) => {
      if (isUp(s)) finish(true);
    });
  });
}
