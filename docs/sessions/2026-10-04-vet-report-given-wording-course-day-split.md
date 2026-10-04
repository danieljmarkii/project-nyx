# Vet report: "given", never "logged", and one split of a course's days (CUL-1550)

**Date:** 2026-10-04
**One thing:** D4 L1 — Guards: a test is only proven when breaking the code makes it fail · check: pending

Shipped via #1039 (draft; CUL-1550, the vet-report half of CUL-1209's ruling 2(a)).

## What shipped

- **The ruled words.** Both medication tables (the lifetime "Medication history" table and Appendix D) head their count column **Doses given (incl. partial)**, and Appendix D's day phrase reads **Given on N of M days** instead of "Logged on". History uses "logged" for every dose row; the report counts given + partial, so the old word let the phone and the paper say "logged" over different numbers for one drug. Both columns widen to 118px so the header sits on two lines, not four.
- **The course-day split (PM ruling (a′), this session).** Page 1's medication line and Appendix D both state a course's days in the window as ONE partition of THIS course's rows, by precedence: given, *a dose logged but not as given*, *no dose logged against this course* — `partitionCourseDays` in `report.ts`, phrased by one set of helpers in `render.ts`. Zero parts are omitted; with nothing given the head is course-scoped too; below once a day the empty part names the schedule ("on an every-other-day schedule"); a dose of the course dated outside its dates is disclosed by kind and side with its dates and year; page 1's given count names its partial and out-of-course doses as subsets of the whole.
- **Spec** `docs/nyx-vet-report-requirements.md` §3 (lifetime table + Appendix D) and the status header, per the ruling.
- **Tests:** a property test over the partition (integer-safe generator, behavioural properties, coverage floor), fixtures for every seam the reviews broke, and a mutation sweep each round (~45 mutants across the session, all killed or proven equivalent).

## How it got there

The ruled two strings were built first. The owed `vet-report-cold-read` returned NOT READY on "Given on 12 of 46 days": with the remainder unstated it read as 26% adherence when 31 of the 34 days held no row at all. The PM ruled (a) "state the remainder", then, after an adversarial pass broke (a) as specified, (a′) "one three-way split on both pages".

Eight rounds of `vet-report-cold-read` and `adversarial-reviewer` followed. What each round taught:

1. **Two counts beside each other must be one population** (C-4). "Given" days were counted over the window while the remainder was counted over the course span, so a backdated dose rendered "Given on 2 of 8 days; no dose logged on 8".
2. **"Nothing logged" already meant something on this report** (a day with no entry of any kind), so the course's empty part says "no dose logged against this course".
3. **Don't make a claim the record can't settle.** A fourth bucket for "a dose of the drug logged under another entry" was tried and removed: whether a dose on another line is the same drug, and was given, is not always knowable (a free-text sibling course, a brand/generic pair, the CUL-991 UTC-day seam). A course-scoped sentence is always true; the other line stays visible on its own.
4. **The zero head had to be scoped too** — "no doses given on any of the 3 days" sat beside an orphaned given dose.
5. **Copy edges:** "dosed every other day" read as delivery beside "no dose given"; "every 1 days"; a span of out-of-course dates that contained the course; an unconfirmed dose briefly called "not-given"; subset counts that read as a sum; an interval shown for a rate (0.03) that six intervals share.

Final verdicts: cold read **CLINIC-READY** (rounds 5–8, three rendered samples: one course, a taper with an out-of-course dose, a course whose given dose the app filed ad hoc); adversarial **HOLDS** (round 8).

## Falsification attempts (DoD)

- **Biostatistician:** backdated and after-end linked doses, a taper's sibling-course dose (item and free-text), brand/generic items, the CUL-991 seam orphan (NY 21:30 / Sydney 08:00), soft-deleted doses, two out-of-course doses on one day, a refusal before the start, one-day courses, null tz, endedAt before startedAt, every two-decimal rate 0.01–0.99 → the parts sum to the course days by construction (property-tested), precedence never demotes a given day, no sentence claims silence about the drug, out-of-course doses are dated by kind and side. Held at round 8.
- **Dr. Chen:** 12 + 3 + 31 = 46, 12 + 2 + 24 = 38, 2 + 1 + 6 = 9, 0 + 1 + 2 = 3 on page 1, the lifetime table and Appendix D; the taper reads as a step-down; the seam course and its ad-hoc line reconcile without either stating something false.

## Residuals (filed, not in this PR)

- **CUL-1556** carries every pre-existing finding the rounds surfaced, the most clinically loaded first:
  - the trend legend calls a dose reduction a "stop";
  - a course that doesn't overlap the window drops its in-window doses ("Medication: None logged in this window");
  - Appendix D omits the partial count;
  - not-given doses are undated;
  - "– present" contradicts its preamble;
  - the schedule note ("taper") is never rendered;
  - the whole-course "N doses administered" includes out-of-course doses, and the lifetime table has no matching note;
  - Appendix D's dose-dates cell carries no year;
  - "by oral";
  - the drug is named twice on page 1.
- **CUL-991** (the UTC-day attribution seam) remains the root of the ad-hoc filing the seam sample shows.
- The course-scoped head undercounts when a dose of the course was filed ad hoc ("Given on 9 of 10" while the drug was given all 10). It is true, and it goes away with CUL-991.

## Process note

Eight review rounds on one copy change is expensive. The reviews were right each time, and most of the cost came from building a fourth bucket the record could not support before taking it out. The lesson for the next vet-report copy change: decide what the record can settle **before** wording a claim, and scope every sentence to that.
