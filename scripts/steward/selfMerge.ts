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
// WHAT IS HELD (every hit is a reason; one is enough). Tightened after the first
// adversarial pass (2026-11-25), which opened six clinical changes on the first list:
//   1. the gate's own files: hooks, settings, every workflow, the deploy scripts,
//      scripts/steward/ and scripts/kept/, jest and babel config, mocks, and the files
//      that say who may merge;
//   2. a migration or any SQL, unless the PM typed `apply <NNN>` for exactly that number
//      and the PR is that one migration (plus its session record): `apply` is the word;
//   3. every file the kept list (scripts/kept/kept.ts, PR-30) calls stakes by path;
//   4. all of supabase/; and any deploy of a function OPEN_FUNCTIONS does not name (none
//      is named: every function today is clinical or privacy, `_shared/http.ts` included,
//      which keeps a hung read off the degrade-to-benign path);
//   5. CLAUDE.md, .claude/rules/ and .claude/agents/, the guarding skills, every guard but
//      the budget and filing ones, research briefs, and a doc named for a clinical or
//      privacy surface: what future clinical work is held to;
//   6. product code off kept.ts's UI mechanics list (less lib/utils.ts, whose day counters
//      the detection engine reads), read by every word of the whole path; a screen kept.ts
//      calls taste holds here, since a withhold rule needs no clinical word in its name;
//   7. any changed line in product code with a clinical word, quoted or not;
//   8. a named issue labelled Gate: clinical, Gate: privacy, Area: Privacy/RLS,
//      Area: Correctness or Live harm, however spelled; labels not passed, or passed empty
//      (`none` is how a session says there are none);
//   9. a deploy while the 1.2.0 checkpoint is on, or one the check cannot read.
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
//   - Rule 7 reads words, not meaning: a clinical sentence with no clinical word in it is
//     not seen. It matters only on the UI mechanics files, since rule 6 holds the rest.
//   - PUBLIC_BUILD_SHIPPED is flipped by a person at release. A release that forgets the
//     flip leaves deploys self merging; CUL-2859's release checklist carries the line.

import { CLINICAL_WORDS, keptOf, NAME_STEMS, UI_MECHANICS } from '../kept/kept.ts';

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
  openFunctions?: Record<string, string>; // OPEN_FUNCTIONS unless a test says otherwise
  deployUnread?: string; // why the check could not tell what deploys, or main's deploy record is off
  changedLines?: { file: string; line: string }[]; // the landing's added and removed lines
  labels: string[] | null; // the named issues' labels; null when the session passed none
  applied?: string | null; // the migration number the PM typed `apply` for
  release?: Release; // the checkpoint; RELEASE unless a test says otherwise
};

export type SelfMerge = { verdict: 'open' | 'held'; reasons: string[]; deploys: boolean };

// ---- 1. the gate's own files ----------------------------------------------------------
const GATE = /^\.claude\/hooks\/|^(jest|babel|metro)[\w.-]*\.js$|(^|\/)__mocks__\/|^\.claude\/settings[^/]*\.json$|^\.github\/workflows\/|^\.githooks\/|^scripts\/deploy-edge\.sh$|^scripts\/edge-deploy\/|^scripts\/steward\/|^scripts\/kept\/|^\.claude\/skills\/steward\/|^\.claude\/commands\/(dispatch|wrap)\.md$|^jest\.config\.js$|^package(-lock)?\.json$|^tsconfig\.json$|^guards\/(mergeCheck|fixtureRoot|fixtureDiscipline)\b/;

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

// The functions whose deploy may merge itself when every file it touches is open. Empty:
// every function deployed today is clinical or privacy (FUNCTIONS above), so a merge that
// deploys anything holds until the PM opens a function here, which is a gate-file merge.
export const OPEN_FUNCTIONS: Record<string, string> = {};

// ---- 5. the rules and instruments future clinical and privacy work is held to ---------
// CLAUDE.md holds the safety invariants and who may merge; the rules files, the reviewers
// and these skills decide what a clinical or privacy change must pass.
const GUARDIANS = /^CLAUDE\.md$|^\.claude\/(rules|agents)\/|^\.claude\/skills\/(clinical-guardrails|supabase-sync|nyx-voice|backlog-groomer)\//;
// Guards are held, unsure counting as protected, but for the budget and filing guards,
// which read instruction text, not product code.
const OPEN_GUARDS = new Set(['guards/claudeMdBudget.test.ts', 'guards/filingRule.test.ts', 'guards/styleLiteralBudget.test.ts']);

// ---- 6. product code: only the UI mechanics open ---------------------------------------
// kept.ts calls an unplaced screen taste, which is the PM's call on a plan, not a reason
// a merge is safe: a Home screen can hold a withhold rule with no clinical word in it. So
// for the merge, product code opens only on kept.ts's UI mechanics list (and its tests),
// less lib/utils.ts, which holds the day counters the detection engine reads.
const PRODUCT = /^(app|components|constants|hooks|lib|store|supabase|widgets)\//;
const MERGE_OPEN = new Set([...UI_MECHANICS].filter((f) => f !== 'lib/utils.ts'));
// Every word of a path, the whole basename included (`index.intakeDecline.test.tsx` reads
// index · intake · decline · test).
const allWords = (f: string) =>
  f
    .replace(/\.(tsx?|jsx?|mjs|json|md|sh|py|sql|ya?ml|html|txt)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const stemHit = (f: string) => NAME_STEMS.find((n) => n.kept === 'stakes' && allWords(f).some((w) => n.stems.some((st) => w.startsWith(st))));

// ---- 7. labels ------------------------------------------------------------------------
const HELD_LABELS: Record<string, string> = {
  'gate:clinical': 'Gate: clinical',
  'gate:privacy': 'Gate: privacy',
  'area:privacy/rls': 'Area: Privacy/RLS',
  'area:correctness': 'Area: Correctness',
  liveharm: 'Live harm',
};
const labelKey = (l: string) => l.toLowerCase().replace(/[\s_-]+/g, '');

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
  if (GUARDIANS.test(f)) return 'a rule, reviewer or skill that clinical or privacy work is held to';
  if (f.startsWith('guards/')) return OPEN_GUARDS.has(f) ? null : 'a guard (guards are held; only the instruction budget and filing guards open)';
  if (f.startsWith('docs/research/')) return 'a clinical research brief';
  if (/^docs\/.+\.md$/.test(f) && !f.startsWith('docs/sessions/')) {
    const hit = stemHit(f.slice('docs/'.length));
    if (hit) return `a spec or doc over a ${hit.why} (by name)`;
  }
  if (ROOT_PROSE.test(f)) return null;
  const stakes = keptOf({ files: [f] }).reasons.filter((r) => r.startsWith('stakes: ')).map((r) => r.slice('stakes: '.length));
  if (stakes.length) return stakes.join('; ');
  if (PRODUCT.test(f) && !MERGE_OPEN.has(f.replace(/\.test(\.\w+)$/, '$1'))) {
    const hit = stemHit(f);
    return hit ? `${hit.why} (by its whole name)` : 'product code off the UI mechanics list (a screen is held whatever its words)';
  }
  return null;
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
  const applyCovers = applied !== null && migrations.length === 1 && rest.length === 0 && numbers.has(applied);
  if (input.applied && !applyCovers) {
    reasons.push(
      migrations.length === 0
        ? `--applied ${input.applied} names a migration this landing does not carry`
        : rest.length
          ? `\`apply ${input.applied}\` covers a migration PR alone, and this one also changes ${rest.slice(0, 3).join(', ')}${rest.length > 3 ? ', …' : ''}`
          : migrations.length > 1
            ? `\`apply ${input.applied}\` covers one migration, and this landing carries ${migrations.length}`
            : `\`apply ${input.applied}\` does not name this landing's migration (${[...numbers].join(', ')})`,
    );
  }

  for (const f of files) {
    if (applyCovers && MIGRATION.test(f)) continue;
    const why = fileHold(f);
    if (why) reasons.push(`${f}: ${why}`);
  }

  // Any changed line, quoted or not: JSX text and a template literal's middle line carry
  // no quote. Mostly it reaches the UI mechanics files, since other product code holds.
  const clinicalLines = (input.changedLines ?? []).filter((l) => PRODUCT.test(l.file) && CLINICAL_WORDS.test(l.line));
  const byFile = new Set(clinicalLines.map((l) => l.file));
  for (const f of byFile) reasons.push(`${f}: a changed line holds a clinical word (owner or vet facing health text)`);

  if (input.labels === null) reasons.push('the named issues\' labels were not passed (--labels), so a clinical or Live harm label is unread');
  else {
    for (const l of input.labels) {
      const name = HELD_LABELS[labelKey(l)];
      if (name) reasons.push(`a named issue is labelled ${name}`);
    }
  }

  const open = input.openFunctions ?? OPEN_FUNCTIONS;
  for (const fn of input.deploys) {
    if (!(fn in open)) reasons.push(`deploys ${fn}: ${FUNCTIONS[fn] ?? 'a function the list does not name'}; a deploy merges itself only for a function OPEN_FUNCTIONS names`);
  }
  if (input.deployUnread) reasons.push(`what this merge deploys is unread or owed: ${input.deployUnread}`);
  if (deploys && release.shipped && !release.reconfirmed) {
    reasons.push('the 1.2.0 checkpoint: the first public build shipped, so a change that deploys waits for the PM to reconfirm self merge');
  }

  const unique = [...new Set(reasons)];
  return { verdict: unique.length ? 'held' : 'open', reasons: unique, deploys };
}
