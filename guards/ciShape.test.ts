// The CI shape guard (CUL-2860). The `main` ruleset requires checks BY NAME, and the docs
// only skip and the timezone matrix each have a way to make a required check pass without
// running what it names. This holds the four properties that stop it:
//   (1) the three check names the ruleset knows are each still a job's name;
//   (2) the timezone matrix runs the three zones B-514 chose, every zone to the end, and
//       each one the WHOLE suite (`npm test -- --ci`, nothing narrower);
//   (3) every job that reads `docs_only` skips only on the literal 'true' (`!= 'true'`), and
//       every job that needs `changes` still runs when `changes` failed (`!cancelled()` or
//       `always()`): a failed decision is a full run, never a skipped required check;
//   (4) the roll-up that carries the timezone name passes only on success, or on a skip
//       in a docs only run.
// Plus the rerun: main only, push only, attempt 1 only, failed jobs only.
//
// Blind spot, stated: this reads the YAML, it does not run Actions. That a skipped job
// reports success to the ruleset is GitHub's documented behaviour, checked on this PR's
// own docs only commit, not here.

import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';

const ROOT = path.resolve(__dirname, '..');

interface Step {
  name?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
}
interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  strategy?: { 'fail-fast'?: boolean; matrix?: { tz?: string[] } };
  steps?: Step[];
}
const load = (rel: string) => YAML.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as { jobs: Record<string, Job>; on: unknown };

const ci = load('.github/workflows/ci.yml');
const jobs = ci.jobs;
const needsOf = (j: Job): string[] => (j.needs === undefined ? [] : Array.isArray(j.needs) ? j.needs : [j.needs]);

describe('ci.yml (CUL-2860)', () => {
  it.each(['App (typecheck + jest)', 'Edge Functions (deno test)', 'App (jest, non-UTC timezones)'])(
    'a job still reports as the required check %s',
    (name) => {
      expect(Object.values(jobs).filter((j) => j.name === name)).toHaveLength(1);
    },
  );

  it('the timezone matrix runs all three zones to the end, each over the whole suite', () => {
    const tz = jobs['app-timezone'];
    expect(tz.strategy?.matrix?.tz).toEqual(['Pacific/Kiritimati', 'Pacific/Chatham', 'Pacific/Honolulu']);
    expect(tz.strategy?.['fail-fast']).toBe(false);
    const jest = (tz.steps ?? []).filter((s) => /\b(jest|npm test)\b/.test(s.run ?? ''));
    expect(jest).toHaveLength(1);
    expect(jest[0].run?.trim()).toBe('npm test -- --ci');
    expect(jest[0].env?.TZ).toBe('${{ matrix.tz }}');
    expect(jest[0].if).toBeUndefined();
  });

  it('every docs only skip fails open, and nothing downstream of `changes` is skipped by its failure', () => {
    const readers: string[] = [];
    for (const [id, job] of Object.entries(jobs)) {
      const conds = [job.if ?? '', ...(job.steps ?? []).map((s) => s.if ?? '')];
      for (const c of conds) {
        if (!c.includes('docs_only')) continue;
        readers.push(id);
        // The only allowed spellings: skip on != 'true', or the docs only branch on == 'true'.
        expect(c).toMatch(/needs\.changes\.outputs\.docs_only (!=|==) 'true'/);
      }
      if (needsOf(job).includes('changes')) {
        expect(job.if ?? '').toMatch(/!cancelled\(\)|always\(\)/);
        if (job.if?.includes("docs_only == 'true'")) throw new Error(`${id} runs only on docs only runs`);
      }
    }
    expect(readers).toEqual(expect.arrayContaining(['app', 'app-timezone', 'edge-functions']));
    // The app job itself never skips: it carries the guards over the docs.
    expect(jobs.app.if).not.toContain('docs_only');
  });

  it("the full jest step and the docs only step are each other's exact complement", () => {
    const steps = jobs.app.steps ?? [];
    const full = steps.find((s) => s.run?.trim() === 'npm test -- --ci');
    const docsOnly = steps.find((s) => s.run?.includes('docsOnlyCli.ts suites'));
    expect(full?.if).toBe("${{ needs.changes.outputs.docs_only != 'true' }}");
    expect(docsOnly?.if).toBe("${{ needs.changes.outputs.docs_only == 'true' }}");
  });

  it('the timezone roll-up passes only on success, or on a skip in a docs only run', () => {
    const roll = jobs['app-timezones'];
    expect(needsOf(roll)).toEqual(expect.arrayContaining(['changes', 'app-timezone']));
    expect(roll.if).toBe('${{ always() }}');
    const run = roll.steps?.[0].run ?? '';
    expect(run).toContain('[ "$RESULT" = "success" ]');
    expect(run).toContain('[ "$RESULT" = "skipped" ] && [ "$DOCS_ONLY" = "true" ]');
    expect(run.trim().endsWith('exit 1')).toBe(true);
  });
});

describe('ci-rerun.yml (CUL-2860)', () => {
  const rerun = load('.github/workflows/ci-rerun.yml');
  it('reruns a failed main push run once, failed jobs only', () => {
    expect(rerun.on).toEqual({ workflow_run: { workflows: ['CI'], types: ['completed'], branches: ['main'] } });
    const job = rerun.jobs.rerun;
    expect(job.if).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(job.if).toContain("github.event.workflow_run.event == 'push'");
    expect(job.if).toContain('github.event.workflow_run.run_attempt == 1');
    expect(job.steps?.[0].run).toMatch(/gh run rerun "\$RUN_ID" --failed/);
  });
});
