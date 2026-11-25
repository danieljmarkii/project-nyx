// Proves the rollback rules (CUL-2885) by breaking the source they guard (C-18: a guard is
// proven by mutation, not by reading the test). Each mutant replaces ONE exact string, runs
// the rollback and deploy suites, expects them RED, and restores the file whatever happens.
//
//   node --experimental-strip-types scripts/steward/rollback-mutants.ts
//
// Exit 0 when every mutant is killed; 1 when one survives or an anchor no longer matches
// exactly once (fix the mutant, never skip it).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
type Mutant = { check: string; file: string; from: string; to: string };

const R = 'scripts/steward/rollback.ts';
const CLI = 'scripts/steward/rollback-cli.ts';
const MC = 'scripts/steward/merge-check.sh';
const PLAN = 'scripts/edge-deploy/plan.ts';
const REC = 'scripts/edge-deploy/records.ts';

const MUTANTS: Mutant[] = [
  // Refusals: what goes to the PM.
  { check: 'a migration is refused', file: R, from: 'if (migrations.length) return', to: 'if (migrations.length < 0) return' },
  { check: 'a later merge on the same lines is refused', file: R, from: 'if (c.revertTree === null) return', to: 'if (c.revertTree === "never") return' },
  { check: 'a merge commit is refused', file: R, from: 'if (c.parents !== 1) return', to: 'if (c.parents > 2) return' },
  { check: 'the landing check refuses what check refuses', file: CLI, from: "  if (why) throw new Refused(why);\n  // The ledger line", to: '  // The ledger line' },
  { check: 'any SQL file is a migration', file: R, from: '|\\.sql$/;', to: '/;' },
  { check: 'a later migration is refused', file: R, from: 'if (c.laterMigrations.length) return', to: 'if (c.laterMigrations.length < 0) return' },
  { check: 'undoing a rollback is refused', file: R, from: "if (/^(Rollback #|Revert \")/.test(c.subject) ||", to: 'if (' },
  { check: 'the landing names only the PR\'s own squash merge', file: CLI, from: "  if (findMerge(Number(pr), base) !== sha) throw new Refused(`${sha.slice(0, 7)} is not #${pr}'s squash merge on ${base}`);\n", to: '' },
  { check: 'the landing ledger is one new line for it', file: CLI, from: '  if (ledger) throw new Refused(ledger);\n', to: '' },
  { check: 'a landing with more than the revert is no rollback', file: CLI, from: 'if (extra.length) throw', to: 'if (extra.length < 0) throw' },
  { check: 'apply writes the ledger line', file: CLI, from: '(raw as { rollbacks: LedgerEntry[] }).rollbacks.push(entry);', to: '' },
  // Detection: what counts as the deploy check failing.
  { check: 'a failed run is a failure', file: R, from: "done.conclusion === 'success'", to: "done.conclusion !== 'cancelled'" },
  { check: 'no run in the window is a failure', file: R, from: "verdict: 'FAIL', why: `no deploy run", to: "verdict: 'PASS', why: `no deploy run" },
  { check: 'a cancelled run is not a pass or a failure', file: R, from: "r.conclusion !== 'cancelled' && ", to: '' },
  { check: 'only push runs count', file: R, from: "r.event === 'push' && ", to: '' },
  // merge-check: who needs the typed word.
  { check: 'a pure rollback needs no typed word', file: MC, from: 'if [ -n "$rollback_of" ]; then\n    tab=', to: 'if false; then\n    tab=' },
  { check: 'a rollback that edits a gate file still waits', file: MC, from: 'deploy_fns="" deploy_unknown="" deploy_state=""', to: 'deploy_fns="" deploy_unknown="" deploy_state="" gate_files=""' },
  // The redeploy: a failed attempt since the last success makes main owed.
  { check: 'a failure since the last success redeploys', file: PLAN, from: 'if (input.failedSince?.[fn]) return', to: 'if (input.failedSince?.[fn] && false) return' },
  { check: 'the history flags a failure', file: REC, from: '    if (failureFrom(fn, d, statuses as GhStatus[], key)) failedSince = true;\n', to: '' },
  { check: 'an unsigned failure flags nothing', file: REC, from: 'if (!payload || !signatureValid(payload, (d.payload as { mac?: unknown }).mac, key)) return false;', to: 'if (!payload) return false;' },
];

const SUITES = ['scripts/steward/rollback.test.ts', 'scripts/edge-deploy/plan.test.ts', 'scripts/edge-deploy/records.test.ts', 'guards/mergeCheck.test.ts'];

let survived = 0;
for (const m of MUTANTS) {
  const abs = path.join(ROOT, m.file);
  const original = fs.readFileSync(abs, 'utf8');
  if (original.split(m.from).length !== 2) {
    console.log(`✗ ANCHOR  ${m.check}: does not match exactly once in ${m.file}`);
    survived += 1;
    continue;
  }
  fs.writeFileSync(abs, original.replace(m.from, m.to));
  try {
    const r = spawnSync('npx', ['jest', '--silent', ...SUITES, '-t', 'rollback|recordHistory|after a failed deploy|refusal|deployVerdict|the ledger'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) {
      console.log(`✗ SURVIVED ${m.check}`);
      survived += 1;
    } else console.log(`✓ killed   ${m.check}`);
  } finally {
    fs.writeFileSync(abs, original);
  }
}
console.log(survived ? `${survived} of ${MUTANTS.length} survived` : `all ${MUTANTS.length} killed`);
process.exit(survived ? 1 : 0);
