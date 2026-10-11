# The second clinical ruling sheet, and a staleness pass over the PM queue

**Date:** 2026-10-11
**One thing:** P3 L1 — Sequencing: the sheet puts first the rulings that free the most work · check: pending
**One thing (re-ask):** D3 L1 — Reading a test: it proves only the cases it builds (from 2026-10-10, PR-08) · check: pending

Shipped via #1177. Docs only: `docs/clinical-ruling-sheet-2026-10-b.md` and its phone page `docs/clinical-ruling-sheet-b.html`, published as a private Artifact at https://claude.ai/artifact/Jp6B9qsQBvoEkpaLcGDALT.

## The staleness pass (no PR)

The session opened as a `backlog-groomer` staleness pass over every open `Waiting on PM` issue, report only. Each issue was read in full and checked against `main` at file:line, against related issues, and against later rulings. It was then sorted into STALE, REFRAME, MERGE, LIVE or NOT MINE. On the PM's word, the stale, merge and team-call buckets were applied, each with a signed comment. The label then came off eight issues that were already closed. That left 82 open issues on the label, 38 of them clinical rows in the LIVE or REFRAME buckets. The report's path to the cap of 30 was one ruling sheet for those 38, one device sitting per build, and six 72-hour defaults.

## The sheet

The 38 clinical rows became Q1 to Q38 in the first sheet's shape (CUL-583). Every row carries:
- the question
- today's behaviour at file:line, checked at `5fb9cd3a`
- a recommendation
- the counterexample tried against it
- the direction versus today
- the verdict E-6 gives that direction

The rows sit in five parts ordered by what each ruling frees, with Part A (the build gates) first.

Two facts shaped the sheet:
- **The real-vet review is canceled (CUL-1312).** Rows that would have gone to it now come to the PM marked **No source**, so nothing waits on a vet.
- **Four rows are persona conflicts** (Q18, Q19, Q22's ordering, Q38) and carry no recommendation.

## Two adversarial passes, the cap

Three isolated reviewers read the first draft, one per part. **They found 16 blocking breaks, ten of them a quieter change labelled louder, neutral or safer**, the one class E-6 exists to stop. The sharpest:

| Row | What the draft got wrong |
|---|---|
| Q2 (a) | Narrowed only the 5% re-raise line, so a care state that never re-raises its concern would pass it while the burden card propped up the paired doubling line. |
| Q3.1 | The recommendation rested on a false counterexample: a mistyped weight fires through the 0.6 kg rule either way. |
| Q4 W4 | Removing the Patterns percentage hides the 7% that is the only cue a 20 g loss in a 300 g kitten is serious. |
| Q13.2 | Withholding the stood-down line would have removed its visit ask and its "That isn't an all-clear". |
| Q24 | A co-fed pair under EN-11 is withheld forever, not delayed, and E2's 56-day proof cannot tell the two apart. |
| Q36 | Ask's trial tool returns "complete" for a trial 356 days past its window. |

Every break was rewritten.

A second pass over the rewrite found 12 more, 11 of them quieter. The weight lane carried most of them. Vet-scale readings first exist with PR-37, and the predicate's mixed-scale margin, run on scratch copies of `lib/weightStory.ts`, quietened a card on every vet-scale path. A vet reading added after a home-raised soft card removed it, and a vet-to-vet 10% loss vanished under one home reading. W7 now carries the condition that no vet-scale reading, added or relabelled, lowers a row. The other quieter findings, and their fixes:
- **Q14:** excluding "stuck" rows would have left a 24-hour calm cache over a vomit logged during a long offline stretch. It now excludes only rows the server refused.
- **Q13.3:** would have put a withheld fall back on the script read aloud. The not-eating fact is now its own script row.
- **Q26:** a duck kibble listing chicken fat still sanctioned chicken. Every protein on the label must now match.
- **Q34:** an indication reading "her daily pill" counted as not critical. The default now flips to critical.
- **Q36:** the option letters collided. The recommendation is now A.
- **Q3.2:** reverted to the built anchor, because every alternative was quieter.

The project caps adversarial passes at two per PR, so §6.2 states what stands. Every residual either errs loud or sits on one of the eleven cards the PM picks personally:
- **Sign-off:** Q9.
- **Explicit agree:** Q7, Q13 row 5, Q16 row 2, Q24, Q26, Q30.
- **Conflicts:** Q18, Q19, Q22 (the ordering), Q38.

The pattern the passes showed: a recommendation that reads as a tidy-up is the one most likely to be quieter than it looks. Most of the quieter findings were changes meant as a fix or a cleanup: removing a percentage, withholding a line, narrowing an exclusion, adding a vet's reading.

## The phone page

`docs/clinical-ruling-sheet-b.html` mirrors the first sheet's pages: one tap-to-rule card per row, rulings copied out as text, and picks kept on the device. Multi-part rows whose parts carry different verdicts are split into their own cards, so a sign-off cannot hide inside an agree. "Agree to every open default" skips the cards that need the PM's own pick. It was republished to the same address after each pass.

## The CI failure

`App (typecheck + jest)` went red on the docs-only head at 00:04 UTC. The failure was `components/event/IntakeQuestion.test.tsx:67`:
- The test seeds the vomit one hour before the real clock, so the question reaches back 25 hours.
- Between 00:00 and 01:00 local, that lands two days back, and the heading names a weekday instead of "yesterday".
- Reproduced on `main`'s code under `TZ=UTC` at 00:04: "since 11 PM Friday".

No fix existed, so per the drive-to-green rules the PR got one comment with the cause and a proposed patch (pin the suite's clock), and one re-run after 01:00 UTC, which passed. Filed as CUL-1793.

## Filed

- CUL-1795: rule the sheet (`Waiting on PM`, the session's one PM action; it blocks PR-31, PR-33 and CUL-1173).
- CUL-1791: the Signal card's weekly line has the month's onset blind spot.
- CUL-1792: the cross-pet banner drops a second safety finding without a word.
- CUL-1793: the clock-dependent intake test.

CUL-1528 (the Engines v3 holds index) got a comment pointing its E-4, W3 to W7 and drug-list holds at the sheet.

## Not done

- No ruling was made. The 38 issues keep their `Waiting on PM` label until CUL-1795 is ruled.
- Recording each ruling on its issue and taking the label off is the next session's work.
- Two stale repo lines noticed during the staleness pass are still unfixed:
  - CLAUDE.md's Open Questions row for B-182 D2.
  - `docs/dev-handoff-runbook.md:24`'s installed-build line, which predates `app.json`'s 1.2.0. Q9's OTA option depends on it.
