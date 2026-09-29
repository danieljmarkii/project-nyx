# Dispatch v1.1 and one sub-issue per PR: merges stop closing unfinished work

**Date:** 2026-09-29 · **Issues:** CUL-1397, CUL-1409 · shipped via #PR_NUMBER

## What happened

The session opened with `/dispatch Engines v3`, which reported zero ready rows with three free slots. The PM asked to unblock the project, then to reflect on why dispatch felt fast but rough, then to build the fixes.

**Unblocking Engines v3 (Linear only, no code).** Five rows could start, but the run order had never given them a row. So I added four rows (PR-14d the burden card, PR-21a CUL-1384, PR-22a CUL-1099, PR-27a CUL-827) and renamed CUL-1195 as PR-14e. I moved CUL-583 off CUL-1135 onto PR-19's go-live, where the page said it belonged, and rewrote every stale status cell, wave header, the summary, *Where it stands* and *Start now*. Two issues had been closed by a merge while still unfinished: I reopened CUL-1408 (closed by #980) and CUL-1130 (closed by #979 with PR-13b unbuilt). I also removed three stale PR attachments.

**The reflection.** Dispatch's core works: 5 of 5 dispatched PRs merged in about 17 hours, with no collisions. The friction was around it, ranked by cost:
1. Merges closed the wrong issues (CUL-1267 twice, CUL-1311, CUL-1408, CUL-1130, CUL-1099).
2. The page went stale after every run, because only ✓ marks were dispatch's to write.
3. Held rows were dead ends.
4. Nothing started the next wave.

## What shipped (this PR)

- **CLAUDE.md § Merge → Linear status** states the measured rule: every `CUL-NNN` a PR names closes on merge, and deleting the attachment does not stop it (CUL-973). A PR names only what it finishes, a multi-PR task gets one sub-issue per PR, and whoever closes the last sub-issue closes the parent. The file shrank 617 B, and `CEILING_BYTES` followed it down to 136,093.
- **`/wrap` step 4** follows the rule and adds the read-back after merge. The groomer's wording is corrected to match.
- **`/dispatch` v1.1:**
  - Step 0 reopens an issue a merge closed while its rows are unmerged, and surfaces any other issue closed outside its row.
  - The step-5 prompt names only the row's sub-issue and has the child read back after its merge.
  - Step 7 creates a missing sub-issue.
  - New step 8 writes the page's derived state every run (PM ruling a).
  - A standing yes launches critical-path BUILD rows with no migration, no privileged verb and no new owner-facing words (PM ruling b).
- **Engines v3 migration (Linear):** 15 sub-issues (CUL-1410 to CUL-1424), one for every unmerged row whose issue spans several rows. Bundle rows get one per parent. The page's Issue cells and the PR-21 and PR-31 bundle prompts name them.

## Decisions

- **PM ruling (a), 2026-09-29:** dispatch owns the page's derived fields. Hand-written sections stay the PM's.
- **PM ruling (b), 2026-09-29:** a standing yes for low-risk rows. It lives in the skill file, never on a page, so turning it off takes a PR.
- **Parent auto-close:** the Linear API does not expose the team setting, so the fallback is always on: whoever closes a parent's last sub-issue closes the parent.

## Residuals

- Holds on non-PR gates are still dead ends (reflection item 4), and merges still don't wake the dispatcher (item 5). Neither was in scope.
- The standing yes's "no new words" test reads text markers, so a row that adds copy without saying so could launch without a separate yes. This is stated in the skill's blind spots.
- I first told PR-14d to "remove the attachment before merge", which CUL-973 had already refuted. It was corrected the same session and superseded by the sub-issue.

## Persona sign-off

Product Owner ✓ (the board matches reality, and every change has a comment) · Dir. Eng ✓ (the byte ratchet passes with a lowered ceiling; the pre-push typecheck and suite passed) · Designer N/A · Data N/A · Dr. Chen N/A · Trust & Safety N/A (no access-control surface).
