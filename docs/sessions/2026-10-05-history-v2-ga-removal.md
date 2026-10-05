# PR-52: History v2 for every account (CUL-1175, HV-14)

**Date:** 2026-10-05
**One thing:** none. This was a dispatched session, not this round's teach row.

This was a dispatched session (Out of beta: Noticed, Design v2, History v2, the trial screen · PR-52). It shipped via the PR opened from branch `claude/out-of-beta-noticed-design-v2-history-v2-the-trial-screen-pr52-10050054`.

D1 was re-ruled (b) on 2026-10-04: 1.2.0 ships with every beta on, so there was no config flip and no cut gate. The issue's step 1 was moot and nothing was written to `app_config`. HV-13 (the device sitting) was canceled 2026-10-04, and the PM tests in production. The precedents for the shape were PR-50 (#1066) and PR-51 (#1068).

## What shipped

**The flag.**
- `'history_v2'` is out of `ALLOWLIST_FLAG_KEYS` and `ALLOWLIST_FLAGS_UNSET`. `lib/appConfig.ts` lists it as the eighth graduated key, and `lib/appConfig.test.ts` pins that a stray `app_config` row is ignored.
- The `BETA_REGISTRY` row and the shelf's `presentationFor` case are gone. The shelf now lists the widget and Design v2.
- `hooks/useHistoryV2.ts`, its test and `guards/historyV2FlagOff.test.tsx` are deleted.

**v1's History.**
- `app/(tabs)/history.tsx` draws `HistoryScreen` and nothing else.
- Deleted, because nothing else imported them (each checked with a before/after import scan): the whole `components/history/` directory (EventRow, TypeScopeControl, DateScopeControl, BoundaryMarkerRow, FreeFeedingStrip), `components/vetvisits/VisitTimelineRow.tsx`, `lib/historyTimeline.ts`, `lib/historyPage.ts`, and `components/log/IntakeBadge.tsx`, whose only consumer was EventRow.
- `getTimeline` and `lib/historyDateFilter.ts` stay, since other screens import them.

**Home.** `TodayCard` always draws `HomeSpine` (the first paint and open in place). TodayCard renders only under `design_v2`, so the motion is now gated on Design v2 alone, as the 2026-10-03 comment on the issue asked. Design v2's first spine (`components/designV2/home/Spine.tsx`) had no other consumer and is deleted. `guards/dayRowOneWay.test.ts` now names `HomeSpine` as Home's surface file, so its "a real call site" floor stays non-empty.

**The senders.**
- `lib/ask.ts`: `AskHistoryReach` keeps only `trialWindowOffered`. Ask's 14-day link now opens History, and its trial link opens History wherever History offers that window (CUL-498).
- `app/rundown.tsx`: the History tiles scope by pet alone.
- `lib/historyDoors.ts`: each row carries one `lands`.

**Tests.**
- `app/(tabs)/history.doors.test.tsx` is rewritten for v2 alone. It covers every registered door, plus the spent-tap rule across a remount, proven by mutation: with `isHistoryDoorTapSpent` forced false, both remount tests go red.
- The v1 suites are deleted: `history.test`, `history.doorway.test`, `history.historyV2.test`, and EventRow's dose, look and dates suites.
- `lib/historyPage.test.ts` became `lib/monthReads.dayRows.test.ts`, which keeps `readDayRows`' real-SQL coverage at the C-40 edges.
- TypeScopeControl's symptom-list registration and its membership-walk row went together, and the walk's count dropped from 27 to 26.

**Docs.**
- History v2 spec v1.15: the header says GA; §5.1 and §5.8 record the retirement under ⚠ GA; §3.12 gains PR-39b's row for a failed read on the sheets (PM-approved 2026-10-04 on CUL-1238); §12 records the version.
- Tier-2 edits, pre-approved by the PM on CUL-1175 (2026-10-05): the filter spec's History rows, the daily-look spec's History door, and the vet-visits spec's History row. Each only names the History that shipped.
- CLAUDE.md: the History v2 row, and C-41's pointer to the deleted `lib/historyTimeline.ts`. Both edits shrink the file.

## Decisions

- **EventRow went too.** The issue named it among v1's files "wherever nothing else imports them". Once the tab stopped importing it, nothing did: TodayZone and the event screen only mention it in comments. Those comments now say it is retired.
- **A remount replaces the flag flip in the doors test.** The spent-tap memory (`lib/spentTaps.ts`) was built for the screen swap a flag flip caused. With the flag gone, a remount is the same hazard, so the test drives that instead.

## Review

**code-reviewer (isolated):** fix-before-merge, one finding. The shelf's switch-label test still expected *History v2*; it is fixed. Its cleanups were taken: a stale test title, comments naming deleted rows as live (now marked retired), and the C-41 pointer.

It reported as clean:
- no import or mock of a deleted module anywhere;
- no guard registry naming a deleted path;
- only the intended behaviour changes;
- no vacuous test.

**Adversarial review:** N/A. No detection, escalation or report logic changed. Ask's change is link routing, and it keeps B-378's exact-window rule.

## Definition of Done

- **Acceptance criteria (CUL-1175):**
  - No `history_v2` reads remain outside the migrations ✓ (the remaining hits are the retirement test and a detector's negative fixture string).
  - The Early access list no longer shows History v2 ✓.
  - Every doorway guard and the `readState` guard stay green without the flag ✓.
  - The flip: N/A, superseded by D1 (b).
- **Anti-patterns:** none introduced.
- **Types and tests:** `tsc --noEmit` is clean. The full jest suite runs in the pre-push hook.
- **Secrets and migrations:** none of either.
- **Personas:** Engineer ✓ (a pure deletion; coverage re-hosted where it was real) · Designer ✓ (Home's motion now reaches every Design v2 account, unchanged otherwise) · Data N/A · Dr. Chen N/A · QA ✓ (the criteria above).
- **Future self:** `lib/historyDateFilter.ts` keeps several exports only its own tests read now (the v1 presets, `effectiveRange`, the slack bounds). Pruning them is a follow-up, filed as a Linear issue, not folded in.

## Not done here

- Deleting the `app_config.history_v2` row waits for the data-only migration (the project's step 7), once no installed build reads it.
- STATUS.md: PR-60 owns it.
