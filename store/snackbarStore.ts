import { create } from 'zustand';

// A minimal, general-purpose snackbar: a transient bottom message with an
// optional single action (e.g. Undo). Root-mounted (<Snackbar/> in app/_layout),
// so it survives the dismissal of the modal that triggered it — the food-detail
// "Remove from library" archives, dismisses its modal, then arms this over the
// Foods tab underneath (B-005 PR 2, the Linear/Gmail undo-over-confirm pattern).
//
// Deliberately NOT folded into momentStore: that store carries the *earned
// completion* surfaces (the celebrate/calm beat + meal/med cards) with their own
// payload shapes and warmth. A snackbar is a neutral, reversible-action carrier —
// a different job, so a different store, rather than a fourth momentStore kind.

interface SnackbarPayload {
  message: string;
  // When both are present, the action button renders. onAction may be async; it
  // runs after the snackbar dismisses (so an action that re-arms the snackbar —
  // e.g. Undo failing and offering to retry — isn't immediately overwritten).
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

interface ShowOpts {
  // Delay the reveal so a dismissing modal clears first (matches momentStore's
  // delayMs pattern) — otherwise the root overlay flashes behind the modal on iOS.
  delayMs?: number;
  durationMs?: number;
}

interface SnackbarState {
  visible: boolean;
  payload: SnackbarPayload | null;
  show: (payload: SnackbarPayload, opts?: ShowOpts) => void;
  hide: () => void;
  // Dismiss, then fire the payload's action. No-op if there's no action.
  runAction: () => void;
}

// Undo window — the Gmail/Linear "Undo send" dwell. Matches the meal card's 5s so
// the two transient bottom surfaces feel consistent.
const DEFAULT_DURATION_MS = 5000;

// Module-scoped so a rapid second show cleanly cancels the prior timers rather
// than racing two hides (mirrors momentStore's timer discipline).
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
}

export const useSnackbarStore = create<SnackbarState>((set, get) => ({
  visible: false,
  payload: null,
  show: (payload, opts) => {
    clearTimers();
    const delay = opts?.delayMs ?? 0;
    const duration = opts?.durationMs ?? DEFAULT_DURATION_MS;
    const reveal = () => {
      set({ visible: true, payload });
      hideTimer = setTimeout(() => { set({ visible: false }); hideTimer = null; }, duration);
    };
    if (delay > 0) showTimer = setTimeout(reveal, delay);
    else reveal();
  },
  hide: () => {
    clearTimers();
    set({ visible: false });
  },
  runAction: () => {
    const { payload } = get();
    clearTimers();
    // Dismiss first, then fire — the action owns what happens next (including
    // possibly re-arming the snackbar), and payload is preserved through the fade
    // by the component keeping the last payload mounted.
    set({ visible: false });
    payload?.onAction?.();
  },
}));
