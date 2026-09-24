// Deploy records: one GitHub deployment per Edge Function deploy (CUL-1147).
//
// WHY GITHUB DEPLOYMENTS AND NOT THE LEDGER FILE. Every record the manual path kept
// was written by a second, later step: someone deployed from the Codespace, then
// edited deploy-manifest.json in a PR. The second step is the one that got skipped.
// `generate-report` v16, v17 and v18 all went live with `main` still saying
// `pending`, and the analyze pair's record sat in an unmerged draft for eight days
// (#852). A record the deploying job writes itself, seconds after its checks pass,
// has no second step to skip. A ledger PR opened by the workflow would reintroduce
// one: a PR opened with the workflow's own token never triggers CI, so it could
// never pass the required checks without a second credential.
//
// Each record lives in the `edge-functions` environment (which holds no secrets),
// with task `deploy:<function>`, `ref` = the commit whose source went live, and a
// payload the planner reads back. Only records created by the workflow's own token
// (`github-actions[bot]`) count, so a hand-made deployment can't stand in for one.
//
// The payload's two fingerprints are what make a rollback hold: `fingerprint` is
// the closure that went live, `mainFingerprint` is `main`'s closure when it did.
// The planner redeploys a function only when `main` moves past `mainFingerprint`,
// so a rollback stays live until someone changes that function on `main`.

export const RECORD_ENVIRONMENT = 'edge-functions';
export const RECORD_CREATOR = 'github-actions[bot]';
export const recordTask = (fn: string) => `deploy:${fn}`;

export type RecordPayload = {
  schema: 1;
  function: string;
  sourceSha: string;
  fingerprint: string;
  mainSha: string;
  mainFingerprint: string;
  // Null only on a failure record, when the deploy never produced them.
  version: number | null;
  bundleSha256: string | null;
  runUrl: string;
  trigger: string;
};

export type DeployRecord = RecordPayload & { version: number; bundleSha256: string; deploymentId: number; createdAt: string };

export type GhDeployment = {
  id?: unknown;
  task?: unknown;
  environment?: unknown;
  payload?: unknown;
  created_at?: unknown;
  creator?: { login?: unknown } | null;
};
export type GhStatus = { state?: unknown };

// The GitHub REST calls this module needs, injected so the tests can stand in for them.
export type Gh = {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body: unknown) => Promise<unknown>;
};

const SHA = /^[0-9a-f]{40}$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// A payload the planner can trust, or null. Every field is checked, because a record
// that parses loosely would let a malformed one decide that a function is current.
export function parsePayload(fn: string, raw: unknown): RecordPayload | null {
  if (!isObject(raw)) return null;
  const p = raw;
  if (p.schema !== 1 || p.function !== fn) return null;
  if (typeof p.sourceSha !== 'string' || !SHA.test(p.sourceSha)) return null;
  if (typeof p.mainSha !== 'string' || !SHA.test(p.mainSha)) return null;
  if (typeof p.fingerprint !== 'string' || !FINGERPRINT.test(p.fingerprint)) return null;
  if (typeof p.mainFingerprint !== 'string' || !FINGERPRINT.test(p.mainFingerprint)) return null;
  if (p.version !== null && (typeof p.version !== 'number' || !Number.isInteger(p.version) || p.version < 1)) return null;
  if (p.bundleSha256 !== null && (typeof p.bundleSha256 !== 'string' || !HEX64.test(p.bundleSha256))) return null;
  if (typeof p.runUrl !== 'string' || typeof p.trigger !== 'string') return null;
  return {
    schema: 1,
    function: fn,
    sourceSha: p.sourceSha,
    fingerprint: p.fingerprint,
    mainSha: p.mainSha,
    mainFingerprint: p.mainFingerprint,
    version: p.version as number | null,
    bundleSha256: p.bundleSha256 as string | null,
    runUrl: p.runUrl,
    trigger: p.trigger,
  };
}

// A deployment counts as a record of a successful deploy only if it is ours
// (task, environment, creator), its payload parses, the deploy produced a version
// and a bundle, and one of its statuses is `success`.
export function recordFrom(fn: string, d: GhDeployment, statuses: GhStatus[]): DeployRecord | null {
  if (typeof d.id !== 'number' || d.task !== recordTask(fn) || d.environment !== RECORD_ENVIRONMENT) return null;
  if (!d.creator || d.creator.login !== RECORD_CREATOR) return null;
  const payload = parsePayload(fn, d.payload);
  if (!payload || payload.version === null || payload.bundleSha256 === null) return null;
  if (!statuses.some((s) => s.state === 'success')) return null;
  return {
    ...payload,
    version: payload.version,
    bundleSha256: payload.bundleSha256,
    deploymentId: d.id,
    createdAt: typeof d.created_at === 'string' ? d.created_at : '',
  };
}

// How far back to look for the last success. Thirty consecutive failed deploys of
// one function would push its last success out of reach, and the planner would then
// treat it as never deployed and deploy it: the safe direction.
const LOOKBACK = 30;

export async function lastSuccessfulRecord(gh: Gh, repo: string, fn: string): Promise<DeployRecord | undefined> {
  const q = `environment=${encodeURIComponent(RECORD_ENVIRONMENT)}&task=${encodeURIComponent(recordTask(fn))}&per_page=${LOOKBACK}`;
  const list = await gh.get(`/repos/${repo}/deployments?${q}`);
  if (!Array.isArray(list)) throw new Error(`GitHub returned no deployment list for ${fn}`);
  // Newest first by id, which only ever increases, rather than trusting the API's order.
  const deployments = (list as GhDeployment[])
    .filter((d) => typeof d.id === 'number')
    .sort((a, b) => (b.id as number) - (a.id as number));
  for (const d of deployments) {
    if (d.task !== recordTask(fn) || !d.creator || d.creator.login !== RECORD_CREATOR) continue;
    const statuses = await gh.get(`/repos/${repo}/deployments/${d.id as number}/statuses?per_page=30`);
    if (!Array.isArray(statuses)) throw new Error(`GitHub returned no status list for deployment ${String(d.id)}`);
    const record = recordFrom(fn, d, statuses as GhStatus[]);
    if (record) return record;
  }
  return undefined;
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + '…');

// One call to create the deployment, one to give it its only status. Written after
// the deploy's checks have run, so the payload is complete and never edited.
export async function writeRecord(
  gh: Gh,
  repo: string,
  payload: RecordPayload,
  state: 'success' | 'failure',
  description: string,
  environmentUrl: string,
): Promise<number> {
  const created = await gh.post(`/repos/${repo}/deployments`, {
    ref: payload.sourceSha,
    task: recordTask(payload.function),
    environment: RECORD_ENVIRONMENT,
    description: clip(`${payload.function} from ${payload.sourceSha.slice(0, 7)}`, 140),
    payload,
    auto_merge: false,
    required_contexts: [],
    production_environment: true,
    transient_environment: false,
  });
  const id = isObject(created) ? created.id : undefined;
  if (typeof id !== 'number') throw new Error(`GitHub did not return a deployment id for ${payload.function}`);
  await gh.post(`/repos/${repo}/deployments/${id}/statuses`, {
    state,
    description: clip(description, 140),
    log_url: payload.runUrl,
    environment_url: environmentUrl,
    auto_inactive: false,
  });
  return id;
}
