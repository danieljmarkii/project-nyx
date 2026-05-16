import { create } from 'zustand';

interface SyncState {
  pendingCount: number;
  oldestPendingAt: string | null;
  setPendingStatus: (count: number, oldestAt: string | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  oldestPendingAt: null,
  setPendingStatus: (count, oldestAt) => set({ pendingCount: count, oldestPendingAt: oldestAt }),
}));
