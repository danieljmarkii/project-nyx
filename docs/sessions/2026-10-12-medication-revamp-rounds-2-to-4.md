# Medication revamp, rounds 2 to 4: a home for the course (CUL-1698)

**Date:** 2026-10-12
**One thing (re-ask):** G1 L1 — A commit is a saved snapshot (asked again: this PR's five commits become one on `main` when it squash merges; is anything lost from the branch's own history?) · check: pending
**One thing:** G2 L1 — A branch is a movable label (the push slid this branch's label from round 3's commit to the commit that merged `main` in, while `main`'s own label had moved 73 commits on its own) · check: pending

DISCOVERY session on [CUL-1698](https://linear.app/projectnyx/issue/CUL-1698), run Oct 9 to 12 as one conversation. No app code, no Edge Function code, no schema. Shipped via #1137, which names only CUL-1698. The decisions still open are filed as one review round, [CUL-1902](https://linear.app/projectnyx/issue/CUL-1902) (Waiting on PM).

## The ask

The medication revamp, plus the PM's question of whether Foods should widen into one library for food, medicine and supplements. The PM set the method: convene the personas, publish mock round 2 as one proposal over round 1's link, then take reactions. The PM added an adversarial critique between rounds 2 and 3, and on Oct 12 gave 14 reactions to round 3.

## What happened, in order

1. **Step 1 (Oct 9).** Five isolated persona reads, synthesised and posted to the issue.
2. **Round 2 (Oct 9).** Medicine lives with the pet. The placement and naming evidence is frozen as `docs/research/2026-10-medicine-placement-and-naming.md`. At the PM's request, one owner-scoped production correction: Nyx's course and medicine entry went from prednisone 10 mg to prednisolone 5 mg, and from 10 days to 15 doses. Each update was guarded on the old value and read back after.
3. **The critique (Oct 10).** Five lenses read round 2's renders alone, and a verifier tried to refute each finding: 50 found, 48 confirmed. Frozen as `docs/medication-revamp-round2-critique-2026-10.md`.
4. **Round 3 (Oct 10).** The confirmed fixes were drawn, from one written record with every count computed. An adversarial reviewer broke the first draft of the taper and concern rules with real records, and they were rewritten.
5. **The PM's reactions (Oct 12).** Fourteen, recorded on the issue.
6. **Round 4 (Oct 12).** Published over the same link (https://claude.ai/artifact/4wb5JyHeiH8RXvbUBFqJ35), with a ledger mapping each reaction to its section.

## Round 4: how it was made

- **Latest main, mapped.** An Explore pass over `origin/main` found every beta GA except the widget, and the exact shipped Home, trial ledger, History strip, Pet tab, fan, dose card, Foods and notification settings. Two round 3 claims did not survive it. The pill icon's real homes are the log sheet tile, the Patterns day sheet, the Daily Recap strip and the after-visit plan; History rows and the fan carry no icon at all. And Foods is the third tab, not the fourth.
- **A blind check of where the list lives.** Three judges ranked four images alone, with no attribution and no recommendation. Both owners ranked the pet's tab first; the designer ranked it last. All three said a fourth placement, described afterwards, beats their own first pick: one *Medicines at home* list with two doors. That is now L1's recommendation, and the PM's library becomes the option box.
- **Dr. Chen, consulted** on tapers, reminders, the halfway note, "is it working", medicine with no end date, the report's order and the marks.
- **The PM's record, read** owner-scoped (C-27), read-only:
  - logged-day coverage, America/Chicago: nothing on Sep 20, every other day Sep 1 to Oct 12;
  - cough and vomit days;
  - the latest weight, 3.73 kg on Sep 16;
  - the prednisolone vehicles: two rabbit foods, both on the trial list;
  - course and dose notes: none;
  - the ear drops' days.
- **Two cold reads of the report page** by `vet-report-cold-read`, which sees only the rendered page. Both said NOT READY:
  - **Read 1** found that "some of it" never said some of what, the ear drops given during the steroid course were buried under "ended", and doses and signs sat on different axes.
  - **Read 2**, on the fixed draft, found the status line ambiguous, the ear drops reading as a current prescription, an absence claimed, every grey lost on a fax, and before and during counts beside a drug reading as "it worked".
  - Draft 3 answers both reads. Under the two-pass cap (PM, 2026-10-10) it ships unread, its residuals stated.

## What round 4 draws

- **The course screen answers the PM's two questions.**
  - *The plan* is the label's steps with amounts, the last dose and the next one planned.
  - *What you're watching* counts the sign the course was for before and during, beside the days logged, and never prints a zero while the drug could hide the sign.
  - No Log button, as ruled.
- **The marks are the trial screen's as shipped.** Filled means logged, and the tone is how much went in. An outline means nothing was logged. No dots, and no half fill on screen; on paper, "part" is a half-filled dot because a fax drops grey.
- **Reminders**, around the double-dose hazard.
- **One list, two doors**, and a page per medicine that keeps each box's label.
- **One glyph per medicine form.**
- **Tapers of amount**, with the strength on the box.
- **Medicine with no end date:** today's plan, four weeks that add up, a refill heads-up.
- **The halfway note** beside Dr. Chen's day-before note and leftover question.
- **The vet report's medication page**, draft 3.

## Decisions

- **Ruled by the PM on Oct 12:**
  - L3: a button per running course, capped. The cap of two is the team's call, open to veto.
  - L4: the course screen does not log.
  - GC-5: option A.
  - D3: the ledger stays beside the end question.
  - D8: the marks.
- **Team call, logged on the issue:** D6. Round 3's per-medicine faces retire for one glyph per form.
- **Open, in [CUL-1902](https://linear.app/projectnyx/issue/CUL-1902):** L1, G4, the lock-screen name (a persona conflict), halfway or the day before, "is it working" (a persona conflict), D10, D5 (a persona conflict), the report page as a milestone, D1. Carried from round 3: L2, L3b, L5, L6, D2, D4.

## What broke, and how it was fixed

- **The PR conflicted with `main`.** Both sides had added rows to `docs/research/README.md`. Main was merged in, every row was kept in date order, and `scripts/steward/merge-check.sh` reported CLEAN.
- **Round 3 called Foods the fourth tab.** The blind judges caught it.
- **Round 3 placed the pill icon where it does not ship.** The main map caught it.
- **The library frame hid its own subject under the tab bar.** Caught in the render pass.
- **Long brief tags pushed the page 4px wide at 390pt.** Fixed.
- **The course screen's caveat "signs ease after the worst day" read as a verdict when no peak was visible** (cold read 2). It is now neutral: counts can differ for reasons other than a medicine.

## Found and filed

- [CUL-1890](https://linear.app/projectnyx/issue/CUL-1890) · Todo. Calendars draw a day with nothing logged three ways; this is the PM's outline direction, applied app-wide. History's strip uses the outline for a day to come, so this needs its own mock round.
- [CUL-1892](https://linear.app/projectnyx/issue/CUL-1892) · Backlog, LOUD. The masking table knows no antihistamine, so Schrödinger's open Zyrtec course withholds every zero on her Signal.
- [CUL-359](https://linear.app/projectnyx/issue/CUL-359) now points at this track for reminders.
- Still open from round 3: [CUL-1781](https://linear.app/projectnyx/issue/CUL-1781).

## Residuals

- **The report page, draft 3, is not read again.** Open for its milestone:
  - a running patient header with signalment and page numbers;
  - dose times beside the signs;
  - intake at meals with no tablet, to tell a disliked tablet from a poor appetite;
  - a rule for which signs get a row.
- **The "is it working" design needs an adversarial pass before any build**, whichever way the persona conflict is ruled.
- **The medication event glyph is busy at 14 to 16pt.** [CUL-493](https://linear.app/projectnyx/issue/CUL-493)'s pass draws the final weights.
- **The round 4 briefs carry no Forecast line** (rule added Oct 11). The forecasts are in CUL-1902 instead.
- **`STATUS.md` still lists the four graduating betas as next, though all four shipped.** That belongs to the Out of beta track and is left for its session.
