// The groomer leads with the intake ratio, stops on it, and dry-runs its writes (CUL-2660).
//
// WHY THIS FILE EXISTS. The 2026-11-07 pass found the board honest but about 200 issues
// larger in 13 days: roughly 1.8 opened per close. Hygiene cannot fix that; only less
// intake or more closes can. So the ratio is the Board count's headline, a ratio above 1
// on two consecutive passes makes an intake cut the first PM decision, and every pass
// lists its intended writes before it makes them.
//
// The skill is trimmed under the second byte ratchet (`guards/claudeMdBudget.test.ts`),
// so a rule held only in prose is exactly what a future trim deletes. This guard reds
// when any of the three leaves the file.
//
// SCOPE BOUNDARY: it guards the TEXT, not the behaviour. Whether a pass actually computes
// the ratio, or names the right generator, is read at review. The 10% reopen and reversal
// checks are pinned only as phrases, so they cannot be dropped quietly.
//
// MUTATION PROOF (C-18). The checker is pure over the file's text; every rule has a
// mutant below, applied to an in-memory copy of the REAL file, that must produce a
// problem. A mutant whose anchor no longer matches exactly once fails: fix the mutant,
// never drop it.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const skill = fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'backlog-groomer', 'SKILL.md'), 'utf8');

/** From `start` to the next line opening with `stop`; '' when `start` is absent. */
function slice(text: string, start: string, stop: RegExp): string {
  const i = text.indexOf(start);
  if (i < 0) return '';
  const rest = text.slice(i + start.length);
  const m = rest.match(stop);
  return start + (m && m.index !== undefined ? rest.slice(0, m.index) : rest);
}

function problems(text: string): string[] {
  const out: string[] = [];
  const step15 = slice(text, '15. **Count the board.', /\n\d+\. \*\*/);
  if (!step15) return ['the skill has no step 15 (Count the board)'];
  for (const p of ['Lead with the intake ratio:', 'opened ÷ closed', '**Above 1 on two consecutive passes**', '**intake cut**', 'if reopens pass **10%**', 'if reversals pass **10%**']) {
    if (!step15.includes(p)) out.push(`step 15 is missing "${p}"`);
  }

  const board = text.split('\n').find((l) => l.startsWith('**Board count** — '));
  if (!board) out.push('the output format has no Board count line');
  else if (!board.startsWith('**Board count** — intake ratio <N.N>')) out.push('the Board count does not lead with the intake ratio');

  const decisions = slice(text, '### Needs PM decision\n', /\n```/);
  const first = decisions.split('\n')[1] ?? '';
  if (!first.startsWith('- <intake cut')) out.push('Needs PM decision does not open with the intake cut');

  const apply = slice(text, '**Dry run first.**', /\n/);
  if (!apply) out.push('the skill has no dry run');
  else {
    for (const p of ['Before any write', '**Intended writes**', 'An unattended pass then makes them', 'an attended pass shows the PM the list']) {
      if (!apply.includes(p)) out.push(`the dry run is missing "${p}"`);
    }
    if (!apply.includes('Apply only what § What an unattended pass may WRITE permits')) {
      out.push('the dry run no longer precedes the Apply rule');
    }
  }
  return out;
}

/** Replace exactly one occurrence of `from`; throws when the anchor drifted. */
function mutate(text: string, from: string, to: string): string {
  const first = text.indexOf(from);
  if (first < 0 || text.indexOf(from, first + 1) >= 0) throw new Error(`mutant anchor must match once: ${from}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

describe('groomer intake ratio (CUL-2660)', () => {
  it('reads the real skill (non-vacuity)', () => {
    expect(slice(skill, '15. **Count the board.', /\n\d+\. \*\*/).length).toBeGreaterThan(1_000);
    expect(skill).toContain('## Output format');
  });

  it('leads with the ratio, carries the stop rule and the dry run', () => {
    expect(problems(skill)).toEqual([]);
  });

  const mutants: [string, string, string][] = [
    ['drops step 15', '15. **Count the board.', '15. **Tally.'],
    ['drops the headline', 'Lead with the intake ratio:', 'Report the ratio:'],
    ['drops the ratio definition', 'opened ÷ closed for the window', 'the flow for the window'],
    ['weakens the stop rule to one pass', '**Above 1 on two consecutive passes**', '**Above 1**'],
    ['drops the intake cut', '**intake cut**', '**cleanup**'],
    ['drops the reopen check', 'if reopens pass **10%**', 'if reopens pass **many**'],
    ['drops the reversal check', 'if reversals pass **10%**', 'if reversals pass **many**'],
    ['moves the ratio off the Board count lead', '**Board count** — intake ratio <N.N> (opened ÷ closed; last pass <N.N>) · opened <N>', '**Board count** — opened <N> · intake ratio <N.N>'],
    ['drops the intake-cut decision', '- <intake cut, first', '- <cut, first'],
    ['drops the dry run', '**Dry run first.**', '**Then.**'],
    ['drops Intended writes', '**Intended writes**', '**the log**'],
    ['lets the attended pass write unshown', 'an attended pass shows the PM the list', 'an attended pass does the same'],
  ];

  it.each(mutants)('reds when the skill %s', (_name, from, to) => {
    expect(problems(mutate(skill, from, to)).length).toBeGreaterThan(0);
  });

  it('reds when the intake cut is not the first decision', () => {
    const moved = mutate(skill, '### Needs PM decision\n- <intake cut', '### Needs PM decision\n- <other>\n- <intake cut');
    expect(problems(moved)).toContain('Needs PM decision does not open with the intake cut');
  });
});
