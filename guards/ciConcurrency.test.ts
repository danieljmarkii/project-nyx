// The CI concurrency guard (CUL-1613).
//
// `.github/workflows/ci.yml` cancels a superseded run so a re-pushed PR does not
// queue behind its own stale verdict. With one group per ref, that also cancelled
// main's run for every merge but the last: on 2026-10-03 four merges in six minutes
// left only the final one with a verdict, and main sat red for an hour with no run
// naming the commit that broke it. So main's group is per-commit and a PR's is per-ref.
//
// This guard EVALUATES the workflow's `concurrency.group` expression for the
// contexts that matter rather than matching its text, so any spelling that keeps
// the behaviour passes and any that loses it reds:
//   (1) two different commits pushed to main get two different groups (each merge
//       gets its own completed run; cancel-in-progress cannot touch it);
//   (2) two pushes to the same PR get the SAME group (a re-push still cancels);
//   (3) two different PRs get different groups (one PR never cancels another);
//   (4) cancel-in-progress stays on (the PR half of the contract).
// Plus the issue's literal ask: the group mentions `github.sha`.
//
// Blind spot, stated: the evaluator understands the expression subset this file
// needs (`github.*` properties, quoted strings, `==`, `!=`, `&&`, `||`). A group
// written with anything else (a function call, `format()`, `env.*`) fails the parse
// loudly rather than passing; widen the evaluator when that happens.

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const CI_REL = '.github/workflows/ci.yml';

// The top-level `concurrency:` block's two keys, read by indentation from the YAML
// text. Whole-line comments are skipped; null when the block or a key is absent.
export function readConcurrency(yaml: string): { group: string; cancel: string } | null {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^concurrency:\s*(#.*)?$/.test(l));
  if (start === -1) return null;
  let group: string | null = null;
  let cancel: string | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(#.*)?$/.test(l)) continue;
    if (!/^\s/.test(l)) break; // back at top level
    const g = /^\s+group:\s*(.+?)\s*$/.exec(l);
    if (g) group = g[1];
    const c = /^\s+cancel-in-progress:\s*(.+?)\s*(#.*)?$/.exec(l);
    if (c) cancel = c[1];
  }
  return group !== null && cancel !== null ? { group, cancel } : null;
}

type Ctx = Record<string, string>;
type Value = string | boolean;

// GitHub's truthiness for the values this subset produces: '' and false are falsy.
const truthy = (v: Value) => v !== '' && v !== false;

// A tiny evaluator for the `${{ … }}` subset above. `a && b` yields b when a is
// truthy else a; `a || b` yields a when truthy else b — GitHub's semantics, which
// is what makes the `cond && x || y` ternary idiom work.
export function evaluateExpression(expr: string, ctx: Ctx): Value {
  const tokens = expr.match(/'(?:[^']|'')*'|==|!=|&&|\|\||[A-Za-z_][\w.-]*|\(|\)|\S/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const primary = (): Value => {
    const t = take();
    if (t === undefined) throw new Error(`unexpected end of expression: ${expr}`);
    if (t === '(') {
      const v = or();
      if (take() !== ')') throw new Error(`unbalanced parenthesis: ${expr}`);
      return v;
    }
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (/^github\.[\w-]+$/.test(t)) {
      const key = t.slice('github.'.length);
      if (!(key in ctx)) throw new Error(`no fixture value for ${t}`);
      return ctx[key];
    }
    throw new Error(`unsupported token '${t}' in: ${expr}`);
  };
  const cmp = (): Value => {
    let l = primary();
    while (peek() === '==' || peek() === '!=') {
      const op = take();
      const r = primary();
      l = op === '==' ? l === r : l !== r;
    }
    return l;
  };
  const and = (): Value => {
    let l = cmp();
    while (peek() === '&&') {
      take();
      const r = cmp();
      l = truthy(l) ? r : l;
    }
    return l;
  };
  const or = (): Value => {
    let l = and();
    while (peek() === '||') {
      take();
      const r = and();
      l = truthy(l) ? l : r;
    }
    return l;
  };
  const v = or();
  if (pos !== tokens.length) throw new Error(`trailing tokens in: ${expr}`);
  return v;
}

// The group string for one context: literal text with each `${{ … }}` evaluated.
export function evaluateGroup(group: string, ctx: Ctx): string {
  const raw = group.replace(/^(['"])(.*)\1$/, '$2');
  return raw.replace(/\$\{\{([\s\S]*?)\}\}/g, (_m, e: string) => String(evaluateExpression(e.trim(), ctx)));
}

// The pure gate. Empty = green.
export function concurrencyProblems(yaml: string): string[] {
  const conc = readConcurrency(yaml);
  if (!conc) return [`could not read a top-level concurrency block with group and cancel-in-progress in ${CI_REL}`];
  const problems: string[] = [];
  const base = { workflow: 'CI' };
  const main = (sha: string) => evaluateGroup(conc.group, { ...base, ref: 'refs/heads/main', sha, event_name: 'push' });
  const pr = (n: number, sha: string) =>
    evaluateGroup(conc.group, { ...base, ref: `refs/pull/${n}/merge`, sha, event_name: 'pull_request' });

  if (!conc.group.includes('github.sha')) problems.push('the group no longer mentions github.sha');
  if (main('aaa111') === main('bbb222')) {
    problems.push(
      `two merges to main share the group '${main('aaa111')}', so each new merge cancels the run for the one before ` +
        `(the 2026-10-03 failure). main's group must be per-commit.`,
    );
  }
  if (pr(7, 'aaa111') !== pr(7, 'bbb222')) {
    problems.push('two pushes to the same pull request get different groups, so a re-push no longer cancels its stale run');
  }
  if (pr(7, 'aaa111') === pr(8, 'aaa111')) problems.push('two different pull requests share a group and would cancel each other');
  if (pr(7, 'aaa111') === main('aaa111')) problems.push('a pull request and main share a group');
  if (conc.cancel !== 'true') problems.push(`cancel-in-progress is '${conc.cancel}'; pull requests need it on`);
  return problems;
}

describe('CI concurrency (CUL-1613)', () => {
  it('gives every merge to main its own run and still cancels a superseded PR run', () => {
    const yaml = fs.readFileSync(path.join(REPO_ROOT, CI_REL), 'utf8');
    expect(concurrencyProblems(yaml)).toEqual([]);
  });

  describe('the gate reds on the shapes it exists to stop', () => {
    const wrap = (group: string, cancel = 'true') =>
      `name: CI\non:\n  push:\nconcurrency:\n  # a comment\n  group: ${group}\n  cancel-in-progress: ${cancel}\njobs:\n`;
    const live = `ci-\${{ github.workflow }}-\${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}`;

    it('accepts the shipped shape', () => {
      expect(concurrencyProblems(wrap(live))).toEqual([]);
    });

    it('reds on the pre-CUL-1613 shared group (the mutation back)', () => {
      const p = concurrencyProblems(wrap('ci-${{ github.workflow }}-${{ github.ref }}'));
      expect(p.some((m) => m.includes('two merges to main share the group'))).toBe(true);
      expect(p.some((m) => m.includes('github.sha'))).toBe(true);
    });

    it('reds on a per-commit group everywhere (PR re-pushes would stop cancelling)', () => {
      const p = concurrencyProblems(wrap('ci-${{ github.workflow }}-${{ github.sha }}'));
      expect(p.some((m) => m.includes('same pull request'))).toBe(true);
    });

    it('reds when the condition names the wrong branch', () => {
      const p = concurrencyProblems(
        wrap(`ci-\${{ github.workflow }}-\${{ github.ref == 'refs/heads/master' && github.sha || github.ref }}`),
      );
      expect(p.some((m) => m.includes('two merges to main share the group'))).toBe(true);
    });

    it('reds when cancel-in-progress is turned off', () => {
      expect(concurrencyProblems(wrap(live, 'false'))).toEqual([
        "cancel-in-progress is 'false'; pull requests need it on",
      ]);
    });

    it('reds when the block is missing', () => {
      expect(concurrencyProblems('name: CI\njobs:\n')).toHaveLength(1);
    });

    it('fails the parse loudly on an expression outside its subset', () => {
      expect(() => concurrencyProblems(wrap("ci-${{ format('{0}', github.ref) }}"))).toThrow(/unsupported token/);
    });
  });
});
