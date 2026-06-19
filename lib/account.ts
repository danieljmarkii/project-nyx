import { supabase } from './supabase';

// In-app account deletion — client side (B-039 PR 2). The destructive work lives
// in the `delete-account` Edge Function (service role; collects the user's
// Storage paths, purges them, then deletes the auth user LAST, firing the DB
// cascade). This module is the thin client: the confirm phrase + gating
// predicate + confirm copy (all pure, unit-tested) and the invoke wrapper (thin
// I/O — exercised by the Manual QA Script per the repo convention, not mocked).

// The exact phrase the user must type to arm the destructive action (FR-9). One
// source of truth so the input check and the on-screen instruction can't drift.
export const DELETE_CONFIRM_PHRASE = 'DELETE';

// True when the typed value matches the confirm phrase exactly. Surrounding
// whitespace is tolerated; case is NOT — the instruction shows uppercase DELETE
// and the field force-uppercases, so requiring exact case adds no real friction.
export function isDeletePhraseTyped(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRM_PHRASE;
}

// The destructive action arms only when all three hold: the phrase is typed,
// we're online (FR-11 — never fire offline), and no delete is already in flight.
export function canConfirmAccountDeletion(input: {
  typed: string;
  online: boolean;
  inFlight: boolean;
}): boolean {
  return isDeletePhraseTyped(input.typed) && input.online && !input.inFlight;
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

export interface DeleteAccountResult {
  ok: boolean;
  error: string | null;
}

// Invoke the delete-account Edge Function. supabase-js attaches the caller's JWT
// as the Authorization header automatically; the function reads identity from
// that token alone (never the body), so a caller can only delete THEMSELVES — we
// send no ids. Honest result (FR-7): ok ONLY on an explicit { ok: true } 2xx.
// Any transport error, non-2xx, or missing flag is a failure the caller surfaces
// as "couldn't finish — try again," never a false success.
export async function requestAccountDeletion(): Promise<DeleteAccountResult> {
  try {
    const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: 'Account deletion did not complete' };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
