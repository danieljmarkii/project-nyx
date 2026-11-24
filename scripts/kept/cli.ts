// The kept list's shell (CUL-2886): prints `kept: <stakes | taste | scope | none>` and one
// reason per line, for an issue or a diff. merge-check and the groomer call this; the
// planners import kept.ts directly.
//
//   node --experimental-strip-types scripts/kept/cli.ts --diff <base>..<head>
//   node --experimental-strip-types scripts/kept/cli.ts --issue <issue.json>
//
// `--issue` reads `{ labels, description | text, title, files? }` (a get_issue result
// saved to a file). Exit 0 whatever the answer; 2 when the input cannot be read, which a
// caller reads as kept (uncertain counts as kept), never as none.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { keptOf, type KeptInput } from './kept.ts';

function fail(msg: string): never {
  console.log('kept: stakes');
  console.log(`  stakes: the input could not be read (${msg}); uncertain counts as kept`);
  process.exit(2);
}

const [flag, arg] = process.argv.slice(2);
let input: KeptInput;
try {
  if (flag === '--diff' && arg) {
    const files = execFileSync('git', ['diff', '--name-only', arg], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (!files.length) fail(`no files in ${arg}`);
    input = { files, text: execFileSync('git', ['log', '--format=%s%n%b', arg], { encoding: 'utf8' }) };
  } else if (flag === '--issue' && arg) {
    const j = JSON.parse(fs.readFileSync(arg, 'utf8')) as { labels?: string[]; title?: string; description?: string; text?: string; files?: string[] };
    input = { labels: j.labels ?? [], files: j.files ?? [], text: [j.title, j.description, j.text].filter(Boolean).join('\n') };
  } else {
    fail('usage: --diff <base>..<head> | --issue <issue.json>');
  }
} catch (e) {
  fail(e instanceof Error ? e.message.split('\n')[0] : String(e));
}

const r = keptOf(input);
console.log(`kept: ${r.kept}`);
for (const why of r.reasons) console.log(`  ${why}`);
