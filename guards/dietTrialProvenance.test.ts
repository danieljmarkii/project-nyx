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
// THE EMPTY SET OUTSIDE THE REGISTRY IS THE ASSERTION (C-32). `ALLOWED` is an EXEMPTION,
// and every entry is earned with a written reason. A module that is not in it and names
// these columns reds this file and has to argue for itself, rather than walking a
// treatment-failure inference into the App Group, the `ask` LLM boundary or an export with
// nothing going red. Listing a file here to record that somebody thought about it is what
// this shape exists to stop.
//
// IT HAS ALREADY FIRED ONCE, WHICH IS WHY THIS PARAGRAPH IS WORDED AS IT IS. Written for
// PR 4, the registry named `generate-report` and nothing else, and the header said so —
// "the registry holds no consumer outside `generate-report`, and that zero is the rule".
// PR 2 (CUL-1039) then merged the write path and this file went red on
// `lib/dietTrialSetup.ts` and `lib/sync.ts`. Both are legitimate and both were verified
// before being admitted (the writer assigns `vet_directed` unconditionally from its own
// call's checkbox; the hydrate uses an explicit column list) — but the sentence about a
// permanent zero was a claim the code stopped cashing the moment the second handler
// landed, inside a guard whose whole subject is that class of claim. The rule was never
// "only the report"; it is "these modules, each for a stated reason, and no others".
//
// WHAT IT DOES NOT CLAIM, stated rather than implied, because an undocumented blind spot
// reads as coverage (C-38):
//
//   · It is a SOURCE SCAN over identifiers. It proves no module outside the registry
//     NAMES these columns; it cannot prove one does not receive their values through a
//     variable renamed on the way. Review's job, not a scan's.
//   · It says nothing about the RENDERED artifact's afterlife. `shareReportPdf` writes
//     the whole report to a file, and where that file lands is `lib/pdf.ts`'s business
//     and CUL-1045's — "report-only" is a claim about the surface, not the residue.
//   · It does not gate the report's own AUDIENCE. `ReportAudience` discriminates exactly
//     one thing today (look notes), and the window clause has no audience arm, so a
//     share link would disclose it. That is a live PM decision on the unshipped PR 6
//     (CUL-1046), not something a scan can settle.
//   · The columns REACH THE DEVICE as of PR 2 (CUL-1039), and that is a change from what
//     the CUL-1041 access-control pass recorded — it observed that `hydrateDietTrials` did
//     not select them, so they sat NULL on every device. `lib/sync.ts` now pulls them, by
//     an explicit column list, so an owner sees her own window change after a round trip.
//     What that costs is covered elsewhere, and is stated here rather than assumed: the
//     widget's App Group snapshot (`ACTIVE_DIET_TRIAL_QUERY`) still excludes all three —
//     re-verified when PR 2 merged, not inherited — and `diet_trials` is already in
//     `LOCAL_WIPE_TABLES`, so a sign-out takes them with the rest of the row.

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
    'DECLARES the local mirror columns (migration 068’s "also owed"), so the PR 2 write path has somewhere to write. Declaration only — no read, no write.',
  'lib/dietTrialMirror.ts':
    'The local CREATE TABLE beside localSchema’s migration rows, same reason, plus the push mapper that carries an owner’s window change up to the server.',
  'lib/dietTrialSetup.ts':
    'THE WRITER (CUL-1039, PR 2). changeTrialWindow stamps COALESCE(initial, target_duration_days) so the FIRST window survives every later move, writes set_at on every change because it is the predicate, and assigns vet_directed unconditionally from THAT call’s own checkbox — never leaving a prior true in place for a later owner-initiated move.',
  'lib/sync.ts':
    'hydrateDietTrials, which pulls the three columns down and mirrors them locally so an owner sees her own window change after a round trip. An explicit column list, never a select(*).',
  'scripts/render-trial-report-sample.deno.ts':
    'A fixture generator for the vet-report-cold-read gate. Pure — no network, no Supabase, synthetic pets only; it renders the artifact the review reads.',
  'lib/dietTrialFacts.ts':
    'THE CLIENT READ (CUL-1040, PR 3). Adds set_at ALONE to TRIAL_FOR_CARD_SQL — never initial, never vet_directed, which the card has no use for — and maps it onto TrialCardTrial for the one line §4.3 owes. Its own loader is also the widget\u2019s entry point; see the containment test below, which is what this entry rests on.',
  'lib/dietTrialCard.ts':
    'The pure resolver, which reads set_at for ONE purpose: withWindowMovedLine appends a `forward` line for the rest of the local day the window moved. It renders the CURRENT end date, which windowLineFor already puts on the same card — not the original window, not the delta, not the attribution — so the line discloses no inference the columns are protected for.',
  'lib/trialWindowSheet.ts':
    'Builds that line (windowMovedTodayLine) and nothing else from these columns. Takes the value as a parameter rather than reading a row, so it has no path to one; it lives beside the sheet\u2019s own rules because the copy is the sheet\u2019s copy.',
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

  it('the client read does NOT carry them across the App Group boundary (CUL-1040)', () => {
    // THE CLAIM THE THREE CLIENT ENTRIES REST ON, as a test rather than a sentence —
    // which is this file's own subject (C-38).
    //
    // `lib/dietTrialFacts.ts` maps set_at inside `loadTrialPredicateFacts`, and that
    // function is ALSO `lib/widgetSnapshot.ts`'s entry point (`:543`) — the card's own
    // `loadDietTrialFacts` delegates to it (`:431`), so there is one mapping, not two.
    // What keeps the value off the widget is that the publisher takes only the COVERAGE
    // NUMBERS out of the result and discards `predicate.trial` wholesale. That is
    // containment by the consumer's discipline, so it is pinned here: the publisher may
    // read `predicate.facts.*` and nothing else.
    //
    // The widget's own trial row comes from `ACTIVE_DIET_TRIAL_QUERY`, asserted separately
    // below, and this is the second of the two doors.
    const pub = code('lib/widgetSnapshot.ts');
    const reads = [...pub.matchAll(/predicate\??\.([A-Za-z_]+)/g)].map((m) => m[1]);
    // Non-vacuity first: if the publisher stopped naming `predicate` at all, an empty
    // set would satisfy every assertion below for free (C-36).
    expect(reads.length).toBeGreaterThan(0);
    expect(new Set(reads)).toEqual(new Set(['facts']));

    // And the widget's own query still spells its columns without these three — re-verified
    // here rather than inherited from the PR 2 pass that last checked it.
    const widgetQuery = code('lib/dietTrialMirror.ts');
    const m = /ACTIVE_DIET_TRIAL_QUERY\s*=\s*`([^`]*)`/.exec(widgetQuery);
    expect(m).not.toBeNull();
    for (const col of PROVENANCE) {
      expect((m as RegExpExecArray)[1]).not.toContain(col);
    }
  });

  it('the rendered line reaches exactly ONE surface — the Pet-tab card (CUL-1040)', () => {
    // `withWindowMovedLine` appends to the SHARED `TrialCardModel.lines`, and a line
    // appended to a shared model travels wherever the model travels. Six modules import
    // `lib/dietTrialCard.ts`; only the card component reads `.lines`, and the rest take
    // named helpers or types. If a second reader appears — `lib/daySummary.ts` is the one
    // that would matter, because the notification spec's D3 forbids a body that asserts
    // record contents — this reds and that reader has to say what it does about the line.
    const readers = sources().filter((rel) => {
      const src = code(rel);
      if (!/from\s+['"][^'"]*dietTrialCard['"]/.test(src)) return false;
      return /\.lines\b/.test(src);
    });
    expect(readers).toEqual(['components/profile/DietTrialCard.tsx']);
    // Non-vacuity: the importer set is real and larger than the reader set, so the
    // filter above is discriminating rather than matching nothing.
    const importers = sources().filter((rel) =>
      /from\s+['"][^'"]*dietTrialCard['"]/.test(code(rel)),
    );
    expect(importers.length).toBeGreaterThan(readers.length);
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
