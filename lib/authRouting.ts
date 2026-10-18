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

// What the root listener does with a session auth-js emits while a reset may be under
// way. Pure + unit-tested.
//
// - Inside the EXCHANGE WINDOW (from when the handler nulls the store session, §6.4
//   step 3, until the exchange resolves) it adopts NOTHING ('refuse'). The only session
//   that may enter the store is the one `exchangeCodeForSession` RETURNED, and the
//   recovery handler adopts that itself (`lib/recoveryDeepLink.ts`), so adoption no
//   longer rests on what an event is called. Keying on the name failed twice: admitting
//   only `SIGNED_IN` dropped B, because auth-js names a reset exchange
//   `PASSWORD_RECOVERY` (CUL-1886), and admitting a name admits ANY emission carrying
//   it, so a `SIGNED_IN` / `PASSWORD_RECOVERY` for the pre-recovery owner (A) resolving
//   inside the window would render the set-password form against A (CUL-1205 O2).
// - With the gate armed and the window closed, it adopts only the user the reset is
//   for (`recoveryUserId`, pinned by the exchange or by a resume). A RESUME sets no
//   window, so this is what keeps the retain branch's later `TOKEN_REFRESHED` for A off
//   the form (CUL-1973): anyone else ends the reset ('abandon') rather than waiting.
// - Otherwise normal auth, untouched ('adopt').
export type RecoveryAdoption = 'adopt' | 'refuse' | 'abandon';

export function recoveryAdoption(input: {
  recoveryExchangePending: boolean;
  recoveryInProgress: boolean;
  recoveryUserId: string | null;
  sessionUserId: string;
}): RecoveryAdoption {
  if (input.recoveryExchangePending) return 'refuse';
  if (input.recoveryInProgress && input.sessionUserId !== input.recoveryUserId) return 'abandon';
  return 'adopt';
}

// CUL-1971: run the cold start's reads behind the sign-out epoch. A sign-out that
// starts while they are in flight (a revoked token's SIGNED_OUT landing between
// getSession resolving and the gate read) has already begun the wipe; adopting what
// was read before it would put the old account back mid-wipe and start a sync the
// per-session fence cannot see, since it captures the already-bumped epoch.
// `wipeLocalSession` bumps the epoch synchronously, before its first await, so a moved
// epoch means the SIGNED_OUT handler owns the session and the routing: resolves null,
// and the caller adopts nothing. The epoch reader is injected so this stays testable.
export async function readUnlessSignedOut<T>(
  epoch: () => number,
  reads: () => Promise<T>,
): Promise<T | null> {
  const before = epoch();
  const result = await reads();
  return epoch() === before ? result : null;
}

// CUL-1973: the persisted recovery gate says a reset is under way, not whose session the
// keychain holds. The phase beside it (`lib/recoveryDeepLink.ts`) does: `exchanging`
// until the handler adopts B, then `exchanged` naming B. A missing or unreadable phase
// is read as `exchanging`.
export type RecoveryPhase = { kind: 'exchanging' } | { kind: 'exchanged'; userId: string };

// What a cold start with the gate ARMED does. Pure + unit-tested; `initColdStart`
// (app/_layout.tsx) only carries it out.
//
// - 'resume-form'   — a live session that IS the user the exchange adopted: the
//                     set-password form, with that user pinned (§10 row 21).
// - 'await-refresh' — the retain case (a transient refresh failure) after an adopted
//                     exchange: wait for autoRefresh, adopting only that user.
// - 'reconcile'     — anything else, the process death between arming and adopting
//                     among them: the keychain may hold the previous owner, so end the
//                     reset the FR-15 way and never render the form.
// - 'release'       — nothing stored at all: nothing to resume or to purge.
export type ColdStartResume =
  | { action: 'resume-form'; userId: string }
  | { action: 'await-refresh'; userId: string }
  | { action: 'reconcile' }
  | { action: 'release' };

export function coldStartResume(input: {
  sessionUserId: string | null;
  decision: ColdStartDecision;
  phase: RecoveryPhase;
}): ColdStartResume {
  const { sessionUserId, decision, phase } = input;
  if (decision === 'to-auth') return { action: 'release' };
  if (phase.kind !== 'exchanged') return { action: 'reconcile' };
  if (decision === 'retain') return { action: 'await-refresh', userId: phase.userId };
  if (sessionUserId === phase.userId) return { action: 'resume-form', userId: phase.userId };
  return { action: 'reconcile' };
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

// MFU-9 (CUL-1071): a sign-out lands on auth with NOTHING of the previous owner's stack
// left mounted under it. `router.replace` swaps only the top route, so a record screen
// pushed over the tabs (the Signal screen, an event, the trial) stayed mounted beneath
// the auth screen, still holding what it had read. Unwind first, then route. The
// navigator is a parameter so the order is testable without a router.
export interface SignOutNavigator {
  canDismiss: () => boolean;
  dismissAll: () => void;
  replace: (path: SignedOutRoute['path']) => void;
}

export function navigateAfterSignOut(nav: SignOutNavigator, path: SignedOutRoute['path']): void {
  if (nav.canDismiss()) nav.dismissAll();
  nav.replace(path);
}
