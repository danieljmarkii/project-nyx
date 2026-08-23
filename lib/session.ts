import { notifySignedOut, flushPendingForSignOut } from './sync';
import { clearLocalData, getSyncStatus } from './db';
import { clearWidgetData } from './appGroup';
import { clearWidgetTimeline } from './widgetBridge';
import { clearRecoveryRequest } from './recoveryMarker';
import { usePetStore, clearPersistedActivePetId } from '../store/petStore';
import { useOnboardingDraftStore } from '../store/onboardingDraftStore';
import { clearTrialContextCache, clearTrialHeadsUpLedger } from './trialContaminant';
import { clearCachedAppConfig } from './appConfig';
import { clearBetaOptIns } from './betaFeatures';
import { clearDailyRecapOffer } from './dailyRecapOffer';
import { clearSignalArrival } from './signalArrival';
import { cancelAllScheduledNotifications, clearNotificationInteractions } from './notifications';

/**
 * B-430 — the pre-sign-out drain. Push everything that can still be pushed, then
 * report what is STILL unsent, so the caller can ask the owner before the wipe
 * destroys it.
 *
 * The gap: `wipeLocalSession()` below clears local SQLite unconditionally,
 * INCLUDING rows still at `synced = 0`. So a sign-out has always silently
 * destroyed offline captures — the meals logged in a basement flat, the symptom
 * photographed in a car park at 6am. It was latent until B-280's D6b ruling made
 * it involuntarily reachable, but a deliberate sign-out has cost the same data all
 * along, and on a household sharing one credential across two phones a sign-out is
 * a routine act rather than a rare one.
 *
 * FLUSH-BEFORE-WIPE, NOT QUARANTINE-ACROSS-THE-WIPE. The alternative — holding
 * unsynced rows back from the wipe and prompting later — collides head-on with
 * FR-9, which is the reason the wipe exists: a shared or borrowed device must not
 * leak the prior account's health record to whoever signs in next. A retained
 * cache of that account's meals, symptom events and photos IS that leak, however
 * it is labelled, and it would need its own account-scoped storage and its own
 * "whose rows are these?" answer at the next sign-in. Flushing keeps the wipe
 * absolute and puts the residue where it belongs: an honest sentence to the owner
 * about what could not be saved.
 *
 * Deliberately does NOT sign out, wipe, or prompt. The mechanism is here; the
 * decision is the UI's.
 *
 * Best-effort throughout: a flush that fails (offline, mid-air) must never block
 * the owner from signing out, so every failure degrades to "report what we know"
 * rather than throwing.
 */
export async function flushForSignOut(): Promise<{
  pendingCount: number;
  quarantinedCount: number;
}> {
  await flushPendingForSignOut().catch((e) =>
    console.warn('[session] pre-sign-out flush failed:', e));
  try {
    const status = await getSyncStatus();
    return {
      pendingCount: status.pendingCount,
      quarantinedCount: status.quarantinedCount,
    };
  } catch (e) {
    // A status read that fails tells us nothing, and "nothing" must not read as
    // "all clear" — that would silently skip the warning on exactly the broken
    // device most likely to be holding unsent rows. Report one unsent item so the
    // owner is asked rather than assumed-at.
    console.warn('[session] pre-sign-out status read failed:', e);
    return { pendingCount: 1, quarantinedCount: 0 };
  }
}

/**
 * The sentence shown before a sign-out that would destroy unsent work, or null
 * when there is nothing to warn about (the overwhelmingly common case — the
 * owner is online, the flush drained the queue, and sign-out proceeds silently).
 *
 * Voice: names the number, names the consequence in plain words, blames nobody.
 * It does NOT say "sync failed" or "error" — from the owner's side nothing failed,
 * they simply logged something while their phone could not reach the network. It
 * does not tell them to connect to the internet either: the flush just tried that.
 */
export function unsentSignOutWarning(counts: {
  pendingCount: number;
  quarantinedCount: number;
}): { title: string; message: string } | null {
  const total = counts.pendingCount + counts.quarantinedCount;
  if (total <= 0) return null;
  const entries = total === 1 ? '1 entry' : `${total} entries`;
  return {
    title: 'Some entries are still on this phone',
    message:
      `${entries} haven't reached your records yet. Signing out clears this ` +
      'phone, so they would be lost. You can stay signed in and try again later.',
  };
}

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
  // B-661 (Trust & Safety, non-negotiable): a scheduled local notification lives
  // in the OS, entirely outside the app sandbox clearLocalData wipes — so a 9pm
  // Day Summary scheduled by the account signing out would still fire on a shared
  // device and name the previous owner's pet on the lock screen. Same leak class
  // as the App Group wipe above. Cancel every scheduled notification on sign-out;
  // then clear the interaction ledger (AsyncStorage, also outside SQLite — the
  // previous owner's per-category notification-interaction history). Both are
  // internally best-effort (never throw), so teardown always continues.
  await cancelAllScheduledNotifications();
  await clearNotificationInteractions();
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
  // at step 4 (`setSession(null)` + this call, invoked DIRECTLY — B-576 option (d),
  // NOT via a pre-exchange `signOut()`, which would delete the PKCE verifier the
  // exchange needs), BEFORE the exchange at step 5. So FR-12's pre-fill on a failure
  // state must come from the value the handler already read at step 2 (the
  // provenance check) and holds in memory for the attempt — not from a re-read of
  // disk, which this line has by then cleared.
  //
  // Deliberately NOT cleared here: the FR-6 recovery gate. The §6.4 handler calls
  // this wipe directly while the gate is armed, so clearing the gate here would
  // destroy it at the exact moment it is needed — the same trap `justDeletedAccount`
  // avoids by not being touched on teardown (spec §6.3).
  await clearRecoveryRequest();
  // B-351 slice 4: the active-trial protein context is memoized per pet in a
  // module-level Map with a 5-minute TTL. It is account data — the trial's target
  // protein and the trial food's own protein set — and it lives in JS memory, so
  // clearLocalData never touches it. Without this, signing into a second account
  // within the TTL could evaluate the new account's meals against the previous
  // account's trial (pet ids are uuids so a collision is not the risk; a lingering
  // context for a pet id that is simply gone is). Same FR-9 parity reasoning as the
  // App Group wipe above: wipe every place account data rests, not just SQLite.
  clearTrialContextCache();
  // …and the persisted "which foods have we already flagged" ledger, which lives
  // in AsyncStorage (outside the SQLite clearLocalData wipes) and is per-account
  // bookkeeping. Awaited-with-catch like the rest: never throws, always completes.
  await clearTrialHeadsUpLedger().catch((e) =>
    console.warn('[session] trial heads-up ledger clear failed:', e));
  // B-712 — the Beta-features opt-ins (Gate 2), an AsyncStorage-resident per-device
  // preference. Not health data, but it is account-adjacent device state: the prior
  // owner's beta choices must not carry to the next person on a shared device, and a
  // widget left "on" for a signed-out account must fall back to the neutral empty
  // door (the eligibility gate re-fails closed anyway, but the opt-in should not
  // linger). Same FR-9 parity rule as the active-pet selection and the app_config
  // cache. Wipes both the in-memory store and the key; internally best-effort.
  await clearBetaOptIns();
  // B-402 — the app_config last-known-good cache, also AsyncStorage-resident. The
  // flags are global product config rather than this account's data, which is why
  // this is hygiene and not a health-data leak — but the same blob holds the
  // experimental allowlist, i.e. a set of other users' UUIDs left on a device the
  // next person signs into. Same rule as the two clears above: wipe every place
  // account-session state rests, not just SQLite. The next launch resolves from the
  // shipped defaults until the first authenticated fetch, exactly as a fresh
  // install does.
  await clearCachedAppConfig();
  // DR-3 (§4) — the Daily Recap offer markers (the 30-day "Not now" quiet + the two
  // once-ever value-moment flags), AsyncStorage-resident like the ledgers above.
  // Account-adjacent device state: the prior owner's "already offered / quieted for
  // 30 days" must not carry to the next person on a shared device, or a fresh account
  // never sees the banner it should. Same FR-9 parity rule as the clears above.
  await clearDailyRecapOffer();
  // CUL-601 (§4) — the per-pet first-insight arrival markers, AsyncStorage-resident
  // like the clears above. Not health data, but leaving them behind breaks the feature
  // in the direction that cannot be noticed: the next account's pet reaches its first
  // real insight and the moment is silently skipped, because a marker written for a
  // pet id this device no longer knows says it already played. (Pet ids are uuids, so
  // a literal collision is not the risk — an inherited "already played" map is.) Same
  // FR-9 parity rule as the rest of this list.
  await clearSignalArrival();
}
