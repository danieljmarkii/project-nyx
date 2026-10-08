// The log sheet's host + its store slice (CUL-503 / CUL-504).
//
// The sheet's behaviour for a request is pinned in EventTypeSheet.test.tsx, through this
// host and the real sheet. What is only true HERE is the lifecycle, and both halves of
// it are load-bearing: a close keeps the instance (so the Modal can slide out; an
// unmounted Modal just vanishes), and every open mounts a fresh one (so `initialType`,
// read at mount, is read for THIS open). The sheet is stubbed to count mounts and report
// the props it was given.

const mockLifecycle = { mounts: 0, unmounts: 0 };
const mockLastProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('./EventTypeSheet', () => {
  const { useEffect } = require('react');
  const { Text } = require('react-native');
  return {
    EventTypeSheet: (props: Record<string, unknown>) => {
      mockLastProps.current = props;
      useEffect(() => {
        mockLifecycle.mounts += 1;
        return () => { mockLifecycle.unmounts += 1; };
      }, []);
      return (
        <>
          <Text onPress={props.onClose as () => void}>stub-close</Text>
          {/* The real sheet calls this a commit after its exit took the Modal down. */}
          <Text onPress={props.onExited as () => void}>stub-exited</Text>
        </>
      );
    },
  };
});

import { act, fireEvent, render } from '@testing-library/react-native';
import { LogSheetHost } from './LogSheetHost';
import { useUiStore } from '../../store/uiStore';

beforeEach(() => {
  mockLifecycle.mounts = 0;
  mockLifecycle.unmounts = 0;
  mockLastProps.current = null;
  act(() => { useUiStore.setState({ logSheet: null, logSheetVeilTaken: false }); });
});

describe('LogSheetHost', () => {
  it('holds the sheet mounted and closed until a door asks', () => {
    render(<LogSheetHost />);
    expect(mockLifecycle.mounts).toBe(1);
    expect(mockLastProps.current).toMatchObject({ visible: false, initialType: null });
  });

  it('opens it at the grid, or at the confirm the request names', () => {
    const view = render(<LogSheetHost />);
    act(() => { useUiStore.getState().openLogSheet(); });
    expect(mockLastProps.current).toMatchObject({ visible: true, initialType: null });
    act(() => { useUiStore.getState().closeLogSheet(); });
    fireEvent.press(view.getByText('stub-exited'));
    act(() => { useUiStore.getState().openLogSheet('diarrhea'); });
    expect(mockLastProps.current).toMatchObject({ visible: true, initialType: 'diarrhea' });
  });

  it('the sheet’s own close clears the request', () => {
    const view = render(<LogSheetHost />);
    act(() => { useUiStore.getState().openLogSheet('vomit'); });
    fireEvent.press(view.getByText('stub-close'));
    expect(useUiStore.getState().logSheet).toBeNull();
    expect(mockLastProps.current).toMatchObject({ visible: false });
  });

  it('a close keeps the instance, so the Modal can slide out', () => {
    render(<LogSheetHost />);
    act(() => { useUiStore.getState().openLogSheet('vomit'); });
    const mountsWhileOpen = mockLifecycle.mounts;
    const unmountsWhileOpen = mockLifecycle.unmounts;
    act(() => { useUiStore.getState().closeLogSheet(); });
    expect(mockLifecycle.mounts).toBe(mountsWhileOpen);
    expect(mockLifecycle.unmounts).toBe(unmountsWhileOpen);
  });

  it('every open mounts a fresh sheet, so its starting stage is read for that open', () => {
    const view = render(<LogSheetHost />);
    expect(mockLifecycle.mounts).toBe(1);
    act(() => { useUiStore.getState().openLogSheet('vomit'); });
    expect(mockLifecycle.mounts).toBe(2);
    act(() => { useUiStore.getState().closeLogSheet(); });
    fireEvent.press(view.getByText('stub-exited'));
    act(() => { useUiStore.getState().openLogSheet(); });
    expect(mockLifecycle.mounts).toBe(3);
    // One sheet at a time: each fresh mount replaced the one before it.
    expect(mockLifecycle.unmounts).toBe(2);
  });

  // The other side of "every open mounts a fresh sheet": a second open while one is up
  // is not an open. A quick double tap on a door landed it while the first sheet was
  // still sliding in, and the bumped key unmounted that presenting Modal and mounted
  // another (the CUL-662 iOS wedge class). The sheet on screen keeps its request.
  it('a second open while the sheet is up bumps the key once, never re-keying the sheet', () => {
    render(<LogSheetHost />);
    const opensBefore = useUiStore.getState().logSheetOpens;
    act(() => { useUiStore.getState().openLogSheet(); });
    act(() => { useUiStore.getState().openLogSheet('vomit'); });
    expect(useUiStore.getState().logSheetOpens).toBe(opensBefore + 1);
    expect(mockLifecycle.mounts).toBe(2);
    expect(mockLifecycle.unmounts).toBe(1);
    expect(mockLastProps.current).toMatchObject({ visible: true, initialType: null });
  });
});

// ── CUL-1642: THE EXITING PHASE, AND CUL-1472'S RE-KEY RACE ──────────────────
//
// The sheet's Modal no longer slides out on its own (`animationType` "none"), so the
// sheet runs its exit and reports `onExited` once its Modal is down. A door tapped
// during that exit used to bump the key at once: the old instance unmounted with its
// Modal still on screen and a fresh one presented in the SAME commit, the two-Modal
// state C-14 forbids. The host now holds the new open until the old sheet has left.
describe('LogSheetHost — the exiting phase (CUL-1642, CUL-1472)', () => {
  it('a door tapped while the closed sheet is still leaving waits for it, then mounts fresh', () => {
    const view = render(<LogSheetHost />);
    act(() => { useUiStore.getState().openLogSheet('vomit'); });
    act(() => { useUiStore.getState().closeLogSheet(); });
    const mountsMidExit = mockLifecycle.mounts;
    const unmountsMidExit = mockLifecycle.unmounts;

    act(() => { useUiStore.getState().openLogSheet('diarrhea'); });
    // Still the leaving instance, still told it is closed: no re-key mid-exit.
    expect(mockLifecycle.mounts).toBe(mountsMidExit);
    expect(mockLifecycle.unmounts).toBe(unmountsMidExit);
    expect(mockLastProps.current).toMatchObject({ visible: false });

    fireEvent.press(view.getByText('stub-exited'));
    // Now the fresh one, for the open that waited.
    expect(mockLifecycle.mounts).toBe(mountsMidExit + 1);
    expect(mockLifecycle.unmounts).toBe(unmountsMidExit + 1);
    expect(mockLastProps.current).toMatchObject({ visible: true, initialType: 'diarrhea' });
  });

  it('a close with no open waiting mounts nothing when the exit ends', () => {
    const view = render(<LogSheetHost />);
    act(() => { useUiStore.getState().openLogSheet(); });
    act(() => { useUiStore.getState().closeLogSheet(); });
    const mounts = mockLifecycle.mounts;
    fireEvent.press(view.getByText('stub-exited'));
    expect(mockLifecycle.mounts).toBe(mounts);
    expect(mockLastProps.current).toMatchObject({ visible: false });
  });

  it('hands the request’s veil and the store’s veil hand-off to the sheet', () => {
    render(<LogSheetHost />);
    act(() => { useUiStore.getState().openLogSheet(undefined, { veil: 'handed' }); });
    expect(mockLastProps.current).toMatchObject({ visible: true, veil: 'handed' });
    expect(useUiStore.getState().logSheetVeilTaken).toBe(false);
    act(() => { (mockLastProps.current?.onVeilTaken as () => void)(); });
    expect(useUiStore.getState().logSheetVeilTaken).toBe(true);
  });

  it('every other door owns its veil', () => {
    render(<LogSheetHost />);
    act(() => { useUiStore.getState().openLogSheet(); });
    expect(mockLastProps.current).toMatchObject({ visible: true, veil: 'own' });
  });
});
