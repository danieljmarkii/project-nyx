import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSignal } from './useSignal';
import { usePetStore } from '../store/petStore';
import { useSignalMarkStore } from '../store/signalMarkStore';
import { readSignalCache, isSignalCacheStale, regenerateSignal } from '../lib/signal';
import type { CachedFinding } from '../lib/signal';

// Multi-pet safety regression (code-reviewed on B-284 PR N2): a naive "read
// petId from one store, findings from another hook's state" pairing can, on a
// pet SWITCH, momentarily pair the NEW pet's id with the PREVIOUS pet's still-
// cached findings — writing the wrong pet's finding signature into the wrong
// pet's `seenSignatures` entry. useSignal's render-time reset (a ref-compared
// setState call in the render body, not an effect) is what closes that window;
// this pins that `findings` is ALREADY cleared in the very render that observes
// the new petId, before any async re-fetch has had a chance to run.

// useFocusEffect needs a real navigation context this bare renderHook doesn't
// provide; mirror its actual contract (run the effect while "focused", re-run
// when the memoized callback identity changes) with a plain useEffect. The
// hook already wraps its callback in useCallback keyed on [petId, signalTick],
// so this preserves the real re-run timing relative to the render-time reset.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

jest.mock('../lib/db', () => ({
  getDb: () => ({
    getAllSync: jest.fn().mockReturnValue([{ total: 0, recent: 0, earliest: null }]),
  }),
}));

jest.mock('../lib/signal', () => ({
  readSignalCache: jest.fn(),
  isSignalCacheStale: jest.fn(),
  regenerateSignal: jest.fn(),
  readSignalsAndRefresh: jest.fn(),
}));

const mockedReadCache = readSignalCache as jest.Mock;
const mockedIsStale = isSignalCacheStale as jest.Mock;
const mockedRegenerate = regenerateSignal as jest.Mock;

const finding: CachedFinding = {
  rank: 0,
  text: 'placeholder',
  finding: {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 9,
  },
};

const PET_A = { id: 'pet-a', name: 'Nyx' } as any;
const PET_B = { id: 'pet-b', name: 'Mochi' } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockedIsStale.mockReturnValue(false);
  mockedRegenerate.mockResolvedValue({ error: null });
  usePetStore.setState({ pets: [PET_A, PET_B], activePet: PET_A });
  useSignalMarkStore.setState({ seenSignatures: {} });
});

describe('useSignal — pet-switch multi-pet safety', () => {
  it('clears findings in the SAME render that observes the new petId, before the async re-fetch resolves', async () => {
    mockedReadCache.mockImplementation(
      async (petId: string) =>
        petId === PET_A.id
          ? { signalText: null, isBuilding: false, findings: [finding], coverage: [], expiresAt: '2999-01-01' }
          : null, // pet B's fetch simply hasn't resolved yet in this test
    );

    const { result } = renderHook(() => useSignal());
    await waitFor(() => expect(result.current.findings).toEqual([finding]));
    expect(result.current.displayState).toBe('live');

    act(() => {
      usePetStore.setState({ activePet: PET_B });
    });

    // Synchronous, in the same act() — no `await` — pet A's findings must
    // already be gone, not lingering alongside pet B's new id.
    expect(result.current.findings).toEqual([]);
    expect(result.current.hasUnseenSignal).toBe(false);

    // Let pet B's in-flight (resolves-to-null) fetch settle before the test ends.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('markSeen() called on a switch-render never writes the outgoing pet\'s signature under the new pet\'s key', async () => {
    mockedReadCache.mockImplementation(async (petId: string) =>
      petId === PET_A.id
        ? { signalText: null, isBuilding: false, findings: [finding], coverage: [], expiresAt: '2999-01-01' }
        : null,
    );

    const { result } = renderHook(() => useSignal());
    await waitFor(() => expect(result.current.findings).toEqual([finding]));

    act(() => {
      usePetStore.setState({ activePet: PET_B });
    });
    // Even if a stale render's markSeen fired here, findings are already []
    // for pet B at this point (previous assertion) — calling it is a safe no-op,
    // never a cross-pet write of pet A's signature.
    act(() => {
      result.current.markSeen();
    });

    expect(useSignalMarkStore.getState().seenSignatures['pet-b']).toBeUndefined();
    expect(useSignalMarkStore.getState().seenSignatures['pet-a']).toBeUndefined();

    // Let pet B's in-flight (resolves-to-null) fetch settle before the test ends.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('markSeen() records the CURRENT pet\'s own signature once its live findings land', async () => {
    mockedReadCache.mockResolvedValue({
      signalText: null,
      isBuilding: false,
      findings: [finding],
      coverage: [],
      expiresAt: '2999-01-01',
    });

    const { result } = renderHook(() => useSignal());
    await waitFor(() => expect(result.current.displayState).toBe('live'));

    act(() => {
      result.current.markSeen();
    });

    expect(useSignalMarkStore.getState().seenSignatures['pet-a']).toBe('0:intake_decline');
    expect(result.current.hasUnseenSignal).toBe(false);
  });
});
