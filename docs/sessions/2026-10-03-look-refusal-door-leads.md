# The look's refusal door leads the compact set (CUL-1501, PR-23)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-23 of the Out of beta project. Shipped via #1028.

## What shipped

- `components/designV2/home/LookHeader.tsx`: the intake router (*Didn't eat ›* / *Left her food ›*) now renders first in the compact chip row, for both species, so it sits on the first row at any width. Before, it rendered after every head word and landed on the fourth row at 390pt, beside *More…*.
- *Nothing unusual* stays after the head words, before *More…*. The issue's fix line said to move the whole refusal fragment ahead of the words; that would have put the absence chip (a "nothing wrong" answer) first in the set. Splitting the fragment keeps the intake door leading and the absence from leading. Logged on the issue as a team call (Designer and Dr. Chen lenses).
- The constant `REFUSAL_DOORS_ON_FIRST_ROW` is renamed `REFUSAL_DOORS_IN_COMPACT_SET`. A row is a layout fact the code cannot see; the flag guarantees membership, and the reading order carries "first" (C-38). Option (b), both behind *More…*, still draws them in the door row, now door first, then the absence (it was the reverse; unreachable while the flag is `true`).
- Guard: a reading-order test over the rendered host tree, cat and dog, one pet and two. The door is index 0, every head word is drawn after it (positives included), and the absence follows every word. Two mutants (door moved back to last; absence moved ahead of the words) each red it.

## C-5

Every chip in the row, the intake door included, takes `HEADER_CHIP_SLOP` and shares the row's `columnGap` and `rowGap`, so the reorder changes which chips face each other and not the separation between them.

## Falsification

Sam's cat left her bowl: the first chip Sam reads is *Didn't eat ›*. A two-pet household reads *Left her food ›* first. Nothing in the clinical or statistical logic changed, so the adversarial line is N/A; `code-reviewer` read the diff.
