// No vet report stylesheet asks for tabular figures (CUL-2385, the stopgap; v2 spec §7), and every
// renderer turns off the font features that drop punctuation beside a digit (CUL-2386).
//
// WHY. `font-variant-numeric: tabular-nums` (and `font-feature-settings: "tnum"`) makes the
// browser draw the font's tnum alternates. In the PDF Chromium prints, those glyphs carry no
// ToUnicode entry, so a text extractor drops them: measured 2026-11-01 with pypdf and
// pdfminer over every v2 fixture, Cooper's band read "below this pet's baseline for
// consecutive days" with the 2 gone, and a v1 sample kept 374 of its 978 digits. A clinic's
// AI summarizer reads the same text layer, so a flag line lost its numbers. The aligned
// figures come back with VR2-11's embedded subset, whose tnum is frozen into the default
// cmap; until then no report stylesheet selects the feature at all.
//
// SCOPE is derived, never listed: every non-test module under generate-report/, so a new
// renderer is scanned the day it lands. CSS comments are dropped before matching, because
// the stopgap explains itself in prose inside the stylesheet; a declaration is a property
// name followed by a colon.
//
// BLIND SPOTS, stated so they never read as coverage:
//   • A stylesheet built outside generate-report/ (a shared CSS helper under _shared/) is not
//     scanned. None exists today.
//   • An inline `style="…"` assembled from pieces (`'font-variant-' + 'numeric'`) escapes the
//     match. Write a declaration whole.
//   • It proves declarations, not extraction. The extraction job (VR2-12) is the behavioural check.
//
// CUL-2386, PART TWO. Inter (the runner's sans) swaps the punctuation beside a digit for a
// contextual alternate that has no ToUnicode entry, so the PDF's text layer lost it: measured
// 2026-11-02 with Chromium page.pdf, pypdf and pdfminer, v1 Cooper kept 0 of 54 "d:d", 0 of 12
// "(d" and 0 of 9 "×d" ("48–72 h" read "4872 h"), and v2's numbered lines lost their numbers to
// the UA stylesheet's tabular ::marker. With `calt` and `case` off on every element and the marker
// reset, all of them extract in both tools and the five PDFs measured hold no private-use glyph.
// So every renderer must carry both rules, and no report module may switch either feature back on.
// The one `font-variant-numeric` declaration allowed is the reset to `normal`, which selects
// nothing.

import * as fs from 'fs';
import * as path from 'path';

const REPORT_DIR = path.join(__dirname, '..', 'supabase', 'functions', 'generate-report');

/** The tabular-figure declarations in a source's text, CSS comments dropped first. */
function tnumDeclarationsIn(src: string): string[] {
  const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const found: string[] = [];
  for (const m of css.matchAll(/font-variant-numeric\s*:[^;}"'`]*/gi)) if (!/:\s*normal\s*$/i.test(m[0])) found.push(m[0]);
  for (const m of css.matchAll(/font-feature-settings\s*:[^;}`]*tnum[^;}`]*/gi)) found.push(m[0]);
  for (const m of css.matchAll(/fontVariantNumeric\s*:/g)) found.push(m[0]);
  return found;
}

function reportModules(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ts$/.test(entry.name) && !/\.test\.ts$|\.testutil\.ts$/.test(entry.name)) out.push(full);
    }
  };
  walk(REPORT_DIR);
  return out.sort();
}

describe('tnumDeclarationsIn (the detector)', () => {
  it('finds the declaration in each spelling a stylesheet uses', () => {
    expect(tnumDeclarationsIn('body{font-size:9pt;font-variant-numeric:tabular-nums;}')).toHaveLength(1);
    expect(tnumDeclarationsIn('.n{ font-variant-numeric : tabular-nums lining-nums }')).toHaveLength(1);
    expect(tnumDeclarationsIn('.n{font-feature-settings:"tnum" 1;}')).toHaveLength(1);
    expect(tnumDeclarationsIn("<td style='font-feature-settings: \"tnum\", \"lnum\"'>")).toHaveLength(1);
  });

  it('ignores prose about the property inside a CSS comment, and unrelated features', () => {
    expect(tnumDeclarationsIn('/* no font-variant-numeric: here, see CUL-2385 */ .num{}')).toEqual([]);
    expect(tnumDeclarationsIn('.c{font-feature-settings:"liga" 0;}')).toEqual([]);
  });

  it('allows the reset to normal, and nothing else', () => {
    expect(tnumDeclarationsIn('::marker{font-variant-numeric:normal;}')).toEqual([]);
    expect(tnumDeclarationsIn('::marker{font-variant-numeric:normal tabular-nums;}')).toHaveLength(1);
  });
});

/** The rules that keep punctuation beside a digit in the text layer (CUL-2386). */
const TEXT_LAYER_RULES = [/\*\s*\{\s*font-feature-settings\s*:\s*"calt"\s+0\s*,\s*"case"\s+0\s*;?\s*\}/, /::marker\s*\{\s*font-variant-numeric\s*:\s*normal\s*;?\s*\}/];

/** Declarations that turn `calt` or `case` back on (any value but 0 or off), CSS comments dropped. */
function punctuationDroppersIn(src: string): string[] {
  const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const found: string[] = [];
  for (const m of css.matchAll(/font-feature-settings\s*:([^;}`]*)/gi)) {
    for (const f of m[1].matchAll(/["'](calt|case)["']\s*(\w+)?/gi)) {
      if (!/^(0|off)$/i.test(f[2] ?? '')) found.push(m[0].trim());
    }
  }
  for (const m of css.matchAll(/font-variant-ligatures\s*:[^;}`]*(?<![-\w])contextual(?![-\w])/gi)) found.push(m[0].trim());
  return found;
}

describe('punctuationDroppersIn (the detector)', () => {
  it('finds calt or case switched on in any spelling', () => {
    expect(punctuationDroppersIn('.n{font-feature-settings:"calt";}')).toHaveLength(1);
    expect(punctuationDroppersIn('.n{font-feature-settings:"case" 1;}')).toHaveLength(1);
    expect(punctuationDroppersIn(".n{font-feature-settings:'calt' on, 'liga' 0}")).toHaveLength(1);
    expect(punctuationDroppersIn('.n{font-variant-ligatures:contextual}')).toHaveLength(1);
  });

  it('passes the off switch, unrelated features and prose in a comment', () => {
    expect(punctuationDroppersIn('*{font-feature-settings:"calt" 0,"case" 0;}')).toEqual([]);
    expect(punctuationDroppersIn('.n{font-variant-ligatures:no-contextual}')).toEqual([]);
    expect(punctuationDroppersIn('/* font-feature-settings:"calt" 1 */ .n{}')).toEqual([]);
  });
});

describe('the report stylesheets (live)', () => {
  const modules = reportModules();

  it('scans every renderer (non-vacuity floor)', () => {
    const names = modules.map((m) => path.basename(m));
    for (const renderer of ['render.ts', 'renderPrintV2.ts', 'renderPhoneV2.ts']) expect(names).toContain(renderer);
  });

  it('no report module selects tabular figures', () => {
    const offenders = modules.flatMap((m) =>
      tnumDeclarationsIn(fs.readFileSync(m, 'utf8')).map((d) => `${path.relative(REPORT_DIR, m)}: ${d.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the report stylesheets keep punctuation beside a digit (live, CUL-2386)', () => {
  const RENDERERS = ['render.ts', 'renderPrintV2.ts', 'renderPhoneV2.ts'];

  it('every renderer turns calt and case off on every element and resets the list marker', () => {
    for (const r of RENDERERS) {
      const css = fs.readFileSync(path.join(REPORT_DIR, r), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
      for (const rule of TEXT_LAYER_RULES) expect({ r, carries: rule.test(css) }).toEqual({ r, carries: true });
    }
  });

  it('no report module switches calt or case back on', () => {
    const offenders = reportModules().flatMap((m) =>
      punctuationDroppersIn(fs.readFileSync(m, 'utf8')).map((d) => `${path.relative(REPORT_DIR, m)}: ${d}`),
    );
    expect(offenders).toEqual([]);
  });
});
