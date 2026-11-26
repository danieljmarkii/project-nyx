// Proves the self merge deny list (CUL-2874) by breaking the source it guards (C-18: a
// guard is proven by mutation, not by reading the test). Each mutant replaces ONE exact
// string, runs the verdict's suite and merge-check's self merge cases, expects them RED,
// and restores the file whatever happens. Both directions: a mutant that opens what must
// hold (a clinical path, a label, an unapplied migration, the 1.2.0 pause), and one that
// holds what must open (a deploying copy change on open paths).
//
//   node --experimental-strip-types scripts/steward/selfMerge-mutants.ts
//
// Exit 0 when every mutant is killed; 1 when one survives or an anchor no longer matches
// exactly once (fix the mutant, never skip it).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
type Mutant = { check: string; file: string; from: string; to: string };

const S = 'scripts/steward/selfMerge.ts';
const MC = 'scripts/steward/merge-check.sh';

const MUTANTS: Mutant[] = [
  // Opens what must hold.
  { check: 'a clinical path never qualifies (the kept list read)', file: S, from: "return stakes.length ? stakes.join('; ') : null;", to: 'return null;' },
  { check: 'every Edge Function holds', file: S, from: 'if (fn) return FUNCTIONS[fn[1]]', to: 'if (fn) return null; if (fn) return FUNCTIONS[fn[1]]' },
  { check: 'a changed clinical line holds, quoted or not', file: S, from: 'PRODUCT.test(l.file) && CLINICAL_WORDS.test(l.line)', to: "PRODUCT.test(l.file) && /['\"`]/.test(l.line) && CLINICAL_WORDS.test(l.line)" },
  { check: 'product code off the UI mechanics list holds (a screen is not taste here)', file: S, from: "return hit ? `${hit.why} (by its whole name)` : 'product code off the UI mechanics list", to: "return hit ? `${hit.why} (by its whole name)` : null; ('product code off the UI mechanics list" },
  { check: 'lib/utils.ts is off the open side', file: S, from: ".filter((f) => f !== 'lib/utils.ts')", to: '' },
  { check: 'guards hold', file: S, from: "return OPEN_GUARDS.has(f) ? null : 'a guard", to: "return null; ('a guard" },
  { check: 'CLAUDE.md, the rules and the reviewers hold', file: S, from: "const GUARDIANS = /^CLAUDE\\.md$|^\\.claude\\/(rules|agents)\\/|", to: 'const GUARDIANS = /' },
  { check: 'a clinical spec holds', file: S, from: 'if (hit) return `a spec or doc over', to: 'if (false) return `a spec or doc over' },
  { check: 'a label is read however spelled', file: S, from: ".replace(/[\\s_-]+/g, '')", to: ".replace(/\\s+/g, '')" },
  { check: 'a deploy holds unless its function is opened', file: S, from: 'if (!(fn in open)) reasons.push(', to: 'if (false) reasons.push(' },
  { check: 'a held label holds', file: S, from: 'if (name) reasons.push(', to: 'if (false) reasons.push(' },
  { check: 'labels left out hold', file: S, from: 'if (input.labels === null) reasons.push(', to: 'if (false) reasons.push(' },
  { check: "the gate's own files hold", file: S, from: "if (GATE.test(f)) return 'the gate", to: "if (false) return 'the gate" },
  { check: 'a deploy the check cannot read holds', file: S, from: 'if (input.deployUnread) reasons.push(', to: 'if (false) reasons.push(' },
  { check: 'the 1.2.0 pause holds a deploy', file: S, from: 'if (deploys && release.shipped && !release.reconfirmed) {', to: 'if (false) {' },
  { check: 'the pause waits for the reconfirmation', file: S, from: 'release.shipped && !release.reconfirmed', to: 'release.shipped && release.reconfirmed' },
  { check: 'the shipped constant says not yet', file: S, from: 'export const PUBLIC_BUILD_SHIPPED = false;', to: 'export const PUBLIC_BUILD_SHIPPED = true;' },
  { check: 'an unapplied migration holds', file: S, from: 'const applyCovers = applied !== null && migrations.length === 1', to: 'const applyCovers = migrations.length === 1' },
  { check: '`apply` covers one migration', file: S, from: 'migrations.length === 1 && rest.length === 0', to: 'migrations.length > 0 && rest.length === 0' },
  { check: '`apply` covers a migration PR alone', file: S, from: 'rest.length === 0 && numbers.has(applied)', to: 'numbers.has(applied)' },
  { check: '`apply` covers its own number only', file: S, from: '&& rest.length === 0 && numbers.has(applied);', to: '&& rest.length === 0;' },
  { check: 'nothing read never opens', file: S, from: "if (!files.length) reasons.push(", to: 'if (false) reasons.push(' },
  { check: 'merge-check: a held verdict moves the verdict', file: MC, from: 'if [ "$sm_rc" -eq 1 ]; then\n      production=1', to: 'if [ "$sm_rc" -eq 1 ]; then\n      true' },
  { check: 'merge-check: a verdict it cannot read holds', file: MC, from: '      sm_rc=1\n    fi', to: '      sm_rc=0\n    fi' },
  { check: 'merge-check: labels left out reach the verdict as left out', file: MC, from: '[ "$labels_set" -eq 1 ] && sm_args+=(--labels "$labels")', to: 'sm_args+=(--labels "$labels")' },
  // Holds what must open.
  { check: 'a deploying copy change for an opened function qualifies', file: S, from: 'if (input.deployUnread) reasons.push(', to: 'if (deploys) reasons.push(' },
  { check: 'an opened function is read from the table', file: S, from: 'const open = input.openFunctions ?? OPEN_FUNCTIONS;', to: 'const open = OPEN_FUNCTIONS;' },
  { check: 'merge-check: a change that deploys nothing on open paths is CLEAN', file: MC, from: 'elif [ "$sm_rc" -eq 1 ] || [ -n "$gate_files" ]; then', to: 'else' },
  { check: 'merge-check: `--applied` reaches the verdict', file: MC, from: '[ -n "$applied" ] && sm_args+=(--applied "$applied")\n', to: '' },
];

const run = (args: string[]) => spawnSync('npx', ['jest', '--silent', ...args], { cwd: ROOT, encoding: 'utf8' });

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
    // The pure suite first (seconds); the end to end cases only when it stays green.
    const unit = run(['scripts/steward/selfMerge.test.ts']);
    const killed = unit.status !== 0 || run(['guards/mergeCheck.test.ts', '-t', 'self merge \\(CUL-2874\\)|production writes|duplicate migration|migration number another']).status !== 0;
    if (killed) console.log(`✓ killed   ${m.check}`);
    else {
      console.log(`✗ SURVIVED ${m.check}`);
      survived += 1;
    }
  } finally {
    fs.writeFileSync(abs, original);
  }
}
console.log(survived ? `${survived} of ${MUTANTS.length} survived` : `all ${MUTANTS.length} killed`);
process.exit(survived ? 1 : 0);
