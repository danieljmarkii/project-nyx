import { act, renderHook } from '@testing-library/react-native';
import { LayoutAnimation } from 'react-native';
import { useWarningArrival, WARNING_ARRIVAL, WARNING_ARRIVAL_TOTAL_MS } from './warningArrivalMotion';
import { FOLD_MOTION, UNFOLD_LAYOUT } from './foldMotion';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useWarningArrival', () => {
  it('lifts the fold’s numbers rather than restating them', () => {
    expect(WARNING_ARRIVAL.railLeadMs).toBe(FOLD_MOTION.railLeadMs);
    expect(WARNING_ARRIVAL.boxLagMs).toBe(80);
    expect(WARNING_ARRIVAL.openMs).toBe(FOLD_MOTION.openMs);
  });

  it('draws still on mount and on a key of 0', () => {
    const { result } = renderHook(() => useWarningArrival({ enterKey: 0, reducedMotion: false, appActive: true }));
    expect(result.current.phase).toBe('idle');
  });

  it('leads, opens the box 80ms behind with the unfold settle, then returns to idle', () => {
    const spy = jest.spyOn(LayoutAnimation, 'configureNext');
    const { result, rerender } = renderHook((p: { k: number }) =>
      useWarningArrival({ enterKey: p.k, reducedMotion: false, appActive: true }),
      { initialProps: { k: 0 } },
    );
    rerender({ k: 1 });
    expect(result.current.phase).toBe('leading');
    act(() => jest.advanceTimersByTime(WARNING_ARRIVAL.boxLagMs));
    expect(result.current.phase).toBe('opening');
    expect(spy).toHaveBeenCalledWith(UNFOLD_LAYOUT);
    act(() => jest.advanceTimersByTime(WARNING_ARRIVAL_TOTAL_MS));
    expect(result.current.phase).toBe('idle');
    spy.mockRestore();
  });

  it('crossfades under Reduce Motion, with no layout animation', () => {
    const spy = jest.spyOn(LayoutAnimation, 'configureNext');
    const { result, rerender } = renderHook((p: { k: number }) =>
      useWarningArrival({ enterKey: p.k, reducedMotion: true, appActive: true }),
      { initialProps: { k: 0 } },
    );
    rerender({ k: 1 });
    expect(result.current.phase).toBe('crossfade');
    act(() => jest.advanceTimersByTime(WARNING_ARRIVAL_TOTAL_MS));
    expect(result.current.phase).toBe('idle');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a blur finishes the arrival', () => {
    const { result, rerender } = renderHook((p: { k: number; a: boolean }) =>
      useWarningArrival({ enterKey: p.k, reducedMotion: false, appActive: p.a }),
      { initialProps: { k: 0, a: true } },
    );
    rerender({ k: 1, a: true });
    expect(result.current.phase).toBe('leading');
    rerender({ k: 1, a: false });
    expect(result.current.phase).toBe('idle');
  });
});
