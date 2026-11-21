// The numbers' I/O shell (CUL-2862). Reads one facts file the dispatcher wrote from its
// tool reads and prints the readout; no network, no writes, like cli.ts.
//
//   node --experimental-strip-types scripts/dispatch/numbersCli.ts <facts.json> [--for-pr]
//
// facts.json: NumbersInput (numbers.ts). `--for-pr` breaks every issue id, so the output
// can be pasted into a PR body without its merge closing them (status.ts, prSafe).

import * as fs from 'node:fs';

import { renderReadout, type NumbersInput } from './numbers.ts';
import { prSafe } from './status.ts';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: numbersCli.ts <facts.json> [--for-pr]');
  process.exit(2);
}
const facts = JSON.parse(fs.readFileSync(file, 'utf8')) as NumbersInput;
const out = renderReadout(facts);
console.log(flags.includes('--for-pr') ? prSafe(out) : out);
