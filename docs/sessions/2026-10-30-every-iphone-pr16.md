# Every iPhone PR-16: the Patterns ranges' tap areas, History's trial link and the Landing wordmark at the largest text

**Date:** 2026-10-30
**One thing (re-ask):** D3 L1 — Reading a test: a test of the instruction is not a test of the picture (from PR-12: today's wordmark test checks that the cap times the measured width fits 272pt; if iOS drew Newsreader 5% wider than Chromium, would that test go red, and what would catch it?) · check: pending
**One thing:** D5 L1 — What a reviewer looks for: the file the author never opened · check: pending

Shipped via #1362. Finishes CUL-2278.

## What shipped

- **Patterns' ranges draw with the shared `SegmentedControl`.** The local copy gave 36pt boxes 3pt apart a 6pt slop each, so a tap near the line between Week and Month could land on either. The shared control holds each range at 44pt with no slop. It gained an opt-in `stacked` prop so PR-13's column at the accessibility sizes holds; `TimeConfidenceField`, its other caller, is unchanged.
- **History's trial door never runs wider than its line.** `maxWidth: '100%'` on the door, so at AX5 on a 320 phone "Outside the trial diet ›" wraps inside its 44pt box.
- **The Landing wordmark caps at 3.1×.** Measured in Chromium against the shipped Newsreader file: "Culprit" is 84.4pt wide at 28pt, so 3.22 fills a 320 phone's 272pt column. 3.1 leaves room for iOS shaping. Every size through AX3 is untouched.

## Proof

Before and after captures of the five touched shots at all eight sizes (a local `history-juniper` shot added to a scratch copy of the capture script, which PR-17 owns). 32 of 40 are pixel identical. The eight that differ are exactly the allowed ones: the Patterns metric screen at every size (the ranges at 44pt with the shared style), the Landing at `320@3.571` and `390@3.571` (the cap), and History at the same two AX5 sizes (the wrap).

## What went sideways

The pre-push hook refused the first push: the style ratchet fell (two hand typed spacing sites and one radius left with the local control), and `app/insights/[metric].test.tsx` still asked for the ranges as tabs. The code reviewer named the second before the rerun did. Both fixed in the second commit.

## Teach

### One thing — What a reviewer looks for: the file the author never opened (D5, L1)
A reviewer is not checking that your change works where you looked. They are looking for where your change reaches that you did not look. Today the ranges changed from "tabs" to "buttons" for screen readers. The author updated the one test file beside the screen; a second test, on the route that wraps that screen, still searched for tabs and would have failed.

**Like:** renaming a street. You fix the signs on the street itself, and the reviewer is the one who asks which other maps print its old name.

**In today's work:** `app/insights/[metric].test.tsx:84`
`fireEvent.press(getByRole('button', { name: 'Week' }));` this line used to say `'tab'`; it lives in a file the change never opened, and it only broke because it reads the screen's role from outside.

**Why it matters to you as PM:** when a review lists a finding in a file the PR does not touch, that is usually the most valuable line in it, because nobody on the build side was looking there.

**Check:** if the shared control later changes its label size, which screens would a reviewer go looking at first, and why not just the control's own file?
