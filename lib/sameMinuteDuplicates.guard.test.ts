// AC 4's guard (CUL-1161 / HV-4; spec §7 AC 4): History v2 discloses same-minute duplicates
// with the vet report's OWN rule, imported from `lib/sameMinuteDuplicates.ts`, and never
// works them out itself. A second copy of the rule is the defect this module exists to end
// (PMD-10: two counts of one record, disagreeing with nothing to say why), so a History v2
// file that spells the rule's window or its group keys reds the build.
//
// ── THE SCANNED SET IS DERIVED FROM THE REPOSITORY (C-38) ────────────────────────
// Every non-test file under `components/historyV2/`, and every `lib/` file that imports
// History v2's numbers (`./historyDays` or `./historyQueries`), plus those two. A file that
// joins History v2 later is scanned the day it imports them; nothing here lists files by
// name except the two the floor asserts are present.
//
// ── WHAT IT SEES, AND WHAT IT DOES NOT ───────────────────────────────────────────
// It matches the rule's two fingerprints in comment-blanked source: a 60-second window
// (`60_000`, `60000`, `60 * 1000`) and the report's group keys as strings (`meal|`,
// `keep|`). STATED BLIND SPOTS: a window computed some other way (`59_999 + 1`,
// `MINUTE_MS` from elsewhere), and a re-derivation in a file that imports neither module.
// The positive half closes part of that: the one History file that reports duplicates
// must reach the shared module for them. Exemption: `// same-minute-ok: <reason>`, one per
// file, for a 60-second constant that means something else.

/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

import { blankComments } from '../guards/blankComments';

const ROOT = join(__dirname, '..');

const WINDOW_LITERAL = /\b60_?000\b|\b60\s*\*\s*1000\b|\b1000\s*\*\s*60\b/;
const GROUP_KEY = /['"`](?:meal|keep)\|/;
const IMPORTS_HISTORY_NUMBERS = /from\s+['"]\.\/(?:historyDays|historyQueries)['"]/;
const EXEMPTION = /\/\/\s*same-minute-ok:\s*\S+/;

/** The fingerprints of a re-derived rule in one file's source, comments blanked. */
export function rederivations(source: string): string[] {
  if (EXEMPTION.test(source)) return [];
  const code = blankComments(source);
  const found: string[] = [];
  if (WINDOW_LITERAL.test(code)) found.push('a 60-second window');
  if (GROUP_KEY.test(code)) found.push('the report\'s group keys');
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) out.push(full);
  }
  return out;
}

/** History v2's files, derived from the tree (see the header). */
function historyV2Files(): string[] {
  const lib = readdirSync(join(ROOT, 'lib'))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(ROOT, 'lib', f))
    .filter((full) => {
      const name = relative(ROOT, full);
      return name === 'lib/historyDays.ts' || name === 'lib/historyQueries.ts' || IMPORTS_HISTORY_NUMBERS.test(readFileSync(full, 'utf8'));
    });
  return [...lib, ...walk(join(ROOT, 'components', 'historyV2'))].map((f) => relative(ROOT, f)).sort();
}

describe('AC 4 — History v2 never re-derives the same-minute rule', () => {
  const files = historyV2Files();

  it('the scanned set is not vacuous: it holds History v2\'s numbers', () => {
    expect(files).toEqual(expect.arrayContaining(['lib/historyDays.ts', 'lib/historyQueries.ts']));
  });

  it('no History v2 file spells the rule\'s window or its group keys', () => {
    const offenders = files
      .map((f) => ({ f, found: rederivations(readFileSync(join(ROOT, f), 'utf8')) }))
      .filter((x) => x.found.length > 0)
      .map((x) => `${x.f}: ${x.found.join(', ')}`);
    // Fix: import collapseSameMinute from lib/sameMinuteDuplicates.ts, or, for a 60-second
    // constant that means something else, a `// same-minute-ok: <reason>` in the file.
    expect(offenders).toEqual([]);
  });

  it('the file that reports duplicates reaches them through the shared module', () => {
    const src = blankComments(readFileSync(join(ROOT, 'lib/historyDays.ts'), 'utf8'));
    expect(src).toMatch(/import\s*\{[^}]*\bcollapseSameMinute\b[^}]*\}\s*from\s*'\.\/sameMinuteDuplicates'/);
    expect(src).toMatch(/collapseSameMinute\(/);
  });

  // The detector, driven directly: a guard that has only ever been green has not been tested.
  it('red-check: the detector catches each fingerprint, in any spelling', () => {
    expect(rederivations('const WINDOW = 60_000;')).toEqual(['a 60-second window']);
    expect(rederivations('if (b - a <= 60000) pair();')).toEqual(['a 60-second window']);
    expect(rederivations('const W = 60 * 1000;')).toEqual(['a 60-second window']);
    expect(rederivations('const k = `meal|${e.foodItemId}`;')).toEqual(['the report\'s group keys']);
    expect(rederivations("return 'keep|' + e.id;")).toEqual(['the report\'s group keys']);
  });

  it('red-check: prose about the rule, other numbers and an exemption do not count', () => {
    expect(rederivations('// the report collapses within 60_000 ms by meal| keys')).toEqual([]);
    expect(rederivations('const DAY = 86_400_000; const PAGE = 50;')).toEqual([]);
    expect(rederivations('// same-minute-ok: a one-minute animation budget\nconst T = 60_000;')).toEqual([]);
  });
});
