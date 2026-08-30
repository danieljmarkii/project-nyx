// useSafeAreaInsets needs a provider jest-expo doesn't stand up — stub the
// module (the DayEventsSheet / app/insights test pattern).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { Pill } from 'lucide-react-native';
import { ScopeMenu, ScopeMenuOption } from './ScopeMenu';
import { theme } from '../../constants/theme';

const OPTIONS: ScopeMenuOption[] = [
  { key: null, label: 'All types' },
  { key: 'meal', label: 'Meal' },
  { key: 'medication', label: 'Medication', icon: Pill },
];

function renderMenu(over: Partial<React.ComponentProps<typeof ScopeMenu>> = {}) {
  const onChange = jest.fn();
  const utils = render(
    <ScopeMenu
      options={OPTIONS}
      value={null}
      onChange={onChange}
      sheetLabel="Show only"
      accessibilityPrefix="Event type"
      {...over}
    />,
  );
  return { ...utils, onChange };
}

describe('ScopeMenu', () => {
  it('shows the active option on the pill and every option in the sheet', () => {
    const { getByLabelText, getByText, queryByText } = renderMenu({ value: 'medication' });
    // Pill reads the selected option — the medication filter is never hidden.
    getByLabelText('Event type: Medication');
    expect(queryByText('Show only')).toBeNull();

    fireEvent.press(getByLabelText('Event type: Medication'));
    // Sheet lists ALL options as rows — the whole point vs the old h-scroll rail.
    getByText('Show only');
    getByText('All types');
    getByText('Meal');
    expect(getByLabelText('Medication').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Meal').props.accessibilityState.selected).toBe(false);
  });

  it('selecting an option fires onChange with its key and closes the sheet', () => {
    const { getByLabelText, onChange, queryByText } = renderMenu();
    fireEvent.press(getByLabelText('Event type: All types'));
    fireEvent.press(getByLabelText('Medication'));
    expect(onChange).toHaveBeenCalledWith('medication');
    expect(queryByText('Show only')).toBeNull();
  });

  it('selecting the default option fires onChange(null)', () => {
    const { getByLabelText, onChange } = renderMenu({ value: 'meal' });
    fireEvent.press(getByLabelText('Event type: Meal'));
    fireEvent.press(getByLabelText('All types'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('an overrideLabel labels the pill and deselects every row (B-308 day drill-in)', () => {
    const { getByLabelText } = renderMenu({ overrideLabel: 'Jun 24' });
    fireEvent.press(getByLabelText('Event type: Jun 24'));
    // The override is a transient scope, not an option — no row reads selected.
    expect(getByLabelText('All types').props.accessibilityState.selected).toBe(false);
    expect(getByLabelText('Meal').props.accessibilityState.selected).toBe(false);
  });

  it('scrim press closes the sheet without changing the scope', () => {
    const { getByLabelText, onChange, queryByText } = renderMenu();
    fireEvent.press(getByLabelText('Event type: All types'));
    fireEvent.press(getByLabelText('Close'));
    expect(queryByText('Show only')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

// CUL-744 — ScopeMenu has two accent-as-text sites, and they sit on different grounds,
// which is the whole shape of this issue in one component: the PILL's active label sits
// on the accent tint (2.08:1) and the SHEET's selected row sits on white (2.26:1). Both
// failed AA; neither could be decided by looking at the style block, because each
// ground is set by a different ancestor.
//
// Asserted off the flattened style of the rendered tree (the Badge.test.tsx idiom), and
// paired with the fill in the pill's case, so a row wired to the wrong style key fails
// here even though the StyleSheet would still read correctly in a diff.
describe('ScopeMenu — both accent labels are legible on their own grounds (CUL-744)', () => {
  const flat = (node: { props: { style?: unknown } }) =>
    StyleSheet.flatten(node.props.style) as { color?: string; backgroundColor?: string };

  it('renders the FILTERED pill label in accent ink on the accent tint', () => {
    // Non-default value ⇒ the pill takes its tinted active state (the ScopeMenu tint rule).
    const { getByText } = renderMenu({ value: 'medication' });
    expect(flat(getByText('Medication') as never).color).toBe(theme.colorAccentInk);
    expect(flat(getByText('Medication') as never).color).not.toBe(theme.colorAccent);
  });

  it('leaves the UNFILTERED pill on the secondary text colour', () => {
    // The default scope was never part of the defect, and is pinned so a later sweep of
    // this file does not repoint it by symmetry — an inked default would read as active.
    const { getByText } = renderMenu({ value: null });
    expect(flat(getByText('All types') as never).color).toBe(theme.colorTextSecondary);
  });

  it('renders the SELECTED sheet row in accent ink, on the white sheet', () => {
    const { getByLabelText } = renderMenu({ value: 'medication' });
    fireEvent.press(getByLabelText('Event type: Medication'));

    // Reached DOWN from the row rather than across by text: with the sheet open, two
    // nodes read "Medication" (the pill behind it and the row), so getByText is
    // ambiguous — and picking whichever one it returns would let this assert the pill
    // twice while claiming to cover the row. The row is addressed by its a11y label,
    // whose selected state is checked first so the test cannot pass against the
    // unselected row's (correct, and different) colour.
    const row = getByLabelText('Medication');
    expect(row.props.accessibilityState.selected).toBe(true);
    const [label] = row.findAllByType(Text);
    expect(flat(label as never).color).toBe(theme.colorAccentInk);
    expect(flat(label as never).color).not.toBe(theme.colorAccent);
  });
});
