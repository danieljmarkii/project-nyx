// The visit-data reader bound (CUL-899 VV-1; docs/nyx-vet-visits-requirements.md
// §5.6, AC 10).
//
// WHAT THE RULE IS. `vet_visits`, `vet_appointments` and the `vet_visit_id` links are
// a RECORD OF APPOINTMENTS, not observations of an animal. They never enter a count,
// a coverage line, a Patterns panel, or any engine input.
//
// WHY IT NEEDS A GUARD RATHER THAN A SENTENCE. Because the mistake is attractive and
// each instance looks locally correct:
//
//   * "days with a log" is the shape the app counts everywhere, and a visit is
//     obviously a thing that happened on a day. CUL-891 is this exact bug, live and
//     unresolved: a daily LOOK — a row that is even less of an observation than a
//     visit — reached the vet report's coverage denominators and took "days with a
//     log" from 3 to 31. Nothing caught it until a human read the number.
//   * The two new links make it easier, not harder. `medications.vet_visit_id` and
//     `diet_trials.vet_visit_id` sit ON tables the engine already reads, one join
//     away from every denominator in the product. CUL-746 is the standing scar:
//     two counts over one population that did not partition it, on the diet trial,
//     in the vet report.
//
// So the rule the spec states in prose — PROVENANCE, never a source of numbers
// (CUL-746: one population, one owner; TG-5: a link never moves a date) — is spelled
// here as an allow-set. A `SELECT` added to `detection.ts`, `analytics.ts`, a
// coverage helper or a Patterns panel reds the build.
//
// ── THE REGISTRY IS AN EXEMPTION (C-32) ──────────────────────────────────────
// `ALLOWED` below is not a list of files that touch visit data; it is a list of
// files EXCUSED from a prohibition. Adding a file here does not record that someone
// thought about it — it removes it from the boundary. Two consequences, both
// enforced below rather than trusted:
//
//   1. Every entry carries the reason it is excused, and a reason that is only "it
//      reads the table" is not one. Each says what KIND of reader it is.
//   2. Every entry must still HAVE a hit (`the registry has no stale entries`). A
//      file that stops touching visit data and keeps its exemption is a
//      pre-authorised hole for whatever lands in that file next.
//
// ── BY SHAPE, NOT BY BARE STRING (C-36, inverted) ────────────────────────────
// VV-0 seeded a rollout FLAG whose key is also the string `vet_visits`, so a
// bare-substring detector flags `lib/appConfig.ts`, `lib/betaFeatures.ts` and
// `app/settings/beta.tsx` — three files that read no table at all. C-36 measured the
// same collision in the other direction on the daily look. Allow-listing them would
// be the wrong fix twice over: it would excuse three files that need no excuse, and
// it would silently excuse a real read added to any of them later. So the detector
// matches the SHAPE of a read — a SQL clause or a PostgREST `.from()` — and the
// three flag files are asserted CLEAN as a measured property of the detector.
//
// ── WHAT IS NOT SCANNED ──────────────────────────────────────────────────────
// Test files and `guards/` itself. A guard's fixtures ARE the anti-pattern (C-18),
// held in template literals that no comment-blanker can tell from real code — and a
// test that reads a visit cannot leak one into a coverage line, because the risk
// class here is entirely about what the PRODUCT computes. `guards/lookNotes.test.ts`
// is the live proof: it holds a `.from('vet_visits')` in its own fixture data.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');

/** Every tree that ships product behaviour. `guards/` is deliberately absent. */
const SCAN_DIRS = [
  'app',
  'components',
  'lib',
  'store',
  'hooks',
  'constants',
  'widgets',
  'supabase/functions',
];

const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'dist']);

// ── The allow-set ────────────────────────────────────────────────────────────
//
// Every entry is a file EXCUSED from the prohibition above, with the kind of reader
// it is. Nothing here computes over visits: the set is substrate (schema, sync,
// wipe), the two vet-facing surfaces that are ABOUT visits, and the report's own
// window resolution.
const ALLOWED: Record<string, string> = {
  // ── Substrate: the tables exist, so something has to define and move them ──
  'lib/localSchema.ts':
    'DDL. Declares the local mirror of both tables and the derived wipe/upgrade sets. ' +
    'Defines columns; reads no row.',
  'lib/sync.ts':
    'The push and the hydrate for both tables, plus the two link columns on the ' +
    'medication and trial mirrors. Moves rows verbatim between devices and the ' +
    'server; computes nothing over them.',
  // NOT HERE, and it was on the first draft: `lib/hydration.ts`. It holds both table
  // names — in LOCAL_WIPE_TABLES, as bare strings in an array — and a comment about
  // the link column, and neither is a read. The staleness assertion below caught the
  // entry before this guard's first green run, which is the C-32 mechanism doing
  // exactly its job: an allow-set fills up with files someone considered unless
  // something makes each entry pay for itself.
  'lib/db.ts':
    'isLocalDataEmpty() — the cold-start overlay gate, and the ONE reader here that ' +
    'deliberately omits `deleted_at IS NULL`. It asks "does this device hold any ' +
    'rows at all?", not "what does the record say?", so a soft-deleted visit still ' +
    'counts as a populated store. Reasoned at the call site.',

  // ── The two provenance links: mappers only, no consumer ──
  'lib/medications.ts':
    'LocalMedication / RemoteMedicationUpsert carry vet_visit_id so the link can ' +
    'travel. A pure mapper — nothing in this file branches on it, and no dose count ' +
    'or course predicate reads it.',
  'lib/dietTrialMirror.ts':
    'LocalDietTrial / RemoteDietTrialUpsert carry vet_visit_id so the link can ' +
    'travel. A pure mapper — trial coverage, adherence and `started_at` are ' +
    'computed in lib/dietTrial.ts, which does not appear in this set.',

  // ── Surfaces that are ABOUT a visit ──
  'app/vet-visit.tsx':
    'The log-a-visit screen — it WRITES the vet_visits row and its attachments. ' +
    'The one surface whose subject is the visit itself.',
  'lib/rundown.ts':
    'readLastVisitDate — the vet-visit rundown is by definition anchored to the last ' +
    'visit. It reads the DATE to bound "what changed since then"; the visit ' +
    'contributes no row to any count in the rundown.',

  // ── Vet Files: a document may LINK to a visit (B-478 D7) ──
  'lib/vetDocumentDetail.ts':
    'VET_VISIT_OPTIONS_QUERY — the link picker, which must list the visits a ' +
    'document can be filed under. Reads visit identity (date, clinic) for display.',
  'lib/vetDocumentLibrary.ts':
    'Reads and writes vet_documents.vet_visit_id — the document→visit link. A ' +
    'document column, never a visit read.',
  'lib/vetDocumentCapture.ts':
    'Writes vet_documents.vet_visit_id (null on capture, per D7 — an upload never ' +
    'mints or dates a visit). A document column.',
  'lib/vetDocuments.ts':
    'The vet_documents row types, which include the vet_visit_id link column.',

  // ── The companion's own model (CUL-900 VV-2) ──
  'lib/vetVisits.ts':
    'The read/write model behind the Pet-tab card, the list, booking and the visit ' +
    'detail — the surfaces whose SUBJECT is the visit. It reads both tables and the ' +
    'three link columns, and that is the point: it is the ONE file the companion\'s ' +
    'screens read through, so components/vetvisits/ and app/vet-visits/ name neither ' +
    'table and never appear in this set. Its link reads are COUNTS OF CHILDREN (which ' +
    'courses, trials and documents name this visit) for the derived plan tags — the ' +
    'visit contributes no number of its own to any surface, and nothing here feeds a ' +
    'coverage line, a day count, Patterns or an engine input.',

  // ── The report ──
  'supabase/functions/generate-report/index.ts':
    'The scope cascade\'s rung 1 (§6): the report window may START at the last ' +
    'visit. That is the ONE sanctioned use of a visit as an input, it is a ' +
    'BOUNDARY rather than a count, and CUL-899 gave the pull `deleted_at IS NULL`. ' +
    'No visit is ever counted as a logged day.',
};

/**
 * Files this guard exists to keep OUT, named rather than left to the allow-set's
 * absence. The spec names the first two; the rest are every other surface that
 * computes a number over the record.
 *
 * Asserted to have ZERO hits, so a rename or a careless allow-set edit cannot
 * quietly cover them.
 */
const MUST_STAY_CLEAN = [
  'supabase/functions/generate-signal/detection.ts',
  'supabase/functions/generate-signal/phrasing.ts',
  'lib/analytics.ts',
  'lib/dietTrial.ts',
  'lib/lookDayCounts.ts',
  'lib/looks.ts',
  'supabase/functions/ask/index.ts',
];

/** The three VV-0 flag files. Not exemptions — a measured property of the detector. */
const FLAG_KEY_ONLY = ['lib/appConfig.ts', 'lib/betaFeatures.ts', 'app/settings/beta.tsx'];

/**
 * Files holding a PostgREST read whose table name is a VARIABLE.
 *
 * A separate registry from `ALLOWED` because it excuses a different thing: `ALLOWED`
 * says "this file may touch visit data"; this says "this file's table name cannot be
 * read off the page, and here is why it still cannot reach a visit table". A file
 * can need one, the other, or both.
 *
 * Every entry must justify the table name's PROVENANCE, not the file's purpose —
 * "it's the sync layer" is not a reason, "the name is a compile-time union and every
 * member is registered" is.
 */
const DYNAMIC_FROM_ALLOWED: Record<string, string> = {
  'lib/sync.ts':
    'pushRows/fetchAllRows take `table: QueueTable` — a compile-time string-literal ' +
    'union (lib/sync.ts), pinned against the real schema by syncQueue.test.ts. The ' +
    'name can only ever be a table this file already declares, and the file is in ' +
    'ALLOWED anyway.',
  // NOT HERE, and both were on the first draft — the staleness assertion below
  // rejected them before this detector's first green run, which is now the SECOND
  // time in one file that a registry entry turned out to record only that someone
  // had thought about the file (C-32):
  //   * `lib/syncQueue.ts` — its `.from(t)` is inside a COMMENT quoting the shape
  //     this module replaced. `blankComments` removes it; the module issues no query.
  //   * `lib/attachments.ts` — `supabase.storage.from(EVENT_ATTACHMENT_BUCKET)`, a
  //     bucket, already excluded by the pattern.
  // Neither needed an exemption, and registering them would have pre-authorised a
  // real dynamic read added to either file later.
  'lib/storage.ts':
    'supabase.storage.from(bucket) — the Storage API, not a table. It lands here ' +
    'rather than in the pattern exclusion because one call site writes ' +
    '`.storage\\n  .from(bucket)` across two lines, which the lookbehind cannot see. ' +
    'Registered, so a future `supabase.from(x)` in this file still has to say why.',
  'supabase/functions/delete-account/index.ts':
    'The deletion cascade iterates a hardcoded table list to purge storage paths. ' +
    'It is the one place that SHOULD reach every table, visits included — that is ' +
    'AC 12, and the probe verifies it leaves zero rows.',
  'supabase/functions/extract-medication-from-photo/index.ts':
    'A Storage bucket constant, not a table.',
};

// ── The detector ─────────────────────────────────────────────────────────────

const TABLES = '(?:vet_visits|vet_appointments)';

/**
 * A read or write of the table, by SHAPE. Both dialects the app speaks:
 * local SQLite (`FROM`/`INTO`/`UPDATE`/`JOIN`) and PostgREST (`.from('…')`).
 *
 * Anchored on a clause keyword rather than the bare name so the VV-0 flag key — the
 * same string, used as a config key and a switch case — is not a hit.
 */
const TABLE_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b(?:FROM|INTO|JOIN)\\s+${TABLES}\\b`, 'i'),
  new RegExp(`\\bUPDATE\\s+${TABLES}\\b`, 'i'),
  new RegExp(`\\.from\\(\\s*['"\`]${TABLES}['"\`]\\s*\\)`),
];

/** The link column. One spelling across all four tables — migration 066's header
 *  records that this guard is WHY the appointment's link is not called `visit_id`. */
const COLUMN_PATTERN = /\bvet_visit_id\b/;

/**
 * A PostgREST read whose TABLE NAME IS NOT A LITERAL — `.from(table)`, `.from(t)`,
 * `.from(step.name)`.
 *
 * The two detectors above cannot see these, and the VV-1 rls-privacy-reviewer
 * demonstrated the evasion: `const T = 'vet_visits'; sb.from(T)` planted in
 * `lib/dietTrial.ts` scored zero hits. It is not hypothetical either — `pushRows`
 * and `fetchAllRows` in `lib/sync.ts` are written in exactly this shape, so it is
 * the idiom a future generic `readTable(name)` helper would reach for.
 *
 * A dynamic `.from()` cannot be cleared by reading it, so a file containing one is a
 * file this guard cannot vouch for — it is registered in `DYNAMIC_FROM_ALLOWED` with
 * the reason its table name cannot reach a visit table. Measured before writing the
 * rule: SIX files in the product tree, and every one of them is sync/deletion
 * fabric. A rule that costs six entries is a rule; one that cost sixty would be a
 * scope error (C-33).
 *
 * `.storage.from(` is excluded because it is a different API entirely — a Storage
 * BUCKET, not a table. Left in, it would flag four files that touch no table at all.
 *
 * The JS built-ins are excluded for a blunter reason: `Array.from(new Set(xs))` and
 * `Buffer.from(s, 'utf8')` are `.from(` with a non-literal argument and have nothing
 * to do with a database. Caught by this file's own detector proofs on the first run
 * — which is the whole reason a guard states its exclusions as tests rather than as
 * confidence.
 */
const DYNAMIC_FROM_PATTERN =
  /(?<!\.storage|\bArray|\bBuffer|\bObject|\bDate|\bPromise|\bNumber|\bString)\.from\(\s*(?!['"`]|\))/;

export interface VisitReadFinding {
  readonly file: string;
  readonly kinds: readonly ('table' | 'column' | 'dynamic')[];
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
 * Every production file under `root` that reads or writes visit data.
 *
 * `root` is REQUIRED, never defaulted (guards/fixtureRoot.ts's rule): a default
 * silently re-points a forgetful self-test back at the real tree, which is the one
 * thing that would make the detector proofs below meaningless.
 */
export function scanVisitReaders(root: string): VisitReadFinding[] {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(root, d)));
  const findings: VisitReadFinding[] = [];
  for (const abs of files) {
    // Comments blanked line-preservingly and in ONE pass (C-18): a sentence ABOUT
    // the rule — and this codebase is full of them, because every one of the files
    // below explains why it may do this — is not evidence that the rule is broken.
    const src = blankComments(fs.readFileSync(abs, 'utf8'));
    const kinds: ('table' | 'column' | 'dynamic')[] = [];
    if (TABLE_PATTERNS.some((re) => re.test(src))) kinds.push('table');
    if (COLUMN_PATTERN.test(src)) kinds.push('column');
    if (DYNAMIC_FROM_PATTERN.test(src)) kinds.push('dynamic');
    if (kinds.length > 0) {
      findings.push({ file: path.relative(root, abs).split(path.sep).join('/'), kinds });
    }
  }
  return findings;
}

// ── The live scan ────────────────────────────────────────────────────────────

describe('AC 10 — visit data never reaches a count, a coverage line or an engine', () => {
  const findings = scanVisitReaders(ROOT);
  const found = new Set(findings.map((f) => f.file));

  it('the scan reaches the real tree and finds the substrate it must find', () => {
    // A NON-VACUITY FLOOR, asserted before any allow-set comparison (C-36). A broken
    // walker, a bad glob or a regex that matches nothing all produce ZERO findings —
    // and zero findings satisfy "nothing outside the allow-set" perfectly. Every
    // assertion below is meaningless without this one.
    expect(found.has('lib/sync.ts')).toBe(true);
    expect(found.has('lib/localSchema.ts')).toBe(true);
    expect(found.has('supabase/functions/generate-report/index.ts')).toBe(true);
    expect(findings.length).toBeGreaterThanOrEqual(10);
  });

  it('SCAN_DIRS covers every directory that ships product code', () => {
    // The floor above names files in `lib/`, `supabase/` and (via the staleness
    // assertion) `app/` — so it proves the walker RUNS, not that it walks what it
    // claims. The VV-1 rls-privacy-reviewer demonstrated the gap: delete
    // 'components' from SCAN_DIRS and the suite is green over a real planted
    // violation in `components/home/`. That is the C-36 vacuity mode one level up.
    //
    // ⚠ AND THE FIRST FIX FOR IT DID NOT WORK, which is the reason this comment is
    // long. Iterating SCAN_DIRS and asserting each entry is walked is ALSO green
    // under that mutation — un-declaring a directory simply removes it from the
    // loop. A floor derived from the thing it is checking cannot catch the thing
    // being removed. (Proven: planted the violation, dropped 'components', 25/25
    // passed.)
    //
    // So the expected set is DERIVED FROM THE REPOSITORY instead: every top-level
    // directory that actually holds non-test TypeScript must be scanned, unless it
    // is named here as deliberately out of scope. That catches both directions — a
    // scanned directory quietly dropped, AND a brand-new product directory nobody
    // thought to add.
    const OUT_OF_SCOPE = new Set([
      'guards', // a guard's fixtures ARE the anti-pattern (C-18) — see the header
      'scripts', // service-role operator SQL/TS, not shipped; CUL-739 owns its scoping
      'testUtils', // test scaffolding, never bundled
      'docs', // one stray .ts in a doc example
      'node_modules',
      'ios',
      'android',
      '.expo',
    ]);

    const productDirs = fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .filter((name) => !OUT_OF_SCOPE.has(name))
      .filter((name) => walk(path.join(ROOT, name)).length > 0);

    // `supabase/functions` is declared at its nested path, so match on the root segment.
    const scannedRoots = new Set(SCAN_DIRS.map((d) => d.split('/')[0]));
    expect(productDirs.filter((d) => !scannedRoots.has(d))).toEqual([]);

    // And every declared directory must still exist and hold files — a renamed or
    // emptied entry is a silent hole in the other direction.
    for (const dir of SCAN_DIRS) {
      expect(fs.existsSync(path.join(ROOT, dir))).toBe(true);
      expect(walk(path.join(ROOT, dir)).length).toBeGreaterThan(0);
    }
  });

  it('no file outside the allow-set reads visit data', () => {
    const unexpected = findings.filter(
      (f) => f.kinds.some((k) => k !== 'dynamic') && !(f.file in ALLOWED),
    );
    // Printed with the kind, so a failure says what to do: a `column` hit on a new
    // file is usually a link being consumed; a `table` hit is usually a new query.
    expect(unexpected.map((f) => `${f.file} (${f.kinds.join('+')})`)).toEqual([]);
  });

  it('no file reads a table through a VARIABLE without saying why it is safe', () => {
    // The evasion the rls-privacy-reviewer proved: `const T = 'vet_visits';
    // sb.from(T)` is invisible to both literal detectors. A dynamic name cannot be
    // cleared by reading it, so the file has to be registered with the provenance of
    // its table name.
    const unexplained = findings
      .filter((f) => f.kinds.includes('dynamic'))
      .map((f) => f.file)
      .filter((f) => !(f in DYNAMIC_FROM_ALLOWED));
    expect(unexplained).toEqual([]);
  });

  it('the dynamic registry has no stale entries either', () => {
    const dynamicFiles = new Set(
      findings.filter((f) => f.kinds.includes('dynamic')).map((f) => f.file),
    );
    expect(Object.keys(DYNAMIC_FROM_ALLOWED).filter((f) => !dynamicFiles.has(f))).toEqual([]);
  });

  it('the registry has no stale entries — an exemption is not a note (C-32)', () => {
    // The other edge of the same mechanism. A registered file is SKIPPED by the
    // prohibition, so one that no longer touches visit data is a pre-authorised hole
    // sitting in front of whatever lands in that file next.
    const stale = Object.keys(ALLOWED).filter((f) => !found.has(f));
    expect(stale).toEqual([]);
  });

  it('every allowed file states what KIND of reader it is', () => {
    // "It reads the table" is not a reason — it is the thing being excused.
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(`${file}: ${reason}`.length).toBeGreaterThan(file.length + 60);
    }
  });

  it('the engine, the analytics and the count helpers are clean, by name', () => {
    // Named rather than left to the allow-set's absence: absence is also what a
    // deleted file, a renamed file and a typo look like.
    for (const file of MUST_STAY_CLEAN) {
      expect(found.has(file)).toBe(false);
      expect(Object.keys(ALLOWED)).not.toContain(file);
    }
  });

  it('every named clean file actually exists', () => {
    // Without this, MUST_STAY_CLEAN degrades into a list of paths that are clean
    // because nothing is there — the C-36 vacuity failure, one level down.
    for (const file of MUST_STAY_CLEAN) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });

  it('the VV-0 flag key is not mistaken for the table (C-36, inverted)', () => {
    // `vet_visits` is a rollout-flag key as well as a table name. These three files
    // hold the key and read no row, so they must be clean WITHOUT an exemption —
    // which is what keeps a real read added to any of them tomorrow a build failure.
    for (const file of FLAG_KEY_ONLY) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
      expect(found.has(file)).toBe(false);
      expect(Object.keys(ALLOWED)).not.toContain(file);
    }
  });
});

// ── The detector, proven (C-18) ──────────────────────────────────────────────
//
// A guard that has only ever been green has not been tested. Fixtures live OUTSIDE
// the repository (CUL-712) so a parallel worker's scan can never pick them up, and
// `scanVisitReaders` takes the root as a required parameter so these point at the
// fixture tree rather than the real one.

describe('the detector itself', () => {
  let root = '';

  beforeEach(() => {
    root = createFixtureRoot('visit-readers', ['lib', 'supabase/functions/generate-signal']);
  });

  afterEach(() => {
    removeFixtureRoot(root);
    root = '';
  });

  const hits = () => scanVisitReaders(root).map((f) => `${f.file} (${f.kinds.join('+')})`);

  it('FLAGS a SELECT added to the detection engine — the case AC 10 names', () => {
    writeFixture(
      root,
      'supabase/functions/generate-signal/detection.ts',
      `const rows = await sql("SELECT visited_at FROM vet_visits WHERE pet_id = ?");`,
    );
    expect(hits()).toEqual(['supabase/functions/generate-signal/detection.ts (table)']);
  });

  it('FLAGS a PostgREST read of either table', () => {
    writeFixture(root, 'lib/a.ts', `await sb.from('vet_appointments').select('*')`);
    expect(hits()).toEqual(['lib/a.ts (table)']);
  });

  it('FLAGS a coverage helper that JOINS visits into a day count', () => {
    // The CUL-891 shape, which is the reason this guard exists at all.
    writeFixture(
      root,
      'lib/coverage.ts',
      `const q = "SELECT COUNT(DISTINCT d) FROM events e JOIN vet_visits v ON v.pet_id = e.pet_id";`,
    );
    expect(hits()).toEqual(['lib/coverage.ts (table)']);
  });

  it('FLAGS a consumer of the link column', () => {
    writeFixture(root, 'lib/b.ts', `const fromVisit = trials.filter((t) => t.vet_visit_id);`);
    expect(hits()).toEqual(['lib/b.ts (column)']);
  });

  it('FLAGS an INSERT and an UPDATE, not only a read', () => {
    writeFixture(root, 'lib/c.ts', `await db.runAsync("UPDATE vet_visits SET notes = ?")`);
    expect(hits()).toEqual(['lib/c.ts (table)']);
  });

  it('IGNORES the VV-0 flag key in every shape it actually appears in', () => {
    // The measured collision, driven rather than asserted about: the registry row,
    // the switch case and the allowlist-key array from lib/betaFeatures.ts,
    // app/settings/beta.tsx and lib/appConfig.ts.
    writeFixture(
      root,
      'lib/flags.ts',
      [
        `const KEYS = ['vet_visits', 'daily_look'] as const;`,
        `const REGISTRY = [{ key: 'vet_visits', title: 'Vet visits', serverCost: false }];`,
        `switch (k) { case 'vet_visits': return 'stethoscope'; }`,
        `const on = useAllowlistFlag('vet_visits') && useBetaOptIn('vet_visits');`,
      ].join('\n'),
    );
    expect(hits()).toEqual([]);
  });

  it('IGNORES a mention inside a comment, however exactly it is spelled', () => {
    // Every allowed file below explains itself in prose, and several quote the very
    // query they are excused for. A blanker that missed one would make the allow-set
    // look necessary where it is not.
    writeFixture(
      root,
      'lib/d.ts',
      [
        `// Never SELECT visited_at FROM vet_visits here — see guards/visitReaders.`,
        `/* and nothing may read vet_visit_id either */`,
        `export const X = 1;`,
      ].join('\n'),
    );
    expect(hits()).toEqual([]);
  });

  it('does NOT accept a commented-out read as cover for a real one', () => {
    // The inverse of the test above, and the one that matters: blanking must not be
    // reachable as a hiding place.
    writeFixture(
      root,
      'lib/e.ts',
      [`// await sb.from('vet_visits')`, `await sb.from('vet_visits').select('id')`].join('\n'),
    );
    expect(hits()).toEqual(['lib/e.ts (table)']);
  });

  it('IGNORES an unrelated table whose name merely contains one of ours', () => {
    // `vet_visit_attachments` is a real, differently-scoped table (photos of a
    // visit), and `FROM vet_visits` must not match `FROM vet_visit_attachments`.
    writeFixture(root, 'lib/f.ts', `await db.getAllAsync("SELECT * FROM vet_visit_attachments")`);
    expect(hits()).toEqual([]);
  });

  it('IGNORES a test file, and a file outside the scanned trees', () => {
    writeFixture(root, 'lib/g.test.ts', `await sb.from('vet_visits').select('id')`);
    writeFixture(root, 'scripts/h.ts', `await sb.from('vet_visits').select('id')`);
    expect(hits()).toEqual([]);
  });

  it('reports BOTH kinds when a file does both', () => {
    writeFixture(
      root,
      'lib/i.ts',
      `await sb.from('vet_visits').select('id'); const l = row.vet_visit_id;`,
    );
    expect(hits()).toEqual(['lib/i.ts (table+column)']);
  });

  // ── The dynamic detector (the rls-privacy-reviewer's evasion) ──────────────

  it('FLAGS the const-indirection evasion that defeated the literal detectors', () => {
    // Verbatim the shape the reviewer planted in lib/dietTrial.ts and scored zero on.
    writeFixture(
      root,
      'lib/j.ts',
      [`const T = 'vet_visits';`, `const rows = await sb.from(T).select('visited_at');`].join('\n'),
    );
    expect(hits()).toEqual(['lib/j.ts (dynamic)']);
  });

  it('FLAGS a generic table helper — the shape a coverage module would use', () => {
    writeFixture(
      root,
      'lib/k.ts',
      `export async function readTable(name: string) { return sb.from(name).select('*'); }`,
    );
    expect(hits()).toEqual(['lib/k.ts (dynamic)']);
  });

  it('IGNORES a Storage bucket read — a different API, not a table', () => {
    writeFixture(root, 'lib/l.ts', `await supabase.storage.from(bucket).createSignedUrl(p, 60)`);
    expect(hits()).toEqual([]);
  });

  it('IGNORES Array.from and a literal .from(), which are not dynamic table reads', () => {
    writeFixture(
      root,
      'lib/m.ts',
      [`const xs = Array.from(new Set(ys));`, `const q = Buffer.from(s, 'utf8');`].join('\n'),
    );
    expect(hits()).toEqual([]);
  });
});

// ── Limits this guard does NOT close, stated rather than left to be discovered ──
//
// The VV-1 rls-privacy-reviewer ran eight evasions against this file. The dynamic
// detector above closes the one that mattered most. These are the ones that remain,
// written down because a guard whose blind spots are undocumented reads as stronger
// than it is — which is how the next author comes to rely on it for something it
// never checked:
//
//   1. STRING CONCATENATION — `'SELECT … FROM ' + 'vet_' + 'visits'`, or a template
//      literal with the table in an interpolation. Not closed, and not worth closing
//      with a regex: the honest tool is a TS AST pass with constant folding, which is
//      a different guard. Nothing in the tree builds a table name this way today.
//
//   2. A SCHEMA-QUALIFIED raw read — `FROM public.vet_visits`. Currently theoretical:
//      no Edge Function runs raw SQL (the only `rpc()` call in the tree is
//      `record_ai_usage`), and the local SQLite dialect has no schemas. It would be
//      one more alternation in TABLE_PATTERNS the day that changes.
//
//   3. A TRANSITIVE CONSUMER — importing a visit-reading helper out of an
//      allow-listed file and using its result in a count. This is C-11 verbatim ("a
//      transitive consumer is invisible to the scan"). Measured today: the allow-set
//      exports exactly one thing that carries visit data, `VET_VISIT_OPTIONS_QUERY`
//      (a query STRING, whose consumers are themselves scanned because using it means
//      calling `db.getAllAsync`). `lib/rundown.ts`'s `readLastVisitDate` is NOT
//      exported — the reviewer's specific example does not compile — so the hole is
//      narrower than reported, but the CLASS is real and it opens the moment VV-2
//      exports its first `listAppointments()`. The rule for VV-2, stated here because
//      that is when it will be needed: a helper that returns visit data is exported
//      from an allow-listed file ONLY if its own callers are scanned too.
//
//   4. An `rpc()` to a server function that reads visits. No such function exists.
