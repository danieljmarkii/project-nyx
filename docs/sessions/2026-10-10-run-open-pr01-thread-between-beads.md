# Run open PR-01: the day's thread between beads (CUL-1718)

**Date:** 2026-10-10
**One thing:** D3 L1 — Reading a test: a test that cannot see the screen checks the numbers that draw it · check: pending

Dispatched session, Run open PR-01. Shipped via #1158.

## What shipped

- `components/recap/DaySpine.tsx`: the bead column in `SpineRowFrame` now stretches (`alignSelf: 'stretch'`). Under the row's `alignItems: 'flex-start'` it had been only as tall as the dot, so both thread segments were boxed into 14pt and the dot covered all but a 3pt stub. The bottom segment now runs through the row's 16pt bottom padding (`bottom: -ROW_GAP_PAD`), which is one constant shared with `styles.rowGap` so the carry cannot drift from the gap it crosses. The last row still has no bottom segment. Home, History and the Daily Recap all draw this frame, so all three move together.
- `components/historyV2/DayCard.tsx`: History's date-only items (a visit, a call, a course start) already stretched their rail; their `threadBottom` now carries through the same padding, read from `SPINE_THREAD.rowGapPad`.
- `components/motion/ThreadDraw.tsx` is untouched: its drawing line leaves when the draw ends on the premise that the rows' own segments take over, and that premise is now true.

## Decisions

- The pad rides on `SPINE_THREAD` rather than as a new named export. `guards/dayRowOneWay.test.ts` keeps an allow-list of what Home and History may import from the row's module, and that list is an exemption registry (C-32): adding an entry to it widens the hole. `SPINE_THREAD` is already admitted as "where the thread itself runs", and the carry is exactly that, so nothing new is admitted.
- The test renderer does no layout, so the tests pin the arithmetic instead of pixels: the column stretches, the bottom segment's `bottom` equals minus the row's own rendered `paddingBottom`, the next row's top segment starts at 0, and the first and last rows lack their outer segments. Five mutations (remove each stretch, zero each carry, draw a segment on the last row) each turned exactly one test red.

## Found, not fixed

- A daily look on History sits in a 44pt door its row does not fill (the look row has no `itemRowFill`, unlike the visit and call), so the thread under a look stops about 10pt short of the next bead. Filed as CUL-1751; the dispatcher held this PR to the rail styles, and the look threading in that file is PR-02's.

## Residual

- The look on a phone (default and largest text size, Home, History, the Recap) rides the next TestFlight cut's device sitting, per the issue's comment. The QA script is in the PR body.

## Teach

### One thing — A test that cannot see the screen checks the numbers that draw it (D3, L1)
Our component tests run without a screen. They build the tree of boxes the app would draw, but nothing measures how tall any box ends up, so a test cannot ask "is there a grey line between these two dots?" What it can ask is whether the instructions that produce the line are right: does the column stretch, and does the line reach exactly as far as the gap is deep. If those numbers are right, the phone draws the line; the phone check is what proves the picture.

**Like:** checking a recipe's quantities instead of tasting the cake. You can prove there are two eggs and 200 grams of flour without an oven, but only baking tells you it rose.

**In today's work:** `components/recap/DaySpine.test.tsx`
`expect(bottom.bottom).toBe(-(row.paddingBottom as number));`
The line's foot must sit below the row's content by exactly the row's bottom gap, read from the row itself rather than retyped, so the two cannot drift apart.

**Why it matters to you as PM:** it is why this issue closes on a QA script plus a device sitting: the tests prove the recipe, and only your phone proves the cake.

**Check:** If someone later changed the gap between rows from 16 to 20 points but forgot the line, would this test catch it, and why?
