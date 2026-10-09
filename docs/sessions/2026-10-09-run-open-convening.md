# The run convening: the grouped meals line that opens in place

**Date:** 2026-10-09 · **Issue:** CUL-1715 (DISCOVERY, the convening) · **Branch:** `claude/vigilant-noether-izi7v6` · **Mock:** `docs/culprit-run-open-mockups.html`, round 1, published at https://claude.ai/artifact/LxYrPQEQeMBZcPE6mWFWpZ · **Shipped via #1138**

**PM prompt (with one Home screenshot: a run of two meals opened, the 2:52 PM meal and a photographed vomit marked *Worth a call* below it):** "I have a v1 animation here that I'd love for us to turbocharge. It's used on the home and history tabs as far as I'm aware but might be on others as well … this is an interaction that happens frequently and because of that it should be delightful. So. What can we do to improve this experience. Let's gather the full team and discuss."

## What shipped

**Round 1 of a new mock page.** One timing engine drives every phone, frame strip and beat chart on the page, so they cannot disagree:

- **Today's opening** rebuilt beat for beat from `openInPlaceMotion.ts` and `SpineNodeRow.tsx`, with React Native's own Fabric layout curves (read from `node_modules/react-native/ReactCommon/react/renderer/animations/utils.cpp`). It plays at a quarter speed and carries frame strips of the open and the close, with the eight seams ranked.
- **The proposal** beside today and beside the same motion with today's full rows: a scrubber stops all three on one instant, and the run can hold 2, 4, 8 or 12 meals.
- **The rest:** beat charts to scale with a budget table; the opened state at rest; the reveal scroll; the contested stack drawn as bead close-ups, closed frames and a live phone; the six voices, five briefs, team defaults, what the team will not do, and what was filed.

Every demo was driven in Chromium before publishing: no page errors, no sideways scroll at 390, light and dark. The app frames carry the app's own light ink in both page themes (the FAB round's second lesson).

## The convening

One shared briefing (the PM's words, the screenshot, the settled rulings, the beat-by-beat account checked against the code), six isolated reads, then the lead's pass, which re-read in code every claim that became an issue.

- **Seats:** Sr. Product Designer; Motion & IA; the owner panel (Jordan, Sam) through `pm-feature-review`; Dr. Chen with the Data Scientist; Engineering with QA and an accessibility consultant; a research consultant with web search.

**Where it runs:**

- `SpineCompactRow` on `useOpenInPlace`, on Home (`HomeSpine`) and History (`DayCard`).
- The same machine opens a day under the Patterns month (`MonthInstrument`'s `DaySlot`), so the PM's "might be on others" was right.
- `UNFOLD_LAYOUT` also drives the daily look (`lookMotion.ts:135`) and a read's arrival (`arrivalMotion.ts:296`).

**What every seat agreed:** it reads v1 because of seams, not because it lacks a flourish. Ranked by Motion & IA:

1. The close ends with a 44pt slam.
2. The open starts with a 44pt jump.
3. The box bounces: Fabric's spring reaches full height in 65ms and swings 11.6% past it at about 102ms, about 85pt on twelve meals, where `foldMotion.ts:73` expects about 4pt.
4. The line pops to length at about 480ms.
5. The close's line snaps short, or spills on a remounted card.
6. A mid-flight tap snaps.
7. The chevron swaps.
8. The members land as one block and remount at both ends, dropping VoiceOver focus.

The flying "deal" (beads travelling down to their meals) was cut by all six.

**Corrections the seats made to the lead's briefing:**

- **The close's line (Engineering, Motion & IA).** `onSlotLayout` records only in phase `open`, and Fabric never resends a layout for an unchanged frame. So after a fresh open the close cuts the line to 44pt on its first frame. The spill the briefing described only happens on a card that mounted already open.
- **The members remount; they are not re-parented.**
- **Where *Worth a call* sits on the month (Data).** On the day mark, not in the slot.

**The proposal they converged on:**

- The line leads linearly out of the tapped bead along the header's own thread (no 44pt band).
- The box opens from nothing on an ease with no overshoot, clipped while it moves.
- Each meal lands where the box's edge reaches it, capped so twelve meals settle inside 400ms.
- The arrow turns. The close is faster than the open (about 280ms).
- A second tap reverses from where the motion is.
- The run gets its own box config rather than changing `UNFOLD_LAYOUT`.

**The research consultant's verified precedents:**

- Compose's default expand fades and grows from zero, clipped, with no bounce.
- Apple: "When you're not sure, use a spring with bounce 0."
- HIG: "generally avoid adding motion to UI interactions that occur frequently"; "let people cancel motion".
- Mail, Reminders and Day One lead a group with its count.
- iOS notification stacks are the nearest thing to the stack.
- Not verifiable, left out: Wallet's stack motion, Things 3's expand motion, any health or baby tracker.

## Briefs for the PM (on CUL-1715)

- **D1:** build the proposal, the thread first (recommended).
- **D2:** nest the meals under their line, a better-than-the-rule brief against GAP-8 (recommended; Engineering neutral).
- **D3:** a bounded reveal scroll, a better-than-the-rule brief against GAP-8's "opening never scrolls the list" (recommended).
- **D4:** a capped "several" stack on the folded bead. A persona conflict: the Designer and Motion & IA for it, the Data Scientist, Dr. Chen and the owner panel against.
- **D5:** a meal within 30 minutes before any vomit keeps its own row. A clinical rule B change; the Data Scientist with Dr. Chen recommends yes.

**Team defaults:** no overshoot on the run's box; the time budget; reverse from where it is; the line in `colorAccentGlyph` from the tapped bead to the last meal's; landing by the box's edge; the Reduce Motion form; no haptic.

## Filed

Each was verified in code by the lead.

- **CUL-1718 · the day's thread is not drawn (High).** Found in the PM's screenshot by sampling pixels, and confirmed by the Engineering seat. `SpineRowFrame`'s bead column never stretches (`DaySpine.tsx:321, 357`), so Home, History and the Daily Recap show 3pt stubs, and every first paint erases its own line. The fix needs both the stretch and a segment carried through the row's 16pt gap.
- **CUL-1719 · History prints a look out of time order beside a run (High).** The Data seat reproduced it through `buildDay` and a rendered `DayCardBody`. It blocks the time-ordered landing on History.
- **CUL-1721 · the shipped seams.** Every one with its line of code, plus History's filter change animating a close, opening during the first paint, and a run whose id changes snapping shut. D1 decides how far its fix goes; it is blocked by CUL-1718.
- **CUL-1720 · "0 min after eating" beside times a minute apart (Low).**

**Noted, not filed:**

- A mid-run edit that splits a run closes the later half, because its id is its first member's.
- The History v2 device pass (CUL-1171) that would have caught the seams was canceled; the PM's production checks now cover it.

## Validation

- Docs only, so the pre-push hook runs nothing.
- The mock was driven in Chromium. That covered the scrubber on all three phones at eight instants each way, the 12-meal run, the reveal scroll, live open and close, Reduce Motion emulated, dark mode and 390pt. There were no page errors.

## Lessons

1. **A layout claim is checked in pixels.** RN's test renderer does no layout, so a bead column that never stretches passes every test and every code review. The device pass that would have caught it was canceled. Sampling one column of the PM's screenshot found the missing thread in a minute.
2. **Compute a curve before you name its overshoot.** `foldMotion.ts` says the unfold spring overshoots "~4pt". Fabric's formula overshoots 11.6% of the travel, on a box whose travel has no cap. The comment wrote a cheque nobody cashed (C-38's shape, in a motion constant).
3. **Isolated seats correct the lead, not only each other.** The briefing's close was derived by reading the machine, and it was wrong on the common path. Two seats corrected it independently, from Fabric's own event rules. A briefing is a claim like any other.
