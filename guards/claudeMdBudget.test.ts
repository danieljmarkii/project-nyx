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
//                   this guard exists to close, and it is the same discipline C-26
//                   states for the deploy ledger ("move the code — never bump the
//                   ledger").
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
// SCOPE BOUNDARY (stated, because an undocumented blind spot reads as coverage):
// this guards SIZE, not VALUE. It cannot tell a session that deleted the wrong 3 KB
// from one that deleted the right 3 KB, and it has nothing to say about `docs/`,
// `.claude/`, or `STATUS.md` — a rule moved out of CLAUDE.md into a file a session
// still reads has not reduced what that session loads. It closes one measured failure
// mode: this file silently regrowing between trims.

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');
const MANUAL = 'CLAUDE.md';

/**
 * The ceiling, in BYTES on disk (what `wc -c CLAUDE.md` reports) — not characters.
 * CLAUDE.md is dense with multi-byte UTF-8 (— § ✓ ⚠ …), so the two differ: measured
 * 2026-09-12, 136,929 B against 135,750 characters, a gap of 1,179 B.
 *
 * Set 2026-09-12 (CUL-920) to the size of the file once § Version History (14,662 B)
 * and § Build Sequence (2,770 B) were deleted and the pointers they dangled were
 * repaired — 153,050 B down to this. It is a RATCHET: lower it whenever a trim
 * lands, and never raise it.
 */
const CEILING_BYTES = 136_929;

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
  // loosens the real limit by 1,179 B, and BOTH verdict tests below stay GREEN —
  // 1,179 B is inside SLACK_BYTES, so the ratchet's own lower half cannot see it
  // either. Without this test the unit could change and nothing would say so.
  it('measures the real CLAUDE.md, in bytes', () => {
    expect(fs.existsSync(manualPath)).toBe(true);

    // The manual, not an empty or truncated read. Any plausible CLAUDE.md is far
    // above this; a wrong path or a zero-length read is far below it.
    expect(sizeBytes).toBeGreaterThan(50_000);

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
