// Width reads go through the column hook (CUL-2237).
//
// From the iOS 27 SDK the app gets the unfolded Duo's whole canvas, and a component
// sized off the window there sizes itself for a screen its content does not sit in: the
// root layout centres everything in a column (`components/ui/LayoutColumn.tsx`). So the
// window's WIDTH is read in one place, `hooks/useLayoutClass.ts`, and everything else
// asks it: `useColumnWidth()` for content, `useColumn().gutter` for chrome that bleeds,
// `useWindowFrame()` for the few things that must span the window. Height and fontScale
// stay free: the column caps width only.
//
// WHAT IT READS. Every `useWindowDimensions()` and `Dimensions.get(...)` under app/,
// components/, hooks/, store/ and lib/ (tests aside), parsed, and whether the result's
// `width` is taken: `.width` on the call, a `{ width }` destructure, or the same through
// one named binding. A result handed on whole (`f(useWindowDimensions())`) counts as a
// width read, since the guard cannot see what the callee takes. `Dimensions.addEventListener`
// and a bare reference to the hook (an alias) count too.
//
// THE REGISTRY is an exemption (C-32), so it holds only files that MUST read the window's
// width, each with its reason, and it ratchets: a registered file that stops reading it
// reds, so the entry is deleted the PR it goes stale.
//
// BLIND SPOT, stated: a width that arrives by `onLayout` is not a window read and is not
// scanned. That is the right tool for a component that sizes itself to its parent, and it
// already follows the column.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCANNED = ['app', 'components', 'hooks', 'store', 'lib'];

const REGISTRY: Record<string, string> = {
  'hooks/useLayoutClass.ts': 'the hook itself: the one place the window width is read',
};

function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isWindowCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'useWindowDimensions';
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Dimensions' &&
    callee.name.text === 'get'
  );
}

function bindingTakesWidth(pattern: ts.ObjectBindingPattern): boolean {
  return pattern.elements.some((el) => {
    const key = el.propertyName ?? el.name;
    return (ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === 'width';
  });
}

/** Does this identifier, bound to a window read, have its width taken anywhere in the file? */
function nameTakesWidth(sf: ts.SourceFile, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name && node.name.text === 'width') found = true;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === name &&
      bindingTakesWidth(node.name)
    ) found = true;
    // Handed on whole: the callee may read it.
    if (ts.isCallExpression(node) && node.arguments.some((a) => ts.isIdentifier(a) && a.text === name)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** The 1-indexed lines in `src` that read the window's width. */
export function windowWidthReads(src: string, fileName = 'file.tsx'): number[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = new Set<number>();
  const at = (node: ts.Node) => lines.add(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
  const visit = (node: ts.Node): void => {
    if (isWindowCall(node)) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
        if (parent.name.text === 'width') at(node);
      } else if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
        if (ts.isObjectBindingPattern(parent.name) ? bindingTakesWidth(parent.name) : ts.isIdentifier(parent.name) && nameTakesWidth(sf, parent.name.text)) at(node);
      } else {
        at(node);
      }
    }
    // Subscribing to the window is a width read waiting to happen.
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Dimensions' &&
      node.name.text === 'addEventListener'
    ) at(node);
    // An alias (`const dims = useWindowDimensions`) hides every later call from the scan.
    if (
      ts.isIdentifier(node) &&
      node.text === 'useWindowDimensions' &&
      !ts.isCallExpression(node.parent) &&
      !ts.isImportSpecifier(node.parent)
    ) at(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...lines].sort((a, b) => a - b);
}

const files = SCANNED.flatMap((d) => walk(path.join(REPO_ROOT, d), [])).map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'));
const readsOf = new Map(files.map((rel) => [rel, windowWidthReads(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'), rel)]));

describe('the detector', () => {
  it.each([
    ['a destructured width', 'const { width } = useWindowDimensions();', [1]],
    ['a renamed width', 'const { width: w, fontScale } = useWindowDimensions();', [1]],
    ['a width off the call', 'const w = useWindowDimensions().width;', [1]],
    ['a one-shot Dimensions read', "const w = Dimensions.get('window').width;", [1]],
    ['a width through a named binding', 'const frame = useWindowDimensions();\nplan(frame.width);', [1]],
    ['a destructure of a named binding', 'const frame = useWindowDimensions();\nconst { width } = frame;', [1]],
    ['a result handed on whole', 'plan(useWindowDimensions());', [1]],
    ['a subscription', "Dimensions.addEventListener('change', f);", [1]],
    ['an alias', 'const dims = useWindowDimensions;', [1]],
  ])('reads %s', (_label, src, lines) => {
    expect(windowWidthReads(src)).toEqual(lines);
  });

  it.each([
    ['a height', 'const { height } = useWindowDimensions();'],
    ['a font scale off the call', 'const s = useWindowDimensions().fontScale;'],
    ['a named binding read for height only', 'const frame = useWindowDimensions();\nplan(frame.height, frame.fontScale);'],
    ['a one-shot height', "const h = Dimensions.get('window').height;"],
    ['the import', "import { useWindowDimensions } from 'react-native';"],
  ])('lets %s through', (_label, src) => {
    expect(windowWidthReads(src)).toEqual([]);
  });
});

describe('the window width is read only by the layout hook (CUL-2237)', () => {
  it('scans the app (non-vacuity)', () => {
    expect(files.length).toBeGreaterThan(300);
    // Height and fontScale reads are still out there, so the scan is reading real calls.
    expect(files.filter((f) => /useWindowDimensions\(\)/.test(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))).length).toBeGreaterThan(5);
  });

  it('finds no width read outside the registry', () => {
    const offenders = [...readsOf]
      .filter(([rel, lines]) => lines.length > 0 && !(rel in REGISTRY))
      .map(([rel, lines]) => `${rel}:${lines.join(',')}`);
    expect(offenders).toEqual([]);
  });

  it('keeps no stale registry entry (it ratchets)', () => {
    const stale = Object.keys(REGISTRY).filter((rel) => (readsOf.get(rel) ?? []).length === 0);
    expect(stale).toEqual([]);
  });
});
