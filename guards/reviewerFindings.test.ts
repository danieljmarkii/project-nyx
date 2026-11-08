// Reviewer agents split their findings: blocking in full, residuals capped (CUL-2657).
//
// WHY THIS FILE EXISTS. On 2026-11-07 the PM ruled a cap on the reviewer agents. Each
// review round was filing more issues than the fix it reviewed (the vet report v2 cold
// reads and adversarial passes drove most of a 13-day intake). So each of the four
// reviewers reports two halves: blocking findings (anything that can drop, soften or
// delay a warning, reassure on absence, or expose, corrupt or lose data, plus anything
// its verdict fails on) in full, and everything else as one grouped list of at most five
// lines. The calling session handles that list under CLAUDE.md's filing rule (CUL-2656).
//
// The agent files sit under the CUL-1874 byte ratchet, so the section that holds the
// split is exactly the prose a future trim deletes. This guard reds when any half, the
// cap, the filing-rule pointer or the residuals heading leaves any of the four files,
// and when a file restates the filing rule's "small" (one definition, in CLAUDE.md).
//
// It also checks that every `docs/…` path an agent names exists: a reviewer that
// launches cold reads the file it is pointed at, and a dead pointer reads as "no rules".
//
// SCOPE BOUNDARY: it guards the TEXT, not the behaviour. Whether an agent really caps
// its residuals is read at review, not here. code-reviewer and pm-coach are out of scope.
//
// MUTATION PROOF (C-18). The checker is a pure function over one file's text. Every
// required phrase has a mutant that removes it from an in-memory copy of the REAL file
// (no filesystem writes) and must produce a problem.

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');
const AGENTS = ['adversarial-reviewer', 'vet-report-cold-read', 'pm-feature-review', 'rls-privacy-reviewer'] as const;
type Agent = (typeof AGENTS)[number];

const read = (agent: Agent): string =>
  fs.readFileSync(path.join(REPO_ROOT, '.claude', 'agents', `${agent}.md`), 'utf8');

const SECTION_HEADING = '## Blocking findings and residuals';
const RESIDUALS_HEADING = '### Residuals (max 5)';

/** Every agent's split section must say each of these. */
const SECTION_PHRASES = [
  'Blocking, reported in full',
  'drop, soften or delay a warning',
  'reassure on absence',
  'expose, corrupt or lose data',
  'anything your verdict fails on',
  'Never fold one into the residuals',
  'Residuals, capped',
  'at most 5 lines',
  'the filing rule calls small',
  'one class issue',
] as const;

/** Where each agent's blocking half lands in its output. */
const BLOCKING_HOME: Record<Agent, { where: 'section' | 'output'; phrase: string }> = {
  'adversarial-reviewer': { where: 'output', phrase: '### Blocking' },
  'rls-privacy-reviewer': { where: 'output', phrase: '### Blocking' },
  'vet-report-cold-read': { where: 'section', phrase: 'blocking findings only' },
  'pm-feature-review': { where: 'section', phrase: 'blocking findings only' },
};

/** Phrases only one agent must carry. */
const OWN_PHRASES: Partial<Record<Agent, readonly string[]>> = {
  // LOUD/QUIET maps onto the split, and the two-pass cap (PM, 2026-10-10) stays as it was.
  'adversarial-reviewer': ['Every QUIET break is blocking', 'The two-pass cap', 'Ships at the cap'],
};

function between(text: string, start: string, endMarker: string): string {
  const i = text.indexOf(`\n${start}\n`);
  if (i < 0) return '';
  const j = text.indexOf(endMarker, i + start.length + 2);
  return text.slice(i, j < 0 ? undefined : j);
}

function problems(agent: Agent, text: string): string[] {
  const out: string[] = [];
  const section = between(text, SECTION_HEADING, '\n## ');
  if (!section) out.push(`${agent}: no "${SECTION_HEADING}" section`);
  for (const phrase of SECTION_PHRASES) {
    if (section && !section.includes(phrase)) out.push(`${agent}: the split no longer says: ${phrase}`);
  }
  // "Small" has one definition, the filing rule's; a copy here would drift from it.
  if (/about 20 lines/.test(section)) out.push(`${agent}: restates the filing rule's "small"`);

  const output = text.slice(text.indexOf('## Output format'));
  if (!text.includes('## Output format')) out.push(`${agent}: no "## Output format" section`);
  else if (!output.includes(RESIDUALS_HEADING)) out.push(`${agent}: output format has no ${RESIDUALS_HEADING}`);

  const home = BLOCKING_HOME[agent];
  const homeText = home.where === 'section' ? section : output;
  if (!homeText.includes(home.phrase)) out.push(`${agent}: blocking half no longer lands: ${home.phrase}`);

  for (const phrase of OWN_PHRASES[agent] ?? []) {
    if (!text.includes(phrase)) out.push(`${agent}: no longer says: ${phrase}`);
  }
  return out;
}

/** Replace one exact string in a real file's text; the anchor must be unique. */
function swap(text: string, anchor: string, replacement: string): string {
  const count = text.split(anchor).length - 1;
  if (count !== 1) throw new Error(`mutant anchor matched ${count} times, not once: ${anchor}`);
  return text.split(anchor).join(replacement);
}

const mutate = (text: string, anchor: string): string => swap(text, anchor, '');

describe('reviewer agents split blocking findings from capped residuals (CUL-2657)', () => {
  describe.each(AGENTS.map((a) => [a]))('%s', (agent) => {
    const text = read(agent);
    const section = between(text, SECTION_HEADING, '\n## ');

    it('reads the real file (non-vacuity)', () => {
      expect(text.startsWith('---\nname: ' + agent + '\n')).toBe(true);
      expect(section.length).toBeGreaterThan(300);
    });

    it('carries the split, the cap and the filing-rule pointer', () => {
      expect(problems(agent, text)).toEqual([]);
    });

    it('names only docs that exist', () => {
      const docs = [...text.matchAll(/`(docs\/[^`*\s]+)`/g)].map((m) => m[1]);
      expect(docs.length).toBeGreaterThan(0);
      for (const doc of docs) expect([doc, fs.existsSync(path.join(REPO_ROOT, doc))]).toEqual([doc, true]);
    });

    describe('mutation proof: each removal reds', () => {
      // Section phrases are removed INSIDE the section, so a copy elsewhere cannot mask it.
      it.each(SECTION_PHRASES.map((p) => [p]))('removing "%s" from the split', (phrase) => {
        const mutantSection = section.split(phrase).join('');
        expect(mutantSection).not.toBe(section);
        expect(problems(agent, swap(text, section, mutantSection)).length).toBeGreaterThan(0);
      });

      it('deleting the whole section', () => {
        expect(problems(agent, mutate(text, section))).toContain(`${agent}: no "${SECTION_HEADING}" section`);
      });

      it('dropping the residuals heading from the output', () => {
        expect(problems(agent, mutate(text, RESIDUALS_HEADING))).toContain(
          `${agent}: output format has no ${RESIDUALS_HEADING}`,
        );
      });

      it('dropping where the blocking half lands', () => {
        expect(problems(agent, mutate(text, BLOCKING_HOME[agent].phrase))).toContain(
          `${agent}: blocking half no longer lands: ${BLOCKING_HOME[agent].phrase}`,
        );
      });

      it('restating "small" in the split', () => {
        const restated = swap(text, section, `${section}- Small means about 20 lines.\n`);
        expect(problems(agent, restated)).toEqual([`${agent}: restates the filing rule's "small"`]);
      });

      it('removing each phrase only this agent carries', () => {
        for (const phrase of OWN_PHRASES[agent] ?? []) {
          expect(problems(agent, text.split(phrase).join(''))).toContain(`${agent}: no longer says: ${phrase}`);
        }
      });
    });
  });
});
