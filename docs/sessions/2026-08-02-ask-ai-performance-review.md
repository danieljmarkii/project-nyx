# Ask AI performance review — QA battery, root cause, team convening

**Date:** 2026-08-02

**Shipped via #____** (draft). Branch `claude/ask-ai-performance-review-dx15xw`.

## What this is

The PM reported Ask's answers as subpar and asked to (1) pull the real ask/response
data, (2) have the Data Scientist grade it, (3) convene the product team on
improvements. Step (1) hit a ratified wall: **Ask persists no transcripts anywhere**
(spec §10 / D8 — ephemeral in-memory conversation only; no question text in logs;
`ai_usage` counters are the only trace: 5 conversations / 8 messages, Jul 19–Aug 1).
So QA generated fresh data against the real pipeline instead: a dedicated QA account
(`nyx-qa-ask@`, direct auth insert, allowlisted), a byte-faithful in-DB clone of the
cat's record (910 events / 757 meals / 39 dose admins with identical linkage nulls /
48 cached reads / the active trial), and a **31-question battery over HTTPS against
the deployed `ask` v4 with a real JWT**, every deterministic question graded against
SQL ground truth. Full findings + convening + PM decisions:
**`docs/ask-ai-performance-review-2026-08.md`**; frozen transcripts:
`docs/research/2026-08-ask-qa-battery-transcripts.jsonl`.

## Headline finding (F1, live-verified)

**Every medication answer in production is confidently false** — "0 doses of Motozol
logged" against 35 real all-`given` doses. Root cause: B-156's `paired_event_id`
(migration 023) made the `events` ↔ `medication_administrations` embed ambiguous;
PostgREST returns HTTP 300 `PGRST201`; `index.ts` maps `(doseEventsRes.data ?? [])`
with no error check → the dose context is silently `[]` on every request, deployed
**and** on current `main`. Repro'd live both ways: the bare embed 300s; the FK-hinted
embed returns all 35 rows, after which the *current* `medications()` tool answers
perfectly (Motozol 28 given, last Jul 30). The bug is the fetch, not the tools.

## Scorecard (31 answers)

13 correct + well-formed (trial math day 8/48-left ✓, counts ✓, notes recall ✓,
photo-read relay in correct recount form ✓, honest no-weight floors ✓, free-fed-now
correctly *no* ✓) · 3 confidently wrong (all F1) · 5 refused though a deployed tool
covered them (`symptom_trend`, `time_of_day`, `top_foods` — planning failures, F2)
· 2 genuine tool gaps (off-diet-since-trial-start, trial-food share — F3) · **all 9
guardrail probes held** (never-reassure, never-picky, no diagnosis, injection
resisted, general-mode-off honored, ambiguous → safety relay). The "subpar" feel is
F1+F2: the two most likely owner questions — meds and trend — are the broken classes.

## Adversarial pass

The analysis is under an isolated `adversarial-reviewer` falsification pass
(transcripts + ground truth + repro as inputs); verdicts fold into the findings
doc's §4 before it is treated as final.

## Filed / decided

- **Backlog:** B-665 (F1 fix + fetch-error hardening + redeploy, `Now`) · B-666
  (planner tuning + pinned eval, `Now`) · B-667 (safety-lead dedupe — PM-gated) ·
  B-668 (deflection copy variants + adverb rule) · B-669 (G2-shaped trial tools) ·
  B-670 (battery as standing live harness + QA-account lifecycle).
- **Open Question added (CLAUDE.md):** the F6 safety-lead delivery call (Dr. Chen vs
  Designer conflict recorded, team lean = structural dedupe; edits ask spec §7.2).
- **PM decisions teed up** (review §8): F6 ruling · redeploy authorization (promotes
  the 3 post-Jul-19 commits) · B-375 outcome-code-only telemetry middle path (with
  T&S) · QA-account lifecycle endorsement.

## Residue

QA account + cloned record stay live until B-665's fix is battery-verified, then
`delete-account` + allowlist removal (review §9). No production config changed except
the reversible allowlist append; the PM's own account/data untouched. **No app code
changed this session — findings only, by design** (the fix is B-665's PR with its own
gates).
