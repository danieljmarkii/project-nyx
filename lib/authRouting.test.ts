import {
  coldStartDecision,
  navigateAfterSignOut,
  signedOutRoute,
  recoveryAdoption,
  coldStartResume,
  readUnlessSignedOut,
} from './authRouting';
import type { Session, AuthError } from '@supabase/supabase-js';

// Minimal stand-ins — coldStartDecision only branches on presence, never shape.
const aSession = { access_token: 'x', refresh_token: 'y' } as unknown as Session;
const anError = new Error('network request failed') as unknown as AuthError;

describe('coldStartDecision', () => {
  it('proceeds when a live session was restored (error is irrelevant)', () => {
    expect(coldStartDecision(aSession, null)).toBe('proceed');
    expect(coldStartDecision(aSession, anError)).toBe('proceed');
  });

  it('RETAINS on null-with-error — a transient refresh failure must not log the owner out', () => {
    // The load-bearing case: token expired/near-expiry + the refresh network call
    // failed. The stored session is still there; never bounce to the login wall.
    expect(coldStartDecision(null, anError)).toBe('retain');
  });

  it('routes to auth on null-without-error — genuinely no stored session', () => {
    expect(coldStartDecision(null, null)).toBe('to-auth');
    expect(coldStartDecision(null, undefined)).toBe('to-auth');
  });
});

describe('signedOutRoute (B-280 FR-20)', () => {
  it('sends a deletion to login WITHOUT the eviction banner (B-039 keeps its own)', () => {
    expect(
      signedOutRoute({ justDeletedAccount: true, deliberateSignOut: false, recoveryEnabled: true }),
    ).toEqual({ path: '/(auth)/login', armBanner: false });
  });

  it('arms the §5.6b banner on an INVOLUNTARY sign-out when recovery is enabled', () => {
    // Unmarked (not deliberate, not deletion) with the flag on = the FR-18 eviction.
    expect(
      signedOutRoute({ justDeletedAccount: false, deliberateSignOut: false, recoveryEnabled: true }),
    ).toEqual({ path: '/(auth)/login', armBanner: true });
  });

  it('sends a DELIBERATE sign-out to the Landing, no banner, even with recovery on', () => {
    expect(
      signedOutRoute({ justDeletedAccount: false, deliberateSignOut: true, recoveryEnabled: true }),
    ).toEqual({ path: '/(auth)', armBanner: false });
  });

  it('is INERT while the flag is off — every non-deletion sign-out goes to the Landing', () => {
    // PR 2 ships with PASSWORD_RECOVERY_ENABLED=false; no behaviour change until then.
    expect(
      signedOutRoute({ justDeletedAccount: false, deliberateSignOut: false, recoveryEnabled: false }),
    ).toEqual({ path: '/(auth)', armBanner: false });
    expect(
      signedOutRoute({ justDeletedAccount: true, deliberateSignOut: false, recoveryEnabled: false }),
    ).toEqual({ path: '/(auth)/login', armBanner: false });
  });
});

describe('recoveryAdoption (CUL-1205, CUL-1973)', () => {
  const base = {
    recoveryExchangePending: false,
    recoveryInProgress: false,
    recoveryUserId: null as string | null,
    sessionUserId: 'user-a',
  };

  it('adopts when no reset is under way (normal auth untouched)', () => {
    expect(recoveryAdoption(base)).toBe('adopt');
  });

  it('during the exchange window adopts nothing: the handler adopts the returned session', () => {
    // No event name can open it, PASSWORD_RECOVERY included: an emission carrying A
    // under that name would otherwise render the form against A (O2). Even the pinned
    // user waits for the handler.
    expect(recoveryAdoption({ ...base, recoveryExchangePending: true })).toBe('refuse');
    expect(
      recoveryAdoption({ ...base, recoveryExchangePending: true, recoveryInProgress: true, recoveryUserId: 'user-a' }),
    ).toBe('refuse');
  });

  it('with the gate armed adopts the pinned user only', () => {
    expect(recoveryAdoption({ ...base, recoveryInProgress: true, recoveryUserId: 'user-b', sessionUserId: 'user-b' }))
      .toBe('adopt');
  });

  // The retain instance: a resume sets no window, and autoRefresh's later
  // TOKEN_REFRESHED carries whoever the keychain held.
  it('with the gate armed ends the reset for anyone else, or when no user is pinned', () => {
    expect(recoveryAdoption({ ...base, recoveryInProgress: true, recoveryUserId: 'user-b', sessionUserId: 'user-a' }))
      .toBe('abandon');
    expect(recoveryAdoption({ ...base, recoveryInProgress: true, recoveryUserId: null, sessionUserId: 'user-a' }))
      .toBe('abandon');
  });
});

// CUL-1973: a cold start with the gate armed. A process death between arming and the
// exchange adopting B leaves gate + A in the keychain; the form must never render on A.
describe('coldStartResume (CUL-1973)', () => {
  const exchangedB = { kind: 'exchanged', userId: 'user-b' } as const;
  const exchanging = { kind: 'exchanging' } as const;

  it('renders the form only for the user the exchange adopted', () => {
    expect(coldStartResume({ sessionUserId: 'user-b', decision: 'proceed', phase: exchangedB }))
      .toEqual({ action: 'resume-form', userId: 'user-b' });
  });

  it('reconciles a live session the exchange never adopted (death before the exchange saved B)', () => {
    expect(coldStartResume({ sessionUserId: 'user-a', decision: 'proceed', phase: exchanging }))
      .toEqual({ action: 'reconcile' });
  });

  it('reconciles a live session that is not the adopted user', () => {
    expect(coldStartResume({ sessionUserId: 'user-a', decision: 'proceed', phase: exchangedB }))
      .toEqual({ action: 'reconcile' });
  });

  it('retain waits for the refresh only after an adopted exchange, pinning that user', () => {
    expect(coldStartResume({ sessionUserId: null, decision: 'retain', phase: exchangedB }))
      .toEqual({ action: 'await-refresh', userId: 'user-b' });
  });

  it('retain before the exchange adopted anyone reconciles instead of waiting on A', () => {
    expect(coldStartResume({ sessionUserId: null, decision: 'retain', phase: exchanging }))
      .toEqual({ action: 'reconcile' });
  });

  it('nothing stored releases the gate', () => {
    expect(coldStartResume({ sessionUserId: null, decision: 'to-auth', phase: exchanging }))
      .toEqual({ action: 'release' });
    expect(coldStartResume({ sessionUserId: null, decision: 'to-auth', phase: exchangedB }))
      .toEqual({ action: 'release' });
  });
});

describe('navigateAfterSignOut (MFU-9, CUL-1071)', () => {
  const nav = (canDismiss: boolean) => {
    const calls: string[] = [];
    return {
      calls,
      n: {
        canDismiss: () => canDismiss,
        dismissAll: () => calls.push('dismissAll'),
        replace: (p: string) => calls.push(`replace:${p}`),
      },
    };
  };

  it('unwinds a pushed record screen BEFORE routing to auth', () => {
    const { calls, n } = nav(true);
    navigateAfterSignOut(n, '/(auth)/login');
    expect(calls).toEqual(['dismissAll', 'replace:/(auth)/login']);
  });

  it('routes alone when there is nothing to unwind', () => {
    const { calls, n } = nav(false);
    navigateAfterSignOut(n, '/(auth)');
    expect(calls).toEqual(['replace:/(auth)']);
  });
});

// CUL-1971: a sign-out landing during the cold start's Promise.all never adopts the
// session read before it.
describe('readUnlessSignedOut (CUL-1971)', () => {
  it('hands back the reads when no sign-out began while they ran', async () => {
    const epoch = 3;
    await expect(readUnlessSignedOut(() => epoch, async () => ['gate', 'session-a'])).resolves.toEqual([
      'gate',
      'session-a',
    ]);
  });

  it('drops them when a sign-out began mid-read: the SIGNED_OUT handler owns the session', async () => {
    let epoch = 3;
    const result = await readUnlessSignedOut(
      () => epoch,
      async () => {
        // getSession resolved with A; the wipe starts before the gate read resolves.
        epoch++;
        return ['gate', 'session-a'];
      },
    );
    expect(result).toBeNull();
  });
});
