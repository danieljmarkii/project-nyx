// First component render tests in the repo (B-023 PR 2). gifted-charts is mocked so
// the SVG/native chart path isn't exercised under jest (the Sparkline wrapper still
// renders, so its testID is assertable); ./db + ./feedingArrangements are stubbed to
// keep the native expo-sqlite / supabase chain (dragged via dashboardCards→analytics)
// out of the test runner — the analytics.test.ts pattern.
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { render } from '@testing-library/react-native';
import { MetricCard } from './MetricCard';
import { notEnoughData } from '../../lib/analytics';
import { selectCardState } from '../../lib/dashboardCards';

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
});
