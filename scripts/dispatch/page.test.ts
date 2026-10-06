// The plan-page reader (CUL-1615), over the two live pages as of 2026-10-05.

import { ENGINES_V3, OUT_OF_BETA } from './fixtures/facts-2026-10-05.ts';
import { classifyAfter, hotspotsOf, parsePage, slugOf, aliasOf } from './page.ts';

const ev3 = parsePage(ENGINES_V3.description);
const oob = parsePage(OUT_OF_BETA.description);
const row = (p: typeof ev3, id: string) => p.rows.find((r) => r.id === id)!;

describe('rows', () => {
  it('reads every run-order row, and never the Board table', () => {
    expect(ev3.rows.filter((r) => r.id).map((r) => r.id)).toContain('36a');
    expect(oob.rows.filter((r) => r.id)).toHaveLength(53);
    // The Board's own table (`| PR | Issue | State |`) is dispatch's output: never a row.
    expect(oob.rows.filter((r) => r.id === '12')).toHaveLength(1);
  });

  it('reads a ✓ PR cell as shipped evidence by title, unescaping what Linear escaped', () => {
    expect(row(ev3, '01').shippedTitle).toBe('Speak a read verdict or status this build does not know safely, on phone and server (CUL-1277)');
    expect(row(ev3, '03 + 04').shippedTitle).toContain('analyze-* write-back');
    expect(row(ev3, '04b').bundle).toBe(true);
  });

  it('reads auto, sub-issues and parents', () => {
    expect(row(oob, '27b')).toMatchObject({ auto: true, issues: ['CUL-1569'], parents: ['CUL-1217'] });
    expect(row(ev3, '21')).toMatchObject({ issues: ['CUL-1415', 'CUL-1416'], parents: ['CUL-1139', 'CUL-1144'] });
    // `CUL-1133 (+ CUL-819, CUL-531)` annotates; the row's issue is CUL-1133.
    expect(row(ev3, '27').issues).toEqual(['CUL-1133']);
  });

  it('a cell it cannot read says so, never guesses', () => {
    const p = parsePage('| PR | Issue(s) | What it is | After | Lane |\n| -- | -- | -- | -- | -- |\n| 12 maybe | CUL-1 | x | — | A |\n');
    expect(p.rows[0]).toMatchObject({ id: '', unreadable: 'PR cell unreadable: "12 maybe"' });
  });
});

describe('After', () => {
  it.each([
    ['PR-11b ✓ (ships on its diff)', 'pr'],
    ['PMD-4 ✓ (ruled 9/28)', 'satisfied'],
    ['PMD-21 ruled (a) 2026-10-04', 'satisfied'],
    ['rides the first build after 1.2.0', 'release'],
    ['before Wave 4 goes live', 'ga'],
    ["PR-11a's corpus format (null scenarios can be written now)", 'partial'],
    ['**your evaluation key**', 'pm'],
    ['CUL-1313', 'pm'],
    ['D2', 'ruling'],
    ['CUL-1519 merged (PR One Home language mock)', 'issue-merged'],
  ])('%s is %s', (text, kind) => {
    expect(classifyAfter(text).kind).toBe(kind);
  });

  it('a group of work is one hold, not three', () => {
    expect(row(ev3, '39').after).toEqual([{ kind: 'group', text: 'EN-8, EN-9, EN-10' }]);
  });
});

describe('order rules and critical paths', () => {
  it('reads a bare id after an arrow, and "then" as order between segments', () => {
    const chain = ev3.order.find((o) => o.kind === 'chain' && o.rows.includes('14b'))!;
    expect(chain.rows).toEqual(['14', '14b', '14c', '14d', '14e', '19', '32', '33']);
    expect(ev3.order.find((o) => o.kind === 'one-at-a-time')!.rows).toEqual(['19', '32', '33']);
    expect(ev3.order.find((o) => o.kind === 'chain' && o.rows[0] === '35')!.rows).toEqual(['35', '36']);
  });

  it('ranks a labelled sub-chain right after its line, and never reads the Board reprint', () => {
    expect(ev3.paths.map((p) => p.steps[0])).toEqual(['11b', '10', '18a', '24', '14d']);
    expect(oob.paths.map((p) => p.label)).not.toContain('Critical paths');
    expect(oob.pathLines.at(-1)).toEqual({ label: 'Critical path to GA', text: 'PR-50 → PR-51 → PR-52 → PR-53 → PR-61' });
  });
});

describe('build notes', () => {
  it('reads a merge gate whole, past the dots in a version number', () => {
    expect(row(oob, '60').mergeGate).toBe('1.2.0 is the installed build');
    expect(row(oob, '60').migration).toBe(true);
  });

  it('applies a ranged note to every row in it', () => {
    expect(row(oob, '51').hotspots).toEqual(['lib/appConfig.ts', 'lib/betaFeatures.ts', 'app/settings/beta.tsx', 'CLAUDE.md']);
  });

  it('names hotspots from the Hotspot line and the always-shared files anywhere', () => {
    expect(hotspotsOf('Hotspot: the mock page.')).toEqual(['the mock page']);
    expect(hotspotsOf('edits `generate-signal/pipeline.ts` in the summary step')).toEqual(['supabase/functions/generate-signal/pipeline.ts']);
  });
});

it('aliases and slugs', () => {
  expect(aliasOf('Engines v3: the accountable engine')).toBe('Engines v3');
  expect(aliasOf(OUT_OF_BETA.name)).toBe('Out of beta');
  expect(slugOf('The workflow audit')).toBe('the-workflow-audit');
});
