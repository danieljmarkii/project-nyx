import { handleRecoveryDeepLink, __resetRecoveryDedupeForTest } from './recoveryDeepLink';
import { useAuthStore } from '../store/authStore';
import { supabase } from './supabase';
import { router } from 'expo-router';
import { wipeLocalSession, flushForSignOut } from './session';
import { readRecoveryRequest } from './recoveryMarker';

// Locks the §6.4 option-(d) ordering — the invariant two review rounds and B-576
// bought and that the pure passwordRecovery unit tests CANNOT see (they never run
// the real client). The load-bearing assertions:
//   • a valid link NEVER calls signOut() before the exchange (that deletes the PKCE
//     verifier — the B-576 bug);
//   • the wipe runs BEFORE the exchange and AFTER the gate is armed and the store
//     session is nulled (F1 — A's producers must be stood down first);
//   • a provenance-less link arms NOTHING and wipes NOTHING (FR-14 fail-closed);
//   • a failed exchange sets the failure state, reconciles with a real signOut, and
//     releases the gate.

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('./supabase', () => ({
  supabase: { auth: { exchangeCodeForSession: jest.fn(), signOut: jest.fn() } },
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

const NOW = 1_754_000_000_000;
const B_SESSION = { user: { id: 'user-b' } } as never;

// An ordered log of the I/O steps, so we can assert e.g. wipe-before-exchange.
let calls: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  __resetRecoveryDedupeForTest();
  calls = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  useAuthStore.setState({
    session: { user: { id: 'user-a' } } as never,
    recoveryInProgress: false,
    recoveryScreen: null,
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
  mockExchange.mockImplementation(async () => {
    calls.push('exchange');
    // The real exchange adopts B's session (SIGNED_IN); simulate that so success
    // asserts a genuine swap.
    useAuthStore.getState().setSession(B_SESSION);
    return { data: { session: B_SESSION }, error: null };
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
