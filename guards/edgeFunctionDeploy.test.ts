// The Edge-Function deploy-ledger guard (B-178 / CUL-135; rebuilt for CUL-1147).
//
// Since CUL-1147, merging to main DEPLOYS: `.github/workflows/edge-deploy.yml`
// deploys every function whose shipping closure changed since its last recorded
// deploy, checks it, and records it as a GitHub deployment. So the ledger
// (`supabase/functions/deploy-manifest.json`) no longer records what is live and a
// PR author no longer bumps a fingerprint for every change. It keeps only what a
// person decides, and this guard checks exactly that:
//
//   holds  a function that must not go live on merge (it waits on an app build, a
//          clinical gate, a migration). Each hold names its CUL issue, says why, and
//          records the fingerprint of the code it holds.
//   order  functions that deploy in a fixed sequence when several change at once.
//
// It FAILS when:
//   (1) UNRESOLVED  — a relative import in a function's closure the walker can't
//                     resolve. The walker's model of the code is wrong, so every
//                     fingerprint (and every "did it change?" the deploy job asks)
//                     is suspect. Fails loudly rather than under-fingerprinting.
//   (2) HELD-DRIFT  — a held function's shipping code changed since the hold
//                     recorded it. That change will NOT go live when it merges; the
//                     author confirms that by updating the hold's fingerprint, or
//                     lifts the hold. Nothing joins a held queue unnoticed. This is
//                     the old DRIFT rule, now scoped to the functions it protects.
//   (3) UNREASONED  — a hold without its issue ref or its reason.
//   (4) STALE       — a hold or an order entry naming a function that isn't on disk.
//   (5) INVALID     — anything else in the file, including the retired per-function
//                     `functions` block (with a message saying why it went).
//   (6) DISPATCH    — the workflow's manual-run dropdown doesn't list exactly
//                     `all-changed` plus every deployable function, so a new
//                     function could not be redeployed or rolled back by hand.
//
// It rides the required `App (typecheck + jest)` check, token-free and network-free
// like before: it never contacts Supabase or GitHub. What is live is the deploy
// workflow's to prove, per deploy (version, ACTIVE, verify_jwt, a boot smoke test),
// and its records say so.
//
// The closure walker itself lives in scripts/edge-deploy/fingerprint.ts, shared with
// the deploy job, so the guard and the deployer can never disagree about what
// "changed" means. Its self-tests stay here, below.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fingerprintEntry, listFunctionDirs, type Fingerprint } from '../scripts/edge-deploy/fingerprint.ts';
import { LEDGER_REL, ledgerProblems, parseLedger } from '../scripts/edge-deploy/ledger.ts';

const REPO_ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'supabase', 'functions');
const WORKFLOW_REL = '.github/workflows/edge-deploy.yml';

type Computed = Record<string, Pick<Fingerprint, 'fingerprint' | 'unresolved'>>;

// The choice options of the workflow_dispatch `function` input, read by
// indentation from the YAML text. Comment lines are skipped and trailing comments
// cut, so a commented-out option does not count. Returns null when the block
// isn't there in block-list form, which the gate reports rather than guessing.
export function dispatchOptions(yaml: string): string[] | null {
  const lines = yaml.split(/\r?\n/);
  const indent = (l: string) => l.length - l.trimStart().length;
  const code = (l: string) => l.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');
  const fnLine = lines.findIndex((l) => /^\s*function:\s*$/.test(code(l)));
  if (fnLine === -1) return null;
  const fnIndent = indent(lines[fnLine]);
  let optLine = -1;
  for (let i = fnLine + 1; i < lines.length; i++) {
    const c = code(lines[i]);
    if (!c.trim()) continue;
    if (indent(lines[i]) <= fnIndent) break;
    if (/^\s*options:\s*$/.test(c)) {
      optLine = i;
      break;
    }
  }
  if (optLine === -1) return null;
  const optIndent = indent(lines[optLine]);
  const out: string[] = [];
  for (let i = optLine + 1; i < lines.length; i++) {
    const c = code(lines[i]);
    if (!c.trim()) continue;
    if (indent(lines[i]) <= optIndent) break;
    const m = /^\s*-\s*['"]?([^'"]+?)['"]?\s*$/.exec(c);
    if (!m) break;
    out.push(m[1]);
  }
  return out.length ? out : null;
}

// The pure gate: every problem with the ledger and the dropdown, given the
// computed closures. Empty = green. Pure so the self-tests drive it with fixtures.
export function evaluateLedger(computed: Computed, rawLedger: unknown, options: string[] | null): string[] {
  const problems: string[] = [];
  for (const fn of Object.keys(computed).sort()) {
    const { unresolved } = computed[fn];
    if (unresolved.length) {
      const list = unresolved.map((u) => `${u.spec} (from ${u.from})`).join(', ');
      problems.push(
        `UNRESOLVED — '${fn}' has relative import(s) the fingerprint walker could not resolve: ${list}. ` +
          `Fix the import path, or if it is a real specifier the walker mis-handles, extend the walker ` +
          `(scripts/edge-deploy/fingerprint.ts).`,
      );
    }
  }
  const { ledger, problems: shape } = parseLedger(rawLedger);
  problems.push(...shape, ...ledgerProblems(ledger, computed));

  const expected = ['all-changed', ...Object.keys(computed).sort()];
  if (!options) {
    problems.push(`DISPATCH — could not read the \`function\` input's options list in ${WORKFLOW_REL}.`);
  } else {
    const missing = expected.filter((o) => !options.includes(o));
    const extra = options.filter((o) => !expected.includes(o));
    if (missing.length || extra.length) {
      problems.push(
        `DISPATCH — ${WORKFLOW_REL}'s manual-run dropdown must list all-changed plus every deployable ` +
          `function.` +
          (missing.length ? ` Add: ${missing.join(', ')}.` : '') +
          (extra.length ? ` Remove: ${extra.join(', ')}.` : '') +
          // The one moment a new function's author is stopped, so it says what merging
          // will do (code-reviewer, CUL-1147: the old ledger's UNTRACKED check asked this).
          (missing.length
            ? ` A new function deploys on the merge that adds it. If it must not go live yet, add a hold ` +
              `for it in ${LEDGER_REL} in the same PR.`
            : ''),
      );
    }
  }
  return problems;
}

function report(problems: string[]): string {
  return (
    `\n${problems.length} deploy-ledger problem(s):\n\n` +
    problems.map((p) => `  • ${p}`).join('\n\n') +
    `\n\nMerging to main deploys every changed Edge Function (${WORKFLOW_REL}). The ledger ` +
    `(${LEDGER_REL}) holds only the holds and the deploy order. Runbook: docs/edge-deploy-runbook.md.\n`
  );
}

describe('CUL-1147 — the deploy ledger holds what a person decided, and nothing stale', () => {
  it('every hold is reasoned and current, every name exists, and the dropdown lists every function', () => {
    const computed: Computed = {};
    for (const fn of listFunctionDirs(FUNCTIONS_DIR)) {
      const fp = fingerprintEntry(path.join(FUNCTIONS_DIR, fn, 'index.ts'), REPO_ROOT);
      computed[fn] = { fingerprint: fp.fingerprint, unresolved: fp.unresolved };
    }
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, LEDGER_REL), 'utf8'));
    const options = dispatchOptions(fs.readFileSync(path.join(REPO_ROOT, WORKFLOW_REL), 'utf8'));
    const problems = evaluateLedger(computed, raw, options);
    expect(problems.length === 0 || report(problems)).toBe(true);
  });

  // The scan above is only worth something if it saw the real tree.
  it('scanned the real functions directory (non-vacuity floor)', () => {
    const dirs = fs
      .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== '_shared')
      .map((e) => e.name);
    expect(dirs.length).toBeGreaterThan(0);
    expect(listFunctionDirs(FUNCTIONS_DIR)).toEqual(dirs.filter((d) => fs.existsSync(path.join(FUNCTIONS_DIR, d, 'index.ts'))).sort());
  });
});

// ── self-tests: prove the walker + gate catch what they claim. These are the
// "state the counterexample you tried" evidence — run against real temp-dir
// fixtures through the same functions the real scan uses. ───────────────────────
describe('the fingerprint walker itself', () => {
  let root = '';
  const w = (rel: string, src: string) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, src);
    return abs;
  };
  const fp = (entryRel: string) => fingerprintEntry(path.join(root, entryRel), root);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'edgefp-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('includes the entry + a transitively-imported local file, excludes external specifiers', () => {
    w('fn/helper.ts', 'export const a = 1;\n');
    w(
      'fn/index.ts',
      [
        `import { a } from './helper.ts'`,
        `import { serve } from 'https://deno.land/std/http/server.ts'`,
        `import { createClient } from 'npm:@supabase/supabase-js'`,
        `import { Buffer } from 'node:buffer'`,
        `export const x = a;`,
      ].join('\n'),
    );
    const { closure } = fp('fn/index.ts');
    expect(closure).toEqual(['fn/helper.ts', 'fn/index.ts']); // sorted; no external files
  });

  it('follows re-exports and deep ../../../ parent imports (the real protein.ts / lib shape)', () => {
    // Mirror the actual repo depth: supabase/functions/<fn>/ reaches the shared
    // lib via ../../../lib, the exact traversal generate-signal/protein.ts uses.
    w('lib/protein.ts', 'export const canon = (s: string) => s;\n');
    w('supabase/functions/fn/protein.ts', `export { canon } from '../../../lib/protein.ts'`);
    w('supabase/functions/fn/index.ts', `import { canon } from './protein.ts'\nexport const y = canon('x');`);
    const { closure, unresolved } = fp('supabase/functions/fn/index.ts');
    expect(unresolved).toEqual([]);
    expect(closure.sort()).toEqual([
      'lib/protein.ts',
      'supabase/functions/fn/index.ts',
      'supabase/functions/fn/protein.ts',
    ]);
  });

  it('follows an inline import-type query `import("./x").T` (the real render.ts/report.ts shape)', () => {
    // generate-report/render.ts references a report.ts type only via
    // `import('./report.ts').ProteinTimeline` in a parameter position. If the
    // walker missed ImportTypeNode, report.ts could fall out of the closure with
    // no UNRESOLVED — a real dependency untraced, the exact silent miss this
    // guard forbids. It must land in the closure.
    w('supabase/functions/fn/report.ts', 'export type T = { n: number };\n');
    w('supabase/functions/fn/index.ts', `export function f(x: import('./report.ts').T) { return x.n; }`);
    const { closure, unresolved } = fp('supabase/functions/fn/index.ts');
    expect(unresolved).toEqual([]);
    expect(closure).toContain('supabase/functions/fn/report.ts');
  });

  it('resolves an extensionless specifier to file.ts and to dir/index.ts', () => {
    w('fn/util.ts', 'export const u = 1;\n');
    w('fn/sub/index.ts', 'export const s = 2;\n');
    w('fn/index.ts', `import { u } from './util'\nimport { s } from './sub'\nexport const z = u + s;`);
    const { closure, unresolved } = fp('fn/index.ts');
    expect(unresolved).toEqual([]);
    expect(closure.sort()).toEqual(['fn/index.ts', 'fn/sub/index.ts', 'fn/util.ts']);
  });

  it('changes the fingerprint when a transitively-imported file changes, and not otherwise', () => {
    w('fn/helper.ts', 'export const a = 1;\n');
    w('fn/unused.ts', 'export const dead = 1;\n'); // not imported by the closure
    w('fn/index.ts', `import { a } from './helper.ts'\nexport const x = a;`);
    const before = fp('fn/index.ts').fingerprint;

    fs.writeFileSync(path.join(root, 'fn/unused.ts'), 'export const dead = 2;\n');
    expect(fp('fn/index.ts').fingerprint).toBe(before); // outside the closure → no change

    fs.writeFileSync(path.join(root, 'fn/helper.ts'), 'export const a = 999;\n');
    expect(fp('fn/index.ts').fingerprint).not.toBe(before); // inside the closure → drift
  });

  it('reports an unresolved relative import instead of silently dropping it', () => {
    w('fn/index.ts', `import { gone } from './missing.ts'\nexport const x = gone;`);
    const { unresolved } = fp('fn/index.ts');
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].spec).toBe('./missing.ts');
  });

  it('terminates on an import cycle', () => {
    w('fn/a.ts', `import { b } from './b.ts'\nexport const a = 1; export { b };`);
    w('fn/b.ts', `import { a } from './a.ts'\nexport const b = 2; export { a };`);
    w('fn/index.ts', `import { a } from './a.ts'\nexport const x = a;`);
    const { closure } = fp('fn/index.ts');
    expect(closure.sort()).toEqual(['fn/a.ts', 'fn/b.ts', 'fn/index.ts']);
  });
});

// Characterization of the walker's documented limits — NOT aspirational. Records
// what the static scan deliberately does not chase, so a future reader knows the
// boundary is known, not accidental (mirrors ownerFacingCopy.test.ts's own block).
describe("the walker's documented limits (characterization, not a guarantee)", () => {
  let root = '';
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'edgefp-lim-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does NOT trace a dynamic import with a non-literal (computed) specifier', () => {
    // `import(someVar)` cannot be resolved statically; none exist in the edge
    // functions today. If one is ever added its target is not fingerprinted —
    // and it is deliberately NOT reported as unresolved (there is no literal to
    // resolve). Documented so the boundary reads as known, not a bug.
    const abs = path.join(root, 'index.ts');
    fs.writeFileSync(abs, `const p = './x.ts'; export const f = () => import(p);`);
    const { closure, unresolved } = fingerprintEntry(abs, root);
    expect(unresolved).toEqual([]);
    expect(closure).toEqual(['index.ts']); // the computed target is not traced
  });
});

describe('the ledger gate (evaluateLedger)', () => {
  const fp = (c: string) => `sha256:${c.repeat(64)}`;
  const computed: Computed = {
    a: { fingerprint: fp('1'), unresolved: [] },
    b: { fingerprint: fp('2'), unresolved: [] },
  };
  const ALL = ['all-changed', 'a', 'b'];
  const hold = { ref: 'CUL-215', reason: 'waits on the client build', fingerprint: fp('2') };

  it('passes a clean ledger: current holds, real names, full dropdown', () => {
    expect(evaluateLedger(computed, { order: ['b', 'a'], holds: { b: hold } }, ALL)).toEqual([]);
    expect(evaluateLedger(computed, {}, ALL)).toEqual([]);
  });

  it('flags a held function whose code moved (HELD-DRIFT), and only that', () => {
    const p = evaluateLedger(computed, { holds: { b: { ...hold, fingerprint: fp('9') } } }, ALL);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^HELD-DRIFT/);
  });

  it('flags a hold without its issue or reason (UNREASONED)', () => {
    const p = evaluateLedger(computed, { holds: { b: { fingerprint: fp('2') } } }, ALL);
    expect(p.filter((s) => s.startsWith('UNREASONED'))).toHaveLength(2);
  });

  it('flags names that match no function (STALE)', () => {
    const p = evaluateLedger(computed, { order: ['ghost'], holds: { gone: hold } }, ALL);
    expect(p.filter((s) => s.startsWith('STALE'))).toHaveLength(2);
  });

  it('rejects the retired per-function ledger (INVALID)', () => {
    const p = evaluateLedger(computed, { functions: { a: { status: 'deployed', fingerprint: fp('1') } } }, ALL);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^INVALID/);
  });

  it('flags UNRESOLVED imports', () => {
    const broken: Computed = { ...computed, a: { fingerprint: fp('1'), unresolved: [{ from: 'a/index.ts', spec: './gone.ts' }] } };
    const p = evaluateLedger(broken, {}, ALL);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^UNRESOLVED/);
  });

  it('flags a dropdown that is missing a function, has an extra one, or cannot be read (DISPATCH)', () => {
    expect(evaluateLedger(computed, {}, ['all-changed', 'a'])[0]).toMatch(/^DISPATCH.*Add: b\./);
    expect(evaluateLedger(computed, {}, [...ALL, 'view-report'])[0]).toMatch(/Remove: view-report\./);
    expect(evaluateLedger(computed, {}, ['a', 'b'])[0]).toMatch(/Add: all-changed\./);
    expect(evaluateLedger(computed, {}, null)[0]).toMatch(/could not read/);
  });
});

describe('dispatchOptions', () => {
  const yaml = [
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      function:',
    '        type: choice',
    '        # one per function',
    '        options:',
    '          - all-changed',
    "          - 'ask'  # quoted, with a comment",
    '          # - commented-out',
    '',
    '          - generate-report',
    '      ref:',
    '        type: string',
  ].join('\n');

  it('reads the block list, skipping comments and blank lines, stopping at the next key', () => {
    expect(dispatchOptions(yaml)).toEqual(['all-changed', 'ask', 'generate-report']);
  });

  it('returns null when there is no options block to read', () => {
    expect(dispatchOptions('on:\n  push:\n')).toBeNull();
    expect(dispatchOptions(yaml.replace('options:', 'choices:'))).toBeNull();
  });

  it('reads the real workflow', () => {
    const real = dispatchOptions(fs.readFileSync(path.join(REPO_ROOT, WORKFLOW_REL), 'utf8'));
    expect(real?.[0]).toBe('all-changed');
    expect(real?.length).toBeGreaterThan(1);
  });
});
