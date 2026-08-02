import { useEffect, useRef } from 'react';
import { publishWidgetSnapshots } from '../lib/widgetSnapshot';
import { buildWidgetProps } from '../lib/widgetProps';
import { publishWidgetPass } from '../lib/widgetBridge';
import { useAuthStore } from '../store/authStore';
import { useEventStore } from '../store/eventStore';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

// Publish the per-pet widget snapshots "on every relevant change" (spec §4 read
// path). The three signals that can change what the widget shows:
//   • an in-app log/edit/delete → eventStore changes (prependEvent etc.);
//   • a sync cycle landing remote rows → syncStore.hydrationTick bumps;
//   • the pet list itself changing (add/rename/archive) → petStore changes.
// Subscribing to the STORES (rather than instrumenting every write path) means a
// new logging surface cannot forget to refresh the widget.
//
// v2 NEVER WRITES (V2-1), so there is no per-tick outbox drain: a publish just
// pushes fresh v2 props. The ONE exception is the §3 upgrade path — the FIRST
// publish after the app starts drains any residual v1 outbox first (idempotent; a
// no-op once the timeline is already v2), so a build-35 user's un-drained tap is
// applied before the v2 publish replaces the timeline that held it.
//
// Debounced: a burst (hydration writing dozens of rows, a log + its optimistic
// store update) collapses into one publish. On non-iOS / entitlement-less builds
// publishWidgetSnapshots no-ops at the container check, so this hook is inert.
const PUBLISH_DEBOUNCE_MS = 1000;

export function useWidgetSnapshots() {
  const { session } = useAuthStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;

    // The first publish after a session begins drains the residual v1 outbox
    // (§3) before publishing; every subsequent publish is publish-only. The flag
    // resets on session change (the effect re-runs), which is exactly when an
    // upgrade drain could matter again (a fresh account on the same install has
    // its own timeline).
    //
    // `drainDone` is set ONLY when the drain came back clean. If a build-35 tap
    // could not be applied, `publishWidgetPass` does NOT publish (it would
    // overwrite the timeline that holds the un-applied tap — its only durable
    // copy), returns `drainComplete: false`, and this leaves the flag unset so the
    // next store-change tick retries. The drain-then-publish sequencing + this
    // fail-safe live in `publishWidgetPass` so they are unit-tested, not buried in
    // an untested hook.
    let drainDone = false;

    const publish = async () => {
      const { drainComplete } = await publishWidgetPass(
        async () => {
          const { snapshots, index } = await publishWidgetSnapshots(usePetStore.getState().pets);
          return buildWidgetProps({ index, snapshots, signedIn: true });
        },
        { needsDrain: !drainDone },
      );
      if (drainComplete) drainDone = true;
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        publish().catch((e) => console.warn('[widgetSnapshots] publish failed:', e));
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
