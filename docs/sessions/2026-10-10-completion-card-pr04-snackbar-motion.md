# Completion card PR-04: the Snackbar takes the card's entry and exit

**Date:** 2026-10-10
**One thing:** D4 L1 — A mutant that survives can be the test's blind spot, not the code's · check: pending

Dispatched session (`/dispatch`, row PR-04), CUL-1714, shipped via #1153. Project *Completion card: daylight and motion*, spec `docs/nyx-completion-card-requirements.md` v1.1 §2.3 and §3 item 4.

## What shipped

- `components/ui/Snackbar.tsx` enters as the card does (opacity over `groundInMs`, a `riseFromPt` rise on `riseSpring`) and leaves as the card does (opacity and an `exitDriftPt` drift over `exitMs`, in cubic). Reduce Motion is a crossfade over `crossfadeMs` in and opacity alone out; the old code snapped to a static frame. Every number comes from `COMPLETION_MOTION` / `EASE`. The header's "same slide-up spring" clause is rewritten.
- The rise and the drift are two `Animated.Value`s summed, mirroring the card's hook, so an exit begun mid-rise stops the rise where it stands.
- Edges only: nothing animates on mount, and a second `show()` over a visible Snackbar swaps words without replaying the entry.
- `components/ui/Snackbar.test.tsx`: seven tests over the entry, exit, mount, second show, re-entry and both Reduce Motion halves.

## Decisions

- The card's `useCompletionArrival` hook is not reused. The Snackbar has two beats (ground fade, rise) and none of the mark, words or halo machinery, so a local effect reading the shared constants is the honest size. Constants still come from one module (C-30).
- Reduce Motion exit uses `exitMs` with `EASE.exit`, matching what the card's hook does in its `still` variant, not `crossfadeMs`.

## What broke and how

- The first mutation pass left the "drift reset on re-entry" mutant alive: native-driver `Animated` values never move under jest, so the drift was always 0 and the reset was untested. The re-entry test now makes the exit's two timings jump to their end frame, asserts the drift is there (`riseFromPt + exitDriftPt`), then asserts a fresh show starts at `riseFromPt`. The mutant is red.
- A `tsc` error (implicit `any` in a test predicate) blocked the pre-push hook once; fixed before the first push.

## Residuals

- The Snackbar's missing screen-reader announcement stays CUL-1709.
- The spec's Read-These row is CUL-1740, untouched here.
- §4 rows P5 (entry and exit) and 9 run on the PM's next build.

## Teach

### One thing — a surviving mutant can be the test's blind spot (D4, L1)
To prove a test works, we break the code on purpose and check the test goes red. Today one break survived: the test passed with the code wrong. That did not mean the code was fine; it meant the test could not see the thing it was meant to guard, because in the test world the animation never actually moves.

**Like:** testing a smoke alarm in a room with no air flow. The alarm stays quiet, but only because the smoke never reaches it.

**In today's work:** `components/ui/Snackbar.test.tsx`, the re-entry test
`timing.mockImplementationOnce(jump).mockImplementationOnce(jump);` makes the exit jump straight to its last frame, so the slide down really happens in the test, and the reset that undoes it can finally be checked.

**Why it matters to you as PM:** when a PR says a guard was "proven by mutation", a mutant that survived is a finding about the test, and the honest fix is to change the test, not to accept the green.

**Check:** if the re-entry test had been left as it was, what would happen on a phone if someone later deleted the drift reset?
