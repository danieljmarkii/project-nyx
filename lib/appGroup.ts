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

// Resolve (and lazily create) a widget-data subdirectory. Creation is
// idempotent; a failure returns null so callers no-op rather than throw into
// a sync cycle or an auth flow.
function widgetSubdirectory(name: string): Directory | null {
  const container = getAppGroupContainer();
  if (!container) return null;
  try {
    const dir = new Directory(container, WIDGET_DIR, name);
    dir.create({ intermediates: true, idempotent: true });
    return dir;
  } catch (e) {
    console.warn(`[appGroup] widget/${name} unavailable:`, e);
    return null;
  }
}

// The capture inbox — one JSON file per widget/intent capture, written by the
// extension, ingested + deleted by the app (lib/captureInbox.ts). File-per-
// record on purpose: appending to a single shared file would be a cross-process
// read-modify-write race between an intent writing and the app ingesting; a
// whole-file create is atomic enough that neither side ever sees a half-record.
export function getCaptureInboxDirectory(): Directory | null {
  return widgetSubdirectory(INBOX_DIR);
}

// The per-pet snapshot directory the widget renders from — written by the app
// (lib/widgetSnapshot.ts), read-only for the extension.
export function getSnapshotDirectory(): Directory | null {
  return widgetSubdirectory(SNAPSHOT_DIR);
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
