# CUL-240 (B-042) — vomit `unsure` foreign-material visibility

**Date:** 2026-08-19
**Shipped via #681** (draft) · branch `claude/b042-vomit-escalation-tuning-vcazhd`

## The issue, and how it changed shape

CUL-240 / B-042 asked to treat `unsure`-on-blood and `unsure`-on-foreign-material as **soft** escalation triggers on the `analyze-vomit` n=1 read — a note written 2026-05-29 off the B-034 review of 22 real stored reads, which found two under-escalations (`bile + an unidentified non-food piece`, and `blood`+`foreign`=`unsure`, both `monitor`).

Orienting on the current code showed the literal ask no longer fits the architecture:

- **There is no soft tier.** The floor is `worth_a_call` / `monitor` / `not_enough_to_say`, in both vomit and stool. By `clinical-guardrails` Pattern 9 a monitor-tier finding rides a **structured field** with **generic** monitor copy; only a definite `yes`/`fresh_red`/`coffee_ground` becomes an escalating `visual_flag`. So "soft `suspected_foreign_material`" has no home, and a hard escalation on bare `unsure` is over-escalation.
- **The issue's premise is stale.** It reasoned "both *state the uncertainty* — not false reassurance." True in May 2026; since **B-060 / CUL-152** the model's read text is nulled on `monitor` and replaced by a generic template, so the uncertainty is no longer stated. The owner now gets *less* signal than when the issue was filed.
- **The tension the PM flagged.** **CUL-403 / B-338** (Todo) is the opposite direction — foreign-material reads already false-positive (a toy ball elsewhere in frame; turkey seasoning read as a "stick"), and the PM wrote *"B-042 pushes for more sensitivity — NOT a licence to detune … read together."* `unsure` is the model's default for any unclear photo, so escalating it fires on a large share of low-quality photos → alarm fatigue → desensitises owners to real `worth_a_call` reads (CUL-208/B-185).

**The real defect turned out to be a visibility asymmetry, not an escalation gap.** `blood='unsure'` already renders a structured "Blood: Unclear" row (`VomitAnalysisSection.tsx:434`, blood always shows). `foreign_material_present='unsure'` renders **nothing** — the "Foreign material" row was gated on `=== 'yes'` (`:436`). So a `foreign='unsure'` read carrying a described fragment (`foreign_material_note`) was invisible to the owner. A privacy-safe aggregate over production confirmed the class is real: **8 of 17 `unsure` rows carry a non-empty note** (and, notably, 4 `no` rows do too — the model does not obey the schema's "note only if yes").

## The decision (PM)

Presented a decision brief with four altitudes (visibility-only · soft read-text nudge · a new `mention_to_vet` tier · defer/fold into CUL-403). **PM ruled visibility-only** — surface the hidden foreign-material fragment; leave the escalation floor untouched; blood already shows.

## What shipped

Client-only (`components/event/VomitAnalysisSection.tsx`, `buildObservations`): on `foreign_material_present === 'unsure'` **with a non-empty note**, render the "Foreign material" row. No floor change — the card stays `monitor`. A bare `unsure` (no note) stays hidden; `no`+note is excluded (the condition keys on `presence === 'unsure'`).

### The adversarial catch (round 1 FAIL → fix)

First pass rendered the note text with an `(unclear)` suffix. The `adversarial-reviewer` **broke it**: `foreign_material_note` is model-authored **free text** — the *least-guarded* field in the pipeline (no schema constraint like `description`/`read_text`, ungated at parse `analyze-vomit/index.ts:257-259`, no post-floor gate). The client's old `=== 'yes'` check had been the **de-facto** Pattern-10 gate (yes ⇒ the floor forces `worth_a_call`); rendering the raw note on the `unsure`/`monitor` path put model prose on a non-escalated card — the exact leak **Pattern 10 / B-060 / CUL-152** forbids. Counterexample that held: an `unsure` note reading *"looks like a piece of bone, probably from a raw diet and usually passes on its own"* would render verbatim under "Keep an eye out" — a diagnosis **and** a reassurance the `(unclear)` suffix does not neutralise. (My "it's a structured column, not free text" framing was the load-bearing error — the DB type doesn't make the content structured.)

**Fix (round 2):** the note's **presence** is the trigger; its **content** is never rendered on `unsure`. The row shows a **deterministic** literal, `Possible — not identified`. Same visibility win (the owner learns a possible, unidentified non-food fragment was flagged), zero free-text leak, works on the 8 existing rows, no Edge Function change. The `yes` path (forced `worth_a_call`) still shows the model's note — unchanged, Pattern-10-compliant.

Also corrected the stale write-side comment on **both** `analyze-vomit` and `analyze-stool` that claimed `foreign_material_note` is populated only on `yes` — this issue is the proof it isn't (comment-only, no redeploy). Both reviewers flagged it as a live foot-gun for future consumers (report / Ask / a new Signal lane).

## Tests

Five render branches in `VomitAnalysisSection.test.tsx`: `unsure`+fragment surfaces the deterministic label (and the **raw note never appears**) · a **diagnostic/reassuring `unsure` note never reaches the card** (the adversarial counterexample, pinned) · bare `unsure` hidden · `no`+note excluded · `yes` unchanged. 14/14 in the file; full suite **5318/5318**; `tsc` clean. (Deno suites not runnable here — no `deno` binary — but the Edge Function edits are comment-only; CI's Deno job covers them.)

## Persona / review sign-off

- **Data Scientist / Dr. Chen (adversarial-reviewer):** round-1 FAIL (raw note on a monitor card, Pattern 10) → deterministic-label fix → round-2 re-verify. Counterexample: the "bone / usually passes on its own" `unsure` note → no longer reaches the card (only the literal does).
- **code-reviewer:** ship-ready; independently flagged the same free-text-on-non-worth_a_call concern (as a NIT) and the stale comment (CLEANUP) — both addressed.
- **Designer / nyx-voice:** `Possible — not identified` — plain, present-direction, no `!`, honest about uncertainty (Pattern 6). Copy micro-choice; `Possible — unclear` is an alternative for strict vocab consistency with the app's `unsure → "Unclear"` label.

## Follow-ups filed (out-of-scope, not folded in)

- **CUL-542** — `analyze-stool` has the identical `=== 'yes'`-only render gate; same visibility fix on the stool detail screen.
- **CUL-543** — the vet report (`generate-report/report.ts:2196`) also gates the note on `yes`, so an `unsure` fragment now shows to the owner but not the vet. Dr. Chen call (does an uncertain foreign flag belong on a clinical report?); rides the B-494 `generate-report` deploy hold.

## Notes

- **No STATUS.md change** — the fix is client-only, needs no deploy, and is orthogonal to the tracked phases (Step 10 / vet report). Its analyze-vomit references (A8 redeploy, description-gating, CUL-534) are unrelated. Per the collision-avoidance rule, nothing there was made untrue.
- **No PM action item** — client-only, no migration/secret/deploy. Tested via Runtime B (Metro + tunnel).
