// The two alarms (CUL-1872, retro 4's D3): CUL-1611's three-row forecast meeting its fourth
// row (CUL-1668), PR-23's third follow-up in seven days, and pass 2's Q5 (an alarm that
// cannot switch off output already on). Driven through the real planner.

import { APP_CONFIG, finding, input, tagged } from './fixtures/sort-retro4.ts';
import { forecastOf } from './alarms.ts';
import { planDispatch, type PlanInput } from './plan.ts';

const ROOT = { id: 'CUL-1611', description: 'Deciding: may_wait.\n\nForecast: 3 rows', keys: ['engines_v3_en9'], arm: 'on' as const };
// CUL-1668, a `neither` finding filed 10/8 that blocks PR-27g: the fourth row under the root.
const CUL_1668 = finding('CUL-1668', { description: tagged('neither'), parentId: 'CUL-1603', blocks: ['CUL-1603'], createdAt: '2026-10-08T11:13:00Z', title: 'may_wait migration of its own' });

const plan = (over: Partial<PlanInput>) => planDispatch(input(over));

describe('forecast + 1 (D3)', () => {
  it('reads Forecast: <n> rows in the shapes a brief writes', () => {
    expect(forecastOf('**Forecast:** 3 rows')).toBe(3);
    expect(forecastOf('Forecast: 1 row')).toBe(1);
    expect(forecastOf('no forecast')).toBeUndefined();
    expect(forecastOf('Forecast: two rows')).toBe(2);
    expect(forecastOf('Forecast: ~2 rows')).toBe(2);
    expect(forecastOf('Forecast: 2-3 rows')).toBe(2); // the lower bound: the earlier alarm
    expect(forecastOf('Forecast: 2 PRs')).toBe(2);
    expect(forecastOf('Forecast: a handful')).toBe('unreadable');
  });

  it('three rows under a three-row forecast: no alarm', () => {
    expect(plan({ roots: [ROOT] }).alarms).toEqual([]);
  });

  it('the fourth (CUL-1668) re-poses the fork and holds every unlaunched row and candidate under the root', () => {
    const p = plan({ roots: [ROOT], findings: [CUL_1668] });
    expect(p.alarms).toHaveLength(1);
    const a = p.alarms[0];
    expect(a).toMatchObject({ kind: 'forecast', root: 'CUL-1611', forecast: 3, count: 4, holdsCandidates: ['CUL-1668'] });
    expect(a.holdsRows.sort()).toEqual(['27e', '27f', '27g']);
    expect(a.fork).toBe('CUL-1611 forecast 3 rows; there are now 4 (PR-27e, PR-27f, PR-27g, CUL-1668). Continue at this cost, or take the louder option?');
    // 27e was otherwise ready; it is now held, with the reason in words.
    expect(p.verdicts.find((v) => v.row === '27e')!.reasons).toEqual(['forecast 3, now 4: back to the PM']);
    expect(p.proposal).not.toContain('27e');
    expect(p.alarmHeld['CUL-1668']).toBe('forecast 3, now 4: back to the PM');
    // A row outside the root is untouched.
    expect(p.verdicts.find((v) => v.row === '23')!.reasons).toEqual([]);
  });

  it('a launched row is not held, and a merged one still counts', () => {
    const prs = [
      { number: 901, title: 'Engines v3 PR-27e: read', state: 'merged' as const, headRef: 'claude/engines-v3-pr27e-1', createdAt: '2026-10-09T00:00:00Z', mergedAt: '2026-10-09T01:00:00Z' },
      { number: 902, title: 'Engines v3 PR-27f: render', state: 'open' as const, headRef: 'claude/engines-v3-pr27f-1', createdAt: '2026-10-10T00:00:00Z' },
    ];
    const a = plan({ roots: [ROOT], findings: [CUL_1668], prs }).alarms[0];
    expect(a.count).toBe(4);
    expect(a.holdsRows).toEqual(['27g']);
  });

  it('a door-1 fix under the root is never held and never counted', () => {
    const quiet = finding('CUL-1669', { blocks: ['CUL-1603'], keys: [] });
    const p = plan({ roots: [ROOT], findings: [quiet] });
    expect(p.sort!.sorted[0].door).toBe(1);
    expect(p.alarms).toEqual([]);
    expect(p.sort!.liveFixes.map((l) => l.id)).toEqual(['CUL-1669']);
  });

  it("a row whose issue carries Live harm is never held by an alarm", () => {
    const p = input({ roots: [ROOT], findings: [CUL_1668] });
    p.issues['CUL-1601'] = { ...p.issues['CUL-1601'], labels: ['Live harm'] };
    expect(planDispatch(p).alarms[0].holdsRows.sort()).toEqual(['27f', '27g']);
  });
});

describe('B11 a forecast the script cannot read alarms at once', () => {
  it('re-poses it to the PM to restate, holding every unlaunched row under it', () => {
    const a = plan({ roots: [{ ...ROOT, description: 'Forecast: a handful' }] }).alarms[0];
    expect(a).toMatchObject({ kind: 'forecast', forecast: 0, count: 3, reason: "CUL-1611's Forecast line is unreadable: back to the PM" });
    expect(a.holdsRows.sort()).toEqual(['27e', '27f', '27g']);
  });

  it('counts a covered door-3 finding (Waiting on PM) under the root', () => {
    const covered = { ...CUL_1668, labels: ['Waiting on PM'] };
    const p = plan({ roots: [ROOT], findings: [covered] });
    expect(p.sort!.sorted[0].door).toBe('covered');
    expect(p.alarms[0]).toMatchObject({ count: 4, holdsCandidates: ['CUL-1668'] });
  });
});

describe('the third follow-up in seven days (work with no forecast)', () => {
  const up = (id: string, createdAt: string) => finding(id, { description: tagged('LOUD'), relatedTo: ['CUL-1300'], createdAt });

  it('two follow-ups: no alarm; a third within seven days re-poses PR-23', () => {
    expect(plan({ findings: [up('CUL-1701', '2026-10-06T00:00:00Z'), up('CUL-1702', '2026-10-08T00:00:00Z')] }).alarms).toEqual([]);
    const p = plan({ findings: [up('CUL-1701', '2026-10-06T00:00:00Z'), up('CUL-1702', '2026-10-08T00:00:00Z'), up('CUL-1703', '2026-10-11T00:00:00Z')] });
    expect(p.alarms).toEqual([expect.objectContaining({ kind: 'follow-up', root: 'CUL-1300', rootRow: '23', count: 3, reason: 'third follow-up in 7 days under PR-23' })]);
    expect(p.alarms[0].fork).toBe('PR-23 has 3 follow-ups in 7 days (CUL-1701, CUL-1702, CUL-1703). Is its design right before another?');
  });

  it('one older than seven days does not count', () => {
    expect(plan({ findings: [up('CUL-1701', '2026-10-04T21:00:00Z'), up('CUL-1702', '2026-10-08T00:00:00Z'), up('CUL-1703', '2026-10-11T00:00:00Z')] }).alarms).toEqual([]);
  });

  it('a child, a blocks relation and a relatedTo all count as follow-ups', () => {
    const fs = [
      finding('CUL-1704', { description: tagged('LOUD'), relatedTo: [], parentId: 'CUL-1300' }),
      finding('CUL-1705', { description: tagged('neither'), relatedTo: [], blocks: ['CUL-1300'] }),
      up('CUL-1706', '2026-10-11T00:00:00Z'),
    ];
    const p = plan({ findings: fs });
    expect(p.alarms[0]).toMatchObject({ count: 3, holdsCandidates: ['CUL-1705'] });
  });

  it("follow-ups on a row's second issue count", () => {
    const desc = input().project.description.replace('| 23 | CUL-1300 |', '| 23 | CUL-1300, CUL-1301 |');
    const fs = ['CUL-1701', 'CUL-1702', 'CUL-1703'].map((id) => finding(id, { description: tagged('LOUD'), relatedTo: ['CUL-1301'] }));
    const i = input({ findings: fs });
    i.project = { ...i.project, description: desc };
    expect(planDispatch(i).alarms).toEqual([expect.objectContaining({ rootRow: '23', count: 3 })]);
  });

  it('a row under a forecast is counted by its forecast, never by follow-ups', () => {
    const fs = ['CUL-1707', 'CUL-1708', 'CUL-1709'].map((id) => finding(id, { description: tagged('LOUD'), relatedTo: ['CUL-1601'] }));
    expect(plan({ roots: [ROOT], findings: fs }).alarms).toEqual([]);
  });
});

describe('Q5: an alarm that cannot switch off output already on', () => {
  it('B9 a root whose keys are dark but whose output runs through an applied trigger needs a stopgap', () => {
    const trig = { ...ROOT, migrations: ['101_engines_v3_en3_seed'] };
    expect(plan({ roots: [trig], findings: [CUL_1668] }).alarms[0]).toMatchObject({ stopgap: true, stopgapWhy: expect.stringContaining('is applied') });
  });

  it("the quieter output on for any account (the PM's included) means a Live harm stopgap is filed", () => {
    const on = { ...ROOT, keys: ['engines_v3_en3'] }; // allowlist names the PM
    expect(plan({ roots: [on], findings: [CUL_1668] }).alarms[0]).toMatchObject({ stopgap: true, stopgapWhy: expect.stringContaining('engines_v3_en3') });
    // No key named, or production unread: the output reads as on.
    expect(plan({ roots: [{ ...ROOT, keys: [] }], findings: [CUL_1668] }).alarms[0].stopgap).toBe(true);
    expect(plan({ roots: [ROOT], findings: [CUL_1668], appConfig: null }).alarms[0].stopgap).toBe(true);
  });

  it('every key under the root dark in production: no stopgap', () => {
    expect(plan({ roots: [ROOT], findings: [CUL_1668], appConfig: APP_CONFIG }).alarms[0]).toMatchObject({ stopgap: false });
  });

  it('a follow-up alarm reads the row\'s own keys', () => {
    const fs = ['CUL-1701', 'CUL-1702', 'CUL-1703'].map((id) => finding(id, { description: tagged('LOUD'), relatedTo: ['CUL-1300'] }));
    expect(plan({ findings: fs }).alarms[0].stopgap).toBe(true);
    expect(plan({ findings: fs, rowOutputs: { 'CUL-1300': { keys: ['engines_v3_en9'], arm: 'on' } } }).alarms[0].stopgap).toBe(false);
  });
});
