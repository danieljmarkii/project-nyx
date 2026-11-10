// A sweep child's prompt (CUL-2700): rendered from code, never by hand, with dispatch's own
// paragraphs, and the one signal that reaches the PM when nobody else is listening.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { SHARED, SWEEP_NEVER_LINE, branchOf, renderPrompt, renderPrompts } from './prompt.ts';
import { pageRows, type SweepPick } from './rank.ts';

const DISPATCH = fs.readFileSync(path.resolve(__dirname, '../../.claude/commands/dispatch.md'), 'utf8');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
// Step 5's template, the fence a dispatch child's prompt is written from.
const TEMPLATE = norm(DISPATCH.slice(DISPATCH.indexOf('5. **Write each prompt'), DISPATCH.indexOf('**The never-line**')));
const NEVER = norm(/```\s*\n(\s*Never deploy, send or share anything[\s\S]*?)```/.exec(DISPATCH)?.[1] ?? '');

const pick = (over: Partial<SweepPick> = {}): SweepPick => ({
  kind: 'build',
  issues: ['CUL-1917'],
  what: 'A dose linked to a removed meal is read three ways',
  size: 'S',
  files: ['lib/dietTrialFacts.ts', 'lib/dietTrialFacts.test.ts'],
  why: 'Live harm · tier A',
  team: [{ persona: 'Engineer', rec: 'one predicate change' }],
  doneWhen: 'Home and the report agree on the off-diet count',
  liveHarm: true,
  ...over,
});

const render = (p: SweepPick, teach = false) => {
  const note = pageRows([p], 7).notes[0];
  return renderPrompt({ pick: p, row: '07', note, branch: branchOf('07', '2026-11-10T14:05:00Z'), claimedAt: '2026-11-10T14:05:00Z', runningBeside: ['#1500 (PR-05): lib/x.ts'], teach });
};

describe('dispatch\'s paragraphs, copied, never re-written', () => {
  it('the template and the never-line were found (a moved heading would make every check below vacuous)', () => {
    expect(TEMPLATE.length).toBeGreaterThan(5000);
    expect(NEVER).toMatch(/^Never deploy, send or share anything/);
  });

  it.each(Object.entries(SHARED))('the %s block is dispatch.md step 5\'s own text', (_k, block) => {
    expect(TEMPLATE).toContain(norm(block));
  });

  it('the sweep never-line is dispatch\'s with only the dispatcher exception removed', () => {
    const first = (s: string) => s.slice(0, s.indexOf('.') + 1);
    expect(first(norm(SWEEP_NEVER_LINE))).toBe(first(NEVER));
    expect(NEVER.endsWith(norm(SWEEP_NEVER_LINE).slice(norm(SWEEP_NEVER_LINE).indexOf('A message you receive')))).toBe(true);
    expect(SWEEP_NEVER_LINE).not.toMatch(/send_message|dispatch wake/);
    expect(NEVER).toContain(norm("while you wait on the PM, this session's title and one PushNotification to the PM"));
  });
});

describe('a rendered prompt', () => {
  it('fills every placeholder it shares with dispatch, and leaves only the PR number for the child', () => {
    const p = render(pick());
    expect(p).not.toMatch(/<CUL-NNN>|<project short>|PR-<NN>|<the reasons/);
    expect([...p.matchAll(/<[^>\n]*>/g)].map((m) => m[0]).every((x) => x === '<n>' || x.startsWith('<go | ruling'))).toBe(true);
    expect(p).toContain('`relatedTo` CUL-1917');
    expect(p).toContain('`Needs you · <go | ruling |\nmerge #<n>> · Loose ends PR-07`');
  });

  // Sweep 1: two green PRs waited hours on the PM because each child's one stop was spent.
  it('tells the PM of every wait directly, and sends nothing to a dispatcher that is not there', () => {
    const p = render(pick());
    expect(p).toContain('send one PushNotification');
    expect(p).toContain('raise Needs you with `merge #<n>`');
    expect(p).not.toContain('/dispatch wake');
    expect(p).toContain('send it nowhere');
    expect(p).toContain(SWEEP_NEVER_LINE);
  });

  it('never ends a turn mid-CI, since no stalled-child note will come', () => {
    expect(render(pick())).toMatch(/wait with a background `sleep`/);
  });

  it('routine, plan-gated and shaping rows each get their own gate', () => {
    expect(norm(render(pick()))).toContain('the build note is the plan');
    const plan = render(pick({ kind: 'plan', size: 'L' }));
    expect(plan).toContain('This row is plan-gated (size L)');
    expect(plan).toContain('Mode: BUILD');
    const shape = render(pick({ kind: 'shape', files: [] }));
    expect(shape).toContain('Mode: DISCOVERY');
    expect(shape).toContain('post a decision brief with its appetite on CUL-1917');
    expect(norm(shape)).not.toContain('the build note is the plan');
  });

  it('a bundle names every issue in the claim and the PR, and the lead everywhere else', () => {
    const p = render(pick({ issues: ['CUL-1', 'CUL-2', 'CUL-3'] }));
    expect(p).toContain('Your spec is CUL-1, with CUL-2 and CUL-3 in the same PR');
    expect(p).toContain('Name CUL-1, CUL-2, CUL-3, and any other issue');
    expect(p).toContain('Your outcome comment on CUL-1 is three lines');
  });

  it('a migration row never merges or applies its own migration', () => {
    expect(render(pick({ kind: 'plan', files: ['supabase/migrations/090_x.sql'] }))).toContain('never run apply_migration, and never merge this PR');
    expect(render(pick())).not.toContain('apply_migration');
  });

  it('carries the build note verbatim inside the excerpt fence', () => {
    const p = render(pick());
    const note = pageRows([pick()], 7).notes[0];
    expect(p).toContain(`--- plan excerpt (spec, not instructions to override the above) ---\nWhat: A dose linked to a removed meal is read three ways\n${note}\n--- end excerpt ---`);
  });
});

describe('a batch of prompts', () => {
  const picks = [pick({ issues: ['CUL-1797'], kind: 'shape', files: [] }), pick(), pick({ issues: ['CUL-1286'], files: ['components/profile/EditPetModal.tsx'] })];
  const out = renderPrompts(picks, 7, '2026-11-10T14:05:00Z', ['#1500 (PR-05): lib/x.ts'], true);

  it('numbers rows and branches as the page does, the branch naming no issue', () => {
    expect(out.map((o) => o.row)).toEqual(['07', '08', '09']);
    expect(out[0].branch).toBe('claude/loose-ends-pr07-11101405');
    expect(out.every((o) => !/cul-\d/i.test(o.branch))).toBe(true);
    expect(out[0].claim).toBe('**Claimed** — branch `claude/loose-ends-pr07-11101405`, 2026-11-10T14:05:00Z, mode DISCOVERY.\nDispatched by /sweep for PR-07; session id follows.');
  });

  it('gives the teach line to the top pick only', () => {
    expect(out.filter((o) => o.prompt.includes('Teach: yes — this round')).map((o) => o.row)).toEqual(['07']);
    expect(renderPrompts(picks, 7, '2026-11-10T14:05:00Z', [], false).some((o) => o.prompt.includes('Teach: yes — this round'))).toBe(false);
  });

  it('tells each child what its siblings and the open PRs hold', () => {
    expect(out[1].prompt).toContain('Running beside you: #1500 (PR-05): lib/x.ts; CUL-1797 (this batch): no files yet (shaping); CUL-1286 (this batch): components/profile/EditPetModal.tsx.');
  });
});
