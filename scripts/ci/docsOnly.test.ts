// The docs only rule (CUL-2860). Each case is a way a skip could hide a failure; the rule
// must answer "full run" to all of them.

import { allDocs, decide, isDocsPath, selectDocsSuites, type Candidate } from './docsOnly.ts';

const docs = ['docs/sessions/2026-11-21-x.md', 'STATUS.md'];
const sha = (c: string) => c.repeat(40);

describe('isDocsPath', () => {
  it.each([
    'docs/sessions/2026-11-21-x.md',
    'CLAUDE.md',
    '.claude/commands/dispatch.md',
    'docs/vet-report-mock-v3.html',
  ])('%s is docs', (p) => expect(isDocsPath(p)).toBe(true));

  it.each([
    // Code that lives under docs/: a Deno suite imports this JSON, tsc checks this TS.
    'docs/vet-report-v3-discovery/fixtures/canonical-fixtures.json',
    'docs/vet-report-v3-discovery/bakeoff/rerun-4/run/harness.ts',
    'docs/nyx-schema-v1_0.sql',
    // Markdown that is a fixture or a corpus.
    'scripts/dispatch/fixtures/engines-v3.2026-10-05.page.md',
    'supabase/functions/generate-signal/eval/ADEMP.md',
    // HTML outside docs/.
    'app/thing.html',
    '.github/workflows/ci.yml',
    'lib/utils.ts',
  ])('%s is code', (p) => expect(isDocsPath(p)).toBe(false));

  it('an empty list is never docs only', () => {
    expect(allDocs([])).toBe(false);
  });
});

describe('decide', () => {
  const passedDocsOnly: Candidate = { sha: sha('a'), changedSince: docs, passed: true };

  it('main and every other event run in full', () => {
    expect(decide('push', docs, [passedDocsOnly]).docsOnly).toBe(false);
    expect(decide('workflow_dispatch', docs, [passedDocsOnly]).docsOnly).toBe(false);
  });

  it('a pull request of docs alone skips', () => {
    expect(decide('pull_request', docs, []).docsOnly).toBe(true);
  });

  it('a docs commit on top of a passed run skips', () => {
    const d = decide('pull_request', [...docs, 'lib/x.ts'], [passedDocsOnly]);
    expect(d).toEqual({ docsOnly: true, reason: 'only docs changed since aaaaaaa, whose CI run passed' });
  });

  it('a docs commit on top of a RED run never turns it green', () => {
    const red: Candidate = { sha: sha('a'), changedSince: docs, passed: false };
    const code: Candidate = { sha: sha('b'), changedSince: [...docs, 'lib/x.ts'], passed: true };
    expect(decide('pull_request', [...docs, 'lib/x.ts'], [red, code]).docsOnly).toBe(false);
    // Nothing further back at all: still full.
    expect(decide('pull_request', [...docs, 'lib/x.ts'], [red]).docsOnly).toBe(false);
  });

  it('walks past a cancelled (not passed) run to an earlier passed one, while only docs changed', () => {
    const cancelled: Candidate = { sha: sha('a'), changedSince: docs, passed: false };
    const passed: Candidate = { sha: sha('b'), changedSince: docs, passed: true };
    expect(decide('pull_request', [...docs, 'lib/x.ts'], [cancelled, passed]).docsOnly).toBe(true);
  });

  it('a code change between the head and the passed run is a full run', () => {
    const passedBeforeCode: Candidate = { sha: sha('a'), changedSince: ['docs/a.md', 'lib/x.ts'], passed: true };
    const d = decide('pull_request', null, [passedBeforeCode]);
    expect(d.docsOnly).toBe(false);
    expect(d.reason).toContain('lib/x.ts');
  });

  it('every unread value fails open to the full run', () => {
    expect(decide('pull_request', null, []).docsOnly).toBe(false);
    expect(decide('pull_request', null, [{ sha: sha('a'), changedSince: null, passed: true }]).docsOnly).toBe(false);
    expect(decide('pull_request', null, [{ sha: sha('a'), changedSince: docs, passed: null }]).docsOnly).toBe(false);
    // An empty diff reads as a failed read, not as docs.
    expect(decide('pull_request', null, [{ sha: sha('a'), changedSince: [], passed: true }]).docsOnly).toBe(false);
  });
});

describe('selectDocsSuites', () => {
  it('keeps every guard, every scripts/ suite and any suite naming a doc, and nothing else', () => {
    const picked = selectDocsSuites([
      { path: 'guards/claudeMdBudget.test.ts', text: 'nothing named' },
      { path: 'scripts/sweep/prompt.test.ts', text: '' },
      { path: 'lib/reads.test.ts', text: "fs.readFileSync('docs/nyx-x.md')" },
      { path: 'lib/claims.test.ts', text: "read('.claude/rules/ui.md')" },
      { path: 'lib/joined.test.ts', text: "path.join(ROOT, 'docs', name)" },
      { path: 'lib/pure.test.ts', text: 'expect(add(1, 2)).toBe(3)' },
    ]);
    expect(picked).toEqual([
      'guards/claudeMdBudget.test.ts',
      'lib/claims.test.ts',
      'lib/joined.test.ts',
      'lib/reads.test.ts',
      'scripts/sweep/prompt.test.ts',
    ]);
  });
});
