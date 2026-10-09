// CUL-1691 PR 1 — the Snackbar on its daylight ground (docs/nyx-completion-card-requirements.md §1).
//
// What only a rendered Snackbar can answer: the shadow sits on an OPAQUE ground (the
// #1125 grain, keyed on shadowColor because the wrapper carries elevation and no
// ground), and the message and the action read in the light-ground inks, so moving the
// ground to white did not leave either one white on white.

// The bar's height is all the Snackbar reads from the tab bar; the bar itself pulls in
// the pet store and storage, which this suite has no use for.
jest.mock('../nav/NyxTabBar', () => ({ TAB_HEIGHT: 80 }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Snackbar } from './Snackbar';
import { useSnackbarStore } from '../../store/snackbarStore';
import { theme } from '../../constants/theme';
import { OPAQUE_HEX, shadowedGrounds } from '../../testUtils/tree';

const color = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) as { color?: string }).color;

function seed(onAction?: () => void) {
  act(() => {
    useSnackbarStore.getState().show(
      onAction
        ? { message: 'Removed from your library', actionLabel: 'Undo', onAction }
        : { message: 'Copied support@getculprit.app' },
    );
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  act(() => useSnackbarStore.getState().hide());
  useSnackbarStore.setState({ payload: null, visible: false });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Snackbar — the daylight ground (CUL-1691)', () => {
  it('renders nothing before the first show', () => {
    const view = render(<Snackbar />);
    expect(view.toJSON()).toBeNull();
  });

  it('puts its shadow on an opaque ground', () => {
    const view = render(<Snackbar />);
    seed(jest.fn());
    const grounds = shadowedGrounds(view.UNSAFE_root);
    expect(grounds.length).toBeGreaterThan(0);
    for (const g of grounds) expect(g).toMatch(OPAQUE_HEX);
    expect(grounds).toContain(theme.colorSurface);
  });

  it('reads the message and the action in the light-ground inks', () => {
    const view = render(<Snackbar />);
    seed(jest.fn());
    expect(color(view.getByText('Removed from your library') as never)).toBe(theme.colorTextPrimary);
    expect(color(view.getByText('Undo') as never)).toBe(theme.colorAccentInk);
  });

  it('shows a message with no action as a message alone', () => {
    const view = render(<Snackbar />);
    seed();
    expect(color(view.getByText('Copied support@getculprit.app') as never)).toBe(theme.colorTextPrimary);
    expect(view.queryByRole('button')).toBeNull();
  });

  it('runs the action from its button', () => {
    const onAction = jest.fn();
    const view = render(<Snackbar />);
    seed(onAction);
    fireEvent.press(view.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
