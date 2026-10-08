// A bottom sheet's rise and its way out (CUL-1642). What is pinned: nothing moves before
// the Modal is shown; a handed veil is at full in the same tick the hand-off fires and
// never fades; an owned veil fades up with the rise; the rise is the app's settle (C-30,
// derived from the flight's spring, never restated); Reduce Motion is a crossfade with
// no travel at all (CUL-1178, for this sheet); the Modal outlives `visible` by the exit
// and `onExited` waits for the commit that took it down; a blur finishes.

import { act, renderHook } from '@testing-library/react-native';
import { FLIGHT_SPRING } from './flightMotion';
import { FOLD_MOTION } from './foldMotion';
import { SHEET_MOTION, SHEET_SPRING, useSheetMotion, type SheetVeil } from './sheetMotion';
import { useReducedMotionStore } from '../../store/reducedMotionStore';
import { theme } from '../../constants/theme';

const valueOf = (v: unknown) => (v as { __getValue: () => number }).__getValue();
const TRAVEL = 844;

type P = { visible: boolean; veil?: SheetVeil; appActive?: boolean };

function mount(initial: P, cbs: { onVeilTaken?: jest.Mock; onExited?: jest.Mock } = {}) {
  return renderHook(
    (p: P) => useSheetMotion({
      visible: p.visible,
      veil: p.veil ?? 'own',
      travelPt: TRAVEL,
      appActive: p.appActive ?? true,
      onVeilTaken: cbs.onVeilTaken,
      onExited: cbs.onExited,
    }),
    { initialProps: initial },
  );
}

const sheetY = (r: { current: ReturnType<typeof useSheetMotion> }) =>
  valueOf(r.current.sheetStyle.transform[0].translateY);

describe('useSheetMotion — CUL-1642', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useReducedMotionStore.setState({ reduceMotion: false });
  });
  afterEach(() => {
    jest.useRealTimers();
    useReducedMotionStore.setState({ reduceMotion: null });
  });

  it('the rise is the app’s settle, clamped at its first arrival, and the beats are the fold’s', () => {
    expect(SHEET_SPRING).toEqual({ ...FLIGHT_SPRING, overshootClamping: true });
    expect(SHEET_MOTION.riseMs).toBe(FOLD_MOTION.openMs);
    expect(SHEET_MOTION.exitMs).toBe(FOLD_MOTION.leaveMs);
    expect(SHEET_MOTION.crossfadeMs).toBe(theme.durationFast);
    // Close is getting out of the way: never slower than the way in.
    expect(SHEET_MOTION.exitMs).toBeLessThan(SHEET_MOTION.riseMs);
  });

  it('nothing moves before the Modal is shown: the sheet waits below the screen, the veil at 0', () => {
    const { result } = mount({ visible: true });
    expect(result.current.modalVisible).toBe(true);
    expect(result.current.phase).toBe('presenting');
    expect(sheetY(result)).toBe(TRAVEL);
    expect(valueOf(result.current.scrimStyle.opacity)).toBe(0);
  });

  it('an owned veil fades up WITH the rise, and the sheet comes to rest at 0', () => {
    const onVeilTaken = jest.fn();
    const { result } = mount({ visible: true }, { onVeilTaken });
    act(() => { result.current.onShow(); });
    expect(result.current.phase).toBe('entering');
    expect(onVeilTaken).toHaveBeenCalledTimes(1);
    expect(valueOf(result.current.scrimStyle.opacity)).toBeLessThan(1);
    act(() => { jest.advanceTimersByTime(1500); });
    expect(result.current.phase).toBe('open');
    expect(sheetY(result)).toBe(0);
    expect(valueOf(result.current.scrimStyle.opacity)).toBe(1);
  });

  it('a HANDED veil is at full in the same tick the hand-off fires, and never fades', () => {
    let scrimAtHandOff: number | null = null;
    const ref: { current: ReturnType<typeof useSheetMotion> | null } = { current: null };
    const onVeilTaken = jest.fn(() => {
      scrimAtHandOff = valueOf(ref.current?.scrimStyle.opacity);
    });
    const { result } = mount({ visible: true, veil: 'handed' }, { onVeilTaken });
    ref.current = result.current;
    expect(valueOf(result.current.scrimStyle.opacity)).toBe(0);
    act(() => { result.current.onShow(); });
    // The other veil drops in this tick, so this one must already be up: never a frame
    // of two veils and never a frame of none.
    expect(scrimAtHandOff).toBe(1);
    act(() => { jest.advanceTimersByTime(50); });
    expect(valueOf(result.current.scrimStyle.opacity)).toBe(1);
  });

  it('a Modal that never reports shown is started anyway, so no veil is stranded', () => {
    const onVeilTaken = jest.fn();
    const { result } = mount({ visible: true, veil: 'handed' }, { onVeilTaken });
    act(() => { jest.advanceTimersByTime(SHEET_MOTION.shownTtlMs - 1); });
    expect(onVeilTaken).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onVeilTaken).toHaveBeenCalledTimes(1);
    // …and a late onShow does not start it twice.
    act(() => { result.current.onShow(); });
    expect(onVeilTaken).toHaveBeenCalledTimes(1);
  });

  it('Reduce Motion is a crossfade: the sheet never travels, its opacity rises', () => {
    useReducedMotionStore.setState({ reduceMotion: true });
    const { result } = mount({ visible: true });
    act(() => { result.current.onShow(); });
    expect(sheetY(result)).toBe(0);
    expect(valueOf(result.current.sheetStyle.opacity)).toBeLessThan(1);
    act(() => { jest.advanceTimersByTime(SHEET_MOTION.crossfadeMs + 50); });
    expect(sheetY(result)).toBe(0);
    expect(valueOf(result.current.sheetStyle.opacity)).toBe(1);
    expect(result.current.phase).toBe('open');
  });

  it('the Modal outlives `visible` by the exit, and onExited waits for it to go down', () => {
    const onExited = jest.fn();
    const { result, rerender } = mount({ visible: true }, { onExited });
    act(() => { result.current.onShow(); });
    act(() => { jest.advanceTimersByTime(1500); });
    act(() => rerender({ visible: false }));
    expect(result.current.phase).toBe('exiting');
    expect(result.current.modalVisible).toBe(true);
    expect(onExited).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(SHEET_MOTION.exitMs + 50); });
    expect(result.current.modalVisible).toBe(false);
    expect(sheetY(result)).toBe(TRAVEL);
    expect(valueOf(result.current.scrimStyle.opacity)).toBe(0);
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('under Reduce Motion the exit is a crossfade too: no travel on the way out', () => {
    useReducedMotionStore.setState({ reduceMotion: true });
    const { result, rerender } = mount({ visible: true });
    act(() => { result.current.onShow(); });
    act(() => { jest.advanceTimersByTime(500); });
    act(() => rerender({ visible: false }));
    act(() => { jest.advanceTimersByTime(SHEET_MOTION.crossfadeMs / 2); });
    expect(sheetY(result)).toBe(0);
    act(() => { jest.advanceTimersByTime(SHEET_MOTION.crossfadeMs); });
    expect(result.current.modalVisible).toBe(false);
    expect(sheetY(result)).toBe(0);
    expect(valueOf(result.current.sheetStyle.opacity)).toBe(0);
  });

  it('a blur finishes: mid-rise it is up, mid-exit it is gone', () => {
    const onExited = jest.fn();
    const { result, rerender } = mount({ visible: true }, { onExited });
    act(() => { result.current.onShow(); });
    act(() => rerender({ visible: true, appActive: false }));
    expect(result.current.phase).toBe('open');
    expect(sheetY(result)).toBe(0);
    act(() => rerender({ visible: true, appActive: true }));
    act(() => rerender({ visible: false, appActive: true }));
    act(() => rerender({ visible: false, appActive: false }));
    expect(result.current.modalVisible).toBe(false);
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('a sheet mounted closed presents nothing and reports no exit', () => {
    const onExited = jest.fn();
    const { result } = mount({ visible: false }, { onExited });
    expect(result.current.modalVisible).toBe(false);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onExited).not.toHaveBeenCalled();
  });
});
