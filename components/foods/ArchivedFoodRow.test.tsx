import { render, fireEvent } from '@testing-library/react-native';
import { ArchivedFoodRow } from './ArchivedFoodRow';

// B-630 (team-ruled 2026-08-04): the diet-trial chip renders inside the
// Archived/restore list — the one place an accidentally-archived trial diet
// needs naming. The contract under test is R1's two sides: a chip string
// renders the eyebrow pill (and is spoken on the restore button), and null
// renders NOTHING — no negative chip, no grey mark, no placeholder.

const base = {
  brand: 'Royal Canin',
  productName: 'Hydrolyzed Protein HP',
  format: 'dry',
  onRestore: jest.fn(),
};

describe('ArchivedFoodRow — trial chip (B-630)', () => {
  it('renders the chip and speaks it on the restore action when membership names it', () => {
    const { getByTestId, getByText, getByLabelText } = render(
      <ArchivedFoodRow {...base} trialChip="Trial diet" />,
    );
    expect(getByTestId('archived-row-trial-chip')).toBeTruthy();
    expect(getByText('Trial diet')).toBeTruthy();
    // The screen-reader path hears what the eye sees: the chip rides the button label.
    expect(
      getByLabelText('Restore Royal Canin Hydrolyzed Protein HP to your library, Trial diet'),
    ).toBeTruthy();
  });

  it('renders nothing at all for null — a mark\'s absence is never a verdict (R1)', () => {
    const { queryByTestId, queryByText } = render(<ArchivedFoodRow {...base} trialChip={null} />);
    expect(queryByTestId('archived-row-trial-chip')).toBeNull();
    expect(queryByText('Trial diet')).toBeNull();
    expect(queryByText('Also allowed')).toBeNull();
  });

  it('renders nothing when the prop is omitted (every pre-B-630 call site)', () => {
    const { queryByTestId } = render(<ArchivedFoodRow {...base} />);
    expect(queryByTestId('archived-row-trial-chip')).toBeNull();
  });

  it('keeps Restore working alongside the chip', () => {
    const onRestore = jest.fn();
    const { getByText } = render(
      <ArchivedFoodRow {...base} onRestore={onRestore} trialChip="Trial diet" />,
    );
    fireEvent.press(getByText('Restore'));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});
