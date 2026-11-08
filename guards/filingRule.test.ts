// The filing rule stays in the manual (CUL-2656).
//
// WHY THIS FILE EXISTS. On 2026-11-07 the PM ruled "leave it better than you found it":
// a small, safe find along the way is fixed in the session's own PR and listed under an
// `## Along the way` heading in the PR body; anything else goes to one class issue, never
// one issue per instance. It replaced the 2026-08-16 clause in § Starting from a Linear
// issue, step 3 ("out-of-scope work you discover → file a new CUL issue, never folded in"),
// which was the largest single source of board intake (`docs/engineering-lessons.md` §P-19).
//
// A rule enforced by prose fires approximately never here, and CLAUDE.md is trimmed under
// a byte ratchet, so the paragraph that holds this rule is exactly the kind a future trim
// deletes as "story". This guard reds when any condition, the step 3 pointer or the PR
// heading leaves the manual, or when the old clause comes back to step 3.
//
// SCOPE BOUNDARY: it guards the TEXT, not the behaviour. Whether a session really lists
// its finds under the heading is read at review, not here.
//
// MUTATION PROOF (C-18). The checker is a pure function over the manual's text, and every
// required string has a mutant below that removes it from an in-memory copy of the REAL
// manual (no filesystem writes) and must produce a problem. A mutant whose anchor no
// longer matches exactly once fails: fix the mutant, never drop it.

import * as fs from 'fs';
import * as path from 'path';

const MANUAL = path.resolve(__dirname, '..', 'CLAUDE.md');
const manual = fs.readFileSync(MANUAL, 'utf8');

/** The text of one `## ` section, heading included; '' when the heading is missing. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start < 0) return '';
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

/** The single paragraph that starts with `opener`; '' when absent. */
function paragraph(text: string, opener: string): string {
  const start = text.indexOf(opener);
  if (start < 0) return '';
  const end = text.indexOf('\n\n', start);
  return text.slice(start, end < 0 ? undefined : end);
}

const HEADING = '`## Along the way`';

/** Each condition of the ruled rule, as the manual must state it. */
const RULE_PHRASES = [
  'a file the PR already touches',
  'about 20 lines',
  'off the never-list',
  'privacy / RLS / Storage / deletion / export',
  'uncertain counts as on it',
  'a test covers it',
  HEADING,
  'one class issue',
  'never one issue per instance',
] as const;

function filingRuleProblems(text: string): string[] {
  const problems: string[] = [];

  const rule = paragraph(section(text, 'Backlog Protocol'), '**The filing rule');
  if (!rule) problems.push('§ Backlog Protocol has no "**The filing rule" paragraph');
  for (const phrase of RULE_PHRASES) {
    if (rule && !rule.includes(phrase)) problems.push(`the filing rule no longer says: ${phrase}`);
  }

  const prFormat = paragraph(section(text, 'Git Workflow'), '**PR descriptions must include:**');
  if (!prFormat.includes(HEADING)) {
    problems.push(`§ Git Workflow's PR description format no longer names ${HEADING}`);
  }

  const step3 = text.split('\n').find((line) => line.startsWith('3. **Close out**')) ?? '';
  if (!step3) problems.push('§ Starting from a Linear issue has no step 3 (Close out)');
  if (step3 && !step3.includes('the filing rule')) problems.push('step 3 no longer points at the filing rule');
  if (/never folded in/i.test(step3)) problems.push('step 3 carries the retired "never folded in" clause again');

  return problems;
}

/** Remove (or replace) one exact string from the real manual; the anchor must be unique. */
function mutate(anchor: string, replacement = ''): string {
  const count = manual.split(anchor).length - 1;
  if (count !== 1) throw new Error(`mutant anchor matched ${count} times, not once: ${anchor}`);
  return manual.replace(anchor, replacement);
}

const ruleParagraph = paragraph(manual, '**The filing rule');

describe('the filing rule (CUL-2656)', () => {
  it('reads the real manual (non-vacuity)', () => {
    expect(manual.length).toBeGreaterThan(30_000);
    expect(manual.slice(0, 200)).toContain('Project Nyx');
    expect(ruleParagraph.length).toBeGreaterThan(300);
  });

  it('is present in CLAUDE.md, with the PR heading and the step 3 pointer', () => {
    expect(filingRuleProblems(manual)).toEqual([]);
  });

  describe('mutation proof: each removal reds', () => {
    // Every phrase is mutated INSIDE the rule paragraph, so a copy elsewhere cannot mask it.
    it.each(RULE_PHRASES.map((p) => [p]))('removing "%s" from the rule', (phrase) => {
      const mutantRule = ruleParagraph.split(phrase).join('');
      expect(mutantRule).not.toBe(ruleParagraph);
      expect(filingRuleProblems(mutate(ruleParagraph, mutantRule)).length).toBeGreaterThan(0);
    });

    it('deleting the whole rule paragraph', () => {
      expect(filingRuleProblems(mutate(ruleParagraph))).toContain(
        '§ Backlog Protocol has no "**The filing rule" paragraph',
      );
    });

    it('dropping the heading from the PR description format', () => {
      const bullet = '\n- `## Along the way`: each find fixed under the filing rule (§ Backlog Protocol), one line each';
      expect(filingRuleProblems(mutate(bullet))).toEqual([
        "§ Git Workflow's PR description format no longer names `## Along the way`",
      ]);
    });

    it('restoring the retired clause to step 3', () => {
      const pointer = 'a find along the way follows **the filing rule** (§ Backlog Protocol).';
      const old = '**out-of-scope work you discover → file a new `CUL` issue**, never folded in.';
      expect(filingRuleProblems(mutate(pointer, old))).toEqual([
        'step 3 no longer points at the filing rule',
        'step 3 carries the retired "never folded in" clause again',
      ]);
    });
  });
});
