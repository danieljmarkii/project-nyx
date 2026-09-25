# History v2 step 2, HV-9: the pinned row, the two sheets, search

**Date:** 2026-09-25

Shipped via #916 (CUL-1166; the body says `Fixes CUL-488`, as CUL-1166 asked, pending the PM's call 5 on CUL-1247). Filed: CUL-1228, CUL-1238, CUL-1239, CUL-1240, CUL-1241, CUL-1247 (Waiting on PM), CUL-1248. The History v2 mock gained §12, four open calls drawn beside the frames they would change, republished to the same URL (version 8).

## The ask

HV-9 of History v2: the row that stays pinned above the list while it scrolls. It carries the pet's name, a type pill with its count, a window pill, and a search button that opens a field under the row. The two pills open round 5's sheets, each with a count on every row. The type sheet lists every type (zeros shown), Medication with a sub-row per course keyed on the vet report's course grain (CUL-488, CUL-1193), Photographed with *N not read*, With a note, and Noticed (no count) where the daily look is live. The window sheet is HV-3's table. Every sheet closes on a pet switch. The work owned `PinnedRow`, `TypeSheet`, `WindowSheet` and `SearchField` and was told not to touch `HistoryList`, `WeekStrip`, or ScopeMenu beyond props named in the PR. Plan posted on CUL-1166, PM said go.

## What changed

- **`components/historyV2/`**
  - `PinnedRow.tsx`: the pet's name, the two pills, and the 44pt search button. The window pill never shrinks, so a date is never cut into a different date. The name and the type pill's words give way instead, and the type pill's count never does.
  - `TypeSheet.tsx` and `WindowSheet.tsx`: the rows drawn on the shipped ScopeMenu, keyed on the pet, so a switch remounts them closed in the same render (AC 13).
  - `SearchField.tsx`: writes the scope store after a 250ms pause, at once on the search key, and clears it on Done. It names its font family, saves nothing and logs nothing. A touch on either pill puts the keyboard away first.
- **`lib/historyControls.ts`** (pure) holds every rule. `pinnedRowViewOf` turns the record's answer and the scope into both pills and both sheets.
  - No number before the read answers, after it fails, on a record with nothing in it, while a search word is in (C-3), or under Noticed (H-9).
  - A window row names what its number counts (*3 vomits*), since its label names only the window.
  - The window pill's VoiceOver label carries the long name and its date.
- **`lib/historyWindowFacts.ts`** + **`hooks/useHistoryRecordFacts.ts`**: one read per pet of the window facts for one `today`, the record's days over All time (sliced per window in memory), the courses, and the unread photos through HV-5's `readStateOf`.
  - The hook re-reads on mount, a sync tick, a new log in today's list, and a return to the tab. It reads nothing while the tab is hidden.
  - Each answer is stamped with its pet, so the last pet's numbers never draw under the new pet's name.
- **`lib/historyQueries.ts`**
  - `readRecordStartDay`.
  - `readRecordDays`: the facts' days alone, without the same-minute duplicate sweep that was half the whole-record read's cost (the rest is CUL-1228).
  - `readHistoryFacts` and `readRecordDays` share one input read, so their days cannot disagree.
- **`components/ui/ScopeMenu.tsx`**: optional props only.
  - On rows: `count`, `detail`, `nested`, `section`, `accessibilityLabel`.
  - On the pill: `pillLabel`, `pillCount`, `pillAccessibilityLabel`.
  - `openAtSelected`: jump once per opening to the selected row, a row's height short of it, never animated, and flash the scroll indicator.
  - A caller that sets none renders the tree it always rendered. That was checked against v1's trees, captured before the edit, three times; the last check came after `openAtSelected`.
- **Small additions to merged step-1 files:** `courseSpanText` and an exported `countsDoses` in `lib/historyDays.ts`, `ANCHORED_WINDOW_NAMES` in `lib/historyWindows.ts`, and the new `lib/historyDateFormat.ts`.
- **Test mocks** gained `usePetStore.subscribe`, and the C-41 proof for the new read: with the flag off, `readHistoryRecord` is never issued, over a record that would answer.

## Decisions

- **Team calls, stated in the plan and unobjected:**
  - no counts while a search word is in
  - the window sheet counts the filter on screen in every window
  - the filter on screen is always listed
  - the search field stays pinned under the row
  - the pet's name at `textLG`

  The review round added two more: the window pill never shrinks, and long sheets open at the selected row. All seven are proposed for spec §3.7 / §3.8 as call 6 on CUL-1247 (Tier 2, not written).
- **One read over All time, sliced per window**, so a filter or window change never re-reads. HV-7 (CUL-1164) keeps its own snapshot of the window on screen. The pill agrees with the count line by construction (same function, same days), and a node:sqlite test holds them equal for every window × filter over the real schema. Whichever PR merges second reconciles the two to one read.
- **The mock's search now keeps only rows both the filter and the words keep** (R-2). No earlier frame exercised a filter and a search together; the fix changed no ruled frame.

## The reviews

- **`code-reviewer`**: ship-ready. Its cleanups (test the hook's triggers, note midnight) are done.
- **The `nyx-voice` pass** read every string HV-9 adds. The product review's voice findings, a window row's number with no noun and a Done hint that promised "the full list again" under a filter, were fixed in the review round.
- **`pm-feature-review`**: NEEDS-WORK on four flows. Two taps to *Since the trial started* was SHIP-SHAPED.
  - Fixed here: the date cut on a narrow phone, VoiceOver's long window name, sheets opening at the selection, the keyboard over a sheet, zeros on an empty record, the nounless labels, the Done hint, and a failed-read comment that promised more than the code does.
  - Filed:
    - the failed read's silent missing rows (CUL-1238, High)
    - everyday word forms in search (CUL-1239)
    - the trial row's CUL-1189 qualifiers on the sheet (CUL-1240)
    - ScopeMenu's accessibility hints (CUL-1241)
    - the unnamed-medicine sub-row (CUL-1248)
  - To the PM, as CUL-1247, with the visual four drawn in the mock's §12: the sheet captions, the pet name as the switcher, Meal's meals not finished, search inside a filter, where CUL-488 closes, and the spec edit.

## Verification

- `tsc --noEmit` clean. Full jest: 491 suites, 10,844 tests green (6 skipped, none of them this work's). The touched suites and `guards/` are green under Pacific/Kiritimati, Pacific/Chatham and Pacific/Honolulu.
- **Mutation, round 1: 27 mutants.** One survived. It was equivalent (a Noticed check that `windowTotalOf`'s null already made), so the check was deleted rather than tested.
- **Mutation, round 2: 32 mutants over the review changes**, all red. They covered:
  - the hook's triggers and stamps
  - `openAtSelected`'s jump, once-per-opening, peek, no-animation and default-off
  - the no-shrink wrapper and the keyboard dismiss
  - the empty-record rule and the answer's own `today`
  - the spoken nouns
  - `readRecordDays` against `readHistoryFacts`
  - the Done hint
  - both sheets passing `openAtSelected`
- **Adversarial (Data Scientist, Dr. Chen):**
  - Tried a window slice against a read over the window itself, for every window × filter. They agree, including the months at the record's edges ✓.
  - Tried an unread, a never-sent and a calm photographed row. Only the first two count as *not read* ✓.
  - Tried a failed read. No number anywhere, never a zero ✓.
  - Tried "Loose stool 0" under the trial window. It is a true record fact, but the sheet never names its window, so it did not hold cleanly and is PM call 1.
  - Tried Sam's refusing cat on the type sheet. "Meal 308" names none of the seven unfinished, so it did not hold cleanly and is PM call 3.

## Residuals

- Two reads of the record until HV-7 and HV-9 reconcile, and the whole-record read's cost on a long record (CUL-1228).
- A failed read leaves the trial and visit rows off the window sheet with no word why (CUL-1238, before GA).
- For the device pass (HV-13):
  - truncation at 375pt and 320pt with a long name, "Loose stool · 4" and "Since Jul 26"
  - the keyboard and a sheet
  - how VoiceOver reads "Jul 1 – Sep 5"
  - Dynamic Type at the largest sizes
- Lord Howe's zone fails one of HV-3's window tests. That's pre-existing (CUL-1207), outside CI's zones, and not this work's.
