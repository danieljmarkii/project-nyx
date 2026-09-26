// export.sql is PINNED, not modelled (CUL-1314).
//
// The query runs as the service role, so the evaluation-subject rule holds only while the
// committed query stays exactly as narrow as the version that was reviewed. Two attempts
// to prove that by reading the SQL failed an isolated rls-privacy-reviewer pass: a check
// that the clause was present stayed green over a clause wrapped in /* */; an allow-list
// over the query's shapes then let seventeen widening edits through: an OR glued to a
// paren (`(x)or(true)`), query_to_xml reading a table named in a string, a fan-out join
// through the owner to every pet, a lone CR that ends a `--` comment for Postgres and not
// for the scan, a `subj` shadowed by an inner CTE, a duplicate `pet_id` key. Proving a
// query narrow means modelling SQL, and every class patched exposes the next.
//
// So the query is pinned instead: this reduces export.sql to what Postgres would execute,
// the test hashes it, and any change reds the build until a reviewed edit updates the pin
// and names its privacy review. The reduction drops only blank lines, whole-line `--`
// comments and the spaces and tabs at either end of a line, and refuses everything that
// could make Postgres read a dropped character as code: a carriage return (Postgres ends a
// `--` comment at one), any character on a kept line outside printable ASCII and tab (JS
// `trim()` eats NBSP, a BOM, U+2028 and a vertical tab, and Postgres reads each as part of
// a token: the third reviewer pass), a string left open at the end of a line, a dollar
// quote, a quoted identifier, a backslash (E'' escapes), a block comment. Nothing inside a
// line is rewritten, because collapsing spaces inside a string literal would hide a change
// to it. The listed pet ids are swapped for a token by exact string, so export.sql and
// evaluationSubjects.ts cannot drift apart without changing the hash.
//
// What it cannot do, stated so it does not read as coverage (C-38): an edit that changes
// the query AND the pin in one PR passes; the pin makes that edit visible and makes its
// author name a review, and the reviewer of the PR is the check. And none of this binds a
// session that edits the query before running it (evaluationSubjects.ts).

import { createHash } from 'crypto'

export const SUBJECTS_TOKEN = '<evaluation subjects>'

export interface ExportPin {
  /** The sha256 of the query export.sql executes, reduced by `reduceExportQuery`. */
  sha256: string
  /** Who reviewed the query this hash pins, the issue, and the date. */
  review: string
}

/** What Postgres would execute, as stable text; `problems` names anything the reduction cannot read. */
export function reduceExportQuery(sql: string, listedPetIds: readonly string[]): { text: string; problems: string[] } {
  const problems: string[] = []
  if (sql.includes('\r')) problems.push('a carriage return, which ends a -- comment for Postgres but not for this reduction')
  const inList = listedPetIds.map((id) => `'${id}'`).join(', ')
  const kept: string[] = []
  sql.split('\n').forEach((line, i) => {
    // Only a space or a tab counts as leading whitespace: anything else before `--` may be a
    // token to Postgres, so that line is kept and then refused below.
    if (/^[ \t]*(?:--.*)?$/.test(line)) return
    const where = `line ${i + 1}`
    if (/[^\t\x20-\x7e]/.test(line)) problems.push(`${where}: a character outside printable ASCII and tab, which Postgres may read as part of a token`)
    if (/[$"\\]/.test(line)) problems.push(`${where}: a dollar quote, quoted identifier or backslash, which the reduction cannot read`)
    if (line.includes('/*') || line.includes('*/')) problems.push(`${where}: a block comment, which could hide a line from the reduction`)
    if ((line.match(/'/g) ?? []).length % 2 !== 0) problems.push(`${where}: a string left open at the end of the line`)
    kept.push(line.replace(/^[ \t]+|[ \t]+$/g, '').split(`p.id in (${inList})`).join(`p.id in (${SUBJECTS_TOKEN})`))
  })
  const text = kept.join('\n')
  if (!text.includes(`p.id in (${SUBJECTS_TOKEN})`)) {
    problems.push('no CTE names exactly the evaluation subjects, in the order evaluationSubjects.ts lists them')
  }
  return { text, problems }
}

export function exportQuerySha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
