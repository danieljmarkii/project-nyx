// The pinned row's record (HV-9 / CUL-1166, CUL-1228): whose answer it draws. The row no
// longer reads for itself; it draws the record the list's load published on its snapshot,
// so the pills and the count line are one read. When the list reads is the list's own suite
// (`components/historyV2/HistoryList.test.tsx`, AC 5 and CUL-1228); this file drives the
// REAL list and pet stores and checks only what the hook draws from them.

// lib/historyControls reaches lib/supabase (an import-time env guard) through HV-4's
// numbers (lib/analytics → feedingArrangements → sync); nothing here reads a table.
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

import { act, renderHook } from '@testing-library/react-native';
import { useHistoryRecordFacts } from './useHistoryRecordFacts';
import type { HistoryRecordData } from '../lib/historyWindowFacts';
import { useHistoryListStore, type HistorySnapshot } from '../store/historyListStore';
import { usePetStore, type Pet } from '../store/petStore';

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
const DAY = '2026-09-25';

/** A record the hook can tell apart from any other: its `range` names the read. */
function record(petId: string, n: number, today = DAY): HistoryRecordData {
  const range = { fromDay: `read-${n}`, toDay: today };
  return {
    petId,
    windowFacts: { petId, today, firstRecordDay: '2026-09-01', trial: null, sinceVisit: null },
    range,
    facts: { petId, range, days: new Map(), firsts: { record: null, look: null, byType: {}, symptoms: null, photographed: null, noted: null }, population: [] },
    recordDays: new Map(),
    courses: [],
    notReadDays: new Map(),
  };
}

/** Publish a snapshot carrying `rec`, as a list load does; only the fields the hook reads
 *  matter here. */
function publish(rec: HistoryRecordData | null, failedRequest: string | null = null): void {
  act(() =>
    useHistoryListStore.setState({
      snapshot: rec === null ? null : ({ petId: rec.petId, today: rec.windowFacts.today, record: rec } as unknown as HistorySnapshot),
      failedRequest,
    }),
  );
}

beforeEach(() => {
  useHistoryListStore.setState({ today: DAY, snapshot: null, failedRequest: null });
  act(() => usePetStore.setState({ activePet: NYX, pets: [NYX, REX] }));
});

describe('useHistoryRecordFacts — the list\'s record, for the pet and day on screen', () => {
  it('draws nothing until the list has read, then the record on its snapshot', () => {
    const { result } = renderHook(() => useHistoryRecordFacts());
    expect(result.current).toEqual({ status: 'loading' });
    publish(record('p1', 1));
    expect(result.current).toEqual({ status: 'ready', data: record('p1', 1) });
  });

  it('a newer snapshot replaces the answer when it lands; the numbers never blank between', () => {
    publish(record('p1', 1));
    const { result } = renderHook(() => useHistoryRecordFacts());
    expect(result.current).toEqual({ status: 'ready', data: record('p1', 1) });
    publish(record('p1', 2));
    expect(result.current).toEqual({ status: 'ready', data: record('p1', 2) });
  });

  it('the same answer twice is the same state, so a memo on it holds', () => {
    const rec = record('p1', 1);
    publish(rec);
    const { result, rerender } = renderHook(() => useHistoryRecordFacts());
    const first = result.current;
    rerender({});
    expect(result.current).toBe(first);
  });

  it('never draws another pet\'s record: a switch shows nothing until its own lands', () => {
    publish(record('p1', 1));
    const { result } = renderHook(() => useHistoryRecordFacts());
    act(() => usePetStore.setState({ activePet: REX }));
    expect(result.current).toEqual({ status: 'loading' });
    publish(record('p2', 2));
    expect(result.current).toEqual({ status: 'ready', data: record('p2', 2) });
  });

  it('never draws yesterday\'s record under today: midnight shows nothing until the new day\'s', () => {
    publish(record('p1', 1));
    const { result } = renderHook(() => useHistoryRecordFacts());
    act(() => useHistoryListStore.getState().setToday('2026-09-26'));
    expect(result.current).toEqual({ status: 'loading' });
    publish(record('p1', 2, '2026-09-26'));
    expect(result.current).toEqual({ status: 'ready', data: record('p1', 2, '2026-09-26') });
  });

  it('a failed read with nothing to draw is an error, never a zero; a record on screen stays', () => {
    const { result } = renderHook(() => useHistoryRecordFacts());
    publish(null, 'some-request');
    expect(result.current).toEqual({ status: 'error' });
    publish(record('p1', 1), 'some-request');
    expect(result.current).toEqual({ status: 'ready', data: record('p1', 1) });
  });
});
