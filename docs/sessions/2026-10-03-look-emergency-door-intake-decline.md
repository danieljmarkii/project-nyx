# The look's emergency door reads the intake-decline flag as a refusal

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

A dispatched BUILD session, PR-13 of *Out of beta — Noticed, Design v2, History v2, the trial screen*. Shipped via #1026 (CUL-1372).

## What shipped

The Noticed card withholds a quiet look on three intake arms; the emergency door ("Signs that mean call today") folded in only the trial register and the refused-bowls arm. On the intake-decline flag alone, the card said eating needs attention while the door printed *Not eating for a day* as an unmet conditional. The PM ruled (a): the door must not read calmer than the card.

- `doorRecordRefusal(pet, facts)` in `lib/lookWithheld.ts`: arm 1 OR arm 3, positive-or-nothing (T-20), `false` for another pet's facts (C-9). Both `LookCard` and the Design v2 `LookHeader` pass it to `withIntakeRefusal`, so the two surfaces share one predicate.
- Tests: helper unit tests including an exhaustive property over arm 1 x arm 3 (the door escalates exactly when the card withholds on the record's arms); a component test on each surface, with a quiet-facts control on the header. Mutation proof: dropping arm 1 from the helper reds 5 tests; passing `false` at both call sites reds 3.

## Adversarial pass (PASS)

Tried: arm 1 alone with no refused bowls (door collapses); a throwing decline read, a failed meal read, a pet switch with the old pet's facts (no escalation). Found, and disclosed rather than fixed because the ruling accepts it: arm 1 fires on states that do not literally meet "not eating for a day", so the door now says *Call your vet today* for a cat whose mean intake falls to "some", a cat with one full and one refused meal today, one refusal of a usual food followed by up to about 48h of full meals of another (Trigger B), and a dog with two days of "most" plus lethargy. The card already withholds in each, so the door matching it is the ruling as written. Reversal is one line in `doorRecordRefusal`.

## Residuals

- CUL-1547 (filed): the open sheet keeps the facts from the moment it opened; a refusal logged while it is open updates the card, not the sheet. Pre-existing for arm 3 too.
