# Engines v3 PR-26: the tier dual-written, and the stool spill-over fixed

**Date:** 2026-09-29

EN-3's server half (CUL-1133) and EN-7 (CUL-1138), in one PR, shipped via the draft PR on `claude/cul-1133-pr26-0929`. Server only, no migration. Everything an owner could see is behind a new Engines key, `engines_v3_en3`, which is not seeded, so it is off for every account until the PM's Wave 4 allowlist step (after the vet review, CUL-1312).

## What shipped

- **`lib/incidentTier.ts`**: the tier order, one import-free module beside `lib/incidentVerdict.ts` (spec §1). `call_now > call_today > {logged, not_enough_to_say}`; a legacy `worth_a_call` ranks call today; an unknown value in either column ranks call now; `effectiveTierRank` is the louder of the two columns; `tierForVerdict` is the writer's map. No words (PR-27's map holds those).
- **Dual-write, every writer** (`_shared/incident-analysis.ts`). Under the key the full write-back, the owner-edited update, the capped escalation and the rescue all carry `tier`; the partial-read collapse needs no case because the tier is mapped after it. Flag-off no write names the column.
  - **Nothing writes `call_now` yet.** Every escalation today is a "same as today" row at call today; the louder rows arrive with their own rules (PR-28, PR-29).
  - **The model's own escalation** (GAP-31, T19) is call today, keeps its words, and is classed `model_only` by `tierReasonOf`.
- **Never-lower in ranks.** `holdsOver`: a stored call (the louder column) holds over a quieter verdict; with no tier on the row it is exactly today's rule, and a stored call tier beside a client-lowered verdict still holds. `keepLouderTier`: a call written over a louder stored call keeps the stored tier while its own findings land. `logged` ↔ `not_enough_to_say` is free. The cap branch, the failure write and `isRealAnalysis` read the louder column too.
- **EN-7** (`analyze-stool`). Flag-on, `concurrent_vomiting` is computed as before the read, so every path that never sees the stool's form keeps today's call. It is withdrawn only after a COMPLETE read shows a formed stool (Bristol 2 to 4) and nothing else asks for it: not logged Loose, not the vomit repeat rule (Dr. Chen's pin; one predicate, `_shared/vomitRepeat.ts`, which analyze-vomit now uses too), and not the vomit read's feline intake arm (the shipped derivation, imported). The withdrawal is a bounded framework exception (`ContextualRun.withdrawable` + `afterRead`). Each reason has its own sentence; none says "loose" over a formed or hard stool, and none carries a relative clock.
- **Rule versions:** framework `f1` → `f2`, stool `stool1` → `stool2`.
- **`clinical-guardrails`** Patterns 1 and 2 learn the tier, the order, the model's own call and the EN-7 rule (spec §12).
- **Guards:** `lib/incidentTier.ts` registered in `guards/readState.test.ts` and `guards/unknownVerdict.test.tsx` (a ranker, not a surface); a Deno guard that Ask's `READ_COLS` never names `tier` until PR-27's word map.

## Decisions (posted on CUL-1133 before building)

- **A new key, not `engines_v3_en0`.** en0 may already be on for the PM, which would put Wave 4 live before the vet review. Unseeded, because a missing row is off (fail closed), so the PR needs no migration.
- **Call today for every escalation in this PR.** Writing call now would decide §7's louder rows without their reviews.
- **Only a read formed stool (types 2 to 4) quiets.** Type 1, 5, 6, 7, unsure and not-stool keep the call. Placeholders for the ruling sheet (CUL-583).
- **T23 is a quieter row** (a read formed stool beside one vomit that does not escalate on its own loses its call). It ships dark and stays dark until CUL-1312.

## Adversarial review (isolated): FAIL on the first build, fixed

- **F1 (high):** EN-7 carried only the repeat arm. A cat with no Most or All meal, one unopened photoless vomit and a formed stool lost its call everywhere. Fixed: the stool asks the vomit read's feline intake arm through its own derivation.
- **F2 (medium):** every unread stool form (capped, unreadable, 529 rescue, partial, unsure, type 5) was treated as formed. Fixed by inverting the rule: withdrawal needs a complete read showing a formed stool.
- **F3 (medium, latent):** a tiered call over a louder stored call was held, which would keep a new finding off the structured columns. Fixed: `keepLouderTier` writes the run and keeps the louder tier.
- **F4 (low):** the "repeats" sentence said "in a short time"; now "around the time of this stool".
- **F5 (low):** flag-off rows now carry `f2.*` rule versions; "earlier rule" is `rule_version` plus `engine_flags` (the EN-0 precedent). Spec §1's wording is a proposed Tier-2 edit.
- **F6 (note for PR-27):** status (failed, capped) must lead the tier on screen, or an old `logged` shows over a read that did not finish.

## Proof

- Deno: `_shared/`, `analyze-vomit/`, `analyze-stool/` (new `pipeline.test.ts` driving the real stool descriptor through the real pipeline, key off and on; new `en7.test.ts`), and `_shared/incident-tier.test.ts`. Jest: `lib/incidentTier.test.ts` and the two guards; the full suite ran green in the pre-push hook.
- Mutation, each red: the tier gate, the keep-louder rule (write and cap), the failure write's louder column, the complete-read gate, the withdrawable bound, the stool flag gate, the intake arm, the repeat pin, and withdrawing on any read form.

## Carried forward

- PR-27: the tier-word map, every surface, Ask's one-line definitions, `escalationSurvivesFailure` on the louder column.
- The Wave 4 allowlist step seeds `engines_v3_en3` (Waiting on PM).
