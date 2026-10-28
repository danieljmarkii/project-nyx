// Every native date picker is pinned to the light ground it sits on (CUL-2228).
//
// The app has no dark mode, but app.json's `userInterfaceStyle` was "automatic" (the
// scaffold's default, never a ruling), so iOS handed UIDatePicker the phone's appearance.
// After dark it drew its night labels on our white sheets: the month, every pickable day
// and the time vanished, and only the tinted selection and the grey disabled days survived.
// app.json says "light" now (CUL-2229, guards/nativeConfig.test.ts), but only a native
// build carries that; `themeVariant="light"` is what reaches the builds already installed,
// and it holds if the plist ever reverts. `accentColor` puts the selection on the action
// colour (CUL-2161), whose sweep re-pointed the accents that existed and could not see the
// sites that had none, which is how TimeEditSheet, the one Change time sheet, kept the
// night labels while the log sheet's pickers had carried the fix since B-010. A picker on
// a night ground would pin "dark" and change this guard on purpose.
//
// BLIND SPOT, stated so it does not read as coverage (C-38): the scan reads JSX tags bound
// to the package's default import. A re-export, a wrapper component or a createElement
// call is not seen; the second test reds a file that imports the picker and renders no
// tag the scan can read, which is where an alias would show.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components'];
const PACKAGE = '@react-native-community/datetimepicker';
const ACCENT = 'colorRoles.action.onLight';
const THEME_PROP = 'themeVariant="light"';
const ACCENT_PROP = `accentColor={${ACCENT}}`;

interface PickerSite {
  line: number;
  missing: string[];
}

interface FileScan {
  importsPicker: boolean;
  sites: PickerSite[];
}

/** The local names a file binds to the package's default export. */
function pickerNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== PACKAGE) continue;
    const name = stmt.importClause?.name;
    if (name) names.add(name.text);
  }
  return names;
}

function missingProps(element: ts.JsxSelfClosingElement | ts.JsxOpeningElement, sf: ts.SourceFile): string[] {
  const attrs = new Map<string, ts.JsxAttribute>();
  for (const prop of element.attributes.properties) {
    if (ts.isJsxAttribute(prop)) attrs.set(prop.name.getText(sf), prop);
  }
  const missing: string[] = [];
  const theme = attrs.get('themeVariant')?.initializer;
  if (!(theme && ts.isStringLiteral(theme) && theme.text === 'light')) missing.push(THEME_PROP);
  const accent = attrs.get('accentColor')?.initializer;
  if (!(accent && ts.isJsxExpression(accent) && accent.expression?.getText(sf) === ACCENT)) missing.push(ACCENT_PROP);
  return missing;
}

function scan(src: string): FileScan {
  const sf = ts.createSourceFile('scan.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = pickerNames(sf);
  const sites: PickerSite[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && names.has(node.tagName.getText(sf))) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      sites.push({ line, missing: missingProps(node, sf) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { importsPicker: names.size > 0, sites };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, out);
    } else if (/\.tsx$/.test(ent.name) && !/\.test\.tsx$/.test(ent.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

describe('every native date picker is pinned to its light ground (CUL-2228)', () => {
  const scans = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).map((rel) => ({
    rel,
    ...scan(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
  }));
  const sites = scans.flatMap((s) => s.sites.map((site) => ({ rel: s.rel, ...site })));

  it('every picker carries themeVariant="light" and the action accent', () => {
    const unpinned = sites
      .filter((s) => s.missing.length > 0)
      .map((s) => `${s.rel}:${s.line} lacks ${s.missing.join(' and ')}`);
    expect(unpinned).toEqual([]);
  });

  it('every file that imports the picker renders it where the scan can read it', () => {
    // Non-vacuity, both ways: the sheet that shipped the night labels is still read,
    // and an import with no readable tag (an alias, a pass-through) is a hole, not a pass.
    expect(sites.map((s) => s.rel)).toContain('components/ui/TimeEditSheet.tsx');
    expect(scans.filter((s) => s.importsPicker && s.sites.length === 0).map((s) => s.rel)).toEqual([]);
  });

  it('red-check: an unpinned, dark, computed or wrong-role picker reds; a pinned one, a namesake and a comment do not', () => {
    const imp = `import DateTimePicker from '${PACKAGE}';\n`;
    const missing = (src: string): string[][] => scan(src).sites.map((s) => s.missing);
    expect(missing(`${imp}<DateTimePicker value={d} mode="date" />;`)).toEqual([[THEME_PROP, ACCENT_PROP]]);
    expect(missing(`${imp}<DateTimePicker value={d} ${THEME_PROP} ${ACCENT_PROP} />;`)).toEqual([[]]);
    expect(missing(`${imp}<DateTimePicker themeVariant="dark" ${ACCENT_PROP} />;`)).toEqual([[THEME_PROP]]);
    expect(missing(`${imp}<DateTimePicker themeVariant={variant} ${ACCENT_PROP} />;`)).toEqual([[THEME_PROP]]);
    expect(missing(`${imp}<DateTimePicker ${THEME_PROP} accentColor={theme.colorAccent} />;`)).toEqual([[ACCENT_PROP]]);
    expect(missing(`${imp}<DateTimePicker {...LIGHT_PICKER} />;`)).toEqual([[THEME_PROP, ACCENT_PROP]]);
    expect(missing(`import RNPicker from '${PACKAGE}';\n<RNPicker value={d} />;`)).toEqual([[THEME_PROP, ACCENT_PROP]]);
    expect(missing(`import DateTimePicker from './OurPicker';\n<DateTimePicker value={d} />;`)).toEqual([]);
    expect(missing(`${imp}// <DateTimePicker value={d} />\n`)).toEqual([]);
    expect(scan(`${imp}const Picker = DateTimePicker;\n<Picker value={d} />;`)).toEqual({ importsPicker: true, sites: [] });
  });
});
