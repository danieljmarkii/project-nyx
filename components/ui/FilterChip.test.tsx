import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { FilterChip } from './FilterChip';
import { theme } from '../../constants/theme';

type Node = { type: unknown; props: Record<string, any>; parent: Node | null };
type A11yState = { selected?: boolean; checked?: boolean } | undefined;

// FilterChip carries no accessibilityLabel of its own — the label text IS its
// accessible name — and a chip with no group role has no queryable role either,
// which is exactly the case B-168 is about. So reach the touchable by walking up
// from the label to the nearest accessible host element (TouchableOpacity's View).
function chipState(getByText: (t: string) => unknown, label: string): A11yState {
  let node = getByText(label) as Node | null;
  while (node) {
    if (typeof node.type === 'string' && node.props.accessible) {
      return node.props.accessibilityState as A11yState;
    }
    node = node.parent;
  }
  throw new Error(`no accessible touchable found for chip "${label}"`);
}

describe('FilterChip', () => {
  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<FilterChip label="Prescription" active={false} onPress={onPress} />);
    fireEvent.press(getByText('Prescription'));
    expect(onPress).toHaveBeenCalled();
  });

  // B-168 — the regression this file exists for. A STANDALONE chip (no group, so no
  // accessibilityRole) used to announce nothing at all: the Rx/OTC pair on the
  // medication detail screen and the food Type rows rendered their selection as a
  // dark fill and left a screen-reader user with two identical-sounding buttons.
  it('announces its selected state when used standalone, with no group role', () => {
    const { getByText: on } = render(<FilterChip label="Prescription" active onPress={() => {}} />);
    expect(chipState(on, 'Prescription')?.selected).toBe(true);

    const { getByText: off } = render(
      <FilterChip label="Over-the-counter" active={false} onPress={() => {}} />,
    );
    expect(chipState(off, 'Over-the-counter')?.selected).toBe(false);
  });

  it('announces selection as `selected` for a radio option in a ChipGroup', () => {
    const { getByText } = render(
      <FilterChip label="Oral" active onPress={() => {}} accessibilityRole="radio" />,
    );
    expect(chipState(getByText, 'Oral')?.selected).toBe(true);
  });

  // A checkbox announces `checked`, not `selected` — TalkBack reads a checkbox with
  // no checked state as "not checked" regardless of selection, so the multi-select
  // group's chips must not be handed a `selected` instead.
  it('announces selection as `checked` for a checkbox option in a MultiChipGroup', () => {
    const { getByText } = render(
      <FilterChip label="Chicken" active onPress={() => {}} accessibilityRole="checkbox" />,
    );
    const state = chipState(getByText, 'Chicken');
    expect(state?.checked).toBe(true);
    expect(state?.selected).toBeUndefined();
  });

  // B-555 — the busy/disabled state blocks the press and announces itself, so a
  // chip whose tap-write is in flight can't be re-fired.
  it('blocks the press and announces disabled when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <FilterChip label="Lab result" active onPress={onPress} disabled />,
    );
    fireEvent.press(getByText('Lab result'));
    expect(onPress).not.toHaveBeenCalled();
    expect((chipState(getByText, 'Lab result') as { disabled?: boolean })?.disabled).toBe(true);
  });
});

// CUL-744 — the ACTIVE default chip renders text on the accent tint, which is the
// Badge defect exactly (2.08:1 at this 13px size). This chip is the highest-traffic
// instance of the class: it appears on History, Foods and the dashboard, so the same
// two-token pair was failing on three surfaces at once.
//
// Reads the flattened style off the rendered tree rather than re-stating the StyleSheet
// (the Badge.test.tsx idiom), so a variant wired to the wrong style key fails here even
// though its style block would still look correct in a diff. The two dark variants are
// asserted alongside because the inversion is the whole reason CUL-744 was a walk and
// not a sweep — repointing them would be the same defect, mirrored.
describe('FilterChip — the active label is legible on its own fill (CUL-744)', () => {
  const flat = (node: { props: { style?: unknown } }) =>
    StyleSheet.flatten(node.props.style) as { color?: string; backgroundColor?: string };

  /** The active chip's label colour, paired with the fill it has to clear. */
  function activePair(variant: 'default' | 'filled' | 'onDark') {
    const { getByText, toJSON } = render(
      <FilterChip label="Prescription" active variant={variant} onPress={() => {}} />,
    );
    return {
      color: flat(getByText('Prescription') as never).color,
      backgroundColor: flat(toJSON() as never).backgroundColor,
    };
  }

  it('renders the default variant in accent INK on the accent tint', () => {
    const { color, backgroundColor } = activePair('default');
    expect(backgroundColor).toBe(theme.colorAccentLight);
    expect(color).toBe(theme.colorAccentInk);
    // Named, so the bright teal here reads as the defect rather than a near-miss.
    expect(color).not.toBe(theme.colorAccent);
  });

  it('keeps white on the filled variant, whose fill is dark', () => {
    const { color, backgroundColor } = activePair('filled');
    expect(backgroundColor).toBe(theme.colorNeutralDark);
    expect(color).toBe(theme.colorTextOnDark);
  });

  it('keeps white on the onDark variant, whose fill is the solid accent', () => {
    const { color, backgroundColor } = activePair('onDark');
    expect(backgroundColor).toBe(theme.colorAccent);
    expect(color).toBe(theme.colorTextOnDark);
  });
});
