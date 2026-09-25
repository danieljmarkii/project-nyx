# History v2 HV-1 — the history_v2 toggle, and the row History and Home share

**Date:** 2026-09-25

Shipped via #907 (CUL-1158; carries CUL-1183, found and ruled the same session).

## The ask

HV-1 of History v2, step 1 of the run order, one of five sessions running at once: a `history_v2` beta toggle copied from `design_v2`, so every later History v2 change lands invisibly; and the timeline row Home draws, lifted out of the `design_v2` namespace so History and Home draw the same row, with its time wrapping instead of truncating. BUILD mode; the plan was posted and approved before any code.

## What shipped

**The flag.** Migration 071 seeds `history_v2` dark and was applied to prod through the MCP (pre-check 0 rows, post-check the dark seed, advisors unchanged). The key is registered in `lib/appConfig.ts`, the shelf row in `lib/betaFeatures.ts` and `app/settings/beta.tsx` (no on-state hint: the v2 screen is empty until HV-7). `hooks/useHistoryV2.ts` is the key's only reader. `components/historyV2/` holds the composition root and three slots that render nothing, `WeekStrip` typed to §5.2's `DayFacts`. The History tab's default export is a two-component gate; today's screen is renamed `HistoryScreenV1` and otherwise untouched.

**The guards.** `guards/historyV2FlagOff.test.tsx` keeps the `design_v2` guard's absent-module-equivalence shape over three surfaces: History, Home, and Home under `design_v2` (the only Home `history_v2` will ever reach, per spec §5.1; its floor proves the redesigned Home was actually drawn). `app/(tabs)/history.historyV2.test.tsx` is the async half (C-41), driven through the real gate and stores.

**The row.** `SpineRowFrame` exports `TIME_W` / `RAIL_W` and draws the time through `timeColumnText` (the mock's own `nb()` rule: a no-break space inside each clock time and before a spaced range dash). The row module moved to `components/dayRow/` as a git rename; `DayNodeRow` is the spec's "node in, row out" dispatcher and Home's `Spine` draws through it. `lib/dayNodes.ts` is the pipeline `TodayCard` now calls.

**The column is 60pt, not 56 (CUL-1183).** Measured with Geist 400's advance widths at the column's 11pt: every single time fits 56 (at most 55.0pt), a range within one half of the day splits cleanly after its dash (38.9pt / 49.2pt), but a run across noon's first line, `11:30 AM –`, is 58.7pt, so it fell to three lines; a two-sided found window's `06:00 AM–` had 0.1pt to spare. Filed with a decision brief; the PM ruled 60 the same evening; built in the same PR. At 60 both fit (1.3pt and 4.1pt spare), and it is the mock's own proportion at our size (56px at the mock's 10.5px is 58.7pt at 11). Home, History and the Daily Recap move together because they read one constant.

## Decisions

- **`lib/dayNodes.ts` delegates to `buildSpine` rather than re-composing it.** The issue said it "calls `nodeReadOf`, `timingsByRow` and `compactSpine` as they are", but `timingsByRow` is module-private in `lib/spineNode.ts`, a file this session could not touch because HV-2 and HV-5 edit it in parallel. `buildSpine` already composes all three, so calling it inherits their edits with no shared line. Approved in the plan.
- **The gate is two components, not an early return.** A flag that flips while the tab is mounted swaps screens; an early return inside v1 would change v1's hook count mid-life. Proven by mutation.
- **A prefix word keeps its break.** "by 07:02 AM" is 64.6pt of Geist at 11pt, wider than the column, so the break is allowed after "by" and never inside the time; the mock's `nb()` glues the whole string, which only fits at the mock's 10.5px.
- **Home is listed twice in the guard.** HV-10's Home change rides both flags, so a leak only on the redesigned Home would be invisible to a tree drawn with `design_v2` off.
- **`TIME_W` 60** (PM, CUL-1183), pinned in `components/recap/DaySpine.test.tsx` with the measurement written beside it.

## Verification

Every guard and test was proven by mutation, each reverted:
- History's gate removed so v2 renders beside v1 → the History equality reds.
- A second consumer of the gate on Home and a second direct read of the key on the shelf → three scans red.
- An inverted gate → all five async tests red. The gate moved inside v1 as an early return → the flip test reds, "Rendered fewer hooks than expected".
- `numberOfLines={1}` restored → the frame test reds at both scales. The shaping removed → 12 tests red.
- `DayNodeRow` forcing `isLast` → red only after the fixtures were widened to every first/last position. The first draft drew every event row last, so that mutant survived: a fixture gap, found by the mutation and fixed. A run that never opens → 5 red.
- `lib/dayNodes.ts` dropping the prior onsets, the free-fed spans, the config or the analysis, or crossing the photo and working sets → each reds the sweep.
- The sweep's floor was luck, and a test merge proved it (`1cc040fb`): on the 400 random days alone the prior onsets changed the answer on 2 days and the config on 3, and the fixture edit HV-2's merge needs zeroed the prior onsets. The floor is now a named witness day per fact (the Sep 17 day for the four common ones, three built days for the prior onsets, the config's episode gap and a free-fed span). With the random days removed, each of the seven facts dropped still reds the sweep; a broken witness, or a fact left without one, fails by name.

**Test merges with the four sibling PRs.** Each sibling head merged onto this branch in a scratch tree: all four merge textually clean and the full suite is green on every pair. `tsc` is clean with HV-3 and HV-4; HV-2 and HV-5 each red it in `lib/dayNodes.test.ts` only, a fixture shape their type changes require (HV-2 makes `id` and `intakeRating` required on `FeedingInput`; HV-5's rows have no `read_text` or `dismissed_at` and need `updated_at`). Each fixture patch is verified against its merge (`tsc` clean, 12 of 12) and posted on CUL-1159 and CUL-1158. HV-3, HV-2 and HV-4 on this branch together: `tsc` clean, 477 suites green. HV-2 and HV-5 also conflict with each other in `lib/spineNode.ts` and `lib/spineReads.ts`, which is theirs to resolve.

Then HV-2 merged first (#910, 01:08 UTC, four minutes after this branch's last CI run started), which is exactly the stale-green case the note warned about: #907's checks were green, and merging it would have broken `tsc` on `main`. So at the wrap this PR took `main` in (`e5fb1624`), reproduced the break (3 errors in `lib/dayNodes.test.ts`), applied HV-2's patch (`64a85f34`), and re-ran everything on the merged tree: `tsc` clean, 471 suites green, the touched suites green in three non-UTC zones.

`tsc --noEmit` clean; full jest 467 suites, 10,010 passed, 3 skipped; touched suites green under Kiritimati, Chatham, Honolulu and New York. The `code-reviewer` subagent returned **ship-ready, no blocking findings**: it re-ran the suite, traced the gate's hook safety, the spoken labels, the shaping's round trip and the move's effect on every path-sensitive guard, and confirmed no adversarial pass is owed (no detection, read or escalation logic changed). Its one note, the local `DayFacts` copy, is on HV-8 (CUL-1165) as a handoff.

A tooling trap worth recording: the editing tool turned `\u00A0` escapes typed into new files into the raw invisible character, in three files. A test whose two sides differ only by an invisible space is unreadable, so they were rewritten as visible escape sequences (constructed through `chr(92)` so the tool could not convert them again). Check new files for raw U+00A0 / U+202F after writing escapes.

Also noticed: Geist has no glyph for U+202F, the narrow no-break space newer platform formatters put before AM/PM, so that character falls back to a system face. Pre-existing and harmless; recorded here only.

## Residuals

- ~~Tier 2: the spec and the mock still say 56.~~ Approved by the PM and done in the same session: spec v1.2 records the 60pt ruling inline in §3.6 and says where the row lives in §2; round 5 of the mock draws the 60px column (its grid, thread, open-in-place rail and bowl line moved together, with a dated ledger row), republished to the same URL as version 6.
- The async proof covers the MOUNT only; HV-7 extends it to the real v2 reads.
- Two comments still point at the row's old home: `lib/spineNode.test.ts:7` (left alone because HV-2 and HV-5 edit that file in parallel) and `components/designV2/index.ts`'s description of `home/`.
- HV-5 (#912) lands after this PR, so it owes its 3-line fixture patch to `lib/dayNodes.test.ts` (posted in its thread on CUL-1158) and a CI run after updating from main, because a check that went green before this merge cannot show the break. HV-2's half is done here (`64a85f34`).
