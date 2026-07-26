import AsyncStorage from '@react-native-async-storage/async-storage';

// One-time cleanup of AsyncStorage keys written by code that no longer exists.
//
// WHY THIS NEEDS A HOME OF ITS OWN: a key that is only ever removed by
// wipeLocalSession (lib/session.ts) is removed only on SIGN-OUT. An owner who
// simply keeps using the app never signs out, so a retired key would sit on
// their device for the life of the install — which is exactly the situation
// B-301 leaves behind. The auth-diagnostic probe (#327) deliberately wrote
// OUTSIDE the sign-out wipe so its trail survived the SIGNED_OUT teardown it
// existed to investigate; with the probe deleted, that same choice means
// nothing on the device will ever reclaim the key. So the purge has to run at
// STARTUP, unconditionally, independent of auth state.
//
// This is not account state and must NOT move into wipeLocalSession — the two
// mechanisms answer different questions. wipeLocalSession answers "whose data
// is this?"; this answers "does anything still write this?".
const RETIRED_KEYS = [
  // B-301 / #327: the auth session-persistence probe's breadcrumb ring (up to
  // 500 entries). The root cause it was built to find was confirmed on build 33
  // (iOS keychain errSecInteractionNotAllowed on a locked-device background
  // refresh) and fixed in #350 (AFTER_FIRST_UNLOCK), so both the writer
  // (lib/authDebug.ts) and its viewer (app/settings/diagnostics.tsx) are gone.
  '__culprit_auth_debug_v1',
];

/**
 * Remove every retired key. Fire-and-forget by design: this is hygiene, never a
 * precondition for startup, so a failure must not throw into the launch path or
 * delay first paint. A miss is retried on the next launch — the keys are only
 * ever removed, so re-running is harmless and idempotent.
 */
export function purgeRetiredStorage(): void {
  // multiRemove over one round-trip rather than a removeItem per key: the list
  // is expected to grow as later probes retire, and this runs on every launch.
  AsyncStorage.multiRemove(RETIRED_KEYS).catch((e) => {
    console.warn('[retiredStorage] purge failed (non-fatal):', e);
  });
}

// Exported for the test only — the list is the thing worth asserting on, since
// a typo'd key silently purges nothing.
export const RETIRED_STORAGE_KEYS: readonly string[] = RETIRED_KEYS;
