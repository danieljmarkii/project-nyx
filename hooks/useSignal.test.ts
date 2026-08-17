import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSignal, useCrossPetSafetyBanner } from './useSignal';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import { useSignalMarkStore } from '../store/signalMarkStore';
import {
  readSignalCache,
  isSignalCacheStale,
  regenerateSignal,
  readSignalsAndRefresh,
} from '../lib/signal';
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
const mockedRefresh = readSignalsAndRefresh as jest.Mock;

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

describe('useSignal — acknowledgment (SR-3 §5.3)', () => {
  // Reset BEFORE each test (not after): an afterEach store write lands while the just-
  // rendered hook is still mounted (RNTL cleanup runs after), re-rendering it outside act.
  beforeEach(() => {
    useSyncStore.setState({ signalAcknowledging: {} });
  });

  it("reflects the ACTIVE pet's ack flag — a background pet's ack never shows on this zone", async () => {
    useSyncStore.setState({ signalAcknowledging: { 'pet-a': true, 'pet-b': true } });
    mockedReadCache.mockResolvedValue(null);
    const { result } = renderHook(() => useSignal());
    // Active is PET_A; PET_B's flag is irrelevant to this pet's zone.
    await waitFor(() => expect(result.current.acknowledging).toBe(true));
    // Drain the focus effect fully so no state update lands after the test.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('is false when the active pet has nothing in flight', async () => {
    useSyncStore.setState({ signalAcknowledging: { 'pet-b': true } });
    mockedReadCache.mockResolvedValue(null);
    const { result } = renderHook(() => useSignal());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.acknowledging).toBe(false);
  });
  // The ack's lifecycle (raise / clear-on-settle / generation guard / fail-quiet ceiling)
  // is owned by triggerSignalRegenDebounced and tested in lib/signal.test.ts — the hook
  // only READS the flag, which the two tests above cover.
});

describe('useCrossPetSafetyBanner — switch-settle self-banner (B-151)', () => {
  // #203 adversarial-review gap (a): tapping the banner switches the active pet while
  // STAYING on Home (no blur/refocus), so whether the newly-active pet's banner-about-
  // itself clears rests entirely on useFocusEffect re-running when the callback identity
  // changes on the still-focused screen. The hook keys its useCallback on
  // [activePetId, otherPetsKey, signalTick], so a switch mints a new callback → the
  // effect re-runs → `others` is recomputed WITHOUT the now-active pet → no self-banner.
  //
  // The expo-router mock at the top of this file models that exact contract (run while
  // focused, re-run when the memoized callback changes) with useEffect(cb, [cb]); these
  // tests therefore pin the load-bearing part the review flagged — the hook's dep-keying.
  // Drop `activePetId` from the deps and both tests fail (the self-banner would persist).
  beforeEach(() => {
    // readSignalsAndRefresh is a bare jest.fn() (see the ../lib/signal mock); give it a
    // per-pet cache so the real selectCrossPetSafetyFinding/bannerCopy path runs.
    mockedRefresh.mockReset();
  });

  it("clears the banner when you tap it to switch to that pet — its finding belongs in its own Signal, never a self-banner", async () => {
    // Active pet A; only pet B has a safety finding → A's Home shows a banner ABOUT B.
    mockedRefresh.mockImplementation(async (ids: string[]) => {
      const m = new Map<string, CachedFinding[]>();
      for (const id of ids) m.set(id, id === PET_B.id ? [finding] : []);
      return m;
    });

    const { result } = renderHook(() => useCrossPetSafetyBanner());
    await waitFor(() => expect(result.current?.petId).toBe(PET_B.id));

    // The banner's onPress calls selectPet(banner.petId); model that same active-pet
    // transition. B is now the active pet, so its finding is its OWN Signal's concern.
    act(() => {
      usePetStore.getState().selectPet(PET_B.id);
    });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('re-runs the selection on the still-focused screen — a switch surfaces the now-non-active pet, proving the effect fired on the activePetId dep', async () => {
    // Both pets have a safety finding. Active A → the ONE banner is about B (A's own
    // finding stays in A's Signal). Switch to B → the effect must re-run and re-select
    // A, not merely blank out B. This is the "on-focused-dep behavior" gap (a) names:
    // if the effect did NOT re-run on the switch, the banner would stay stuck on B.
    mockedRefresh.mockImplementation(async (ids: string[]) => {
      const m = new Map<string, CachedFinding[]>();
      for (const id of ids) m.set(id, [finding]);
      return m;
    });

    const { result } = renderHook(() => useCrossPetSafetyBanner());
    await waitFor(() => expect(result.current?.petId).toBe(PET_B.id));

    act(() => {
      usePetStore.getState().selectPet(PET_B.id);
    });
    await waitFor(() => expect(result.current?.petId).toBe(PET_A.id));
  });
});
