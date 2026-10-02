// CUL-1116 — the shared blanker's contract, one fixture per shape that desynced the
// hand-rolled walker it replaced. Each of the first three reds that walker (proven by
// running this file against it): a quote inside a regex literal or JSX text, or a
// backtick inside a string inside a `${}`, opened a "string" that ran on, and the
// comment after it stayed in the scan as code.

import * as ts from 'typescript';

import { blankComments } from './blankComments';

/** The comment's text is gone; every line keeps its place. */
function expectBlanked(src: string, gone: string): string {
  const out = blankComments(src);
  expect(out).not.toContain(gone);
  expect(out.length).toBe(src.length);
  expect(out.split('\n').length).toBe(src.split('\n').length);
  return out;
}

describe('blankComments — the shapes that desynced the hand lexer', () => {
  it('a backtick inside a regex character class (lib/food.ts:145)', () => {
    expectBlanked("const RE = /[`'’]/g;\n// insertMeal( in prose\nconst x = 1;\n", 'insertMeal');
  });

  it('an odd apostrophe in JSX text', () => {
    expectBlanked(
      'const A = () => <Text>Don\'t worry</Text>;\n// showMeal( in prose\nexport default A;\n',
      'showMeal',
    );
  });

  it('a backtick inside a string inside a template substitution', () => {
    expectBlanked("const s = `a ${ '`' } b`;\n// gone( in prose\nconst y = 2;\n", 'gone');
  });

  it('a quote inside a regex after a division on the same line', () => {
    // The `/` that divides and the `/` that opens a regex are the same character; only
    // the parser knows which is which.
    expectBlanked("const r = a / 2 + /\"/.source.length;\n// gone( in prose\n", 'gone');
  });
});

describe('blankComments — the contract every caller relies on', () => {
  it('keeps a `//` or `/*` inside a string, a template and a regex', () => {
    const src = [
      "const a = '// not a comment';",
      'const b = "/* nor this */";',
      'const c = `// nor ${a} this`;',
      'const d = /\\/\\/ x/;',
      '',
    ].join('\n');
    expect(blankComments(src)).toBe(src);
  });

  it('keeps JSX text that looks like a comment, and blanks a JSX expression comment', () => {
    const src = 'const A = () => (\n  <Text>// shown {/* hidden */}</Text>\n);\n';
    const out = blankComments(src);
    expect(out).toContain('// shown');
    expect(out).not.toContain('hidden');
    expect(out.length).toBe(src.length);
  });

  it('blanks a block comment across lines and keeps its newlines', () => {
    const src = 'const a = 1; /* one\ntwo\nthree */ const b = 2;\n';
    const out = blankComments(src);
    expect(out.split('\n')).toEqual(['const a = 1;       ', '   ', '         const b = 2;', '']);
  });

  it('reads a .ts type assertion as code, not as a JSX tag', () => {
    // Parsed as TSX, `<number>` opens an element and the rest of the file is its text,
    // so the comment below would survive. The helper parses TS first for this reason.
    expectBlanked('const n = <number>value;\n// gone( in prose\nconst s = "keep";\n', 'gone');
    expect(blankComments('const n = <number>value;\nconst s = "keep";\n')).toContain('"keep"');
  });

  it('reads a .tsx file as TSX when TS cannot parse it', () => {
    const out = expectBlanked(
      "export const A = () => <View><Text>It's</Text></View>;\n// gone( in prose\n",
      'gone',
    );
    expect(out).toContain("It's");
  });

  it('falls back to the other kind when the guessed one does not parse', () => {
    // The hint (a `</` in a string) says TSX first; the type assertion makes TSX fail, so
    // the TS parse must win. Without the error count the guess alone decides and this
    // comment survives (the code-reviewer's mutant).
    expectBlanked("const s = '</div>';\nconst n = <number>v;\n// gone( in prose\n", 'gone');
  });

  it('reads the parser\'s own error list, which the kind choice depends on', () => {
    // Not on the public type: pin it, so a TypeScript that drops it reds here rather than
    // silently degrading every caller to the order guess.
    const bad = ts.createSourceFile('x.ts', 'const = ;', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const diags = (bad as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics;
    expect(Array.isArray(diags)).toBe(true);
    expect(diags?.length).toBeGreaterThan(0);
  });

  it('blanks an unterminated block comment to the end, never past it', () => {
    const src = 'const a = 1;\n/* never closed\nstill comment';
    const out = blankComments(src);
    expect(out).toBe('const a = 1;\n' + ' '.repeat('/* never closed'.length) + '\n' + ' '.repeat('still comment'.length));
  });

  it('returns the source unchanged when there is nothing to blank', () => {
    const src = "import { x } from './x';\nexport const y = x * 2;\n";
    expect(blankComments(src)).toBe(src);
  });
});
