// The one-reversal guard (CUL-641 · `docs/nyx-app-polish-requirements.md` §5).
//
// WHY THIS FILE EXISTS. `lib/undoLog.ts` already carried, in a comment, the rule this
// file now enforces:
//
//   "So this is the SAME reversal History's 'Remove' and the detail screen's 'Remove'
//    already perform, reached from a different surface. It is deliberately not a second
//    delete path with its own semantics: a divergence here would mean a row removed
//    from the card and a row removed from History were different kinds of gone, and
//    only one of them would be right."                              — lib/undoLog.ts
//
// The comment was true and the paths diverged anyway. `app/log.tsx` re-points
// `pets.weight_kg` the moment a weigh-in is written; not one of the three delete paths
// had a counterpart, so undoing a mis-typed `124` left the Profile chip, the next
// weigh-in's pre-fill and EditPetModal all offering 124 indefinitely (CUL-641). The
// divergence was invisible from inside any single path — each one was locally complete,
// and the missing side-effect lived in a fourth file none of them imported.
//
// The fix was to make the shared reversal literally shared. This keeps it that way: a
// screen that reaches past `reverseLoggedEvent` for the raw `softDeleteEvent` primitive
// fails the build, so the NEXT side-effect removal implies is inherited by every delete
// surface instead of being added to whichever one the author had open.
//
// WHAT IT DOES NOT CLAIM. A syntactic scan proves a file does not call the primitive —
// not that its reversal is correct, nor that `reverseLoggedEvent` settles everything it
// should. That is review's job. What it removes is the whole-path omission, which is
// the failure mode that actually shipped.
//
// ESCAPE HATCH: an inline `// reverse-path-ok: <reason>` anywhere in the file suppresses
// it. The reason is mandatory, so an exemption is a named decision rather than a silent
// hole — the `NOT_WIPED_ON_SIGN_OUT` discipline.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'store'];

/** The raw primitive, and the one function allowed to call it. */
const PRIMITIVE = 'softDeleteEvent';
const SANCTIONED_PATH = 'lib/undoLog.ts';

/** Declares the primitive; a definition is not a call site. */
const DEFINITION = 'lib/db.ts';

const EXEMPTION = /\/\/\s*reverse-path-ok:\s*\S+/;

/**
 * Comments out, code in — for both directions the completion-card guard documents.
 * Here the false-negative direction is the live risk: this very file, `lib/undoLog.ts`
 * and both Remove sites all discuss `softDeleteEvent` in prose, and matching raw source
 * would let a future path satisfy the rule by pasting the explanation along with the
 * call. Lexical strip, not a parse: block comments first (so JSX `{/* … *\/}` goes too),
 * then line comments.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '__snapshots__') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(ent.name) && !ent.name.includes('.test.')) {
      out.push(path.relative(ROOT, full));
    }
  }
  return out;
}

function sourceFiles(): string[] {
  return SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).sort();
}

/**
 * Read a walked file, or `null` if it vanished between the listing and this read.
 * `guards/completionCard.test.ts` writes a real fixture into `app/` and unlinks it, and
 * jest runs suites in parallel workers — so any `app/` walker can list a file that is
 * gone by the time it reads it. A path that no longer exists has no call sites in it.
 * ENOENT only: every other read failure is a real error and still throws.
 */
function readSource(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * Files that USE the primitive. Deliberately not just the `softDeleteEvent(` call form:
 * `lib/widgetBridge.ts` passes it as a value (`revokeEvent: softDeleteEvent`), which is
 * a delete path exactly as much as a call is — and is precisely the fourth path the
 * CUL-641 issue itself did not name. A bare `import` line is excluded, since a file
 * cannot use what it only names in its import.
 */
function usesPrimitive(src: string): boolean {
  const code = stripComments(src)
    .split('\n')
    .filter((l) => !/^\s*import\b/.test(l) && !/^\s*\}\s*from\s*'/.test(l))
    .join('\n');
  return new RegExp(`\\b${PRIMITIVE}\\b`).test(code);
}

describe('CUL-641 — every soft delete goes through the one shared reversal', () => {
  it('still finds the sanctioned reversal calling the primitive', () => {
    // Without this the guard passes vacuously the day someone renames either symbol —
    // the same floor `haptics.test.ts` and `completionCard.test.ts` pin.
    const src = fs.readFileSync(path.join(ROOT, SANCTIONED_PATH), 'utf8');
    expect(usesPrimitive(src)).toBe(true);
  });

  it('reverseLoggedEvent settles the weight snapshot', () => {
    // The side-effect this guard was written around. Pinning it here rather than only in
    // a unit test means deleting the wiring breaks the guard that explains why it exists.
    const src = stripComments(fs.readFileSync(path.join(ROOT, SANCTIONED_PATH), 'utf8'));
    expect(/\breconcileWeightSnapshotAfterDelete\b/.test(src)).toBe(true);
  });

  it('no other file reaches past it for the raw primitive', () => {
    const offenders = sourceFiles()
      .filter((rel) => rel !== DEFINITION && rel !== SANCTIONED_PATH)
      .filter((rel) => {
        const src = readSource(path.join(ROOT, rel));
        if (src === null) return false;
        return usesPrimitive(src) && !EXEMPTION.test(src);
      });

    // The remedy rides in the finding string: jest's expect takes no message argument,
    // and a bare list of paths does not tell the next author what the build wants.
    expect(
      offenders.map(
        (rel) =>
          `${rel} calls ${PRIMITIVE} directly — use reverseLoggedEvent (${SANCTIONED_PATH}) so this ` +
          `path inherits the side-effects removal implies (CUL-641: the weight snapshot), ` +
          `or add an inline "// reverse-path-ok: <reason>".`,
      ),
    ).toEqual([]);
  });
});
