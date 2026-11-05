// App Group shared container — the app↔extension data seam (B-290, widget PR W3).
//
// The Home Screen widget (W5) and its App Intents (W4) run in a separate iOS
// process that cannot touch the app's sandbox, its SQLite file, or its default
// keychain items. Everything the two processes share crosses exactly one of two
// bridges, both rooted in the App Group declared here:
//   1. the shared CONTAINER directory (this module) — the capture inbox the
//      extension appends to (lib/captureInbox.ts) and the per-pet snapshots the
//      app publishes for the widget to render (lib/widgetSnapshot.ts);
//   2. the shared KEYCHAIN access group (lib/secureStore.ts) — the Supabase
//      session, so an intent can write as the owner (never a service key on
//      device; spec §8).
//
// The group id doubles as the keychain access group: on iOS an App Group is
// usable as a kSecAttrAccessGroup directly (no team-id prefix, no separate
// keychain-access-groups entitlement) — which is why ONE constant here feeds
// both bridges and the entitlement in app.json. Renaming it is a breaking
// change for both stores at once; don't.
//
// Everything degrades to a clean no-op when the container is unavailable —
// Android (no App Groups), a binary built without the entitlement (Expo Go /
// a pre-W3 dev client), or a simulator misconfiguration — so no capture or
// snapshot code path may assume a non-null directory.

import { Platform } from 'react-native';
import { Directory, Paths } from 'expo-file-system';

// Must match ios.entitlements["com.apple.security.application-groups"] in
// app.json — CNG grants the container to the app target; the expo-widgets
// config plugin (W5) grants the same group to the extension target.
export const APP_GROUP_ID = 'group.com.projectnyx.app';

// All widget data lives under one subdirectory of the container so the
// sign-out wipe (clearWidgetData) is a single directory delete — nothing of
// the account's pet data can survive in a corner of the container the wipe
// didn't know about (B-054 FR-9 parity).
const WIDGET_DIR = 'widget';
const INBOX_DIR = 'inbox';
const SNAPSHOT_DIR = 'snapshots';

// The App Group container root, or null when unavailable (Android, or an iOS
// binary without the entitlement). Wrapped in try/catch because the native
// lookup throws rather than returning undefined on some misconfigurations.
export function getAppGroupContainer(): Directory | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return Paths.appleSharedContainers?.[APP_GROUP_ID] ?? null;
  } catch (e) {
    console.warn('[appGroup] shared container unavailable:', e);
    return null;
  }
}

// Resolve (and lazily create) a widget-data subdirectory.
//
// CUL-2570: three answers, never two. `none` is "this surface does not exist here" (no
// container: Android, no entitlement), and a reader may take it as empty. `unavailable` is a
// container that exists with a subdirectory that would not open, and nothing may take it as
// empty: the folder may hold captures the read cannot see, while the sign-out wipe still
// deletes it through the container. Creation is idempotent.
export type WidgetDirectory =
  | { status: 'ok'; dir: Directory }
  | { status: 'none' }
  | { status: 'unavailable' };

function widgetSubdirectory(name: string): WidgetDirectory {
  const container = getAppGroupContainer();
  if (!container) return { status: 'none' };
  try {
    const dir = new Directory(container, WIDGET_DIR, name);
    dir.create({ intermediates: true, idempotent: true });
    return { status: 'ok', dir };
  } catch (e) {
    console.warn(`[appGroup] widget/${name} unavailable:`, e);
    return { status: 'unavailable' };
  }
}

// The capture inbox — one JSON file per widget/intent capture, written by the
// extension, ingested + deleted by the app (lib/captureInbox.ts). File-per-
// record on purpose: appending to a single shared file would be a cross-process
// read-modify-write race between an intent writing and the app ingesting; a
// whole-file create is atomic enough that neither side ever sees a half-record.
//
// CUL-2570: every reader that COUNTS or KEEPS from the inbox opens it here, so an inbox that
// would not open is told apart from no inbox at all.
export function openCaptureInbox(): WidgetDirectory {
  return widgetSubdirectory(INBOX_DIR);
}

// The inbox directory, or null for both `none` and `unavailable`. Only for paths where the
// two mean the same thing: the ingest (it does nothing either way, and the records stay) and
// the extension's write (either way the tap fails, loudly). A count or a keep-set uses
// `openCaptureInbox`.
export function getCaptureInboxDirectory(): Directory | null {
  const inbox = openCaptureInbox();
  return inbox.status === 'ok' ? inbox.dir : null;
}

// The per-pet snapshot directory the widget renders from — written by the app
// (lib/widgetSnapshot.ts), read-only for the extension.
export function getSnapshotDirectory(): Directory | null {
  const dir = widgetSubdirectory(SNAPSHOT_DIR);
  return dir.status === 'ok' ? dir.dir : null;
}

// Sign-out wipe (B-054 FR-9 parity — called from lib/session.ts alongside
// clearLocalData). The container outlives the app's sandbox-scoped teardown,
// and both its halves are account data: snapshots ARE pet health data, and an
// un-ingested inbox record is a capture belonging to the account that made it —
// carrying it across a sign-in would write one account's event into another's
// record. Best-effort + idempotent, like the rest of the wipe.
export function clearWidgetData(): void {
  const container = getAppGroupContainer();
  if (!container) return;
  try {
    const dir = new Directory(container, WIDGET_DIR);
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('[appGroup] widget data wipe failed:', e);
  }
}
