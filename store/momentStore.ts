import { create } from 'zustand';

// The earned completion "moment" — a brief, root-mounted confirmation beat
// played after a successful log on any path (the /log forms + the FAB quick
// actions), so the fastest taps get the same closure as the full flow (B-063).
//
// Tone-aware per the Designer decision (2026-06-07):
//   - 'celebrate' — warm-gold radial glow + spring mint check. For routine /
//     non-symptom logs, where confirming the act of tracking is a small reward.
//   - 'calm' — the same spring check WITHOUT the festive gold, for symptom
//     logs (vomit, diarrhea, lethargy, itch): we acknowledge the log quietly
//     and never celebrate a worrying event (Principle 4; the Calm/Oura bar).
//
// Meals deliberately do NOT use this surface. Their confirmation carries the
// intake follow-up (the post-log toast), and this moment is terminal /
// non-interactive — firing both would double the surface the PM flagged.
// B-064 unifies the meal card with the moment's warmth.
export type MomentTone = 'celebrate' | 'calm';

export interface MomentPayload {
  tone: MomentTone;
  // Confirmation line. Defaults to 'Logged'.
  title: string;
}

interface MomentState {
  visible: boolean;
  payload: MomentPayload | null;
  show: (
    payload: { tone: MomentTone; title?: string },
    opts?: { delayMs?: number; durationMs?: number },
  ) => void;
  hide: () => void;
}

// Total on-screen dwell. Well under the 2s earned-moment cap; the gold glow
// blooms and settles inside this window so the warm color never lingers on a
// resting surface.
const DEFAULT_DURATION_MS = 1400;

// Module-scoped so a rapid second log cleanly cancels the prior timers rather
// than racing two hides (mirrors toastStore's timer handling).
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
}

export const useMomentStore = create<MomentState>((set) => ({
  visible: false,
  payload: null,
  show: (payload, opts) => {
    clearTimers();
    const delay = opts?.delayMs ?? 0;
    const duration = opts?.durationMs ?? DEFAULT_DURATION_MS;
    const reveal = () => {
      set({ visible: true, payload: { tone: payload.tone, title: payload.title ?? 'Logged' } });
      hideTimer = setTimeout(() => {
        set({ visible: false });
        hideTimer = null;
      }, duration);
    };
    // delayMs lets a /log caller dismiss its modal first, so the root overlay
    // isn't briefly occluded by the still-presented modal on iOS.
    if (delay > 0) showTimer = setTimeout(reveal, delay);
    else reveal();
  },
  hide: () => {
    clearTimers();
    set({ visible: false });
  },
}));
