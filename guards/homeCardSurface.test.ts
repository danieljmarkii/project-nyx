// Home speaks one card language (CUL-1525 · G1 A, ruled 2026-10-03 on the CUL-1519 mock;
// `docs/culprit-home-one-language-mockups.html` §01 is the target frame).
//
// WHAT THE RULE IS. Every card on Home sits on ONE surface, `HomeCard`
// (`components/designV2/home/HomeCard.tsx`): one soft shadow, no border, one inset. And
// every door on Home draws ONE mark, `DoorMark` (`components/designV2/home/DoorMark.tsx`):
// a plain ›, with the round well on the Signal zone's lead row only.
//
// WHY A GUARD AND NOT A SENTENCE. Home spoke three languages because each card was built
// on the day it shipped, against the primitive nearest to hand: the Signal took
// `Card elevated`, every other card took `Card`'s outline, and each door drew its own ›
// at its own size, in its own grey, in or out of a well. The next card would do the same.
// So this file reds on the two shapes that drift:
//
//   1. a direct `components/ui/Card` import, or an `elevated` prop, anywhere in Home's
//      closure. `Card`'s default never changes for Home (other screens keep their outline);
//      Home stops reaching for it. No marker: a Home card that wants another surface is a
//      design ruling, not an exemption.
//   2. a raw › anywhere in the code of Home's `components/` and `app/` files, outside
//      `DoorMark`. A text link whose words end in › ("Patterns ›") is copy, not the mark,
//      and says so per SITE with `// door-mark-ok: <reason>` within ten lines above. In
//      `lib/`, `constants/`, `hooks/` and `store/`, where the labels' copy lives, only a
//      string that IS the glyph alone reds: a lone '›' exported for a card to render is the
//      door mark drawn somewhere else.
//
// THE CLOSURE is Home's computed import closure (`guards/homeClosure.ts`), the one
// `homeWrites.test.ts` walks, so the two guards cannot disagree about what Home holds.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';
import { homeClosure } from './homeClosure';

const ROOT = path.resolve(__dirname, '..');

/** The one component allowed to draw the glyph. */
const DOOR_MARK_FILE = 'components/designV2/home/DoorMark.tsx';
/** The primitive Home no longer imports. */
const UI_CARD = 'components/ui/Card';
const UI_BARREL = 'components/ui';

/** Where every › in code counts: the files that render. */
const RENDER_DIRS = ['components/', 'app/'];
/** Where only a lone-glyph string counts: the files that hold copy. */
const COPY_DIRS = ['lib/', 'constants/', 'hooks/', 'store/'];

const EXEMPTION = /door-mark-ok:\s*\S/;
const EXEMPTION_WINDOW = 10;

const GLYPH = /›|\\u203[aA]/;
const LONE_GLYPH = /(['"`])\s*(?:›|\\u203[aA])\s*\1/;

export interface SurfaceFinding {
  file: string;
  line: number;
  what: string;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** `components/ui/Card` reached directly, or `Card` named off the `components/ui` barrel. */
function cardImports(relPath: string, sf: ts.SourceFile): SurfaceFinding[] {
  const out: SurfaceFinding[] = [];
  const dir = path.posix.dirname(relPath);
  const target = (spec: string) => {
    if (!spec.startsWith('.')) return null;
    return path.posix.normalize(path.posix.join(dir, spec)).replace(/\.(tsx?|js)$/, '').replace(/\/index$/, '');
  };
  const visit = (node: ts.Node) => {
    let spec: string | null = null;
    let names: string[] | null = null;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) spec = node.moduleSpecifier.text;
      if (ts.isImportDeclaration(node)) {
        const b = node.importClause?.namedBindings;
        names = b && ts.isNamedImports(b) ? b.elements.map((e) => (e.propertyName ?? e.name).text) : [];
        if (b && ts.isNamespaceImport(b)) names.push('*');
      } else {
        const c = node.exportClause;
        names = c && ts.isNamedExports(c) ? c.elements.map((e) => (e.propertyName ?? e.name).text) : ['*'];
      }
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      spec = (node.arguments[0] as ts.StringLiteral).text;
      names = ['*'];
    }
    if (spec !== null) {
      const t = target(spec);
      if (t === UI_CARD) out.push({ file: relPath, line: lineOf(sf, node), what: `imports ${UI_CARD}` });
      else if (t === UI_BARREL && names && (names.includes('Card') || names.includes('*'))) {
        out.push({ file: relPath, line: lineOf(sf, node), what: `imports Card from ${UI_BARREL}` });
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

/** An `elevated` prop on any element: the floating surface Home retired. */
function elevatedProps(relPath: string, sf: ts.SourceFile): SurfaceFinding[] {
  const out: SurfaceFinding[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'elevated') {
      out.push({ file: relPath, line: lineOf(sf, node), what: 'elevated prop' });
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

function exempted(rawLines: string[], line: number): boolean {
  const from = Math.max(0, line - 1 - EXEMPTION_WINDOW);
  return rawLines.slice(from, line).some((l) => EXEMPTION.test(l));
}

/** A › drawn outside the door mark. Comments are blanked line-preservingly first, so a
 *  comment ABOUT the glyph never counts and the exemption window's lines still agree. */
function rawGlyphs(relPath: string, rawSource: string): SurfaceFinding[] {
  if (relPath === DOOR_MARK_FILE) return [];
  const render = RENDER_DIRS.some((d) => relPath.startsWith(d));
  const copy = COPY_DIRS.some((d) => relPath.startsWith(d));
  if (!render && !copy) return [];
  const pattern = render ? GLYPH : LONE_GLYPH;
  const rawLines = rawSource.split('\n');
  const out: SurfaceFinding[] = [];
  blankComments(rawSource)
    .split('\n')
    .forEach((text, i) => {
      if (pattern.test(text) && !exempted(rawLines, i + 1)) {
        out.push({ file: relPath, line: i + 1, what: render ? 'raw › outside DoorMark' : "a lone '›' string" });
      }
    });
  return out;
}

/** Every finding in one file of Home's closure. */
export function findSurfaceDrift(relPath: string, rawSource: string): SurfaceFinding[] {
  const kind = relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(relPath, rawSource, ts.ScriptTarget.Latest, true, kind);
  // The primitives' own directory re-exports `Card` (the barrel); that is the kit, not a
  // Home card reaching for it.
  const imports = relPath.startsWith(`${UI_BARREL}/`) ? [] : cardImports(relPath, sf);
  return [...imports, ...elevatedProps(relPath, sf), ...rawGlyphs(relPath, rawSource)];
}

/** The closure's files this rule reads (tests excluded: their fixtures are the shapes). */
export function scannedFiles(root: string): string[] {
  return homeClosure(root).filter((r) => !r.includes('.test.') && /\.tsx?$/.test(r));
}

export function scanHome(root: string): SurfaceFinding[] {
  return scannedFiles(root).flatMap((rel) => findSurfaceDrift(rel, fs.readFileSync(path.join(root, rel), 'utf8')));
}

const show = (fs_: SurfaceFinding[]) => fs_.map((f) => `${f.file}:${f.line} — ${f.what}`);

describe('Home speaks one card language (CUL-1525, G1 A)', () => {
  it('reaches every card Home draws (a non-vacuity floor)', () => {
    const files = scannedFiles(ROOT);
    for (const card of [
      'components/home/SignalZone.tsx',
      'components/designV2/home/TrialCard.tsx',
      'components/designV2/home/TodayCard.tsx',
      'components/designV2/home/CoverageDoor.tsx',
      'components/vetvisits/AppointmentStrip.tsx',
      'components/designV2/home/HomeCard.tsx',
      DOOR_MARK_FILE,
    ]) {
      expect(files).toContain(card);
    }
  });

  it('no Home card imports components/ui/Card, passes `elevated`, or draws its own ›', () => {
    expect(show(scanHome(ROOT))).toEqual([]);
  });

  it('the door mark is the one file that draws the glyph, and it still does', () => {
    // A DoorMark that stopped drawing › would leave the scan green over a Home with no mark.
    const src = fs.readFileSync(path.join(ROOT, DOOR_MARK_FILE), 'utf8');
    expect(GLYPH.test(blankComments(src))).toBe(true);
  });
});

describe('the detector itself', () => {
  let root = '';
  // Outside the repo (CUL-712), in Home's real SHAPE, so the closure walk is the live one.
  beforeEach(() => {
    root = createFixtureRoot('home-card-surface', ['app/(tabs)', 'components/home', 'components/ui', 'lib']);
    writeFixture(root, 'components/ui/Card.tsx', 'export function Card() { return null; }\n');
    writeFixture(root, 'components/ui/index.ts', "export { Card } from './Card';\n");
  });
  afterEach(() => {
    removeFixtureRoot(root);
  });

  const home = (cardSrc: string, extra: Record<string, string> = {}) => {
    writeFixture(root, 'app/(tabs)/index.tsx', "import { X } from '../../components/home/X';\nexport default X;\n");
    writeFixture(root, 'components/home/X.tsx', cardSrc);
    for (const [rel, src] of Object.entries(extra)) writeFixture(root, rel, src);
    return scanHome(root).map((f) => `${f.file} — ${f.what}`);
  };

  it('FLAGS a direct Card import', () => {
    expect(home("import { Card } from '../ui/Card';\nexport const X = Card;\n")).toEqual([
      'components/home/X.tsx — imports components/ui/Card',
    ]);
  });

  it('FLAGS Card named off the ui barrel, and a re-export', () => {
    expect(home("import { Card } from '../ui';\nexport { Card as Y } from '../ui/Card';\nexport const X = Card;\n")).toEqual([
      'components/home/X.tsx — imports Card from components/ui',
      'components/home/X.tsx — imports components/ui/Card',
    ]);
  });

  it('FLAGS a Card import one hop away, in a file only the closure reaches', () => {
    expect(
      home("import { Y } from '../shared/Y';\nexport const X = Y;\n", {
        'components/shared/Y.tsx': "import { Card } from '../ui/Card';\nexport const Y = Card;\n",
      }),
    ).toEqual(['components/shared/Y.tsx — imports components/ui/Card']);
  });

  it('leaves another name off the barrel alone', () => {
    expect(home("import { Divider } from '../ui';\nexport const X = Divider;\n")).toEqual([]);
  });

  it('FLAGS an `elevated` prop, and a marker does not excuse it', () => {
    expect(home('// door-mark-ok: no\nexport const X = () => <View elevated style={s} />;\n')).toEqual([
      'components/home/X.tsx — elevated prop',
    ]);
  });

  it('FLAGS a raw › in JSX text and in a string', () => {
    expect(home("export const X = () => <Text>›</Text>;\nexport const L = 'Open \\u203A';\n")).toEqual([
      'components/home/X.tsx — raw › outside DoorMark',
      'components/home/X.tsx — raw › outside DoorMark',
    ]);
  });

  it('takes a per-site marker within ten lines, and only for its site', () => {
    const src =
      '// door-mark-ok: a text link\n' +
      "export const A = 'Patterns ›';\n" +
      Array.from({ length: 10 }, () => 'export const pad = 1;\n').join('') +
      "export const B = 'Vet report ›';\n";
    expect(home(src)).toEqual(['components/home/X.tsx — raw › outside DoorMark']);
  });

  it('ignores a › in a comment', () => {
    expect(home('// the door draws › here\nexport const X = 1;\n')).toEqual([]);
  });

  it('in copy modules, FLAGS a lone glyph and leaves a labelled link alone', () => {
    expect(
      home("import { G, L } from '../../lib/copy';\nexport const X = [G, L];\n", {
        'lib/copy.ts': "export const G = '›';\nexport const L = 'Patterns ›';\n",
      }),
    ).toEqual(["lib/copy.ts — a lone '›' string"]);
  });

  it('lets DoorMark draw the glyph', () => {
    expect(
      home("import { DoorMark } from '../designV2/home/DoorMark';\nexport const X = DoorMark;\n", {
        [DOOR_MARK_FILE]: 'export const DoorMark = () => <Text>›</Text>;\n',
      }),
    ).toEqual([]);
  });
});
