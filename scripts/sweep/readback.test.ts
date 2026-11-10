// /sweep step 0 (CUL-2700): the next sweep reads back the last batch, since no dispatcher
// stays on. Fixtures are sweep 1's real launch lines (Loose ends, 2026-11-09).

import { pageRows } from './rank.ts';
import { readBack, type PrRead, type ReadbackInput } from './readback.ts';

const LAUNCH = `**/dispatch run** · 2026-11-09T14:14Z · first sweep: 6 launched (PM "go 6")

PR-01 · CUL-1797 · session session_01 · branch claude/loose-ends-pr01-11091410 · 2026-11-09T14:11:24Z · picked
PR-02 · CUL-1917 · session session_02 · branch claude/loose-ends-pr02-11091410 · 2026-11-09T14:11:58Z · picked
PR-03 · CUL-1919 · session session_03 · branch claude/loose-ends-pr03-11091410 · 2026-11-09T14:13:22Z · picked
PR-04 · CUL-1286 · session session_04 · branch claude/loose-ends-pr04-11091410 · 2026-11-09T14:13:23Z · picked

Dispatcher: session_00
Teach: PR-01`;

// A later update with no launch lines (a wake) must not hide the batch.
const WAKE = `**/dispatch run** · 2026-11-09T20:53Z · wake: PR-03 merged (#1497)

Merged: PR-02 #1494 (CUL-1917)
Dispatcher: session_00`;

const PAGE = `| PR | Issue(s) | What it is | After | Lane |
| -- | -- | -- | -- | -- |
| 01 | CUL-1797 | Intake card | — | shape |
| 02 | CUL-1917 | Dose linked to a removed meal | — | build |
| 03 | CUL-1919 | Trial block | — | build |
| 04 | CUL-1286 | Weight field | — | build |

**PR-04:** Routine: build from this note. Why: Live harm. Files: components/profile/EditPetModal.tsx, components/profile/EditPetModal.test.tsx. Team: Engineer: guard it. Done when: x. Circuit breaker: y.`;

const pr = (n: number, row: string, over: Partial<PrRead> = {}): PrRead => ({
  number: n,
  branch: `claude/loose-ends-pr${row}-11091410`,
  open: false,
  merged: false,
  files: [`lib/row${row}.ts`],
  ...over,
});

const input = (over: Partial<ReadbackInput> = {}): ReadbackInput => ({
  now: '2026-11-10T15:00:00Z',
  updates: [WAKE, LAUNCH],
  page: PAGE,
  prs: [],
  sessions: {},
  claims: {},
  ...over,
});

const outcomeOf = (b: ReturnType<typeof readBack>, row: string) => b.rows.find((r) => r.row === row)?.outcome;

describe('the read-back finds the batch in dispatch grammar', () => {
  it('reads the newest update that launched, past a wake update with no launch lines', () => {
    const b = readBack(input());
    expect(b.rows.map((r) => r.row)).toEqual(['01', '02', '03', '04']);
    expect(b.rows.map((r) => r.issue)).toEqual(['CUL-1797', 'CUL-1917', 'CUL-1919', 'CUL-1286']);
  });

  it('refuses a composed or missing clock', () => {
    expect(() => readBack(input({ now: 'yesterday' }))).toThrow(/date -u/);
  });
});

describe('each row gets one outcome, from GitHub and the session, never from memory', () => {
  it('a merged PR is merged, and its launch to merge time feeds the metrics', () => {
    const b = readBack(input({
      prs: [pr(1498, '01', { merged: true, mergedAt: '2026-11-09T17:23:17Z' }), pr(1494, '02', { merged: true, mergedAt: '2026-11-09T14:39:39Z' })],
      sessions: { session_03: 'working', session_04: 'working' },
    }));
    expect(outcomeOf(b, '01')).toBe('merged');
    expect(outcomeOf(b, '02')).toBe('merged');
    expect(b.metrics).toMatch(/launched 4 · merged 2 · abandoned 0 · launch to merge median 1\.8h over 2/);
  });

  // Sweep 1's blind spot: #1497 green and idle, its merge the PM's, and no one said so.
  it('a green PR whose session went idle waits on the PM and leads Needs you, naming the merge', () => {
    const b = readBack(input({
      prs: [pr(1497, '03', { open: true, checksGreen: true, production: true, files: ['supabase/functions/generate-report/trial.ts'] })],
      sessions: { session_03: 'blocked' },
    }));
    expect(outcomeOf(b, '03')).toBe('waiting on you');
    expect(b.needsYou).toEqual(['PR-03 · CUL-1919 · merge #1497 (it deploys: type merge in its session)']);
    expect(b.waitingOnPm).toBe(1);
    expect(b.inFlight).toEqual([{ holder: '#1497 (PR-03)', files: ['supabase/functions/generate-report/trial.ts'] }]);
  });

  it('a green PR that does not deploy still waits on the PM when its session stopped short', () => {
    const b = readBack(input({ prs: [pr(1493, '04', { open: true, checksGreen: true })], sessions: { session_04: 'completed' } }));
    expect(b.needsYou[0]).toMatch(/merge #1493 \(green; its session stopped short of merging\)/);
  });

  it('an open PR whose session is working is running, holds its files, and asks nothing', () => {
    const b = readBack(input({ prs: [pr(1495, '02', { open: true })], sessions: { session_02: 'working' } }));
    expect(outcomeOf(b, '02')).toBe('running');
    expect(b.needsYou).toEqual([]);
    expect(b.inFlight[0].holder).toBe('#1495 (PR-02)');
  });

  it('a shaping session blocked with no PR waits on the PM for its go, and holds its note\'s files', () => {
    const b = readBack(input({ sessions: { session_04: 'blocked' } }));
    expect(outcomeOf(b, '04')).toBe('waiting on you');
    expect(b.needsYou).toContain('PR-04 · CUL-1286 · your go, typed in its session');
    expect(b.inFlight).toContainEqual({ holder: 'PR-04 (waiting)', files: ['components/profile/EditPetModal.tsx', 'components/profile/EditPetModal.test.tsx'] });
  });
});

describe('a dead row is released once, and only by its own claim', () => {
  it('a gone session with no PR died; its claim naming this branch is released', () => {
    const b = readBack(input({ claims: { 'CUL-1286': '**Claimed** — branch `claude/loose-ends-pr04-11091410`, 2026-11-09T14:13:23Z, mode BUILD.' } }));
    expect(outcomeOf(b, '04')).toBe('died');
    expect(b.releases).toEqual([{ issue: 'CUL-1286', comment: '**Released** — sweep session session_04 ended without a PR, 2026-11-10T15:00:00Z' }]);
    expect(b.metrics).toMatch(/abandoned 4/);
  });

  it('a claim already released, or another branch\'s claim, is never released again', () => {
    const b = readBack(input({
      claims: {
        'CUL-1286': '**Released** — branch `claude/loose-ends-pr04-11091410`, 2026-11-09T15:00:00Z',
        'CUL-1919': '**Claimed** — branch `claude/someone-else`, 2026-11-09T15:00:00Z, mode BUILD.',
      },
    }));
    expect(b.releases).toEqual([]);
  });
});

describe('the page stays a working list, and a row number is never reused', () => {
  it('prunes rows merged more than a week ago, and keeps the rest', () => {
    const b = readBack(input({
      now: '2026-11-17T15:00:00Z',
      prs: [pr(1494, '02', { merged: true, mergedAt: '2026-11-09T14:39:39Z' }), pr(1498, '01', { merged: true, mergedAt: '2026-11-10T16:00:00Z' })],
    }));
    expect(b.prune).toEqual(['02']);
  });

  it('numbers the next batch past every row ever launched, even when the page was pruned empty', () => {
    expect(readBack(input()).nextRow).toBe(5);
    expect(readBack(input({ page: '' })).nextRow).toBe(5);
    expect(readBack(input({ page: '', updates: [] })).nextRow).toBe(1);
  });
});

describe('review fixes (code-reviewer, 2026-11-10)', () => {
  const BUNDLE_PAGE = `| 05 | CUL-11 · CUL-12 · CUL-13 | A bundle | — | build |
| 06 | CUL-1580 | Widget strip | — | shape |`;
  const BUNDLE = `**/dispatch run** · sweep

PR-05 · CUL-11 · session session_05 · branch claude/loose-ends-pr05-11101405 · 2026-11-10T14:05:00Z · picked
PR-06 · CUL-1580 · session session_06 · branch claude/loose-ends-pr06-11101405 · 2026-11-10T14:05:00Z · picked

Teach: PR-06`;
  const claimed = (b: string) => `**Claimed** — branch \`${b}\`, 2026-11-10T14:05:00Z, mode BUILD.`;

  it('a dead bundle releases every issue it claimed, not only the lead', () => {
    const br = 'claude/loose-ends-pr05-11101405';
    const b = readBack(input({ updates: [BUNDLE], page: BUNDLE_PAGE, claims: { 'CUL-11': claimed(br), 'CUL-12': claimed(br), 'CUL-13': '**Released** — done' } }));
    expect(b.releases.map((r) => r.issue)).toEqual(['CUL-11', 'CUL-12']);
  });

  it('a shaping row that finished with no PR is done, not died, and is not abandoned work', () => {
    const b = readBack(input({ updates: [BUNDLE], page: BUNDLE_PAGE, sessions: { session_05: 'working', session_06: 'completed' } }));
    expect(outcomeOf(b, '06')).toBe('done');
    expect(b.metrics).toMatch(/abandoned 0/);
  });

  it('prunes an older batch\'s merged rows once a newer batch has launched', () => {
    const b = readBack(input({
      now: '2026-11-20T00:00:00Z',
      updates: [BUNDLE, LAUNCH],
      page: `${PAGE}\n${BUNDLE_PAGE}`,
      prs: [pr(1494, '02', { merged: true, mergedAt: '2026-11-09T14:39:39Z' })],
    }));
    expect(b.prune).toEqual(['02']);
  });

  it('the teach place is taken while the batch\'s teach row is in flight, and free once it is out', () => {
    expect(readBack(input({ updates: [BUNDLE], page: BUNDLE_PAGE, sessions: { session_06: 'blocked' } })).teachFree).toBe(false);
    expect(readBack(input({ updates: [BUNDLE], page: BUNDLE_PAGE, sessions: { session_06: 'completed' } })).teachFree).toBe(true);
    expect(readBack(input({ updates: [], page: '' })).teachFree).toBe(true);
  });

  it('reads the files of the build notes rank.ts writes (the page grammar round-trips)', () => {
    const p = pageRows([{ kind: 'build', issues: ['CUL-11', 'CUL-12'], what: 'A bundle', size: 'M', files: ['lib/a.ts', 'lib/b.ts'], why: 'x', team: [{ persona: 'QA', rec: 'pin it' }], doneWhen: 'y', liveHarm: false }], 5);
    const b = readBack(input({ updates: [BUNDLE], page: [...p.rows, ...p.notes].join('\n\n'), sessions: { session_05: 'working' }, claims: {} }));
    expect(b.inFlight).toContainEqual({ holder: 'PR-05 (running)', files: ['lib/a.ts', 'lib/b.ts'] });
    expect(readBack(input({ updates: [BUNDLE], page: p.rows.join('\n'), claims: { 'CUL-12': claimed('claude/loose-ends-pr05-11101405') } })).releases.map((r) => r.issue)).toEqual(['CUL-12']);
  });
});
