# CUL-298 (B-203) — analyze-vomit/stool: the partial multi-photo read

**Date:** 2026-08-17

Shipped via **#669** (draft). One PR, two files of code (`supabase/functions/_shared/incident-analysis.ts` + its test), no schema, no client change.

## The bug

`runIncidentAnalysis` (the shared per-incident AI pipeline both `analyze-vomit` and `analyze-stool` run through) fetches each of an event's photos via `fetchUsableImageBlob`, which returns `null` for any frame it can't bring under Claude's size cap; it also only ever sends the first `MAX_PHOTOS_PER_ANALYSIS` (3) photos to the model. When some photos were dropped, the model ran on just the readable subset (`usableBlobs`) and could land `monitor` **with no signal the read was partial**. If the *dropped* frame held the blood, the event rested on a benign photo and landed `monitor`, and the detail card / vet report even rendered "Blood: none visible" from a partial view — a reassurance-on-absence the n=1 / `clinical-guardrails` invariant forbids (a single sample may escalate on the *presence* of a red flag, never reassure on its *absence*). Surfaced by `adversarial-reviewer` on PR #255; pre-existing (the old post-encode size filter dropped photos the same way) and made rarer, not fixed, by the client-compress change. In the current single-photo client this is legacy-data-only, but the pipeline supports (and legacy rows carry) multiple attachments.

## The fix

A new pure predicate in the shared module:

```ts
shouldCollapsePartialRead({ usableCount, totalCount, recommendation }) =
  (0 < usableCount < totalCount) && recommendation !== 'worth_a_call'
```

In `runIncidentAnalysis`, after the escalation floor computes the recommendation: if the read is a **non-empty proper subset** of the event's photos **and** what we saw didn't escalate, collapse to the **already-shipped fully-unread shape** — `analysis = null`, `visualFlags = []`, `recommendation = 'not_enough_to_say'`. That drops the reassuring outcome from the verdict, the read text (falls through to the honest "there's not much I can read from this one… your vet is the best call" template), **and** the structured observations (`buildStructuredValues(null)` → no "Blood: none visible") in one move, by reusing the path a fully-unreadable photo already takes.

**The load-bearing ordering:** the floor runs *first* (step 7), lifting every contextual/visual/model escalation to `worth_a_call` before the collapse guard (step 7b) ever inspects the verdict. So an escalation the readable photos surfaced — a visual flag, the model's own `worth_a_call`, or a fired contextual flag (repeated vomiting, feline reduced-intake, concurrent lethargy) — is **never** collapsed. Presence always escalates; only *absence* on a partial view is refused. `total = photoPaths.length` (all attachments, uncapped), so the `>MAX_PHOTOS` overflow counts as partial too, not just the size-drop.

**Why collapse rather than a bespoke "partial" state/copy:** the fully-unread path already models "we can't give an event-level read we stand behind," so reusing it means one fewer state to render and it inherits the never-reassure guarantees end-to-end. A dedicated "one photo was too large — re-shoot" message was rejected as a rare legacy-data edge case where "re-shoot" isn't cleanly actionable on already-stored photos.

## Reviews

Both mandatory reviews ran (the change alters clinical escalation output).

**`adversarial-reviewer` — PASS.** Falsification attempts, all held:
- benign 1-of-2 read (dropped frame could hold the blood) → collapses to `not_enough_to_say` + null structured, no `monitor`, no partial-view "Blood: none visible" ✓
- same 1-of-2 with `feline_reduced_intake` firing → `worth_a_call` survives the collapse (floor-before-guard ordering) ✓
- `>3`-photo overflow (3 of 5, benign) → counts as partial, collapses ✓
- complete (2 of 2) and fully-unreadable (0 of 2) → neither mis-triggers this guard ✓
- re-analysis erasing a prior `fresh_red` on a non-edited row → same write path as the shipped unreadable case, strictly safer than pre-diff ✓

**`code-reviewer` — ship-ready** (code-health/house-rules). Traced the wiring independently (no staleness after the `let` reassignments, correct collapse placement, escalations survive), ran the suites (1346 deno / 89 vomit+stool / 5276 jest, 0 type errors), no house-rule issues. Its three items: one doc-comment inaccuracy (fixed), one copy nuance (deliberate — the collapse reuses the honest noFlag template; a future nyx-voice pass could add partial-specific copy), and the note that any `>3`-photo event can now never land `monitor` again (only `worth_a_call`/`not_enough_to_say`) — intended, the safe direction, and near-unreachable in the current single-photo client.

## Residuals filed (both pre-existing, not regressions of this diff)

- **CUL-531** (Low) — a partial read that escalates via a *contextual* flag still keeps the readable photo's "Blood: none visible" on the *card* (the collapse only fires on non-`worth_a_call`). Mitigated: the card is already escalating (`worth_a_call`), and the vet report is independently guarded (`unionPresentFlags`). Same behavior exists for full contextual escalations too.
- **CUL-532** (Medium) — step-9's write-back decides update-vs-upsert on `humanEdited` alone, where step 5 (capped path) uses `humanEdited || existingRealAnalysis`. So any *degrading* re-analysis (unreadable *or* now collapsed-partial) on a non-edited row erases a prior real analysis's red flags. Not introduced here — the collapse rides the existing step-9 path and is strictly safer than pre-diff — but bringing step 9 to parity would close it.

## Follow-up on merge

`analyze-vomit` and `analyze-stool` both esbuild-inline the shared module, so **both** need a redeploy after #669 merges (`scripts/deploy-edge.sh <fn>` + Supabase MCP `deploy_edge_function`, preserving `verify_jwt=true`). No migration, no new secret. Not fired from this session — it's a live change to two clinical functions, gated on review + merge.

## Persona lenses

Data Scientist / Dr. Chen (the never-reassure-on-absence invariant, the escalation-preserving ordering), Engineer (the pipeline wiring + the pure-predicate testability seam). Designer N/A — the fix reuses shipped copy templates; the partial-specific copy nuance is deferred (code-reviewer NIT).
