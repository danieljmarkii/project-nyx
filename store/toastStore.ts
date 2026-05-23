import { create } from 'zustand';

// Post-log "Logged at X · Change time" affordance. Preserves Principle 1
// (one-tap log) while giving the owner a frictionless backfill path for
// meals given before they reached their phone — e.g. fed the cat, did the
// dishes, sat down 15 minutes later to log.
export interface MealToastPayload {
  eventId: string;
  // ISO UTC of the logged event's occurred_at.
  occurredAt: string;
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
}

const DEFAULT_DURATION_MS = 5000;

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
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
}));
