# FAB PR-29c: the vet report says when normal stool got its own shortcut

**Date:** 2026-10-09
**One thing:** none — dispatched session, not this round's teach row

Dispatched session (`/dispatch`, FAB round 2, Wave 3), CUL-1658, a sub-issue of CUL-1655 (PM ruling D6). The issue was plan-gated: the plan went on the issue and in session, and the PM typed the go here. Shipped via #1130.

## What shipped

`generate-report` reads the pet's `capture_changes` row (`fab_stool_split`, migration 091) over the caller's JWT. The stool characteristics strip (§3.7) then carries one disclosure beside its counts. The counts are never adjusted; a deepEqual test checks that the snapshot is identical apart from the one field.

**The two clocks bound a span.** One is the phone's `first_seen_at`, the other the server's `created_at`. The line prints whenever that span reaches into the window. There are six arms:

- **`on {day}`.** Both clocks fall on the same day, inside the window. Under ruling 1a the line adds each side's loose and normal counts with its days-with-any-log, one line per period, loose first.
- **`between {a} and {b}`.** The clocks disagree on the day. No split is drawn.
- **`on or before {later day}`.** Only the later clock is inside the window.
- **`date not fixed`.** The span straddles the whole window.
- **`on/by {later day}, before this window`.** Ruling 2a: this prints for 180 days after the change (`NORMAL_SHORTCUT_SINCE_DAYS`).
- **`not checked`.** The read failed. This shows in the strip, never on the page-wide partial-record banner.

**The last line names both directions:** "Loose stools had their own entry throughout, so a rise in loose stools is not explained by this change, but a fall may partly reflect borderline stools now logged as normal."

## Decisions

- **PM rulings, 2026-10-09:**
  - **1a:** split the counts at the change day inside the line, and keep the pooled bar.
  - **2a:** disclose for 180 days on reports whose whole window is after the change.
- **Team calls (Dr. Chen / nyx-voice), made on the review findings:**
  - "a dedicated normal-stool entry", never "one tap", because each half of the split pill opens a confirm.
  - The protecting sentence names a fall as well as a rise.
  - One idea per line.
  - "a report covering any period before", never "from before that date".
- **A failed read is disclosed in the strip, not as a partial record.** The banner calls every count a minimum, which is false when only this date is missing. The report is not refused either.

## Reviews

**adversarial-reviewer, round 1 (FAIL), all fixed:**
- **F1.** "The loose count is unaffected" reassured. A borderline stool can move from Loose to Normal once the split exists.
- **F2.** The earlier-clock rule hid the line at the window's start when the phone clock was slow. Fixed by the span.
- **F4.** "One tap" was wrong.
- **F5.** The banner wording was false for this table.
- **F3** (serial reports) became ruling 2a. **F6** (the writer's coverage) was noted on CUL-1657.

**adversarial-reviewer, round 2 (FAIL, narrow), fixed:**
- **M1.** The `on` arm split at the earlier clock even when the clocks disagreed on the day, which put days from one logging regime on the other side. It now splits only when both clocks agree, and otherwise uses `between`.

**Held across both rounds:**
- Before plus from equals the pooled counts, across DST and non-UTC zones.
- The 180/181-day boundary.
- `since` can never fire for an in-window change.
- No arm reassures.

**vet-report-cold-read:**
- **Round 1, NOT READY.** The pooled bar hid the split, and "one tap" was jargon.
- **Round 2, NOT READY.** The caveat covered a rise only, and the paragraph was too long.
- **Round 3, CLINIC-READY.** One wording nit, applied.
- **Standing dissent (not blocking, ruling 1a):** the pooled "Normal ×24 · Loose ×6" bar still leads the eye across a change it says is not comparable.

**Mutation proofs:** restoring the earlier-clock rule, moving the 180-day bound by one, and shifting the split boundary each red their test.

## Surface sweep: what else prints normal and loose side by side

- **This strip is the only one.**
- **History's Stool filter** counts formed stools alone.
- **The report's symptom trends, the trial before/after, the Signal lanes, the widget and `/insights`** exclude `stool_normal`.
- **Ask (model-composed only):** follow-up **CUL-1703**.
- **Days-logged coverage** is an indirect effect on the sparse-window caveats: follow-up **CUL-1702**.

## Residuals

- The Tier-2 edit to `docs/nyx-vet-report-requirements.md` §3 item 7 was approved by the PM in session (CUL-1704) and written in this PR.
- The line prints only once PR-29b's writer has rows. PR-29b merged as #1129.
