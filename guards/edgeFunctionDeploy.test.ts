// The Edge-Function deploy-ledger guard (B-178 / CUL-135).
//
// Why this file exists: merging a PR that changes `supabase/functions/**` does
// NOT deploy it — deploys are a separate manual step (Supabase MCP /
// `scripts/deploy-edge.sh`, see docs/edge-deploy-runbook.md). So a merged Edge
// Function silently drifts from `main` until someone notices. It has bitten a
// clinical function once already: `analyze-vomit`'s B-028 (#220) merged
// 2026-06-22 and ran the month-old bundle live until a June-24 audit caught it.
// Nothing structurally stops the next one.
//
// This turns SILENT drift into RECORDED, REASONED drift. It is a source-scan in
// the shape of `guards/ownerFacingCopy.test.ts`: it rides the already-required
// `App (typecheck + jest)` check, so it is blocking with no ci.yml change, and it
// is token-free and network-free (pure fs + the TypeScript parser) — it never
// contacts Supabase, which keeps CI's `contents: read` trust boundary intact.
//
// HOW IT WORKS
// ------------
// For each deployable function (a dir under supabase/functions/ with an
// `index.ts`; `_shared` is inlined, never deployed), it walks the function's
// SHIPPING CLOSURE — `index.ts` plus every file it transitively imports by a
// relative (`./` / `../`) specifier, which is exactly the set esbuild inlines in
// `scripts/deploy-edge.sh` (including the cross-package `../../../lib/*.ts`,
// `../generate-signal/*.ts`, and `../_shared/*.ts` reaches). Runtime specifiers
// (`https://`, `npm:`, `node:`, `jsr:`) stay external, same as the real bundle.
// It hashes that closure into a per-function FINGERPRINT and compares it to the
// recorded fingerprint in `supabase/functions/deploy-manifest.json` (the ledger).
//
// It FAILS when:
//   (1) DRIFT       — a function's current fingerprint differs from the one the
//                     ledger recorded (its shipping code changed since it was
//                     last acknowledged). Fix: deploy it and set the ledger
//                     entry to the new fingerprint with status `deployed`, OR
//                     record status `pending` (deploy owed) / `hold` (deliberately
//                     not deployed, e.g. B-494) with a reason.
//   (2) UNTRACKED   — a deployable function has no ledger entry (a NEW function
//                     can't ship without recording its deploy intent).
//   (3) STALE       — the ledger lists a function that no longer exists on disk
//                     (renamed/removed) — the orphan-in-reverse of B-397.
//   (4) UNREASONED  — a `pending`/`hold` entry with no `reason`. Every
//                     non-`deployed` state is a named decision, never a silent
//                     hole (the discipline `LOCAL_WIPE_TABLES` /
//                     `// copy-guard-ok:` use).
//   (5) UNRESOLVED  — a relative import in a closure the walker can't resolve to
//                     a file. That means the walker's model of the code is wrong,
//                     so it fails loudly rather than silently under-fingerprinting.
//
// SCOPE BOUNDARY (documented, not implied): this guarantees no function's
// shipping code changes without a recorded, reasoned acknowledgment in the
// ledger. It CANNOT prove a deploy actually happened — the live artifact is a
// bundle, not a source closure, so CI (which has no Supabase token by design)
// can't compare against production. Confirming live-vs-main is a separate
// in-session reconciliation (filed as a follow-on). Because the ledger's
// `deployed` fingerprints are self-reported, the guard's promise is "no silent
// drift", not "everything on main is live".
//
// Over-fires in the safe direction only: a comment-only or type-only change in a
// closure flips the fingerprint (esbuild would emit identical bytes), so you're
// asked to confirm a no-op deploy — never the reverse, where real drift passes
// unrecorded. Widen/refine if that friction ever outweighs the safety.

const ts = require('typescript') as typeof import('typescript');
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const crypto = require('crypto') as typeof import('crypto');
const os = require('os') as typeof import('os');

type TSNode = import('typescript').Node;

const REPO_ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'supabase', 'functions');
const MANIFEST_PATH = path.join(FUNCTIONS_DIR, 'deploy-manifest.json');
const MANIFEST_REL = path.relative(REPO_ROOT, MANIFEST_PATH);

// Relpaths are normalized to forward slashes so a checkout on a different OS
// fingerprints identically — the path-separator sibling of readNormalized's
// CRLF fix (content, not host encoding, is what we hash). Only the hash
// pre-image and the closure listing use it; content is always read from abs.
const toRel = (root: string, abs: string) => path.relative(root, abs).split(path.sep).join('/');

// ── fingerprint primitives ─────────────────────────────────────────────────────

const sha256 = (buf: string) => 'sha256:' + crypto.createHash('sha256').update(buf, 'utf8').digest('hex');

// Normalize line endings before hashing so a CRLF checkout doesn't spuriously
// differ from the LF one the ledger was seeded on. Content, not encoding, is the
// thing we're fingerprinting.
const readNormalized = (abs: string): string => fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');

// Every relative (`./` / `../`) module specifier a source file imports or
// re-exports. Uses the TS parser (robust to multiline imports, comments, and
// string literals inside comments) rather than a regex. Handles static
// `import`/`export … from`, `import x = require('…')`, dynamic `import('…')`
// with a string-literal argument, and the inline import-type query
// `import('…').Type` (a real form here — generate-report/render.ts uses it for
// a `report.ts` type; missing it would let that dependency go untraced, which
// is exactly the silent-drift this guard exists to stop). Bare / `https:` /
// `npm:` / `node:` / `jsr:` specifiers are external — Deno resolves them at
// runtime, esbuild leaves them alone — so they are deliberately skipped.
function relativeSpecifiers(absFile: string, src: string): string[] {
  // Parse plain `.ts` as TS, not TSX: every file in a function's closure is a
  // Deno `.ts` with no JSX, and TSX mode misparses a bare generic arrow
  // (`<T>(x: T) => x`). Fixtures may be `.tsx`, so pick by extension.
  const kind = absFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absFile, src, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const push = (spec: string | undefined) => {
    if (spec && (spec.startsWith('./') || spec.startsWith('../'))) out.push(spec);
  };
  const visit = (n: TSNode) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      push(n.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference) &&
      ts.isStringLiteral(n.moduleReference.expression)
    ) {
      push(n.moduleReference.expression.text);
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteral(arg)) push(arg.text);
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      // `import('./report.ts').ProteinTimeline` — the type-position query.
      push(n.argument.literal.text);
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

// Resolve a relative specifier against the importing file. Mirrors the Deno /
// esbuild resolution the deploy actually uses: an explicit `.ts`/`.tsx`/`.json`
// is taken verbatim; an extensionless specifier tries `.ts`, `.tsx`, `.json`,
// then `index.*`. Returns the absolute path or null if nothing exists.
function resolveSpec(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = /\.(ts|tsx|json)$/.test(spec)
    ? [base]
    : [
        base + '.ts',
        base + '.tsx',
        base + '.json',
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
        path.join(base, 'index.json'),
      ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

type Closure = { files: string[]; unresolved: { from: string; spec: string }[] };

// The transitive local-import closure of an entry file. Absolute paths
// throughout, so it is root-independent (the self-tests point it at a temp dir).
// `.json` files are included in the closure (they ship) but not parsed.
function computeClosure(entryAbs: string): Closure {
  const visited = new Set<string>();
  const unresolved: { from: string; spec: string }[] = [];
  const stack = [entryAbs];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (!/\.(ts|tsx)$/.test(cur)) continue; // json/asset: included above, nothing to parse
    for (const spec of relativeSpecifiers(cur, readNormalized(cur))) {
      const resolved = resolveSpec(cur, spec);
      if (!resolved) unresolved.push({ from: cur, spec });
      else if (!visited.has(resolved)) stack.push(resolved);
    }
  }
  return { files: [...visited], unresolved };
}

type Fingerprint = { fingerprint: string; closure: string[]; unresolved: { from: string; spec: string }[] };

// Fingerprint = sha256 over the sorted `<relpath> <sha256(content)>` lines of
// the closure. Both path and content matter, so a rename or a content edit
// anywhere in the closure moves the fingerprint. `root` only sets the relpaths
// (kept stable/portable); pass REPO_ROOT for real functions, temp root in tests.
function fingerprintEntry(entryAbs: string, root: string): Fingerprint {
  const { files, unresolved } = computeClosure(entryAbs);
  const rels = files.map((f) => toRel(root, f)).sort();
  const serialized = rels.map((rel) => `${rel} ${sha256(readNormalized(path.join(root, rel)))}`).join('\n');
  return {
    fingerprint: sha256(serialized),
    closure: rels,
    unresolved: unresolved.map((u) => ({ from: toRel(root, u.from), spec: u.spec })),
  };
}

// ── ledger schema + evaluation ─────────────────────────────────────────────────

const STATUSES = new Set(['deployed', 'pending', 'hold']);

type LedgerEntry = {
  status?: string;
  fingerprint?: string;
  reason?: string;
  ref?: string;
  updated?: string;
  deployedVersion?: number;
};
type Manifest = { functions?: Record<string, LedgerEntry> };

// The pure gate: given each function's computed fingerprint and the ledger, list
// every problem (empty = green). Pure over its inputs so the self-tests can drive
// it with synthetic data, no fs.
function evaluateLedger(
  computed: Record<string, Pick<Fingerprint, 'fingerprint' | 'unresolved'>>,
  manifest: Manifest,
): string[] {
  const problems: string[] = [];
  const entries = manifest.functions ?? {};
  const onDisk = Object.keys(computed).sort();

  for (const fn of onDisk) {
    const { fingerprint, unresolved } = computed[fn];
    if (unresolved.length) {
      const list = unresolved.map((u) => `${u.spec} (from ${u.from})`).join(', ');
      problems.push(
        `UNRESOLVED — '${fn}' has relative import(s) the fingerprint walker could not resolve: ${list}. ` +
          `Fix the import path, or if it is a real specifier the walker mis-handles, extend the walker.`,
      );
      continue; // an incomplete closure would produce a misleading fingerprint
    }
    const entry = entries[fn];
    if (!entry) {
      problems.push(
        `UNTRACKED — '${fn}' has no entry in ${MANIFEST_REL}. Add one recording its current ` +
          `fingerprint (${fingerprint}) with a status and reason. A new Edge Function cannot ship ` +
          `without recording its deploy intent. See docs/edge-deploy-runbook.md § Deploy ledger.`,
      );
      continue;
    }
    if (!entry.status || !STATUSES.has(entry.status)) {
      problems.push(`INVALID — '${fn}' has status ${JSON.stringify(entry.status)}; must be one of deployed | pending | hold.`);
    } else if (entry.status !== 'deployed' && !(entry.reason && entry.reason.trim())) {
      problems.push(
        `UNREASONED — '${fn}' is '${entry.status}' with no reason. Every non-deployed ledger state is a ` +
          `named decision — add a "reason" (what is owed, or why it is held).`,
      );
    }
    if (entry.fingerprint !== fingerprint) {
      problems.push(
        `DRIFT — '${fn}' changed since the ledger last recorded it.\n` +
          `        recorded : ${entry.fingerprint ?? '(none)'}  [status: ${entry.status ?? '(unset)'}]\n` +
          `        current  : ${fingerprint}\n` +
          `        Fix: deploy it (docs/edge-deploy-runbook.md) and set this entry's "fingerprint" to the ` +
          `current value with status "deployed"; OR, if it is intentionally not being deployed yet, set the ` +
          `"fingerprint" to the current value with status "pending"/"hold" and a "reason". The fingerprint ` +
          `moves when the function's shipping closure changes — often a shared file (lib/*, _shared/*, or a ` +
          `sibling function) it inlines, which drifts every function that inlines it.`,
      );
    }
  }

  for (const fn of Object.keys(entries).sort()) {
    if (!(fn in computed)) {
      problems.push(
        `STALE — ${MANIFEST_REL} lists '${fn}', but there is no deployable function directory at ` +
          `supabase/functions/${fn}/ (with an index.ts). Remove the stale entry, or restore the function.`,
      );
    }
  }
  return problems;
}

// ── real-repo scan ─────────────────────────────────────────────────────────────

function listFunctionDirs(functionsDir: string): string[] {
  return fs
    .readdirSync(functionsDir, { withFileTypes: true })
    .filter(
      (e) => e.isDirectory() && e.name !== '_shared' && fs.existsSync(path.join(functionsDir, e.name, 'index.ts')),
    )
    .map((e) => e.name)
    .sort();
}

function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

function report(problems: string[]): string {
  return (
    `\n${problems.length} deploy-ledger problem(s):\n\n` +
    problems.map((p) => `  • ${p}`).join('\n\n') +
    `\n\nThe ledger (${MANIFEST_REL}) records, per Edge Function, the fingerprint of the source last ` +
    `acknowledged as deployed. This guard fails when a function's shipping code drifts from that record ` +
    `without a reasoned acknowledgment — turning "someone eventually notices an undeployed function" into a ` +
    `blocked check. It does NOT prove a deploy happened (that needs the live reconciliation). ` +
    `Runbook: docs/edge-deploy-runbook.md § Deploy ledger.\n`
  );
}

describe('B-178 — Edge Functions do not drift from their deploy ledger unacknowledged', () => {
  it('every deployable function matches its ledger fingerprint (or a reasoned pending/hold)', () => {
    const manifest = loadManifest();
    const computed: Record<string, Pick<Fingerprint, 'fingerprint' | 'unresolved'>> = {};
    for (const fn of listFunctionDirs(FUNCTIONS_DIR)) {
      const fp = fingerprintEntry(path.join(FUNCTIONS_DIR, fn, 'index.ts'), REPO_ROOT);
      computed[fn] = { fingerprint: fp.fingerprint, unresolved: fp.unresolved };
    }
    const problems = evaluateLedger(computed, manifest);
    expect(problems.length === 0 || report(problems)).toBe(true);
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

describe('the deploy-ledger gate (evaluateLedger)', () => {
  const one = (unresolved: { from: string; spec: string }[] = []) => ({ fingerprint: 'sha256:aaa', unresolved });

  it('passes when the computed fingerprint matches a deployed entry', () => {
    expect(
      evaluateLedger({ fn: one() }, { functions: { fn: { status: 'deployed', fingerprint: 'sha256:aaa' } } }),
    ).toEqual([]);
  });

  it('passes a reasoned pending/hold whose fingerprint matches (acknowledged drift)', () => {
    expect(
      evaluateLedger({ fn: one() }, { functions: { fn: { status: 'hold', fingerprint: 'sha256:aaa', reason: 'B-494' } } }),
    ).toEqual([]);
  });

  it('flags DRIFT when the fingerprint no longer matches the ledger', () => {
    const p = evaluateLedger({ fn: one() }, { functions: { fn: { status: 'deployed', fingerprint: 'sha256:OLD' } } });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^DRIFT/);
  });

  it('flags an UNTRACKED function with no ledger entry', () => {
    const p = evaluateLedger({ fn: one() }, { functions: {} });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^UNTRACKED/);
  });

  it('flags a STALE ledger entry with no function on disk', () => {
    const p = evaluateLedger({}, { functions: { ghost: { status: 'deployed', fingerprint: 'sha256:x' } } });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^STALE/);
  });

  it('flags an UNREASONED pending/hold, and an INVALID status', () => {
    const pending = evaluateLedger({ fn: one() }, { functions: { fn: { status: 'pending', fingerprint: 'sha256:aaa' } } });
    expect(pending.some((s) => s.startsWith('UNREASONED'))).toBe(true);
    const invalid = evaluateLedger({ fn: one() }, { functions: { fn: { status: 'shipped', fingerprint: 'sha256:aaa' } } });
    expect(invalid.some((s) => s.startsWith('INVALID'))).toBe(true);
  });

  it('flags UNRESOLVED and does not also emit a spurious drift for the same function', () => {
    const p = evaluateLedger(
      { fn: one([{ from: 'fn/index.ts', spec: './missing.ts' }]) },
      { functions: { fn: { status: 'deployed', fingerprint: 'sha256:aaa' } } },
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^UNRESOLVED/);
  });
});

declare const __dirname: string;
