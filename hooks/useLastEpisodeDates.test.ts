// The last-episode date read (CUL-785, fold spec §3.4): one indexed aggregate per symptom
// type over the pet's non-deleted events, memoized on the pet + the symptom set + the three
// "the record may have moved" ticks, and `null` (never a date) when the store did not answer.

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

const mockCalls: Array<{ sql: string; params: unknown[] }> = [];
let mockRowsByType: Record<string, string | null> = {};
let mockThrowOnRead = false;
jest.mock('../lib/db', () => ({
  getDb: () => ({
    getAllSync: (sql: string, params: unknown[]) => {
      mockCalls.push({ sql, params });
      if (mockThrowOnRead) throw new Error('db closed');
      return [{ last: mockRowsByType[String(params[1])] ?? null }];
    },
  }),
}));

import { act, renderHook } from '@testing-library/react-native';
import { readLastEpisodeIso, useLastEpisodeDates } from './useLastEpisodeDates';
import { useSyncStore } from '../store/syncStore';

beforeEach(() => {
  mockCalls.length = 0;
  mockRowsByType = {};
  mockThrowOnRead = false;
  useSyncStore.setState({ hydrationTick: 0, signalTick: 0 });
});

describe('readLastEpisodeIso — the SQL shape', () => {
  it('reads MAX(occurred_at) over the pet’s non-deleted events of ONE event type', () => {
    mockRowsByType = { vomit: '2026-08-26T15:00:00.000Z' };
    expect(readLastEpisodeIso('pet-1', 'vomit')).toBe('2026-08-26T15:00:00.000Z');
    expect(mockCalls).toHaveLength(1);
    const sql = mockCalls[0].sql.replace(/\s+/g, ' ');
    expect(sql).toMatch(/SELECT MAX\(occurred_at\) AS last FROM events/);
    expect(sql).toMatch(/pet_id = \?/);
    expect(sql).toMatch(/event_type = \?/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(mockCalls[0].params).toEqual(['pet-1', 'vomit']);
  });

  it('is null when there is no such event, and null — never a date — when the store throws', () => {
    expect(readLastEpisodeIso('pet-1', 'cough')).toBeNull();
    mockThrowOnRead = true;
    expect(readLastEpisodeIso('pet-1', 'vomit')).toBeNull();
  });
});

describe('useLastEpisodeDates', () => {
  it('returns one entry per requested symptom type, on the FIRST render (no unread frame)', () => {
    mockRowsByType = { vomit: '2026-08-26T15:00:00.000Z', cough: '2026-08-20T09:00:00.000Z' };
    const { result } = renderHook(() =>
      useLastEpisodeDates({ petId: 'pet-1', symptomTypes: ['vomit', 'cough', 'vomit'] }),
    );
    expect(result.current).toEqual({ cough: '2026-08-20T09:00:00.000Z', vomit: '2026-08-26T15:00:00.000Z' });
    // Deduplicated: two reads, not three.
    expect(mockCalls.filter((c) => c.params[0] === 'pet-1')).toHaveLength(2);
  });

  it('reads nothing without a pet or without a type', () => {
    const a = renderHook(() => useLastEpisodeDates({ petId: null, symptomTypes: ['vomit'] }));
    expect(a.result.current).toEqual({});
    const b = renderHook(() => useLastEpisodeDates({ petId: 'pet-1', symptomTypes: [] }));
    expect(b.result.current).toEqual({});
    expect(mockCalls).toHaveLength(0);
  });

  it('does not re-read on a re-render with the same inputs, and re-reads on hydrationTick / signalTick', () => {
    mockRowsByType = { vomit: '2026-08-26T15:00:00.000Z' };
    const { result, rerender } = renderHook(
      ({ types }: { types: string[] }) => useLastEpisodeDates({ petId: 'pet-1', symptomTypes: types }),
      { initialProps: { types: ['vomit'] } },
    );
    const before = mockCalls.length;
    // A fresh array with the same content — the zone rebuilds its list every render.
    rerender({ types: ['vomit'] });
    expect(mockCalls.length).toBe(before);

    mockRowsByType = { vomit: '2026-09-04T08:00:00.000Z' };
    act(() => useSyncStore.getState().bumpHydrationTick());
    expect(result.current.vomit).toBe('2026-09-04T08:00:00.000Z');

    mockRowsByType = { vomit: '2026-09-04T11:00:00.000Z' };
    act(() => useSyncStore.getState().bumpSignalTick());
    expect(result.current.vomit).toBe('2026-09-04T11:00:00.000Z');
  });

  it('a pet switch reads the NEW pet’s record in the same render — never the previous pet’s date', () => {
    mockRowsByType = { vomit: '2026-08-26T15:00:00.000Z' };
    const { result, rerender } = renderHook(
      ({ petId }: { petId: string }) => useLastEpisodeDates({ petId, symptomTypes: ['vomit'] }),
      { initialProps: { petId: 'pet-1' } },
    );
    expect(result.current.vomit).toBe('2026-08-26T15:00:00.000Z');
    mockRowsByType = {};
    rerender({ petId: 'pet-2' });
    expect(result.current).toEqual({ vomit: null });
    expect(mockCalls[mockCalls.length - 1].params).toEqual(['pet-2', 'vomit']);
  });

  it('a store that throws answers null per type — the strip then prints no date', () => {
    mockThrowOnRead = true;
    const { result } = renderHook(() => useLastEpisodeDates({ petId: 'pet-1', symptomTypes: ['vomit'] }));
    expect(result.current).toEqual({ vomit: null });
  });
});
