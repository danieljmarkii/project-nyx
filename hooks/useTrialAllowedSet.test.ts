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
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

const READY = { status: 'ready', trial: { id: 't-1' }, ctx: {}, foods: [] };

function selectPet(id: string | null): void {
  act(() => {
    usePetStore.setState({
      activePet: id ? ({ id, name: 'Biscuit', species: 'dog' } as never) : null,
    });
  });
}

beforeEach(() => {
  mockLoad.mockReset().mockResolvedValue(READY);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => usePetStore.setState({ activePet: null }));
});

describe('useTrialAllowedSet', () => {
  it('starts at `unknown` and resolves for the active pet', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useTrialAllowedSet());

    // Before the read lands: nothing is known, so nothing may be marked.
    expect(result.current.status).toBe('unknown');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockLoad).toHaveBeenCalledWith('pet-1');
  });

  it('renders nothing when there is no active pet', async () => {
    selectPet(null);
    const { result } = renderHook(() => useTrialAllowedSet());
    expect(result.current).toEqual({ status: 'unknown' });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('D7 — re-resolves against the newly selected pet', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useTrialAllowedSet());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Pet B has no trial: the chrome pet A's trial earned must not survive the
    // switch.
    mockLoad.mockResolvedValue({ status: 'no_trial' });
    selectPet('pet-2');
    await waitFor(() => expect(result.current.status).toBe('no_trial'));
    expect(mockLoad).toHaveBeenLastCalledWith('pet-2');
  });

  it('re-reads on the hydration tick — a mid-trial add lands without a manual refresh', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useTrialAllowedSet());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => useSyncStore.getState().bumpHydrationTick());
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  });

  it('falls back to `unknown` rather than keeping a stale set', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useTrialAllowedSet());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // A wrong mark is worse than no mark (R1): the previous answer is dropped.
    mockLoad.mockRejectedValue(new Error('db closed'));
    act(() => useSyncStore.getState().bumpHydrationTick());
    await waitFor(() => expect(result.current.status).toBe('unknown'));
  });
});
