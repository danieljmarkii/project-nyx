# After the visit: from a locked vet visit to a dispatchable project

**Date:** 2026-11-14
**One thing:** G3 L2 — A PR's title and body are instructions to Linear: every issue they name closes on merge, so the spec PR that named the build issue would have closed the build · check: pending

[CUL-2756](https://linear.app/projectnyx/issue/CUL-2756), PR-01 of *Vet visits: after the visit*. Shipped via #1531. DISCOVERY, interactive, PM present.

## What happened

The PM came back from a real vet visit unable to reach the screen where next steps are entered. The code confirmed it: a booking already logged as a visit redirects to the read-only visit (`app/vet-visits/after.tsx:218-226`), and *Edit* held five fields. Filed as CUL-2754.

Reading the live vet visits artifact turned up that round 6 (2026-09-17) had already drawn the fix, *Add to this visit*, inside a one-page redesign the PM ruled but nobody cut into build issues. Round 6 also lived only in the artifact, never in git. Both are now in the repo.

Mock round 7 drew the narrow fix on today's screens. The PM asked for a pet-persona review; Jordan and Sam ran isolated (`pm-feature-review`) and agreed the after-visit half is a one-shot form. Their two strongest claims were checked in code before anything was built on them: the iOS recheck wheel books on its first stop (already CUL-1150), and the reopened screen's chips would cover every active course, so *Keep* could claim a visit a course never came from. The rest became one review-round issue, CUL-2755. Round 8 drew the ranked list, with "Set a date books an appointment" shown side by side with the recommended "not booked yet".

The PM ruled all four recommendations (R1 to R4) and asked for a dispatchable project. *Vet visits: after the visit* has seven rows, build notes, `blocks` relations, a forecast of 7, and never-at-the-same-time rules against Vet instructions PR-04 and PR-05, which edit the same two files. "When to call the vet" was left out: it is already Vet instructions PR-04.

PR-01 wrote spec 1.6 (§4.4, R1 to R7, ACs 14 to 21, ⚠ markers on §4.1 and AC 7) and a build ready page, `docs/culprit-after-the-visit-mockups.html`. It is a separate page from the vet visits mock, because that page's six rounds on their own colour set cannot meet the contract; the old page is now the deliberation and points at the new one.

## What broke and how it was caught

- **The open PR would have closed the wrong issue.** #1531 was titled with CUL-2754, the reopen build. Merging the spec would have marked the build Done. PR-01 got its own issue (CUL-2756), the PR was retitled, and the attachment on CUL-2754 removed. Earlier commit messages still name CUL-2754: read it back after merge.
- **The contract lens failed the first build ready draft**: tags missing inside the state frames, no busy screen at 320pt, VoiceOver order for one frame only, three typed sizes. All fixed and republished.
- **Twice, chips rendered as a vertical stack** because a `.t span { display:block }` rule outranked the chip class. Caught on the render check both times.

## Residuals

- CUL-2755 keeps decisions 1 (the vet's words beside Home's eating signal, clinically gated) and 4 (does *Talked about it* quiet a Home concern), two cats on one trip, and three small fixes.
- Round 6's one-page redesign stays ruled and unscheduled (R4).
- PR-07 (a food change without a trial) may need a migration; its brief decides.
