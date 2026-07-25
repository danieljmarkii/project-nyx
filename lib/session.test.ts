import AsyncStorage from '@react-native-async-storage/async-storage';

// The native-heavy halves are mocked; the AsyncStorage-backed halves (the recovery
// marker, the recovery gate, the active-pet key) run for real, because they are
// exactly what this test is about.
jest.mock('./sync', () => ({ notifySignedOut: jest.fn() }));
jest.mock('./db', () => ({ clearLocalData: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./appGroup', () => ({ clearWidgetData: jest.fn() }));
jest.mock('./widgetBridge', () => ({ clearWidgetTimeline: jest.fn() }));
// session.ts pulls lib/trialContaminant for the B-351 slice-4 teardown, and that
// module imports lib/supabase, which fail-fasts on missing env under jest. Stub
// the client only — the two teardown functions themselves run for real below
// (one is in-memory, one is AsyncStorage-backed), which is the same split the
// note above describes.
jest.mock('./supabase', () => ({ supabase: {} }));

import { wipeLocalSession } from './session';
import { notifySignedOut } from './sync';
import { clearLocalData } from './db';
import { clearWidgetData } from './appGroup';
import { clearWidgetTimeline } from './widgetBridge';
import { readRecoveryRequest, recordRecoveryRequest } from './recoveryMarker';
import { hasFlaggedFoodInTrial, recordFlaggedFoodInTrial } from './trialContaminant';
import { armRecoveryGate, useAuthStore } from '../store/authStore';

const GATE_KEY = 'nyx.recoveryInProgress';
const t0 = 1_700_000_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  (clearLocalData as jest.Mock).mockResolvedValue(undefined);
  useAuthStore.setState({ recoveryInProgress: false });
});

describe('wipeLocalSession — the shipped SIGNED_OUT teardown', () => {
  it('runs every teardown step', async () => {
    await wipeLocalSession();
    expect(notifySignedOut).toHaveBeenCalled();
    expect(clearLocalData).toHaveBeenCalled();
    expect(clearWidgetData).toHaveBeenCalled();
    expect(clearWidgetTimeline).toHaveBeenCalled();
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
