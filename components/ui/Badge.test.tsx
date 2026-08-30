// CUL-578 — the Badge's two tinted variants render TEXT on a tint, so each one needs
// the ink, not the bright category colour (2.08:1 accent-on-accent-light, 3.06:1
// symptom-on-symptom-light; both fail AA at this 11px size). The ratios themselves are
// pinned in constants/theme.contrast.test.ts — this file asserts the other half of the
// chain: that the component actually reaches for the ink token.
//
// It reads the flattened style off the rendered tree rather than re-stating the
// StyleSheet, so a variant wired to the wrong style key fails here even though the
// style block itself would still look correct in a diff.

import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Badge } from './Badge';
import { theme } from '../../constants/theme';

type Flat = { color?: string; backgroundColor?: string };

/** The rendered label's colour, and the fill of the pill it sits on. */
function renderedPair(variant: 'accent' | 'symptom' | 'muted') {
  const tree = render(<Badge label="Monitoring" variant={variant} />);
  const label = tree.getByText('Monitoring');
  const pill = tree.toJSON();
  return {
    color: (StyleSheet.flatten(label.props.style) as Flat)?.color,
    // The Badge's root is the tinted View; its fill is what the label must clear.
    backgroundColor: (StyleSheet.flatten((pill as { props: { style?: unknown } }).props.style) as Flat)
      ?.backgroundColor,
  };
}

describe('Badge — text on a tint uses the ink', () => {
  it('renders the accent variant in accent INK on the accent tint', () => {
    const { color, backgroundColor } = renderedPair('accent');
    expect(backgroundColor).toBe(theme.colorAccentLight);
    expect(color).toBe(theme.colorAccentInk);
    // Named explicitly: the bright teal here is the CUL-578 defect, not a near-miss.
    expect(color).not.toBe(theme.colorAccent);
  });

  it('renders the symptom variant in symptom INK on the symptom tint', () => {
    const { color, backgroundColor } = renderedPair('symptom');
    expect(backgroundColor).toBe(theme.colorEventSymptomLight);
    expect(color).toBe(theme.colorEventSymptomInk);
    expect(color).not.toBe(theme.colorEventSymptom);
  });

  // The muted variant was never part of the defect — grey-on-grey already clears AA —
  // and is asserted so a future sweep of this file does not repoint it by symmetry.
  it('leaves the muted variant on the secondary text colour', () => {
    const { color, backgroundColor } = renderedPair('muted');
    expect(backgroundColor).toBe(theme.colorNeutralLight);
    expect(color).toBe(theme.colorTextSecondary);
  });
});
