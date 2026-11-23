// The precheck's I/O shell (PR-15). Reads one facts file and prints the route; no network,
// no writes, like cli.ts.
//
//   node --experimental-strip-types scripts/dispatch/precheckCli.ts <facts.json>
//
// facts.json: { finding, open, standing, rates?, bar?, mainFiles? }. `open` is the open
// Culprit issues the session read (id, title, cited files); `mainFiles` maps each cited file
// to its text on `origin/main` (`git show origin/main:<file>`), which the fixed check reads.

import * as fs from 'node:fs';

import { precheck, type PrecheckContext, type ProposedFinding } from './precheck.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: precheckCli.ts <facts.json>');
  process.exit(2);
}
type Facts = Omit<PrecheckContext, 'mainHas'> & { finding: ProposedFinding; mainFiles?: Record<string, string> };
const facts = JSON.parse(fs.readFileSync(file, 'utf8')) as Facts;
const mainFiles = facts.mainFiles;
const mainHas = mainFiles ? (f: string, s: string) => (mainFiles[f] ?? '').includes(s) : undefined;
console.log(JSON.stringify(precheck(facts.finding, { ...facts, mainHas }), null, 2));
