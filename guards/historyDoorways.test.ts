// Every link into History is registered (History v2 · the record you can read, HV-11 /
// CUL-1168; spec §5.8, H-7, AC 36; CLAUDE.md C-38).
//
// A link into History promises what the owner will see: Ask's count audited at its
// source, the month's day, a course's doses. `lib/historyDoors.ts` lists every sender with
// where it lands in both flag states, and this guard fails the build on a route to History
// that no row there accounts for. So a new door cannot ship without saying where it lands,
// and the frozen widget cannot be forgotten when History changes what it reads.
//
// ── WHAT IT READS ─────────────────────────────────────────────────────────────────
//
// Every `.ts` / `.tsx` source file (test files aside) in every top-level directory of the
// REPOSITORY, minus the exclusions named in `NOT_SCANNED` with their reasons. The set is
// derived from the repository on every run, never from a list of the directories senders
// happen to live in today (C-38: a floor derived from the constant under test is green when
// the constant loses an entry), and an exclusion that no longer exists reds.
//
// Two detectors over comment-blanked source (`blankComments`, C-18):
//   (a) THE ROUTE, SPELLED: a string literal that opens with a route to History, in any of
//       the shapes the app uses: '/(tabs)/history', "/history?type=…", `/history?…${ts}`,
//       'nyx:///history?…', and the widget's relative 'history?date='. Each file that spells
//       one must be a row's sender or its builder's file.
//   (b) ONE HOP: a row may name a BUILDER, a function that spells the route for its senders
//       (`historyDayHref`, `resolveTapThrough`, `historyHref`, …). Every file that names that
//       function must be one of the senders of a row with that builder, so a new caller of an
//       existing builder is a new door too.
//   (c) EVERY BUILDER NAMED: in a row's builder file, every exported function that spells the
//       route (directly, or through a declaration in the same file that does, as
//       `rundownHistoryHref` does through `historyHref` and a private pathname) must itself be
//       some row's builder. Without it, a builder added to a file the registry already knows
//       for another row would be followed by nothing: its file is known, and its callers spell
//       no route. (Found by removing the rundown's row and watching this file stay green.)
// And the registry cannot go stale: every sender still spells the route or names its row's
// builder, and every builder file still spells it.
//
// ── BLIND SPOTS, STATED (C-38: an undocumented one reads as coverage) ─────────────────
//
//   • A route ASSEMBLED from pieces, none of which opens with the route
//     ('/(tabs)/' + 'history', `/${tab}`). Pinned below as NOT detected, so the limit is a
//     test rather than an assumption. Spell the route whole, or call a builder.
//   • A route held in an exported CONSTANT is found where it is spelled, not where it is
//     used: the hop follows a function's name only. Builders are functions for that reason
//     (`lib/historyDoors.ts` keeps its pathname private).
//   • One hop, not a chain: a function that wraps a builder is caught where it wraps (its
//     file names the builder), and its own callers are followed only once it is registered
//     as a row's builder.
//   • The registry is per FILE. A second door added to a file that already holds one (a
//     sender pushing a new route, a new call to its row's builder) is not a new finding;
//     the row's `sends` column is where a reviewer sees it.
//   • Detector (c) splits a builder file at its top-level declarations (a line that opens
//     with `export`, `function`, `const`, …, at column 0) and counts an exported
//     `function`, or an exported `const` whose value is a function; top-level code after a
//     declaration is read as part of it, and a name inside a string counts as a mention.
//   • A bare relative segment ('history' with no slash and no query) is not a route to this
//     detector: the same spelling is every `kind: 'history'` in the codebase.
//   • `.js` files and anything under a `NOT_SCANNED` directory are not read.
//   • `blankComments`'s own limit: a quote inside a regex literal or JSX text can leave a
//     comment unblanked, which can only ADD a finding (a route quoted in that comment), never
//     hide code.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';
import { HISTORY_DOORS, type HistoryDoor } from '../lib/historyDoors';

const REPO_ROOT = path.resolve(__dirname, '..');

/** The registry itself names every builder (in its rows), so the hop never reads it. */
const REGISTRY = 'lib/historyDoors.ts';

/** Top-level directories the scan skips, each with its reason. Dot-directories (`.git`,
 *  `.github`, `.expo`) hold no app source and are skipped too. */
const NOT_SCANNED: Readonly<Record<string, string>> = {
  node_modules: 'dependencies',
  guards: 'the guards quote every route shape as test data, this file first',
  docs: 'prose and mocks, not code that navigates',
};

/** A string literal that opens with a route to History (detector a). */
const ROUTE_RE = /(['"`])(?:nyx:\/\/\/?)?(?:\/(?:\(tabs\)\/)?history(?=[?#'"`$/])|history(?=[?#]))/;

/** A row as the detectors read it: the fixtures below build their own. */
type DoorRow = Pick<HistoryDoor, 'id' | 'senders' | 'builder'>;

function scannedDirs(root: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !(e.name in NOT_SCANNED))
    .map((e) => e.name)
    .sort();
}

function sourcesUnder(abs: string, out: string[]): void {
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const next = path.join(abs, e.name);
    if (e.isDirectory()) sourcesUnder(next, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(next);
  }
}

/** Every scanned source file, repo-relative with forward slashes, comment-blanked. */
function readSources(root: string): Map<string, string> {
  const abs: string[] = [];
  for (const dir of scannedDirs(root)) sourcesUnder(path.join(root, dir), abs);
  const out = new Map<string, string>();
  for (const a of abs.sort()) {
    out.set(path.relative(root, a).split(path.sep).join('/'), blankComments(fs.readFileSync(a, 'utf8')));
  }
  return out;
}

const namesFn = (code: string, fn: string) => new RegExp(`\\b${fn}\\b`).test(code);

/** Every file that spells a route to History (detector a). */
function routeFiles(sources: Map<string, string>): string[] {
  return [...sources].filter(([, code]) => ROUTE_RE.test(code)).map(([rel]) => rel);
}

const DECL_RE = /^(export\s+)?(?:default\s+)?(?:async\s+)?(function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
const FUNCTION_VALUE_RE = /=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>|=\s*(?:async\s+)?function\b/;

/** A file's top-level declarations, each with the text up to the next one. */
function declarations(code: string): { name: string; exported: boolean; kind: string; text: string }[] {
  const out: { name: string; exported: boolean; kind: string; text: string }[] = [];
  for (const line of code.split('\n')) {
    const m = DECL_RE.exec(line);
    if (m) out.push({ name: m[3], exported: m[1] !== undefined, kind: m[2], text: line });
    else if (out.length > 0) out[out.length - 1].text += `\n${line}`;
  }
  return out;
}

/** The functions a file exports that spell a route to History, directly or through another
 *  top-level declaration of the same file that does (detector c). Types never navigate. */
function routeFunctions(code: string): string[] {
  const decls = declarations(code).filter((d) => d.kind !== 'type' && d.kind !== 'interface');
  const spells = new Set(decls.filter((d) => ROUTE_RE.test(d.text)).map((d) => d.name));
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of decls) {
      if (spells.has(d.name)) continue;
      if ([...spells].some((n) => namesFn(d.text, n))) {
        spells.add(d.name);
        grew = true;
      }
    }
  }
  return decls
    .filter((d) => d.exported && spells.has(d.name))
    .filter((d) => d.kind.startsWith('function') || (d.kind === 'const' && FUNCTION_VALUE_RE.test(d.text.split('\n')[0])))
    .map((d) => d.name);
}

/** Findings: a route or a builder named by a file no row accounts for. */
function unregistered(sources: Map<string, string>, doors: readonly DoorRow[]): string[] {
  const findings: string[] = [];
  const known = new Set<string>();
  for (const d of doors) {
    d.senders.forEach((s) => known.add(s));
    if (d.builder) known.add(d.builder.file);
  }
  for (const rel of routeFiles(sources)) {
    if (!known.has(rel)) findings.push(`${rel}: spells a route to History and is no row's sender or builder`);
  }
  const builders = new Map<string, { file: string; senders: Set<string> }>();
  for (const d of doors) {
    if (!d.builder) continue;
    const entry = builders.get(d.builder.fn) ?? { file: d.builder.file, senders: new Set<string>() };
    d.senders.forEach((s) => entry.senders.add(s));
    builders.set(d.builder.fn, entry);
  }
  for (const [fn, { file, senders }] of builders) {
    for (const [rel, code] of sources) {
      if (rel === file || rel === REGISTRY || senders.has(rel)) continue;
      if (namesFn(code, fn)) findings.push(`${rel}: calls ${fn}, a builder of a route to History, and is not its row's sender`);
    }
  }
  const builderFiles = new Set([...builders.values()].map((b) => b.file));
  for (const file of builderFiles) {
    const code = sources.get(file);
    if (code === undefined) continue;
    for (const fn of routeFunctions(code)) {
      const registered = [...builders].some(([name, b]) => name === fn && b.file === file);
      if (!registered) findings.push(`${file}: exports ${fn}, which builds a route to History and is no row's builder`);
    }
  }
  return findings;
}

/** Findings: a row that no longer describes the code (it would pass over nothing). */
function staleRows(sources: Map<string, string>, doors: readonly DoorRow[]): string[] {
  const findings: string[] = [];
  for (const d of doors) {
    for (const s of d.senders) {
      const code = sources.get(s);
      if (code === undefined) {
        findings.push(`${d.id}: sender ${s} is not a scanned source file`);
        continue;
      }
      if (!ROUTE_RE.test(code) && !(d.builder && namesFn(code, d.builder.fn))) {
        findings.push(`${d.id}: sender ${s} neither spells a route to History nor calls ${d.builder?.fn ?? 'a builder'}`);
      }
    }
    if (d.builder) {
      const code = sources.get(d.builder.file);
      if (code === undefined || !ROUTE_RE.test(code)) findings.push(`${d.id}: builder file ${d.builder.file} does not spell the route`);
      else if (!new RegExp(`export function ${d.builder.fn}\\b`).test(code)) findings.push(`${d.id}: ${d.builder.file} exports no ${d.builder.fn}`);
    }
  }
  return findings;
}

// ── The live repository ─────────────────────────────────────────────────────────────

describe('every link into History is a registered door (AC 36)', () => {
  const sources = readSources(REPO_ROOT);

  it('no file spells or builds a route to History without a row in lib/historyDoors.ts', () => {
    expect(unregistered(sources, HISTORY_DOORS)).toEqual([]);
  });

  it('no row is stale: each sender still links, each builder still spells the route', () => {
    expect(staleRows(sources, HISTORY_DOORS)).toEqual([]);
  });

  it('the scan is not vacuous: it finds routes in each directory the spec names, read off the repository', () => {
    // C-38: the four directories are the spec's (§5.8), and the scan reaches them because it
    // reads every directory the repository has, not because they are listed here.
    const dirs = scannedDirs(REPO_ROOT);
    const found = new Set(routeFiles(sources).map((rel) => rel.split('/')[0]));
    for (const d of ['app', 'components', 'lib', 'widgets']) {
      expect({ d, scanned: dirs.includes(d), found: found.has(d) }).toEqual({ d, scanned: true, found: true });
    }
    // And the hop reaches a real builder's callers.
    expect(sources.get('components/designV2/patterns/MonthInstrument.tsx')).toMatch(/\bhistoryDayHref\b/);
  });

  it('every exclusion names a directory the repository has, so none is stale', () => {
    for (const d of Object.keys(NOT_SCANNED)) expect({ d, exists: fs.existsSync(path.join(REPO_ROOT, d)) }).toEqual({ d, exists: true });
  });
});

// ── The detectors bite (C-18: proven by mutation, over a fixture outside the repo) ─────

describe('the detectors, over a fixture repository', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('history-doorways', ['app', 'components', 'lib', 'widgets']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
    root = '';
  });

  const row = (over: Partial<DoorRow>): DoorRow => ({ id: 'rundown', senders: [], builder: null, ...over });

  it('finds every route shape the app uses, each in its own file', () => {
    const shapes: Record<string, string> = {
      'app/a.tsx': "router.push('/(tabs)/history');",
      'app/b.tsx': 'router.push({ pathname: "/(tabs)/history", params: {} });',
      'components/c.tsx': 'router.push("/history?type=vomit");',
      'lib/d.ts': 'export const f = (n: number) => `/history?type=check_in&ts=${n}`;',
      'widgets/e.tsx': "const link = 'nyx:///' + 'history?date=' + day;",
      'components/f.tsx': "Linking.openURL('nyx:///history?pet=p1');",
      'app/g.tsx': 'const x = <Link href="/history">History</Link>;',
    };
    for (const [rel, src] of Object.entries(shapes)) writeFixture(root, rel, src);
    expect(routeFiles(readSources(root)).sort()).toEqual(Object.keys(shapes).sort());
    expect(unregistered(readSources(root), [])).toHaveLength(Object.keys(shapes).length);
  });

  it('reads a directory no one listed, because the set is derived from the repository', () => {
    writeFixture(root, 'extensions/share.tsx', "router.push('/(tabs)/history');");
    expect(unregistered(readSources(root), [])).toEqual([
      'extensions/share.tsx: spells a route to History and is no row\'s sender or builder',
    ]);
  });

  it('is quiet on what is not a route: other screens, the tap kind, the flag key, comments, test files', () => {
    writeFixture(
      root,
      'app/quiet.tsx',
      [
        "router.push({ pathname: '/weight-history', params: { petId } });",
        "const tap = { kind: 'history' };",
        '<Tabs.Screen name="history" />;',
        "useBetaOptIn('history_v2');",
        "// router.push('/(tabs)/history') in a comment",
        "import { x } from '../../components/historyV2/HistoryScreen';",
      ].join('\n'),
    );
    writeFixture(root, 'app/quiet.test.tsx', "expect(push).toHaveBeenCalledWith('/(tabs)/history');");
    expect(routeFiles(readSources(root))).toEqual([]);
  });

  it('a registered sender is clean; the same code in an unregistered file is not', () => {
    writeFixture(root, 'app/door.tsx', "router.push('/(tabs)/history');");
    writeFixture(root, 'app/other.tsx', "router.push('/(tabs)/history');");
    expect(unregistered(readSources(root), [row({ senders: ['app/door.tsx'] })])).toEqual([
      'app/other.tsx: spells a route to History and is no row\'s sender or builder',
    ]);
  });

  it('follows one hop: a new caller of a registered builder is a new door', () => {
    writeFixture(root, 'lib/links.ts', 'export function linkIt(n: number) { return `/history?ts=${n}`; }');
    writeFixture(root, 'app/known.tsx', 'router.push(linkIt(1));');
    writeFixture(root, 'components/new.tsx', 'onPress={() => router.push(linkIt(2))}');
    const doors = [row({ senders: ['app/known.tsx'], builder: { file: 'lib/links.ts', fn: 'linkIt' } })];
    expect(unregistered(readSources(root), doors)).toEqual([
      'components/new.tsx: calls linkIt, a builder of a route to History, and is not its row\'s sender',
    ]);
  });

  it('names every builder: one added to a known builder file, through a private pathname, reds until it has a row', () => {
    writeFixture(
      root,
      'lib/doors.ts',
      [
        "const PATH = '/(tabs)/history';",
        'export function known(ts: string) {',
        '  return { pathname: PATH, params: { ts } };',
        '}',
        'export const added = (n: number) => known(String(n));',
        'export function unrelated() {',
        "  return '/(tabs)/profile';",
        '}',
      ].join('\n'),
    );
    writeFixture(root, 'app/one.tsx', 'router.push(known("1"));');
    writeFixture(root, 'app/two.tsx', 'router.push(added(2));');
    const doors = [row({ senders: ['app/one.tsx'], builder: { file: 'lib/doors.ts', fn: 'known' } })];
    expect(routeFunctions(readSources(root).get('lib/doors.ts') as string)).toEqual(['known', 'added']);
    expect(unregistered(readSources(root), doors)).toEqual([
      'lib/doors.ts: exports added, which builds a route to History and is no row\'s builder',
    ]);
    // Registered, the same code is clean and its caller is followed.
    const both = [...doors, row({ id: 'ask-chip', senders: ['app/two.tsx'], builder: { file: 'lib/doors.ts', fn: 'added' } })];
    expect(unregistered(readSources(root), both)).toEqual([]);
  });

  it('a stale row reds: a sender that no longer links, a builder that no longer exists', () => {
    writeFixture(root, 'app/gone.tsx', "router.push('/(tabs)/profile');");
    writeFixture(root, 'lib/links.ts', 'export function other() { return "/history?x=1"; }');
    const doors = [
      row({ id: 'ask-chip', senders: ['app/gone.tsx'] }),
      row({ id: 'rundown', senders: ['app/missing.tsx'], builder: { file: 'lib/links.ts', fn: 'linkIt' } }),
    ];
    expect(staleRows(readSources(root), doors)).toEqual([
      'ask-chip: sender app/gone.tsx neither spells a route to History nor calls a builder',
      'rundown: sender app/missing.tsx is not a scanned source file',
      'rundown: lib/links.ts exports no linkIt',
    ]);
  });

  it('STATED BLIND SPOT: a route assembled from pieces is not found', () => {
    writeFixture(root, 'app/pieces.tsx', "router.push('/(tabs)/' + 'history');");
    expect(routeFiles(readSources(root))).toEqual([]);
  });
});
