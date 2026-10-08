# FAB PR-23: the pills read like the record

**Date:** 2026-10-07
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1644 (PM ruling D3, CUL-1625), shipped via #1096.

**What shipped.** In `components/log/FAB.tsx` the recent-food pills name the food through `rowFoodLabelOf` (`lib/dayEvents.ts`), the mapper History uses, with the format as its own tag from `foodFormatTag` (`lib/foodFormat.ts`). The tag is a sibling that holds its width (`flexShrink: 0`, `maxWidth: '100%'`) beside a label that wraps to two lines, in History's tag register (textXS, tracked, `colorTextTertiary`) inside the mock's thin bordered box. The trailing ", Dry" / ", Wet" leaves the label because the tag says it, so wet and dry of one line read alike except for the tag. The pill's old second copy of the food label (brand and product joined by a bare space) is gone. The spoken label carries both halves ("Royal Canin · Selected Protein PR, dry") and the food pill gains the hint "Logs it for {pet} right away" (CUL-724's hint half; nyx-voice: the pet by name, the effect, no exclamation). More events, Loose stool, Vomit and Log food end in a `ChevronRight`, hidden from assistive tech on both platforms; food pills carry none.

**Proof.** Four tests in their own describe block. Dropping the tag's `flexShrink: 0` and dropping Vomit's chevron each red a test; restored. Typecheck and the guards suite (49 suites) green.

**The merge.** PR-11 (#1098) landed mid-session and appended its own describe block to `FAB.test.tsx`; both blocks kept. Its three fan-order expectations named foods by the old space-joined label and now take the mapper's separator ("Hills · i/d"); merge-check's REVIEW lists exactly those three lines, cleared in the PR body.

**CI.** The first push's `App (jest, non-UTC timezones)` failed under Kiritimati in `CoverageDoor.test.tsx:129`, a file this PR does not touch; it passed locally under that zone (alone and in a full run) and on `main` in the same window. Commented on the PR; the merge push re-ran it.

**Residual.** At the very largest Dynamic Type the tag holds and the label column squeezes hard inside the 300pt pill; the fan's height budget at large text is CUL-1636.
