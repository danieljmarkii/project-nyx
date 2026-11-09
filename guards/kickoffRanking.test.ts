// /kickoff ranks by what each candidate frees, and names no track (CUL-2659).
//
// WHY THIS FILE EXISTS. /kickoff picks a session's first task. It used to lean on
// priority labels and on which track STATUS.md called dominant, so attention drifted
// with whoever last wrote the card. The PM ruled (2026-11-07) that the order comes from
// the issue graph: unblock count, then `Live harm`, then priority, then age, with gated
// work listed for the PM's go, and no track named in the rule.
//
// kickoff.md is trimmed under the second byte ratchet (`guards/claudeMdBudget.test.ts`),
// so a rule held only in prose is exactly what a future trim deletes. This guard reds
// when the ordering, its gate line, or its "names no project" clause leaves the file, or
// when a live track's name from STATUS.md's table appears anywhere in kickoff.md.
//
// SCOPE BOUNDARY: it guards the TEXT, not the behaviour. Whether a session actually
// counts relations is read at review. The project names come from STATUS.md's *Live
// tracks* table, so a Linear project missing from that table is not checked here.
//
// MUTATION PROOF (C-18). The checker is pure over the two files' text; every rule has a
// mutant below, applied to an in-memory copy of the REAL file (no filesystem writes),
// that must produce a problem. A mutant whose anchor no longer matches exactly once
// fails: fix the mutant, never drop it.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const kickoff = fs.readFileSync(path.join(ROOT, '.claude', 'commands', 'kickoff.md'), 'utf8');
const status = fs.readFileSync(path.join(ROOT, 'STATUS.md'), 'utf8');

/** The `## Ranking` section, up to the next `## ` heading; '' when absent. */
function rankingSection(text: string): string {
  const start = text.indexOf('\n## Ranking\n');
  if (start < 0) return '';
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

/** Each live track's short name: the bold first cell of STATUS.md's Live tracks table, cut at its subtitle. */
function trackNames(statusText: string): string[] {
  const start = statusText.indexOf('**Live tracks');
  const end = statusText.indexOf('\n### ', start);
  const table = statusText.slice(start, end < 0 ? undefined : end);
  const names = Array.from(table.matchAll(/^\| \*\*(.+?)\*\* \|/gm), (m) => m[1]);
  return names.map((n) => n.split(/ — |: | · |, /)[0].trim());
}

/** The ordered keys: each numbered item must open with its bold label, in this order. */
const KEYS = ['1. **Unblock:**', '2. **Live harm:**', '3. **Priority:**', '4. **Age:**'];

const PHRASES = [
  'the rule names no project',
  'direct count first, then transitive',
  '**needs the PM\'s go**, never proposed as a plain start',
  'it never ranks',
];

function problems(kickoffText: string, statusText: string): string[] {
  const out: string[] = [];
  const ranking = rankingSection(kickoffText);
  if (!ranking) return ['kickoff.md has no `## Ranking` section'];

  let at = -1;
  for (const key of KEYS) {
    const i = ranking.indexOf(key);
    if (i < 0) out.push(`Ranking is missing ${key}`);
    else if (i < at) out.push(`Ranking has ${key} out of order`);
    else at = i;
  }
  for (const p of PHRASES) if (!ranking.includes(p)) out.push(`Ranking is missing "${p}"`);
  if (/project:/.test(ranking)) out.push('Ranking scopes by a `project:` filter');

  const lower = kickoffText.toLowerCase();
  for (const name of trackNames(statusText)) {
    const re = new RegExp(`(^|[^a-z0-9])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
    if (re.test(lower)) out.push(`kickoff.md names the track "${name}"`);
  }
  return out;
}

/** Replace exactly one occurrence of `from`; throws when the anchor drifted. */
function mutate(text: string, from: string, to: string): string {
  const first = text.indexOf(from);
  if (first < 0 || text.indexOf(from, first + 1) >= 0) throw new Error(`mutant anchor must match once: ${from}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

describe('/kickoff ranking (CUL-2659)', () => {
  it('reads the real files (non-vacuity)', () => {
    expect(rankingSection(kickoff).length).toBeGreaterThan(300);
    const names = trackNames(status);
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names).toContain('The Daily Recap');
  });

  it('carries the ordering and names no track', () => {
    expect(problems(kickoff, status)).toEqual([]);
  });

  const mutants: [string, string, string][] = [
    ['drops the Ranking section', '\n## Ranking\n', '\n## Order\n'],
    ['drops unblock', '1. **Unblock:**', '1. **Count:**'],
    ['drops live harm', '2. **Live harm:**', '2. **Harm:**'],
    ['drops priority', '3. **Priority:**', '3. **Rank:**'],
    ['drops age', '4. **Age:**', '4. **Then:**'],
    ['drops transitive', 'direct count first, then transitive', 'direct count'],
    ['drops the gate line', "**needs the PM's go**, never proposed as a plain start", 'flagged'],
    ['drops "names no project"', 'the rule names no project', 'the rule'],
    ['lets STATUS.md rank', 'it never ranks', 'it ranks ties'],
    ['adds a project filter', '4. **Age:**', '4. **Age:** (`project:` of the dominant track)'],
    ['names a track', '- **Alternates** —', '- **Alternates** (the Daily Recap first) —'],
  ];

  it.each(mutants)('reds when kickoff.md %s', (_name, from, to) => {
    expect(problems(mutate(kickoff, from, to), status).length).toBeGreaterThan(0);
  });

  it('reds on out-of-order keys', () => {
    const swapped = mutate(mutate(kickoff, '2. **Live harm:**', '2. **TMP:**'), '3. **Priority:**', '2. **Live harm:**');
    expect(problems(mutate(swapped, '2. **TMP:**', '3. **Priority:**'), status)).toContain(
      'Ranking has 3. **Priority:** out of order',
    );
  });
});
