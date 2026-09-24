// Deploy records (CUL-1147): what counts as the last successful deploy, and
// exactly what the workflow writes to GitHub.

import {
  lastSuccessfulRecord,
  parsePayload,
  recordFrom,
  RECORD_CREATOR,
  RECORD_ENVIRONMENT,
  recordTask,
  writeRecord,
  type Gh,
  type GhDeployment,
  type RecordPayload,
} from './records.ts';

const sha = (c: string) => c.repeat(40);
const fp = (c: string) => `sha256:${c.repeat(64)}`;

function payload(over: Partial<RecordPayload> = {}): RecordPayload {
  return {
    schema: 1,
    function: 'ask',
    sourceSha: sha('a'),
    fingerprint: fp('1'),
    mainSha: sha('a'),
    mainFingerprint: fp('1'),
    version: 7,
    bundleSha256: 'b'.repeat(64),
    runUrl: 'https://github.com/o/r/actions/runs/1',
    trigger: 'merge to main',
    ...over,
  };
}

function deployment(id: number, over: Partial<GhDeployment> = {}): GhDeployment {
  return {
    id,
    task: recordTask('ask'),
    environment: RECORD_ENVIRONMENT,
    payload: payload(),
    created_at: '2026-09-24T00:00:00Z',
    creator: { login: RECORD_CREATOR },
    ...over,
  };
}

describe('parsePayload', () => {
  it('accepts a complete payload and a failure payload with no version or bundle', () => {
    expect(parsePayload('ask', payload())).toEqual(payload());
    expect(parsePayload('ask', payload({ version: null, bundleSha256: null }))).toMatchObject({ version: null });
  });

  it.each([
    ['another function', { function: 'generate-report' }],
    ['an unknown schema', { schema: 2 as unknown as 1 }],
    ['a short sha', { sourceSha: 'abc1234' }],
    ['a bad fingerprint', { mainFingerprint: 'sha256:xyz' }],
    ['a zero version', { version: 0 }],
    ['a bad bundle hash', { bundleSha256: 'nope' }],
  ])('rejects %s', (_label, over) => {
    expect(parsePayload('ask', payload(over as Partial<RecordPayload>))).toBeNull();
  });
});

describe('recordFrom', () => {
  const ok = [{ state: 'success' }];

  it('reads a successful deploy', () => {
    expect(recordFrom('ask', deployment(5), ok)).toMatchObject({ function: 'ask', version: 7, deploymentId: 5 });
  });

  it('ignores anything that is not the workflow’s own successful record', () => {
    expect(recordFrom('ask', deployment(5), [{ state: 'failure' }])).toBeNull();
    expect(recordFrom('ask', deployment(5, { creator: { login: 'danieljmarkii' } }), ok)).toBeNull();
    expect(recordFrom('ask', deployment(5, { environment: 'production' }), ok)).toBeNull();
    expect(recordFrom('ask', deployment(5, { task: 'deploy' }), ok)).toBeNull();
    expect(recordFrom('ask', deployment(5, { payload: payload({ version: null }) }), ok)).toBeNull();
  });
});

function fakeGh(list: GhDeployment[], statuses: Record<number, { state: string }[]>) {
  const calls: string[] = [];
  const posts: { path: string; body: unknown }[] = [];
  const gh: Gh = {
    async get(path) {
      calls.push(path);
      if (path.includes('/statuses')) return statuses[Number(path.split('/deployments/')[1].split('/')[0])] ?? [];
      return list;
    },
    async post(path, body) {
      posts.push({ path, body });
      return path.endsWith('/deployments') ? { id: 42 } : {};
    },
  };
  return { gh, calls, posts };
}

describe('lastSuccessfulRecord', () => {
  it('asks for this function’s records in the record environment', async () => {
    const { gh, calls } = fakeGh([], {});
    await lastSuccessfulRecord(gh, 'o/r', 'ask');
    expect(calls[0]).toBe('/repos/o/r/deployments?environment=edge-functions&task=deploy%3Aask&per_page=30');
  });

  it('returns the newest success, skipping newer failures and foreign records, newest by id', async () => {
    const list = [
      deployment(3, { payload: payload({ version: 3 }) }),
      deployment(9, { creator: { login: 'someone' } }),
      deployment(8, { payload: payload({ version: null, bundleSha256: null }) }),
      deployment(6, { payload: payload({ version: 6 }) }),
    ];
    const { gh, calls } = fakeGh(list, { 3: [{ state: 'success' }], 8: [{ state: 'failure' }], 6: [{ state: 'success' }] });
    const record = await lastSuccessfulRecord(gh, 'o/r', 'ask');
    expect(record?.version).toBe(6);
    // The foreign record is skipped without a status call; the search stops at the first success.
    expect(calls.filter((c) => c.includes('/statuses'))).toEqual([
      '/repos/o/r/deployments/8/statuses?per_page=30',
      '/repos/o/r/deployments/6/statuses?per_page=30',
    ]);
  });

  it('is undefined when nothing succeeded', async () => {
    const { gh } = fakeGh([deployment(1)], { 1: [{ state: 'error' }] });
    expect(await lastSuccessfulRecord(gh, 'o/r', 'ask')).toBeUndefined();
  });
});

describe('writeRecord', () => {
  it('creates the deployment on the live commit, then gives it its one status', async () => {
    const { gh, posts } = fakeGh([], {});
    const id = await writeRecord(gh, 'o/r', payload(), 'success', 'v7 · checks passed', 'https://dash/ask');
    expect(id).toBe(42);
    expect(posts).toEqual([
      {
        path: '/repos/o/r/deployments',
        body: {
          ref: sha('a'),
          task: 'deploy:ask',
          environment: 'edge-functions',
          description: 'ask from aaaaaaa',
          payload: payload(),
          auto_merge: false,
          required_contexts: [],
          production_environment: true,
          transient_environment: false,
        },
      },
      {
        path: '/repos/o/r/deployments/42/statuses',
        body: {
          state: 'success',
          description: 'v7 · checks passed',
          log_url: 'https://github.com/o/r/actions/runs/1',
          environment_url: 'https://dash/ask',
          auto_inactive: false,
        },
      },
    ]);
  });

  it('clips the status description to GitHub’s 140 characters', async () => {
    const { gh, posts } = fakeGh([], {});
    await writeRecord(gh, 'o/r', payload(), 'failure', 'x'.repeat(300), 'https://dash/ask');
    expect((posts[1].body as { description: string }).description).toHaveLength(140);
  });

  it('throws when GitHub returns no id, rather than writing a status to nowhere', async () => {
    const gh: Gh = { get: async () => [], post: async () => ({}) };
    await expect(writeRecord(gh, 'o/r', payload(), 'success', 'x', 'u')).rejects.toThrow(/did not return a deployment id/);
  });
});
