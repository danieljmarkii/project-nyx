# TS-7: For the call on the trial screen's refusal face

**Date:** 2026-09-27

Shipped via #949. CUL-1303, project **Diet trial — its own screen**, milestone C · The doors, the safety face, the recheck. One of four parallel step-3 lanes (TS-5 CUL-1301, TS-6 CUL-1302, TS-8 CUL-1304, this one). TS-6 edits the same two screen files and had not landed when this session ended.

## What shipped

When a pet is leaving the trial food unfinished, the trial screen's safety box now carries *For the call* under the register's two lines:

- `Offered: {trial food}`: only under `population === 'trial_diet'` (B-530).
- `Day {n} of the trial`.
- `Vomiting logged: {k} in the trial's {n} days, the last on {date}` (with k = 1: `…, on {date}`). Shown only when k ≥ 1 and the date is known.
- The swap line: *Veterinary diets are usually guaranteed, so the clinic can swap this one if {pet} isn't eating it.* Shown only under `trial_diet`, the ruling below.

The code:

- `lib/trialForTheCall.ts` (new, pure) keys on `liveRefusal`, now exported from `lib/dietTrialCard.ts` with no logic change. The block and the register therefore speak from one refusal, and a stood-down register takes the block with it.
- `lib/trialResponseCounts.ts` gained `trialLastEpisodeDayIndex`, taken from the same collapsed episode set as `trialCount`, so a count and its date cannot describe two sets. No Edge Function imports the module (only generate-signal's parity test, which compares field by field), so nothing redeploys.
- `lib/trialScreenModel.ts` gains one field. `TrialScreen.tsx` draws the block inside the one accessible safety element, so VoiceOver reads the fact, the ask and the call facts together.

## Decisions

- **Refusal face only** (PM, before the build). The intake-decline face carries no block. *Offered* and the swap line are defined against the refusal's population, and a `refused_normal_food` decline can name a food that isn't the trial diet. This also kept the lane off TS-6's decline-face edit.
- **The swap line is gated on `trial_diet`** (PM ratified after the adversarial pass). This is a better-than-the-rule call against §3.3, which wrote the line unconditionally. It is now inline in the spec as ⚠ RULED 2026-09-27.
- **The field is `facts`, not `lines`.** `guards/dietTrialProvenance.test.ts` counts every reader of `.lines` among modules importing the card. `model.forTheCall.lines` tripped it as a false positive. Renaming kept the guard's registry honest, where adding an entry would have widened it.

## The adversarial pass

The verdict was FAIL, narrowly. Every safety rule held:

- presence only, never zero, never a baseline or a direction;
- refusal face only;
- the day line and the count's window share one day counter across midnight, in overrun, and under +14, −10 and +12:45.

It found two breaks, both fixed in #949:

1. **The unconditional swap line.** Under `meal_record`, "this one" sat directly under "can't name which one went untouched".
2. **The k ≥ 1 gate had no test.** A mutant that dropped it survived, because the loader couples the count and its date. An out-of-contract fixture (a zero count carrying a date) now reds it, proven by mutation.

The spec-level findings became CUL-1341, for Dr. Chen:

- a recent cluster inside a larger whole-trial count (the last date shows recency, not clustering, so T-4's premise is only half true);
- no vomiting fact on the stand-down, intake-decline and stale-active faces;
- a failed count read that looks like zero.

The prescription-only narrowing of the swap line ("usually guaranteed" is false for a home-cooked trial) is noted on CUL-1303 and not built.

## Residuals

- There has been no device pass; that is TS-DP (CUL-1306).
- The merge with TS-6 is pending. One check-in is armed for 11:08 UTC to merge `main` in if TS-6 has landed.
- A mistake: a `git checkout` used to undo a mutation test reverted an uncommitted edit, and it was restored from a backup. Mutations are now run against a `cp` backup, never undone with `git checkout` over uncommitted work.
