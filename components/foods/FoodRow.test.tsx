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

  // Under a brand header (Foods-tab brand grouping, B-004 PR 3) the brand is
  // shown once above the group, so the row drops it from the meta line and shows
  // the format alone — but the brand stays in the accessibilityLabel.
  it('hideBrand shows the format alone and keeps brand in the a11y label', () => {
    const { getByText, queryByText, getByLabelText } = render(
      <FoodRow brand="Fancy Feast" productName="Chicken Pâté" format="wet_canned" hideBrand onPress={() => {}} />,
    );
    expect(getByText('WET')).toBeTruthy();
    expect(queryByText(/FANCY FEAST/)).toBeNull();
    expect(getByLabelText('Fancy Feast Chicken Pâté')).toBeTruthy();
  });

  // hideBrand with an unlabeled format ('other') leaves only the product name —
  // no empty/dangling meta line.
  it('hideBrand with no format label renders only the product name', () => {
    const { getByText, queryByText } = render(
      <FoodRow brand="Fancy Feast" productName="Mystery Mix" format="other" hideBrand onPress={() => {}} />,
    );
    expect(getByText('Mystery Mix')).toBeTruthy();
    expect(queryByText('FANCY FEAST')).toBeNull();
    expect(queryByText(/·/)).toBeNull();
  });

  // Per-pet intake annotation (B-004 PR 4): the note line renders below the
  // product name and is folded into the a11y label so a screen reader hears it.
  it('renders the per-pet intake note and appends it to the a11y label', () => {
    const { getByText, getByLabelText } = render(
      <FoodRow
        brand="Fancy Feast"
        productName="Chicken Pâté"
        format="wet_canned"
        hideBrand
        intakeNote="Last logged 3 days ago · 12 times"
        onPress={() => {}}
      />,
    );
    expect(getByText('Last logged 3 days ago · 12 times')).toBeTruthy();
    expect(getByLabelText('Fancy Feast Chicken Pâté, Last logged 3 days ago · 12 times')).toBeTruthy();
  });

  // No note (pet has never been logged this food) → no extra line, and the a11y
  // label stays the plain "<brand> <product>" — the row reads clean.
  it('renders no intake line and a plain a11y label when no note is given', () => {
    const { queryByText, getByLabelText } = render(
      <FoodRow brand="Fancy Feast" productName="Chicken Pâté" format="wet_canned" hideBrand onPress={() => {}} />,
    );
    expect(queryByText(/Last logged/)).toBeNull();
    expect(getByLabelText('Fancy Feast Chicken Pâté')).toBeTruthy();
  });

  // Reliable-favorites shelf (B-004 PR 5): the favorite line — the denominator-
  // bearing finished rate — renders below the product name and is folded into the
  // a11y label. The shelf shows the brand per row (favorites span brands), so the
  // meta line carries the brand here.
  it('renders the favorite note and appends it to the a11y label', () => {
    const { getByText, getByLabelText } = render(
      <FoodRow
        brand="Tiki Cat"
        productName="Ahi Tuna"
        format="wet_canned"
        favoriteNote="Finished 9 of 11 meals"
        onPress={() => {}}
      />,
    );
    expect(getByText('Finished 9 of 11 meals')).toBeTruthy();
    expect(getByText('TIKI CAT · WET')).toBeTruthy();
    expect(getByLabelText('Tiki Cat Ahi Tuna, Finished 9 of 11 meals')).toBeTruthy();
  });
});
