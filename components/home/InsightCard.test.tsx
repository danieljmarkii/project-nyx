// InsightCard — the joint-candidate linked pair (B-351 slice 6, D5).
//
// The card frame, rail and expand behaviour predate this file and are exercised
// indirectly by the Home tests; what is asserted here is the one rendering decision
// slice 6 introduced, and it is a CLINICAL decision wearing a layout's clothes: when the
// engine cannot separate two proteins, every one of them has to reach the owner's eyes.
// A linked pair that silently drops a member — by truncating, by scrolling it off-screen,
// by rendering only `protein[0]` — would exonerate that protein by omission on the
// flagship wedge surface, which is exactly the false attribution the joint candidate
// exists to prevent.

import { render } from '@testing-library/react-native';
import { InsightCard } from './InsightCard';
import type { CachedFinding, CorrelationFinding } from '../../lib/signal';

const correlation = (over: Partial<CorrelationFinding> = {}): CorrelationFinding => ({
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
  matchedPairs: 4,
  symptomEventCount: 4,
  correlationWindowHours: 12,
  ...over,
});

const cached = (finding: CorrelationFinding, text = 'A sentence about Pixel.'): CachedFinding => ({
  rank: 0,
  text,
  finding,
});

const joint = (over: Partial<CorrelationFinding> = {}) =>
  correlation({
    protein: 'chicken and duck',
    proteins: ['chicken', 'duck'],
    jointCandidate: true,
    ...over,
  });

describe('InsightCard — joint candidate linked pair', () => {
  it('renders a chip for EVERY member of the cluster', () => {
    const { getByText } = render(<InsightCard cached={cached(joint())} petName="Pixel" />);
    expect(getByText('Chicken')).toBeTruthy();
    expect(getByText('Duck')).toBeTruthy();
    expect(getByText('always fed together')).toBeTruthy();
  });

  it('does not truncate a cluster larger than two', () => {
    // A 4-protein bag is a real shape (the live library holds sets up to 5), and dropping
    // the 3rd and 4th to keep the row tidy would be a false exoneration, not a layout call.
    const four = joint({
      protein: 'beef, chicken, duck and lamb',
      proteins: ['beef', 'chicken', 'duck', 'lamb'],
    });
    const { getByText } = render(<InsightCard cached={cached(four)} petName="Pixel" />);
    for (const p of ['Beef', 'Chicken', 'Duck', 'Lamb']) expect(getByText(p)).toBeTruthy();
  });

  it('renders NO pair row for an ordinary single-protein correlation', () => {
    const { queryByText } = render(<InsightCard cached={cached(correlation())} petName="Pixel" />);
    expect(queryByText('always fed together')).toBeNull();
  });

  it('renders NO pair row for a finding cached before slice 6 (no cluster on the row)', () => {
    // ai_signals rows written by the previous deployment carry no `proteins`; they must
    // render as the plain card they were generated as, never as an empty linked pair.
    const legacy = correlation({ protein: 'chicken', jointCandidate: undefined });
    const { queryByText } = render(<InsightCard cached={cached(legacy)} petName="Pixel" />);
    expect(queryByText('always fed together')).toBeNull();
  });

  it('exposes the pair to screen readers as one phrase, not as loose chips', () => {
    const { getByLabelText } = render(<InsightCard cached={cached(joint())} petName="Pixel" />);
    expect(getByLabelText('Chicken and Duck — always fed together')).toBeTruthy();
  });
});
