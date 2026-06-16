import { render, fireEvent } from '@testing-library/react-native';
import { FoodRow } from './FoodRow';

describe('FoodRow', () => {
  // The full-width Foods-tab row renders the same BRAND · FORMAT meta line as the
  // picker tile, from the shared FORMAT_LABEL — so a format chip can't drift
  // between the two surfaces (the B-103 class of bug).
  it('renders "<BRAND> · <FORMAT>" from the shared format map', () => {
    const { getByText } = render(
      <FoodRow brand="Costco" productName="Rotisserie Chicken" format="human_food" onPress={() => {}} />,
    );
    expect(getByText('COSTCO · HUMAN FOOD')).toBeTruthy();
    expect(getByText('Rotisserie Chicken')).toBeTruthy();
  });

  // 'other' maps to '' — the row shows the brand alone, never "<BRAND> · " with
  // a dangling separator.
  it('shows the brand alone when the format has no label (other)', () => {
    const { getByText, queryByText } = render(
      <FoodRow brand="Costco" productName="Mystery Mix" format="other" onPress={() => {}} />,
    );
    expect(getByText('COSTCO')).toBeTruthy();
    expect(queryByText(/·/)).toBeNull();
  });

  // A tap navigates to the food's detail screen (the parent wires the route);
  // here we just verify the row fires its onPress.
  it('fires onPress when the row is tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <FoodRow brand="Royal Canin" productName="Hydrolyzed Protein" format="dry_kibble" onPress={onPress} />,
    );
    fireEvent.press(getByText('Hydrolyzed Protein'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
