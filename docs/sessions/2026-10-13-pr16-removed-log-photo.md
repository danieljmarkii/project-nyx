# App Store 1.2.0 PR-16: a removed log's photo is deleted, not orphaned

**Date:** 2026-10-13
**One thing:** G1 L1 — A commit is a saved snapshot, and pushing is a separate copy (today's first commit sat in this container while the push hook refused it for four failing suites) · check: pending

Row PR-16 of *App Store 1.2.0 · the first public release* (Wave 2), [CUL-639](https://linear.app/projectnyx/issue/CUL-639). Shipped via #1214. Interactive, plan-gated (Storage and deletion); the PM ruled the reach in session (`go (a)`).

## The problem

A photo attached in the log sheet uploads on its own after the log is saved. Removing the log never stopped that upload, so the photo reached Storage, got a remote row and a paid AI read, and nothing ever deleted it. The offline queue did the same on reconnect, after the removal had already been queued. Undo made this the ordinary case: its 5s window sits inside the upload.

## The ruling

The PM's 2026-10-12 call (via CUL-1825) was "delete the photo of an undone log". That left one question open: how far does it reach? The plan put it as a decision brief, and the PM chose **(a)**. A photo is deleted when its log is removed mid-upload (any surface) or by Undo (even after the upload landed). A photo that reached the server long before its log was removed from the event screen is kept, so Recently deleted (CUL-707) can restore it.

## What shipped

- **Four helpers in `lib/attachments.ts`**, the one place a photo is detached:
  - a liveness read;
  - a one-statement synced mark that refuses a removed log;
  - a purge that deletes the server copies first and the phone's copy only after both succeed;
  - Undo's re-queue.
- **The log sheet's upload chain** checks before and after the upload. It marks only while the log is live, purges on refusal, and spends no read on a removed log.
- **The photo queue** purges unsynced photos of removed logs, pushes only live ones, and leaves a photo whose upload chain is still running. The pre-read re-upload skips removed logs.
- **Undo re-queues its photo** rather than writing a new marker. "An unsynced photo whose event is deleted" is exactly what the queue already holds, so there is no schema change.

## How review moved it

- **My own pass.** The liveness read answered "removed" when SQLite threw, and the chain would then have purged a live log's photo. A failed read now answers "still wanted", and the one-statement mark decides.
- **rls-privacy-reviewer: no boundary breach** (cross-account and cross-pet purges held under migration 025), but FAIL on fit with the ruling:
  - **F1, over-delete, fixed:** Remove during a read's re-upload purged an old, synced photo the ruling keeps.
  - **F3, fixed:** the queue could purge mid-upload, leaving the chain's own cleanup a single try with nothing to retry from. The queue now skips in-flight uploads.
  - **F2, not fixed here:** a photo *added to an existing log* (event screen, edit-event), with the log then removed mid-upload, still stays. That is CUL-1098's path. The two-line fix with this PR's helpers is posted there. Until it ships, case (1) of the ruling holds only for the log sheet's photos.
  - **R3, unreachable:** a photo row without its event row cannot exist, because `PRAGMA foreign_keys = ON` (`lib/db.ts:116`). The test fixture for it was refused by SQLite's foreign key, which is how that was found. The "fix" was reverted rather than shipped untested.
- **A mutation that survived.** Deleting the push's live-only filter left every test green, because the purge runs first and clears the row. The filter only matters when the purge fails offline, and a test now pins exactly that.

## Residuals

- A purge "succeeds" on no error, and RLS-filtered deletes return none. There is no owner path to that.
- Undo's re-queue is best-effort and logged.
- A second device that hasn't pulled the deletion can re-upsert the row's metadata through a read. The object stays gone and the read 404s.
- The `event_ai_analysis` row of an incident removed before this PR outlives it.

## Teach

### One thing — A commit is a saved snapshot; pushing is a separate copy (G1, L1)
A commit saves every file as it is, with a short note, on the computer that made it. Pushing sends that snapshot to GitHub, and only then can CI, reviewers or your phone see it. The two are separate on purpose: this repo runs a check before every push, so a snapshot can exist and still be held back.

**Like:** writing a letter and posting it. The letter is finished when you sign it, but nobody reads it until it goes in the box, and the post office can refuse it.

**In today's work:** the first commit, `8cd57bd`
```
git commit …   → saved here: "PR-16: a removed log's photo is deleted"
git push …     → refused: four test suites failed (the cards still expected the old Undo call)
```
The fix went in a second commit, and both were pushed together.

**Why it matters to you as PM:** "it's committed" is not "it's on the branch". A session that dies between the two leaves work you cannot see.

**Check:** If this session had ended right after the refused push, what would the PR on GitHub have shown, and where would the fix have been?
