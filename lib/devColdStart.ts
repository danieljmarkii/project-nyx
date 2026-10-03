// The `__DEV__` forced cold start (CUL-1222, MFU-2).
//
// The cold-start wait (Design v2's silhouette, the night moment flag-off) shows only on a
// session's first sync over an EMPTY local store (`isLocalDataEmpty`, hooks/useSync.ts).
// Signing out wipes the store, but it also clears the beta opt-ins (lib/session.ts), so an
// account with data is never both empty and opted in: the flag-on wait could not be
// reached on a phone at all, and step 1 of the device sitting (CUL-1529) had nothing to
// judge. This arms ONE blocking first sync on the next launch instead:
//
//     await __forceColdStart()      // from the Metro / debugger console
//     r                             // reload in Metro
//
// The next session's first sync then blocks behind the real overlay over the real
// hydration, exactly as a fresh install would, and the arm is consumed by that read so it
// fires once. Persisted (AsyncStorage) because the reload that makes it a COLD start also
// discards every module's memory. It is a developer's switch, not account state: it names
// no account, holds no record, and is consumed on the next launch whoever signs in, so it
// is not in `wipeLocalSession`. Every entry point returns at `!__DEV__`, and Metro strips
// the branch from a release bundle.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const FORCE_COLD_START_KEY = 'dev.forceColdStart';

/** Arm one blocking first sync for the next launch. Dev-only; a no-op otherwise. */
export async function forceNextColdStart(): Promise<boolean> {
  if (!__DEV__) return false;
  await AsyncStorage.setItem(FORCE_COLD_START_KEY, '1');
  console.log('[coldStart] armed: reload the app (r in Metro) to see the cold-start wait');
  return true;
}

/**
 * Read and clear the arm. True once after `forceNextColdStart`, false otherwise, false on
 * any storage failure (the overlay stays off, today's behaviour), and always false in a
 * release build.
 */
export async function consumeForcedColdStart(): Promise<boolean> {
  if (!__DEV__) return false;
  try {
    const armed = await AsyncStorage.getItem(FORCE_COLD_START_KEY);
    if (armed === null) return false;
    await AsyncStorage.removeItem(FORCE_COLD_START_KEY);
    return true;
  } catch (e) {
    console.warn('[coldStart] forced cold start unreadable:', e);
    return false;
  }
}
