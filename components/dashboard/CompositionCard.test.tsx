jest.mock('../../lib/db', () => ({ getDb: () => ({}) }));
jest.mock('../../lib/feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import { render } from '@testing-library/react-native';
import { CompositionCard } from './CompositionCard';
import type { MealTreatComposition } from '../../lib/analytics';

describe('CompositionCard', () => {
  it('renders the meal vs treat split with counts and percentages (descriptive)', () => {
    const composition: MealTreatComposition = { meal: 18, treat: 6, other: 0, unclassified: 0, total: 24 };
    const { getByText } = render(<CompositionCard composition={composition} />);
    expect(getByText('Meals & treats')).toBeTruthy();
    expect(getByText('Meals')).toBeTruthy();
    expect(getByText('Treats')).toBeTruthy();
    // 18/24 = 75%, 6/24 = 25% — honest proportions, no verdict.
    expect(getByText('18 logs · 75%')).toBeTruthy();
    expect(getByText('6 logs · 25%')).toBeTruthy();
  });

  it('folds other + unclassified into one quiet "Other" segment', () => {
    const composition: MealTreatComposition = { meal: 5, treat: 2, other: 2, unclassified: 1, total: 10 };
    const { getByText, queryByText } = render(<CompositionCard composition={composition} />);
    expect(getByText('Other')).toBeTruthy();
    expect(getByText('3 logs · 30%')).toBeTruthy(); // other (2) + unclassified (1) = 3
    expect(queryByText('Unclassified')).toBeNull();
  });

  it('shows the empty copy when nothing is logged', () => {
    const composition: MealTreatComposition = { meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 };
    const { getByText } = render(<CompositionCard composition={composition} />);
    expect(getByText('No meals or treats logged yet.')).toBeTruthy();
  });
});
