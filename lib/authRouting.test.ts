import { coldStartDecision } from './authRouting';
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
