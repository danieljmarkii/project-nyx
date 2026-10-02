// CUL-1314 — export.sql runs as the service role, so its query is pinned to the version a
// privacy review traced. Read exportPin.ts for why it is a pin and not a model of the SQL.
//
// Every mutant below is the real file with one exact edit, and `mutate` throws when the
// edit does not land exactly where it says, so a mutant can never pass by silently not
// applying (C-35). They are the edits the two rls-privacy-reviewer passes got past the
// earlier versions of this check; each must now red.
import { readFileSync } from 'fs'
import { join } from 'path'

import { EVALUATION_SUBJECTS } from './evaluationSubjects'
import { ExportPin, exportQuerySha256, reduceExportQuery } from './exportPin'

// ── THE PIN ─────────────────────────────────────────────────────────────────────────────
// Changing export.sql's query reds the build here. The query runs as the service role and
// skips RLS, so before updating this: run the rls-privacy-reviewer on the new query (does
// every row it can return belong to the subject pet, for every edit it could not rule
// out?), then paste the new hash with that review's issue and date. A header comment edit
// does not change the hash.
const PIN: ExportPin = {
  sha256: 'd754728f47d7658598173516f510136f905f68a173123365946d1be879263464',
  review: 'rls-privacy-reviewer pass 1 on CUL-1314 traced every subquery through subj, 2026-09-26',
}

const SQL = readFileSync(join(__dirname, 'export.sql'), 'utf8')
const LISTED = EVALUATION_SUBJECTS.map((s) => s.petId)
const [A, B] = LISTED
const LIST = `and p.id in ('${A}', '${B}')`
const VICTIM = '11111111-2222-4333-8444-555555555555'
const EV = "from events e where e.pet_id = (select id from subj) and e.event_type <> 'meal'),"
const PET_ID = "'pet_id', (select id from subj),"
const KEPT = "  'subjects', (select count(*) from subj),"

function mutate(from: string, to: string, occurrence: 'only' | 'first' | 'last' = 'only'): string {
  const count = SQL.split(from).length - 1
  if (occurrence === 'only' && count !== 1) throw new Error(`mutant anchor matched ${count} times: ${from}`)
  if (count < 1) throw new Error(`mutant anchor not found: ${from}`)
  const at = occurrence === 'last' ? SQL.lastIndexOf(from) : SQL.indexOf(from)
  return SQL.slice(0, at) + to + SQL.slice(at + from.length)
}

/** Red when the reduction cannot read the file, or what it reads is not the pinned query. */
function verdict(sql: string, listed: readonly string[] = LISTED): string[] {
  const { text, problems } = reduceExportQuery(sql, listed)
  const sha = exportQuerySha256(text)
  return sha === PIN.sha256 ? problems : [...problems, `the query changed (sha256 ${sha})`]
}

describe('the pinned export query', () => {
  it('is the query export.sql executes today', () => {
    const { text, problems } = reduceExportQuery(SQL, LISTED)
    expect(problems).toEqual([])
    const sha = exportQuerySha256(text)
    if (sha !== PIN.sha256) {
      throw new Error(
        `export.sql's query changed (sha256 ${sha}). It runs as the service role: run the ` +
          'rls-privacy-reviewer on the new query, then update PIN in exportPin.test.ts with the ' +
          'new hash and that review. See exportPin.ts.',
      )
    }
  })

  it('names the review that traced it', () => {
    expect(PIN.review).toMatch(/rls-privacy-reviewer/)
    expect(PIN.review).toMatch(/\bCUL-\d+\b/)
    expect(PIN.review).toMatch(/\b\d{4}-\d{2}-\d{2}\b/)
  })

  it('carries both queries and the subject list in each (the floor under every mutant below)', () => {
    expect(SQL.match(/^-- ── Query \d+/gm)).toHaveLength(2)
    expect(SQL.split(LIST).length - 1).toBe(2)
    expect(reduceExportQuery(SQL, LISTED).text.split('<evaluation subjects>').length - 1).toBe(2)
  })
})

describe('what does not move the pin', () => {
  it('a header comment rewritten', () => {
    expect(verdict(mutate('-- Engine replay export (CUL-1117).', '-- The engine replay export, reworded (CUL-1117).'))).toEqual([])
  })
  it('a comment line added inside a query', () => {
    expect(verdict(mutate(`    ${LIST}`, `    -- a note for the next reader\n    ${LIST}`, 'first'))).toEqual([])
  })
  it('re-indentation and blank lines', () => {
    expect(verdict(SQL.replace(/\n {2}/g, '\n\t').replace(/\n\n/g, '\n\n\n'))).toEqual([])
  })
})

describe('the subject list and the SQL cannot drift', () => {
  it('reds when evaluationSubjects.ts gains a pet the SQL does not name', () => {
    expect(verdict(SQL, [...LISTED, VICTIM])).toEqual(expect.arrayContaining([expect.stringMatching(/no CTE names exactly the evaluation subjects/)]))
  })
  it('reds when the SQL gains a pet evaluationSubjects.ts does not name', () => {
    expect(verdict(mutate(LIST, `and p.id in ('${A}', '${B}', '${VICTIM}')`, 'first'))).toEqual(
      expect.arrayContaining([expect.stringMatching(/the query changed/)]),
    )
  })
  it('reds when one query drops a listed pet', () => {
    expect(verdict(mutate(LIST, `and p.id in ('${A}')`, 'last'))).toEqual(expect.arrayContaining([expect.stringMatching(/the query changed/)]))
  })
})

describe('every edit the reviewer passes got past earlier checks, each red', () => {
  const changed = /the query changed/
  const cases: [string, string, RegExp][] = [
    // Pass 1, against the presence check.
    ['the clause in a block comment', mutate(LIST, `/* ${LIST} */`, 'first'), /block comment/],
    ['an OR after the clause', mutate(LIST, `${LIST}\n    or p.id = '${VICTIM}'`, 'first'), changed],
    ['a subquery in the IN list', mutate(LIST, `and p.id in (select id from pets where id <> '${A}' or id <> '${B}')`, 'first'), changed],
    ['a third query', `${SQL}\nselect json_agg(e.id) from events e;\n`, changed],
    ['a second CTE in the same WITH', mutate(`${LIST}\n)\nselect json_build_object(`, `${LIST}\n), other as (select id from pets)\nselect json_build_object(`, 'first'), changed],
    ['a data subquery keyed on a literal id', mutate('from events e where e.pet_id = (select id from subj)', `from events e where e.pet_id = '${VICTIM}'`), changed],
    ['pet_id hard-coded to a listed pet', mutate(PET_ID, `'pet_id', '${A}',`, 'first'), changed],
    ["an OR after a -- inside a string", mutate("e.event_type <> 'meal'),", "e.event_type <> 'meal--' or true),"), changed],
    // Pass 2, against an allow-list over the query's shapes (the version before this pin).
    ['an OR glued to parens', mutate(EV, "from events e where e.pet_id = (select id from subj) and (e.event_type <> 'meal')or(true)),"), changed],
    ['an OR glued to a string', mutate(EV, "from events e where e.pet_id = (select id from subj) and e.event_type <> 'meal'or true),"), changed],
    ['a join from subj on <>', mutate(EV, "from subj s join events e on e.pet_id <> s.id where e.event_type <> 'meal'),"), changed],
    ['a comma cross join from subj', mutate(EV, 'from subj, events e),'), changed],
    ['query_to_xml reading a table named in a string', mutate(PET_ID, `${PET_ID}\n  'x', query_to_xml('select * from events', true, false, ''),`, 'first'), changed],
    ['a derived table glued to from', mutate(PET_ID, `${PET_ID}\n  'x', (select json_agg(e.id) from(select 1) t join events e on true),`, 'first'), changed],
    ['subj shadowed by an inner CTE', mutate("'events', (select json_agg(json_build_object(", `'events', (with subj(id) as (select '${VICTIM.replace(/-/g, '')}'::uuid) select json_agg(json_build_object(`), changed],
    ['a lone CR ending a -- comment for Postgres only', mutate(`    ${LIST}`, `    ${LIST} --\r or p.id = '${VICTIM}'`, 'first'), /carriage return/],
    ['a duplicate pet_id key', mutate('where a.pet_id = (select id from subj))\n) as dump;', `where a.pet_id = (select id from subj)), 'pet_id', '${A.replace(/-/g, '')}'::uuid\n) as dump;`), changed],
    ['a fan-out join to every pet of the owner', mutate(EV, "from events e join pets v on v.id = e.pet_id join user_profiles u on u.id = v.user_id join pets p on p.user_id = u.id where p.id = (select id from subj) and e.event_type <> 'meal'),"), changed],
    // Constructs that could make Postgres read a dropped comment line as code. Each is refused
    // outright, not only because it moves the hash today: once a pin blessed one, an edit to
    // the dropped line inside it would not move the hash at all.
    ['a lone CR inside a whole-line comment (the hash cannot see this one)', mutate(`    ${LIST}`, `    -- a note\r or p.id = '${VICTIM}'\n    ${LIST}`, 'first'), /carriage return/],
    // Pass 3, against the first version of this pin: characters JS `trim()` drops and
    // Postgres reads as part of a token, and spaces collapsed inside a string literal.
    ['a vertical tab before a comment line', mutate(KEPT, `\u000b-- a note\n${KEPT}`, 'first'), /outside printable ASCII/],
    ['an NBSP before a comment line', mutate(KEPT, `\u00a0-- a note\n${KEPT}`, 'first'), /outside printable ASCII/],
    ['a trailing NBSP on a kept line', mutate(KEPT, `${KEPT}\u00a0`, 'first'), /outside printable ASCII/],
    ['a trailing U+2028 on a kept line', mutate(KEPT, `${KEPT}\u2028`, 'first'), /outside printable ASCII/],
    ['a trailing BOM on a kept line', mutate(KEPT, `${KEPT}\ufeff`, 'first'), /outside printable ASCII/],
    ['a form feed before a comment line', mutate(KEPT, `\f-- a note\n${KEPT}`, 'first'), /outside printable ASCII/],
    ['spaces changed inside a string literal', mutate("where p.id = '<pet uuid>'", "where p.id = '<pet  uuid>'", 'first'), changed],
    ['a string left open across a comment line', mutate(PET_ID, `${PET_ID}\n  'x', 'open\n-- or true\n',`, 'first'), /string left open/],
    ['a dollar quote', mutate(PET_ID, `${PET_ID}\n  'x', $$\n-- or true\n$$,`, 'first'), /dollar quote/],
    ['an E-string escape', mutate(PET_ID, `${PET_ID}\n  'x', E'it\\'s`, 'first'), /backslash/],
  ]
  it.each(cases)('%s', (_name, sql, rule) => {
    expect(verdict(sql)).toEqual(expect.arrayContaining([expect.stringMatching(rule)]))
  })
})
