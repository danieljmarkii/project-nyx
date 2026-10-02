// The deploy planner (CUL-1147). Each case is a decision the workflow makes on a
// real merge: what deploys, what is held, what a rollback does to the next merge.

import type { Ledger } from './ledger.ts';
import { planDeploys, type PlanInput, type Row } from './plan.ts';
import type { DeployRecord } from './records.ts';

const sha = (c: string) => c.repeat(40);
const fp = (c: string) => `sha256:${c.repeat(64)}`;
const HEAD = sha('a');

const FUNCTIONS = ['analyze-stool', 'analyze-vomit', 'ask', 'delete-account', 'generate-report'];
const ORDER = ['analyze-vomit', 'analyze-stool', 'ask'];

function record(fn: string, fingerprint: string, extra: Partial<DeployRecord> = {}): DeployRecord {
  return {
    schema: 1,
    function: fn,
    sourceSha: sha('b'),
    fingerprint,
    mainSha: sha('b'),
    mainFingerprint: fingerprint,
    version: 7,
    bundleSha256: 'c'.repeat(64),
    runUrl: 'https://github.com/o/r/actions/runs/1',
    trigger: 'merge to main',
    deploymentId: 1,
    createdAt: '2026-09-24T00:00:00Z',
    ...extra,
  };
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  const fingerprints = Object.fromEntries(FUNCTIONS.map((fn) => [fn, fp('1')]));
  const ledger: Ledger = { order: ORDER, holds: {} };
  return { functions: FUNCTIONS, fingerprints, ledger, records: {}, headSha: HEAD, request: { kind: 'changed', bootstrapGate: true }, ...over };
}

const decision = (rows: Row[], fn: string) => rows.find((r) => r.fn === fn)?.decision;

describe('planDeploys: a merge to main', () => {
  it('deploys nothing while no deploy is on record (bootstrap), but shows what it would do', () => {
    const plan = planDeploys(input());
    expect(plan.mode).toBe('bootstrap');
    expect(plan.deploys).toEqual([]);
    expect(plan.rows.every((r) => r.decision === 'deploy')).toBe(true);
  });

  it('once one deploy is on record, deploys every function that has none, in the declared order', () => {
    const plan = planDeploys(input({ records: { 'generate-report': record('generate-report', fp('1')) } }));
    expect(plan.mode).toBe('normal');
    expect(plan.deploys.map((d) => d.fn)).toEqual(['analyze-vomit', 'analyze-stool', 'ask', 'delete-account']);
    expect(plan.deploys.every((d) => d.reason === 'first' && d.sourceSha === HEAD)).toBe(true);
    expect(decision(plan.rows, 'generate-report')).toBe('unchanged');
  });

  it('deploys exactly the functions whose closure moved since their last deploy', () => {
    const records = Object.fromEntries(FUNCTIONS.map((fn) => [fn, record(fn, fp('1'))]));
    const fingerprints = { ...input().fingerprints, ask: fp('2'), 'analyze-vomit': fp('2') };
    const plan = planDeploys(input({ records, fingerprints }));
    expect(plan.deploys).toEqual([
      { fn: 'analyze-vomit', sourceSha: HEAD, reason: 'changed' },
      { fn: 'ask', sourceSha: HEAD, reason: 'changed' },
    ]);
  });

  it('with nothing changed, deploys nothing and is not bootstrap', () => {
    const records = Object.fromEntries(FUNCTIONS.map((fn) => [fn, record(fn, fp('1'))]));
    const plan = planDeploys(input({ records }));
    expect(plan).toMatchObject({ mode: 'normal', deploys: [] });
    expect(plan.rows.every((r) => r.decision === 'unchanged')).toBe(true);
  });

  it('never deploys a held function, changed or not, and says whether main is ahead of live', () => {
    const hold = { ref: 'CUL-215', reason: 'waits on the client build', fingerprint: fp('2') };
    const records = Object.fromEntries(FUNCTIONS.map((fn) => [fn, record(fn, fp('1'))]));
    const fingerprints = { ...input().fingerprints, 'delete-account': fp('2') };
    const plan = planDeploys(input({ records, fingerprints, ledger: { order: ORDER, holds: { 'delete-account': hold } } }));
    expect(plan.deploys).toEqual([]);
    expect(plan.rows.find((r) => r.fn === 'delete-account')).toMatchObject({ decision: 'held', behind: true, hold });

    // No record at all: the live state is unknown, not "behind".
    const fresh = planDeploys(
      input({ records: { ask: record('ask', fp('1')) }, ledger: { order: ORDER, holds: { 'delete-account': hold } } }),
    );
    expect(fresh.rows.find((r) => r.fn === 'delete-account')).toMatchObject({ decision: 'held', behind: null });
    expect(fresh.deploys.map((d) => d.fn)).not.toContain('delete-account');
  });

  it('a rollback stays live until main changes that function, then main deploys over it', () => {
    // Rolled back to an old closure (fp 0) while main was at fp 1.
    const rolled = record('ask', fp('0'), { mainFingerprint: fp('1'), sourceSha: sha('9'), mainSha: sha('b') });
    const records = { ...Object.fromEntries(FUNCTIONS.map((fn) => [fn, record(fn, fp('1'))])), ask: rolled };

    const quiet = planDeploys(input({ records }));
    expect(decision(quiet.rows, 'ask')).toBe('unchanged');
    expect(quiet.deploys).toEqual([]);

    const fixed = planDeploys(input({ records, fingerprints: { ...input().fingerprints, ask: fp('3') } }));
    expect(fixed.deploys).toEqual([{ fn: 'ask', sourceSha: HEAD, reason: 'changed' }]);
  });

  it('a manual all-changed run is not held back by bootstrap', () => {
    const plan = planDeploys(input({ request: { kind: 'changed', bootstrapGate: false } }));
    expect(plan.mode).toBe('normal');
    expect(plan.deploys).toHaveLength(FUNCTIONS.length);
  });

  it('refuses rather than guesses when a function has no fingerprint', () => {
    const fingerprints = { ...input().fingerprints };
    delete fingerprints.ask;
    const plan = planDeploys(input({ fingerprints }));
    expect(plan.mode).toBe('refused');
    expect(plan.deploys).toEqual([]);
  });
});

describe('planDeploys: a manual run for one function', () => {
  it('redeploys main when the ref is main, even if nothing changed', () => {
    const records = Object.fromEntries(FUNCTIONS.map((fn) => [fn, record(fn, fp('1'))]));
    const plan = planDeploys(input({ records, request: { kind: 'one', fn: 'ask', sourceSha: HEAD } }));
    expect(plan.deploys).toEqual([{ fn: 'ask', sourceSha: HEAD, reason: 'requested' }]);
    expect(plan.rows.filter((r) => r.decision === 'not-requested')).toHaveLength(FUNCTIONS.length - 1);
  });

  it('is a rollback when the ref is an older commit', () => {
    const plan = planDeploys(input({ request: { kind: 'one', fn: 'ask', sourceSha: sha('9') } }));
    expect(plan.deploys).toEqual([{ fn: 'ask', sourceSha: sha('9'), reason: 'rollback' }]);
  });

  it('is not gated by bootstrap: the first proof deploy is a manual run', () => {
    const plan = planDeploys(input({ request: { kind: 'one', fn: 'ask', sourceSha: HEAD } }));
    expect(plan.mode).toBe('normal');
    expect(plan.deploys).toHaveLength(1);
  });

  it('flags the other functions a push would deploy, so a manual run does not hide them', () => {
    const records = { ask: record('ask', fp('1')), 'analyze-vomit': record('analyze-vomit', fp('1')) };
    const plan = planDeploys(input({ records, request: { kind: 'one', fn: 'ask', sourceSha: HEAD } }));
    const owed = plan.rows.flatMap((r) => (r.decision === 'not-requested' && r.owed ? [r.fn] : []));
    expect(owed.sort()).toEqual(['analyze-stool', 'delete-account', 'generate-report']);
  });

  it('refuses a held function, and names the hold', () => {
    const hold = { ref: 'CUL-215', reason: 'waits on the client build', fingerprint: fp('1') };
    const plan = planDeploys(
      input({ ledger: { order: ORDER, holds: { 'delete-account': hold } }, request: { kind: 'one', fn: 'delete-account', sourceSha: HEAD } }),
    );
    expect(plan.mode).toBe('refused');
    expect(plan.deploys).toEqual([]);
    expect(plan.refusal).toContain('CUL-215');
  });

  it('refuses a function that does not exist', () => {
    const plan = planDeploys(input({ request: { kind: 'one', fn: 'view-report', sourceSha: HEAD } }));
    expect(plan).toMatchObject({ mode: 'refused', deploys: [] });
  });
});
