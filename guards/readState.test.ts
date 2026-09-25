// One reader of the per-incident read's verdict (History v2 §5.4, AC 20; HV-5 /
// CUL-1162).
//
// WHAT THE RULE IS. Whether a photographed vomit or stool is "worth a call", calm,
// waiting, unread or unknown is decided in ONE place, `readStateOf`
// (`lib/readState.ts`), over ONE source, the phone's copy of the verdict
// (`lib/readCopy.ts`). No other file reads the verdict: not off the server's
// `event_ai_analysis`, not off the copy, not off a row somebody handed it.
//
// WHY A GUARD RATHER THAN A SENTENCE. Because the state this replaced was four readers
// with three answers, and each was locally reasonable when written. Home's spine read
// the server and dropped the verdict when the owner hid the read (`spineNode.ts:214`,
// before this issue); the Patterns month read the server and ignored the hide; the
// Signal screen read the server and printed an unknown verdict as a blank tile; and
// offline all three simply had nothing. The fifth reader, written the obvious way, is
// one `.select('event_id, recommendation')` away, and nothing about it looks wrong in a
// diff. This file is what makes it red.
//
// ── THREE KINDS OF HIT, BY NAME AND BY SHAPE ─────────────────────────────────
//   • `server`: the server table's name as a string literal. Every client read of it
//     starts there: a `.from('…')`, a realtime filter, a sync helper handed the name. A
//     bare-literal match is deliberately wider than a `.from(` shape, because a helper
//     that takes the table as an argument (`fetchAllRows(table, cols)`) is exactly the
//     indirection a shape detector misses (the `visitReaders` reviewer's evasion). A
//     template that merely BEGINS with the name, like the watch's channel id, is not a
//     literal of it and does not match.
//   • `copy`: the local table's name as a literal, or a SQL clause naming it.
//   • `field`: `recommendation` as an identifier or inside a string: a member read, a
//     destructure, a select list, a SQL column. Case-sensitive, so the type name
//     `IncidentRecommendation` is not a hit.
// Every pattern runs over the source with its COMMENTS blanked in one pass
// (`blankComments`, C-18), so a sentence about the rule, and this codebase writes many,
// is never evidence against it; strings are kept, because SQL and select lists live in
// them.
//
// ── THE REGISTRY IS AN EXEMPTION (C-32) ──────────────────────────────────────
// `ALLOWED` excuses files, by KIND, from the prohibition; it is not a list of files
// that thought about the verdict. Each entry says what kind of reader it is and why,
// every entry must still HAVE a hit of every kind it names (a kind a file no longer
// uses is a pre-authorised hole for whatever lands in it next), and the surfaces this
// rule exists for are named clean below rather than left to the registry's absence.
//
// ── WHAT IS NOT SCANNED ──────────────────────────────────────────────────────
//   • Test files and `guards/`: a guard's fixtures ARE the anti-pattern (C-18).
//   • `supabase/functions/`: the server WRITES the read (`analyze-*`) and its own
//     readers (the report, the Signal engine) work under their own specs and cannot see
//     the phone's copy; this rule is about what a CLIENT surface shows. `scripts/`:
//     operator tooling, never shipped.
//
// ── STATED BLIND SPOTS (C-38) ────────────────────────────────────────────────
// Undocumented, they would read as coverage:
//   • a table name or key ASSEMBLED at runtime (`'event_ai_' + 'analysis'`,
//     `row['recommend' + 'ation']`): an evasion, not an accident, and no source scan
//     can see it;
//   • `blankComments` does not understand JSX text or regex literals, so a quote inside
//     either can leave a comment un-blanked. That fails toward a FALSE HIT (a comment
//     read as code), never a missed one.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');

/** Every tree that ships CLIENT behaviour. `guards/` is deliberately absent. */
const SCAN_DIRS = ['app', 'components', 'lib', 'store', 'hooks', 'constants', 'widgets'];

const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'dist']);

type Kind = 'server' | 'copy' | 'field';

// ── The allow-set ────────────────────────────────────────────────────────────

const ALLOWED: Record<string, { kinds: readonly Kind[]; why: string }> = {
  // ── The predicate ──
  'lib/readState.ts': {
    kinds: ['field'],
    why:
      'THE predicate: readStateOf / isWorthACall / readVerdictOf decide every surface’s ' +
      'state from a copy row’s status and verdict. Reads neither table; it is handed rows.',
  },
  'lib/incidentReadState.ts': {
    kinds: ['field'],
    why:
      'The CUL-812 half the predicate is built on (escalationSurvivesFailure), shared ' +
      'with the record screen’s sections so an escalation outlives a failed re-read in ' +
      'both places by one rule. Handed rows; reads no table.',
  },

  // ── The copy: its one module, and its DDL ──
  'lib/readCopy.ts': {
    kinds: ['server', 'copy', 'field'],
    why:
      'The copy’s only reader and only writer: the local read every surface goes ' +
      'through, the one upsert, the sync pull and the landed-read pull. Its server ' +
      'reads select exactly four columns (lib/readCopy.test.ts pins them).',
  },
  'lib/localSchema.ts': {
    kinds: ['copy', 'field'],
    why: 'DDL. Declares the copy’s table and its `recommendation` column; reads no row.',
  },
  'lib/hydration.ts': {
    kinds: ['copy'],
    why:
      'The sign-out wipe list: the copy is DELETED by this name (clearLocalData), the ' +
      'Trust & Safety half of holding health data on the phone. Reads no row.',
  },

  // ── The write side of the read ──
  'lib/analysis.ts': {
    kinds: ['server'],
    why:
      'The owner’s edits to the structured fields (an UPDATE that touches none of the ' +
      'read’s columns) and the realtime filter the watch subscribes to. Reads no ' +
      'verdict: a landing is handed to the copy’s pull.',
  },

  // ── The record screen, which renders the read's WORDS ──
  'components/event/VomitAnalysisSection.tsx': {
    kinds: ['server', 'field'],
    why:
      'The record screen’s vomit read: its incident’s full row, rendered in words (the ' +
      'one surface that shows them), plus the owner’s Hide. What Hide hides there is ' +
      'CUL-1111’s; the verdict it renders is never an input to readStateOf.',
  },
  'components/event/StoolAnalysisSection.tsx': {
    kinds: ['server', 'field'],
    why: 'The stool twin of VomitAnalysisSection: the full row in words, and the owner’s Hide.',
  },
  // NOT HERE, and it was on the first draft: `components/event/IncidentReadCard.tsx`, the
  // record's read card. It names the verdict only in COMMENTS (it is handed a typed prop,
  // never a row), and the staleness assertion below rejected the entry on this guard's
  // first run: C-32's mechanism doing its job, since an exemption for a file that reads
  // nothing would pre-authorise the first real read added to it.
};

/**
 * The surfaces this rule exists for, named rather than left to the allow-set's
 * absence (absence is also what a deleted file, a rename and a typo look like). Each
 * must exist and must have NO hit: they see the verdict only through the predicate.
 * `lib/sync.ts` is here because the pull's body was put in `lib/readCopy.ts` precisely
 * so a 3,000-line file is never excused.
 */
const MUST_STAY_CLEAN = [
  'lib/spineReads.ts',
  'lib/spineNode.ts',
  'lib/monthReads.ts',
  'lib/signalScreen.ts',
  'lib/sync.ts',
  'components/designV2/home/TodayCard.tsx',
  'components/designV2/signal/SignalScreen.tsx',
  'components/designV2/signal/EpisodeGallery.tsx',
  'components/designV2/patterns/MonthInstrument.tsx',
  'components/charts/DayMark.tsx',
  'app/(tabs)/history.tsx',
  // The row Home and History v2 share (HV-1, #907): its pipeline and its two renderers,
  // and the History v2 screen that will draw it. AC 20 names History as a reader.
  'lib/dayNodes.ts',
  'components/dayRow/DayNodeRow.tsx',
  'components/dayRow/SpineNodeRow.tsx',
  'components/historyV2/HistoryScreen.tsx',
  'components/historyV2/HistoryList.tsx',
];

// ── The detector ─────────────────────────────────────────────────────────────

const SERVER_PATTERN = /['"`]event_ai_analysis['"`]/;
const COPY_PATTERNS: readonly RegExp[] = [
  /['"`]event_ai_verdicts['"`]/,
  /\b(?:FROM|INTO|JOIN|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+event_ai_verdicts\b/i,
];
const FIELD_PATTERN = /\brecommendation\b/;

export interface ReadFinding {
  readonly file: string;
  readonly kinds: readonly Kind[];
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(abs);
  }
  return out;
}

/**
 * Every client file under `root` that names either table or the verdict field.
 *
 * `root` is REQUIRED, never defaulted (`guards/fixtureRoot.ts`'s rule): a default
 * silently re-points a forgetful self-test at the real tree.
 */
export function scanReadReaders(root: string): ReadFinding[] {
  const findings: ReadFinding[] = [];
  for (const abs of SCAN_DIRS.flatMap((d) => walk(path.join(root, d)))) {
    const src = blankComments(fs.readFileSync(abs, 'utf8'));
    const kinds: Kind[] = [];
    if (SERVER_PATTERN.test(src)) kinds.push('server');
    if (COPY_PATTERNS.some((re) => re.test(src))) kinds.push('copy');
    if (FIELD_PATTERN.test(src)) kinds.push('field');
    if (kinds.length > 0) findings.push({ file: path.relative(root, abs).split(path.sep).join('/'), kinds });
  }
  return findings;
}

/** The hits the allow-set does not excuse: a file with no entry, or a kind its entry
 *  does not name. Printed with the kind, so a failure says what to do. */
export function unexcusedReaders(
  findings: readonly ReadFinding[],
  allowed: Readonly<Record<string, { readonly kinds: readonly Kind[] }>>,
): string[] {
  const out: string[] = [];
  for (const f of findings) {
    const registered: readonly Kind[] = allowed[f.file]?.kinds ?? [];
    const extra = f.kinds.filter((k) => !registered.includes(k));
    if (extra.length === 0) continue;
    out.push(
      f.file in allowed
        ? `${f.file} (${extra.join('+')}, registered for ${registered.join('+')} only)`
        : `${f.file} (${extra.join('+')}) — read the verdict through readStateOf (lib/readState.ts) and the copy through lib/readCopy.ts`,
    );
  }
  return out;
}

// ── The live scan ────────────────────────────────────────────────────────────

describe('AC 20 — one reader of the read’s verdict', () => {
  const findings = scanReadReaders(ROOT);
  const found = new Set(findings.map((f) => f.file));

  it('the scan reaches the real tree and finds the substrate it must find', () => {
    // A NON-VACUITY FLOOR, before any comparison (C-36): a broken walker or a pattern
    // that matches nothing yields zero findings, which satisfy every assertion below.
    expect(found.has('lib/readState.ts')).toBe(true);
    expect(found.has('lib/readCopy.ts')).toBe(true);
    expect(found.has('components/event/VomitAnalysisSection.tsx')).toBe(true);
    expect(findings.length).toBeGreaterThanOrEqual(8);
  });

  it('SCAN_DIRS covers every directory that ships client code (derived from the repo, C-38)', () => {
    // A floor that iterated SCAN_DIRS would stay green when an entry is REMOVED from it
    // (measured on guards/visitReaders.test.ts), so the expected set is the repository's.
    const OUT_OF_SCOPE = new Set([
      'guards', // a guard's fixtures ARE the anti-pattern (C-18)
      'supabase', // the server side: it writes the read; see the header
      'scripts', // operator tooling, never shipped
      'testUtils', // test scaffolding, never bundled
      'docs', // one stray .ts in a doc example
      'node_modules',
      'ios',
      'android',
      '.expo',
    ]);
    const clientDirs = fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .filter((name) => !OUT_OF_SCOPE.has(name))
      .filter((name) => walk(path.join(ROOT, name)).length > 0);
    expect(clientDirs.filter((d) => !SCAN_DIRS.includes(d))).toEqual([]);
    for (const dir of SCAN_DIRS) {
      expect(fs.existsSync(path.join(ROOT, dir))).toBe(true);
      expect(walk(path.join(ROOT, dir)).length).toBeGreaterThan(0);
    }
  });

  it('no file outside the allow-set reads the verdict, and no allowed file beyond its kinds', () => {
    expect(unexcusedReaders(findings, ALLOWED)).toEqual([]);
  });

  it('the registry has no stale entries — an exemption is not a note (C-32)', () => {
    expect(Object.keys(ALLOWED).filter((f) => !found.has(f))).toEqual([]);
  });

  it('and no stale KIND: a kind a file no longer uses is the same hole', () => {
    const byFile = new Map(findings.map((f) => [f.file, f.kinds]));
    const stale = Object.entries(ALLOWED).flatMap(([file, { kinds }]) =>
      kinds.filter((k) => !(byFile.get(file) ?? []).includes(k)).map((k) => `${file} (${k})`),
    );
    expect(stale).toEqual([]);
  });

  it('every allowed file states what KIND of reader it is', () => {
    for (const [file, { kinds, why }] of Object.entries(ALLOWED)) {
      expect(kinds.length).toBeGreaterThan(0);
      expect(`${file}: ${why}`.length).toBeGreaterThan(file.length + 60);
    }
  });

  it('the surfaces are clean, by name, and every one of them exists', () => {
    for (const file of MUST_STAY_CLEAN) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
      expect(found.has(file)).toBe(false);
      expect(Object.keys(ALLOWED)).not.toContain(file);
    }
  });
});

// ── The detector, proven (C-18) ──────────────────────────────────────────────
// Fixtures live OUTSIDE the repository (CUL-712), so a parallel guard's walk never
// picks them up, and the scan takes its root as a required parameter.

describe('the detector itself', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('read-state', ['lib', 'components']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
    root = '';
  });
  const hits = () => scanReadReaders(root).map((f) => `${f.file} (${f.kinds.join('+')})`);

  it('FLAGS the fifth reader written the old way: a server select of the verdict', () => {
    writeFixture(
      root,
      'lib/a.ts',
      `const { data } = await supabase.from('event_ai_analysis').select('event_id, recommendation').in('event_id', ids);`,
    );
    expect(hits()).toEqual(['lib/a.ts (server+field)']);
  });

  it('FLAGS a select of everything, which names no column', () => {
    writeFixture(root, 'lib/b.ts', `await supabase.from('event_ai_analysis').select('*').eq('event_id', id);`);
    expect(hits()).toEqual(['lib/b.ts (server)']);
  });

  it('FLAGS a helper handed the table by name, and a realtime subscription to it', () => {
    writeFixture(root, 'lib/c.ts', `const rows = await fetchAllRows('event_ai_analysis', '*');`);
    writeFixture(
      root,
      'components/D.tsx',
      `supabase.channel('x').on('postgres_changes', { event: '*', schema: 'public', table: 'event_ai_analysis' }, cb);`,
    );
    expect(hits().sort()).toEqual(['components/D.tsx (server)', 'lib/c.ts (server)']);
  });

  it('FLAGS a local read of the copy, spelled or held in a variable', () => {
    writeFixture(root, 'lib/e.ts', `await db.getAllAsync("SELECT * FROM event_ai_verdicts WHERE event_id = ?", [id]);`);
    writeFixture(root, 'lib/f.ts', ["const T = 'event_ai_verdicts';", 'await db.getAllAsync(`SELECT * FROM ${T}`);'].join('\n'));
    expect(hits().sort()).toEqual(['lib/e.ts (copy)', 'lib/f.ts (copy)']);
  });

  it('FLAGS the verdict read off a row somebody handed over: a member read, a destructure', () => {
    writeFixture(root, 'lib/g.ts', `const rose = row.recommendation === 'worth_a_call';`);
    writeFixture(root, 'components/H.tsx', `const { status, recommendation } = copy;`);
    expect(hits().sort()).toEqual(['components/H.tsx (field)', 'lib/g.ts (field)']);
  });

  it('IGNORES a comment naming all three, however exactly it is spelled', () => {
    writeFixture(
      root,
      'lib/i.ts',
      [
        "// never supabase.from('event_ai_analysis').select('recommendation') here",
        '/* nor SELECT recommendation FROM event_ai_verdicts */',
        'export const X = 1;',
      ].join('\n'),
    );
    expect(hits()).toEqual([]);
  });

  it('does NOT accept a commented-out read as cover for a real one', () => {
    writeFixture(
      root,
      'lib/j.ts',
      ["// row.recommendation", "const v = row.recommendation;"].join('\n'),
    );
    expect(hits()).toEqual(['lib/j.ts (field)']);
  });

  it('IGNORES the shapes that only resemble a hit: a type name, a channel id, another table', () => {
    writeFixture(
      root,
      'lib/k.ts',
      [
        "import type { IncidentRecommendation } from './incidentReadState';",
        'const channel = supabase.channel(`event_ai_analysis:${eventId}`);',
        "await db.getAllAsync('SELECT event_id FROM event_attachments');",
      ].join('\n'),
    );
    expect(hits()).toEqual([]);
  });

  it('IGNORES a test file and a file outside the client trees', () => {
    writeFixture(root, 'lib/l.test.ts', `const v = row.recommendation;`);
    writeFixture(root, 'supabase/functions/x/index.ts', `const v = row.recommendation;`);
    expect(hits()).toEqual([]);
  });

  it('the allow-set excuses a file for its kinds only', () => {
    const findings: ReadFinding[] = [{ file: 'lib/hydration.ts', kinds: ['copy', 'field'] }];
    expect(unexcusedReaders(findings, ALLOWED)).toEqual(['lib/hydration.ts (field, registered for copy only)']);
    expect(unexcusedReaders([{ file: 'lib/new.ts', kinds: ['server'] }], ALLOWED)[0]).toMatch(/^lib\/new\.ts \(server\)/);
  });
});
