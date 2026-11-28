// Project go (CUL-2888) on a fixture project: preflight lists a clinical ruling, a
// migration and an unready row; `go project` is refused while a ruling is open; once
// ruled, every eligible row on the Done means path is confirmed auto and a kept row is not.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { planDispatch, type PlanInput } from './plan.ts';
import { goProject, preflight, readout, renderPreflight, type PreflightInput } from './preflight.ts';

const PAGE = fs.readFileSync(path.join(__dirname, 'fixtures/preflight-project.page.md'), 'utf8');
const NOW = '2026-11-28T12:00:00Z';

function facts(over: Partial<PreflightInput> = {}, page = PAGE): PreflightInput {
  const issues: PlanInput['issues'] = {};
  for (let i = 1; i <= 7; i++) issues[`CUL-900${i}`] = { id: `CUL-900${i}`, state: 'Todo', labels: [] };
  return {
    now: NOW,
    project: { name: 'Fixture go: a project for the preflight', description: page, firstDispatch: true },
    prs: [],
    issues,
    claims: [],
    sessions: {},
    launches: [],
    mainMigrations: ['supabase/migrations/149_before.sql'],
    ...over,
  };
}

const RULED = { 'PR-03': '(a) escalate after two logs in 24 hours, 2026-11-28' };

describe('preflight on the fixture project', () => {
  const pre = preflight(facts());

  it('lists the clinical row as a ruling to make before kickoff, in a decision brief', () => {
    expect(pre.open.map((r) => r.key)).toEqual(['PR-03']);
    const r = pre.open[0];
    expect(r.needs).toMatch(/stakes: clinical/);
    expect(r.brief[0]).toMatch(/^Deciding: /);
    expect(r.brief[1]).toMatch(/^Options: .*recommended/);
    expect(r.brief[2]).toMatch(/^Consequence: go project is refused/);
  });

  it('lists the migration as an apply to come, and not as a ruling', () => {
    expect(pre.migrations).toEqual([{ row: '04', issue: 'CUL-9004', applies: ['apply 150'] }]);
    expect(pre.rulings.map((r) => r.key)).not.toContain('PR-04');
  });

  it('lists the unready rows with why: no Done when, and a hotspot two unordered rows share', () => {
    expect(pre.unready).toEqual([
      { row: '05', why: ['no `Done when` line in its build note', 'hotspot scripts/dispatch/common.ts is shared with PR-07, and neither is ordered after the other'] },
      { row: '07', why: ['hotspot scripts/dispatch/common.ts is shared with PR-05, and neither is ordered after the other'] },
    ]);
  });

  it('forecasts the rows and the typed inputs the run will need', () => {
    expect(pre.forecast.rows).toBe(7);
    // 01, 02: nothing once auto. 03: the pick and its plan go. 04: the pick, its plan go and
    // `apply 150`. 05, 06, 07: the pick each. Plus `go project` and the one open ruling.
    expect(pre.forecast.perRow).toEqual({ '01': 0, '02': 0, '03': 2, '04': 3, '05': 1, '06': 1, '07': 1 });
    expect(pre.forecast.inputs).toBe(1 + 1 + 8);
  });

  it('prints every section', () => {
    const t = renderPreflight(pre);
    expect(t).toMatch(/Rulings before kickoff: 1 open of 1/);
    expect(t).toMatch(/PR-04: apply 150 to come/);
    expect(t).toMatch(/PR-05 — no `Done when`/);
    expect(t).toMatch(/go project is refused until every one is ruled/);
  });
});

describe('go project', () => {
  it('is refused while a ruling is open, and names it', () => {
    const go = goProject(preflight(facts()));
    expect(go.ok).toBe(false);
    expect(go.ok === false && go.refused).toEqual([expect.stringMatching(/^PR-03: PR-03 is kept/)]);
  });

  const go = goProject(preflight(facts({ ruled: RULED })));

  it('once ruled, confirms auto on every eligible row on the path, first dispatch included', () => {
    expect(go.ok).toBe(true);
    expect(go.ok && go.auto).toEqual(['01', '02']);
    expect(go.ok && go.marks).toEqual(['01', '02']);
  });

  it('never confirms the kept row, the migration, an unready row or an off-path row', () => {
    if (!go.ok) throw new Error('refused');
    for (const r of ['03', '04', '05', '06', '07']) expect(go.auto).not.toContain(r);
    expect(go.withheld).toEqual([
      { row: '03', why: 'kept: stakes' },
      { row: '04', why: 'kept: stakes, a migration' },
      { row: '05', why: 'not agent ready' },
      { row: '07', why: 'not agent ready' },
    ]);
  });

  it('carries the rows already confirmed, minus merged ones, onto the Auto: line', () => {
    const merged = { number: 900, title: 'Fixture go PR-06: tidy', state: 'merged' as const, headRef: 'claude/fixture-go-pr06-11280000', createdAt: NOW, mergedAt: NOW };
    const g = goProject(preflight(facts({ ruled: RULED, previousAuto: ['06', '07'], prs: [merged] })));
    expect(g.ok && g.auto).toEqual(['07', '01', '02']);
  });

  it('is what the launch check reads: a re-plan with the marks and the Auto: line asks nothing for those rows', () => {
    if (!go.ok) throw new Error('refused');
    const marked = PAGE.replace('| 01 | CUL-9001', '| 01 auto | CUL-9001').replace('| 02 | CUL-9002', '| 02 auto | CUL-9002');
    const p = planDispatch(facts({ previousAuto: go.auto }, marked));
    expect(p.autoRows).toEqual(['01', '02']);
    expect(p.verdicts.find((v) => v.row === '01')!.asks.parts).not.toContain('the pick');
    expect(p.verdicts.find((v) => v.row === '03')!.asks.parts).toContain('the pick');
  });

  it('a row added after the go is not on its Auto: line', () => {
    if (!go.ok) throw new Error('refused');
    const added = PAGE.replace('| 07 | CUL-9007 | The fourth printer | — | B |', '| 07 | CUL-9007 | The fourth printer | — | B |\n| 08 | CUL-9008 | A late printer | — | B |');
    const later = preflight(facts({ ruled: RULED, previousAuto: go.auto }, added));
    expect(later.plan.autoRows).not.toContain('08');
  });
});

describe('what makes a row unready or eligible', () => {
  it('a row ordered after the other by After shares a hotspot without clashing', () => {
    const page = PAGE.replace('| 07 | CUL-9007 | The fourth printer | — | B |', '| 07 | CUL-9007 | The fourth printer | PR-05 | B |');
    const pre = preflight(facts({ ruled: RULED }, page));
    expect(pre.unready.map((u) => u.row)).toEqual(['05']);
    expect(pre.eligible).toEqual(['01', '02', '07']);
  });

  it('a chain on Never at the same time orders them too', () => {
    const page = PAGE.replace('Done means (rows):', '### Never at the same time\n\n* PR-05 → PR-07\n\n## Rest\n\nDone means (rows):');
    expect(preflight(facts({}, page)).unready.find((u) => u.row === '07')).toBeUndefined();
  });

  it('a row with no verify line is unready', () => {
    const page = PAGE.replace('Done when: the first table prints. Verify with: the fixture jest suite.', 'Done when: the first table prints.');
    const pre = preflight(facts({ ruled: RULED }, page));
    expect(pre.unready.find((u) => u.row === '01')!.why).toEqual(['no verify line in its build note']);
    expect(pre.eligible).not.toContain('01');
  });

  it('a design surface with no ratified mock round named is unready; naming one clears that reason', () => {
    const visual = PAGE.replace('Builds `scripts/dispatch/fixtureB.ts`.', 'Builds `scripts/dispatch/fixtureB.ts` with a new layout.');
    const pre = preflight(facts({}, visual));
    expect(pre.unready.find((u) => u.row === '02')!.why).toEqual([expect.stringMatching(/^a design surface \(a visual or motion choice\) with no ratified mock round named$/)]);
    const ratified = visual.replace('with a new layout.', 'with a new layout. Ratified round: R-4.');
    expect(preflight(facts({}, ratified)).unready.find((u) => u.row === '02')).toBeUndefined();
  });

  it('an After ruling is a ruling go project waits on', () => {
    const page = PAGE.replace('| 02 | CUL-9002 | The second printer | PR-01 | A |', '| 02 | CUL-9002 | The second printer | PR-01, PMD-7 ruling | A |');
    const pre = preflight(facts({ ruled: RULED }, page));
    expect(pre.open.map((r) => r.key)).toEqual(['PMD-7']);
    expect(goProject(pre).ok).toBe(false);
    expect(goProject(preflight(facts({ ruled: { ...RULED, 'PMD-7': 'ruled (a)' } }, page))).ok).toBe(true);
  });

  it('an After that waits on an issue merging is a dependency, not a ruling', () => {
    const page = PAGE.replace('| 02 | CUL-9002 | The second printer | PR-01 | A |', '| 02 | CUL-9002 | The second printer | PR-01, CUL-9100 merged | A |');
    expect(preflight(facts({ ruled: RULED }, page)).open).toEqual([]);
  });

  it('a page with no Done means line has nothing eligible', () => {
    const pre = preflight(facts({ ruled: RULED }, PAGE.replace('Done means (rows): 01, 02, 03, 04, 05, 07', '')));
    expect(pre.eligible).toEqual([]);
    expect(goProject(pre).ok && (goProject(pre) as { auto: string[] }).auto).toEqual([]);
  });

  it('a migration row that also carries a clinical call needs its ruling as well as its apply', () => {
    const page = PAGE.replace('Migration `supabase/migrations/150_fixture_col.sql`.', 'Migration `supabase/migrations/150_fixture_col.sql` so a vomit log escalates.');
    const pre = preflight(facts({ ruled: RULED }, page));
    expect(pre.open.map((r) => r.key)).toEqual(['PR-04']);
    expect(pre.open[0].needs).toMatch(/stakes: clinical/);
    expect(pre.migrations.map((m) => m.row)).toEqual(['04']);
  });

  // Adversarial pass 1: the migration's own file name, or another SQL file, carries the call.
  it.each([
    ['a clinical file name', 'supabase/migrations/150_vomit_threshold.sql', /stakes: clinical surface \(by name\)/],
    ['a privacy file name', 'supabase/migrations/150_pet_photo_tokens.sql', /stakes: privacy, Storage, deletion, export or share links \(by name\)/],
  ])('a migration row whose file has %s still needs its ruling', (_what, file, why) => {
    const pre = preflight(facts({ ruled: RULED }, PAGE.replace('supabase/migrations/150_fixture_col.sql', file)));
    expect(pre.open.map((r) => r.key)).toEqual(['PR-04']);
    expect(pre.open[0].needs).toMatch(why);
    expect(goProject(pre).ok).toBe(false);
  });

  it('a migration row that also runs a SQL file that is not a migration still needs its ruling', () => {
    const page = PAGE.replace('Migration `supabase/migrations/150_fixture_col.sql`.', 'Migration `supabase/migrations/150_fixture_col.sql`, then `scripts/ops/reset_counts.sql`.');
    const pre = preflight(facts({ ruled: RULED }, page));
    expect(pre.open.map((r) => r.key)).toEqual(['PR-04']);
    expect(pre.open[0].needs).toMatch(/irreversible \(SQL against a database\)/);
  });

  it('a migration row that also edits an Edge Function still needs its ruling', () => {
    const page = PAGE.replace('Migration `supabase/migrations/150_fixture_col.sql`.', 'Migration `supabase/migrations/150_fixture_col.sql`, and `supabase/functions/fixture/index.ts`.');
    expect(preflight(facts({ ruled: RULED }, page)).open[0]?.needs).toMatch(/server code over health data/);
  });

  it('the go marks only the eligible rows whose PR cell lacks auto', () => {
    const go = goProject(preflight(facts({ ruled: RULED }, PAGE.replace('| 01 | CUL-9001', '| 01 auto | CUL-9001'))));
    expect(go.ok && go.marks).toEqual(['02']);
    expect(go.ok && go.auto).toEqual(['01', '02']);
  });

  it('a merged row is out of the preflight', () => {
    const merged = { number: 901, title: 'Fixture go PR-01: first', state: 'merged' as const, headRef: 'claude/fixture-go-pr01-11280000', createdAt: NOW, mergedAt: NOW };
    const pre = preflight(facts({ ruled: RULED, prs: [merged] }));
    expect(pre.rows).not.toContain('01');
    expect(pre.eligible).toEqual(['02']);
  });
});

describe('the readout', () => {
  it('tallies rows merged with no input, typed inputs, rollbacks, parked decisions and stops', () => {
    const pr = (n: number, row: string) => ({ number: n, title: `Fixture go PR-${row}: x`, state: 'merged' as const, headRef: `claude/fixture-go-pr${row}-11280000`, createdAt: NOW, mergedAt: NOW });
    const p = planDispatch(facts({ prs: [pr(901, '01'), pr(902, '02'), pr(903, '03')] }));
    const t = readout(p, {
      inputs: [
        { at: NOW, text: 'go project' },
        { at: NOW, text: 'rule PR-03' },
        { at: NOW, text: 'go 03', row: '03' },
      ],
      rollbacks: [{ row: '02', pr: 904 }],
      parked: [{ row: '03', text: 'copy tone (CUL-9200)' }],
      stops: [{ row: '04', reason: 'apply 150' }],
    });
    expect(t.split('\n')).toEqual([
      'Readout · Fixture go',
      'Merged with no input: PR-01, PR-02 (2 of 3 merged)',
      'Typed inputs: 3 in total · the run 2 · PR-03 1',
      'Rollbacks: PR-02 (#904)',
      'Parked decisions: PR-03: copy tone (CUL-9200)',
      'What stopped: PR-04: apply 150',
    ]);
  });
});
