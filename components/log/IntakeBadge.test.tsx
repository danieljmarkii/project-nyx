import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { IntakeBadge, intakeTier } from './IntakeBadge';
import { IntakeRating } from './IntakeChipRow';
import { theme } from '../../constants/theme';

// B-035. The safety-load-bearing half is `intakeTier`: it decides whether a logged intake
// rating reads calm or carries the attention register. The invariant it protects is the
// intake-is-not-preference rule — decline (a disease signal) must never be coloured benign.

describe('intakeTier — the finished/declined split (safety)', () => {
  it('reads a meal eaten in full as positive/calm', () => {
    expect(intakeTier('all')).toBe('positive');
    expect(intakeTier('most')).toBe('positive');
  });

  // The crux: everything short of finished is decline. `some` (partial intake) MUST land here
  // — colouring it calm would let a cat eating progressively less (most → some → some) read
  // benign the whole way down, the exact false-reassurance the intake anti-pattern forbids.
  it('reads reduced or refused intake as decline/attention', () => {
    expect(intakeTier('some')).toBe('decline');
    expect(intakeTier('picked')).toBe('decline');
    expect(intakeTier('refused')).toBe('decline');
  });

  // Safe-by-construction: POSITIVE is the enumerated set, so anything the function can't place
  // (a future rating value) falls to the attention side, never silently benign.
  it('defaults an unrecognised rating to decline, not positive', () => {
    expect(intakeTier('unknown' as IntakeRating)).toBe('decline');
  });
});

function textColor(node: { props: { style?: unknown } }): string | undefined {
  return (StyleSheet.flatten(node.props.style) as { color?: string })?.color;
}

describe('IntakeBadge — rendering', () => {
  it('renders nothing for an unrated meal', () => {
    const { toJSON } = render(<IntakeBadge rating={null} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the rating label, in the calm ink for a finished meal', () => {
    const { getByText } = render(<IntakeBadge rating="all" />);
    const label = getByText('All');
    expect(textColor(label)).toBe(theme.colorAccentInk);
  });

  // Decline must be visually distinct from the calm tier — the whole point of B-035. A refused
  // meal carries the symptom-rose attention ink, never the same colour as a finished one.
  it('shows a declined meal in the attention (symptom) ink, distinct from calm', () => {
    const { getByText } = render(<IntakeBadge rating="refused" />);
    const label = getByText('Refused');
    expect(textColor(label)).toBe(theme.colorEventSymptomInk);
    expect(textColor(label)).not.toBe(theme.colorAccentInk);
  });

  // `picked` and `some` are decline too — the row's named regression was that they read as
  // benign as `All`.
  it('colours picked and some as attention, not calm', () => {
    expect(textColor(render(<IntakeBadge rating="picked" />).getByText('Picked'))).toBe(
      theme.colorEventSymptomInk,
    );
    expect(textColor(render(<IntakeBadge rating="some" />).getByText('Some'))).toBe(
      theme.colorEventSymptomInk,
    );
  });

  // Non-chip / not tappable: the badge lets taps fall through to the row's own gesture, so it
  // can never be a dead touch target the way the old FilterChip-based badge looked like one.
  it('is not interactive (taps fall through to the row)', () => {
    const { getByLabelText } = render(<IntakeBadge rating="most" />);
    expect(getByLabelText('Intake: most').props.pointerEvents).toBe('none');
  });
});
