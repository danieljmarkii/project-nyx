import { render, fireEvent } from '@testing-library/react-native';
import { FoodRow } from './FoodRow';
import { theme } from '../../constants/theme';

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

  // Thumbnail state machine (B-004 PR 6). The leading slot is fixed-size and never
  // a broken hole — it resolves to exactly one of: the photo, a quiet pending
  // tile, or the "no photo" placeholder. The slot is decorative (the row's a11y
  // label still names the food), so these are asserted by testID, not a11y.
  it('renders the photo thumbnail when a signed URL is provided', () => {
    const { getByTestId } = render(
      <FoodRow brand="Tiki Cat" productName="Ahi Tuna" format="wet_canned"
        hasPhoto photoUrl="https://signed/ahi.jpg" onPress={() => {}} />,
    );
    expect(getByTestId('food-thumb-photo').props.source).toEqual({ uri: 'https://signed/ahi.jpg' });
  });

  it('shows the quiet pending slot (no photo, no placeholder) while the URL resolves', () => {
    const { getByTestId, queryByTestId } = render(
      <FoodRow brand="Tiki Cat" productName="Ahi Tuna" format="wet_canned"
        hasPhoto photoLoading onPress={() => {}} />,
    );
    expect(getByTestId('food-thumb-pending')).toBeTruthy();
    expect(queryByTestId('food-thumb-photo')).toBeNull();
    expect(queryByTestId('food-thumb-placeholder')).toBeNull();
  });

  it('shows the no-photo placeholder for a food with no photo', () => {
    const { getByTestId, queryByTestId } = render(
      <FoodRow brand="Royal Canin" productName="Hydrolyzed Protein" format="dry_kibble"
        hasPhoto={false} onPress={() => {}} />,
    );
    expect(getByTestId('food-thumb-placeholder')).toBeTruthy();
    expect(queryByTestId('food-thumb-photo')).toBeNull();
  });

  // hasPhoto true but resolution finished WITHOUT a URL (offline / deleted object)
  // → the placeholder, never a stuck pending slot or a broken image.
  it('falls back to the placeholder when a photo path never resolves', () => {
    const { getByTestId, queryByTestId } = render(
      <FoodRow brand="Acme" productName="Beef Stew" format="wet_canned"
        hasPhoto photoLoading={false} onPress={() => {}} />,
    );
    expect(getByTestId('food-thumb-placeholder')).toBeTruthy();
    expect(queryByTestId('food-thumb-pending')).toBeNull();
  });

  it('falls back to the placeholder when the image fails to load (torn/expired URL)', () => {
    const { getByTestId, queryByTestId } = render(
      <FoodRow brand="Acme" productName="Beef Stew" format="wet_canned"
        hasPhoto photoUrl="https://signed/broken.jpg" onPress={() => {}} />,
    );
    fireEvent(getByTestId('food-thumb-photo'), 'error');
    expect(queryByTestId('food-thumb-photo')).toBeNull();
    expect(getByTestId('food-thumb-placeholder')).toBeTruthy();
  });

  // ── Diet-trial list chip (B-616 PR 3, FR-2) ──────────────────────────────
  //
  // The label itself is decided by lib/trialLibraryChrome (and tested there);
  // what matters at this layer is that the row renders it when given one and
  // renders NOTHING when not — R1, the PR's review bar.
  it('renders the trial-list chip when the food is on the list', () => {
    const { getByTestId, getByText } = render(
      <FoodRow brand="Zignature" productName="Kangaroo Formula" format="dry_kibble"
        trialChip="Trial diet" onPress={() => {}} />,
    );
    expect(getByTestId('food-row-trial-chip')).toBeTruthy();
    expect(getByText('Trial diet')).toBeTruthy();
  });

  // The register, pinned — this is the difference the design authority cared
  // about. Uppercase + tracked is read as a CATEGORY LABEL; the same words in
  // sentence case on a green pill are read as an approval badge, and this chip
  // names the trial's list rather than blessing the food. A regression here is
  // silent (the words don't change), so it is asserted rather than reviewed.
  it('styles the chip as an eyebrow, not as an approval badge', () => {
    const { getByText } = render(
      <FoodRow brand="Zignature" productName="Kangaroo Formula" format="dry_kibble"
        trialChip="Also allowed" onPress={() => {}} />,
    );
    expect(getByText('Also allowed')).toHaveStyle({ textTransform: 'uppercase' });
  });

  // The whole of R1 at this layer: a row with no chip prop is a row that says
  // nothing at all about the trial — no grey chip, no "off-diet" mark, nothing.
  it.each([
    ['no trial running (undefined)', undefined],
    ['not on the list (null)', null],
  ])('marks nothing when %s', (_label, chip) => {
    const { queryByTestId } = render(
      <FoodRow brand="Kirkland" productName="Chicken & Rice" format="dry_kibble"
        trialChip={chip} onPress={() => {}} />,
    );
    expect(queryByTestId('food-row-trial-chip')).toBeNull();
  });

  // A screen-reader owner gets the membership too — it leads the note list,
  // matching the chip's visual prominence on the row.
  it('announces the chip in the spoken label', () => {
    const { getByLabelText } = render(
      <FoodRow brand="Zignature" productName="Kangaroo Formula" format="dry_kibble"
        trialChip="Trial diet" intakeNote="Last logged today" onPress={() => {}} />,
    );
    expect(getByLabelText('Zignature Kangaroo Formula, Trial diet, Last logged today')).toBeTruthy();
  });
  // ── The Geist sweep (CUL-608 · app-polish §7) ──
  //
  // Both halves are asserted, because the sweep's failure modes point in opposite
  // directions and neither is visible in a diff. A MISSED swap renders the system
  // face at the right weight — it looks fine, just not Geist. An OVER-EAGER swap
  // takes a glyph `<Text>` with it, which forces a family whose cmap may not carry
  // the character and hands it to OS fallback at a size tuned for a different face.
  // Weight tokens are deliberately not asserted alongside the family: ThemedText
  // DROPS the weight once the family carries it (RN synthesizes nothing for custom
  // fonts), so a test expecting both would be pinning a contradiction.
  it('renders owner-facing row copy in the Geist face the weight token names', () => {
    const { getByText } = render(
      <FoodRow brand="Zignature" productName="Kangaroo Formula" format="dry_kibble"
        trialChip="Trial diet" onPress={() => {}} />,
    );
    expect(getByText('Kangaroo Formula')).toHaveStyle({ fontFamily: theme.fontBodyMedium });
    expect(getByText('ZIGNATURE · DRY')).toHaveStyle({ fontFamily: theme.fontBodyMedium });
    expect(getByText('Trial diet')).toHaveStyle({ fontFamily: theme.fontBodySemibold });
  });

  // The chevron is an icon standing in for a vector glyph, not copy. It keeps the
  // system face on purpose; a sweep or a later audit that "finishes the job" here
  // is the regression this pins.
  it('leaves the chevron glyph on the system face — it is an icon, not copy', () => {
    const { getByText } = render(
      <FoodRow brand="Zignature" productName="Kangaroo Formula" format="dry_kibble" onPress={() => {}} />,
    );
    expect(getByText('\u203a').props.style).not.toEqual(
      expect.objectContaining({ fontFamily: expect.anything() }),
    );
  });
});
