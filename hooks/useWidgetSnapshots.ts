import { useEffect, useRef } from 'react';
import {
  publishWidgetSnapshots,
  widgetPublishEpoch,
  type SnapshotPet,
} from '../lib/widgetSnapshot';
import { buildWidgetProps, type CulpritWidgetProps } from '../lib/widgetProps';
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
// ── Every account gets the widget (CUL-1842, D8 ruled 2026-10-12) ─────────
// The widget graduated at 1.2.0: the `widget_enabled` allowlist (Gate 1) and the
// local beta opt-in (Gate 2) are retired, so every signed-in account publishes its
// real per-pet data. Before this, an owner off the beta list who added the widget
// from the gallery (iOS can't hide it per account, D5) got "No pet in this slot
// yet / Touch and hold the widget to pick a pet", a door picking a pet could not
// open. The neutral empty payload that served those owners went with the gate.
// Signed out, the effect does not run, and sign-out's wipe (lib/session.ts) clears
// the snapshot files and pushes the "Sign in" timeline. A publish running or
// scheduled when that wipe lands is fenced (CUL-1952): see `sessionEpoch` below.
//
// Debounced: a burst (hydration writing dozens of rows, a log + its optimistic
// store update) collapses into one publish. On non-iOS / entitlement-less builds
// publishWidgetSnapshots no-ops at the container check, so this hook is inert.
const PUBLISH_DEBOUNCE_MS = 1000;

// The dependency seam for `buildWidgetPublishProps` — the real functions by
// default, swapped in the unit test so the publish runs without a device (no App
// Group container, no SQLite). Mirrors lib/widgetBridge's DrainDeps.
export interface WidgetPublishDeps {
  publishSnapshots: typeof publishWidgetSnapshots;
  getPets: () => SnapshotPet[];
  currentEpoch: () => number;
}

function defaultPublishDeps(): WidgetPublishDeps {
  return {
    publishSnapshots: publishWidgetSnapshots,
    getPets: () => usePetStore.getState().pets,
    currentEpoch: widgetPublishEpoch,
  };
}

// Thrown when sign-out's wipe moved the publish epoch while this pass was reading
// (CUL-1952). `publishWidgetPass` calls `publishWidgetTimeline` on the same tick
// `buildProps` resolves, with no await between, so refusing to resolve HERE is the
// last moment before the timeline push: the throw is what keeps the previous
// owner's signed-in props off a signed-out Home Screen. A rejection rather than an
// option on `publishWidgetPass` keeps the PUBLISH fence out of lib/widgetBridge.ts (PM, plan
// option A). TRIP-WIRE: a second caller of `publishWidgetPass` must build its props
// through this function, or carry its own check, or it is unfenced.
export class WidgetPublishFenced extends Error {
  constructor() {
    super('widget publish fenced by sign-out');
    this.name = 'WidgetPublishFenced';
  }
}

// The props the publish pass pushes to the timeline: the real per-pet snapshot,
// for every signed-in account. It runs INSIDE `publishWidgetPass`, so the §3
// residual-v1 drain has already applied any build-35 capture to the record first.
// `epoch` is the session's, captured when the hook's effect ran for it.
export async function buildWidgetPublishProps(
  deps: WidgetPublishDeps = defaultPublishDeps(),
  epoch: number = deps.currentEpoch(),
): Promise<CulpritWidgetProps> {
  const { snapshots, index } = await deps.publishSnapshots(deps.getPets(), epoch);
  if (deps.currentEpoch() !== epoch) throw new WidgetPublishFenced();
  return buildWidgetProps({ index, snapshots, signedIn: true });
}

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

    // CUL-1952: the epoch belongs to the SESSION, captured once per effect run, never
    // per pass. `app/_layout.tsx` and the delete fallback run `await wipeLocalSession()`
    // BEFORE `setSession(null)`, so this effect, its timer and its store subscriptions
    // stay live through the whole wipe; a pass that captured the epoch when it started
    // would take the wipe's moved epoch as its own and publish the old pet after the
    // clears (rls-privacy-reviewer, attack 1). Once the wipe moves it, nothing this
    // effect run schedules can start; the next session's run captures the new epoch.
    const sessionEpoch = widgetPublishEpoch();
    const fenced = () => widgetPublishEpoch() !== sessionEpoch;

    const publish = async () => {
      // `publishWidgetPass` runs the §3 drain first and only publishes on a clean
      // drain (so a failed build-35 capture is never lost).
      const { drainComplete } = await publishWidgetPass(
        () => buildWidgetPublishProps(undefined, sessionEpoch),
        { needsDrain: !drainDone, epoch: sessionEpoch },
      );
      if (drainComplete) drainDone = true;
    };

    const schedule = () => {
      if (fenced()) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        // A timer armed before the wipe and firing during it starts nothing, the
        // residual drain included.
        if (fenced()) return;
        publish().catch((e) => {
          // A fenced pass is the sign-out doing its job, not a failure.
          if (e instanceof WidgetPublishFenced) return;
          console.warn('[widgetSnapshots] publish failed:', e);
        });
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
