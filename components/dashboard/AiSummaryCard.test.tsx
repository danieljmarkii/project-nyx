// Component test for AiSummaryCard (B-023 PR 4) — the dashboard summary slot's two states.
// Imports only lib/summaryCopy (pure, no supabase), so no env/mocking gymnastics needed.

import { render, fireEvent } from '@testing-library/react-native';
import { AiSummaryCard } from './AiSummaryCard';
import type { CachedSummary } from '../../lib/summaryCopy';

function summary(over: Partial<CachedSummary> = {}): CachedSummary {
  return {
    text: 'Pixel has had vomiting on 5 of the last 7 days, up from 2 — worth a vet visit soon.',
    source: 'model',
    evidence: ['symptom'],
    hasSafety: true,
    quiet: false,
    ...over,
  };
}

describe('AiSummaryCard', () => {
  it('renders the cached summary text when present', () => {
    const { getByText } = render(<AiSummaryCard summary={summary()} petName="Pixel" />);
    expect(getByText(/vomiting on 5 of the last 7 days/i)).toBeTruthy();
  });

  it('renders the building copy (never an all-clear) when there is no summary', () => {
    const { getByText, queryByText } = render(<AiSummaryCard summary={null} petName="Pixel" />);
    expect(getByText(/still gathering/i)).toBeTruthy();
    // The building state must not reassure or read as an all-clear.
    expect(queryByText(/\b(fine|okay|healthy|all clear|doing well)\b/i)).toBeNull();
  });

  it('renders a tappable grounding affordance that jumps to the cards', () => {
    const onJumpToCards = jest.fn();
    const { getByText } = render(
      <AiSummaryCard summary={summary({ evidence: ['symptom', 'intake'] })} petName="Pixel" onJumpToCards={onJumpToCards} />,
    );
    const link = getByText(/based on the symptom and meal cards below/i);
    fireEvent.press(link);
    expect(onJumpToCards).toHaveBeenCalledTimes(1);
  });

  it('omits the grounding affordance in the building state', () => {
    const { queryByText } = render(<AiSummaryCard summary={null} petName="Pixel" onJumpToCards={jest.fn()} />);
    expect(queryByText(/based on the/i)).toBeNull();
  });
});
