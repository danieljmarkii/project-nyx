// The sort (CUL-1872): retro 4's nine adversarial cases (appendix: pass 1's three, pass 2's
// Q1 to Q6), the three worst breaks of pass 2 named on CUL-1872 by PR-B's session, the
// CUL-1438 and CUL-1741 shapes, and the population, order and door-3 rules. Each case
// drives the real planner over a page shaped like Engines v3's, never a re-derivation.

import { APP_CONFIG, NOW, PM_UUID, UNTAGGED, finding, input, tagged } from './fixtures/sort-retro4.ts';
import { parsePage } from './page.ts';
import { planDispatch, type PlanInput } from './plan.ts';
import { scopeFromIssues, scopeFromPlan, scopeLine } from './progress.ts';
import { directionOf, inPopulation, keyDark, liveReasons, stopgapOf, type Candidate } from './sort.ts';

const run = (findings: Candidate[], over: Partial<PlanInput> = {}) => planDispatch(input({ findings, ...over })).sort!;
const door = (findings: Candidate[], id: string, over: Partial<PlanInput> = {}) => run(findings, over).sorted.find((s) => s.id === id)?.door;

describe('retro 4 pass 1', () => {
  it('P1.1 the LOUD/QUIET inversion: a QUIET finding is harm and never parks; a LOUD one parks and never gates', () => {
    const quiet = finding('CUL-1801', { description: tagged('QUIET') });
    const loud = finding('CUL-1802', { description: tagged('LOUD') });
    const r = run([quiet, loud]);
    expect(r.sorted.find((s) => s.id === 'CUL-1801')).toMatchObject({ harm: true });
    expect(['1', '2']).toContain(String(r.sorted.find((s) => s.id === 'CUL-1801')!.door));
    expect(r.sorted.find((s) => s.id === 'CUL-1802')).toMatchObject({ harm: false, door: 4, park: 'err loud' });
    // A gate label is harm whatever the tag: a LOUD-tagged Gate: clinical finding never parks.
    expect(door([finding('CUL-1841', { description: tagged('LOUD'), labels: ['Gate: clinical'], keys: [] })], 'CUL-1841')).toBe(1);
    expect(door([finding('CUL-1842', { description: tagged('neither'), labels: ['Live harm'], keys: [] })], 'CUL-1842')).toBe(1);
  });

  it('P1.2 a live trigger behind a dark feature is live: an applied migration is live whatever key it sits behind', () => {
    // engines_v3_en9 is dark, and the finding blocks its go-live; the trigger it names is applied.
    const f = finding('CUL-1803', { blocks: ['CUL-1500'], migrations: ['101_engines_v3_en3_seed'] });
    expect(door([f], 'CUL-1803')).toBe(1);
    // A migration only on main (depended on) is live too; one only in an open PR is not.
    expect(door([finding('CUL-1804', { blocks: ['CUL-1500'], migrations: ['101_engines_v3_en3_seed'] })], 'CUL-1804', { appliedMigrations: [] })).toBe(1);
    expect(door([finding('CUL-1805', { blocks: ['CUL-1500'], migrations: ['104_not_yet'] })], 'CUL-1805')).toBe(2);
    // Applied in production but not on main (applied from a branch): live.
    expect(door([finding('CUL-1843', { blocks: ['CUL-1500'], migrations: ['103_hotfix_trigger'] })], 'CUL-1843', { appliedMigrations: ['hotfix_trigger'] })).toBe(1);
    // With the applied list unread, even that one cannot be proven unapplied.
    expect(door([finding('CUL-1839', { blocks: ['CUL-1500'], migrations: ['104_not_yet'] })], 'CUL-1839', { appliedMigrations: undefined })).toBe(1);
    // A live surface the dispatcher names (a deployed function) is live whatever the keys say.
    expect(door([finding('CUL-1840', { blocks: ['CUL-1500'], liveSurfaces: ['generate-signal (deployed)'] })], 'CUL-1840')).toBe(1);
  });

  it('P1.3 a loud-only finding never holds a go-live: it parks, and its blocks relation is offered for unlink', () => {
    const f = finding('CUL-1806', { description: tagged('LOUD'), blocks: ['CUL-1500'] });
    const r = run([f]);
    expect(r.sorted.find((s) => s.id === 'CUL-1806')).toMatchObject({ door: 4, unlink: ['CUL-1500'] });
    expect(r.digest).not.toContain('gate on');
  });
});

describe('retro 4 pass 2', () => {
  it('Q1 dark is never decided from git: an unread production config, or a key missing from it, is live', () => {
    // main's seed migration says en9 ships dark; production was not read.
    const f = () => finding('CUL-1807', { blocks: ['CUL-1500'] });
    expect(door([f()], 'CUL-1807', { appConfig: null })).toBe(1);
    expect(door([f()], 'CUL-1807', { appConfig: undefined })).toBe(1);
    expect(door([f()], 'CUL-1807', { appConfig: { engines_v3_en10: false } })).toBe(1);
    expect(run([f()], { appConfig: null }).sorted[0].why).toContain('the production app_config read failed or was not taken');
    expect(run([f()], { appConfig: { engines_v3_en10: false } }).sorted[0].why).toContain('engines_v3_en9 is missing from production app_config');
    // A key with no go-live issue cannot be gated: live until one exists.
    expect(door([finding('CUL-1838', { keys: ['engines_v3_en9'], blocks: ['CUL-1500'] })], 'CUL-1838', { goLives: {} })).toBe(1);
  });

  it('Q2 a live finding outside the project, with no row, is offered as a --row launch', () => {
    const f = finding('CUL-1808', { inProject: false, project: 'Out of beta', createdAt: '2026-09-20T12:00:00Z', labels: ['Live harm'], relatedTo: [], keys: [] });
    const r = run([f]);
    expect(r.liveFixes).toEqual([expect.objectContaining({ id: 'CUL-1808', project: 'Out of beta', claimed: false })]);
  });

  it('Q3 a leak has a louder fix: its stopgap switches the leaking path off; a quiet one forces the louder output on', () => {
    const r = run([finding('CUL-1809', { harm: 'exposure', keys: [] }), finding('CUL-1810', { keys: [] })]);
    expect(r.liveFixes.find((l) => l.id === 'CUL-1809')!.stopgap).toContain('switch the leaking path off');
    expect(r.liveFixes.find((l) => l.id === 'CUL-1810')!.stopgap).toContain('force the louder output on');
    expect(stopgapOf('loss')).toContain('leaking path off');
    expect(stopgapOf()).toContain('never remove a warning');
  });

  it('Q4 a class spanning two flags: one live key makes it live; dark on both gates only when it blocks both go-lives', () => {
    expect(door([finding('CUL-1811', { keys: ['engines_v3_en9', 'engines_v3_en3'], blocks: ['CUL-1500', 'CUL-1502'] })], 'CUL-1811')).toBe(1);
    const half = run([finding('CUL-1812', { keys: ['engines_v3_en9', 'engines_v3_en10'], blocks: ['CUL-1500'] })]);
    expect(half.sorted[0]).toMatchObject({ door: 1 });
    expect(half.sorted[0].why).toContain('no blocks relation to go-live CUL-1501');
    const both = run([finding('CUL-1813', { keys: ['engines_v3_en9', 'engines_v3_en10'], blocks: ['CUL-1500', 'CUL-1501'] })]);
    expect(both.sorted[0]).toMatchObject({ door: 2, goLives: ['CUL-1500', 'CUL-1501'] });
  });

  it('Q6 a door-2 gate gets its Gate: label so no prune can close it, and loses Live harm with the read quoted', () => {
    const r = run([
      finding('CUL-1814', { blocks: ['CUL-1500'] }),
      finding('CUL-1815', { blocks: ['CUL-1500'], harm: 'exposure', labels: ['Live harm'] }),
      finding('CUL-1816', { blocks: ['CUL-1500'], labels: ['Gate: clinical'] }),
    ]);
    expect(r.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: 'CUL-1814', write: 'add label Gate: clinical' }),
        expect.objectContaining({ issue: 'CUL-1815', write: 'add label Gate: privacy' }),
        expect.objectContaining({ issue: 'CUL-1815', write: 'remove label Live harm', why: expect.stringContaining('engines_v3_en9 {"enabled":false,"allowlist":[]}') }),
      ]),
    );
    expect(r.writes.filter((w) => w.issue === 'CUL-1816')).toEqual([]);
  });

  // Q5 (an alarm that cannot switch off output already on) is in alarms.test.ts.
});

describe('the three worst breaks of pass 2 (CUL-1872, from PR-B)', () => {
  it('1. {enabled:true, allowlist:[]} reads as live', () => {
    expect(keyDark({ enabled: true, allowlist: [] })).toBe(false);
    expect(door([finding('CUL-1817', { keys: ['engines_v3_all'], blocks: ['CUL-1503'] })], 'CUL-1817')).toBe(1);
  });

  it('2. a Waiting on PM issue is still harm-read, and so is one the page names or a Skipped comment covers', () => {
    const r = run([
      finding('CUL-1818', { labels: ['Waiting on PM'], keys: [] }),
      finding('CUL-1777', { keys: [] }), // the page names CUL-1777
      finding('CUL-1819', { skipped: true, keys: [] }),
    ]);
    for (const id of ['CUL-1818', 'CUL-1777', 'CUL-1819']) expect(r.sorted.find((s) => s.id === id)).toMatchObject({ harm: true, door: 1 });
    expect(r.liveFixes.map((l) => l.id).sort()).toEqual(['CUL-1777', 'CUL-1818', 'CUL-1819']);
  });

  it('3. a QUIET finding that blocks an on-path row goes to door 1, not door 3', () => {
    const r = run([finding('CUL-1820', { blocks: ['CUL-1432'], keys: [] })]);
    expect(r.sorted[0].door).toBe(1);
    expect(r.noRow).toEqual([]);
  });
});

describe("CUL-1438's shape: live, clinical, filed before the window in another project", () => {
  // Gate: clinical + Waiting on PM, no Direction line, created 9/30 in Engines v3.1, on the
  // shipped engine (no key). It must reach the dispatcher as a live fix, not wait in a wave.
  const f = finding('CUL-1438', {
    title: 'The Signal can show an improving card when an owner stops logging symptoms but keeps logging meals',
    description: 'TL;DR — plain English: If an owner stops writing down vomits but keeps logging meals, the Signal can read the quiet as fewer episodes.\n\n**Blocks:** —',
    inProject: false,
    project: 'Engines v3.1: what v3.0 left open',
    createdAt: '2026-09-30T13:24:00Z',
    labels: ['Gate: clinical', 'Waiting on PM'],
    relatedTo: ['CUL-1131'],
    keys: [],
    liveSurfaces: ['generate-signal (deployed)'],
  });

  it('is in the population, harm, door 1, offered for --row, and gains Live harm', () => {
    expect(inPopulation(f)).toBe(true);
    const r = run([f]);
    expect(r.sorted[0]).toMatchObject({ harm: true, door: 1 });
    expect(r.liveFixes[0]).toMatchObject({ id: 'CUL-1438', project: 'Engines v3.1: what v3.0 left open' });
    expect(r.writes).toContainEqual(expect.objectContaining({ issue: 'CUL-1438', write: 'add label Live harm' }));
    // Already Waiting on PM: no second label.
    expect(r.writes.filter((w) => w.write === 'add label Waiting on PM')).toEqual([]);
  });
});

describe("CUL-1741's parent-link shape: LOUD-only, a sub-issue of a row's issue", () => {
  // Deleting the row that raised a tier never lowers it: the read stays raised, so it errs
  // loud. Filed as a sub-issue of CUL-1432 (PR-41's issue), which held the go-live.
  const f = finding('CUL-1741', {
    description: tagged('LOUD'),
    createdAt: '2026-10-11T12:46:41Z',
    parentId: 'CUL-1432',
    relatedTo: ['CUL-1516'],
    keys: ['engines_v3_en3'],
  });

  it('parks (err loud), is listed for unlink against its parent, and holds no row', () => {
    const p = planDispatch(input({ findings: [f] }));
    expect(p.sort!.sorted[0]).toMatchObject({ door: 4, park: 'err loud', unlink: ['CUL-1432'] });
    expect(p.sort!.unlink).toEqual([{ id: 'CUL-1741', targets: ['CUL-1432'] }]);
    expect(p.sort!.noRow).toEqual([]);
    expect(p.verdicts.find((v) => v.row === '41')!.reasons).toEqual([]);
  });

  it('untagged, the same text is QUIET (no tag counts as QUIET) unless a quoted reading says otherwise', () => {
    expect(door([{ ...f, description: UNTAGGED }], 'CUL-1741')).toBe(1);
    expect(door([{ ...f, description: UNTAGGED, reading: { kind: 'loud', quote: 'the read stays at its raised level' } }], 'CUL-1741')).toBe(4);
    // An empty quote is no reading.
    expect(door([{ ...f, description: UNTAGGED, reading: { kind: 'loud', quote: ' ' } }], 'CUL-1741')).toBe(1);
    // An explicit QUIET tag is never read away.
    expect(door([{ ...f, description: tagged('QUIET'), reading: { kind: 'loud', quote: 'stays raised' } }], 'CUL-1741')).toBe(1);
  });
});

describe('population (step 1)', () => {
  const base = { open: true, labels: [] as string[], relatedTo: [] as string[] };
  it("the project's issues since 10-03, never before", () => {
    expect(inPopulation(finding('CUL-1', { ...base, createdAt: '2026-10-03T00:00:00Z' }))).toBe(true);
    expect(inPopulation(finding('CUL-2', { ...base, createdAt: '2026-10-02T23:59:59Z' }))).toBe(false);
  });
  it('team-wide Live harm and Gate: issues at any date', () => {
    expect(inPopulation(finding('CUL-3', { ...base, inProject: false, createdAt: '2026-01-01T00:00:00Z', labels: ['Gate: privacy'] }))).toBe(true);
    expect(inPopulation(finding('CUL-4', { ...base, inProject: false, createdAt: '2026-01-01T00:00:00Z', labels: ['Live harm'] }))).toBe(true);
  });
  it('team-wide since 10-11 with a Direction: line or a relatedTo; not before, and not with neither one', () => {
    expect(inPopulation(finding('CUL-5', { ...base, inProject: false, createdAt: '2026-10-11T00:00:00Z' }))).toBe(true);
    expect(inPopulation(finding('CUL-6', { ...base, inProject: false, createdAt: '2026-10-11T00:00:00Z', description: UNTAGGED, relatedTo: ['CUL-9'] }))).toBe(true);
    expect(inPopulation(finding('CUL-7', { ...base, inProject: false, createdAt: '2026-10-10T23:00:00Z' }))).toBe(false);
    expect(inPopulation(finding('CUL-8', { ...base, inProject: false, description: UNTAGGED }))).toBe(false);
  });
  it('a closed issue is never read', () => {
    expect(inPopulation(finding('CUL-10', { open: false, labels: ['Live harm'] }))).toBe(false);
  });
});

describe('the tag and the dark read', () => {
  it('reads Direction: in any of the shapes a filer writes, and a malformed value as no tag', () => {
    expect(directionOf('x\n**Direction:** QUIET\n')).toBe('QUIET');
    expect(directionOf('Direction: LOUD')).toBe('LOUD');
    expect(directionOf('Direction: neither')).toBe('neither');
    expect(directionOf('Direction: quiet-ish')).toBeUndefined();
    expect(directionOf('the Direction: LOUD is mentioned mid-sentence')).toBeUndefined();
  });
  it('dark is only false, or enabled:false with a present, empty allowlist', () => {
    expect(keyDark(false)).toBe(true);
    expect(keyDark({ enabled: false, allowlist: [] })).toBe(true);
    for (const v of [true, { enabled: false }, { enabled: false, allowlist: [PM_UUID] }, { enabled: 'false', allowlist: [] }, null, 'false', 0, []]) expect(keyDark(v)).toBe(false);
  });
  it('no key named is live', () => {
    expect(liveReasons({ keys: [] }, APP_CONFIG, [], [])).toContain('no app_config key identified');
    expect(liveReasons({ keys: ['engines_v3_en9'] }, APP_CONFIG, [], [])).toEqual([]);
  });
  it('an allowlist addition promotes a door-2 gate to a door-1 fix', () => {
    const f = finding('CUL-1821', { blocks: ['CUL-1500'], labels: ['Gate: clinical'] });
    expect(door([f], 'CUL-1821')).toBe(2);
    const added = { ...APP_CONFIG, engines_v3_en9: { enabled: false, allowlist: [PM_UUID] } };
    const r = run([f], { appConfig: added });
    expect(r.sorted[0].door).toBe(1);
    expect(r.writes).toContainEqual(expect.objectContaining({ issue: 'CUL-1821', write: 'add label Live harm' }));
  });
  it('a go-live that closed makes a dark gate a live fix', () => {
    const p = input();
    p.issues['CUL-1500'] = { id: 'CUL-1500', state: 'Done' };
    expect(planDispatch({ ...p, findings: [finding('CUL-1822', { blocks: ['CUL-1500'] })] }).sort!.sorted[0].door).toBe(1);
  });
  it('a door-1 fix unclaimed 24 hours after it was filed gets Waiting on PM; a claimed one does not', () => {
    const old = finding('CUL-1823', { keys: [], createdAt: '2026-10-10T21:00:00Z' });
    expect(run([old]).writes).toContainEqual(expect.objectContaining({ issue: 'CUL-1823', write: 'add label Waiting on PM' }));
    const claimed = run([old], { claims: [{ issue: 'CUL-1823', branch: 'claude/x', at: '2026-10-11T21:00:00Z' }] });
    expect(claimed.writes.filter((w) => w.write === 'add label Waiting on PM')).toEqual([]);
    expect(run([finding('CUL-1824', { keys: [], createdAt: '2026-10-11T00:00:00Z' })]).writes.filter((w) => w.write === 'add label Waiting on PM')).toEqual([]);
  });
});

describe('door 3 (only neither, only an unmerged on-path row)', () => {
  it('a neither finding blocking an on-path row is a proposed row, numbered off its source', () => {
    const f = finding('CUL-1825', { description: tagged('neither'), parentId: 'CUL-1432', blocks: ['CUL-1432'] });
    const r = run([f]);
    expect(r.sorted[0]).toMatchObject({ door: 3, blocksRow: '41' });
    expect(r.noRow).toEqual([expect.objectContaining({ id: 'CUL-1825', pr: '41a', after: 'PR-41', blocks: '41', outside: false })]);
  });
  it('a neither finding blocking an off-path or a merged row parks', () => {
    expect(door([finding('CUL-1826', { description: tagged('neither'), blocks: ['CUL-1400'] })], 'CUL-1826')).toBe(4);
    const merged = input({ prs: [{ number: 900, title: 'Engines v3 PR-41: go-live', state: 'merged', headRef: 'claude/engines-v3-pr41-1', createdAt: NOW, mergedAt: NOW }] });
    expect(planDispatch({ ...merged, findings: [finding('CUL-1827', { description: tagged('neither'), blocks: ['CUL-1432'] })] }).sort!.sorted[0].door).toBe(4);
  });
  it('a LOUD finding blocking an on-path row parks: only neither reaches door 3', () => {
    expect(door([finding('CUL-1828', { description: tagged('LOUD'), blocks: ['CUL-1432'] })], 'CUL-1828')).toBe(4);
  });
  it('covered, skipped or Waiting on PM suppresses only the offer', () => {
    const r = run([
      finding('CUL-1777', { description: tagged('neither'), blocks: ['CUL-1432'] }),
      finding('CUL-1829', { description: tagged('neither'), blocks: ['CUL-1432'], labels: ['Waiting on PM'] }),
    ]);
    expect(r.sorted.map((s) => s.door)).toEqual(['covered', 'covered']);
    expect(r.noRow).toEqual([]);
  });
  it('asked-for work in the project that blocks an on-path row is offered too; other asked-for work is not', () => {
    const asked = (id: string, blocks: string[]) => finding(id, { description: UNTAGGED, relatedTo: [], blocks });
    const r = run([asked('CUL-1830', ['CUL-1300']), asked('CUL-1831', [])]);
    expect(r.sorted).toEqual([expect.objectContaining({ id: 'CUL-1830', finding: false, door: 3 }), expect.objectContaining({ id: 'CUL-1831', finding: false, door: 'asked' })]);
    expect(r.noRow.map((n) => n.id)).toEqual(['CUL-1830']);
  });
});

describe('the digest line', () => {
  it('counts only what was filed since the last run, by door', () => {
    const r = run(
      [
        finding('CUL-1832', { keys: [], title: 'main red' }),
        finding('CUL-1833', { description: tagged('neither'), blocks: ['CUL-1432'] }),
        finding('CUL-1834', { blocks: ['CUL-1500'] }),
        finding('CUL-1835', { description: tagged('LOUD') }),
        finding('CUL-1836', { description: tagged('neither'), kind: 'polish' }),
        finding('CUL-1837', { description: tagged('LOUD'), createdAt: '2026-10-10T00:00:00Z' }),
      ],
      { lastRun: '2026-10-11T00:00:00Z' },
    );
    expect(r.digest).toBe('Found since last run: 5 · 1 live fix (CUL-1832, main red) · 1 blocks PR-41 (proposed below) · 1 gate on CUL-1500 · 2 parked (1 err loud, 1 polish, 0 other)');
  });
});

describe('the page', () => {
  it('reads the Done means line, and a page without one has no path', () => {
    expect(parsePage(input().project.description).doneMeans).toEqual(['23', '27e', '27f', '27g', '41']);
    expect(parsePage('no line here').doneMeans).toBeUndefined();
  });
});

describe('the cost line: Asks you ≈ N (rule 4, from the gate predicate)', () => {
  const asks = (over: Partial<PlanInput> = {}, desc?: string) => {
    const i = input(over);
    if (desc) i.project = { ...i.project, description: desc };
    return planDispatch(i);
  };
  const v = (p: ReturnType<typeof planDispatch>, row: string) => p.verdicts.find((x) => x.row === row)!;

  it('a routine on-path row asks only the pick; a confirmed auto one asks nothing', () => {
    expect(v(asks(), '23').asks).toEqual({ n: 1, parts: ['the pick'] });
    const auto = input().project.description.replace('| 23 | CUL-1300', '| 23 auto | CUL-1300');
    expect(v(asks({ previousAuto: ['23'] }, auto), '23').asks).toEqual({ n: 0, parts: [] });
    // Marked but not confirmed on the status update: still a pick.
    expect(v(asks({}, auto), '23').asks.n).toBe(1);
  });

  it('an off-path row is never auto, so its pick is always typed, and it is never recommended', () => {
    const auto = input().project.description.replace('| 40 | CUL-1400', '| 40 auto | CUL-1400');
    const p = asks({ previousAuto: ['40'] }, auto);
    expect(v(p, '40')).toMatchObject({ onPath: false, asks: { n: 1, parts: ['the pick'] } });
    expect(p.proposal).toEqual(expect.arrayContaining(['23', '27e', '40']));
    expect(p.recommended).toEqual(expect.arrayContaining(['23', '27e']));
    expect(p.recommended).not.toContain('40');
  });

  it('plan go, apply, merge and a pending ruling each add one', () => {
    const desc = input().project.description.replace(
      '**PR-27e:** the read, per CUL-1611 option A.',
      '**PR-27e:** the read. Migration `supabase/migrations/105_may_wait.sql`; an RLS policy; redeploys the Edge Function `supabase/functions/generate-signal`.',
    );
    const p = input();
    p.project = { ...p.project, description: desc };
    p.issues['CUL-1601'] = { ...p.issues['CUL-1601'], labels: ['Waiting on PM'] };
    expect(v(planDispatch(p), '27e').asks).toEqual({
      n: 5,
      parts: ['the pick', 'its plan, then a go typed in its session (plan-gated: migration, RLS, Storage, deletion or export)', 'apply <NNN>', 'merge', 'the pending ruling'],
    });
  });

  it('a page with no Done means line has no path: nothing is recommended', () => {
    const p = asks({}, input().project.description.replace('**Done means (rows):** 23, 27e, 27f, 27g, 41', ''));
    expect(p.proposal.length).toBeGreaterThan(0);
    expect(p.recommended).toEqual([]);
  });
});

describe('the scope line (rule 5)', () => {
  it('planned is the Done means rows, now is every row, added counts rows whose issue was filed this week', () => {
    const i = input();
    i.issues['CUL-1300'] = { ...i.issues['CUL-1300'], createdAt: '2026-09-01T00:00:00Z' };
    i.issues['CUL-1603'] = { ...i.issues['CUL-1603'], createdAt: '2026-10-09T00:00:00Z' };
    i.issues['CUL-1400'] = { ...i.issues['CUL-1400'], createdAt: '2026-10-11T00:00:00Z' };
    const p = planDispatch(i);
    const created = Object.fromEntries(Object.entries(i.issues).map(([k, f]) => [k, f.createdAt]));
    expect(scopeLine(scopeFromPlan(p, created, NOW))).toBe('Scope: 5 planned · 6 now (+2 added this week)');
    expect(scopeLine(scopeFromPlan(p, {}, NOW))).toBe('Scope: 5 planned · 6 now (added this week not read)');
  });
  it('a project with no table says so, and an issue project counts its issues', () => {
    expect(scopeLine(scopeFromIssues([{ id: 'CUL-1', stateType: 'started', createdAt: NOW }, { id: 'CUL-2', stateType: 'canceled', createdAt: NOW }], NOW))).toBe('Scope: no Done means line · 1 now (+1 added this week)');
    expect(scopeLine()).toBe('Scope: not read');
  });
});
