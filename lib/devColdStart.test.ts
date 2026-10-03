// The `__DEV__` forced cold start (CUL-1222, MFU-2): armed once, consumed once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { consumeForcedColdStart, forceNextColdStart, FORCE_COLD_START_KEY } from './devColdStart';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('the forced cold start', () => {
  it('is not armed by default, so an ordinary launch never blocks on it', async () => {
    expect(await consumeForcedColdStart()).toBe(false);
  });

  it('fires exactly once after it is armed: the next launch blocks, the one after does not', async () => {
    await forceNextColdStart();
    expect(await AsyncStorage.getItem(FORCE_COLD_START_KEY)).toBe('1');
    expect(await consumeForcedColdStart()).toBe(true);
    expect(await consumeForcedColdStart()).toBe(false);
    expect(await AsyncStorage.getItem(FORCE_COLD_START_KEY)).toBeNull();
  });

  it('reads false on a storage failure (the overlay stays off, today\'s behaviour)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await forceNextColdStart();
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('nope'));
    expect(await consumeForcedColdStart()).toBe(false);
  });

  describe('in a release build', () => {
    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    beforeEach(() => {
      (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    });
    afterEach(() => {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    });

    it('neither arms nor fires, even over a stored arm', async () => {
      expect(await forceNextColdStart()).toBe(false);
      expect(await AsyncStorage.getItem(FORCE_COLD_START_KEY)).toBeNull();
      await AsyncStorage.setItem(FORCE_COLD_START_KEY, '1');
      expect(await consumeForcedColdStart()).toBe(false);
    });
  });
});
