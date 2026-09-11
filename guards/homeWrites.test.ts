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

/**
 * Directories a closure file must live in to be scanned.
 *
 * `app/` and `constants/` are in the list, and neither was in the first cut — which two
 * independent reviews walked through: a helper in `app/homeWrites/confirm.ts` calling
 * `insertMeal`, and the observation that `homeClosure` already REACHES
 * `constants/lookWords.ts` while `scannedFiles` filtered it back out. "By effect, not by
 * name" had failed on the one axis the mutants did not test: LOCATION. Only files Home's
 * closure actually reaches are scanned either way, so this widens what the guard sees
 * without widening what it walks.
 */
const SCANNED_DIRS = ['components/', 'hooks/', 'store/', 'lib/', 'app/', 'constants/'];

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
  // CUL-873 — the `looks` child's two UPDATE doors, and they were missing. The list
  // already carried `updateEvent` under the sentence above ("UPDATES COUNT AS WRITES"),
  // but the note lives on `looks.notes` and reaches it through a different helper, so N-4b
  // could add a Home control that writes a synced table with this guard green. Found by
  // reading the guard rather than the sentence about it (C-32), on the PR that became its
  // first caller — which is the only moment the omission is cheap.
  'updateLookNote',
  'updateLookForEdit',
  'reverseLoggedEvent',
  'softDeleteEvent',
  // CUL-901 — the regimen write path, registered the PR it SHIPS (C-32: a rule added
  // after the first caller is a rule added after the bug). VV-3 gave `medications` a
  // local-first writer, and VV-4's after-visit screen is about to start courses from
  // a plan row. The Home medication strip already writes DOSES against a course the
  // app can describe (D1 = C); a control that CREATES the course is the "second door"
  // D1 forbids, and it would arrive as a small diff on a card that already writes.
  'startRegimen',
  'updateRegimen',
  'endRegimen',
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
  // `updateLookNote` is INSIDE the look's own class, not a third one, and the distinction
  // is worth stating because the note opens a field and D1's forbidden shape is "a control
  // that opens a form" (CUL-873, T-22 / R16, PM-ruled on round 4).
  //
  // What makes it the same class: it writes to the look's OWN row, on the entry the owner
  // has just this second made, creating no record the app did not already hold and
  // touching no other table. D1's second door is a control that starts a NEW record from
  // Home; this one annotates the one that just landed, after the save, and never before it
  // (Principle 1: nothing on the way IN asks for typing).
  //
  // It is named rather than assumed because the value is a list of exact helpers and not a
  // boolean — the third adversarial pass's own reason: an allow-set that said "LookCard
  // may write" would also permit `insertSimpleEvent('itch')`.
  'components/home/LookCard.tsx': ['insertLook', 'updateLookNote'],
};

/**
 * THE WRITE PATH ITSELF — the modules that make a row durable, and what each may reach.
 *
 * Two kinds sit here for one reason: neither is a control on Home, both are the layer a
 * control goes THROUGH, and both are where the app's raw SQL legitimately lives.
 *
 *   • the DEFINITION of a write helper (`lib/looks.ts` declares `insertLook`), and
 *   • the SYNC FABRIC (`lib/sync.ts` writing the mirror of rows it just pulled).
 *
 * The value is the set of helpers that module may reach — NOT a blanket skip, which is
 * what the first cut had. The adversarial pass found the difference: it put
 * `insertSimpleEvent({type:'itch'})` INSIDE `insertLook` in `lib/looks.ts` (CUL-845's
 * exact shape), and the guard reported it against `lib/simpleEvent.ts` — that helper's
 * own declaration — so the obvious repair was to skip THAT file, which turned the suite
 * green over the live violation. A failure message that teaches the fix that hides the
 * bug is worse than no message. Per-helper, each module is silent about the writes it
 * owns and loud about every other one in it.
 *
 * Raw SQL is exempt here and NOWHERE ELSE. That replaces the first cut's directory rule
 * (`components/`, `hooks/`, `store/`), which the adversarial pass walked straight
 * through with a `lib/homeIntakeConfirm.ts` holding a raw `INSERT INTO events`, called
 * from a Home chip: the suite stayed green while *Nothing unusual* wrote a meal row on
 * every tap. The measurement behind the directory rule was real — 26 sites, all of them
 * in this list — but the conclusion was one step too coarse. Named modules with reasons
 * are a decision; a directory is a blind spot.
 *
 * Adding to this list is the same act as adding to the allow-set: say why.
 */
const WRITE_PATH: Record<string, { helpers: readonly string[]; why: string }> = {
  'lib/db.ts': {
    helpers: ['updateEvent', 'softDeleteEvent'],
    why: 'declares both, and holds the events table\u2019s own statements',
  },
  'lib/looks.ts': {
    helpers: ['insertLook', 'updateLookNote', 'updateLookForEdit'],
    why: 'declares insertLook and the two edit doors onto the looks child (CUL-873)',
  },
  'lib/meals.ts': { helpers: ['insertMeal'], why: 'declares insertMeal' },
  'lib/medicationDose.ts': {
    helpers: ['insertMedicationDose'],
    why: 'declares insertMedicationDose',
  },
  'lib/simpleEvent.ts': { helpers: ['insertSimpleEvent'], why: 'declares insertSimpleEvent' },
  'lib/undoLog.ts': {
    helpers: ['reverseLoggedEvent', 'softDeleteEvent'],
    why: 'declares the ONE shared reversal, whose implementation is softDeleteEvent (C-20)',
  },
  'lib/sync.ts': {
    helpers: [],
    why: 'the queue drains and the hydration mirror \u2014 this IS the durable-write layer',
  },
  'lib/weight.ts': {
    helpers: [],
    why: 'the weight snapshot reconcile, called from the shared reversal',
  },
  'lib/dietTrialSetup.ts': { helpers: [], why: 'trial setup writes; Home only reads it' },
  'lib/medicationSetup.ts': {
    helpers: ['startRegimen', 'updateRegimen', 'endRegimen'],
    why: 'declares all three (CUL-901); regimen setup writes, Home only reads the courses',
  },
  'lib/dietTrialMirror.ts': { helpers: [], why: 'the trial mirror, written by the sync layer' },
  'lib/feedingArrangements.ts': {
    helpers: [],
    why: 'the arrangements mirror, written by the sync layer',
  },
};

/** `// home-write-ok: <reason>` within ten lines above the site. One marker per SITE,
 *  never per file — the accentOnLight discipline: a file-wide exemption silently covers
 *  the next write somebody adds to it. */
const EXEMPTION = /\/\/\s*home-write-ok:\s*\S+/;
const EXEMPTION_WINDOW = 10;

// ── the closure ───────────────────────────────────────────────────────────────

/**
 * Every tracked write helper this file IMPORTS, by the name at the source rather than the
 * name it is bound to locally.
 *
 * This is what makes the scan an effect scan rather than a text scan, and it closes the
 * bypass the code review proved: `import { insertMeal as _x }` followed by `_x({...})`
 * leaves the string `insertMeal(` nowhere in the file. No attacker is needed — an
 * ordinary rename does it. A file that imports a write helper has reached it, whatever it
 * calls it here.
 */
function importedWriteHelpers(absFile: string, src: string): { helper: string; line: number }[] {
  const kind = absFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absFile, src, ts.ScriptTarget.Latest, true, kind);
  const out: { helper: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const element of node.importClause.namedBindings.elements) {
        // `propertyName` is the name AT THE SOURCE when the import is aliased
        // (`insertMeal as _x`), and undefined otherwise.
        const imported = (element.propertyName ?? element.name).text;
        if (WRITE_CALLS.includes(imported)) {
          out.push({
            helper: imported,
            line: sf.getLineAndCharacterOfPosition(element.getStart(sf)).line + 1,
          });
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

/**
 * Every module specifier this file imports that the closure walker CANNOT resolve to a
 * path — a dynamic `import(someVariable)` or `require(someVariable)`.
 *
 * Reported as a finding in its own right, because an opaque specifier inside Home's
 * closure is precisely the shape a bypass takes: the module it reaches is invisible to
 * the walk, so a write inside it is invisible to everything here. The rule is not "no
 * dynamic imports" — it is "not one whose target this guard cannot see".
 */
function opaqueSpecifiers(absFile: string, src: string): number[] {
  const kind = absFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absFile, src, ts.ScriptTarget.Latest, true, kind);
  const out: number[] = [];
  const visit = (node: ts.Node) => {
    const dynamic =
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'));
    if (dynamic) {
      const arg = (node as ts.CallExpression).arguments[0];
      if (!arg || !ts.isStringLiteral(arg)) {
        out.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

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
  const writePath = WRITE_PATH[relPath];
  const allowed = [...(ALLOW[relPath] ?? []), ...(writePath?.helpers ?? [])];
  const rawSqlCounts = writePath === undefined;
  const blanked = blankComments(rawSource);
  const rawLines = rawSource.split('\n');
  const blankedLines = blanked.split('\n');
  const findings: WriteFinding[] = [];
  // Helpers whose real call site in THIS file carries a marker — so the import that
  // brought them in is covered by the same decision rather than needing a second one.
  // An ALIASED call is not recognised here, which is the point: it cannot borrow an
  // exemption it never matched.
  const exemptedHelpers = new Set<string>();

  blankedLines.forEach((text, index) => {
    const line = index + 1;
    for (const helper of WRITE_CALLS) {
      if (!new RegExp(`\\b${helper}\\s*\\(`).test(text)) continue;
      if (allowed.includes(helper)) continue;
      if (exempted(rawLines, line)) {
        exemptedHelpers.add(helper);
        continue;
      }
      findings.push({ file: relPath, line, what: `${helper}(` });
    }
    if (rawSqlCounts && RAW_MUTATION.test(text) && !exempted(rawLines, line)) {
      findings.push({ file: relPath, line, what: 'raw SQL mutation' });
    }
  });

  // The import-level reach, so an alias cannot hide a call (see `importedWriteHelpers`).
  const abs = relPath.endsWith('.tsx') ? relPath : relPath;
  for (const hit of importedWriteHelpers(abs, rawSource)) {
    if (allowed.includes(hit.helper) || exemptedHelpers.has(hit.helper)) continue;
    if (exempted(rawLines, hit.line)) continue;
    // Already reported at its call site in this file — one finding per site, not two.
    if (findings.some((f) => f.what === `${hit.helper}(`)) continue;
    findings.push({ file: relPath, line: hit.line, what: `import of ${hit.helper}` });
  }

  for (const line of opaqueSpecifiers(abs, rawSource)) {
    if (exempted(rawLines, line)) continue;
    findings.push({ file: relPath, line, what: 'an import whose target this guard cannot resolve' });
  }
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
    //
    // It fired exactly once, on CUL-873, and the entry it forced into this diff is the
    // note (`updateLookNote`). Recorded here rather than only in the PR, because the next
    // person to widen this line should see what a legitimate widening looked like:
    //
    //   • it is STILL TWO CLASSES. The classes are the med confirm and the daily look;
    //     what grew is the list of helpers the look's own file may reach, from one to two.
    //   • the second helper writes the look's OWN row (`looks.notes`), on the entry the
    //     owner has just made, creating no record the app did not already hold.
    //   • it was already ruled — T-22 / R16 put the note on the card in round 4, and §10
    //     assigns it to this PR. The pin did not authorise it; it made it visible, which
    //     is the whole job.
    //
    // A widening that cannot say all three of those is a third class, and a third class is
    // a Tier-2 amendment to `docs/nyx-med-strip-requirements.md` §0.1 — never a diff.
    expect(ALLOW).toEqual({
      'components/home/MedStrip.tsx': ['insertMedicationDose'],
      'components/home/LookCard.tsx': ['insertLook', 'updateLookNote'],
    });
  });

  it('every allowed file still exists and still makes the write it is allowed', () => {
    // An allow-entry for a file that has been renamed or no longer writes is dead weight
    // that silently widens the hole it was granted for (the EXEMPT staleness rule from
    // completionCard.test.ts, applied to the allow-set).
    const stale = Object.entries(ALLOW).filter(([file, helpers]: [string, readonly string[]]) => {
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

  it('FLAGS an ALIASED import — the alias is not a hiding place', () => {
    // The code review's bypass: `import { insertMeal as _x }` then `_x({...})` leaves the
    // string `insertMeal(` nowhere in the file. No attacker needed — a rename does it.
    const findings = find(
      "import { insertMeal as _x } from '../../lib/meals';\nawait _x({ petId });\n",
    );
    expect(findings.map((f) => f.what)).toEqual(['import of insertMeal']);
  });

  it('FLAGS an import whose target it cannot resolve', () => {
    // An opaque specifier inside Home's closure is the shape a bypass takes: the module
    // it reaches is invisible to the walk, so a write inside it is invisible to
    // everything here. The rule is not "no dynamic imports" — it is "not one whose
    // target this guard cannot see".
    const findings = find('const m = await import(pathFromSomewhere);\nawait m.write();\n');
    expect(findings.map((f) => f.what)).toEqual([
      'an import whose target this guard cannot resolve',
    ]);
  });

  it('accepts a RESOLVABLE dynamic import — the walker follows it', () => {
    expect(find("const m = await import('./someModule');\n")).toEqual([]);
  });

  it('does not report an import twice when its call site is already flagged', () => {
    const findings = find(
      "import { insertMeal } from '../../lib/meals';\nawait insertMeal({ petId });\n",
    );
    expect(findings.map((f) => f.what)).toEqual(['insertMeal(']);
  });

  it('lets a MARKED call site cover the import that brought it in', () => {
    const findings = find(
      "import { reverseLoggedEvent } from '../../lib/undoLog';\n" +
        '// home-write-ok: the shared reversal, C-20\n' +
        'await reverseLoggedEvent(id);\n',
    );
    expect(findings).toEqual([]);
  });

  it('lets an allowed file make ONLY its own write', () => {
    const src = 'await insertLook({ petId });\nawait insertSimpleEvent({ type: "itch" });\n';
    const findings = findWrites('components/home/LookCard.tsx', src);
    // The third adversarial pass's mutant: the look's own write passes, the prompted
    // symptom row does not.
    expect(findings.map((f) => f.what)).toEqual(['insertSimpleEvent(']);
  });
});
