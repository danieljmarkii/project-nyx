// useSafeAreaInsets needs a provider jest-expo doesn't stand up — stub the
// module (the DayEventsSheet / app/insights test pattern).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { render, fireEvent } from '@testing-library/react-native';
import { ScrollView, StyleSheet, Text } from 'react-native';
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

// HV-9 (CUL-1166) — the additive props History v2's two sheets need (spec §3.8, §3.9):
// a count and a second line on a row, a nested sub-row, a section label, a spoken label
// that says more than the visible one, and the pill's own words and count. Each is drawn
// only when set; a caller that sets none renders the tree it always rendered (checked
// against the pre-change tree when the props landed, and by the v1 History suites).
describe('ScopeMenu — History v2 rows and pill (HV-9)', () => {
  const V2_OPTIONS: ScopeMenuOption[] = [
    { key: null, label: 'All types', count: '1,094', accessibilityLabel: 'All types, 1,094 logged' },
    { key: 'type:medication', label: 'Medication', count: '46' },
    {
      key: 'course:reg-cet',
      label: 'Cetirizine HCl',
      count: '16',
      detail: 'Jul 1 – Sep 5 · 4 not given in full',
      nested: true,
      accessibilityLabel: 'Cetirizine HCl, Jul 1 – Sep 5, 4 not given in full, 16 logged',
    },
    { key: 'photographed', label: 'Photographed', count: '44', detail: '4 not read', section: 'What the record holds' },
    { key: 'noticed', label: 'Noticed', section: 'The daily look' },
  ];

  it('draws each row’s count, second line and section, and speaks the row’s own label', () => {
    const { getByLabelText, getByText } = renderMenu({ options: V2_OPTIONS, value: 'course:reg-cet' });
    fireEvent.press(getByLabelText('Event type: Cetirizine HCl'));
    getByText('1,094');
    getByText('Jul 1 – Sep 5 · 4 not given in full');
    getByText('What the record holds');
    getByText('The daily look');
    // A section label is a heading the rotor can jump to.
    expect(getByText('The daily look').props.accessibilityRole).toBe('header');
    const course = getByLabelText('Cetirizine HCl, Jul 1 – Sep 5, 4 not given in full, 16 logged');
    expect(course.props.accessibilityState.selected).toBe(true);
    // Without an override, a row speaks its label.
    expect(getByLabelText('Noticed').props.accessibilityState.selected).toBe(false);
  });

  it('indents a nested row and sets its label a size down', () => {
    const { getByLabelText } = renderMenu({ options: V2_OPTIONS, value: null });
    fireEvent.press(getByLabelText('Event type: All types'));
    const nested = getByLabelText('Cetirizine HCl, Jul 1 – Sep 5, 4 not given in full, 16 logged');
    const plain = getByLabelText('Medication');
    const rowStyle = (n: { props: { style?: unknown } }) => StyleSheet.flatten(n.props.style) as { paddingLeft?: number };
    expect(rowStyle(nested).paddingLeft).toBe(theme.space2);
    expect(rowStyle(plain).paddingLeft).toBeUndefined();
    const [nestedLabel] = nested.findAllByType(Text);
    const [plainLabel] = plain.findAllByType(Text);
    expect((StyleSheet.flatten(nestedLabel.props.style) as { fontSize: number }).fontSize).toBe(theme.textMD);
    expect((StyleSheet.flatten(plainLabel.props.style) as { fontSize: number }).fontSize).toBe(theme.textLG);
  });

  it('pillLabel names the pill without deselecting the row it stands for (unlike overrideLabel)', () => {
    const { getByLabelText } = renderMenu({ options: V2_OPTIONS, value: 'type:medication', pillLabel: 'Since Jul 26' });
    fireEvent.press(getByLabelText('Event type: Since Jul 26'));
    expect(getByLabelText('Medication').props.accessibilityState.selected).toBe(true);
  });

  it('pillCount follows the words in its own, unshrinking text, and pillAccessibilityLabel is what the pill says', () => {
    const { getByLabelText, getByText } = renderMenu({
      options: V2_OPTIONS,
      value: 'type:medication',
      pillCount: '46',
      pillAccessibilityLabel: 'Filter: Medication, 46 logged',
    });
    getByLabelText('Filter: Medication, 46 logged');
    const count = getByText('· 46');
    expect(count.props.numberOfLines).toBeUndefined();
    expect((StyleSheet.flatten(count.props.style) as { flexShrink?: number }).flexShrink).toBe(0);
  });

  it('a row with a count but no second line keeps its label a direct sibling of the check', () => {
    const { getByLabelText, getByText } = renderMenu({ options: V2_OPTIONS, value: 'type:medication' });
    fireEvent.press(getByLabelText('Event type: Medication'));
    getByText('46');
    // No second line rendered for a row that sets none.
    expect(getByLabelText('Medication').findAllByType(Text)).toHaveLength(2);
  });
});

// HV-9 (CUL-1166) — `openAtSelected`: a set that runs past the sheet's fold (the type
// sheet's ~19 rows) opens with the selected row in view, never at the top with the choice
// out of sight, and flashes the indicator so the rows past the fold read as there. The
// preset's ScrollView mock puts `scrollTo` and `flashScrollIndicators` on its prototype, so
// every instance shares one spy: each test clears it first.
describe('ScopeMenu — openAtSelected (HV-9)', () => {
  const LONG: ScopeMenuOption[] = Array.from({ length: 20 }, (_, i) => ({
    key: i === 0 ? null : `type:${i}`,
    label: i === 0 ? 'All types' : `Type ${i}`,
  }));
  const layoutAt = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 320, height: 48 } } });

  function openMenu(over: Partial<React.ComponentProps<typeof ScopeMenu>> = {}) {
    const utils = renderMenu({ options: LONG, value: 'type:15', openAtSelected: true, ...over });
    fireEvent.press(utils.getByLabelText(`Event type: ${over.value === null ? 'All types' : 'Type 15'}`));
    const scroll = utils.UNSAFE_getByType(ScrollView).instance as unknown as {
      scrollTo: jest.Mock;
      flashScrollIndicators: jest.Mock;
    };
    return { ...utils, scroll };
  }

  beforeEach(() => {
    const proto = ScrollView.prototype as unknown as { scrollTo: jest.Mock; flashScrollIndicators: jest.Mock };
    proto.scrollTo.mockClear();
    proto.flashScrollIndicators.mockClear();
  });

  it('jumps to the selected row once it is laid out, a row’s height short of it, without animating', () => {
    const { getByLabelText, scroll } = openMenu();
    fireEvent(getByLabelText('Type 15'), 'layout', layoutAt(720));
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
    expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 672, animated: false });
  });

  it('jumps once per opening: a later layout never pulls the list back from where the owner scrolled', () => {
    const { getByLabelText, scroll } = openMenu();
    fireEvent(getByLabelText('Type 15'), 'layout', layoutAt(720));
    // A count arriving resizes the rows above and lays the selected row out again.
    fireEvent(getByLabelText('Type 15'), 'layout', layoutAt(760));
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('opens at the selected row again on the next opening', () => {
    const { getByLabelText, getByText, scroll } = openMenu();
    fireEvent(getByLabelText('Type 15'), 'layout', layoutAt(720));
    fireEvent.press(getByLabelText('Close'));
    fireEvent.press(getByLabelText('Event type: Type 15'));
    getByText('Show only');
    fireEvent(getByLabelText('Type 15'), 'layout', layoutAt(720));
    expect(scroll.scrollTo).toHaveBeenCalledTimes(2);
  });

  it('never scrolls above the top: a selected row near it leaves the list where it starts', () => {
    const { getByLabelText, scroll } = openMenu({ value: null });
    fireEvent(getByLabelText('All types'), 'layout', layoutAt(0));
    expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  });

  it('only the selected row carries the jump', () => {
    const { getByLabelText } = openMenu();
    expect(getByLabelText('Type 3').props.onLayout).toBeUndefined();
    expect(typeof getByLabelText('Type 15').props.onLayout).toBe('function');
  });

  it('flashes the scroll indicator when the list is laid out', () => {
    const { UNSAFE_getByType, scroll } = openMenu();
    fireEvent(UNSAFE_getByType(ScrollView), 'layout', layoutAt(0));
    expect(scroll.flashScrollIndicators).toHaveBeenCalledTimes(1);
  });

  it('off by default: no row and no list carries a layout handler, so nothing moves', () => {
    const { getByLabelText, UNSAFE_getByType } = renderMenu({ options: LONG, value: 'type:15' });
    fireEvent.press(getByLabelText('Event type: Type 15'));
    expect(getByLabelText('Type 15').props.onLayout).toBeUndefined();
    expect(UNSAFE_getByType(ScrollView).props.onLayout).toBeUndefined();
  });
});
