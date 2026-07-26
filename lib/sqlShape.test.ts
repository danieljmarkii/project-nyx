// B-057 — a static shape guard over every hand-written local-SQLite statement.
//
// WHY THIS EXISTS. The hydrate/upsert SQL in lib/sync.ts (and every other local
// write path) is hand-written, and each statement carries FOUR parallel lists
// that must agree:
//
//     INSERT INTO meals (a, b, c)        ← the column list
//     VALUES (?,?,?)                     ← the value slots
//     ON CONFLICT(id) DO UPDATE SET      ← the excluded.* refresh clause
//       a=excluded.a, b=excluded.b
//     WHERE meals.synced = 1             ← the table name, re-typed
//   , [row.a, row.b, row.c]              ← the param array
//
// Phase 2 shipped a real break of exactly this kind — 10 columns against 9
// placeholders — which threw on EVERY meal hydrate-write, was swallowed by the
// surrounding try/catch, and was invisible to a fully green suite. jest has no
// native SQLite in the RN app process, so nothing executed the statement; the
// break was caught by adversarial review, not by a test. This is the backlog's
// option (a): assert the lists agree by PARSING THE SOURCE, which needs no
// database at all and therefore cannot be defeated by a swallowed exception.
//
// It is deliberately wider than B-057's original lib/sync.ts scope: the same
// four-list drift is available in every file that writes local SQL by hand, at
// zero extra cost here. Adding a new local write path automatically enrols it —
// and STATEMENT_FLOOR below makes a parser that silently stops matching fail the
// build rather than pass vacuously.
//
// What it does NOT check: that a column exists in the schema, or that a param's
// VALUE is right. Those are hydration.test.ts (real node:sqlite) and the
// per-module suites. This file only proves the four lists count out the same.

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

/** Every file that writes hand-written local SQLite SQL. New write paths belong here. */
const SQL_SOURCE_FILES = [
  'lib/sync.ts',
  'lib/db.ts',
  'lib/meals.ts',
  'lib/weight.ts',
  'lib/medicationDose.ts',
  'lib/feedingArrangements.ts',
  'lib/dietTrialSetup.ts',
  'lib/dietTrialMirror.ts',
];

// Floors, not equalities: adding a statement must not fail the build, but a
// parser that silently stops recognising call sites must. These were the counts
// when this guard was written (2026-07-26).
const STATEMENT_FLOOR = 60;
const INSERT_FLOOR = 20;

// ── Source scanning ───────────────────────────────────────────────────────────

/**
 * Blank out comments and string/template contents while PRESERVING every index,
 * so bracket matching below can never be thrown off by a `)` inside a comment or
 * a SQL string. Code inside a `${...}` interpolation is left intact — it is real
 * code whose brackets still have to balance.
 */
function maskSource(src: string): string {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const blank = (k: number) => { if (src[k] !== '\n') out[k] = ' '; };

  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') blank(i++);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      blank(i); blank(i + 1); i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) blank(i++);
      if (i < n) { blank(i); blank(i + 1); i += 2; }
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      blank(i++);
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') { blank(i++); if (i < n) blank(i++); continue; }
        blank(i++);
      }
      if (i < n) blank(i++);
      continue;
    }
    if (c === '`') {
      blank(i++);
      let braceDepth = 0;
      while (i < n) {
        if (src[i] === '\\') { blank(i++); if (i < n) blank(i++); continue; }
        if (braceDepth === 0 && src[i] === '$' && src[i + 1] === '{') { braceDepth = 1; i += 2; continue; }
        if (braceDepth > 0) {
          if (src[i] === '{') braceDepth++;
          else if (src[i] === '}' && --braceDepth === 0) { i++; continue; }
          i++;
          continue;
        }
        if (src[i] === '`') { blank(i++); break; }
        blank(i++);
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Index of the bracket closing the one that opens at `start`. -1 if unbalanced. */
function matchBracket(masked: string, start: number): number {
  let depth = 0;
  for (let i = start; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (--depth === 0) return i;
    }
  }
  return -1;
}

/** Top-level (depth-1) comma-separated spans inside the bracket pair opening at `start`. */
function splitTopLevel(masked: string, start: number): Array<[number, number]> {
  const parts: Array<[number, number]> = [];
  let depth = 0;
  let from = start + 1;
  for (let i = start; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (--depth === 0) { parts.push([from, i]); break; }
    } else if (c === ',' && depth === 1) {
      parts.push([from, i]);
      from = i + 1;
    }
  }
  // A trailing comma before the closer yields a final empty span — not an argument.
  while (parts.length && !parts[parts.length - 1][0]) parts.pop();
  return parts;
}

interface CallSite {
  file: string;
  line: number;
  method: string;
  /** Raw source of each argument, trimmed. */
  args: string[];
}

function findCallSites(file: string, src: string): CallSite[] {
  const masked = maskSource(src);
  const sites: CallSite[] = [];
  const re = /\.(runAsync|getAllAsync|getFirstAsync|execAsync)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const open = m.index + m[0].length - 1;
    const close = matchBracket(masked, open);
    if (close < 0) continue;
    const spans = splitTopLevel(masked, open);
    const args = spans
      .map(([a, b]) => src.slice(a, b).trim())
      .filter((a) => a.length > 0); // drop the empty span a trailing comma leaves
    sites.push({ file, line: src.slice(0, m.index).split('\n').length, method: m[1], args });
  }
  return sites;
}

/** Module-level `const NAME = \`…\`` SQL constants, so a call site passing an identifier resolves. */
function collectSqlConstants(files: Array<{ file: string; src: string }>): Map<string, string> {
  const consts = new Map<string, string>();
  for (const { src } of files) {
    for (const m of src.matchAll(/^(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*`([\s\S]*?)`/gm)) {
      consts.set(m[1], m[2]);
    }
  }
  return consts;
}

/** The SQL text of an argument, or null when it is not a static literal/constant. */
function resolveSql(arg: string, consts: Map<string, string>): string | null {
  if (arg.startsWith('`') && arg.endsWith('`')) return arg.slice(1, -1);
  if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
    return arg.slice(1, -1);
  }
  return consts.get(arg) ?? null;
}

/** Top-level element count of a literal param array, or null when it is dynamic. */
function paramCount(arg: string | undefined): number | null {
  if (!arg || !arg.startsWith('[')) return null; // an identifier / spread-built array
  const masked = maskSource(arg);
  if (matchBracket(masked, 0) !== masked.length - 1) return null;
  const spans = splitTopLevel(masked, 0);
  const items = spans.map(([a, b]) => arg.slice(a, b).trim()).filter((s) => s.length > 0);
  if (items.some((s) => s.startsWith('...'))) return null; // spread ⇒ length unknown statically
  return items.length;
}

// ── Parsed corpus (built once) ────────────────────────────────────────────────

const SOURCES = SQL_SOURCE_FILES.map((file) => ({
  file,
  src: readFileSync(join(ROOT, file), 'utf8'),
}));
const SQL_CONSTANTS = collectSqlConstants(SOURCES);
const CALL_SITES = SOURCES.flatMap(({ file, src }) => findCallSites(file, src));

const INSERT_RE =
  /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([A-Za-z_]\w*)\s*\(([^()]*)\)\s*VALUES\s*\(([^()]*)\)/i;

interface InsertStatement {
  site: CallSite;
  sql: string;
  table: string;
  columns: string[];
  slots: string[];
}

const splitList = (s: string): string[] =>
  s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);

const STATEMENTS = CALL_SITES.map((site) => ({ site, sql: resolveSql(site.args[0], SQL_CONSTANTS) }))
  .filter((s): s is { site: CallSite; sql: string } => s.sql !== null);

const INSERTS: InsertStatement[] = STATEMENTS.flatMap(({ site, sql }) => {
  const m = INSERT_RE.exec(sql);
  if (!m) return [];
  return [{ site, sql, table: m[1], columns: splitList(m[2]), slots: splitList(m[3]) }];
});

const where = (s: { site: CallSite }) => `${s.site.file}:${s.site.line}`;

// ── The guard ─────────────────────────────────────────────────────────────────

describe('local SQL statement shape (B-057)', () => {
  it('parses the corpus it claims to guard', () => {
    // A parser that stops recognising call sites would otherwise make every
    // assertion below pass vacuously. These floors are what makes the suite honest.
    expect(STATEMENTS.length).toBeGreaterThanOrEqual(STATEMENT_FLOOR);
    expect(INSERTS.length).toBeGreaterThanOrEqual(INSERT_FLOOR);
    // Every file in the list must actually contribute — either a parsed call site
    // or an exported SQL constant a call site elsewhere resolves. A rename that
    // silently empties one of them is drift too.
    for (const { file, src } of SOURCES) {
      const contributes =
        STATEMENTS.some((s) => s.site.file === file) ||
        [...SQL_CONSTANTS.keys()].some((name) => new RegExp(`const\\s+${name}\\b`).test(src));
      expect({ file, contributes }).toEqual({ file, contributes: true });
    }
  });

  it('recognises every INSERT it encounters (no statement is silently skipped)', () => {
    const unparsed = STATEMENTS.filter(
      (s) => /INSERT\s+(?:OR\s+\w+\s+)?INTO/i.test(s.sql) && !INSERT_RE.test(s.sql),
    ).map(where);
    expect(unparsed).toEqual([]);
  });

  it.each(INSERTS.map((s) => [where(s), s] as const))(
    '%s — column list and VALUES slots are the same length',
    (_label, stmt) => {
      // The literal Phase-2 break: 10 columns, 9 placeholders.
      expect({ table: stmt.table, columns: stmt.columns.length, slots: stmt.slots.length })
        .toEqual({ table: stmt.table, columns: stmt.columns.length, slots: stmt.columns.length });
    },
  );

  it.each(
    INSERTS.filter((s) => paramCount(s.site.args[1]) !== null).map((s) => [where(s), s] as const),
  )('%s — `?` placeholders and the param array agree', (_label, stmt) => {
    const placeholders = (stmt.sql.match(/\?/g) ?? []).length;
    expect({ table: stmt.table, placeholders }).toEqual({
      table: stmt.table,
      placeholders: paramCount(stmt.site.args[1]),
    });
  });

  it.each(
    STATEMENTS.filter(
      (s) => !s.sql.includes('${') && paramCount(s.site.args[1]) !== null,
    ).map((s) => [where(s), s] as const),
  )('%s — non-INSERT statements bind every `?` too', (_label, stmt) => {
    const placeholders = (stmt.sql.match(/\?/g) ?? []).length;
    expect(placeholders).toBe(paramCount(stmt.site.args[1]));
  });

  it.each(INSERTS.map((s) => [where(s), s] as const))(
    '%s — every `excluded.<col>` names a column the INSERT actually writes',
    (_label, stmt) => {
      // The silent half of the drift: `excluded.foo` where `foo` is not in the
      // column list is not a syntax error the type-checker can see, and SQLite
      // only complains at runtime — inside the swallowed try/catch.
      const referenced = [...stmt.sql.matchAll(/\bexcluded\.(\w+)/gi)].map((m) => m[1]);
      const unknown = [...new Set(referenced)].filter((c) => !stmt.columns.includes(c));
      expect(unknown).toEqual([]);
    },
  );

  it.each(
    INSERTS.filter((s) => /DO\s+UPDATE\s+SET/i.test(s.sql)).map((s) => [where(s), s] as const),
  )('%s — every DO UPDATE SET target is a column the INSERT writes', (_label, stmt) => {
    const setClause = /DO\s+UPDATE\s+SET\b([\s\S]*?)(?:\bWHERE\b[\s\S]*)?$/i.exec(stmt.sql)?.[1] ?? '';
    const targets = [...setClause.matchAll(/(?:^|,)\s*([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]);
    const unknown = [...new Set(targets)].filter((c) => !stmt.columns.includes(c));
    expect(unknown).toEqual([]);
  });

  it.each(
    INSERTS.filter((s) => /ON\s+CONFLICT\s*\(/i.test(s.sql)).map((s) => [where(s), s] as const),
  )('%s — the ON CONFLICT target names columns the INSERT writes', (_label, stmt) => {
    const target = /ON\s+CONFLICT\s*\(([^)]*)\)/i.exec(stmt.sql)?.[1] ?? '';
    const unknown = splitList(target).filter((c) => !stmt.columns.includes(c));
    expect(unknown).toEqual([]);
  });

  it.each(
    INSERTS.filter((s) => /WHERE\s+\w+\.\w+/i.test(s.sql)).map((s) => [where(s), s] as const),
  )('%s — the DO UPDATE guard names the table being inserted into', (_label, stmt) => {
    // `WHERE meals.synced = 1` copy-pasted onto the weight_checks statement would
    // silently reference a table not in the statement — SQLite resolves it to a
    // different row source or errors at runtime. Cheap to catch here.
    const guarded = [...stmt.sql.matchAll(/\bWHERE\s+([A-Za-z_]\w*)\./gi)].map((m) => m[1]);
    for (const t of new Set(guarded)) expect(t).toBe(stmt.table);
  });
});
