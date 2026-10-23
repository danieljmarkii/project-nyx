// Home's computed import closure, shared by the guards that bound what Home may hold:
// `homeWrites.test.ts` (its write classes, C-33) and `homeCardSurface.test.ts` (one card
// surface and one door mark, CUL-1525). Lifted out of the first so the second walks the
// SAME files rather than a copy of the walk (a test file imported by another runs its
// suites twice, and a copied walk is how two guards come to disagree about one screen).
//
// Computed, never hand-listed: `app/(tabs)/index.tsx` plus every file under
// `components/home/`, then every relative import they reach, transitively.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export const HOME_ENTRY_FILE = 'app/(tabs)/index.tsx';
export const HOME_ENTRY_DIR = 'components/home';

/** Every relative specifier a file imports or re-exports, via the TS parser rather than
 *  a regex (robust to multiline imports and to a specifier inside a comment). */
function relativeSpecifiers(absFile: string, src: string): string[] {
  const kind = absFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absFile, src, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const push = (spec: string | undefined) => {
    if (spec && (spec.startsWith('./') || spec.startsWith('../'))) out.push(spec);
  };
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      push((node.arguments[0] as ts.StringLiteral).text);
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = /\.(ts|tsx)$/.test(spec)
    ? [base]
    : [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

const rel = (root: string, abs: string) => path.relative(root, abs).split(path.sep).join('/');

/** Home's transitive local-import closure, as repo-relative paths, sorted. */
export function homeClosure(root: string): string[] {
  const entries: string[] = [];
  const entryFile = path.join(root, HOME_ENTRY_FILE);
  if (fs.existsSync(entryFile)) entries.push(entryFile);
  const entryDir = path.join(root, HOME_ENTRY_DIR);
  if (fs.existsSync(entryDir)) {
    for (const name of fs.readdirSync(entryDir)) {
      if (/\.tsx?$/.test(name) && !name.includes('.test.')) entries.push(path.join(entryDir, name));
    }
  }
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const spec of relativeSpecifiers(cur, fs.readFileSync(cur, 'utf8'))) {
      const resolved = resolveSpec(cur, spec);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return [...seen].map((abs) => rel(root, abs)).sort();
}
