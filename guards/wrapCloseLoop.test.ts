// /wrap closes the loop (CUL-2658).
//
// WHY THIS FILE EXISTS. The 2026-11-07 grooming pass found two issues (CUL-2234, CUL-1851)
// reading claimed for weeks by deleted branches with no PR, and a session record plus two
// research briefs (#1332) sitting 13 days in an unmerged PR. Each was a wrap that ended
// without saying it was done. Row 3 puts three steps in `.claude/commands/wrap.md`:
//
//   1. release every claim by branch, with the `**Released** — branch` marker;
//   2. read back the PR body's `## Along the way` list (the filing rule, CUL-2656) into
//      the Session Summary before any merge;
//   3. refuse to report done while the record rides in an open PR, unless the PR is held
//      (`/wrap and hold`).
//
// wrap.md is trimmed under the second byte ratchet (`guards/claudeMdBudget.test.ts`), so
// a paragraph that holds a rule is exactly what a future trim deletes as story. This guard
// reds when any of the three steps, or a phrase each one turns on, leaves the file.
//
// SCOPE BOUNDARY: it guards the TEXT, not the behaviour. Whether a session posts the
// release or reads the body back is read at review, not here.
//
// MUTATION PROOF (C-18). The checker is a pure function over wrap.md's text, and every
// required phrase has a mutant below that removes it from an in-memory copy of the REAL
// file (no filesystem writes) and must produce a problem. A mutant whose anchor no longer
// matches exactly once fails: fix the mutant, never drop it.

import * as fs from 'fs';
import * as path from 'path';

const WRAP = path.resolve(__dirname, '..', '.claude', 'commands', 'wrap.md');
const wrap = fs.readFileSync(WRAP, 'utf8');

/** The single paragraph (or one-line bullet) that starts with `opener`; '' when absent. */
function paragraph(text: string, opener: string): string {
  const start = text.indexOf(opener);
  if (start < 0) return '';
  const end = text.indexOf('\n\n', start);
  const lineEnd = opener.startsWith('- ') ? text.indexOf('\n', start) : -1;
  const stop = lineEnd >= 0 && (end < 0 || lineEnd < end) ? lineEnd : end;
  return text.slice(start, stop < 0 ? undefined : stop);
}

/** Each step: the opener that finds its paragraph, and the phrases it must keep. */
const STEPS = [
  {
    name: 'the release step',
    opener: '- **Release every claim by branch**',
    phrases: ['**Released** — branch', 'every issue this session claimed', 'no PR', 'even when nothing shipped'],
  },
  {
    name: 'the Along the way read-back',
    opener: "**Read back the PR's Along the way list**",
    phrases: ['before any merge', '`## Along the way`', 'pull_request_read', 'Along the way: none'],
  },
  {
    name: 'the unmerged-record check',
    opener: '**The unmerged-record check**',
    phrases: ['still open when the wrap ends', 'does not report done', 'UNMERGED:', '`/wrap and hold', 'Held: <reason>'],
  },
] as const;

function closeLoopProblems(text: string): string[] {
  const problems: string[] = [];
  for (const step of STEPS) {
    const body = paragraph(text, step.opener);
    if (!body) {
      problems.push(`wrap.md has no ${step.name} ("${step.opener}")`);
      continue;
    }
    for (const phrase of step.phrases) {
      if (!body.includes(phrase)) problems.push(`${step.name} no longer says: ${phrase}`);
    }
  }
  return problems;
}

/** Replace one exact string in the real file; the anchor must be unique. */
function mutate(anchor: string, replacement = ''): string {
  const count = wrap.split(anchor).length - 1;
  if (count !== 1) throw new Error(`mutant anchor matched ${count} times, not once: ${anchor}`);
  return wrap.replace(anchor, replacement);
}

describe('/wrap closes the loop (CUL-2658)', () => {
  it('reads the real wrap.md (non-vacuity)', () => {
    expect(wrap.length).toBeGreaterThan(20_000);
    expect(wrap).toContain('# /wrap — End-of-session wrap-up');
    for (const step of STEPS) expect(paragraph(wrap, step.opener).length).toBeGreaterThan(200);
  });

  it('names all three steps, each with its phrases', () => {
    expect(closeLoopProblems(wrap)).toEqual([]);
  });

  describe('mutation proof: each removal reds', () => {
    const cases = STEPS.flatMap((step) => step.phrases.map((phrase) => [step.name, phrase, step.opener] as const));

    // Each phrase is removed INSIDE its own paragraph, so a copy elsewhere cannot mask it.
    it.each(cases)('%s: removing "%s"', (_name, phrase, opener) => {
      const body = paragraph(wrap, opener);
      const mutant = body.split(phrase).join('');
      expect(mutant).not.toBe(body);
      expect(closeLoopProblems(mutate(body, mutant)).length).toBeGreaterThan(0);
    });

    it.each(STEPS.map((s) => [s.name, s.opener] as const))('deleting %s whole', (name, opener) => {
      expect(closeLoopProblems(mutate(paragraph(wrap, opener)))).toEqual([
        `wrap.md has no ${name} ("${opener}")`,
      ]);
    });
  });
});
