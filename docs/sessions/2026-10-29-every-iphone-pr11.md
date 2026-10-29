# Every iPhone PR-11: short screens, and folding the Duo with something open

**Date:** 2026-10-29
**One thing (re-ask):** G5 L1 — A required check blocks the merge; a reported one only tells you (from PR-02: this PR adds a capture of Home at the end of its scroll, on the reported job; if a later PR hid Home's last card under the + on the SE and every test passed, could it merge?) · check: pending
**One thing:** D3 L1 — Reading a test: to prove something survives a fold, the test has to fold · check: pending

Shipped via #1351. Finishes CUL-2246.

## What shipped

- **One height rule for sheets on short screens.** Beside PR-08's width cap, `hooks/useLayoutClass.ts` gains `sheetMaxHeightFor`: below the 700pt short line a sheet may stand to just under the status bar, less a 48pt strip of scrim, and its scrolling part gives up the difference. Above the line it answers nothing, so every taller phone keeps the sheet it had. The log sheet, the pet switcher and the exposure reason sheet take it.
- **A fold keeps the owner's place.** The food photo carousel and the full screen photo viewer both lost the photo on screen when the window changed width: the carousel kept a scroll position written in the old width, and the viewer jumped back to the photo that was tapped. Both now re-anchor on the photo the owner is on.
- **The + menu's slide drops stale frames.** A fold under the finger now clears the pill positions measured before it.
- **Home needed nothing.** The + disc's top sits 47pt above the bottom of Home's scroll at every height and Home pads 96pt, so the last card always clears it at the end of the scroll. A new capture shows it at every size instead of asserting it.

## What broke and how

- **The issue's list was partly already true.** The sheet travel and the fan plan were already re-read on every render. They got tests that pin it rather than code that restates it.
- **A test's mock leaked into the next render.** Swapping the window hook for a stub mid test, then restoring it while a late update was still coming, made React see a different list of hooks. Unmounting before the restore fixed it.
- **The reviewer's tidy suggestion would have broken a guard.** Reading the window width straight off the FAB reds `guards/windowWidth.test.ts`; the sanctioned `useWindowFrame` stays.

## Residuals

- Whether a sheet's list actually shrinks under its cap is a layout fact jest cannot compute; the captures and the device check (CUL-2247) carry it.
- The fan itself is not photographed (it does not open on the web build).

## Teach

### One thing — Reading a test: to prove something survives a fold, the test has to fold (D3, L1)
A test only proves what happens in the world it builds. Most screen tests build one world, a phone of one size, and check it. That proves nothing about a phone that changes size while a photo is open, because that test never changed size. So today's tests change the pretend window halfway through, then check the photo on screen is still the right one.

**Like:** testing a cup by filling it proves it holds water. It says nothing about whether it holds water when you tip it, until you tip it.

**In today's work:** `components/food/PhotoCarousel.test.tsx`
`dims.mockReturnValue({ width: 466, height: 678, fontScale: 1, scale: 3 });` — halfway through the test, the pretend window turns into a folded Duo. The test checks afterwards that the carousel scrolled to the third photo at the new width. With the fix deleted, this line is where it goes red.

**Why it matters to you as PM:** when an acceptance criterion says "survives a fold" or "after a resize", ask whether a test *does* the resize. A green suite of one size tests says nothing about it.

**Check:** Picture a test that opens the photo viewer on the second photo and checks the second photo is on screen. Would it have caught today's bug, where a fold sent an owner who had swiped on back to the photo they first tapped? Why?
