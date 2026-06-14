jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { render } from '@testing-library/react-native';
import { RankingCard } from './RankingCard';
import { notEnoughData } from '../../lib/analytics';
import { selectCardState } from '../../lib/dashboardCards';

describe('RankingCard', () => {
  const entries = [
    { key: 'a', label: 'Tiki Cat Tuna', value: '12 meals', count: 12 },
    { key: 'b', label: 'Temptations', value: '6 meals', count: 6, tag: 'treat' },
  ];

  it('renders the ranked entries with their values, honest tags, and a magnitude bar each', () => {
    const { getByText, getAllByTestId } = render(<RankingCard title="Top food" entries={entries} />);
    expect(getByText('Top food')).toBeTruthy();
    expect(getByText('Tiki Cat Tuna')).toBeTruthy();
    expect(getByText('12 meals')).toBeTruthy();
    expect(getByText('treat')).toBeTruthy();
    // Bar-list (B-098): one inline magnitude bar per entry, never a plain text column.
    expect(getAllByTestId('rank-bar')).toHaveLength(2);
  });

  it('omits the bars when entries carry no count (graceful plain list)', () => {
    const { queryAllByTestId } = render(
      <RankingCard title="Top food" entries={[{ key: 'a', label: 'Tiki Cat Tuna', value: '12 meals' }]} />,
    );
    expect(queryAllByTestId('rank-bar')).toHaveLength(0);
  });

  it('lets a long food label breathe — wraps to two lines, never truncated to one (B-098)', () => {
    const longName = 'Purina Friskies Party Mix Crunchy Chicken';
    const { getByText } = render(
      <RankingCard title="Top food" entries={[{ key: 'x', label: longName, value: '14 logs' }]} />,
    );
    const label = getByText(longName);
    // Two lines, not one — the row breathes instead of clipping with an ellipsis.
    expect(label.props.numberOfLines).toBe(2);
    // The value never gets squeezed out by a long label (flexShrink 0).
    expect(getByText('14 logs')).toBeTruthy();
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
