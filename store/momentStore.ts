import { create } from 'zustand';
import { commitRoutine, commitSymptom, selectChip } from '../lib/haptics';
import type { IntakeRating } from '../components/log/IntakeChipRow';
import type { DoseAdherence } from '../components/log/AdherenceChipRow';
import type { DoseVehicle, DoubleDoseResult } from '../lib/medications';
import type { LogTimeTrialFlag } from '../lib/trialContaminant';

// The earned completion surface, played after a successful log on any path so
// the fastest taps get the same closure as the full flow (B-063). One store
// drives two presentations (B-064):
//
//   - 'beat' — a brief, root-mounted, full-screen, terminal/non-interactive
//     confirmation beat. Tone-aware per the Designer decision (2026-06-07):
//       · 'celebrate' — warm-gold radial glow + spring mint check. For routine /
//         non-symptom logs, where confirming the act of tracking is a small reward.
//       · 'calm' — the same spring check WITHOUT the festive gold, for symptom
//         logs (vomit, diarrhea, lethargy, itch): we acknowledge the log quietly
//         and never celebrate a worrying event (Principle 4; the Calm/Oura bar).
//     Rendered by <CompletionMoment/>.
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
// The meal/medication cards are the interactive presentations; the beat is terminal.
// "Intake is not preference" is preserved end to end — intake stays optional,
// default-null, never pre-stamped, captured at peak recall. B-064 changed the
// carrier surface, NOT the capture; B-014's three Designer conditions carry over
// unchanged (skippable, default-null, visually subordinate to the logged act).
export type MomentTone = 'celebrate' | 'calm';

interface BeatPayload {
  kind: 'beat';
  tone: MomentTone;
  // Confirmation line. Defaults to 'Logged'.
  title: string;
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

export type MomentPayload = BeatPayload | MealPayload | MedicationPayload;

interface ShowOpts {
  delayMs?: number;
  durationMs?: number;
}

interface MomentState {
  visible: boolean;
  payload: MomentPayload | null;
  // Full-screen terminal beat (non-meal logs).
  show: (payload: { tone: MomentTone; title?: string }, opts?: ShowOpts) => void;
  // Warmed bottom card carrying intake + "Change time" (meal / treat logs, B-064).
  showMeal: (payload: Omit<MealPayload, 'kind'>, opts?: ShowOpts) => void;
  // Warmed bottom card carrying the adherence chip row (dose logs, B-117 PR 3).
  showMedication: (payload: Omit<MedicationPayload, 'kind'>, opts?: ShowOpts) => void;
  hide: () => void;
  // Mutates the in-flight MEAL or MEDICATION card's occurredAt after a "Change
  // time" edit so the card reflects the new time before dismissing. Both cards
  // carry the same witnessed-point "Change time" backfill affordance (the dose
  // card gained it to match the meal card). No-op on a beat payload.
  patchOccurredAt: (occurredAt: string) => void;
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
  rescheduleHide: (durationMs: number) => void;
}

// Beat dwell: well under the 2s earned-moment cap; the gold glow blooms and
// settles inside this window so the warm color never lingers on a resting
// surface.
const BEAT_DURATION_MS = 1400;
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

// Module-scoped so a rapid second log cleanly cancels the prior timers rather
// than racing two hides.
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
}

function clearHideTimer() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
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
  if (payload.kind === 'beat' && payload.tone === 'calm') commitSymptom();
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
    set({ visible: true, payload });
    hideTimer = setTimeout(() => {
      set({ visible: false });
      hideTimer = null;
    }, duration);
  };
  if (delay > 0) showTimer = setTimeout(reveal, delay);
  else reveal();
}

export const useMomentStore = create<MomentState>((set) => ({
  visible: false,
  payload: null,
  show: (payload, opts) =>
    present(set, { kind: 'beat', tone: payload.tone, title: payload.title ?? 'Logged' }, opts, BEAT_DURATION_MS),
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
  patchOccurredAt: (occurredAt) =>
    set((state) =>
      state.payload?.kind === 'meal' || state.payload?.kind === 'medication'
        ? { payload: { ...state.payload, occurredAt } }
        : {}
    ),
  patchIntakeRating: (intakeRating) => {
    // The chip tick fires only when the patch actually lands on a meal card — a no-op
    // patch (wrong payload kind) must not buzz. Read outside `set` so the updater
    // stays pure, the way patchTrialFlag/patchDoubleDose already do it.
    if (useMomentStore.getState().payload?.kind !== 'meal') return;
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
    // burn the food's one heads-up on something nobody saw.
    if (!state.visible) return false;
    set({ payload: { ...state.payload, trialFlag } });
    return true;
  },
  patchAdherence: (adherence) => {
    if (useMomentStore.getState().payload?.kind !== 'medication') return;
    selectChip();
    set((state) =>
      state.payload?.kind === 'medication'
        ? { payload: { ...state.payload, adherence } }
        : {}
    );
  },
  patchHowGiven: (howGiven) => {
    if (useMomentStore.getState().payload?.kind !== 'medication') return;
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
    // prose on screen during the fade-out, or nowhere at all.
    if (!state.visible) return false;
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
    clearHideTimer();
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
    hideTimer = setTimeout(() => {
      set({ visible: false });
      hideTimer = null;
    }, Math.max(durationMs, floorMs));
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
