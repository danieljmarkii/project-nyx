// The widget's pet link applies once per tap (CUL-1119), driven through the REAL hook
// over the REAL pet store. Both screen suites stub this hook to a no-op, which is how an
// always-on revert shipped unseen: a tap on Mochi's widget, a switch to Nyx with the
// FAB's chip, and the app quietly selected Mochi again, so the next log was Mochi's.

import { act, renderHook } from '@testing-library/react-native';
import { useWidgetPetLink } from './useWidgetPetLink';
import { usePetStore, type Pet } from '../store/petStore';
import { clearSpentTaps } from '../lib/spentTaps';

function makePet(id: string, name: string): Pet {
  return {
    id,
    name,
    species: 'cat',
    breed: null,
    date_of_birth: null,
    date_of_birth_precision: 'exact',
    sex: 'unknown',
    weight_kg: null,
    photo_path: null,
  };
}

const nyx = makePet('pet-nyx', 'Nyx');
const mochi = makePet('pet-mochi', 'Mochi');

const active = () => usePetStore.getState().activePet?.id ?? null;
const switchTo = (id: string) => act(() => usePetStore.getState().selectPet(id));

type Props = { pet: string | undefined; ts?: string };
const mount = (initialProps: Props) =>
  renderHook(({ pet, ts }: Props) => useWidgetPetLink(pet, ts), { initialProps });

/** Every change of the active pet, in order — counted, because an assertion on the end
 *  state cannot see a switch that fired twice (CUL-170). */
function recordSwitches(): { ids: (string | null)[]; stop: () => void } {
  const ids: (string | null)[] = [];
  const stop = usePetStore.subscribe((s, prev) => {
    if (s.activePet?.id !== prev.activePet?.id) ids.push(s.activePet?.id ?? null);
  });
  return { ids, stop };
}

beforeEach(() => {
  clearSpentTaps();
  usePetStore.setState({ pets: [nyx, mochi], activePet: nyx });
});

describe('useWidgetPetLink — once per tap (CUL-1119)', () => {
  it('a tap selects the widget\'s pet, and a later in-app switch sticks', () => {
    const { rerender } = mount({ pet: mochi.id, ts: 'T1' });
    expect(active()).toBe(mochi.id);

    // History stays mounted with the widget's params in place, so the screen re-renders
    // with the very same link after the owner switches.
    switchTo(nyx.id);
    rerender({ pet: mochi.id, ts: 'T1' });
    expect(active()).toBe(nyx.id);
  });

  it('the tap switches exactly once, and the owner\'s switch is never answered (C-22)', () => {
    const switches = recordSwitches();
    const { rerender } = mount({ pet: mochi.id, ts: 'T1' });
    switchTo(nyx.id);
    rerender({ pet: mochi.id, ts: 'T1' });
    switchTo(mochi.id);
    switchTo(nyx.id);
    rerender({ pet: mochi.id, ts: 'T1' });
    switches.stop();
    expect(switches.ids).toEqual([mochi.id, nyx.id, mochi.id, nyx.id]);
  });

  it('a new tap (a new nonce) applies again', () => {
    const { rerender } = mount({ pet: mochi.id, ts: 'T1' });
    switchTo(nyx.id);
    rerender({ pet: mochi.id, ts: 'T2' });
    expect(active()).toBe(mochi.id);
  });

  it('with no nonce (the log screen: the widget\'s log links carry none), once per mount', () => {
    const first = mount({ pet: mochi.id });
    expect(active()).toBe(mochi.id);
    switchTo(nyx.id);
    first.rerender({ pet: mochi.id });
    expect(active()).toBe(nyx.id);
    first.unmount();

    // The modal opens again from the widget: a new mount is a new tap.
    mount({ pet: mochi.id });
    expect(active()).toBe(mochi.id);
  });

  it('a cold start waits for the pet list rather than spending the tap on an empty one', () => {
    usePetStore.setState({ pets: [], activePet: null });
    const { rerender } = mount({ pet: mochi.id, ts: 'T1' });
    expect(active()).toBeNull();

    act(() => usePetStore.getState().setPets([nyx, mochi], nyx.id));
    expect(active()).toBe(mochi.id);

    switchTo(nyx.id);
    rerender({ pet: mochi.id, ts: 'T1' });
    expect(active()).toBe(nyx.id);
  });

  it('a pet list refresh (a rename) never re-applies a spent tap', () => {
    const { rerender } = mount({ pet: mochi.id, ts: 'T1' });
    switchTo(nyx.id);
    act(() => usePetStore.getState().patchPetById(mochi.id, { name: 'Mochi B' }));
    rerender({ pet: mochi.id, ts: 'T1' });
    expect(active()).toBe(nyx.id);
  });

  it('an unknown pet is ignored and spends the tap: it cannot fire later if the list gains it', () => {
    const stale = makePet('pet-archived', 'Biscuit');
    const { rerender } = mount({ pet: stale.id, ts: 'T1' });
    expect(active()).toBe(nyx.id);

    act(() => usePetStore.getState().addPet(stale));
    rerender({ pet: stale.id, ts: 'T1' });
    expect(active()).toBe(nyx.id);
  });

  it('a tap on the pet already active spends the tap too, so a later switch sticks', () => {
    const { rerender } = mount({ pet: nyx.id, ts: 'T1' });
    expect(active()).toBe(nyx.id);
    switchTo(mochi.id);
    rerender({ pet: nyx.id, ts: 'T1' });
    expect(active()).toBe(mochi.id);
  });

  it('no pet in the link does nothing', () => {
    mount({ pet: undefined, ts: 'T1' });
    expect(active()).toBe(nyx.id);
  });

  it('a tap spent by one mount is spent for the next: the History tab swaps screens when history_v2 flips (HV-11)', () => {
    const first = mount({ pet: mochi.id, ts: 'T1' });
    expect(active()).toBe(mochi.id);
    first.unmount();
    switchTo(nyx.id);
    // The other screen mounts over the same link.
    mount({ pet: mochi.id, ts: 'T1' });
    expect(active()).toBe(nyx.id);
  });

  it('without a nonce there is nothing to tell two taps apart by, so it stays once per mount (the log screen)', () => {
    const first = mount({ pet: mochi.id });
    expect(active()).toBe(mochi.id);
    first.unmount();
    switchTo(nyx.id);
    mount({ pet: mochi.id });
    expect(active()).toBe(mochi.id);
  });
});

