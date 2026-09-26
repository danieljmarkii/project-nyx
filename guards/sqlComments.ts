// The SQL comment stripper the migration-reading guards share. Moved here from
// lib/functionHardening.test.ts (CUL-694) when a second guard needed it: that guard
// first shipped a naive `replace(/--[^\n]*/g, '')`, which truncates a statement at a
// `--` inside a string literal, the bug this lexer already solved once. It lives in
// its own module rather than a test file because a test file imported by another
// runs its suites twice (the guards/blankComments.ts reasoning).
//
// Strip `--` and `/* */` comments while respecting single-quoted strings AND
// dollar-quoted bodies. Dollar-quoting is the part `lib/storagePolicies.test.ts`
// does not need and lib/functionHardening.test.ts does: every function body is `$$ … $$`, and
// 047's rollback section is a large block of commented-out SQL that would
// otherwise replay as if it were live — which is exactly the M4 failure that
// test documents, in a file that has far more commented SQL than live SQL.
export function stripSqlComments(sql: string): string {
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const rest = sql.slice(i);

    // Dollar-quoted body: copy verbatim through the matching closing tag.
    const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      out += sql.slice(i, stop);
      i = stop - 1;
      continue;
    }

    const c = sql[i];
    if (c === "'") {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++;
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}
