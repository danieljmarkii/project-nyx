import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  usePetStore,
  resolveActivePet,
  orderPetsActiveFirst,
  resolveRecordPetName,
  ANONYMOUS_PET_NAME,
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

describe('resolveRecordPetName', () => {
  it('names the pet the record belongs to', () => {
    expect(resolveRecordPetName([pixel, juniper], 'pet-2')).toBe('Juniper');
  });

  // The bug this helper exists for (CUL-574): the store points at Pixel while the
  // screen renders Juniper's event. The answer must come from the record's id.
  it('does not name whichever pet is active', () => {
    expect(resolveRecordPetName([pixel, juniper], 'pet-1')).toBe('Pixel');
    expect(resolveRecordPetName([pixel, juniper], 'pet-2')).toBe('Juniper');
  });

  // `pets` holds only non-archived pets, so an archived pet's record misses. It must
  // fall to the anonymous form, NOT to the first/active pet — a confidently wrong
  // name on a clinical sentence is worse than no name.
  it('falls through to the anonymous form when the pet is not in the list', () => {
    expect(resolveRecordPetName([pixel, juniper], 'pet-archived')).toBe(ANONYMOUS_PET_NAME);
    expect(resolveRecordPetName([pixel], 'pet-2')).toBe(ANONYMOUS_PET_NAME);
  });

  it('falls through to the anonymous form on a missing id or an empty list', () => {
    expect(resolveRecordPetName([pixel, juniper], null)).toBe(ANONYMOUS_PET_NAME);
    expect(resolveRecordPetName([pixel, juniper], undefined)).toBe(ANONYMOUS_PET_NAME);
    expect(resolveRecordPetName([], 'pet-1')).toBe(ANONYMOUS_PET_NAME);
  });

  // Callers interpolate this into a sentence, so a blank name would render
  // "How much did  eat?" — a hole, not a name.
  it('treats a blank or whitespace name as a miss', () => {
    const nameless = { ...pixel, name: '' };
    const spaces = { ...juniper, name: '   ' };
    expect(resolveRecordPetName([nameless, spaces], 'pet-1')).toBe(ANONYMOUS_PET_NAME);
    expect(resolveRecordPetName([nameless, spaces], 'pet-2')).toBe(ANONYMOUS_PET_NAME);
  });

  it('trims an accidentally padded name rather than rendering the padding', () => {
    expect(resolveRecordPetName([{ ...pixel, name: ' Pixel ' }], 'pet-1')).toBe('Pixel');
  });

  it('never returns an empty string', () => {
    expect(resolveRecordPetName([], null)).toBe('your pet');
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

  // ── patchPetById (CUL-641) ───────────────────────────────────────────────────
  // The by-id sibling exists because `updatePet` derives its target from `activePet`,
  // which is the wrong question for anything acting on a RECORD: record screens are
  // reached by id for any pet (CUL-574).
  it('patchPetById patches a NON-active pet, which updatePet structurally cannot', () => {
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: juniper });
    usePetStore.getState().patchPetById('pet-1', { name: 'Pixel II' });
    const s = usePetStore.getState();
    expect(s.pets.find((p) => p.id === 'pet-1')?.name).toBe('Pixel II');
    expect(s.activePet?.id).toBe('pet-2');
    expect(s.activePet?.name).toBe('Juniper');
  });

  it('patchPetById keeps activePet and its list row the SAME object when it is the target', () => {
    // The invariant `updatePet` maintains and every consumer relies on: `activePet` is
    // the array entry, not a copy of it. Two objects here means a later read of one sees
    // a value the other does not have.
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: pixel });
    usePetStore.getState().patchPetById('pet-1', { name: 'Pixel II' });
    const s = usePetStore.getState();
    expect(s.activePet?.name).toBe('Pixel II');
    expect(s.activePet).toBe(s.pets.find((p) => p.id === 'pet-1'));
  });

  it('patchPetById leaves activePet REFERENTIALLY untouched when patching another pet', () => {
    // Identity, not just value: `activePet` is a render dependency across the app, so
    // handing back a new object for a patch that did not concern it churns every screen
    // reading it.
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: juniper });
    const before = usePetStore.getState().activePet;
    usePetStore.getState().patchPetById('pet-1', { name: 'Pixel II' });
    expect(usePetStore.getState().activePet).toBe(before);
  });

  it('patchPetById is a no-op for a pet not in the list — never a fallback to the active one', () => {
    // `pets` holds only non-archived pets, so a miss means an archived record's pet.
    // Falling back to the current selection is the wrong-pet class (CUL-574): a
    // confidently-stated different answer, not a graceful degradation.
    usePetStore.setState({ ...INITIAL, pets: [pixel, juniper], activePet: juniper });
    usePetStore.getState().patchPetById('pet-archived', { name: 'Ghost' });
    const s = usePetStore.getState();
    expect(s.pets.map((p) => p.name)).toEqual(['Pixel', 'Juniper']);
    expect(s.activePet?.name).toBe('Juniper');
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
