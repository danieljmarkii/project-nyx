# The gap warning sat flush against the hairline under the Signal's rows (CUL-2230)

**Date:** 2026-10-28
**One thing (re-ask):** D3 L1 — A test that looks for something it cannot see passes by not looking (from 2026-10-27, the moon watermark: the moon is hidden from VoiceOver and the test's search skipped hidden things; had the code drawn the moon on a full day, what would that first test have said, and why?) · check: pending
**One thing:** D3 L1 — Reading a test: a test that compares two real things catches the day one moves without the other · check: pending

Shipped via #1343.

## What happened

The PM sent an iPad screenshot of Home and asked why the spacing between "Vomiting soon after meals" and "Gaps between vomiting episodes are getting shorter…" felt tight and off. A question first, then "ship the spacing fix", then `/wrap and merge`.

**Root cause.** The gap warning is drawn by `GapWarning` in `components/home/SignalZone.tsx`, which was built for the quiet states (CUL-1838, round 7 of the Signal mock): there it fills the whole card, sits under the zone label inside the card's 16pt inset, and needs no padding of its own and a rail the full height of the line (`quietRow` carries no padding; `quietRail` runs `top: 0, bottom: 0`). CUL-1941's second shape also drew it under the live stack, behind a bare `<Divider />`, so it never took the row rhythm every `SignalRow` has (`paddingVertical: theme.space1`, its rail inset by the same). Round 7 drew only the quiet placement, so nothing checked the live one.

**Measured off the screenshot** (2.375 px per pt, from the card's 16pt inset): the hairline had about 10pt of air above it and about 4pt below, the 4pt being only the serif's own leading. The rail above stopped 8pt short of the line; the gap rail started on it. The foot also sat 8pt under the gap row where it sits 16pt under any other row. It was not the iPad: spacing is in points, so a phone shows the same.

## What shipped

- Under the live stack, the warning and its unanswered read ("Couldn't check…", CUL-1943) sit in one slot, `gapUnderStack`, carrying the row's vertical padding. Text and rail now sit a `space1` clear of each hairline exactly as a `SignalRow`'s do, and the foot is back to 16pt below. The quiet placement is untouched.
- `SignalRow`'s two rails and the gap rail gained `testID`s so a test can read their geometry. Nothing else in `SignalRow` changed.
- The test (`components/home/SignalZone.test.tsx`) reads the padding and rail insets off a rendered `SignalRow` and off the slot and demands they match, top and bottom. It never types a number, so a later change to the row's rhythm that the warning does not follow turns it red. It went red on the pre-fix tree and on three breakages: the slot at `space0_5`, the gap rail inset at `space1`, and the row's padding moved to `space2` with the slot left behind. The quiet loop asserts no slot.
- Checks: typecheck clean; the full suite 762/762 locally; the push hook's 84 related suites; CI green on the fix commit (all five checks, layout captures included).

## Decisions

- **Spacing now, face later.** The serif under the live stack reads as a second headline under the rows' sans. That is a visual call, so it was parked as CUL-2231 with both options to draw side by side, never changed in words alone (Mock what you change).
- **The empty-stack edge stays as it is.** When an untitled safety finding holds `live` and the stack draws nothing, the divider still sits above the warning with no row above it. It is reachable only through a type the code names as dark (`weight_loss`), and it belongs with the work that gives that finding a face, so it was noted on CUL-1946 rather than folded in.
- **No adversarial pass.** No clinical or statistical logic changed: the live branch draws the same two rows on the same conditions, so the warning cannot drop.

## What broke, and how it was found

- One Signal test failed on the very first, cold run and never again in seven later runs (one with `--no-cache`, one the full suite). Its name was not captured, so it stands in the PR as an unexplained one time failure rather than a cleared flake.
- The push sat in the pre-push hook for several minutes while the full suite ran beside it, and the stop hook flagged the commit as unpushed meanwhile. Nothing was lost; the hook passed and the branch landed.

## Residuals

- CUL-2231: the warning's face under the live stack (display serif or the row's sans), Backlog, `Gate: design`.
- CUL-1946 (comment): the divider above an empty stack.
- CUL-1370 (comment): its description still says the warning reaches no owner, which stopped being true with CUL-1941; what remains there is the finding's own title rule and row face.
