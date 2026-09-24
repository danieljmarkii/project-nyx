# Vet visits — a confirm on Stopped / Ended, every upcoming booking, the block opens Get ready

**Date:** 2026-09-22 · **Issues:** CUL-951, CUL-970, CUL-987 · shipped via #888
**Filed from this build:** CUL-1083, CUL-1088, CUL-1089, CUL-1090, CUL-1091, CUL-1092 (none closed by #888)

---

## What this was

Milestone 2 of **Out of beta**, steps 3 and 4 plus the optional calls: the three vet-visit
fixes that sit in front of the VV-GA flip (CUL-905). One BUILD session, one PR, one commit
per issue in the PM's order (CUL-951 and CUL-970 first, both block CUL-905 and the store
cut; CUL-987 last, gating nothing). The PM ruled all three issues at session start
(CUL-951 → (a); CUL-987 → D1 (a), D2 (a), D3 (a); CUL-970 needed no ruling) and, on the
plan, ruled D1 onto every face, no new mock round, and asked for the late-visit date
question to be filed (CUL-1083).

## What shipped

**CUL-951 — *Stopped* and *Ended* confirm first, and the row settles in place.** The
after-visit screen ended a course or a trial on the chip, with no confirm and no way back,
and the answered row vanished (the course re-read filters `status = 'active'`); an ended
trial turned into *Start a trial*. Now:

- A confirm before any write — before `ensureVisit` too, so *Keep it* mints no visit row —
  naming the course or trial, the pet and the day it ends, in the Home strip's
  remove-dialog shape with mock round 6's A7 wording plus the date. Copy is pure in
  `lib/vetVisitPlan.ts` (`stopCourseCopy`, `endTrialCopy`).
- **One day value**, computed once, named in the confirm and handed to the write:
  `endRegimen(id, endOn)` for a course, and `endActiveTrial({ …, endedOn })` for a trial —
  `endActiveTrial` gained that optional, validated parameter in the review round (below).
- `destructiveConfirm()` on the confirm, never on the chip.
- The row stays where it was as a `PlanSettledRow` (*Stopped today* / *Ended today*,
  naming the day once it is no longer today). `mergePlanCourses` keeps a settled course in
  its position across the active-only re-read; an ended trial renders its settled row
  instead of *Start a trial*.

**CUL-970 — every upcoming booking.** `readVetVisitsHome` returned `upcoming[0]` and dropped
the rest, so a second booking was on no screen at all. `VetVisitsHome` gains `later` — a
slice of the same in-memory split, so it cannot disagree with `next` about what is live —
and the split now sorts by parsed instant (C-40) rather than trusting the SQL's text order,
which only mattered while the extra rows were thrown away. The list renders them under
*Next* as plain rows with their own Take notes · Change doors (and *How did it go?* on the
day, the lead's own gate). The Pet-tab card and Home's strip stay singular, as ruled.

**CUL-987 — D1, D2, D3.**
- **D1:** `AppointmentBlock` takes an optional `onPress` and splits by host (C-7): a
  touchable whose label is the visible text plus a Get ready hint, or the plain accessible
  View. Wired wherever it renders, on every face: Home's strip (upcoming and the day-passed
  ask), the Pet-tab card (`onGetReady`), and the list's lead, later and waiting rows. A
  navigation, not a write — `guards/homeWrites.test.ts` untouched and green. C-5 walked:
  the strip's doors carry 8pt of slop and sit 16pt below a block with none.
- **D2:** `appointmentPrepNote` gains a `goes` form over the same count, and
  `removeAppointmentCopy` puts it before *Nothing else in the record changes.* — the order
  is what keeps that sentence true. The prep argument is REQUIRED (C-37: a default on the
  one input that makes the confirm honest would be the decision to omit it). All three
  doors read the row at press time (CUL-825); a failed read is a failed remove, never a
  confirm missing the sentence.
- **D3:** *This changes {pet}'s appointment only.* above Save, only in an account with more
  than one (non-archived) pet.

## The review round

`code-reviewer` found one real item: the trial path named a day in the confirm while
`endActiveTrial` stamped its own "today", so a dialog held open across midnight could name
one day and write another — the invariant the course path already held and the copy's own
docstring stated. Fixed by threading the day through (`endedOn`, validated `YYYY-MM-DD`,
defaulting to today so the two other callers are unchanged). Two nits left as they are: a
wider double-tap window before the now-async remove confirms (harmless — the cancel is
`COALESCE`-idempotent) and the `/rundown?appointmentId=` push restated in three files.

`pm-feature-review` (Sam and Jordan) passed the confirm, the settled row, the remove line
and the scope line, and found three things this diff introduced or stated wrongly, all
fixed before the wrap:

- **Door labels were identical per row** once *Next* held several bookings — "Take notes for
  Pip's visit" read out twice. `AppointmentActions` now appends the booking's own `when`.
- **The trial confirm dropped "and in vet reports"** beside the course confirm's, which reads
  as "ending the trial takes it out of the report". The shorter wording rested on B-455's
  premise, and the report now reads `ended_at` first (`trialEndValue`); the claim is about
  the entries logged during the trial either way. Parity restored, with a test that the two
  confirms make the same promise.
- **The D3 helper's comment claimed the line renders only where it "can matter".** It is
  keyed on the account, as ruled, and renders on unpaired bookings too; the comment now says
  so (C-38's cheque).

The rest of that review was older than this diff and is filed rather than folded in:
CUL-1088 (an ended or kept trial is tagged "Trial started" on the list and the card),
CUL-1089 (a course stopped at a visit leaves no mark on it), CUL-1090 (*Ended* always writes
`vet_advised`, so a refusal can never reach the report from here — PM call, clinical),
CUL-1091 (the passed-day faces: Get ready's framing, an *It moved* door, and the
"Did Tue, Sep 20's visit happen?" format bug — PM calls), CUL-1092 (*Switched* stays lit
after the sheet is dismissed; the saved moment's doubled verb). CUL-1088 / 1089 / 1090 were
named by the reviewer as blocking GA; that is flagged on each, not asserted.

## Verification

Every new test was run red against a mutation of the code it guards — dropping the confirm,
the merge, the ended-trial branch, the `later` slice, the instant sort, the list render, the
later row's day gate, either block door, the press-time read, the `goes` sentence, the D3
account gate, the trial `endedOn`, and the label suffix each reds its test. `npx tsc
--noEmit` clean; `npm test` 441 suites / 9,665 tests green before the review round, the
affected suites and all 27 guard suites green after it, and the pre-push hook green on the
final push.

## Residuals

- The block's press state is its whole affordance (D1 (a)'s cost, ruled). Whether Sam finds
  it cold, especially on the plain later rows, is a device question for the GA-V0 sitting
  (CUL-1080).
- Mock A7's caption says the record writes `stopped`, not `completed`; that belongs to round
  6's per-visit verdict schema (PR #871, unmerged) and CUL-1089.
