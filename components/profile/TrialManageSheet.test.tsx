// `TrialManageSheet` — CUL-1040 (spec §4.1, D6a).
//
// The whole file is about ONE risk: the two acts being confused. So it asserts what
// each row SAYS, that neither row's copy leaks the other's consequence, and that
// picking one never fires the other's handler.

// The sheet reads the bottom inset for its own padding; there is no provider in a
// unit render. Mocked to zero, as `BookVisitSheet.test.tsx` does.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { render, fireEvent, within } from '@testing-library/react-native';
import { TrialManageSheet } from './TrialManageSheet';

function setup(overrides: Partial<Parameters<typeof TrialManageSheet>[0]> = {}) {
  const props = {
    visible: true,
    petName: 'Nyx',
    onClose: jest.fn(),
    onChangeWindow: jest.fn(),
    onReplaceTrial: jest.fn(),
    ...overrides,
  };
  return { ...render(<TrialManageSheet {...props} />), props };
}

describe('the two rows, and the line between them', () => {
  it('names both acts with the mock’s copy', () => {
    const t = setup();
    expect(t.getByText('Change the window')).toBeTruthy();
    expect(t.getByText('The trial keeps running — only its length changes')).toBeTruthy();
    expect(t.getByText('Replace the trial')).toBeTruthy();
    expect(t.getByText('End this one and start a new one')).toBeTruthy();
  });

  it('names the pet whose trial this is', () => {
    expect(setup().getByText('For Nyx')).toBeTruthy();
  });

  it('the safe row’s copy never says the trial ends, and the destructive row’s always does', () => {
    // The one comprehension failure this sheet exists to prevent. `Change the
    // window` must not read as ending anything, and `Replace the trial` must not
    // read as an edit — which is what "Change" did before the relabel (CUL-156).
    //
    // SCOPED WITH `within`, per ROW, because the assertion is about which row says
    // what: a whole-sheet text match would find "End this one" (correctly, from the
    // other row) and pass while the safe row said it too.
    const t = setup();
    const safe = within(t.getByTestId('trial-manage-change_window'));
    const destructive = within(t.getByTestId('trial-manage-replace_trial'));

    expect(safe.queryByText(/\b(end|ends|ending|stop|stops|new trial)\b/i)).toBeNull();
    expect(safe.getByText(/keeps running/)).toBeTruthy();
    expect(destructive.getByText(/End this one/)).toBeTruthy();
    // And the inverse: the destructive row must not read as an edit.
    expect(destructive.queryByText(/\b(length|keeps running|only)\b/i)).toBeNull();
  });

  it('that scoping is non-vacuous — each row really does hold its own two lines', () => {
    // A `within` over a node that contains nothing passes every `queryByText`
    // negative for free. Both positives above are the floor; this pins the count.
    const t = setup();
    for (const [id, lines] of [
      ['trial-manage-change_window', ['Change the window', 'The trial keeps running — only its length changes']],
      ['trial-manage-replace_trial', ['Replace the trial', 'End this one and start a new one']],
    ] as const) {
      const scope = within(t.getByTestId(id));
      for (const line of lines) expect(scope.getByText(line)).toBeTruthy();
    }
  });

  it('carries no exclamation mark anywhere', () => {
    const t = setup();
    for (const s of [
      'Change the window', 'The trial keeps running — only its length changes',
      'Replace the trial', 'End this one and start a new one', 'For Nyx', 'Cancel',
    ]) {
      expect(t.getByText(s)).toBeTruthy();
      expect(s).not.toContain('!');
    }
  });
});

describe('each row opens its own act, and only its own', () => {
  it('Change the window closes the door and opens the window sheet', () => {
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-change_window'));
    expect(t.props.onChangeWindow).toHaveBeenCalledTimes(1);
    expect(t.props.onReplaceTrial).not.toHaveBeenCalled();
    // The door closes behind it — two stacked modals from one presenter is
    // unreliable on iOS and wedged a sheet for every multi-pet account (C-14).
    expect(t.props.onClose).toHaveBeenCalledTimes(1);
  });

  it('Replace the trial opens the existing flow, and never the window sheet', () => {
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-replace_trial'));
    expect(t.props.onReplaceTrial).toHaveBeenCalledTimes(1);
    expect(t.props.onChangeWindow).not.toHaveBeenCalled();
  });

  it('Cancel opens neither', () => {
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-cancel'));
    expect(t.props.onClose).toHaveBeenCalledTimes(1);
    expect(t.props.onChangeWindow).not.toHaveBeenCalled();
    expect(t.props.onReplaceTrial).not.toHaveBeenCalled();
  });

  it('a row’s SUB-LINE is inside the same responder as its label', () => {
    // `fireEvent.press` can reach a handler by DESCENDING from an enclosing
    // composite, so pressing the sub could pass over a defect where the sub is an
    // inert sibling. The identity comparison is the real test (C-6).
    const t = setup();
    const owning = (node: { parent: unknown }) => {
      let n: any = node;
      while (n && !(n.props?.onStartShouldSetResponder || n.props?.onClick)) n = n.parent;
      return n;
    };
    const label = t.getByText('Change the window');
    const sub = t.getByText('The trial keeps running — only its length changes');
    expect(owning(label)).not.toBeNull();
    expect(owning(label)).toBe(owning(sub));
  });
});

describe('the layer declares itself modal (C-14)', () => {
  it('sets accessibilityViewIsModal so a reader cannot wander behind it', () => {
    const t = setup();
    const modal = t.UNSAFE_getAllByProps({ accessibilityViewIsModal: true });
    expect(modal.length).toBeGreaterThan(0);
  });

  it('renders exactly ONE Modal, open or closed', () => {
    for (const visible of [true, false]) {
      const t = setup({ visible });
      expect(t.UNSAFE_getAllByType(require('react-native').Modal)).toHaveLength(1);
    }
  });
});
