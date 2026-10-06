// The planner (CUL-1615) replayed on 2026-10-05: the 21:10Z Engines v3 slot arithmetic,
// the 084 clash, and the rules the prose kept dropping.

import * as F from './fixtures/facts-2026-10-05.ts';
import { autoEligible, gateOf, planDispatch, type PlanInput } from './plan.ts';

const AT_2110 = '2026-10-05T21:10:19Z';

// The repo as the Engines v3 dispatcher read it at 21:10Z (its update 795e6582).
function enginesAt2110(over: Partial<PlanInput> = {}): PlanInput {
  return {
    now: AT_2110,
    project: F.ENGINES_V3,
    others: [F.OUT_OF_BETA],
    prs: [...F.MERGED, F.PR_1064, F.PR_1072_AT_2110, F.PR_1074_AT_2110],
    issues: F.ISSUES,
    claims: F.CLAIMS_AT_2110,
    sessions: F.SESSIONS_AT_2110,
    launches: F.LAUNCHES,
    mainMigrations: F.MAIN_MIGRATIONS_THROUGH_083,
    appliedMigrations: ['vet_call_cover'],
    productionLib: F.PRODUCTION_LIB,
    ...over,
  };
}

describe('the 10/5 21:10Z Engines v3 slot arithmetic', () => {
  const p = planDispatch(enginesAt2110());

  it('counts what the dispatcher counted, repo-wide, under the cap of 6', () => {
    expect(p.arithmetic).toBe('6 − PR-36 (#1072) − PR-36a (#1074) − PR-23c (claim, claude/engines-v3-pr23b-10051806) = 3');
    expect(p.slots).toBe(3);
  });

  it('reproduces the v1.3 line exactly at the old cap of 3', () => {
    // "Slots: 3 − PR-36 (#1072) − PR-36a (#1074) − PR-23c (outside claim) = 0."
    const old = planDispatch(enginesAt2110({ cap: 3 }));
    expect(old.arithmetic).toBe('3 − PR-36 (#1072) − PR-36a (#1074) − PR-23c (claim, claude/engines-v3-pr23b-10051806) = 0');
    expect(old.slots).toBe(0);
    expect(old.proposal).toEqual([]);
    expect(old.overCap).toEqual(['23a', '27b']); // "PR-27b and PR-23a ready, over the cap"
  });

  it('parks Out of beta PR-60: no slot, files and its migration number reserved', () => {
    expect(p.parked.map((x) => x.label)).toEqual(['Out of beta PR-60 (#1064, parked)']);
    expect(p.reservations.find((r) => r.file === 'CLAUDE.md')!.holders).toEqual(['#1064 (Out of beta PR-60, parked)']);
  });

  it('shows the three sub-limits', () => {
    expect(p.subLimits).toEqual({ waitingOnPm: 3, writesProduction: 3, migrations: 1 });
  });

  it('proposes the two ready rows and holds the rest with a reason in words', () => {
    expect(p.proposal).toEqual(['23a', '27b']);
    const why = (r: string) => p.verdicts.find((v) => v.row === r)!.reasons;
    expect(why('23c')).toEqual(['a live claim on CUL-1600 (claude/engines-v3-pr23b-10051806, 2026-10-05T19:06:00Z)']);
    expect(why('13b')).toEqual(['a release gate in After: "rides the first build after 1.2.0" (move it to a Merge gate)']);
    expect(why('33')).toEqual(['after PR-31, not merged']);
    expect(why('36')).toEqual(['an open PR: #1072']);
  });

  it('never proposes a merged row (the "merged rows listed as ready" drift)', () => {
    const merged = new Set(p.verdicts.filter((v) => v.state.kind === 'merged').map((v) => v.row));
    expect(merged.size).toBeGreaterThan(40);
    for (const r of [...p.proposal, ...p.overCap]) expect(merged.has(r)).toBe(false);
  });

  it('a stale claim (over 24 hours, no open PR) holds nothing and takes no slot', () => {
    const q = planDispatch(enginesAt2110({ claims: [{ ...F.CLAIMS_AT_2110[0], at: '2026-10-04T19:00:00Z' }] }));
    expect(q.arithmetic).toBe('6 − PR-36 (#1072) − PR-36a (#1074) = 4');
    expect(q.verdicts.find((v) => v.row === '23c')!.ready).toBe(true);
  });
});

describe('the 084 clash', () => {
  it('holds PR-36a, whose PR took a number a parked PR already reserved', () => {
    const p = planDispatch(enginesAt2110());
    expect(p.clashes).toEqual([{ number: '084', keeps: '#1064 (Out of beta PR-60, parked)', renumbers: ['#1074 (PR-36a)'] }]);
    expect(p.verdicts.find((v) => v.row === '36a')!.reasons).toContain(
      'migration 084 clashes with #1064 (Out of beta PR-60, parked); #1074 renumbers to 085',
    );
  });

  it('tells a ready migration row the next free number, past every reserved one', () => {
    const p = planDispatch(enginesAt2110({ prs: [...F.MERGED, F.PR_1064] }));
    expect(p.nextMigration).toBe('085');
    expect(p.verdicts.find((v) => v.row === '36a')!.ready).toBe(true);
  });

  it('once main carries 084, the parked PR is the one that renumbers', () => {
    const now = '2026-10-05T21:40:00Z';
    const p = planDispatch({
      ...enginesAt2110(),
      now,
      project: F.OUT_OF_BETA,
      others: [F.ENGINES_V3],
      prs: [...F.MERGED, F.PR_1064, { ...F.PR_1074_AT_2110, state: 'merged', mergedAt: '2026-10-05T21:33:36Z' }],
      mainMigrations: [...F.MAIN_MIGRATIONS_THROUGH_083, '084_vet_call_cover.sql'],
    });
    expect(p.clashes).toEqual([{ number: '084', keeps: 'main', renumbers: ['#1064 (PR-60, parked)'] }]);
    expect(p.verdicts.find((v) => v.row === '60')!.reasons).toContain('migration 084 clashes with main; #1064 renumbers to 085');
  });
});

describe('the sub-limits hold a ready row', () => {
  it('a migration row waits while another migration is in flight', () => {
    // 36a with no PR yet, beside #1074 as an unmatched open migration PR.
    const other = { ...F.PR_1074_AT_2110, number: 2000, title: 'Something else (CUL-9999)', headRef: 'claude/other' };
    const p = planDispatch(enginesAt2110({ prs: [...F.MERGED, F.PR_1064, other] }));
    expect(p.verdicts.find((v) => v.row === '36a')!.reasons).toContain('migrations: 1 of 1');
  });
});

describe('the gate predicate', () => {
  it('plan-gates a migration, RLS, a clinical surface and a Tier-2 edit', () => {
    expect(gateOf({ what: 'x', note: '', migration: true }).planGated).toEqual(['migration']);
    expect(gateOf({ what: 'x', note: 'rls-privacy-reviewer.', migration: false }).planGated).toEqual(['RLS, Storage, deletion or export']);
    expect(gateOf({ what: 'x', note: '', migration: false }, { labels: ['Gate: clinical'] }).planGated).toEqual(['clinical']);
    expect(gateOf({ what: 'x', note: 'the Tier-2 edits', migration: false }).planGated).toEqual(['Tier-2 spec edit']);
  });

  it('auto-eligible only when BUILD, routine, copy-free, privilege-free and no migration', () => {
    expect(autoEligible(gateOf({ what: 'A refused meal keeps counting', note: '`lib/analytics.ts`.', migration: false }))).toBe(true);
    expect(autoEligible(gateOf({ what: 'x', note: 'nyx-voice.', migration: false }))).toBe(false);
    expect(autoEligible(gateOf({ what: 'x', note: 'merging redeploys `generate-report`.', migration: false }))).toBe(false);
    expect(autoEligible(gateOf({ what: 'a mock round', note: '', migration: false }))).toBe(false);
  });
});

it('drops merged rows from Auto (Out of beta carried five merged ones)', () => {
  const p = planDispatch({ ...enginesAt2110(), now: '2026-10-05T12:35:00Z', project: F.OUT_OF_BETA, others: [], previousAuto: ['27b', '27c', '28', '39b', '39c'] });
  expect(p.autoRows).toEqual([]);
});

it('a first dispatch has one slot, whatever the arithmetic', () => {
  const p = planDispatch(enginesAt2110({ project: { ...F.ENGINES_V3, firstDispatch: true } }));
  expect(p.slots).toBe(1);
  expect(p.proposal).toEqual(['23a']);
});
