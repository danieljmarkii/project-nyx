import { create } from 'zustand';

// Whether the app has failed in a way that leaves the tree untrustworthy (CUL-1841).
//
// Three doors open this one flag: a render error caught by the root boundary, a fatal
// error reaching the global handler, and a promise rejection nobody handled
// (`lib/crashHandlers.ts`). The two non-React doors fire outside the tree, so the flag
// lives in a store the boundary subscribes to rather than in the boundary's own state.
//
// It holds a boolean and nothing else: no message, no stack. Nothing about the failure
// is kept, shown or sent (D9 (a), CUL-1825); App Store Connect's crash reports are the
// visibility until Sentry (CUL-113).
interface CrashState {
  crashed: boolean;
  reportCrash: () => void;
  clearCrash: () => void;
}

export const useCrashStore = create<CrashState>((set) => ({
  crashed: false,
  reportCrash: () => set({ crashed: true }),
  clearCrash: () => set({ crashed: false }),
}));
