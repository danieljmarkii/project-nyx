// The numbers' I/O shell (CUL-2862). Reads one facts file the dispatcher wrote from its
// tool reads and prints the readout; no network, no writes, like cli.ts.
//
//   node --experimental-strip-types scripts/dispatch/numbersCli.ts <facts.json> [--for-pr]
//
// facts.json: NumbersInput (numbers.ts), except the queue may be given as `queueNow` (this
// read of the `Waiting on PM` label: id and createdAt) with `queueAt` (the read's time) and
// `queuePrev` (the snapshot the last readout printed); the readout then ends with this
// read's snapshot, for the next one to diff. `--for-pr` breaks every issue id, so the output
// can be pasted into a PR body without its merge closing them (status.ts, prSafe).

import * as fs from 'node:fs';

import { queueFromSnapshots, renderReadout, type NumbersInput, type QueueSnapshot } from './numbers.ts';
import { prSafe } from './status.ts';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: numbersCli.ts <facts.json> [--for-pr]');
  process.exit(2);
}
type Facts = Omit<NumbersInput, 'queue'> & {
  queue?: NumbersInput['queue'];
  queueNow?: { id: string; createdAt: string }[];
  queueAt?: string;
  queuePrev?: QueueSnapshot;
};
const facts = JSON.parse(fs.readFileSync(file, 'utf8')) as Facts;
let out: string;
if (facts.queueNow) {
  if (!facts.queueAt) {
    console.error('queueNow needs queueAt, the time of the read');
    process.exit(2);
  }
  const q = queueFromSnapshots(facts.queuePrev, facts.queueNow, facts.queueAt);
  out = `${renderReadout({ ...facts, queue: q.spans, queueBasis: q.basis })}\n\nQueue snapshot for the next readout:\n\n\`\`\`json\n${JSON.stringify(q.snapshot)}\n\`\`\``;
} else {
  out = renderReadout({ ...facts, queue: facts.queue ?? [] });
}
console.log(flags.includes('--for-pr') ? prSafe(out) : out);
