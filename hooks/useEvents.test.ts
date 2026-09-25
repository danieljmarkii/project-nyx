// Home's read of today's rows answers newest-first (History v2 HV-6, the second adversarial
// pass). expo-sqlite runs async calls on a concurrent queue, so two reads can answer out of
// order; a late OLDER answer used to put back what a newer one had replaced, which after the
// dose re-rating path (a write, then a re-read) meant a teal "Given" over a dose the owner had
// just marked Refused. Each read is held open here so the test picks the order.

type Answer = { resolve: (rows: unknown[]) => void; reject: (e: Error) => void };
const mockReads: Answer[] = [];
jest.mock('../lib/db', () => ({
  getDb: () => ({
    getAllAsync: () =>
      new Promise((resolve, reject) => {
        mockReads.push({ resolve, reject });
      }),
  }),
}));
let mockActivePet: { id: string } | null = { id: 'p1' };
jest.mock('../store/petStore', () => ({
  usePetStore: () => ({ activePet: mockActivePet }),
}));

import { act, renderHook } from '@testing-library/react-native';
import { useEventStore } from '../store/eventStore';
import { useEvents } from './useEvents';

/** A dose logged a minute ago today, as the read hands it over. */
const dose = (adherence: string) => ({
  id: 'd1',
  pet_id: 'p1',
  event_type: 'medication',
  occurred_at: new Date(Date.now() - 60_000).toISOString(),
  adherence,
});

beforeEach(() => {
  mockReads.length = 0;
  mockActivePet = { id: 'p1' };
  useEventStore.setState({ todayEvents: [], todayRead: null });
});

describe('loadTodayEvents: the newest read wins', () => {
  it('an older read answering last never puts back what the newer one replaced', async () => {
    const { result } = renderHook(() => useEvents());
    // A read already out (a sync tick), then the owner marks the dose Refused: a second read.
    act(() => {
      void result.current.loadTodayEvents();
      void result.current.loadTodayEvents();
    });
    expect(mockReads).toHaveLength(2);
    await act(async () => mockReads[1].resolve([dose('refused')]));
    await act(async () => mockReads[0].resolve([dose('given')]));
    expect(useEventStore.getState().todayEvents).toEqual([expect.objectContaining({ id: 'd1', adherence: 'refused' })]);
    expect(useEventStore.getState().todayRead).toEqual({ petId: 'p1', state: 'ready' });
  });

  it('an older read failing last never marks a good newer answer as failed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useEvents());
    act(() => {
      void result.current.loadTodayEvents();
      void result.current.loadTodayEvents();
    });
    await act(async () => mockReads[1].resolve([dose('given')]));
    await act(async () => mockReads[0].reject(new Error('locked')));
    expect(useEventStore.getState().todayRead).toEqual({ petId: 'p1', state: 'ready' });
    expect(useEventStore.getState().todayEvents).toHaveLength(1);
    warn.mockRestore();
  });

  it('in order, each answer lands (the guard drops only a superseded one)', async () => {
    const { result } = renderHook(() => useEvents());
    act(() => {
      void result.current.loadTodayEvents();
    });
    await act(async () => mockReads[0].resolve([dose('given')]));
    act(() => {
      void result.current.loadTodayEvents();
    });
    await act(async () => mockReads[1].resolve([dose('missed')]));
    expect(useEventStore.getState().todayEvents).toEqual([expect.objectContaining({ adherence: 'missed' })]);
  });
});
