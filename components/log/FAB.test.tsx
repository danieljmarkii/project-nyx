// The FAB menu's pet switcher (CUL-678 · PM ruling D2 = i).
//
// The menu leads with a "Logging for {pet}" chip that opens the same switcher the
// Home header uses (multi-pet spec §3.3) — and unlike the log sheet, this surface
// is shipped and unflagged. It is a capture surface by the same test as the sheet:
// the rows beneath the chip write a meal in one press. So "Add a pet" here lands
// the owner back on a one-tap logging menu that is now about a different pet.
//
// This file pins only that: the chip's switcher is a capture host, and it is still
// the Modal wrapper (the FAB presents from the root — nothing is up when it opens,
// so the CUL-662 layer split does not apply here and must not be "tidied" into it).

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// momentStore reaches the sync layer, which fails fast without the client env.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({ getPublicUrl: () => null }));
jest.mock('../../lib/haptics', () => ({ openMenu: jest.fn() }));
jest.mock('../../lib/db', () => ({ getRecentFoods: jest.fn(async () => []) }));
jest.mock('../../lib/meals', () => ({ insertMeal: jest.fn() }));
jest.mock('../../lib/trialContaminant', () => ({
  evaluateMealLogTimeFlag: jest.fn(async () => null),
  noteTrialFlagShown: jest.fn(),
}));
// The log_picker_v2 two-gate pair. Both off: this file is about the FAB's own
// switcher, not the sheet it can open.
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => false }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => false }));
// Stubbed so its own tree (and its supabase edges) stay out of this file.
jest.mock('./EventTypeSheet', () => ({ EventTypeSheet: () => null }));

// The switcher is stubbed to report the props it was GIVEN. Rendering the real
// panel here would test the panel again; what only the FAB can answer is which
// kind of host it declares itself to be.
const mockSwitcherProps: Record<string, unknown>[] = [];
jest.mock('../pet/PetSwitcherSheet', () => ({
  PetSwitcherSheet: (props: Record<string, unknown>) => {
    mockSwitcherProps.push(props);
    const { Text } = require('react-native');
    return props.visible ? <Text>switcher-open</Text> : null;
  },
}));

import { TouchableOpacity } from 'react-native';
import { act, render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FAB } from './FAB';
import { usePetStore } from '../../store/petStore';

function seedPets(count: number) {
  const pets =
    count > 1
      ? [{ id: 'p1', name: 'Nyx' }, { id: 'p2', name: 'Mochi' }]
      : [{ id: 'p1', name: 'Nyx' }];
  usePetStore.setState({ pets: pets as never, activePet: { id: 'p1', name: 'Nyx' } as never });
}

/** Open the FAB menu, settling the recent-foods load its effect kicks off. */
async function openMenu() {
  const view = render(<FAB />);
  fireEvent.press(view.getByLabelText('Log event'));
  await act(async () => {});
  return view;
}

beforeEach(() => {
  mockSwitcherProps.length = 0;
  (router.push as jest.Mock).mockClear();
  seedPets(2);
});

describe('FAB — the "Logging for" switcher', () => {
  it('opens it as a capture host, so it carries no account management', async () => {
    const view = await openMenu();
    fireEvent.press(view.getByLabelText('Logging for Nyx — switch pet'));

    expect(view.getByText('switcher-open')).toBeTruthy();
    const open = mockSwitcherProps.filter((p) => p.visible);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((p) => p.captureSurface === true)).toBe(true);
  });

  // Not a stylistic preference — the FAB menu is an in-tree overlay, not a Modal, so
  // nothing is presented when the switcher opens and the wrapper is correct here.
  // The layer split exists for hosts that ARE a Modal (EventTypeSheet); using it
  // here would give the switcher no presentation at all.
  it('still uses the Modal wrapper, not the in-Modal layer', async () => {
    await openMenu();
    expect(mockSwitcherProps.length).toBeGreaterThan(0);
    expect(mockSwitcherProps.every((p) => p.animated === undefined)).toBe(true);
  });

  // §7.8 — single-pet households see no multi-pet chrome, so there is no switcher to
  // classify. A regression guard: it passes before and after, and it is here because
  // the capture rule must not become a reason to render the chip.
  it('renders no chip at all for a one-pet household', async () => {
    seedPets(1);
    const view = await openMenu();
    expect(view.queryByLabelText('Logging for Nyx — switch pet')).toBeNull();
  });
});

// ── CUL-717 — the menu with no pet to log for ────────────────────────────────
//
// Same defect and same ruled shape as CUL-681 one layer down: with no activePet
// the rows either wrote nothing and said nothing (a recent-food tap did not even
// show its spinner) or pushed into /log, which is gated on a pet it does not
// have. The gate is that the rows do not render, so there is nothing to tap.
//
// These are GUARDS: every one was run against the pre-fix tree and confirmed red
// before being trusted green (CUL-613). The two marked as regression guards are
// the opposite direction — they must pass before AND after, because their job is
// to pin behaviour the gate must not break.

const { getRecentFoods } = require('../../lib/db') as { getRecentFoods: jest.Mock };

/** A signed-in session whose pets read has not answered yet — the common cause. */
function seedNoPets() {
  usePetStore.setState({ pets: [] as never, activePet: null as never });
}

/** Every row the menu offers when it has a pet. */
const ACTION_ROWS = ['Log food', 'Vomit', 'Loose stool', 'More events'];

describe('FAB — no pet to log for', () => {
  it('offers no row to tap, and says why instead', async () => {
    seedNoPets();
    const view = await openMenu();

    expect(view.getByText('No pet to log for yet')).toBeTruthy();
    for (const row of ACTION_ROWS) expect(view.queryByText(row)).toBeNull();
    // The "Recent foods" header goes too — a section head over nothing is the
    // menu still claiming to be a logging menu.
    expect(view.queryByText('Recent foods')).toBeNull();
  });

  it('takes the recent-food rows with it when the pet goes', async () => {
    // The discriminating case. Opening with NO pet never loads foods (the effect
    // is gated on one), so an empty menu proves nothing on its own — the rows
    // have to exist first. Open with a pet, let the foods land, then lose the
    // store: pre-fix the row stayed on screen and a tap on it was the silent
    // no-op this issue was filed for.
    getRecentFoods.mockResolvedValueOnce([
      { id: 'f1', brand: 'Hills', product_name: 'i/d', format: 'wet', food_type: 'meal' },
    ]);
    const view = await openMenu();
    expect(view.getByText(/Hills/)).toBeTruthy();

    await act(async () => { seedNoPets(); });

    expect(view.queryByText(/Hills/)).toBeNull();
    expect(view.getByText('No pet to log for yet')).toBeTruthy();
  });

  it('leaves no door open — the menu holds no touchable but the FAB', async () => {
    // The structural form of the claim above, and the one that survives a row
    // being ADDED to this menu later without its author reading this file: not
    // "these four labels are absent" but "nothing here is pressable".
    //
    // Its first draft asserted the switcher chip was absent and router.push
    // uncalled — and it PASSED against the pre-fix tree, so it discriminated
    // nothing (CUL-613). Both halves were already true for other reasons: the
    // chip self-suppressed on `pets.length > 1 && activePet` (which is exactly
    // what made the old menu silently pet-less rather than saying so), and
    // router.push cannot fire in a test that presses nothing.
    seedNoPets();
    const view = await openMenu();

    // Pre-fix this was 5 — Log food, Vomit, Loose stool, More events, and the
    // FAB. Only the FAB is a way OUT rather than a way in.
    const touchables = view.UNSAFE_queryAllByType(TouchableOpacity);
    expect(touchables).toHaveLength(1);
    expect(touchables[0].props.accessibilityLabel).toBe('Close menu');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('replaces the copy with the rows the moment the pets land — no reopen', async () => {
    // A guard, not a regression guard, despite reading like one: it opens on the
    // copy, which only exists post-fix. The claim is the reactive direction —
    // the branch re-evaluates, so an owner who opened the menu inside the
    // hydration window watches it fill in rather than having to close and reopen
    // it. That is most of why gating the RENDER is the right shape here and a
    // one-shot alert would not be.
    seedNoPets();
    const view = await openMenu();
    expect(view.getByText('No pet to log for yet')).toBeTruthy();

    await act(async () => { seedPets(1); });

    expect(view.queryByText('No pet to log for yet')).toBeNull();
    for (const row of ACTION_ROWS) expect(view.getByText(row)).toBeTruthy();
  });

  it('still opens on the FAB, which is deliberately not gated', async () => {
    // Regression guard — it must pass BEFORE and after, which is why it asserts
    // only the opening and not the copy. Its first draft asserted both and so
    // went red pre-fix: a mixed test cannot tell a preserved behaviour from a
    // changed one, and the copy is test 1's claim anyway.
    //
    // The button stays ungated on purpose: a missing FAB is the app looking
    // broken in a different way, and the menu it opens is the thing that
    // explains itself (Principle 5). The label flipping to 'Close menu' is the
    // menu being open — and the way back out of it.
    seedNoPets();
    const view = await openMenu();

    expect(view.getByLabelText('Close menu')).toBeTruthy();
  });
});
