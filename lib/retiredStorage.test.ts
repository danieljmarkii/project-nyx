import AsyncStorage from '@react-native-async-storage/async-storage';
import { RETIRED_STORAGE_KEYS, purgeRetiredStorage } from './retiredStorage';

// purgeRetiredStorage is fire-and-forget (returns void), so every assertion has
// to wait for the swallowed promise to settle first.
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('purgeRetiredStorage', () => {
  it('removes the retired auth-probe log left behind by builds 33/34 (B-301)', async () => {
    // The shape the probe actually persisted: a JSON ring of breadcrumbs.
    await AsyncStorage.setItem(
      '__culprit_auth_debug_v1',
      JSON.stringify([{ seq: 0, event: 'launch' }]),
    );

    purgeRetiredStorage();
    await flush();

    expect(await AsyncStorage.getItem('__culprit_auth_debug_v1')).toBeNull();
  });

  it('names the probe key exactly — a typo would silently purge nothing', () => {
    // The whole mechanism is a string match against a key written by code that
    // no longer exists, so there is nothing left to catch a misspelling but this.
    expect(RETIRED_STORAGE_KEYS).toContain('__culprit_auth_debug_v1');
  });

  it('leaves live keys untouched', async () => {
    // The two AsyncStorage-resident keys that are still written by shipping code
    // (lib/recoveryMarker.ts, lib/appConfig.ts's cache) sit in the same store.
    await AsyncStorage.setItem('nyx.recoveryRequest', '{"email":"jordan@example.com"}');

    purgeRetiredStorage();
    await flush();

    expect(await AsyncStorage.getItem('nyx.recoveryRequest')).toBe(
      '{"email":"jordan@example.com"}',
    );
  });

  it('is idempotent — a second launch with the key already gone is a no-op', async () => {
    purgeRetiredStorage();
    await flush();
    purgeRetiredStorage();
    await flush();

    expect(await AsyncStorage.getItem('__culprit_auth_debug_v1')).toBeNull();
  });

  it('never throws when the store rejects — hygiene must not break startup', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(AsyncStorage, 'multiRemove')
      .mockRejectedValueOnce(new Error('storage unavailable'));

    // Neither the synchronous call nor the settling rejection may escape — an
    // unhandled rejection here would surface in the launch path.
    expect(() => purgeRetiredStorage()).not.toThrow();
    await flush();

    // …and the failure is reported rather than swallowed silently.
    expect(warn).toHaveBeenCalledWith(
      '[retiredStorage] purge failed (non-fatal):',
      expect.any(Error),
    );
  });
});
