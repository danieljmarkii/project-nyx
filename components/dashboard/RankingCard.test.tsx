jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { render, fireEvent } from '@testing-library/react-native';
import { RankingCard } from './RankingCard';
import { notEnoughData } from '../../lib/analytics';
import { selectCardState, topFoodDefinition } from '../../lib/dashboardCards';

describe('RankingCard', () => {
  const entries = [
    { key: 'a', label: 'Tiki Cat Tuna', share: 0.5, shareLabel: '50% of meals', finishedRate: 0.92 },
    { key: 'b', label: 'Temptations', share: 0.25, shareLabel: '25% of diet', isTreat: true },
  ];

  it('renders a share bar per entry + the "% finished" intake read (B-098)', () => {
    const { getByText, getAllByTestId } = render(<RankingCard title="Top food" entries={entries} />);
    expect(getByText('Top food')).toBeTruthy();
    expect(getByText('Tiki Cat Tuna')).toBeTruthy();
    expect(getByText('50% of meals')).toBeTruthy();
    // % finished is the right-side intake read (descriptive, never "preference").
    expect(getByText(/92%/)).toBeTruthy();
    expect(getByText('finished')).toBeTruthy();
    // One share bar per entry.
    expect(getAllByTestId('rank-bar')).toHaveLength(2);
  });

  it('shows a treat as "treat" with NO finish-rate (a ceiling is not an intake signal, §11 #1)', () => {
    const { getByText, queryByText } = render(
      <RankingCard
        title="Top food"
        entries={[{ key: 't', label: 'Temptations', share: 1, shareLabel: '40% of diet', finishedRate: 1, isTreat: true }]}
      />,
    );
    expect(getByText('treat')).toBeTruthy();
    // Even though a rate was passed, a treat never renders "100% finished" → "loved".
    expect(queryByText('100%')).toBeNull();
    expect(queryByText('finished')).toBeNull();
  });

  it('shows a "few more meals" hint below the per-item floor, never a rate off 1–2 meals', () => {
    const { getByText, queryByText } = render(
      <RankingCard
        title="Top food"
        entries={[{ key: 'x', label: 'Open Farm Salmon', share: 0.1, shareLabel: '10% of diet', finishedRate: null }]}
      />,
    );
    expect(getByText('a few more meals')).toBeTruthy();
    expect(queryByText('finished')).toBeNull();
  });

  it('lets a long food label breathe — wraps to two lines, never truncated to one (B-098)', () => {
    const longName = 'Purina Friskies Party Mix Crunchy Chicken';
    const { getByText } = render(
      <RankingCard
        title="Top food"
        entries={[{ key: 'x', label: longName, share: 1, shareLabel: '14% of diet', finishedRate: 0.7 }]}
      />,
    );
    const label = getByText(longName);
    // Two lines, not one — the row breathes instead of clipping with an ellipsis.
    expect(label.props.numberOfLines).toBe(2);
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

  it('reveals the metric definition on tapping the info affordance (B-100)', () => {
    const def = topFoodDefinition('Nyx'); // the canonical helper output, no drift
    const { getByTestId, queryByText } = render(
      <RankingCard title="Top food" entries={entries} definition={def} />,
    );
    expect(queryByText(def)).toBeNull();
    fireEvent.press(getByTestId('metric-info-button'));
    expect(queryByText(def)).not.toBeNull();
  });
});
