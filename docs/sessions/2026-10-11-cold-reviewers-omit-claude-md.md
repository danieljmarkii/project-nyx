# The cold reviewers start cold: omitClaudeMd on three agents (CUL-1871, retro 4 PR-A)

**Date:** 2026-10-11
**One thing:** S1 L1 — A file the running program already read changes nothing until the program starts again · check: pending

Shipped via #1194. Retro 4's D6 (ruled A, 2026-10-11, CUL-1858), the first of the five PRs under CUL-1869. Plan-gated; the PM said go on the posted plan.

## What shipped

`vet-report-cold-read`, `pm-feature-review` and `adversarial-reviewer` now set `omitClaudeMd: true`, so they launch without the 135 KB manual (about 34K tokens a call). Each carries what it needs in its own file:

- **All three:** the two safety invariants, intake is not preference and n=1 never reassures.
- **The adversarial reviewer:**
  - P-16's LOUD and QUIET definitions;
  - the two-pass cap, written to stand on its own rather than deferring to "CLAUDE.md DoD".
- **The product walk-through:** the principles and Pets > $ in one paragraph.

Both of those agents also had `CLAUDE.md` on their reading lists, so they would have `Read` it back in by hand. Those references are gone. `code-reviewer`, `rls-privacy-reviewer` and `pm-coach` are untouched.

**Decision (team call, logged here and in the PR):** the issue said "the seven principles". The principles doc is at v2.0 with nine, so the paragraph names nine and the agent's description line now says nine.

## Verification, and what nearly misled it

The installed Claude Code is v2.1.296; the field needs v2.1.271 or later. The binary describes it as dropping the user, project and local CLAUDE.md "when it runs as a subagent". The built-in Explore and Plan agents set it themselves.

**The first runs looked like a failure.** Each agent, asked from context alone, reported CLAUDE.md present and quoted its Version line. The cause: agent definitions load when a session starts, and this session started before the edit. A fresh `claude -p` process, which reads the files from disk, gave the true result:
- all three edited agents report no CLAUDE.md and quote their carried invariants;
- `code-reviewer`, the control, still has it.

The lesson for anyone verifying an agent edit: test it in a new process, never in the session that made the change.

## The full review runs found real things

Each agent was run once on a known input:
- the adversarial reviewer on `lib/lookWithheld.ts`;
- the product walk-through on the withheld look entry and the emergency sheet;
- the cold read on `docs/vet-report-mock-cat.html`.

Each named both invariants in its verdict.

- **Adversarial: one QUIET break, filed as CUL-1879 on the PM queue.** A cat that refuses three meals and then gets no more logged meals drops out of the withheld state about 60 hours later. The arm reads only meals from the last 3 days and then needs 2 of the newest 3 refused. The emergency door shares the arm, so it goes calm at the same moment. The mechanism was checked against the code; the clinical weight is the PM's call.
- **Product walk-through: SHIP-SHAPED.** The legibility finding (the withheld state's reason line speaks the app's vocabulary and reads as a footnote) is already CUL-910, so nothing new was filed.
- **Cold read: NOT READY on the cat mock.**
  - the vomiting counts disagree with each other;
  - the intake anchor contradicts its own log row;
  - the per-photo "blood none" lines break §5.9's present-only rule and the n=1 rule.

  The mock is a design artifact, not the production report, so nothing was filed. Whether `generate-report` renders the same negative fields is the open check, noted on CUL-1871.

## Residuals

- The three agents now carry their own copy of the invariants. If the invariants are ever reworded in `docs/personas.md` or CLAUDE.md, these copies will drift. CUL-1874 (D5, the CLAUDE.md split) is where a single source for them would land.
