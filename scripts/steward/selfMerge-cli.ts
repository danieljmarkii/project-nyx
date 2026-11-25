// The shell around selfMerge.ts (CUL-2874): reads the landing and prints the verdict.
// merge-check.sh §5 calls it; the replay (selfMerge-replay.ts) calls the pure rule.
//
//   node --experimental-strip-types scripts/steward/selfMerge-cli.ts <base> <landed> \
//     [--deploys fn-a,fn-b] [--deploy-unread <why>] [--labels 'Gate: clinical,Area: Copy'] [--applied <NNN>]
//
// Prints `self-merge: open` or `self-merge: held`, then one reason per line. Exit 0 open,
// 1 held, 3 when the landing cannot be read (never a pass). `--labels` absent holds;
// `--labels ''` says the named issues carry no labels.

import { readLanding } from './landing.ts';
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

let files: string[] = [];
let changedLines: { file: string; line: string }[] = [];
try {
  ({ files, changedLines } = readLanding(base, landed));
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
