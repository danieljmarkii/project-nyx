// The shell around selfMerge.ts (CUL-2874): reads the landing and prints the verdict.
// merge-check.sh §5 calls it; the replay (selfMerge-replay.ts) calls the pure rule.
//
//   node --experimental-strip-types scripts/steward/selfMerge-cli.ts <base> <landed> \
//     [--deploys fn-a,fn-b] [--deploy-unread <why>] [--labels 'Gate: clinical,Area: Copy'] [--applied <NNN>]
//
// Prints `self-merge: open` or `self-merge: held`, then one reason per line. Exit 0 open,
// 1 held, 3 when the landing cannot be read (never a pass). `--labels` absent holds;
// `--labels ''` says the named issues carry no labels.

import { execFileSync } from 'node:child_process';
import { selfMerge } from './selfMerge.ts';

function fail(msg: string): never {
  console.error(`selfMerge: ${msg}`);
  process.exit(3);
}

const args = process.argv.slice(2);
const [base, landed] = args;
if (!base || !landed || base.startsWith('--') || landed.startsWith('--')) fail('usage: selfMerge-cli.ts <base> <landed> [--deploys a,b] [--deploy-unread why] [--labels l1,l2] [--applied NNN]');
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined) fail(`${name} needs a value`);
  return v;
};
const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const git = (a: string[]) => execFileSync('git', ['-c', 'core.quotePath=false', ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
let files: string[] = [];
const changedLines: { file: string; line: string }[] = [];
try {
  files = git(['diff', '--name-only', '--no-renames', base, landed]).split('\n').filter(Boolean);
  // Headers sit between `diff --git` and the first `@@`; only after that is a `+` or `-`
  // line content, so a changed line that itself starts with `++` is never read as a header.
  let file = '';
  let inHunk = false;
  for (const l of git(['diff', '-U0', '--no-renames', '--no-color', base, landed]).split('\n')) {
    if (l.startsWith('diff --git ')) {
      inHunk = false;
      file = '';
    } else if (!inHunk && (l.startsWith('--- ') || l.startsWith('+++ '))) {
      const p = l.slice(4).replace(/^[ab]\//, '');
      if (p !== '/dev/null') file = p;
    } else if (l.startsWith('@@')) inHunk = true;
    else if (inHunk && file && (l.startsWith('+') || l.startsWith('-'))) changedLines.push({ file, line: l.slice(1) });
  }
} catch (e) {
  fail(e instanceof Error ? e.message.split('\n')[0] : String(e));
}

const labelsRaw = opt('--labels');
const r = selfMerge({
  files,
  deploys: list(opt('--deploys')),
  deployUnread: opt('--deploy-unread') || undefined,
  changedLines,
  labels: labelsRaw === undefined ? null : list(labelsRaw),
  applied: opt('--applied') ?? null,
});
console.log(`self-merge: ${r.verdict}`);
for (const why of r.reasons) console.log(`  held      ${why}`);
process.exit(r.verdict === 'open' ? 0 : 1);
