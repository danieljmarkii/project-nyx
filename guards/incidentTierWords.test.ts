// One tier-word map, and nobody else names a read (EN-3, CUL-1133; spec §2, WBC-1).
//
// The per-incident read used to be named in its own words on each surface ("Worth a call"
// on the record, "read as worth a call" in the month and the chart text), so the day the
// tiers arrive every one of them would have needed finding. Now the words live in
// `lib/incidentTierWords.ts` and every surface asks it. This guard fails the build on the
// phrase "worth a call" in CODE (comments blanked, strings and JSX text kept) anywhere in
// the client trees but the map.
//
// WHAT IS NOT THIS PHRASE. The Signal's own ask is a different sentence with its own
// owner: "worth a call to your vet" (a burden card, a red-flag card, the diet trial's
// contaminant line). It is a finding's ask, not a per-incident read's tier, and it lives in
// the Signal's copy (`lib/signalCopy.ts`, `lib/signalHomeLine.ts`, `lib/dietTrial.ts`). The
// match excludes it by SHAPE, "worth a call" followed by " to your vet", so a bare
// "Worth a call" label can never hide behind it.
//
// NOT SCANNED: test files and `guards/` (their fixtures ARE the phrase, C-18);
// `supabase/functions/` (the server writes the read and has its own copy guards, and C-26
// keeps this client file out of their closure).
//
// STATED BLIND SPOTS (C-38): a phrase assembled at runtime ('worth a ' + 'call') is an
// evasion no source scan can see; a SQL comment inside a template literal is a string to
// the blanker, so a schema file's DDL comment is exempted by name below, never by a
// broader rule.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib', 'store', 'hooks', 'constants', 'widgets'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'dist']);

/** The one file allowed to hold the phrase. */
const MAP = 'lib/incidentTierWords.ts';

/** Exemptions, each with the reason it cannot be the map. An entry must still hold a hit
 *  (a stale entry would excuse whatever lands in it next, C-32). */
const EXEMPT: Record<string, string> = {
  'lib/localSchema.ts':
    'a SQL `--` comment inside the DDL template literal (the event_ai_verdicts header): prose about the table, never shown to anyone',
};

/** "worth a call", any case, not followed by " to your vet" (the Signal's own ask). */
export const TIER_PHRASE = /worth a call(?! to your vet)/i;

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(abs);
  }
}

export function phraseHits(root: string): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), files);
  return files
    .filter((abs) => TIER_PHRASE.test(blankComments(fs.readFileSync(abs, 'utf8'))))
    .map((abs) => path.relative(root, abs).split(path.sep).join('/'))
    .sort();
}

describe('the tier-word map is the only file that names a read', () => {
  const hits = phraseHits(ROOT);

  it('the scan reaches the real tree: the map itself is found (a non-vacuity floor, C-36)', () => {
    expect(hits).toContain(MAP);
  });

  it('no client file but the map (and its named exemptions) says "worth a call"', () => {
    expect(hits.filter((f) => f !== MAP && !(f in EXEMPT))).toEqual([]);
  });

  it('every exemption still holds the phrase (C-32)', () => {
    for (const f of Object.keys(EXEMPT)) expect(hits).toContain(f);
  });

  it('the shape: a bare label and "read as" fail; the Signal\'s ask and a comment pass', () => {
    expect(TIER_PHRASE.test("label: 'Worth a call'")).toBe(true);
    expect(TIER_PHRASE.test('photographed, read as worth a call')).toBe(true);
    expect(TIER_PHRASE.test('<Text>photo read as worth a call · 2 days</Text>')).toBe(true);
    expect(TIER_PHRASE.test("'worth a call to your vet today'")).toBe(false);
    expect(TIER_PHRASE.test(blankComments('const x = 1; // Worth a call\n'))).toBe(false);
  });
});
