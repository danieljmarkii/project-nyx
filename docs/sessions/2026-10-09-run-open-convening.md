# The run convening: the grouped meals line that opens in place

**Date:** 2026-10-09 · **Issue:** CUL-1715 (DISCOVERY, the convening) · **Branch:** `claude/vigilant-noether-izi7v6` · **Mock:** `docs/culprit-run-open-mockups.html`, rounds 1, 2 and 2.1, one URL: https://claude.ai/artifact/LxYrPQEQeMBZcPE6mWFWpZ · **Shipped via #1138**

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

## The PM's reactions (2026-10-10)

**Round 2.** "I like everything you have except 04.. what you see when it's open. I'd like for you to ensure brand and other info is still available on the meal when it's expanded."

- **D2 ruled:** every opened meal keeps its brand, product, format, rating and time, so GAP-8's "every fact" holds. The team's recommendation to drop the product is withdrawn.
- **The team's form inside the ruling:** time, "Meal", format and rating chip on line 1; brand and product on line 2, in the run's own second-line type; a 9pt bead on the run's line; the time a step darker. Today's rows exactly is the boxed option.
- **D1 and D3 read as ruled yes** ("I like everything you have"). D4 had no recommendation to like and D5 is a clinical rule change, so both stayed open.
- Republished as one proposal with a ledger at the top (commit 818c5e0).

**Round 2.1.** Sent mid-turn: "FWIW.. I like the concept of a mark or indicator for multiple meals. The little radiating arcs."

- **D4 ruled (b):** the arcs are §06's stack, its back beads showing under the front one. Every proposal phone now carries it, and the owners' tick per meal idea (option c) left the page.
- **The dissent is recorded** (Data Scientist, Dr. Chen, the owner panel) and its three conditions ride the build: the words keep the count; the mark never changes with a rating; the phone check asks one owner what the arcs say, and an answer about how the meals went brings it back to the PM.
- **A rule the ruling contradicted was corrected:** §09's "no glyph that only ever plays over calm content" now names its one exception, since a run holds only meals eaten normally or unrated.
- **D5 is the one decision still open.**

## Filed

Each was verified in code by the lead.

- **CUL-1718 · the day's thread is not drawn (High).** Found in the PM's screenshot by sampling pixels, and confirmed by the Engineering seat. `SpineRowFrame`'s bead column never stretches (`DaySpine.tsx:321, 357`), so Home, History and the Daily Recap show 3pt stubs, and every first paint erases its own line. The fix needs both the stretch and a segment carried through the row's 16pt gap.
- **CUL-1719 · History prints a look out of time order beside a run (High).** The Data seat reproduced it through `buildDay` and a rendered `DayCardBody`. It blocks the time-ordered landing on History.
- **CUL-1721 · the shipped seams.** Every one with its line of code, plus History's filter change animating a close, opening during the first paint, and a run whose id changes snapping shut. D1 decides how far its fix goes; it is blocked by CUL-1718.
- **CUL-1720 · "0 min after eating" beside times a minute apart (Low).**

**Build issues, from the rulings (2026-10-10):**

- **CUL-1733 · D2, the member form.** Every fact on two lines, a 9pt bead, a darker time.
- **CUL-1734 · D1, the run's own motion.** Blocked by CUL-1718 and CUL-1721, and on History by CUL-1719.
- **CUL-1735 · D3, the bounded reveal scroll.** After CUL-1734.
- **CUL-1736 · D4, the stack.** After CUL-1734, with the dissent's three conditions.

**Noted, not filed:**

- A mid-run edit that splits a run closes the later half, because its id is its first member's.
- The History v2 device pass (CUL-1171) that would have caught the seams was canceled; the PM's production checks now cover it.

## Validation

- Docs only, so the pre-push hook runs nothing.
- The mock was driven in Chromium. That covered the scrubber on all three phones at eight instants each way, the 12-meal run, the reveal scroll, live open and close, Reduce Motion emulated, dark mode and 390pt. There were no page errors.
- Rounds 2 and 2.1 were driven the same way before each publish. Round 2.1 also counted the stack's beads on every phone on the page: none on today's, one back bead at two meals and two at four or more on every proposal phone.

## Lessons

1. **A layout claim is checked in pixels.** RN's test renderer does no layout, so a bead column that never stretches passes every test and every code review. The device pass that would have caught it was canceled. Sampling one column of the PM's screenshot found the missing thread in a minute.
2. **Compute a curve before you name its overshoot.** `foldMotion.ts` says the unfold spring overshoots "~4pt". Fabric's formula overshoots 11.6% of the travel, on a box whose travel has no cap. The comment wrote a cheque nobody cashed (C-38's shape, in a motion constant).
3. **Isolated seats correct the lead, not only each other.** The briefing's close was derived by reading the machine, and it was wrong on the common path. Two seats corrected it independently, from Fabric's own event rules. A briefing is a claim like any other.
4. **Ask what a cleaner design deletes before recommending it.** Round 1 recommended dropping the product from each opened meal so the group would read as one; the PM ruled every fact stays. The form that survived keeps every fact and changes only their order and weight.
5. **Draw the contested option, because the ruling may come back as a picture.** The PM settled the persona conflict by naming what they saw ("the little radiating arcs"), not a lettered option. Described in words alone, it would have needed another round.
