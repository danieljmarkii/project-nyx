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
