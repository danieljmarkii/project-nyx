// The keychain TIER CONTRACT — key derivation, options, and pointer format —
// shared by the app-side chunked adapter (lib/secureStore.ts) and the
// extension-side read-only session reader (lib/widgetSession.ts).
//
// Split out of secureStore.ts (W4 code review) for the same reason
// captureRecord.ts exists: Metro bundles whole modules, and secureStore.ts
// imports lib/authDebug.ts (AsyncStorage-backed diagnostic scaffolding) that
// must not ship into the widget extension bundle. This module's imports are
// only expo-secure-store (the options type + accessibility constant) and the
// App Group id — both things the extension needs anyway. The adapter logic
// (chunking, generations, retention) stays in secureStore.ts; what lives here
// is exactly the contract both processes must agree on, so neither side can
// drift from the other.

import * as SecureStore from 'expo-secure-store';
import { APP_GROUP_ID } from './appGroup';

// Keychain accessibility for every key we write. This is the SECOND half of the
// frequent-logout fix (the first was chunking, #306). expo-secure-store defaults
// to `WHEN_UNLOCKED`, which makes an item UNREADABLE and UNWRITABLE while the
// device is locked — so `autoRefreshToken`'s ~hourly background refresh, if it
// fires while the phone is locked, throws `errSecInteractionNotAllowed`: getItem
// returns null (client sees "no session") and the refreshed token can't be saved.
// The diagnostic build 33 caught exactly this — three `sec.get {path:"error"}`
// breadcrumbs mid-background, recovering to `path:"ok"` the instant the app was
// unlocked. `AFTER_FIRST_UNLOCK` keeps the session readable while locked once the
// device has been unlocked at least once since boot — the correct class for a
// credential a background task must refresh. Backup-migration posture is
// unchanged from the old `WHEN_UNLOCKED` default (both are iCloud-migratable); a
// stricter `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` is a Trust & Safety follow-up if
// we decide session tokens should never ride an encrypted backup to a new device.
export const WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// ── Shared keychain tier (B-290, widget PR W3) ────────────────────────────────
//
// The widget's App Intents (W4) write as the OWNER — never a service key on
// device (spec §8) — which means the extension process must be able to read the
// Supabase session. On iOS the App Group id doubles as a keychain access group
// (kSecAttrAccessGroup accepts a `group.*` id directly, no team prefix, no
// separate keychain-access-groups entitlement), so the session moves from the
// app's default keychain group into the shared one.
const SHARED_ACCESS_GROUP = APP_GROUP_ID;

export const SHARED_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  accessGroup: SHARED_ACCESS_GROUP,
};

// A storage tier: how to derive this tier's key names and which options every
// SecureStore call against it must carry. Used by the app-side adapter for all
// three of its tiers and by the W4 extension-side session reader, which must
// use the exact same shared-tier contract.
//
// CROSS-PROCESS READER NOTE (for W4): processLock serializes only THIS app's
// auth ops — the extension reads from another OS process with no lock at all.
// The generation scheme covers that reader too, but only because of the
// retention rule in secureStore.ts: the writer RETAINS the just-superseded
// generation (tracked by retainedKey) and prunes only the one from two writes
// ago. A reader that grabbed the old pointer just before a commit can
// therefore still finish reading that generation's chunks — the writes that
// could delete them are a full write-cycle away (an hour at refresh cadence),
// not racing microseconds behind. Without retention, the post-commit cleanup
// deletes the exact chunks a mid-read extension is following, and it would
// see a torn read (= "not signed in") on a perfectly healthy session.
export interface StorageTier {
  label: 'shared' | 'local';
  pointerKey(key: string): string;
  chunkKey(key: string, gen: number, i: number): string;
  /** Bookkeeping pointer naming the RETAINED (previous) generation. */
  retainedKey(key: string): string;
  options: SecureStore.SecureStoreOptions;
}

// Sibling keys derived from the logical key. The suffixes use only characters
// SecureStore allows ([A-Za-z0-9._-]); the Supabase key (`sb-<ref>-auth-token`)
// already satisfies that, so the derived keys do too.
//
// WHY THE SHARED TIER HAS ITS OWN KEY NAMES (`__ag` infix), not just an options
// flag: iOS keychain queries WITHOUT kSecAttrAccessGroup match items across
// every group the app can access, and SecItemDelete deletes ALL matches. With
// identical key names in two groups, the post-migration cleanup of the old
// default-group copy would delete the just-written shared copy too. Distinct
// names make cross-group collisions structurally impossible.
export const LOCAL_TIER: StorageTier = {
  label: 'local',
  pointerKey: (key) => `${key}__ptr`,
  chunkKey: (key, gen, i) => `${key}__g${gen}_c${i}`,
  retainedKey: (key) => `${key}__prevptr`,
  options: WRITE_OPTIONS,
};

export const SHARED_TIER: StorageTier = {
  label: 'shared',
  pointerKey: (key) => `${key}__ag__ptr`,
  chunkKey: (key, gen, i) => `${key}__ag__g${gen}_c${i}`,
  retainedKey: (key) => `${key}__ag__prevptr`,
  options: SHARED_OPTIONS,
};

// The pointer value: "<generation>:<chunkCount>", both non-negative integers.
// Parsed strictly — a value that doesn't match exactly is treated as absent, so a
// corrupted pointer degrades to a clean re-login rather than a wrong read.
const POINTER_RE = /^(\d+):(\d+)$/;

// Pure pointer parse — both processes interpret pointer values with EXACTLY
// this logic; a second regex would be a drift seam between them.
export function parsePointer(raw: string | null): { gen: number; count: number } | null {
  if (raw == null) return null;
  const m = POINTER_RE.exec(raw);
  if (!m) return null;
  return { gen: Number.parseInt(m[1], 10), count: Number.parseInt(m[2], 10) };
}
