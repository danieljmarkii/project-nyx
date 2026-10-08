# FAB PR-12: the recent foods keep one order for the day

**Date:** 2026-10-08
**One thing:** none (dispatched session)

Dispatched build of CUL-1647, plan-gated (Gate: clinical); the PM's go was typed in session. Shipped via the PR on `claude/fab-pr12-10080019`.

**What shipped.** The FAB's three one-tap recent foods read over the 14 local days before today's local midnight (`lib/fabRecentFoods.ts`), so nothing logged today moves a pill and the order changes only when the day does. `getRecentFoods` gains an optional `bounds` argument; its SQL moved to `recentFoodsQuery` (`lib/foodQueries.ts`) so it runs against a real engine, with the bounds compared through `julianday()` (C-40). Without bounds the picker's and the intake prefill's read is unchanged, pinned by a test. The FAB re-reads on its PR-11 triggers plus `useTodayKey` (local midnight and the foreground), the food library's change counter and the sync tick, never while the menu is open; only the newest read's answer lands.

**The window.** Data Scientist: 14 local days, on the asymmetry of the two errors (a missing food costs one tap through the picker; a stale pill costs a re-exposure logged into a trial). PM approved re-reading with fixed day bounds over freezing the list, so corrections leave the fan the same day.

**Reviews.** Code review: ship-ready, one ordering finding (fixed: a sequence token). Adversarial review: FAIL on one item, an archived food stayed a pill on the next open because nothing re-read; fixed by making the library counter a trigger, and proven by mutation. Held: UTC+14, −10 and DST bounds; mixed ISO spellings at a bound; pet switch; menu open across midnight.

**Filed.** CUL-1665: the shared reversal raises no change signal, so a past meal deleted on this device leaves the fan at the next close or sync rather than before the next open.

**Residual.** A pre-trial food last eaten the day before a trial starts stays a pill for up to 14 days; only trial awareness (CUL-416) closes that. A Postgres `+00` text spelling would read as NULL under `julianday()`; no writer produces it today.
