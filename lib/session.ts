import { notifySignedOut } from './sync';
import { clearLocalData } from './db';
import { clearWidgetData } from './appGroup';
import { clearWidgetTimeline } from './widgetBridge';
import { clearRecoveryRequest } from './recoveryMarker';
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
  // B-290 (FR-9 parity): the App Group container is OUTSIDE the app sandbox and
  // holds account data on a Home Screen surface — per-pet snapshots and any
  // un-ingested widget captures. Wipe it with the rest, or the next sign-in on
  // this device inherits (and could even ingest) the previous account's data.
  // (The shared-keychain session copy is cleared by the auth adapter's own
  // removeItem on SIGNED_OUT — lib/secureStore.ts.)
  clearWidgetData();
  // W5: the widget's own timeline lives in the App Group's UserDefaults, not in
  // the container directory clearWidgetData() deletes — so it needs its own
  // wipe, or the Home Screen keeps showing the previous account's pet.
  clearWidgetTimeline();
  // Device-local active-pet selection is account state too — wipe it and the
  // in-memory pet list so the next sign-in starts clean (FR-9 parity).
  await clearPersistedActivePetId();
  usePetStore.getState().reset();
  // Clear any half-finished onboarding entry (a typed pet name/type) so it can't
  // carry into the next account's onboarding on this device (B-251 PR 7).
  useOnboardingDraftStore.getState().reset();
  // B-280 FR-12: the recovery marker holds the address a reset was requested for.
  // It is account state, so it goes with the rest — otherwise the request screen
  // pre-fills the PREVIOUS owner's email for the next person to sign in on a
  // shared device, which is Sam's household iPad exactly.
  //
  // ORDERING NOTE for the §6.4 handler, which is easy to get wrong: the wipe runs
  // at step 5 (the pre-exchange signOut), BEFORE the exchange at step 6. So FR-12's
  // pre-fill on a failure state must come from the value the handler already read
  // at step 2 (the provenance check) and holds in memory for the attempt — not
  // from a re-read of disk, which this line has by then cleared.
  //
  // Deliberately NOT cleared here: the FR-6 recovery gate. The §6.4 signOut is what
  // triggers this wipe, so clearing the gate here would destroy it at the exact
  // moment it is needed — the same trap `justDeletedAccount` avoids by not being
  // touched on teardown (spec §6.3).
  await clearRecoveryRequest();
}
