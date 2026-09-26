// The per-incident read's verdict, sorted into QUIET and ESCALATION by ONE list that the
// phone and the server both import (CUL-1277).
//
// WHY AN ALLOWLIST OF THE QUIET VALUES, and not a check for `worth_a_call`. Engines v3
// (EN-3, CUL-1133) will add verdicts, and a server flag cannot protect a phone that is
// already installed: a build that meets a value it does not know must still do the safe
// thing. Asking "is this the escalation?" answers NO for a value nobody has taught the
// build, which turns an unknown verdict calm. Asking "is this one of the values we KNOW
// are quiet?" answers NO for it too, which is the other direction: an unknown verdict is
// not calm until someone puts it on this list. It costs a false alarm at worst (a calm
// verdict an old build shows in the rose); the other direction costs a missed one, and
// on this surface absence of a known escalation is never wellness (the n=1 rule).
//
// WHAT THIS LIST DOES NOT DECIDE. It sorts a verdict already in the RECORD. It is never
// the gate that lets the model's own words through (clinical-guardrails Pattern 10): those
// gates must fail toward withholding free text, so they stay on the literal `worth_a_call`
// in `supabase/functions/_shared/incident-analysis.ts`. Putting them on "not quiet" would
// let model prose ride any value nobody has defined yet.
//
// WHY ITS OWN FILE. It imports nothing and holds no owner-facing words, so the Edge
// Functions can import it (`../../../lib/incidentVerdict.ts`) without pulling client copy
// into their shipping closure (C-26): a label edit must never redeploy analyze-*. The words
// live in `lib/incidentReadState.ts` beside the client's other half of the rule.
//
// Adding a value HERE is the one act that makes a verdict calm on every surface at once.
// A value that asserts wellness never joins it (clinical-guardrails Pattern 1): flag it and
// route it to the PM.

/** The verdicts that are NOT an escalation. Only `monitor` is calm on the Home and History
 *  surfaces; `not_enough_to_say` is quiet but never calm (the PM's 2026-09-25 ruling,
 *  `lib/readState.ts`). Neither may stand in front of a failed re-read (CUL-812). */
export const QUIET_VERDICTS = ['monitor', 'not_enough_to_say'] as const;

export type QuietVerdict = (typeof QUIET_VERDICTS)[number];

const QUIET: readonly string[] = QUIET_VERDICTS;

/** A verdict on the quiet list. Anything else, a value this build has never seen
 *  included, is not quiet. */
export function isQuietVerdict(value: string): value is QuietVerdict {
  return QUIET.includes(value);
}

/**
 * A verdict the record holds that must be treated as an escalation: present, and not on
 * the quiet list. No verdict at all (`null`, `undefined`) is not one: there is nothing to
 * protect and nothing to show, and that case has its own honest states on every surface.
 */
export function isEscalationVerdict(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return !isQuietVerdict(value);
}
