// The device-pass fixture account's one identifying rule (CUL-1222, GC-2).
//
// The device sitting (CUL-1529) runs on a dedicated test account so nothing it logs
// lands in a real pet's clinical record. Three writers must agree on which account
// that is, and none of them may take a caller's word for it:
//   • the server seed (scripts/fixture/emitFixtureSql.ts) refuses, inside its
//     transaction, any user whose email fails this test;
//   • the dev client's Noticed seed (`__seedNoticed`, lib/lookDevSeed.ts) refuses
//     to write unless the signed-in email passes it;
//   • the runbook's allowlist update scopes by an email that passes it.
//
// The rule is a plus-alias carrying a fixed tag, so the PM's own inbox receives the
// account's mail while its address can never equal the PM's real account or the App
// Review demo account (support@getculprit.app has no plus tag at all). Pure and
// import-free on purpose: the Deno seed and the app both read it.

/** The tag the fixture account's email carries, immediately before the `@`. */
export const FIXTURE_EMAIL_TAG = '+culprit-fixture';

/**
 * Whether `email` is a device-pass fixture account: a local part ending in the tag,
 * then a domain. Case-insensitive (mail providers fold the local part's case for
 * plus-aliases, and Supabase stores what was typed). Anything else is false, an
 * absent email included, so a caller that cannot read the session fails closed.
 */
export function isFixtureEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at).toLowerCase();
  // The tag must follow a non-empty base, so a bare "+culprit-fixture@…" (no inbox
  // behind the alias) is refused too.
  return local.endsWith(FIXTURE_EMAIL_TAG) && local.length > FIXTURE_EMAIL_TAG.length;
}
