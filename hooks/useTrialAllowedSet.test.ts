// Wiring tests for useTrialAllowedSet (B-616 PR 1). The resolution itself is
// covered in lib/trialAllowedSet.test.ts; this pins the three things only the
// hook decides — and every one of them is a rule rather than plumbing:
//   • it starts at `unknown`, which the contract defines as RENDER NOTHING, so a
//     surface can never mark a food while the answer is still loading;
//   • it is scoped to the ACTIVE pet (D7) — pet A's trial marks nothing in pet
//     B's context, and switching pets re-resolves rather than carrying chrome
//     across;
//   • it re-reads on the hydration tick, which is what makes a mid-trial add (or
//     another device's) reach the Foods tab.

const mockLoad = jest.fn();
jest.mock('../lib/trialAllowedSet', () => {
  const actual = jest.requireActual('../lib/trialAllowedSet');
  return { ...actual, loadTrialAllowedSet: (petId: string) => mockLoad(petId) };
});

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTrialAllowedSet } from './useTrialAllowedSet';

// CUL-1297 — the hook takes a pet. The pre-existing cases drive it the way the
// Foods tab / Pet tab do: a caller that hands it the ACTIVE pet on every render.
function useActivePetTrialAllowedSet() {
  return useTrialAllowedSet(usePetStore((s) => s.activePet?.id ?? null));
}
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

const READY = { status: 'ready', trial: { id: 't-1' }, ctx: {}, foods: [] };

function selectPet(id: string | null): void {
  act(() => {
    // `pets` alongside `activePet`: the store's invariant, and what the hook resolves
    // a named id against (CUL-1297).
    const pet = id ? ({ id, name: 'Biscuit', species: 'dog' } as never) : null;
    usePetStore.setState({ activePet: pet, pets: pet ? [pet] : [] });
  });
}

beforeEach(() => {
  mockLoad.mockReset().mockResolvedValue(READY);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => usePetStore.setState({ activePet: null, pets: [] }));
});

describe('useTrialAllowedSet', () => {
  it('starts at `unknown` and resolves for the active pet', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialAllowedSet());

    // Before the read lands: nothing is known, so nothing may be marked.
    expect(result.current.status).toBe('unknown');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockLoad).toHaveBeenCalledWith('pet-1');
  });

  it('renders nothing when there is no active pet', async () => {
    selectPet(null);
    const { result } = renderHook(() => useActivePetTrialAllowedSet());
    expect(result.current).toEqual({ status: 'unknown' });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('D7 — re-resolves against the newly selected pet', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialAllowedSet());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Pet B has no trial: the chrome pet A's trial earned must not survive the
    // switch.
    mockLoad.mockResolvedValue({ status: 'no_trial' });
    selectPet('pet-2');
    await waitFor(() => expect(result.current.status).toBe('no_trial'));
    expect(mockLoad).toHaveBeenLastCalledWith('pet-2');
  });

  // The GAP, not just the destination. The read is async, so the test above —
  // which only asserts where the hook lands — passes just as happily while pet
  // A's chrome is drawn over pet B's context for the frames in between. On a
  // per-account food library that is the exact D7 leak, and PR 3 put three
  // visible surfaces behind this hook, so the window is now three surfaces wide.
  it('D7 — withholds pet A’s answer the INSTANT pet B is selected, not once the read lands', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialAllowedSet());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // A read that never resolves, so the only thing under test is what the hook
    // reports while it is in flight.
    mockLoad.mockReturnValue(new Promise(() => {}));
    selectPet('pet-2');
    expect(result.current.status).toBe('unknown');
  });

  // The counterpart, and the reason the fix is a render-time pairing rather than
  // a blanket reset: the tick fires on every sync cycle, and clearing on it would
  // flash the strip and every chip off and back on while the pet has not changed.
  it('does NOT blank the set on a hydration tick', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialAllowedSet());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    mockLoad.mockReturnValue(new Promise(() => {}));
    act(() => useSyncStore.getState().bumpHydrationTick());
    expect(result.current.status).toBe('ready');
  });

  it('re-reads on the hydration tick — a mid-trial add lands without a manual refresh', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialAllowedSet());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => useSyncStore.getState().bumpHydrationTick());
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  });

  it('falls back to `unreadable` rather than keeping a stale set', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialAllowedSet());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // A wrong mark is worse than no mark (R1): the previous answer is dropped. And
    // it is `unreadable`, not `unknown` (CUL-400): `unknown` is the spinner that
    // waits for an answer this read is not going to give.
    mockLoad.mockRejectedValue(new Error('db closed'));
    act(() => useSyncStore.getState().bumpHydrationTick());
    await waitFor(() => expect(result.current.status).toBe('unreadable'));
  });

  // CUL-1297 — the two-pet fixture: the NAMED pet's set, while the other pet is active.
  it('reads the pet it is handed, not the active one', async () => {
    const PET_A = { id: 'pet-a', name: 'Biscuit', species: 'dog' } as never;
    const PET_B = { id: 'pet-b', name: 'Mochi', species: 'cat' } as never;
    act(() => usePetStore.setState({ activePet: PET_A, pets: [PET_A, PET_B] }));
    const READY_B = { ...READY, trial: { id: 't-b' } };
    mockLoad.mockImplementation((petId: string) =>
      Promise.resolve(petId === 'pet-b' ? READY_B : READY),
    );

    const { result } = renderHook(() => useTrialAllowedSet('pet-b'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toBe(READY_B);
    expect(mockLoad).toHaveBeenCalledWith('pet-b');
    expect(mockLoad).not.toHaveBeenCalledWith('pet-a');
  });
});
