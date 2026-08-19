import { supabase } from './supabase';

// In-app account deletion — client side (B-039 PR 2). The destructive work lives
// in the `delete-account` Edge Function (service role; collects the user's
// Storage paths, purges them, then deletes the auth user LAST, firing the DB
// cascade). This module is the thin client: the confirm phrase + gating
// predicate + confirm copy (all pure, unit-tested) and the invoke wrapper (thin
// I/O — exercised by the Manual QA Script per the repo convention, not mocked).
//
// B-119 (re-auth hardening): the destructive action is now also gated on the
// account PASSWORD, not just type-to-confirm. Type-to-confirm DELETE defends an
// ACCIDENTAL tap; it does nothing against an unlocked/stolen phone whose holder
// already has a valid session. So the password is sent with the delete request
// and the Edge Function re-verifies it server-side (against the token-holder's
// own email, from the verified JWT — never the body) BEFORE any delete: a wrong
// password 401s and nothing is destroyed. That server check is the real
// boundary — a lifted session token calling the function directly cannot bypass
// it, and unlike change-password, deletion is our own endpoint with no Supabase
// "Secure password change" backstop. We deliberately do NOT also re-auth
// client-side: a second sign-in per deletion doubles the auth round-trips and can
// 429 a CORRECT password on a tight rate limit (rls-privacy review). The two
// frictions are additive and defend different failure modes: DELETE = accidental,
// password = unauthorized.

// The exact phrase the user must type to arm the destructive action (FR-9). One
// source of truth so the input check and the on-screen instruction can't drift.
export const DELETE_CONFIRM_PHRASE = 'DELETE';

// True when the typed value matches the confirm phrase exactly. Surrounding
// whitespace is tolerated; case is NOT — the instruction shows uppercase DELETE
// and the field force-uppercases, so requiring exact case adds no real friction.
export function isDeletePhraseTyped(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRM_PHRASE;
}

// The destructive action arms only when all four hold: the phrase is typed, a
// password has been entered (B-119 — re-auth; verified for real at confirm-time,
// client- and server-side), we're online (FR-11 — never fire offline), and no
// delete is already in flight. NB the password is only checked for PRESENCE here
// — never trimmed and never validated against rules — because whitespace can be
// significant and the server is the sole authority on whether it's correct.
export function canConfirmAccountDeletion(input: {
  typed: string;
  password: string;
  online: boolean;
  inFlight: boolean;
}): boolean {
  return (
    isDeletePhraseTyped(input.typed) &&
    input.password.length > 0 &&
    input.online &&
    !input.inFlight
  );
}

// nyx-voice confirm body (FR-10): second-person owner, the pet by name, honest
// about permanence, no exclamation. One pet → the name + singular-they "Their";
// multiple → "your pets"; none → drop the pet clause entirely. The "everything
// you've logged" lead already covers all data; the pet name is the emotional
// anchor, not an exhaustive claim.
export function deleteAccountConfirmBody(petNames: string[]): string {
  const lead = "This permanently removes your account and everything you've logged";
  if (petNames.length === 1) {
    return `${lead} for ${petNames[0]}. Their health history can't be recovered, and this can't be undone.`;
  }
  if (petNames.length > 1) {
    return `${lead} for your pets. Their health history can't be recovered, and this can't be undone.`;
  }
  return `${lead}. This can't be undone.`;
}

// Reads the HTTP status off a supabase-js Functions error. A non-2xx from the
// function surfaces as a `FunctionsHttpError` whose `context` is the Response, so
// the status is `error.context.status`. Read it structurally rather than via
// `instanceof FunctionsHttpError` so this module needs no value-import from
// `@supabase/supabase-js` — its unit test mocks the client away, and a real
// import would drag the (un-transformed) ESM package into that test. A transport
// / relay error carries a non-Response `context`, so its `status` is undefined
// and it correctly falls through to the generic-failure branch.
function functionsHttpStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context && typeof context === 'object' && 'status' in context) {
      const status = (context as { status?: unknown }).status;
      if (typeof status === 'number') return status;
    }
  }
  return undefined;
}

export interface DeleteAccountResult {
  ok: boolean;
  // When ok is false, why: 'reauth' = the password was rejected server-side (the
  // function's 401), which the sheet renders as an inline field error; 'other' =
  // a transport/server failure, rendered as the generic retryable banner. null on
  // success.
  reason: 'reauth' | 'other' | null;
  error: string | null;
}

// Invoke the delete-account Edge Function. supabase-js attaches the caller's JWT
// as the Authorization header automatically; the function reads IDENTITY from
// that token alone (never the body), so a caller can only delete THEMSELVES — we
// send no ids. The one thing we DO send is the `password` (B-119): the function
// re-verifies it server-side against the token-holder's own email before any
// delete, so a lifted session token is not enough to erase the account. The
// value travels over TLS to our own function exactly as it does to GoTrue on a
// normal sign-in, and the function never logs it.
//
// A rejected password is the function's 401, which supabase-js surfaces as a
// `FunctionsHttpError` carrying the Response — map that one status to
// reason:'reauth' so the sheet can show an inline "that doesn't match" instead of
// the generic failure banner. Honest result (FR-7): ok ONLY on an explicit
// { ok: true } 2xx; any transport error, other non-2xx, or missing flag is a
// failure the caller surfaces as "couldn't finish — try again," never a false
// success.
export async function requestAccountDeletion(password: string): Promise<DeleteAccountResult> {
  try {
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { password } });
    if (error) {
      // The function 401s on a wrong/absent password (re-auth refusal). Everything
      // else (500, relay/transport) is a generic failure.
      if (functionsHttpStatus(error) === 401) {
        return { ok: false, reason: 'reauth', error: 'reauth_failed' };
      }
      return { ok: false, reason: 'other', error: error.message };
    }
    if (!data?.ok) return { ok: false, reason: 'other', error: 'Account deletion did not complete' };
    return { ok: true, reason: null, error: null };
  } catch (e) {
    return { ok: false, reason: 'other', error: e instanceof Error ? e.message : String(e) };
  }
}
