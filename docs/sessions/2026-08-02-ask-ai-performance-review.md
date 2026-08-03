# Ask AI performance review — QA battery, root cause, team convening

**Date:** 2026-08-02

**Shipped via #572** (draft). Branch `claude/ask-ai-performance-review-dx15xw`.

## What this is

The PM reported Ask's answers as subpar and asked to (1) pull the real ask/response
data, (2) have the Data Scientist grade it, (3) convene the product team on
improvements. Step (1) hit a ratified wall: **Ask persists no transcripts anywhere**
(spec §10 / D8 — ephemeral in-memory conversation only; no question text in logs;
`ai_usage` counters are the only trace: 5 conversations / 8 messages, Jul 19–Aug 1).
So QA generated fresh data against the real pipeline instead: a dedicated QA account
(`nyx-qa-ask@`, direct auth insert, allowlisted), a byte-faithful in-DB clone of the
cat's record (910 events / 757 meals / 39 dose admins with identical linkage nulls /
48 cached reads / the active trial), and a **31-question battery + 9 adversarial
probes over HTTPS against the deployed `ask` v4 with a real JWT**, every
deterministic question graded against SQL ground truth. Full findings + convening +
PM rulings: **`docs/ask-ai-performance-review-2026-08.md`** (v1.1); frozen
transcripts: `docs/research/2026-08-ask-qa-battery-transcripts.jsonl` +
`2026-08-ask-qa-probes.jsonl`.

## Headline findings (both live-verified)

1. **Every medication answer in production is confidently false** — "0 doses of
   Motozol logged" against 35 real all-`given` doses. B-156's `paired_event_id`
   (migration 023) made the `events` ↔ `medication_administrations` embed ambiguous;
   PostgREST returns HTTP 300 `PGRST201` (**universal** — reproduced with an
   impossible pet id); `ask/index.ts` maps `(doseEventsRes.data ?? [])` with no error
   check → the dose context is silently `[]` on every request. FK-hinted, the same
   fetch returns all 35 rows and the current `medications()` tool answers perfectly.
   → **B-670**, redeploy PM-authorized.
2. **The identical unhinted embed is live in `generate-signal/index.ts:725`** — the
   B-117 PR 9 medication confounders and B-156 PR C1 vehicle attribution have been
   **inert in production since 2026-06-23** (found by the adversarial pass). Both
   bugs are a regression class of closed B-196: `generate-report` got the fix,
   `ask` + `generate-signal` never did. → **B-676**.

## The adversarial pass earned its keep

The isolated `adversarial-reviewer` **FAILED the v1.0 draft**: my L1 grading was
wrong ("fully finished 16 of 19" is a claim-substitution in the reassuring
direction, not a caveat), two photo answers I graded ✓ ship a real never-reassure
leak (the recall-tool path bypasses the photo-read scrub → **B-677**), my C1 remedy
would have shipped a G7 leak (the P5 reword returns a negative-preference ranking
off a one-event difference → **B-678**), and the root cause was under-scoped
(B-676). Its probe-pair method (P1 answered "12 → 11" while P6's rephrase of the
same question got `unsupported`) settled planner-vs-tool-gap definitively. All
corrections folded into the doc's v1.1; its DoD falsification line is §5.1 verbatim.

## Scorecard (v1.1)

11 clean-correct · 2 right-numbers-through-a-leaked-path · 4 confidently wrong
(3 × meds + L1) · 5 planner failures with tools verified in the deployed bundle ·
2 genuine tool gaps · guardrails 8/9 head-on with one reword leak. The "subpar"
feel = the meds and trend question families, exactly the broken classes.

## Filed / ruled

- **Backlog:** B-670–B-675 (filed as B-665–B-670, renumbered at the `main` merge —
  first-lands-keeps) + new B-676–B-682 + the B-375 direction update. Ride-along
  find: the B-435 dup-ID check caught the collision.
- **PM rulings (same day, recorded in the doc §8):** safety-lead = per-conversation
  dedupe with **dismiss-per-conversation** semantics (B-672; the F6 Open Question
  is resolved → `docs/decisions-archive.md`); **B-670 redeploy authorized** (next
  session's PR 1, now covering B-676 too); **B-375 direction = full Q/A text,
  T&S-designed** (T&S still gates); Ask-in-Patterns vision → **B-682**, gated on
  the quality bar.

## Residue

QA account + cloned record stay live until B-670's fix is battery-verified, then
`delete-account` + allowlist removal. The QA user's 40/day `ask_message` cap is
exhausted for 2026-08-02 (UTC) — a same-day re-run needs the next UTC day. No
production config changed except the reversible allowlist append; the PM's own
account/data untouched. **No app code changed this session — findings only, by
design** (the fixes are B-670/B-676's PRs with their own gates).

## Next Session Kickoff

**Recommended first prompt:**
> Read `docs/ask-ai-performance-review-2026-08.md` §7 (build queue) and the B-670 +
> B-676 backlog rows. Build PR 1: FK-hint the dose embeds in `ask/index.ts` and
> `generate-signal/index.ts`, add error checks to every context fetch in both (a
> fetch error degrades to the honest deflection / skips the confounder pass, never
> an empty record), add the source-scan tests, then redeploy both functions per
> `docs/edge-deploy-runbook.md` (redeploy is PM-authorized). Verify by re-running
> the B-675 battery med questions as the QA user (cap resets next UTC day):
> expected "Motozol 28 given, last dose Jul 30."

**Alternate prompts:**
- Guardrail path closures (B-677 + B-678): one-scrub-path for cached reads through
  `redactReadForModel`, close the P5 reword, fix top_foods provenance. clinical-guardrails
  + adversarial re-check.
- Planner tuning + pinned eval (B-671): deflect-exemplar fixes; the P1/P6 pairs as
  named fixtures; A3 evaluative phrasings route to `clinical_judgment`.

**Parallel / efficiencies:**
- PR 1 (B-670/676) and B-677/678 touch different layers of the same two files —
  sequence them, don't parallelize.
- B-673/679/680 (copy + enum + credit split) is disjoint from both and can run as a
  parallel session; expect the usual STATUS.md wrap collision only.
- B-672 (safety-lead build) is ruled and ready but pairs naturally with B-671's
  planner work; the B-375 T&S design session is independent of all code tracks.
