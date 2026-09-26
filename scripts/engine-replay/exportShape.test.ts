// CUL-1314 — export.sql keeps the shape that makes the evaluation-subject list bind.
//
// Every mutant is the real file with one exact edit, and `mutate` fails when the edit
// does not land exactly once, so a mutant can never pass by silently not applying
// (C-35: a fixture production cannot produce is green over nothing). The first block is
// the rls-privacy-reviewer's list, each of which kept the first version of this check
// green; the rest are the neighbouring constructs the allow-list refuses.
import { readFileSync } from 'fs'
import { join } from 'path'

import { EVALUATION_SUBJECTS } from './evaluationSubjects'
import { exportShapeProblems } from './exportShape'

const SQL = readFileSync(join(__dirname, 'export.sql'), 'utf8')
const [A, B] = EVALUATION_SUBJECTS.map((s) => s.petId)
const LIST = `and p.id in ('${A}', '${B}')`
const VICTIM = '00000000-0000-4000-8000-00000000beef'

function mutate(from: string, to: string, occurrence: 'first' | 'last' | 'all' = 'all'): string {
  const count = SQL.split(from).length - 1
  if (occurrence === 'all' && count !== 1) throw new Error(`mutant anchor matched ${count} times: ${from}`)
  if (occurrence !== 'all' && count < 1) throw new Error(`mutant anchor not found: ${from}`)
  const at = occurrence === 'last' ? SQL.lastIndexOf(from) : SQL.indexOf(from)
  return SQL.slice(0, at) + to + SQL.slice(at + from.length)
}

describe('exportShapeProblems over the real export.sql', () => {
  it('finds nothing wrong with the committed file', () => {
    expect(exportShapeProblems(SQL)).toEqual([])
  })

  it('reads two statements, both carrying the list (the floor under every mutant below)', () => {
    expect(SQL.split(LIST).length - 1).toBe(2)
    expect(EVALUATION_SUBJECTS.length).toBeGreaterThanOrEqual(2)
  })
})

describe('the reviewer mutants, each red', () => {
  const cases: [string, string, RegExp][] = [
    ['M11: the clause wrapped in a block comment', mutate(LIST, `/* ${LIST} */`, 'first'), /CTE is not exactly/],
    ['M1: an OR after the clause', mutate(LIST, `${LIST}\n    or p.id = '${VICTIM}'`, 'first'), /CTE is not exactly/],
    ['M2: an OR IN after the clause', mutate(LIST, `${LIST}\n    or p.id in ('${VICTIM}')`, 'last'), /CTE is not exactly/],
    ['M9: a parenthesised WHERE with an OR outside it',
      mutate(`  where p.id = '<pet uuid>'`, `  where (p.id = '<pet uuid>'`, 'first')
        .replace(LIST, `${LIST})\n    or p.id = '${VICTIM}'`), /CTE is not exactly/],
    ['M3: a subquery in the IN list', mutate(LIST, `and p.id in (select id from pets where id <> '${A}' or id <> '${B}')`, 'first'), /CTE is not exactly/],
    ['M4: a commented list and a subquery', mutate(LIST, `and p.id in (/* '${A}', '${B}' */ select id from pets)`, 'first'), /CTE is not exactly/],
    ['M5: a third query under its own header with another CTE',
      `${SQL}\n-- ── Query 3: more\nwith other as (select id from pets) select json_build_object('x', (select json_agg(e.id) from events e));\n`,
      /does not open with "with subj as \("/],
    ['M5b: a third statement with no header and no CTE', `${SQL}\nselect json_agg(e.id) from events e;\n`, /3 statements under 2/],
    ['M6: a second CTE in the same WITH',
      mutate(`${LIST}\n)\nselect json_build_object(`, `${LIST}\n), other as (select id from pets)\nselect json_build_object(`, 'first'),
      /not followed by "select json_build_object\("/],
    ['M7: a data subquery keyed on a literal id',
      mutate(`from events e where e.pet_id = (select id from subj)`, `from events e where e.pet_id = '${VICTIM}'`), /uuid outside the CTE/],
    ['M8: pet_id hard-coded to a listed pet', mutate(`'pet_id', (select id from subj),`, `'pet_id', '${A}',`, 'first'), /uuid outside the CTE/],
    ['M8b: pet_id no longer read from subj', mutate(`'pet_id', (select id from subj),`, `'pet_id', null,`, 'first'), /missing 'pet_id', \(select id from subj\)/],
    ['M8c: the subject count no longer read from subj', mutate(`'subjects', (select count(*) from subj),`, `'subjects', 1,`, 'last'), /missing 'subjects', \(select count\(\*\) from subj\)/],
    ['M10: an OR hidden after a -- inside a string',
      mutate(`e.event_type <> 'meal'),`, `e.event_type <> 'meal--' or true),`), /WHERE branch not keyed on subj: "true"/],
  ]
  it.each(cases)('%s', (_name, sql, rule) => {
    expect(exportShapeProblems(sql)).toEqual(expect.arrayContaining([expect.stringMatching(rule)]))
  })
})

describe('the constructs around them, each red', () => {
  const cases: [string, string, RegExp][] = [
    ['one listed id dropped from the second query', mutate(`, '${B}')`, `)`, 'last'), /the CTE lists/],
    ['an unlisted id added to the first query', mutate(LIST, `and p.id in ('${A}', '${B}', '${VICTIM}')`, 'first'), /the CTE lists/],
    ['the clause removed', mutate(`\n    ${LIST}`, '', 'first'), /CTE is not exactly/],
    ['the clause commented out with --', mutate(`    ${LIST}`, `    -- ${LIST}`, 'first'), /CTE is not exactly/],
    ['a nested block comment Postgres reads as one comment', mutate(LIST, `/* /* */ ${LIST} */`, 'first'), /CTE is not exactly/],
    ['an upper-case OR', mutate(LIST, `${LIST} OR TRUE`, 'first'), /CTE is not exactly/],
    ['a subquery with no pet filter at all',
      mutate(`from events e where e.pet_id = (select id from subj) and e.event_type <> 'meal'`, `from events e where e.event_type <> 'meal'`),
      /"from events" has a WHERE branch not keyed on subj/],
    ['a subquery keyed on another alias', mutate(`where e.pet_id = (select id from subj) and e.event_type = 'meal'`, `where x.pet_id = (select id from subj) and e.event_type = 'meal'`),
      /"from events" has a WHERE branch not keyed on subj/],
    ['a join on true', mutate('left join food_items fi on fi.id = fa.food_item_id', 'left join food_items fi on true'), /not one table plus equi-joins/],
    ['a join on a column that is not a key', mutate('join meals m on m.event_id = e.id', 'join meals m on m.pet_id = e.pet_id'), /one side an id/],
    ['a comma cross join', mutate('from events e join meals m', 'from events e, meals m2 join meals m'), /not one table plus equi-joins/],
    ['a correlated inner select',
      mutate('f.id in (select m.food_item_id from meals m', 'f.id in (select f.id from meals m'), /"from food_items" has a WHERE branch not keyed on subj/],
    ['an OR branch with no pet filter',
      mutate('or f.id in (select fa.food_item_id from feeding_arrangements fa where fa.pet_id = (select id from subj)))', "or f.brand <> '')"),
      /WHERE branch not keyed on subj: "f\.brand <> 'x*'"/],
    ['a NOT in front of the key', mutate('from events e where e.pet_id', 'from events e where not e.pet_id'), /"not" is not a construct/],
    ['a UNION', mutate(`and e.event_type <> 'meal'),`, `and e.event_type <> 'meal' union select * from events),`), /"union" is not a construct/],
    ['a derived table', mutate('from feeding_arrangements fa left join', 'from (select * from feeding_arrangements) fa left join'), /derived table/],
    ['an E-string', mutate(`e.event_type <> 'meal'),`, `e.event_type <> E'meal'),`), /prefixed string literal/],
    ['a dollar quote', mutate(`e.event_type <> 'meal'),`, 'e.event_type <> $$meal$$),'), /dollar sign/],
    ['an alias named subj', mutate('from events e join meals m on m.event_id = e.id', 'from events subj join meals m on m.event_id = subj.id'), /alias named subj/],
  ]
  it.each(cases)('%s', (_name, sql, rule) => {
    expect(exportShapeProblems(sql)).toEqual(expect.arrayContaining([expect.stringMatching(rule)]))
  })
})
