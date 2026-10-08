import { create } from 'zustand';

// CUL-1665 — a change-signal for removals from the record, the `foodLibraryStore`
// shape. `reverseLoggedEvent` (lib/undoLog.ts), the one reversal behind every soft
// delete, raises it once its local write has landed, so a surface that reads a
// derived list on a schedule of its own (the FAB's recent foods, read while the menu
// is closed) hears about a past-day row that left the record without waiting for the
// next sync. Today's rows already reach Home through `todayEvents`; this is for the
// rows that list never held.
//
// Deliberately NOT `useSyncStore.hydrationTick`: that tick re-reads Home, Trend and
// History, and a removal those surfaces already settle on their own paths should not
// wake them all. A surface opts in by subscribing.
//
// It carries no data, only a monotonically increasing counter, so it cannot drift from
// the record and holds nothing of an account's (nothing for `wipeLocalSession`).
interface RecordChangeState {
  version: number;
  notifyChanged: () => void;
}

export const useRecordChangeStore = create<RecordChangeState>((set) => ({
  version: 0,
  notifyChanged: () => set((s) => ({ version: s.version + 1 })),
}));
