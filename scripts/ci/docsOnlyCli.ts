// The docs only rule's I/O half (CUL-2860), run by ci.yml's `changes` job and app job.
//
//   node --experimental-strip-types scripts/ci/docsOnlyCli.ts decide
//     Reads the pull request's diff, its commits and their CI runs through the REST API,
//     prints the decision, and writes `docs_only=true|false` to $GITHUB_OUTPUT and the
//     reason to the step summary. Any failed read is a full run: this never exits non-zero
//     on a read, so a broken API answer costs minutes, never a skipped suite (and a crash of
//     the step leaves the output empty, which ci.yml also reads as a full run).
//   node --experimental-strip-types scripts/ci/docsOnlyCli.ts suites
//     Prints the jest suites a docs only commit still runs, one per line.
//
// The rule itself, and why it is safe, is in docsOnly.ts.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { allDocs, decide, selectDocsSuites, type Candidate, type Decision } from './docsOnly.ts';

// How far back the walk looks. A branch whose last passed run is further back than this
// many commits pays the full run, which is the old behaviour.
const MAX_CANDIDATES = 15;
// The compare endpoint lists at most 300 files and the pull request files endpoint 3000;
// a list at the cap may be cut short, so it counts as unread.
const COMPARE_CAP = 300;
const PR_FILES_CAP = 3000;

const env = (k: string): string => process.env[k] ?? '';

async function api(pathAndQuery: string): Promise<unknown> {
  const res = await fetch(`${env('GITHUB_API_URL') || 'https://api.github.com'}${pathAndQuery}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GET ${pathAndQuery}: ${res.status}`);
  return res.json();
}

async function paged<T>(base: string, cap: number): Promise<T[] | null> {
  const out: T[] = [];
  for (let page = 1; out.length < cap; page++) {
    const sep = base.includes('?') ? '&' : '?';
    const batch = (await api(`${base}${sep}per_page=100&page=${page}`)) as T[];
    if (!Array.isArray(batch)) return null;
    out.push(...batch);
    if (batch.length < 100) return out;
  }
  return null;
}

async function safely<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (e) {
    console.log(`::warning::docs only read failed, so this run is a full run: ${(e as Error).message}`);
    return null;
  }
}

async function runDecide(): Promise<Decision> {
  const event = env('GITHUB_EVENT_NAME');
  if (event !== 'pull_request') return decide(event, null, []);
  const payload = JSON.parse(fs.readFileSync(env('GITHUB_EVENT_PATH'), 'utf8')) as {
    pull_request: { number: number; head: { sha: string } };
  };
  const repo = env('GITHUB_REPOSITORY');
  const pr = payload.pull_request.number;
  const head = payload.pull_request.head.sha;

  const prFiles = await safely(async () => {
    const files = await paged<{ filename: string; previous_filename?: string }>(`/repos/${repo}/pulls/${pr}/files`, PR_FILES_CAP);
    // A rename moves two paths; both must be docs.
    return files === null ? null : files.flatMap((f) => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]);
  });
  if (prFiles !== null && allDocs(prFiles)) return decide(event, prFiles, []);

  const commits = await safely(() => paged<{ sha: string }>(`/repos/${repo}/pulls/${pr}/commits`, 250));
  if (commits === null) return { docsOnly: false, reason: 'could not read the branch commits; full run' };
  const shas = commits.map((c) => c.sha);
  const at = shas.lastIndexOf(head);
  const earlier = (at === -1 ? [] : shas.slice(0, at)).reverse().slice(0, MAX_CANDIDATES);

  const candidates: Candidate[] = [];
  for (const sha of earlier) {
    const changedSince = await safely(async () => {
      const cmp = (await api(`/repos/${repo}/compare/${sha}...${head}`)) as {
        status: string;
        files?: { filename: string; previous_filename?: string }[];
      };
      // Only a straight line back: `ahead` means the candidate is an ancestor of the head.
      if (cmp.status !== 'ahead' || !Array.isArray(cmp.files) || cmp.files.length >= COMPARE_CAP) return null;
      return cmp.files.flatMap((f) => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]);
    });
    const c: Candidate = { sha, changedSince, passed: null };
    candidates.push(c);
    if (changedSince === null || !allDocs(changedSince)) break;
    c.passed = await safely(async () => {
      const runs = (await api(`/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&status=success&per_page=1`)) as {
        total_count?: number;
      };
      return typeof runs.total_count === 'number' ? runs.total_count > 0 : null;
    });
    if (c.passed !== false) break;
  }
  return decide(event, prFiles, candidates);
}

function listSuites(): string[] {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx'], { encoding: 'utf8' })
    .split('\0')
    .filter((p) => p !== '' && !p.startsWith('supabase/functions/') && !p.startsWith('.claude/worktrees/'));
  return selectDocsSuites(tracked.map((p) => ({ path: p, text: fs.readFileSync(p, 'utf8') })));
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'suites') {
    process.stdout.write(`${listSuites().join('\n')}\n`);
    return;
  }
  if (cmd !== 'decide') throw new Error('usage: docsOnlyCli.ts decide | suites');
  let d: Decision;
  try {
    d = await runDecide();
  } catch (e) {
    d = { docsOnly: false, reason: `the decision failed (${(e as Error).message}); full run` };
  }
  console.log(`docs only: ${d.docsOnly} (${d.reason})`);
  if (env('GITHUB_OUTPUT')) fs.appendFileSync(env('GITHUB_OUTPUT'), `docs_only=${d.docsOnly}\n`);
  if (env('GITHUB_STEP_SUMMARY')) {
    const line = d.docsOnly
      ? `**Docs only:** ${d.reason}. The timezone jobs and the Deno job are skipped; the app job runs the suites that read docs.`
      : `**Full run:** ${d.reason}.`;
    fs.appendFileSync(env('GITHUB_STEP_SUMMARY'), `${line}\n`);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
