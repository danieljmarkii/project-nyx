// First component render tests in the repo (B-023 PR 2). gifted-charts is mocked so
// the SVG/native chart path isn't exercised under jest (the Sparkline wrapper still
// renders, so its testID is assertable); ./db + ./feedingArrangements are stubbed to
// keep the native expo-sqlite / supabase chain (dragged via dashboardCards→analytics)
// out of the test runner — the analytics.test.ts pattern.
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { render, fireEvent } from '@testing-library/react-native';
import { MetricCard } from './MetricCard';
import { notEnoughData } from '../../lib/analytics';
import { selectCardState, intakeRateDefinition } from '../../lib/dashboardCards';

describe('MetricCard', () => {
  it('renders the four layers when populated', () => {
    const { getByText, getByTestId } = render(
      <MetricCard
        label="Vomiting"
        value="3"
        polarity="adverse"
        established
        delta={2}
        deltaLabel="2 more than last week"
        sparkData={[1, 2, 1, 3]}
      />,
    );
    expect(getByText('Vomiting')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('2 more than last week')).toBeTruthy();
    expect(getByTestId('sparkline')).toBeTruthy();
  });

  it('omits the sparkline with fewer than 2 points (no fabricated line)', () => {
    const { queryByTestId } = render(<MetricCard label="Vomiting" value="1" sparkData={[1]} />);
    expect(queryByTestId('sparkline')).toBeNull();
  });

  it('renders a proportion bar (not a line) for a rate card, with the vs-prior delta (B-098)', () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <MetricCard
        label="Meals finished"
        value="29%"
        polarity="positive"
        established
        progress={0.29}
        delta={-12}
        deltaLabel="Down from 41% last month"
      />,
    );
    expect(getByText('29%')).toBeTruthy();
    expect(getByTestId('metric-progress')).toBeTruthy(); // the shape — never a bare number
    expect(queryByTestId('sparkline')).toBeNull(); // a rate uses the bar, not a sparkline
    expect(getByText('Down from 41% last month')).toBeTruthy();
  });

  it('renders the calibration state from a notEnoughData result, not a number', () => {
    const state = selectCardState(notEnoughData(1, 4));
    const { getByText } = render(
      <MetricCard label="Meals finished" value="" state={state} calibrationUnit="meal" petName="Nyx" />,
    );
    expect(getByText("Still learning Nyx's baseline — 3 more meals to log.")).toBeTruthy();
  });

  it('renders the warm empty-state copy', () => {
    const { getByText } = render(
      <MetricCard
        label="Vomiting"
        value="0"
        state={{ kind: 'empty' }}
        emptyMessage="No vomiting logged this month."
      />,
    );
    expect(getByText('No vomiting logged this month.')).toBeTruthy();
  });

  it('surfaces the free-feeding honesty note', () => {
    const { getByText } = render(
      <MetricCard label="Meals finished" value="80%" note="Free-fed meals aren't counted here." />,
    );
    expect(getByText("Free-fed meals aren't counted here.")).toBeTruthy();
  });

  it('reveals the metric definition on tapping the info affordance, and hides it again (B-100)', () => {
    const def = intakeRateDefinition('Nyx'); // the canonical helper output, no drift
    const { getByTestId, queryByText } = render(
      <MetricCard label="Meals finished" value="29%" progress={0.29} definition={def} />,
    );
    // Hidden until tapped — unobtrusive by default.
    expect(queryByText(def)).toBeNull();
    fireEvent.press(getByTestId('metric-info-button'));
    expect(queryByText(def)).not.toBeNull();
    fireEvent.press(getByTestId('metric-info-button'));
    expect(queryByText(def)).toBeNull();
  });

  it('shows no info affordance when no definition is provided', () => {
    const { queryByTestId } = render(<MetricCard label="Vomiting" value="3" sparkData={[1, 2, 3]} />);
    expect(queryByTestId('metric-info-button')).toBeNull();
  });

  it('offers the definition even in the calibration state (explains what is still learning)', () => {
    const state = selectCardState(notEnoughData(1, 4));
    const def = intakeRateDefinition('Nyx');
    const { getByTestId, getByText } = render(
      <MetricCard label="Meals finished" value="" state={state} calibrationUnit="meal" petName="Nyx" definition={def} />,
    );
    fireEvent.press(getByTestId('metric-info-button'));
    expect(getByText(def)).toBeTruthy();
  });
});
