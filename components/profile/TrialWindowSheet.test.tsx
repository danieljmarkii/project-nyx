// `TrialWindowSheet` — CUL-1040 (spec §4.2, D1a/D3a/D4a).
//
// ── WHAT THIS FILE IS FOR, AND WHAT IT IS NOT ─────────────────────────────────
//
// The RULES are in `lib/trialWindowSheet.test.ts`, over integers — which totals are
// offered, the two refusals, the ceiling, whether Save may fire. Asserting them
// again through a renderer would be the same rule tested twice, the second time by
// pressing whichever chips happen to be mounted.
//
// What can ONLY be asserted here is the WIRING: that the sheet draws what the module
// decided, that the vet box starts unchecked and reaches the write, that Save passes
// a TOTAL rather than a delta, and that a refused total cannot be submitted at all.
//
// The fixtures are anchored to `Date.now()` — every question under them is a
// local-day question and CI runs at UTC+14 / +12:45 / −10 (C-29).

// No provider in a unit render; the sheet reads the bottom inset for its padding.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { render, fireEvent, within } from '@testing-library/react-native';
import { TrialWindowSheet } from './TrialWindowSheet';

/** 'YYYY-MM-DD' for a local date `daysAgo` before today. */
function localDayKeyAgo(daysAgo: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - daysAgo);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The worked case: the PM's cat, day 53 of 56, the vet says twelve weeks. */
const WORKED = {
  id: 't-1',
  startDayKey: localDayKeyAgo(52),
  currentTargetDays: 56,
  dayCounter: 53,
};

function setup(overrides: Partial<Parameters<typeof TrialWindowSheet>[0]> = {}) {
  const props = {
    visible: true,
    trial: WORKED,
    petName: 'Nyx',
    onClose: jest.fn(),
    onSave: jest.fn(),
    ...overrides,
  };
  return { ...render(<TrialWindowSheet {...props} />), props };
}

describe('the sheet draws what the module decided (§4.2, mock §3)', () => {
  it('asks for a TOTAL, and says whose decision the length is', () => {
    const t = setup();
    expect(t.getByText('How long is this trial now?')).toBeTruthy();
    // The second clause is what keeps the sheet inside TE-5: the app records a
    // clinical judgment, it does not make one.
    expect(
      t.getByText(/Nyx is on day 53\. Your vet decides the length — this\s+just records it\./),
    ).toBeTruthy();
  });

  it('never asks for a delta anywhere on the surface', () => {
    // D1a. "+2 weeks" / "how much longer" is the sheet this replaced, and before
    // the milestone it could not say whether it meant four weeks past today or past
    // the window's end.
    const t = setup();
    expect(t.queryByText(/more weeks|how much longer|\+\s*\d/i)).toBeNull();
  });

  it('marks the current window so "leave it alone" is an option, not the Cancel button', () => {
    expect(setup().getByText('8 weeks · now')).toBeTruthy();
  });

  it('offers the forward totals and the free-entry escape hatch', () => {
    const t = setup();
    for (const label of ['10 weeks', '12 weeks', '16 weeks', 'Something else']) {
      expect(t.getByText(label)).toBeTruthy();
    }
  });

  it('offers NO backward total — forward-only is an absence, not a dimmed chip', () => {
    // Current window 84 on day 60: 8 and 10 weeks are behind it and must not be on
    // the sheet at all (TE-3).
    const t = setup({ trial: { ...WORKED, currentTargetDays: 84, dayCounter: 60 } });
    expect(t.queryByText('8 weeks')).toBeNull();
    expect(t.queryByText('10 weeks')).toBeNull();
    expect(t.getByText('12 weeks · now')).toBeTruthy();
    expect(t.getByText('16 weeks')).toBeTruthy();
  });

  it('shows the end date, and recomputes it when the chip changes', () => {
    const t = setup();
    fireEvent.press(t.getByText('12 weeks'));
    const first = within(t.getByTestId('trial-window-summary'));
    expect(first.getByText(/^12 weeks — ends /)).toBeTruthy();
    expect(first.getByText('That is 28 more days than the window you set.')).toBeTruthy();

    fireEvent.press(t.getByText('16 weeks'));
    const second = within(t.getByTestId('trial-window-summary'));
    expect(second.getByText(/^16 weeks — ends /)).toBeTruthy();
    expect(second.getByText('That is 56 more days than the window you set.')).toBeTruthy();
    // The 12-week line is GONE, not accumulated beside it.
    expect(t.queryByText(/^12 weeks — ends /)).toBeNull();
  });

  it('the chips WRAP rather than scroll horizontally (B-146)', () => {
    // A silent h-scroll hides options off-screen, so owners pick from only what
    // they can see — a discoverability AND correctness problem on a closed set.
    //
    // Asserted off the FLATTENED rendered style, not off restated tokens (C-5), and
    // paired with the absence of any horizontal scroller in the tree.
    const t = setup();
    const group = t.UNSAFE_getAllByProps({ accessibilityRole: 'radiogroup' })[0];
    const flat = require('react-native').StyleSheet.flatten(group.props.style);
    expect(flat.flexWrap).toBe('wrap');
    expect(t.UNSAFE_queryAllByProps({ horizontal: true })).toHaveLength(0);
  });
});

describe('Save carries a TOTAL and the vet statement (§4.2, D4a)', () => {
  it('is unavailable until something is chosen, with nothing to explain yet', () => {
    const t = setup();
    expect(t.getByTestId('trial-window-save').props.accessibilityState.disabled).toBe(true);
    expect(t.queryByTestId('trial-window-reason')).toBeNull();
  });

  it('passes the chosen TOTAL, not a delta, and vetDirected false by default', () => {
    const t = setup();
    fireEvent.press(t.getByText('12 weeks'));
    fireEvent.press(t.getByTestId('trial-window-save'));
    // 84, the whole new length. 28 would be the delta and is the bug D1a exists to
    // prevent reaching the write.
    expect(t.props.onSave).toHaveBeenCalledWith({ targetDurationDays: 84, vetDirected: false });
  });

  it('the vet box starts UNCHECKED and is never required', () => {
    const t = setup();
    expect(t.getByTestId('trial-window-vet').props.value).toBe(false);
    // Save fires without it being touched — unchecked is silence, and silence is
    // never rendered as "the owner did this on their own" (§5.1).
    fireEvent.press(t.getByText('12 weeks'));
    fireEvent.press(t.getByTestId('trial-window-save'));
    expect(t.props.onSave).toHaveBeenCalledTimes(1);
  });

  it('carries the vet statement through when it IS checked', () => {
    const t = setup();
    fireEvent(t.getByTestId('trial-window-vet'), 'valueChange', true);
    fireEvent.press(t.getByText('12 weeks'));
    fireEvent.press(t.getByTestId('trial-window-save'));
    expect(t.props.onSave).toHaveBeenCalledWith({ targetDurationDays: 84, vetDirected: true });
  });

  it('every open starts clean — a re-open never carries the last vet statement', () => {
    // A stale `true` behind an untagged change would have the report attribute to a
    // vet a window the vet never named — the one assertion §5.1 forbids outright.
    const t = setup({ visible: false });
    t.rerender(
      <TrialWindowSheet {...t.props} visible />,
    );
    fireEvent(t.getByTestId('trial-window-vet'), 'valueChange', true);
    t.rerender(<TrialWindowSheet {...t.props} visible={false} />);
    t.rerender(<TrialWindowSheet {...t.props} visible />);
    expect(t.getByTestId('trial-window-vet').props.value).toBe(false);
    expect(t.queryByTestId('trial-window-summary')).toBeNull();
  });

  it('there is no confirm between Save and the write (§4.2)', () => {
    // The owner has crossed a sheet and picked a number; the sheet's Save IS the
    // confirmation, and the act is fully reversible (CUL-645). One press, one call.
    const t = setup();
    fireEvent.press(t.getByText('12 weeks'));
    fireEvent.press(t.getByTestId('trial-window-save'));
    expect(t.props.onSave).toHaveBeenCalledTimes(1);
    expect(t.props.onClose).not.toHaveBeenCalled();
  });
});

describe('the current window is an answer, not an error', () => {
  it('cannot be saved, and says why in the sheet’s own words', () => {
    const t = setup();
    fireEvent.press(t.getByText('8 weeks · now'));
    expect(t.getByTestId('trial-window-reason').props.children).toBe(
      'That is the window you have now.',
    );
    expect(t.getByTestId('trial-window-save').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(t.getByTestId('trial-window-save'));
    expect(t.props.onSave).not.toHaveBeenCalled();
  });

  it('a disabled Save ALWAYS has its reason on screen beside it (C-7)', () => {
    // `disabled` asserts a control exists and is unavailable, so the sheet owes the
    // reason — never a dimmed button on its own.
    const t = setup();
    fireEvent.press(t.getByText('8 weeks · now'));
    expect(t.getByTestId('trial-window-save').props.accessibilityState.disabled).toBe(true);
    expect(t.queryByTestId('trial-window-reason')).not.toBeNull();
  });
});

describe('the free-entry escape hatch (§4.2, CUL-1039’s handoff)', () => {
  function openCustom() {
    const t = setup();
    fireEvent.press(t.getByText('Something else'));
    return t;
  }

  it('opens a numeric day field only when asked for', () => {
    const t = setup();
    expect(t.queryByTestId('trial-window-custom')).toBeNull();
    fireEvent.press(t.getByText('Something else'));
    expect(t.getByTestId('trial-window-custom')).toBeTruthy();
    expect(t.getByText('days')).toBeTruthy();
  });

  it('strips anything that is not a digit', () => {
    const t = openCustom();
    const field = t.getByTestId('trial-window-custom');
    fireEvent.changeText(field, '8e4-2');
    expect(t.getByTestId('trial-window-custom').props.value).toBe('842');
  });

  it('echoes a typed total back in WEEKS and as an end date — the legibility beat', () => {
    // This is what keeps Save confirm-free. A fat-fingered 840 is visible as "120
    // weeks" and "784 more days" BEFORE Save, in the line §4.2 already requires.
    const t = openCustom();
    fireEvent.changeText(t.getByTestId('trial-window-custom'), '91');
    const s = within(t.getByTestId('trial-window-summary'));
    expect(s.getByText(/^13 weeks — ends /)).toBeTruthy();
    expect(s.getByText('That is 35 more days than the window you set.')).toBeTruthy();
  });

  it('REFUSES the mistyped 840, on the field, and cannot be saved', () => {
    // The named failure. Forward-only makes it un-correctable, so the sheet is the
    // only surface that can stop it.
    const t = openCustom();
    fireEvent.changeText(t.getByTestId('trial-window-custom'), '840');
    expect(t.getByTestId('trial-window-custom-error').props.children).toBe(
      'Culprit records a trial up to 365 days. For longer than that, your vet is the best call.',
    );
    expect(t.getByTestId('trial-window-save').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(t.getByTestId('trial-window-save'));
    expect(t.props.onSave).not.toHaveBeenCalled();
    // No end date beside a refusal — the app has just said it will not record it.
    expect(t.queryByTestId('trial-window-summary')).toBeNull();
  });

  it('refuses a backward total with the reason, never a silent correction', () => {
    const t = openCustom();
    fireEvent.changeText(t.getByTestId('trial-window-custom'), '40');
    expect(t.getByTestId('trial-window-custom-error').props.children).toBe(
      'Nyx is already on day 53.',
    );
    // NOT corrected up to 57 behind the owner's back.
    expect(t.getByTestId('trial-window-custom').props.value).toBe('40');
    fireEvent.press(t.getByTestId('trial-window-save'));
    expect(t.props.onSave).not.toHaveBeenCalled();
  });

  it('accepts a legitimate off-ladder total', () => {
    const t = openCustom();
    fireEvent.changeText(t.getByTestId('trial-window-custom'), '91');
    fireEvent.press(t.getByTestId('trial-window-save'));
    expect(t.props.onSave).toHaveBeenCalledWith({ targetDurationDays: 91, vetDirected: false });
  });
});

describe('the states the module reports and the sheet must draw', () => {
  it('says so when every preset is behind the day counter (Principle 5)', () => {
    // Day 200 of 112. One lonely marked chip and no visible way forward is the
    // undesigned empty state this replaces.
    const t = setup({
      trial: { ...WORKED, currentTargetDays: 112, dayCounter: 200, startDayKey: localDayKeyAgo(199) },
    });
    expect(t.getByTestId('trial-window-exhausted')).toBeTruthy();
    expect(t.queryByText('16 weeks')).toBeNull();
    expect(t.getByText('16 weeks · now')).toBeTruthy();
  });

  it('is absent on the worked case', () => {
    expect(setup().queryByTestId('trial-window-exhausted')).toBeNull();
  });

  it('renders a refused WRITE’s reason, phrased by the host', () => {
    // The host builds this from `TrialWindowRefused`'s structured fields; the sheet
    // only draws it. `message` is a diagnostic and never reaches a display sink.
    const t = setup({ writeError: 'Nyx’s trial has ended, so its window cannot change.' });
    expect(t.getByTestId('trial-window-reason').props.children).toBe(
      'Nyx’s trial has ended, so its window cannot change.',
    );
  });

  it('a write error outranks the local reason — it is the newer fact', () => {
    const t = setup({ writeError: 'Nyx’s trial has ended, so its window cannot change.' });
    fireEvent.press(t.getByText('8 weeks · now'));
    expect(t.getByTestId('trial-window-reason').props.children).not.toBe(
      'That is the window you have now.',
    );
  });

  it('blocks a second Save while one is in flight', () => {
    const t = setup({ busy: true });
    fireEvent.press(t.getByText('12 weeks'));
    fireEvent.press(t.getByTestId('trial-window-save'));
    expect(t.props.onSave).not.toHaveBeenCalled();
  });

  it('renders nothing at all without a running trial', () => {
    const t = setup({ trial: null });
    expect(t.toJSON()).toBeNull();
  });
});

describe('what the sheet must never do (TE-5, TE-7)', () => {
  it('never proposes, ranks, recommends or nudges a length', () => {
    const t = setup();
    expect(
      t.queryByText(/recommend|suggest|should be|we think|better|typical|most owners|try /i),
    ).toBeNull();
  });

  it('carries no exclamation mark and no verdict on how the trial is going', () => {
    const t = setup();
    fireEvent.press(t.getByText('12 weeks'));
    const all = JSON.stringify(t.toJSON());
    expect(all).not.toContain('!');
    expect(all).not.toMatch(/working|failing|on track|great|nice work|well done|progress/i);
  });

  it('that scan is non-vacuous — it really does see the sheet’s own copy', () => {
    // A `JSON.stringify` over a null or collapsed tree passes every negative above
    // for free (C-36's vacuity floor).
    const all = JSON.stringify(setup().toJSON());
    expect(all).toContain('How long is this trial now?');
    expect(all).toContain('My vet asked for this');
  });
});
