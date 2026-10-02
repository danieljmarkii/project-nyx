// The post-deploy checks (CUL-1147). The response bodies below are the ones
// production returned on 2026-09-24, so the judgments are tested against the real
// gateway, not a guess at it.

import { functionError, judgeAnon, judgeNoAuth, metaProblems, parseMeta, settled } from './verify.ts';

const LIVE = {
  noAuthHeader: { status: 401, body: '{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}' },
  badJwt: { status: 401, body: '{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}' },
  noSuchFunction: { status: 404, body: '{"code":"NOT_FOUND","message":"Requested function was not found"}' },
  functionSaysNo: { status: 400, body: '{"error":"medication_item_id required"}' },
};

describe('parseMeta / metaProblems / settled', () => {
  const meta = (version: number, status = 'ACTIVE', verify_jwt = true) => parseMeta({ version, status, verify_jwt, slug: 'ask' });

  it('reads the Management API function object', () => {
    expect(meta(7)).toEqual({ version: 7, status: 'ACTIVE', verifyJwt: true });
    expect(parseMeta({ version: '7', status: 'ACTIVE', verify_jwt: true })).toBeNull();
  });

  it('passes a bumped, ACTIVE, JWT-checked function', () => {
    expect(metaProblems(meta(6), meta(7))).toEqual([]);
    expect(metaProblems(null, meta(1))).toEqual([]); // a brand-new function
  });

  it('names each thing that is wrong', () => {
    expect(metaProblems(meta(7), meta(7))).toEqual(['the version did not move (v7 → v7)']);
    expect(metaProblems(meta(6), meta(7, 'THROTTLED'))).toEqual(['status is THROTTLED, not ACTIVE']);
    expect(metaProblems(meta(6), meta(7, 'ACTIVE', false))[0]).toMatch(/verify_jwt is off/);
    expect(metaProblems(meta(6), null)).toEqual(['the function is not listed after the deploy']);
  });

  it('is settled only once the new version is listed and ACTIVE', () => {
    expect(settled(meta(6), meta(6))).toBe(false);
    expect(settled(meta(6), meta(7, 'THROTTLED'))).toBe(false);
    expect(settled(meta(6), meta(7))).toBe(true);
  });
});

describe('functionError', () => {
  it('recognises the function talking, and only the function', () => {
    expect(functionError(LIVE.functionSaysNo.body)).toBe('medication_item_id required');
    expect(functionError(LIVE.noSuchFunction.body)).toBeNull();
    expect(functionError('{"code":"X","error":"looks like ours"}')).toBeNull();
    expect(functionError('<html>')).toBeNull();
  });
});

describe('judgeNoAuth', () => {
  it('passes the gateway rejecting a call with no JWT', () => {
    expect(judgeNoAuth(LIVE.noAuthHeader).verdict).toBe('pass');
  });

  it('fails when the function itself answered, because the gateway let it through', () => {
    const j = judgeNoAuth({ status: 401, body: '{"error":"Unauthorized"}' });
    expect(j.verdict).toBe('fail');
    expect(j.detail).toMatch(/gateway is not checking the JWT/);
  });

  it('fails any other status, and a boot failure, and retries no response', () => {
    expect(judgeNoAuth({ status: 200, body: '{}' }).verdict).toBe('fail');
    expect(judgeNoAuth({ status: 401, body: '{"code":"BOOT_ERROR"}' }).verdict).toBe('fail');
    expect(judgeNoAuth({ networkError: 'ECONNRESET' }).verdict).toBe('retry');
  });
});

describe('judgeAnon', () => {
  it('passes a 4xx from the function', () => {
    expect(judgeAnon(LIVE.functionSaysNo)).toEqual({ verdict: 'pass', detail: '400 "medication_item_id required"' });
  });

  it('fails the gateway’s own 404, the 4xx a missing function returns', () => {
    const j = judgeAnon(LIVE.noSuchFunction);
    expect(j.verdict).toBe('fail');
    expect(j.detail).toMatch(/did not come from the function/);
  });

  it('fails a rejected anon key', () => {
    expect(judgeAnon(LIVE.badJwt).verdict).toBe('fail');
  });

  it('fails a boot or worker error at any status', () => {
    for (const body of ['{"code":"WORKER_ERROR"}', '{"code":"BOOT_ERROR","message":"x"}', 'WORKER_LIMIT']) {
      for (const status of [500, 503, 546]) expect(judgeAnon({ status, body }).verdict).toBe('fail');
    }
  });

  it('retries a starting gateway and no response, and fails a 200 or a 500', () => {
    expect(judgeAnon({ status: 503, body: 'upstream starting' }).verdict).toBe('retry');
    expect(judgeAnon({ networkError: 'timeout' }).verdict).toBe('retry');
    expect(judgeAnon({ status: 200, body: '{}' }).verdict).toBe('fail');
    expect(judgeAnon({ status: 500, body: '{"error":"boom"}' }).verdict).toBe('fail');
  });
});
