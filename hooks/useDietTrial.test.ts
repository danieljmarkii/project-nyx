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

// CUL-13 — the hook now resolves the `signals_v2` two-gate flag to decide whether to compute the
// strip's standing line. Mock both hooks (default off) so this suite neither pulls in their real
// module chain (appConfig → supabase, which throws without env) nor changes what it asserts — the
// existing call-arg checks use objectContaining, so the added `signalsV2` key rides along harmlessly.
jest.mock('../hooks/useAppConfig', () => ({ useAllowlistFlag: jest.fn(() => false) }));
jest.mock('../lib/betaFeatures', () => ({ useBetaOptIn: jest.fn(() => false) }));

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

  // B-789 — the fail-closed freshness signal. `input` is retained across a switch and a failed
  // reload (so the strip never flashes empty), so a consumer that must suppress a reassuring card
  // over a not-eating cat cannot trust a non-null `input`; `inputIsForActivePet` is the flag it
  // reads instead.
  it('B-789 — inputIsForActivePet is false until the active pet’s facts load, then true', async () => {
    const { result } = renderHook(() => useDietTrial());
    // Before the async load resolves, the retained input is null and reported not-for-active-pet.
    expect(result.current.inputIsForActivePet).toBe(false);
    await waitFor(() => expect(result.current.input).toBe(FACTS_A));
    expect(result.current.inputIsForActivePet).toBe(true);
  });

  it('B-789 — inputIsForActivePet goes false across a pet switch until the new pet’s facts load', async () => {
    const PET2 = { ...PET, id: 'pet-2', name: 'Mochi' } as const;
    mockedLoad.mockReset();
    // Gate the second load so the switch window is observable: input retained (FACTS_A), but stale.
    let resolveB: (v: unknown) => void = () => {};
    mockedLoad
      .mockResolvedValueOnce(FACTS_A)
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r; }));

    const { result } = renderHook(() => useDietTrial());
    await waitFor(() => expect(result.current.inputIsForActivePet).toBe(true));

    // Switch pets — the hook holds the OLD input while the new load is in flight, but the flag must
    // report it stale so the B-789 consumer fails closed (never a reassuring card over the new pet).
    act(() => usePetStore.setState({ pets: [PET2], activePet: PET2 }));
    await waitFor(() => expect(result.current.inputIsForActivePet).toBe(false));
    expect(result.current.input).toBe(FACTS_A); // retained (no empty flash), but reported stale

    // Once the new pet’s facts land, it is fresh again.
    act(() => resolveB(FACTS_B));
    await waitFor(() => expect(result.current.input).toBe(FACTS_B));
    expect(result.current.inputIsForActivePet).toBe(true);
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
