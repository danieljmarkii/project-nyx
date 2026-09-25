// The pinned row's record read (HV-9 / CUL-1166): when it reads, and whose answer it
// draws. The read itself is `lib/historyWindowFacts.ts`'s and is proven over a real
// database there; this file stands it in and drives the hook's triggers through the REAL
// sync, event and pet stores, with a focus that can blur and return the way a tab does.

// A tab's focus, controllable: `useFocusEffect` runs its callback when the screen gains
// focus and the callback's cleanup when it loses it, which is what the hook relies on.
const mockFocus = { focused: true, renders: new Set<() => void>() };
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      const [, rerender] = React.useReducer((n: number) => n + 1, 0);
      React.useEffect(() => {
        mockFocus.renders.add(rerender);
        return () => {
          mockFocus.renders.delete(rerender);
        };
      }, []);
      const focused = mockFocus.focused;
      React.useEffect(() => (focused ? cb() : undefined), [cb, focused]);
    },
  };
});
// lib/historyControls reaches lib/supabase (an import-time env guard) through HV-4's
// numbers (lib/analytics → feedingArrangements → sync); nothing here reads a table.
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));
jest.mock('../lib/historyWindowFacts', () => ({ readHistoryRecord: jest.fn() }));

import { act, renderHook } from '@testing-library/react-native';
import { useHistoryRecordFacts } from './useHistoryRecordFacts';
import { readHistoryRecord, type HistoryRecordData } from '../lib/historyWindowFacts';
import { useEventStore, type NyxEvent } from '../store/eventStore';
import { usePetStore, type Pet } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

const mockRead = readHistoryRecord as jest.MockedFunction<typeof readHistoryRecord>;

function pet(id: string, name: string): Pet {
  return {
    id,
    name,
    species: 'cat',
    breed: null,
    date_of_birth: null,
    date_of_birth_precision: 'exact',
    sex: 'male',
    weight_kg: null,
    photo_path: null,
  };
}
const NYX = pet('p1', 'Nyx');
const REX = pet('p2', 'Rex');

/** An answer the hook can tell apart from any other: its `range` names the read. */
function answer(petId: string, n: number): HistoryRecordData {
  return {
    petId,
    windowFacts: { petId, today: '2026-09-25', firstRecordDay: '2026-09-01', trial: null, sinceVisit: null },
    range: { fromDay: `read-${n}`, toDay: '2026-09-25' },
    recordDays: new Map(),
    courses: [],
    notReadDays: new Map(),
  };
}

/** Every read the hook starts, each answered by hand. */
function deferredReads() {
  const pending: { petId: string; resolve: (d: HistoryRecordData) => void; reject: (e: Error) => void }[] = [];
  mockRead.mockImplementation(
    (p) =>
      new Promise((resolve, reject) => {
        pending.push({ petId: p.id, resolve, reject });
      }),
  );
  return pending;
}

function setFocus(focused: boolean): void {
  act(() => {
    mockFocus.focused = focused;
    for (const rerender of mockFocus.renders) rerender();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.focused = true;
  useSyncStore.setState({ hydrationTick: 0 });
  useEventStore.setState({ todayEvents: [] });
  act(() => usePetStore.setState({ activePet: NYX, pets: [NYX, REX] }));
});

describe('useHistoryRecordFacts — when it reads', () => {
  it('reads once on mount, for the active pet, and draws no answer until it lands', async () => {
    const reads = deferredReads();
    const { result } = renderHook(() => useHistoryRecordFacts());
    expect(result.current).toEqual({ status: 'loading' });
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockRead).toHaveBeenCalledWith({ id: 'p1', name: 'Nyx', species: 'cat', sex: 'male' }, false);
    await act(async () => reads[0].resolve(answer('p1', 1)));
    expect(result.current).toEqual({ status: 'ready', data: answer('p1', 1) });
  });

  it('re-reads when a sync cycle lands rows, and keeps the last answer on screen until the new one lands', async () => {
    const reads = deferredReads();
    const { result } = renderHook(() => useHistoryRecordFacts());
    await act(async () => reads[0].resolve(answer('p1', 1)));
    act(() => useSyncStore.getState().bumpHydrationTick());
    expect(mockRead).toHaveBeenCalledTimes(2);
    // Between the two reads the numbers never blank.
    expect(result.current).toEqual({ status: 'ready', data: answer('p1', 1) });
    await act(async () => reads[1].resolve(answer('p1', 2)));
    expect(result.current).toEqual({ status: 'ready', data: answer('p1', 2) });
  });

  it('re-reads when a log lands in today’s list (a write, an Undo)', async () => {
    const reads = deferredReads();
    renderHook(() => useHistoryRecordFacts());
    await act(async () => reads[0].resolve(answer('p1', 1)));
    act(() => useEventStore.setState({ todayEvents: [{ id: 'e1' } as NyxEvent] }));
    expect(mockRead).toHaveBeenCalledTimes(2);
  });

  it('reads nothing while the tab is out of view, and reads once on the return', async () => {
    const reads = deferredReads();
    renderHook(() => useHistoryRecordFacts());
    await act(async () => reads[0].resolve(answer('p1', 1)));
    setFocus(false);
    act(() => useSyncStore.getState().bumpHydrationTick());
    act(() => useEventStore.setState({ todayEvents: [{ id: 'e1' } as NyxEvent] }));
    expect(mockRead).toHaveBeenCalledTimes(1);
    setFocus(true);
    expect(mockRead).toHaveBeenCalledTimes(2);
  });

  it('reads nothing without a pet', () => {
    deferredReads();
    act(() => usePetStore.setState({ activePet: null, pets: [] }));
    const { result } = renderHook(() => useHistoryRecordFacts());
    expect(result.current).toEqual({ status: 'loading' });
    expect(mockRead).not.toHaveBeenCalled();
  });
});

describe('useHistoryRecordFacts — whose answer', () => {
  it('a pet switch draws no answer until the new pet’s lands, never the last pet’s', async () => {
    const reads = deferredReads();
    const { result } = renderHook(() => useHistoryRecordFacts());
    await act(async () => reads[0].resolve(answer('p1', 1)));
    act(() => usePetStore.setState({ activePet: REX }));
    expect(result.current).toEqual({ status: 'loading' });
    expect(reads[1].petId).toBe('p2');
    await act(async () => reads[1].resolve(answer('p2', 2)));
    expect(result.current).toEqual({ status: 'ready', data: answer('p2', 2) });
  });

  it('drops an answer that lands after its pet has left the screen', async () => {
    const reads = deferredReads();
    const { result } = renderHook(() => useHistoryRecordFacts());
    act(() => usePetStore.setState({ activePet: REX }));
    // Nyx's read lands late, while Rex is on screen: it is never drawn.
    await act(async () => reads[0].resolve(answer('p1', 1)));
    expect(result.current).toEqual({ status: 'loading' });
    // And switching back does not resurrect it: Nyx is read afresh.
    act(() => usePetStore.setState({ activePet: NYX }));
    expect(result.current).toEqual({ status: 'loading' });
    expect(reads.map((r) => r.petId)).toEqual(['p1', 'p2', 'p1']);
  });

  it('a failed read is an error, never an empty record, and says so in the log', async () => {
    const reads = deferredReads();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useHistoryRecordFacts());
    await act(async () => reads[0].reject(new Error('database is locked')));
    expect(result.current).toEqual({ status: 'error' });
    expect(errors).toHaveBeenCalledWith('[useHistoryRecordFacts] reading the record failed:', expect.any(Error));
    errors.mockRestore();
    // The next trigger reads again, and its answer replaces the error.
    act(() => useSyncStore.getState().bumpHydrationTick());
    await act(async () => reads[1].resolve(answer('p1', 2)));
    expect(result.current).toEqual({ status: 'ready', data: answer('p1', 2) });
  });
});
