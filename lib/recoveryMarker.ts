// The local record that THIS device asked for a password reset (B-280 FR-12 +
// FR-14). Two jobs, one marker:
//
//   FR-12 — the address the owner typed, so §5.5's `Send a new link` and §5.5b
//           both return to a PRE-FILLED request screen. Without it, the cold-
//           start-from-link path (§10 rows 12/19) hands the owner a blank field
//           on the state most likely to strand them.
//   FR-14 — provenance. `nyx:///reset-password?code=x` is firable by any app or
//           webpage on the device (expo-router routes it the moment the screen
//           file exists), so an unauthenticated URL must never be able to arm the
//           recovery gate. No marker ⇒ refuse, and render §5.5b.
//
// Kept out of `lib/passwordRecovery.ts` so that module stays pure per spec §6.1.
// The classification rule here (`hasLocalProvenance`) is still pure and tested;
// only the read/write touches storage.
//
// AsyncStorage rather than SecureStore, deliberately: the marker must be readable
// on a cold start from a link, before any session exists, and it holds the
// owner's OWN address, which they just typed into the app on this device. It is
// cleared by `wipeLocalSession()` (below), so it does not survive a sign-out into
// the next account on a shared device — which is the exposure that would matter.

import AsyncStorage from '@react-native-async-storage/async-storage';

const REQUEST_KEY = 'nyx.recoveryRequest';

export type RecoveryRequest = {
  /** The address the reset was requested for (FR-2's pre-fill source). */
  email: string;
  /** When the request was made, epoch millis (FR-14's provenance window). */
  requestedAtMs: number;
};

// How long a recorded request grants provenance to an incoming link.
//
// Why a window at all: without one, a marker written months ago would let a
// hostile deep link (§10 row 23) pass FR-14 forever, which reduces the control to
// "has this owner ever used recovery". With one, the attack surface is bounded to
// a window the owner actually opened themselves.
//
// Why 24h: this MUST be >= the project's configured recovery-link lifetime, or a
// legitimate late tap on a still-valid link gets refused — the false-negative
// direction, which strands a real owner. That lifetime is a dashboard value the
// repo cannot read (§9.2 has it as an open PM check), so this is set generously
// above any plausible setting rather than tuned to a number we have not verified.
export const RECOVERY_PROVENANCE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Record the request at request time (FR-12), BEFORE the network call, so an
 * owner who requests a reset and then loses the app still has the marker when the
 * email arrives.
 *
 * Awaited by the caller: a write that hasn't landed cannot grant provenance to
 * the link that is about to arrive.
 */
export async function recordRecoveryRequest(
  email: string,
  nowMs: number,
): Promise<void> {
  const request: RecoveryRequest = { email: email.trim(), requestedAtMs: nowMs };
  try {
    await AsyncStorage.setItem(REQUEST_KEY, JSON.stringify(request));
  } catch (e) {
    // Non-fatal, and the caller does NOT abort the send: an owner who can't get a
    // marker written should still get their email. The cost is FR-14 refusing the
    // link when it arrives, which renders §5.5b — a designed state with a forward
    // action — rather than silently exchanging an unvouched-for code.
    console.warn('[recoveryMarker] failed to record request:', e);
  }
}

/** The marker, or null when this device never asked (or the blob is unreadable). */
export async function readRecoveryRequest(): Promise<RecoveryRequest | null> {
  try {
    const raw = await AsyncStorage.getItem(REQUEST_KEY);
    if (!raw) return null;
    return coerceRecoveryRequest(JSON.parse(raw));
  } catch {
    // A corrupt blob reads as "no marker" — fail-closed, and self-healing on the
    // next request rather than throwing on every deep link forever.
    return null;
  }
}

export async function clearRecoveryRequest(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REQUEST_KEY);
  } catch (e) {
    console.warn('[recoveryMarker] failed to clear request:', e);
  }
}

// Pure: accept only a fully-formed marker. A half-written or format-changed blob
// must not present as provenance.
export function coerceRecoveryRequest(value: unknown): RecoveryRequest | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.email !== 'string' || !v.email) return null;
  if (typeof v.requestedAtMs !== 'number' || !Number.isFinite(v.requestedAtMs)) {
    return null;
  }
  return { email: v.email, requestedAtMs: v.requestedAtMs };
}

/**
 * FR-14's predicate: may an incoming recovery link be honoured on this device?
 *
 * Pure, so §10 row 23 (the hostile deep link) is a unit test rather than a
 * Safari-and-a-stopwatch exercise.
 */
export function hasLocalProvenance(
  request: RecoveryRequest | null,
  nowMs: number,
  windowMs: number = RECOVERY_PROVENANCE_WINDOW_MS,
): boolean {
  if (!request) return false;
  const age = nowMs - request.requestedAtMs;
  // A future-dated marker (clock change, restored backup) is not provenance.
  if (age < 0) return false;
  return age <= windowMs;
}
