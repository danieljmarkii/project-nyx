# The trial screen's three rulings: the free-fed watch line, the overrun food door, the refusal-face wording (CUL-1339, PR-41)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-41 of the second Out of beta project. Shipped via #1035.

## What shipped

- **Item 3** (`lib/dietTrialCard.ts`, the `free_fed` register's lead): it now ends *The bowl also can't tell you if {pet} stops eating. That part is yours to watch.* It is in the resolver, so the Pet tab card, the trial screen and Get ready's *is she eating it* answer all carry it. The mock's version used "she"; the shipped copy names the pet instead. Its "It" had no clear antecedent, so the subject is "the bowl". A test pins the line against the reassurance vocabulary and `!`.
- **Item 4** (`lib/trialScreenModel.ts`): the screen draws *What {pet} can eat* on `overrun`, gated `!safety`, with the card's own label (`viewAllowedFoodsAction`, now exported). The card is unchanged, so flag-off stays identical. The milestone has no door. Proven by mutation: removing the branch reds the new test.
- **Item 1**: no code. The screen already kept the card's *Tell Culprit what's next* at the window. Spec §0.3 and §3.9 now read "the card's own actions, nothing the screen adds", with CUL-1337 as the durable fix. A test pins the door.
- **Voice pass** (team call): the only change is "Pet tab" → *Go to {pet}'s tab* / *your pet's tab*, because the bar draws the pet's name there. *Nothing to show here*, *pull* and the unknown-or-archived line are kept for parity with their siblings: the Signal route, five insight screens, `/report` and `/trial-foods`. Logged in spec §4.

## Falsification

`adversarial-reviewer` ran the real loader in a scratch copy. Each case held:
- Free-fed with a live refusal or decline: those states outrank `free_fed`, so the line never sits beside a not-eating flag.
- A past bowl gets only the past-bowl caveat.
- Overrun with a live refusal, a completed trial past its target, and the milestone: no food door.
- The overrun door renders once.
- An overrun with a stood-down refusal shows the door with no ledger or ratio, the same as the clean and exposures cards.
- The recheck line stays owner-side: it is in neither the text share nor the PDF.

The reviewer also flagged one code comment as overclaiming ("nothing in the app can see the pet stop"). It is fixed.

## Residual

The reviewer found one gap that predates this PR, filed as **CUL-1554**. A free-fed trial past its window resolves `overrun` before `free_fed`. It prints "Meals logged on 56 of 56 days" over a topped-up bowl and drops the new line. The same issue asks Dr. Chen whether the line should name an action threshold for a free-fed cat.

## Process note

Linear auto-links a bare `#4` in a description to an unrelated `culprit-web` PR. This session's plan excerpt carried that link, and so did one line of CUL-1554 until it was patched. In Linear text, write "item 4", never `#4`.
