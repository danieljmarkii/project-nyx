// The accent-as-text guard (CUL-744 · CUL-578 · CUL-27).
//
// WHY THIS FILE EXISTS. `constants/theme.ts` says, in prose at :51-58, that the brand
// teal is a GLYPH tint — tuned for WCAG's 3:1 non-text target — and that small TEXT on a
// light ground takes `colorAccentInk` instead. The numbers behind that sentence are not
// marginal: teal is 2.26:1 on white and 2.08:1 on its own tint, against a 4.5:1 floor.
//
// Prose is not a check, and this class has now been found by audit three times — CUL-27
// (TodayZone's door), CUL-578 (Badge's tint pairs, TrendZone's door and sublabels), and
// CUL-744 (the residual: 81 sites, of which 76 were on light grounds). Each audit closed
// the sites it happened to look at. None of them closed the class, because the next
// screen re-opens it for free.
//
// WHAT THIS GUARD CAN AND CANNOT DECIDE. It cannot resolve the ground. The ratio depends
// on a `backgroundColor` set one or more components up, and no static scan resolves an RN
// style cascade — which is exactly why CUL-578 refused to widen into a mechanical repoint
// (`colorAccentInk` is 1.9:1 on `colorNeutralDark`, so a blind sweep ships a WORSE defect
// on the night surfaces, under a green diff).
//
// So it does not decide the ground. It requires that somebody DID. An accent-coloured
// text node either uses the ink — settling it — or carries an inline marker naming the
// dark ground it sits on and the ratio that makes it correct. That turns "81 sites, ground
// unknown per site" into "5 sites, each argued in place" (4 since CUL-1691 PR 1 moved the
// Snackbar to daylight), and a new light-ground accent
// label fails the build the day it is written rather than in the fourth audit.
//
// ESCAPE HATCH: an inline `// accent-on-dark-ok: <reason>` within 10 lines above the site
// (or trailing on it). The reason is mandatory. ONE MARKER COVERS EXACTLY ONE SITE — the
// `geist-ok` discipline, and it is load-bearing here rather than tidy: when CUL-744 ran,
// `FilterChip.tsx` held one `activeLabel` per variant, and a file-wide exemption for its
// dark ones would have silently pre-approved the light one, which was the one that was
// broken.
//
// WHAT IT DOES NOT CLAIM. That every remaining accent text is legible — a marker is an
// argument, and a wrong one is wrong. What it removes is the SILENT site: the one nobody
// decided about, which is every site this class has ever shipped.
//
// THE ACCENT HAS MORE THAN ONE NAME (CUL-1664). `#00C2A8` is `colorAccent`, and also
// `colorEventMeal` and `colorMomentConfirm`. A scan spelled for one name passes the same
// pixels under another, so the names are DERIVED from the theme by value (`ACCENT_NAMES`)
// rather than listed, and the derived set is pinned so a new alias is a visible decision.
//
// GLYPH SITES ARE OUT OF SCOPE, AND WHY — measured on 2026-10-08 (C-33), not assumed.
// A glyph's floor is 3:1, and the bright teal misses that on white too (2.26:1), so the
// question CUL-1664 asked was whether to scan glyph tints as well. The count says no:
//   - `color={…}` / `tint={…}` props naming one of the three names: 29 sites (the auth
//     heroes, chevrons, ScopeMenu's checks, the completion cards' checks on dark …);
//   - object values under a non-`*Color` key: 22 more — nine Switch tracks, and tint maps
//     and chart tokens that are mostly FILLS (the Signal rails and band, a composition
//     bar), which a grep cannot tell from a glyph.
// Fifty-one markers is a scope error, not an exemption. And the decisive half: neither
// hole the issue names took a shape a grep reaches. CUL-1637 was `fg: colorEventMeal` in
// a map, CUL-1659 `meal: colorEventMeal` in a map, each drawn through `color={MAP[k]}`.
// What caught both, and what catches the class, is `theme.contrast.test.ts` measuring an
// EXPORTED tint map against its EXPORTED ground (`CATEGORY_TINT`, `DAY_ROW_TINT` +
// `DAY_ROW_ICON_GROUND`). A new glyph tint map follows that precedent; the 51 existing
// sites are a design sweep with their own issue (CUL-1666), since repointing them to
// `colorAccentGlyph` visibly darkens the brand teal and is shown before it is shipped.

import * as fs from 'fs';
import * as path from 'path';

import { theme } from '../constants/theme';

import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store'];

/**
 * Every theme key whose value IS the bright accent — its names, derived rather than
 * listed (CUL-1664). Exported so the pin below can assert the set.
 */
export const ACCENT_NAMES: readonly string[] = Object.entries(theme)
  .filter(([, v]) => typeof v === 'string' && v.toUpperCase() === theme.colorAccent.toUpperCase())
  .map(([k]) => k)
  .sort();

/**
 * A `color:` STYLE KEY whose value is the brand accent, under any of its names.
 *
 * Deliberately not the CUL-744 issue's own `color: theme.colorAccent,$` — that anchor
 * missed four real sites in single-line style declarations (`recLabelAttn: { color:
 * theme.colorAccent }`), one of which was the "worth a call" escalation label on the
 * stool/vomit AI read. An enumeration chosen by a grep is only as complete as the grep.
 *
 * `\bcolor:` cannot match `backgroundColor:` / `borderColor:` / `tintColor:` (different
 * case, no word boundary), so fills and borders — which are graphical, and judged at the
 * 3:1 target — are out of scope by construction rather than by a denylist. The trailing
 * `\b` likewise excludes `colorAccentInk` and `colorAccentLight`.
 *
 * The `color={theme.colorAccent}` PROP form (a lucide icon's tint) is also out of scope:
 * that is a glyph, judged at 3:1, not text — see the header for the measurement.
 */
const ACCENT_TEXT = new RegExp(
  `(^|[^A-Za-z0-9_.])color:\\s*theme\\.(${ACCENT_NAMES.join('|')})\\b`,
);

const MARKER = /\/\/\s*accent-on-dark-ok:\s*\S+/;

/** How far above a site its marker may sit. Matches the `geist-ok` window. */
const MARKER_WINDOW = 10;

/**
 * Blank out comment CONTENT while preserving line count, so a site's line number still
 * addresses the same line after stripping.
 *
 * Both directions matter, and this file is itself the proof of the first: the header
 * above quotes `color: theme.colorAccent` while explaining the rule, and a raw-source
 * scan would report this guard as its own worst offender. The other direction is the one
 * that protects the rule — a future site must not be able to satisfy the guard by pasting
 * an explanation next to the violation, so detection reads code only. Marker lookup reads
 * the RAW source, because the marker IS a comment.
 */
function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

function walk(dir: string, root: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return out;
    throw e;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, root, out);
    } else if (/\.tsx?$/.test(ent.name) && !ent.name.includes('.test.')) {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

export type AccentSite = { file: string; line: number; exempt: boolean };

/**
 * Every accent-coloured text site under `root`, each flagged exempt or not.
 *
 * `root` is REQUIRED, never defaulted (CUL-712): a default silently re-points a
 * forgetful self-test at the real working tree, which is the failure the fixture-root
 * helper exists to make impossible.
 */
export function findAccentTextSites(root: string): AccentSite[] {
  const sites: AccentSite[] = [];

  for (const rel of SCAN_DIRS.flatMap((d) => walk(path.join(root, d), root)).sort()) {
    let src: string;
    try {
      src = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch (e) {
      // A parallel guard's fixture can vanish between the walk and the read.
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') continue;
      throw e;
    }

    const raw = src.split('\n');
    const code = stripComments(src).split('\n');
    // One marker covers exactly one site: a marker is consumed by the first site that
    // claims it. Otherwise one annotated dark site exempts every sibling near it, and
    // the file reads as reviewed.
    const spent = new Set<number>();

    for (let i = 0; i < code.length; i++) {
      if (!ACCENT_TEXT.test(code[i])) continue;
      let exempt = false;
      for (let j = i; j >= Math.max(0, i - MARKER_WINDOW); j--) {
        if (spent.has(j) || !MARKER.test(raw[j])) continue;
        spent.add(j);
        exempt = true;
        break;
      }
      sites.push({ file: rel, line: i + 1, exempt });
    }
  }

  return sites;
}

describe('CUL-744 — the brand accent is never the colour of text on a light ground', () => {
  const sites = findAccentTextSites(ROOT);

  it('is actually scanning the app (not passing over an empty tree)', () => {
    // The floor CUL-712 asks for: a scan that quietly resolves to nothing is green over
    // every defect it exists to find. Two independent floors, because either alone can
    // be satisfied by an accident — files walked, and the detector still firing.
    expect(SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d), ROOT)).length).toBeGreaterThan(300);
    expect(sites.length).toBeGreaterThan(0);
  });

  it('reads every name the accent goes by, not just colorAccent (CUL-1664)', () => {
    // Pinned in both directions. A fourth alias joining the theme turns this red, so the
    // widening is a decision someone reads; an alias dropping out (a re-tuned meal tint)
    // does too, so the set never silently narrows back to the one name it started with.
    expect(ACCENT_NAMES).toEqual(['colorAccent', 'colorEventMeal', 'colorMomentConfirm']);
  });

  it('still detects — and still exempts — the known dark-ground site', () => {
    // `DailyRecapOffer.turnOn` is teal on colorBrandNightElevated at 6.57:1: correct as
    // shipped (the Snackbar held this pin until CUL-1691 PR 1 moved it to daylight and
    // the ink). Pinning one REAL site as detected-and-exempt proves both halves at once — that the pattern has not drifted off the live source, and
    // that the marker mechanism still reaches a site. A detector that matches nothing and
    // an exemption that matches everything are both green without this.
    const recap = sites.filter((s) => s.file === path.join('components', 'recap', 'DailyRecapOffer.tsx'));
    expect(recap).toHaveLength(1);
    expect(recap[0].exempt).toBe(true);
  });

  it('no accent-coloured text ships without a ground decision', () => {
    expect(
      sites
        .filter((s) => !s.exempt)
        .map(
          (s) =>
            `${s.file}:${s.line} colours TEXT with the bright accent (${ACCENT_NAMES.join(' / ')} are one ` +
            `hex). On a light ground that is ` +
            `2.08–2.26:1, under the 4.5:1 AA floor — use theme.colorAccentInk (4.74–5.17:1). ` +
            `If this genuinely sits on a DARK ground, add an inline ` +
            `"// accent-on-dark-ok: <ground>, <ratio>" within ${MARKER_WINDOW} lines above it.`,
        ),
    ).toEqual([]);
  });
});

// The detector's own proof (CUL-613: a guard that has only ever been green has not been
// tested — and reading it and agreeing with it is not the check; break the thing it
// protects, one defect at a time, and watch it go red).
//
// The whole-tree half of that proof already ran: against the pre-fix working tree this
// guard reported 81 violations, and against the repointed one it reports 0. What that
// cannot show is the MECHANISM — the window, the one-marker rule, the comment strip —
// each of which is green either way on a compliant tree, and each of which is one
// plausible tidy-up away from exempting everything.
//
// Fixtures live outside the repo (CUL-712): jest runs suites in parallel workers, so an
// in-tree fixture is live inside `geistRollout`'s and `reversePath`'s scan windows, where
// a deliberately non-compliant file is either an ENOENT crash or — worse — a spurious
// violation naming a file that no longer exists.
describe('the detector, proven by mutation', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('accent-on-light', ['components']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
    root = '';
  });

  const scan = (src: string) => {
    writeFixture(root, path.join('components', 'Fixture.tsx'), src);
    return findAccentTextSites(root);
  };

  it('flags an unmarked accent text colour', () => {
    expect(scan('const s = { label: {\n  color: theme.colorAccent,\n} };')).toEqual([
      { file: path.join('components', 'Fixture.tsx'), line: 2, exempt: false },
    ]);
  });

  it('exempts it when a marker sits within the window', () => {
    const sites = scan('const s = { label: {\n  // accent-on-dark-ok: colorNeutralDark — 8.75:1\n  color: theme.colorAccent,\n} };');
    expect(sites.map((s) => s.exempt)).toEqual([true]);
  });

  it('exempts it when the marker trails on the site line itself', () => {
    expect(scan('const s = { label: { color: theme.colorAccent } }; // accent-on-dark-ok: dark card').map((s) => s.exempt)).toEqual([true]);
  });

  // The window's distance is spelled as LITERALS below, never as MARKER_WINDOW.
  //
  // Written the obvious way — building the fixture from the constant — the test is
  // self-referential and CANNOT FAIL: mutate the window to 1000 and the fixture grows to
  // 1000 lines with it, so the marker stays outside and the assertion still passes. That
  // is exactly the green-guard-over-its-own-defect shape CLAUDE.md names (the monotone-max
  // property test that could not fail), and it is how this test first shipped — it was
  // caught by mutating the source, not by re-reading it.
  //
  // Both bounds get a case, because the value is bounded on two sides: widen the window
  // and one annotation at the top of a style sheet covers every site below it; narrow it
  // and a marker sitting above its own rationale silently stops working. One case alone
  // lets a mutation pick the other side for free.
  it('exempts a marker at the far edge of the window (10 lines above)', () => {
    const near = '  // accent-on-dark-ok: at the edge\n' + '  //\n'.repeat(9) + '  color: theme.colorAccent,\n';
    expect(scan('const s = { label: {\n' + near + '} };').map((s) => s.exempt)).toEqual([true]);
  });

  it('does NOT exempt a marker one line beyond it (11 lines above)', () => {
    const far = '  // accent-on-dark-ok: too far away\n' + '  //\n'.repeat(10) + '  color: theme.colorAccent,\n';
    expect(scan('const s = { label: {\n' + far + '} };').map((s) => s.exempt)).toEqual([false]);
  });

  it('spends one marker on exactly one site', () => {
    // The CUL-744 FilterChip shape: one `activeLabel` per variant, some on dark. A
    // file-wide (or reusable) exemption pre-approves the light one — the broken one.
    const sites = scan(
      'const s = {\n  // accent-on-dark-ok: the dark variant\n  a: { color: theme.colorAccent },\n  b: { color: theme.colorAccent },\n};',
    );
    expect(sites.map((s) => s.exempt)).toEqual([true, false]);
  });

  it('requires the marker to carry a reason', () => {
    // A bare `// accent-on-dark-ok:` is a silent hole, not a named decision.
    expect(scan('const s = { a: {\n  // accent-on-dark-ok:\n  color: theme.colorAccent,\n} };').map((s) => s.exempt)).toEqual([false]);
  });

  it('reads code, not prose — a commented-out site is not a violation', () => {
    // This guard's own header quotes the pattern while explaining the rule.
    expect(scan('// color: theme.colorAccent,\n/* color: theme.colorAccent, */\nconst s = {};')).toEqual([]);
  });

  it('does not let an explanation stand in for the fix', () => {
    // The other direction of the same strip: pasting the rationale beside the violation
    // must not satisfy the guard. The site is still reported (and unexempt).
    const sites = scan('const s = { a: {\n  // teal is fine here honestly, color: theme.colorAccent\n  color: theme.colorAccent,\n} };');
    expect(sites.map((s) => s.exempt)).toEqual([false]);
  });

  it('ignores fills and borders, which are graphical and correct at 3:1', () => {
    expect(
      scan('const s = { a: {\n  backgroundColor: theme.colorAccent,\n  borderColor: theme.colorAccent,\n  shadowColor: theme.colorAccent,\n} };'),
    ).toEqual([]);
  });

  it('flags the accent under its other names (the CUL-1637 / CUL-1659 alias hole)', () => {
    const sites = scan(
      'const s = {\n  a: { color: theme.colorEventMeal },\n  b: { color: theme.colorMomentConfirm },\n};',
    );
    expect(sites.map((s) => [s.line, s.exempt])).toEqual([[2, false], [3, false]]);
  });

  it('does not read a longer name that merely starts with an alias', () => {
    expect(scan('const s = { a: { color: theme.colorEventMealLight } };')).toEqual([]);
  });

  it('ignores the icon-tint PROP form, which is a glyph and not text', () => {
    // Every name, because the header's out-of-scope decision covers every name.
    expect(
      scan('const x = <><Icon color={theme.colorAccent} /><Icon color={theme.colorEventMeal} /></>;'),
    ).toEqual([]);
  });

  it('ignores the ink and the tint — only the bright accent is the defect', () => {
    expect(
      scan('const s = { a: {\n  color: theme.colorAccentInk,\n  borderColor: theme.colorAccentLight,\n} };'),
    ).toEqual([]);
  });

  it('skips test files, so a fixture asserting the defect is not itself one', () => {
    writeFixture(root, path.join('components', 'Thing.test.tsx'), 'color: theme.colorAccent,');
    expect(findAccentTextSites(root)).toEqual([]);
  });
});
