// The app half of the widget (Widget V2, PR 2) — publish the timeline; drain the
// v1 outbox ONCE on upgrade.
//
// v2 NEVER WRITES (V2-1): the widget is informational, every element is a Link,
// and there is no ongoing outbox to drain. Only ONE direction crosses this seam
// now:
//
//   app → widget   `publishWidgetTimeline` — the v2 props built in lib/widgetProps
//                  from the snapshots the publisher just wrote.
//
// The one exception is the §3 UPGRADE PATH. A build-35 user upgrading to v2 may
// have an un-drained v1 capture still sitting in the stored timeline. Dropping it
// would lose a meal the owner logged, so `drainResidualV1Outbox` replays it
// through the SHIPPED W4 intents exactly once — the same apply/ingest/revoke path
// v1 used — before the app's first v2 publish replaces the timeline (which is what
// clears the outbox). After that publish the stored timeline is v2, carries no
// outbox, and a re-drain is a cheap no-op. The W4 intents themselves stay in the
// repo as the B-291 Siri/hardware rail (spec §4); only their per-tick drain call
// site retires.
//
// Everything degrades to a clean no-op without the native module (Android, Expo
// Go, a dev client built before the widget shipped) — same posture as lib/appGroup.

import { softDeleteEvent } from './db';
import { usePetStore } from '../store/petStore';
import { logMealIntent, logTreatIntent, topUpBowlIntent } from './widgetCapture';
import {
  WIDGET_NAME,
  WIDGET_PROPS_SCHEMA_VERSION,
  buildWidgetTimeline,
  collectOutbox,
  type CulpritWidgetProps,
  type V1OutboxProps,
  type WidgetPendingCapture,
} from './widgetProps';
import { CulpritWidgetLayout } from '../widgets/CulpritWidget';

// The narrow slice of expo-widgets' `Widget` this module uses. Declared
// structurally so the bridge can be unit-tested against a fake without the native
// module (which throws at import time on a binary without it). `getTimeline` may
// return v1-shaped props on the upgrade path, so its props are read loosely by
// `collectOutbox`.
export interface WidgetHandle {
  updateTimeline(entries: { date: Date; props: CulpritWidgetProps }[]): void;
  getTimeline(): Promise<{ date: Date; props: CulpritWidgetProps }[]>;
}

let handle: WidgetHandle | null = null;
let handleResolved = false;

// Lazily construct the widget. Constructing it is what writes the LAYOUT into the
// App Group (expo-widgets' WidgetObject init), so this must run at least once per
// app launch before any timeline update — otherwise the extension has props with
// no layout to render them with. On the upgrade path this is also what installs
// the v2 layout, so a stored v1 timeline briefly renders through the v2 layout,
// which the schema-mismatch door handles (§3) until the first v2 publish.
//
// `CulpritWidgetLayout` is a function to TypeScript and a source STRING at runtime
// (babel-preset-expo's `'widget'` directive rewrites it), which is exactly what
// `createWidget` wants; the cast is the seam between those two truths.
function getWidget(): WidgetHandle | null {
  if (handleResolved) return handle;
  handleResolved = true;
  try {
    // Required lazily: the module resolves a native module at import time, and
    // this file is imported by the app's hook graph (and by jest).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createWidget } = require('expo-widgets');
    handle = createWidget(WIDGET_NAME, CulpritWidgetLayout) as WidgetHandle;
  } catch (e) {
    console.warn('[widgetBridge] widget unavailable (no native module?):', e);
    handle = null;
  }
  return handle;
}

/** Test seam — inject a fake widget (or null to reset to the real lookup). */
export function __setWidgetHandleForTests(fake: WidgetHandle | null): void {
  handle = fake;
  handleResolved = fake !== null;
}

// ── The §3 one-time v1 residual-outbox drain ─────────────────────────────────

// What one drain pass did (unchanged from v1 — the apply path is identical).
export interface DrainOutcome {
  applied: number;
  revoked: number;
  failed: WidgetPendingCapture[];
  deferredRevokes: string[];
}

export interface DrainDeps {
  logMeal: typeof logMealIntent;
  logTreat: typeof logTreatIntent;
  topUpBowl: typeof topUpBowlIntent;
  /** Move the just-written inbox records into local SQLite + the sync queue. */
  ingest: () => Promise<void>;
  /** Soft-delete an already-ingested event; a no-op if it isn't there. */
  revokeEvent: (eventId: string) => Promise<void>;
}

function defaultDrainDeps(): DrainDeps {
  return {
    logMeal: logMealIntent,
    logTreat: logTreatIntent,
    topUpBowl: topUpBowlIntent,
    // Same allowlisted ingest the sync cycle runs (hooks/useSync.ts) — the pet set
    // is the trust boundary, so it is read here rather than derived from the
    // captures themselves. Required lazily: captureInbox pulls in the Supabase
    // client, whose import-time env guard deliberately throws.
    ingest: () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ingestCaptureInbox } = require('./captureInbox');
      return ingestCaptureInbox(new Set(usePetStore.getState().pets.map((p) => p.id)));
    },
    // reverse-path-ok: this is a ROLLBACK of captures the app just replayed on the
    // owner's behalf, not an owner-initiated removal, and it runs as a loop — so the
    // shared `reverseLoggedEvent` would fire one `syncPendingEvents()` flush per
    // revoked row where the drain wants a single flush at the end. Nothing is lost by
    // staying on the primitive today: the widget is informational-only (B-664 V2-1)
    // and its capture intents are meal / treat / bowl top-up, so a revoked event can
    // never be a weigh-in and there is no CUL-641 snapshot side-effect to inherit.
    // TRIP-WIRE: if the widget ever gains a weight capture, this must move to
    // `reverseLoggedEvent` and this exemption must go.
    revokeEvent: softDeleteEvent,
  };
}

// Replay ONE captured tap through its W4 intent, carrying the widget's own ids and
// tap time so the resulting row is byte-identical to what the intent would have
// written from the extension. A capture that names nothing is dropped rather than
// guessed at — the no-garbage rule survives the outbox hop.
async function applyCapture(capture: WidgetPendingCapture, deps: DrainDeps): Promise<boolean> {
  if (!capture.petId) return false;
  if (capture.kind === 'bowl_topup') {
    const result = await deps.topUpBowl(capture.petId, {
      loggedVia: 'widget',
      id: capture.id,
      occurredAt: new Date(capture.occurredAt),
    });
    return result.ok;
  }
  if (!capture.foodItemId || !capture.mealId) return false;
  const opts = {
    loggedVia: 'widget' as const,
    ids: { eventId: capture.id, mealId: capture.mealId },
    occurredAt: new Date(capture.occurredAt),
  };
  const result =
    capture.kind === 'treat'
      ? await deps.logTreat(capture.petId, capture.foodItemId, opts)
      : await deps.logMeal(capture.petId, capture.foodItemId, opts);
  return result.ok;
}

// Given the v1 outbox, apply it. Exported for the unit test. THE THREE STEPS ARE
// ORDERED (apply → ingest → revoke) and the order is the whole correctness
// argument, unchanged from v1 (see the git history / the v1 comment): a capture is
// written to the inbox, the inbox is ingested into SQLite in THIS pass, and only
// then can a revoke's soft-delete find the row. A capture whose apply succeeds but
// whose ingest fails is NOT lost — the inbox file persists and the regular sync
// cycle ingests it, which is why publishing v2 (and clearing the timeline) after a
// best-effort drain is safe.
export async function applyOutbox(
  outbox: { pending: WidgetPendingCapture[]; revoked: string[] },
  deps: DrainDeps = defaultDrainDeps(),
): Promise<DrainOutcome> {
  const revoked = new Set(outbox.revoked);
  const failed: WidgetPendingCapture[] = [];
  let applied = 0;
  for (const capture of outbox.pending) {
    if (revoked.has(capture.id)) continue;
    try {
      if (await applyCapture(capture, deps)) applied++;
      else failed.push(capture);
    } catch (e) {
      console.warn('[widgetBridge] capture apply failed:', e);
      failed.push(capture);
    }
  }

  let ingested = true;
  try {
    await deps.ingest();
  } catch (e) {
    console.warn('[widgetBridge] inbox ingest failed; deferring revokes:', e);
    ingested = false;
  }

  if (ingested) {
    for (const id of revoked) {
      try {
        await deps.revokeEvent(id);
      } catch (e) {
        console.warn('[widgetBridge] revoke failed:', e);
      }
    }
  }

  return {
    applied,
    revoked: ingested ? revoked.size : 0,
    failed,
    deferredRevokes: ingested ? [] : [...revoked],
  };
}

const EMPTY_DRAIN: DrainOutcome = { applied: 0, revoked: 0, failed: [], deferredRevokes: [] };

/**
 * Drain any residual v1 outbox from the stored timeline (the §3 one-time upgrade
 * path). Idempotent and self-healing: once the app has published v2 props, the
 * stored timeline carries no outbox and this returns EMPTY_DRAIN without applying
 * anything. Meant to run BEFORE the first v2 publish, so the drained captures are
 * ingested into SQLite and appear in the props that publish then builds.
 */
export async function drainResidualV1Outbox(deps?: DrainDeps): Promise<DrainOutcome> {
  const widget = getWidget();
  if (!widget) return EMPTY_DRAIN;
  let entries: { date: Date; props: CulpritWidgetProps }[] = [];
  try {
    entries = await widget.getTimeline();
  } catch (e) {
    console.warn('[widgetBridge] timeline read failed:', e);
    return EMPTY_DRAIN;
  }
  // The stored props are v1-shaped on the upgrade path; read the outbox off them
  // loosely (v2 props carry neither field, so this finds nothing post-upgrade).
  const outbox = collectOutbox(entries as unknown as { props?: V1OutboxProps }[]);
  if (outbox.pending.length === 0 && outbox.revoked.length === 0) return EMPTY_DRAIN;
  return applyOutbox(outbox, deps);
}

// ── Publish ──────────────────────────────────────────────────────────────────

/** Push the current v2 props to the widget. */
export function publishWidgetTimeline(props: CulpritWidgetProps, now: Date = new Date()): void {
  const widget = getWidget();
  if (!widget) return;
  try {
    widget.updateTimeline(buildWidgetTimeline(props, now));
  } catch (e) {
    console.warn('[widgetBridge] timeline publish failed:', e);
  }
}

// Sign-out wipe for the widget's OWN store (B-054 FR-9 parity). The timeline lives
// in the App Group's UserDefaults, NOT in the container directory, so
// `clearWidgetData`'s directory delete does not touch it — without this, the
// previous account's pet name and facts would keep rendering on the Home Screen
// after sign-out. Publishing the signed-out props both erases that data and leaves
// the widget in its honest "sign in to start logging" state.
//
// The B-576 lesson applies here: `useWidgetSnapshots` keys on the auth session, so
// a recovery/account swap re-arms the publisher — wipe ordering matters, and the
// signed-out props are the teardown's visible half.
export function clearWidgetTimeline(): void {
  publishWidgetTimeline({
    schemaVersion: WIDGET_PROPS_SCHEMA_VERSION,
    pets: {},
    signedIn: false,
  });
}

/**
 * One publish pass, with the §3 one-time residual drain folded in so the seam is
 * TESTABLE (the hook is otherwise the only, untested, call site).
 *
 * ── WHY THE DRAIN GATES THE PUBLISH ──────────────────────────────────────────
 * On a build-35 → v2 upgrade the un-applied v1 tap lives ONLY in the stored
 * timeline's props (v1's tap could not reach the filesystem). Publishing v2 props
 * OVERWRITES that timeline — so if the drain could not apply a capture (e.g.
 * `runCapture` failed the inbox write → `outcome.failed`, a real handled failure
 * mode), publishing would destroy the only durable copy. The inbox is the durable
 * buffer ONLY for captures whose apply SUCCEEDED; a failed apply wrote nothing.
 *
 * So when `needsDrain` and the drain comes back incomplete (any `failed` apply or
 * `deferredRevoke`), this does NOT publish and reports `drainComplete: false` — the
 * v1 timeline is left intact and the caller retries on the next tick (the already-
 * applied captures re-apply idempotently by id). A clean drain — including the
 * steady-state v2 no-op, which finds no outbox — publishes and reports true.
 */
export async function publishWidgetPass(
  buildProps: () => Promise<CulpritWidgetProps>,
  opts: { needsDrain: boolean; deps?: DrainDeps; now?: Date },
): Promise<{ drainComplete: boolean }> {
  if (opts.needsDrain) {
    const outcome = await drainResidualV1Outbox(opts.deps);
    if (outcome.failed.length > 0 || outcome.deferredRevokes.length > 0) {
      console.warn(
        `[widgetBridge] residual v1 drain incomplete (${outcome.failed.length} failed, ` +
          `${outcome.deferredRevokes.length} deferred) — NOT publishing over the v1 timeline; retrying next tick`,
      );
      return { drainComplete: false };
    }
  }
  const props = await buildProps();
  publishWidgetTimeline(props, opts.now);
  return { drainComplete: true };
}
