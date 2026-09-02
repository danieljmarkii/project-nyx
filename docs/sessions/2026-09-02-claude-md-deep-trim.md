# CLAUDE.md deep trim — the rules stay, the stories move

**Date:** 2026-09-02
**Shipped via:** #793 (CUL-407, B-388) — the follow-up PR from the same session as #792.

## What this was

The quick-wins batch's token post-mortem named the per-turn baseline as the largest single cost of every session: CLAUDE.md is re-sent on every turn and had reached **235 KB** (the issue's own "27,000 words" was already stale). The PM signed off on the trim in-session. The shape: **every convention keeps its rule and its enforcement** (the guard, the marker, the file) in one to five lines and points at a new **`docs/engineering-lessons.md`**, where the full text moved **verbatim** under a numbered heading (§C-n conventions, §R-n Read-These rows, §P-n protocol notes). Nothing was rewritten on the way in and nothing was discarded.

## What moved, by the numbers

| Section | Before | After |
|---|---|---|
| Code Conventions | 104 KB, 43 bullets | 26 KB; 29 bullets compacted to rule + pointer, 14 short ones untouched |
| Read These table | 34 KB | 17 KB; 12 rows compacted (the taxonomy and diet-trial rows alone were 14 KB) |
| Open Questions | 27 KB | 14 KB; 5 resolved rows → `docs/decisions-archive.md`; B-156 and B-182 reduced to their one open residual, history archived |
| Session Protocol + Git Workflow | 27 KB | 22 KB; the claim ritual keeps its steps and loses its measurements; CI narrative, runtime and deploy quick references trimmed to the runbooks they duplicate |
| Secrets Register | fat Notes cells (Resend, access token) | essentials only |
| Whole file | **235 KB** | **117 KB (51% cut)** |

`docs/engineering-lessons.md` is 144 KB and is read only when a pointer sends a session there. `docs/CLAUDE-md-history.md` gained v1.26; the Version History keeps v1.27–v1.29.

## Decisions

- **Where the line sits.** A convention's *rule* and its *enforcement* are Tier-1 content; its *story* is not. Written into Tier 1 of the Documentation Update Protocol so the file does not regrow the same way: a new lesson on an existing rule goes in the lessons file, CLAUDE.md gets the pointer.
- **Verbatim, not condensed.** Same rule the 2026-07-25 decisions-archive move set: the archive is the record, and a summary of a lesson written by someone who knows what it means is exactly the kind of loss nobody notices until the edge case returns.
- **Open rows stay open.** Only rows whose status cell begins "Resolved" moved; B-156 and B-182 keep a short open row naming the single residual (promotion; the D2 6-vs-5 ratification).
- **Not touched, deliberately:** the persona roster, the seven principles, the hard constraints, the DoD, the Backlog Protocol, the short conventions, and the 18 Read-These rows already under 1 KB. A further cut would remove rules rather than stories, and that was not the ask.

## Verification

Pointer counts match heading counts (29 C, 12 R, 13 P); every pointer's number resolves to the heading whose title matches the bullet it replaced; a mid-body probe of every moved entry is found verbatim in `origin/main`'s CLAUDE.md. Docs only: no code, no tests, no schema.

## Process note

This is the second PR from one session, allowed by the wrap rule's one exception (the session's work PR, #792, was already merged when this work started). Filed against the pre-existing CUL-407 rather than a new issue.
