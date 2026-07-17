import { useFoodLibraryStore } from './foodLibraryStore';

// A trivial counter, but it carries a contract the Foods tab + FoodPicker depend
// on (each notifyChanged() strictly increments so a subscribed screen re-reads).

describe('foodLibraryStore', () => {
  beforeEach(() => useFoodLibraryStore.setState({ version: 0 }));

  it('notifyChanged monotonically increments version', () => {
    expect(useFoodLibraryStore.getState().version).toBe(0);
    useFoodLibraryStore.getState().notifyChanged();
    expect(useFoodLibraryStore.getState().version).toBe(1);
    useFoodLibraryStore.getState().notifyChanged();
    useFoodLibraryStore.getState().notifyChanged();
    expect(useFoodLibraryStore.getState().version).toBe(3);
  });
});
