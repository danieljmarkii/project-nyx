# CUL-579 — sub-44pt tap targets on the capture hot paths

**Date:** 2026-08-24

Shipped via **#715** (draft). Three tap-target defects from the 2026-08-22 design/UX audit
(Jordan capture pass F1/F2/F8 + the QA lens), fixed in one batch PR on the
`Aug. 2026 Design Polish` track. No schema, no build-sequence step.

## What shipped

**FAB menu action rows — `minHeight: 44`.** `menuAction` was `paddingVertical: 8` around a
20pt glyph and a 15pt label: ~36pt, no floor, no slop, while the sibling `logForChip` three
style rules below it already set `minHeight: 44` under a comment naming the rule. The rule was
known; these rows missed it.

Fixed by growing the row rather than by `hitSlop`, and that choice is the interesting part.
These rows stack with **zero gap**, so any vertical slop would put neighbours' expanded
rectangles on top of each other and a tap near a boundary would resolve by z-order
(CLAUDE.md § CUL-612) — trading a reachability defect for an ambiguity one. On three adjacent
recent-food rows, an ambiguous tap logs the *wrong food into a diet trial*, which is worse than
a tap that misses. Growing the row is the only fix here that adds reach without adding
ambiguity. Cost: ~40pt of menu height across 5 rows, against a ~390pt menu, so it still clears
an iPhone SE.

**Adherence chips — `FilterChip`'s vertical-only `hitSlop`, plus two things the backport
needed.** The hand-built chip in `AdherenceChipRow` is geometrically *identical* to `FilterChip`
(12/6 padding, 1pt border, 13pt medium label) and sits on the same dark completion card, where
`FilterChip` already documents and applies exactly this fix. Backported as
`hitSlop={{top: 6, bottom: 6}}` — vertical-only, so the 6pt column gap is never shared and a tap
between `Missed` and `Refused` can't turn a pet-driven refusal into an owner-driven miss (§6.2,
the one distinction that row exists to keep).

Two additions on top of a straight copy:

- **The chip's height is pinned** (`minHeight: 32`) instead of inherited from the font's line
  box, so `32 + 6 + 6 = 44` is true by construction. This came out of a test failure, not from
  planning — see below.
- **The row's single `gap: 6` is split** into `columnGap: 6` / `rowGap: 12`. The row is
  `flexWrap: 'wrap'` and four 13pt chips do wrap on a narrow card or at large type; at that
  point 6+6 of vertical reach into a 6pt **row** gap makes the two wrapped *lines* share hit
  area. The same z-order defect, rotated 90°, and invisible in a screenshot.

**`TimeConfidenceField` value rows — the whole row is the button.** The four rows
(`Found it by` / `Around` / `From` / `To`) rendered a 44pt-tall box in which only the value
`Text` responded. Tapping the **label** did nothing — and the label is the more button-like
half, because it names what the row is for. The four call sites collapse into one local
`FieldRow`, backporting the shape the flag-on twin (`SimpleEventConfirm`'s `timeMain`) already
ships, which also gives these rows an `accessibilityRole` / `Label` / `Hint` they never had:
a screen-reader user previously found two adjacent texts and no button at all.

**Radio rows — a redundant `hitSlop` removed (PM-approved in session).** The three
`radioRow`s were already `minHeight: 44`, so their `hitSlop={8}` bought no reach; it only
pushed 8pt into the 8pt gap between them **from both sides**, letting a boundary tap select the
neighbouring confidence class by z-order. Here that silently swaps an honest window for a
guessed point, and the vet report prints the difference. Surfaced as a decision brief before
building (option A: fold in; option B: file separately); PM ruled **A**.

## The finding left open

The segmented control at the top of the same panel — **"Saw it happen" / "Found it"** — has
the same defect one level up and worse. Two `flex: 1` siblings sit flush with no gap, each
`minHeight: 44` *and* each `hitSlop: 8`, so they overlap in a **16pt band centred exactly on the
divider**. That is the top-level witnessed-vs-discovered classifier and the ambiguous band is
dead centre of the widget.

Not fixed here — that would have been a third widening of a PR the PM had already agreed to
widen once. Raised on #715 and on the issue for a call. The new test's "no shared reach"
assertion is scoped to the radio rows on purpose, with a comment saying why, so the file does
not read as if the segmented control had been cleared.

Found only because a test failed: an assertion that *no* touchable in the component carried
`hitSlop` came back with six nodes, and chasing them landed on the segmented control.

## What broke, and how

Two test failures, both of which changed the shipped code. Worth recording because both were
the test catching the author, which is the case that usually goes unrecorded.

**1. The 44pt arithmetic was wrong, and the fix was to stop doing arithmetic on a font
metric.** The first version of the chip test modelled the pill's height as
`6 + fontSize(13) + 6 = 25` and asserted `25 + 12 >= 44`. It failed at 37. The model had used
the *glyph size* where the **line box** belongs and had dropped the two 1pt borders; the real
chip is ~32 (which is what `FilterChip`'s own shipped comment says).

The tempting repair was to correct the constant to 32 and move on. But 32 is a *rendered font
metric* — jest cannot compute it, so the assertion would have been a number copied from a
comment, and a weight or dynamic-type change could drop these chips back under the floor with
every test still green. The Geist sweeps (CUL-364) have just been through this exact area.
So the height is **pinned in the component** instead: `minHeight: 32` makes the arithmetic true
by construction and assertable, is inert today (the chips already measure ~32), and remains a
floor, so larger type still grows the pill past it.

The general shape: *a tap-target floor resting on a metric no test can compute is a floor
nobody is actually holding.*

**2. The `TimeConfidenceField` tests passed against the pre-fix tree — green over the exact
defect they exist for.** This is the CUL-613 lesson arriving in person, and it was only caught
because the falsification step was run rather than assumed.

The tests pressed the *label* (`fireEvent.press(getByText('Found it by'))`) and asserted the
picker opened. Reverted to the pre-fix shape — where the label sits in no touchable at all —
three of the four still passed. A synthetic reproduction said a press with no handler above it
does nothing; printing the label's ancestry in the real tree confirmed no handler anywhere up
the chain. The explanation is that **RTL-RN's `fireEvent.press` does not merely bubble**: given
a node with no handler above it, it can still reach one by *descending from an enclosing
composite element* — here the `FieldRow` component wrapping both texts — so pressing the inert
label fired the value's touchable.

So `fireEvent.press` cannot prove that a particular region is tappable. The assertions are
**structural** now: walk up from each text to its nearest responder host and assert the label
and the value resolve to the **same node**, which is precisely what "the whole row is one
button" means and which node identity can prove. Re-falsified afterwards: all four now fail
against the pre-fix tree, and the radio assertion fails when the `hitSlop` is restored.

Every assertion in both new files was run against the tree it was written for. Each fails on
exactly the defect it guards and only that one.

## Decisions

- **The tool follows the geometry, not the habit.** `hitSlop` where a control is isolated with
  gaps to spare; `minHeight` where controls are flush or already at the floor. Stated in-place
  at all three sites, since the wrong one is invisible in a screenshot and reads as correct in
  review.
- **Pin the geometry a tap-target claim depends on**, so the claim can be asserted rather than
  eyeballed on a device.
- **Radio-row `hitSlop` removal folded in** (PM, option A) rather than filed separately.
- **Segmented-control overlap NOT folded in** — surfaced for a call instead.

## Tests

`components/log/AdherenceChipRow.test.tsx` (new, 6) and
`components/log/TimeConfidenceField.test.tsx` (new, 5). Full suite green: 263 suites / 5802
tests; `tsc --noEmit` clean.
