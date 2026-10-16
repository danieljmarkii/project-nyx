// The home screen never says the widget is unfinished (CUL-1842, D8; App Review 2.1
// and 2.2). The widget graduated at 1.2.0, so nothing an owner meets on the home
// screen (the widget itself, or its entry in the widget gallery and its edit sheet)
// may say "beta", "early access" or "coming soon".
//
// Two sources hold every such string:
//   • widgets/*.tsx — the layouts the extension renders. Walked with the TypeScript
//     parser, so only real string literals and JSX text are read and a comment that
//     mentions the old beta can neither trip the guard nor hide a literal.
//   • app.json's `expo-widgets` block — the gallery name and description, and the
//     configuration sheet's title, description and option names.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

const ROOT = join(__dirname, '..');
const UNFINISHED = /\bbetas?\b|\bearly[\s-]access\b|\bcoming\s+soon\b/i;

function literalsOf(source: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push(node.text);
    } else if (ts.isJsxText(node) && node.text.trim()) {
      out.push(node.text.trim());
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function widgetLayoutStrings(): string[] {
  const dir = join(ROOT, 'widgets');
  return readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .flatMap((f) => literalsOf(readFileSync(join(dir, f), 'utf8'), f));
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

function galleryStrings(): string[] {
  const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as {
    expo: { plugins: unknown[] };
  };
  const entry = appJson.expo.plugins.find(
    (p): p is [string, { widgets: unknown[] }] => Array.isArray(p) && p[0] === 'expo-widgets',
  );
  if (!entry) return [];
  return entry[1].widgets.flatMap(stringsIn);
}

describe('the home screen never says the widget is unfinished (CUL-1842)', () => {
  it('reads the strings it guards (non-vacuity)', () => {
    // The walk reaches the widget's own doors and the gallery copy, so an empty read
    // cannot pass for a clean one.
    expect(widgetLayoutStrings()).toContain('No pet in this slot yet');
    expect(widgetLayoutStrings()).toContain('Nothing logged yet today');
    expect(galleryStrings()).toContain('Culprit');
    expect(galleryStrings().some((s) => s.startsWith('See what'))).toBe(true);
  });

  it('the pattern catches each phrase it exists for', () => {
    for (const s of ['Beta', 'In beta', 'Early access', 'early-access', 'Coming soon']) {
      expect(UNFINISHED.test(s)).toBe(true);
    }
    // A word that merely contains the letters is not a hit.
    expect(UNFINISHED.test('Alphabetical')).toBe(false);
  });

  it('no widget layout string says beta, early access or coming soon', () => {
    expect(widgetLayoutStrings().filter((s) => UNFINISHED.test(s))).toEqual([]);
  });

  it('no gallery or configuration string says beta, early access or coming soon', () => {
    expect(galleryStrings().filter((s) => UNFINISHED.test(s))).toEqual([]);
  });
});
