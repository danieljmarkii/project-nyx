// CUL-2308 — export.sql runs as the service role, so its query is pinned to the version a
// privacy review traced. The reduction and its reasons are engine-replay's (exportPin.ts,
// CUL-1314): a pin, not a model of the SQL, because proving a query narrow by reading it
// failed seventeen ways.
//
// Each mutant below is the real file with one exact edit, and `mutate` throws when the
// edit does not land exactly where it says, so a mutant never passes by not applying (C-35).
import { readFileSync } from 'fs'
import { join } from 'path'

import { EVALUATION_SUBJECTS } from '../engine-replay/evaluationSubjects'
import { type ExportPin, exportQuerySha256, reduceExportQuery } from '../engine-replay/exportPin'
import { READS } from './reads'

// ── THE PIN ─────────────────────────────────────────────────────────────────────────────
// Changing export.sql's query reds the build here. Before updating it: run the
// rls-privacy-reviewer on the new query (can any row it returns belong to anyone but the
// subject pet and its owner, or carry a column no render needs?), then paste the new hash
// with that review's issue and date. A comment edit does not change the hash.
const PIN: ExportPin = {
  sha256: 'ba287fe3d0a4a4e74be22373f35bff77eb8bb8f30f010e4d4af7b9e57982d01a',
  review: 'pending: rls-privacy-reviewer pass on CUL-2308',
}

const SQL = readFileSync(join(__dirname, 'export.sql'), 'utf8')
const LISTED = EVALUATION_SUBJECTS.map((s) => s.petId)

function mutate(from: string, to: string): string {
  const count = SQL.split(from).length - 1
  if (count !== 1) throw new Error(`mutant anchor matched ${count} times: ${from}`)
  return SQL.replace(from, to)
}

function verdict(sql: string): string[] {
  const { text, problems } = reduceExportQuery(sql, LISTED)
  const sha = exportQuerySha256(text)
  return sha === PIN.sha256 ? problems : [...problems, `the query changed (sha256 ${sha})`]
}

describe('the pinned report-preview export', () => {
  it('is the query export.sql executes today', () => {
    const { text, problems } = reduceExportQuery(SQL, LISTED)
    expect(problems).toEqual([])
    const sha = exportQuerySha256(text)
    if (sha !== PIN.sha256) {
      throw new Error(
        `export.sql's query changed (sha256 ${sha}). It runs as the service role: run the ` +
          'rls-privacy-reviewer on the new query, then update PIN here with the new hash and that review.',
      )
    }
  })

  it('names the review that traced it', () => {
    expect(PIN.review).toMatch(/rls-privacy-reviewer/)
    expect(PIN.review).toMatch(/\bCUL-\d+\b/)
    expect(PIN.review).toMatch(/\b\d{4}-\d{2}-\d{2}\b/)
  })

  it('returns exactly the reads reads.ts serves, plus meta, each once', () => {
    const names = [...SQL.matchAll(/^\s*select '([a-z_]+)'(?: as read)?, /gm)].map((m) => m[1])
    expect(names.sort()).toEqual(['meta', ...READS.map((r) => r.name)].sort())
  })

  it('names the subject by id paired with its owner, once, among the listed subjects only', () => {
    expect(SQL.split("where email = '<owner email>'").length - 1).toBe(1)
    expect(SQL.split("where p.id = '<pet uuid>'").length - 1).toBe(1)
    expect(reduceExportQuery(SQL, LISTED).text.split('<evaluation subjects>').length - 1).toBe(1)
  })
})

describe('what does not move the pin', () => {
  it('a header comment rewritten', () => {
    expect(verdict(mutate('-- Report preview export (CUL-2308).', '-- The report preview export (CUL-2308).'))).toEqual([])
  })
})

describe('widening edits that red the build', () => {
  const list = `('${LISTED[0]}', '${LISTED[1]}')`
  it.each([
    ['the subject list dropped', `    and p.id in ${list}\n`, ''],
    ['the owner pairing dropped', "    and p.user_id = (select id from auth.users where email = '<owner email>')\n", ''],
    ['the household widened past the owner', 'from pets h where h.user_id = (select user_id from subj) and h.is_active = true', 'from pets h where h.is_active = true'],
    ['a food embed unscoped', 'from food_items fi where fi.id = fa.food_item_id and fi.created_by_user_id = (select user_id from subj))', 'from food_items fi where fi.id = fa.food_item_id)'],
    ['look notes selected', "'notes', null, 'vocab_version'", "'notes', l.notes, 'vocab_version'"],
    ['the real storage path selected', "'storage_path', 'withheld/' || ea.id::text,", "'storage_path', ea.storage_path,"],
    ['the full allowlist selected', "      'value', case when jsonb_typeof(c.value -> 'allowlist') = 'array'", "      'value', c.value, 'x', case when jsonb_typeof(c.value -> 'allowlist') = 'array'"],
  ])('%s', (_name, from, to) => {
    expect(verdict(mutate(from, to)).length).toBeGreaterThan(0)
  })
})
