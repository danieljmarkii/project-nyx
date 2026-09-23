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
      return <Text onPress={props.onClose as () => void}>stub-close</Text>;
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
  act(() => { useUiStore.setState({ logSheet: null }); });
});

describe('LogSheetHost', () => {
  it('holds the sheet mounted and closed until a door asks', () => {
    render(<LogSheetHost />);
    expect(mockLifecycle.mounts).toBe(1);
    expect(mockLastProps.current).toMatchObject({ visible: false, initialType: null });
  });

  it('opens it at the grid, or at the confirm the request names', () => {
    render(<LogSheetHost />);
    act(() => { useUiStore.getState().openLogSheet(); });
    expect(mockLastProps.current).toMatchObject({ visible: true, initialType: null });
    act(() => { useUiStore.getState().closeLogSheet(); });
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
    render(<LogSheetHost />);
    expect(mockLifecycle.mounts).toBe(1);
    act(() => { useUiStore.getState().openLogSheet('vomit'); });
    expect(mockLifecycle.mounts).toBe(2);
    act(() => { useUiStore.getState().closeLogSheet(); });
    act(() => { useUiStore.getState().openLogSheet(); });
    expect(mockLifecycle.mounts).toBe(3);
    // One sheet at a time: each fresh mount replaced the one before it.
    expect(mockLifecycle.unmounts).toBe(2);
  });
});
