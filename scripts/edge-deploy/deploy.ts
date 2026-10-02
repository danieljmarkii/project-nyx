// The deploy loop (CUL-1147): for each planned function, in order, deploy it with
// `scripts/deploy-edge.sh <fn> --deploy`, check it, and record it. The first failure
// stops the run, because a later function in the order may depend on an earlier one
// (ask reads photos through analyze-vomit and analyze-stool).
//
// Every attempt that reached the deploy script is recorded, success or failure, so
// the history shows what was tried. Only a success counts for planning. A failure
// before the script ran (the source could not be prepared, the Management API did
// not answer) touched nothing live and is reported without a record.
//
// The I/O is injected, so the tests drive the real control flow with fakes.

import type { DeployItem } from './plan.ts';
import type { RecordPayload } from './records.ts';
import { judgeAnon, judgeNoAuth, metaProblems, type FunctionMeta, type HttpResult, type Judgment } from './verify.ts';

export type DeployDeps = {
  prepareSource: (item: DeployItem) => Promise<{ dir: string; fingerprint: string }>;
  readMeta: (fn: string) => Promise<FunctionMeta | null>;
  runDeployScript: (fn: string, dir: string) => Promise<number>;
  bundleSha256: (fn: string, dir: string) => string | null;
  waitForSettled: (fn: string, before: FunctionMeta | null) => Promise<FunctionMeta | null>;
  call: (fn: string, auth: 'none' | 'anon') => Promise<HttpResult>;
  sleep: (ms: number) => Promise<void>;
  record: (payload: RecordPayload, state: 'success' | 'failure', description: string) => Promise<number>;
  log: (line: string) => void;
};

export type DeployContext = {
  headSha: string;
  mainFingerprints: Record<string, string>;
  runUrl: string;
  trigger: string;
};

export type Stage = 'prepare' | 'deploy' | 'verify' | 'record';

export type Outcome =
  | {
      fn: string;
      result: 'deployed';
      before: number | null;
      version: number;
      bundleSha256: string;
      checks: string[];
      recordId: number;
    }
  | { fn: string; result: 'failed'; stage: Stage; detail: string; live: boolean }
  | { fn: string; result: 'not-attempted' };

const ATTEMPTS = 3;

// A smoke call with its retry policy: `retry` verdicts (no response, or a gateway
// 502/503/504 while the new version starts) are tried again with backoff.
async function smoke(
  fn: string,
  auth: 'none' | 'anon',
  judge: (r: HttpResult) => Judgment,
  deps: DeployDeps,
): Promise<Judgment> {
  let last: Judgment = { verdict: 'fail', detail: 'not attempted' };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = judge(await deps.call(fn, auth));
    if (last.verdict !== 'retry') return last;
    if (attempt < ATTEMPTS) await deps.sleep(5000 * attempt);
  }
  return { verdict: 'fail', detail: `still failing after ${ATTEMPTS} tries: ${last.detail}` };
}

async function deployOne(item: DeployItem, ctx: DeployContext, deps: DeployDeps): Promise<Outcome> {
  const { fn } = item;
  const failed = (stage: Stage, detail: string, live: boolean): Outcome => ({ fn, result: 'failed', stage, detail, live });

  let source: { dir: string; fingerprint: string };
  let before: FunctionMeta | null;
  try {
    source = await deps.prepareSource(item);
    before = await deps.readMeta(fn);
  } catch (e) {
    return failed('prepare', e instanceof Error ? e.message : String(e), false);
  }
  const mainFingerprint = ctx.mainFingerprints[fn];
  if (!mainFingerprint) return failed('prepare', `no fingerprint for ${fn} on main`, false);

  const payload = (version: number | null, bundle: string | null): RecordPayload => ({
    schema: 1,
    function: fn,
    sourceSha: item.sourceSha,
    fingerprint: source.fingerprint,
    mainSha: ctx.headSha,
    mainFingerprint,
    version,
    bundleSha256: bundle,
    runUrl: ctx.runUrl,
    trigger: ctx.trigger,
  });
  // Records a failure, then reports it. A record that cannot be written is logged
  // rather than thrown, so the failure being reported is the real one.
  const fail = async (stage: Stage, detail: string, version: number | null, bundle: string | null, live: boolean) => {
    try {
      await deps.record(payload(version, bundle), 'failure', `failed at ${stage}: ${detail}`);
    } catch (e) {
      deps.log(`could not record the failure for ${fn}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return failed(stage, detail, live);
  };

  deps.log(`▸ ${fn}: deploying ${item.sourceSha.slice(0, 7)} (${item.reason})`);
  const code = await deps.runDeployScript(fn, source.dir);
  const bundle = deps.bundleSha256(fn, source.dir);
  if (code !== 0) {
    // The script uploads last, so a non-zero exit almost always means nothing went
    // live; the version check below is what would say otherwise, and it is not run.
    return fail('deploy', `scripts/deploy-edge.sh exited ${code}`, null, bundle, false);
  }
  if (!bundle) return fail('deploy', 'the script succeeded but left no bundle to hash', null, null, true);

  let after: FunctionMeta | null;
  try {
    after = await deps.waitForSettled(fn, before);
  } catch (e) {
    return fail('verify', `could not read the deployed function: ${e instanceof Error ? e.message : String(e)}`, null, bundle, true);
  }
  const problems = metaProblems(before, after);
  const noAuth = await smoke(fn, 'none', judgeNoAuth, deps);
  const anon = await smoke(fn, 'anon', judgeAnon, deps);
  if (noAuth.verdict !== 'pass') problems.push(`no-auth call: ${noAuth.detail}`);
  if (anon.verdict !== 'pass') problems.push(`anon call: ${anon.detail}`);
  if (problems.length || !after) {
    return fail('verify', problems.join('; ') || 'no metadata', after ? after.version : null, bundle, true);
  }

  const checks = [
    `v${before ? before.version : '∅'} → v${after.version}`,
    'ACTIVE',
    'verify_jwt on',
    `no auth: ${noAuth.detail}`,
    `anon: ${anon.detail}`,
  ];
  let recordId: number;
  try {
    recordId = await deps.record(
      payload(after.version, bundle),
      'success',
      `v${after.version} · bundle ${bundle.slice(0, 12)} · checks passed`,
    );
  } catch (e) {
    return failed(
      'record',
      `deployed and checked, but the record could not be written (${e instanceof Error ? e.message : String(e)}). ` +
        `The next run will deploy it again, which is harmless.`,
      true,
    );
  }
  return { fn, result: 'deployed', before: before ? before.version : null, version: after.version, bundleSha256: bundle, checks, recordId };
}

export async function runDeploys(items: DeployItem[], ctx: DeployContext, deps: DeployDeps): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  let stopped = false;
  for (const item of items) {
    if (stopped) {
      outcomes.push({ fn: item.fn, result: 'not-attempted' });
      continue;
    }
    const outcome = await deployOne(item, ctx, deps);
    outcomes.push(outcome);
    if (outcome.result === 'failed') stopped = true;
  }
  return outcomes;
}
