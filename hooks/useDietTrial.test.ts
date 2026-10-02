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
// CUL-548 (Signals-v2 GA): the hook no longer reads a beta flag — it always passes
// `signalsV2: true` (the loader still gates the extra read on `isTrialRunning`), so no
// flag mocks are needed here any more.
jest.mock('../lib/dietTrialFacts', () => ({ loadDietTrialFacts: jest.fn() }));

const mockedLoad = loadDietTrialFacts as jest.Mock;

// CUL-1297 — the hook takes a pet. Home and the Pet tab hand it the ACTIVE pet's id, so
// the pre-existing cases below drive it exactly that way: a caller that re-reads the
// store on every render, which is what makes a pet switch reach the hook.
function useActivePetDietTrial() {
  return useDietTrial(usePetStore((s) => s.activePet?.id ?? null));
}

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
    const { result } = renderHook(() => useActivePetDietTrial());

    await waitFor(() => expect(result.current.input).toBe(FACTS_A));
    expect(result.current.isLoading).toBe(false);
    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(mockedLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        pet: expect.objectContaining({ id: 'pet-1', name: 'Pixel', species: 'cat' }),
        otherPetNames: [],
        // CUL-548 — the client no longer gates the standing vomit-count line; it always
        // asks the loader to compute it (the loader still gates on the trial being live).
        signalsV2: true,
        // CUL-1297 — the hook opts into the rejection its `unreadable` status needs.
        rethrowUnreadable: true,
      }),
    );
  });

  // THE B-534 REGRESSION GUARD. A trial write on another surface bumps the shared
  // hydration tick; this instance must re-read even though nobody called its own
  // reload(). Before the fix, Home's strip stayed on the pre-write trial.
  it('re-reads when the shared hydration tick bumps, without its own reload()', async () => {
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValueOnce(FACTS_A).mockResolvedValueOnce(FACTS_B);

    const { result } = renderHook(() => useActivePetDietTrial());
    await waitFor(() => expect(result.current.input).toBe(FACTS_A));

    // Exactly what a trial write does via `notifyTrialChanged` — no reload() here.
    act(() => useSyncStore.getState().bumpHydrationTick());

    await waitFor(() => expect(result.current.input).toBe(FACTS_B));
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('re-reads when the caller invokes reload()', async () => {
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValueOnce(FACTS_A).mockResolvedValueOnce(FACTS_B);

    const { result } = renderHook(() => useActivePetDietTrial());
    await waitFor(() => expect(result.current.input).toBe(FACTS_A));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.input).toBe(FACTS_B));
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('clears the input and stops loading when there is no active pet', async () => {
    usePetStore.setState({ pets: [], activePet: null });

    const { result } = renderHook(() => useActivePetDietTrial());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.input).toBeNull();
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  // B-789 — the fail-closed freshness signal. `input` is retained across a switch and a failed
  // reload (so the strip never flashes empty), so a consumer that must suppress a reassuring card
  // over a not-eating cat cannot trust a non-null `input`; `inputIsForPet` is the flag it
  // reads instead.
  it('B-789 — inputIsForPet is false until the active pet’s facts load, then true', async () => {
    const { result } = renderHook(() => useActivePetDietTrial());
    // Before the async load resolves, the retained input is null and reported not-for-active-pet.
    expect(result.current.inputIsForPet).toBe(false);
    await waitFor(() => expect(result.current.input).toBe(FACTS_A));
    expect(result.current.inputIsForPet).toBe(true);
  });

  it('B-789 — inputIsForPet goes false across a pet switch until the new pet’s facts load', async () => {
    const PET2 = { ...PET, id: 'pet-2', name: 'Mochi' } as const;
    mockedLoad.mockReset();
    // Gate the second load so the switch window is observable: input retained (FACTS_A), but stale.
    let resolveB: (v: unknown) => void = () => {};
    mockedLoad
      .mockResolvedValueOnce(FACTS_A)
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r; }));

    const { result } = renderHook(() => useActivePetDietTrial());
    await waitFor(() => expect(result.current.inputIsForPet).toBe(true));

    // Switch pets — the hook holds the OLD input while the new load is in flight, but the flag must
    // report it stale so the B-789 consumer fails closed (never a reassuring card over the new pet).
    act(() => usePetStore.setState({ pets: [PET2], activePet: PET2 }));
    await waitFor(() => expect(result.current.inputIsForPet).toBe(false));
    expect(result.current.input).toBe(FACTS_A); // retained (no empty flash), but reported stale
    // TS-5 (CUL-1301): the pet that retained input belongs to, which Home's door opens.
    expect(result.current.loadedPetId).toBe(PET.id);

    // Once the new pet’s facts land, it is fresh again.
    act(() => resolveB(FACTS_B));
    await waitFor(() => expect(result.current.input).toBe(FACTS_B));
    expect(result.current.inputIsForPet).toBe(true);
    expect(result.current.loadedPetId).toBe('pet-2');
  });

  // A total read failure must LEAVE THE PREVIOUS INPUT IN PLACE rather than flash an
  // empty state — the hook's own comment: "never a claim, in either direction".
  it('keeps the last-good input on a read failure and logs, never flashing empty', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValueOnce(FACTS_A).mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useActivePetDietTrial());
    await waitFor(() => expect(result.current.input).toBe(FACTS_A));

    act(() => useSyncStore.getState().bumpHydrationTick());

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(result.current.input).toBe(FACTS_A); // unchanged — no empty flash
    errorSpy.mockRestore();
  });

  // ── CUL-1297 — the hook reads the pet it is HANDED ────────────────────────
  describe('CUL-1297 — a named pet, and a status', () => {
    const PET_B = { ...PET, id: 'pet-b', name: 'Mochi', species: 'dog' } as const;

    it('reads the NAMED pet while another pet is active, and names the others as its household', async () => {
      usePetStore.setState({ pets: [PET, PET_B], activePet: PET });
      mockedLoad.mockResolvedValue(FACTS_B);

      const { result } = renderHook(() => useDietTrial('pet-b'));

      await waitFor(() => expect(result.current.status).toBe('loaded'));
      expect(result.current.input).toBe(FACTS_B);
      expect(result.current.inputIsForPet).toBe(true);
      expect(mockedLoad).toHaveBeenCalledTimes(1);
      expect(mockedLoad).toHaveBeenCalledWith(
        expect.objectContaining({
          pet: expect.objectContaining({ id: 'pet-b', name: 'Mochi', species: 'dog' }),
          otherPetNames: ['Pixel'],
        }),
      );
      // The active pet is still the other one; the hook never switched it.
      expect(usePetStore.getState().activePet?.id).toBe('pet-1');
    });

    it('is `loading` until the first answer, then `loaded`', async () => {
      let resolve: (v: unknown) => void = () => {};
      mockedLoad.mockReset();
      mockedLoad.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));

      const { result } = renderHook(() => useDietTrial('pet-1'));
      expect(result.current.status).toBe('loading');

      act(() => resolve(FACTS_A));
      await waitFor(() => expect(result.current.status).toBe('loaded'));
    });

    // C-12 / S9 — the defect this status exists for: a cold read that throws must be
    // distinguishable from "no trial" (a loaded input whose trial is null).
    it('a failed cold load is `unreadable`, never a loaded "no trial"', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockedLoad.mockReset();
      mockedLoad.mockRejectedValueOnce(new Error('database is locked'));

      const { result } = renderHook(() => useDietTrial('pet-1'));

      await waitFor(() => expect(result.current.status).toBe('unreadable'));
      expect(result.current.input).toBeNull();
      expect(result.current.inputIsForPet).toBe(false);
      errorSpy.mockRestore();
    });

    it('recovers from `unreadable` on reload', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockedLoad.mockReset();
      mockedLoad.mockRejectedValueOnce(new Error('database is locked')).mockResolvedValueOnce(FACTS_A);

      const { result } = renderHook(() => useDietTrial('pet-1'));
      await waitFor(() => expect(result.current.status).toBe('unreadable'));

      act(() => result.current.reload());
      await waitFor(() => expect(result.current.status).toBe('loaded'));
      expect(result.current.input).toBe(FACTS_A);
      errorSpy.mockRestore();
    });

    it('a failed RE-read of a pet that already answered stays `loaded` on the last good input', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockedLoad.mockReset();
      mockedLoad.mockResolvedValueOnce(FACTS_A).mockRejectedValueOnce(new Error('offline'));

      const { result } = renderHook(() => useDietTrial('pet-1'));
      await waitFor(() => expect(result.current.status).toBe('loaded'));

      act(() => useSyncStore.getState().bumpHydrationTick());
      await waitFor(() => expect(errorSpy).toHaveBeenCalled());
      expect(result.current.status).toBe('loaded');
      expect(result.current.input).toBe(FACTS_A);
      errorSpy.mockRestore();
    });

    it('an id the account does not hold is `no_pet` and reads nothing', async () => {
      const { result } = renderHook(() => useDietTrial('pet-archived'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.status).toBe('no_pet');
      expect(result.current.input).toBeNull();
      expect(mockedLoad).not.toHaveBeenCalled();
    });

    it('switching the NAMED pet reports the new pet as loading, never the old pet’s answer as loaded', async () => {
      usePetStore.setState({ pets: [PET, PET_B], activePet: PET });
      let resolveB: (v: unknown) => void = () => {};
      mockedLoad.mockReset();
      mockedLoad
        .mockResolvedValueOnce(FACTS_A)
        .mockImplementationOnce(() => new Promise((r) => { resolveB = r; }));

      const { result, rerender } = renderHook(({ id }: { id: string }) => useDietTrial(id), {
        initialProps: { id: 'pet-1' },
      });
      await waitFor(() => expect(result.current.status).toBe('loaded'));

      rerender({ id: 'pet-b' });
      // Derived during render: no frame reports pet A's facts as pet B's.
      expect(result.current.status).toBe('loading');
      expect(result.current.inputIsForPet).toBe(false);

      act(() => resolveB(FACTS_B));
      await waitFor(() => expect(result.current.status).toBe('loaded'));
      expect(result.current.input).toBe(FACTS_B);
    });
  });
});
