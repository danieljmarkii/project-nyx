// hooks/useTodayKey.ts — the day key stays true across midnight while Home is mounted
// (CUL-1221). The clock is PINNED (C-29, the time axis): a date-anchored fixture judged
// against the real clock fails on a calendar day, not a change.

import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useTodayKey } from './useTodayKey';

let listener: ((s: AppStateStatus) => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  listener = null;
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
    listener = cb as (s: AppStateStatus) => void;
    return { remove: () => (listener = null) } as never;
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useTodayKey', () => {
  it('flips to the new day at local midnight while the app is open', () => {
    jest.setSystemTime(new Date(2026, 8, 17, 23, 59, 0)); // Sep 17, 23:59 local
    const { result } = renderHook(() => useTodayKey());
    expect(result.current).toBe('2026-09-17');
    act(() => jest.advanceTimersByTime(30_000)); // 23:59:30 — still the 17th
    expect(result.current).toBe('2026-09-17');
    act(() => jest.advanceTimersByTime(40_000)); // past midnight
    expect(result.current).toBe('2026-09-18');
    // And it re-arms for the next midnight.
    act(() => jest.advanceTimersByTime(24 * 3_600_000));
    expect(result.current).toBe('2026-09-19');
  });

  it('re-reads the day on return to the foreground (a backgrounded timer may never fire)', () => {
    jest.setSystemTime(new Date(2026, 8, 17, 22, 0, 0));
    const { result } = renderHook(() => useTodayKey());
    act(() => listener?.('background'));
    // Two days pass in the background with no timer firing.
    jest.setSystemTime(new Date(2026, 8, 19, 9, 0, 0));
    expect(result.current).toBe('2026-09-17');
    act(() => listener?.('active'));
    expect(result.current).toBe('2026-09-19');
  });
});
