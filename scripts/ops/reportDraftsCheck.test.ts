// The daily vet report draft check (CUL-2465): what reaches a person, and what does not leave.

import {
  askReaper,
  CHECK_BODY,
  ISSUE_TITLE,
  LINEAR_TEAM_ID,
  PARENT_ISSUE_ID,
  runCheck,
} from './reportDraftsCheck.ts';

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

const ANON = 'anon-key';
const LINEAR = 'lin_api_test';

/** A fake network: the function's answer, and a Linear that may or may not already hold the open issue. */
function net(opts: {
  reaper: { status: number; body?: unknown } | 'throw' | 'hang';
  openIssue?: boolean;
  linearDown?: boolean;
}) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, headers: init.headers, body });
    const reply = (status: number, json: unknown) => ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => json,
      text: async () => JSON.stringify(json),
    });
    if (url.includes('/functions/v1/reap-report-drafts')) {
      if (opts.reaper === 'throw') throw new Error('network');
      if (opts.reaper === 'hang') {
        return new Promise<never>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      }
      return reply(opts.reaper.status, opts.reaper.body ?? null);
    }
    if (opts.linearDown) return reply(401, { errors: [{ message: 'Authentication required' }] });
    const q = String(body.query);
    if (q.includes('issues(')) return reply(200, { data: { issues: { nodes: opts.openIssue ? [{ id: 'open-1', identifier: 'CUL-9001', url: 'u1' }] : [] } } });
    if (q.includes('issueLabels(')) return reply(200, { data: { issueLabels: { nodes: [{ id: 'lbl-1', name: 'Live harm' }] } } });
    if (q.includes('issueCreate')) return reply(200, { data: { issueCreate: { success: true, issue: { id: 'new-1', identifier: 'CUL-9002', url: 'u2' } } } });
    if (q.includes('commentCreate')) return reply(200, { data: { commentCreate: { success: true } } });
    if (q.includes('issueRelationCreate')) return reply(200, { data: { issueRelationCreate: { success: true } } });
    return reply(400, { errors: [{ message: 'unexpected query' }] });
  };
  return { fetchFn, calls };
}

async function run(n: ReturnType<typeof net>, opts: { noKey?: boolean } = {}) {
  const linearApiKey = opts.noKey ? undefined : LINEAR;
  const log: string[] = [];
  const code = await runCheck({ fetchFn: n.fetchFn, anonKey: ANON, linearApiKey, dayIso: '2026-11-04', runUrl: 'https://github.com/x/y/actions/runs/1', log: (l) => log.push(l) });
  return { code, log };
}

const linearCalls = (n: ReturnType<typeof net>) => n.calls.filter((c) => c.url === 'https://api.linear.app/graphql');
const mutation = (n: ReturnType<typeof net>, name: string) => linearCalls(n).find((c) => String(c.body.query).includes(name));

describe('the daily draft check (CUL-2465)', () => {
  it('asks the reaper with its named body and the anon key, and nothing else', async () => {
    const n = net({ reaper: { status: 204 } });
    expect(await askReaper(n.fetchFn, ANON)).toEqual({ kind: 'none' });
    expect(n.calls).toHaveLength(1);
    expect(n.calls[0].body).toEqual(CHECK_BODY);
    expect(n.calls[0].headers.Authorization).toBe(`Bearer ${ANON}`);
  });

  it('no overdue draft: exits 0 and never calls Linear', async () => {
    const n = net({ reaper: { status: 204 } });
    const { code } = await run(n);
    expect(code).toBe(0);
    expect(linearCalls(n)).toHaveLength(0);
  });

  it('an overdue draft opens one issue in Culprit, labelled, related to CUL-2465, and the run goes red', async () => {
    const n = net({ reaper: { status: 200, body: { overdue: true } } });
    const { code } = await run(n);
    expect(code).toBe(1);
    const input = mutation(n, 'issueCreate')!.body.variables as { input: Record<string, unknown> };
    expect(input.input).toMatchObject({ teamId: LINEAR_TEAM_ID, title: ISSUE_TITLE, priority: 2, labelIds: ['lbl-1'] });
    expect(String(input.input.description)).toMatch(/older than 25 hours/);
    expect(String(input.input.description)).toMatch(/^TL;DR — plain English:/);
    const rel = mutation(n, 'issueRelationCreate')!.body.variables as { input: Record<string, unknown> };
    expect(rel.input).toEqual({ issueId: 'new-1', relatedIssueId: PARENT_ISSUE_ID, type: 'related' });
    expect(mutation(n, 'commentCreate')).toBeUndefined();
  });

  it('a stall that is already reported adds a comment, not a second issue', async () => {
    const n = net({ reaper: { status: 200, body: { overdue: true } }, openIssue: true });
    expect((await run(n)).code).toBe(1);
    expect(mutation(n, 'issueCreate')).toBeUndefined();
    const c = mutation(n, 'commentCreate')!.body.variables as { input: Record<string, unknown> };
    expect(c.input.issueId).toBe('open-1');
    expect(String(c.input.body)).toMatch(/^\*\*2026-11-04:/);
  });

  it.each([
    ['a 401 (the anon key rotated)', { status: 401 }, /HTTP 401/],
    ['a 404 (the function is not deployed)', { status: 404 }, /HTTP 404/],
    ['a 500 (the count failed)', { status: 500 }, /HTTP 500/],
    ['a 200 without the bit', { status: 200, body: { ok: true } }, /unexpected body/],
  ] as const)('%s is "could not run", and still reaches a person', async (_label, reaper, detail) => {
    const n = net({ reaper });
    expect((await run(n)).code).toBe(1);
    const input = mutation(n, 'issueCreate')!.body.variables as { input: Record<string, unknown> };
    expect(String(input.input.description)).toMatch(/could not reach the draft sweep/);
    expect(String(input.input.description)).toMatch(detail);
  });

  it('a network failure and a timeout are "could not run", never "none overdue"', async () => {
    expect((await askReaper(net({ reaper: 'throw' }).fetchFn, ANON)).kind).toBe('unreachable');
    const hung = await askReaper(net({ reaper: 'hang' }).fetchFn, ANON, 10);
    expect(hung).toEqual({ kind: 'unreachable', detail: 'no answer in 0.01 s' });
  });

  it('when Linear is down or the key is missing, the run fails with exit 2 so GitHub emails instead', async () => {
    const down = await run(net({ reaper: { status: 200, body: { overdue: true } }, linearDown: true }));
    expect(down.code).toBe(2);
    expect(down.log.join('\n')).toMatch(/Linear could not be reached: Linear answered HTTP 401/);
    const nokey = net({ reaper: { status: 200, body: { overdue: true } } });
    expect((await run(nokey, { noKey: true })).code).toBe(2);
    expect(linearCalls(nokey)).toHaveLength(0);
  });

  it('the Linear key travels only to Linear, and the error text never carries it', async () => {
    const n = net({ reaper: { status: 200, body: { overdue: true } }, linearDown: true });
    const { log } = await run(n);
    for (const c of n.calls) {
      if (c.url.startsWith('https://api.linear.app/')) expect(c.headers.Authorization).toBe(LINEAR);
      else expect(JSON.stringify(c)).not.toContain(LINEAR);
    }
    expect(log.join('\n')).not.toContain(LINEAR);
  });
});
