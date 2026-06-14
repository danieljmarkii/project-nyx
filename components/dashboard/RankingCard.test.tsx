jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { render } from '@testing-library/react-native';
import { RankingCard } from './RankingCard';
import { notEnoughData } from '../../lib/analytics';
import { selectCardState } from '../../lib/dashboardCards';

describe('RankingCard', () => {
  const entries = [
    { key: 'a', label: 'Tiki Cat Tuna', value: '12 meals' },
    { key: 'b', label: 'Temptations', value: '6 meals', tag: 'treat' },
  ];

  it('renders the ranked entries with their values and honest tags', () => {
    const { getByText } = render(<RankingCard title="Top food" entries={entries} />);
    expect(getByText('Top food')).toBeTruthy();
    expect(getByText('Tiki Cat Tuna')).toBeTruthy();
    expect(getByText('12 meals')).toBeTruthy();
    expect(getByText('treat')).toBeTruthy();
  });

  it('shows the calibration state below the ranking floor (no fabricated top-N)', () => {
    const state = selectCardState(notEnoughData(2, 4));
    const { getByText, queryByText } = render(
      <RankingCard title="Top protein" entries={[]} state={state} calibrationUnit="meal" petName="Nyx" />,
    );
    expect(getByText("Still learning Nyx's baseline — 2 more meals to log.")).toBeTruthy();
    expect(queryByText('Tiki Cat Tuna')).toBeNull();
  });

  it('shows the empty copy when there is nothing logged', () => {
    const { getByText } = render(
      <RankingCard title="Top food" entries={[]} emptyMessage="No meals logged yet." />,
    );
    expect(getByText('No meals logged yet.')).toBeTruthy();
  });
});
