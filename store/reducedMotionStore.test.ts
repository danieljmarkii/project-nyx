// The one Reduce Motion read (CUL-1123). What this suite owns is the three-state
// contract the root gate and every `useReducedMotion()` caller stand on: unknown reads
// as still, the OS answer applies once, a change event is never overwritten by a read
// that was already in flight, and nothing about a failed or silent read can hold the
// app behind its splash.
import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import {
  REDUCED_MOTION_GATE_MS,
  __resetReducedMotionForTest,
  reducedMotionNow,
  startReducedMotionRead,
  stillWhenUnknown,
  useReducedMotionStore,
} from './reducedMotionStore';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Listener = (enabled: boolean) => void;

/** A read the test answers by hand, and the one listener the store registers. */
function stageOs() {
  const listeners: Listener[] = [];
  let answer: (enabled: boolean) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  const read = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
    () =>
      new Promise<boolean>((resolve, reject) => {
        answer = resolve;
        fail = reject;
      }),
  );
  const subscribe = jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation(((_type: string, cb: Listener) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);
  // The RN preset's AccessibilityInfo members are already `jest.fn()`s, and spyOn hands
  // back the existing mock rather than wrapping it, so restoreAllMocks never clears their
  // calls: without this, a count reads every earlier test's calls too.
  read.mockClear();
  subscribe.mockClear();
  return {
    read,
    subscribe,
    listeners,
    /** The OS answers the read. */
    answer: async (enabled: boolean) => {
      await act(async () => {
        answer(enabled);
      });
    },
    fail: async (e: unknown) => {
      await act(async () => {
        fail(e);
      });
    },
    /** The owner flips the setting. */
    emit: (enabled: boolean) => act(() => listeners.forEach((l) => l(enabled))),
  };
}

beforeEach(() => {
  __resetReducedMotionForTest();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('the rule: unknown reads as still', () => {
  it('stillWhenUnknown', () => {
    expect(stillWhenUnknown(null)).toBe(true);
    expect(stillWhenUnknown(true)).toBe(true);
    expect(stillWhenUnknown(false)).toBe(false);
  });

  it('before the OS answers, both readers say reduced and the gate is shut', () => {
    stageOs();
    startReducedMotionRead();
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    expect(reducedMotionNow()).toBe(true);
    expect(useReducedMotionStore.getState().gateOpen).toBe(false);
  });
});

describe('the read', () => {
  it('an answer of off applies, and opens the gate', async () => {
    const os = stageOs();
    startReducedMotionRead();
    const { result } = renderHook(() => useReducedMotion());
    await os.answer(false);
    expect(result.current).toBe(false);
    expect(reducedMotionNow()).toBe(false);
    expect(useReducedMotionStore.getState()).toEqual({ reduceMotion: false, gateOpen: true });
  });

  it('an answer of on applies', async () => {
    const os = stageOs();
    startReducedMotionRead();
    await os.answer(true);
    expect(useReducedMotionStore.getState()).toEqual({ reduceMotion: true, gateOpen: true });
  });

  it('subscribes before it reads, so a flip during the read is heard', () => {
    const os = stageOs();
    const order: string[] = [];
    os.subscribe.mockImplementation(((_t: string, cb: Listener) => {
      order.push('subscribe');
      os.listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);
    os.read.mockImplementation(() => {
      order.push('read');
      return new Promise<boolean>(() => {});
    });
    startReducedMotionRead();
    expect(order).toEqual(['subscribe', 'read']);
  });

  // The ordering hazard: the owner flips the setting while the read is in flight, the
  // event lands first, then the read answers with the value from BEFORE the flip.
  it('a change event that lands before the answer wins over it', async () => {
    const os = stageOs();
    startReducedMotionRead();
    os.emit(true);
    await os.answer(false);
    expect(useReducedMotionStore.getState().reduceMotion).toBe(true);
  });

  it('a change event after the answer moves every reader', async () => {
    const os = stageOs();
    startReducedMotionRead();
    const { result } = renderHook(() => useReducedMotion());
    await os.answer(false);
    expect(result.current).toBe(false);
    os.emit(true);
    expect(result.current).toBe(true);
    expect(reducedMotionNow()).toBe(true);
    os.emit(false);
    expect(result.current).toBe(false);
  });

  it('is started once: one read, one subscription, however often it is called', () => {
    const os = stageOs();
    startReducedMotionRead();
    startReducedMotionRead();
    startReducedMotionRead();
    expect(os.read).toHaveBeenCalledTimes(1);
    expect(os.subscribe).toHaveBeenCalledTimes(1);
    expect(os.subscribe).toHaveBeenCalledWith('reduceMotionChanged', expect.any(Function));
  });
});

describe('the gate never holds the app', () => {
  it('a failed read opens the gate and stays unknown, so still', async () => {
    const os = stageOs();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    startReducedMotionRead();
    await os.fail(new Error('bridge'));
    expect(useReducedMotionStore.getState()).toEqual({ reduceMotion: null, gateOpen: true });
    expect(reducedMotionNow()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    // …and a later flip still lands: the subscription outlives the failed read.
    os.emit(false);
    expect(reducedMotionNow()).toBe(false);
  });

  it('a read that never answers opens the gate at the bound, still until it does', async () => {
    jest.useFakeTimers();
    const os = stageOs();
    startReducedMotionRead();
    act(() => {
      jest.advanceTimersByTime(REDUCED_MOTION_GATE_MS - 1);
    });
    expect(useReducedMotionStore.getState().gateOpen).toBe(false);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(useReducedMotionStore.getState()).toEqual({ reduceMotion: null, gateOpen: true });
    // The late answer still applies: the bound gave up waiting, not listening.
    await os.answer(false);
    expect(useReducedMotionStore.getState().reduceMotion).toBe(false);
  });

  it('an answer inside the bound cancels the give-up timer', async () => {
    jest.useFakeTimers();
    let answer: (enabled: boolean) => void = () => {};
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockImplementation(() => new Promise<boolean>((resolve) => { answer = resolve; }));
    startReducedMotionRead();
    expect(jest.getTimerCount()).toBe(1);
    // Answered and flushed WITHOUT act: under fake timers act schedules a timer of its
    // own, which would be counted below as ours.
    answer(true);
    for (let i = 0; i < 3; i++) await Promise.resolve();
    expect(useReducedMotionStore.getState().reduceMotion).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
