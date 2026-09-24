// The deploy loop (CUL-1147), driven with fakes for every call it makes. What is
// under test is the control flow: the order, stopping at the first failure,
// what gets recorded, and when a failure means the new code may be live.

import { runDeploys, type DeployContext, type DeployDeps } from './deploy.ts';
import type { DeployItem } from './plan.ts';
import type { RecordPayload } from './records.ts';
import type { FunctionMeta, HttpResult } from './verify.ts';

const sha = (c: string) => c.repeat(40);
const fp = (c: string) => `sha256:${c.repeat(64)}`;
const HEAD = sha('a');
const CTX: DeployContext = {
  headSha: HEAD,
  mainFingerprints: { 'analyze-vomit': fp('1'), ask: fp('2') },
  runUrl: 'https://github.com/o/r/actions/runs/9',
  trigger: 'merge to main',
};
const GATEWAY_401: HttpResult = { status: 401, body: '{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}' };
const FUNCTION_400: HttpResult = { status: 400, body: '{"error":"event_id required"}' };

type Fakes = {
  deps: DeployDeps;
  records: { payload: RecordPayload; state: string; description: string }[];
  scripts: string[];
  sleeps: number[];
};

function fakes(over: Partial<DeployDeps> = {}, version = 5): Fakes {
  const records: Fakes['records'] = [];
  const scripts: string[] = [];
  const sleeps: number[] = [];
  const versions: Record<string, number> = {};
  const deps: DeployDeps = {
    prepareSource: async (item) => ({ dir: `/src/${item.sourceSha.slice(0, 3)}`, fingerprint: fp('9') }),
    readMeta: async (fn) => ({ version: versions[fn] ?? version, status: 'ACTIVE', verifyJwt: true }),
    runDeployScript: async (fn) => {
      scripts.push(fn);
      versions[fn] = version + 1;
      return 0;
    },
    bundleSha256: () => 'd'.repeat(64),
    waitForSettled: async (fn) => ({ version: versions[fn] ?? version, status: 'ACTIVE', verifyJwt: true }),
    call: async (_fn, auth) => (auth === 'none' ? GATEWAY_401 : FUNCTION_400),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    record: async (payload, state, description) => {
      records.push({ payload, state, description });
      return records.length;
    },
    log: () => {},
    ...over,
  };
  return { deps, records, scripts, sleeps };
}

const items: DeployItem[] = [
  { fn: 'analyze-vomit', sourceSha: HEAD, reason: 'changed' },
  { fn: 'ask', sourceSha: HEAD, reason: 'changed' },
];

describe('runDeploys', () => {
  it('deploys, checks and records each function in order', async () => {
    const f = fakes();
    const outcomes = await runDeploys(items, CTX, f.deps);
    expect(f.scripts).toEqual(['analyze-vomit', 'ask']);
    expect(outcomes.map((o) => o.result)).toEqual(['deployed', 'deployed']);
    expect(outcomes[0]).toMatchObject({ before: 5, version: 6 });
    expect(f.records.map((r) => r.state)).toEqual(['success', 'success']);
    expect(f.records[0].payload).toEqual({
      schema: 1,
      function: 'analyze-vomit',
      sourceSha: HEAD,
      fingerprint: fp('9'),
      mainSha: HEAD,
      mainFingerprint: fp('1'),
      version: 6,
      bundleSha256: 'd'.repeat(64),
      runUrl: CTX.runUrl,
      trigger: 'merge to main',
    });
  });

  it('stops at a failing script, records the failure, and skips the rest', async () => {
    const f = fakes({ runDeployScript: async () => 1 });
    const outcomes = await runDeploys(items, CTX, f.deps);
    expect(outcomes).toEqual([
      { fn: 'analyze-vomit', result: 'failed', stage: 'deploy', detail: 'scripts/deploy-edge.sh exited 1', live: false },
      { fn: 'ask', result: 'not-attempted' },
    ]);
    expect(f.records).toHaveLength(1);
    expect(f.records[0]).toMatchObject({ state: 'failure', payload: { version: null } });
  });

  it('fails the check when the gateway, not the function, answers the anon call', async () => {
    const notFound: HttpResult = { status: 404, body: '{"code":"NOT_FOUND","message":"Requested function was not found"}' };
    const f = fakes({ call: async (_fn, auth) => (auth === 'none' ? GATEWAY_401 : notFound) });
    const outcomes = await runDeploys(items, CTX, f.deps);
    expect(outcomes[0]).toMatchObject({ result: 'failed', stage: 'verify', live: true });
    expect(outcomes[1]).toEqual({ fn: 'ask', result: 'not-attempted' });
    expect(f.records[0]).toMatchObject({ state: 'failure', payload: { version: 6 } });
  });

  it('fails when the version did not move', async () => {
    const f = fakes({ waitForSettled: async () => ({ version: 5, status: 'ACTIVE', verifyJwt: true }) });
    const [first] = await runDeploys(items.slice(0, 1), CTX, f.deps);
    expect(first).toMatchObject({ result: 'failed', stage: 'verify' });
    expect(first.result === 'failed' && first.detail).toMatch(/version did not move/);
  });

  it('retries a starting gateway with backoff, then passes', async () => {
    const replies: HttpResult[] = [{ status: 503, body: 'starting' }, { networkError: 'reset' }, FUNCTION_400];
    const f = fakes({ call: async (_fn, auth) => (auth === 'none' ? GATEWAY_401 : (replies.shift() as HttpResult)) });
    const [first] = await runDeploys(items.slice(0, 1), CTX, f.deps);
    expect(first.result).toBe('deployed');
    expect(f.sleeps).toEqual([5000, 10000]);
  });

  it('gives up after three tries', async () => {
    const f = fakes({ call: async (_fn, auth) => (auth === 'none' ? GATEWAY_401 : { status: 503, body: 'starting' }) });
    const [first] = await runDeploys(items.slice(0, 1), CTX, f.deps);
    expect(first).toMatchObject({ result: 'failed', stage: 'verify' });
    expect(first.result === 'failed' && first.detail).toMatch(/after 3 tries/);
  });

  it('reports a deploy that passed but could not be recorded, as live', async () => {
    const f = fakes({
      record: async () => {
        throw new Error('GitHub POST returned 500');
      },
    });
    const outcomes = await runDeploys(items, CTX, f.deps);
    expect(outcomes[0]).toMatchObject({ result: 'failed', stage: 'record', live: true });
    expect(outcomes[1].result).toBe('not-attempted');
  });

  it('reports a source that could not be prepared, touching nothing and recording nothing', async () => {
    const f = fakes({
      prepareSource: async () => {
        throw new Error('not on main');
      },
    });
    const outcomes = await runDeploys(items, CTX, f.deps);
    expect(outcomes[0]).toEqual({ fn: 'analyze-vomit', result: 'failed', stage: 'prepare', detail: 'not on main', live: false });
    expect(f.scripts).toEqual([]);
    expect(f.records).toEqual([]);
  });

  it('records a rollback as the old source against main as it is now', async () => {
    const f = fakes();
    const rollback: DeployItem = { fn: 'ask', sourceSha: sha('7'), reason: 'rollback' };
    await runDeploys([rollback], CTX, f.deps);
    expect(f.records[0].payload).toMatchObject({ sourceSha: sha('7'), fingerprint: fp('9'), mainSha: HEAD, mainFingerprint: fp('2') });
  });

  it('treats a brand-new function (nothing listed before) as a first deploy', async () => {
    const before: Record<string, FunctionMeta | null> = { ask: null };
    const f = fakes({ readMeta: async (fn) => before[fn] ?? null });
    const [first] = await runDeploys([{ fn: 'ask', sourceSha: HEAD, reason: 'first' }], CTX, f.deps);
    expect(first).toMatchObject({ result: 'deployed', before: null, version: 6 });
  });
});
