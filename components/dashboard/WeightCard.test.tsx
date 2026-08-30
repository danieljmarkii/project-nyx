// CUL-223 — the Patterns weight card's tap-through.
//
// Three things are pinned, and the third is the one a screenshot cannot show:
//
//  1. The card SPEAKS the record's count, not the size of the sparkline window it was
//     handed — that number now labels a list, so "12 readings" over a pet with 20 is a
//     promise the destination breaks.
//  2. A state with no reading to open renders NO touchable, rather than a `disabled`
//     one VoiceOver announces as a dimmed unavailable control (CUL-682).
//  3. The two adjacent controls do not share hit area (CUL-612). Read off the RENDERED
//     nodes, not restated from tokens (CUL-621): a test that asserts two constants it
//     names itself still passes after someone narrows the real geometry.

import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

// The sparkline's chart lib ships ESM that jest does not transform — stubbed the same
// way every other dashboard-card test stubs it.
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

import { WeightCard } from './WeightCard';
import { computeWeightTrend } from '../../lib/weight';

const readings = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    weightKg: 5.0 + i * 0.1,
    occurredAt: new Date(2026, 5, i + 1, 9, 0).toISOString(),
  }));

beforeEach(() => jest.clearAllMocks());

describe('the tap-through', () => {
  it('opens the readings list for THIS card\'s pet', () => {
    const { getByLabelText } = render(
      <WeightCard trend={computeWeightTrend(readings(4), 4)} petName="Nyx" petId="pet-A" />,
    );
    fireEvent.press(getByLabelText(/See all readings/));
    // petId, not "whatever pet is active when the screen mounts" (CUL-574).
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/weight-history', params: { petId: 'pet-A' } });
  });

  it('is reachable from a SINGLE reading too — one reading is the one most likely mistyped', () => {
    const { getByLabelText } = render(
      <WeightCard trend={computeWeightTrend(readings(1), 1)} petName="Nyx" petId="pet-A" />,
    );
    fireEvent.press(getByLabelText(/See all readings/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/weight-history', params: { petId: 'pet-A' } });
  });

  it('renders NO touchable at all when there is nothing to open', () => {
    // Not a disabled one: `disabled` is an accessibility claim that a control exists
    // and is unavailable, and in the empty state no readings list exists to open.
    const { queryByLabelText } = render(
      <WeightCard trend={computeWeightTrend([], 0)} petName="Nyx" petId="pet-A" />,
    );
    expect(queryByLabelText(/See all readings/)).toBeNull();
  });
});

describe('the count it speaks', () => {
  it('names the whole record, not the 12-reading window it was handed', () => {
    const { getByLabelText } = render(
      <WeightCard trend={computeWeightTrend(readings(12), 20)} petName="Nyx" petId="pet-A" />,
    );
    expect(getByLabelText(/20 readings/)).toBeTruthy();
  });
});

describe('the two adjacent controls do not share hit area (CUL-612)', () => {
  it('gives the readings row a real 44pt box and leaves the action no slop', () => {
    const { getByLabelText } = render(
      <WeightCard trend={computeWeightTrend(readings(4), 4)} petName="Nyx" petId="pet-A" />,
    );
    const readingsRow = getByLabelText(/See all readings/);
    const action = getByLabelText('Log a weigh-in for Nyx');

    // The row clears the floor by its own box, so it takes nothing from its neighbour.
    expect(StyleSheet.flatten(readingsRow.props.style).minHeight).toBeGreaterThanOrEqual(44);
    // And the action, already at the floor, reaches UP into nothing. Slop there would
    // put "open the log screen" inside the row above it, resolved by z-order.
    expect(action.props.hitSlop).toBeUndefined();
    expect(StyleSheet.flatten(action.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('lets the LINE yield and the chevron hold, so a long phrasing cannot push it out', () => {
    // The longest a real record reaches is the year stamp and a three-digit count
    // arriving together — "Last weighed Nov 23, 2025 · 200 readings". Read off the
    // rendered node, not restated from a token (CUL-621).
    const { getByLabelText } = render(
      <WeightCard
        trend={computeWeightTrend(readings(12), 200)}
        petName="Nyx"
        petId="pet-A"
      />,
    );
    const row = getByLabelText(/See all readings/);
    const [label] = row.findAllByProps({ numberOfLines: 1 });
    expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1);
  });
});
