import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  armRecoveryGate,
  loadPersistedRecoveryGate,
  releaseRecoveryGate,
  useAuthStore,
} from './authStore';

const KEY = 'nyx.recoveryInProgress';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  useAuthStore.setState({ recoveryInProgress: false, justDeletedAccount: false });
});

describe('the recovery gate (B-280 FR-6)', () => {
  it('starts closed', () => {
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
  });

  it('arms both memory and disk', async () => {
    await armRecoveryGate();
    expect(useAuthStore.getState().recoveryInProgress).toBe(true);
    expect(await AsyncStorage.getItem(KEY)).toBe('1');
  });

  it('survives a force-quit — the whole reason it is persisted (§10 row 21)', async () => {
    await armRecoveryGate();
    // Simulate the process dying and relaunching: memory is gone, disk is not.
    useAuthStore.setState({ recoveryInProgress: false });
    expect(await loadPersistedRecoveryGate()).toBe(true);
  });

  it('reads false on a clean launch', async () => {
    expect(await loadPersistedRecoveryGate()).toBe(false);
  });

  it('releases both halves (FR-15)', async () => {
    await armRecoveryGate();
    await releaseRecoveryGate();
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await loadPersistedRecoveryGate()).toBe(false);
  });

  it('arms memory even when the disk write fails', async () => {
    // Degrades to "does not survive a force-quit", never to "ungated".
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await armRecoveryGate();
    expect(useAuthStore.getState().recoveryInProgress).toBe(true);
  });

  it('releases memory even when the disk clear fails', async () => {
    // A storage error must never be the thing that traps an owner in the flow.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await armRecoveryGate();
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('nope'));
    await releaseRecoveryGate();
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
  });

  it('reads false on a storage read failure, so a broken store cannot wedge every launch', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('nope'));
    expect(await loadPersistedRecoveryGate()).toBe(false);
  });

  it('is untouched by setSession(null) — the justDeletedAccount precedent (§6.3)', async () => {
    // The §6.4 handler nulls the store session DURING recovery (step 4, B-576
    // option (d)) — a direct teardown, not a signOut — so a gate cleared by that
    // setSession(null) transition would be destroyed exactly when it is needed.
    await armRecoveryGate();
    useAuthStore.getState().setSession(null);
    expect(useAuthStore.getState().recoveryInProgress).toBe(true);
    expect(await AsyncStorage.getItem(KEY)).toBe('1');
  });
});
