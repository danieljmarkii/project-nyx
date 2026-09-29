// What counts as a FORMED stool for EN-7 (CUL-1138; Engines v3 PR-26), stated once for the
// server and the phone (C-34: one question, one set).
//
// analyze-stool withdraws its "vomiting around this stool" call only after a complete read
// shows a formed stool and, on an owner-edited row, the owner's consistency agrees
// (`ownerAgreesFormed`). The phone asks the same set when an owner EDITS the consistency:
// an edit away from formed on a row whose call was withdrawn re-runs the read, so the call
// comes back (CUL-1408, PM ruling (a), 2026-09-29). Bristol types 2 to 4; type 1, 5, 6, 7 and
// 'unsure' are not formed. Placeholders for the ruling sheet (CUL-583).
//
// Imports nothing and holds no words, so the Edge Functions can import it
// (`../../../lib/stoolForm.ts`) without pulling client copy into their closure (C-26).

export const STOOL_FORMED_CONSISTENCIES: readonly string[] = ['type_2_lumpy', 'type_3_cracked', 'type_4_smooth_soft'];

export function isFormedStoolConsistency(value: unknown): boolean {
  return typeof value === 'string' && STOOL_FORMED_CONSISTENCIES.includes(value);
}

/** The key the server writes under, as stamped on the row's `engine_flags`. */
export const EN7_ENGINE_KEY = 'engines_v3_en3';

/**
 * Should an owner's save of the stool fields re-run the read (CUL-1408)? Only when all hold:
 *   · the row's words were written under EN-7's key (its `engine_flags` stamp), so a row
 *     written by today's rule never re-reads: the change is dark until the key is on;
 *   · the row carries no `concurrent_vomiting` (a call already standing needs nothing);
 *   · the edit moves the consistency, and away from formed.
 * The re-read keeps the call on every path: a capped run keeps the flag computed before
 * any read, and a read run honours the owner's consistency (`ownerAgreesFormed`).
 */
export function needsEn7Recheck(
  row: { engine_flags?: unknown; contextual_flags?: unknown; stool_consistency?: string | null },
  nextConsistency: string | null | undefined,
): boolean {
  const flags = Array.isArray(row.engine_flags) ? row.engine_flags : [];
  if (!flags.includes(EN7_ENGINE_KEY)) return false;
  const contextual = Array.isArray(row.contextual_flags) ? row.contextual_flags : [];
  if (contextual.includes('concurrent_vomiting')) return false;
  if ((nextConsistency ?? null) === (row.stool_consistency ?? null)) return false;
  return !isFormedStoolConsistency(nextConsistency);
}
