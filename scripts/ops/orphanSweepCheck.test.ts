// The daily orphaned-storage check (CUL-2521): what reaches a person, and what does not leave.

import {
  askSweep,
  CHECK_BODY,
  ISSUE_TITLE,
  PARENT_ISSUE_ID,
  runCheck,
} from './orphanSweepCheck.ts';
import { ISSUE_TITLE as DRAFTS_TITLE, LINEAR_TEAM_ID, PARENT_ISSUE_ID as DRAFTS_PARENT } from './reportDraftsCheck.ts';

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

const ANON = 'anon-key';
const LINEAR = 'lin_api_test';

function net(opts: { sweep: { status: number; body?: unknown } | 'throw' | 'hang'; openIssue?: boolean; linearDown?: boolean }) {
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
    if (url.includes('/functions/v1/sweep-orphaned-storage')) {
      if (opts.sweep === 'throw') throw new Error('network');
      if (opts.sweep === 'hang') {
        return new Promise<never>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      }
      return reply(opts.sweep.status, opts.sweep.body ?? null);
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
  const log: string[] = [];
  const code = await runCheck({
    fetchFn: n.fetchFn,
    anonKey: ANON,
    linearApiKey: opts.noKey ? undefined : LINEAR,
    dayIso: '2026-11-05',
    runUrl: 'https://github.com/x/y/actions/runs/1',
    log: (l) => log.push(l),
  });
  return { code, log };
}

const linearCalls = (n: ReturnType<typeof net>) => n.calls.filter((c) => c.url === 'https://api.linear.app/graphql');
const mutation = (n: ReturnType<typeof net>, name: string) => linearCalls(n).find((c) => String(c.body.query).includes(name));
const created = (n: ReturnType<typeof net>) => (mutation(n, 'issueCreate')!.body.variables as { input: Record<string, unknown> }).input;

describe('the daily orphaned-storage check (CUL-2521)', () => {
  it('asks the sweep with the check body and the anon key, and nothing else', async () => {
    const n = net({ sweep: { status: 204 } });
    expect(await askSweep(n.fetchFn, ANON)).toEqual({ kind: 'none' });
    expect(n.calls).toHaveLength(1);
    expect(n.calls[0].body).toEqual(CHECK_BODY);
    expect(n.calls[0].body).toEqual({ check: 'overdue' });
    expect(n.calls[0].headers.Authorization).toBe(`Bearer ${ANON}`);
  });

  it('a clean check exits 0 and never calls Linear', async () => {
    const n = net({ sweep: { status: 204 } });
    expect((await run(n)).code).toBe(0);
    expect(linearCalls(n)).toHaveLength(0);
  });

  it.each([
    ['overdue', { overdue: true, incomplete: false }, /still stored/],
    ['incomplete', { overdue: false, incomplete: true }, /could not read every bucket/],
    ['both', { overdue: true, incomplete: true }, /still stored.*could not read every bucket/s],
  ] as const)('%s opens one issue of its own, related to CUL-2521, and the run goes red', async (_l, body, text) => {
    const n = net({ sweep: { status: 200, body } });
    expect((await run(n)).code).toBe(1);
    const input = created(n);
    expect(input).toMatchObject({ teamId: LINEAR_TEAM_ID, title: ISSUE_TITLE, priority: 2, labelIds: ['lbl-1'] });
    expect(String(input.description)).toMatch(/^TL;DR — plain English:/);
    expect(String(input.description)).toMatch(text);
    const rel = mutation(n, 'issueRelationCreate')!.body.variables as { input: Record<string, unknown> };
    expect(rel.input).toEqual({ issueId: 'new-1', relatedIssueId: PARENT_ISSUE_ID, type: 'related' });
  });

  it('never files into the draft check\'s thread', async () => {
    expect(ISSUE_TITLE).not.toBe(DRAFTS_TITLE);
    expect(PARENT_ISSUE_ID).not.toBe(DRAFTS_PARENT);
    const n = net({ sweep: { status: 200, body: { overdue: true, incomplete: false } } });
    await run(n);
    const find = linearCalls(n).find((c) => String(c.body.query).includes('issues('))!;
    expect((find.body.variables as Record<string, unknown>).title).toBe(ISSUE_TITLE);
  });

  it('a stall already reported adds a comment, not a second issue', async () => {
    const n = net({ sweep: { status: 200, body: { overdue: true, incomplete: false } }, openIssue: true });
    expect((await run(n)).code).toBe(1);
    expect(mutation(n, 'issueCreate')).toBeUndefined();
    const c = mutation(n, 'commentCreate')!.body.variables as { input: Record<string, unknown> };
    expect(c.input.issueId).toBe('open-1');
    expect(String(c.input.body)).toMatch(/^\*\*2026-11-05:/);
  });

  it.each([
    ['a 400 (outside the window, or the gate moved)', { status: 400 }, /HTTP 400/],
    ['a 401 (the anon key rotated)', { status: 401 }, /HTTP 401/],
    ['a 503 (the worker was busy)', { status: 503 }, /HTTP 503/],
    ['a 200 naming neither bit', { status: 200, body: { overdue: false, incomplete: false } }, /unexpected body/],
    ['a 200 with a bit that is not a boolean', { status: 200, body: { overdue: 'yes', incomplete: false } }, /unexpected body/],
    ['a 200 with no body', { status: 200 }, /unexpected body/],
  ] as const)('%s is "could not run", and still reaches a person', async (_l, sweep, detail) => {
    const n = net({ sweep });
    expect((await run(n)).code).toBe(1);
    expect(String(created(n).description)).toMatch(/could not reach the orphaned-storage sweep/);
    expect(String(created(n).description)).toMatch(detail);
  });

  it('a network failure and a timeout are "could not run", never clean', async () => {
    expect((await askSweep(net({ sweep: 'throw' }).fetchFn, ANON)).kind).toBe('unreachable');
    expect(await askSweep(net({ sweep: 'hang' }).fetchFn, ANON, 10)).toEqual({ kind: 'unreachable', detail: 'no answer in 0.01 s' });
  });

  it('with Linear down or no key (CUL-2518 pending), the run exits 2 so GitHub emails instead', async () => {
    const down = await run(net({ sweep: { status: 200, body: { overdue: true, incomplete: false } }, linearDown: true }));
    expect(down.code).toBe(2);
    const nokey = net({ sweep: { status: 200, body: { overdue: true, incomplete: false } } });
    const r = await run(nokey, { noKey: true });
    expect(r.code).toBe(2);
    expect(r.log.join('\n')).toMatch(/only alert/);
    expect(linearCalls(nokey)).toHaveLength(0);
  });

  it('the Linear key travels only to Linear', async () => {
    const n = net({ sweep: { status: 200, body: { overdue: true, incomplete: false } }, linearDown: true });
    const { log } = await run(n);
    for (const c of n.calls) {
      if (c.url.startsWith('https://api.linear.app/')) expect(c.headers.Authorization).toBe(LINEAR);
      else expect(JSON.stringify(c)).not.toContain(LINEAR);
    }
    expect(log.join('\n')).not.toContain(LINEAR);
  });
});
