import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAX_FOLDS_PER_PET,
  OBSERVATION_FOLD_STORAGE_KEY,
  clearObservationFold,
  readObservationFold,
  setObservationFold,
} from './observationFold';

const T0 = '2026-09-05T12:00:00.000Z';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('observationFold — the store', () => {
  it('round-trips a fold, per pet AND per event', async () => {
    await setObservationFold('pet-a', 'ev-1', true, T0);
    expect(await readObservationFold('pet-a', 'ev-1')).toBe(true);
    // A different event on the same pet, and the same event under a different pet, are
    // untouched — a fold is a fact about one record, never about a type of record.
    expect(await readObservationFold('pet-a', 'ev-2')).toBe(false);
    expect(await readObservationFold('pet-b', 'ev-1')).toBe(false);
  });

  it('unfolding removes the entry, and an empty pet removes its key', async () => {
    await setObservationFold('pet-a', 'ev-1', true, T0);
    await setObservationFold('pet-a', 'ev-1', false, T0);
    expect(await readObservationFold('pet-a', 'ev-1')).toBe(false);
    // The blob does not accumulate tombstones for records nobody folded.
    expect(await AsyncStorage.getItem(OBSERVATION_FOLD_STORAGE_KEY)).toBe('{}');
  });

  it('keeps a sibling fold when one is released (read-modify-write, not overwrite)', async () => {
    await setObservationFold('pet-a', 'ev-1', true, T0);
    await setObservationFold('pet-a', 'ev-2', true, T0);
    await setObservationFold('pet-a', 'ev-1', false, T0);
    expect(await readObservationFold('pet-a', 'ev-2')).toBe(true);
  });

  it('answers null — NOT false — when storage cannot be read (C-12)', async () => {
    // The distinction the hook depends on: "no fold" and "did not answer" are different
    // facts, and only the first may collapse a grid.
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage gone'));
    expect(await readObservationFold('pet-a', 'ev-1')).toBeNull();
  });

  it('discards a blob that is not this shape rather than trusting it', async () => {
    await AsyncStorage.setItem(
      OBSERVATION_FOLD_STORAGE_KEY,
      JSON.stringify({ 'pet-a': { 'ev-1': { state: 'folded' }, 'ev-2': { state: 'folded', foldedAtIso: T0 } } }),
    );
    // Entry by entry: the half-written one is dropped, the valid sibling survives.
    expect(await readObservationFold('pet-a', 'ev-1')).toBe(false);
    expect(await readObservationFold('pet-a', 'ev-2')).toBe(true);
  });

  it('reads unparseable JSON as empty — it answered, with nothing usable', async () => {
    await AsyncStorage.setItem(OBSERVATION_FOLD_STORAGE_KEY, '{not json');
    expect(await readObservationFold('pet-a', 'ev-1')).toBe(false);
  });

  it('never throws when the write fails — a fold is a convenience, not a report', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(setObservationFold('pet-a', 'ev-1', true, T0)).resolves.toBeUndefined();
  });

  it('a write whose read straddles a wipe does NOT restore the wiped map (clear epoch)', async () => {
    // The trap this guard exists for: `setObservationFold` is a read-modify-write and the
    // screen fires it un-awaited, so a sign-out landing between the read and the write
    // would put the PREVIOUS account's folds back after wipeLocalSession returned clean.
    await setObservationFold('pet-a', 'ev-1', true, T0);
    let releaseRead: () => void = () => {};
    const gate = new Promise<void>((r) => { releaseRead = r; });
    const real = AsyncStorage.getItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(async (k: string) => {
      const v = await real(k);
      await gate;
      return v;
    });

    const inFlight = setObservationFold('pet-a', 'ev-2', true, T0);
    await clearObservationFold();
    releaseRead();
    await inFlight;

    expect(await AsyncStorage.getItem(OBSERVATION_FOLD_STORAGE_KEY)).toBeNull();
  });

  it('a write that STARTS after the clear begins is also caught (the second bump)', async () => {
    // The interleaving the first cut missed, and the one its comment claimed to prevent:
    // the write starts AFTER the epoch bump, so it snapshots the already-bumped value,
    // reads the pre-wipe blob, and its re-check compares EQUAL — restoring the previous
    // account's map after `wipeLocalSession()` had returned clean. Bumping again once the
    // removal lands is what makes the re-check see a change.
    await setObservationFold('pet-a', 'ev-1', true, T0);
    let releaseRemoval: () => void = () => {};
    const removalGate = new Promise<void>((r) => { releaseRemoval = r; });
    const realRemove = AsyncStorage.removeItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'removeItem').mockImplementationOnce(async (k: string) => {
      await removalGate;
      await realRemove(k);
    });

    const clearing = clearObservationFold();
    // Starts now — after the first bump, before the removal has landed.
    const inFlight = setObservationFold('pet-a', 'ev-2', true, T0);
    releaseRemoval();
    await clearing;
    await inFlight;

    expect(await AsyncStorage.getItem(OBSERVATION_FOLD_STORAGE_KEY)).toBeNull();
  });

  it('keeps the blob bounded, dropping the OLDEST folds first', async () => {
    // Nothing enumerates a pet's incidents, so there is no natural caller for a prune —
    // the cap is what stops an install accumulating an entry per folded record forever.
    for (let i = 0; i <= MAX_FOLDS_PER_PET; i++) {
      // Ascending timestamps: ev-0 is the oldest and the one that must go.
      await setObservationFold('pet-a', `ev-${i}`, true, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString());
    }
    const raw = JSON.parse((await AsyncStorage.getItem(OBSERVATION_FOLD_STORAGE_KEY))!);
    expect(Object.keys(raw['pet-a'])).toHaveLength(MAX_FOLDS_PER_PET);
    // Eviction fails in the only harmless direction: an evicted record opens.
    expect(await readObservationFold('pet-a', 'ev-0')).toBe(false);
    expect(await readObservationFold('pet-a', `ev-${MAX_FOLDS_PER_PET}`)).toBe(true);
  });

  it('clearing is idempotent and never throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await setObservationFold('pet-a', 'ev-1', true, T0);
    await expect(clearObservationFold()).resolves.toBeUndefined();
    await expect(clearObservationFold()).resolves.toBeUndefined();
    expect(await readObservationFold('pet-a', 'ev-1')).toBe(false);
  });
});
