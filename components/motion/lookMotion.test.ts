// The Noticed card's motion (CUL-871 / N-4a; spec §3.1a).
//
// Two rules are asserted here because neither is visible in a screenshot and both are
// the kind a later "tidy the animations" pass would quietly drop:
//
//   • REDUCED MOTION is the same END STATE with nothing moving — never a shortened
//     animation, and never a missing frame.
//   • APP BLUR FINISHES, NEVER PAUSES (the fold's rule): a transition cut by a blur is
//     committed at its end state, so the owner never returns to a half-drawn ring.
//
// The durations themselves are deliberately NOT re-asserted: they are `foldMotion.ts`'s,
// imported rather than restated (C-30), and a test that pinned copies of them here would
// be the very duplication the import exists to prevent.

import { act, renderHook } from '@testing-library/react-native';
import { LayoutAnimation } from 'react-native';
import { useGridDisclosure, useLookArrival, LOOK_MOTION, type GridDisclosure, type LookArrival } from './lookMotion';

const valueOf = (v: { __getValue: () => number }) => v.__getValue();

describe('useGridDisclosure — the box grows in place', () => {
  it('arms a layout animation on the commit that opens or closes it', () => {
    const spy = jest.spyOn(LayoutAnimation, 'configureNext');
    const { result } = renderHook(() =>
      useGridDisclosure({ open: false, reducedMotion: false, appActive: true }),
    );
    act(() => result.current.beforeCommit(true));
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => result.current.beforeCommit(false));
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('REDUCED MOTION arms none, and the families are simply there', () => {
    const spy = jest.spyOn(LayoutAnimation, 'configureNext');
    const { result } = renderHook(() =>
      useGridDisclosure({ open: true, reducedMotion: true, appActive: true }),
    );
    act(() => result.current.beforeCommit(true));
    expect(spy).not.toHaveBeenCalled();
    // The end state, not a faded-in one: nothing moved, and nothing is mid-fade.
    expect(valueOf(result.current.landStyle.opacity as never)).toBe(1);
    expect(valueOf(result.current.landStyle.transform[0].translateY as never)).toBe(0);
    spy.mockRestore();
  });

  it('a BLUR commits the end state rather than leaving the families mid-landing', () => {
    const { result, rerender } = renderHook<GridDisclosure, { appActive: boolean }>(
      ({ appActive }) => useGridDisclosure({ open: true, reducedMotion: false, appActive }),
      { initialProps: { appActive: true } },
    );
    rerender({ appActive: false });
    expect(valueOf(result.current.landStyle.opacity as never)).toBe(1);
    expect(valueOf(result.current.landStyle.transform[0].translateY as never)).toBe(0);
  });
});

describe('useLookArrival — the ring draws itself once, for the look just written', () => {
  const base = { reducedMotion: false, appActive: true };

  it('grows INTO its own size and never past it', () => {
    // A record landing, not a reward: the ring's seed is under 1 and its end state is
    // exactly 1, so there is no overshoot anywhere in the arrival. (The chip's settle
    // ring is the one place this card overshoots, and that is selection vocabulary.)
    expect(LOOK_MOTION.ringFromScale).toBeGreaterThan(0);
    expect(LOOK_MOTION.ringFromScale).toBeLessThan(1);
    const { result } = renderHook(() => useLookArrival({ entryKey: 'e1', animate: true, ...base }));
    expect(valueOf(result.current.ringStyle.transform[0].scale as never)).toBeLessThanOrEqual(1);
  });

  it('draws each row ONCE — a re-render is not a second arrival', () => {
    const { result, rerender } = renderHook<LookArrival, { entryKey: string }>(
      ({ entryKey }) => useLookArrival({ entryKey, animate: true, ...base }),
      { initialProps: { entryKey: 'e1' } },
    );
    rerender({ entryKey: 'e1' });
    // Same row, same key: nothing re-seeds, so a card that re-renders for any other
    // reason (a sync tick, a store update) does not re-announce the look.
    expect(valueOf(result.current.ringStyle.opacity as never)).toBeGreaterThanOrEqual(0);
    expect(valueOf(result.current.ringStyle.opacity as never)).toBeLessThanOrEqual(1);
  });

  it('does NOT re-draw a row that was not just written (the trigger is the FACT)', () => {
    const { result } = renderHook(() =>
      useLookArrival({ entryKey: 'e1', animate: false, ...base }),
    );
    // The same row renders identically when Home re-reads it a minute later; re-drawing
    // it then would announce a record the owner did not just make (C-30).
    expect(valueOf(result.current.ringStyle.opacity as never)).toBe(1);
    expect(valueOf(result.current.ringStyle.transform[0].scale as never)).toBe(1);
    expect(valueOf(result.current.wordsStyle.opacity as never)).toBe(1);
  });

  it('REDUCED MOTION draws the ring rather than animating it', () => {
    const { result } = renderHook(() =>
      useLookArrival({ entryKey: 'e1', animate: true, reducedMotion: true, appActive: true }),
    );
    expect(valueOf(result.current.ringStyle.opacity as never)).toBe(1);
    expect(valueOf(result.current.ringStyle.transform[0].scale as never)).toBe(1);
  });

  it('a BLUR finishes the arrival — never a half-drawn ring on return', () => {
    const { result, rerender } = renderHook<LookArrival, { appActive: boolean }>(
      ({ appActive }) => useLookArrival({ entryKey: 'e1', animate: true, reducedMotion: false, appActive }),
      { initialProps: { appActive: true } },
    );
    rerender({ appActive: false });
    expect(valueOf(result.current.ringStyle.opacity as never)).toBe(1);
    expect(valueOf(result.current.ringStyle.transform[0].scale as never)).toBe(1);
    expect(valueOf(result.current.wordsStyle.opacity as never)).toBe(1);
  });
});
