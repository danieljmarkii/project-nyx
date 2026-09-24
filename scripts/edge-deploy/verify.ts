// The checks that follow every deploy (CUL-1147), as pure judgments over what the
// Management API and the live function returned. The CLI makes the calls; this
// file decides what they mean, so the edges are tested without a network.
//
// What "a clean 4xx" has to mean, measured against production on 2026-09-24:
//
//   no auth header             → 401 {"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":…}   gateway
//   a malformed JWT            → 401 {"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":…} gateway
//   a function that isn't there → 404 {"code":"NOT_FOUND","message":…}                   gateway
//   `{}` with the anon key     → 400 {"error":"medication_item_id required"}              the function
//
// So a bare "any 4xx" would pass a deploy that never created the function: the
// gateway's own 404 is a 4xx too. The boot check therefore requires the function's
// own shape, a JSON object with a string `error` and no gateway `code`. All eight
// functions answer `{}` that way: they validate the body or the caller before doing
// anything else, so the call touches no data and calls no model.
//
// The no-auth call is the other half. With verify_jwt on, the gateway answers it;
// if the function's own `{"error":"Unauthorized"}` comes back instead, the gateway
// let an unauthenticated request through, and that fails even though it is a 401.

export type FunctionMeta = { version: number; status: string; verifyJwt: boolean };
export type HttpResult = { status: number; body: string } | { networkError: string };

export const BOOT_FAILURE = /\b(WORKER_ERROR|BOOT_ERROR|WORKER_LIMIT)\b/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// The Management API's function object (GET /v1/projects/{ref}/functions/{slug}).
export function parseMeta(raw: unknown): FunctionMeta | null {
  if (!isObject(raw)) return null;
  const { version, status, verify_jwt } = raw;
  if (typeof version !== 'number' || typeof status !== 'string' || typeof verify_jwt !== 'boolean') return null;
  return { version, status, verifyJwt: verify_jwt };
}

export function metaProblems(before: FunctionMeta | null, after: FunctionMeta | null): string[] {
  if (!after) return ['the function is not listed after the deploy'];
  const problems: string[] = [];
  if (before && after.version <= before.version) problems.push(`the version did not move (v${before.version} → v${after.version})`);
  if (after.status !== 'ACTIVE') problems.push(`status is ${after.status}, not ACTIVE`);
  if (!after.verifyJwt) problems.push('verify_jwt is off; every function here requires a signed-in caller');
  return problems;
}

// The deploy is done when the new version is listed and ACTIVE. Anything short of
// that is worth another look while the poll lasts.
export const settled = (before: FunctionMeta | null, after: FunctionMeta | null) =>
  !!after && after.status === 'ACTIVE' && (!before || after.version > before.version);

// The function's own error string, if this body is the function talking.
export function functionError(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObject(parsed) || 'code' in parsed) return null;
  return typeof parsed.error === 'string' ? parsed.error : null;
}

const clip = (s: string, n = 120) => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : flat.slice(0, n - 1) + '…';
};

export type Judgment = { verdict: 'pass' | 'retry' | 'fail'; detail: string };

export function judgeNoAuth(r: HttpResult): Judgment {
  if ('networkError' in r) return { verdict: 'retry', detail: `no response (${clip(r.networkError)})` };
  if (BOOT_FAILURE.test(r.body)) return { verdict: 'fail', detail: `the function failed to boot: ${clip(r.body)}` };
  if (r.status !== 401) return { verdict: 'fail', detail: `expected 401 from the gateway, got ${r.status}: ${clip(r.body)}` };
  if (functionError(r.body) !== null) {
    return {
      verdict: 'fail',
      detail: 'the function itself answered an unauthenticated call, so the gateway is not checking the JWT',
    };
  }
  return { verdict: 'pass', detail: '401 from the gateway' };
}

export function judgeAnon(r: HttpResult): Judgment {
  if ('networkError' in r) return { verdict: 'retry', detail: `no response (${clip(r.networkError)})` };
  if (BOOT_FAILURE.test(r.body)) return { verdict: 'fail', detail: `the function failed to boot: ${clip(r.body)}` };
  if (r.status >= 400 && r.status < 500) {
    const error = functionError(r.body);
    if (error !== null) return { verdict: 'pass', detail: `${r.status} "${clip(error, 80)}"` };
    return { verdict: 'fail', detail: `a ${r.status} that did not come from the function: ${clip(r.body)}` };
  }
  // The gateway can answer 502/503/504 for a few seconds while a new version
  // starts. A boot failure says so in the body, which is caught above.
  if (r.status === 502 || r.status === 503 || r.status === 504) {
    return { verdict: 'retry', detail: `gateway ${r.status}: ${clip(r.body)}` };
  }
  return { verdict: 'fail', detail: `expected a 4xx from the function, got ${r.status}: ${clip(r.body)}` };
}
