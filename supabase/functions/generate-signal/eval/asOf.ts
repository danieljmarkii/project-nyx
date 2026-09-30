// The replay core's as-of rules, moved here from scripts/engine-replay/record.deno.ts so the
// EN-1 scorecard (Engines v3 PR-16, CUL-1131) and the dogfood replay read a record through the
// SAME visibility rule (CUL-1117). record.deno.ts re-exports these; nothing here reads a file,
// the clock or the environment, so the Deno suites, `deno check` and the jest runner all load it.
//
// The rule, once: a row is visible at T iff created_at <= T, and (deleted_at IS NULL or
// deleted_at > T), and occurred_at <= T. A photo read's owner edit after T is undone (the
// model's own values stand in), because that is what the engine saw that evening.

export type Iso = string

const ms = (s: string | null | undefined): number | null => (s == null ? null : Date.parse(s))

/** The one visibility rule (see header). `lookbackDays` bounds occurred_at from below.
 *  `settleMs` treats a row deleted within that many ms AFTER T as already gone: the
 *  2026-05/06 edit flow re-created a vomit row and deleted the old one in the same
 *  operation that ran its read, so for an instant both rows existed. A per-incident replay
 *  anchored at the read's own timestamp would count that instant's duplicate. */
export function visibleAt(row: { cr: Iso; del: Iso | null; at: Iso }, T: number, lookbackDays = Infinity, settleMs = 0): boolean {
  const c = ms(row.cr)!, o = ms(row.at)!, d = ms(row.del)
  return c <= T && (d == null || d > T + settleMs) && o <= T && o >= T - lookbackDays * 86_400_000
}

/** The fields `flagsAsOf` reads off a photo read. */
export interface AnalysisFlags {
  blood_present: string | null
  foreign_material_present: string | null
  edited_at: Iso | null
  rb: string | null // ai_raw_payload->>'blood_present'
  rf: string | null // ai_raw_payload->>'foreign_material_present'
}

/** Blood / foreign material as the engine saw them at T (pre-edit values before an edit). */
export function flagsAsOf(a: AnalysisFlags, T: number): { blood: string | null; foreign: string | null } {
  const editedLater = a.edited_at != null && ms(a.edited_at)! > T
  return {
    blood: editedLater ? (a.rb ?? a.blood_present) : a.blood_present,
    foreign: editedLater ? (a.rf ?? a.foreign_material_present) : a.foreign_material_present,
  }
}

/** UTC instant of a local wall-clock time in an IANA zone (DST-correct, no library). */
export function localToUtc(dateYmd: string, hour: number, tz: string): number {
  const guess = Date.parse(`${dateYmd}T${String(hour).padStart(2, '0')}:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return guess - (asLocal - guess)
}
