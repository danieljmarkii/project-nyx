# Clinical voice row 3: the server copy matches the phone under the ruled floor

**Date:** 2026-11-08
**One thing:** G3 L1 — A squash merge writes a new commit, so a branch built on the old ones meets its own lines as conflicts · check: pending

Shipped via #1488, finishing CUL-2668 (row 3 of Clinical voice: the owner decides). A dispatched BUILD row, plan-gated, with `Teach: yes`. The PR body is the record of the change; this file holds the teach block.

## What happened

- **Plan, then build.** The plan was posted on CUL-2668. The PM's `go` was typed in the session.
- **The work.** The server sentences now say what the phone says:
  - the Signal's card sentences (`generate-signal/phrasing.ts`);
  - Ask's read words and rules 4 and 11;
  - the stored read text in analyze-vomit and analyze-stool.

  The two expiring exceptions row 2 left behind are deleted: the floor-literal guard's exemption and the Home parity pairs.
- **The stack dissolved mid-session.** PR-02 (#1485) had already merged before this session started, so the PR opened against `main`. Bringing `main` in conflicted in five files, because PR-02 was squash-merged (see Teach). Main's copy of each conflicted file was byte-identical to PR-02's head, so each resolved to this branch's version.
- **Adversarial pass 1 failed, with three QUIET breaks, all new in this diff:**
  - Ask softened a cat's floor read, because it has no live meal check.
  - A blood photo beside a repeat-vomit count stored the deferential count sentence.
  - An EN-7 stool read over a blood photo stored a deferential line that never mentioned the blood.

  All three were fixed louder and proven by mutation. Pass 2 passed. The pre-existing gaps it found were filed (CUL-2682) or added to existing class issues (CUL-2678, CUL-2680).

## Teach

### One thing — A squash merge writes a new commit (G3, L1)
A PR is a proposal to move `main` forward. A squash merge accepts it by writing **one brand-new commit** onto `main` that holds all the changes, and it throws the proposal's own commits away. Git keys history by commit identity, not content. So a second branch built on top of those thrown-away commits still carries them, and git sees two different histories that say the same thing.

**Like:** two people copy the same paragraph into a shared document, one by retyping it and one by pasting it. The words match, but the editor only knows two people changed the same lines, so it asks which version to keep.

**In today's work:** `git log` on the two branches
```
4e007ec Clinical voice PR-02 … (#1485)      ← main: the squash, one new commit
5e75f94 Clinical voice row 2: …             ← this branch: PR-02's original last commit
```
Same changes, different commits. Merging `main` in, git reported conflicts in five files that held identical text on both sides. The check that settled it: each of those files on `main` was byte for byte PR-02's head, so keeping this branch's version lost nothing.

**Why it matters to you as PM:** when you `go` a stacked row, its merge from `main` after the first PR lands will show conflicts that are not real disagreements. They cost a resolution step, which is why the steward rules prefer waiting over stacking.

**Check:** If PR-02 had been merged with a plain merge commit instead of a squash, would this branch still have hit those five conflicts? Why?

## Residuals

- **LOUD:** Ask can't see owner edits or live meals, so it can name the floor where the record says "Worth a call today". Call-only Signal cards keep the floor.
- **Merge gate:** after the App Store 1.2.0 cut. Four functions deploy on merge, so the merge is the PM's.
