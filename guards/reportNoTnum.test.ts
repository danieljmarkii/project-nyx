// No vet report stylesheet asks for tabular figures (CUL-2385, the stopgap; v2 spec §7).
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
//   • It proves the property is absent, not that every digit extracts: Inter's contextual
//     alternates still drop a few `(`, `,` and `–` in Chromium. The extraction job (VR2-12)
//     is the behavioural check.

import * as fs from 'fs';
import * as path from 'path';

const REPORT_DIR = path.join(__dirname, '..', 'supabase', 'functions', 'generate-report');

/** The tabular-figure declarations in a source's text, CSS comments dropped first. */
function tnumDeclarationsIn(src: string): string[] {
  const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const found: string[] = [];
  for (const m of css.matchAll(/font-variant-numeric\s*:[^;}"'`]*/gi)) found.push(m[0]);
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
