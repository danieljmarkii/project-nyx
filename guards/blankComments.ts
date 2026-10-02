// The single-pass comment blanker source-scanning guards should share (C-18). CUL-884
// moved three chained `.replace()` blankers onto it; the six still chaining are listed
// on CUL-697, the shared-scan refactor.
//
// CUL-1116 — it no longer lexes by hand. The first version tracked code, comments and
// the three string kinds, but knew nothing of regex literals or JSX text, so a quote
// inside either (`lib/food.ts`'s character class holding a backtick, `<Text>Don't</Text>`)
// opened a "string" that ran to the next matching quote, and every comment in that
// stretch stayed in the scan: 446 comment lines across 24 files on 2026-10-01, read as
// code by every guard here. Telling a regex from a division, or JSX text from a
// comparison, takes a parser, so the literal spans now come from the TypeScript one.
//
// It lives in its own module rather than inside one guard's test file because a test
// file cannot be imported by another test file without jest running its suites twice —
// and a guard that copies the function instead is exactly how the chained-replace bug
// propagated in the first place. (The Deno suites keep their own copy in
// `supabase/functions/_shared/sourceScan.testutil.ts`, which cannot import `typescript`
// and still carries the old limit.)

import * as ts from 'typescript';

// The tokens whose text is DATA, not code: a `//` or `/*` inside one is not a comment.
const LITERAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.JsxText,
]);

function parseErrorCount(sf: ts.SourceFile): number {
  // `parseDiagnostics` is the parser's own list (syntax only, no type check). It is not
  // on the public type, but it is how the compiler reports a file that did not parse.
  return (sf as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length ?? 0;
}

/**
 * Parse as whichever of TS and TSX the source parses cleanly as.
 *
 * Callers hand over the source alone, and the kind matters in both directions: read as
 * TSX, a `.ts` file's `<T>value` assertion or `<T>(x) => …` arrow is a JSX tag (the same
 * desync, moved); read as TS, a `.tsx` file's JSX is a run of comparisons and its text is
 * code. Whichever kind parses with fewer errors is the one the file was written in. A
 * fragment that parses as neither (a guard's own fixture, say) still gets a tree, and a
 * recovered tree still marks its literals.
 */
function parse(src: string): ts.SourceFile {
  // A closing or self-closing tag means the file is probably TSX, so try that first and
  // skip the second parse a `.tsx` file would otherwise always pay. Only the ORDER is a
  // guess: a clean parse is accepted, and otherwise the kind with fewer errors wins.
  const kinds = /<\/|\/>/.test(src)
    ? [ts.ScriptKind.TSX, ts.ScriptKind.TS]
    : [ts.ScriptKind.TS, ts.ScriptKind.TSX];
  const first = ts.createSourceFile('scan', src, ts.ScriptTarget.Latest, false, kinds[0]);
  const firstErrors = parseErrorCount(first);
  if (firstErrors === 0) return first;
  const second = ts.createSourceFile('scan', src, ts.ScriptTarget.Latest, false, kinds[1]);
  return parseErrorCount(second) < firstErrors ? second : first;
}

/** Every literal token's [start, end), in source order. */
function literalRanges(sf: ts.SourceFile): [number, number][] {
  const out: [number, number][] = [];
  const visit = (node: ts.Node): void => {
    if (LITERAL_KINDS.has(node.kind)) {
      // `getStart` skips the leading trivia (comments included) that `pos` covers; for
      // JSX text it skips only whitespace, so text that LOOKS like a comment stays text.
      out.push([node.getStart(sf), node.end]);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.sort((a, b) => a[0] - b[0]);
}

/** Blank the comments in a stretch that holds no literal — so `//` and `/*` always open one. */
function blankGap(gap: string): string {
  let out = '';
  let i = 0;
  while (i < gap.length) {
    if (gap[i] === '/' && gap[i + 1] === '/') {
      while (i < gap.length && gap[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (gap[i] === '/' && gap[i + 1] === '*') {
      const close = gap.indexOf('*/', i + 2);
      const stop = close < 0 ? gap.length : close + 2;
      for (; i < stop; i += 1) out += gap[i] === '\n' ? '\n' : ' ';
      continue;
    }
    out += gap[i];
    i += 1;
  }
  return out;
}

// Keyed by the source text, so it can never hand back a stale result. It pays for the
// parser: several guards blank the same file once per test or per helper call (one
// suite, hundreds of times), which was free for the hand lexer and is not for a parse.
// One cache per test file, since jest gives each suite its own module registry.
const blanked = new Map<string, string>();

/**
 * Blank every comment, preserving offsets and newlines.
 *
 * A CHAIN of `.replace()` calls is the wrong tool here and the codebase has the scar
 * to prove it (C-18): independent passes each read delimiters the other owns, so a
 * `//` inside a string literal eats the rest of the line and an apostrophe inside a
 * "…" string pairs with the next stray quote — each silently swallowing a real
 * violation. This takes the literal spans from the parser and blanks comments only in
 * the code between them, in one left-to-right pass.
 *
 * Literals are KEPT (a table name or a helper name a scan looks for is often one).
 * Same-length replacement so every offset and line number the caller reports stays
 * honest.
 */
export function blankComments(src: string): string {
  const hit = blanked.get(src);
  if (hit !== undefined) return hit;
  let out = '';
  let at = 0;
  for (const [start, end] of literalRanges(parse(src))) {
    if (start < at) continue;
    out += blankGap(src.slice(at, start));
    out += src.slice(start, end);
    at = end;
  }
  out += blankGap(src.slice(at));
  blanked.set(src, out);
  return out;
}

