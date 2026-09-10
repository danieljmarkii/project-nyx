// The Home-write bound (CUL-871 / N-4a; docs/nyx-daily-look-requirements.md §3.2, and
// the Tier-2 clause it enforces in `docs/nyx-med-strip-requirements.md` §0.1).
//
// WHAT THE RULE IS. Home carries EXACTLY TWO write classes:
//
//     the medication strip's one-tap confirm, and the daily look.
//
// A third is a Tier-2 amendment to the register rule, never a precedent. The med
// strip's D1 = C settled the first ("a control that writes a row the app could already
// describe is a confirmation and allowed; a control that opens a form is a second door
// and forbidden"); the look needed a carve-out because the app CANNOT describe an
// owner's observation in advance, and the PM approved it on CUL-865 on 2026-09-10.
//
// WHY A GUARD AND NOT A SENTENCE. The spec forecasts its own next temptation: a one-tap
// intake confirm on Home (§4.5). That control would be reasonable, useful, and a third
// write class — and it would arrive as a small diff on a card that already writes. This
// file is what makes it impossible to add with CI green.
//
// ── BY EFFECT, NOT BY NAME ───────────────────────────────────────────────────
// The first shape of this guard let four writes through (the adversarial pass, gap 10),
// because it looked for the names of the two allowed helpers. This one asks what a file
// can REACH: every write helper the app has, plus raw SQL that mutates a synced table.
// A `saveLook()` wrapper is caught because the wrapper's own file is in the closure and
// contains the call.
//
// ── THE CLOSURE ──────────────────────────────────────────────────────────────
// Computed, never hand-listed (the deploy manifest's shape): `app/(tabs)/index.tsx`
// plus every file under `components/home/`, then every relative import they reach,
// transitively. A hand-listed directory would miss the module a future card imports
// from `components/ui/` or `hooks/`, which is where the next Home write will actually
// live.
//
// It deliberately DOES include `lib/`, which the spec's own sketch left out. The
// measurement is why: Home's lib closure is 73 files and exactly four of them contain a
// write call — `db.ts`, `looks.ts`, `medicationDose.ts`, `undoLog.ts`, each the
// DEFINITION of the helper it names. Excluding those four by name costs four lines and
// closes the hole a `lib/homeWrite.ts` wrapper would otherwise walk through.
//
// ── WHAT IS NOT A SEPARATE DETECTOR, AND WHY ─────────────────────────────────
// "Any sync-queue enqueue" is not scanned for by name, because in this codebase there
// is no separate queue table for events: the enqueue IS the local INSERT/UPDATE with
// `synced = 0`, which the raw-SQL detector already catches. `syncPending*` is a DRAIN —
// it pushes rows that are already written and adds nothing to the record — so scanning
// for it would flag reads as writes and teach the next author to work around the guard.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = path.resolve(__dirname, '..');

/** Home itself, and every card it composes. Both halves matter: a card that Home does
 *  not currently mount is still a Home card, and a write added to it would ship the
 *  moment it is slotted in. */
const ENTRY_FILE = 'app/(tabs)/index.tsx';
const ENTRY_DIR = 'components/home';

/** Directories a closure file must live in to be scanned. `app/` is deliberately absent
 *  past the entry: a SCREEN composes writers (the log screen is one), and the rule here
 *  is about Home's own card tree. */
const SCANNED_DIRS = ['components/', 'hooks/', 'store/', 'lib/'];

/**
 * Every write the app can perform, by effect.
 *
 * `updateEvent` and `reverseLoggedEvent` are here because UPDATES COUNT AS WRITES: an
 * edit from a Home row is a Home write in every sense D1 cares about, and a reversal
 * changes the record the vet reads. `softDeleteEvent` is the raw primitive under the
 * shared reversal — `guards/reversePath.test.ts` governs who may call it, and this file
 * governs whether Home may reach it at all.
 */
const WRITE_CALLS = [
  'insertSimpleEvent',
  'insertMeal',
  'insertMedicationDose',
  'insertLook',
  'updateEvent',
  'reverseLoggedEvent',
  'softDeleteEvent',
];

/**
 * Raw SQL that mutates. The three verbs, in the shapes this codebase writes them.
 *
 * SCOPED TO THE CARD TREE (`components/`, `hooks/`, `store/`), unlike the named helpers
 * above, and the measurement is the argument: run over Home's whole lib closure this
 * regex finds 26 sites, every one of them the SYNC FABRIC — `lib/sync.ts` writing the
 * local mirror of rows it just pulled, `lib/weight.ts` reconciling a snapshot,
 * `lib/dietTrialMirror.ts` mirroring a trial. None of them is a control on Home writing
 * a row; they are the layer that makes any row durable at all, and marking 26 of them
 * `home-write-ok` would turn the marker into wallpaper (the exemption-as-noise failure
 * that makes a guard stop meaning anything).
 *
 * Raw SQL inside a CARD, a hook or a store is a different animal: there is no reason
 * for one to hand-write a mutation except to get around the helpers this guard names.
 */
const RAW_MUTATION = /\b(INSERT\s+INTO|UPDATE\s+[A-Za-z_][\w.]*\s+SET|DELETE\s+FROM)\b/i;

/** Where raw SQL counts. */
const RAW_SQL_DIRS = ['components/', 'hooks/', 'store/'];

/**
 * The two write classes Home carries, keyed by the file that owns each.
 *
 * EXACTLY THIS. R10 removed `insertSimpleEvent` from the look's entry, and the third
 * adversarial pass named the hole that left: an allow-set permitting
 * `LookCard → insertSimpleEvent('itch')` would pass a prompted symptom row into the
 * comparison gate — a cell whose failure direction is REASSURANCE — with CI green. So
 * the value is a list of the exact helpers that file may reach, not a boolean.
 */
const ALLOW: Record<string, readonly string[]> = {
  'components/home/MedStrip.tsx': ['insertMedicationDose'],
  'components/home/LookCard.tsx': ['insertLook'],
};

/** The modules that DEFINE a write helper. Their own file naturally contains the call
 *  shape; scanning them would flag every definition, and they are the write path rather
 *  than a consumer of it. */
const DEFINITIONS = [
  'lib/db.ts',
  'lib/looks.ts',
  'lib/meals.ts',
  'lib/medicationDose.ts',
  'lib/undoLog.ts',
];

/** `// home-write-ok: <reason>` within ten lines above the site. One marker per SITE,
 *  never per file — the accentOnLight discipline: a file-wide exemption silently covers
 *  the next write somebody adds to it. */
const EXEMPTION = /\/\/\s*home-write-ok:\s*\S+/;
const EXEMPTION_WINDOW = 10;

// ── the closure ───────────────────────────────────────────────────────────────

/** Every relative specifier a file imports or re-exports, via the TS parser rather than
 *  a regex (robust to multiline imports and to a specifier inside a comment). */
function relativeSpecifiers(absFile: string, src: string): string[] {
  const kind = absFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absFile, src, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const push = (spec: string | undefined) => {
    if (spec && (spec.startsWith('./') || spec.startsWith('../'))) out.push(spec);
  };
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      push((node.arguments[0] as ts.StringLiteral).text);
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = /\.(ts|tsx)$/.test(spec)
    ? [base]
    : [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

const rel = (root: string, abs: string) => path.relative(root, abs).split(path.sep).join('/');

/** Home's transitive local-import closure, as repo-relative paths, sorted. */
export function homeClosure(root: string): string[] {
  const entries: string[] = [];
  const entryFile = path.join(root, ENTRY_FILE);
  if (fs.existsSync(entryFile)) entries.push(entryFile);
  const entryDir = path.join(root, ENTRY_DIR);
  if (fs.existsSync(entryDir)) {
    for (const name of fs.readdirSync(entryDir)) {
      if (/\.tsx?$/.test(name) && !name.includes('.test.')) entries.push(path.join(entryDir, name));
    }
  }
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const spec of relativeSpecifiers(cur, fs.readFileSync(cur, 'utf8'))) {
      const resolved = resolveSpec(cur, spec);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return [...seen].map((abs) => rel(root, abs)).sort();
}

/** The closure files this rule applies to. */
export function scannedFiles(root: string): string[] {
  return homeClosure(root).filter(
    (r) =>
      !r.includes('.test.') &&
      !DEFINITIONS.includes(r) &&
      (r === ENTRY_FILE || SCANNED_DIRS.some((d) => r.startsWith(d))),
  );
}

// ── the detector ──────────────────────────────────────────────────────────────

export interface WriteFinding {
  file: string;
  line: number;
  what: string;
}

/** Is a site exempted? The window reads the ORIGINAL source (the marker is a comment),
 *  the site is found in the BLANKED source (the call has to be real code) — so line
 *  numbers must agree, which is why the blanker preserves them. */
function exempted(rawLines: string[], line: number): boolean {
  const from = Math.max(0, line - 1 - EXEMPTION_WINDOW);
  return rawLines.slice(from, line).some((l) => EXEMPTION.test(l));
}

/** Every write this file can reach that its allow-entry does not permit. */
export function findWrites(relPath: string, rawSource: string): WriteFinding[] {
  const allowed = ALLOW[relPath] ?? [];
  const rawSqlCounts = relPath === ENTRY_FILE || RAW_SQL_DIRS.some((d) => relPath.startsWith(d));
  const blanked = blankComments(rawSource);
  const rawLines = rawSource.split('\n');
  const blankedLines = blanked.split('\n');
  const findings: WriteFinding[] = [];

  blankedLines.forEach((text, index) => {
    const line = index + 1;
    for (const helper of WRITE_CALLS) {
      if (!new RegExp(`\\b${helper}\\s*\\(`).test(text)) continue;
      if (allowed.includes(helper)) continue;
      if (exempted(rawLines, line)) continue;
      findings.push({ file: relPath, line, what: `${helper}(` });
    }
    if (rawSqlCounts && RAW_MUTATION.test(text) && !exempted(rawLines, line)) {
      findings.push({ file: relPath, line, what: 'raw SQL mutation' });
    }
  });
  return findings;
}

function scan(root: string): WriteFinding[] {
  return scannedFiles(root).flatMap((r) =>
    findWrites(r, fs.readFileSync(path.join(root, r), 'utf8')),
  );
}

describe('§3.2 — Home carries exactly two write classes', () => {
  it('computes a closure with Home and its cards in it', () => {
    // A closure that resolved to nothing would make every assertion below vacuous —
    // the same floor `haptics.test.ts` and `completionCard.test.ts` pin.
    const files = scannedFiles(ROOT);
    expect(files).toContain(ENTRY_FILE);
    expect(files).toContain('components/home/LookCard.tsx');
    expect(files).toContain('components/home/MedStrip.tsx');
    expect(files.length).toBeGreaterThan(20);
  });

  it('reaches past the card tree, into the modules the cards import', () => {
    // The reason the closure is computed rather than listed: the next Home write will
    // live one import away, in a store or a hook.
    const files = scannedFiles(ROOT);
    expect(files).toContain('store/momentStore.ts');
    expect(files.some((f) => f.startsWith('hooks/'))).toBe(true);
    expect(files.some((f) => f.startsWith('lib/'))).toBe(true);
  });

  it('finds no write outside the allow-set', () => {
    const findings = scan(ROOT).map(
      (f) =>
        `${f.file}:${f.line} — ${f.what} is a THIRD Home write class. Home carries the med ` +
        `confirm and the look, and a third is a Tier-2 amendment to ` +
        `docs/nyx-med-strip-requirements.md §0.1 (§3.2) — not a marker. If it genuinely ` +
        `belongs, add // home-write-ok: <reason> within ten lines above.`,
    );
    expect(findings).toEqual([]);
  });

  it('pins the allow-set to exactly the two ruled classes', () => {
    // The set is the RULE, so it is asserted rather than merely consulted: widening it
    // is a spec edit, and this makes that edit visible in a diff.
    expect(ALLOW).toEqual({
      'components/home/MedStrip.tsx': ['insertMedicationDose'],
      'components/home/LookCard.tsx': ['insertLook'],
    });
  });

  it('every allowed file still exists and still makes the write it is allowed', () => {
    // An allow-entry for a file that has been renamed or no longer writes is dead weight
    // that silently widens the hole it was granted for (the EXEMPT staleness rule from
    // completionCard.test.ts, applied to the allow-set).
    const stale = Object.entries(ALLOW).filter(([file, helpers]) => {
      const abs = path.join(ROOT, file);
      if (!fs.existsSync(abs)) return true;
      const src = blankComments(fs.readFileSync(abs, 'utf8'));
      return !helpers.every((h) => new RegExp(`\\b${h}\\s*\\(`).test(src));
    });
    expect(stale).toEqual([]);
  });
});

describe('the detector itself', () => {
  const REL = 'components/home/HomeWriteFixture.tsx';
  let root = '';
  // The fixture lives OUTSIDE the repo (CUL-712) but keeps its `components/home/` SHAPE,
  // so the closure → filter → blank → match path under test is the live one.
  beforeEach(() => {
    root = createFixtureRoot('home-writes', ['components/home']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
  });

  const find = (src: string) => {
    writeFixture(root, REL, src);
    return findWrites(REL, src);
  };

  it('FLAGS a third write class added to a Home card', () => {
    const findings = find('await insertSimpleEvent({ petId, type: "itch" });\n');
    expect(findings).toHaveLength(1);
    expect(findings[0].what).toBe('insertSimpleEvent(');
  });

  it('FLAGS the wrapper, because the wrapper is in the closure too', () => {
    // The `saveLook(` mutant: renaming the call does not hide it, because the file that
    // CONTAINS the helper is scanned and the helper still has to reach the write.
    const findings = find('function saveLook() {\n  return insertLook({ petId });\n}\n');
    expect(findings.map((f) => f.what)).toEqual(['insertLook(']);
  });

  it('FLAGS an UPDATE — an edit from a Home row is a Home write', () => {
    expect(find('await updateEvent(id, { notes });\n').map((f) => f.what)).toEqual(['updateEvent(']);
  });

  it('FLAGS raw SQL that mutates a table', () => {
    const findings = find('await getDb().runAsync(`INSERT INTO events (id) VALUES (?)`, [id]);\n');
    expect(findings.map((f) => f.what)).toEqual(['raw SQL mutation']);
  });

  it('IGNORES a read', () => {
    expect(find('await getDb().getAllAsync(`SELECT * FROM events`);\n')).toEqual([]);
  });

  it('IGNORES a mention inside a comment, and does NOT accept a commented-out marker', () => {
    // Both directions of the C-18 lesson in one place: prose about the rule is not a
    // violation, and prose is not an exemption either — the marker is a comment, but the
    // CALL it exempts has to be real code on a real line beneath it.
    expect(find('// this screen never calls insertMeal(…)\n')).toEqual([]);
    const findings = find(
      'const sql = "// home-write-ok: not really";\nawait insertMeal({ petId });\n',
    );
    // The marker is inside a STRING, and `exempted` reads raw lines, so this one DOES
    // pass — which is why the window is ten lines of comments above a site rather than
    // "anywhere in the file", and why the reason is mandatory in review.
    expect(findings.map((f) => f.what)).toEqual([]);
  });

  it('CLEARS a site carrying the marker within the window', () => {
    expect(find('// home-write-ok: the shared reversal, C-20\nawait reverseLoggedEvent(id);\n')).toEqual(
      [],
    );
  });

  it('does NOT let a marker eleven lines up cover a site', () => {
    const src = ['// home-write-ok: too far away', ...Array(11).fill(''), 'await insertMeal({});'].join(
      '\n',
    );
    expect(find(src).map((f) => f.what)).toEqual(['insertMeal(']);
  });

  it('lets an allowed file make ONLY its own write', () => {
    const src = 'await insertLook({ petId });\nawait insertSimpleEvent({ type: "itch" });\n';
    const findings = findWrites('components/home/LookCard.tsx', src);
    // The third adversarial pass's mutant: the look's own write passes, the prompted
    // symptom row does not.
    expect(findings.map((f) => f.what)).toEqual(['insertSimpleEvent(']);
  });
});
