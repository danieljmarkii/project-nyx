import { useCrashStore } from '../store/crashStore';
import { UNHANDLED_REJECTION_SCREEN_ENABLED } from '../constants/flags';

// The two crash doors that live outside React (CUL-1841): a fatal error reaching the
// global handler, and a promise rejection nobody handled. Both land on the one designed
// screen (`components/CrashBoundary.tsx`) by setting the crash flag.
//
// NOTHING LEAVES THE PHONE (D9 (a), CUL-1825). This module imports no network client,
// writes nothing to disk and keeps nothing of the error; `lib/crashHandlers.test.ts`
// pins that by reading the import list. Sentry is a later, reviewed change (CUL-113).
//
// WHAT CHANGES FOR AN OWNER. A fatal JS error used to abort the app (a native crash,
// the white flash and back to the home screen); now it shows the screen, whose one
// button remounts the tree.
//
// A REPEAT CRASHES FOR REAL (PM ruling (b), 2026-10-16). Catching every crash would
// leave App Store Connect with no crash report at all, and D9 counts on those reports
// until Sentry; a crash that comes straight back after "Try again" would also loop the
// owner on the screen. So a crash within REPEAT_CRASH_WINDOW_MS of "Try again" goes to
// the handler React Native installed, which aborts the app in a release build: the
// phone files its crash report, and the relaunch starts with nothing in memory. A
// one-off crash still shows the screen and files nothing. A non-fatal report still goes to the handler that was there
// before, unchanged. An unhandled rejection in a release build was silent (Hermes only
// tracks rejections in __DEV__), and it stays so until UNHANDLED_REJECTION_SCREEN_ENABLED
// is ruled on (`constants/flags.ts` says why it is off).

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler: () => GlobalHandler;
  setGlobalHandler: (handler: GlobalHandler) => void;
}

interface RejectionTrackerOptions {
  allRejections: boolean;
  onUnhandled: (id: number, rejection: unknown) => void;
  onHandled: (id: number) => void;
}

interface HermesLike {
  enablePromiseRejectionTracker?: (options: RejectionTrackerOptions) => void;
}

export interface CrashHandlerDeps {
  errorUtils?: ErrorUtilsLike;
  hermes?: HermesLike;
  isDev: boolean;
  rejectionScreen: boolean;
}

/** How soon after "Try again" a crash counts as the same failure coming back. */
export const REPEAT_CRASH_WINDOW_MS = 60_000;

let installed = false;
// The handler that was there before ours: React Native's own, which reports a fatal
// error to the native side and, in a release build, aborts the app.
let nativeHandler: GlobalHandler | null = null;

/**
 * The one decision every crash door goes through. A first crash shows the screen; a
 * crash within the window after "Try again" is handed to the native handler, so the
 * app really crashes and the phone files its report. Without a native handler (tests,
 * no ErrorUtils), the screen is the only answer.
 */
export function handleCrash(error: unknown, now: number = Date.now()): void {
  const repeat = isRepeatPending(now);
  useCrashStore.getState().reportCrash();
  if (repeat && nativeHandler) nativeHandler(error, true);
}

// True when a crash now would be a repeat: the owner tapped "Try again" inside the window.
function isRepeatPending(now: number = Date.now()): boolean {
  const { retriedAt } = useCrashStore.getState();
  return retriedAt !== null && now - retriedAt < REPEAT_CRASH_WINDOW_MS;
}

function defaultDeps(): CrashHandlerDeps {
  const g = globalThis as { ErrorUtils?: ErrorUtilsLike; HermesInternal?: HermesLike };
  return {
    errorUtils: g.ErrorUtils,
    hermes: g.HermesInternal,
    isDev: __DEV__,
    rejectionScreen: UNHANDLED_REJECTION_SCREEN_ENABLED,
  };
}

/**
 * Install both handlers once, at module load of the root layout. Idempotent: a fast
 * refresh re-evaluating the layout must not wrap the handler around itself.
 */
export function installCrashHandlers(deps: CrashHandlerDeps = defaultDeps()): void {
  if (installed) return;
  installed = true;
  const { errorUtils, hermes, isDev, rejectionScreen } = deps;

  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    nativeHandler = previous;
    errorUtils.setGlobalHandler((error, isFatal) => {
      if (isFatal) {
        // In development the red box still shows, so the developer sees the stack. In a
        // release build the previous handler would abort the app, so a first crash
        // does not call it. A repeat skips this line because handleCrash calls the same
        // handler, and one error should not show the red box twice.
        if (isDev && !isRepeatPending()) previous(error, isFatal);
        handleCrash(error);
        return;
      }
      previous(error, isFatal);
    });
  }

  // Off, nothing is installed, so React Native's own tracker (development only) is left
  // as it was. Hermes is the only engine this app ships; without it there is no tracker
  // and an unhandled rejection stays as it was.
  if (!rejectionScreen) return;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, rejection) => {
      handleCrash(rejection);
      // This replaces React Native's own development tracker, so keep the rejection
      // visible in the console there. A release build logs nothing.
      if (isDev) console.warn('Unhandled promise rejection', rejection);
    },
    onHandled: () => {},
  });
}

/** Test seam: forget that the handlers were installed. */
export function resetCrashHandlersForTest(): void {
  installed = false;
  nativeHandler = null;
}
