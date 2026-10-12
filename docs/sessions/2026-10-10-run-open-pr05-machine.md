# Run open PR-05: the open-in-place machine stops jumping

**Date:** 2026-10-10
**One thing:** D4 L1 — Guards: a rule's test counts only once breaking the rule turns it red · check: pending

Dispatched session for CUL-1721, BUILD mode, branch `claude/run-open-pr05-10101739`. Shipped via #1162.

## What shipped

The shared open-in-place machine (`components/motion/openInPlaceMotion.ts`) behind Home's and History's grouped meals lines and the Patterns month's day:

- **No flow-geometry change without a layout config in the same tick.**
  - The slot's mount rides a new `LEAD_LAYOUT`, sized to land just as the box's spring begins.
  - The close takes the box to zero in its one `FOLD_LAYOUT` commit. The lead band used to be left behind and removed bare at about 510ms.
  - The empty slot leaves on `TAIL_LAYOUT`.
  - The row above yields its bottom edge (`membersBelow`) inside those configured commits, which removes the last node's 14pt jump.
- **The slot clips while in flight** (`clipped`).
- **A close after a fresh open uses the box's real height.** Fabric reports committed layout, so the box's height arrives on the `opening` commit.
- **A second tap reverses from where it is.** Fabric starts a configured commit from the frame in flight, so each reversal is either a configured commit or a commit with no geometry in it. It never settles the transition and starts a fresh one.
- **The rail and the members' stage keep one element type across phases**, in `SpineNodeRow` and the month. Nothing remounts, so VoiceOver focus survives.
- **History's scope change resets every run with no choreography**, through the new `OpenInPlaceReset` context.

`UNFOLD_LAYOUT` and `FOLD_LAYOUT` are untouched, so the daily look and a read's arrival keep theirs. The bounce, the line's pop and the chevron remain PR-07's (CUL-1734).

## How it was proven

- The hook's new guards run `Animated.timing` on the fake clock and advance one millisecond per `act`. Without that, jest's native driver ends each beat in the tick it starts, and React batches a long tick into one render. Either one hides the very commits the guard inspects.
- The walk asserts that every render whose flow geometry changed was preceded by a fresh `configureNext`. It runs over a full open and close, and over a second tap at every 10ms of both directions.
- Nine mutations of the source, each red:
  - lead commit bare (102 failing)
  - tail commit bare (49)
  - band left at 44 (2)
  - no clip (3)
  - slot height recorded only in `open` (1)
  - finish-first on a flip (10)
  - stage unwrapped at rest (3)
  - reset animating (1)
  - `membersBelow` held to unmount (1)
- `TodayCard.test.tsx` had pinned the bare lead commit on Home. It now names `LEAD_LAYOUT`.
- Full jest suite green locally. `tsc` clean.

## Review

The `code-reviewer` subagent found no bug.
- **History's reset dependencies:** it asked whether the effect's `reload` and `cancelFold` are stable. Both have empty dependency lists, so the reset fires only on a new request.
- **The rail on a fresh open:** it noted the rail still holds 44pt through the spring and snaps to full length at idle. That is the line's pop, PR-07's by the D1 ruling.

No adversarial review is required: this is motion only, with no clinical or statistical logic.

## Residuals

- Filed CUL-1757: a run whose id changes snaps shut, and an open during the first paint can snap `ThreadDraw` back. Both were named by the convening, both are out of this row.
- The feel (Fabric's from-the-frame reversal, the committed-layout claim) is only checkable on a phone. It rides the next TestFlight cut's device sitting through the QA script in #1162.

## Teach

### One thing — Guards: a rule's test counts only once breaking the rule turns it red (D4, L1)

A guard is a test that holds a rule in place, so the next change cannot quietly break it. A test that passes proves nothing on its own: it might be checking something that was never at risk. So every guard here was proven by doing the forbidden thing on purpose, running the tests, watching them fail, and then putting the code back. If breaking the rule had left everything green, the guard would have been decoration.
**Like:** testing a smoke alarm by holding a lit match under it. Its green light tells you it has power. Only the beep tells you it would catch a fire.
**In today's work:** `components/motion/openInPlaceMotion.test.ts`, the walk
`if (a.geometry !== b.geometry && b.calls === a.calls) bare.push(...)`. In words: if the layout moved between two frames and no animation was set up in between, that is a jump, so record it. Deleting the one line that sets up the open's animation made 102 tests fail. That failure is the proof the guard sees jumps.
**Why it matters to you as PM:** when a PR says "guarded", the question to ask is "what did you break to prove it?", because an unproven guard is a promise nobody has checked.
**Check:** a guard passes today, and someone adds a new way for the run to open that skips the animation setup. Does the guard catch it, and what would you need to know about the guard to be sure?
