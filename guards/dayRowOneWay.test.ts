// One row, one way (History v2, HV-6 / CUL-1163; spec §7 AC 15, §5.5 "node in, row out").
//
// WHAT THE RULE IS. Home's spine and History v2's day cards draw a day's row through the
// SAME two modules and nothing else: the pipeline (`lib/dayNodes.ts`: `buildDay` /
// `buildDayNodes`) and the row (`components/dayRow/DayNodeRow.tsx`). A surface that
// imported the row's internals instead (the event row, the run row, the frame, the run
// rule, the node builder, the naming helpers) would be drawing a row "another way": its
// rows would drift from the other surface's the first time either changed, and a refusal
// Home keeps on its own line could fold on History (CUL-1121 was exactly one surface's
// rule differing from another's).
//
// HOW IT IS CHECKED. Every source file of both surfaces is parsed (the TypeScript AST, so
// a comment ABOUT a module is never an import of it, C-18), and every import from one of
// the row's modules must name only what that module lets a surface take (`ROW_MODULES`).
// A namespace import (`import * as`) or a `require()` of a row module names nothing it can
// be checked against, so it fails. The surface files are WALKED from the two directories,
// never listed, and the directories themselves are asserted to exist (C-38: a floor
// derived from the constant under test is green when an entry is removed from it).
//
// THE TWO SIDES (C-32). Home already draws through the modules, so its side is a floor
// with a real call site: some Home file must import `DayNodeRow` and some must call the
// pipeline. History v2's list is still HV-1's placeholder, so History's side is
// registered the PR the rule ships with the EMPTY SET MADE AN ASSERTION: exactly zero
// History files draw a day row today. HV-7 (CUL-1164) lands the first one; that PR reds
// this line, and turning it into History's own floor (the Home shape below) is the edit
// it forces. A rule registered after the first caller is a rule registered after the bug.
//
// BLIND SPOTS, stated so they do not read as coverage (C-38):
//   • A surface that imports a helper module OUTSIDE both surface directories which itself
//     re-exports or wraps a row internal is not followed (one hop is not walked). The row
//     modules' own exports are the realistic path, and they are checked.
//   • A dynamic `import()` is not parsed.
//   • A THIRD surface, a screen outside both directories that draws a day (a future
//     day-summary on the spine, say), is not scanned at all: the rule covers the two
//     surfaces AC 15 names. Such a screen adds its directory to `SURFACE_DIRS` the PR it lands.
//   • History v1 (`components/history/`, the flag-off tab) draws its own `EventRow` and is
//     out of scope by design: it is deleted at GA (HV-14), and until then flag-off is
//     byte-identical to today (C-36), which this rule must not disturb.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');

/** The two surfaces, as the directories their drawing lives in. */
const SURFACE_DIRS = {
  home: 'components/designV2/home',
  history: 'components/historyV2',
} as const;

/**
 * The row's modules (repo-relative, no extension), and exactly what a surface may import
 * from each. An empty set means a surface imports nothing from it: that module is the
 * row's inside.
 */
const ROW_MODULES: Readonly<Record<string, ReadonlySet<string>>> = {
  'components/dayRow/DayNodeRow': new Set(['DayNodeRow', 'DayNodeRowProps']),
  'components/dayRow/SpineNodeRow': new Set(),
  'lib/dayNodes': new Set([
    'buildDay',
    'buildDayNodes',
    'DayNode',
    'DayEventNode',
    'DayRunNode',
    'DayEvent',
    'DayModel',
    'DayReads',
    'DayTimings',
    'DayNodeFacts',
  ]),
  // The count line's words and the read gate are the day's, not a row's: TodayCard reads
  // the copy for exactly the rows the pipeline asks about (`mayCarryRead`, CUL-1197).
  'lib/spineNode': new Set(['countLine', 'mayCarryRead', 'SpineAnalysisRow']),
  'lib/spineCompaction': new Set(),
  'lib/rowChips': new Set(),
  'components/recap/DaySpine': new Set(),
};

/** The names a surface must reach for, to draw a day row at all. */
const DRAWS_ROWS = new Set(['DayNodeRow']);
const BUILDS_NODES = new Set(['buildDay', 'buildDayNodes']);

interface ImportUse {
  file: string;
  module: string;
  names: string[];
  /** A namespace import or a require(): nothing named, so nothing checkable. */
  opaque: boolean;
}

function walk(root: string, dir: string, out: string[] = []): string[] {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, rel, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Resolve a relative specifier from a file to a repo-relative module path, no extension. */
function resolveModule(root: string, fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const abs = path.resolve(path.dirname(path.join(root, fromFile)), spec);
  return path.relative(root, abs).replace(/\.(ts|tsx)$/, '').split(path.sep).join('/');
}

/** Every import (and require) of a row module in one file, off the AST. */
export function rowImportsOf(root: string, file: string): ImportUse[] {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const uses: ImportUse[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = resolveModule(root, file, node.moduleSpecifier.text);
      if (module && module in ROW_MODULES) {
        const clause = node.importClause;
        const names: string[] = [];
        let opaque = false;
        if (clause?.name) names.push('default');
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) opaque = true;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text);
        }
        uses.push({ file, module, names, opaque });
      }
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      // A surface re-exporting a row internal is handing it to someone else: checked alike.
      const module = resolveModule(root, file, node.moduleSpecifier.text);
      if (module && module in ROW_MODULES) {
        const clause = node.exportClause;
        const names = clause && ts.isNamedExports(clause) ? clause.elements.map((el) => (el.propertyName ?? el.name).text) : [];
        uses.push({ file, module, names, opaque: !clause || !ts.isNamedExports(clause) });
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const module = resolveModule(root, file, node.arguments[0].text);
      if (module && module in ROW_MODULES) uses.push({ file, module, names: [], opaque: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return uses;
}

/** The violations in a set of surface files: every opaque use, and every name the module
 *  does not let a surface take. */
export function violationsIn(root: string, files: readonly string[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    for (const use of rowImportsOf(root, file)) {
      if (use.opaque) {
        out.push(`${file}: imports ${use.module} without naming what it takes (a namespace import or a require)`);
        continue;
      }
      for (const name of use.names) {
        if (!ROW_MODULES[use.module].has(name)) out.push(`${file}: imports ${name} from ${use.module}, a row internal`);
      }
    }
  }
  return out;
}

/** Which of these files draw a day's row (import `DayNodeRow`) and which build its nodes. */
function callersIn(root: string, files: readonly string[]) {
  const uses = files.flatMap((f) => rowImportsOf(root, f));
  return {
    draws: [...new Set(uses.filter((u) => u.names.some((n) => DRAWS_ROWS.has(n))).map((u) => u.file))],
    builds: [...new Set(uses.filter((u) => u.names.some((n) => BUILDS_NODES.has(n))).map((u) => u.file))],
  };
}

// ── The live tree ─────────────────────────────────────────────────────────────

describe('one row, one way: Home and History draw a day only through the pipeline and DayNodeRow (AC 15)', () => {
  const homeFiles = walk(ROOT, SURFACE_DIRS.home);
  const historyFiles = walk(ROOT, SURFACE_DIRS.history);

  it('the floor: both surface directories exist in the repository and hold source to scan', () => {
    for (const dir of Object.values(SURFACE_DIRS)) expect(fs.existsSync(path.join(ROOT, dir))).toBe(true);
    expect(homeFiles.length).toBeGreaterThan(0);
    expect(historyFiles.length).toBeGreaterThan(0);
    // Every row module named here is a real file, so a rename cannot leave an entry that
    // matches nothing (and so checks nothing).
    for (const module of Object.keys(ROW_MODULES)) {
      expect(['.ts', '.tsx'].some((ext) => fs.existsSync(path.join(ROOT, module + ext)))).toBe(true);
    }
  });

  it('no Home or History file takes a row internal', () => {
    expect(violationsIn(ROOT, [...homeFiles, ...historyFiles])).toEqual([]);
  });

  it('Home draws its day through DayNodeRow over the pipeline (a real call site on each side)', () => {
    const home = callersIn(ROOT, homeFiles);
    expect(home.draws).toEqual(['components/designV2/home/Spine.tsx']);
    expect(home.builds).toEqual(['components/designV2/home/TodayCard.tsx']);
  });

  it('History: EXACTLY ZERO files draw a day row yet — firstCallerLands: HV-7 (CUL-1164)', () => {
    // When HV-7 wires History's list to `DayNodeRow` over `buildDayNodes`, this line reds.
    // That is the tripwire working (C-32): replace it with History's own floor, the shape
    // of the Home case above, in the same PR.
    const history = callersIn(ROOT, historyFiles);
    expect(history).toEqual({ draws: [], builds: [] });
  });
});

// ── The detector, proven outside the tree (C-18: fixtureRoot) ──────────────────

describe('the detector catches each way a surface could build a row another way', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('day-row-one-way', [SURFACE_DIRS.home, 'components/dayRow', 'lib']);
  });
  afterEach(() => removeFixtureRoot(root));

  const surface = (src: string) => {
    writeFixture(root, `${SURFACE_DIRS.home}/Card.tsx`, src);
    return violationsIn(root, walk(root, SURFACE_DIRS.home));
  };

  it('a named import of the event row, the run rule or the node builder', () => {
    expect(surface(`import { SpineEventRow } from '../../dayRow/SpineNodeRow';`)).toHaveLength(1);
    expect(surface(`import { compactSpine } from '../../../lib/spineCompaction';`)).toHaveLength(1);
    expect(surface(`import { buildSpine } from '../../../lib/spineNode';`)).toHaveLength(1);
    expect(surface(`import { SpineRowFrame } from '../../recap/DaySpine';`)).toHaveLength(1);
  });

  it('an aliased import is judged by the name it takes, never the local name', () => {
    expect(surface(`import { SpineCompactRow as DayNodeRow } from '../../dayRow/SpineNodeRow';`)).toHaveLength(1);
  });

  it('a namespace import, a require and a re-export', () => {
    expect(surface(`import * as Row from '../../dayRow/SpineNodeRow';`)).toHaveLength(1);
    expect(surface(`const Row = require('../../dayRow/SpineNodeRow');`)).toHaveLength(1);
    expect(surface(`export { SpineEventRow } from '../../dayRow/SpineNodeRow';`)).toHaveLength(1);
  });

  it('the one way is clean, and a comment ABOUT an internal is not an import of it', () => {
    expect(
      surface(
        [
          `// Never import { SpineEventRow } from '../../dayRow/SpineNodeRow' here.`,
          `import { DayNodeRow } from '../../dayRow/DayNodeRow';`,
          `import { buildDay, type DayNode } from '../../../lib/dayNodes';`,
          `import { countLine, mayCarryRead } from '../../../lib/spineNode';`,
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});
