// The app half of the widget (widget PR W5) — publish the timeline, drain the
// outbox.
//
// The widget renders from ONE timeline that the app owns (expo-widgets stores
// it in the App Group; the extension only reads it). Two directions cross this
// seam:
//
//   app → widget   `publishWidgetTimeline` — the props built in lib/widgetProps
//                  from the snapshots the W3 publisher just wrote.
//   widget → app   `drainWidgetOutbox` — the taps captured on the Home Screen,
//                  replayed through the SHIPPED W4 intents so the write path,
//                  its ids, its provenance, and its trust boundary are exactly
//                  the ones W3/W4 built and reviewed. Nothing here writes a row
//                  itself.
//
// ORDER IS LOAD-BEARING: `syncWidget` drains BEFORE it publishes. Publishing
// replaces the stored timeline, which is also what clears `pending`/`revoked` —
// so publishing first would throw away un-drained taps. The one residual race
// is a tap landing between the drain's read and the publish's write; it is
// milliseconds wide, and it is why the drain is also triggered by the
// interaction event (below) rather than only by the debounced publisher.
//
// Everything degrades to a clean no-op without the native module (Android, Expo
// Go, a dev client built before this PR) — same posture as lib/appGroup.

import { softDeleteEvent } from './db';
import { usePetStore } from '../store/petStore';
import { logMealIntent, logTreatIntent, topUpBowlIntent } from './widgetCapture';
import {
  WIDGET_NAME,
  WIDGET_PROPS_SCHEMA_VERSION,
  buildWidgetTimeline,
  collectOutbox,
  type CulpritWidgetProps,
  type WidgetPendingCapture,
} from './widgetProps';
import { CulpritWidgetLayout } from '../widgets/CulpritWidget';

// The narrow slice of expo-widgets' `Widget` this module uses. Declared
// structurally so the bridge can be unit-tested against a fake without the
// native module (which throws at import time on a binary without it).
export interface WidgetHandle {
  updateTimeline(entries: { date: Date; props: CulpritWidgetProps }[]): void;
  getTimeline(): Promise<{ date: Date; props: CulpritWidgetProps }[]>;
}

let handle: WidgetHandle | null = null;
let handleResolved = false;

// Lazily construct the widget. Constructing it is what writes the LAYOUT into
// the App Group (expo-widgets' WidgetObject init), so this must run at least
// once per app launch before any timeline update — otherwise the extension has
// props with no layout to render them with.
//
// `CulpritWidgetLayout` is a function to TypeScript and a source STRING at
// runtime (babel-preset-expo's `'widget'` directive rewrites it), which is
// exactly what `createWidget` wants; the cast is the seam between those two
// truths, not a shortcut.
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

// What one drain pass did. Returned (rather than logged) so the caller can
// decide whether a re-publish is worth it and the test can assert on it.
export interface DrainOutcome {
  applied: number;
  revoked: number;
  /**
   * Captures that could NOT be applied and must survive the publish that
   * follows. Re-seeded into the next props' outbox so a failed tap is retried,
   * never silently dropped — the "no lost taps" guarantee (§4.1 Q4) restated
   * for the app-side leg of the outbox.
   */
  failed: WidgetPendingCapture[];
  /**
   * Revocations that could not be applied this pass (the ingest failed, so the
   * rows they target may not exist locally yet). Carried into the next props
   * for the same reason as `failed` — an undo the app dropped on the floor
   * would resurrect the event on the next ingest.
   */
  deferredRevokes: string[];
}

export interface DrainDeps {
  logMeal: typeof logMealIntent;
  logTreat: typeof logTreatIntent;
  topUpBowl: typeof topUpBowlIntent;
  /**
   * Move the just-written inbox records into local SQLite + the sync queue.
   * MUST run between the applies and the revokes — see applyOutbox.
   */
  ingest: () => Promise<void>;
  /** Soft-delete an already-ingested event; a no-op if it isn't there. */
  revokeEvent: (eventId: string) => Promise<void>;
}

function defaultDrainDeps(): DrainDeps {
  return {
    logMeal: logMealIntent,
    logTreat: logTreatIntent,
    topUpBowl: topUpBowlIntent,
    // Same allowlisted ingest the sync cycle runs (hooks/useSync.ts) — the pet
    // set is the trust boundary, so it is read here rather than derived from
    // the captures themselves. Required lazily: captureInbox pulls in the
    // Supabase client, whose import-time env guard deliberately throws, and
    // this module must stay importable by anything that only needs its types.
    ingest: () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ingestCaptureInbox } = require('./captureInbox');
      return ingestCaptureInbox(new Set(usePetStore.getState().pets.map((p) => p.id)));
    },
    revokeEvent: softDeleteEvent,
  };
}

// Replay ONE captured tap through its W4 intent, carrying the widget's own ids
// and tap time so the resulting row is byte-identical to what the intent would
// have written from the extension. A capture that names nothing is dropped
// rather than guessed at — the no-garbage rule (D2) survives the outbox hop.
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

// Given the outbox, apply it. Exported for the unit test (the production
// function runs against fakes, not a copy of itself).
//
// THE THREE STEPS ARE ORDERED, and the order is the whole correctness argument:
//
//   1. APPLY  — each capture goes through its W4 intent, which writes an inbox
//               file (+ a best-effort direct REST leg). No local row exists yet.
//   2. INGEST — the inbox is drained into local SQLite + the sync queue, in
//               THIS pass. Without it the app's own snapshot (read right after,
//               to republish) would still show the slot as unlogged, so the
//               widget would drop its ✓ about a second after a tap that
//               actually succeeded — an invitation to log the meal twice. The
//               W3 contract assumed the extension wrote the inbox file long
//               before a foreground; W5's outbox writes it DURING one, so the
//               ingest has to be pulled into the same pass.
//   3. REVOKE — only now can a soft-delete find the row. Revoking before the
//               ingest would silently no-op, and the inbox record — which knows
//               nothing about revocations — would then insert the event the
//               owner explicitly undid.
//
// One undo path, honest whichever side of the drain the owner tapped on (the
// W3 §4.1 Q5 recommendation). A bowl top-up creates no row, so its revoke is
// pre-drain only; once drained the re-attest stands, and the publish that
// follows has already cleared the affordance. That asymmetry is documented,
// not hidden.
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

  // Step 2. Best-effort like every other ingest call site — but a FAILED ingest
  // must not let step 3 run against rows that aren't there yet, so a throw
  // here defers the revokes to the next pass rather than burning them.
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

  if (failed.length > 0) {
    console.warn(`[widgetBridge] ${failed.length} widget capture(s) not applied — retrying`);
  }
  return {
    applied,
    revoked: ingested ? revoked.size : 0,
    failed,
    deferredRevokes: ingested ? [] : [...revoked],
  };
}

const EMPTY_DRAIN: DrainOutcome = { applied: 0, revoked: 0, failed: [], deferredRevokes: [] };

/** Read the widget's timeline and apply whatever the Home Screen captured. */
export async function drainWidgetOutbox(deps?: DrainDeps): Promise<DrainOutcome> {
  const widget = getWidget();
  if (!widget) return EMPTY_DRAIN;
  let entries: { date: Date; props: CulpritWidgetProps }[] = [];
  try {
    entries = await widget.getTimeline();
  } catch (e) {
    console.warn('[widgetBridge] timeline read failed:', e);
    return EMPTY_DRAIN;
  }
  const outbox = collectOutbox(entries);
  if (outbox.pending.length === 0 && outbox.revoked.length === 0) return EMPTY_DRAIN;
  return applyOutbox(outbox, deps);
}

/** Push the current props to the widget (this also clears the drained outbox). */
export function publishWidgetTimeline(props: CulpritWidgetProps, now: Date = new Date()): void {
  const widget = getWidget();
  if (!widget) return;
  try {
    widget.updateTimeline(buildWidgetTimeline(props, now));
  } catch (e) {
    console.warn('[widgetBridge] timeline publish failed:', e);
  }
}

// Sign-out wipe for the widget's OWN store (B-054 FR-9 parity). The timeline
// lives in the App Group's UserDefaults, NOT in the container directory, so
// `clearWidgetData`'s directory delete does not touch it — without this, the
// previous account's pet name, slots and named foods would keep rendering on
// the Home Screen after sign-out. Publishing the signed-out props both erases
// that data and leaves the widget in its honest "sign in to start logging"
// state. Any un-drained captures are deliberately discarded with it: they
// belong to the account that just left (the same reasoning as the inbox wipe).
export function clearWidgetTimeline(): void {
  publishWidgetTimeline({
    schemaVersion: WIDGET_PROPS_SCHEMA_VERSION,
    pets: {},
    signedIn: false,
    ui: {},
    pending: [],
    revoked: [],
  });
}

/**
 * One full pass: drain what the Home Screen captured, then publish fresh props.
 *
 * `buildProps` is a callback, not a value, so the props are necessarily built
 * AFTER the drain has applied and ingested — otherwise the fresh snapshot would
 * pre-date the tap it is meant to reflect and the widget would drop its ✓ on a
 * capture that succeeded. Anything the drain could not finish (failed captures,
 * deferred revocations) is re-seeded into the published outbox so the next pass
 * retries it: publishing replaces the timeline, so what isn't carried is gone.
 */
export async function syncWidget(
  buildProps: () => Promise<CulpritWidgetProps>,
  opts?: { deps?: DrainDeps; now?: Date },
): Promise<DrainOutcome> {
  const outcome = await drainWidgetOutbox(opts?.deps);
  const props = await buildProps();
  publishWidgetTimeline(
    outcome.failed.length > 0 || outcome.deferredRevokes.length > 0
      ? { ...props, pending: outcome.failed, revoked: outcome.deferredRevokes }
      : props,
    opts?.now ?? new Date(),
  );
  return outcome;
}
