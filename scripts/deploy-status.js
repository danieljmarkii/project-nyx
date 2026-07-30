#!/usr/bin/env node
/**
 * deploy-status.js — "what is live vs. what is on `main`", for Edge Functions and
 * migrations, derived rather than remembered.
 *
 * WHY THIS EXISTS
 * ---------------
 * CI (B-390) made the *merge* enforceable. Nothing equivalent existed for the
 * *deploy*, so deploy state lived as prose in a 136 KB STATUS.md — which tracked
 * the holds people argued about (B-494) and missed the ones nobody thought to
 * write a sentence about. On 2026-07-28 `delete-account` was found running a
 * build three hours older than the commit that taught it to purge `vet_documents`,
 * recorded nowhere; migration 036 had sat marked Done-but-never-applied for nine
 * days (B-505). Neither was carelessness. Both were invisible.
 *
 * This file is deliberately NOT another thing to keep current. It holds no state
 * and asserts nothing about the world: it reads git and the live project, and
 * computes. There is nothing in it to go stale.
 *
 * USAGE
 *   scripts/deploy-status.js                    # proxy mode (no token)
 *   scripts/deploy-status.js --live live.json   # feed MCP output in
 *   scripts/deploy-status.js --json             # machine-readable
 *   scripts/deploy-status.js --functions-only | --migrations-only
 *
 * TWO MODES, AND THE DIFFERENCE MATTERS
 *
 *   EXACT (needs SUPABASE_ACCESS_TOKEN, or --live carrying deployed source):
 *     hashes the deployed source against a freshly-built bundle. Proof.
 *
 *   PROXY (no token): git-logs each bundle's real inputs. Can say CANDIDATE,
 *     never DRIFTED — because a changed dependency is often tree-shaken out and
 *     never reaches the artifact. See deployStatus.lib.js for the case that
 *     taught us this.
 *
 * The `--live` path exists because the deploy transport here is the Supabase MCP,
 * which an agent calls; it dumps `list_edge_functions` / `list_migrations` (and,
 * optionally, `get_edge_function` content) to a file and points this at it.
 *
 * EXIT CODES:  0 nothing to do · 1 something actionable · 2 could not determine
 */

'use strict';

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  STATE,
  classifyFunction,
  diffMigrations,
  filterRealCommits,
  normalizeForHash,
  summarize,
  sortResults,
  short,
} = require('./deployStatus.lib');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'aigchluqluzuhtbfllgh';
const API = 'https://api.supabase.com';
const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const FUNCTIONS_DIR = path.join(REPO, 'supabase', 'functions');
const MIGRATIONS_DIR = path.join(REPO, 'supabase', 'migrations');

// ----- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};
if (has('-h') || has('--help')) {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 40).join('\n').replace(/^ ?\*\/?/gm, ''));
  process.exit(0);
}
const AS_JSON = has('--json');
const LIVE_FILE = opt('--live');
const ONLY_FUNCTIONS = has('--functions-only');
const ONLY_MIGRATIONS = has('--migrations-only');
const RESOLVE = has('--resolve');

// ----- output helpers --------------------------------------------------------
const useColor = process.stdout.isTTY && !AS_JSON;
const c = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const bold = (s) => c('1', s);
const say = (...a) => { if (!AS_JSON) console.log(...a); };

const BADGE = {
  [STATE.DRIFTED]: c('31', 'DRIFTED'),
  [STATE.NOT_DEPLOYED]: c('31', 'NOT DEPLOYED'),
  [STATE.CANDIDATE]: c('33', 'CANDIDATE'),
  [STATE.UNKNOWN]: c('33', 'UNKNOWN'),
  [STATE.LIKELY_CURRENT]: c('32', 'likely current'),
  [STATE.CURRENT]: c('32', 'current'),
};

// ----- git -------------------------------------------------------------------
const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

/**
 * A shallow clone's synthetic root touches every file in the repo, so it looks
 * like a commit that changed everything. Left in, it reports the whole project as
 * drifted — which is exactly the wrong answer this tooling produced by hand before
 * it existed.
 */
function rootShas() {
  try {
    return git(['rev-list', '--max-parents=0', 'HEAD']).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const historyComplete = !fs.existsSync(path.join(REPO, '.git', 'shallow'));

function commitsTouching(paths, sinceIso) {
  if (!paths.length || !sinceIso) return [];
  const out = git([
    'log', `--since=${sinceIso}`, '--format=%H%x1f%ad%x1f%s', '--date=short',
    '--', ...paths, ':!*.test.ts',
  ]);
  if (!out) return [];
  return out.split('\n').map((line) => {
    const [sha, date, subject] = line.split('');
    return { sha, date, subject };
  });
}

// ----- bundling --------------------------------------------------------------
function listFunctions() {
  return fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared')
    .map((d) => d.name)
    .filter((n) => fs.existsSync(path.join(FUNCTIONS_DIR, n, 'index.ts')))
    .sort();
}

/**
 * The bundle hash comes from `deploy-edge.sh`, NOT from a second esbuild
 * invocation here. That script owns the deploy recipe — the externals, the
 * `--charset=ascii` transport guard, the un-minified default — and a hash built
 * from a divergent recipe would compare two different things while looking
 * authoritative. One definition, reused. (B-103 is this repo's name for the
 * two-copies-of-one-rule bug class.)
 */
function buildSha(name) {
  try {
    const out = execFileSync(path.join(REPO, 'scripts', 'deploy-edge.sh'), [name, '--no-test'], {
      cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    });
    // deploy-edge.sh prints a RAW sha of the artifact; we deliberately re-hash the
    // file it wrote through the same normalizer used on the deployed side, so both
    // sides of a comparison are measured identically. The script still owns the
    // build recipe — only the measurement is ours.
    const m = out.match(/path\s*:\s*(\S+)/);
    const built = m ? path.join(REPO, m[1]) : path.join(REPO, '.edge-build', name, 'index.ts');
    if (!fs.existsSync(built)) return null;
    return sha256(fs.readFileSync(built, 'utf8'));
  } catch (err) {
    say(c('33', `  ⚠ could not bundle ${name}: ${(err.message || '').split('\n')[0]}`));
    return null;
  }
}

/**
 * The bundle's real inputs, from esbuild's own metafile — not a hand-kept list
 * that silently rots when an import moves. This runs esbuild a second time for
 * ANALYSIS only; the hash above still comes from deploy-edge.sh. The externals
 * must match that recipe, because they decide what gets inlined.
 */
function bundleInputs(name) {
  const esbuild = path.join(REPO, 'node_modules', '.bin', 'esbuild');
  if (!fs.existsSync(esbuild)) return null;
  const meta = path.join(REPO, '.edge-build', name, 'meta.json');
  try {
    fs.mkdirSync(path.dirname(meta), { recursive: true });
    execFileSync(esbuild, [
      path.join('supabase', 'functions', name, 'index.ts'),
      '--bundle', '--format=esm', '--platform=neutral',
      '--external:https://*', '--external:jsr:*', '--external:npm:*', '--external:node:*',
      '--charset=ascii', '--legal-comments=none',
      `--metafile=${meta}`, '--outfile=/dev/null',
    ], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return Object.keys(JSON.parse(fs.readFileSync(meta, 'utf8')).inputs)
      .filter((p) => !p.startsWith('http') && !p.includes('node_modules'));
  } catch {
    return null;
  }
}

/** The esbuild recipe, pinned so both sides of a --resolve comparison agree. */
const ESBUILD_FLAGS = [
  '--bundle', '--format=esm', '--platform=neutral',
  '--external:https://*', '--external:jsr:*', '--external:npm:*', '--external:node:*',
  '--charset=ascii', '--legal-comments=none',
];

/**
 * Turn a CANDIDATE into an answer WITHOUT a token, by rebuilding the bundle from
 * the tree as it stood when the deploy happened and hashing both sides.
 *
 * This is what resolved `extract-food-from-photo` by hand on 2026-07-28: five
 * commits touched its inputs, and the bundle was byte-identical across all of
 * them because every change was tree-shaken out.
 *
 * HONEST ABOUT WHAT IT IS: an inference, not proof. It assumes the deploy came
 * from the mainline tree at that timestamp — a deploy from a branch, or from a
 * dirty working tree, would defeat it. That is why the result is reported as
 * `resolved:` rather than promoted to a plain CURRENT/DRIFTED, and why the token
 * (which hashes the actual deployed bytes) is still the real fix.
 *
 * Both sides are built with the SAME pinned flags above rather than through
 * deploy-edge.sh, because the old tree's copy of that script may itself differ —
 * comparing two recipes would tell you nothing about the source.
 */
function resolveByRebuild(name, deployedAtIso) {
  const esbuild = path.join(REPO, 'node_modules', '.bin', 'esbuild');
  if (!fs.existsSync(esbuild) || !deployedAtIso) return null;

  let baseCommit;
  try {
    baseCommit = git(['rev-list', '-1', `--before=${deployedAtIso}`, 'HEAD']);
  } catch { return null; }
  if (!baseCommit) return null;

  const entry = path.join('supabase', 'functions', name, 'index.ts');
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), `dstat-${name}-`));
  const worktree = path.join(tmp, 'tree');
  try {
    execFileSync('git', ['worktree', 'add', '--detach', '-q', worktree, baseCommit],
      { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!fs.existsSync(path.join(worktree, entry))) return null; // didn't exist yet

    const build = (cwd, out) => {
      execFileSync(esbuild, [entry, ...ESBUILD_FLAGS, `--outfile=${out}`],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
    };
    const thenSha = build(worktree, path.join(tmp, 'then.js'));
    const nowSha = build(REPO, path.join(tmp, 'now.js'));
    return { baseCommit: baseCommit.slice(0, 8), thenSha, nowSha, identical: thenSha === nowSha };
  } catch {
    return null;
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktree],
        { cwd: REPO, stdio: 'ignore' });
    } catch { /* best effort */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ----- live state ------------------------------------------------------------
// Hash the PROGRAM, not its byte encoding: the no-token MCP transport decodes a
// bundle's `\uXXXX` escapes to real characters in flight, so a byte compare would
// call every function deployed that way permanently DRIFTED. See normalizeForHash.
const sha256 = (s) => crypto.createHash('sha256').update(normalizeForHash(s), 'utf8').digest('hex');

async function fetchJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Live state, in preference order: the Management API (exact), then a `--live`
 * dump from the MCP (exact only if it carries source content), then nothing.
 *
 * NOTE: the token path is implemented but has never run here — this environment
 * has no `SUPABASE_ACCESS_TOKEN` (it is an open PM item in the Secrets Register).
 * It therefore fails soft: any error degrades to proxy mode with a visible reason,
 * rather than reporting a confident answer it did not actually verify.
 */
async function loadLive() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (token) {
    try {
      const functions = await fetchJson(`${API}/v1/projects/${PROJECT_REF}/functions`, token);
      for (const fn of functions) {
        try {
          const body = await fetchJson(`${API}/v1/projects/${PROJECT_REF}/functions/${fn.slug}/body`, token);
          const content = typeof body === 'string' ? body : (body?.files?.[0]?.content ?? null);
          if (content) fn.sourceSha = sha256(content);
        } catch { /* metadata still useful; stay in proxy mode for this one */ }
      }
      let migrations = [];
      try {
        migrations = await fetchJson(`${API}/v1/projects/${PROJECT_REF}/database/migrations`, token);
      } catch { /* handled by the caller's empty check */ }
      return { functions, migrations, source: 'management API (token)' };
    } catch (err) {
      say(c('33', `  ⚠ Management API unreachable (${err.message}) — falling back to proxy mode`));
    }
  }

  if (LIVE_FILE) {
    const raw = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const functions = raw.functions || raw.edge_functions || [];
    for (const fn of functions) {
      // `get_edge_function` returns files[].content — if the dump carries it, we
      // get an exact answer without a token.
      const content = fn.sourceSha ? null : fn.files?.find((f) => f.name === 'index.ts')?.content;
      if (content) fn.sourceSha = sha256(content);
    }
    return { functions, migrations: raw.migrations || [], source: `--live ${LIVE_FILE}` };
  }

  return { functions: null, migrations: [], source: 'none' };
}

// ----- report ----------------------------------------------------------------
async function reportFunctions(live) {
  const names = listFunctions();
  const deployedBy = new Map((live.functions || []).map((f) => [f.slug || f.name, f]));
  const roots = rootShas();
  const results = [];

  for (const name of names) {
    const fn = deployedBy.get(name) || null;
    const localSha = buildSha(name);
    const deployed = fn
      ? {
          version: fn.version,
          updatedAt: fn.updated_at ? new Date(fn.updated_at).toISOString() : null,
          sourceSha: fn.sourceSha || null,
        }
      : null;

    let commits = [];
    if (deployed && deployed.updatedAt && !deployed.sourceSha) {
      const inputs = bundleInputs(name) || [path.join('supabase', 'functions', name)];
      commits = filterRealCommits(commitsTouching(inputs, deployed.updatedAt), roots);
    }

    const result = classifyFunction({
      name, localSha, deployed,
      git: { commits, historyComplete },
    });

    // Only ever run on a CANDIDATE: a proven hash needs no help, and a rebuild
    // must never be allowed to soften a DRIFTED verdict.
    if (RESOLVE && result.state === STATE.CANDIDATE) {
      result.rebuild = resolveByRebuild(name, deployed.updatedAt);
    }
    results.push(result);
  }

  const sorted = sortResults(results);
  say(`\n${bold('Edge Functions')}   ${c('2', `(live state: ${live.source})`)}`);
  if (!live.functions) {
    say(c('33', '  ⚠ no live state — pass --live <json> or set SUPABASE_ACCESS_TOKEN.'));
    say(c('2', '    Without it this cannot tell you anything about production.'));
    return { results: [], undetermined: true };
  }
  for (const r of sorted) {
    const v = r.version != null ? `v${r.version}` : '—';
    say(`  ${BADGE[r.state].padEnd(useColor ? 24 : 14)} ${r.name.padEnd(30)} ${v.padEnd(5)} ${c('2', short(r.localSha))}`);
    if (r.state !== STATE.CURRENT && r.state !== STATE.LIKELY_CURRENT) {
      say(c('2', `      ${r.reason}`));
      if (r.rebuild) {
        const verdict = r.rebuild.identical
          ? c('32', 'resolved: UNCHANGED — every commit was tree-shaken out of this bundle')
          : c('31', 'resolved: CHANGED — the built artifact really does differ');
        say(`      ${verdict}`);
        say(c('2', `      (rebuilt from ${r.rebuild.baseCommit}, the tree at deploy time: ${short(r.rebuild.thenSha)} vs ${short(r.rebuild.nowSha)})`));
      }
      for (const cm of r.commits.slice(0, 5)) say(c('2', `      · ${cm.date} ${cm.sha.slice(0, 8)} ${cm.subject}`));
      if (r.commits.length > 5) say(c('2', `      · …${r.commits.length - 5} more`));
    }
  }
  return { results: sorted, undetermined: false };
}

function reportMigrations(live) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  say(`\n${bold('Migrations')}`);
  if (!live.migrations || live.migrations.length === 0) {
    say(c('33', '  ⚠ no applied-migration list — pass --live <json> or set SUPABASE_ACCESS_TOKEN.'));
    return { diff: null, undetermined: true };
  }
  const diff = diffMigrations(files, live.migrations);
  say(c('2', `  ${files.length} on disk · ${live.migrations.length} applied`));

  if (diff.missingInProd.length) {
    say(c('31', `  NOT APPLIED (${diff.missingInProd.length}) — on disk, absent from production:`));
    for (const f of diff.missingInProd) say(`      ${f}`);
  }
  if (diff.missingOnDisk.length) {
    say(c('33', `  NO REPO FILE (${diff.missingOnDisk.length}) — applied to production, exists in no file:`));
    for (const f of diff.missingOnDisk) say(`      ${f}`);
  }
  if (diff.duplicateVersions.length) {
    say(c('33', `  VERSION COLLISION (${diff.duplicateVersions.length}) — two files derive one version:`));
    for (const d of diff.duplicateVersions) say(`      ${d.version}: ${d.files.join(', ')}`);
  }
  if (!diff.missingInProd.length && !diff.missingOnDisk.length && !diff.duplicateVersions.length) {
    say(c('32', '  in sync'));
  }
  return { diff, undetermined: false };
}

// ----- main ------------------------------------------------------------------
(async () => {
  const live = await loadLive();
  if (!historyComplete) {
    say(c('33', '\n⚠ shallow clone — git history is incomplete, so proxy-mode answers are partial.'));
    say(c('2', '  `git fetch --unshallow` for full coverage, or use a token for exact hashes.'));
  }

  let fnOut = { results: [], undetermined: false };
  let migOut = { diff: null, undetermined: false };
  if (!ONLY_MIGRATIONS) fnOut = await reportFunctions(live);
  if (!ONLY_FUNCTIONS) migOut = reportMigrations(live);

  const s = summarize(fnOut.results);
  const migDirty = migOut.diff
    ? migOut.diff.missingInProd.length + migOut.diff.missingOnDisk.length + migOut.diff.duplicateVersions.length
    : 0;

  if (AS_JSON) {
    console.log(JSON.stringify({
      project: PROJECT_REF, liveSource: live.source, historyComplete,
      functions: fnOut.results, migrations: migOut.diff,
    }, null, 2));
  } else {
    say('');
    if (fnOut.undetermined || migOut.undetermined) {
      say(bold('Could not determine deploy state.') + ' See the warnings above.');
    } else if (s.clean && migDirty === 0) {
      say(c('32', bold('✓ production matches the working tree.')));
    } else {
      const bits = [];
      if (s.actionable.length) bits.push(`${s.actionable.length} function(s) need attention`);
      if (migDirty) bits.push(`${migDirty} migration discrepancy(ies)`);
      say(c('33', bold(`▲ ${bits.join(', ')}.`)));
      if (!process.env.SUPABASE_ACCESS_TOKEN) {
        say(c('2', '  A CANDIDATE is a lead, not a verdict — resolve it by hashing, not by redeploying.'));
        say(c('2', '  Set SUPABASE_ACCESS_TOKEN to turn every CANDIDATE into a proven CURRENT or DRIFTED.'));
      }
    }
  }

  if (fnOut.undetermined || migOut.undetermined) process.exit(2);
  process.exit(s.clean && migDirty === 0 ? 0 : 1);
})().catch((err) => {
  console.error(`deploy-status: ${err.stack || err.message}`);
  process.exit(2);
});
