/**
 * deployStatus.lib.js — the pure comparison logic behind `scripts/deploy-status.js`.
 *
 * WHY THIS EXISTS
 * ---------------
 * "What is live vs. what is on `main`" was tracked as English prose in STATUS.md.
 * Prose captures the *dramatic* holds (B-494's `generate-report` freeze is recorded
 * precisely, because five chairs argued about it) and silently misses the boring
 * ones — `delete-account` shipped a `vet_documents` purge and drifted three hours
 * later with nobody writing a sentence about it. Boring drift is the dangerous
 * kind: there is no argument attached to make it memorable.
 *
 * THE ONE RULE THIS FILE ENCODES
 * ------------------------------
 * A commit touching a function's dependency set is NOT drift. It is a *candidate*.
 *
 * That distinction is not pedantry, it is the finding that produced this file. On
 * 2026-07-28, FIVE commits touched `extract-food-from-photo`'s inputs since its
 * deployed version. Exactly ONE of them changed the built artifact:
 *
 *   08ca7521  685aa0f7   <- the tree at deploy time (v15)
 *   938c1d15  981f597b   <- B-414 canonicalizeProtein convergence fix: REAL change
 *   …3 later commits touching lib/protein.ts, all tree-shaken out
 *   HEAD      981f597b   <- identical to 938c1d15
 *
 * So a commit count of 5 described a delta of 1. Counting commits over-reports by
 * 5x here and would have under-reported nothing — but the same mechanism produces
 * the opposite error just as easily, and a checker that cries wolf gets ignored.
 * Only the hash knows.
 *
 * (The first hand-run of this analysis got the verdict BACKWARDS — it compared
 * `cf58457~1` to HEAD, found them identical, and concluded "never drifted", while
 * a shallow clone hid the two commits that actually mattered. Hence `filterRealCommits`
 * and the shallow-clone guard below.)
 *
 * So the ladder of confidence is explicit in the state names, and only the top rung
 * is allowed to say the word "drifted":
 *
 *   DRIFTED        deployed source hash != freshly-built bundle hash. Proof.
 *   CURRENT        hashes match. Proof.
 *   CANDIDATE      no deployed hash available; commits touch the dep set. A LEAD,
 *                  NOT A VERDICT — resolve it by hashing, never by redeploying.
 *   LIKELY_CURRENT no deployed hash, and zero commits touch the dep set.
 *   NOT_DEPLOYED   on disk, absent from the project.
 *   UNKNOWN        history too shallow to answer, and no hash to fall back on.
 *
 * Exact hashes need `SUPABASE_ACCESS_TOKEN` (see the Secrets Register). Without it
 * the best this can do is CANDIDATE, which is precisely the argument for the token.
 */

'use strict';

/**
 * Normalize a bundle's text before hashing, so the comparison is about the
 * PROGRAM rather than its byte encoding.
 *
 * WHY. `deploy-edge.sh` bundles with `--charset=ascii`, so a non-ASCII character
 * inside a string literal ships as the six characters `—`. The no-token
 * deploy transport hands that file to the Supabase MCP as a JSON string — and
 * JSON decodes `—` to a real em-dash before it is ever stored. The deployed
 * source is therefore byte-different from the local bundle while being the
 * IDENTICAL program: `"—"` and `"—"` are the same JavaScript string.
 *
 * Measured on `extract-food-from-photo` v16 (2026-07-28): 9 occurrences across 4
 * lines, and `SYSTEM_PROMPT` evaluated to the same 1175-character string on both
 * sides. Without this normalization, exact mode would report that function
 * DRIFTED forever and train everyone to ignore the tool — the classic false
 * positive that makes a checker worthless.
 *
 * LIMIT, stated rather than hidden: this rewrites `\uXXXX` anywhere in the file,
 * including inside comments and inside an already-escaped `\\uXXXX`. Both are
 * harmless for a comparison (it is applied identically to both sides), but it is
 * a normalization, not a parse.
 */
function normalizeForHash(text) {
  return String(text).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/** States, worst-first — the order the report sorts by. */
const STATE = {
  DRIFTED: 'DRIFTED',
  CANDIDATE: 'CANDIDATE',
  NOT_DEPLOYED: 'NOT_DEPLOYED',
  UNKNOWN: 'UNKNOWN',
  LIKELY_CURRENT: 'LIKELY_CURRENT',
  CURRENT: 'CURRENT',
};

const STATE_ORDER = [
  STATE.DRIFTED,
  STATE.NOT_DEPLOYED,
  STATE.CANDIDATE,
  STATE.UNKNOWN,
  STATE.LIKELY_CURRENT,
  STATE.CURRENT,
];

/** Only these mean "a human must do something." Drives the exit code. */
const ACTIONABLE = new Set([STATE.DRIFTED, STATE.NOT_DEPLOYED, STATE.CANDIDATE, STATE.UNKNOWN]);

/**
 * Classify one Edge Function.
 *
 * @param {object} input
 * @param {string}  input.name
 * @param {string|null} input.localSha      sha256 of the freshly-built bundle
 * @param {object|null} input.deployed      { version, updatedAt, sourceSha? } or null
 * @param {object}  input.git               { commits: [], historyComplete: bool }
 * @returns {{name, state, reason, version, localSha, deployedSha, commits}}
 */
function classifyFunction({ name, localSha, deployed, git }) {
  const commits = (git && git.commits) || [];
  const historyComplete = !!(git && git.historyComplete);
  const base = {
    name,
    version: deployed ? deployed.version : null,
    localSha: localSha || null,
    deployedSha: (deployed && deployed.sourceSha) || null,
    commits,
  };

  if (!deployed) {
    return { ...base, state: STATE.NOT_DEPLOYED, reason: 'on disk, not deployed to this project' };
  }

  // Rung 1 — proof. A hash comparison needs no history and cannot be fooled by
  // tree-shaking, reordering, or a dependency that changed without reaching this
  // bundle. When it is available nothing else is consulted.
  if (localSha && deployed.sourceSha) {
    return deployed.sourceSha === localSha
      ? { ...base, state: STATE.CURRENT, reason: 'deployed source matches the built bundle' }
      : {
          ...base,
          state: STATE.DRIFTED,
          reason: `deployed source differs from the built bundle (${short(deployed.sourceSha)} != ${short(localSha)})`,
        };
  }

  // Rung 2 — proxy. Deliberately cannot return DRIFTED.
  if (commits.length > 0) {
    return {
      ...base,
      state: STATE.CANDIDATE,
      reason:
        `${commits.length} commit(s) touch this bundle's inputs since v${deployed.version} was deployed — ` +
        'a LEAD, not drift: the change may be tree-shaken out. Hash it to decide.',
    };
  }

  if (!historyComplete) {
    return {
      ...base,
      state: STATE.UNKNOWN,
      reason:
        'no deployed hash, and the clone is too shallow to see whether anything changed ' +
        'since the deploy — this is silence, not a clean bill of health',
    };
  }

  return {
    ...base,
    state: STATE.LIKELY_CURRENT,
    reason: `no commit has touched this bundle's inputs since v${deployed.version} was deployed`,
  };
}

/**
 * Normalize a migration identity so an on-disk filename and a history row can be
 * compared. Files are `NNN_snake_name.sql`; history rows carry either a numeric
 * version (the B-162 backfill) or a 14-digit timestamp plus a `name` that
 * sometimes keeps its own numeric prefix (e.g. `021_medication_photos_rls`).
 * Stripping a LEADING run of digits+underscore from both sides is what makes the
 * two comparable — and it deliberately leaves `complete_003_vet_visit_attachments`
 * alone, because its digits are not a prefix.
 */
function normalizeMigrationName(raw) {
  return String(raw)
    .replace(/\.sql$/i, '')
    .replace(/^\d+_/, '')
    .trim()
    .toLowerCase();
}

/** The version the Supabase CLI would derive from a filename — the `db push` key. */
function versionFromFilename(filename) {
  const m = String(filename).match(/^(\d+)_/);
  return m ? m[1] : null;
}

/**
 * Diff on-disk migrations against the project's applied history, BOTH directions.
 *
 * The reverse direction is not symmetry for its own sake: this project currently
 * has two rows applied in production that exist in no repo file, which no
 * forward-only check would ever surface.
 *
 * @param {string[]} files    filenames in supabase/migrations/
 * @param {Array<{version:string,name:string}>} applied
 */
function diffMigrations(files, applied) {
  const appliedByName = new Map();
  for (const row of applied) appliedByName.set(normalizeMigrationName(row.name), row);

  const fileByName = new Map();
  const duplicateVersions = new Map();

  for (const f of files) {
    fileByName.set(normalizeMigrationName(f), f);
    const v = versionFromFilename(f);
    if (v) {
      if (!duplicateVersions.has(v)) duplicateVersions.set(v, []);
      duplicateVersions.get(v).push(f);
    }
  }

  const missingInProd = files
    .filter((f) => !appliedByName.has(normalizeMigrationName(f)))
    .sort();

  const missingOnDisk = applied
    .filter((row) => !fileByName.has(normalizeMigrationName(row.name)))
    .map((row) => `${row.version}_${row.name}`)
    .sort();

  const collisions = [...duplicateVersions.entries()]
    .filter(([, fs]) => fs.length > 1)
    .map(([version, fs]) => ({ version, files: fs.sort() }));

  return { missingInProd, missingOnDisk, duplicateVersions: collisions };
}

/**
 * Commits that are real history rather than an artifact of the clone.
 *
 * A shallow clone's synthetic root looks like a commit that touched every file in
 * the repo, so a naive `git log --since` reports every function as drifted. That
 * is not hypothetical — it is the first wrong answer this tooling produced, twice,
 * before it existed.
 */
function filterRealCommits(commits, rootShas) {
  const roots = new Set(rootShas || []);
  return commits.filter((c) => !roots.has(c.sha));
}

function summarize(results) {
  const counts = {};
  for (const s of STATE_ORDER) counts[s] = 0;
  for (const r of results) counts[r.state] = (counts[r.state] || 0) + 1;
  const actionable = results.filter((r) => ACTIONABLE.has(r.state));
  return { counts, actionable, clean: actionable.length === 0 };
}

function sortResults(results) {
  return [...results].sort((a, b) => {
    const d = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

function short(sha) {
  return sha ? String(sha).slice(0, 8) : '—';
}

module.exports = {
  STATE,
  normalizeForHash,
  STATE_ORDER,
  ACTIONABLE,
  classifyFunction,
  normalizeMigrationName,
  versionFromFilename,
  diffMigrations,
  filterRealCommits,
  summarize,
  sortResults,
  short,
};
