// AC 5's copy half — "no row ever contains *fussy*, *picky* or *preference* about a
// decline (a guard over the row copy)" (CUL-903 VV-5; vet-visits spec §7).
//
// ── WHY A GUARD AND NOT A REVIEW ─────────────────────────────────────────────────
// The intake invariant is the one Nyx states most flatly: decline or refusal is
// frequently a DISEASE signal, so it is never softened to "picky". Get ready is the
// page an owner reads ALOUD IN THE EXAM ROOM, which makes it the worst possible
// surface for that softening to appear on — a vet hearing "she's just been picky"
// stops looking. A reviewer catches it on the PR they read; this catches it on the
// PR nobody reads.
//
// ── TWO DETECTORS, AND THE SECOND IS THE ONE THAT MATTERS ────────────────────────
// A. No preference vocabulary in the render path's own string literals. Cheap, and
//    it catches the obvious form: somebody writing the word into a label.
// B. Every row `lib/getReady.ts` ASSEMBLES goes through `screen()`. This is the
//    structural half — the words can also arrive as DATA (a drug name is owner
//    free-text), and only the runtime screen catches those.
//
// ── THE REGISTERED EXEMPTION IS THE INTERESTING PART (C-32) ──────────────────────
// `buildSignalRows` must NOT be screened, and that is a decision rather than an
// oversight, so it is registered with its reason and asserted to still exist. AC 5
// requires the Signal's phrased sentence VERBATIM; screening it would either edit a
// sentence the engine composed or drop it — and dropping one could remove a SAFETY
// statement from the list, which is the single outcome this feature may not cause. A
// bad Signal string is a bug in `generate-signal/phrasing.ts`, where the intake
// invariant is already enforced, and that is where it gets fixed.
//
// ── STATED BLIND SPOTS (C-36: an undocumented limit reads as coverage) ───────────
//  • Detector A reads STRING LITERALS. Copy assembled from a template with a
//    variable in the middle of the banned word is not reachable, and copy that
//    arrives as data is not literal at all — B and the runtime screen are what cover
//    the second case.
//  • Detector B keys on `sourceLabel`, the property every `WorthRaisingRow` carries.
//    A row constructed field-by-field into a variable and returned would not be an
//    object literal at the return, and would pass. The rows in this module are all
//    literals; a future one that is not lands the job of teaching this detector.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');

/** The Worth-raising render path: the model and the components that draw it. */
const RENDER_PATH = [
  'lib/getReady.ts',
  'components/vetvisits/WorthRaisingList.tsx',
  'components/vetvisits/GetReadyHeader.tsx',
  'components/vetvisits/AddQuestionSheet.tsx',
];

/**
 * The vocabulary that turns a decline into a taste.
 *
 * Kept in step with `PREFERENCE_RE` in `lib/getReady.ts` — same words, and the
 * sibling assertion below pins that they stay the same rather than trusting two
 * copies to drift together (C-34: a mirrored constant must answer the same question,
 * and here it answers exactly the same one).
 */
const PREFERENCE_RE = /\b(fussy|fussiness|picky|pickiness|prefers?|preference[sd]?)\b/i;

const MODEL = 'lib/getReady.ts';

/**
 * Functions in the model whose rows are deliberately NOT screened.
 *
 * An exemption, not a note: an entry here removes a function from the rule. Each one
 * says why, and the staleness check below requires it to still be a real function
 * that still builds a row.
 */
const UNSCREENED: Record<string, string> = {
  buildSignalRows:
    'AC 5 requires the Signal’s phrased sentence VERBATIM. Screening it would edit a ' +
    'sentence the engine composed, or drop it — and a dropped row can be a SAFETY ' +
    'finding, which is the one outcome this list may not cause. The intake invariant ' +
    'is enforced where that copy is written (generate-signal/phrasing.ts).',
};

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function parse(rel: string): ts.SourceFile {
  const src = read(rel);
  return ts.createSourceFile(
    rel,
    src,
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Every string literal in a file, with its line. */
function stringLiterals(rel: string): { text: string; line: number }[] {
  // Comments are blanked FIRST, or this file's own header — which quotes the banned
  // words to explain the rule — would be reported as a violation of it. The same
  // false positive `guards/completionCard.test.ts` documents.
  const sf = ts.createSourceFile(
    rel,
    blankComments(read(rel)),
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: { text: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push({ text: node.text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

/** The name of the nearest enclosing named function, or '' at module scope. */
function enclosingFunctionName(node: ts.Node): string {
  for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (
      (ts.isFunctionExpression(cur) || ts.isArrowFunction(cur)) &&
      ts.isVariableDeclaration(cur.parent) &&
      ts.isIdentifier(cur.parent.name)
    ) {
      return cur.parent.name.text;
    }
  }
  return '';
}

interface RowSite {
  fn: string;
  line: number;
  screened: boolean;
}

/** Every `WorthRaisingRow` object literal in the model, and whether it is screened. */
function rowSites(): RowSite[] {
  const sf = parse(MODEL);
  const out: RowSite[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const isRow = node.properties.some(
        (p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'sourceLabel',
      );
      if (isRow) {
        const call = node.parent;
        const screened =
          ts.isCallExpression(call) &&
          ts.isIdentifier(call.expression) &&
          call.expression.text === 'screen';
        out.push({
          fn: enclosingFunctionName(node),
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          screened,
        });
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

describe('AC 5 — no row turns a decline into a taste', () => {
  it('finds the rows it is supposed to be checking', () => {
    // The non-vacuity floor. A detector that located nothing would pass every
    // assertion below while measuring exactly nothing — the failure mode
    // `guards/vetVisitsFlagOff.test.tsx` shipped and had to be caught by mutation.
    const sites = rowSites();
    expect(sites.length).toBeGreaterThanOrEqual(4);
    expect(new Set(sites.map((s) => s.fn))).toContain('buildSignalRows');
  });

  it('every row the module ASSEMBLES goes through the screen', () => {
    const unscreened = rowSites()
      .filter((s) => !s.screened)
      .filter((s) => !(s.fn in UNSCREENED))
      .map((s) => `${MODEL}:${s.line} (in ${s.fn || 'module scope'})`);
    expect(unscreened).toEqual([]);
  });

  it('the unscreened exemption still names a real row builder', () => {
    // An exemption for a function that no longer exists, or no longer builds a row,
    // is a pre-authorised hole for whatever lands under that name next (C-32).
    const builders = new Set(rowSites().map((s) => s.fn));
    expect(Object.keys(UNSCREENED).filter((fn) => !builders.has(fn))).toEqual([]);
  });

  it('the quoted Signal row is the ONLY unscreened one', () => {
    // Stated as an equality rather than a subset: widening this set is a decision
    // about what the app may say about a decline, and it should have to be written
    // into a diff.
    expect(Object.keys(UNSCREENED)).toEqual(['buildSignalRows']);
  });

  it('no preference vocabulary is written into the render path’s own copy', () => {
    const offenders: string[] = [];
    for (const rel of RENDER_PATH) {
      for (const lit of stringLiterals(rel)) {
        if (PREFERENCE_RE.test(lit.text)) offenders.push(`${rel}:${lit.line} — ${lit.text.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the vocabulary here is the same one the runtime screen uses', () => {
    // Two copies of one question, so they are pinned to each other rather than left
    // to drift (C-34). Read off the model's source: importing it would run the
    // module, and the constant is deliberately not exported.
    const src = blankComments(read(MODEL));
    const declared = /const PREFERENCE_RE = (\/.+\/[a-z]*);/.exec(src);
    expect(declared).not.toBeNull();
    expect(declared?.[1]).toBe(PREFERENCE_RE.toString());
  });
});
