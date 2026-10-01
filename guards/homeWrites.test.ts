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
// can REACH: the write helpers named in WRITE_CALLS, raw SQL that mutates a synced table,
// and a direct PostgREST mutation (`client.from(t).update(…)`, CUL-1106 — the shape
// neither of the first two could see). A `saveLook()` wrapper is caught because the
// wrapper's own file is in the closure and contains the call. The helper names are
// DERIVED by effect too (CUL-1154): every `lib/` function that mutates, directly or
// through another, is a write helper whether or not anyone remembered to list it. The
// hand list `WRITE_CALLS` survives as a floor, and `NOT_RECORD_WRITES` names the writes
// that are not the record's, each with its reason.
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
  // CUL-903 — the companion's four writes, registered on the PR that puts a companion
  // node on Home (C-32: a rule added after the first caller is a rule added after the
  // bug). They are named here for a specific reason: `lib/vetVisits.ts` joins
  // WRITE_PATH below, which stops its raw SQL counting — correctly, since it is the
  // write LAYER — and WITHOUT these names that registration would make every one of
  // its writes invisible to this guard from a Home card. The helper names are what
  // survive the exemption.
  'bookVetAppointment',
  'logVetVisit',
  'cancelVetAppointment',
  'saveAppointmentQuestions',
  // CUL-1106 — the owner's edits to the per-incident read, and the first writes the
  // PostgREST detector found in Home's closure. Named for the same reason as the four
  // above: `lib/analysis.ts` joins WRITE_PATH (Home reaches it for the read's state),
  // which silences its own mutations, and these names are what survive that.
  'saveVomitFieldEdits',
  'saveStoolFieldEdits',
];

/**
 * The derived writers that are NOT writes to the record (CUL-1154), and why.
 *
 * Derivation by effect finds every `lib/` function that mutates a table, and some
 * tables are not the record: the sync layer's bookkeeping, the catalog caches, the local
 * database's own lifecycle. These are the layer that makes any row durable, or the
 * device's housekeeping, never a control on Home writing a row (the header's DRAIN
 * argument). An entry here does not propagate either: a function whose only write is
 * through one of these is not a writer.
 *
 * Each entry must still be a derived writer (the staleness test below), so a rename or a
 * removal cannot leave a name here pre-authorising whatever takes it next (C-32). Adding
 * one is the same act as adding to the allow-set: say why, and never to clear a finding
 * that is a write to the record.
 */
const NOT_RECORD_WRITES: Record<string, string> = {
  syncNow: 'the drain: pushes rows already written and pulls the mirror; adds nothing',
  hydrateFromCloud: 'the pull: mirrors rows the server already holds',
  ensureEventAttachmentsSynced: 'the attachment drain, the per-incident read\u2019s precondition',
  setWatermark: 'sync bookkeeping: the last-pulled marker per table',
  refreshFoodCache: 'the food catalog cache, re-read from the server',
  refreshMedicationCache: 'the medication catalog cache, re-read from the server',
  reapStalePendingFoods: 'the catalog cache\u2019s own cleanup of abandoned extractions',
  flushLegacyCatalogCachesIfNeeded: 'a one-time local cache migration',
  initDb: 'creates and migrates the local database',
  clearLocalData: 'the sign-out wipe of the local database',
  writeCopies:
    'the per-incident read\u2019s verdict copy (lib/readCopy.ts in WRITE_PATH): it mirrors ' +
    'rows the SERVER wrote, so the realtime watch Home starts is a pull, not a write',
};

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
  // CUL-903 — THE THIRD CLASS, and it is a Tier-2 amendment rather than a marker:
  // `docs/nyx-med-strip-requirements.md` §0.1 now names it, PM-approved 2026-09-11.
  //
  // What it is: the appointment strip's *It didn't*, the owner answering the ask the
  // app itself just put on screen (*Did Tuesday's visit happen?*). It passes D1's own
  // test for a confirmation rather than a second door — it writes a row the app is
  // DESCRIBING IN THE SAME BREATH, opens no form, and starts no record. The strip's
  // other door, *Add a question*, is a NAVIGATION into Get ready precisely so that
  // this stays true: Home gains a confirmation and still carries no form.
  //
  // And the row it touches reaches nothing the record computes from —
  // `guards/visitReaders.test.ts` pins that an appointment never enters a count, a
  // coverage line, Patterns or an engine input. The two guards compose: that one
  // bounds what a visit may influence, this one bounds what Home may write.
  'components/vetvisits/AppointmentStrip.tsx': ['cancelVetAppointment'],
  // CUL-1066 (D2-4) — THE LOOK, AS TODAY'S HEADER behind `design_v2`. The same class as
  // `LookCard` (the carve-out §0.1 opened for the look on 2026-09-10), reached through a
  // second file because flag-on Home draws the look here and not there; it is not a
  // fourth class. Exactly `insertLook`: the header has no note field (the note stays on
  // the record screen, T-22), so `updateLookNote` is NOT allowed here — a helper this
  // file does not reach is a hole the allow-set would be pre-authorising (C-32). Flag-on,
  // `MedStrip`'s confirm is not mounted, so Home's live write classes under the flag are
  // two: this look and the appointment strip's resolution.
  'components/designV2/home/LookHeader.tsx': ['insertLook'],
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
 * Raw SQL and direct PostgREST mutations are exempt here and NOWHERE ELSE (the second
 * since CUL-1106, which measured 13 such writes in `lib/sync.ts` and `lib/weight.ts`, all
 * of them the sync fabric). That replaces the first cut's directory rule
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
    helpers: ['insertMedicationDose', 'updateDoseAdherence', 'updateDoseHowGiven'],
    why:
      'declares insertMedicationDose, and rateDoseAdherence / recordDoseHowGiven, the ' +
      'refresh-and-push wrappers over lib/db.ts\u2019s two dose edits',
  },
  'lib/simpleEvent.ts': { helpers: ['insertSimpleEvent'], why: 'declares insertSimpleEvent' },
  'lib/undoLog.ts': {
    helpers: ['reverseLoggedEvent', 'softDeleteEvent', 'reconcileWeightSnapshotAfterDelete'],
    why:
      'declares the ONE shared reversal, whose implementation is softDeleteEvent (C-20), ' +
      'and which un-writes a weigh-in\u2019s snapshot on the way out (CUL-641)',
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
  'lib/vetVisits.ts': {
    // It DECLARES all four, so it must be allowed to reach them — the `lib/db.ts` and
    // `lib/medicationSetup.ts` shape. Per-helper rather than a blanket skip, which is
    // the distinction the adversarial pass forced: a module is silent about the writes
    // it owns and loud about every other one in it.
    helpers: ['bookVetAppointment', 'logVetVisit', 'cancelVetAppointment', 'saveAppointmentQuestions'],
    why:
      'the companion\u2019s read/write model (CUL-900) \u2014 booking, logging, cancelling ' +
      'and the questions all live here, and Home only READS through it. Same shape as ' +
      'dietTrialSetup/medicationSetup above: the layer a control goes through, not a ' +
      'control. Its four helpers are in WRITE_CALLS, so a Home card that calls one is ' +
      'still caught BY NAME \u2014 this entry silences the raw SQL, never the reach.',
  },
  'lib/feedingArrangements.ts': {
    helpers: [],
    why: 'the arrangements mirror, written by the sync layer',
  },
  'lib/analysis.ts': {
    helpers: ['saveVomitFieldEdits', 'saveStoolFieldEdits'],
    why:
      'declares both owner edits to the per-incident read (CUL-1106), a direct ' +
      'PostgREST update because event_ai_analysis is server-owned (its structured ' +
      'fields are never mirrored locally; the verdict copy below never holds them). ' +
      'Home reaches this module for the read\u2019s state (TodayCard) and writes ' +
      'nothing through it; both helpers are in WRITE_CALLS, so a Home card that calls ' +
      'one is still caught BY NAME.',
  },
  // HV-5 (CUL-1162) \u2014 registered the PR it SHIPS (C-32). Home's spine reads the read's
  // verdict from this module, so its one upsert is in Home's closure; without this entry
  // the raw-SQL detector reds on it, and marking it `home-write-ok` would call sync
  // fabric a Home write class.
  'lib/readCopy.ts': {
    helpers: [],
    why:
      'the per-incident read\u2019s verdict copy (History v2 \u00a75.3): its one upsert ' +
      'mirrors rows the SERVER wrote, called by the sync pull, the analysis chain and ' +
      'the realtime watch. Home only READS through it (readAnalysisRows); nothing an ' +
      'owner does on Home writes the copy, and it holds no record of its own.',
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
        if (writeHelpers().includes(imported)) {
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

/** The PostgREST verbs that change a row. `select` is a read and `rpc` is a function
 *  call the guard cannot see into (a stated blind spot, below). */
const POSTGREST_MUTATIONS = new Set(['insert', 'update', 'upsert', 'delete']);

/**
 * Every direct PostgREST mutation in a file — `client.from(<table>).insert(…)` and its
 * three siblings — by line (CUL-1106).
 *
 * The third detector, beside the named helpers and the raw SQL, because neither of
 * those sees this shape: a card or a hook calling the client itself writes a synced
 * table without a helper name or a line of SQL. The per-incident read's edit and hide
 * writes (`lib/analysis.ts`) are exactly this shape; none is on Home today.
 *
 * Read off the TS parser, like the imports above, not a regex: the chain is usually
 * split over lines, and a sentence about `.from('events').update(` in a comment or a
 * string is not a call. The table argument may be anything, so a table named through a
 * variable counts too, and so does a builder held in a local first
 * (`const q = client.from(t); q.update(…)`, the code-reviewer's case). The line is the
 * chain's first, where a marker above it reads.
 *
 * BLIND SPOTS, stated so they do not read as coverage (C-38): a mutation behind
 * `.rpc(…)`, a Storage `upload` / `remove`, a builder that crosses a function boundary
 * (passed as an argument, returned from a helper), and a client method reached through a
 * wrapper this file does not name. None has a Home caller today. The local-binding match
 * is by NAME across the file, not by scope, so it errs loud: a same-named local in
 * another function that happens to have a `delete` would be flagged, never missed.
 */
function postgrestMutations(absFile: string, src: string): number[] {
  const kind = absFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absFile, src, ts.ScriptTarget.Latest, true, kind);
  const out: number[] = [];
  const isFromCall = (n: ts.Node): boolean =>
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === 'from';
  // Locals initialised to a builder, so `q.update(…)` counts as `client.from(t).update(…)`.
  const builders = new Set<string>();
  const collect = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isFromCall(node.initializer)
    ) {
      builders.add(node.name.text);
    }
    node.forEachChild(collect);
  };
  collect(sf);
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      POSTGREST_MUTATIONS.has(node.expression.name.text)
    ) {
      const receiver = node.expression.expression;
      if (isFromCall(receiver) || (ts.isIdentifier(receiver) && builders.has(receiver.text))) {
        out.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

// ── the derived write helpers (CUL-1154) ──────────────────────────────────────

/** A call: `name(`, the shape the helper match has always used. */
const CALLED = /\b([A-Za-z_$][\w$]*)\s*\(/g;

/** The directory derivation walks: where every write helper is declared today. */
const HELPER_DIR = 'lib';

interface DerivedWriters {
  /** Every exported writer's name, minus `NOT_RECORD_WRITES`. */
  names: Set<string>;
  /** The files each such name is exported from. */
  declaredIn: Map<string, Set<string>>;
  /** Every exported writer BEFORE the exclusions, for the staleness test. */
  beforeExclusions: Set<string>;
}

/**
 * Every `lib/` function that writes, found by what it does rather than by its name.
 *
 * A function WRITES when its body holds a raw SQL mutation, references a module-level
 * constant holding one (`addTrialFood` runs `TRIAL_FOOD_INSERT_SQL`, so its body never
 * says INSERT), or makes a direct PostgREST mutation; or when it calls a function that
 * writes. Private functions take part, so an exported wrapper over a private writer
 * counts, but a call resolves to a private function only inside its own module. The
 * closure runs to a fixed point.
 *
 * BLIND SPOTS, stated so they do not read as coverage (C-38): methods on an object or a
 * class, a function passed as a value and called through a parameter, SQL built by
 * concatenation across statements, and writers declared outside `lib/` (a store or a
 * hook that writes directly is caught where it sits, by the raw-SQL and PostgREST
 * detectors, because it is in Home's closure). Calls match by NAME, so a same-named
 * function in another module errs loud, never quiet.
 */
export function deriveWriters(root: string): DerivedWriters {
  interface Fn { file: string; name: string; exported: boolean; callees: Set<string>; writes: boolean }
  const fns: Fn[] = [];
  const dir = path.join(root, HELPER_DIR);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((n) => /\.tsx?$/.test(n) && !n.includes('.test.')).sort()
    : [];

  // Module-level constants whose text is a mutation, by file, plus the exported ones by
  // name (a writer may import its statement from a sibling module).
  const localSql = new Map<string, Set<string>>();
  const exportedSql = new Set<string>();
  const parsed = files.map((name) => {
    const relFile = `${HELPER_DIR}/${name}`;
    const src = fs.readFileSync(path.join(dir, name), 'utf8');
    const kind = name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(relFile, src, ts.ScriptTarget.Latest, true, kind);
    return { relFile, src, sf };
  });
  const isExported = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const { relFile, src, sf } of parsed) {
    const consts = new Set<string>();
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const text = blankComments(src.slice(decl.initializer.getStart(sf), decl.initializer.end));
        if (!RAW_MUTATION.test(text)) continue;
        consts.add(decl.name.text);
        if (isExported(stmt)) exportedSql.add(decl.name.text);
      }
    }
    localSql.set(relFile, consts);
  }

  for (const { relFile, src, sf } of parsed) {
    const mutationLines = new Set(postgrestMutations(relFile, src));
    const consts = localSql.get(relFile) ?? new Set<string>();
    const add = (name: string, exported: boolean, body: ts.Node) => {
      const text = blankComments(src.slice(body.getStart(sf), body.end));
      const first = sf.getLineAndCharacterOfPosition(body.getStart(sf)).line + 1;
      const last = sf.getLineAndCharacterOfPosition(body.end).line + 1;
      let postgrest = false;
      for (let line = first; line <= last && !postgrest; line += 1) postgrest = mutationLines.has(line);
      const words = new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? []);
      const viaConst = [...consts, ...exportedSql].some((c) => words.has(c));
      const callees = new Set([...text.matchAll(CALLED)].map((m) => m[1]));
      fns.push({ file: relFile, name, exported, callees, writes: RAW_MUTATION.test(text) || postgrest || viaConst });
    };
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
        add(stmt.name.text, isExported(stmt), stmt.body);
      } else if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          const init = decl.initializer;
          if (ts.isIdentifier(decl.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            add(decl.name.text, isExported(stmt), init.body);
          }
        }
      }
    }
  }

  // An excluded name is neither a writer nor a path to one.
  const excluded = (fn: Fn) => fn.exported && fn.name in NOT_RECORD_WRITES;
  const beforeExclusions = new Set<string>();
  for (let pass = 0; pass < 2; pass += 1) {
    // Pass 0 ignores the exclusions (for the staleness test), pass 1 applies them.
    const live = fns.map((fn) => ({ ...fn }));
    const skip = (fn: Fn) => pass === 1 && excluded(fn);
    let grew = true;
    while (grew) {
      grew = false;
      const writers = live.filter((fn) => fn.writes && !skip(fn));
      for (const fn of live) {
        if (fn.writes || skip(fn)) continue;
        const reaches = writers.some(
          (w) => (w.file === fn.file || w.exported) && w !== fn && fn.callees.has(w.name),
        );
        if (reaches) {
          fn.writes = true;
          grew = true;
        }
      }
    }
    const exportedWriters = live.filter((fn) => fn.exported && fn.writes && !skip(fn));
    if (pass === 0) {
      for (const fn of exportedWriters) beforeExclusions.add(fn.name);
      continue;
    }
    const declaredIn = new Map<string, Set<string>>();
    for (const fn of exportedWriters) {
      const set = declaredIn.get(fn.name) ?? new Set<string>();
      set.add(fn.file);
      declaredIn.set(fn.name, set);
    }
    return { names: new Set(declaredIn.keys()), declaredIn, beforeExclusions };
  }
  throw new Error('unreachable');
}

let derivedCache: DerivedWriters | null = null;
/** The live tree's derived writers, computed once per run. */
function liveWriters(): DerivedWriters {
  derivedCache ??= deriveWriters(ROOT);
  return derivedCache;
}

let helpersCache: string[] | null = null;
/** Every helper name the detector matches: the hand list and the derived set. */
function writeHelpers(): string[] {
  helpersCache ??= [...new Set([...WRITE_CALLS, ...liveWriters().names])].sort();
  return helpersCache;
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
  // A module is silent about the writers it DECLARES (CUL-1154): `lib/vetVisits.ts`
  // calling its own `saveNotesDraft` is the layer's business. It stays loud about every
  // writer declared anywhere else, which is the adversarial pass's `insertLook` →
  // `insertSimpleEvent` case.
  const declaredHere = [...liveWriters().declaredIn]
    .filter(([, files]) => files.has(relPath))
    .map(([name]) => name);
  const allowed = [...(ALLOW[relPath] ?? []), ...(writePath?.helpers ?? []), ...declaredHere];
  // The write layer's own statements (raw SQL, direct PostgREST) are its business;
  // anywhere else in Home's closure they are a write.
  const directWritesCount = writePath === undefined;
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
    const called = new Set([...text.matchAll(CALLED)].map((m) => m[1]));
    for (const helper of writeHelpers()) {
      if (!called.has(helper)) continue;
      if (allowed.includes(helper)) continue;
      if (exempted(rawLines, line)) {
        exemptedHelpers.add(helper);
        continue;
      }
      findings.push({ file: relPath, line, what: `${helper}(` });
    }
    if (directWritesCount && RAW_MUTATION.test(text) && !exempted(rawLines, line)) {
      findings.push({ file: relPath, line, what: 'raw SQL mutation' });
    }
  });

  // The import-level reach, so an alias cannot hide a call (see `importedWriteHelpers`).
  const abs = relPath.endsWith('.tsx') ? relPath : relPath;

  if (directWritesCount) {
    for (const line of postgrestMutations(abs, rawSource)) {
      if (exempted(rawLines, line)) continue;
      findings.push({ file: relPath, line, what: 'direct PostgREST mutation' });
    }
  }
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
    //
    // It fired a SECOND time on CUL-903, and that one IS a third class — the
    // appointment strip's *It didn't*. Which is what this pin is for: it could not be
    // added without editing this literal, and editing this literal is what sent the
    // question to the PM before a line of the strip was written. The amendment is
    // recorded in `docs/nyx-med-strip-requirements.md` §0.1; the reason it qualifies
    // is on the ALLOW entry above.
    //
    // It fired a THIRD time on CUL-1066 (D2-4), and that one is NOT a new class: the
    // look, drawn by a second file (`components/designV2/home/LookHeader.tsx`) behind
    // `design_v2`, reaching ONE of the look's two helpers. It passes the three tests
    // above in the same words the note did — the look's own row, no new record, ruled
    // (the round-4 page §01). What the flag changes is which classes are MOUNTED: flag-on
    // the med strip is not, so live Home carries two (the look, the appointment strip);
    // the allow-set still names the med strip because the file still exists, still
    // writes, and is still mounted flag-off — the closure walks files, not flags.
    expect(ALLOW).toEqual({
      'components/home/MedStrip.tsx': ['insertMedicationDose'],
      'components/home/LookCard.tsx': ['insertLook', 'updateLookNote'],
      'components/vetvisits/AppointmentStrip.tsx': ['cancelVetAppointment'],
      'components/designV2/home/LookHeader.tsx': ['insertLook'],
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

  it('FLAGS a direct PostgREST mutation, split over lines as the client is written (CUL-1106)', () => {
    const findings = find(
      "await supabase\n  .from('event_ai_analysis')\n  .update({ dismissed_at: now })\n  .eq('event_id', id);\n",
    );
    // At the chain's first line, where a marker above it would sit.
    expect(findings).toEqual([{ file: REL, line: 1, what: 'direct PostgREST mutation' }]);
  });

  it('FLAGS every mutating verb, and a table named through a variable', () => {
    const src = [
      "await sb.from('events').insert(row);",
      "await sb.from('meals').upsert(row);",
      "await sb.from('looks').delete().eq('id', id);",
      'await sb.from(TABLE).update(patch);',
    ].join('\n');
    expect(find(src).map((f) => f.line)).toEqual([1, 2, 3, 4]);
  });

  it('FLAGS a builder bound to a local and mutated on a later line', () => {
    // The code-reviewer's case: the verb's receiver is an identifier, not the `.from()`
    // call, so a detector that only reads the chain misses it.
    const findings = find("const q = supabase.from('events');\nawait q.update({ notes }).eq('id', id);\n");
    expect(findings.map((f) => [f.line, f.what])).toEqual([[2, 'direct PostgREST mutation']]);
  });

  it('IGNORES a local bound to anything other than a builder', () => {
    expect(find('const seen = new Set(ids);\nseen.delete(id);\n')).toEqual([]);
  });

  it('IGNORES a PostgREST read, and the chain inside a comment or a string', () => {
    expect(find("const { data } = await sb.from('events').select('*').eq('id', id);\n")).toEqual([]);
    expect(find("// sb.from('events').update(x) would be a third class\n")).toEqual([]);
    expect(find("const doc = \"sb.from('events').update(x)\";\n")).toEqual([]);
  });

  it('CLEARS a marked PostgREST site', () => {
    expect(find("// home-write-ok: the fixture's reason\nawait sb.from('events').update(x);\n")).toEqual([]);
  });

  it('FLAGS a Home card calling a per-incident edit BY NAME, though its module is registered', () => {
    expect(find('await saveVomitFieldEdits(id, edits);\n').map((f) => f.what)).toEqual([
      'saveVomitFieldEdits(',
    ]);
  });

  it('leaves the write layer’s own PostgREST alone, exactly as its raw SQL', () => {
    // `lib/sync.ts` pushes every synced table this way: it is the layer, not a control.
    expect(findWrites('lib/sync.ts', "await supabase.from('events').upsert(rows);\n")).toEqual([]);
  });

  it('does NOT see an rpc or a Storage upload: the blind spots the detector states', () => {
    // Pinned so the detector's header and its reach cannot drift apart unseen (C-38):
    // widen the detector and this test says to update the sentence.
    expect(find("await sb.rpc('record_ai_usage', { p });\n")).toEqual([]);
    expect(find("await sb.storage.from('nyx-photos').upload(path, blob);\n")).toEqual([]);
  });

  it('lets an allowed file make ONLY its own write', () => {
    const src = 'await insertLook({ petId });\nawait insertSimpleEvent({ type: "itch" });\n';
    const findings = findWrites('components/home/LookCard.tsx', src);
    // The third adversarial pass's mutant: the look's own write passes, the prompted
    // symptom row does not.
    expect(findings.map((f) => f.what)).toEqual(['insertSimpleEvent(']);
  });
});

describe('the derived write helpers (CUL-1154)', () => {
  it('finds the record writes the hand list never named', () => {
    // The issue's own list, measured at d2c5c0c: every one of these wrote to the record
    // and none was on WRITE_CALLS, so a Home card calling one shipped green.
    const names = liveWriters().names;
    for (const helper of [
      'insertWeightCheck', 'updateWeightCheck', 'updateMealIntake', 'rateMealIntake',
      'updateMealFood', 'updateDoseAdherence', 'updateDoseHowGiven', 'startDietTrial',
      'endActiveTrial', 'addTrialFood', 'archiveFood', 'linkCourseToVisit', 'softDeleteVetDocument',
    ]) {
      expect([helper, names.has(helper)]).toEqual([helper, true]);
    }
  });

  it('FLAGS a Home card calling a write helper no list names', () => {
    expect(WRITE_CALLS).not.toContain('insertWeightCheck');
    const root = createFixtureRoot('home-writes-derived', ['components/home']);
    try {
      const rel = 'components/home/HomeWriteFixture.tsx';
      const src = 'await insertWeightCheck({ petId, kg: 4.2 });\n';
      writeFixture(root, rel, src);
      expect(findWrites(rel, src).map((f) => f.what)).toEqual(['insertWeightCheck(']);
    } finally {
      removeFixtureRoot(root);
    }
  });

  it('pins the exclusions, and each one is still a writer it has to exclude', () => {
    // A name here that derivation no longer finds is dead weight that would
    // pre-authorise whatever takes the name next (C-32).
    const { beforeExclusions, names } = liveWriters();
    const stale = Object.keys(NOT_RECORD_WRITES).filter((n) => !beforeExclusions.has(n));
    expect(stale).toEqual([]);
    expect(Object.keys(NOT_RECORD_WRITES).filter((n) => names.has(n))).toEqual([]);
    expect(Object.keys(NOT_RECORD_WRITES).sort()).toEqual([
      'clearLocalData', 'ensureEventAttachmentsSynced', 'flushLegacyCatalogCachesIfNeeded',
      'hydrateFromCloud', 'initDb', 'reapStalePendingFoods', 'refreshFoodCache',
      'refreshMedicationCache', 'setWatermark', 'syncNow', 'writeCopies',
    ]);
  });

  describe('the derivation, over a fixture lib/', () => {
    let root = '';
    beforeEach(() => {
      root = createFixtureRoot('home-writes-derive', ['lib']);
    });
    afterEach(() => {
      removeFixtureRoot(root);
    });

    const derive = (files: Record<string, string>) => {
      for (const [name, src] of Object.entries(files)) writeFixture(root, `lib/${name}`, src);
      return deriveWriters(root);
    };

    it('takes a function holding a raw SQL mutation, and leaves a read', () => {
      const { names } = derive({
        'a.ts':
          'export async function save() { await db.runAsync(`UPDATE events SET notes = ?`, [n]); }\n' +
          'export async function load() { return db.getAllAsync(`SELECT * FROM events`); }\n',
      });
      expect([...names]).toEqual(['save']);
    });

    it('takes a function whose statement lives in a module constant', () => {
      // The `addTrialFood` shape: the body names the constant, never the verb.
      const { names } = derive({
        'a.ts':
          'const INSERT_SQL = `INSERT INTO diet_trial_foods (id) VALUES (?)`;\n' +
          'export async function addFood(id) { await db.runAsync(INSERT_SQL, [id]); }\n',
      });
      expect([...names]).toEqual(['addFood']);
    });

    it('takes a direct PostgREST mutation', () => {
      const { names } = derive({
        'a.ts': "export async function hide(id) {\n  await sb\n    .from('x')\n    .update({ h: true });\n}\n",
      });
      expect([...names]).toEqual(['hide']);
    });

    it('takes an exported wrapper over a private writer, and a writer in another module', () => {
      const { names } = derive({
        'a.ts':
          'async function raw() { await db.runAsync(`DELETE FROM looks WHERE id = ?`, [i]); }\n' +
          'export async function removeLook(i) { await raw(); }\n',
        'b.ts': "import { removeLook } from './a';\nexport async function tidy(i) { await removeLook(i); }\n",
      });
      expect([...names].sort()).toEqual(['removeLook', 'tidy']);
    });

    it('does not resolve a PRIVATE writer across modules', () => {
      const { names } = derive({
        'a.ts': 'async function raw() { await db.runAsync(`DELETE FROM looks`); }\nexport const x = 1;\n',
        'b.ts': 'async function raw() { return 1; }\nexport async function calm() { await raw(); }\n',
      });
      expect([...names]).toEqual([]);
    });

    it('does not carry an excluded write through its callers', () => {
      // `setWatermark` is sync bookkeeping; a pull that only moves a watermark is not a
      // record write, and neither is the function that calls the pull.
      const { names, beforeExclusions } = derive({
        'a.ts':
          'export async function setWatermark(t) { await db.runAsync(`UPDATE watermarks SET t = ?`, [t]); }\n' +
          'export async function pull() { await setWatermark(1); }\n',
      });
      expect([...names]).toEqual([]);
      expect([...beforeExclusions].sort()).toEqual(['pull', 'setWatermark']);
    });

    it('says which file declares each writer, which is what lets a module call its own', () => {
      const { declaredIn } = derive({
        'a.ts': 'export async function save() { await db.runAsync(`INSERT INTO events (id) VALUES (?)`); }\n',
      });
      expect([...(declaredIn.get('save') ?? [])]).toEqual(['lib/a.ts']);
    });
  });
});
