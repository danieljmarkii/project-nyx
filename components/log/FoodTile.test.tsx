import { render, fireEvent } from '@testing-library/react-native';
import { FoodTile } from './FoodTile';

describe('FoodTile', () => {
  // B-102 acceptance criterion: a human_food item's tile renders "… · HUMAN FOOD"
  // (the format label uppercased), not a blank metadata line.
  it('renders the human_food format as "<BRAND> · HUMAN FOOD"', () => {
    const { getByText } = render(
      <FoodTile brand="Costco" productName="Rotisserie Chicken" format="human_food" onPress={() => {}} />,
    );
    expect(getByText('COSTCO · HUMAN FOOD')).toBeTruthy();
    expect(getByText('Rotisserie Chicken')).toBeTruthy();
  });

  // Regression guard for the intentional empty-label branch: 'other' maps to ''
  // so the tile shows the brand alone, never "<BRAND> · " with a dangling dot.
  it('shows the brand alone when the format has no label (other)', () => {
    const { getByText, queryByText } = render(
      <FoodTile brand="Costco" productName="Mystery Mix" format="other" onPress={() => {}} />,
    );
    expect(getByText('COSTCO')).toBeTruthy();
    expect(queryByText(/·/)).toBeNull();
  });

  it('fires onPress when the tile is tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <FoodTile brand="Costco" productName="Rotisserie Chicken" format="human_food" onPress={onPress} />,
    );
    fireEvent.press(getByText('Rotisserie Chicken'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
