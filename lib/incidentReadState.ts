// ── An escalation outlives a failed re-read (CUL-812) ─────────────────────────
//
// This module deliberately imports NOTHING. lib/analysis.ts pulls ./supabase and
// ./sync → expo-sqlite, so a component test importing it must replace the whole
// module — which meant hand-mirroring this predicate in two test files, free to
// drift from the real one without either suite going red. Living here, the sections
// import it directly and their tests exercise the REAL predicate.
//
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
export function escalationSurvivesFailure(
  row: { recommendation?: string | null } | null | undefined,
): boolean {
  return row?.recommendation === 'worth_a_call';
}
