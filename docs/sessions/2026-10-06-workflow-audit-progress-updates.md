# The workflow audit: periodic progress updates from /dispatch

**Date:** 2026-10-06 · **Issue:** CUL-1624 · shipped via #1089
**One thing:** none — dispatched session, not this round's teach row

## What happened

Dispatched ad hoc (BUILD), building the PM's ruling (b): a five-line progress block at the top of every round digest, plus a weekday 07:45 CT update posted as the project status update, printed in the dispatcher session and emailed to the PM under a narrow carve-out from the never-line.

**The function** (`scripts/dispatch/progress.ts`, pure). Five lines: progress by wave with a bar; what moved since the last progress update (merges, stops, done-short, launches); what starts next (ready now, on a PR's merge, on a ruling); the holds on the PM ranked as the index ranks them; and an estimate. The estimate counts only rows dispatch can run without the PM, groups them into rounds of usable slots, and multiplies by the p25 and p75 of measured launch-to-merge cycles, printing its basis and never a date. It needs three measured cycles; it falls back to repo-wide cycles and says so, or gives none. It reads a run-order table's verdicts, or, for a project with no table (The workflow audit itself), the project's issues: a merged PR beats every label, the PM's label beats a launch it stopped on, a launch with no PR is running, and an issue worked by hand is outside dispatch's run. A parent whose children are in the project is not counted.

**The send** (`progressEmail`): one recipient, the owner address passed in, the five lines exactly, else `skipped` with the reason. `cli.ts progress <facts> --email <owner>` is the only caller; the address comes from the session context at run time.

**The instructions** (`.claude/commands/dispatch.md`, v1.6): § Authority's email exception, word for word the ruling's scope; a new § Progress updates (the block atop the digest and step 6's brief, one weekday trigger per live dispatcher at `CRON_TZ=America/Chicago 45 7 * * 1-5` into its own session, what a progress wake does, the trigger's teardown at hand-off or when every row merged). Step 0 reads only `**/dispatch run**` updates as memory, so a `**/dispatch progress**` update never reads as a run.

**The guard** (`guards/dispatchEmail.test.ts`): email named nowhere in dispatch.md outside those two sections (so no child prompt carries it), the never-line byte-identical, no address in the dispatcher's files, one caller of the send. It caught this session's own version line, which named email outside the two sections; the line was reworded.

**Proof.** Dry run on The workflow audit's facts at 23:56:39Z (the fixture `scripts/dispatch/fixtures/progress-workflow-audit-2026-10-06.ts`): 25 of 38 merged, six cycles of 24 to 92 minutes (median 52), three rows to run in one round, 36 to 61 minutes of running time. `tsc` clean; jest `scripts/dispatch` and `guards` green after merging main; the mutants script kills every mutant, 23 of them new (one per progress rule); the guard's six mutations each turn it red.

**Main brought in** after #1085 (CUL-1623) merged: `cli.ts` conflicted in its import block (kept both), and `progress.ts` now reuses `stall.ts`'s `Wake`, the same shape. merge-check's one REVIEW line is the version line, rewritten on purpose (1.6 carries 1.5's text).

## Open

- The estimate is running time. A strict chain on a page runs one row per round, so a chained remainder lands later than its range; stated in the module's blind spots, not modelled.
- The 07:45 trigger and the first email are instructions until the dispatcher runs them; nothing here was sent or armed.
