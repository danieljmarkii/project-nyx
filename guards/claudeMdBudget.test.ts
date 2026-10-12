// CLAUDE.md does not grow. An addition is paid for by a deletion.
//
// CUL-920 · docs/workflow-retro-2026-09.md L3, §2 F5, §5 step 1.
//
// WHY THIS FILE EXISTS. CLAUDE.md is auto-loaded in full at the start of every
// session — ~34,000 tokens on every turn of every session, the single largest
// fixed cost in the repo. It has been trimmed twice and regrown past its starting
// size both times, measured blob-by-blob:
//
//     2026-08-18   126,885 B
//     2026-09-01   237,788 B   (+87% in two weeks)
//     2026-09-02   117,467 B   (the v1.29 51% deep trim, CUL-407)
//     2026-09-11   135,058 B   (+15% in nine days)
//     2026-09-12   153,050 B   (+13% overnight; v1.47 alone was ~5 KB)
//
// The 09-02 trim bought NINE DAYS. That is the repo's own law for the third time
// (after `STATUS.md` and `docs/backlog.md`): **a budget without a structural fix
// only buys time.**
//
// And note the exact shape of the failure, because it is the reason this file is a
// guard and not a sentence in the manual. § Version History carried a written cap —
// "most recent three versions only" — and that cap held PERFECTLY, every session,
// for months. The section was still 14,662 B, because each entry had grown to 4–5 KB.
// **A cap on COUNT with no cap on SIZE is not a budget.** This guard caps the only
// quantity that actually costs anything: bytes.
//
// The tier argument (retro L2): in this repo a rule enforced by prose fires
// approximately never, and a rule enforced by `guards/*.test.ts` has zero recorded
// misses. There is no third tier. The prose version of this rule already existed —
// CLAUDE.md § Documentation Update Protocol has said "every prepend is paid for by a
// delete" since 2026-07-19 — and the file doubled anyway.
//
// WHAT IT CHECKS
// --------------
// A RATCHET, both directions. One-way is a cap, and a cap re-runs L3 one level down:
// after the next deep trim, the gap between the new size and an unchanged ceiling is
// simply a fresh budget to regrow into.
//
//   (1) REGROWTH  — CLAUDE.md is larger than CEILING_BYTES.
//                   Fix: delete something in the same PR. The account behind a
//                   convention belongs in `docs/engineering-lessons.md` under that
//                   convention's pointer; the rule and its enforcement stay here.
//                   NEVER raise CEILING_BYTES to go green — that is the escape hatch
//                   this guard exists to close. (C-26 used to state the same
//                   discipline for the deploy ledger, "move the code — never bump
//                   the ledger", until CUL-1147 made merging deploy.)
//
//   (2) SLACK     — CLAUDE.md is more than SLACK_BYTES BELOW CEILING_BYTES, i.e. a
//                   trim landed and the ceiling was left where it was. Fix: lower
//                   CEILING_BYTES to the new size in the same PR. This is the half
//                   that makes it a ratchet: the ceiling only ever moves down.
//
// SLACK_BYTES is deliberately wider than a sentence and narrower than a section, so
// correcting a pointer or rewording a rule does not red the build, while removing
// anything structural does — and then the ceiling follows it down.
//
// THE SECOND RATCHET (CUL-1874, retro 4 D5, 2026-10-12). The first one held
// CLAUDE.md flat from 9/15 while about 190 KB of rules grew in the files beside it
// (`dispatch.md` 14.9 → 72.2 KB, the groomer 18.5 → 61.5 KB): retro 2's L3 again, a
// budget without a structural fix moved the growth next door. D5 split CLAUDE.md into
// a core plus path-scoped `.claude/rules/` files, so a second ratchet, built the same
// way (both directions), caps the TOTAL of CLAUDE.md, every `.claude/**/*.md`, and the
// docs moved out of CLAUDE.md that sessions still read (MOVED_DOCS). Moving a rule out
// of the core into a rule file then saves nothing on the total; only deleting does.
//
// THE RULE INDEX. CLAUDE.md § Code Conventions lists every rule file. A rule file the
// index does not name is a rule no session that skips its paths will ever learn
// exists, and an indexed file that is missing (or has no `paths:`) is a pointer to
// nothing, or a file that loads on every session and undoes the split. Both directions
// are asserted below.
//
// SCOPE BOUNDARY (stated, because an undocumented blind spot reads as coverage):
// this guards SIZE, not VALUE. It cannot tell a session that deleted the wrong 3 KB
// from one that deleted the right 3 KB. It does not cover `docs/` beyond MOVED_DOCS
// (the specs and `docs/engineering-lessons.md` are read on demand, not at session
// start), nor `STATUS.md` (a pointer card with its own rule), nor `operating-kit/`
// (a hand-ported copy). It cannot check that a rule file's `paths:` are the RIGHT
// globs, only that it has some: that a rule loads when its surface is touched was
// verified on the installed CLI (CUL-1874's session record), not here.

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');
const MANUAL = 'CLAUDE.md';
const RULES_DIR = '.claude/rules';

/** Docs moved out of CLAUDE.md by CUL-1874 that a session still reads by pointer. */
const MOVED_DOCS = ['docs/open-questions.md', 'docs/secrets-register.md', 'docs/dev-handoff-runbook.md'];

/**
 * The ceiling, in BYTES on disk (what `wc -c CLAUDE.md` reports) — not characters.
 * CLAUDE.md is dense with multi-byte UTF-8 (— § ✓ ⚠ …), so the two differ: measured
 * 2026-09-12, 136,956 B against 135,803 characters (JS `.length`, i.e. UTF-16 code
 * units — NOT code points; this file holds 26 astral chars, so a code-point count
 * disagrees by 26), a gap of 1,153 B.
 *
 * Set 2026-09-12 (CUL-920) at 136,093 B once § Version History and § Build Sequence
 * were deleted; lowered 2026-10-12 (CUL-1874) when the conventions, the Secrets
 * Register, Open Questions and Dev Handoff moved out and the Read-These table went to
 * one line per row. It is a RATCHET: lower it whenever a trim lands, and never raise it.
 */
const CEILING_BYTES = 49_068;

/** How far below the ceiling the file may sit before the ceiling is stale. */
const SLACK_BYTES = 2_048;

const manualPath = path.join(REPO_ROOT, MANUAL);
const manual = fs.readFileSync(manualPath);
const sizeBytes = manual.length;

const overBy = sizeBytes - CEILING_BYTES;
const underBy = CEILING_BYTES - sizeBytes;

describe('CLAUDE.md byte ratchet (CUL-920)', () => {
  // NON-VACUITY FLOOR. Everything below is one number compared to another, so the
  // ways this suite could pass while measuring nothing are (a) reading a file that
  // is not the manual, and (b) counting CHARACTERS while the ceiling is in bytes.
  //
  // The second is the one that needs this assertion, and it was proven by mutation
  // rather than assumed: switching the reader to `readFileSync(p, 'utf8').length`
  // loosens the real limit by 1,153 B, and BOTH verdict tests below stay GREEN —
  // 1,153 B is inside SLACK_BYTES, so the ratchet's own lower half cannot see it
  // either. Without this test the unit could change and nothing would say so.
  it('measures the real CLAUDE.md, in bytes', () => {
    expect(fs.existsSync(manualPath)).toBe(true);

    // The manual, not an empty or truncated read. The post-split core (CUL-1874) is ~49 KB;
    // a wrong path or a zero-length read is far below this floor.
    expect(sizeBytes).toBeGreaterThan(30_000);

    // It really is the manual, not some other markdown file at that path.
    const head = manual.subarray(0, 200).toString('utf8');
    expect(head).toContain('Project Nyx');

    // BYTES, not characters. This fails the moment the reader is changed to
    // `readFileSync(p, 'utf8').length`, which is the mistake that would make
    // CEILING_BYTES mean something other than what `wc -c` prints.
    const chars = manual.toString('utf8').length;
    expect(sizeBytes).toBeGreaterThan(chars);
  });

  it(`is at or under the ${CEILING_BYTES.toLocaleString('en-US')} B ceiling`, () => {
    if (sizeBytes > CEILING_BYTES) {
      throw new Error(
        [
          `CLAUDE.md has grown past its ceiling: ${sizeBytes.toLocaleString('en-US')} B, ` +
            `which is ${overBy.toLocaleString('en-US')} B over ${CEILING_BYTES.toLocaleString('en-US')} B.`,
          '',
          'This file is auto-loaded in full at the start of every session, so every byte',
          'added here is paid on every turn of every session.',
          '',
          'THE REPAIR — delete at least that much from CLAUDE.md in this same PR:',
          '  • A convention keeps its RULE and its ENFORCEMENT here, in a few lines. The',
          '    account behind it — the incident, the falsification rounds, the measurements —',
          '    goes to docs/engineering-lessons.md under that convention\'s pointer.',
          '  • A resolved Open Questions row moves to docs/decisions-archive.md, verbatim.',
          '  • A Read-These row that no longer describes a live surface goes.',
          '  • Anything git, Linear or docs/sessions/ already records is a duplicate; the',
          '    duplicate is reliably the stale copy.',
          '',
          'DO NOT raise CEILING_BYTES to go green. The ceiling only ever moves DOWN.',
          'Raising it is how this file reached 237,788 B on 2026-09-01, and a written cap',
          'that holds perfectly is worth nothing if nothing caps the size (§ Version History',
          'obeyed "three versions only" for months and still weighed 14,662 B).',
          'Same discipline as C-26 for the deploy ledger: move the code, never bump the ledger.',
        ].join('\n'),
      );
    }
    expect(sizeBytes).toBeLessThanOrEqual(CEILING_BYTES);
  });

  it('has a ceiling that still tracks the file (lower it after a trim)', () => {
    if (underBy > SLACK_BYTES) {
      throw new Error(
        [
          `CLAUDE.md is ${underBy.toLocaleString('en-US')} B below its ceiling ` +
            `(${sizeBytes.toLocaleString('en-US')} B vs ${CEILING_BYTES.toLocaleString('en-US')} B), ` +
            `which is more than the ${SLACK_BYTES.toLocaleString('en-US')} B of slack this ratchet allows.`,
          '',
          'That means a trim landed and the ceiling was left where it was — so the space',
          'you just freed has become a budget for the next few sessions to grow back into.',
          'That is exactly how STATUS.md and docs/backlog.md each regrew past their',
          'starting size after being cut in half.',
          '',
          `THE REPAIR: set CEILING_BYTES to ${sizeBytes.toLocaleString('en-US')} in this same PR`,
          '(guards/claudeMdBudget.test.ts), and say in the PR body what you removed.',
          '',
          'This is the half that makes this a ratchet rather than a cap: the ceiling',
          'follows the file down, and never back up.',
        ].join('\n'),
      );
    }
    expect(underBy).toBeLessThanOrEqual(SLACK_BYTES);
  });
});

// ── The second ratchet: CLAUDE.md + `.claude/**/*.md` + MOVED_DOCS ───────────────

/** Every `.md` under `.claude/`, found by walking the REPOSITORY, never from a list. */
function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(rel));
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out.sort();
}

const dotClaude = walkMarkdown('.claude');
const totalFiles = [MANUAL, ...dotClaude, ...MOVED_DOCS];
const totalBytes = totalFiles.reduce((sum, f) => sum + fs.statSync(path.join(REPO_ROOT, f)).size, 0);

/**
 * The ceiling on the TOTAL, in bytes. Before CUL-1874 the same set weighed 475,109 B
 * (CLAUDE.md 136,073 + `.claude/**\/*.md` 323,482 + the runbook 15,554); after the
 * split it weighed 466,421 B, and 469,080 B once CUL-1873 (#1197, which grew `wrap.md`
 * before this ratchet existed) was merged in. That merged figure is the starting value.
 * Same ratchet discipline: lower it after a trim, never raise it.
 */
const TOTAL_CEILING_BYTES = 469_080;

/** Wider than the core's slack: the total spans ~40 files edited by many sessions. */
const TOTAL_SLACK_BYTES = 4_096;

describe('the always-read instruction set: byte ratchet (CUL-1874)', () => {
  // NON-VACUITY FLOOR. The walk is the thing that could silently measure nothing: a
  // wrong root or a dropped directory shrinks the total and the ceiling test passes.
  // So the expected members are named here as REPO facts, not taken from the walk.
  it('counts CLAUDE.md, the rule files, the commands, the skills, the agents and the moved docs', () => {
    for (const must of [
      '.claude/rules/ui.md',
      '.claude/commands/dispatch.md',
      '.claude/commands/wrap.md',
      '.claude/skills/backlog-groomer/SKILL.md',
      '.claude/agents/code-reviewer.md',
    ]) {
      expect(dotClaude).toContain(must);
    }
    for (const doc of MOVED_DOCS) expect(fs.existsSync(path.join(REPO_ROOT, doc))).toBe(true);
    // Far above any plausible core alone, so a walk that found nothing reds here.
    expect(totalBytes).toBeGreaterThan(sizeBytes + 200_000);
  });

  it(`totals at or under ${TOTAL_CEILING_BYTES.toLocaleString('en-US')} B`, () => {
    if (totalBytes > TOTAL_CEILING_BYTES) {
      throw new Error(
        [
          `CLAUDE.md + .claude/**/*.md + ${MOVED_DOCS.join(', ')} total ${totalBytes.toLocaleString('en-US')} B, ` +
            `${(totalBytes - TOTAL_CEILING_BYTES).toLocaleString('en-US')} B over ${TOTAL_CEILING_BYTES.toLocaleString('en-US')} B.`,
          '',
          'Moving text between CLAUDE.md and a rule, command or skill file does not change this',
          'total; only deleting does. Delete at least that much from any file in the set (the',
          'story behind a rule belongs in docs/engineering-lessons.md, which is not counted).',
          'DO NOT raise TOTAL_CEILING_BYTES to go green.',
        ].join('\n'),
      );
    }
    expect(totalBytes).toBeLessThanOrEqual(TOTAL_CEILING_BYTES);
  });

  it('has a total ceiling that still tracks the files (lower it after a trim)', () => {
    const under = TOTAL_CEILING_BYTES - totalBytes;
    if (under > TOTAL_SLACK_BYTES) {
      throw new Error(
        `The set is ${under.toLocaleString('en-US')} B below TOTAL_CEILING_BYTES. Set it to ` +
          `${totalBytes.toLocaleString('en-US')} in guards/claudeMdBudget.test.ts in this same PR.`,
      );
    }
    expect(under).toBeLessThanOrEqual(TOTAL_SLACK_BYTES);
  });
});

describe('the rule index (CUL-1874)', () => {
  const ruleFiles = fs
    .readdirSync(path.join(REPO_ROOT, RULES_DIR))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `${RULES_DIR}/${f}`)
    .sort();
  const manualText = manual.toString('utf8');
  const conventions = manualText.slice(
    manualText.indexOf('## Code Conventions'),
    manualText.indexOf('\n## ', manualText.indexOf('## Code Conventions') + 1),
  );
  const indexed = Array.from(new Set(conventions.match(/\.claude\/rules\/[a-z-]+\.md/g) ?? [])).sort();

  it('finds the rule files and the index (non-vacuity)', () => {
    expect(ruleFiles.length).toBeGreaterThanOrEqual(5);
    expect(conventions.length).toBeGreaterThan(500);
  });

  it('names every rule file in CLAUDE.md § Code Conventions, and only real ones', () => {
    expect(indexed).toEqual(ruleFiles);
  });

  it('scopes every rule file by paths, so none loads on every session', () => {
    for (const f of ruleFiles) {
      const head = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
      expect({ f, scoped: /^---\npaths:\n(\s+- "[^"]+"\n)+---\n/.test(head) }).toEqual({ f, scoped: true });
    }
  });
});
