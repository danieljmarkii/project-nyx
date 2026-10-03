# Sign-out clears the account's state from memory (CUL-1255, PR-17)

**Date:** 2026-10-03
**One thing:** S5 L1 — Device-local state and the sign-out wipe · check: pending

Shipped via #1021. A `/dispatch` child of *Out of beta — Noticed, Design v2, History v2, the trial screen*, row PR-17.

## What shipped

- **Found first:** the issue's headline fix had already shipped in #1000 (release QA 1.2.0, `3024d28`). `wipeLocalSession` resets `todayEvents` / `todayRead`, with a test. This session did the issue's other half, the `store/` sweep.
- **The sync banner's counts.** `syncStore.pendingCount / oldestPendingAt / quarantinedCount` survived sign-out, so the next account's banner said its entries were waiting. The wipe now zeroes them, which is accurate because the wipe has just emptied the queue.
- **The completion card's pending reveal** (found by `rls-privacy-reviewer`). The wipe cleared the moment store's state but not its `showTimer`, so a card presented with `delayMs` repainted the previous owner's record after the wipe. The wipe now calls `hide()` first.
- **The registry.** `lib/session.test.ts` reads `store/` from the directory and classifies every store as WIPED, RIDES or EXEMPT. A new store reds the build until someone decides whether it holds account state. The test states its blind spots: it checks names, not fields, and it scans `store/` only.

## Falsification

- Every new test was run red against its reverted line: the counts reset, the `hide()` call, and a probe `store/zzProbeStore.ts` for the registry.
- `rls-privacy-reviewer` returned FAIL (Low): the moment timer, fixed here.
- Its `signalAcknowledging` finding does not reproduce. `cancelPendingSignalRegens` clears that field (`lib/signal.ts`), and the CUL-642 test already asserts it.
- It also flagged that the registry's comment stripping missed block comments. Fixed.

## Residuals

- CUL-1543 (Low): an Ask answer that resolves after the wipe lands in the fresh store; `recoveryEmail` survives an abandoned reset.
- The race the reviewer traced: a `getSyncStatus` read that straddles the wipe could, in principle, re-post the old counts. Timing protects against it (four native awaits), not structure. Info only.

## Teach

S5, L1: **where an account's data rests on a phone, and why sign-out has to visit every place.**

Think of signing out as moving out of a flat. Emptying the wardrobe (the phone's database) is the obvious step. The tenant also leaves things in less obvious places: a note on the fridge, a parcel due tomorrow, their name on the post box. If those stay, the next tenant reads them. In the app, those places are the in-memory stores (what a screen is showing right now), timers set to fire in a moment, and small device files outside the database.

This session found two of them. One line from today's diff:

```ts
useMomentStore.getState().hide();
```

The "Saved to Mochi's record" card can be set to appear about half a second later. Clearing the card's contents emptied the fridge, but the parcel was still on its way: half a second after sign-out, the timer fired and put the previous owner's card back on screen. `hide()` cancels the delivery as well as the contents.

The registry test is the other half. It lists every store from the folder itself, so a store added next year fails the build until someone answers the question for it.

**Check:** a future feature keeps "the last three foods you searched" in memory so the search box can suggest them. Does sign-out need to clear it, and what would happen if nobody remembered to add it to the wipe?
