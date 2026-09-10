// The chosen chip (CUL-871 / N-4a; spec §3.1a R15/R16).
//
// The assertion that matters is the one round 2 blocked and round 3 re-found in a new
// mechanism: SELECTION CHANGES COLOUR AND NEVER GEOMETRY. A check that widens a pill
// moves the next tap target, so the second word an owner reaches for is no longer under
// her thumb — and it is invisible in a screenshot of either state alone.

import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { LookChip, CHECK_GAP, CHECK_W, CHIP_VERTICAL_REACH, PAD_LEFT, PAD_LEFT_MARKED } from './LookChip';
import { theme } from '../../constants/theme';
import { fontFamilyForWeight } from '../ui/ThemedText';
import { contrastRatio } from '../../constants/theme.contrast.test';

const flat = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style) as Record<string, unknown>;

describe('geometry — the box does not move when the word is chosen', () => {
  it('the left inset is identical either way: 14 = 4 + 7 + 3', () => {
    // The arithmetic IS the mechanism (the check is drawn inside the pill's own
    // padding), so it is asserted as an identity rather than inferred from a render.
    expect(PAD_LEFT).toBe(PAD_LEFT_MARKED + CHECK_W + CHECK_GAP);
  });

  it('every width-affecting property of the rendered box is unchanged by selection', () => {
    const rest = render(<LookChip label="Off" selected={false} onPress={() => {}} testID="c" />);
    const restStyle = flat(rest.getByTestId('c'));
    const marked = render(<LookChip label="Off" selected onPress={() => {}} testID="c" />);
    const markedStyle = flat(marked.getByTestId('c'));

    // The border never thickens — the heavier chosen hairline is an inset overlay.
    expect(markedStyle.borderWidth).toBe(restStyle.borderWidth);
    expect(markedStyle.paddingVertical).toBe(restStyle.paddingVertical);
    expect(markedStyle.paddingRight).toBe(restStyle.paddingRight);
    expect(markedStyle.borderRadius).toBe(restStyle.borderRadius);
    // The left inset changes, and the check reserves exactly what it gave up.
    expect(restStyle.paddingLeft).toBe(PAD_LEFT);
    expect(markedStyle.paddingLeft).toBe(PAD_LEFT_MARKED);
  });

  it('the label keeps its size AND its FACE — a bold swap re-flows the pill', () => {
    const rest = render(<LookChip label="Off" selected={false} onPress={() => {}} />);
    const marked = render(<LookChip label="Off" selected onPress={() => {}} />);
    const restLabel = flat(rest.getByText('Off'));
    const markedLabel = flat(marked.getByText('Off'));
    expect(markedLabel.fontSize).toBe(restLabel.fontSize);
    // Asserted on the FAMILY, not the weight: `ThemedText` resolves `fontWeight` into
    // one of the three loaded Geist faces and drops the numeric weight (C-2), so the
    // family is what actually renders — and the two states must land on the same one.
    expect(markedLabel.fontFamily).toBe(restLabel.fontFamily);
    expect(markedLabel.fontFamily).toBe(fontFamilyForWeight(theme.weightMedium));
  });
});

describe('the hit area, and the gap that has to answer to it (C-5)', () => {
  it('takes its full vertical reach on both edges', () => {
    const t = render(<LookChip label="Off" selected={false} onPress={() => {}} testID="c" />);
    expect(t.getByTestId('c').props.hitSlop).toEqual({
      top: CHIP_VERTICAL_REACH,
      bottom: CHIP_VERTICAL_REACH,
    });
    // The row that lays these out derives its gap from this constant; the assertion off
    // the RENDERED row lives in `LookCard.test.tsx`, where the card's own mocks are
    // (C-5: assert the rendered gap, never tokens restated in the test).
  });
});

describe('colour — the chosen pair, and why it is its own ink', () => {
  it('a chosen chip stands on the deep wash, in the selected ink', () => {
    const t = render(<LookChip label="Off" selected onPress={() => {}} testID="c" />);
    expect(flat(t.getByTestId('c')).backgroundColor).toBe(theme.colorAccentWashDeep);
    expect(flat(t.getByText('Off')).color).toBe(theme.colorAccentInkSelected);
  });

  it('and that ink is the only one of the two that clears AA on it', () => {
    // Consumption asserted where it renders (the C-1 chain): the token pins live in
    // theme.contrast.test.ts, and this is the site that has to be reading them.
    expect(contrastRatio(theme.colorAccentInkSelected, theme.colorAccentWashDeep)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.colorAccentInk, theme.colorAccentWashDeep)).toBeLessThan(4.5);
  });
});

describe('accessibility', () => {
  it('is a CHECKBOX with a checked state — more than one word can be true', () => {
    const t = render(<LookChip label="Off" selected onPress={() => {}} testID="c" />);
    const chip = t.getByTestId('c');
    expect(chip.props.accessibilityRole).toBe('checkbox');
    // A checkbox announces `checked`; TalkBack reads a `selected` checkbox as "not
    // checked" whatever the visual says (B-168, inherited from FilterChip).
    expect(chip.props.accessibilityState.checked).toBe(true);
  });

  it('carries the GLOSS as its hint where the visible label is the head alone', () => {
    // §4.1 rule 12 — the gloss is never dropped, and a screen-reader user must not be
    // the one who loses it ("Lip-licking" alone lost the findable half).
    const t = render(
      <LookChip
        label="Lip-licking"
        hint="swallowing a lot, nothing in his mouth"
        selected={false}
        onPress={() => {}}
        testID="c"
      />,
    );
    expect(t.getByTestId('c').props.accessibilityHint).toBe(
      'swallowing a lot, nothing in his mouth',
    );
  });

  it('has no hint on the grid, where the label already IS head + gloss', () => {
    const t = render(
      <LookChip label="Off, flat" selected={false} onPress={() => {}} testID="c" />,
    );
    expect(t.getByTestId('c').props.accessibilityHint).toBeUndefined();
  });
});
