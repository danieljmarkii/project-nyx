// Every scroll the app makes on its own honours Reduce Motion (CUL-1123).
//
// WHY THIS FILE EXISTS. When the app moves a list itself (a tab re-press back to the
// top, a jump to the evidence, a carousel dot, the newest Ask message), that is motion
// the owner did not make with their finger, so under Reduce Motion it must be a jump.
// Profile's doorway focus was the one site that knew (`animated: !focusReducedMotion`);
// four others passed `animated: true`, found by a design critique rather than by
// anything in the build. React Native's scroll methods also ANIMATE BY DEFAULT, so a
// call that says nothing about `animated` is the same defect in a quieter form.
// History v2 adds more of these next (the tab re-press, landing on a day; its spec §4),
// and an omission is exactly what review misses, so the rule is a scan.
//
// WHAT IT CHECKS. Every `.scrollTo(` / `.scrollToEnd(` / `.scrollToIndex(` /
// `.scrollToOffset(` / `.scrollToLocation(` call in app code carries an `animated` key
// whose value is not the literal `true`. The house form is
// `animated: !reducedMotionNow()` (`store/reducedMotionStore.ts`), read at the moment
// of the scroll; a render value (`animated: !reducedMotion`) and `animated: false`
// (an instant snap, `PhotoViewer`'s paging) pass too.
//
// BLIND SPOTS, stated so they do not read as coverage (C-38): it reads the call's
// argument text, not types, so `animated: someFlag` passes whatever `someFlag` holds,
// and an options object built elsewhere and passed by name is flagged, because the
// decision is not visible at the call. A scroll made through a wrapper with a
// different name is checked only where the wrapper finally calls one of the five.
//
// ESCAPE HATCH: an inline `// scroll-motion-ok: <reason>` within the ten lines above
// the call. The reason is mandatory, one marker per site.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store', 'widgets'];

/** The five ways a React Native scroll view is moved from code. */
const SCROLL_CALL = /\.(scrollTo|scrollToEnd|scrollToIndex|scrollToOffset|scrollToLocation)\s*\(/g;

const EXEMPTION = /\/\/\s*scroll-motion-ok:\s*\S+/;
const EXEMPTION_WINDOW_LINES = 10;

/** The model site: the one call that honoured the setting before this guard existed. */
const MODEL_SITE = 'app/(tabs)/profile.tsx';

function walk(dir: string, root: string, out: string[]): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__' || ent.name.startsWith('.')) continue;
      walk(full, root, out);
    } else if (/\.tsx?$/.test(ent.name) && !ent.name.includes('.test.')) {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

function sourceFiles(root: string, dirs: string[] = SCAN_DIRS): string[] {
  return dirs
    .flatMap((d) => {
      const abs = path.join(root, d);
      return fs.existsSync(abs) ? walk(abs, root, []) : [];
    })
    .sort();
}

/** ENOENT → null: a sibling guard's fixture can vanish between the walk and the read. */
function readSource(abs: string): string | null {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * The argument text of the call whose `(` sits just before `start`, up to its matching
 * `)`. Balanced over (), {} and [], skipping string literals, so a nested
 * `Math.max(0, y - 8)` or a multi-line options object is read whole.
 */
function argumentText(code: string, start: number): string {
  let depth = 0;
  let i = start;
  while (i < code.length) {
    const c = code[i];
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i += 1;
      while (i < code.length && code[i] !== quote) i += code[i] === '\\' ? 2 : 1;
    } else if (c === '(' || c === '{' || c === '[') {
      depth += 1;
    } else if (c === ')' || c === '}' || c === ']') {
      if (depth === 0) return code.slice(start, i);
      depth -= 1;
    }
    i += 1;
  }
  return code.slice(start);
}

interface Finding {
  file: string;
  line: number;
  why: 'animated: true' | 'no animated key';
}

interface Call {
  file: string;
  line: number;
  args: string;
}

function scrollCalls(root: string, dirs?: string[]): Call[] {
  const out: Call[] = [];
  for (const rel of sourceFiles(root, dirs)) {
    const raw = readSource(path.join(root, rel));
    if (raw === null) continue;
    const code = blankComments(raw);
    for (const m of code.matchAll(SCROLL_CALL)) {
      const open = (m.index ?? 0) + m[0].length;
      const line = code.slice(0, m.index).split('\n').length;
      out.push({ file: rel, line, args: argumentText(code, open) });
    }
  }
  return out;
}

function findUnhonouredScrolls(root: string): Finding[] {
  const out: Finding[] = [];
  const lines = new Map<string, string[]>();
  for (const call of scrollCalls(root)) {
    const animated = /\banimated\s*:\s*([^,}\n]+)/.exec(call.args);
    let why: Finding['why'] | null = null;
    if (!animated) why = 'no animated key';
    else if (/^true\b/.test(animated[1].trim())) why = 'animated: true';
    if (why === null) continue;
    if (!lines.has(call.file)) lines.set(call.file, (readSource(path.join(root, call.file)) ?? '').split('\n'));
    const rawLines = lines.get(call.file) ?? [];
    const window = rawLines.slice(Math.max(0, call.line - 1 - EXEMPTION_WINDOW_LINES), call.line).join('\n');
    if (EXEMPTION.test(window)) continue;
    out.push({ file: call.file, line: call.line, why });
  }
  return out;
}

describe('CUL-1123 — every programmatic scroll honours Reduce Motion', () => {
  it('scans every directory that holds a scroll call', () => {
    // The floor is derived from the REPOSITORY, never from SCAN_DIRS (C-38): a floor
    // that iterates the scanned list stays green when a directory is dropped from it.
    // Every top-level source directory is walked here with a raw text match, and each
    // file it finds must be one the guard scans.
    const everyDir = fs
      .readdirSync(REPO_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .filter((d) => !['node_modules', 'docs', 'supabase', 'guards', 'scripts', 'testUtils', '__mocks__'].includes(d));
    const holding = sourceFiles(REPO_ROOT, everyDir).filter((rel) => {
      const src = readSource(path.join(REPO_ROOT, rel));
      return src !== null && new RegExp(SCROLL_CALL.source).test(blankComments(src));
    });
    const scanned = new Set(sourceFiles(REPO_ROOT));
    expect(holding.length).toBeGreaterThanOrEqual(5);
    expect(holding.filter((rel) => !scanned.has(rel))).toEqual([]);
  });

  it('still reads the model site as a call that honours the setting', () => {
    // Without this the guard passes vacuously the day the call pattern or the argument
    // reader breaks: every call would parse as nothing and nothing would be flagged.
    const model = scrollCalls(REPO_ROOT).filter((c) => c.file === MODEL_SITE);
    expect(model).toHaveLength(1);
    expect(model[0].args).toMatch(/animated:\s*!focusReducedMotion/);
  });

  it('no scroll animates regardless of the setting', () => {
    expect(
      findUnhonouredScrolls(REPO_ROOT).map(
        (f) =>
          `${f.file}:${f.line} scrolls with ${f.why === 'animated: true' ? '`animated: true`' : 'no `animated` key (React Native animates by default)'}. ` +
          'Pass `animated: !reducedMotionNow()` (store/reducedMotionStore.ts) so it jumps under Reduce ' +
          'Motion (CUL-1123), or add an inline "// scroll-motion-ok: <reason>" within ten lines above.',
      ),
    ).toEqual([]);
  });
});

describe('the detector itself', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('programmatic-scroll', ['app', 'components']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
  });

  it('FLAGS `animated: true`, on one line or inside a multi-line options object', () => {
    writeFixture(root, 'app/A.tsx', 'ref.current?.scrollTo({ y: 0, animated: true });\n');
    writeFixture(
      root,
      'components/B.tsx',
      'list.current?.scrollToIndex({\n  index: 3,\n  viewPosition: 0,\n  animated: true,\n});\n',
    );
    expect(findUnhonouredScrolls(root)).toEqual([
      { file: 'app/A.tsx', line: 1, why: 'animated: true' },
      { file: 'components/B.tsx', line: 1, why: 'animated: true' },
    ]);
  });

  it('FLAGS a call that says nothing about `animated`, since React Native animates by default', () => {
    writeFixture(
      root,
      'app/C.tsx',
      'ref.current?.scrollToEnd();\nref.current?.scrollTo({ y: 0 });\nref.current?.scrollTo(0);\n' +
        'list.current?.scrollToOffset(opts);\n',
    );
    expect(findUnhonouredScrolls(root).map((f) => [f.line, f.why])).toEqual([
      [1, 'no animated key'],
      [2, 'no animated key'],
      [3, 'no animated key'],
      [4, 'no animated key'],
    ]);
  });

  it('SPARES the setting read at the tap, a render value, and an instant snap', () => {
    writeFixture(
      root,
      'app/D.tsx',
      'ref.current?.scrollTo({ y: Math.max(0, y - 8), animated: !reducedMotionNow() });\n' +
        'ref.current?.scrollToEnd({ animated: !reducedMotion });\n' +
        'ref.current?.scrollTo({ x: i * w, animated: false });\n',
    );
    expect(findUnhonouredScrolls(root)).toEqual([]);
  });

  it('SPARES a reasoned exemption within the window, and not one outside it', () => {
    writeFixture(
      root,
      'app/E.tsx',
      '// scroll-motion-ok: a test double that never renders\nref.scrollTo({ y: 0, animated: true });\n',
    );
    writeFixture(
      root,
      'app/F.tsx',
      '// scroll-motion-ok: some other site, far above\n' +
        '\n'.repeat(EXEMPTION_WINDOW_LINES) +
        'ref.scrollTo({ y: 0, animated: true });\n',
    );
    expect(findUnhonouredScrolls(root)).toEqual([
      { file: 'app/F.tsx', line: EXEMPTION_WINDOW_LINES + 2, why: 'animated: true' },
    ]);
  });

  it('SPARES the shape in prose — a comment about the rule is not a scroll', () => {
    writeFixture(
      root,
      'components/G.tsx',
      '// never ref.scrollTo({ y: 0, animated: true }) here\n' +
        '/* nor\n   list.scrollToEnd() */\n' +
        'const x = 1;\n',
    );
    expect(findUnhonouredScrolls(root)).toEqual([]);
  });

  it('reads past a parenthesis inside a string in the arguments', () => {
    writeFixture(root, 'app/H.tsx', "ref.scrollTo({ y: 0, label: 'a (b', animated: true });\n");
    expect(findUnhonouredScrolls(root)).toEqual([{ file: 'app/H.tsx', line: 1, why: 'animated: true' }]);
  });
});
