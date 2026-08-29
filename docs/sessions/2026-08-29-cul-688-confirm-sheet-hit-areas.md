# CUL-688 — two adjacent-control pairs stop sharing hit area on the confirm sheet

**Date:** 2026-08-29

Shipped via **#744**. Aug. 2026 Design Polish; sibling of CUL-612 / CUL-579 / CUL-657.
Files: `components/log/SimpleEventConfirm.tsx`, `components/log/SimpleEventConfirm.test.tsx`. No schema.

## What the issue asked for, and what it turned out to be

CUL-688 named one defect: the found-mode radio rows in the `log_picker_v2` capture sheet were
`minHeight: 40` + `hitSlop={8}` inside a 4pt-gap panel, so 16pt of facing reach crossed a 4pt
gap and the two rows shared a **12pt band** where a tap resolved by z-order rather than by
intent. The row was also under the 44pt floor, which is what made this *not* a repeat of
CUL-579/CUL-657: there the slop was pure overreach and could simply be deleted, here it was
carrying the floor.

Verified against the source before touching anything — the arithmetic in the issue was exactly
right. Fixed by **growing the box** (`radioRow` → `minHeight: 44`, `hitSlop` deleted), the shape
`menuAction` and `logForChip` already use. The floor is now true by construction and there is no
reach left to overlap with.

Grepping the file for the sibling of the defect — the same move that produced CUL-688 out of
CUL-657 — turned up **a second instance in the same file, on the higher-stakes control**: the
`Saw it` / `Found it` chips carried a flat `hitSlop={8}` across `chipPair`'s 4pt gap. Identical
arithmetic, identical 12pt band, but on the *top-level* witnessed-vs-discovered classifier rather
than the refinement below it. Presented as a decision brief (fold in vs. file separately, since
CLAUDE.md routes discovered scope to a new issue); **PM ruled A — fold it in**.

## The two fixes are different because the geometry is different

This is the CUL-579 "pick the tool by the geometry, not by habit" rule getting a clean worked
example, both halves in one diff:

- The **radios** were under the floor, in a panel with room to grow → grow the box, delete the slop.
- The **chips** are a 32pt pill in the design-locked round-4 FilterChip register. Their vertical
  slop is *load-bearing* — it is what carries the 44pt floor (32+8+8) — so deleting it drops the
  control under the floor, and growing the box to 44 changes the register the mock fixed. That
  leaves **asymmetry**: each chip keeps its vertical and outward reach and yields only the facing
  edge, half the gap each, so they meet at the midpoint and never cross. `HITSLOP_CHIP_LEFT` /
  `HITSLOP_CHIP_RIGHT`, the `lib/completionCard.ts` shape.

One deliberate improvement on that precedent: the halves are **derived from the one gap
constant** (`CHIP_PAIR_GAP`, which the style also reads) rather than restated as a literal, so
narrowing the gap narrows the reach with it instead of silently opening a shared band.
`completionCard` hardcodes its `PAIR_GAP_HALF = 4`; this does not.

## The third overlap, which the arithmetic found and nobody had filed

Doing the chips' four edges properly surfaced one the issue did not name and a screenshot never
would. The left chip's **outward** edge looks like free space and is not: `timeMain` is
`flexGrow: 1`, so it consumes the row's slack and `chipPair`'s `marginLeft: 'auto'` resolves to
**zero** — the two abut. (Flexbox resolves flexible lengths before distributing free space to
auto margins, so by the time the auto margin is considered there is nothing left.) Its neighbour
there is the Change-time control, which carries no slop of its own to yield back, so 8pt of a
control that **opens the time picker** was resolving to a control that **reclassifies the event**.
Flush neighbours get no reach at all, so the left chip yields that edge whole.

Checked and left alone, having read the real gaps rather than assuming: the header back button
(`hitSlop={12}` across a 16pt gap, non-touchable sibling), the `field` rows in `windowPanel`
(44pt, no slop), and the wrapped AC-CHIP state (`rowGap` 8 vs. the chip's 8pt vertical reach
against a slop-less neighbour — exactly abutting, not overlapping).

## Testing — the part worth repeating

Six new guards (five at first, plus the wrapped-state one the review earned), **each proven RED
one defect at a time** before being trusted, and the five original failures read as five distinct
statements (floor 40 < 44 · slop present · panel band 16 > 4 · chip band 16 > 4 · flush edge
8 > 0). Three behaviour tests were written to
pass on **both** sides of the change, so the preserved behaviour has a baseline — the
guard-vs-refactor-safety split, decided before writing rather than discovered after. One of those
three is load-bearing in its own right: it pins that the chips still clear 44pt through their
vertical reach, which is what made editing their slop safe.

Every assertion reads the **rendered** geometry and walks up from the label to its owning
touchable (`owningTouchable` / `commonAncestor`, ported from `TimeConfidenceField.test.tsx`).
Restating the tokens would assert only that two constants the test itself names still add up
(CUL-621), and `fireEvent.press` cannot prove any of it — it can reach a handler by *descending*
from an enclosing composite, which is how the first draft of the sibling file's tests went green
on an unfixed tree (CUL-613).

`tsc --noEmit` clean · touched suites re-run under the CI's three non-UTC zones (UTC+14 /
UTC+12:45 / UTC−10) · all three CI checks green on #744.

`main` moved twice under this branch while it was open (CUL-701, CUL-704), so it was merged in and
the whole suite re-run rather than trusting the earlier green: **280 suites / 6128 tests**, clean
`tsc`. Worth the re-run rather than a formality — CUL-701 touched `lib/eventTimeEdit.ts`, which is
exactly where this component gets `buildTimeFields` / `resolveFoundModeChange` / `refreshedNowPoint`
from, so the two diffs met in a real seam even though neither touched the other's lines.

## What the review changed

`code-reviewer` returned **ship-ready** with one finding worth taking, and it is the same
discipline this session was applying on the other axis. `CHIP_REACH` was a bare `8` that happened
to equal `theme.space1` — the token behind `timeRow`'s `rowGap`, which in the **wrapped** AC-CHIP
state is the whole of what separates the chip pair from the Change-time control above it. Two
independently-written 8s holding by coincidence, and narrowing the row's gap would have reopened
this very defect *in the wrapped state alone*, where nothing was looking.

Fixed by deriving it (`CHIP_ROW_GAP`, which the style also reads) and adding a sixth guard. Worth
recording *why* the derivation alone was not enough: the reach is bounded on **both** sides at
once — at least 6, or the 32pt pill stops clearing the 44pt floor; at most the row gap, or it
reaches into the neighbour. A naive derivation trades one defect for the other. So both bounds are
guarded, and the two mutations land on opposite guards: breaking the link (a bare `12`) reddens
only the wrapped-state guard, and narrowing the gap to 4 (reach following it down) reddens only the
floor guard. A token change that makes the two incompatible now fails the build instead of quietly
picking a side.

The review also independently walked the flexbox algorithm and **confirmed** the abutting claim
behind fix 3, with a caveat worth carrying: jest runs no Yoga pass, so the guard infers a zero gap
from the *absence* of a `gap`/`columnGap` token rather than measuring one. That is a sound proxy
here — and it can only ever force the conservative `left: 0`, never green-light a real overlap —
but the *reason* `left: 0` is right is architectural reasoning, not something the suite measures.
Said plainly here so the pattern is not cited elsewhere as though it were.

Left undone, filed rather than folded in: `owningTouchable` / `commonAncestor` are now copy-pasted
in a third test file (CUL-710).

## Why this was record fidelity, not polish

Both pairs classify the same thing at two levels: the chips choose witnessed vs. discovered, the
radios refine a discovery into open-ended vs. two-sided. A boundary tap resolving by z-order
silently swaps one `occurred_at_confidence` class for another — the B-448 leak class — and the
vet report prints the difference. This is also the **flag-on, shipping-forward** surface (B-745's
sheet), so it outlives the `TimeConfidenceField` path it mirrors.

Worth naming for the next session in this class: an overlap is **invisible in a screenshot and in
a diff**, and both instances here shipped through a well-covered component with the reviewing
convention already written down in CLAUDE.md. The grep that found the second one took thirty
seconds. Reaching for it by default, rather than fixing exactly the lines an issue cites, is
what turned a one-line ticket into a complete pass over the file.
