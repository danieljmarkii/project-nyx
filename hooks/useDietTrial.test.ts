// B-544 — the hook behind BOTH diet-trial surfaces (the Pet-tab card and the Home
// strip), and the place the B-534 staleness bug lived.
//
// The bug: the Pet tab and Home each mount their OWN `useDietTrial`, but only the
// Pet tab's instance got the host's `reload()` after a write. So ending, extending
// or starting a trial from the Pet tab left the Home strip rendering the OLD trial
// until the next sync cycle happened to bump the tick. The fix wired every trial
// write to `bumpHydrationTick`, and this hook already re-reads on `hydrationTick`
// (it is how another device's meals reach the card) — so the guarantee that has to
// hold, and is pinned below, is: **a hydration-tick bump re-reads, even though this
// instance's own `reload()` was never called.** That is the connective tissue a
// value test over `dietTrialFacts` cannot cover, and it regressed silently once.

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDietTrial } from './useDietTrial';
import { loadDietTrialFacts } from '../lib/dietTrialFacts';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';

// Only the read is stubbed; the two zustand stores are real, because the wiring
// under test IS the hook's reaction to their state (activePet + hydrationTick).
jest.mock('../lib/dietTrialFacts', () => ({ loadDietTrialFacts: jest.fn() }));

const mockedLoad = loadDietTrialFacts as jest.Mock;

const PET = {
  id: 'pet-1',
  name: 'Pixel',
  species: 'cat',
  breed: null,
  date_of_birth: null,
  date_of_birth_precision: 'exact',
  sex: 'unknown',
  weight_kg: null,
  photo_path: null,
} as const;

// Two distinct sentinels — identity is what the re-read assertions turn on.
const FACTS_A = { tag: 'A' } as never;
const FACTS_B = { tag: 'B' } as never;

beforeEach(() => {
  jest.clearAllMocks();
  useSyncStore.setState({ hydrationTick: 0 });
  usePetStore.setState({ pets: [PET], activePet: PET });
  mockedLoad.mockResolvedValue(FACTS_A);
});

describe('useDietTrial', () => {
  it('loads the active pet’s trial facts and exposes them', async () => {
    const { result } = renderHook(() => useDietTrial());

    await waitFor(() => expect(result.current.input).toBe(FACTS_A));
    expect(result.current.isLoading).toBe(false);
    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(mockedLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        pet: expect.objectContaining({ id: 'pet-1', name: 'Pixel', species: 'cat' }),
        otherPetNames: [],
      }),
    );
  });

  // THE B-534 REGRESSION GUARD. A trial write on another surface bumps the shared
  // hydration tick; this instance must re-read even though nobody called its own
  // reload(). Before the fix, Home's strip stayed on the pre-write trial.
  it('re-reads when the shared hydration tick bumps, without its own reload()', async () => {
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValueOnce(FACTS_A).mockResolvedValueOnce(FACTS_B);

    const { result } = renderHook(() => useDietTrial());
    await waitFor(() => expect(result.current.input).toBe(FACTS_A));

    // Exactly what a trial write does via `notifyTrialChanged` — no reload() here.
    act(() => useSyncStore.getState().bumpHydrationTick());

    await waitFor(() => expect(result.current.input).toBe(FACTS_B));
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('re-reads when the caller invokes reload()', async () => {
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValueOnce(FACTS_A).mockResolvedValueOnce(FACTS_B);

    const { result } = renderHook(() => useDietTrial());
    await waitFor(() => expect(result.current.input).toBe(FACTS_A));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.input).toBe(FACTS_B));
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('clears the input and stops loading when there is no active pet', async () => {
    usePetStore.setState({ pets: [], activePet: null });

    const { result } = renderHook(() => useDietTrial());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.input).toBeNull();
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  // A total read failure must LEAVE THE PREVIOUS INPUT IN PLACE rather than flash an
  // empty state — the hook's own comment: "never a claim, in either direction".
  it('keeps the last-good input on a read failure and logs, never flashing empty', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValueOnce(FACTS_A).mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useDietTrial());
    await waitFor(() => expect(result.current.input).toBe(FACTS_A));

    act(() => useSyncStore.getState().bumpHydrationTick());

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(result.current.input).toBe(FACTS_A); // unchanged — no empty flash
    errorSpy.mockRestore();
  });
});
