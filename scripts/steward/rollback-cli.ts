// The I/O half of `rollback.ts` (CUL-2885). Run from the repository; it fetches `main`
// itself and touches only the current branch, and only on `apply`.
//
//   node --experimental-strip-types scripts/steward/rollback-cli.ts check <pr>
//       ROLLBACK <sha> #<pr> <subject> (exit 0), or REFUSED: <why> (exit 1).
//   node --experimental-strip-types scripts/steward/rollback-cli.ts apply <pr> --why "<text>" --labels '<labels>|none'
//       From a fresh branch at origin/main: the revert commit, with the ledger line in it
//       and a `Rollback-Of:` trailer; prints the digest line. `--labels` is the reverted
//       PR's named issues' labels (absent counts as protected). When the deny list would
//       hold the reverted PR, prints the Linear writes the session must make before the
//       rollback merges (CUL-2910). Nothing it writes names an issue. Refusals as `check`.
//   node --experimental-strip-types scripts/steward/rollback-cli.ts deployed <merge-sha> --merged-at <iso> [--now <iso>] < runs.json
//       Reads the deploy workflow's runs (actions_list output) and prints PASS (exit 0),
//       WAIT (exit 2) or FAIL (exit 1) with the `Needs you` line to post.
//   node --experimental-strip-types scripts/steward/rollback-cli.ts landing <base> <head> <landed-tree>
//       merge-check.sh's question: is this landing exactly one rollback? Prints
//       `<sha>\t#<pr>` (exit 0), or exit 1 with the reason on stderr.
//
// Exit 3 is "could not tell", never a pass.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

import { readLanding } from './landing.ts';
import { deployVerdict, digestLine, issueWrites, LEDGER, ledgerAddsOne, ledgerProblems, MIGRATIONS, namedIssues, protection, refusal, TRAILER, withoutIssues, writeLines, type Commit, type LedgerEntry, type Run } from './rollback.ts';

const BASE = 'origin/main';
const git = (args: string[]) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const ok = (args: string[]) => spawnSync('git', args, { stdio: 'ignore' }).status === 0;

class Refused extends Error {}
class Unknown extends Error {}

function readCommit(sha: string, base: string): Commit {
  const parents = git(['rev-list', '--parents', '-n', '1', sha]).split(' ').length - 1;
  const files = git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', '-m', '--first-parent', sha]).split('\n').filter(Boolean);
  let revertTree: string | null = null;
  if (parents === 1) {
    // The revert as git would make it: a three-way merge whose base is the commit and
    // whose other side is its parent. Exit 1 is a conflict; anything else is unknown.
    const r = spawnSync('git', ['merge-tree', '--write-tree', `--merge-base=${sha}`, base, `${sha}^`], { encoding: 'utf8' });
    if (r.status === 0) revertTree = r.stdout.split('\n')[0].trim();
    else if (r.status !== 1) throw new Unknown(`git merge-tree failed: ${r.stderr.trim()}`);
  }
  const laterMigrations = [
    ...new Set(git(['log', '--first-parent', '--format=', '--name-only', `${sha}..${base}`]).split('\n').filter((f) => f && MIGRATIONS.test(f))),
  ].sort();
  return {
    sha,
    subject: git(['log', '-1', '--format=%s', sha]),
    body: git(['log', '-1', '--format=%b', sha]),
    parents,
    files,
    revertTree,
    mainTree: git(['rev-parse', `${base}^{tree}`]),
    laterMigrations,
  };
}

/** The squash commit of PR #n on main's first parent line. */
function findMerge(pr: number, base = BASE): string {
  const suffix = ` (#${pr})`;
  const hits = git(['log', '--first-parent', '--format=%H%x09%s', base])
    .split('\n')
    .filter((l) => l.endsWith(suffix))
    .map((l) => l.split('\t')[0]);
  if (hits.length === 0) throw new Refused(`no commit on main's first parent line ends "${suffix}"`);
  if (hits.length > 1) throw new Refused(`${hits.length} commits on main end "${suffix}"; this goes to the PM`);
  return hits[0];
}

function check(pr: number): Commit {
  if (!ok(['fetch', '--quiet', 'origin', 'main'])) throw new Unknown('git fetch origin main failed');
  const c = readCommit(findMerge(pr), BASE);
  const why = refusal(c);
  if (why) throw new Refused(why);
  return c;
}

function apply(pr: number, rawWhy: string, labels: string[] | null): void {
  if (!rawWhy.trim()) throw new Unknown('apply needs --why "<what failed>"');
  const why = withoutIssues(rawWhy.trim());
  const c = check(pr);
  // Read before the revert: the reverted PR's own lines, for the deny list's word rule.
  const reasons = protection(c, labels, readLanding(`${c.sha}^`, c.sha).changedLines);
  if (git(['status', '--porcelain'])) throw new Unknown('the working tree has changes; commit or stash them first');
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', BASE])) throw new Unknown(`start from a fresh branch at ${BASE}`);
  if (!ok(['revert', '--no-edit', '--no-commit', c.sha])) {
    ok(['revert', '--abort']);
    throw new Refused('git revert did not apply cleanly');
  }
  const raw: unknown = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const subject = withoutIssues(c.subject);
  const entry: LedgerEntry = { pr, sha: c.sha, subject, files: c.files, why, date: new Date().toISOString().slice(0, 10) };
  (raw as { rollbacks: LedgerEntry[] }).rollbacks.push(entry);
  const problems = ledgerProblems(raw);
  if (problems.length) throw new Unknown(problems.join('\n'));
  fs.writeFileSync(LEDGER, JSON.stringify(raw, null, 2) + '\n');
  git(['add', LEDGER]);
  git(['commit', '--quiet', '-m', `Rollback #${pr}: ${subject}\n\nThis reverts commit ${c.sha}.\n${why}\n\n${TRAILER}: ${c.sha}`]);
  console.log(`ROLLED BACK ${c.sha} #${pr} ${subject}`);
  console.log(`digest: ${digestLine(entry)}`);
  const writes = issueWrites({ pr, sha: c.sha, subject: c.subject, why, date: entry.date, issues: namedIssues(c.subject, c.body), reasons });
  for (const line of writeLines(writes, pr)) console.log(line);
}

/** Exactly one `Rollback-Of:` commit on the branch, and the landing is its revert and nothing else. */
function landing(base: string, head: string, landedTree: string): string {
  const fork = git(['merge-base', base, head]);
  const named = new Set(
    git(['log', '--format=%(trailers:key=' + TRAILER + ',valueonly)', `${fork}..${head}`])
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (named.size !== 1) throw new Refused(`${named.size} ${TRAILER} trailers on the branch, not one`);
  const sha = [...named][0];
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Refused(`${TRAILER} names ${sha}, not a full sha`);
  // The same commit `apply` would pick: PR #n's one squash merge on main's first parent
  // line, never a side branch commit or any other ancestor.
  const pr = /\(#(\d+)\)$/.exec(git(['log', '-1', '--format=%s', sha]))?.[1];
  if (!pr) throw new Refused(`${sha.slice(0, 7)} names no PR`);
  if (findMerge(Number(pr), base) !== sha) throw new Refused(`${sha.slice(0, 7)} is not #${pr}'s squash merge on ${base}`);
  const c = readCommit(sha, base);
  const why = refusal(c);
  if (why) throw new Refused(why);
  // The ledger line rides in the revert; every other path must be the revert's exactly.
  // Filtered here, not by an exclude pathspec: merge-check exports GIT_LITERAL_PATHSPECS.
  const extra = git(['diff', '--name-only', '--no-renames', c.revertTree as string, landedTree]).split('\n').filter((f) => f && f !== LEDGER);
  if (extra.length) throw new Refused(`the landing changes more than the revert: ${extra.join(', ')}`);
  const read = (tree: string): unknown => {
    const r = spawnSync('git', ['show', `${tree}:${LEDGER}`], { encoding: 'utf8' });
    return r.status === 0 ? JSON.parse(r.stdout) : undefined;
  };
  const ledger = ledgerAddsOne(read(base), read(landedTree), sha);
  if (ledger) throw new Refused(ledger);
  return `${sha}\t#${pr}`;
}

function deployed(args: string[]): number {
  const [mergeSha] = args;
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const mergedAt = new Date(flag('--merged-at') ?? '');
  const now = new Date(flag('--now') ?? Date.now());
  if (!mergeSha || !/^[0-9a-f]{40}$/.test(mergeSha) || Number.isNaN(mergedAt.getTime()) || Number.isNaN(now.getTime())) {
    throw new Unknown('usage: deployed <merge-sha> --merged-at <iso> [--now <iso>] < runs.json');
  }
  const raw: unknown = JSON.parse(fs.readFileSync(0, 'utf8'));
  const runs = (Array.isArray(raw) ? raw : (raw as { workflow_runs?: unknown }).workflow_runs) as Run[] | undefined;
  if (!Array.isArray(runs)) throw new Unknown('stdin holds no list of runs');
  const v = deployVerdict(runs, mergeSha, (sha) => ok(['merge-base', '--is-ancestor', mergeSha, sha]), mergedAt, now);
  console.log(`${v.verdict}: ${v.why}`);
  if (v.verdict === 'FAIL') {
    console.log(`next: rollback-cli.ts apply <pr> --why "${v.why.replace(/"/g, "'")}", then open its PR and merge it on the steward gate`);
    console.log(`Needs you · rolled back ${mergeSha.slice(0, 7)}: ${v.why}`);
  }
  return { PASS: 0, FAIL: 1, WAIT: 2 }[v.verdict];
}

function main(): number {
  const [cmd, ...args] = process.argv.slice(2);
  const pr = Number(args[0]);
  switch (cmd) {
    case 'check': {
      if (!Number.isInteger(pr) || pr < 1) throw new Unknown('usage: check <pr>');
      const c = check(pr);
      console.log(`ROLLBACK ${c.sha} #${pr} ${c.subject}`);
      return 0;
    }
    case 'apply': {
      const i = args.indexOf('--why');
      const l = args.indexOf('--labels');
      if (!Number.isInteger(pr) || pr < 1 || i === -1 || (args[i + 1] ?? '--').startsWith('--')) throw new Unknown('usage: apply <pr> --why "<text>" --labels \'<labels>|none\'');
      // As selfMerge-cli: absent or empty says nothing, so it counts as protected; `none`
      // says the named issues carry no labels.
      const raw = l === -1 ? '' : (args[l + 1] ?? '').trim();
      const labels = raw === '' || raw.startsWith('--') ? null : raw.toLowerCase() === 'none' ? [] : raw.split(',').map((x) => x.trim()).filter(Boolean);
      apply(pr, args[i + 1] ?? '', labels);
      return 0;
    }
    case 'landing': {
      const [base, head, tree] = args;
      if (!base || !head || !tree) throw new Unknown('usage: landing <base> <head> <landed-tree>');
      console.log(landing(base, head, tree));
      return 0;
    }
    case 'deployed':
      return deployed(args);
    default:
      throw new Unknown('usage: rollback-cli.ts check|apply|landing|deployed …');
  }
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof Refused) {
    console.log(`REFUSED: ${e.message}`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`rollback: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 3;
  }
}
