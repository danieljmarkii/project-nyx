// EventTypeSheet is the flag-on "More events" destination — the grouped picker as a
// bottom sheet that routes into the EXISTING /log sub-flows (presentation only). The
// core behaviour to pin is the routing: each tile hands off to /log?type=, the split
// Stool segments route to the two event types the deleted sub-step used, and the
// sheet closes on select. The nested PetSwitcherSheet is stubbed at its data edges.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// PetSwitcherSheet (nested) reaches supabase + storage at its edges; stub both so the
// test stays about the sheet, not the switcher's data reads.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({ getPublicUrl: () => null }));

import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { EventTypeSheet } from './EventTypeSheet';
import { usePetStore } from '../../store/petStore';

function seedPets(count: number) {
  const pets =
    count > 1
      ? [{ id: 'p1', name: 'Nyx' }, { id: 'p2', name: 'Mochi' }]
      : [{ id: 'p1', name: 'Nyx' }];
  usePetStore.setState({ pets: pets as never, activePet: { id: 'p1', name: 'Nyx' } as never });
}

describe('EventTypeSheet', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    seedPets(1);
  });

  it('titles the sheet for the active pet', () => {
    const { getByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(getByText('Log for Nyx')).toBeTruthy();
  });

  it('routes a symptom tile into the existing sub-flow and closes the sheet', () => {
    const onClose = jest.fn();
    const { getByText } = render(<EventTypeSheet visible onClose={onClose} />);
    fireEvent.press(getByText('Vomit'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/log?type=vomit');
  });

  it('routes the split Stool segments to stool_normal / diarrhea (the deleted sub-step, inlined)', () => {
    const { getByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(getByText('Normal'));
    expect(router.push).toHaveBeenLastCalledWith('/log?type=stool_normal');
    fireEvent.press(getByText('Loose'));
    expect(router.push).toHaveBeenLastCalledWith('/log?type=diarrhea');
  });

  it('routes Meal and Weight to their own sub-flows', () => {
    const { getByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(getByText('Meal'));
    expect(router.push).toHaveBeenLastCalledWith('/log?type=meal');
    fireEvent.press(getByText('Weight'));
    expect(router.push).toHaveBeenLastCalledWith('/log?type=weight_check');
  });

  it('shows the pet-switcher affordance only for multi-pet households', () => {
    const single = render(<EventTypeSheet visible onClose={jest.fn()} />);
    // Single pet: the title is a plain, non-interactive heading (no switch label).
    expect(single.queryByLabelText('Log for Nyx — switch pet')).toBeNull();
    single.unmount();

    seedPets(2);
    const multi = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(multi.getByLabelText('Log for Nyx — switch pet')).toBeTruthy();
  });
});
