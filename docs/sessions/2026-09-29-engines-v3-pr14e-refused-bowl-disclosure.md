# Engines v3 PR-14e — the long band says when its vomits followed a refused bowl

**Date:** 2026-09-29

Shipped via #990 (CUL-1195). This is a `generate-signal` change plus client work, with no migration. It was dispatched by /dispatch as Engines v3 PR-14e. The wording is **provisional**: Dr. Chen ratifies it at CUL-583, with a `nyx-voice` pass.

## The defect

CUL-1122 made a refused bowl stop counting as eating. A vomit after it is therefore timed from the last meal the pet ate. That is true, and it misleads a refusing cat. Take a cat who turns down dinner and vomits five minutes later, on alternate nights. She reads "11 of 11 episodes came 6 or more hours after eating", which is the empty-stomach band, the harmless-looking reading. Nothing on the card says each of those vomits came minutes after a refused bowl.

## What shipped

- **The fact, once.** `lib/mealTiming.ts` sets `afterRefusal` on every eligible episode. It is true when a time-trustworthy Refused feeding sits strictly after the eating anchor and at or before the onset. The distribution also gains `afterRefusalCounts` per band.
  - The flag has no window of its own. "Followed a refused meal" is true at any gap inside the anchor's.
  - A same-instant refusal does not count.
  - An estimated-time refusal does not count.
- **Carried on three findings, long band only:**
  - L1 carries `longAfterRefusalCount`.
  - `timing_story` carries `long.afterRefusalCount`.
  - `trial_response` carries `longAfterRefusal {trial, baseline}`.

  It is a disclosure. It moves no band, floor or fire decision. A deep-equal test with the refusals erased pins that.
- **Printed only when present, never as a zero:**
  - the L1 and story sentences;
  - the legacy card face and its VoiceOver label;
  - the design_v2 Home row count;
  - the trial Signal card, one clause per window that has any;
  - the Patterns trial panel.
- **`SIGNAL_ENGINE_VERSION` moves to `signal.5`.**

## Adversarial review

- **Round 1: BREAKS, on two surfaces. The engine logic held.** It tried:
  - the named record, which fires 11 of 11 and discloses 11 of 11;
  - a refusal 10 h before onset, which discloses (over-inclusive, toward escalation);
  - a mid-band refusal, which gets no disclosure, and no surface gives mid a benign reading;
  - old caches and clamping.
- **Two defects:**
  1. **The trial line printed "0 in the trial · 2 before".** Ratings are exception-only, so that is an absence claim, and a fall reads as the trial fixing her refusals. Fixed: a window with none is left unsaid.
  2. **The vet report prints the long count without the subset.** Deferred as CUL-1430, which the issue itself sequences after CUL-1002's deploy. The `detection.ts` comment now names the gap rather than claiming every surface.
- **The code review also asked for:**
  - the engine version bump;
  - a NaN guard on the Home row.

  Both were done.
- **Mutation proof.** Reverting the same-instant rule reds the `mealTiming` test. Removing the face line reds the `InsightCard` test.

## Filed

- **CUL-1430:** the report line (blocked by CUL-1002).
- **CUL-1431:** the Patterns Timing panel and the per-episode spine line.

## Residuals

- **For Dr. Chen:**
  - At a long gap, "followed" does not say whether the refusal was minutes or hours before the vomit.
  - An owner may read the clause as hunger vomiting.
- **The Tier-2 spec edit** proposed on CUL-1195 (`nyx-signals-v2-requirements.md` §3, the intake rule) is not written. It still needs the PM's approval.
