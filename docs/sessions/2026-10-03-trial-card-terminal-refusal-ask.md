# An ended trial card keeps the call ask while the refusal is live (CUL-1337, PR-40)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-40 of the second Out of beta project. Shipped via #1015.

## What shipped

- `lib/dietTrialCard.ts`, `registerFor`: a completed or abandoned card routes a live `trialDietRefusal` to the `trial_refusal` register. It sits below `decline` and above `refusal_withheld`, and the range fact alone still keeps the history voice. This is the PM-approved fix of 2026-10-03, mirroring how the terminal `decline` register keeps the intake-decline flags.
- `terminalRefusalIsLive`: `computeTrialFacts` bounds evidence by `min(today, ended_at)`, so on an ended trial the now-fact freezes at the end. It counts as live while its own window still reaches today (`today − ended_at < REFUSAL_WINDOW_DAYS`). A null or unparseable `ended_at` means the facts anchored at today, so the fact is live; `code-reviewer` caught that my first cut substituted the target end.
- `abandonedCard` in this register offers no *Start a new trial* and no continuation note, the same as `decline`; the header's `+ Start` keeps a way in. `completedCard` drops the continuation note in this register, because on GI "often continued for around three months" under "needs a call today" reads as advice to keep offering a refused diet (`adversarial-reviewer`).
- The B-570 test that pinned the old `record` routing was replaced by a 16-case suite. Mutations: removing the routing line reds 8 tests, removing the bound reds 2, removing the abandoned change reds 1, removing the completed change reds 1.

## What the plan got wrong

The plan excerpt said merging would redeploy `generate-report`. It doesn't. `lib/dietTrialCard.ts` is in no Edge Function's shipping closure (checked with `scripts/edge-deploy/fingerprint.ts`); `generate-report` only names it in comments. The vet report renders nothing differently.

## Falsification

`adversarial-reviewer` tried these:

| Case | Result |
|---|---|
| A cat stopped early for refusal and still refusing, 3 days after the end | Held |
| Timezone and day boundary | Held (both sides device-local; `ended_at` is a DATE) |
| Null `ended_at` | Held after the fix |
| A completed trial eaten six weeks, refused two | Held on the floors |
| Post-end eating can't stand the frozen fact down | Broke: a stale present-tense ask for up to 13 days. Over-fire, and on `main` the same cat gets no ask at all. Filed CUL-1534 (needs `lib/dietTrial.ts`). |
| Completed-card continuation note under the flags | Broke. Fixed here. |
| Handoff to `detectIntakeDecline` after the bound lapses | Weak: its baseline already holds the refusal. Filed CUL-1536. |
| Terminal safety face has no "for the call" block | Gap. Filed CUL-1535, together with the pre-existing decline-under-continuation copy. |

## Residuals

- The 14-day ceiling is the build's reading of "while live". Dr. Chen may want another bound.
- Home's `isAnimalNotEating` reads the raw fact with no time bound. From day 14 to day 30 after the end, Home keeps withholding while the card has stopped asking. That is the safe direction.

## Verdict

`adversarial-reviewer` re-checked the head after the fixes and returned **PASS for merging**: no owner is worse off than on `main`. A stale ask for up to 13 days means too much warning, never false reassurance, and it has a hard end date. The owner's own outcome line still renders under the flags on a completed card, as it does on `main`, because it is attributed to them. `code-reviewer`'s two findings (the null-end anchor and a stale comment) are fixed.
