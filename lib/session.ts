import { notifySignedOut } from './sync';
import { clearLocalData } from './db';
import { usePetStore, clearPersistedActivePetId } from '../store/petStore';
import { useOnboardingDraftStore } from '../store/onboardingDraftStore';

// The local teardown that must run on sign-out AND on post-deletion sign-out
// (B-054 FR-9): abort in-flight hydration, wipe the synced SQLite copy + the
// on-device attachment files, clear the device-local active-pet selection, and
// reset the in-memory pet store. Single source of truth so the SIGNED_OUT auth
// handler (app/_layout.tsx) and the post-deletion fallback (DeleteAccountSheet)
// run the exact same sequence and can't drift — a stale local copy of pet-health
// data left behind after an account *deletion* is precisely what B-039 exists to
// prevent. Best-effort + idempotent: a wipe failure is logged, never thrown, so
// teardown always completes, and re-running it (e.g. the fallback after the event
// already fired) is harmless.
export async function wipeLocalSession(): Promise<void> {
  // Abort any in-flight hydration BEFORE wiping, so a sync mid-cycle can't
  // re-populate the store after clearLocalData runs.
  notifySignedOut();
  await clearLocalData().catch((e) => console.warn('[session] local wipe failed:', e));
  // Device-local active-pet selection is account state too — wipe it and the
  // in-memory pet list so the next sign-in starts clean (FR-9 parity).
  await clearPersistedActivePetId();
  usePetStore.getState().reset();
  // Clear any half-finished onboarding entry (a typed pet name/type) so it can't
  // carry into the next account's onboarding on this device (B-251 PR 7).
  useOnboardingDraftStore.getState().reset();
}
