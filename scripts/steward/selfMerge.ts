// The self merge verdict (CUL-2874, Workflow v2 PR-08): may a green PR merge itself, a
// deploy included, or does it wait for the PM's typed word?
//
// THE RULING (PM, 2026-11-21, typed in session): "Let's go wide self merge w the
// opportunity to rollback." Every green change merges itself unless it touches a path on
// this deny list. The typed `merge` on every deploy (CUL-1654) was a wait, not a review:
// nobody reads the code by hand here. What is held is defined by fixed paths, categories
// and labels, never by the authoring session's own judgment of its risk; unsure counts as
// held; the approval is pinned to the head the check ran on. No size cap.
//
// WHAT IS HELD, in order (every hit is a reason; one is enough):
//   1. the gate's own files: the hooks, settings, CI and deploy workflows, the deploy
//      scripts, scripts/steward/, and the files that say who may merge;
//   2. a migration or any SQL, unless the PM typed `apply <NNN>` for exactly that number
//      and the PR holds nothing else (the amendment's fix 2: `apply` is the merge word);
//   3. every file the kept list (scripts/kept/kept.ts, PR-30) calls stakes by path:
//      clinical surfaces, privacy, RLS, Storage, deletion, export, share links, money,
//      App Store and legal, product code it cannot place, a path it does not know;
//   4. all of supabase/functions/, function by function, `_shared/` included: every
//      function today is clinical or privacy, and `_shared/http.ts` holds the timeout
//      contract that keeps a hung read off the degrade-to-benign path;
//   5. the reviewers and skills that guard clinical and privacy work, and a guard whose
//      name hits a clinical or privacy stem;
//   6. a changed line in product code that holds a string with a clinical word (the
//      amendment's fix 3: owner-facing warning text lives in ordinary copy files);
//   7. a named issue labelled Gate: clinical, Gate: privacy, Area: Privacy/RLS,
//      Area: Correctness or Live harm; labels not passed at all;
//   8. a deploy while the 1.2.0 checkpoint is on (below), or one the check cannot read.
//
// THE 1.2.0 CHECKPOINT (the amendment's fix 1). The check after a self merged deploy
// (CUL-2885) catches a function that stops answering, not one that answers wrongly, and
// until L2 to L4 on CUL-2859 are ruled there is no crash data and no kill switch. So once
// the first public build ships, a change that DEPLOYS is held until the PM reconfirms;
// a change that deploys nothing carries on. The release flips PUBLIC_BUILD_SHIPPED; the
// PM's reconfirmation sets DEPLOY_SELF_MERGE_RECONFIRMED. This file is a gate file, so
// both edits are themselves the PM's merge.
//
// Pure: no I/O. selfMerge-cli.ts reads the landing and calls it; merge-check.sh prints it.
//
// STATED BLIND SPOTS (C-38):
//   - `applied` is the session's statement that the PM typed `apply <NNN>` and that
//     `list_migrations` shows it applied; the check cannot read the database.
//   - Labels are what the session passes; leaving them out holds, passing a short list
//     does not. The replay (CUL-2874's PR) found every labelled PR already held by path.
//   - The clinical string rule reads words on changed lines that hold a quote, not
//     meaning: a clinical sentence built without a clinical word, or split across lines
//     with no quote on the line holding the word, is not seen by rule 6 (rule 3 still
//     reads its file's path).
//   - PUBLIC_BUILD_SHIPPED is flipped by a person at release. A release that forgets the
//     flip leaves deploys self merging; CUL-2859's release checklist carries the line.

import { CLINICAL_WORDS, keptOf, NAME_STEMS, wordsOf } from '../kept/kept.ts';

// ---- the 1.2.0 checkpoint -----------------------------------------------------------
/** True from the day the first public (App Store) build ships. Flipped by the release. */
export const PUBLIC_BUILD_SHIPPED = false;
/** The PM's reconfirmation after that day: the date and the issue it was typed on. */
export const DEPLOY_SELF_MERGE_RECONFIRMED: { on: string; issue: string } | null = null;

export type Release = { shipped: boolean; reconfirmed: { on: string; issue: string } | null };
export const RELEASE: Release = { shipped: PUBLIC_BUILD_SHIPPED, reconfirmed: DEPLOY_SELF_MERGE_RECONFIRMED };

// ---- inputs and the answer ----------------------------------------------------------
export type SelfMergeInput = {
  files: string[]; // every file the landing changes against its base
  deploys: string[]; // the functions landing deploys (deploys.ts)
  deployUnread?: string; // why the check could not tell what deploys, or main's deploy record is off
  changedLines?: { file: string; line: string }[]; // the landing's added and removed lines
  labels: string[] | null; // the named issues' labels; null when the session passed none
  applied?: string | null; // the migration number the PM typed `apply` for
  release?: Release; // the checkpoint; RELEASE unless a test says otherwise
};

export type SelfMerge = { verdict: 'open' | 'held'; reasons: string[]; deploys: boolean };

// ---- 1. the gate's own files ----------------------------------------------------------
const GATE = /^\.claude\/hooks\/|^\.claude\/settings[^/]*\.json$|^\.github\/workflows\/|^\.githooks\/|^scripts\/deploy-edge\.sh$|^scripts\/edge-deploy\/|^scripts\/steward\/|^scripts\/kept\/|^\.claude\/skills\/steward\/|^\.claude\/commands\/(dispatch|wrap)\.md$|^jest\.config\.js$|^package(-lock)?\.json$|^tsconfig\.json$|^guards\/(mergeCheck|fixtureRoot|fixtureDiscipline)\b/;

// ---- 4. supabase/functions, function by function ------------------------------------
// Every function deployed today, and why it is held. A function or folder not listed is
// held as unknown, so a new function never opens by being new.
export const FUNCTIONS: Record<string, string> = {
  'analyze-stool': 'clinical (a per-incident AI read)',
  'analyze-vomit': 'clinical (a per-incident AI read)',
  'generate-signal': 'clinical (the detection engine)',
  'generate-report': 'clinical (the vet report)',
  ask: 'clinical (Ask, an LLM over the pet record)',
  'extract-medication-from-photo': 'clinical (medication extraction)',
  'extract-food-from-photo': 'privacy (an uploaded photo into the per-account food library)',
  'delete-account': 'privacy (account deletion)',
  'reap-report-drafts': 'privacy (deletion of report drafts)',
  'report-visit-link': 'privacy (a share link)',
  'sweep-orphaned-storage': 'privacy (Storage deletion)',
  _shared: 'clinical or privacy (the shared modules every function imports)',
  'deploy-manifest.json': 'the deploy path (the manifest of holds)',
};

// ---- 5. the instruments that guard clinical and privacy work -------------------------
const GUARDIANS = /^\.claude\/(agents\/(adversarial-reviewer|rls-privacy-reviewer|vet-report-cold-read)\.md|skills\/(clinical-guardrails|supabase-sync|nyx-voice)\/)/;

// ---- 6. product code, whose changed strings are read for clinical words ----------------
const PRODUCT = /^(app|components|constants|hooks|lib|store|supabase|widgets)\//;
const QUOTED = /['"`]/;

// ---- 7. labels ------------------------------------------------------------------------
const HELD_LABELS: Record<string, string> = {
  'gate:clinical': 'Gate: clinical',
  'gate:privacy': 'Gate: privacy',
  'area:privacy/rls': 'Area: Privacy/RLS',
  'area:correctness': 'Area: Correctness',
  liveharm: 'Live harm',
};
const labelKey = (l: string) => l.toLowerCase().replace(/\s+/g, '');

// Root files that are prose, not code: the fixtures' and the repo's own.
const ROOT_PROSE = /^[^/]+\.(md|txt)$/;
const MIGRATION = /^supabase\/migrations\/|\.sql$/;
const migrationNumber = (f: string) => (f.match(/^supabase\/migrations\/0*(\d+)_/) ?? [])[1] ?? null;

/** Why one file holds the merge, or null when it is open. `applied` is checked by the caller. */
export function fileHold(f: string): string | null {
  if (GATE.test(f)) return 'the gate\'s own files';
  if (MIGRATION.test(f)) return 'a migration (merges on the PM\'s `apply <NNN>`)';
  const fn = f.match(/^supabase\/functions\/([^/]+)/);
  if (fn) return FUNCTIONS[fn[1]] ?? `an Edge Function the list does not name (${fn[1]})`;
  if (f.startsWith('supabase/')) return 'server configuration the list does not place (supabase/)';
  if (GUARDIANS.test(f)) return 'a reviewer or skill that guards clinical or privacy work';
  if (f.startsWith('guards/')) {
    const words = wordsOf(f.slice('guards/'.length));
    const hit = NAME_STEMS.find((n) => n.kept === 'stakes' && words.some((w) => n.stems.some((s) => w.startsWith(s))));
    return hit ? `a guard over a ${hit.why} (by name)` : null;
  }
  if (ROOT_PROSE.test(f)) return null;
  const stakes = keptOf({ files: [f] }).reasons.filter((r) => r.startsWith('stakes: ')).map((r) => r.slice('stakes: '.length));
  return stakes.length ? stakes.join('; ') : null;
}

export function selfMerge(input: SelfMergeInput): SelfMerge {
  const release = input.release ?? RELEASE;
  const files = input.files.map((f) => f.trim()).filter(Boolean);
  const reasons: string[] = [];
  const deploys = input.deploys.length > 0 || Boolean(input.deployUnread);

  if (!files.length) reasons.push('nothing to land was read (uncertain counts as held)');

  // `apply` is the merge word only for a PR that is that migration and nothing else.
  const migrations = files.filter((f) => MIGRATION.test(f));
  const rest = files.filter((f) => !MIGRATION.test(f) && !f.startsWith('docs/sessions/'));
  const numbers = new Set(migrations.map(migrationNumber));
  const applied = input.applied ? String(Number(input.applied)) : null;
  const applyCovers = Boolean(applied) && migrations.length > 0 && rest.length === 0 && numbers.size === 1 && applied !== null && numbers.has(applied);
  if (input.applied && !applyCovers) {
    reasons.push(
      migrations.length === 0
        ? `--applied ${input.applied} names a migration this landing does not carry`
        : rest.length
          ? `\`apply ${input.applied}\` covers a migration PR alone, and this one also changes ${rest.slice(0, 3).join(', ')}${rest.length > 3 ? ', …' : ''}`
          : `\`apply ${input.applied}\` does not name this landing's migration (${[...numbers].join(', ')})`,
    );
  }

  for (const f of files) {
    if (applyCovers && MIGRATION.test(f)) continue;
    const why = fileHold(f);
    if (why) reasons.push(`${f}: ${why}`);
  }

  const clinicalLines = (input.changedLines ?? []).filter((l) => PRODUCT.test(l.file) && QUOTED.test(l.line) && CLINICAL_WORDS.test(l.line));
  const byFile = new Set(clinicalLines.map((l) => l.file));
  for (const f of byFile) reasons.push(`${f}: a changed string holds a clinical word (owner or vet facing health text)`);

  if (input.labels === null) reasons.push('the named issues\' labels were not passed (--labels), so a clinical or Live harm label is unread');
  else {
    for (const l of input.labels) {
      const name = HELD_LABELS[labelKey(l)];
      if (name) reasons.push(`a named issue is labelled ${name}`);
    }
  }

  if (input.deployUnread) reasons.push(`what this merge deploys is unread or owed: ${input.deployUnread}`);
  if (deploys && release.shipped && !release.reconfirmed) {
    reasons.push('the 1.2.0 checkpoint: the first public build shipped, so a change that deploys waits for the PM to reconfirm self merge');
  }

  const unique = [...new Set(reasons)];
  return { verdict: unique.length ? 'held' : 'open', reasons: unique, deploys };
}
