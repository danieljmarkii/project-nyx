import { useEffect, useRef } from 'react';
import { publishWidgetSnapshots } from '../lib/widgetSnapshot';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

// Publish the per-pet widget snapshots "on every relevant change" (B-290, spec
// §4 read path). The three signals that can change what the widget shows:
//   • an in-app log/edit/delete → eventStore changes (prependEvent etc.);
//   • a sync cycle landing remote rows → syncStore.hydrationTick bumps;
//   • the pet list itself changing (add/rename/archive) → petStore changes.
// Subscribing to the STORES (rather than instrumenting every write path) means
// a new logging surface cannot forget to refresh the widget — the same
// can't-forget reasoning as lib/meals.ts owning the meal side-effects.
//
// Debounced: a burst (hydration writing dozens of rows, a log + its optimistic
// store update) collapses into one publish. The publish itself is a handful of
// indexed SQLite reads + small file writes, so the trailing-edge delay is the
// only cost that matters — 1s keeps the widget honest well within its own
// refresh cadence. On non-iOS / entitlement-less builds publishWidgetSnapshots
// no-ops at the container check, so this hook is inert there.
const PUBLISH_DEBOUNCE_MS = 1000;

export function useWidgetSnapshots() {
  const { session } = useAuthStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        publishWidgetSnapshots(usePetStore.getState().pets).catch((e) =>
          console.warn('[widgetSnapshots] publish failed:', e),
        );
      }, PUBLISH_DEBOUNCE_MS);
    };

    // Initial publish on session (covers cold start + the post-sign-in state),
    // then follow the three change signals.
    schedule();
    const unsubs = [
      useEventStore.subscribe(schedule),
      usePetStore.subscribe(schedule),
      useSyncStore.subscribe(schedule),
    ];
    return () => {
      unsubs.forEach((u) => u());
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [session]);
}
