// The shape export.sql must keep for the evaluation-subject rule to hold (CUL-1314).
//
// The list in evaluationSubjects.ts binds nothing unless the query uses it, and a test
// that only finds the clause is green over a clause that does nothing. The
// rls-privacy-reviewer pass on this change kept the first version of the check green by
// wrapping the clause in /* */, OR-ing another pet in after it, putting a subquery in the
// IN list, keying a data subquery on a literal id, hard-coding `pet_id`, and adding a
// third query. So this reads the file against an ALLOW-list of the shapes it uses today,
// never a deny-list:
//
//   · comments go in ONE left-to-right pass that knows strings and nested block comments
//     (C-18). A dollar quote, a quoted identifier or a prefixed string (E'', U&'') is
//     refused, because that pass cannot read it the way Postgres does;
//   · there are as many statements as `-- ── Query N` headers, and each one is
//     `with subj as (<the CTE>) select json_build_object(`;
//   · the CTE is exactly the id + owner pair AND the listed ids;
//   · after it: no uuid anywhere, `subjects` and `pet_id` read `subj`, and none of the
//     words the checks below would mis-split (NOT, IS, CASE, BETWEEN, UNION, ...);
//   · every `from <table>` is one table plus equi-JOINs whose ON is exactly
//     `a.col = b.col` over the joined alias and another, one side an `id`; and every
//     disjunct of its WHERE has a conjunct `<its alias>.id|pet_id = (select id from subj)`
//     or `<its alias>.id|pet_id in (select <inner alias>.col from ...)`, whose inner
//     select is held to the same rule. So an OR at a WHERE's own level is legal only
//     between branches that are each keyed on subj.
//
// What it cannot see, stated so it does not read as coverage (C-38):
//   · `execute_sql` runs whatever text a session sends. This binds the committed file,
//     not a session that edits it before running: the rule is followed, never enforced;
//   · it models the constructs export.sql uses, not SQL. It trusts that a column named
//     `id` is its table's key, and does not follow that the WHERE's alias reaches the FROM
//     table through the joins. A reviewer reading the diff is the check for those.

import { EVALUATION_SUBJECTS } from './evaluationSubjects.ts'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
const IDENT = '[a-z_][a-z0-9_]*'
// Words that would let a clause read one way to the splits below and another to Postgres.
const REFUSED_WORDS = /\b(not|is|case|between|union|intersect|except|lateral|natural|using|cross|full|right|exists|any|all|some)\b/

/** Comments blanked in one pass (newlines kept); strings copied through untouched. */
function stripComments(sql: string, problems: string[]): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') { out += ' '; i++ }
    } else if (c === '/' && next === '*') {
      let depth = 0
      do {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; out += '  '; i += 2 }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; out += '  '; i += 2 }
        else { out += sql[i] === '\n' ? '\n' : ' '; i++ }
      } while (depth > 0 && i < sql.length)
      if (depth > 0) problems.push('an unterminated block comment')
    } else if (c === "'") {
      if (/[a-z0-9_&]/i.test(sql[i - 1] ?? '')) problems.push('a prefixed string literal (E\'\', U&\'\', B\'\'), which the scan cannot read')
      let j = i + 1
      for (;;) {
        if (j >= sql.length) { problems.push('an unterminated string literal'); break }
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue }
        if (sql[j] === "'") break
        j++
      }
      out += sql.slice(i, j + 1)
      i = j + 1
    } else {
      if (c === '$') problems.push('a dollar sign (a dollar-quoted string or parameter), which the scan cannot read')
      if (c === '"') problems.push('a quoted identifier, which the scan cannot read')
      out += c
      i++
    }
  }
  return out
}

/** Whitespace collapsed, lower-cased, parens and commas spaced one way. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')')
    .replace(/ ?, ?/g, ', ').trim()
}

/** The same text with every string literal's contents turned to x, so indices line up. */
function blankStrings(s: string): string {
  return s.replace(/'(?:[^']|'')*'/g, (m) => `'${'x'.repeat(m.length - 2)}'`)
}

function closeOf(bare: string, open: number): number {
  let depth = 0
  for (let i = open; i < bare.length; i++) {
    if (bare[i] === '(') depth++
    else if (bare[i] === ')') { depth--; if (depth === 0) return i }
  }
  return -1
}

/** The innermost paren group around index i, as [open, close], or null at top level. */
function groupAround(bare: string, i: number): [number, number] | null {
  let depth = 0
  for (let j = i - 1; j >= 0; j--) {
    if (bare[j] === ')') depth++
    else if (bare[j] === '(') {
      if (depth === 0) return [j, closeOf(bare, j)]
      depth--
    }
  }
  return null
}

/** Split at ` <word> ` occurrences at paren depth 0. */
function splitTop(s: string, word: string): { parts: string[] } {
  const parts: string[] = []
  let depth = 0
  let start = 0
  const token = ` ${word} `
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth--
    else if (depth === 0 && s.startsWith(token, i)) {
      parts.push(s.slice(start, i))
      start = i + token.length
      i += token.length - 1
    }
  }
  parts.push(s.slice(start))
  return { parts }
}

/** `text` is the statement after its CTE with strings intact; `bare` is the same with them blanked. */
function bodyProblems(text: string, bare: string, where: string, problems: string[]): void {
  // Read with strings intact: blanked, a quoted victim id would be invisible.
  if (UUID.test(text)) problems.push(`${where}: a uuid outside the CTE (only the CTE may name a pet)`)
  for (const pin of ["'subjects', (select count(*) from subj)", "'pet_id', (select id from subj)"]) {
    if (!text.includes(pin)) problems.push(`${where}: missing ${pin} exactly as written (the loader trusts that label)`)
  }
  const refused = bare.match(REFUSED_WORDS)
  if (refused) problems.push(`${where}: "${refused[1]}" is not a construct the scan models`)
  if (/\b(?:from|join) \(/.test(bare)) problems.push(`${where}: a derived table, which the scan does not follow`)

  const fromRe = new RegExp(`\\bfrom (${IDENT}(?:\\.${IDENT})?)\\b`, 'g')
  for (const m of bare.matchAll(fromRe)) {
    const table = m[1]
    if (table === 'subj') continue
    const at = m.index ?? 0
    const group = groupAround(bare, at)
    if (!group) { problems.push(`${where}: "from ${table}" at the top level`); continue }
    const segment = bare.slice(at, group[1])
    const fw = splitTop(segment, 'where').parts
    if (fw.length !== 2) { problems.push(`${where}: "from ${table}" needs exactly one WHERE at its own level`); continue }
    const [fromClause, whereClause] = fw

    const aliases = new Set<string>()
    const fromMatch = fromClause.match(new RegExp(`^from ${IDENT}(?:\\.${IDENT})? (${IDENT})((?: (?:left )?join ${IDENT} ${IDENT} on ${IDENT}\\.${IDENT} = ${IDENT}\\.${IDENT})*)$`))
    if (!fromMatch) { problems.push(`${where}: "from ${table}" is not one table plus equi-joins`); continue }
    aliases.add(fromMatch[1])
    const joinRe = new RegExp(`join ${IDENT} (${IDENT}) on (${IDENT})\\.(${IDENT}) = (${IDENT})\\.(${IDENT})`, 'g')
    for (const j of fromMatch[2].matchAll(joinRe)) {
      const [, alias, a, ca, b, cb] = j
      const pair = new Set([a, b])
      if (a === b || !pair.has(alias) || ![...pair].some((x) => x !== alias && aliases.has(x)) || (ca !== 'id' && cb !== 'id')) {
        problems.push(`${where}: "join … ${alias} on ${a}.${ca} = ${b}.${cb}" must equate the joined alias with an earlier one, one side an id`)
      }
      aliases.add(alias)
    }
    if ([...aliases].includes('subj')) problems.push(`${where}: an alias named subj`)

    // An OR widens rows only at the WHERE's own level, so each branch there must be keyed
    // on subj by itself. An OR deeper down sits inside one conjunct and can only narrow.
    for (const d of splitTop(whereClause, 'or').parts) {
      const conjuncts = splitTop(d.trim(), 'and').parts.map((c) => c.trim())
      const restricted = conjuncts.some((c) => {
        const eq = c.match(new RegExp(`^(${IDENT})\\.(?:id|pet_id) = \\(select id from subj\\)$`))
        if (eq) return aliases.has(eq[1])
        const inSel = c.match(new RegExp(`^(${IDENT})\\.(?:id|pet_id) in \\(select (${IDENT})\\.${IDENT} from ${IDENT}(?:\\.${IDENT})? (${IDENT})\\b`))
        // The inner select reads its own alias (a correlated `select e.pet_id from meals m`
        // would admit every outer row), and the conjunct ends where its parens do.
        return inSel !== null && aliases.has(inSel[1]) && inSel[2] === inSel[3] &&
          closeOf(c, c.indexOf('(')) === c.length - 1
      })
      if (!restricted) problems.push(`${where}: "from ${table}" has a WHERE branch not keyed on subj: "${d.trim()}"`)
    }
  }
}

/** Why export.sql no longer holds the evaluation-subject rule; empty when it does. */
export function exportShapeProblems(sql: string): string[] {
  const problems: string[] = []
  const listed = [...EVALUATION_SUBJECTS.map((s) => s.petId)].sort()
  const headers = (sql.match(/^-- ── Query \d+/gm) ?? []).length
  const code = stripComments(sql, problems)
  const statements = blankStrings(code).split(';').map((s, i, all) => {
    // Split on the blanked text so a ';' inside a string cannot cut a statement,
    // then take the same span of the real text.
    const start = all.slice(0, i).reduce((n, p) => n + p.length + 1, 0)
    return code.slice(start, start + s.length)
  }).filter((s) => s.trim() !== '')
  if (headers === 0) problems.push('no "-- ── Query N" headers to count the statements against')
  if (statements.length !== headers) problems.push(`${statements.length} statements under ${headers} "Query" headers`)

  const cteRe = new RegExp(
    "^select p\\.id from pets p where p\\.id = '<pet uuid>' and p\\.user_id = " +
      "\\(select id from auth\\.users where email = '<owner email>'\\) and p\\.id in \\(('[^']*'(?:, '[^']*')*)\\)$",
  )
  statements.forEach((raw, i) => {
    const where = `statement ${i + 1}`
    const n = normalize(raw)
    const bare = blankStrings(n)
    if (!bare.startsWith('with subj as (')) { problems.push(`${where}: does not open with "with subj as ("`); return }
    const open = 'with subj as '.length
    const close = closeOf(bare, open)
    if (close < 0) { problems.push(`${where}: the CTE never closes`); return }
    const cte = n.slice(open + 1, close).match(cteRe)
    if (!cte) {
      problems.push(`${where}: the CTE is not exactly the id + owner pair AND the listed ids`)
    } else {
      const ids = [...cte[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).sort()
      if (ids.join() !== listed.join()) {
        problems.push(`${where}: the CTE lists ${ids.join(', ')}, not evaluationSubjects.ts's ${listed.join(', ')}`)
      }
    }
    const rest = bare.slice(close + 1)
    if (!rest.startsWith(' select json_build_object(')) { problems.push(`${where}: the CTE is not followed by "select json_build_object("`); return }
    bodyProblems(n.slice(close + 1), rest, where, problems)
  })
  return problems
}
