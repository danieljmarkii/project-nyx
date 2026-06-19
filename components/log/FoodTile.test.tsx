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

  // B-103: B-024 added 'jerky' to the food_format enum + the pickers but never
  // to FORMAT_LABEL, so a jerky tile rendered the brand alone (no chip).
  it('renders the jerky format as "<BRAND> · JERKY"', () => {
    const { getByText } = render(
      <FoodTile brand="Stewart" productName="Freeze-Dried Beef Liver" format="jerky" onPress={() => {}} />,
    );
    expect(getByText('STEWART · JERKY')).toBeTruthy();
    expect(getByText('Freeze-Dried Beef Liver')).toBeTruthy();
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

  // Under a brand header (picker brand grouping, B-113 / B-109) the tile drops the
  // brand from the eyebrow and shows the format alone — but the brand stays in the
  // accessibilityLabel, exactly like the Foods-tab FoodRow's hideBrand.
  it('hideBrand shows the format alone and keeps brand in the a11y label', () => {
    const { getByText, queryByText, getByLabelText } = render(
      <FoodTile brand="Fancy Feast" productName="Chicken Pâté" format="wet_canned" hideBrand onPress={() => {}} />,
    );
    expect(getByText('WET')).toBeTruthy();
    expect(queryByText(/FANCY FEAST/)).toBeNull();
    expect(getByLabelText('Fancy Feast Chicken Pâté')).toBeTruthy();
  });

  // hideBrand with an unlabeled format ('other') leaves only the product name —
  // no empty/dangling eyebrow line.
  it('hideBrand with no format label renders only the product name', () => {
    const { getByText, queryByText } = render(
      <FoodTile brand="Fancy Feast" productName="Mystery Mix" format="other" hideBrand onPress={() => {}} />,
    );
    expect(getByText('Mystery Mix')).toBeTruthy();
    expect(queryByText('FANCY FEAST')).toBeNull();
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

  // Accessibility parity with the Foods-tab FoodRow (B-004 PR 7): the whole tile
  // is ONE button labeled with the food's plain "<brand> <product>" — so a screen
  // reader announces "Fancy Feast Salmon Pâté" as a single control rather than
  // reading the styled all-caps "FANCY FEAST · WET" eyebrow and the product name
  // as two separate fragments. The hint names the picker's action (a tap LOGS,
  // unlike FoodRow's navigate-to-detail tap).
  it('exposes the food as a single button labeled with brand + product, hinting the log action', () => {
    const { getByLabelText } = render(
      <FoodTile brand="Fancy Feast" productName="Salmon Pâté" format="wet_canned" onPress={() => {}} />,
    );
    const tile = getByLabelText('Fancy Feast Salmon Pâté');
    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.accessibilityHint).toBe('Logs a meal');
  });
});
