// The deploy workflow's entry point (CUL-1147): `.github/workflows/edge-deploy.yml`
// runs `node scripts/edge-deploy/cli.ts plan`, then (when the plan found something
// to deploy) `node scripts/edge-deploy/cli.ts deploy`, as steps of one job in the
// `production` environment, the only place SUPABASE_ACCESS_TOKEN exists. `plan`
// needs the token too: it is the key that verifies each deploy record's signature
// (records.ts says why the author check alone is not enough).
//
// This file is the I/O shell: git, the filesystem, the GitHub and Supabase HTTP
// calls, the job outputs. Every decision lives in a pure module beside it (plan,
// ledger, records, verify, deploy, summary), each with its own tests.
//
// Local dry run of the planner, no network, no token:
//   node scripts/edge-deploy/cli.ts plan --local [--records records.json]

import { execFileSync, spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runDeploys, type DeployDeps } from './deploy.ts';
import { fingerprintEntry, fingerprintFunctions, functionsDir } from './fingerprint.ts';
import { LEDGER_REL, ledgerProblems, parseLedger, type Ledger } from './ledger.ts';
import { ALL_CHANGED, planDeploys, type DeployItem, type Request } from './plan.ts';
import { lastSuccessfulRecord, recordKey, writeRecord, type DeployRecord, type Gh } from './records.ts';
import { planSummary, resultSummary, type SummaryContext } from './summary.ts';
import { parseMeta, settled, type FunctionMeta, type HttpResult } from './verify.ts';

// Same default as scripts/deploy-edge.sh, which does the upload.
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'aigchluqluzuhtbfllgh';
const SHA40 = /^[0-9a-f]{40}$/;

function fail(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function isAncestor(sha: string, of: string, cwd: string): boolean {
  return spawnSync('git', ['merge-base', '--is-ancestor', sha, of], { cwd }).status === 0;
}

function appendTo(envVar: string, text: string) {
  const file = process.env[envVar];
  if (file) fs.appendFileSync(file, text);
}

// Deploys come from main and nowhere else. The workflow checks this too; this is
// the same rule where the token is actually used.
function requireMain() {
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') {
    fail(`Edge Function deploys run from main only (this run is on ${process.env.GITHUB_REF ?? 'an unknown ref'}).`);
  }
}

function readLedger(repoRoot: string, current: Record<string, { fingerprint: string }>): Ledger {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, LEDGER_REL), 'utf8'));
  const { ledger, problems } = parseLedger(raw);
  const all = [...problems, ...ledgerProblems(ledger, current)];
  // The guard blocks a PR that breaks the ledger, so this should never fire on main.
  // If it does, deploy nothing: a ledger that cannot be read cannot be trusted to hold.
  if (all.length) fail(`${LEDGER_REL} is invalid, so nothing deploys:\n${all.join('\n')}`);
  return ledger;
}

function githubClient(): Gh {
  const token = process.env.GH_TOKEN;
  if (!token) fail('GH_TOKEN is not set.');
  const api = process.env.GITHUB_API_URL || 'https://api.github.com';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'culprit-edge-deploy',
  };
  const request = async (method: 'GET' | 'POST', p: string, body?: unknown) => {
    const res = await fetch(api + p, {
      method,
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    // Status only: the repo is public, so is this log, and the body adds nothing a
    // re-run would not show.
    if (!res.ok) throw new Error(`GitHub ${method} ${p.split('?')[0]} returned ${res.status}`);
    return (await res.json()) as unknown;
  };
  return { get: (p) => request('GET', p), post: (p, body) => request('POST', p, body) };
}

async function readRecords(gh: Gh, repo: string, functions: string[], key: Buffer) {
  const records: Record<string, DeployRecord | undefined> = {};
  for (const fn of functions) records[fn] = await lastSuccessfulRecord(gh, repo, fn, key);
  return records;
}

// The record-signing key, from the token only the `production` environment holds.
function signingKey(): Buffer {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    fail(
      'SUPABASE_ACCESS_TOKEN is not set. It lives only in the `production` environment ' +
        '(Settings → Environments → production → Environment secrets); see docs/edge-deploy-runbook.md § One-time setup.',
    );
  }
  return recordKey(token);
}

function mainState(repoRoot: string) {
  const all = fingerprintFunctions(repoRoot);
  const unresolved = Object.entries(all).filter(([, f]) => f.unresolved.length);
  if (unresolved.length) {
    fail(`Unresolved imports in ${unresolved.map(([fn]) => fn).join(', ')}; the guard should have caught this. Nothing deploys.`);
  }
  const functions = Object.keys(all).sort();
  const fingerprints = Object.fromEntries(functions.map((fn) => [fn, all[fn].fingerprint]));
  return { functions, fingerprints };
}

function resolveRequest(repoRoot: string, headSha: string, functions: string[]): { request: Request; trigger: string } {
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    return { request: { kind: 'changed', bootstrapGate: true }, trigger: 'merge to main' };
  }
  const fn = (process.env.INPUT_FUNCTION || ALL_CHANGED).trim();
  const ref = (process.env.INPUT_REF || 'main').trim();
  if (fn === ALL_CHANGED) {
    if (ref !== 'main' && ref !== headSha) {
      fail('all-changed always deploys main as it is now. To roll one function back, pick it by name and give the ref.');
    }
    return { request: { kind: 'changed', bootstrapGate: false }, trigger: 'manual run: all-changed' };
  }
  if (!functions.includes(fn)) fail(`There is no deployable function named '${fn}'.`);
  let sourceSha = headSha;
  if (ref !== 'main') {
    if (!/^[0-9a-f]{7,40}$/.test(ref)) fail(`ref must be "main" or a commit SHA from main's history, not "${ref}".`);
    const resolved = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: repoRoot, encoding: 'utf8' });
    sourceSha = (resolved.stdout || '').trim();
    if (resolved.status !== 0 || !SHA40.test(sourceSha)) fail(`${ref} is not a commit in this repository.`);
    // The line that keeps the token away from unreviewed code: only a commit that
    // main already contains can be deployed, and it is checked before any of its
    // code runs. The deploy job checks it again.
    if (!isAncestor(sourceSha, headSha, repoRoot)) fail(`${ref} is not on main's history. Only code that has merged to main can deploy.`);
  }
  const how = sourceSha === headSha ? 'redeploy of main' : `rollback to ${sourceSha.slice(0, 7)}`;
  return { request: { kind: 'one', fn, sourceSha }, trigger: `manual run: ${fn}, ${how}` };
}

function summaryContext(headSha: string, trigger: string): SummaryContext {
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  return { headSha, trigger, repoUrl: `${server}/${process.env.GITHUB_REPOSITORY ?? 'danieljmarkii/project-nyx'}` };
}

async function plan(args: string[]) {
  const local = args.includes('--local');
  if (!local) requireMain();
  const repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd());
  const headSha = git(['rev-parse', 'HEAD'], repoRoot);
  const { functions, fingerprints } = mainState(repoRoot);
  const ledger = readLedger(repoRoot, Object.fromEntries(functions.map((fn) => [fn, { fingerprint: fingerprints[fn] }])));

  let records: Record<string, DeployRecord | undefined> = {};
  let request: Request = { kind: 'changed', bootstrapGate: true };
  let trigger = 'local dry run';
  if (local) {
    const i = args.indexOf('--records');
    if (i !== -1) records = JSON.parse(fs.readFileSync(args[i + 1], 'utf8')) as Record<string, DeployRecord>;
  } else {
    const repo = process.env.GITHUB_REPOSITORY;
    if (!repo) fail('GITHUB_REPOSITORY is not set.');
    ({ request, trigger } = resolveRequest(repoRoot, headSha, functions));
    records = await readRecords(githubClient(), repo, functions, signingKey());
  }

  const result = planDeploys({ functions, fingerprints, ledger, records, headSha, request });
  const md = planSummary(result, summaryContext(headSha, trigger));
  console.log(md);
  appendTo('GITHUB_STEP_SUMMARY', md);
  if (result.mode === 'refused') fail(result.refusal ?? 'refused');
  if (result.mode === 'bootstrap' && !local) {
    // Loud on purpose: after the first recorded deploy this state means the records
    // were lost (or the token rotated), and every merge is deploying nothing.
    console.log(
      '::warning::No verified deploy record exists, so this merge deployed nothing. On a first run that is expected. ' +
        'Otherwise the records were lost or the token was rotated: run the workflow with all-changed.',
    );
  }
  appendTo('GITHUB_OUTPUT', `deploys=${JSON.stringify(result.deploys)}\ncount=${result.deploys.length}\n`);
}

function parsePlanned(json: string | undefined, functions: string[]): DeployItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json ?? '');
  } catch {
    fail('PLAN is not valid JSON.');
  }
  if (!Array.isArray(raw)) fail('PLAN must be a JSON array.');
  return (raw as unknown[]).map((entry) => {
    const e = entry as Partial<DeployItem>;
    if (
      typeof e.fn !== 'string' ||
      !functions.includes(e.fn) ||
      typeof e.sourceSha !== 'string' ||
      !SHA40.test(e.sourceSha) ||
      !['first', 'changed', 'requested', 'rollback'].includes(String(e.reason))
    ) {
      fail(`PLAN has an entry this job will not deploy: ${JSON.stringify(entry)}`);
    }
    return { fn: e.fn, sourceSha: e.sourceSha, reason: e.reason as DeployItem['reason'] };
  });
}

function projectConfig(repoRoot: string) {
  // The public URL and anon key the app itself ships with (eas.json, production
  // profile). The smoke calls use nothing a stranger doesn't already have.
  const eas = JSON.parse(fs.readFileSync(path.join(repoRoot, 'eas.json'), 'utf8')) as {
    build?: { production?: { env?: Record<string, string> } };
  };
  const env = eas.build?.production?.env ?? {};
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (url !== `https://${PROJECT_REF}.supabase.co`) fail(`eas.json's production URL (${url}) is not project ${PROJECT_REF}.`);
  if (!anon) fail("eas.json's production profile has no anon key.");
  return { url, anon };
}

async function deploy() {
  requireMain();
  const key = signingKey();
  const token = process.env.SUPABASE_ACCESS_TOKEN as string;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) fail('GITHUB_REPOSITORY is not set.');
  const repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd());
  const headSha = git(['rev-parse', 'HEAD'], repoRoot);
  const { functions, fingerprints } = mainState(repoRoot);
  const ledger = readLedger(repoRoot, Object.fromEntries(functions.map((fn) => [fn, { fingerprint: fingerprints[fn] }])));
  const items = parsePlanned(process.env.PLAN, functions);
  const held = items.filter((i) => ledger.holds[i.fn]);
  if (held.length) fail(`PLAN names held function(s) ${held.map((i) => i.fn).join(', ')}; nothing deploys.`);

  const { url, anon } = projectConfig(repoRoot);
  const gh = githubClient();
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const runUrl = `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID ?? ''}`;
  const tempRoot = process.env.RUNNER_TEMP || fs.mkdtempSync(path.join(os.tmpdir(), 'edge-src-'));
  const lastRecords = await readRecords(gh, repo, [...new Set(items.map((i) => i.fn))], key);

  const readMetaOnce = async (fn: string): Promise<FunctionMeta | null> => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${encodeURIComponent(fn)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`the Management API returned ${res.status} for ${fn}`);
    const meta = parseMeta(await res.json());
    if (!meta) throw new Error(`the Management API returned an unexpected shape for ${fn}`);
    return meta;
  };
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const readMeta = async (fn: string) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await readMetaOnce(fn);
      } catch (e) {
        if (attempt >= 3) throw e;
        await sleep(3000 * attempt);
      }
    }
  };

  const deps: DeployDeps = {
    async prepareSource(item) {
      if (item.sourceSha === headSha) return { dir: repoRoot, fingerprint: fingerprints[item.fn] };
      if (!isAncestor(item.sourceSha, headSha, repoRoot)) throw new Error(`${item.sourceSha} is not on main's history`);
      const dir = path.join(tempRoot, `edge-src-${item.sourceSha.slice(0, 12)}`);
      if (!fs.existsSync(dir)) {
        git(['worktree', 'add', '--detach', dir, item.sourceSha], repoRoot);
        // The old tree runs today's tools: esbuild, deno's npm types and the pinned
        // Supabase CLI all come from main's install.
        fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
      }
      const entry = path.join(functionsDir(dir), item.fn, 'index.ts');
      if (!fs.existsSync(entry)) throw new Error(`${item.fn} does not exist at ${item.sourceSha.slice(0, 7)}`);
      const fp = fingerprintEntry(entry, dir);
      if (fp.unresolved.length) throw new Error(`${item.fn} has unresolved imports at ${item.sourceSha.slice(0, 7)}`);
      return { dir, fingerprint: fp.fingerprint };
    },
    readMeta,
    async runDeployScript(fn, dir) {
      // The script needs the Supabase token and nothing else of this job's: the
      // GitHub token that writes the records stays out of its environment.
      const env = { ...process.env };
      delete env.GH_TOKEN;
      delete env.GITHUB_TOKEN;
      // stdio inherits, so the script's own test and deploy output lands in the log.
      const r = spawnSync('bash', [path.join(repoRoot, 'scripts', 'deploy-edge.sh'), fn, '--deploy'], {
        cwd: dir,
        stdio: 'inherit',
        env,
      });
      return r.status ?? 1;
    },
    bundleSha256(fn, dir) {
      const file = path.join(dir, '.edge-build', fn, 'index.ts');
      return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
    },
    async waitForSettled(fn, before) {
      let meta = await readMeta(fn);
      for (let waited = 0; !settled(before, meta) && waited < 120_000; waited += 5000) {
        await sleep(5000);
        meta = await readMeta(fn);
      }
      return meta;
    },
    async call(fn, auth): Promise<HttpResult> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth === 'anon') {
        headers.Authorization = `Bearer ${anon}`;
        headers.apikey = anon;
      }
      try {
        const res = await fetch(`${url}/functions/v1/${encodeURIComponent(fn)}`, {
          method: 'POST',
          headers,
          body: '{}',
          signal: AbortSignal.timeout(30_000),
        });
        return { status: res.status, body: await res.text() };
      } catch (e) {
        return { networkError: e instanceof Error ? e.message : String(e) };
      }
    },
    sleep,
    record: (payload, state, description) =>
      writeRecord(
        gh,
        repo,
        payload,
        state,
        description,
        `https://supabase.com/dashboard/project/${PROJECT_REF}/functions/${payload.function}/details`,
        key,
      ),
    log: (line) => console.log(line),
  };

  const trigger = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'manual run' : 'merge to main';
  const outcomes = await runDeploys(items, { headSha, mainFingerprints: fingerprints, runUrl, trigger }, deps);
  const md = resultSummary(outcomes, lastRecords, summaryContext(headSha, trigger));
  console.log(md);
  appendTo('GITHUB_STEP_SUMMARY', md);
  const failure = outcomes.find((o) => o.result === 'failed');
  if (failure && failure.result === 'failed') fail(`${failure.fn} failed at ${failure.stage}: ${failure.detail}`);
}

const [command, ...rest] = process.argv.slice(2);
const run = command === 'plan' ? plan(rest) : command === 'deploy' ? deploy() : null;
if (!run) fail('usage: node scripts/edge-deploy/cli.ts plan [--local [--records file]] | deploy');
run.catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
