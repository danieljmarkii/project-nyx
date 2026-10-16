// CUL-1949 — Home's gap warning re-reads when the clock alone can change it. The warning
// can come back with no write at all: 48h of silence drops out of the logged clock, so a
// run the recency guard retired is current again. No log, sync or focus fires at that
// instant, and a phone kept awake on Home sees none of them.
//
// Composed from the REAL hook, the REAL detector and the REAL schedule
// (`nextGapChangeMs`); only SQLite underneath is stubbed, answering the rows a vomit
// record would hold. The focus mock mirrors React Navigation's contract (run on focus,
// clean up on blur) so the blur case is the real one, not an unmount.

import { act, renderHook } from '@testing-library/react-native';

let mockFocused = true;
const mockFocusListeners = new Set<() => void>();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      const focused = React.useSyncExternalStore(
        (l: () => void) => {
          mockFocusListeners.add(l);
          return () => mockFocusListeners.delete(l);
        },
        () => mockFocused,
      );
      React.useEffect(() => (focused ? cb() : undefined), [cb, focused]);
    },
  };
});

const mockGetAllAsync = jest.fn();
jest.mock('../lib/db', () => ({ getDb: () => ({ getAllAsync: mockGetAllAsync }) }));

import { GAP_REREAD_CEILING_MS, useGapWarning } from './useGapWarning';
import { QUIET_STRETCH_MS } from '../lib/signalWatching';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

const HOUR = 3_600_000;
const PET = { id: 'pet-a', name: 'Nyx' } as any;

// Gaps 100h, 60h, 30h, 10h: a shortening run whose 2× guard is 20h of logged time. The
// last onset is L and nothing is logged after it. Home opens 30h later, the run retired.
const L = Date.UTC(2026, 9, 10, 12, 0, 0);
const ONSETS = [L - 200 * HOUR, L - 100 * HOUR, L - 40 * HOUR, L - 10 * HOUR, L];
// Off the hour grid, so the exact schedule is told apart from the ceiling's hourly reads.
const OPEN_AT = L + 30 * HOUR + 17 * 60_000;
const DUE = L + QUIET_STRETCH_MS;

function setFocus(f: boolean) {
  mockFocused = f;
  mockFocusListeners.forEach((l) => l());
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

// In steps, with each read's promise settled between them, as a real clock would: one big
// jump fires a timer and only then lets its read run, at the far end of the jump.
async function advance(ms: number) {
  const STEP = 5 * 60_000;
  for (let left = ms; left > 0; left -= STEP) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(STEP, left));
      await flush();
    });
  }
}

// Timers pending, past any queued tick (React leaves a microtask job the count includes).
function pendingTimers(): number {
  jest.runAllTicks();
  return jest.getTimerCount();
}

// Each read issues two queries (onsets, then logged rows); count reads, not queries.
const reads = () => mockGetAllAsync.mock.calls.length / 2;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(OPEN_AT);
  mockFocused = true;
  mockFocusListeners.clear();
  mockGetAllAsync.mockReset();
  mockGetAllAsync.mockImplementation(async () =>
    ONSETS.map((ms) => ({ occurred_at: new Date(ms).toISOString(), occurred_at_confidence: null })),
  );
  usePetStore.setState({ pets: [PET], activePet: PET } as any);
  useSyncStore.setState({ signalTick: 0, recordTick: 0, hydrationTick: 0 });
});
afterEach(() => jest.useRealTimers());

async function mountRetired() {
  const hook = renderHook(() => useGapWarning(true));
  await act(flush);
  expect(hook.result.current).toMatchObject({ text: null, answered: true, failed: false });
  expect(reads()).toBe(1);
  return hook;
}

describe('the gap warning re-reads on the clock (CUL-1949)', () => {
  it('a warning falling due by elapsed time alone shows while Home stays focused, with no write', async () => {
    const { result } = await mountRetired();
    await advance(DUE - OPEN_AT - 1);
    expect(result.current.text).toBeNull();
    await advance(1);
    expect(result.current.text).toMatch(/getting shorter/);
    // Only clock re-reads ran (the ceiling's hourly ones, then the boundary's): no tick moved.
    expect(reads()).toBe(2 + Math.floor((DUE - OPEN_AT) / GAP_REREAD_CEILING_MS));
    expect(useSyncStore.getState()).toMatchObject({ signalTick: 0, recordTick: 0, hydrationTick: 0 });
  });

  it('the schedule is cleared on blur: nothing reads, nothing is pending', async () => {
    await mountRetired();
    act(() => setFocus(false));
    expect(pendingTimers()).toBe(0);
    await advance(DUE - OPEN_AT + GAP_REREAD_CEILING_MS * 2);
    expect(reads()).toBe(1);
  });

  it('refocusing after the instant passed reads once and shows the warning', async () => {
    const { result } = await mountRetired();
    act(() => setFocus(false));
    await advance(DUE - OPEN_AT + HOUR);
    act(() => setFocus(true));
    await act(flush);
    expect(result.current.text).toMatch(/getting shorter/);
    expect(reads()).toBe(2);
  });

  it('the schedule is cleared on unmount', async () => {
    const { unmount } = await mountRetired();
    unmount();
    expect(pendingTimers()).toBe(0);
  });

  it('with no boundary ahead, the ceiling re-reads, and never sooner', async () => {
    mockGetAllAsync.mockImplementation(async () => []);
    renderHook(() => useGapWarning(true));
    await act(flush);
    expect(reads()).toBe(1);
    await advance(GAP_REREAD_CEILING_MS - 1);
    expect(reads()).toBe(1);
    await advance(1);
    expect(reads()).toBe(2);
    // And it keeps its cadence: one timer pending, never a pile-up.
    expect(pendingTimers()).toBe(1);
  });

  it('a failed read still schedules the ceiling, so a hiccup does not end the watch', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetAllAsync.mockRejectedValueOnce(new Error('db closed'));
    const { result } = renderHook(() => useGapWarning(true));
    await act(flush);
    expect(result.current.failed).toBe(true);
    await advance(GAP_REREAD_CEILING_MS);
    expect(result.current.failed).toBe(false);
    warn.mockRestore();
  });
});
