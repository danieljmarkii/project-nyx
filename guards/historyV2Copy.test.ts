// History v2's words never shout (spec §7 AC 38; HV-12 / CUL-1169; the nyx-voice rule "no
// exclamation marks").
//
// WHY A SECOND GUARD. `guards/ownerFacingCopy.test.ts` fires where copy meets a sink it knows
// (JSX text, a label prop, an Alert, a snackbar literal). History v2 builds nearly every word
// in pure modules and hands it over as a returned string or a field (`text`, `lead`, `strong`,
// `line2`, a module constant), so that guard never sees it: HV-12's §7 walk planted a `!` in
// four of these files and it stayed green. This guard reads the STRINGS themselves instead.
//
// HOW. Each file is parsed with the TypeScript AST, so a comment, a `!==` or a non-null `x!`
// is never a string, and every string literal, template piece and JSX text is collected.
// None may hold a `!`. The component files are WALKED from their directories, never listed,
// and each directory and each named module must exist (C-38: a list derived from the constant
// under test is green when an entry goes missing). A floor on the number of strings read keeps
// the scan from passing over nothing.
//
// BLIND SPOTS, stated so they do not read as coverage (C-38):
//   • A `!` assembled at run time (`'Logged' + mark`) is not a literal and is not seen.
//   • A module outside the list below that returns History copy is not scanned; a new one
//     joins `COPY_MODULES` the PR it lands.
//   • Only the `!` rule lives here. The rest of the voice (the words themselves) is read by
//     the nyx-voice pass, and the error-string and stored-field rules stay ownerFacingCopy's.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');

/** Directories whose every non-test source file draws History v2 or the row it shares with
 *  Home. Walked, so a new file is read the day it lands. */
const COPY_DIRS = ['components/historyV2', 'components/dayRow'] as const;

/** The pure modules that hand those surfaces their words. */
const COPY_MODULES = [
  'lib/historyDays.ts',
  'lib/stripMarks.ts',
  'lib/historyControls.ts',
  'lib/historyScreen.ts',
  'lib/historyWindows.ts',
  'lib/recordDates.ts',
  'lib/spineNode.ts',
  'lib/dayEvents.ts',
] as const;

/** Every string a source file holds, with its line: literals, template pieces, JSX text. */
export function stringsIn(source: string, fileName: string): { text: string; line: number }[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; line: number }[] = [];
  const push = (node: ts.Node, text: string) => {
    if (text.trim().length === 0) return;
    out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) push(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) push(node, node.text);
    else if (ts.isJsxText(node)) push(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function sourceFilesIn(dir: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => path.join(dir, f));
}

describe('the detector reads strings, never code or comments', () => {
  it('finds a `!` in a literal, a template piece and JSX text', () => {
    const source = [
      "const a = 'Logged!';",
      'const b = `${n} logged!`;',
      'const c = <Text>Done!</Text>;',
      "const d = 'calm';",
    ].join('\n');
    const bangs = stringsIn(source, 'probe.tsx').filter((s) => s.text.includes('!'));
    expect(bangs.map((s) => s.line)).toEqual([1, 2, 3]);
  });

  it('never reads an operator, a non-null assertion or a comment as a string', () => {
    const source = ['if (a !== b && !c) run(x!);', '// Logged!', '/* Done! */', "const ok = 'fine';"].join('\n');
    expect(stringsIn(source, 'probe.ts').filter((s) => s.text.includes('!'))).toEqual([]);
  });
});

describe('History v2 never shouts (AC 38)', () => {
  const files = [...COPY_DIRS.flatMap(sourceFilesIn), ...COPY_MODULES];

  it('every directory and every named module exists', () => {
    for (const dir of COPY_DIRS) expect(fs.statSync(path.join(ROOT, dir)).isDirectory()).toBe(true);
    for (const file of COPY_MODULES) expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    // The walk found the screen, not an empty directory.
    expect(files.filter((f) => f.startsWith('components/historyV2/')).length).toBeGreaterThanOrEqual(10);
  });

  it('no string in them holds a `!`', () => {
    const bangs: string[] = [];
    let read = 0;
    for (const file of files) {
      const strings = stringsIn(fs.readFileSync(path.join(ROOT, file), 'utf8'), file);
      read += strings.length;
      for (const s of strings) if (s.text.includes('!')) bangs.push(`${file}:${s.line} ${JSON.stringify(s.text)}`);
    }
    expect(bangs).toEqual([]);
    // Not vacuous: the scan read the screen's words (about 1,080 strings when written).
    expect(read).toBeGreaterThan(500);
  });

  it('the words HV-12 wrote are among the strings it reads', () => {
    const all = files.flatMap((f) => stringsIn(fs.readFileSync(path.join(ROOT, f), 'utf8'), f).map((s) => s.text));
    for (const words of ['The trial so far ›', ' with nothing logged', 'nothing else logged', 'Photos and notes']) {
      expect(all.some((t) => t.includes(words))).toBe(true);
    }
  });
});
