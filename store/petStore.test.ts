import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  usePetStore,
  resolveActivePet,
  orderPetsActiveFirst,
  loadPersistedActivePetId,
  clearPersistedActivePetId,
  Pet,
} from './petStore';

function makePet(id: string, name = id): Pet {
  return {
    id,
    name,
    species: 'cat',
    breed: null,
    date_of_birth: null,
    date_of_birth_precision: 'exact',
    sex: 'unknown',
    weight_kg: null,
    photo_path: null,
  };
}

const pixel = makePet('pet-1', 'Pixel');
const juniper = makePet('pet-2', 'Juniper');

// persistActivePetId is fire-and-forget inside store actions; flush the
// microtask queue before reading the persisted value back.
const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

// Reset to initial state before each test — zustand stores are module singletons,
// so without this a mutation in one test leaks into the next.
const INITIAL = {
  pets: [] as Pet[],
  activePet: null as Pet | null,
  isOnboarded: false,
};

describe('resolveActivePet', () => {
  it('returns null for an empty list', () => {
    expect(resolveActivePet([], 'pet-1')).toBeNull();
  });

  it('returns the preferred pet when it is in the list', () => {
    expect(resolveActivePet([pixel, juniper], 'pet-2')).toBe(juniper);
  });

  it('falls back to the oldest (first) pet when the preferred id is missing', () => {
    // e.g. the persisted pet was archived, or the persisted id belongs to a
    // previous account on this device.
    expect(resolveActivePet([pixel, juniper], 'pet-gone')).toBe(pixel);
  });

  it('falls back to the oldest pet when there is no preference', () => {
    expect(resolveActivePet([pixel, juniper], null)).toBe(pixel);
  });
});

describe('orderPetsActiveFirst', () => {
  const mochi = makePet('pet-3', 'Mochi');

  it('moves the active pet to the front, keeping store order for the rest', () => {
    expect(orderPetsActiveFirst([pixel, juniper, mochi], 'pet-2')).toEqual([
      juniper, pixel, mochi,
    ]);
  });

  it('keeps store order when the active pet leads already or is unknown', () => {
    expect(orderPetsActiveFirst([pixel, juniper], 'pet-1')).toEqual([pixel, juniper]);
    expect(orderPetsActiveFirst([pixel, juniper], 'pet-gone')).toEqual([pixel, juniper]);
    expect(orderPetsActiveFirst([pixel, juniper], null)).toEqual([pixel, juniper]);
  });
});

describe('petStore', () => {
  beforeEach(async () => {
    usePetStore.setState(INITIAL);
    await AsyncStorage.clear();
  });

  it('setPets restores the persisted selection via preferredId', () => {
    usePetStore.getState().setPets([pixel, juniper], 'pet-2');
    const s = usePetStore.getState();
    expect(s.pets).toHaveLength(2);
    expect(s.activePet?.id).toBe('pet-2');
  });

  it('setPets keeps the current selection when no preferredId is given', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: juniper });
    usePetStore.getState().setPets([pixel, juniper]);
    expect(usePetStore.getState().activePet?.id).toBe('pet-2');
  });

  it('setPets falls back to the oldest pet when the current selection left the list', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: juniper });
    usePetStore.getState().setPets([pixel]);
    expect(usePetStore.getState().activePet?.id).toBe('pet-1');
  });

  it('selectPet switches the active pet and persists the device-local selection', async () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: pixel });
    usePetStore.getState().selectPet('pet-2');
    expect(usePetStore.getState().activePet?.id).toBe('pet-2');
    await flush();
    expect(await loadPersistedActivePetId()).toBe('pet-2');
  });

  it('selectPet ignores an id that is not in the list', async () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel], activePet: pixel });
    usePetStore.getState().selectPet('pet-gone');
    expect(usePetStore.getState().activePet?.id).toBe('pet-1');
    await flush();
    expect(await loadPersistedActivePetId()).toBeNull();
  });

  it('addPet with select makes the new pet active and persists it', async () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel], activePet: pixel });
    usePetStore.getState().addPet(juniper, { select: true });
    const s = usePetStore.getState();
    expect(s.pets.map((p) => p.id)).toEqual(['pet-1', 'pet-2']);
    expect(s.activePet?.id).toBe('pet-2');
    await flush();
    expect(await loadPersistedActivePetId()).toBe('pet-2');
  });

  it('addPet without select keeps the current active pet', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel], activePet: pixel });
    usePetStore.getState().addPet(juniper);
    expect(usePetStore.getState().activePet?.id).toBe('pet-1');
  });

  it('addPet on an empty store makes the first pet active (onboarding path)', () => {
    usePetStore.getState().addPet(pixel);
    expect(usePetStore.getState().activePet?.id).toBe('pet-1');
  });

  it('addPet de-duplicates by id instead of growing the list', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel], activePet: pixel });
    usePetStore.getState().addPet(makePet('pet-1', 'Pixel (renamed)'));
    expect(usePetStore.getState().pets).toHaveLength(1);
  });

  it('updatePet patches the active pet and its row in the list', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: pixel });
    usePetStore.getState().updatePet({ name: 'Pixel II' });
    const s = usePetStore.getState();
    expect(s.activePet?.name).toBe('Pixel II');
    expect(s.pets.find((p) => p.id === 'pet-1')?.name).toBe('Pixel II');
    expect(s.pets.find((p) => p.id === 'pet-2')?.name).toBe('Juniper');
  });

  it('removePet drops the pet and keeps the current selection when it survives', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: juniper });
    usePetStore.getState().removePet('pet-1');
    const s = usePetStore.getState();
    expect(s.pets.map((p) => p.id)).toEqual(['pet-2']);
    expect(s.activePet?.id).toBe('pet-2');
  });

  it('removePet falls back to the oldest remaining pet when the active pet is archived', () => {
    const third = makePet('pet-3', 'Mochi');
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper, third], activePet: juniper });
    usePetStore.getState().removePet('pet-2');
    const s = usePetStore.getState();
    expect(s.pets.map((p) => p.id)).toEqual(['pet-1', 'pet-3']);
    // Oldest-active fallback — identical to the launch-restore rule, so a
    // stale persisted selection resolves to the same pet after restart.
    expect(s.activePet?.id).toBe('pet-1');
  });

  it('removePet does not rewrite the persisted device-local selection', async () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: pixel });
    usePetStore.getState().selectPet('pet-2');
    await flush();
    usePetStore.getState().removePet('pet-2');
    await flush();
    // The stale key is harmless: resolveActivePet falls back to the oldest
    // active pet on the next launch, matching the in-memory fallback above.
    expect(await loadPersistedActivePetId()).toBe('pet-2');
    expect(usePetStore.getState().activePet?.id).toBe('pet-1');
  });

  it('removePet of the last pet empties the selection (upstream guard prevents this)', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel], activePet: pixel });
    usePetStore.getState().removePet('pet-1');
    const s = usePetStore.getState();
    expect(s.pets).toEqual([]);
    expect(s.activePet).toBeNull();
  });

  it('removePet with an unknown id is a no-op', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: juniper });
    usePetStore.getState().removePet('pet-gone');
    const s = usePetStore.getState();
    expect(s.pets).toHaveLength(2);
    expect(s.activePet?.id).toBe('pet-2');
  });

  it('reset wipes pets, selection, and the onboarded flag (sign-out)', () => {
    usePetStore.setState({ pets: [pixel], activePet: pixel, isOnboarded: true });
    usePetStore.getState().reset();
    const s = usePetStore.getState();
    expect(s.pets).toEqual([]);
    expect(s.activePet).toBeNull();
    expect(s.isOnboarded).toBe(false);
  });

  it('clearPersistedActivePetId removes the device-local selection (FR-9 parity)', async () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel], activePet: pixel });
    usePetStore.getState().selectPet('pet-1');
    await flush();
    expect(await loadPersistedActivePetId()).toBe('pet-1');
    await clearPersistedActivePetId();
    expect(await loadPersistedActivePetId()).toBeNull();
  });
});
