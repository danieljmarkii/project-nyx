import { create } from 'zustand';
import type { IntakeRating } from '../components/log/IntakeChipRow';

// Post-log toast surfaced after a one-tap meal log. Two affordances live
// in this single surface, both triggered by the same event (meal saved
// from the picker) and visible at the same moment:
//
//   1. "Change time" — backfill path for meals fed before the owner
//      reached their phone (Linear/Gmail "Undo send" pattern). Preserves
//      Principle 1: tap-to-log stays one tap.
//   2. WSAVA intake chips — owner-reported intake (refused / picked /
//      some / most / all) per Dr. Chen. Rendered for food_type 'meal'
//      and 'treat' (B-014; treats added 2026-05-23 — treat refusal is
//      itself a clinical signal). Default stays null; never pre-stamped.
//
// If a third affordance is ever proposed for this toast, stop and
// reconsider — the surface is intentionally narrow.
export interface MealToastPayload {
  eventId: string;
  // ISO UTC of the logged event's occurred_at.
  occurredAt: string;
  // food_items.food_type of the just-logged food, or null if unclassified.
  // Drives whether the intake chip row renders — 'meal' and 'treat' get
  // it (B-014; treats added 2026-05-23). 'other' and null opt out.
  foodType: 'meal' | 'treat' | 'other' | null;
  // Brand + product of the just-logged food, surfaced in the toast as a
  // one-glance reminder of what was logged. Optional/nullable: non-food
  // paths or unnamed foods fall back to the bare "Logged at HH:MM" line.
  foodBrand?: string | null;
  foodProductName?: string | null;
  // In-flight intake rating. Starts null; updated optimistically via
  // patchIntakeRating when the user taps a chip.
  intakeRating: IntakeRating | null;
}

interface ToastState {
  visible: boolean;
  payload: MealToastPayload | null;
  show: (payload: MealToastPayload, opts?: { delayMs?: number; durationMs?: number }) => void;
  hide: () => void;
  // Mutates the in-flight toast's occurredAt after an edit so the toast
  // either reflects the new time briefly before dismissing, or is hidden
  // explicitly by the caller.
  patchOccurredAt: (occurredAt: string) => void;
  // Mutates the in-flight toast's intakeRating after a chip tap. Pair
  // with rescheduleHide() to give the user visible confirmation before
  // the toast dismisses.
  patchIntakeRating: (rating: IntakeRating | null) => void;
  // Reschedules the hide timer to fire `durationMs` from now. Used to
  // hold the toast open ~1.5s after a chip tap so the selection is
  // confirmed visibly before dismiss.
  rescheduleHide: (durationMs: number) => void;
}

const DEFAULT_DURATION_MS = 5000;

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
}

function clearHideTimer() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  payload: null,
  show: (payload, opts) => {
    clearTimers();
    const delay = opts?.delayMs ?? 0;
    const duration = opts?.durationMs ?? DEFAULT_DURATION_MS;
    const reveal = () => {
      set({ visible: true, payload });
      hideTimer = setTimeout(() => {
        set({ visible: false });
        hideTimer = null;
      }, duration);
    };
    if (delay > 0) {
      showTimer = setTimeout(reveal, delay);
    } else {
      reveal();
    }
  },
  hide: () => {
    clearTimers();
    set({ visible: false });
  },
  patchOccurredAt: (occurredAt) =>
    set((state) =>
      state.payload
        ? { payload: { ...state.payload, occurredAt } }
        : {}
    ),
  patchIntakeRating: (intakeRating) =>
    set((state) =>
      state.payload
        ? { payload: { ...state.payload, intakeRating } }
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
