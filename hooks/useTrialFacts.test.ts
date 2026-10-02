// Wiring tests for useTrialFacts (B-616 PR 4). The facts themselves are covered in
// lib/dietTrial.test.ts and the rendering in lib/trialExposuresScreen.test.ts; this
// pins the three things only the hook decides, and each is a rule rather than
// plumbing:
//   • the three states stay APART — `unknown` (still reading, or a read that
//     threw), `no_trial` (something the app knows) and `ready` with null facts (a
//     trial whose record could not be read). Collapsing any pair of them is how an
//     unreadable record renders as an empty exposures list, which is a fabricated
//     all-clear;
//   • it is scoped to the ACTIVE pet, resolved during render, so pet A's exposures
//     are never drawn under pet B's name;
//   • it re-reads on the hydration tick, so a feeding logged on another device
//     reaches the list.

const mockLoad = jest.fn();
jest.mock('../lib/dietTrialFacts', () => ({
  loadTrialPredicateFacts: (...args: unknown[]) => mockLoad(...args),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTrialFacts, type TrialFactsRead, type TrialFactsState } from './useTrialFacts';

// CUL-1297 — the hook takes a pet. The pre-existing cases drive it the way the
// Foods tab / Pet tab do: a caller that hands it the ACTIVE pet on every render.
function useActivePetTrialFacts() {
  return useTrialFacts(usePetStore((s) => s.activePet?.id ?? null));
}
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import type { TrialFacts } from '../lib/dietTrial';

const FACTS = { range: { startDayIndex: 1 } } as unknown as TrialFacts;

/** The state without the hook's `reload` (CUL-1336), so an answer is compared exactly. */
function stateOf(read: TrialFactsRead): TrialFactsState {
  const { reload: _reload, ...state } = read;
  return state as TrialFactsState;
}

function selectPet(id: string | null): void {
  act(() => {
    // `pets` alongside `activePet`: the store's invariant, and what the hook resolves
    // a named id against (CUL-1297).
    const pet = id ? ({ id, name: 'Biscuit', species: 'dog' } as never) : null;
    usePetStore.setState({ activePet: pet, pets: pet ? [pet] : [] });
  });
}

beforeEach(() => {
  mockLoad.mockReset().mockResolvedValue({ trial: {}, stoppedForRefusal: false, facts: FACTS });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => usePetStore.setState({ activePet: null, pets: [] }));
});

describe('useTrialFacts', () => {
  it('starts at `unknown` and resolves for the active pet', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialFacts());

    expect(result.current.status).toBe('unknown');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 'pet-1' }));
  });

  it('reports no trial as a fact the app knows, distinct from an unread one', async () => {
    mockLoad.mockResolvedValue(null);
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialFacts());
    await waitFor(() => expect(result.current.status).toBe('no_trial'));
  });

  // A TRIAL WHOSE RECORD COULD NOT BE READ IS NOT A CLEAN ONE. The loader returns
  // `facts: null` when any of the four predicate inputs failed, and the screen
  // renders that as a spinner rather than an empty list.
  it('keeps `ready` with null facts apart from `no_trial`', async () => {
    mockLoad.mockResolvedValue({ trial: {}, stoppedForRefusal: false, facts: null });
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialFacts());
    await waitFor(() => expect(stateOf(result.current)).toEqual({ status: 'ready', facts: null }));
  });

  it('never fabricates a no-trial answer out of a failed read', async () => {
    mockLoad.mockRejectedValue(new Error('db closed'));
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialFacts());
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(stateOf(result.current)).toEqual({ status: 'unknown' });
  });

  it('withholds the previous pet’s answer the instant the pet changes', async () => {
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialFacts());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // The next read has not landed yet — and the render that happens right now
    // must not carry pet-1's exposures into pet-2's context.
    mockLoad.mockReturnValue(new Promise(() => {}));
    selectPet('pet-2');
    expect(stateOf(result.current)).toEqual({ status: 'unknown' });
  });

  it('re-reads when a sync cycle hydrates new events', async () => {
    selectPet('pet-1');
    renderHook(() => useActivePetTrialFacts());
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));

    act(() => useSyncStore.setState({ hydrationTick: 1 }));
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  });

  it('reads nothing when there is no active pet', () => {
    selectPet(null);
    const { result } = renderHook(() => useActivePetTrialFacts());
    expect(stateOf(result.current)).toEqual({ status: 'unknown' });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  // CUL-1297 — the two-pet fixture: the NAMED pet's facts, while the other pet is active.
  it('reads the pet it is handed, not the active one', async () => {
    const PET_A = { id: 'pet-a', name: 'Biscuit', species: 'dog' } as never;
    const PET_B = { id: 'pet-b', name: 'Mochi', species: 'cat' } as never;
    act(() => usePetStore.setState({ activePet: PET_A, pets: [PET_A, PET_B] }));
    const FACTS_B = { range: { startDayIndex: 9 } } as unknown as TrialFacts;
    mockLoad.mockImplementation((pet: { id: string }) =>
      Promise.resolve({ trial: {}, stoppedForRefusal: false, facts: pet.id === 'pet-b' ? FACTS_B : FACTS }),
    );

    const { result } = renderHook(() => useTrialFacts('pet-b'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(stateOf(result.current)).toEqual({ status: 'ready', facts: FACTS_B });
    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 'pet-b', name: 'Mochi', species: 'cat' }));
    expect(mockLoad).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'pet-a' }));
  });

  // CUL-1336 — the trial screen's *Try again* over a failed read, and its re-read on coming
  // back from a list edit.
  describe('reload', () => {
    it('re-reads on demand, and a retry that answers replaces the failure', async () => {
      mockLoad.mockRejectedValueOnce(new Error('db closed'));
      selectPet('pet-1');
      const { result } = renderHook(() => useActivePetTrialFacts());
      await waitFor(() => expect(result.current.status).toBe('unreadable'));
      expect(mockLoad).toHaveBeenCalledTimes(1);

      act(() => result.current.reload());
      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('keeps the last answer on screen while the re-read runs', async () => {
      selectPet('pet-1');
      const { result } = renderHook(() => useActivePetTrialFacts());
      await waitFor(() => expect(result.current.status).toBe('ready'));
      mockLoad.mockReturnValue(new Promise(() => {}));
      act(() => result.current.reload());
      expect(mockLoad).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe('ready');
    });

    it('is stable across renders, so a focus callback keyed on it does not re-fire', async () => {
      selectPet('pet-1');
      const { result, rerender } = renderHook(() => useActivePetTrialFacts());
      const first = result.current.reload;
      await waitFor(() => expect(result.current.status).toBe('ready'));
      rerender({});
      expect(result.current.reload).toBe(first);
    });
  });

  // CUL-1336 — the facts say which trial they are for, so a consumer pairing them with
  // another read's trial can refuse a mismatch instead of trusting the pet key.
  it('labels a ready answer with the trial it was computed for', async () => {
    mockLoad.mockResolvedValue({ trial: { id: 'trial-9' }, stoppedForRefusal: false, facts: FACTS });
    selectPet('pet-1');
    const { result } = renderHook(() => useActivePetTrialFacts());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(stateOf(result.current)).toEqual({ status: 'ready', trialId: 'trial-9', facts: FACTS });
  });
});
