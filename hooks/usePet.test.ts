import { renderHook, waitFor } from '@testing-library/react-native';
import { usePet } from './usePet';
import { supabase } from '../lib/supabase';
import { router } from 'expo-router';
import { usePetStore } from '../store/petStore';

// The pure §6 decision is unit-tested in lib/onboarding.test.ts; this locks the
// HOOK WIRING around it — the two-read orchestration, the cold-start retry, and
// the never-false-onboard-on-error/throw guards (the connective tissue most
// likely to regress silently).

jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('../store/authStore', () => ({
  useAuthStore: jest.fn(() => ({ user: { id: 'user-1' } })),
}));
// Keep the real zustand pet store; only stub the AsyncStorage-backed helper so
// the selection restore resolves to null without touching native storage.
jest.mock('../store/petStore', () => {
  const actual = jest.requireActual('../store/petStore');
  return { ...actual, loadPersistedActivePetId: jest.fn().mockResolvedValue(null) };
});

const mockedFrom = supabase.from as jest.Mock;
const mockedReplace = router.replace as jest.Mock;

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
};

type ReadResult = { data: unknown; error: { message: string } | null };

// Branch supabase.from() by table so the profile chain (.select().eq().maybeSingle())
// and the pets chain (.select().eq().eq().order()) each resolve independently. With
// `throwReads`, both terminal calls reject — modelling a network-layer throw rather
// than a resolved {data, error}.
function mockReads(opts: { profile?: ReadResult; pets?: ReadResult; throwReads?: boolean }) {
  mockedFrom.mockImplementation((table: string) => {
    if (table === 'user_profiles') {
      const maybeSingle = opts.throwReads
        ? jest.fn().mockRejectedValue(new Error('offline'))
        : jest.fn().mockResolvedValue(opts.profile ?? { data: null, error: null });
      return { select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle })) })) };
    }
    // pets
    const order = opts.throwReads
      ? jest.fn().mockRejectedValue(new Error('offline'))
      : jest.fn().mockResolvedValue(opts.pets ?? { data: [], error: null });
    return {
      select: jest.fn(() => ({ eq: jest.fn(() => ({ eq: jest.fn(() => ({ order })) })) })),
    };
  });
}

let setOnboarded: jest.Mock;
let setPets: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  setOnboarded = jest.fn();
  setPets = jest.fn();
  // Override the store actions with spies; the in-flight-pet guard reads
  // getState().pets, which stays [] here (setPets is a stub), so a genuinely
  // petless account still reaches the onboarding redirect.
  usePetStore.setState({ pets: [], activePet: null, isOnboarded: false, setOnboarded, setPets });
});

describe('usePet gate wiring', () => {
  it('hydrates pets and marks onboarded when the account has a pet (legacy: null flag + a pet)', async () => {
    mockReads({
      pets: { data: [PET], error: null },
      profile: { data: { onboarding_completed_at: null }, error: null },
    });
    renderHook(() => usePet());
    await waitFor(() => expect(setOnboarded).toHaveBeenCalledWith(true));
    expect(setPets).toHaveBeenCalledWith([PET], null);
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('treats a completed flag with zero active pets as onboarded — never re-onboards', async () => {
    mockReads({
      pets: { data: [], error: null },
      profile: { data: { onboarding_completed_at: '2026-07-06T00:00:00Z' }, error: null },
    });
    renderHook(() => usePet());
    await waitFor(() => expect(setOnboarded).toHaveBeenCalledWith(true));
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('routes a fresh account (no pet, null flag) into onboarding after the retry', async () => {
    mockReads({
      pets: { data: [], error: null },
      profile: { data: { onboarding_completed_at: null }, error: null },
    });
    renderHook(() => usePet());
    // Entry is the disclaimer acknowledgment (B-270), so a resumed mid-flow quit
    // still passes the acceptance point before pet setup.
    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/onboarding/disclaimer'), {
      timeout: 3000,
    });
    expect(setOnboarded).toHaveBeenCalledWith(false);
  });

  it('never onboards or bounces when the reads THROW (offline cold start)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockReads({ throwReads: true });
    renderHook(() => usePet());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    // Let the single retry also fail; still no decision written either way.
    await new Promise((r) => setTimeout(r, 800));
    expect(mockedReplace).not.toHaveBeenCalled();
    expect(setOnboarded).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never onboards on a pets read error — leaves state as-is for a later re-fetch', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockReads({
      pets: { data: null, error: { message: 'rls' } },
      profile: { data: null, error: null },
    });
    renderHook(() => usePet());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 800));
    expect(mockedReplace).not.toHaveBeenCalled();
    expect(setOnboarded).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('usePet — cross-pet banner archived-exclusion (B-151)', () => {
  // #203 adversarial-review gap (b): the cross-pet safety banner (multi-pet §4)
  // treats EVERY pet in petStore.pets as banner-eligible — useCrossPetSafetyBanner
  // filters out only the ACTIVE pet, never an archived one. The single thing keeping
  // an archived pet out of that list is THIS loader's is_active=true filter, which
  // petStore's own INVARIANT comment leans on explicitly ("Every loader filters
  // is_active = true (usePet) ... an archived pet leaking in here would wrongly raise
  // a banner"). The exclusion held, but rested on that filter + a prose comment with
  // ZERO test — one unfiltered setPets would surface an archived pet's stale cached
  // safety finding as a banner. Pin the filter so dropping it fails here loudly.
  //
  // (The Archived-pets restore screen re-loads with the same is_active=true filter
  // before its own setPets — the other server-data path into the list — so the two
  // callers agree; this guards the primary loader the review named.)
  it('queries pets with is_active=true, so an archived pet never enters the banner-eligible list', async () => {
    const petsEqCalls: Array<[string, unknown]> = [];
    mockedFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { onboarding_completed_at: '2026-07-06T00:00:00Z' },
                  error: null,
                }),
            }),
          }),
        };
      }
      // pets — a self-returning fluent chain that records every .eq(col, val) so the
      // is_active filter is observable (the shared mockReads helper uses anonymous
      // .eq() stubs and can't see the arguments).
      const chain: Record<string, unknown> = {
        eq: jest.fn((col: string, val: unknown) => {
          petsEqCalls.push([col, val]);
          return chain;
        }),
        order: jest.fn().mockResolvedValue({ data: [PET], error: null }),
      };
      return { select: jest.fn(() => chain) };
    });

    renderHook(() => usePet());
    // The loader hydrated the active list …
    await waitFor(() => expect(setPets).toHaveBeenCalledWith([PET], null));
    // … and it did so through the is_active=true filter, not an unfiltered read.
    expect(petsEqCalls).toContainEqual(['is_active', true]);
  });
});
