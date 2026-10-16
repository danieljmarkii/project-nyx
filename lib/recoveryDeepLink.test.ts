import { handleRecoveryDeepLink, __resetRecoveryDedupeForTest } from './recoveryDeepLink';
import { useAuthStore } from '../store/authStore';
import { supabase } from './supabase';
import { router } from 'expo-router';
import { wipeLocalSession, flushForSignOut } from './session';
import { readRecoveryRequest } from './recoveryMarker';
import { ChunkedSecureStoreAdapter } from './secureStore';
import { shouldAdoptSessionDuringRecovery } from './authRouting';

// Locks the §6.4 option-(d) ordering — the invariant two review rounds and B-576
// bought and that the pure passwordRecovery unit tests CANNOT see (they never run
// the real client). The load-bearing assertions:
//   • a valid link NEVER calls signOut() before the exchange (that deletes the PKCE
//     verifier — the B-576 bug);
//   • the wipe runs BEFORE the exchange and AFTER the gate is armed and the store
//     session is nulled (F1 — A's producers must be stood down first);
//   • a provenance-less link arms NOTHING and wipes NOTHING (FR-14 fail-closed);
//   • a failed exchange sets the failure state, reconciles with a real signOut, and
//     releases the gate; a sign-out that fails (resolved `{ error }` or a throw) purges
//     the stored session from the keychain (CUL-1205 O3);
//   • a success adopts EXACTLY the session the exchange returned, and no emission of A
//     inside the window ever reaches the store (CUL-1205 O2).
//
// The exchange mock EMITS what auth-js 2.105.4 emits for a reset link
// (`PASSWORD_RECOVERY` carrying B, pinned against the real client by
// lib/authEventContract.test.ts) through `emitAuthEvent`, which applies the root
// listener's own adoption rule. It never writes the store itself: that fake is how the
// SIGNED_IN assumption shipped green while every real reset timed out.

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('./supabase', () => ({
  AUTH_STORAGE_KEY: 'sb-test-auth-token',
  supabase: {
    auth: { exchangeCodeForSession: jest.fn(), signOut: jest.fn(), getSession: jest.fn() },
    realtime: { setAuth: jest.fn() },
  },
}));
jest.mock('./secureStore', () => ({
  ChunkedSecureStoreAdapter: { removeItem: jest.fn(), getItem: jest.fn() },
}));
jest.mock('./session', () => ({ wipeLocalSession: jest.fn(), flushForSignOut: jest.fn() }));
jest.mock('./recoveryMarker', () => {
  const actual = jest.requireActual('./recoveryMarker');
  return { ...actual, readRecoveryRequest: jest.fn() };
});

const mockExchange = supabase.auth.exchangeCodeForSession as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockWipe = wipeLocalSession as jest.Mock;
const mockFlush = flushForSignOut as jest.Mock;
const mockRead = readRecoveryRequest as jest.Mock;
const mockReplace = router.replace as jest.Mock;
const mockRemoveItem = ChunkedSecureStoreAdapter.removeItem as jest.Mock;
const mockGetItem = ChunkedSecureStoreAdapter.getItem as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockRealtimeSetAuth = supabase.realtime.setAuth as jest.Mock;

const NOW = 1_754_000_000_000;
const B_SESSION = { access_token: 'access-b', user: { id: 'user-b' } } as never;
const A_SESSION = { access_token: 'access-a', user: { id: 'user-a' } } as never;

// The session branch of app/_layout's onAuthStateChange, reduced to its two store
// effects: adopt only when the window allows, and pin a gated session to set-password.
function emitAuthEvent(_event: string, session: unknown): void {
  if (!session) return;
  const store = useAuthStore.getState();
  if (!shouldAdoptSessionDuringRecovery(store.recoveryExchangePending)) return;
  store.setSession(session as never);
  if (useAuthStore.getState().recoveryInProgress) mockReplace('/(auth)/reset-password');
}

// An ordered log of the I/O steps, so we can assert e.g. wipe-before-exchange.
let calls: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps implementations; a route recorder must not leak across cases.
  mockReplace.mockReset();
  __resetRecoveryDedupeForTest();
  calls = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  useAuthStore.setState({
    session: A_SESSION,
    recoveryInProgress: false,
    recoveryScreen: null,
    recoveryExchangePending: false,
    recoveryEmail: null,
  });
  mockFlush.mockImplementation(async () => {
    calls.push('flush');
    return { pendingCount: 0, quarantinedCount: 0 };
  });
  mockWipe.mockImplementation(async () => {
    calls.push('wipe');
  });
  mockSignOut.mockImplementation(async () => {
    calls.push('signOut');
    return { error: null };
  });
  // auth-js storage: after a successful exchange it holds B (_saveSession); the
  // keychain reads back empty once purged.
  mockGetSession.mockResolvedValue({ data: { session: B_SESSION } });
  mockGetItem.mockResolvedValue(null);
  mockRealtimeSetAuth.mockResolvedValue(undefined);
  mockExchange.mockImplementation(async () => {
    calls.push('exchange');
    // What auth-js does: save B, emit PASSWORD_RECOVERY(B) to subscribers, return B.
    emitAuthEvent('PASSWORD_RECOVERY', B_SESSION);
    return { data: { session: B_SESSION, user: { id: 'user-b' }, redirectType: 'recovery' }, error: null };
  });
});

afterEach(() => (console.warn as jest.Mock).mockRestore?.());

function haveProvenance(email = 'jordan@email.com') {
  mockRead.mockResolvedValue({ email, requestedAtMs: NOW });
}

describe('handleRecoveryDeepLink — the valid, provenance-present happy path', () => {
  it('arms the gate, nulls + wipes, THEN exchanges — and NEVER signs out first (B-576)', async () => {
    haveProvenance();
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });

    // The verifier-preserving order: flush → wipe → exchange, with NO signOut before
    // the exchange anywhere.
    expect(calls).toEqual(['flush', 'wipe', 'exchange']);
    expect(mockSignOut).not.toHaveBeenCalled();
    // Gate was armed (still armed on success — the screen releases it after the write).
    expect(useAuthStore.getState().recoveryInProgress).toBe(true);
    // No failure state; the set-password form is (session + gate).
    expect(useAuthStore.getState().recoveryScreen).toBeNull();
    // The email was held in memory before the wipe (FR-12).
    expect(useAuthStore.getState().recoveryEmail).toBe('jordan@email.com');
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/reset-password');
  });

  it('stands the store session down to null before the wipe (F1)', async () => {
    haveProvenance();
    let sessionAtWipe: unknown = 'unset';
    mockWipe.mockImplementation(async () => {
      calls.push('wipe');
      sessionAtWipe = useAuthStore.getState().session;
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });
    // The producers key on useAuthStore.session, so it must be null by wipe time.
    expect(sessionAtWipe).toBeNull();
  });

  it('nulls the store session BEFORE routing to the form (no pre-wipe render window)', async () => {
    // The set-password form renders on (session && recoveryInProgress). On a warm
    // deep link A's live session is in the store, so if the route to reset-password
    // happened before setSession(null), a "Save" tap during the flush window would
    // write B's password onto A's account (code-reviewer). Capture the store session
    // at the moment the handler routes.
    haveProvenance();
    let sessionAtRoute: unknown = 'unset';
    mockReplace.mockImplementation((route: string) => {
      if (route === '/(auth)/reset-password' && sessionAtRoute === 'unset') {
        sessionAtRoute = useAuthStore.getState().session;
      }
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });
    expect(sessionAtRoute).toBeNull();
  });

  it('opens the exchange window over the wipe and closes it after the exchange (rls re-review)', async () => {
    // While the window is open the root listener adopts nothing, so an autoRefresh
    // re-emission of A cannot reach the store. It must be OPEN across the flush + wipe
    // (when A's autoRefresh could fire) and CLOSED once the exchange resolves.
    haveProvenance();
    let pendingAtWipe: unknown = 'unset';
    mockWipe.mockImplementation(async () => {
      calls.push('wipe');
      pendingAtWipe = useAuthStore.getState().recoveryExchangePending;
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });
    expect(pendingAtWipe).toBe(true);
    expect(useAuthStore.getState().recoveryExchangePending).toBe(false);
  });
});

describe('handleRecoveryDeepLink — adopting the exchange session (CUL-1205)', () => {
  it('an emitted PASSWORD_RECOVERY: the store holds exactly the returned session, on set-password', async () => {
    haveProvenance();
    mockReplace.mockImplementation((route: string) => calls.push(`route ${route}`));
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });

    // Routed to set-password AFTER the exchange too (FR-6 / Trap 1), not only by the
    // step-3 working route: the owner may have left that screen while it spun.
    expect(calls.slice(calls.indexOf('exchange'))).toEqual(['exchange', 'route /(auth)/reset-password']);

    // The very object the exchange returned, not a session the listener picked.
    expect(useAuthStore.getState().session).toBe(B_SESSION);
    expect(useAuthStore.getState().recoveryInProgress).toBe(true);
    expect(useAuthStore.getState().recoveryScreen).toBeNull();
    expect(useAuthStore.getState().recoveryExchangePending).toBe(false);
    // The last route is the set-password screen, so the form renders (session + gate).
    expect(mockReplace).toHaveBeenLastCalledWith('/(auth)/reset-password');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("refuses every emission of A inside the window, whatever it is called (O2)", async () => {
    haveProvenance();
    // Every session written into the store while the window is open, from the moment
    // the handler nulls A out of it (A sits there until then, by design).
    const heldInWindow: unknown[] = [];
    let nulled = false;
    const unsub = useAuthStore.subscribe((st, prev) => {
      if (!st.recoveryExchangePending) return;
      if (!st.session) nulled = true;
      else if (nulled && st.session !== prev.session) heldInWindow.push(st.session);
    });
    mockWipe.mockImplementation(async () => {
      calls.push('wipe');
      // autoRefresh firing for A mid-flush.
      emitAuthEvent('TOKEN_REFRESHED', A_SESSION);
    });
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      // A Change password re-auth for A resolving inside the window, and an emission
      // for A carrying the recovery name.
      emitAuthEvent('SIGNED_IN', A_SESSION);
      emitAuthEvent('PASSWORD_RECOVERY', A_SESSION);
      emitAuthEvent('PASSWORD_RECOVERY', B_SESSION);
      return { data: { session: B_SESSION }, error: null };
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });
    unsub();

    // Only the handler's own write of the returned B, made just before it closes the
    // window; never A, under any event name.
    expect(heldInWindow).toEqual([B_SESSION]);
    expect(useAuthStore.getState().session).toBe(B_SESSION);
  });

  it('hands realtime the adopted token (PASSWORD_RECOVERY never reaches supabase-js realtime)', async () => {
    haveProvenance();
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });
    expect(mockRealtimeSetAuth).toHaveBeenCalledWith('access-b');
  });

  it('refuses to adopt when auth-js holds another account after the exchange', async () => {
    // A sign-in for A landed after the exchange saved B (signInWithPassword takes no
    // auth-js lock): the store must not say B while every write goes out as A.
    haveProvenance();
    mockGetSession.mockResolvedValue({ data: { session: A_SESSION } });
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().recoveryScreen).toBe('failed');
    expect(calls).toEqual(['flush', 'wipe', 'exchange', 'signOut']);
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
  });

  it('a success that returns no session fails forward to a new link, never spins', async () => {
    haveProvenance();
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      return { data: { session: null }, error: null };
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().recoveryScreen).toBe('link_unusable');
    expect(calls).toEqual(['flush', 'wipe', 'exchange', 'signOut']);
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
  });
});

describe('handleRecoveryDeepLink — a failed exchange (FR-15)', () => {
  it('renders link_unusable, reconciles with a REAL signOut, and releases the gate', async () => {
    haveProvenance();
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      return { data: { session: null }, error: { message: 'Email link is invalid or has expired' } };
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=dead', { nowMs: NOW });

    // The signOut is the B-576 reconcile — AFTER the exchange, never before.
    expect(calls).toEqual(['flush', 'wipe', 'exchange', 'signOut']);
    // Scoped LOCAL: it purges only this device's copy of A's tokens, never A's
    // sessions on A's other devices (the default 'global' would — code-reviewer).
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAuthStore.getState().recoveryScreen).toBe('link_unusable');
    // Gate released last (step 8).
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
  });

  it("keeps the window open through the reconcile: signOut's own refresh of A is refused", async () => {
    haveProvenance();
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      return { data: { session: null }, error: { message: 'Email link is invalid or has expired' } };
    });
    // A sits in the store until the handler nulls it at step 3; count only re-entries.
    const adoptedA: unknown[] = [];
    let nulled = false;
    const unsub = useAuthStore.subscribe((st, prev) => {
      if (!st.session) nulled = true;
      else if (nulled && st.session !== prev.session && st.session === A_SESSION) adoptedA.push(st.session);
    });
    // _signOut loads the session first, refreshing a near-expiry A and emitting it.
    mockSignOut.mockImplementation(async () => {
      calls.push('signOut');
      emitAuthEvent('TOKEN_REFRESHED', A_SESSION);
      return { error: { message: 'Network request failed' } };
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=dead', { nowMs: NOW });
    unsub();

    expect(adoptedA).toEqual([]);
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().recoveryExchangePending).toBe(false);
    expect(mockRealtimeSetAuth).toHaveBeenCalledWith();
  });

  it('nulls the store after a purge, which fires no SIGNED_OUT', async () => {
    haveProvenance();
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      return { data: { session: null }, error: { message: 'Email link is invalid or has expired' } };
    });
    mockSignOut.mockImplementation(async () => {
      calls.push('signOut');
      // Something put a session in the store before the reconcile; the purge path must
      // not leave it there with no tokens behind it.
      useAuthStore.getState().setSession(A_SESSION);
      return { error: { message: 'Network request failed' } };
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=dead', { nowMs: NOW });
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('reads the keychain back after a purge, retries once, and warns when it survives', async () => {
    haveProvenance();
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      return { data: { session: null }, error: { message: 'Email link is invalid or has expired' } };
    });
    mockSignOut.mockResolvedValue({ error: { message: 'Network request failed' } });
    mockGetItem.mockResolvedValue('{"access_token":"access-a"}');
    await handleRecoveryDeepLink('nyx:///reset-password?code=dead', { nowMs: NOW });

    expect(mockRemoveItem).toHaveBeenCalledTimes(4);
    expect(console.warn).toHaveBeenCalledWith('[recovery] stored session still present after purge');
  });

  it('a successful reconcile leaves the keychain to auth-js', async () => {
    haveProvenance();
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      return { data: { session: null }, error: { message: 'Email link is invalid or has expired' } };
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=dead', { nowMs: NOW });
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it.each([
    ['resolves { error } (offline /logout, auth-js keeps the session)', async () => {
      calls.push('signOut');
      return { error: { message: 'Network request failed' } };
    }],
    ['throws', async () => {
      calls.push('signOut');
      throw new Error('boom');
    }],
  ])('a reconcile signOut that %s is checked, surfaced, and the keychain purged (O3)', async (_label, impl) => {
    haveProvenance();
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      return { data: { session: null }, error: { message: 'Email link is invalid or has expired' } };
    });
    mockSignOut.mockImplementation(impl);
    await handleRecoveryDeepLink('nyx:///reset-password?code=dead', { nowMs: NOW });

    // A's persisted session and the verifier beside it, so nothing can restore A.
    expect(mockRemoveItem).toHaveBeenCalledWith('sb-test-auth-token');
    expect(mockRemoveItem).toHaveBeenCalledWith('sb-test-auth-token-code-verifier');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('reconcile sign-out failed'),
      expect.anything(),
    );
    expect(useAuthStore.getState().recoveryScreen).toBe('link_unusable');
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
  });

  it('maps a verifier-absent error to wrong_device (the §9.3-Q2 shape)', async () => {
    haveProvenance();
    mockExchange.mockImplementation(async () => {
      calls.push('exchange');
      throw new Error('both auth code and code verifier should be non-empty');
    });
    await handleRecoveryDeepLink('nyx:///reset-password?code=x', { nowMs: NOW });
    expect(useAuthStore.getState().recoveryScreen).toBe('wrong_device');
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
  });
});

describe('handleRecoveryDeepLink — FR-14 provenance', () => {
  it('refuses a valid link with NO local request: wrong_device, no gate, no wipe, no exchange', async () => {
    mockRead.mockResolvedValue(null); // this device never asked (§10 row 23, hostile link)
    await handleRecoveryDeepLink('nyx:///reset-password?code=hostile', { nowMs: NOW });

    expect(useAuthStore.getState().recoveryScreen).toBe('wrong_device');
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
    expect(mockWipe).not.toHaveBeenCalled();
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    // A's session is untouched — the hostile link changed nothing.
    expect((useAuthStore.getState().session as { user: { id: string } }).user.id).toBe('user-a');
  });

  it('refuses a marker older than the provenance window', async () => {
    mockRead.mockResolvedValue({ email: 'a@b.com', requestedAtMs: NOW });
    // 25 hours later — past the 24h window.
    await handleRecoveryDeepLink('nyx:///reset-password?code=x', { nowMs: NOW + 25 * 60 * 60 * 1000 });
    expect(useAuthStore.getState().recoveryScreen).toBe('wrong_device');
    expect(mockExchange).not.toHaveBeenCalled();
  });
});

describe('handleRecoveryDeepLink — non-valid shapes never touch auth state (step 1)', () => {
  it('renders link_unusable for an error-shaped link, with no wipe/exchange', async () => {
    haveProvenance();
    await handleRecoveryDeepLink('nyx:///reset-password?error=access_denied&error_code=otp_expired', {
      nowMs: NOW,
    });
    expect(useAuthStore.getState().recoveryScreen).toBe('link_unusable');
    expect(useAuthStore.getState().recoveryInProgress).toBe(false);
    expect(mockWipe).not.toHaveBeenCalled();
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('ignores an unrelated deep link entirely (a widget link)', async () => {
    await handleRecoveryDeepLink('nyx:///history?pet=1', { nowMs: NOW });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockWipe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().recoveryScreen).toBeNull();
  });
});

describe('handleRecoveryDeepLink — the double-fire guard', () => {
  it('processes an identical URL only once (cold-start + a warm re-fire)', async () => {
    haveProvenance();
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });
    await handleRecoveryDeepLink('nyx:///reset-password?code=abc', { nowMs: NOW });
    expect(mockExchange).toHaveBeenCalledTimes(1);
  });
});
