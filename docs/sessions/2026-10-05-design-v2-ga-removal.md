# PR-53: Design v2 for every account (CUL-1071, D2-8)

**Date:** 2026-10-05
**One thing:** S5 L1 — Device-local state and the sign-out wipe: a gate that switched off at sign-out was quietly doing the wipe's job · check: pending
**One thing (re-ask):** S5 L1 — the 2026-10-03 check (a remembered list of recent food searches: does sign-out clear it, and what if nobody adds it to the wipe?) · check: pending

This was a dispatched session: *Out of beta — Noticed, Design v2, History v2, the trial screen*, PR-53, the last removal PR. It shipped via the PR opened from branch `claude/out-of-beta-noticed-design-v2-history-v2-the-trial-screen-pr53-10051028`.

D1 was re-ruled (b) on 2026-10-04: 1.2.0 ships with every beta on. So there was no cut gate, no config flip, and nothing was written to `app_config`. D2-9 (the device sitting) was canceled the same day, which closes "D2-9's notes". The precedents were #1066, #1068 and #1069.

## What shipped

**The sign-out fence (MFU-9), before the gate left the Signal route.**
- `wipeLocalSession` aborts the flight synchronously.
- SIGNED_OUT unwinds the stack before routing to auth (`navigateAfterSignOut`, `lib/authRouting.ts`).
- `app/signal/[id].tsx` draws nothing of the record without a session.
- The shared-device sequence is tested on the real route. Each half was proven by mutation.

**The gates.** Every `useDesignV2()` read is gone, and each surface draws its Design v2 branch. The hook, `guards/designV2FlagOff.test.tsx`, the registry row, the shelf case and the `ALLOWLIST_FLAG_KEYS` entry are deleted. A stray `app_config` row is ignored, and a persisted opt-in self-cleans; both are tested.

**The old surfaces.** Deleted wherever an import scan showed nothing else reached them, iterated until the scan was clean.
- Old Home: TodayZone, TrendZone, LookCard, LookChip, MedStrip, DayLane.
- Old Patterns: the summary card, MetricCard, PatternCalendar, FrequencyCalendarCard, DayEventsSheet, the old WeightCard.
- Old trial strip: TrialStripDoor, ThisWeekLane.
- Their hooks and libs: useMedStrips, useSignalFold, useLastEpisodeDates, useTrend, useSummary, lib/summary, lib/summaryCopy, lib/todayLane, lib/trendSummary.
- `lib/dashboardScreen.ts` builds only the four card kinds Patterns draws.

**Guards.** Each guard that named a deleted file was re-run and its registry pruned:
- homeWrites: two classes;
- completionCard: `EXEMPT` empty;
- haptics, occurredAtConfidence;
- historyDoors: `calendar-day` retired;
- symptomLists and the walk: 26 → 25;
- the trial-day, episode and meal-label source guards.

**Docs (pre-approved).**
- Filter rule 6's History line (CUL-1175's ruling).
- The flight recorded in the principles' Motion section (CUL-1077 (a)).
- GA notes on the History v2 and trial-screen specs.

## Decisions

- **The PM ruled the Tier-2 briefs 1a 2a 3a 4a** (2026-10-05, in session; recorded on CUL-1071).
  - Principles v2.0 is written: Principle 3 as two jobs, Principles 8 and 9, the Motion rewrite, *Calm is not quiet*, the chart colour rule, and a fifth lens invariant.
  - The spec edits are written.
  - CLAUDE.md is rewritten with a net shrink: the loaders, the principles row, and the stale pointers in C-18, C-33, C-36 and C-41 and the fold row.
  - Motion & IA joins `docs/personas.md`; the Data Viz lens folds into the Data Scientist as the chart standard.

- **The Whorl and the night moment stay.** About 50 files outside the redesign still render them; widening the one-loop guard app-wide is that sweep. Filed as CUL-1593 rather than folded in.
- **`lib/lookTwins.ts` is kept.** It has no runtime consumer now, but a clinical zero-suppression is not deleted silently. CUL-1594 checks the month and the metric detail.
- **Export-level leftovers go to CUL-1595:** InsightCard's card and fold, the old lane helpers, and Patterns' double load.
- **The med-strip spec edit is held.** CUL-1349's D2 is still with the PM. The code already carries two write classes.

## Review

- **code-reviewer (isolated): ship-ready.**
  - Fix-before-merge: none.
  - Should-fix: two items were already filed (CUL-1594, CUL-1595). The recovery-path note is now in `app/_layout.tsx`.
  - Nits: the stale comments naming deleted components are reworded.
  - Unverified by tests: the real expo-router `dismissAll` sequence needs a device check.
- **Test repair** was split across two isolated agents with disjoint files (the SignalZone suites, the Patterns suites). Their reports named every ported safety assertion. B-789's port was then proven by mutation here: passing `false` for the not-eating register reds the ported test.
- **Adversarial review: N/A.** No detection, escalation or report logic changed. The Patterns builder narrowing removed cards; it changed no number.

## Definition of Done

- **Acceptance criteria (CUL-1071):**
  - `design_v2` gone from the client ✓
  - Retired components and the guard deleted, registries pruned ✓
  - Tier-2 edits written on the PM's confirmation ✓ (ruled 1a 2a 3a 4a, 2026-10-05; the med-strip §0.1 edit stays held for CUL-1349 D2); `claudeMdBudget` green, CLAUDE.md net −87 bytes
  - D2-9 closed by its cancellation ✓
  - CUL-635 / CUL-383 / CUL-140 reconciled in comments ✓
  - Persona roster call ✓ (4a: Motion & IA graduates; Data Viz folds into the Data Scientist)
- **Types and tests:** `tsc --noEmit` clean; jest 587 suites, 13,529 tests green.
- **Secrets and migrations:** none of either.
- **Personas:**
  - Engineer ✓ (deletions; registries)
  - Designer ✓ (the surfaces are the ruled ones)
  - T&S ✓ (the sign-out fence; the opt-in self-clean)
  - Data N/A
  - Dr. Chen N/A (no clinical copy changed)
  - QA ✓ (criteria above)
- **Future self:** the namespace `components/designV2/` now holds the app's live surfaces under a name that says "version two". Renaming it is cheap later and noisy now.

## One thing

**Re-ask first (S5, 2026-10-03):** a future feature keeps "the last three foods you searched" in memory. Does sign-out need to clear it, and what happens if nobody adds it to the wipe?

### One thing — Device-local state and the sign-out wipe (S5, L1)
When someone signs out, the phone still holds pieces of their pet's record in many places: the database, the screens left open, things in memory. The sign-out "wipe" is the list of places that get cleared, and anything not on the list survives into the next person's session. Today a feature switch turned out to be doing part of that job by accident. Design v2's switch read "off" the moment the session ended, so an open Signal screen went blank at sign-out. Deleting the switch would have deleted that protection with it.

**Like:** a hotel room where the light switch was wired to the keycard slot. Nobody listed "turn the lights off" on the housekeeping sheet, because pulling the card always did it. Rewire the switch and the lights stay on for the next guest, unless someone writes it on the sheet.

**In today's work:** `app/signal/[id].tsx:63`
`{signedIn && parsed ? (` — draw the Signal's record only while someone is signed in. This replaced the old "is Design v2 on?" check, so the protection is now said on purpose, and `lib/session.ts:171` (`abortFlight();`) clears the one animation that carried the record's chart.

**Why it matters to you as PM:** every "remove the flag" PR can delete a safety behaviour nobody wrote down, so a graduation's acceptance criteria should ask what the flag was doing at sign-out, not only on screen.

**Check:** the widget beta is now the last switch on the Early access shelf. If it graduates and its switch is deleted, what should the removal PR check about sign-out before it merges?

## Not done here

- The med-strip spec §0.1 edit waits on CUL-1349's D2.
- STATUS.md: PR-60 owns it.
- The `app_config.design_v2` row goes with the project's data-only migration.
