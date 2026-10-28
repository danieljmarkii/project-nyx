# Every iPhone PR-08: sheets as centred cards on the unfolded Duo

**Date:** 2026-10-28
**One thing (re-ask):** G5 L1 — A required check blocks the merge; a reported one only tells you (from PR-02 earlier today: if a PR made Home spill off the side of the unfolded Duo but every test still passed, could it merge, and what one change would have stopped it?) · check: pending
**One thing:** D4 L1 — A guard that checks a step was taken is not a guard that checks it did anything · check: pending

Shipped via #1349. Finishes CUL-2243.

## What shipped

A `<Modal>` presents in its own window, outside the column PR-02 put at the root, so on the unfolded Duo every sheet ran edge to edge across 626 or 890 points.

- **One cap.** `sheetCapFor(gutter, marginX)` and `useSheetCap(marginX)` in `hooks/useLayoutClass.ts`: at regular width a sheet's panel steps in from each side by the column's gutter, so it sits centred over the column whatever its shape. A stretched panel narrows to the column; an absolutely positioned one moves in by the same amount, because a margin adds to its offsets. At compact it is `null`, so a phone draws exactly what it drew before.
- **21 sheets and menus take it**, each on its panel, never its scrim, so the dim still covers the whole window. The two that carry their own side margin (the delete and archive cards) pass it in. The notification primer, a full-screen Modal, wraps its content in `LayoutColumn` instead.
- **Left alone, by the issue:** the seven `pageSheet` modals (the platform presents those as cards at regular width; the device check confirms) and the sheet motion. Heights are PR-11's.
- **A guard.** `guards/sheetCap.test.ts` parses every Modal and reds a transparent one whose file never puts the cap in a style, or a full-screen one with no column. The photo and PDF viewers are registered: they should span the window.
- **Two sheets in the captures.** The pet switcher and History's date range menu now open in `scripts/web-capture/capture.mjs` at every size.

## What broke and how

- **The first guard checked the word, not the effect.** It passed any file that called `useSheetCap`. The code reviewer pointed out that a file could call it and drop the result. The guard now follows the value into a `style=`, and stripping the cap out of SheetShell's style reds it.
- **The first "main" bundle was built from a stale ref.** The local `origin/main` predated PR-01 and PR-02, so every comparison would have been against the wrong app. Fetched and rebuilt from 3204d02.
- **Three capture shots could not do their job.** The log sheet never opened, because the + button's fan does not open on the web build, so that shot was dropped rather than shipped as a photograph of Home. History's type filter cannot be reached at AX5, because the date range pill covers it on `main` too, so the shot uses the date range pill. Home at 320 differed once because the fixture had not finished loading; taken alone, it matched exactly.

## Residuals

- The log sheet's cap is verified by reading the code and by the guard, not by a photograph. It sits on the same flex-child shape the pet switcher capture proves.
- Filed with the AX5 pill and the guard's alias blind spot in CUL-2255 (Found along the way).

## Teach

### One thing — A guard that checks a step was taken is not a guard that checks it did anything (D4, L1)
A guard is a test that reads the code itself and fails the build when a rule is broken. Today's first version asked each sheet file one question: "do you call the cap?" That sounds like the rule, but the rule is "the sheet is held to the column," and a file can call the cap, throw the answer away, and still pass. The fix was to make the guard follow the answer to where it gets used.

**Like:** an inspector who checks that a seatbelt is installed, not that it is buckled. The box gets ticked either way.

**In today's work:** `guards/sheetCap.test.ts:96`
`out.callsCap = styleAttrs.some(reachesStyle);` — the file only counts as capped when the cap's value shows up inside a `style=`, the thing that actually sizes the sheet. Before this line the guard was satisfied by the call alone.

**Why it matters to you as PM:** when a PR says "a guard enforces X," the question worth asking is whether the guard checks X or only something that usually comes with X.

**Check:** A future sheet calls the cap but puts it on the scrim (the dim layer behind the sheet) instead of the sheet. Does today's guard go red, and what would you see on the unfolded Duo?
