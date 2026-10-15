import { useCrashStore } from '../store/crashStore';

// The two crash doors that live outside React (CUL-1841): a fatal error reaching the
// global handler, and a promise rejection nobody handled. Both land on the one designed
// screen (`components/CrashBoundary.tsx`) by setting the crash flag.
//
// NOTHING LEAVES THE PHONE (D9 (a), CUL-1825). This module imports no network client,
// writes nothing to disk and keeps nothing of the error; `lib/crashHandlers.test.ts`
// pins that by reading the import list. Sentry is a later, reviewed change (CUL-113).
//
// WHAT CHANGES FOR AN OWNER. A fatal JS error used to abort the app (a native crash,
// the white flash and back to the home screen), and an unhandled rejection in a release
// build was silent: Hermes only tracks rejections in __DEV__. Now both show the screen,
// whose one button remounts the tree. A non-fatal report still goes to the handler
// that was there before, unchanged.

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
}

let installed = false;

function defaultDeps(): CrashHandlerDeps {
  const g = globalThis as { ErrorUtils?: ErrorUtilsLike; HermesInternal?: HermesLike };
  return { errorUtils: g.ErrorUtils, hermes: g.HermesInternal, isDev: __DEV__ };
}

/**
 * Install both handlers once, at module load of the root layout. Idempotent: a fast
 * refresh re-evaluating the layout must not wrap the handler around itself.
 */
export function installCrashHandlers(deps: CrashHandlerDeps = defaultDeps()): void {
  if (installed) return;
  installed = true;
  const { errorUtils, hermes, isDev } = deps;

  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      if (isFatal) {
        useCrashStore.getState().reportCrash();
        // In development the red box still shows, so the developer sees the stack. In a
        // release build the previous handler would abort the app, which is the white
        // screen this replaces, so it is not called.
        if (isDev) previous(error, isFatal);
        return;
      }
      previous(error, isFatal);
    });
  }

  // Hermes is the only engine this app ships; without it the tracker is not there and
  // an unhandled rejection stays as it was.
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, rejection) => {
      useCrashStore.getState().reportCrash();
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
}
