import { create } from 'zustand';

// Whether the app has failed in a way that leaves the tree untrustworthy (CUL-1841).
//
// Three doors open this one flag: a render error caught by the root boundary, a fatal
// error reaching the global handler, and a promise rejection nobody handled
// (`lib/crashHandlers.ts`). The two non-React doors fire outside the tree, so the flag
// lives in a store the boundary subscribes to rather than in the boundary's own state.
//
// It holds a boolean and the time of the last "Try again", and nothing else: no
// message, no stack. The time is how a repeat crash is told from a first one
// (`lib/crashHandlers.ts`, `REPEAT_CRASH_WINDOW_MS`). Nothing about the failure
// is kept, shown or sent (D9 (a), CUL-1825); App Store Connect's crash reports are the
// visibility until Sentry (CUL-113).
interface CrashState {
  crashed: boolean;
  /** Epoch ms of the last "Try again", or null when the owner has not retried. */
  retriedAt: number | null;
  reportCrash: () => void;
  /** "Try again": hide the screen and remember when, so a quick repeat is caught. */
  retry: (now: number) => void;
}

export const useCrashStore = create<CrashState>((set) => ({
  crashed: false,
  retriedAt: null,
  reportCrash: () => set({ crashed: true }),
  retry: (now) => set({ crashed: false, retriedAt: now }),
}));
