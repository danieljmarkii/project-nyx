import type { Session, AuthError } from '@supabase/supabase-js';

// What a cold-start getSession() result means for routing. Pure + injected so the
// decision is unit-testable without mounting the root layout.
//
// - 'proceed' — a live session was restored; stay in the authenticated app.
// - 'retain'  — getSession returned NO session but WITH an error. This is a
//               TRANSIENT refresh failure, not a sign-out: the access token was
//               within its expiry margin (or expired) and the refresh network call
//               failed — a returning owner opening the app on a flaky/again-offline
//               connection, or one whose token lapsed while backgrounded. auth-js
//               has NOT dropped the stored session (a *retryable* error never calls
//               _removeSession; a *non-retryable* one emits SIGNED_OUT, which the
//               onAuthStateChange listener handles separately and authoritatively).
//               So we KEEP the owner in the app — offline-first, their local data is
//               intact — and let autoRefresh recover the session. Bouncing them to
//               the login wall here is the frequent-"it logged me out" bug.
// - 'to-auth' — NO session and NO error: genuinely nothing stored (fresh install,
//               or a cold start after a real sign-out). Route to the Landing.
//
// The (session, error) discriminator is exact: __loadSession returns null-with-error
// ONLY on a refresh attempt that failed, and null-without-error ONLY when storage
// held no valid session to begin with.
export type ColdStartDecision = 'proceed' | 'retain' | 'to-auth';

export function coldStartDecision(
  session: Session | null,
  error: AuthError | null | undefined,
): ColdStartDecision {
  if (session) return 'proceed';
  if (error) return 'retain';
  return 'to-auth';
}

// Where a NON-recovery `SIGNED_OUT` routes, and whether it arms the FR-20 banner.
// Pure + injected so the FR-20 discrimination is unit-testable without the root
// layout. The RECOVERY case (a `SIGNED_OUT` while the gate is still armed — the
// FR-15 reconcile on a failed exchange) is handled BEFORE this is called, because
// the recovery handler owns that routing; so this function never sees it.
//
// The discrimination (B-280 FR-20 / §7.2.4): auth-js reports a revoked refresh
// token — the FR-18 eviction on another device — as an ordinary non-retryable
// `SIGNED_OUT`, indistinguishable at the client from a deliberate one. So a
// deliberate sign-out is MARKED at its origin (`deliberateSignOut`), and anything
// unmarked is treated as involuntary → login + the §5.6b banner that names the
// likely cause without asserting it (the device cannot know it, §7.2.3).
//
// Gated on `recoveryEnabled`: while `PASSWORD_RECOVERY_ENABLED` is off there is no
// eviction path in the app, so PR 2 must stay inert — every non-deletion sign-out
// routes to the Landing exactly as it did before this track.
export type SignedOutRoute = {
  path: '/(auth)' | '/(auth)/login';
  armBanner: boolean;
};

// During the recovery EXCHANGE WINDOW — from when the handler nulls the store
// session (§6.4 step 3) until the exchange's `SIGNED_IN` arrives — the ONLY session
// that may enter the store is the exchange's own `SIGNED_IN` (the new owner, B). A
// `TOKEN_REFRESHED` / `INITIAL_SESSION` emission in that window is the PRE-recovery
// owner (A), whose auth-js tokens are still live and whose `autoRefresh` can fire
// mid-flush — and adopting it would re-render the set-password form against A, a
// narrow Trap-2 sub-window (rls-privacy re-review, B-280). Pure + unit-tested. The
// window is bounded by `recoveryExchangePending`, which a RESUME (row 21) never sets,
// so a resumed session is adopted normally.
export function shouldAdoptSessionDuringRecovery(
  event: string,
  recoveryExchangePending: boolean,
): boolean {
  if (!recoveryExchangePending) return true;
  return event === 'SIGNED_IN';
}

export function signedOutRoute(input: {
  justDeletedAccount: boolean;
  deliberateSignOut: boolean;
  recoveryEnabled: boolean;
}): SignedOutRoute {
  // Deletion has its OWN banner (B-039), shown on login — never the FR-20 one.
  if (input.justDeletedAccount) return { path: '/(auth)/login', armBanner: false };
  // Involuntary: recovery live AND not a deliberate sign-out ⇒ the eviction case.
  if (input.recoveryEnabled && !input.deliberateSignOut) {
    return { path: '/(auth)/login', armBanner: true };
  }
  // Deliberate, or the flag-off default: the Landing, no banner (today's behaviour).
  return { path: '/(auth)', armBanner: false };
}
