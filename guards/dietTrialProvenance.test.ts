// A diet trial's WINDOW PROVENANCE is read by the vet report, and by nothing else.
//
// CUL-1041 (trial-window PR 4) · migration 068 · `docs/nyx-trial-extension-requirements.md` §5.1.
//
// WHY THIS FILE EXISTS. Migration 068 added three columns to `diet_trials` and, in the
// section it addressed to this PR, refused to settle their sensitivity by naming their
// types: "SENSITIVITY IS A QUESTION ABOUT MEANING, NOT TYPE … their whole purpose is to
// let a reader infer *the signs had not resolved at eight weeks*, which is a clinical
// inference about a specific animal." The repo already holds that test — the widget's
// App Group snapshot excludes `indication` on a MEANING basis, not a type one — and by
// it these columns rank HIGHER than the one already excluded: `indication` names what is
// SUSPECTED, while `target_duration_set_at` + `target_duration_days_initial` name what
// HAPPENED, a negative treatment-response finding. `target_duration_vet_directed`
// additionally carries a claim about a third party.
//
// The migration then asserted the containment as a fact about the tree — "nothing today
// can reach them (every server and client reader uses an explicit column list)" — and PR
// 4 shipped the first reader. A claim in a comment that the build does not check is a
// cheque the code does not cash (C-38, and 045's diagnosis before it), so this is the
// check. The line the repo holds is not "too sensitive to render": the vet report's whole
// purpose is disclosing this class of fact to this reader, and `indication` renders on
// that same page. The line is **for the report, and for nothing else.**
//
// THE EMPTY SET IS THE ASSERTION (C-32). `ALLOWED` is an EXEMPTION, and every entry is
// earned with a written reason. The registry holds no consumer outside
// `generate-report`, and that zero is the rule — the first module that adds one reds this
// file and has to argue for it, rather than walking a treatment-failure inference into
// the App Group, the `ask` LLM boundary or an export with nothing going red. Listing a
// file here to record that somebody thought about it is what this shape exists to stop.
//
// WHAT IT DOES NOT CLAIM, stated rather than implied, because an undocumented blind spot
// reads as coverage (C-38):
//
//   · It is a SOURCE SCAN over identifiers. It proves no module outside the registry
//     NAMES these columns; it cannot prove one does not receive their values through a
//     variable renamed on the way. Review's job, not a scan's.
//   · It says nothing about the RENDERED artifact's afterlife. `shareReportPdf` writes
//     the whole report to a file, and where that file lands is `lib/pdf.ts`'s business
//     and CUL-1044's — "report-only" is a claim about the surface, not the residue.
//   · It does not gate the report's own AUDIENCE. `ReportAudience` discriminates exactly
//     one thing today (look notes), and the window clause has no audience arm, so a
//     share link would disclose it. That is a live PM decision on the unshipped PR 6
//     (CUL-1045), not something a scan can settle.
//   · The local SQLite mirror legitimately DECLARES these columns (`lib/localSchema.ts`,
//     `lib/dietTrialMirror.ts`) while `hydrateDietTrials` never fetches them, so they sit
//     NULL on every device. This guard pins the declaration sites; the *absence* of a
//     hydrate is pinned by the remote-projection half below.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');

/** The six spellings — snake as stored, camel as mapped. */
const PROVENANCE = [
  'target_duration_days_initial',
  'target_duration_set_at',
  'target_duration_vet_directed',
  'targetDurationDaysInitial',
  'targetDurationSetAt',
  'targetDurationVetDirected',
];

/**
 * THE REGISTRY IS AN EXEMPTION, AND EACH ENTRY IS EARNED (C-32).
 *
 * Note what is NOT here and could easily have been: `generate-report/render.ts` names all
 * three columns — in prose, explaining why the sentence reads as it does. Comments are
 * blanked before the scan, so it never becomes an entry, and the registry keeps meaning
 * "modules that handle these values" rather than "files that mention them".
 */
const ALLOWED: Record<string, string> = {
  'supabase/functions/generate-report/index.ts':
    'THE reader. Adds the three columns to the existing pet-scoped diet_trials select and maps them onto ReportDietTrialInput. The only place in the tree that asks the server for them.',
  'supabase/functions/generate-report/report.ts':
    'Transport only — three optional fields on ReportDietTrialInput, carrying the migration’s contract in their doc comment. Reads nothing and decides nothing.',
  'supabase/functions/generate-report/trial.ts':
    'The derivation. deriveWindowChange resolves the three columns into one TrialWindowChange, because placing the move on a trial day needs ctx.startDayIndex and the report’s zone.',
  'lib/localSchema.ts':
    'DECLARES the local mirror columns (migration 068’s "also owed"). No reader and no writer: hydrateDietTrials does not fetch them, so they stay NULL on device.',
  'lib/dietTrialMirror.ts':
    'The local CREATE TABLE beside localSchema’s migration rows, same reason. Its dietTrialRowToRemote push mapper deliberately OMITS all three, so a device cannot clobber the server’s provenance back to NULL.',
  'scripts/render-trial-report-sample.deno.ts':
    'A fixture generator for the vet-report-cold-read gate. Pure — no network, no Supabase, synthetic pets only; it renders the artifact the review reads.',
};

/** Every non-test source in the tree, derived from the REPOSITORY rather than from a list
 *  in this file — a floor that iterates its own constant is green when a directory is
 *  dropped from it (C-38, measured on `guards/visitReaders.test.ts`). */
function sources(): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'coverage', 'dist']);
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || skip.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(abs);
    }
  };
  walk(ROOT);
  return out.map((f) => path.relative(ROOT, f)).sort();
}

const code = (rel: string): string => blankComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

describe('CUL-1041 — the window-provenance columns are the vet report’s, and nobody else’s', () => {
  it('names a non-vacuous set of sources, including the ones it is about', () => {
    // The floor, derived from the repository. Without it every assertion below is a
    // statement about an empty list, and eight green tests measure nothing (C-36).
    const files = sources();
    expect(files.length).toBeGreaterThan(300);
    for (const rel of Object.keys(ALLOWED)) {
      expect(files).toContain(rel);
    }
    // And the scan can actually see the identifiers it is keyed on — a detector that
    // matches nothing anywhere is indistinguishable from a rule nobody has broken.
    const hits = files.filter((rel) => PROVENANCE.some((c) => code(rel).includes(c)));
    expect(hits.length).toBeGreaterThan(0);
  });

  it('is handled by the registered modules and no others', () => {
    const unregistered = sources()
      .filter((rel) => !(rel in ALLOWED))
      .filter((rel) => PROVENANCE.some((c) => code(rel).includes(c)));

    expect(unregistered).toEqual([]);
  });

  it('every registry entry still handles them — an entry is not a parking space', () => {
    // The mirror of the rule above, and the half `guards/symptomLists.test.ts` learned by
    // getting it wrong (C-32): a registry that is never checked back against reality
    // accumulates entries for files that stopped being readers, and each dead entry is a
    // pre-authorised hole for whatever is written there next.
    for (const [rel, why] of Object.entries(ALLOWED)) {
      expect(PROVENANCE.some((c) => code(rel).includes(c))).toBe(true);
      expect(why.length).toBeGreaterThan(40);
    }
  });

  it('no REMOTE diet_trials read sweeps them up with select(*)', () => {
    // The other direction, and the one the migration's own claim rested on: a projection
    // that does not spell its columns does not have to name these to receive them. Keyed
    // on the supabase-js chain, so the LOCAL `SELECT * FROM diet_trials WHERE synced = 0`
    // in the mirror's push path is out of scope by shape rather than by exemption — it
    // reads a SQLite table whose provenance columns are never hydrated.
    const offenders: string[] = [];
    for (const rel of sources()) {
      const src = code(rel);
      const re = /\.from\(\s*['"`]diet_trials['"`]\s*\)/g;
      for (let m = re.exec(src); m !== null; m = re.exec(src)) {
        const next = src.indexOf('.from(', m.index + 1);
        const chain = src.slice(m.index, next === -1 ? src.length : next);
        if (/\.select\(\s*['"`]\s*\*\s*['"`]/.test(chain)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
