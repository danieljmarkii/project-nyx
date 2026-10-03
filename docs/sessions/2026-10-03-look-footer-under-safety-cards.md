# Noticed: under any safety card the look's coverage footer goes and her words stay (CUL-909)

**Date:** 2026-10-03
**One thing:** A fix that moves where a number is spoken has to find every OTHER place it is spoken. The footer's count also lived in the receipt's denominator, and the receipt's absence was a hidden input to the list cap, so one ruling touched three surfaces.

Dispatched as PR-12 of *Out of beta: Noticed, Design v2, History v2, the trial screen*. Shipped via #1022.

## What shipped

- **The ruling, as written.** The PM ruled §11 Q-6 option (c) on 2026-10-03: under any live safety-class Signal finding, withhold the Noticed coverage footer and keep the owner's words. Built as follows:
  - `safetyHoldsLookFooter` in `lib/lookWithheld.ts`.
  - A required `safetyHolds` input to `lookCoverage`, with a new absence reason, `'safety'`.
  - A required `safety` prop on `LookCard`, fed by Home's existing `signalSafety` (the `onSafetyLive` report the trial strip's lane already reads, CUL-1301).
  - It fails closed on `null`, `live: null` and another pet's report.
  - It is live only: no T-16 mark is written.
- **Adversarial pass 1 broke it.** The receipt still spoke the footer's count ("of the 20 days you've answered", "in the 27 days you'd answered before it"). Under a safety card the receipt now takes the intake state's bare-first-date form. The T-16 comment also overstated "no imposed gap" and now states the clinic-gap exposure as known and accepted.
- **Pass 2 broke the fix.** The bare-date form returns nothing for a word first marked today, and "earned a receipt" was the list cap's only exemption, so the day's first *Off* could fold behind "more today" under two quiet entries. The cap now keeps the earliest entry for any concern word the capped rows don't already show. The intake state had the same latent gap, and this closes it too.
- **Pass 3 held.**
- **Mutation proofs:** each of the footer gate, fail-closed, the receipt reduction and the cap exemption was broken in source, and each went red.

## Decided by the team (PM may reverse)

- **Live only, no withheld-day mark.** Marking would hide the footer for 28 days after every safety card, which means never on a chronic pet.
- **The receipt's bare-date reduction under a safety card.** This goes past the ruling's literal "footer". It applies the ruling's own reason ("the count is the app's claim") to the second place that count is spoken. It is clinical, so it is put to the PM on CUL-909 rather than self-merged.
- **Design v2 needs nothing.** `LookHeader` has no look footer, and `CoverageDoor` counts event days, a different population.

## Residuals (none blocking)

- A backdated duplicate *Off* can render twice (receipt by `created_at`, cap by `occurred_at`). Cosmetic.
- Pre-existing:
  - the C-40 same-second lexical sort of `occurred_at` in `todayLooks`;
  - unresolvable future-vocabulary keys read as no concern.
- Not covered by the ruling's wording, for Dr. Chen / the PM:
  - the cross-pet safety banner;
  - a stood-down marker line above a returning footer.

## Proposed Tier-2 edit

The §11 Q-6 row and the §3.3 withheld bullet of `docs/nyx-daily-look-requirements.md`. The text is in #1022's body, awaiting PM approval. It is not written here, to stay out of PR-14's hotspot.
