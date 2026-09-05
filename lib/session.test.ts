import AsyncStorage from '@react-native-async-storage/async-storage';

// The native-heavy halves are mocked; the AsyncStorage-backed halves (the recovery
// marker, the recovery gate, the active-pet key) run for real, because they are
// exactly what this test is about.
jest.mock('./sync', () => ({
  notifySignedOut: jest.fn(),
  flushPendingForSignOut: jest.fn().mockResolvedValue(undefined),
  // lib/signal's regen flushes both queues before it invokes. Stubbed so the CUL-642
  // teardown test can run the REAL debounce → regen path and observe it at the wire.
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./db', () => ({
  clearLocalData: jest.fn().mockResolvedValue(undefined),
  getSyncStatus: jest.fn().mockResolvedValue({
    pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0,
  }),
}));
jest.mock('./appGroup', () => ({ clearWidgetData: jest.fn() }));
jest.mock('./widgetBridge', () => ({ clearWidgetTimeline: jest.fn() }));
// lib/notifications imports expo-notifications (throws at import without the
// native module). Mock it — this test only cares that wipeLocalSession CALLS the
// sign-out cancellation; the primitive's own behavior is covered by
// notifications.test.ts.
jest.mock('./notifications', () => ({
  cancelAllScheduledNotifications: jest.fn().mockResolvedValue(undefined),
  clearNotificationInteractions: jest.fn().mockResolvedValue(undefined),
}));
// session.ts pulls lib/trialContaminant for the B-351 slice-4 teardown, and that
// module imports lib/supabase, which fail-fasts on missing env under jest. Stub
// the client only — the two teardown functions themselves run for real below
// (one is in-memory, one is AsyncStorage-backed), which is the same split the
// note above describes.
jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: jest.fn().mockResolvedValue({ error: null }) } },
}));

import { wipeLocalSession, flushForSignOut, unsentSignOutWarning } from './session';
import { notifySignedOut, flushPendingForSignOut } from './sync';
import { clearLocalData, getSyncStatus } from './db';
import { clearWidgetData } from './appGroup';
import { clearWidgetTimeline } from './widgetBridge';
import { cancelAllScheduledNotifications, clearNotificationInteractions } from './notifications';
import { readRecoveryRequest, recordRecoveryRequest } from './recoveryMarker';
import { hasFlaggedFoodInTrial, recordFlaggedFoodInTrial } from './trialContaminant';
import { armRecoveryGate, useAuthStore } from '../store/authStore';
import { persistAppConfig, loadCachedAppConfig, APP_CONFIG_DEFAULTS } from './appConfig';
import { useBetaOptInStore, BETA_OPT_IN_STORAGE_KEY } from './betaFeatures';
import { quietDailyRecapOffer, readOfferState } from './dailyRecapOffer';
import { hasPlayedArrival, markArrivalPlayed } from './signalArrival';
import { readFoldEntries, writeFoldEntries } from './signalFold';
import { readObservationFold, setObservationFold } from './observationFold';
import { triggerSignalRegenDebounced } from './signal';
import { supabase } from './supabase';
import { useSyncStore } from '../store/syncStore';

const GATE_KEY = 'nyx.recoveryInProgress';
const t0 = 1_700_000_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  (clearLocalData as jest.Mock).mockResolvedValue(undefined);
  (flushPendingForSignOut as jest.Mock).mockResolvedValue(undefined);
  (getSyncStatus as jest.Mock).mockResolvedValue({
    pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0,
  });
  useAuthStore.setState({ recoveryInProgress: false });
});

describe('wipeLocalSession — the shipped SIGNED_OUT teardown', () => {
  it('runs every teardown step', async () => {
    await wipeLocalSession();
    expect(notifySignedOut).toHaveBeenCalled();
    expect(clearLocalData).toHaveBeenCalled();
    expect(clearWidgetData).toHaveBeenCalled();
    expect(clearWidgetTimeline).toHaveBeenCalled();
    expect(cancelAllScheduledNotifications).toHaveBeenCalled();
    expect(clearNotificationInteractions).toHaveBeenCalled();
  });

  // B-661 (Trust & Safety, non-negotiable). A scheduled local notification lives
  // in the OS, outside the app sandbox clearLocalData wipes — so an opted-in 9pm
  // Day Summary scheduled by the account signing out would still fire on a shared
  // device and name the previous owner's pet on the lock screen. The wipe must
  // cancel every scheduled notification, and the interaction ledger (AsyncStorage,
  // also outside SQLite) goes with it.
  it('cancels every scheduled notification so a 9pm summary can never fire after sign-out', async () => {
    await wipeLocalSession();
    expect(cancelAllScheduledNotifications).toHaveBeenCalledTimes(1);
    expect(clearNotificationInteractions).toHaveBeenCalledTimes(1);
  });

  it('still cancels scheduled notifications when an earlier wipe step throws', async () => {
    // The T&S cancellation is the highest-stakes step; a failure in an earlier
    // step must never skip it. Same best-effort contract as clearWidgetTimeline.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    (clearLocalData as jest.Mock).mockRejectedValueOnce(new Error('sqlite gone'));
    await wipeLocalSession();
    expect(cancelAllScheduledNotifications).toHaveBeenCalled();
  });

  // B-351 slice 4. The trial heads-up ledger is per-account bookkeeping living in
  // AsyncStorage, OUTSIDE the SQLite clearLocalData wipes — so without an explicit
  // clear it survives a sign-out and the next account on this device inherits
  // "already told you about that food" for foods it has never seen.
  it('wipes the trial heads-up ledger — it is account state outside SQLite', async () => {
    await recordFlaggedFoodInTrial('t1', 'chicken-treat');
    expect(await hasFlaggedFoodInTrial('t1', 'chicken-treat')).toBe(true);
    await wipeLocalSession();
    expect(await hasFlaggedFoodInTrial('t1', 'chicken-treat')).toBe(false);
  });

  // B-402. The app_config bundle is cached in AsyncStorage, outside the SQLite
  // clearLocalData wipes. The values are global product config, but the same blob
  // holds the experimental allowlist — other users' UUIDs — so it must not outlive
  // the session on a shared device.
  it('clears the cached app_config bundle, allowlist UUIDs included', async () => {
    await persistAppConfig({
      values: APP_CONFIG_DEFAULTS,
      allowlist: {
        ask_enabled: ['11111111-2222-3333-4444-555555555555'],
        ask_general_enabled: false,
        // widget_enabled (B-712) also carries account UUIDs — it must be wiped too.
        widget_enabled: { enabled: false, allowlist: ['66666666-7777-8888-9999-000000000000'] },
        // log_picker_v2 (B-745) is the same allowlist shape — account UUIDs wiped too.
        log_picker_v2: { enabled: false, allowlist: ['bbbbbbbb-cccc-dddd-eeee-ffffffffffff'] },
        // event_types_v2 (B-756 W1-PR-0) — same allowlist shape, account UUIDs wiped too.
        event_types_v2: { enabled: false, allowlist: ['12121212-3434-5656-7878-909090909090'] },
      },
    });
    expect(await loadCachedAppConfig()).not.toBeNull();
    await wipeLocalSession();
    expect(await loadCachedAppConfig()).toBeNull();
  });

  // B-712 (Gate 2 / D4). The local beta opt-ins are AsyncStorage-resident device
  // state; on a shared device the prior owner's choices must not carry to the next
  // person, and a widget left "on" must fall back to the neutral door.
  it('clears the beta opt-ins — memory and the persisted key', async () => {
    useBetaOptInStore.getState().setOptIn('widget_enabled', true);
    await Promise.resolve(); // let the fire-and-forget write-through flush
    expect(await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY)).not.toBeNull();

    await wipeLocalSession();

    expect(useBetaOptInStore.getState().optIns).toEqual({});
    expect(await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY)).toBeNull();
  });

  // DR-3 (§4). The Daily Recap offer markers (the 30-day "Not now" quiet + the two
  // once-ever value-moment flags) live in AsyncStorage, outside the SQLite
  // clearLocalData wipes. On a shared device the prior owner's "already offered /
  // quieted" state must not carry to the next person, or a fresh account never sees
  // the banner it should.
  it('clears the Daily Recap offer markers — account state outside SQLite', async () => {
    await quietDailyRecapOffer();
    expect((await readOfferState()).quietUntilMs).toBeDefined();
    await wipeLocalSession();
    expect(await readOfferState()).toEqual({});
  });

  // CUL-601 (§4). The per-pet first-insight arrival markers, AsyncStorage-resident like
  // the offer markers above. This one breaks in the direction nobody reports: an
  // inherited "already played" map means the NEXT account's pet reaches its first real
  // insight and the moment is silently skipped — a feature that fails by not happening.
  it('clears the first-insight arrival markers — a shared device never eats the next owner’s moment', async () => {
    await markArrivalPlayed('pet-a');
    expect(await hasPlayedArrival('pet-a')).toBe(true);
    await wipeLocalSession();
    expect(await hasPlayedArrival('pet-a')).toBe(false);
  });

  // CUL-784 (fold spec DF-6). The per-pet Signal fold entries live in AsyncStorage,
  // outside the SQLite wipe. A fold is the READER's "I have read this"; inherited by the
  // next account on a shared device it would compress a card about a pet that person
  // has never seen. Asserted by name, through the module's own read.
  it('clears the Signal fold entries — a shared device never inherits the previous reader’s folds', async () => {
    await writeFoldEntries('pet-a', {
      'postprandial_timing:vomit': {
        state: 'folded',
        fingerprint: { type: 'postprandial_timing', rapidCount: 8 },
        foldedAtIso: '2026-09-03T12:00:00.000Z',
      },
    });
    expect(await readFoldEntries('pet-a')).toHaveProperty('postprandial_timing:vomit');
    await wipeLocalSession();
    expect(await readFoldEntries('pet-a')).toEqual({});
  });

  // CUL-803 (incident spec §5.3). The Signal fold's sibling: the per-record observation
  // folds also live in AsyncStorage, outside the SQLite wipe. Inherited by the next
  // account on a shared device, they would compress the findings on an incident belonging
  // to a pet that person has never seen. Asserted by name, through the module's own read.
  it('clears the observation folds — a shared device never inherits the previous reader’s folds', async () => {
    await setObservationFold('pet-a', 'ev-1', true, '2026-09-05T12:00:00.000Z');
    expect(await readObservationFold('pet-a', 'ev-1')).toBe(true);
    await wipeLocalSession();
    expect(await readObservationFold('pet-a', 'ev-1')).toBe(false);
  });

  it('never throws when a wipe step fails — teardown always completes', async () => {
    // Best-effort + idempotent is the stated contract: a failure is logged, never
    // thrown, so a later step is not skipped by an earlier one's error.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    (clearLocalData as jest.Mock).mockRejectedValueOnce(new Error('sqlite gone'));
    await expect(wipeLocalSession()).resolves.toBeUndefined();
    expect(clearWidgetTimeline).toHaveBeenCalled();
  });

  it('clears the recovery marker — it is the previous owner’s email (B-280 FR-12)', async () => {
    await recordRecoveryRequest('jordan@example.com', t0);
    await wipeLocalSession();
    expect(await readRecoveryRequest()).toBeNull();
  });

  it('does NOT clear the recovery gate — the §6.4 signOut is what triggers this wipe', async () => {
    // The load-bearing assertion of this file. §6.4 signs out at step 5 to let this
    // teardown run in full, THEN exchanges the recovery code at step 6 — so a wipe
    // that cleared the gate would destroy it at the exact moment it is needed, and
    // the owner would land in the tabs with their password unchanged (Trap 1). Same
    // reason `justDeletedAccount` is deliberately untouched here (§6.3).
    await armRecoveryGate();
    await wipeLocalSession();
    expect(useAuthStore.getState().recoveryInProgress).toBe(true);
    expect(await AsyncStorage.getItem(GATE_KEY)).toBe('1');
  });
});

// ── B-430 — sign-out no longer silently destroys offline captures ────────────
//
// wipeLocalSession clears local SQLite unconditionally, INCLUDING rows still at
// synced = 0. So signing out has always destroyed every offline capture that had
// not reached the server: the meals logged in a basement flat, the symptom
// photographed in a car park at 6am. On a household sharing one credential across
// two phones, sign-out is routine rather than rare.
//
// The fix is flush-before-wipe, NOT quarantine-across-the-wipe. Holding unsynced
// rows back from the wipe would collide head-on with FR-9, which is the reason the
// wipe exists — a shared or borrowed device must not leak the prior account's
// health record — and a retained cache of that account's meals and symptom photos
// IS that leak, whatever it is labelled. So: send what can be sent, then tell the
// owner the truth about the rest and let them decide.
describe('wipeLocalSession — the Signal regen teardown (CUL-642)', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('cancels a pending regen so it cannot fire under the NEXT account', async () => {
    // The attack this closes (rls-privacy-reviewer): account A removes an event,
    // arming a 5s regen for A's pet; A signs out at t=2s; B signs in; at t=5s the
    // timer fires and invokes generate-signal with A's pet id — under B's token,
    // because supabase-js resolves the Authorization header at REQUEST time, not at
    // arming time. RLS refuses the pet, so no health data crosses; but
    // `record_ai_usage` is SECURITY DEFINER and takes its scope id from the body, so
    // A's pet UUID lands in `ai_usage.scope_id` under B's row where B can read it.
    //
    // Asserted on the SIDE-EFFECT reaching the network, not on the timer map, because
    // the map is private and a test that reads it would pass over a wipe that cleared
    // the wrong one.
    // OBSERVED AT THE WIRE, through the real debounce and the real regen. The first
    // version of this test spied on `regenerateSignal` and asserted it was not
    // called — which was vacuous: `triggerSignalRegenDebounced` calls it through the
    // module-local binding, so the spy on the module's exports never intercepted it,
    // and the assertion was green whether or not anything was cancelled. Mutation
    // caught it (removing the wipe call tripped only the ack assertion beside it),
    // which is the CUL-613 rule earning its place inside the fix for CUL-613's own
    // failure shape.
    jest.useFakeTimers();
    const invoke = supabase.functions.invoke as jest.Mock;
    invoke.mockClear();

    triggerSignalRegenDebounced('pet-of-account-a', 5000);
    expect(useSyncStore.getState().signalAcknowledging['pet-of-account-a']).toBe(true);

    await wipeLocalSession();

    // The acknowledgment state goes with it — otherwise the next account's Home shows
    // "Noted — updating …" over a pet it has never heard of.
    expect(useSyncStore.getState().signalAcknowledging).toEqual({});

    await jest.advanceTimersByTimeAsync(20_000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('the SAME timer DOES reach the wire without the wipe — the control', async () => {
    // Without this the assertion above cannot tell "cancelled" from "this test never
    // had a live path to the wire in the first place", which is exactly how its first
    // version passed. Runs the identical arrangement and lets the timer fire.
    jest.useFakeTimers();
    const invoke = supabase.functions.invoke as jest.Mock;
    invoke.mockClear();

    triggerSignalRegenDebounced('pet-of-account-a', 5000);
    await jest.advanceTimersByTimeAsync(5000);

    expect(invoke).toHaveBeenCalledWith('generate-signal', {
      body: { petId: 'pet-of-account-a' },
    });
  });
});

describe('flushForSignOut (B-430)', () => {
  it('PUSHES BEFORE REPORTING — the order is the entire feature', async () => {
    const order: string[] = [];
    (flushPendingForSignOut as jest.Mock).mockImplementation(async () => { order.push('flush'); });
    (getSyncStatus as jest.Mock).mockImplementation(async () => {
      order.push('status');
      return { pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 };
    });

    await flushForSignOut();

    // Reading the count first would report rows the flush was about to save, and
    // warn the owner about data that is not actually at risk — which trains them to
    // dismiss the warning that matters.
    expect(order).toEqual(['flush', 'status']);
  });

  it('reports what is STILL unsent after the attempt', async () => {
    (getSyncStatus as jest.Mock).mockResolvedValue({
      pendingCount: 3, oldestPendingAt: '2026-07-01T08:00:00.000Z', quarantinedCount: 2,
    });
    expect(await flushForSignOut()).toEqual({ pendingCount: 3, quarantinedCount: 2 });
  });

  it('never blocks sign-out when the flush itself fails', async () => {
    // Offline, mid-air, a dead JWT. The owner asked to sign out; a failure to save
    // must produce a warning, never a trapped session.
    (flushPendingForSignOut as jest.Mock).mockRejectedValue(new Error('offline'));
    (getSyncStatus as jest.Mock).mockResolvedValue({
      pendingCount: 4, oldestPendingAt: null, quarantinedCount: 0,
    });
    await expect(flushForSignOut()).resolves.toEqual({ pendingCount: 4, quarantinedCount: 0 });
  });

  it('FAILS TOWARD WARNING when it cannot tell — silence would read as all-clear', async () => {
    // A status read that throws tells us nothing, and "nothing" must not become
    // "all clear": that would skip the warning on precisely the broken device most
    // likely to be holding unsent rows.
    (getSyncStatus as jest.Mock).mockRejectedValue(new Error('sqlite gone'));
    const counts = await flushForSignOut();
    expect(counts.pendingCount + counts.quarantinedCount).toBeGreaterThan(0);
    expect(unsentSignOutWarning(counts)).not.toBeNull();
  });
});

describe('unsentSignOutWarning — the copy', () => {
  it('says nothing when the flush drained the queue (the common case)', () => {
    // Sign-out must stay a one-tap action for the owner who is simply online.
    expect(unsentSignOutWarning({ pendingCount: 0, quarantinedCount: 0 })).toBeNull();
  });

  it('counts quarantined rows too — they are just as lost to the wipe', () => {
    const w = unsentSignOutWarning({ pendingCount: 0, quarantinedCount: 1 });
    expect(w?.message).toContain('1 entry');
  });

  it('names the number, and totals both kinds', () => {
    const w = unsentSignOutWarning({ pendingCount: 2, quarantinedCount: 3 });
    expect(w?.message).toContain('5 entries');
  });

  it('offers the way out and blames nobody (nyx-voice)', () => {
    const w = unsentSignOutWarning({ pendingCount: 2, quarantinedCount: 0 })!;
    // No exclamation marks, no "error"/"failed" — from the owner's side nothing
    // failed; they logged something while the phone could not reach the network.
    expect(`${w.title} ${w.message}`).not.toMatch(/!|failed|error/i);
    // And it must not tell them to check their connection: the flush just tried.
    expect(w.message.toLowerCase()).not.toContain('internet');
    expect(w.message).toContain('stay signed in');
  });
});
