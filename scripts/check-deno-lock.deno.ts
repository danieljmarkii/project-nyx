// CI entry point for the deno.lock remote-graph guard (CUL-421 / B-434).
//
// Usage: deno run --allow-read scripts/check-deno-lock.deno.ts <baseline> <current>
//
// `<baseline>` is the COMMITTED lockfile (`git show HEAD:deno.lock`), `<current>` is the
// working copy after the cache step has had its chance to rewrite it. Taking the
// baseline from git rather than from a snapshot copied earlier in the job is deliberate:
// `git show` reads the committed blob whatever the working tree looks like, so the guard
// cannot be silently defeated by someone reordering the workflow steps. A snapshot taken
// after the rewrite would compare a file to itself and pass forever.
//
// The rule it enforces, and why it is not `--frozen`, is in
// `guards/denoLockRemoteGraph.ts`. That module is the single implementation — the jest
// guard beside it mutation-tests the same function this script runs, so the thing proven
// green in the app job is the thing CI executes here.

import {
  MIN_BASELINE_GUARDED_ENTRIES,
  UNGUARDED_LOCK_SECTIONS,
  countGuardedEntries,
  diffLockSections,
  type SectionFinding,
} from '../guards/denoLockRemoteGraph.ts';

function die(message: string): never {
  console.error(`::error::${message}`);
  Deno.exit(1);
}

function readLock(path: string, label: string): unknown {
  let text: string;
  try {
    text = Deno.readTextFileSync(path);
  } catch (cause) {
    die(`could not read the ${label} lockfile at ${path}: ${cause instanceof Error ? cause.message : cause}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    die(`the ${label} lockfile at ${path} is not valid JSON (${text.length} bytes)`);
  }
}

function report(findings: SectionFinding[]): void {
  for (const { section, added, removed, changed } of findings) {
    console.error(`\n  [${section}] +${added.length} added  -${removed.length} removed  ~${changed.length} changed`);
    const show = (label: string, keys: string[]) => {
      for (const key of keys.slice(0, 10)) console.error(`      ${label} ${key}`);
      if (keys.length > 10) console.error(`      ${label} … and ${keys.length - 10} more`);
    };
    show('+', added);
    show('-', removed);
    show('~', changed);
  }
}

function main(): void {
  const [baselinePath, currentPath] = Deno.args;
  if (!baselinePath || !currentPath) {
    die('usage: check-deno-lock.deno.ts <committed-lockfile> <current-lockfile>');
  }

  const baseline = readLock(baselinePath, 'committed');
  const current = readLock(currentPath, 'current');

  const baselineEntries = countGuardedEntries(baseline);
  if (baselineEntries < MIN_BASELINE_GUARDED_ENTRIES) {
    die(
      `the committed lockfile parsed but holds only ${baselineEntries} guarded entries ` +
        `(expected at least ${MIN_BASELINE_GUARDED_ENTRIES}) — it did not load correctly, so an ` +
        `empty diff here would be meaningless rather than clean`,
    );
  }

  const findings = diffLockSections(baseline, current);
  if (findings.length === 0) {
    console.log(
      `deno.lock remote graph unchanged (${baselineEntries} guarded entries; ` +
        `'${UNGUARDED_LOCK_SECTIONS.join("', '")}' deliberately not guarded).`,
    );
    return;
  }

  console.error(
    '::error::the Deno run changed deno.lock outside the npm workspace mirror. Either a ' +
      'new remote import needs locking, or a pinned URL now serves different content — ' +
      'both need a human. Fix: run `deno cache --lock=deno.lock $(find supabase/functions ' +
      '-name "*.test.ts")` locally, review the added/changed URLs below, and commit the ' +
      'updated deno.lock.',
  );
  report(findings);
  Deno.exit(1);
}

main();
