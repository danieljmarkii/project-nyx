import { useEffect, useRef } from 'react';
import { publishWidgetSnapshots } from '../lib/widgetSnapshot';
import { buildWidgetProps } from '../lib/widgetProps';
import { syncWidget } from '../lib/widgetBridge';
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
// store update) collapses into one publish. The publish is indexed SQLite
// reads + small file writes, plus (since W4) one best-effort diet-trials
// Supabase query that is TTL-cached inside the publisher and degrades to
// trialDay:null offline — so the trailing-edge delay is still the only cost
// that matters; 1s keeps the widget honest well within its own refresh
// cadence. On non-iOS / entitlement-less builds publishWidgetSnapshots no-ops
// at the container check, so this hook is inert there.
const PUBLISH_DEBOUNCE_MS = 1000;

export function useWidgetSnapshots() {
  const { session } = useAuthStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;

    // One pass: publish the per-pet snapshot files (W3), then hand the SAME
    // facts to the widget as props — drain-then-publish, so a Home Screen tap
    // is never thrown away by the publish that follows it (lib/widgetBridge).
    const publish = async () => {
      const pets = usePetStore.getState().pets;
      const { snapshots, index } = await publishWidgetSnapshots(pets);
      await syncWidget(buildWidgetProps({ index, snapshots, signedIn: true }));
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

    // A Home Screen tap while the app is alive: WidgetKit's interaction intent
    // emits this, so the capture becomes a real record in about a second
    // instead of waiting for the next foreground. Best-effort — the drain in
    // `publish` is the guarantee; this is the latency win.
    let interaction: { remove(): void } | null = null;
    try {
      // Lazy require: the module resolves a native module at import time and
      // must not break a binary (or a test run) without the widget extension.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { addUserInteractionListener } = require('expo-widgets');
      interaction = addUserInteractionListener(() => schedule());
    } catch {
      // No widget extension in this binary — nothing to listen to.
    }

    return () => {
      unsubs.forEach((u) => u());
      interaction?.remove();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [session]);
}
