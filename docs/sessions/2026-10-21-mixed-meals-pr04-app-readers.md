# Mixed meals row 4: the app reads a bowl (CUL-2053)

**Date:** 2026-10-21
**One thing (re-ask):** D4 L1 — A test is proven by breaking the code it guards (from 2026-10-21, row 3: the first fixture for the reversed check stayed green with the bug put back; what would that have told you about the fix?) · check: pending
**One thing:** D5 L1 — A review finding is a claim to check, not an order: today one was true and one was not · check: pending

Shipped via #1272. Dispatched row, `Teach: yes`, plan-gated (clinical), the PM's go typed in session. The PR body is the record of what changed and what review found; this file carries the teach.

## What review changed

Three reviewers ran: an adversarial pass, a product walkthrough of History and the trial card, and a code review. The first adversarial pass found two quiet paths. One was in this row's own code: re-running the heads-up over an edited bowl replaced the card's warning, so Undo gave back the wrong food. The card now keeps the warning it shows. The other was older: a dog that refuses its new food after a mixed switch stayed silent on the phone and the server alike. Both detectors now count the earlier mixes, in lockstep (CUL-2083). The second pass found the latent half of the first fix, which cannot happen until row 5 gives the writer a screen. It is filed as a gate on row 5 (CUL-2086).

## Teach

### One thing — a review finding is a claim to check, not an order (D5, L1)
A reviewer, human or AI, reads code and says "this is wrong because X". That sentence is a prediction about what the code does, and it can be right or wrong. The job is to check the "because" against the code before changing anything. Act on a true finding, and answer a false one with what you found.

**Like:** a mechanic says the brakes are worn because the car pulls left. You still look at the pads before paying for new ones; it might be the tyre pressure.

**In today's work:** `components/profile/AddTrialFoodSheet.tsx:19`
```
// write path's whole safety property (`allowed_from` = today, never `started_at`)
```
The product review said the heads-up's "Add to the trial list" button would wipe a past exposure out of the trial record. This one line refutes it: a food added to the list counts as allowed only from today, so the bowl fed earlier stays an exposure. The same review's other claim, that "ending it here" points at a button the card does not have, was true, and it is filed as CUL-2084.

**Why it matters to you as PM:** when a review summary lands in a PR, the useful question is which findings were checked against the code and which were taken on trust.

**Check:** The adversarial pass said a dog's refusal goes silent after a mixed switch. Before fixing it, what one thing would you want to see to know the claim is true?
