// The job summaries (CUL-1147): the lines the PM acts on have to be there.

import type { Outcome } from './deploy.ts';
import type { Plan } from './plan.ts';
import type { DeployRecord } from './records.ts';
import { planSummary, resultSummary } from './summary.ts';

const sha = (c: string) => c.repeat(40);
const fp = (c: string) => `sha256:${c.repeat(64)}`;
const CTX = { headSha: sha('a'), trigger: 'merge to main', repoUrl: 'https://github.com/o/r' };

const record = (over: Partial<DeployRecord> = {}): DeployRecord => ({
  schema: 1,
  function: 'ask',
  sourceSha: sha('b'),
  fingerprint: fp('1'),
  mainSha: sha('b'),
  mainFingerprint: fp('1'),
  version: 6,
  bundleSha256: 'c'.repeat(64),
  runUrl: 'https://github.com/o/r/actions/runs/1',
  trigger: 'merge to main',
  deploymentId: 1,
  createdAt: '2026-09-24T00:00:00Z',
  ...over,
});

describe('planSummary', () => {
  it('says nothing deploys yet in bootstrap, and how to start', () => {
    const plan: Plan = { mode: 'bootstrap', rows: [{ fn: 'ask', decision: 'deploy', item: { fn: 'ask', sourceSha: sha('a'), reason: 'first' } }], deploys: [] };
    const md = planSummary(plan, CTX);
    expect(md).toContain('Nothing deploys yet');
    expect(md).toContain('Run workflow');
    expect(md).toContain('would deploy');
  });

  it('lists every hold with its issue and full reason', () => {
    const hold = { ref: 'CUL-215', reason: 'waits for the client build that sends the password', fingerprint: fp('1'), since: '2026-08-20' };
    const plan: Plan = { mode: 'normal', rows: [{ fn: 'delete-account', decision: 'held', hold, behind: true }], deploys: [] };
    const md = planSummary(plan, CTX);
    expect(md).toContain('**held** by CUL-215');
    expect(md).toContain('`delete-account` (CUL-215, since 2026-08-20): waits for the client build that sends the password');
  });

  it('warns while a rollback is live', () => {
    const plan: Plan = { mode: 'normal', rows: [{ fn: 'ask', decision: 'unchanged', last: record({ fingerprint: fp('0') }) }], deploys: [] };
    expect(planSummary(plan, CTX)).toContain('A rollback is live');
  });

  it('shows a refusal and nothing else', () => {
    const md = planSummary({ mode: 'refused', rows: [], deploys: [], refusal: "'x' is held" }, CTX);
    expect(md).toContain("**Refused.** 'x' is held");
    expect(md).not.toContain('| Function |');
  });
});

describe('resultSummary', () => {
  it('names the exact manual run that restores the previous version when a failure may be live', () => {
    const outcomes: Outcome[] = [
      { fn: 'ask', result: 'failed', stage: 'verify', detail: 'anon call: a 404', live: true },
      { fn: 'generate-report', result: 'not-attempted' },
    ];
    const md = resultSummary(outcomes, { ask: record() }, CTX);
    expect(md).toContain('**failed** at verify');
    expect(md).toContain(`function \`ask\`, ref \`${sha('b')}\``);
    expect(md).toContain('| `generate-report` | not attempted |');
  });

  it('says nothing changed when the failure never reached production', () => {
    const md = resultSummary([{ fn: 'ask', result: 'failed', stage: 'deploy', detail: 'exit 1', live: false }], {}, CTX);
    expect(md).toContain('Nothing changed in production');
  });
});
