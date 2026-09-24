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
// payload the planner reads back.
//
// A RECORD IS SIGNED, because the author check alone is not a boundary. Every
// workflow in this repo, including one pushed on any branch, runs as
// `github-actions[bot]`, so a branch workflow with `deployments: write` could post a
// "success" record claiming a function is current, and the planner would skip a
// deploy that was owed: silent drift, the thing this system exists to end
// (rls-privacy-reviewer, CUL-1147). The deploy job signs each payload with an HMAC
// keyed from SUPABASE_ACCESS_TOKEN, which only the main-only `production`
// environment holds, and the planner (in that same environment) ignores any record
// whose signature does not verify. Rotating the token therefore invalidates every
// record: the next push deploys nothing until a manual `all-changed` run re-records
// everything (the runbook says so).
//
// The payload's two fingerprints are what make a rollback hold: `fingerprint` is
// the closure that went live, `mainFingerprint` is `main`'s closure when it did.
// The planner redeploys a function only when `main` moves past `mainFingerprint`,
// so a rollback stays live until someone changes that function on `main`.

import * as crypto from 'node:crypto';

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

// The stored payload: the signed fields plus their signature.
export type SignedPayload = RecordPayload & { mac: string };

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
const MAC = /^[0-9a-f]{64}$/;

// The signing key: derived from the deploy token rather than the token itself, so
// the key has one purpose and a fixed label to rotate by.
export const recordKey = (secret: string): Buffer =>
  crypto.createHmac('sha256', secret).update('culprit-edge-deploy-record/v1').digest();

// Fixed field order, so signing and verifying hash the same bytes whatever order
// the JSON came back in.
const canonical = (p: RecordPayload) =>
  JSON.stringify([p.schema, p.function, p.sourceSha, p.fingerprint, p.mainSha, p.mainFingerprint, p.version, p.bundleSha256, p.runUrl, p.trigger]);

export const signPayload = (p: RecordPayload, key: Buffer): string =>
  crypto.createHmac('sha256', key).update(canonical(p)).digest('hex');

export function signatureValid(p: RecordPayload, mac: unknown, key: Buffer): boolean {
  if (typeof mac !== 'string' || !MAC.test(mac)) return false;
  return crypto.timingSafeEqual(Buffer.from(signPayload(p, key), 'hex'), Buffer.from(mac, 'hex'));
}
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
// (task, environment, creator), its payload parses and its signature verifies, the
// deploy produced a version and a bundle, and one of its statuses is `success`.
export function recordFrom(fn: string, d: GhDeployment, statuses: GhStatus[], key: Buffer): DeployRecord | null {
  if (typeof d.id !== 'number' || d.task !== recordTask(fn) || d.environment !== RECORD_ENVIRONMENT) return null;
  if (!d.creator || d.creator.login !== RECORD_CREATOR) return null;
  const payload = parsePayload(fn, d.payload);
  if (!payload || payload.version === null || payload.bundleSha256 === null) return null;
  if (!signatureValid(payload, (d.payload as { mac?: unknown }).mac, key)) return null;
  if (!statuses.some((s) => s.state === 'success')) return null;
  return {
    ...payload,
    version: payload.version,
    bundleSha256: payload.bundleSha256,
    deploymentId: d.id,
    createdAt: typeof d.created_at === 'string' ? d.created_at : '',
  };
}

// The list endpoint documents no order and no sort parameter, so the lookup reads
// EVERY page of this function's records (up to PAGE_CAP pages of PAGE_SIZE) and
// orders them itself, newest first by id, which only ever increases. Reading one page
// and trusting it to hold the newest records would, past a page of history, quietly
// miss the latest deploy (code-reviewer, CUL-1147). Past the cap the planner may
// treat a function as never deployed and deploy it again: the safe direction.
const PAGE_SIZE = 100;
const PAGE_CAP = 10;

export async function lastSuccessfulRecord(gh: Gh, repo: string, fn: string, key: Buffer): Promise<DeployRecord | undefined> {
  const q = `environment=${encodeURIComponent(RECORD_ENVIRONMENT)}&task=${encodeURIComponent(recordTask(fn))}&per_page=${PAGE_SIZE}`;
  const all: GhDeployment[] = [];
  for (let page = 1; page <= PAGE_CAP; page++) {
    const list = await gh.get(`/repos/${repo}/deployments?${q}&page=${page}`);
    if (!Array.isArray(list)) throw new Error(`GitHub returned no deployment list for ${fn}`);
    all.push(...(list as GhDeployment[]));
    if (list.length < PAGE_SIZE) break;
  }
  const deployments = all
    .filter((d) => typeof d.id === 'number')
    .sort((a, b) => (b.id as number) - (a.id as number));
  for (const d of deployments) {
    if (d.task !== recordTask(fn) || !d.creator || d.creator.login !== RECORD_CREATOR) continue;
    const statuses = await gh.get(`/repos/${repo}/deployments/${d.id as number}/statuses?per_page=30`);
    if (!Array.isArray(statuses)) throw new Error(`GitHub returned no status list for deployment ${String(d.id)}`);
    const record = recordFrom(fn, d, statuses as GhStatus[], key);
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
  key: Buffer,
): Promise<number> {
  const signed: SignedPayload = { ...payload, mac: signPayload(payload, key) };
  const created = await gh.post(`/repos/${repo}/deployments`, {
    ref: payload.sourceSha,
    task: recordTask(payload.function),
    environment: RECORD_ENVIRONMENT,
    description: clip(`${payload.function} from ${payload.sourceSha.slice(0, 7)}`, 140),
    payload: signed,
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
