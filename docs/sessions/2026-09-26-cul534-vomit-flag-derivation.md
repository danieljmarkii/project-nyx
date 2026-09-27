# CUL-534 — analyze-vomit derives its red flags from the structured fields

**Date:** 2026-09-26

Shipped via #934. No schema change. Merging deploys `analyze-vomit` (CUL-1147); it carries no hold and needs none, because the change can only add escalations.

## Why this session existed

`analyze-vomit`'s parse took `visual_flags` only from the model's array. A read that recorded `blood_present = coffee_ground` (or `fresh_red`, or `foreign_material_present = yes`) but dropped the flag and self-selected `monitor` left the escalation floor with nothing to act on: the card said "Keep an eye out" beside its own "Blood: Coffee-ground" row, while Home's card, deriving from the field, said to call. `analyze-stool` closed the same gap on 2026-07-17 (its adversarial ①). The Engines v3 critique (CUL-1268, MFU-9 / TD-1) asked for it to ship on its own, ahead of EN-3, with Pattern 9's canonical example corrected in the same PR.

Mode: BUILD. Treated as mechanical under the plan-gate because the issue prescribes the exact change; the mandated adversarial and Dr. Chen pass still ran before the PR left draft.

## What shipped

- `analyze-vomit/index.ts` `parseAnalysisToolResult`: derives present-only flags (`fresh_red` / `coffee_ground` → `blood`, `yes` → `suspected_foreign_material`) and unions them, deduped, with the model's sanitized array. `unsure`, `none_visible`, `no` and invalid values derive nothing; a model-raised flag is never removed. It derives even when `appears_to_show_vomit` is false, as stool and every reader do.
- A derived escalation gets the deterministic flag-named read: the CUL-152 parse gate already nulls `read_text` and `description` unless the model itself called `worth_a_call`.
- Nine new tests, each driving the parse through the floor, read selection and description gate (`floorAndRead`), plus the partial-read collapse guard.
- clinical-guardrails Pattern 9's canonical example and limitation #4 no longer name vomit as the exception; the two client comments that pointed at this gap now say what the code does and where it stops.

## What the reviews found

- **code-reviewer:** ship-ready, no findings. It suggested skipping the adversarial pass as redundant with stool's; declined, since the DoD mandates it for escalation logic.
- **adversarial-reviewer (Data Scientist + Dr. Chen): PASS on the escalation logic.** Every missed-escalation, over-escalation and consistency attempt held or improved. Findings acted on in this PR:
  - The vomit client comment called the `yes` note path "Pattern-10-compliant". It is not: the note is not gated on the model's own escalation, so on a derived escalation it is text the model wrote for a monitor call ("a piece of string, usually passes on its own"). Comment corrected in both sibling components; the gate is **CUL-1318**.
  - The parse comment's "agrees with every reader" held only for fresh, unedited rows. Reworded, with the owner-edit case pointed at CUL-409.
  - Two mutants survived (deriving only when `appears` is true, for blood and for foreign). A test now pins the deliberate derive-over-"not vomit" behaviour, and one pins the partial-read case, which the fix improves: before it, a one-of-two partial read with coffee-ground blood and no flag collapsed to "Not enough to say" and erased the finding from every reader of the fields.

## Proof

- Local: Deno 1,855 passed across `supabase/functions/`, `deno check` clean, `tsc` clean, jest 528 suites / 11,947 tests green (and again in the pre-push hook).
- Against the true pre-fix parse (`HEAD~1`): the 7 guard tests red, the 2 refactor-safety tests (a model-only flag is kept; present-only derives nothing) green both ways.
- Mutation, each caught by at least one test (the last two added after the review, to catch its two survivors): drop `coffee_ground`, derive on `unsure` blood, derive on `unsure` foreign, no dedupe, replace instead of union, no foreign derivation, gate blood derivation on `appears`, gate foreign derivation on `appears`.
- Production sizing (aggregate count, no row data): 3 vomit rows carry a recorded blood or `yes` foreign finding and all 3 already read `worth_a_call`. No row sits in the missed-escalation state, so no backfill.

## Residuals

- **CUL-1318** (new): the foreign-material note on vomit and stool cards, and the report line, is shown raw even when only the floor escalated. Pattern 10 Layer 1.
- **CUL-409** (comment): an owner edit that ADDS a red-flag field never raises the card's verdict, and a re-run over any owner-edited row takes its verdict from the fresh model read, not the owner's fields. Both in the missed-escalation direction; overlaps CUL-1201 and CUL-1110.
- **CUL-1137** (comment): a blood-suggestive colour (`black_coffee_ground`, `dark_red`, `pink_red`) with `blood_present = unsure` escalates nowhere. Consistent across surfaces; Dr. Chen ruling needed.
- **Accepted, recorded here:** a model-raised flag with an `unsure` field makes the card escalate while Home, the report and Ask stay silent (the union deliberately keeps model-only flags, as stool's does). Safe direction.
- **Accepted, recorded here:** a model that says "not vomit", records fresh blood and self-calls `worth_a_call` now surfaces its own prose on the escalated card, where the floor used to downgrade it. It needs a triple self-contradiction, and it is the same trust Pattern 10 already extends to any self-escalated read.
