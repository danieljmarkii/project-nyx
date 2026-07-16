// Legal-acceptance writes (B-270). The onboarding veterinary-disclaimer
// acknowledgment records acceptance server-side — an unlogged checkbox is worth
// little in a dispute — as one append-only legal_acceptances row per
// (user, document, version). Kept in its own module (not lib/profile.ts): this is
// a legal record with its own table and semantics, not a profile field.

import { supabase } from './supabase';

// The document identity the acknowledgment records. VERSION is the hosted
// document's effective date (docs/legal/veterinary-disclaimer.md, live at
// getculprit.app/disclaimer since 2026-07-16) — bump it when the hosted document
// is revised, and the next acceptance lands as a NEW row (the composite PK keys
// on version), preserving the original record instead of overwriting it.
export const VETERINARY_DISCLAIMER_DOCUMENT = 'veterinary_disclaimer';
export const VETERINARY_DISCLAIMER_VERSION = '2026-07-16';

// Postgres unique-violation SQLSTATE — a PK conflict on re-insert. The client
// treats it as "already recorded": the FIRST acceptance is the record that
// stands, and there is deliberately no path that touches it again (the table has
// no UPDATE policy, and accepted_at isn't even client-writable — migration 032).
const UNIQUE_VIOLATION = '23505';

export type AcceptanceWriteResult =
  // recorded: the row landed now. already-recorded: a row for this
  // (user, document, version) existed — e.g. a mid-flow quit re-walking the
  // screen — which satisfies the requirement identically.
  | { status: 'recorded' }
  | { status: 'already-recorded' }
  | { status: 'error' };

// Records the caller's acceptance of the veterinary disclaimer. accepted_at is
// deliberately NOT sent: the column is excluded from the client INSERT grant and
// the server stamps DEFAULT now() — a dispute-grade timestamp can't ride the
// device clock. RLS (WITH CHECK user_id = auth.uid()) scopes the write to the
// caller's own account.
//
// Plain insert, not upsert: an upsert's ON CONFLICT path is an UPDATE, which the
// (deliberately) missing UPDATE policy would reject — the duplicate-key error is
// the honest signal here, and it maps to already-recorded below.
export async function recordDisclaimerAcceptance(
  userId: string,
): Promise<AcceptanceWriteResult> {
  const { error } = await supabase.from('legal_acceptances').insert({
    user_id: userId,
    document: VETERINARY_DISCLAIMER_DOCUMENT,
    version: VETERINARY_DISCLAIMER_VERSION,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { status: 'already-recorded' };
    console.warn('[legal] disclaimer acceptance write failed:', error.message);
    return { status: 'error' };
  }
  return { status: 'recorded' };
}
