// The self merge deny list (CUL-2874). The shell half (merge-check.sh printing the verdict)
// is driven against fixture repositories in guards/mergeCheck.test.ts § self merge.
// Mutation proof: scripts/steward/selfMerge-mutants.ts.

import { DEPLOY_SELF_MERGE_RECONFIRMED, fileHold, FUNCTIONS, OPEN_FUNCTIONS, PUBLIC_BUILD_SHIPPED, RELEASE, selfMerge, type SelfMergeInput } from './selfMerge.ts';

const OPEN_RELEASE = { shipped: false, reconfirmed: null };
const SHIPPED = { shipped: true, reconfirmed: null };
const RECONFIRMED = { shipped: true, reconfirmed: { on: '2027-01-10', issue: 'CUL-2883' } };

const input = (over: Partial<SelfMergeInput> = {}): SelfMergeInput => ({ files: ['lib/fonts.ts'], deploys: [], changedLines: [], labels: [], applied: null, release: OPEN_RELEASE, ...over });

describe('a clinical path never qualifies', () => {
  it.each([
    ['lib/signalCopy.ts'],
    ['lib/incidentTierWords.ts'],
    ['lib/dietTrial.ts'],
    ['constants/lookWords.ts'],
    ['constants/eventTypes.ts'],
    ['supabase/functions/generate-signal/detection.ts'],
    ['supabase/functions/analyze-vomit/index.ts'],
    ['supabase/functions/generate-report/render.ts'],
    ['supabase/functions/_shared/incidentMayWait.ts'],
    ['supabase/functions/_shared/http.ts'],
    ['.claude/skills/clinical-guardrails/SKILL.md'],
    ['.claude/agents/adversarial-reviewer.md'],
    ['components/home/SignalZone.tsx'],
    ['app/event/[id].tsx'],
    ['guards/symptomLists.test.ts'],
  ])('%s is held', (f) => {
    const r = selfMerge(input({ files: [f] }));
    expect(r.verdict).toBe('held');
    expect(r.reasons[0]).toMatch(new RegExp(`^${f.replace(/[[\].]/g, '\\$&')}: `));
  });

  it('a clinical file held alongside open ones still holds the whole PR', () => {
    expect(selfMerge(input({ files: ['lib/fonts.ts', 'docs/sessions/x.md', 'lib/signalCopy.ts'] })).verdict).toBe('held');
  });

  // The first adversarial pass (2026-11-25): six ways a clinical change opened. Each holds now.
  it.each([
    ['app/(tabs)/index.tsx', 'a Home withhold rule with no clinical word in its name'],
    ['app/insights/index.tsx', 'a screen kept.ts calls taste'],
    ['components/home/HomeHeader.tsx', 'a component kept.ts calls taste'],
    ['components/dashboard/Tile.tsx', 'a component no stem names'],
    ['lib/utils.ts', 'the day counters the detection engine imports'],
    ['app/(tabs)/index.intakeDecline.test.tsx', 'the test of a clinical rule, read by its whole name'],
    ['guards/worthRaising.test.ts', 'a guard no stem names'],
    ['jest.setup.js', 'a global setup that can mock a suite away'],
    ['__mocks__/expo-network.ts', 'a mock'],
    ['CLAUDE.md', 'the safety invariants and the merge rule'],
    ['.claude/rules/counts-and-claims.md', 'a rules file'],
    ['.claude/agents/code-reviewer.md', 'a reviewer'],
    ['docs/nyx-ai-signal-requirements.md', 'a clinical spec'],
    ['docs/research/feline-intake.md', 'a research brief'],
  ])('%s holds (%s)', (f) => {
    expect(fileHold(f)).not.toBeNull();
  });

  it('a UI mechanic holds when any changed line carries a clinical word, JSX text and split template lines included', () => {
    const file = 'lib/fonts.ts';
    expect(selfMerge(input({ files: [file] })).verdict).toBe('open');
    for (const line of ["  title: 'Vomiting three times today',", '<Text>No need to call the vet</Text>', '  eating normally', "const copy = 'No concerns today';"]) {
      const r = selfMerge(input({ files: [file], changedLines: [{ file, line }] }));
      expect(r.reasons).toEqual(['lib/fonts.ts: a changed line holds a clinical word (owner or vet facing health text)']);
    }
    expect(selfMerge(input({ files: [file], changedLines: [{ file, line: 'const size = 14;' }] })).verdict).toBe('open');
  });

  it('a held label holds whatever the paths, however it is spelled; Gate: deploy alone does not', () => {
    for (const l of ['Gate: clinical', 'gate:privacy', 'Live harm', 'Live-harm', 'live_harm', 'Area: Privacy/RLS', 'Area: Correctness']) {
      expect(selfMerge(input({ labels: [l] })).verdict).toBe('held');
    }
    expect(selfMerge(input({ labels: ['Gate: deploy', 'Area: Copy/Voice'] })).verdict).toBe('open');
  });

  it('labels not passed hold: a Live harm label must never be unread', () => {
    const r = selfMerge(input({ labels: null }));
    expect(r.verdict).toBe('held');
    expect(r.reasons[0]).toMatch(/labels were not passed/);
  });

  it('every function deployed today is on the list, and an unlisted one holds', () => {
    expect(Object.keys(FUNCTIONS)).toEqual(expect.arrayContaining(['analyze-stool', 'analyze-vomit', 'ask', 'delete-account', 'generate-report', 'generate-signal', 'report-visit-link', '_shared']));
    expect(fileHold('supabase/functions/brand-new/index.ts')).toMatch(/does not name \(brand-new\)/);
    expect(fileHold('supabase/config.toml')).toMatch(/does not place/);
  });
});

describe('a deploying copy change does qualify, for a function the PM has opened', () => {
  const copy = {
    files: ['lib/fonts.ts', 'docs/sessions/2026-11-25-x.md'],
    deploys: ['notify'],
    changedLines: [{ file: 'lib/fonts.ts', line: "  return 'That did not save. Try again.';" }],
  };
  it('a plain string on open paths merges itself, deploy and all, when OPEN_FUNCTIONS names the function', () => {
    expect(selfMerge(input({ ...copy, openFunctions: { notify: 'opened by the PM (test)' } }))).toEqual({ verdict: 'open', reasons: [], deploys: true });
  });

  it('today no function is open, since every one is clinical or privacy, so the same change holds', () => {
    expect(OPEN_FUNCTIONS).toEqual({});
    const r = selfMerge(input({ ...copy, deploys: ['generate-signal'] }));
    expect(r.verdict).toBe('held');
    expect(r.reasons).toEqual([expect.stringMatching(/^deploys generate-signal: clinical \(the detection engine\); a deploy merges itself only for a function OPEN_FUNCTIONS names$/)]);
  });

  it('a deploy the check could not read, or that main owes, holds', () => {
    const r = selfMerge(input({ deploys: [], deployUnread: "main's last deploy run did not pass" }));
    expect(r.verdict).toBe('held');
    expect(r.deploys).toBe(true);
  });
});

describe('the gate and the paths the list cannot place', () => {
  it.each([
    ['.claude/hooks/productionGate.ts'],
    ['.claude/settings.json'],
    ['.github/workflows/ci.yml'],
    ['.github/workflows/edge-deploy.yml'],
    ['scripts/steward/merge-check.sh'],
    ['scripts/steward/selfMerge.ts'],
    ['scripts/kept/kept.ts'],
    ['scripts/edge-deploy/plan.ts'],
    ['.claude/skills/steward/SKILL.md'],
    ['.claude/commands/dispatch.md'],
    ['package.json'],
    ['guards/mergeCheck.test.ts'],
  ])('%s is the gate\'s own file', (f) => {
    expect(fileHold(f)).toBe("the gate's own files");
  });

  it('a path nothing places holds; prose at the root and tooling do not', () => {
    expect(fileHold('types/far.ts')).toMatch(/does not know/);
    expect(fileHold('scripts/backfill-weights.ts')).not.toBeNull();
    expect(fileHold('lib/brandNewThing.ts')).toMatch(/cannot place/);
    for (const f of ['README.md', 'notes.txt', 'docs/sessions/x.md', 'docs/git-first-aid.md', 'scripts/dispatch/plan.ts', 'guards/claudeMdBudget.test.ts', 'lib/haptics.ts', 'lib/haptics.test.ts']) {
      expect(fileHold(f)).toBeNull();
    }
  });

  it('nothing to land is never open', () => {
    expect(selfMerge(input({ files: [] })).verdict).toBe('held');
  });
});

describe('the 1.2.0 checkpoint', () => {
  const deploying = input({ deploys: ['notify'], openFunctions: { notify: 'test' } });
  it('once the first public build ships, a change that deploys waits for the PM', () => {
    const r = selfMerge({ ...deploying, release: SHIPPED });
    expect(r.verdict).toBe('held');
    expect(r.reasons).toEqual([expect.stringMatching(/^the 1\.2\.0 checkpoint/)]);
  });

  it('a change that deploys nothing carries on, and a reconfirmation reopens deploys', () => {
    expect(selfMerge({ ...input(), release: SHIPPED }).verdict).toBe('open');
    expect(selfMerge({ ...deploying, release: RECONFIRMED }).verdict).toBe('open');
    expect(selfMerge({ ...input({ deployUnread: 'helper exited 1' }), release: SHIPPED }).reasons).toContainEqual(expect.stringMatching(/^the 1\.2\.0 checkpoint/));
  });

  it('the shipped constants are the ones the gate reads, and they say not yet', () => {
    expect(RELEASE).toEqual({ shipped: PUBLIC_BUILD_SHIPPED, reconfirmed: DEPLOY_SELF_MERGE_RECONFIRMED });
    expect(PUBLIC_BUILD_SHIPPED).toBe(false);
    expect(selfMerge({ ...deploying, release: undefined }).verdict).toBe('open');
  });
});

describe('`apply` is the merge word for a migration PR', () => {
  const mig = ['supabase/migrations/095_add_x.sql'];
  it('an applied, green migration PR merges on `apply` alone', () => {
    expect(selfMerge(input({ files: mig, applied: '095' }))).toEqual({ verdict: 'open', reasons: [], deploys: false });
    expect(selfMerge(input({ files: [...mig, 'docs/sessions/2026-11-25-x.md'], applied: '95' })).verdict).toBe('open');
  });

  it('an unapplied one does not, numbered or not', () => {
    expect(selfMerge(input({ files: ['scripts/backfill/fix.sql'] })).verdict).toBe('held');
    const r = selfMerge(input({ files: mig }));
    expect(r.verdict).toBe('held');
    expect(r.reasons).toEqual(["supabase/migrations/095_add_x.sql: a migration (merges on the PM's `apply <NNN>`)"]);
  });

  it('`apply` covers that number only, and a PR that is only that migration', () => {
    expect(selfMerge(input({ files: mig, applied: '096' })).reasons[0]).toMatch(/does not name this landing's migration \(95\)/);
    expect(selfMerge(input({ files: [...mig, 'lib/fonts.ts'], applied: '095' })).reasons[0]).toMatch(/covers a migration PR alone/);
    expect(selfMerge(input({ files: [...mig, 'supabase/migrations/096_y.sql'], applied: '095' })).verdict).toBe('held');
    expect(selfMerge(input({ files: [...mig, 'supabase/migrations/095_z.sql'], applied: '095' })).reasons[0]).toMatch(/covers one migration, and this landing carries 2/);
    expect(selfMerge(input({ files: ['lib/fonts.ts'], applied: '095' })).reasons[0]).toMatch(/does not carry/);
    expect(selfMerge(input({ files: ['scripts/backfill/fix.sql'], applied: '095' })).verdict).toBe('held');
  });

  it('`apply` does not open a migration PR whose labels say clinical', () => {
    expect(selfMerge(input({ files: mig, applied: '095', labels: ['Gate: clinical'] })).verdict).toBe('held');
  });
});
