# Loose ends PR-08: the favourites shelf says rated meals, and a favourite needs a fresh rating

**Date:** 2026-11-10

Shaping row for CUL-1685, launched by /sweep. The Foods tab's favourites shelf read "Finished 29 of 29 meals" for a food logged 264 times whose ratings stopped on Aug 12, and it kept that favourite indefinitely.

**Shaped.** The code had two separate holes. The selector had no clock, so ratings counted forever. The shelf hid only on a decline `watch`, so it showed while the decline read was blind (`not_enough_data`, meaning fewer than 4 rated meals in 14 days). A decision brief with three options went to the issue; the PM typed `go 1`.

**Built (option 1).**
- The line reads "Finished X of Y rated meals".
- A favourite's newest rating at or before now must sit inside the decline detector's own 14-day window. The window length is pinned against the real `detectIntakeDecline`, so the two cannot drift.
- The shelf shows only while the decline read is `none` (the armed-twin rule from CUL-1683 DELIGHT-3). Any other status hides it, including an unknown one.

**Adversarial pass.** It held on every safety case. It found a future-dated rating (a year typo) passing the freshness gate. The fix ignores future rows for freshness but keeps them in the recency guard, so a future refusal still suppresses. Both directions are pinned by tests.

**Residuals.**
- All-time counts can outvote recent refusals of one food while the pet eats others normally. This was added as an instance on CUL-2699, the same class.
- Free-fed exclusion uses current arrangements, not historical spans. Parked on CUL-1685.

Shipped via the session's PR (`Loose ends PR-08: …`).
