// CUL-223 — the Profile weight card's tap-through, plus the two reads behind its count.
//
// The Profile card differs from its Patterns sibling in one way that matters here: it
// SELF-LOADS. So this file also pins that it reads the record's total alongside the
// sparkline window — the card speaks that number as a fact and it now labels a list, so
// deriving it from the capped window told a 20-weigh-in owner they had 12.

jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const react = require('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a) },
    useFocusEffect: (cb: () => void | (() => void)) => react.useEffect(() => { cb(); }, [cb]),
  };
});
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const mockGetWeightHistory = jest.fn();
const mockGetWeightReadingCount = jest.fn();
jest.mock('../../lib/weight', () => ({
  ...jest.requireActual('../../lib/weight'),
  getWeightHistory: (...a: unknown[]) => mockGetWeightHistory(...a),
  getWeightReadingCount: (...a: unknown[]) => mockGetWeightReadingCount(...a),
}));

import { WeightTrendCard } from './WeightTrendCard';

const readings = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    weightKg: 5.0 + i * 0.1,
    occurredAt: new Date(2026, 5, i + 1, 9, 0).toISOString(),
  }));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWeightHistory.mockResolvedValue(readings(4));
  mockGetWeightReadingCount.mockResolvedValue(4);
});

describe('the tap-through', () => {
  it('opens the readings list for the card\'s own pet', async () => {
    const { getByLabelText } = render(
      <WeightTrendCard petId="pet-A" petName="Nyx" snapshotKg={null} />,
    );
    await waitFor(() => expect(getByLabelText(/See all readings/)).toBeTruthy());
    fireEvent.press(getByLabelText(/See all readings/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/weight-history', params: { petId: 'pet-A' } });
  });

  it('renders no readings touchable when the pet has none — only the profile weight', async () => {
    // A snapshot weight is not a tracked reading: it comes from onboarding or Edit
    // profile, and there is no list of readings behind it to open.
    mockGetWeightHistory.mockResolvedValue([]);
    mockGetWeightReadingCount.mockResolvedValue(0);
    const { queryByLabelText, getByText } = render(
      <WeightTrendCard petId="pet-A" petName="Nyx" snapshotKg={5.6} />,
    );
    await waitFor(() => expect(getByText(/From Nyx's profile/)).toBeTruthy());
    expect(queryByLabelText(/See all readings/)).toBeNull();
  });
});

describe('the count it speaks', () => {
  it('reads the record\'s total alongside the 12-reading window, and speaks the total', async () => {
    mockGetWeightHistory.mockResolvedValue(readings(12));
    mockGetWeightReadingCount.mockResolvedValue(20);
    const { getByLabelText } = render(
      <WeightTrendCard petId="pet-A" petName="Nyx" snapshotKg={null} />,
    );
    await waitFor(() => expect(getByLabelText(/20 readings/)).toBeTruthy());
    // The window stays capped — the sparkline still draws its latest 12.
    expect(mockGetWeightHistory).toHaveBeenCalledWith('pet-A', 12);
    expect(mockGetWeightReadingCount).toHaveBeenCalledWith('pet-A');
  });
});

describe('the two adjacent controls do not share hit area (CUL-612)', () => {
  it('gives the readings row a real 44pt box and leaves the action no slop', async () => {
    const { getByLabelText } = render(
      <WeightTrendCard petId="pet-A" petName="Nyx" snapshotKg={null} />,
    );
    await waitFor(() => expect(getByLabelText(/See all readings/)).toBeTruthy());
    const readingsRow = getByLabelText(/See all readings/);
    const action = getByLabelText('Log a weigh-in for Nyx');

    expect(StyleSheet.flatten(readingsRow.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(action.props.hitSlop).toBeUndefined();
    expect(StyleSheet.flatten(action.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('lets the LINE yield and the chevron hold, so a long phrasing cannot push it out', async () => {
    mockGetWeightHistory.mockResolvedValue(readings(12));
    mockGetWeightReadingCount.mockResolvedValue(200);
    const { getByLabelText } = render(
      <WeightTrendCard petId="pet-A" petName="Nyx" snapshotKg={null} />,
    );
    await waitFor(() => expect(getByLabelText(/See all readings/)).toBeTruthy());
    const [label] = getByLabelText(/See all readings/).findAllByProps({ numberOfLines: 1 });
    expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1);
  });
});

// CUL-753 — the vet-visit rundown's weight tile lands on this card, so the Pet
// tab hangs its scroll anchor on it. A passthrough rather than a wrapper View at
// the call site, so the anchor cannot move the thing it is measuring; that only
// holds if it reaches the Card (the DietTrialCard / CUL-170 shape).
describe('the scroll anchor (CUL-753)', () => {
  it('forwards onLayout to the card itself, so the measured top IS the card top', () => {
    const onLayout = jest.fn();
    const tree = render(<WeightTrendCard petId="p1" petName="Mochi" snapshotKg={4.1} onLayout={onLayout} />);
    // The outermost host view IS the Card — there is no wrapper between them, which
    // is the property under test as much as the callback firing.
    const root = tree.UNSAFE_getByType(View);
    expect(root.props.onLayout).toBe(onLayout);
  });
});
