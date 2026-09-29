# Engines v3 PR-26: the tier dual-written, and the stool spill-over fixed

**Date:** 2026-09-29

EN-3's server half (CUL-1133) and EN-7 (CUL-1138), in one PR, shipped via the draft PR on `claude/cul-1133-pr26-0929`. Server only, no migration. Everything an owner could see is behind a new Engines key, `engines_v3_en3`, which is not seeded, so it is off for every account until the PM's Wave 4 allowlist step (after the vet review, CUL-1312).

## What shipped

- **`lib/incidentTier.ts`**: the tier order, one import-free module beside `lib/incidentVerdict.ts` (spec §1). `call_now > call_today > {logged, not_enough_to_say}`; a legacy `worth_a_call` ranks call today; an unknown value in either column ranks call now; `effectiveTierRank` is the louder of the two columns; `tierForVerdict` is the writer's map. No words (PR-27's map holds those).
- **Dual-write, every writer** (`_shared/incident-analysis.ts`). Under the key the full write-back, the owner-edited update, the capped escalation and the rescue all carry `tier`; the partial-read collapse needs no case because the tier is mapped after it. Flag-off no write names the column.
  - **Nothing writes `call_now` yet.** Every escalation today is a "same as today" row at call today; the louder rows arrive with their own rules (PR-28, PR-29).
  - **The model's own escalation** (GAP-31, T19) is call today, keeps its words, and is classed `model_only` by `tierReasonOf`.
- **Never-lower in ranks** (`holdsOver`). With no tier on the stored row it is exactly today's rule; a stored call tier beside a client-lowered verdict still holds; a tiered call never replaces a louder stored call; `logged` ↔ `not_enough_to_say` is free. The cap branch, the failure write and `isRealAnalysis` read the louder column too.
- **EN-7** (`analyze-stool`). Flag-on, `concurrent_vomiting` fires only beside a loose or abnormal stool (logged Loose, or the read's Bristol 1, 6 or 7 through a new `ContextualRun.afterRead` hook that may only add flags), or when the vomiting meets the vomit repeat rule on its own (Dr. Chen's pin). The rule is one predicate, `_shared/vomitRepeat.ts`, which analyze-vomit now uses too. Each reason has its own sentence; none says "loose" over a formed or hard stool, and none carries a relative clock.
- **Rule versions:** framework `f1` → `f2`, stool `stool1` → `stool2`.
- **`clinical-guardrails`** Patterns 1 and 2 learn the tier, the order, the model's own call and the EN-7 rule (spec §12).
- **Guards:** `lib/incidentTier.ts` registered in `guards/readState.test.ts` and `guards/unknownVerdict.test.tsx` (a ranker, not a surface); a Deno guard that Ask's `READ_COLS` never names `tier` until PR-27's word map.

## Decisions (posted on CUL-1133 before building)

- **A new key, not `engines_v3_en0`.** en0 may already be on for the PM, which would put Wave 4 live before the vet review. Unseeded, because a missing row is off (fail closed), so the PR needs no migration.
- **Call today for every escalation in this PR.** Writing call now would decide §7's louder rows without their reviews.
- **Type 1 counts as abnormal beside vomiting; type 5 does not.** Placeholders for the ruling sheet (CUL-583).
- **T23 is a quieter row** (a formed stool beside one vomit loses its call). It ships dark and stays dark until CUL-1312.

## Proof

- Deno: `_shared/`, `analyze-vomit/`, `analyze-stool/` (new `pipeline.test.ts` driving the real stool descriptor through the real pipeline, key off and on; new `en7.test.ts`), and `_shared/incident-tier.test.ts`. Jest: `lib/incidentTier.test.ts` and the two guards; the full suite ran green in the pre-push hook.
- Mutation: deleting the tier gate reds 4 tests. The rest of the mutation run is recorded on the PR.

## Carried forward

- PR-27: the tier-word map, every surface, Ask's one-line definitions, `escalationSurvivesFailure` on the louder column.
- The Wave 4 allowlist step seeds `engines_v3_en3` (Waiting on PM).
