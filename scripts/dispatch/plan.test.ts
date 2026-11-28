// The planner (CUL-1615) replayed on 2026-10-05: the 21:10Z Engines v3 slot arithmetic,
// the 084 clash, and the rules the prose kept dropping.

import * as F from './fixtures/facts-2026-10-05.ts';
import { autoEligible, gateOf, pathsIn, planDispatch, type PlanInput } from './plan.ts';

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
    // In 2026-10 these two were "ready, over the cap". Since the kept list (CUL-2886) every
    // Engines v3 row is clinical, so the PM-waiting sub-limit (filled by the engine rows in
    // flight) is their one hold; nothing else the arithmetic reads holds them.
    expect(old.overCap).toEqual([]);
    for (const r of ['23a', '27b']) expect(old.verdicts.find((v) => v.row === r)!.reasons).toEqual(['waiting on the PM: 3 of 3']);
  });

  it('parks Out of beta PR-60: no slot, files and its migration number reserved', () => {
    expect(p.parked.map((x) => x.label)).toEqual(['Out of beta PR-60 (#1064, parked)']);
    expect(p.reservations.find((r) => r.file === 'CLAUDE.md')!.holders).toEqual(['#1064 (Out of beta PR-60, parked)']);
  });

  it('shows the three sub-limits', () => {
    expect(p.subLimits).toEqual({ waitingOnPm: 3, writesProduction: 3, migrations: 1 });
  });

  it('proposes the two ready rows and holds the rest with a reason in words', () => {
    const why = (r: string) => p.verdicts.find((v) => v.row === r)!.reasons;
    // The two rows that were ready are held only by the PM-waiting sub-limit (CUL-2886: the
    // engine rows are clinical, so each waits on the PM).
    expect(p.proposal).toEqual([]);
    expect(why('23a')).toEqual(['waiting on the PM: 3 of 3']);
    expect(why('27b')).toEqual(['waiting on the PM: 3 of 3']);
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
    // The stale claim no longer holds it; only the PM-waiting sub-limit does (CUL-2886).
    expect(q.verdicts.find((v) => v.row === '23c')!.reasons).toEqual(['waiting on the PM: 3 of 3']);
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
    // No clash holds it. Since the kept list (CUL-2886) the Engines v3 rows in flight are
    // clinical, so they wait on the PM, and that sub-limit is its only hold.
    expect(p.verdicts.find((v) => v.row === '36a')!.reasons).toEqual(['waiting on the PM: 3 of 3']);
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

describe('the gate predicate reads the kept list (CUL-2886)', () => {
  it('plan-gates a migration, RLS, a clinical surface and a Tier-2 edit', () => {
    expect(gateOf({ what: 'x', note: '', migration: true }).planGated).toEqual(['migration']);
    expect(gateOf({ what: 'x', note: 'rls-privacy-reviewer, in `scripts/dispatch/plan.ts`.', migration: false }).planGated).toEqual(['stakes: privacy, RLS, Storage, deletion, export or share links']);
    expect(gateOf({ what: 'x', note: '`scripts/dispatch/plan.ts`', migration: false }, { labels: ['Gate: clinical'] }).planGated).toEqual(['stakes: clinical (label Gate: clinical)']);
    expect(gateOf({ what: 'x', note: 'the Tier-2 edits in `scripts/dispatch/plan.ts`', migration: false }).planGated).toEqual(['scope: scope (in or out of a project, priority between tracks, a spec edit)']);
  });

  // A6 (a), CUL-2887: a routine plan is posted and built. CUL-2912: a migration row keeps
  // its plan go (the PM's ruling (a)), whatever its words. Mutation proof: scripts/dispatch/mutants.ts.
  it('a routine row posts and builds; a clinical row still waits for its go', () => {
    expect(gateOf({ what: 'The board keeps a stale row', note: '`scripts/dispatch/board.ts`.', migration: false })).toMatchObject({ line: 'routine', planGated: [] });
    const clinical = gateOf({ what: 'x', note: '`scripts/dispatch/plan.ts`', migration: false }, { labels: ['Gate: clinical'] });
    expect(clinical).toMatchObject({ line: 'plan', planGated: ['stakes: clinical (label Gate: clinical)'] });
    expect(gateOf({ what: 'x', note: 'edit `lib/dietTrial.ts`.', migration: false }).line).toBe('plan');
  });

  it.each([
    ['plain additive words', 'Migration `supabase/migrations/105_add_food_note.sql` adds a nullable column, and `scripts/dispatch/plan.ts` reads it.'],
    ['a clinical-sounding column', 'Migration `supabase/migrations/105_add_wellness_score.sql` adds a nullable column.'],
    ['an unnamed migration', ''],
  ])('a migration row with %s is plan-gated, never routine or auto', (_k, note) => {
    const g = gateOf({ what: 'x', note, migration: true });
    expect(g.line).toBe('plan');
    expect(g.planGated[0]).toBe('migration');
    expect(autoEligible(g)).toBe(false);
  });

  it('plan-gates money, App Store and the irreversible, which the old predicate missed', () => {
    expect(gateOf({ what: 'a paywall on Ask', note: '', migration: false }).kept).toBe('stakes');
    expect(gateOf({ what: 'x', note: 'ships through App Review.', migration: false }).kept).toBe('stakes');
    expect(gateOf({ what: 'x', note: 'purge the drafts.', migration: false }).kept).toBe('stakes');
  });

  it('a taste call plan-gates a BUILD row; a DISCOVERY row is the thing the PM reacts to', () => {
    expect(gateOf({ what: 'a new layout for the header', note: '`lib/haptics.ts`', migration: false }).planGated).toEqual(['taste: a visual or motion choice']);
    const mock = gateOf({ what: 'a mock round for the header', note: '`docs/home-mockups.html`', migration: false });
    expect(mock).toMatchObject({ mode: 'DISCOVERY', planGated: [], kept: 'taste' });
    expect(autoEligible(mock)).toBe(false);
  });

  it('auto-eligible only when BUILD, nothing kept, privilege-free and no migration', () => {
    expect(autoEligible(gateOf({ what: 'The board keeps a stale row', note: '`scripts/dispatch/board.ts`.', migration: false }))).toBe(true);
    // A refused meal is intake, and the note's file is read too (adversarial pass 1, Q1).
    expect(autoEligible(gateOf({ what: 'A refused meal keeps counting', note: '`lib/utils.ts`.', migration: false }))).toBe(false);
    expect(gateOf({ what: 'Stop the extra line', note: 'edit supabase/functions/_shared/incident-tier.ts', migration: false }).kept).toBe('stakes');
    expect(pathsIn('edit `lib/freeFedIntake.ts`, then supabase/functions/_shared/ and app.json.')).toEqual(['lib/freeFedIntake.ts', 'supabase/functions/_shared/', 'app.json']);
    // Copy inside nyx-voice is a team call now: the old keyword match held this row (CUL-2886 item 4).
    expect(autoEligible(gateOf({ what: 'x', note: 'nyx-voice copy for the toast; the label string, in `lib/haptics.ts`.', migration: false }))).toBe(true);
    // A row that names no file cannot be read for its surface, so it keeps (adversarial pass 2).
    expect(autoEligible(gateOf({ what: 'The board keeps a stale row', note: '', migration: false }))).toBe(false);
    expect(autoEligible(gateOf({ what: 'x', note: 'merging redeploys `generate-report`.', migration: false }))).toBe(false);
    expect(autoEligible(gateOf({ what: 'a mock round', note: '', migration: false }))).toBe(false);
    expect(autoEligible(gateOf({ what: 'x', note: 'tighten the clinical copy.', migration: false }))).toBe(false);
  });
});

it('drops merged rows from Auto (Out of beta carried five merged ones)', () => {
  const p = planDispatch({ ...enginesAt2110(), now: '2026-10-05T12:35:00Z', project: F.OUT_OF_BETA, others: [], previousAuto: ['27b', '27c', '28', '39b', '39c'] });
  expect(p.autoRows).toEqual([]);
});

it('a first dispatch has one slot, whatever the arithmetic', () => {
  const p = planDispatch(enginesAt2110({ project: { ...F.ENGINES_V3, firstDispatch: true } }));
  expect(p.slots).toBe(1);
  // One slot; 23a would take it but for the PM-waiting sub-limit (CUL-2886).
  expect(p.proposal).toEqual([]);
  expect(p.verdicts.find((v) => v.row === '23a')!.reasons).toEqual(['waiting on the PM: 3 of 3']);
});

describe('found by review (each red before its fix)', () => {
  const page = (rows: string, extra = '') => ({
    name: 'Tiny: a test page',
    description: `| PR | Issue(s) | What it is | After | Lane |\n| -- | -- | -- | -- | -- |\n${rows}\n\n### Never at the same time\n\n${extra}\n\n## End\n`,
  });
  const base = (over: Partial<PlanInput>): PlanInput => ({
    now: AT_2110, project: page('| 01 | CUL-1 | a | — | A |'), prs: [], issues: {}, claims: [], sessions: {}, launches: [], mainMigrations: [], ...over,
  });

  it('two sub-issues of one parent are two sessions in flight', () => {
    const pr = (number: number, issue: string) => ({ number, title: `Something (${issue})`, state: 'open' as const, headRef: `claude/x-${number}`, createdAt: AT_2110, lastCommitAt: AT_2110 });
    const p = planDispatch(base({
      prs: [pr(3, 'CUL-20'), pr(4, 'CUL-21')],
      issues: { 'CUL-20': { id: 'CUL-20', state: 'In Review', parentId: 'CUL-99' }, 'CUL-21': { id: 'CUL-21', state: 'In Review', parentId: 'CUL-99' } },
    }));
    expect(p.slots).toBe(4);
  });

  it('a combined row obeys the order rules that name its parts, and ranks by them', () => {
    const p = planDispatch(base({
      project: page('| 04 | CUL-4 | a | — | A |\n| 05 + 06 | CUL-5 | b | — | A |\n\n**Critical path to it:** PR-04 → PR-06', '* PR-04 → PR-05, strictly in order.'),
    }));
    const v = p.verdicts.find((x) => x.row === '05 + 06')!;
    expect(v.reasons).toEqual(['after PR-04 in "PR-04 → PR-05, strictly in order" (strictly in order)']);
    expect(v.rank).toBe(1);
  });

  // CUL-2249: Every iPhone's first run said its one gate "frees 0". A gate is written in
  // After and, since CUL-1621, as a blocks relation too; the relation is the same hold.
  it('a blocker that After already names is one hold, so ruling it frees the row', () => {
    for (const waitingOnPm of [false, true]) {
      const p = planDispatch(base({
        project: page('| 01 | CUL-1 | a | CUL-559 | A |\n| 02 | CUL-2 | b | CUL-559 | B |'),
        issues: {
          'CUL-1': { id: 'CUL-1', state: 'Todo', blockedBy: [{ id: 'CUL-559', open: true, waitingOnPm }] },
          'CUL-2': { id: 'CUL-2', state: 'Todo', blockedBy: [{ id: 'CUL-559', open: true, waitingOnPm }] },
          'CUL-559': { id: 'CUL-559', state: 'Todo' },
        },
      }));
      expect(p.verdicts.find((x) => x.row === '01')!.reasons).toEqual(['a PM action: "CUL-559"']);
      expect(p.pmHolds.map((h) => [h.key, h.freesOutright, h.rowsHeld])).toEqual([['CUL-559', ['01', '02'], ['01', '02']]]);
    }
  });

  it('a blocker After does not name still holds the row', () => {
    const p = planDispatch(base({
      issues: { 'CUL-1': { id: 'CUL-1', state: 'Todo', blockedBy: [{ id: 'CUL-7', open: true }] } },
    }));
    expect(p.verdicts.find((x) => x.row === '01')!.reasons).toEqual(['its issue waits: CUL-1 is blocked by CUL-7']);
  });
});
