# Run open PR-07: the run opens on its own motion

**Date:** 2026-10-10
**One thing:** D4 L1 — A test that survives a deliberate break is the test's blind spot, and the fix is a new assertion · check: pending

Dispatched session (`/dispatch`, Run open PR-07), BUILD mode on CUL-1734. Shipped via #1170.

## What shipped

- `components/motion/runOpenMotion.ts` (`useRunOpen`): a run-only sibling hook (C-30), with the beats of §02 and §03 of `docs/culprit-run-open-mockups.html`.
  - **Open:** the chevron turns 180° over 200ms. The lead grows linearly over 80ms out of the run's bead. The box mounts shut, then one configured commit (`RUN_OPEN_LAYOUT`: ease out, delay 80, 240ms) lets it go. Each meal lands as the edge reaches it, capped at 250ms. At rest by 320 / 385 / 400ms for 2 / 8 / 12 meals.
  - **Close:** `RUN_CLOSE_LAYOUT` runs from t=40 over 200ms. The words leave over 100ms, the lead retracts from t=200 over 80ms, and the box unmounts at 280ms.
  - **Reversal:** a turn from the frame on screen, over the elapsed time (120ms floor).
  - **Reduce Motion:** the box at once, a 150ms crossfade, and the chevron swaps.
- `components/dayRow/SpineNodeRow.tsx`:
  - The run rides `useRunOpen` on Home and History.
  - The chevron is one glyph, rotated rather than swapped.
  - The lead is a frame no layout touches, drawn over the header's thread from the bead's foot.
  - Each meal has its own animated wrapper, never remounted.
  - The box's line is `colorAccentGlyph` and ends at the last meal's bead. The shipped path (`openInPlace` off) is untouched.
- `guards/haptics.test.ts`: `runOpenMotion.ts` is added to ALWAYS_SCANNED.
- `components/designV2/home/TodayCard.test.tsx` now reads the new open.

## Decisions

- **C-34:** the box gets its own no-overshoot configs. `UNFOLD_LAYOUT` stays as it is, because the daily look and a read's arrival still ride it.
- **The open is two commits:** a shut mount, then a configured release one frame later. A layout config cannot animate a view on the commit that creates it, so the box has to exist at zero height first. The 80ms wait is the config's `delay`, as ruled; the one-frame timer only lets the shut box land.
- **Layout reports only write refs:** the header's height, the stage's height and each meal's top. They freeze onto the machine's own commits. A code-review pass found that a live `setHeaderH` could re-render under the lead's in-flight scale when the run is the list's last node: the header grows as it yields its edge, and Fabric snaps a view whose frame changes under a native transform. Fixed and proven by mutation.

## Tests and proof

- `runOpenMotion.test.ts` covers:
  - the beat order at 2, 8 and 12 meals
  - the budget
  - the configs
  - close
  - a close after a fresh open
  - reversals both ways and the 120ms floor
  - the geometry walk with a second tap at every 10ms of both directions, plus the clip only in flight
  - a header layout report mid-flight
  - Reduce Motion, blur, re-key and reset
- The row suite covers element identity across phases, the lead's frame, the line's foot, the chevron turn, budgets at 2, 8 and 12 meals, VoiceOver, and the shipped path.
- **Mutation (C-18):** 17 mutants, all red. One survived on the first pass: a reversal that jumps the values to the end before turning. That got its own assertion.
- **Full suite** at the first push: 646 suites, 15,924 tests green.

## Residuals

- The jest timing stub cannot replay the native driver's "reverse from the current value", so the look of a reversal rides the device sitting.
- A meal logged into a run while it is opening appears without its staggered landing.

## Teach

### One thing — A survivor shows where the tests are blind (D4, L1)
To trust a test, you break the code on purpose and check that the test goes red. Today we broke the new motion seventeen ways. Sixteen breaks turned the tests red at once. One did not: making a second tap snap every meal to "fully shown" before turning round. Every test still passed, because none of them looked at where a meal stood at the instant of the second tap. So that break showed a hole in the tests, not in the code. The fix was one new check.

**Like:** a smoke alarm drill. You light a match under every alarm in the house. The one that stays quiet is not proof the room is safe. It is the alarm you have to fix.

**In today's work:** `components/motion/runOpenMotion.test.ts`
`expect(valueOf(v.members[11].opacity)).toBe(lastBefore);`
This line says: right after the second tap, the twelfth meal is exactly as faded as it was a moment before. Nothing jumped to the end first.

**Why it matters to you as PM:** when a PR says "each guard proven by breaking it", the survivors are where the value is. A PR that reports zero survivors on its first try may have broken only the easy things.

**Check:** If someone later changed the code so a second tap first snapped the box fully open, then closed it, which would you expect to fail: the test that counts layout configs, or the one above? Why?
