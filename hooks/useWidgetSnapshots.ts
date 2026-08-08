import { useEffect, useRef } from 'react';
import { publishWidgetSnapshots, type SnapshotPet } from '../lib/widgetSnapshot';
import { buildWidgetProps, type CulpritWidgetProps } from '../lib/widgetProps';
import { publishWidgetPass } from '../lib/widgetBridge';
import { clearWidgetData } from '../lib/appGroup';
import { useAllowlistFlag } from './useAppConfig';
import { useBetaOptIn } from '../lib/betaFeatures';
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
// ── The B-712 widget gate (Beta features, spec §2 / §4.1) ─────────────────────
// The widget publishes REAL per-pet data only when the account is LIVE for it:
//   live = eligible (Gate 1, `widget_enabled` allowlist) && optedIn (Gate 2, the
//   local beta toggle). Everyone else — off the allowlist, OR eligible but not
// opted in — gets a NEUTRAL signed-in-empty payload so an added widget shows the
// honest "No pet in this slot yet" door rather than looking broken (or the "Sign
// in" lie). The widget can't be hidden per-account on iOS (D5), so its ungated
// state must be presentable, and this path must ship in the App Store submission
// binary. The whole gate is app-process JS (OTA-able); the choke is
// `buildWidgetPublishProps` below.
//
// PR 3 added Gate 2: PR 2 published on eligibility alone (Phase 1); now a cohort
// owner opts in once on the beta page (Phase 2, opt-in default off — spec §2 phase
// transition). Eligible-but-not-opted-in is exactly the neutral-empty path.
//
// Debounced: a burst (hydration writing dozens of rows, a log + its optimistic
// store update) collapses into one publish. On non-iOS / entitlement-less builds
// publishWidgetSnapshots no-ops at the container check, so this hook is inert.
const PUBLISH_DEBOUNCE_MS = 1000;

// The dependency seam for `buildWidgetPublishProps` — the real functions by
// default, swapped in the unit test so the eligibility branches run without a
// device (no App Group container, no SQLite). Mirrors lib/widgetBridge's DrainDeps.
export interface WidgetPublishDeps {
  publishSnapshots: typeof publishWidgetSnapshots;
  clearData: typeof clearWidgetData;
  getPets: () => SnapshotPet[];
}

function defaultPublishDeps(): WidgetPublishDeps {
  return {
    publishSnapshots: publishWidgetSnapshots,
    clearData: clearWidgetData,
    getPets: () => usePetStore.getState().pets,
  };
}

// The gate itself (spec §2 / §4.1), extracted so BOTH the live and not-live
// branches are unit-tested rather than buried in the effect — the lib/widgetBridge
// lesson: CI cannot reach a flag's on-state unless a test sets it (spec §7). `live`
// is `eligible && optedIn` (computed in the hook). Returns the props the publish
// pass will push to the timeline:
//   • live → the real per-pet snapshot the publisher writes today.
//   • not live → drop the per-pet snapshot FILES (they hold pet names, trial day
//     counts, meal counts — health state that must not linger in the App Group for
//     an account not currently running the widget) and return a NEUTRAL
//     signed-in-EMPTY payload. That renders the "No pet in this slot yet" door on
//     an added widget. `signedIn` STAYS true — the "Sign in" door
//     (`clearWidgetTimeline`, which pushes `signedIn:false`) is a lie for a
//     signed-in owner and is deliberately NOT used here (§4.1).
// The owner's own logs are never withheld by this gate: it runs INSIDE
// `publishWidgetPass`, so the §3 residual-v1 drain has already applied any
// build-35 capture to the record regardless of the gate — this withholds the
// widget's DATA, not the log.
export async function buildWidgetPublishProps(
  live: boolean,
  deps: WidgetPublishDeps = defaultPublishDeps(),
): Promise<CulpritWidgetProps> {
  if (!live) {
    deps.clearData();
    return buildWidgetProps({ index: null, snapshots: [], signedIn: true });
  }
  const { snapshots, index } = await deps.publishSnapshots(deps.getPets());
  return buildWidgetProps({ index, snapshots, signedIn: true });
}

export function useWidgetSnapshots() {
  const { session } = useAuthStore();
  // Gate 1 (server allowlist). Render-only + fail-CLOSED (useAllowlistFlag): an
  // unset / unreachable / malformed flag, or a signed-out caller, resolves false.
  const widgetEligible = useAllowlistFlag('widget_enabled');
  // Gate 2 (local opt-in, PR 3). Default off until the owner opts in on the beta
  // page — being eligible turns nothing on (spec §2 phase transition).
  const widgetOptedIn = useBetaOptIn('widget_enabled');
  // live = both gates. In the effect deps below, so adding/removing the account
  // from the allowlist OR flipping the toggle re-publishes on the next render.
  const widgetLive = widgetEligible && widgetOptedIn;
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
      // `buildWidgetPublishProps` chooses real data vs. the neutral empty payload
      // by `live` (eligible && optedIn); `publishWidgetPass` runs the §3 drain
      // first and only publishes on a clean drain (so a failed build-35 capture is
      // never lost).
      const { drainComplete } = await publishWidgetPass(
        () => buildWidgetPublishProps(widgetLive),
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
  }, [session, widgetLive]);
}
