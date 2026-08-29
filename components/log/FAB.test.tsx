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

import { act, render, fireEvent } from '@testing-library/react-native';
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
