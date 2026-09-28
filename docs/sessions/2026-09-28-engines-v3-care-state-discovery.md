# Engines v3 PR-20: the care state and the outcome loop (discovery)

**Date:** 2026-09-28 · **Issues:** CUL-1139 (EN-9), CUL-1144 (EN-14); CUL-1140 (EN-10) drawn · **Mode:** DISCOVERY · **Outcome:** shipped via #966 (docs only)

## What was produced

- `docs/nyx-care-state-requirements.md` v1.0, a draft for PM review. It covers:
  - one owner vocabulary;
  - `careState` derived in `generate-signal`'s shell from owner-entered, dated, per-sign acknowledgements;
  - a tested re-raise, a dense-day arm and a pinned burden-card net;
  - the call record, follow-up ledger and acknowledgements as three append-only tables;
  - EN-10's lines;
  - the accessibility contract;
  - the AC 10 Tier-2 wording.
- `docs/culprit-engines-v3-mockups.html` round 3, republished to https://claude.ai/artifact/XrAawavFSUgbBKdWdxFsdY. The subject is Jordan's dog Otis, on day 30 of a hydrolyzed trial his vet started before the app was installed. The round draws:
  - every care state;
  - "My vet knows";
  - the critique's undrawn states;
  - the call record and the follow-up with notifications off;
  - EN-10's lines;
  - the spoken contract;
  - three briefs.
  - Round 2's loop frames carry forward as §08. EN-3's tiers moved to PR-24's page.

## Decisions made in the spec (reversible by comment)

- The owner copy never uses "watching" or "stood down". The states are raised, **With your vet**, **Recheck booked**, and **Back because…**.
- TD-5's count-start half: counting starts the day after the anchor, except for a trial-scoped answer, which counts from the trial's first day.
- There is no separate owner "close". The finding leaves when its detector stops firing.
- With notifications off, the follow-up arrives in-app, as a navigation line on the escalation's own Home row. A `follow_ups` notification category exists, defaults off, and names no record fact.
- Acknowledgements are listed in Vet visits as "you noted". They are not History rows.

## Adversarial pass

`adversarial-reviewer` FAILED the first draft on eleven counterexamples, all taken into the same PR (spec §10.1):
- The re-raise test caught 2–4% of real doublings.
- An episode-day ceiling hid the sickest pets.
- The reference slid forward with the current window.
- Acknowledgements outlived their course.
- `raised_again` had no latch.
- Zeros were allowed beside masking drugs, and injections given at the visit were invisible.
- Any appointment counted as a recheck.
- Bouts chained.
- The drug table had gaps.

The ≤5% / ≥80% tolerance pair looks infeasible at low base rates. The tolerance brief was restated as a point on a measured frontier. The burden-card net is unverifiable until CUL-1311 records a threshold, and PR-23 is gated on it.

## Facts corrected on the way

- The stood-down line is composed on the server (`standDown.ts`), not in `lib/signalCopy.ts`.
- `diet_trials` has no `prescribed_by` column. It has `vet_name`, `vet_visit_id` and `target_duration_vet_directed`, and the last means only "the owner ticked a box".
- `signal_shown_log` (075) already exists, so MFU-3 is met.
- lookNotes' server allow-set is `generate-report/`, not empty. The call-note guard's allow-set is the empty one.

## Ruled by the PM (2026-09-28, same session)

"PMD-4 A, tolerance A, AC 10 approve."

- **PMD-4 = A.** The app asks the owner once per sign while a trial or course runs. A "yes" acknowledges the concern until the earliest of: the initial target, the last dose + 14 days (or 56 days for a course with no target), or stand-down.
- **Tolerance = A.** False returns are capped at 5% of stable pets within eight weeks. PR-16 measures the frontier, and PR-23 waits on it.
- **AC 10 approved.** It is written into `docs/nyx-vet-visits-requirements.md` v1.3 (AC 10 and §5.6, under ⚠ markers).

The spec went to v1.1 BUILD-READY. Mock round 3 was republished with the rulings shown, and the tap-only PMD-4 option was removed. TD-5, the call-now "Not yet", stays a recorded conflict for PR-36.

## Not done

- No `nyx-voice` or `pm-feature-review` pass. The copy is a proposal and gets its voice pass at PR-35 and PR-36.
- The CLAUDE.md Read-These row waits for PR-21, because CLAUDE.md is at its byte ceiling.
