// B-407 — the app-side reader for the widget's published pet-slot index. The pure
// label logic lives in petSlotLabel (widgetResolution.test.ts); this covers the
// App Group read seam: the null-container path, the parse guard, and the delegate.
jest.mock('./appGroup', () => ({ getSnapshotDirectory: jest.fn() }));
// widgetResolution → analytics → db/feedingArrangements: import-graph stubs, the
// same ones widgetResolution.test.ts uses (this reader pulls petSlotLabel from it).
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { readPublishedSlotIndex, readPetSlotLabel } from './widgetSlot';
import { getSnapshotDirectory } from './appGroup';
import { PET_SLOT_INDEX_FILENAME, type PetSlotIndex } from './widgetResolution';

const DIR = getSnapshotDirectory as jest.MockedFunction<typeof getSnapshotDirectory>;

// A fake App Group directory whose list() returns files with a synchronous
// textSync(), matching the expo-file-system shape the real reader walks.
function fakeDir(files: { name: string; textSync?: () => string }[]) {
  return { list: () => files } as unknown as ReturnType<typeof getSnapshotDirectory>;
}

const INDEX: PetSlotIndex = {
  schemaVersion: 1,
  assignments: [
    { slot: 1, petId: 'pet-1', petName: 'Pixel', active: true },
    { slot: 2, petId: 'pet-2', petName: 'Juniper', active: false }, // tombstone
    { slot: 3, petId: 'pet-3', petName: 'Mochi', active: true },
  ],
};

beforeEach(() => jest.clearAllMocks());

describe('readPublishedSlotIndex', () => {
  it('returns null when the App Group container is unavailable (non-iOS / no entitlement)', () => {
    DIR.mockReturnValue(null);
    expect(readPublishedSlotIndex()).toBeNull();
  });

  it('reads and parses the published index file', () => {
    DIR.mockReturnValue(fakeDir([
      { name: 'pet-1.json', textSync: () => '{}' }, // a snapshot file — skipped
      { name: PET_SLOT_INDEX_FILENAME, textSync: () => JSON.stringify(INDEX) },
    ]));
    expect(readPublishedSlotIndex()).toEqual(INDEX);
  });

  it('returns null (never throws) on corrupt JSON', () => {
    DIR.mockReturnValue(fakeDir([
      { name: PET_SLOT_INDEX_FILENAME, textSync: () => '{ not json' },
    ]));
    expect(readPublishedSlotIndex()).toBeNull();
  });

  it('returns null when the index file is absent', () => {
    DIR.mockReturnValue(fakeDir([{ name: 'pet-1.json', textSync: () => '{}' }]));
    expect(readPublishedSlotIndex()).toBeNull();
  });

  it('returns null when the parsed shape lacks an assignments array', () => {
    DIR.mockReturnValue(fakeDir([
      { name: PET_SLOT_INDEX_FILENAME, textSync: () => JSON.stringify({ schemaVersion: 1 }) },
    ]));
    expect(readPublishedSlotIndex()).toBeNull();
  });
});

describe('readPetSlotLabel', () => {
  it('names the active pet’s slot from the published index', () => {
    DIR.mockReturnValue(fakeDir([
      { name: PET_SLOT_INDEX_FILENAME, textSync: () => JSON.stringify(INDEX) },
    ]));
    expect(readPetSlotLabel('pet-1')).toBe('Pet 1');
    expect(readPetSlotLabel('pet-3')).toBe('Pet 3'); // sticky slot after a removal
  });

  it('returns null for a tombstoned pet and when the container is unavailable', () => {
    DIR.mockReturnValue(fakeDir([
      { name: PET_SLOT_INDEX_FILENAME, textSync: () => JSON.stringify(INDEX) },
    ]));
    expect(readPetSlotLabel('pet-2')).toBeNull(); // tombstone — not bindable now
    DIR.mockReturnValue(null);
    expect(readPetSlotLabel('pet-1')).toBeNull();
  });
});
