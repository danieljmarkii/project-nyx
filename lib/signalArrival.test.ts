// The arrival marker's contract (CUL-601 · `docs/nyx-app-polish-requirements.md` §4).
//
// The whole feature is "once per pet, EVER", so the marker is not bookkeeping around
// the feature — it IS the feature. What is worth asserting here is therefore not
// "does AsyncStorage work" but the three ways the once-ever promise can be broken:
// a second pet's write clobbering the first's, a corrupted blob taken at face value,
// and the sign-out wipe leaving the previous account's markers behind.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SIGNAL_ARRIVAL_STORAGE_KEY,
  clearSignalArrival,
  hasPlayedArrival,
  markArrivalPlayed,
} from './signalArrival';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('once per pet, ever', () => {
  it('a fresh pet has not played', async () => {
    expect(await hasPlayedArrival('pet-a')).toBe(false);
  });

  it('records a played arrival and reads it back', async () => {
    await markArrivalPlayed('pet-a');
    expect(await hasPlayedArrival('pet-a')).toBe(true);
  });

  it('is PER PET — marking one never spends another', async () => {
    // The multi-pet household is the case this protects: Sam's second cat must get her
    // own first insight as a moment, not inherit the first cat's spent marker.
    await markArrivalPlayed('pet-a');
    expect(await hasPlayedArrival('pet-b')).toBe(false);
  });

  it('accumulates rather than clobbers — a read-modify-write, not a last-write-wins', async () => {
    await markArrivalPlayed('pet-a');
    await markArrivalPlayed('pet-b');
    expect(await hasPlayedArrival('pet-a')).toBe(true);
    expect(await hasPlayedArrival('pet-b')).toBe(true);
  });

  it('is idempotent — marking twice is one marker', async () => {
    await markArrivalPlayed('pet-a');
    await markArrivalPlayed('pet-a');
    const raw = await AsyncStorage.getItem(SIGNAL_ARRIVAL_STORAGE_KEY);
    expect(JSON.parse(raw as string)).toEqual({ 'pet-a': true });
  });
});

describe('a corrupted or foreign blob is discarded, never trusted', () => {
  it('treats unparseable storage as no markers', async () => {
    await AsyncStorage.setItem(SIGNAL_ARRIVAL_STORAGE_KEY, 'not json');
    expect(await hasPlayedArrival('pet-a')).toBe(false);
  });

  it('treats a non-object blob as no markers', async () => {
    // An array (or a scalar) is a shape from some other version of this key. Reading a
    // marker OUT of it would be inventing one.
    await AsyncStorage.setItem(SIGNAL_ARRIVAL_STORAGE_KEY, '["pet-a"]');
    expect(await hasPlayedArrival('pet-a')).toBe(false);
  });

  it('only `true` counts as played', async () => {
    // Nothing writes `false`, so encountering one means the blob came from somewhere
    // this module did not write. Fail toward playing the moment, not toward eating it.
    await AsyncStorage.setItem(SIGNAL_ARRIVAL_STORAGE_KEY, JSON.stringify({ 'pet-a': 'yes' }));
    expect(await hasPlayedArrival('pet-a')).toBe(false);
  });

  it('recovers — a mark over a corrupted blob still produces a readable marker', async () => {
    await AsyncStorage.setItem(SIGNAL_ARRIVAL_STORAGE_KEY, '{{{');
    await markArrivalPlayed('pet-a');
    expect(await hasPlayedArrival('pet-a')).toBe(true);
  });
});

describe('the sign-out wipe (B-402)', () => {
  it('clearSignalArrival removes every pet’s marker', async () => {
    await markArrivalPlayed('pet-a');
    await markArrivalPlayed('pet-b');
    await clearSignalArrival();
    expect(await AsyncStorage.getItem(SIGNAL_ARRIVAL_STORAGE_KEY)).toBeNull();
    expect(await hasPlayedArrival('pet-a')).toBe(false);
    expect(await hasPlayedArrival('pet-b')).toBe(false);
  });

  it('is idempotent — clearing an already-clear device is a no-op, never a throw', async () => {
    await expect(clearSignalArrival()).resolves.toBeUndefined();
    await expect(clearSignalArrival()).resolves.toBeUndefined();
  });
});

describe('never fatal', () => {
  it('a write failure is swallowed — a decoration’s bookkeeping cannot break a session', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(markArrivalPlayed('pet-a')).resolves.toBeUndefined();
    spy.mockRestore();
    warn.mockRestore();
  });

  it('a clear failure is swallowed — sign-out teardown always completes', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(clearSignalArrival()).resolves.toBeUndefined();
    spy.mockRestore();
    warn.mockRestore();
  });
});
