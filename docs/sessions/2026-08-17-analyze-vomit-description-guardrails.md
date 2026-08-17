# analyze-vomit / analyze-stool — gate the model's free-text `description` (CUL-152 / B-179)

**Date:** 2026-08-17

Shipped via **#671** (draft). BUILD. No schema, no migration, no client change — server-only + tests + docs.

## The problem

B-060 closed the `read_text` reassurance path *structurally* — the vision model's free-text read reaches the owner only on the `worth_a_call` escalation path. But the model's **separate** free-text `description` field was still stored verbatim and surfaced on **every** completed path including `monitor` (`VomitAnalysisSection` / `StoolAnalysisSection` → "What's visible"). A model writing *"looks like a totally normal hairball, nothing concerning"* into `description` would land that on a benign card — the **same n=1 reassurance-on-absence vector, one field over** (`clinical-guardrails` Ambiguity #2). `description` also feeds `ask` (`ask/tools.ts`) and is anticipated to feed the Step 9 vet report, so the fix belongs at the **source** (the stored column), where every current + future consumer inherits it.

Verified before building: the leak is **identical in `analyze-stool`** (shared migration-013 `description` column, same render pattern), `analyze-stool` already solved the *`read_text`* version at parse time (a proven pattern to mirror), and `generate-report` does **not** read `description` yet (so "report-bound" is forward-looking, not a live report leak).

## Decision (PM, this session)

Presented a decision brief; PM chose the **family fix** over the issue-strict (vomit-only) option: gate `description` in **both** vomit and stool, and bring vomit's `read_text` to parity with stool's parse-time guard. One predicate, applied to two fields × two functions — all the same `clinical-guardrails` Pattern-1 class. Mechanism was pre-decided by B-060's cited lesson: structural gate, **not** a strip/post-filter denylist ("don't bare-deny").

## What shipped

The gate mirrors `read_text`'s structure exactly — **two layers, both required** (adversarial review proved one alone leaks; see below):

- **Layer 1 — parse (`parseAnalysisToolResult`, both descriptors):** null `description` (and, for vomit, `read_text` — stool already did this) unless the model's OWN recommendation is `worth_a_call`. Closes "model recorded blood / set a visual flag but self-selected `monitor` with a soft read."
- **Layer 2 — post-floor (shared `_shared/incident-analysis.ts`):** new pure, exported `selectDescription(...)` returning the description only on a non-contextual, readable, **final** `worth_a_call` — the identical predicate `selectReadText` uses for `read_text`. `runIncidentAnalysis` applies it post-floor (step 8b), **mutating `analysis.description`** so the null lands in the `description` column **and** `ai_raw_payload` together (keeps the owner-edit diff / never-clobber consistent — Pattern 7). `description` added to `IncidentAnalysisBase`.

Files: `supabase/functions/_shared/incident-analysis.ts`, `analyze-vomit/index.ts`, `analyze-stool/index.ts` (+ both `index.test.ts`). Codified as **`clinical-guardrails` Pattern 10** (two-layer free-text gate — future incident types inherit it); Ambiguities #1, #2, #4 marked resolved in the skill.

## The adversarial cycle (this is the story)

The mandatory `adversarial-reviewer` pass **FAILED round 1** and earned it. My first cut gated only at parse, keyed on the model's **pre-floor** recommendation. But the escalation floor can **downgrade** a model `worth_a_call` → `not_enough_to_say` (when `appears_to_show_subject === false`). So: model returns `worth_a_call` + `appears=false` + a reassuring `description` → parse keeps it (model self-escalated) → floor downgrades → the reassuring prose renders on a **"Not enough to say yet"** card. `read_text` was safe on that path because `selectReadText` re-gates on the post-floor rec; `description` had no such second gate. The asymmetry *was* the bug.

Fix = give `description` the same post-floor gate (`selectDescription`). **Round 2 → PASS**: original break closed; no new hole from the post-floor mutation (only `buildStructuredValues` reads `analysis` after it, and it reads both column + payload from the same mutated object); never-clobber intact (edited rows discard `structuredValues` entirely); 1355/0.

## Out-of-scope discoveries (filed, not folded in)

- **CUL-534** — `analyze-vomit` does not derive `visual_flags` from `blood_present`/`foreign_material_present` the way `analyze-stool` does (Pattern 9 / B-340). A *missed-escalation* gap (distinct class from this reassurance leak); model-inconsistency-dependent + structured "Blood" row still shows, so Medium. Its own adversarial + Dr. Chen review + redeploy.
- **CUL-535** (routed finding R1) — the gate is forward-only; pre-existing rows keep their raw `description` until re-analyzed. Report-safe today (report doesn't read `description`), but a **prerequisite** before Step 9 wires `description` into the report: re-analyze/backfill first (scoped to never touch owner-edited rows).

## DoD

- AC (clinical-guardrails Pattern 1): `description` can no longer surface model prose on a non-escalation path — **pass** (new tests + adversarial round-2 PASS).
- Tests: **1355/0** deno (Edge Functions), **5278/0** jest (pre-push). New: `selectDescription` unit tests + the downgrade-break regression test in both suites.
- Types: deno type-check green (functions are excluded from `tsc`; deno test type-checks them).
- Adversarial (mandatory — clinically load-bearing): FAIL → fix → **PASS**, counterexamples recorded above.
- Persona sign-off: Data Scientist ✓ (n=1 never-reassure), Dr. Chen ✓ (via adversarial), Engineer ✓ (shared-module placement, two-layer parity), T&S ✓ (R1 gate filed) — Designer N/A (no rendered surface change beyond a prose line disappearing on benign cards; structured rows unchanged).
- Future-self: yes — Pattern 10 makes the invariant inheritable by skin/eye incident types.

## Follow-ups

- **Post-merge:** redeploy `analyze-vomit` + `analyze-stool` (cloud session, Supabase MCP per the runbook) — code-only, inert until deployed; **not** under the B-494 `generate-report` hold.
- CUL-534 (vomit visual_flags derivation), CUL-535 (pre-Step-9 description backfill).
