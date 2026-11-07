# Session: Backlog grooming (Linear, team Culprit), 2026-11-07

**Date:** 2026-11-07
**Mode:** DISCOVERY (Product Owner / Backlog Steward lens), attended: the PM asked for the pass
**Outcome:** shipped via #1474 (this record, plus the 10-25 pass's record and its two research briefs, folded in from #1332 under G1; the pass's writes are in Linear)
**Branch:** `claude/compassionate-hawking-0lifiz`
**Report:** the standing grooming issue [CUL-1962](https://linear.app/projectnyx/issue/CUL-1962), comment of 2026-11-07. It holds the full report and the PM's four open calls (G1 to G4).
**Predecessor:** the 2026-10-25 pass. Its record PR (#1332) was still an unmerged draft; under G1 this PR carries its commit, so #1332 closes once this merges.

---

## What ran

Steps 0 to 4, 9 (the Legacy Backlog check), 11, 12 (the queue count and lane read), 14, 15 and 17 of the `backlog-groomer` procedure, over the window since 2026-10-25 23:00 UTC (139 commits on `origin/main`, 172 `CUL` ids). Not run, and said so in the report: steps 6, 7, 10, 16 and 18.

## Applied (every write carries its artifact)

- CUL-2234 and CUL-1851: In Progress → Todo. Abandoned claims; both claim branches are deleted from origin and neither ever had a PR.
- CUL-2248: `Waiting on PM` stripped (completed).
- CUL-310 and CUL-1079: Canceled after their 7-day veto windows, no later comment.

## What the pass found

- **Status drift is still zero.** Every merged id still open is a mention, not a fix. The claim protocol and `/wrap` step 4 keep holding.
- **The drift has moved to volume.** About 445 issues were filed in 13 days, ≈140 of them Low findings parked in Vet report v2's backlog. With 241 closed, the board still grew by roughly 200.
- **The PM queue grew 56 → 71** (cap 30). Most of the new items are vet report v2 clinical rulings the project's dispatcher is working daily; 23 older items have sat untouched since the 10-16 bulk pass, five of them safety or App Store risks.
- **A grooming record never landed.** #1332 (10-25) is still a draft, so two research briefs its rulings call saved are not on `main`.
- **`STATUS.md`'s live-tracks table is behind Linear**: it omits *Every iPhone*, *Design system · colour fills and links*, *Design system · one kit* and *Mixed meals*, and lists tracks no longer in progress. Left for the next track-start edit rather than rewritten here.

## PM rulings, same session: G1 to G4 as recommended

- **G1 (a).** #1332's commit is merged into this branch (clean, guards green), because the steward gate lets a session merge only its own PR. #1332 closes when this lands.
- **G2 (a).** Vet report v2's parked pile gets one sitting at the project's go-live, run by its dispatcher (noted on its index issue).
- **G3 (a).** CUL-1930, CUL-588, CUL-582, CUL-1915 and CUL-1879 lead the next docket; the next pass posts defaults on the low-risk rest of the 21-day pile.
- **G4 (a).** CUL-2194 closed Done; CUL-1152 narrowed to deleting the Codespace secret.

## Next

The next pass runs the steps this one skipped (6, 7, 10, 16, 18) and posts the G3 defaults.
