// CUL-1116 — the shared blanker's contract, one fixture per shape that desynced the
// hand-rolled walker it replaced. Each of the first three reds that walker (proven by
// running this file against it): a quote inside a regex literal or JSX text, or a
// backtick inside a string inside a `${}`, opened a "string" that ran on, and the
// comment after it stayed in the scan as code.

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
