import AsyncStorage from '@react-native-async-storage/async-storage';

// The native-heavy halves are mocked; the AsyncStorage-backed halves (the recovery
// marker, the recovery gate, the active-pet key) run for real, because they are
// exactly what this test is about.
jest.mock('./sync', () => ({
  notifySignedOut: jest.fn(),
  flushPendingForSignOut: jest.fn().mockResolvedValue(undefined),
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
jest.mock('./supabase', () => ({ supabase: {} }));

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
        // signal_design_v2 (B-721) is the same allowlist shape — account UUIDs wiped too.
        signal_design_v2: { enabled: false, allowlist: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'] },
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
