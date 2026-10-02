// `TrialManageSheet` — CUL-1040 (spec §4.1/§4.2, D6a).
//
// Two things are being guarded here, and the second arrived from review.
//
// (1) THE TWO ACTS ARE NEVER CONFUSED — what each row says, that neither row's copy
//     leaks the other's consequence, and that picking one never fires the other's
//     handler.
// (2) EXACTLY ONE MODAL IS EVER MOUNTED, INCLUDING MID-TRANSITION (C-14). The first
//     cut shipped *Change the window* as its own sibling `Modal`, so a row handler
//     closed one and presented another in the same React commit — the shape that
//     wedged the beta log sheet until force-quit. It is a STEP now, so the Modal
//     never dismisses on that path; and `Replace the trial`, which must cross to
//     `StartTrialModal`, only closes and leaves the presenting to `onDismissed`.
//
//     The per-component "exactly one Modal" assertion below is necessary and was
//     NOT sufficient: it stayed green while the host mounted two individually clean
//     components that still overlapped. So the step assertions are the real guard.

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
    trial: { id: 't-1', startDayKey: '2026-07-26', currentTargetDays: 56, dayCounter: 53 },
    petName: 'Nyx',
    onClose: jest.fn(),
    onDismissed: jest.fn(),
    onReplaceTrial: jest.fn(),
    onSelectionChanged: jest.fn(),
    onSave: jest.fn(),
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
  it('Change the window becomes a STEP — this Modal never dismisses (C-14)', () => {
    // THE STRUCTURAL FIX. The window form replaces the door's body; nothing is
    // presented over anything, so there is no dismiss-and-present commit to race.
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-change_window'));
    expect(t.getByText('How long is this trial now?')).toBeTruthy();
    // The door is gone, and the sheet was never closed to get there.
    expect(t.queryByTestId('trial-manage-change_window')).toBeNull();
    expect(t.props.onClose).not.toHaveBeenCalled();
    expect(t.props.onReplaceTrial).not.toHaveBeenCalled();
    // Still exactly one Modal, mid-transition.
    expect(t.UNSAFE_getAllByType(require('react-native').Modal)).toHaveLength(1);
  });

  it('the window step’s own Cancel goes back to the door, not out of the sheet', () => {
    // The owner came through the door, so that is where back leads.
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-change_window'));
    fireEvent.press(t.getByTestId('trial-window-cancel'));
    expect(t.getByTestId('trial-manage-change_window')).toBeTruthy();
    expect(t.props.onClose).not.toHaveBeenCalled();
  });

  it('re-opening always lands on the door, never the form last seen', () => {
    // Skipping the door is how a destructive neighbour gets picked by muscle memory.
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-change_window'));
    t.rerender(<TrialManageSheet {...t.props} visible={false} />);
    t.rerender(<TrialManageSheet {...t.props} visible />);
    expect(t.getByTestId('trial-manage-change_window')).toBeTruthy();
    expect(t.queryByText('How long is this trial now?')).toBeNull();
  });

  it('the window row is unavailable with no running trial, rather than opening empty', () => {
    const t = setup({ trial: null });
    const row = t.getByTestId('trial-manage-change_window');
    expect(row.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(row);
    expect(t.queryByText('How long is this trial now?')).toBeNull();
  });

  it('Replace the trial only CLOSES — the next Modal waits for the dismissal', () => {
    // The one hand-off that still crosses a Modal boundary. Arming it here and
    // presenting on `onDismiss` is what keeps it out of the row's own commit.
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-replace_trial'));
    expect(t.props.onReplaceTrial).toHaveBeenCalledTimes(1);
    expect(t.props.onClose).toHaveBeenCalledTimes(1);
    expect(t.queryByText('How long is this trial now?')).toBeNull();
  });

  it('…and on iOS it does NOT fire onDismissed itself — the Modal does', () => {
    // jest-expo reports `Platform.OS === 'ios'`, which is the branch that must defer.
    expect(require('react-native').Platform.OS).toBe('ios');
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-replace_trial'));
    expect(t.props.onDismissed).not.toHaveBeenCalled();
  });

  it('Cancel opens neither act', () => {
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-cancel'));
    expect(t.props.onClose).toHaveBeenCalledTimes(1);
    expect(t.props.onReplaceTrial).not.toHaveBeenCalled();
    expect(t.queryByText('How long is this trial now?')).toBeNull();
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

  it('renders exactly ONE Modal, on every step and open or closed', () => {
    for (const visible of [true, false]) {
      const t = setup({ visible });
      expect(t.UNSAFE_getAllByType(require('react-native').Modal)).toHaveLength(1);
    }
    // …and on the window step, which is where the second one used to live.
    const t = setup();
    fireEvent.press(t.getByTestId('trial-manage-change_window'));
    expect(t.UNSAFE_getAllByType(require('react-native').Modal)).toHaveLength(1);
  });

  it('wires the Modal’s own onDismiss, which is what the hand-off rides', () => {
    // A `onDismissed` prop that reached no `onDismiss` would leave the start form
    // unreachable from the door on iOS — a comment's worth of wiring, asserted.
    const t = setup();
    const modal = t.UNSAFE_getAllByType(require('react-native').Modal)[0];
    expect(modal.props.onDismiss).toBe(t.props.onDismissed);
  });
});
