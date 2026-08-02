import {
  coldStartDecision,
  signedOutRoute,
  shouldAdoptSessionDuringRecovery,
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

describe('shouldAdoptSessionDuringRecovery (B-280 rls re-review)', () => {
  it('adopts everything when no exchange window is open (normal auth untouched)', () => {
    expect(shouldAdoptSessionDuringRecovery('TOKEN_REFRESHED', false)).toBe(true);
    expect(shouldAdoptSessionDuringRecovery('SIGNED_IN', false)).toBe(true);
    expect(shouldAdoptSessionDuringRecovery('INITIAL_SESSION', false)).toBe(true);
  });

  it('during the exchange window, adopts ONLY the exchange SIGNED_IN — never A re-emitted', () => {
    // The Trap-2 sub-window: auth-js autoRefresh re-emits the pre-recovery owner A.
    expect(shouldAdoptSessionDuringRecovery('TOKEN_REFRESHED', true)).toBe(false);
    expect(shouldAdoptSessionDuringRecovery('INITIAL_SESSION', true)).toBe(false);
    expect(shouldAdoptSessionDuringRecovery('USER_UPDATED', true)).toBe(false);
    // The exchange's own SIGNED_IN(B) is the one session recovery adopts.
    expect(shouldAdoptSessionDuringRecovery('SIGNED_IN', true)).toBe(true);
  });
});
