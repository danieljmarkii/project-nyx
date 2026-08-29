// The Geist rollout's closing audit (CUL-611 · `docs/nyx-app-polish-requirements.md` §7).
//
// WHY THIS FILE EXISTS. CUL-364 swept ~880 owner-facing text nodes onto `ThemedText`
// across six PRs. The rollout's failure mode is not that a sweep goes wrong — it is
// that the NEXT screen anyone writes reaches for a bare `<Text>` and renders SF beside
// Geist, one file at a time, until the app is mixed-face again. Nothing about that is
// visible in a diff: a raw `<Text>` looks exactly like a swept one, and the difference
// only shows on a device.
//
// D9 (the no-magic rule) deliberately declined a default-`Text` override, so there is
// no runtime backstop by design. This is the backstop instead — the rule is enforced at
// build time and stays a visible, per-file decision in the source.
//
// WHAT IT ASSERTS.
//   1. Every RN `<Text>` / `<Animated.Text>` either resolves to a style that names an
//      explicit `fontFamily`, or carries a `geist-ok:` marker. (`ThemedText` is
//      compliant by construction — it injects the family from the weight token.)
//   2. Every `<TextInput>` resolves to a style naming an explicit `fontFamily`.
//      `ThemedText` wraps `Text`, so it cannot reach a field: a swept screen whose
//      inputs still render SF is the half-done look the rollout exists to remove.
//   3. No style block declares a Geist/Newsreader family AND a `fontWeight` that
//      disagrees with it. RN does not synthesize weights for custom fonts, so such a
//      pair declares one weight and renders another (CUL-652). A grep for raw `<Text>`
//      cannot see this class at all — it needs its own net.
//   4. No NESTED text node quietly loses its weight. Two shapes, both of which the
//      earlier sweeps actually shipped and neither of which shows in a diff:
//        • a raw `<Text>` under a parent that resolves a family, declaring its own
//          `fontWeight` — inert, so the contrast the design asked for flattens to the
//          parent's face (10 live sites, fixed in this PR);
//        • a `ThemedText` under a text ancestor with no weight of its own — it injects
//          the REGULAR face over whatever the parent was wearing.
//      The second renders identically while the parent happens to be regular, which is
//      what makes it a trap rather than a bug: it arrives later, in an unrelated diff,
//      the first time the parent gains a weight (the CUL-610 Fragment lesson).
//   5. Floor checks, so a rename can never make the whole thing pass on an empty set.
//
// WHAT IT DOES NOT CLAIM. It resolves `style={styles.x}` against the file's own
// `StyleSheet.create` and inline object literals; a style arriving through a PROP or a
// helper function is unresolvable and is therefore FLAGGED, not assumed innocent. It
// proves a family is declared — never that the face looks right on a device. That is
// what CUL-655's on-device pass is for.
//
// PARSED, NOT GREPPED. Everything below reads the TypeScript AST. That is what keeps
// prose about the rule from being mistaken for the rule: a `fontFamily` written inside
// a comment is trivia to the parser and can never satisfy assertion 1 or 3, and a
// `<Text>` written inside a comment is not a JSX element and can never violate them.
// The one thing read off raw source is the `geist-ok` marker — because a marker IS a
// comment, so it has to be.
//
// ESCAPE HATCH: `geist-ok: <reason>` in a comment within the 10 lines preceding a site.
// The reason is mandatory, and a marker covers exactly ONE site (see `matchMarkers`) —
// otherwise one annotated glyph would silently exempt every sibling near it.

import * as fs from 'fs';
import * as path from 'path';

import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ts = require('typescript') as typeof import('typescript');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components'];

/**
 * `widgets/` is deliberately out of scope, and not for convenience: its `<Text>` is
 * `@expo/ui/swift-ui`'s, evaluated by the iOS widget extension in a bare
 * JavaScriptCore context that has never heard of `fontFamily` (it takes `font({size})`
 * modifiers instead). Demanding a family there would be demanding a prop that does not
 * exist. `lib/` `hooks/` `store/` `constants/` hold no JSX at all.
 *
 * `ThemedText.tsx` is the primitive itself — the one file whose whole job is to own the
 * raw `<Text>` every other file is forbidden.
 */
const EXCLUDED_FILES = ['components/ui/ThemedText.tsx'];

/** How far above a site a `geist-ok:` marker may sit and still cover it. */
const MARKER_REACH_LINES = 10;

const MARKER = /geist-ok:\s*\S+/;

/**
 * The loaded faces, and the weight each one IS. Only three Geist weights and one
 * Newsreader are registered (`lib/fonts.ts`) — a family not in this map is somebody
 * else's font and is left alone.
 *
 * Newsreader maps to 400 because only `Newsreader_400Regular` is loaded: pairing the
 * display face with a semibold token is the same defect as pairing `Geist` with one,
 * and would render regular just as silently.
 */
const FAMILY_WEIGHT: Record<string, string> = {
  fontBody: '400',
  fontBodyMedium: '500',
  fontBodySemibold: '600',
  fontDisplay: '400',
  Geist: '400',
  'Geist-Medium': '500',
  'Geist-SemiBold': '600',
  Newsreader: '400',
};

/**
 * Weight tokens → their numeric value. Both spellings are live in the tree
 * (`weightMedium` and the older `fontWeightMedium` alias), and a guard that knew only
 * one would quietly skip every site using the other.
 */
const WEIGHT_TOKEN: Record<string, string> = {
  weightRegular: '400',
  weightMedium: '500',
  weightSemibold: '600',
  fontWeightRegular: '400',
  fontWeightMedium: '500',
};

type Finding = { file: string; line: number; what: string };

// `root` is threaded through every scanner below rather than read from the module
// constant, so the detector fixtures can live in a temp tree instead of inside
// `components/`. They used to be written in-tree, where a PARALLEL guard's scan picked
// them up — and this scanner is the one with the widest reach, so it was the usual
// victim: a foreign fixture either vanished between the walk and the read (ENOENT) or
// was reported as a real `<Text>` violation naming a file that no longer existed
// (CUL-712). It is a required parameter, not a defaulted one: a default silently
// re-points a forgetful self-test at the real working tree, which is the failure being
// removed here.
function walk(dir: string, root: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, root, out);
    } else if (ent.name.endsWith('.tsx') && !ent.name.includes('.test.')) {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

function sourceFiles(root: string): string[] {
  return SCAN_DIRS.flatMap((d) => walk(path.join(root, d), root))
    .filter((rel) => !EXCLUDED_FILES.includes(rel))
    .sort();
}

/** Normalises `theme.fontBody` / `'Geist'` / `fontBody` down to a map key. */
function familyKey(text: string): string {
  return text.replace(/^theme\./, '').replace(/^['"]|['"]$/g, '');
}

/** Normalises a weight initializer to its numeric string, or null if unrecognised. */
function weightValue(text: string): string | null {
  const t = familyKey(text);
  if (WEIGHT_TOKEN[t]) return WEIGHT_TOKEN[t];
  if (/^\d+$/.test(t)) return t;
  if (t === 'normal') return '400';
  if (t === 'bold') return '700';
  return null;
}

/** What one named style block declares. */
type Block = { family: boolean; weight: boolean };

interface Parsed {
  sf: import('typescript').SourceFile;
  src: string;
  /**
   * Style blocks, keyed by the OBJECT they belong to and then by key —
   * `blocks.get('nightStyles')!.get('label')`.
   *
   * Scoped by object on purpose. A flat key→block map is what a first version used, and
   * it let one `StyleSheet.create` vouch for another: a file holding both
   * `dayStyles.label` (with a family) and `nightStyles.label` (without) reported the
   * second as compliant, because `label` was in the set. Two style sheets in one file
   * is the normal shape for a day/night surface, so this was not hypothetical.
   */
  blocks: Map<string, Map<string, Block>>;
  /** Every object literal that declares a family AND a weight, for assertion 3. */
  pairs: { line: number; family: string; weight: string }[];
}

function parse(rel: string, root: string): Parsed {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const blocks = new Map<string, Map<string, Block>>();
  const pairs: Parsed['pairs'] = [];

  const propNamed = (obj: import('typescript').ObjectLiteralExpression, name: string) =>
    obj.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name) && p.name.text === name,
    ) as import('typescript').PropertyAssignment | undefined;

  const visit = (n: import('typescript').Node): void => {
    // Named style blocks: `const <obj> = StyleSheet.create({ label: { … } })`. The
    // object's own name is captured, NOT assumed to be `styles` — `FilterChip.tsx`
    // alone has three (`defaultVariant` / `filledVariant` / `onDarkVariant`).
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer)
    ) {
      const callee = n.initializer.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'create' &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'StyleSheet'
      ) {
        const arg = n.initializer.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const objName = n.name.text;
          const byKey = blocks.get(objName) ?? new Map<string, Block>();
          for (const p of arg.properties) {
            if (!ts.isPropertyAssignment(p) || !p.name) continue;
            if (!ts.isObjectLiteralExpression(p.initializer)) continue;
            byKey.set(p.name.getText(sf).replace(/^['"]|['"]$/g, ''), {
              family: !!propNamed(p.initializer, 'fontFamily'),
              weight: !!propNamed(p.initializer, 'fontWeight'),
            });
          }
          blocks.set(objName, byKey);
        }
      }
    }
    // Assertion 3 sweeps EVERY object literal, not only StyleSheet members — an inline
    // `style={{ fontFamily, fontWeight }}` mis-renders exactly the same way.
    if (ts.isObjectLiteralExpression(n)) {
      const fam = propNamed(n, 'fontFamily');
      const w = propNamed(n, 'fontWeight');
      if (fam && w) {
        pairs.push({
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          family: fam.initializer.getText(sf),
          weight: w.initializer.getText(sf),
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { sf, src, blocks, pairs };
}

/**
 * Resolves `<obj>.<key>` to the style block it names, or undefined if it is not one we
 * captured. Scoped by the object identifier, so `nightStyles.label` can never be
 * answered by `dayStyles.label`.
 */
function lookupBlock(
  expr: import('typescript').PropertyAccessExpression,
  p: Parsed,
): Block | undefined {
  if (!ts.isIdentifier(expr.expression)) return undefined;
  return p.blocks.get(expr.expression.text)?.get(expr.name.text);
}

/**
 * Does this element's `style` prop resolve to something naming an explicit family?
 *
 * Deliberately conservative in one direction: anything it cannot resolve — a style
 * arriving via a prop, a helper call, a computed key — returns false and is reported.
 * A guard that assumed the unresolvable was fine would be green on precisely the sites
 * nobody can eyeball.
 */
function hasExplicitFamily(
  open: import('typescript').JsxOpeningLikeElement,
  p: Parsed,
): boolean {
  const attr = open.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.getText(p.sf) === 'style',
  );
  if (!attr || !ts.isJsxAttribute(attr) || !attr.initializer) return false;
  const init = attr.initializer;
  if (!ts.isJsxExpression(init) || !init.expression) return false;

  const check = (expr: import('typescript').Expression): boolean => {
    if (ts.isArrayLiteralExpression(expr)) {
      return expr.elements.some((e) => check(e as import('typescript').Expression));
    }
    // `cond && styles.x` / `cond ? styles.a : styles.b` — a family on EITHER arm is not
    // enough; the branch without it would render SF, so both arms must carry one.
    if (ts.isBinaryExpression(expr)) return check(expr.right);
    if (ts.isConditionalExpression(expr)) {
      return check(expr.whenTrue) && check(expr.whenFalse);
    }
    if (ts.isParenthesizedExpression(expr)) return check(expr.expression);
    if (ts.isObjectLiteralExpression(expr)) {
      return expr.properties.some(
        (q) =>
          ts.isPropertyAssignment(q) &&
          q.name &&
          ts.isIdentifier(q.name) &&
          q.name.text === 'fontFamily',
      );
    }
    if (ts.isPropertyAccessExpression(expr)) {
      // `styles.label` — resolved against THAT object, not any block sharing the key.
      return !!lookupBlock(expr, p)?.family;
    }
    if (ts.isElementAccessExpression(expr)) {
      // `styles[variant]` — a computed key we cannot follow. Unresolvable ⇒ flagged.
      return false;
    }
    return false;
  };
  return check(init.expression);
}

/**
 * Does this element's own style declare a `fontWeight`?
 *
 * AST-resolved, like `hasExplicitFamily` — and that symmetry is the point. A first
 * version pulled block names out of the attribute TEXT with `/styles\.(\w+)/`, which
 * only ever matched a style sheet literally named `styles`. `FilterChip.tsx` alone
 * breaks that (`defaultVariant`, `filledVariant`, `onDarkVariant`), and the failure was
 * silent in the worst possible way: assertion 4 went GREEN over a real inert-weight
 * regression, including one carrying a `geist-ok` marker — defeating the very test
 * written to prove a marker cannot excuse a lost weight. Found by probing the guard,
 * not by reading it.
 */
function declaresWeight(open: import('typescript').JsxOpeningLikeElement, p: Parsed): boolean {
  const attr = open.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.getText(p.sf) === 'style',
  );
  if (!attr || !ts.isJsxAttribute(attr) || !attr.initializer) return false;
  const init = attr.initializer;
  if (!ts.isJsxExpression(init) || !init.expression) return false;

  let found = false;
  const visit = (n: import('typescript').Node): void => {
    if (found) return;
    // A named block reference — `nightStyles.sub`.
    if (ts.isPropertyAccessExpression(n) && lookupBlock(n, p)?.weight) {
      found = true;
      return;
    }
    // An inline literal — read off the AST, so a commented-out weight cannot count.
    if (
      ts.isPropertyAssignment(n) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'fontWeight'
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(init.expression);
  return found;
}

/** Every RN text node and field in a file, with whether it already names a family. */
function scanFile(rel: string, root: string): {
  sites: Finding[];
  inputs: Finding[];
  nested: Finding[];
  textCount: number;
} {
  const p = parse(rel, root);
  const sites: Finding[] = [];
  const inputs: Finding[] = [];
  const nested: Finding[] = [];
  let textCount = 0;

  type Ctx = { tag: string; resolvesFamily: boolean };

  const visit = (n: import('typescript').Node, parent: Ctx | null): void => {
    let me: Ctx | null = null;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const open = ts.isJsxElement(n) ? n.openingElement : n;
      const tag = open.tagName.getText(p.sf);
      const line = p.sf.getLineAndCharacterOfPosition(n.getStart(p.sf)).line + 1;
      const isText = tag === 'Text' || tag === 'ThemedText' || tag === 'Animated.Text';
      if (isText) {
        textCount++;
        const family = hasExplicitFamily(open, p);
        const weight = declaresWeight(open, p);
        // ThemedText always resolves a family — that is the whole primitive.
        me = { tag, resolvesFamily: tag === 'ThemedText' || family };

        if ((tag === 'Text' || tag === 'Animated.Text') && !family) {
          sites.push({ file: rel, line, what: `<${tag}>` });
        }
        if (parent?.resolvesFamily) {
          if (tag !== 'ThemedText' && weight && !family) {
            nested.push({
              file: rel,
              line,
              what: `raw <${tag}> under <${parent.tag}> declares a fontWeight the parent's explicit family makes INERT — the contrast silently flattens`,
            });
          }
          if (tag === 'ThemedText' && !weight && !family) {
            nested.push({
              file: rel,
              line,
              what: `<ThemedText> nested under <${parent.tag}> with no weight of its own injects the REGULAR face over the parent's`,
            });
          }
        }
      }
      if (tag === 'TextInput' && !hasExplicitFamily(open, p)) {
        inputs.push({ file: rel, line, what: '<TextInput>' });
      }
    }
    ts.forEachChild(n, (c) => visit(c, me ?? parent));
  };
  visit(p.sf, null);
  return { sites, inputs, nested, textCount };
}

/**
 * Assigns `geist-ok` markers to the sites they cover, ONE APIECE.
 *
 * The one-to-one rule is the whole point. A "is there a marker anywhere above me"
 * test would let a single annotated chevron exempt the four unannotated `<Text>`s
 * beside it — the shape of hole that makes an exemption mechanism worse than none,
 * because the file then reads as fully reviewed. Markers and sites are both walked in
 * source order and consumed pairwise.
 *
 * Reads RAW source on purpose: the marker is a comment, so a parser has already
 * discarded it by the time the AST exists.
 */
function matchMarkers(rel: string, sites: Finding[], root: string): Finding[] {
  const lines = fs.readFileSync(path.join(root, rel), 'utf8').split('\n');
  const markerLines = lines
    .map((l, i) => (MARKER.test(l) ? i + 1 : -1))
    .filter((i) => i > 0);
  const unused = new Set(markerLines);
  // Sites in LINE order, and each takes the NEAREST unused marker above it.
  //
  // Both halves are corrections. `sites` arrives in AST traversal order, which for JSX
  // is parent-before-child rather than positional — so a marker written for a child
  // could be consumed by its parent. And taking the FIRST marker within reach rather
  // than the nearest let a site claim a marker written for something further down.
  // Neither produced a wrong answer on this tree, but both made the pairing depend on
  // shape instead of position, which is not something a reader can check by eye.
  return [...sites]
    .sort((a, b) => a.line - b.line)
    .filter((s) => {
      const cover = markerLines
        .filter((m) => unused.has(m) && m < s.line && s.line - m <= MARKER_REACH_LINES)
        .pop(); // nearest = the last one still above this site
      if (cover === undefined) return true;
      unused.delete(cover);
      return false;
    });
}

function allFindings() {
  const text: Finding[] = [];
  const inputs: Finding[] = [];
  const nested: Finding[] = [];
  let textCount = 0;
  for (const rel of sourceFiles(ROOT)) {
    const r = scanFile(rel, ROOT);
    textCount += r.textCount;
    text.push(...matchMarkers(rel, r.sites, ROOT));
    inputs.push(...matchMarkers(rel, r.inputs, ROOT));
    // Assertion 4 takes NO marker. A `geist-ok` marker says "this node is deliberately
    // raw" — it never says "this node is deliberately rendering the wrong weight", and
    // letting one cover both would turn every glyph exemption into a blind spot.
    nested.push(...r.nested);
  }
  return { text, inputs, nested, textCount };
}

function disagreeingPairs(): Finding[] {
  const out: Finding[] = [];
  for (const rel of sourceFiles(ROOT)) {
    for (const pair of parse(rel, ROOT).pairs) {
      const fam = FAMILY_WEIGHT[familyKey(pair.family)];
      if (!fam) continue; // not one of our faces — not our rule to enforce
      const w = weightValue(pair.weight);
      if (w === null || w === fam) continue;
      out.push({
        file: rel,
        line: pair.line,
        what: `${pair.family} is weight ${fam}, but fontWeight says ${w} — renders ${fam}`,
      });
    }
  }
  return out;
}

const fmt = (f: Finding[]) => f.map((x) => `${x.file}:${x.line} — ${x.what}`);

describe('§7 — the Geist rollout stays finished', () => {
  it('finds the text nodes it is supposed to be checking', () => {
    // A rename of `Text`, a moved directory, or a broken walk would otherwise let every
    // assertion below pass by checking nothing at all.
    const { textCount } = allFindings();
    expect(textCount).toBeGreaterThan(500);
    expect(sourceFiles(ROOT).length).toBeGreaterThan(100);
  });

  it('no raw <Text> renders without an explicit family', () => {
    const findings = fmt(allFindings().text).map(
      (f) => `${f}; use ThemedText, or add a // geist-ok: <reason> above it`,
    );
    expect(findings).toEqual([]);
  });

  it('no <TextInput> renders without an explicit family', () => {
    // ThemedText wraps Text and cannot reach a field, so this one is spelled on the
    // style: `fontFamily: theme.fontBody`. Precedent: app/settings/feedback.tsx.
    const findings = fmt(allFindings().inputs).map(
      (f) => `${f}; add fontFamily to its style, or a // geist-ok: <reason>`,
    );
    expect(findings).toEqual([]);
  });

  it('no nested text node silently loses the weight it declares', () => {
    // This is the class the earlier sweeps actually shipped, ten times over: a child
    // span keeps a `fontWeight` that stops meaning anything the moment its parent gains
    // an explicit family, so "12.4 **lbs**" and "37% *finished*" quietly flattened. It
    // is invisible in a diff — the child was never touched.
    const findings = fmt(allFindings().nested).map(
      (f) => `${f}; move it to ThemedText, or spell fontFamily on its style`,
    );
    expect(findings).toEqual([]);
  });

  it('no style block declares a family and a weight that disagree', () => {
    // The class a grep for raw <Text> is structurally blind to: the node IS swept, the
    // family IS explicit, and the text still renders at the wrong weight (CUL-652).
    const findings = fmt(disagreeingPairs()).map(
      (f) => `${f}; the family carries the weight — drop the fontWeight`,
    );
    expect(findings).toEqual([]);
  });
});

// ── The detector itself ───────────────────────────────────────────────────────
//
// `guards/completionCard.test.ts` shipped a first version that PASSED the very defect
// it was written for, and it was found by running it against the pre-fix tree rather
// than by reading it. A guard that has only ever been green has not been tested — so
// each rule below is pointed at a known-bad file and required to go red.

describe('the detector itself', () => {
  // The fixture lives OUTSIDE the repo (CUL-712). It used to be written to
  // `components/__geist_guard_fixture__.tsx` — inside the tree this guard AND
  // `haptics`/`completionCard` all scan — so a parallel worker either read it
  // mid-delete (ENOENT, observed for real during CUL-654) or reported a deliberately
  // non-compliant file as a live violation.
  //
  // It keeps its `components/` SHAPE inside that root so the fixture is a realistic
  // component path, and every scanner call below states the root explicitly.
  const rel = 'components/GeistFixture.tsx';
  let root = '';
  const write = (src: string) => writeFixture(root, rel, src);

  beforeEach(() => {
    root = createFixtureRoot('geist', SCAN_DIRS);
  });
  afterEach(() => {
    removeFixtureRoot(root);
  });

  it('FLAGS a raw <Text> whose style names no family', () => {
    write(
      `const styles = StyleSheet.create({ a: { fontSize: 12 } });\n` +
        `export const X = () => <Text style={styles.a}>hi</Text>;\n`,
    );
    expect(fmt(scanFile(rel, root).sites)).toEqual([`${rel}:2 — <Text>`]);
  });

  it('CLEARS the same node once the style names a family', () => {
    write(
      `const styles = StyleSheet.create({ a: { fontFamily: theme.fontBody } });\n` +
        `export const X = () => <Text style={styles.a}>hi</Text>;\n`,
    );
    expect(scanFile(rel, root).sites).toEqual([]);
  });

  it('CLEARS a ThemedText, which carries its family by construction', () => {
    write(`export const X = () => <ThemedText style={styles.a}>hi</ThemedText>;\n`);
    expect(scanFile(rel, root).sites).toEqual([]);
  });

  it('FLAGS an Animated.Text — the shape that slips through both nets', () => {
    // ThemedText has no Animated variant, so an Animated.Text escapes the sweep's
    // find-and-replace AND a grep for `<Text`. It surfaces as a screen that stayed SF
    // for no visible reason (the CUL-609 finding).
    write(
      `const styles = StyleSheet.create({ a: { fontSize: 12 } });\n` +
        `export const X = () => <Animated.Text style={styles.a}>hi</Animated.Text>;\n`,
    );
    expect(fmt(scanFile(rel, root).sites)).toEqual([`${rel}:2 — <Animated.Text>`]);
  });

  it('FLAGS a TextInput whose style names no family', () => {
    write(
      `const styles = StyleSheet.create({ a: { fontSize: 12 } });\n` +
        `export const X = () => <TextInput style={styles.a} />;\n`,
    );
    expect(fmt(scanFile(rel, root).inputs)).toEqual([`${rel}:2 — <TextInput>`]);
  });

  it('FLAGS a style it cannot resolve, rather than assuming it is fine', () => {
    write(`export const X = ({ style }) => <Text style={style}>hi</Text>;\n`);
    expect(scanFile(rel, root).sites).toHaveLength(1);
  });

  it('FLAGS a conditional style where only ONE arm names a family', () => {
    // The half-covered branch renders SF. Being right on the happy path is not enough.
    write(
      `const styles = StyleSheet.create({ a: { fontFamily: theme.fontBody }, b: { fontSize: 12 } });\n` +
        `export const X = ({ on }) => <Text style={on ? styles.a : styles.b}>hi</Text>;\n`,
    );
    expect(scanFile(rel, root).sites).toHaveLength(1);
  });

  it('does NOT accept a fontFamily written inside a COMMENT', () => {
    // The completionCard trap, in this guard's terms: prose about the rule is not the
    // rule. Parsing rather than grepping is what makes this hold.
    write(
      `const styles = StyleSheet.create({ a: { /* fontFamily: theme.fontBody */ fontSize: 12 } });\n` +
        `export const X = () => <Text style={styles.a}>hi</Text>;\n`,
    );
    expect(scanFile(rel, root).sites).toHaveLength(1);
  });

  it('does NOT treat a <Text> written inside a COMMENT as a violation', () => {
    // The other direction: every exemption marker in the tree contains the literal
    // string `<Text>`, so a scan that matched raw source would flag its own paperwork.
    write(`// stays a raw <Text> so it inherits the parent face\nexport const X = () => null;\n`);
    expect(scanFile(rel, root).sites).toEqual([]);
  });

  it('CLEARS a flagged site covered by a geist-ok marker', () => {
    write(
      `const styles = StyleSheet.create({ a: { fontSize: 12 } });\n` +
        `// geist-ok: icon glyph, not copy\n` +
        `export const X = () => <Text style={styles.a}>›</Text>;\n`,
    );
    expect(matchMarkers(rel, scanFile(rel, root).sites, root)).toEqual([]);
  });

  it('lets ONE marker cover only ONE site', () => {
    // The shadowing hole: without pairwise consumption, one annotated glyph would
    // exempt every unannotated sibling within reach and the file would read as clean.
    write(
      `const styles = StyleSheet.create({ a: { fontSize: 12 } });\n` +
        `// geist-ok: icon glyph, not copy\n` +
        `export const X = () => <><Text style={styles.a}>›</Text><Text style={styles.a}>copy</Text></>;\n`,
    );
    expect(matchMarkers(rel, scanFile(rel, root).sites, root)).toHaveLength(1);
  });

  it('does NOT let a marker reach a site far below it', () => {
    write(
      `const styles = StyleSheet.create({ a: { fontSize: 12 } });\n` +
        `// geist-ok: icon glyph, not copy\n` +
        '\n'.repeat(MARKER_REACH_LINES + 2) +
        `export const X = () => <Text style={styles.a}>copy</Text>;\n`,
    );
    expect(matchMarkers(rel, scanFile(rel, root).sites, root)).toHaveLength(1);
  });

  it('FLAGS a raw child whose fontWeight the parent family makes inert', () => {
    // The exact shape of `components/dashboard/RankingCard.tsx` before this PR: the
    // parent was swept, the child was not, and "finished" stopped being regular.
    write(
      `const styles = StyleSheet.create({ big: { fontWeight: theme.weightSemibold }, sub: { fontWeight: theme.weightRegular } });\n` +
        `export const X = () => <ThemedText style={styles.big}>37% <Text style={styles.sub}>finished</Text></ThemedText>;\n`,
    );
    expect(scanFile(rel, root).nested).toHaveLength(1);
  });

  it('SPARES that child once it names its own family', () => {
    write(
      `const styles = StyleSheet.create({ big: { fontWeight: theme.weightSemibold }, sub: { fontFamily: theme.fontBody } });\n` +
        `export const X = () => <ThemedText style={styles.big}>37% <Text style={styles.sub}>finished</Text></ThemedText>;\n`,
    );
    expect(scanFile(rel, root).nested).toEqual([]);
  });

  it('SPARES a colour-only child, which is SUPPOSED to inherit the parent face', () => {
    // The CUL-607 carve-out. Flagging this would push authors toward the very nesting
    // that breaks the cascade, so the rule keys on declaring a weight, not on nesting.
    write(
      `const styles = StyleSheet.create({ big: { fontWeight: theme.weightSemibold }, sub: { color: theme.colorTextTertiary } });\n` +
        `export const X = () => <ThemedText style={styles.big}>a <Text style={styles.sub}>b</Text></ThemedText>;\n`,
    );
    expect(scanFile(rel, root).nested).toEqual([]);
  });

  it('FLAGS a weightless ThemedText nested under a text ancestor', () => {
    // Renders identically while the parent is regular, which is what makes it a trap:
    // it surfaces later, in an unrelated diff, the day the parent gains a weight.
    write(
      `const styles = StyleSheet.create({ big: { fontWeight: theme.weightSemibold } });\n` +
        `export const X = () => <ThemedText style={styles.big}>a <ThemedText>b</ThemedText></ThemedText>;\n`,
    );
    expect(scanFile(rel, root).nested).toHaveLength(1);
  });

  it('a geist-ok marker does NOT excuse a lost weight', () => {
    // A marker says "this node is deliberately raw". It never says "this node is
    // deliberately rendering the wrong weight" — letting it cover both would turn every
    // glyph exemption in the tree into a blind spot.
    write(
      `const styles = StyleSheet.create({ big: { fontWeight: theme.weightSemibold }, sub: { fontWeight: theme.weightRegular } });\n` +
        `// geist-ok: nested span\n` +
        `export const X = () => <ThemedText style={styles.big}>a <Text style={styles.sub}>b</Text></ThemedText>;\n`,
    );
    const r = scanFile(rel, root);
    expect(matchMarkers(rel, r.sites, root)).toEqual([]); // assertion 1 is satisfied…
    expect(r.nested).toHaveLength(1); // …and assertion 4 still fires.
  });

  it('resolves a style sheet NOT named `styles`', () => {
    // Found by a code review probing the guard rather than reading it. `declaresWeight`
    // used to pull block names out of the attribute text with `/styles\.(\w+)/`, so any
    // other style-sheet identifier — `FilterChip.tsx` has three — made assertion 4 blind.
    write(
      `const nightVariant = StyleSheet.create({ big: { fontWeight: theme.weightSemibold }, sub: { fontWeight: theme.weightRegular } });\n` +
        `export const X = () => <ThemedText style={nightVariant.big}>37% <Text style={nightVariant.sub}>finished</Text></ThemedText>;\n`,
    );
    expect(scanFile(rel, root).nested).toHaveLength(1);
  });

  it('still FLAGS a lost weight when the site carries a geist-ok marker', () => {
    // The worst version of the bug above: assertion 1 is silenced by the marker and
    // assertion 4 was blinded by the identifier, so a real regression went fully green —
    // defeating the exact test written to prove a marker cannot excuse a lost weight.
    write(
      `const nightVariant = StyleSheet.create({ big: { fontWeight: theme.weightSemibold }, sub: { fontWeight: theme.weightRegular } });\n` +
        `// geist-ok: nested span — colour only\n` +
        `export const X = () => <ThemedText style={nightVariant.big}>37% <Text style={nightVariant.sub}>finished</Text></ThemedText>;\n`,
    );
    const r = scanFile(rel, root);
    expect(matchMarkers(rel, r.sites, root)).toEqual([]);
    expect(r.nested).toHaveLength(1);
  });

  it('does NOT let one style sheet vouch for another sharing a key name', () => {
    // Two `StyleSheet.create`s in one file is the normal shape for a day/night surface.
    // A flat key→block map reported `nightStyles.label` compliant because `dayStyles`
    // happened to define a `label` with a family.
    write(
      `const dayStyles = StyleSheet.create({ label: { fontFamily: theme.fontBody } });\n` +
        `const nightStyles = StyleSheet.create({ label: { fontSize: 12 } });\n` +
        `export const X = () => <Text style={nightStyles.label}>copy</Text>;\n`,
    );
    expect(scanFile(rel, root).sites).toHaveLength(1);
  });

  it('pairs each site with the NEAREST marker above it, in line order', () => {
    // `sites` arrives in AST traversal order (parent before child, not positional), and
    // the pairing used to take the FIRST marker within reach rather than the nearest —
    // so which marker covered which site depended on JSX shape instead of position.
    write(
      `const styles = StyleSheet.create({ a: { fontSize: 12 }, b: { fontSize: 12 } });\n` +
        `// geist-ok: first\n` +
        `export const A = () => <Text style={styles.a}>one</Text>;\n` +
        `// geist-ok: second\n` +
        `export const B = () => <Text style={styles.b}>two</Text>;\n`,
    );
    expect(matchMarkers(rel, scanFile(rel, root).sites, root)).toEqual([]);
    // …and with one marker removed, exactly the uncovered site is reported.
    write(
      `const styles = StyleSheet.create({ a: { fontSize: 12 }, b: { fontSize: 12 } });\n` +
        `export const A = () => <Text style={styles.a}>one</Text>;\n` +
        `// geist-ok: second\n` +
        `export const B = () => <Text style={styles.b}>two</Text>;\n`,
    );
    expect(fmt(matchMarkers(rel, scanFile(rel, root).sites, root))).toEqual([`${rel}:2 — <Text>`]);
  });

  it('FLAGS a family and weight that disagree, and spares ones that agree', () => {
    expect(FAMILY_WEIGHT[familyKey('theme.fontBody')]).toBe('400');
    expect(weightValue('theme.weightSemibold')).toBe('600');
    // The two live defects this PR fixed (feedback.tsx, AskChip.tsx) had exactly this
    // shape: fontBody + weightSemibold, declaring semibold and rendering regular.
    expect(FAMILY_WEIGHT[familyKey('theme.fontBody')]).not.toBe(
      weightValue('theme.weightSemibold'),
    );
    expect(FAMILY_WEIGHT[familyKey('theme.fontBodySemibold')]).toBe(
      weightValue('theme.weightSemibold'),
    );
    // Both spellings of the weight token resolve — a guard that knew only one would
    // silently skip every site using the other.
    expect(weightValue('theme.fontWeightMedium')).toBe('500');
    expect(weightValue('theme.weightMedium')).toBe('500');
  });

  it('spares a family that is not one of ours', () => {
    write(`const styles = StyleSheet.create({ a: { fontFamily: 'Menlo', fontWeight: '600' } });\n`);
    expect(parse(rel, root).pairs).toHaveLength(1);
    expect(FAMILY_WEIGHT[familyKey("'Menlo'")]).toBeUndefined();
  });
});
