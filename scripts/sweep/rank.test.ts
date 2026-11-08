// /sweep's rules (CUL-2651): the order, evidence-only closes, file-disjoint picks, bundles,
// the size bands, review capacity, and that the rows it writes parse as dispatch reads them.

import { parsePage } from '../dispatch/page.ts';
import { compare, kindOf, metricsLine, pageRows, rankSweep, sessionTitle, sweepRunTitle, validate, type SweepCandidate, type SweepInput } from './rank.ts';

let n = 0;
const cand = (over: Partial<SweepCandidate> = {}): SweepCandidate => ({
  id: `CUL-${1000 + ++n}`,
  title: 'A loose end',
  priority: 3,
  labels: [],
  createdAt: '2026-10-01T00:00:00Z',
  impact: 'C',
  impactWhy: '',
  size: 'M',
  files: [`lib/file${n}.ts`],
  surface: `surface ${n}`,
  relevance: 'valid',
  relevanceWhy: 'the code path is unchanged on main',
  team: [{ persona: 'Engineer', rec: 'build as described' }],
  ...over,
});
const run = (candidates: SweepCandidate[], over: Partial<SweepInput> = {}) =>
  rankSweep({ candidates, inFlight: [], slotsFree: 6, waitingOnPm: 0, ...over });
const ids = (r: ReturnType<typeof run>) => r.picks.map((p) => p.issues.join('+'));

describe('the order is lexicographic, never a score', () => {
  it('Live harm, then impact, then priority, then a live track, then age', () => {
    const lowHarm = cand({ id: 'CUL-1', labels: ['Live harm'], impact: 'D', priority: 4 });
    const urgentA = cand({ id: 'CUL-2', impact: 'A', impactWhy: 'the report drops a dose', priority: 1 });
    const highA = cand({ id: 'CUL-3', impact: 'A', impactWhy: 'Home shows the wrong pet', priority: 2 });
    const highB = cand({ id: 'CUL-4', impact: 'B', impactWhy: 'the button label reads wrong', priority: 2, blocksLiveTrack: true });
    const highBold = cand({ id: 'CUL-5', impact: 'B', impactWhy: 'a confusing empty state', priority: 2, blocksLiveTrack: true, createdAt: '2026-08-01T00:00:00Z' });
    const noPri = cand({ id: 'CUL-6', impact: 'B', impactWhy: 'copy', priority: 0 });
    expect(ids(run([noPri, highB, highA, lowHarm, highBold, urgentA]))).toEqual(['CUL-1', 'CUL-2', 'CUL-3', 'CUL-5', 'CUL-4', 'CUL-6']);
  });

  it('a cheap internal task never outranks an owner-visible one (the WSJF trap)', () => {
    const tinyD = cand({ id: 'CUL-10', impact: 'D', size: 'S', priority: 1 });
    const bigA = cand({ id: 'CUL-11', impact: 'A', impactWhy: 'the vet report misdates a visit', size: 'M', priority: 3 });
    expect(compare(bigA, tinyD)).toBeLessThan(0);
  });
});

describe('every judgment is stated, or the run is refused', () => {
  it('tier A or B needs the sentence an owner would see', () => {
    expect(validate({ candidates: [cand({ id: 'CUL-20', impact: 'A' })], inFlight: [], slotsFree: 6, waitingOnPm: 0 })).toEqual(['CUL-20: tier A with no owner-visible sentence']);
    expect(() => run([cand({ impact: 'B' })])).toThrow(/no owner-visible sentence/);
  });
  it('a candidate the team never read is refused; a closing one needs no team read', () => {
    expect(() => run([cand({ team: [] })])).toThrow(/no team read/);
    expect(() => run([cand({ team: [], relevance: 'fixed', evidence: '#1400' })])).not.toThrow();
  });
});

describe('close on evidence, never on age', () => {
  it('fixed with a merge closes Done; superseded proposes a close; a duplicate names its original', () => {
    const r = run([
      cand({ id: 'CUL-30', relevance: 'fixed', relevanceWhy: 'main no longer has the path', evidence: '#1436' }),
      cand({ id: 'CUL-31', relevance: 'superseded', relevanceWhy: 'v1 report retired', evidence: 'vet report v2 (#1439)' }),
      cand({ id: 'CUL-32', relevance: 'duplicate', relevanceWhy: 'same bug', evidence: 'CUL-2010' }),
    ]);
    expect(r.writes).toEqual([
      { id: 'CUL-30', action: 'close-done', why: 'main no longer has the path (#1436)' },
      { id: 'CUL-31', action: 'propose-close', why: 'v1 report retired (vet report v2 (#1439))' },
      { id: 'CUL-32', action: 'duplicate', of: 'CUL-2010', why: 'same bug' },
    ]);
    expect(r.picks).toEqual([]);
  });
  it('a closing verdict with no evidence never closes: it goes to shaping', () => {
    const r = run([cand({ id: 'CUL-33', relevance: 'fixed', evidence: '' })]);
    expect(r.writes).toEqual([]);
    expect(r.picks[0]).toMatchObject({ kind: 'shape', issues: ['CUL-33'] });
    expect(r.picks[0].why).toMatch(/fixed with no evidence named/);
  });
  it('an updated description is written and the issue stays a candidate', () => {
    const r = run([cand({ id: 'CUL-34', relevance: 'updated', relevanceWhy: 'the screen moved to History v2' })]);
    expect(r.writes).toEqual([{ id: 'CUL-34', action: 'update-description', why: 'the screen moved to History v2' }]);
    expect(ids(r)).toEqual(['CUL-34']);
  });
});

describe('no two picks on the same files (PM tip, 2026-11-07)', () => {
  it('a pick whose files an open PR holds is held, naming the holder', () => {
    const r = run([cand({ id: 'CUL-40', files: ['lib/vetReport.ts'] })], { inFlight: [{ holder: '#1470', files: ['lib/vetReport.ts'] }] });
    expect(r.picks).toEqual([]);
    expect(r.held).toEqual([{ id: 'CUL-40', reason: 'files overlap #1470' }]);
  });
  it('two candidates sharing a file bundle when they fit; otherwise the lower one is held', () => {
    const a = cand({ id: 'CUL-41', size: 'S', files: ['app/log.tsx'], surface: 'log sheet' });
    const b = cand({ id: 'CUL-42', size: 'S', files: ['app/log.tsx'], surface: 'type step' });
    expect(ids(run([a, b]))).toEqual(['CUL-41+CUL-42']);
    const c = cand({ id: 'CUL-43', size: 'M', files: ['app/log.tsx'], surface: 'a' });
    const d = cand({ id: 'CUL-44', size: 'M', files: ['app/log.tsx'], surface: 'b', priority: 4 });
    const r = run([c, d]);
    expect(ids(r)).toEqual(['CUL-43']);
    expect(r.held).toEqual([{ id: 'CUL-44', reason: "files overlap this batch's CUL-43" }]);
  });
  it('a build with no files named is held: overlap cannot be checked', () => {
    expect(run([cand({ id: 'CUL-45', files: [] })]).held).toEqual([{ id: 'CUL-45', reason: 'its files are not named, so overlap cannot be checked' }]);
  });
});

describe('the review fixes (code-reviewer, 2026-11-07)', () => {
  it('a bundle member on busy files never holds a clean lead; the member is judged on its own', () => {
    const lead = cand({ id: 'CUL-100', size: 'S', surface: 'Foods tab', files: ['app/foods.tsx'] });
    const busyMember = cand({ id: 'CUL-101', size: 'S', surface: 'Foods tab', files: ['lib/foodCache.ts'], priority: 4 });
    const r = run([lead, busyMember], { inFlight: [{ holder: '#1470', files: ['lib/foodCache.ts'] }] });
    expect(ids(r)).toEqual(['CUL-100']);
    expect(r.held).toEqual([{ id: 'CUL-101', reason: 'files overlap #1470' }]);
  });
  it('a lead held for want of a slot takes no member down with it', () => {
    const r = run([cand({ id: 'CUL-102', size: 'S', surface: 's' }), cand({ id: 'CUL-103', size: 'S', surface: 's' })], { slotsFree: 0 });
    expect(r.held.map((h) => h.id)).toEqual(['CUL-102', 'CUL-103']);
  });
  it('nothing closes under live work, and a duplicate of itself is no duplicate', () => {
    const r = run([
      cand({ id: 'CUL-104', relevance: 'fixed', evidence: '#1400', liveClaim: 'claude/y' }),
      cand({ id: 'CUL-105', relevance: 'duplicate', evidence: 'CUL-105' }),
    ]);
    expect(r.writes).toEqual([]);
    expect(r.held).toEqual([{ id: 'CUL-104', reason: 'claimed by claude/y' }]);
    expect(r.picks[0]).toMatchObject({ kind: 'shape', issues: ['CUL-105'] });
  });
  it('a closing verdict that cannot close can launch, so it needs a team read', () => {
    expect(() => run([cand({ id: 'CUL-106', relevance: 'superseded', evidence: '', team: [] })])).toThrow(/CUL-106: no team read \(its closing verdict has no usable evidence/);
  });
  it('age compares as a date, whatever the offset form (C-40)', () => {
    const later = cand({ id: 'CUL-107', createdAt: '2026-10-01T00:30:00-05:00' });
    const earlier = cand({ id: 'CUL-108', createdAt: '2026-10-01T01:00:00Z' });
    expect(ids(run([later, earlier]))).toEqual(['CUL-108', 'CUL-107']);
  });
  it('a new page numbers from 01, as dispatch reads it, and refuses past 99', () => {
    const r = run([cand({ id: 'CUL-109' }), cand({ id: 'CUL-110' })]);
    const { rows, notes, doneMeans } = pageRows(r.picks, 1);
    const page = parsePage(['| PR | Issue(s) | What it is | After | Lane |', '|---|---|---|---|---|', ...rows, '', doneMeans, '', ...notes].join('\n'));
    expect(page.rows.map((x) => [x.id, x.issues, x.note.startsWith('Routine')])).toEqual([['01', ['CUL-109'], true], ['02', ['CUL-110'], true]]);
    expect(page.doneMeans).toEqual(['01', '02']);
    expect(() => pageRows(r.picks, 99)).toThrow(/run 01 to 99/);
    expect(pageRows(r.picks, 98).doneMeans).toBe('Done means (rows): 98, 99');
  });
});

describe('the sanity-check gaps (PM, 2026-11-08)', () => {
  it('prose is a reason, not evidence: a close needs a PR, a commit or the issue that replaced it', () => {
    const prose = run([cand({ id: 'CUL-120', relevance: 'fixed', evidence: 'main no longer has the path' })]);
    expect(prose.writes).toEqual([]);
    expect(prose.picks[0]).toMatchObject({ kind: 'shape', issues: ['CUL-120'] });
    const r = run([
      cand({ id: 'CUL-121', relevance: 'fixed', evidence: 'merged in #1436' }),
      cand({ id: 'CUL-122', relevance: 'fixed', evidence: 'commit 5f2fe228' }),
      cand({ id: 'CUL-123', relevance: 'superseded', evidence: 'replaced by CUL-2275' }),
      cand({ id: 'CUL-124', relevance: 'superseded', evidence: 'see CUL-124' }),
    ]);
    expect(r.writes.map((w) => [w.id, w.action])).toEqual([['CUL-121', 'close-done'], ['CUL-122', 'close-done'], ['CUL-123', 'propose-close']]);
    expect(r.picks.map((p) => p.issues[0])).toEqual(['CUL-124']);
  });
  it('a build that deploys or touches the gate waits on the PM to merge, so it spends a place', () => {
    const fn = cand({ id: 'CUL-125', files: ['supabase/functions/ask/index.ts'] });
    const plain = cand({ id: 'CUL-126', files: ['app/log.tsx'] });
    const r = run([fn, plain], { waitingOnPm: 3 });
    expect(r.picks.map((p) => p.issues[0])).toEqual(['CUL-126']);
    expect(r.held).toEqual([{ id: 'CUL-125', reason: 'waits on the PM to merge (it deploys or touches the gate), and 3 already do' }]);
    // With a place free it launches, and spends it: a shaping pick after it is held.
    const r2 = run([fn, cand({ id: 'CUL-127', size: 'XL', priority: 4 })], { waitingOnPm: 2 });
    expect(r2.picks.map((p) => p.issues[0])).toEqual(['CUL-125']);
    expect(r2.held[0]).toMatchObject({ id: 'CUL-127' });
  });
  it('a member never turns a plain bundle into one that waits when no place is free', () => {
    const lead = cand({ id: 'CUL-128', size: 'S', surface: 'Ask', files: ['app/ask.tsx'] });
    const fnMember = cand({ id: 'CUL-129', size: 'S', surface: 'Ask', files: ['supabase/functions/ask/index.ts'], priority: 4 });
    const r = run([lead, fnMember], { waitingOnPm: 3 });
    expect(r.picks.map((p) => p.issues.join('+'))).toEqual(['CUL-128']);
    expect(r.held[0]).toMatchObject({ id: 'CUL-129' });
  });
});

describe('bundles and sizes', () => {
  it('same-surface small work bundles up to size M and three issues; the rest runs on its own', () => {
    const s = (id: string) => cand({ id, size: 'S', surface: 'Foods tab' });
    const r = run([s('CUL-50'), s('CUL-51'), s('CUL-52'), s('CUL-53')]);
    expect(ids(r)).toEqual(['CUL-50+CUL-51+CUL-52', 'CUL-53']);
    expect(r.picks[0].size).toBe('M');
    expect(r.picks[0].team[0].rec).toMatch(/^CUL-50: /);
  });
  it('S and M build, L plans first, XL shapes, a gated label plans, a shaping need shapes', () => {
    expect(kindOf(cand({ size: 'S' }))).toBe('build');
    expect(kindOf(cand({ size: 'L' }))).toBe('plan');
    expect(kindOf(cand({ size: 'XL' }))).toBe('shape');
    expect(kindOf(cand({ labels: ['Gate: clinical'] }))).toBe('plan');
    expect(kindOf(cand({ needsShaping: 'no one is named as hurt' }))).toBe('shape');
  });
  it('a plan or shape never bundles: it waits on the PM alone', () => {
    const a = cand({ id: 'CUL-54', size: 'L', surface: 'x' });
    const b = cand({ id: 'CUL-55', size: 'S', surface: 'x' });
    expect(ids(run([a, b]))).toEqual(['CUL-54', 'CUL-55']);
  });
});

describe('capacity: slots and the PM\'s review', () => {
  it('never more picks than free slots, and never more than six', () => {
    const many = Array.from({ length: 9 }, () => cand());
    expect(run(many, { slotsFree: 2 }).picks).toHaveLength(2);
    expect(run(many, { slotsFree: 9 }).picks).toHaveLength(6);
    expect(run(many, { slotsFree: 0 }).held.every((h) => h.reason === 'no free slot (0 this run)')).toBe(true);
  });
  it('sessions that wait on the PM stop at three; builds still launch', () => {
    const r = run([cand({ id: 'CUL-60', size: 'XL' }), cand({ id: 'CUL-61', size: 'L' }), cand({ id: 'CUL-62' })], { waitingOnPm: 2 });
    expect(ids(r)).toEqual(['CUL-60', 'CUL-62']);
    expect(r.held).toEqual([{ id: 'CUL-61', reason: 'waits on the PM, and 3 already do' }]);
  });
  it('a claim, an open PR and the PM\'s veto each hold', () => {
    const r = run([cand({ id: 'CUL-63', liveClaim: 'claude/x' }), cand({ id: 'CUL-64', openPr: 1400 }), cand({ id: 'CUL-65' })], { vetoed: ['CUL-65'] });
    expect(r.held.map((h) => h.reason)).toEqual(['claimed by claude/x', 'open PR #1400 already references it', 'vetoed by the PM']);
  });
  it('warns when tier A is more than a fifth of a pool of five or more, Live harm aside', () => {
    const a = (id: string) => cand({ id, impact: 'A', impactWhy: 'wrong data' });
    expect(run([a('CUL-70'), a('CUL-71'), cand(), cand(), cand()]).warnings[0]).toMatch(/^2 of 5 non-harm candidates are tier A/);
    expect(run([a('CUL-72'), cand(), cand(), cand(), cand(), cand()]).warnings).toEqual([]);
    // A small pool, or A tiers that are Live harm, never warn: harm is A by right.
    expect(run([a('CUL-73')]).warnings).toEqual([]);
    const harmA = (id: string) => cand({ id, impact: 'A', impactWhy: 'wrong data', labels: ['Live harm'] });
    expect(run([harmA('CUL-74'), harmA('CUL-75'), harmA('CUL-76'), cand(), cand(), cand()]).warnings).toEqual([]);
  });
});

describe('what it writes', () => {
  it('rows and notes parse back through dispatch\'s own page reader', () => {
    const r = run([cand({ id: 'CUL-80', title: 'Signal keeps a refused meal | today', labels: ['Live harm'], impact: 'A', impactWhy: 'Home says eating' }), cand({ id: 'CUL-81', size: 'XL' })]);
    const { rows, notes, doneMeans } = pageRows(r.picks, 12);
    const page = parsePage(['## Run order', '', '| PR | Issue(s) | What it is | After | Lane |', '|---|---|---|---|---|', ...rows, '', doneMeans, '', ...notes].join('\n'));
    expect(page.rows.map((x) => [x.id, x.issues])).toEqual([['12', ['CUL-80']], ['13', ['CUL-81']]]);
    expect(page.doneMeans).toEqual(['12', '13']);
    expect(page.rows[0].note).toMatch(/^Routine: build from this note/);
    expect(page.rows[1].note).toMatch(/shaping brief/);
    expect(notes[1]).toMatch(/shaping brief \(DISCOVERY\)/);
    expect(notes.every((x) => /Circuit breaker/.test(x))).toBe(true);
  });
  it('names sessions by what they do', () => {
    const [p] = run([cand({ id: 'CUL-90', title: 'The Foods tab hides a topper with no reason given to the owner at all', size: 'S', surface: 'f' }), cand({ id: 'CUL-91', size: 'S', surface: 'f' })]).picks;
    expect(sessionTitle(p)).toBe('Sweep · The Foods tab hides a topper with no reason… · CUL-90 +1');
    expect(sweepRunTitle(new Date('2026-11-07T22:10:00Z'), 4)).toBe('Sweep · Nov 7, 4:10pm · 4 launched');
  });
  it('reports the measurements the readout needs', () => {
    expect(metricsLine({ launched: 4, merged: 2, abandoned: 1, launchToMergeHours: [3, 1, 8] })).toBe('Sweep metrics: launched 4 · merged 2 · abandoned 1 · launch to merge median 3.0h over 3');
    expect(metricsLine({ launched: 0, merged: 0, abandoned: 0, launchToMergeHours: [] })).toMatch(/n\/a$/);
  });
});
