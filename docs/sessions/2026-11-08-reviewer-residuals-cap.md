# Reviewer agents: blocking findings in full, one capped residuals list

**Date:** 2026-11-08
**One thing:** D4 L2 — A guard can hold prose, not only code: four sentences in four agent files now fail the build if a trim deletes them · check: pending

Shipped via #1482, finishing CUL-2657 (row 2 of the W-F throughput parent, CUL-2655).

## What happened

Row 1 (CUL-2656, #1480) wrote the filing rule into CLAUDE.md: fix small finds in the PR, file the rest as one class issue. Row 2 caps the reviewer agents that were producing most of those finds. The vet report v2 cold reads and adversarial passes each filed more than the fix they reviewed.

Each of the four reviewers (adversarial-reviewer, vet-report-cold-read, pm-feature-review, rls-privacy-reviewer) now carries a `## Blocking findings and residuals` section, plus a `### Residuals (max 5)` block in its output:

- **Blocking, in full:** anything that can drop, soften or delay a warning, reassure on absence, or expose, corrupt or lose data, plus anything the agent's verdict fails on.
- **Residuals, capped:** everything else, grouped into at most 5 lines with the file and a one-line fix shape. The calling session applies the filing rule, which keeps the only definition of "small"; the agents point at it rather than copy it.

Per agent: adversarial-reviewer maps QUIET to blocking and LOUD to residuals and keeps the two-pass cap word for word. pm-feature-review loses its "Backlog candidates (ready for Linear)" bucket, which was a one-issue-per-finding generator. In vet-report-cold-read and pm-feature-review, the existing finding sections now hold blocking findings only; a separate Blocking block beside uncapped buckets would have capped nothing.

## The ruling

The issue's blocking definition did not cover findings that already fail a verdict today: the vet report's "pet brand register fails Principle 6 outright" and pm-feature-review's NEEDS-WORK reasons. The PM ruled option 1: those stay blocking, so no review bar moved and only the long tail is capped. Option 2 would have quietly lowered the vet report's bar.

## The byte ratchet

The always-read total (CUL-1874) had 17 B of headroom. The first draft came in 1,904 B over. The additions were paid for inside the same four files: the n=1 and feline rules restated in the adversarial failure-mode list, the LOUD/QUIET definitions repeated in its verdict line, and "isolated context" restated in descriptions and bodies. It finished at 469,024 B against a 469,080 B ceiling; no ceiling moved.

## The guard

`guards/reviewerFindings.test.ts` checks each file for every phrase of the split, the cap, the filing-rule pointer, the residuals heading and where the blocking half lands, that no file restates "small", and that every `docs/` path an agent names exists. Mutation proof runs on in-memory copies of the real files. It was also proven against the real tree: changing "at most 5 lines" in the real `pm-feature-review.md` turned three tests red, and restoring it turned them green.

## Along the way

`rls-privacy-reviewer.md` sent the agent to "the Secrets Register in `CLAUDE.md`", which now only points onward. It names `docs/secrets-register.md` directly, covered by the docs-path check.

## Residuals

- The 5-line cap is the team's reading of "a few lines". The PM can move it with one edit per file plus the guard's phrase.
- code-reviewer and pm-coach are out of scope and unchanged.
