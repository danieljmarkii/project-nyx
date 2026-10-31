// Report surfaces never read an entitlement, and the beta gate never swaps a care
// surface to Premium (vet report v2 spec §13 and AC 10, CUL-2288).
//
// WHY. Pets > $: vet report export is always free. The beta shelf's scale path (beta-
// features D9) moves a beta's Gate 1 from the allowlist to the Premium entitlement; the
// report betas are exempt, a named narrowing of D9 carried by `careSurface: true` on
// their registry rows (lib/betaFeatures.ts). Two halves, two checks:
//
//   1. No report module reads an entitlement or names Premium in code or copy. The
//      module set is DERIVED from the repository (every non-test source whose path says
//      "report" under the app's source roots, plus the generate-report function), never
//      a hard list, so a new report file is scanned the day it lands (C-38).
//   2. A beta gate file (where Gate 1 is resolved) that ever reads an entitlement must
//      also name `careSurface` in code, so the D9 swap cannot be built without facing
//      the exemption.
//
// BLIND SPOTS, stated so they never read as coverage:
//   • A report surface whose path never says "report" (a composer under a neutral name)
//     is not in the set. Name report modules for what they are.
//   • A helper outside the set that a report module imports is not followed: a shared
//     `lib/tier.ts` read reached through one import hop passes. Half 2 covers the gate
//     files; a new shared tier helper owes its own entry here.
//   • Half 2 checks that `careSurface` is named, not that the swap honours it; the swap's
//     own PR carries the behavioural test.
//
// Comments are blanked first (guards/blankComments.ts): the D9 narrowing is explained in
// prose in these very files, and prose is not a read. String literals are kept, so owner
// copy that says "Premium" in a report module reds (AC 10: no Premium mention in the flow).

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const REPO_ROOT = path.join(__dirname, '..');

// The app's source roots. A report module under any of them is scanned.
const SOURCE_ROOTS = ['app', 'components', 'lib', 'hooks', 'store', 'constants'];
// The report's server half, scanned whole whatever its file names say.
const REPORT_FUNCTION_DIR = path.join('supabase', 'functions', 'generate-report');
// Where Gate 1 is resolved for the beta shelf.
const GATE_FILES = ['lib/betaFeatures.ts', 'hooks/useBetaShelf.ts', 'lib/appConfig.ts', 'hooks/useAppConfig.ts'];

const SOURCE_FILE = /\.tsx?$/;
const NOT_SOURCE = /\.test\.tsx?$|\.testutil\.ts$|\.d\.ts$/;
const REPORT_PATH = /report/i;

// An entitlement read or a tier word. `premium` alone covers copy and identifiers
// (`isPremium`, `usePremium`, "Premium" in a string); `entitlements?` covers the table
// and any helper named for it.
const TIER = /\bentitlements?\b|premium/i;

function walk(root: string, rel: string, out: string[]): void {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) walk(root, childRel, out);
    else if (SOURCE_FILE.test(entry.name) && !NOT_SOURCE.test(entry.name)) out.push(childRel);
  }
}

// Every report module under `root`, as repo-relative paths with `/` separators. The root
// is a required parameter so the self-test drives the same walk over a fixture tree.
function reportModules(root: string): string[] {
  const out: string[] = [];
  for (const r of SOURCE_ROOTS) {
    const files: string[] = [];
    walk(root, r, files);
    out.push(...files.filter((f) => REPORT_PATH.test(f)));
  }
  walk(root, REPORT_FUNCTION_DIR, out);
  return [...new Set(out.map((f) => f.split(path.sep).join('/')))].sort();
}

// Lines (1-based) whose code or strings name an entitlement or a tier.
function tierLines(src: string): number[] {
  return blankComments(src)
    .split('\n')
    .flatMap((line, i) => (TIER.test(line) ? [i + 1] : []));
}

function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function violations(root: string): string[] {
  return reportModules(root).flatMap((rel) => tierLines(read(root, rel)).map((n) => `${rel}:${n}`));
}

function gateViolations(root: string, files: string[]): string[] {
  return files.flatMap((rel) => {
    if (!fs.existsSync(path.join(root, rel))) return [];
    const code = blankComments(read(root, rel));
    const readsTier = /\bentitlements?\b|premium/i.test(code);
    return readsTier && !/\bcareSurface\b/.test(code) ? [rel] : [];
  });
}

describe('report modules never read an entitlement (spec §13, AC 10)', () => {
  const modules = reportModules(REPO_ROOT);

  it('the derived set reaches the report screen and the report function (non-vacuity)', () => {
    // Derived from the tree, so these anchors prove the walk read it rather than
    // restating the set under test.
    expect(modules).toContain('app/report.tsx');
    expect(modules).toContain('supabase/functions/generate-report/index.ts');
    expect(modules).toContain('supabase/functions/generate-report/render.ts');
    expect(modules.length).toBeGreaterThanOrEqual(5);
    expect(modules.some((m) => NOT_SOURCE.test(m))).toBe(false);
  });

  it('no report module names an entitlement or Premium in code or copy', () => {
    expect(violations(REPO_ROOT)).toEqual([]);
  });
});

describe('the beta gate faces careSurface before it ever reads an entitlement (the D9 narrowing)', () => {
  it('every gate file exists (a renamed gate would silently leave the scan)', () => {
    for (const rel of GATE_FILES) expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(true);
  });

  it('no gate file reads an entitlement without naming careSurface', () => {
    expect(gateViolations(REPO_ROOT, GATE_FILES)).toEqual([]);
  });

  it('the registry still carries the field the gate must honour', () => {
    expect(blankComments(read(REPO_ROOT, 'lib/betaFeatures.ts'))).toMatch(/\bcareSurface\s*:\s*boolean\b/);
  });
});

// ── Proof by mutation, over a fixture tree outside the repository (C-18) ─────────

describe('the detectors red on what they exist to catch', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('report-no-entitlement', ['app', 'lib', 'hooks', REPORT_FUNCTION_DIR]);
  });
  afterEach(() => {
    removeFixtureRoot(root);
    root = '';
  });

  it('a report screen that reads the entitlements table reds', () => {
    writeFixture(root, 'app/report.tsx', "const e = await supabase.from('entitlements').select('*');\n");
    expect(violations(root)).toEqual(['app/report.tsx:1']);
  });

  it('a Premium check in the report function reds, under any file name', () => {
    writeFixture(root, `${REPORT_FUNCTION_DIR}/send.ts`, 'export const ok = (u: { isPremium: boolean }) => u.isPremium;\n');
    expect(violations(root)).toEqual(['supabase/functions/generate-report/send.ts:1']);
  });

  it('Premium in report copy reds (no Premium mention in the flow)', () => {
    writeFixture(root, 'components/report/SendSheet.tsx', "const line = 'Upgrade to Premium for more';\n");
    expect(violations(root)).toEqual(['components/report/SendSheet.tsx:1']);
  });

  it('a comment naming Premium is prose, not a read', () => {
    writeFixture(root, 'lib/reportRange.ts', '// never a Premium gate (spec §13)\nexport const x = 1;\n');
    expect(violations(root)).toEqual([]);
  });

  it('a test file and a module outside the report set are not scanned', () => {
    writeFixture(root, 'app/report.test.tsx', "const e = 'entitlements';\n");
    writeFixture(root, 'lib/paywall.ts', "const e = 'entitlements';\n");
    expect(violations(root)).toEqual([]);
  });

  it('a gate file reading an entitlement without careSurface reds; naming it clears', () => {
    writeFixture(root, 'lib/betaFeatures.ts', "const gate = (e: { premium: boolean }) => e.premium;\n");
    expect(gateViolations(root, ['lib/betaFeatures.ts'])).toEqual(['lib/betaFeatures.ts']);
    writeFixture(
      root,
      'lib/betaFeatures.ts',
      "const gate = (b: { careSurface: boolean }, e: { premium: boolean }) => b.careSurface || e.premium;\n",
    );
    expect(gateViolations(root, ['lib/betaFeatures.ts'])).toEqual([]);
  });
});
