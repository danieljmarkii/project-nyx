// Signup email-confirmation deep link (B-432 / B-483).
//
// PURE BY CONTRACT: no I/O, no supabase-js import, no expo module — the same rule
// as its sibling `lib/passwordRecovery.ts`. Every branch the owner's confirmation
// can take is a plain function over plain data, so all four terminal states are
// reachable in a unit test rather than only on a device with a real email in hand.
// `app/(auth)/confirm.tsx` owns the I/O and does nothing this file can't explain.
//
// WHAT THIS FIXES. `signUp` sent no `emailRedirectTo`, so Supabase fell back to the
// project Site URL: the owner tapped "Confirm email" and landed on a web page —
// a localhost one in build 35 — then had to find their own way back into the app
// and sign in. The account was genuinely confirmed (GoTrue verifies the token
// server-side BEFORE it redirects), so this was never a broken flow — but it is
// the first thing every new owner does, at the moment they are trusting us most.
//
// THAT SERVER-SIDE ORDERING IS LOAD-BEARING FOR THE COPY, so it is worth stating
// plainly: if the link comes back carrying a `?code=`, the address IS confirmed,
// whatever happens next on this device. That is why a failed exchange here is
// "you're confirmed, sign in" rather than "something went wrong" — the account is
// fine, only the automatic sign-in was lost.

import { AuthDeepLink, CONFIRM_PATH, authDeepLinkUrl, parseAuthDeepLink } from './authDeepLink';

export { CONFIRM_PATH };

/**
 * The `emailRedirectTo` handed to `signUp` and to `auth.resend({ type: 'signup' })`.
 *
 * Hardcoded rather than derived from `Linking.createURL()` on purpose: in Expo Go
 * or a dev client that helper returns an `exp://…` URL, which is NOT on the
 * Supabase redirect allowlist, so Supabase would refuse the redirect and every
 * link would dead-end — a failure that only shows up in the runtime the PM tests
 * in. This string and the allowlist entry must match exactly.
 */
export function confirmRedirectUrl(): string {
  return authDeepLinkUrl(CONFIRM_PATH);
}

/** Classify an incoming deep link against the confirmation route. */
export function parseConfirmLink(url: string | null | undefined): AuthDeepLink {
  return parseAuthDeepLink(url, CONFIRM_PATH);
}

// The route params expo-router surfaces for `nyx:///confirm?…`. Values are
// `string | string[]` because a repeated key (`?code=a&code=b`) arrives as an
// array — rare, but a malformed link is precisely what this path has to survive.
export type ConfirmRouteParams = Record<string, string | string[] | undefined>;

// First value wins on a repeated key, matching the URL parser's own rule so the
// two sources can never disagree about which value a duplicated param has.
function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value || null;
  if (Array.isArray(value)) return firstParam(value[0]);
  return null;
}

/**
 * The link the screen should act on, from the two sources it has.
 *
 * The raw launch URL is preferred because it is the only one that can see the
 * FRAGMENT: GoTrue puts recovery/confirmation errors in the query on the PKCE path
 * but in the fragment on others, and expo-router's params never carry a fragment —
 * so a params-only screen would render a blank spinner on exactly the links that
 * need to explain themselves.
 *
 * The params are the fallback for the case where the launch URL is unavailable
 * (an unusual runtime, a warm hand-off the linking module didn't cache). They can
 * only ever produce the query-shaped classifications, which is enough to keep the
 * screen honest rather than stuck.
 *
 * `unrelated` means "neither source told us anything" — the screen's own decision
 * about how long to wait, not a verdict on the link.
 */
export function resolveConfirmLink(
  url: string | null | undefined,
  params: ConfirmRouteParams | null | undefined,
): AuthDeepLink {
  const fromUrl = parseConfirmLink(url);
  if (fromUrl.kind !== 'unrelated') return fromUrl;

  const errorCode = firstParam(params?.error_code) ?? firstParam(params?.error);
  // Same precedence as the URL parser: an error shape is honoured before a code,
  // so a link carrying both is never exchanged.
  if (errorCode || firstParam(params?.error_description)) {
    return { kind: 'error', errorCode };
  }
  const code = firstParam(params?.code);
  if (code) return { kind: 'valid', code };
  return { kind: 'unrelated' };
}

// ── The four states the confirm screen can render ───────────────────────────────

export type ConfirmState =
  // The exchange is in flight. Also the state the screen sits in while it waits
  // for the launch URL to resolve.
  | 'working'
  // A session is already live on this device, so we deliberately do NOT exchange
  // (see `decideConfirm`). The address is confirmed either way.
  | 'already_signed_in'
  // The link carried a code — so the address IS confirmed — but the exchange did
  // not complete here (no local PKCE verifier because the link was opened on a
  // different device, a spent code, a transport failure). Forward action: sign in.
  | 'confirmed_needs_signin'
  // The link carried an error, or nothing usable at all. The address was NOT
  // confirmed; the owner needs a fresh link, which login's resend action provides.
  | 'link_dead';

export type ConfirmDecision =
  // Not our URL. The screen must keep waiting rather than render a failure — on a
  // cold start the launch URL can arrive a beat after first paint.
  | { kind: 'ignore' }
  | { kind: 'exchange'; code: string }
  | { kind: 'state'; state: ConfirmState };

/**
 * What to do with an incoming link, decided BEFORE any auth state is touched.
 *
 * `sessionState` is the one input that isn't in the URL: `'present'` when this
 * device already holds a session, `'absent'` when it genuinely holds none.
 *
 * WHY A LIVE SESSION BLOCKS THE EXCHANGE — this is the safety call of the whole
 * flow, so it is written down rather than implied:
 *
 *  1. **It would be a session swap.** Exchanging a code for account B while the
 *     device is signed in as A replaces the session non-null → non-null, which is
 *     the shape `wipeLocalSession()` was never built for: the session-keyed
 *     producers (`useSync`, `useWidgetSnapshots`) re-arm instead of unmounting and
 *     re-publish A's pets — including onto the Home Screen widget — after the wipe.
 *     That is the exact failure `rls-privacy-reviewer` found in B-280's first
 *     design (spec §6.4), and the answer there was to force a real `signOut()`
 *     first so the shipped SIGNED_OUT teardown runs.
 *  2. **We cannot borrow that answer here.** `signOut()` deletes the PKCE code
 *     verifier along with the session (`GoTrueClient._removeSession` removes
 *     `${storageKey}-code-verifier`), so a sign-out-then-exchange sequence
 *     destroys the very credential the exchange needs. Verified in
 *     `node_modules/@supabase/auth-js` this session — and flagged to B-280, whose
 *     §6.4 ordering has the same problem.
 *  3. **And we don't need one.** Confirmation already happened server-side, so
 *     declining to exchange costs the owner nothing: the account is confirmed and
 *     signing in normally reaches it. Recovery cannot say that — there the
 *     exchange IS the flow — which is why the two paths legitimately differ.
 *
 * The residual is a designed state, not a dead end: `already_signed_in` names the
 * different-account case and offers sign-out as the way through.
 */
export function decideConfirm(
  link: AuthDeepLink,
  sessionState: 'present' | 'absent',
): ConfirmDecision {
  switch (link.kind) {
    case 'unrelated':
      return { kind: 'ignore' };
    // Error and malformed collapse into one state on purpose. GoTrue returns one
    // indistinguishable shape for expired / already-used / consumed-by-a-mail-
    // scanner, and a truncated link tells us even less — so naming a cause would
    // be asserting something the device cannot know. Both render the same screen
    // and the same forward action, so the distinction would be decorative.
    case 'error':
    case 'malformed':
      return { kind: 'state', state: 'link_dead' };
    case 'valid':
      if (sessionState === 'present') return { kind: 'state', state: 'already_signed_in' };
      return { kind: 'exchange', code: link.code };
  }
}

/**
 * The state a failed exchange lands on.
 *
 * Deliberately does not branch on the error. Every reachable cause — no verifier
 * on this device, a spent code, a 500, offline — leaves the owner in the same
 * true position (confirmed, not signed in) with the same forward action (sign in),
 * so a taxonomy here would produce four ways to say one thing. Recovery's
 * `classifyExchangeOutcome` earns its four members because its causes lead to
 * genuinely different actions; this one does not.
 */
export function stateAfterFailedExchange(): ConfirmState {
  return 'confirmed_needs_signin';
}

// ── Owner name carried through the confirmation gap ─────────────────────────────

export interface OwnerNameMetadata {
  firstName: string;
  lastName: string;
}

/**
 * The owner's name as `signUp` stashed it in user metadata.
 *
 * WHY IT GOES THROUGH METADATA AT ALL. `signup.tsx` writes first/last to
 * `user_profiles` right after signup — but only on the branch where `signUp`
 * returns a session. With email confirmation ON there is no session at that
 * moment (RLS would reject the write, `auth.uid()` being null), and by the time
 * the owner taps the emailed link the app may have been killed, so the names are
 * no longer in memory either. Left unaddressed, turning confirmation on would
 * silently reintroduce "Owner: not recorded" on every vet report — the exact
 * regression B-251 PR 6 fixed. Passing them through `options.data` parks them on
 * the auth user until a session exists to write them with.
 *
 * Tolerant by design: metadata is untyped JSON from the server, and a missing or
 * malformed name must never break a confirmation. Returns null when there is
 * nothing worth writing, and the caller simply skips the write — the name stays
 * re-enterable in Profile.
 */
export function ownerNameFromMetadata(metadata: unknown): OwnerNameMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  const firstName = typeof record.first_name === 'string' ? record.first_name.trim() : '';
  const lastName = typeof record.last_name === 'string' ? record.last_name.trim() : '';
  if (!firstName && !lastName) return null;
  return { firstName, lastName };
}
