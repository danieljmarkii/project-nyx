# FAB PR-12b: a deleted past meal reaches the fan's recent foods at once

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1665, shipped via #1112. Plan-gated (it changes `lib/undoLog.ts`, the one shared reversal, C-20); the plan went on the issue and the PM typed the go in session.

**What shipped.** `store/recordChangeStore.ts`, a data-free counter in the `foodLibraryStore` shape. `reverseLoggedEvent` raises it right after `softDeleteEvent` lands, beside `noteRemoval` and under the same rule, so a reversal whose local write threw never signals. The FAB's day-bounded recent-foods read takes the counter as a trigger, so a past-day meal deleted from its record leaves the fan before the next open, as an archived food already did. Nothing re-reads under an open menu; the close does.

**Why not `hydrationTick`.** That tick re-reads Home, Trend and History. The counter's only subscriber is the FAB, and each reversal costs one closed-menu `getRecentFoods` read.

**The guard that caught a step.** `lib/session.test.ts` (CUL-1255) reds on any new store not classified against the sign-out wipe. The counter holds no rows, so it went into EXEMPT beside `foodLibraryStore`.

**Proof.** Typecheck clean; full jest green (14,380). Both halves proven by mutation: dropping the FAB's trigger reds the new FAB test, dropping the raise reds the new `undoLog` test.

**Deploy.** `lib/undoLog.ts` and the new store are outside every Edge Function's import closure, so the merge redeploys nothing.

**Residual.** The FAB test drives the counter directly rather than through the real `reverseLoggedEvent`; the composition is covered by the two halves' tests, not one end-to-end test.
