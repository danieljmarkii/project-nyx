// FoodPicker's search-results mode. While a query is typed, the add CTA, the
// rotation shelf, and "Always available" must all step aside so the filtered
// library renders directly under the pinned search bar. Regression guard for the
// below-the-fold bug: the B-346 rotation shelf (up to ~6 wrapped grid rows) kept
// rendering above the filtered results, so on smaller phones typing a search
// visibly changed nothing — the matches were correct but off-screen.
jest.mock('../../lib/db', () => ({
  getLibraryFoods: jest.fn(),
}));
// The rotation shelf's read (foods fed lately, mixes among them; CUL-2090), pinned against
// a real engine in lib/foodQueries.test.ts.
jest.mock('../../lib/fabRecentItems', () => ({
  getPickerRotationItems: jest.fn(),
}));
// Mock the arrangements module whole (its module graph reaches expo-sqlite /
// supabase, which can't import under jest) — this test seeds zero arrangements
// and only asserts the section's presence/absence.
jest.mock('../../lib/feedingArrangements', () => ({
  getActiveArrangementsForPets: jest.fn().mockResolvedValue([]),
  groupArrangementsByFood: jest.fn(() => []),
  confirmArrangementFresh: jest.fn(),
  endFreeChoice: jest.fn(),
  arrangementPetsLine: jest.fn(() => ''),
  petNameList: jest.fn(() => ''),
  formatCalendarDate: jest.fn(() => null),
  isArrangementStale: jest.fn(() => false),
}));
// B-616 PR 4 — the picker reads the allowed set through this hook. Mocked whole
// so the section's three inputs (the set, the pet, the mode) can be varied
// independently; the hook's own behaviour is pinned in useTrialAllowedSet.test.ts.
jest.mock('../../hooks/useTrialAllowedSet', () => ({
  useTrialAllowedSet: jest.fn(() => ({ status: 'unknown' })),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    // Fire the focus callback on mount — the picker's data load — and again whenever
    // its identity changes, as the real hook does while focused (Try again, CUL-2168).
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});

import { render, fireEvent } from '@testing-library/react-native';
import { FoodPicker, FOOD_READ_FAILED } from './FoodPicker';
import { PICKER_SILHOUETTE_TEST_ID } from '../surfaces/waits/PickerSilhouette';
import { usePetStore } from '../../store/petStore';
import { useTrialAllowedSet } from '../../hooks/useTrialAllowedSet';
import { buildTrialContext, type AllowedFood } from '../../lib/dietTrial';
import type { TrialAllowedSet } from '../../lib/trialAllowedSet';
import * as db from '../../lib/db';
import type { PickerFood, LibraryFood } from '../../lib/db';
import * as recent from '../../lib/fabRecentItems';
import type { FabMix, FabRecentItem } from '../../lib/fabRecentItems';

const DB = db as jest.Mocked<typeof db>;
const ROT = recent.getPickerRotationItems as jest.MockedFunction<typeof recent.getPickerRotationItems>;
const TRIAL_SET = useTrialAllowedSet as jest.MockedFunction<typeof useTrialAllowedSet>;

const food = (id: string, brand: string, product: string): PickerFood => ({
  id,
  brand,
  product_name: product,
  format: 'dry',
  food_type: 'meal',
  photo_path: null,
});

// Duck + Fish are in the 30-day rotation window; Chicken is library-only — the
// food the owner searches for.
const ROTATION = [food('r1', 'Acana', 'Duck'), food('r2', 'Orijen', 'Fish')];
// getLibraryFoods returns LibraryFood (PickerFood + the three B-351 disclosure
// columns). The picker itself never reads them — it is a moment-of-event surface
// and shows no protein line — so they are stubbed as the not-captured shape.
const LIBRARY: LibraryFood[] = [...ROTATION, food('l1', 'Tiki Cat', 'Chicken')].map((f) => ({
  ...f,
  proteins: null,
  ingredients_notes: null,
  ai_extraction_confidence: null,
}));

beforeEach(() => {
  jest.clearAllMocks();
  // The default everywhere except the B-616 block below: R2 — a read that could
  // not answer renders nothing, so no section.
  TRIAL_SET.mockReturnValue({ status: 'unknown' });
  usePetStore.setState({
    activePet: null,
    pets: [{
      id: 'p1', name: 'Nyx', species: 'cat', breed: null, date_of_birth: null,
      date_of_birth_precision: 'exact', sex: 'unknown', weight_kg: null, photo_path: null,
    }],
  });
  ROT.mockResolvedValue(ROTATION);
  DB.getLibraryFoods.mockResolvedValue(LIBRARY);
});

function renderPicker() {
  return render(
    <FoodPicker
      petId="p1"
      petName="Nyx"
      onPickFood={jest.fn()}
      onAddNew={jest.fn()}
    />,
  );
}

// CUL-2168 (C-12) — a read that hasn't answered is never an empty record. The picker's
// arrays start as [], so before this the first frame and every failed read said
// "No foods yet" to an owner with a full library.
describe('FoodPicker — the read’s three states below "has rows" (CUL-2168)', () => {
  const EMPTY = 'No foods yet. Snap one above.';
  const hidden = { includeHiddenElements: true };

  it('while the read is unanswered: the silhouette, never the empty copy', () => {
    DB.getLibraryFoods.mockReturnValue(new Promise(() => {}));
    const { getByTestId, queryByText } = renderPicker();
    expect(getByTestId(PICKER_SILHOUETTE_TEST_ID, hidden)).toBeTruthy();
    expect(queryByText(EMPTY)).toBeNull();
    expect(queryByText(/Nothing always-out yet/)).toBeNull();
    expect(queryByText(FOOD_READ_FAILED)).toBeNull();
    // The way to add a food stays open while the library reads.
    expect(queryByText('Snap a new food')).toBeTruthy();
  });

  it('once a read answers with nothing: the empty copy, and no silhouette', async () => {
    ROT.mockResolvedValue([]);
    DB.getLibraryFoods.mockResolvedValue([]);
    const { findByText, queryByTestId, queryByText } = renderPicker();
    expect(await findByText(EMPTY)).toBeTruthy();
    expect(queryByTestId(PICKER_SILHOUETTE_TEST_ID, hidden)).toBeNull();
    expect(queryByText(FOOD_READ_FAILED)).toBeNull();
  });

  it('when the read throws: the quiet band, never the empty copy, and Try again reads again', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    DB.getLibraryFoods.mockRejectedValue(new Error('SQLITE_BUSY'));
    const { findByText, getByText, queryByText, queryByTestId } = renderPicker();
    expect(await findByText(FOOD_READ_FAILED)).toBeTruthy();
    expect(queryByText(EMPTY)).toBeNull();
    expect(queryByText(/Nothing always-out yet/)).toBeNull();
    expect(queryByTestId(PICKER_SILHOUETTE_TEST_ID, hidden)).toBeNull();
    expect(getByText('Snap a new food')).toBeTruthy();

    DB.getLibraryFoods.mockResolvedValue(LIBRARY);
    fireEvent.press(getByText('Try again'));
    expect(await findByText("Nyx's rotation")).toBeTruthy();
    expect(getByText('Chicken')).toBeTruthy();
    expect(queryByText(FOOD_READ_FAILED)).toBeNull();
    warn.mockRestore();
  });
});

describe('FoodPicker search-results mode', () => {
  it('browse mode shows the add CTA, rotation shelf, and Always available', async () => {
    const { findByText, getByText } = renderPicker();
    expect(await findByText("Nyx's rotation")).toBeTruthy();
    expect(getByText('Snap a new food')).toBeTruthy();
    expect(getByText('Always available')).toBeTruthy();
  });

  // B-356 (PM-ruled 2026-08-04): one food is not a rotation — Jordan's strict
  // elimination diet feeds exactly one, so the shelf label degrades to the
  // neutral, still recency-factual "Recently fed".
  it('labels a single-food shelf "Recently fed", never "{pet}\'s rotation" (B-356)', async () => {
    ROT.mockResolvedValue([ROTATION[0]]);
    const { findByText, queryByText } = renderPicker();
    expect(await findByText('Recently fed')).toBeTruthy();
    expect(queryByText("Nyx's rotation")).toBeNull();
  });

  it('typing a query collapses the picker to just the matches', async () => {
    const { findByText, getByPlaceholderText, getByText, queryByText, queryAllByText } =
      renderPicker();
    await findByText("Nyx's rotation");

    fireEvent.changeText(getByPlaceholderText('Search brand or product'), 'chick');

    // The three non-result zones step aside…
    expect(queryByText("Nyx's rotation")).toBeNull();
    expect(queryByText('Snap a new food')).toBeNull();
    expect(queryByText('Always available')).toBeNull();
    // …and only the match renders, directly under the pinned bar.
    expect(getByText('Chicken')).toBeTruthy();
    expect(queryAllByText('Duck')).toHaveLength(0);
  });

  it('a no-match query shows the empty state with its own add CTA', async () => {
    const { findByText, getByPlaceholderText, getByText } = renderPicker();
    await findByText("Nyx's rotation");

    fireEvent.changeText(getByPlaceholderText('Search brand or product'), 'zzz');

    expect(getByText('No matches.')).toBeTruthy();
    // The top CTA is hidden in results mode, so the dead-end carries its own
    // forward path — the food that isn't in the library yet is the one to snap.
    expect(getByText('Snap a new food')).toBeTruthy();
  });

  it('clearing the query restores the browse layout', async () => {
    const { findByText, getByPlaceholderText, getByText } = renderPicker();
    await findByText("Nyx's rotation");
    const input = getByPlaceholderText('Search brand or product');

    fireEvent.changeText(input, 'chick');
    fireEvent.changeText(input, '');

    expect(getByText("Nyx's rotation")).toBeTruthy();
    expect(getByText('Snap a new food')).toBeTruthy();
    expect(getByText('Always available')).toBeTruthy();
  });

  it('a whitespace-only query stays in browse mode', async () => {
    const { findByText, getByPlaceholderText, getByText } = renderPicker();
    await findByText("Nyx's rotation");

    fireEvent.changeText(getByPlaceholderText('Search brand or product'), '   ');

    expect(getByText("Nyx's rotation")).toBeTruthy();
    expect(getByText('Snap a new food')).toBeTruthy();
  });
});

// B-406 — the treat door lands the picker pre-scoped. `initialScope` seeds the
// pinned scope chip exactly as if the owner had tapped it, so the library filters
// to that scope on open. The rotation shelf is deliberately unfiltered (the B-347
// scope-chip contract), so these tests empty the rotation to isolate the library.
describe('FoodPicker initialScope (B-406)', () => {
  const meal = (id: string, product: string): PickerFood => ({
    id, brand: 'BrandM', product_name: product, format: 'dry_kibble', food_type: 'meal', photo_path: null,
  });
  const treat = (id: string, product: string): PickerFood => ({
    id, brand: 'BrandT', product_name: product, format: 'jerky', food_type: 'treat', photo_path: null,
  });
  const LIB: PickerFood[] = [meal('m1', 'Kibble'), treat('t1', 'Jerky')];

  beforeEach(() => {
    // Empty the rotation so only the (scope-filtered) library renders — the
    // rotation shelf shows recency regardless of scope, by B-347 design.
    ROT.mockResolvedValue([]);
    DB.getLibraryFoods.mockResolvedValue(LIB as never);
  });

  it('opens scoped to treats — the treat shows, the meal is filtered out', async () => {
    const { findByText, queryByText } = render(
      <FoodPicker petId="p1" petName="Nyx" initialScope="treat"
        onPickFood={jest.fn()} onAddNew={jest.fn()} />,
    );
    expect(await findByText('Jerky')).toBeTruthy();
    expect(queryByText('Kibble')).toBeNull();
  });

  it('without initialScope the library shows every food (the control)', async () => {
    const { findByText, getByText } = render(
      <FoodPicker petId="p1" petName="Nyx"
        onPickFood={jest.fn()} onAddNew={jest.fn()} />,
    );
    expect(await findByText('Jerky')).toBeTruthy();
    expect(getByText('Kibble')).toBeTruthy();
  });
});

// B-417 PR 3 — selection mode. The picker was single-select for its whole life;
// a real elimination trial is often a wet AND a dry of the same diet, so the
// trial diet takes N foods and writes N `diet_trial_foods` rows. What matters
// here is that the mode is opt-in (every existing caller is untouched) and that a
// tile in it stops claiming it logs anything.
describe('FoodPicker selection mode', () => {
  function renderSelecting(selected: string[], onPickFood = jest.fn()) {
    return {
      onPickFood,
      ...render(
        <FoodPicker
          petId="p1"
          petName="Nyx"
          selectedFoodIds={selected}
          onPickFood={onPickFood}
          onAddNew={jest.fn()}
        />,
      ),
    };
  }

  // A rotation food is also a library food, so it renders twice by design —
  // assert on every instance rather than picking one.
  it('announces tiles as checkboxes carrying their checked state', async () => {
    const { findAllByLabelText, getAllByLabelText } = renderSelecting(['r1']);
    for (const picked of await findAllByLabelText('Acana Duck')) {
      expect(picked.props.accessibilityRole).toBe('checkbox');
      expect(picked.props.accessibilityState.checked).toBe(true);
      // "Logs this food" is a lie on a surface where a tap builds a set.
      expect(picked.props.accessibilityHint).toBeUndefined();
    }
    for (const other of getAllByLabelText('Orijen Fish')) {
      expect(other.props.accessibilityState.checked).toBe(false);
    }
  });

  it('leaves every existing caller on the one-tap-log path', async () => {
    const { findAllByLabelText } = renderPicker();
    const [tile] = await findAllByLabelText('Acana Duck');
    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.accessibilityHint).toBe('Logs this food');
  });

  it('hands the tapped food back so the caller can toggle it', async () => {
    const { onPickFood, findByLabelText } = renderSelecting([]);
    fireEvent.press(await findByLabelText('Tiki Cat Chicken'));
    expect(onPickFood).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
  });

  it('hides "Always available" — those are standing facts, not candidates', async () => {
    const { findByText, queryByText } = renderSelecting([]);
    await findByText("Nyx's rotation");
    expect(queryByText('Always available')).toBeNull();
    // The capture CTA stays: the trial food is usually a bag the owner was handed
    // ten minutes ago, so "not in the library yet" is the common case here.
    expect(queryByText('Snap a new food')).toBeTruthy();
  });
});

// B-616 PR 4 (§2.5, FR-16–FR-19) — the pinned "On the trial list" section, variant H.
//
// The ruling this suite defends is ORDERING, NOT MARKING. §6.4 lets the library
// verdict because browsing is pre-decision; the picker is the moment of logging,
// where nothing may make an owner hesitate to record a transgression — an unlogged
// exposure is worse than the exposure. So the section may lift the allowed set to
// the top and may say nothing whatsoever about any other food, including by
// implication (variant G's glyph was closed for exactly that: at pick time a
// MISSING glyph reads as "don't").
describe('FoodPicker — the pinned "On the trial list" section', () => {
  const PET = {
    id: 'p1', name: 'Nyx', species: 'cat' as const, breed: null, date_of_birth: null,
    date_of_birth_precision: 'exact' as const, sex: 'unknown' as const,
    weight_kg: null, photo_path: null,
  };

  function allowed(over: Partial<AllowedFood> & Pick<AllowedFood, 'foodItemId'>): AllowedFood {
    return {
      foodKey: null,
      label: 'Food',
      role: 'primary_diet',
      // Long past, so membership is in force whenever this suite is run — the
      // picker asks the predicate for TODAY.
      allowedFrom: '2020-01-01',
      allowedUntil: null,
      primaryProtein: null,
      proteins: [],
      ...over,
    };
  }

  /** Tiki Cat Chicken is the trial diet; Acana Duck is a permitted extra. Both are
   *  ordinary library foods in the fixture above, which is the point — the section
   *  renders the same tiles from the same library. */
  function readySet(foods: AllowedFood[]): TrialAllowedSet {
    const spec = {
      id: 't1',
      startedAt: '2020-01-01',
      targetDurationDays: 56,
      species: 'cat' as const,
    };
    return {
      status: 'ready',
      trial: { id: 't1', startedAt: '2020-01-01', targetDurationDays: 56, endedAt: null },
      ctx: buildTrialContext(spec, foods),
      foods,
    };
  }

  const ON_LIST = [
    allowed({ foodItemId: 'l1', label: 'Tiki Cat Chicken' }),
    allowed({ foodItemId: 'r1', label: 'Acana Duck', role: 'permitted_treat' }),
  ];

  beforeEach(() => {
    usePetStore.setState({ activePet: PET });
    TRIAL_SET.mockReturnValue(readySet(ON_LIST));
  });

  it('renders the section, holding only the foods on the list', async () => {
    const { findByText, getAllByLabelText, queryAllByLabelText } = renderPicker();
    expect(await findByText('On the trial list')).toBeTruthy();
    // Both on-list foods are in it (each also renders elsewhere — see FR-17).
    expect(getAllByLabelText('Tiki Cat Chicken').length).toBeGreaterThanOrEqual(2);
    // Orijen Fish is not on the list, so it appears exactly where it always did
    // and nowhere else: the rotation shelf and the library group.
    expect(queryAllByLabelText('Orijen Fish')).toHaveLength(2);
  });

  it('puts the trial diet first, ahead of a permitted extra', async () => {
    const { findByText, getAllByLabelText } = renderPicker();
    await findByText('On the trial list');
    // The first rendered instance of each is the one inside the section (it is the
    // first zone in the scroll view).
    const diet = getAllByLabelText('Tiki Cat Chicken')[0];
    const extra = getAllByLabelText('Acana Duck')[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = (node: any) => JSON.stringify(node.props.accessibilityLabel);
    expect([order(diet), order(extra)]).toEqual(['"Tiki Cat Chicken"', '"Acana Duck"']);
  });

  // FR-16 — "Tiles are visually identical to every other tile; the section label is
  // the only signal." A tile that announced itself differently here would be the
  // per-tile marking D4 closed, wearing a section header.
  it('marks nothing — a tile in the section is the same one-tap-log tile', async () => {
    const { findAllByLabelText } = renderPicker();
    for (const tile of await findAllByLabelText('Tiki Cat Chicken')) {
      expect(tile.props.accessibilityRole).toBe('button');
      expect(tile.props.accessibilityHint).toBe('Logs this food');
    }
  });

  // FR-17 — nothing below is removed, de-emphasized or filtered. The rotation shelf
  // means "what this pet was actually fed", not "what the trial permits".
  it('leaves the rotation shelf and library zones exactly as they were', async () => {
    const { findByText, getByText, getAllByLabelText } = renderPicker();
    await findByText('On the trial list');
    expect(getByText("Nyx's rotation")).toBeTruthy();
    expect(getByText('Snap a new food')).toBeTruthy();
    expect(getByText('Always available')).toBeTruthy();
    // Acana Duck is on the list AND in the rotation AND in the library — three
    // instances, none of them removed to avoid the repeat.
    expect(getAllByLabelText('Acana Duck')).toHaveLength(3);
  });

  // FR-18 — the two selection-mode callers are the screens that EDIT the list.
  it('is absent in selection mode', async () => {
    const { findByText, queryByText } = render(
      <FoodPicker
        petId="p1"
        petName="Nyx"
        selectedFoodIds={[]}
        onPickFood={jest.fn()}
        onAddNew={jest.fn()}
      />,
    );
    await findByText("Nyx's rotation");
    expect(queryByText('On the trial list')).toBeNull();
  });

  // D7 — the library is per-account, the trial is per-pet. Marking pet A's allowed
  // foods on a log screen open for pet B is the cross-pet leak the hook's own
  // pet-pairing exists to prevent; the picker takes its pet as a prop, so it holds
  // the same guard at its own boundary.
  it('renders nothing when the picker is logging for a different pet', async () => {
    usePetStore.setState({ activePet: { ...PET, id: 'p2', name: 'Mochi' } });
    const { findByText, queryByText } = renderPicker();
    await findByText("Nyx's rotation");
    expect(queryByText('On the trial list')).toBeNull();
  });

  it('renders nothing while the set is unknown, and nothing once the trial ends', async () => {
    for (const set of [{ status: 'unknown' } as const, { status: 'no_trial' } as const]) {
      TRIAL_SET.mockReturnValue(set);
      const { findByText, queryByText, unmount } = renderPicker();
      await findByText("Nyx's rotation");
      expect(queryByText('On the trial list')).toBeNull();
      unmount();
    }
  });

  // The scope chip is the picker's OTHER filter, and the same rule governs it:
  // an unfiltered section above filtered results reads as phantom matches. Tapping
  // "Treats" and still seeing the prescribed dry food pinned at the top is the
  // picker answering a question the owner did not ask.
  it('is filtered by the scope chip, and disappears when the scope empties it', async () => {
    const { findByText, getAllByRole, queryByText, getAllByLabelText } = renderPicker();
    await findByText('On the trial list');

    // The scope chips are the radios in the pinned bar, in FOOD_SCOPE_OPTIONS
    // order: All / Meals / Treats / Wet / Dry.
    const chips = getAllByRole('radio');

    // Both on-list foods are meals in this fixture, so Treats empties the section.
    fireEvent.press(chips[2]);
    expect(queryByText('On the trial list')).toBeNull();

    // Meals keeps it — and the section holds only what the scope admits.
    fireEvent.press(chips[1]);
    expect(queryByText('On the trial list')).toBeTruthy();
    expect(getAllByLabelText('Tiki Cat Chicken').length).toBeGreaterThanOrEqual(2);
  });

  it('steps aside in search-results mode, like every other browse zone', async () => {
    const { findByText, getByPlaceholderText, queryByText } = renderPicker();
    await findByText('On the trial list');
    fireEvent.changeText(getByPlaceholderText('Search brand or product'), 'chick');
    expect(queryByText('On the trial list')).toBeNull();
  });
});

// Mixed meals row 5 (CUL-2054; R1) — the picker for a bowl's second food offers meal foods
// only, in the rotation shelf and the library alike, and drops "+ Add new" (its capture
// flow logs a meal of its own).
describe('FoodPicker mixableOnly (row 5)', () => {
  const pf = (id: string, product: string, food_type: string, format: string): PickerFood => ({
    id, brand: 'B', product_name: product, format, food_type, photo_path: null,
  });
  const FOODS: PickerFood[] = [
    pf('m1', 'Rabbit Pâté', 'meal', 'wet'),
    pf('t1', 'Jerky', 'treat', 'jerky'),
    pf('p1', 'Sprinkle', 'meal', 'topper'),
  ];

  // CUL-2089 (mock A1): the add row stays, so a food not saved yet can join the bowl. The
  // caller opens capture add only; the picker just hands the tap over.
  it('keeps the add row, and hands its tap to the caller', async () => {
    ROT.mockResolvedValue(FOODS);
    DB.getLibraryFoods.mockResolvedValue(FOODS as never);
    const onAddNew = jest.fn();
    const { findByText } = render(
      <FoodPicker petId="p1" petName="Nyx" mixableOnly selectedFoodIds={[]}
        onPickFood={jest.fn()} onAddNew={onAddNew} />,
    );
    fireEvent.press(await findByText('Snap a new food'));
    expect(onAddNew).toHaveBeenCalledTimes(1);
  });

  it('offers a meal food as a pick, and keeps a topper off the rotation shelf', async () => {
    ROT.mockResolvedValue(FOODS);
    DB.getLibraryFoods.mockResolvedValue(FOODS as never);
    const onPickFood = jest.fn();
    const { findAllByText, getAllByText } = render(
      <FoodPicker petId="p1" petName="Nyx" mixableOnly selectedFoodIds={[]}
        onPickFood={onPickFood} onAddNew={jest.fn()} />,
    );
    const rabbit = await findAllByText('Rabbit Pâté');
    fireEvent.press(rabbit[0]);
    expect(onPickFood).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    // Once, in the library with its reason; never as a pickable shelf tile.
    expect(getAllByText('Sprinkle')).toHaveLength(1);
  });

  // CUL-2134 (mock M1b): a treat shows, dimmed, with the reason, and is no control.
  it('shows a treat dimmed with its reason, and a tap on it picks nothing', async () => {
    ROT.mockResolvedValue(FOODS);
    DB.getLibraryFoods.mockResolvedValue(FOODS as never);
    const onPickFood = jest.fn();
    const { findByText, getByText, getByLabelText } = render(
      <FoodPicker petId="p1" petName="Nyx" mixableOnly selectedFoodIds={[]}
        onPickFood={onPickFood} onAddNew={jest.fn()} />,
    );
    const name = await findByText('Jerky');
    getByText('Treat · logged on its own');
    // Inert by host (C-7): no touchable owns the tile, and it claims no `disabled`.
    const tile = getByLabelText('B Jerky. Treat · logged on its own');
    expect(tile.props.accessibilityState).toBeUndefined();
    expect(tile.props.onPress).toBeUndefined();
    // C-6: walk UP the host nodes; none between the label and the root is a responder.
    let node: typeof name | null = name;
    while (node) {
      if (typeof node.type === 'string') expect(node.props.onStartShouldSetResponder).toBeUndefined();
      node = node.parent as typeof name | null;
    }
    fireEvent.press(name);
    expect(onPickFood).not.toHaveBeenCalled();
  });

  // CUL-2143: a topper shows the same way, with its own reason, whatever its type says.
  it('shows a topper dimmed with its reason, inert', async () => {
    const otherTopper = pf('p2', 'Broth', 'other', 'topper');
    ROT.mockResolvedValue([]);
    DB.getLibraryFoods.mockResolvedValue([...FOODS, otherTopper] as never);
    const onPickFood = jest.fn();
    const onOpenDetail = jest.fn();
    const { findByLabelText, getByText } = render(
      <FoodPicker petId="p1" petName="Nyx" mixableOnly selectedFoodIds={[]}
        onPickFood={onPickFood} onOpenDetail={onOpenDetail} onAddNew={jest.fn()} />,
    );
    for (const label of ['B Sprinkle. Topper · logged on its own', 'B Broth. Topper · logged on its own']) {
      const tile = await findByLabelText(label);
      expect(tile.props.onPress).toBeUndefined();
      expect(tile.props.accessibilityState).toBeUndefined();
    }
    fireEvent.press(getByText('Sprinkle'));
    fireEvent.press(getByText('Broth'));
    expect(onPickFood).not.toHaveBeenCalled();
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  // CUL-2089 (mock A1): a food not set as a meal is a button that opens its page, where the
  // type is set; it is never handed to the bowl, whose writer would refuse it.
  it('a food not set as a meal opens its page, and is never picked', async () => {
    const unset = [pf('o1', 'Duck Stew', 'other', 'wet'), { ...pf('n1', 'Old Bag', 'meal', 'dry'), food_type: null }];
    ROT.mockResolvedValue([]);
    DB.getLibraryFoods.mockResolvedValue(unset as never);
    const onPickFood = jest.fn();
    const onOpenDetail = jest.fn();
    const { findByLabelText } = render(
      <FoodPicker petId="p1" petName="Nyx" mixableOnly selectedFoodIds={[]}
        onPickFood={onPickFood} onOpenDetail={onOpenDetail} onAddNew={jest.fn()} />,
    );
    for (const [label, id] of [['B Duck Stew. Not set as a meal · tap to set it', 'o1'], ['B Old Bag. Not set as a meal · tap to set it', 'n1']]) {
      const tile = await findByLabelText(label);
      // A button with its own hint, never a checkbox: a tap toggles nothing here.
      expect(tile.props.accessibilityRole).toBe('button');
      expect(tile.props.accessibilityHint).toBe('Opens the food to set its type');
      fireEvent.press(tile);
      expect(onOpenDetail).toHaveBeenLastCalledWith(expect.objectContaining({ id }));
    }
    expect(onPickFood).not.toHaveBeenCalled();
  });

  it('with no way to open a food, one not set as a meal is inert and says so', async () => {
    ROT.mockResolvedValue([]);
    DB.getLibraryFoods.mockResolvedValue([pf('o1', 'Duck Stew', 'other', 'wet')] as never);
    const onPickFood = jest.fn();
    const { findByLabelText, getByText } = render(
      <FoodPicker petId="p1" petName="Nyx" mixableOnly selectedFoodIds={[]}
        onPickFood={onPickFood} onAddNew={jest.fn()} />,
    );
    const tile = await findByLabelText('B Duck Stew. Not set as a meal');
    expect(tile.props.onPress).toBeUndefined();
    fireEvent.press(getByText('Duck Stew'));
    expect(onPickFood).not.toHaveBeenCalled();
  });

  it('without it, the same foods all show (the control)', async () => {
    ROT.mockResolvedValue([]);
    DB.getLibraryFoods.mockResolvedValue(FOODS as never);
    const { findByText, queryByText } = render(
      <FoodPicker petId="p1" petName="Nyx" onPickFood={jest.fn()} onAddNew={jest.fn()} />,
    );
    expect(await findByText('Jerky')).toBeTruthy();
    expect(await findByText('Sprinkle')).toBeTruthy();
    expect(queryByText('Treat · logged on its own')).toBeNull();
  });
});

// CUL-2090 (mixed meals spec §7.4) — a recent mix lives on the rotation shelf as its own
// tile, beside the FAB pill. A tap logs the bowl again; it never shows where a whole bowl
// is not an answer (building a set, picking a bowl's second food).
describe('FoodPicker rotation shelf: recent mixes (CUL-2090)', () => {
  const chicken = food('c1', 'Acme', 'Chicken Pâté');
  const rabbit = food('b1', 'Acme', 'Rabbit Pâté');
  const MIX: FabMix = {
    key: 'b1|c1',
    foods: [
      { food: chicken, rowName: 'Chicken Pâté', share: 1 / 3, written: { share: 1 / 3, shareSource: 'preset' } },
      { food: rabbit, rowName: 'Rabbit Pâté', share: 2 / 3, written: { share: 2 / 3, shareSource: 'preset' } },
    ],
  };
  const MIX_ITEM: FabRecentItem = {
    id: 'mix:b1|c1', brand: '', product_name: '⅓ Chicken Pâté + ⅔ Rabbit Pâté', format: '',
    food_type: 'meal', photo_path: null, mix: MIX,
  };

  it('shows the mix as a tile, and a tap hands the bowl to onPickMix, not onPickFood', async () => {
    ROT.mockResolvedValue([MIX_ITEM, rabbit, chicken]);
    const onPickFood = jest.fn();
    const onPickMix = jest.fn();
    const { findByLabelText } = render(
      <FoodPicker petId="p1" petName="Nyx" onPickFood={onPickFood} onPickMix={onPickMix} onAddNew={jest.fn()} />,
    );
    fireEvent.press(await findByLabelText('Mixed bowl, ⅓ Chicken Pâté + ⅔ Rabbit Pâté'));
    expect(onPickMix).toHaveBeenCalledWith(MIX);
    expect(onPickFood).not.toHaveBeenCalled();
  });

  it('a food fed only in the mix keeps its own plain tile', async () => {
    ROT.mockResolvedValue([MIX_ITEM, rabbit]);
    const onPickFood = jest.fn();
    const { findByLabelText } = render(
      <FoodPicker petId="p1" petName="Nyx" onPickFood={onPickFood} onPickMix={jest.fn()} onAddNew={jest.fn()} />,
    );
    fireEvent.press(await findByLabelText('Acme Rabbit Pâté'));
    expect(onPickFood).toHaveBeenCalledWith(rabbit);
  });

  it('no mix tile without onPickMix, or while picking a bowl’s second food', async () => {
    ROT.mockResolvedValue([MIX_ITEM, rabbit]);
    const plain = render(
      <FoodPicker petId="p1" petName="Nyx" onPickFood={jest.fn()} onAddNew={jest.fn()} />,
    );
    expect(await plain.findByLabelText('Acme Rabbit Pâté')).toBeTruthy();
    expect(plain.queryByLabelText(/Mixed bowl/)).toBeNull();
    plain.unmount();

    const second = render(
      <FoodPicker petId="p1" petName="Nyx" mixableOnly selectedFoodIds={['c1']}
        onPickFood={jest.fn()} onPickMix={jest.fn()} onAddNew={jest.fn()} />,
    );
    expect((await second.findAllByText('Rabbit Pâté')).length).toBeGreaterThan(0);
    expect(second.queryByLabelText(/Mixed bowl/)).toBeNull();
  });
});
