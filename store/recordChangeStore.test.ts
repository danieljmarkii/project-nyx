import { useRecordChangeStore } from './recordChangeStore';

// The contract the FAB's recent-foods read depends on (CUL-1665): each notifyChanged()
// strictly increments, so a subscribed effect re-runs on every removal.

describe('recordChangeStore', () => {
  beforeEach(() => useRecordChangeStore.setState({ version: 0 }));

  it('notifyChanged monotonically increments version', () => {
    expect(useRecordChangeStore.getState().version).toBe(0);
    useRecordChangeStore.getState().notifyChanged();
    expect(useRecordChangeStore.getState().version).toBe(1);
    useRecordChangeStore.getState().notifyChanged();
    useRecordChangeStore.getState().notifyChanged();
    expect(useRecordChangeStore.getState().version).toBe(3);
  });
});
