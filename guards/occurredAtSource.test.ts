// CUL-536 — the flip rule for `occurred_at_source` has exactly one implementation.
//
// `occurred_at_source` records HOW a row's time was set: 'exif' (read off a photo),
// 'now' (the app's own clock), 'manual' (the owner chose it). One rule governs how
// that value CHANGES: a point-time edit that actually moves the instant flips
// anything-but-manual to 'manual'. That rule is `sourceAfterPointEdit`
// (`lib/eventTimeEdit.ts`), and the column is read by the vet report and the
// correlation engine to tell a witnessed-now log from a backfill.
//
// Why a standing guard rather than the one-time fix that already happened: B-525
// extracted the rule and fixed `app/log.tsx` + `app/edit-event.tsx`, and
// `app/food-capture.tsx` was left holding the pre-B-525 inline copy — one that only
// flipped 'exif' → 'manual' and so silently labelled 'now'-seeded owner backfills as
// 'now', an owner's deliberate correction recorded as the app's own guess. That rot
// went unnoticed for months and was found by hand (CUL-326). A one-time answer rots;
// this keeps it honest.
//
// ── What this scans for, and why it is this and not "every mention" ──────────────
//
// Measured before it was written (C-33), because the scope IS the design here:
// twenty-one files in the scanned tree name `occurred_at_source`. Flagging all of
// them would mean allowlisting `lib/sync.ts`'s pass-through, `lib/db.ts`'s row
// interfaces and `lib/localSchema.ts`'s DDL — a registry of twenty-one entries that
// pre-authorises every hole it lists, which is a scope error rather than an
// exemption (C-32, C-38). It is also the exact trap the sibling confidence guard
// (`lib/occurredAtConfidence.guard.test.ts`) records having tried and reverted.
//
// So this asks ONE question instead: **who CHOOSES between source values?** That is
// the flip rule and nothing else — a write of a fresh source on a fresh row names
// one value and compares nothing, and a read names one value too. Choosing requires
// a comparison against a source literal with another source literal in reach, which
// is what the detector matches. Measured: three files today, each earning its entry
// below, and a re-planted CUL-326 straggler is caught.
//
// ── Stated blind spots (an undocumented one reads as coverage — C-38) ────────────
//
//  * Literals only. A flip written over a `const MANUAL = 'manual'` indirection, or
//    over a variable holding the literal, is invisible here — the same limit the
//    confidence guard states about itself, and for the same reason: widening to
//    variables cannot tell an assertion from a read-through. The routing inventory
//    below is the structural half that covers what the literal scan cannot see.
//  * One line of reach. The detector's window runs from the line the comparison
//    starts on to the end of that statement, so a flip split across a statement
//    boundary escapes it.
//  * Scanned source only: `.ts`/`.tsx` under the directories below, tests excluded.
//    A flip inside an Edge Function is out of scope (server-side provenance is
//    written by the client and carried, never re-derived).

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib', 'store', 'hooks'];

const SOURCE_LITERAL = /'(exif|now|manual)'/g;
// A comparison against a source literal opens the window.
const COMPARISON = /(===|!==|==|!=)\s*'(exif|now|manual)'/g;

// file -> why choosing between source values is legitimate there. An entry is an
// EXEMPTION, so each must say what the expression actually does — "it is fine" is
// not a reason, and an entry that merely records that someone looked at the file
// pre-authorises whatever lands in it next (C-32).
const ALLOWED: Record<string, string> = {
  'lib/eventTimeEdit.ts':
    'THE RULE ITSELF — `sourceAfterPointEdit`, the one implementation this guard exists ' +
    'to keep singular. Every other time-editing surface calls it; see the routing ' +
    'inventory below, which pins that set in the other direction.',
  'lib/db.ts':
    '`getEventSource` narrowing a stored string back to the union on READ — ' +
    "`s === 'exif' || s === 'now' ? s : 'manual'`. It changes no provenance: it is the " +
    'type boundary between a TEXT column and the three-value union, and nothing is ' +
    "written. The 'manual' default for an unrecognised value is the conservative one " +
    'and worth stating rather than assuming, because it is load-bearing: ' +
    '`sourceAfterPointEdit` is a no-op on manual, so an unreadable provenance can ' +
    'never be flipped by an edit into a confident claim about how the time was set.',
  'components/log/SimpleEventConfirm.tsx':
    "A dirty-tracking SHAPE KEY — `tf.source === 'now' ? 'now' : String(...)` builds the " +
    'string this sheet diffs against its mount baseline to decide whether the owner ' +
    'touched the time. It reads the source to decide what enters the comparison and ' +
    'writes nothing; the file separately calls `sourceAfterPointEdit` for the actual ' +
    'flip (:266), which is the routing inventory\u2019s entry for it, not this.',
};

// Every surface that legitimately re-derives a source from an existing one. This is
// the structural half the literal scan cannot see: it pins the CALLERS of the shared
// rule, so a new time-editing surface is a deliberate addition rather than a silent
// one, and so a caller that DISAPPEARS (the CUL-326 shape — a call replaced by an
// inline copy) fails here even if the replacement dodges the detector above.
const ROUTED_THROUGH_PREDICATE: Record<string, string> = {
  'app/log.tsx': 'Quick-log time picker.',
  'app/edit-event.tsx': 'The edit form\u2019s point-in-time picker.',
  'app/food-capture.tsx':
    'The meal confirm\u2019s time editor \u2014 the CUL-326 straggler itself, and the ' +
    'reason this inventory exists.',
  'components/log/SimpleEventConfirm.tsx': 'The in-sheet symptom confirm\u2019s picker.',
  'components/ui/MealCompletionCard.tsx': 'Change time on the meal just logged.',
  'components/ui/MedicationCompletionCard.tsx': 'Change time on the dose just logged.',
  'components/ui/NamedCompletionCard.tsx': 'Change time on the named record just logged.',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue;
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Lines on which this source CHOOSES between source-provenance values.
 *
 * Comments are blanked first, in one offset-preserving pass (C-18) — several files
 * here discuss the flip rule in prose right beside the code that calls it, so an
 * unblanked scan reports the explanation instead of the behaviour.
 */
export function flipSites(rawSrc: string): number[] {
  const src = blankComments(rawSrc);
  const lines: number[] = [];
  for (const m of src.matchAll(COMPARISON)) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const semi = src.indexOf(';', m.index);
    const end = semi === -1 ? src.length : semi;
    const window = src.slice(lineStart, end);
    // Two or more source literals in one expression = a choice between them. One is
    // a test or a write, which is somebody else's question.
    if ([...window.matchAll(SOURCE_LITERAL)].length >= 2) {
      lines.push(src.slice(0, m.index).split('\n').length);
    }
  }
  return lines;
}

function scan(root: string, dirs: string[]): Map<string, number[]> {
  const hits = new Map<string, number[]>();
  for (const dir of dirs) {
    for (const file of sourceFiles(join(root, dir))) {
      const lines = flipSites(readFileSync(file, 'utf8'));
      if (lines.length > 0) hits.set(relative(root, file).split('\\').join('/'), lines);
    }
  }
  return hits;
}

function callers(root: string, dirs: string[]): Set<string> {
  const out = new Set<string>();
  for (const dir of dirs) {
    for (const file of sourceFiles(join(root, dir))) {
      const src = blankComments(readFileSync(file, 'utf8'));
      // The call, not the import — a file that imports and never calls has no rule
      // to route, and `lib/eventTimeEdit.ts`'s own declaration is not a call site.
      if (/sourceAfterPointEdit\s*\(/.test(src.replace(/export function sourceAfterPointEdit\s*\(/, ''))) {
        out.add(relative(root, file).split('\\').join('/'));
      }
    }
  }
  return out;
}

describe('occurred_at_source — the flip rule has one implementation (CUL-536)', () => {
  const hits = scan(ROOT, SCAN_DIRS);

  it('scans the directories that actually exist in the repository', () => {
    // The non-vacuity floor, derived from the REPOSITORY rather than from the
    // constant under test (C-38): a floor that iterates SCAN_DIRS is green when a
    // directory is dropped from SCAN_DIRS, which is the removal it exists to catch.
    const realSourceDirs = readdirSync(ROOT)
      .filter((e) => !e.startsWith('.') && e !== 'node_modules')
      .filter((e) => statSync(join(ROOT, e)).isDirectory())
      .filter((e) => ['app', 'components', 'lib', 'store', 'hooks'].includes(e));
    expect([...SCAN_DIRS].sort()).toEqual(realSourceDirs.sort());
  });

  it('reads a non-trivial amount of source', () => {
    // The other floor: a walk that silently returned nothing would make every
    // assertion below pass over an empty set.
    const total = SCAN_DIRS.reduce((n, d) => n + sourceFiles(join(ROOT, d)).length, 0);
    expect(total).toBeGreaterThan(200);
  });

  it('finds no surface choosing between source values outside the reviewed set', () => {
    // If this fails you have written a second implementation of the flip rule. Call
    // `sourceAfterPointEdit` (lib/eventTimeEdit.ts) instead — that is the whole point
    // of the extraction, and CUL-326 is what an inline copy costs: an owner's
    // deliberate correction recorded as the app's own guess, on a column the vet
    // report reads. If the expression genuinely does not change a provenance, add the
    // file to ALLOWED with what it actually does. Do not add it to quiet the test.
    const unlisted = [...hits.keys()].filter((f) => !(f in ALLOWED)).sort();
    expect(unlisted).toEqual([]);
  });

  it('keeps no stale exemption — every allowlisted file still holds one', () => {
    const stale = Object.keys(ALLOWED).filter((f) => !hits.has(f)).sort();
    expect(stale).toEqual([]);
  });

  it('states, for every exemption, what the expression does instead of flipping', () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(`${file}: ${reason.trim()}`).not.toBe(`${file}: `);
      expect(reason.trim().length).toBeGreaterThan(40);
    }
  });
});

describe('occurred_at_source — every time-editing surface routes through the rule', () => {
  const found = callers(ROOT, SCAN_DIRS);

  it('matches the reviewed inventory of callers exactly', () => {
    // Both directions matter. A NEW caller is a new surface that can move a point in
    // time, which is worth a line saying which one. A caller that VANISHES is the
    // CUL-326 shape itself — a call to the shared rule replaced by something else —
    // and that is the failure this catches even when the replacement is written in a
    // form the literal detector above cannot see.
    expect([...found].sort()).toEqual(Object.keys(ROUTED_THROUGH_PREDICATE).sort());
  });

  it('names what each caller edits', () => {
    for (const reason of Object.values(ROUTED_THROUGH_PREDICATE)) {
      expect(reason.trim()).not.toBe('');
    }
  });
});

// The detector's own proofs, driven over fixtures written OUTSIDE the repository
// (C-18 / `guards/fixtureDiscipline.test.ts`): these sources ARE the anti-pattern,
// so a fixture inside the tree would be found by this guard's own live scan.
describe('flipSites — the detector', () => {
  let root = '';
  const REL = 'app/probe.tsx';

  beforeEach(() => {
    root = createFixtureRoot('occurred-at-source', SCAN_DIRS);
  });
  afterEach(() => {
    removeFixtureRoot(root);
  });

  const at = (rel: string) => scan(root, SCAN_DIRS).get(rel) ?? [];

  it('catches the CUL-326 straggler, byte for byte', () => {
    writeFixture(
      root,
      REL,
      "export const f = (s: Src, d: boolean) =>\n  setSource(s === 'exif' ? 'manual' : s);\n",
    );
    expect(at(REL)).toEqual([2]);
  });

  it('catches the same flip written over a single literal', () => {
    // `sourceAfterPointEdit`'s own shape. A distinct-literal count would miss this
    // one entirely — it names 'manual' twice and nothing else — which is why the
    // detector counts occurrences.
    writeFixture(root, REL, "export const f = (c: Src, ch: boolean) =>\n  ch && c !== 'manual' ? 'manual' : c;\n");
    expect(at(REL)).toEqual([2]);
  });

  it('ignores a write of one fresh source on a fresh row', () => {
    writeFixture(root, REL, "export const row = { occurred_at_source: 'now' };\n");
    expect(at(REL)).toEqual([]);
  });

  it('ignores a render branch that merely tests a source', () => {
    writeFixture(root, REL, "export const f = (s: Src) => (s === 'exif' ? <Badge /> : null);\n");
    expect(at(REL)).toEqual([]);
  });

  it('does not report a flip that only appears in a comment', () => {
    // Several real files explain this rule in prose beside the call that applies it,
    // so an unblanked scan would report the explanation as the violation.
    writeFixture(root, REL, "// s === 'exif' ? 'manual' : s is what this used to do.\nexport const f = 1;\n");
    expect(at(REL)).toEqual([]);
  });

  it('does not let a // inside a string swallow the violation on the same line', () => {
    // The chained-replace scar (C-18): a comment blanker that is not a single
    // left-to-right pass reads the `//` inside the URL as a comment start and eats
    // the rest of the line, which is where the flip is.
    writeFixture(
      root,
      REL,
      "export const f = (s: Src) => {\n  log('https://x.test/a'); return s === 'exif' ? 'manual' : s;\n};\n",
    );
    expect(at(REL)).toEqual([2]);
  });
});
