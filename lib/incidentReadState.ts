// ── An escalation outlives a failed re-read (CUL-812) ─────────────────────────
//
// This module deliberately imports nothing that touches a database or the network (its
// one import, `./incidentVerdict`, imports nothing at all). lib/analysis.ts pulls
// ./supabase and ./sync → expo-sqlite, so a component test importing it must replace the
// whole module — which meant hand-mirroring this predicate in two test files, free to
// drift from the real one without either suite going red. Living here, the sections
// import it directly and their tests exercise the REAL predicate.

import { isEscalationVerdict, isQuietVerdict } from './incidentVerdict';

// Both incident sections render `status === 'failed'` ahead of the read card, so a
// row that still holds `worth_a_call` + its read_text displayed as "Couldn't finish
// reading this one." with a Try again button. To an owner that reads as NOTHING WAS
// FOUND — on the one surface built never to reassure.
//
// The server-side half of this rule is `buildFailureWrite` in
// supabase/functions/_shared/incident-analysis.ts, which stops the failure write
// from clobbering the escalation in the first place; its comment carries the full
// reasoning, including why the rule is asymmetric. This predicate is the client
// half, and it is not redundant with it:
//   · the Edge Function deploy rides the held CUL-557 chain, so this ships first;
//   · nothing can repair rows ALREADY flipped to failed over an escalation — only
//     the render can put those back in front of the owner;
//   · a `failed` row carrying an escalation is a state the client should handle on
//     its own terms whatever the server does.
//
// The asymmetry is the n=1 invariant: presence escalates, absence never reassures.
// A `monitor` or `not_enough_to_say` beside a failed read is NOT rescued here — the
// failed attempt may have been reading a REPLACED photo, and standing a benign
// verdict in front of it would be reassurance about an image nothing has read. Those
// keep the honest retry frame.
//
// ANY ESCALATION, NOT THE LITERAL (CUL-1277). The rescue used to protect
// `worth_a_call` alone, so a verdict this build does not know yet (EN-3's `call_now`)
// fell to the retry frame on a failed re-read: the CUL-812 bug, one value over. It now
// protects every value off the quiet list (`lib/incidentVerdict.ts`), which the server's
// `buildFailureWrite` reads too, so the two halves cannot drift apart again.
export function escalationSurvivesFailure(
  row: { recommendation?: string | null } | null | undefined,
): boolean {
  return isEscalationVerdict(row?.recommendation);
}

// ── A quiet verdict stands only on a read that FINISHED (CUL-1277) ─────────────
//
// The statuses under which a finished verdict STANDS. `lib/readState.ts` (History, the
// month, Home's spine, the Signal gallery) has always read status this way, as an
// ALLOWLIST; the record sections used to read it as a DENYLIST (`failed`, `read_disabled`,
// `capped`, `pending`, and anything else rendered the card). So a status nobody has
// defined yet (a future "reading again", a "stale") put a calm "Keep an eye out" on the
// record while History said the photo was not read: CUL-812's hazard for an unknown
// STATUS rather than an unknown verdict, and the same promise to an installed build.
// One list now, and both read it.
//
// An ESCALATION is not held to it: presence escalates at any status (CUL-812), which is
// `escalationSurvivesFailure` above and `isWorthACall` in lib/readState.ts.
export const FINISHED_READ_STATUSES: readonly string[] = ['completed', 'uncertain'];

/**
 * The row holds a QUIET verdict on a status that is not a finished read: the record must
 * not stand it as the read. It falls to the section's honest "not read yet" frame, the
 * same one a row with no verdict takes. PM ruling 2026-09-26 (CUL-1277, option (a)).
 */
export function quietVerdictUnfinished(
  row: { status?: string | null; recommendation?: string | null } | null | undefined,
): boolean {
  const verdict = row?.recommendation;
  if (verdict === null || verdict === undefined || !isQuietVerdict(verdict)) return false;
  return !FINISHED_READ_STATUSES.includes(row?.status ?? '');
}

/** The shipped recommendation enum's owner-facing words, verbatim — the ONE map the two
 *  incident sections (`VomitAnalysisSection`, `StoolAnalysisSection`) and Home's spine
 *  node (`lib/spineNode.ts`, D2-4 / CUL-1066) read, so a verdict is named identically on
 *  the record and on Home. Lifted here rather than exported from a component file so a
 *  pure module can import the words without pulling a screen into `lib/`. */
export const INCIDENT_REC_LABEL = {
  worth_a_call: 'Worth a call',
  monitor: 'Keep an eye out',
  not_enough_to_say: 'Not enough to say yet',
} as const;

export type IncidentRecommendation = keyof typeof INCIDENT_REC_LABEL;

function isKnownRecommendation(value: string): value is IncidentRecommendation {
  return Object.prototype.hasOwnProperty.call(INCIDENT_REC_LABEL, value);
}

/**
 * The words for ANY verdict the record holds, never blank (CUL-1277). The three shipped
 * values keep their words; anything else is not on the quiet list, so it is spoken as the
 * escalation, in the rose's own words. That is what History, the month, Home's spine and
 * the Signal gallery already say for it (`readVerdictOf` in `lib/readState.ts`), so the
 * record names an unknown verdict exactly as every other surface does (PM, 2026-09-26:
 * option (a), no new string in the submission binary).
 *
 * `hasOwnProperty`, not `value in INCIDENT_REC_LABEL`: a value such as `toString` must
 * not find a prototype member and render a function as the label.
 */
export function incidentVerdictLabel(value: string): string {
  if (isKnownRecommendation(value)) return INCIDENT_REC_LABEL[value];
  return INCIDENT_REC_LABEL.worth_a_call;
}
