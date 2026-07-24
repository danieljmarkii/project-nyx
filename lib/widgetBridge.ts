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
  failed: number;
}

export interface DrainDeps {
  logMeal: typeof logMealIntent;
  logTreat: typeof logTreatIntent;
  topUpBowl: typeof topUpBowlIntent;
  /** Soft-delete an already-ingested event; must be a no-op if it isn't there. */
  revokeEvent: (eventId: string) => Promise<void>;
}

function defaultDrainDeps(): DrainDeps {
  return {
    logMeal: logMealIntent,
    logTreat: logTreatIntent,
    topUpBowl: topUpBowlIntent,
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

// Pure-ish core: given the outbox, apply it. Exported for the unit test (the
// production function runs against fakes, not a copy of itself).
//
// A revoked id is never applied AND is soft-deleted if an earlier drain already
// ingested it — one undo path, honest whichever side of the drain the owner
// tapped on (the W3 §4.1 Q5 recommendation). A bowl top-up creates no row, so
// its revoke is pre-drain only; once drained, the re-attest stands and the
// widget's undo affordance is already gone (the publish that follows the drain
// clears it). That asymmetry is documented, not hidden.
export async function applyOutbox(
  outbox: { pending: WidgetPendingCapture[]; revoked: string[] },
  deps: DrainDeps = defaultDrainDeps(),
): Promise<DrainOutcome> {
  const revoked = new Set(outbox.revoked);
  let applied = 0;
  let failed = 0;
  for (const capture of outbox.pending) {
    if (revoked.has(capture.id)) continue;
    try {
      if (await applyCapture(capture, deps)) applied++;
      else failed++;
    } catch (e) {
      console.warn('[widgetBridge] capture apply failed:', e);
      failed++;
    }
  }
  for (const id of revoked) {
    try {
      await deps.revokeEvent(id);
    } catch (e) {
      console.warn('[widgetBridge] revoke failed:', e);
    }
  }
  return { applied, revoked: revoked.size, failed };
}

/** Read the widget's timeline and apply whatever the Home Screen captured. */
export async function drainWidgetOutbox(deps?: DrainDeps): Promise<DrainOutcome> {
  const widget = getWidget();
  if (!widget) return { applied: 0, revoked: 0, failed: 0 };
  let entries: { date: Date; props: CulpritWidgetProps }[] = [];
  try {
    entries = await widget.getTimeline();
  } catch (e) {
    console.warn('[widgetBridge] timeline read failed:', e);
    return { applied: 0, revoked: 0, failed: 0 };
  }
  const outbox = collectOutbox(entries);
  if (outbox.pending.length === 0 && outbox.revoked.length === 0) {
    return { applied: 0, revoked: 0, failed: 0 };
  }
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
 * Drain first — see the ORDER note in the module header.
 */
export async function syncWidget(
  props: CulpritWidgetProps,
  opts?: { deps?: DrainDeps; now?: Date },
): Promise<DrainOutcome> {
  const outcome = await drainWidgetOutbox(opts?.deps);
  publishWidgetTimeline(props, opts?.now ?? new Date());
  return outcome;
}
