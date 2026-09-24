// The Edge-Function closure walker and fingerprint (CUL-135, moved here by CUL-1147).
//
// ONE implementation, two readers: `guards/edgeFunctionDeploy.test.ts` (the ledger
// guard, jest) and `scripts/edge-deploy/cli.ts` (the deploy workflow, plain Node). It
// lived inside the guard until the deploy job needed the same answer to "did this
// function's shipping code change?", and a second walker would be a second opinion.
//
// A function's SHIPPING CLOSURE is `index.ts` plus every file it transitively imports
// by a relative (`./` / `../`) specifier, which is exactly the set esbuild inlines in
// `scripts/deploy-edge.sh` (including the cross-package `../../../lib/*.ts`,
// `../generate-signal/*.ts`, and `../_shared/*.ts` reaches). Runtime specifiers
// (`https://`, `npm:`, `node:`, `jsr:`) stay external, same as the real bundle. The
// FINGERPRINT is a sha256 over that closure's paths and contents.
//
// CHANGING THIS WALKER CHANGES EVERY FINGERPRINT. The deploy workflow compares the
// current fingerprint against the one recorded at each function's last deploy, so a
// walker change reads as "every function changed" and the next run redeploys all of
// them once. That is the safe direction (an extra deploy of unchanged code), and it is
// intended; just expect it.
//
// Over-fires in the safe direction only: a comment-only or type-only change in a
// closure flips the fingerprint (esbuild would emit identical bytes), so it costs a
// no-op deploy, never the reverse, where real drift passes unnoticed.

import ts from 'typescript';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

type TSNode = import('typescript').Node;

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

export type Unresolved = { from: string; spec: string };
type Closure = { files: string[]; unresolved: Unresolved[] };

// The transitive local-import closure of an entry file. Absolute paths
// throughout, so it is root-independent (the self-tests point it at a temp dir).
// `.json` files are included in the closure (they ship) but not parsed.
function computeClosure(entryAbs: string): Closure {
  const visited = new Set<string>();
  const unresolved: Unresolved[] = [];
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

export type Fingerprint = { fingerprint: string; closure: string[]; unresolved: Unresolved[] };

// Fingerprint = sha256 over the sorted `<relpath> <sha256(content)>` lines of
// the closure. Both path and content matter, so a rename or a content edit
// anywhere in the closure moves the fingerprint. `root` only sets the relpaths
// (kept stable/portable); pass the repo root for real functions, temp root in tests.
export function fingerprintEntry(entryAbs: string, root: string): Fingerprint {
  const { files, unresolved } = computeClosure(entryAbs);
  const rels = files.map((f) => toRel(root, f)).sort();
  const serialized = rels.map((rel) => `${rel} ${sha256(readNormalized(path.join(root, rel)))}`).join('\n');
  return {
    fingerprint: sha256(serialized),
    closure: rels,
    unresolved: unresolved.map((u) => ({ from: toRel(root, u.from), spec: u.spec })),
  };
}

export const functionsDir = (repoRoot: string) => path.join(repoRoot, 'supabase', 'functions');

// Every deployable function: a directory under supabase/functions/ with an
// `index.ts`. `_shared` is inlined into the functions that import it, never
// deployed on its own.
export function listFunctionDirs(fnsDir: string): string[] {
  return fs
    .readdirSync(fnsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '_shared' && fs.existsSync(path.join(fnsDir, e.name, 'index.ts')))
    .map((e) => e.name)
    .sort();
}

// Fingerprint every deployable function under a checkout. The deploy workflow
// calls this once for `main` and once per rollback source tree.
export function fingerprintFunctions(repoRoot: string): Record<string, Fingerprint> {
  const dir = functionsDir(repoRoot);
  const out: Record<string, Fingerprint> = {};
  for (const fn of listFunctionDirs(dir)) out[fn] = fingerprintEntry(path.join(dir, fn, 'index.ts'), repoRoot);
  return out;
}
