// Proves that a SQL string is a READ, or says why it cannot (CUL-1616). The gate's
// question is never "does this write?" — a denylist of write words loses to the first
// spelling it did not list — but "can I show this only reads?", answered by an
// allowlist: every statement starts with a read keyword, no write keyword appears
// anywhere, and every function it calls is a known read-only built-in. Anything this
// module cannot prove is returned as NOT a read, and the gate asks a person.
//
// The lexer is ONE left-to-right pass (CLAUDE.md C-18: independent passes each read
// delimiters the other owns). It follows PostgreSQL's own lexer on the points a hidden
// write could exploit: nested block comments, `''` inside strings, E'' backslash
// escapes, dollar quotes (a `$` inside an identifier never opens one), and quoted
// identifiers kept as their own token so `"rpc"()` stays a call. Where PostgreSQL's
// reading depends on a setting this code cannot see, the input is refused instead:
// a backslash in a plain '…' string (its meaning flips with
// standard_conforming_strings), non-ASCII outside a string, a stray control character,
// and anything unterminated.

export type SqlRead = { read: true } | { read: false; why: string };

type Tok =
  | { k: 'word'; v: string } // unquoted identifier or keyword, lowercased
  | { k: 'qid' } // "quoted identifier": never a keyword, never a known function
  | { k: 'str' } // a string literal of any form; its content is gone
  | { k: 'num' }
  | { k: 'param' } // $1
  | { k: 'punct'; v: string } // ( ) [ ] , ; . : ::
  | { k: 'op'; v: string };

type Lexed = { toks: Tok[] } | { error: string };

const WS = new Set([' ', '\t', '\n', '\r', '\f']);
const OP_CHARS = new Set(['+', '-', '*', '/', '<', '>', '=', '~', '!', '@', '#', '%', '^', '&', '|', '`', '?']);
const PUNCT = new Set(['(', ')', '[', ']', ',', ';', '.']);
const isIdentStart = (c: string): boolean => /^[A-Za-z_]$/.test(c);
const isIdentCont = (c: string): boolean => /^[A-Za-z0-9_$]$/.test(c);
const NUMBER = /^(?:0[xX][0-9A-Fa-f_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/;
const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/;

export function lexSql(sql: string): Lexed {
  const toks: Tok[] = [];
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    if (WS.has(c)) {
      i++;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n' && sql[i] !== '\r') i++;
    } else if (c === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      if (depth > 0) return { error: 'an unterminated /* comment */' };
    } else if (c === "'") {
      const end = plainStringEnd(sql, i + 1);
      if (end === -1) return { error: 'an unterminated string' };
      if (end === -2) return { error: "a backslash inside a plain '…' string, whose meaning depends on standard_conforming_strings" };
      toks.push({ k: 'str' });
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= n) return { error: 'an unterminated "quoted identifier"' };
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') j += 2;
          else break;
        } else j++;
      }
      toks.push({ k: 'qid' });
      i = j + 1;
    } else if (c === '$') {
      if (/[0-9]/.test(sql[i + 1] ?? '')) {
        i++;
        while (i < n && /[0-9]/.test(sql[i])) i++;
        toks.push({ k: 'param' });
      } else {
        const m = DOLLAR_TAG.exec(sql.slice(i));
        if (!m) return { error: 'a stray $' };
        const close = sql.indexOf(m[0], i + m[0].length);
        if (close === -1) return { error: `an unterminated ${m[0]} dollar quote` };
        toks.push({ k: 'str' });
        i = close + m[0].length;
      }
    } else if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentCont(sql[j])) j++;
      const word = sql.slice(i, j).toLowerCase();
      if (word === 'e' && sql[j] === "'") {
        const end = escapeStringEnd(sql, j + 1);
        if (end === -1) return { error: "an unterminated E'…' string" };
        toks.push({ k: 'str' });
        i = end;
      } else {
        toks.push({ k: 'word', v: word });
        i = j;
      }
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      const m = NUMBER.exec(sql.slice(i));
      toks.push({ k: 'num' });
      i += m ? m[0].length : 1;
    } else if (c === ':') {
      if (sql[i + 1] === ':') {
        toks.push({ k: 'punct', v: '::' });
        i += 2;
      } else {
        toks.push({ k: 'punct', v: ':' });
        i++;
      }
    } else if (PUNCT.has(c)) {
      toks.push({ k: 'punct', v: c });
      i++;
    } else if (OP_CHARS.has(c)) {
      let j = i;
      while (
        j < n &&
        OP_CHARS.has(sql[j]) &&
        !(sql[j] === '-' && sql[j + 1] === '-') &&
        !(sql[j] === '/' && sql[j + 1] === '*')
      ) {
        j++;
      }
      toks.push({ k: 'op', v: sql.slice(i, j) });
      i = j;
    } else if (c.charCodeAt(0) > 0x7e) {
      return { error: `a non-ASCII character (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}) outside a string` };
    } else {
      return { error: `an unexpected character (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})` };
    }
  }
  return { toks };
}

/** Index just past the closing quote of a plain '…' string; -1 unterminated, -2 a backslash. */
function plainStringEnd(sql: string, from: number): number {
  let j = from;
  for (;;) {
    if (j >= sql.length) return -1;
    const c = sql[j];
    if (c === '\\') return -2;
    if (c === "'") {
      if (sql[j + 1] === "'") j += 2;
      else return j + 1;
    } else j++;
  }
}

/** Index just past the closing quote of an E'…' string; -1 unterminated. */
function escapeStringEnd(sql: string, from: number): number {
  let j = from;
  for (;;) {
    if (j >= sql.length) return -1;
    const c = sql[j];
    if (c === '\\') j += 2;
    else if (c === "'") {
      if (sql[j + 1] === "'") j += 2;
      else return j + 1;
    } else j++;
  }
}

// A statement may START only with these.
const READ_START = new Set(['select', 'with', 'table', 'values', 'show', 'explain']);

// No statement may CONTAIN any of these, wherever they sit. Inside a read-starting
// statement the live ones are the data-modifying CTE (insert, update, delete, merge),
// SELECT … INTO (into), row locks (FOR UPDATE / FOR SHARE) and EXPLAIN ANALYZE, which
// executes what it explains; the rest are here so a statement-start check is not the
// only thing standing between a write and a pass.
const WRITE_WORDS = new Set([
  'insert', 'update', 'delete', 'merge', 'upsert', 'into', 'share',
  'alter', 'create', 'drop', 'grant', 'revoke', 'truncate', 'copy', 'call', 'do',
  'set', 'reset', 'lock', 'listen', 'unlisten', 'notify', 'vacuum', 'analyze', 'analyse',
  'cluster', 'reindex', 'refresh', 'security', 'begin', 'commit', 'rollback', 'savepoint',
  'release', 'prepare', 'execute', 'deallocate', 'discard', 'checkpoint', 'reassign',
  'abort', 'load', 'import',
]);

// Words PostgreSQL's grammar puts before a parenthesis without calling anything.
const PAREN_KEYWORDS = new Set([
  'in', 'exists', 'any', 'all', 'some', 'values', 'as', 'from', 'join', 'on', 'using',
  'and', 'or', 'not', 'where', 'select', 'by', 'when', 'then', 'else', 'lateral', 'row',
  'between', 'like', 'ilike', 'similar', 'having', 'limit', 'offset', 'fetch', 'union',
  'intersect', 'except', 'distinct', 'case', 'cast', 'array', 'over', 'filter', 'group',
  'within', 'partition', 'order', 'is', 'of', 'recursive', 'materialized', 'tablesample',
  'bernoulli', 'system', 'repeatable', 'sets', 'cube', 'rollup', 'explain', 'with', 'escape',
]);

// Type names that take a modifier in parentheses: `numeric(10, 2)`.
const TYPE_MODIFIERS = new Set([
  'numeric', 'decimal', 'varchar', 'char', 'character', 'bpchar', 'timestamp', 'timestamptz',
  'time', 'timetz', 'interval', 'bit', 'varbit', 'float',
]);

// pg_catalog functions that only compute and read. A name is trusted unqualified or as
// `pg_catalog.name`, never under another schema. What this list cannot see is stated in
// the gate's header: a user-defined overload that out-matches one of these, or a
// function reached through attribute notation or a view, all of which need a prior
// write (a migration) that the gate itself asks about.
const READ_FUNCTIONS = new Set([
  // aggregates and windows
  'count', 'sum', 'avg', 'min', 'max', 'array_agg', 'string_agg', 'json_agg', 'jsonb_agg',
  'json_object_agg', 'jsonb_object_agg', 'bool_and', 'bool_or', 'every', 'stddev',
  'stddev_pop', 'stddev_samp', 'variance', 'var_pop', 'var_samp', 'percentile_cont',
  'percentile_disc', 'mode', 'corr', 'grouping', 'row_number', 'rank', 'dense_rank',
  'percent_rank', 'cume_dist', 'ntile', 'lag', 'lead', 'first_value', 'last_value', 'nth_value',
  // conditionals
  'coalesce', 'nullif', 'greatest', 'least',
  // strings
  'lower', 'upper', 'initcap', 'length', 'char_length', 'character_length', 'octet_length',
  'substring', 'substr', 'trim', 'btrim', 'ltrim', 'rtrim', 'lpad', 'rpad', 'concat',
  'concat_ws', 'replace', 'split_part', 'left', 'right', 'position', 'strpos', 'reverse',
  'repeat', 'format', 'md5', 'encode', 'decode', 'to_hex', 'quote_ident', 'quote_literal',
  'quote_nullable', 'regexp_replace', 'regexp_match', 'regexp_matches', 'regexp_split_to_array',
  'regexp_split_to_table', 'regexp_count', 'regexp_like', 'starts_with', 'translate',
  'overlay', 'ascii', 'chr', 'string_to_array', 'array_to_string',
  // numbers
  'abs', 'ceil', 'ceiling', 'floor', 'round', 'trunc', 'sign', 'sqrt', 'power', 'mod', 'ln',
  'log', 'exp', 'pi', 'div', 'width_bucket',
  // dates and times
  'now', 'date_trunc', 'date_part', 'extract', 'age', 'to_char', 'to_date', 'to_timestamp',
  'to_number', 'make_date', 'make_time', 'make_timestamp', 'make_timestamptz', 'make_interval',
  'justify_days', 'justify_hours', 'justify_interval', 'date_bin', 'clock_timestamp',
  'statement_timestamp', 'transaction_timestamp', 'timezone', 'isfinite',
  // json
  'to_json', 'to_jsonb', 'row_to_json', 'array_to_json', 'json_build_object',
  'jsonb_build_object', 'json_build_array', 'jsonb_build_array', 'json_array_length',
  'jsonb_array_length', 'json_typeof', 'jsonb_typeof', 'json_extract_path',
  'json_extract_path_text', 'jsonb_extract_path', 'jsonb_extract_path_text', 'json_each',
  'json_each_text', 'jsonb_each', 'jsonb_each_text', 'json_array_elements',
  'json_array_elements_text', 'jsonb_array_elements', 'jsonb_array_elements_text',
  'json_object_keys', 'jsonb_object_keys', 'jsonb_strip_nulls', 'jsonb_pretty',
  'jsonb_path_query', 'jsonb_path_exists', 'jsonb_to_record', 'jsonb_to_recordset',
  // arrays and sets
  'array_length', 'cardinality', 'unnest', 'array_position', 'array_positions',
  'array_remove', 'array_append', 'array_prepend', 'array_cat', 'array_dims', 'array_upper',
  'array_lower', 'generate_series', 'generate_subscripts',
  // introspection
  'pg_typeof', 'format_type', 'to_regclass', 'to_regtype', 'to_regproc', 'obj_description',
  'col_description', 'pg_get_functiondef', 'pg_get_function_arguments',
  'pg_get_function_result', 'pg_get_viewdef', 'pg_get_constraintdef', 'pg_get_indexdef',
  'pg_get_triggerdef', 'pg_get_expr', 'pg_get_userbyid', 'pg_relation_size',
  'pg_total_relation_size', 'pg_table_size', 'pg_indexes_size', 'pg_size_pretty',
  'pg_database_size', 'has_table_privilege', 'has_column_privilege', 'has_schema_privilege',
  'has_function_privilege', 'current_setting', 'current_database', 'current_schema',
  'current_schemas', 'version',
]);

export function classifySql(sql: string): SqlRead {
  const lexed = lexSql(sql);
  if ('error' in lexed) return { read: false, why: `the SQL holds ${lexed.error}` };
  const statements: Tok[][] = [[]];
  for (const t of lexed.toks) {
    if (t.k === 'punct' && t.v === ';') statements.push([]);
    else statements[statements.length - 1].push(t);
  }
  const live = statements.filter((s) => s.length > 0);
  if (live.length === 0) return { read: false, why: 'the SQL holds no statement' };
  for (const s of live) {
    const why = statementNotRead(s);
    if (why) return { read: false, why };
  }
  return { read: true };
}

function statementNotRead(s: Tok[]): string | null {
  const lead = s.find((t) => !(t.k === 'punct' && t.v === '('));
  if (!lead || lead.k !== 'word' || !READ_START.has(lead.v)) {
    return `a statement starts with ${describe(lead)}, not SELECT, WITH, TABLE, VALUES, SHOW or EXPLAIN`;
  }
  for (let i = 0; i < s.length; i++) {
    const t = s[i];
    if (t.k === 'word' && WRITE_WORDS.has(t.v)) return `it contains ${t.v.toUpperCase()}`;
    const next = s[i + 1];
    if (!next || next.k !== 'punct' || next.v !== '(') continue;
    if (t.k === 'qid') return 'it calls a "quoted name"(…) this gate cannot identify';
    if (t.k !== 'word') continue;
    const prev = s[i - 1];
    if (prev?.k === 'punct' && prev.v === '.') {
      const schema = s[i - 2];
      const schemaName = schema?.k === 'word' ? schema.v : 'a quoted schema';
      if (schemaName !== 'pg_catalog' || !READ_FUNCTIONS.has(t.v)) {
        return `it calls ${schemaName}.${t.v}(…), which is not a known read-only built-in`;
      }
    } else if (!PAREN_KEYWORDS.has(t.v) && !TYPE_MODIFIERS.has(t.v) && !READ_FUNCTIONS.has(t.v)) {
      return `it calls ${t.v}(…), which is not a known read-only built-in`;
    }
  }
  return null;
}

function describe(t: Tok | undefined): string {
  if (!t) return 'nothing';
  if (t.k === 'word') return t.v.toUpperCase();
  if (t.k === 'qid') return 'a "quoted name"';
  if (t.k === 'punct' || t.k === 'op') return `"${t.v}"`;
  return `a ${t.k === 'str' ? 'string' : t.k === 'num' ? 'number' : 'parameter'}`;
}
