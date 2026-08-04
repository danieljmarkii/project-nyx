import { create } from 'zustand';
import type { IntakeRating } from '../components/log/IntakeChipRow';
import type { DoseAdherence } from '../components/log/AdherenceChipRow';
import type { DoseVehicle } from '../lib/medications';
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
  patchIntakeRating: (intakeRating) =>
    set((state) =>
      state.payload?.kind === 'meal'
        ? { payload: { ...state.payload, intakeRating } }
        : {}
    ),
  patchTrialFlag: (eventId, trialFlag) => {
    const state = useMomentStore.getState();
    if (state.payload?.kind !== 'meal' || state.payload.eventId !== eventId) return false;
    // Also require the card to still be visible — patching a dismissed card would
    // burn the food's one heads-up on something nobody saw.
    if (!state.visible) return false;
    set({ payload: { ...state.payload, trialFlag } });
    return true;
  },
  patchAdherence: (adherence) =>
    set((state) =>
      state.payload?.kind === 'medication'
        ? { payload: { ...state.payload, adherence } }
        : {}
    ),
  patchHowGiven: (howGiven) =>
    set((state) =>
      state.payload?.kind === 'medication'
        ? { payload: { ...state.payload, howGiven } }
        : {}
    ),
  rescheduleHide: (durationMs) => {
    clearHideTimer();
    hideTimer = setTimeout(() => {
      set({ visible: false });
      hideTimer = null;
    }, durationMs);
  },
}));
