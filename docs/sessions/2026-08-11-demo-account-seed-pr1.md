# Demo-account seed — PR 1 (story module + SQL emitter + honest-firing validation)

**Date:** 2026-08-11

B-271, PR 1 of the App Review demo-account plan (`docs/nyx-demo-account-requirements.md` §12.2, v2.1). Produces the Tier-1+2 seed for the "Cooper" demo account **and proves, offline against the real engine, that it fires both committed findings honestly** — at every UTC hour and for days after seeding — before any live account is touched. No app code, no schema, not a migration.

## What shipped

Six new files, all pure/runtime-neutral or test-only:

- **`scripts/demo/uuidv5.ts`** — a hand-rolled, synchronous, dependency-free UUIDv5 (SHA-1). The `uuid` npm package won't resolve in the Deno `--cached-only` graph, and Web Crypto's SHA-1 is async; this module needs a pure `id = uuidV5(slotKey, petId)`. Verified byte-for-byte against the `uuid` package (18 vectors incl. apostrophe + multibyte) in the jest test's golden check.
- **`scripts/demo/demoStory.ts`** — the timeless, self-contained declarative story: Cooper (diet-trial dog), the demo's own venison + beef `food_items` (proteins on both, `ai_extraction_status='manual'`), the shipped B-417 lifecycle (`diet_trials` + dated `diet_trial_foods` + `target_protein`), and the ~3-week event/meal/weight/stool sequence. Deterministic uuidV5 ids + a stable photo path. `now` enters only at render time (`materializeInstant` for tests, `now()`-SQL in the emitter) so the committed SQL is timeless (§8). Imports nothing from the engine → valid in both the app-`tsc` and Deno graphs.
- **`scripts/demo/emitSeedSql.ts`** — renders the story to run-time-relative, **upsert-only**, dollar-quoted SQL behind a transaction + assertion prelude (exact demo-email match, pet ownership, food-ownership self-check) with a dry-run counts mode.
- **`scripts/emit-demo-seed.deno.ts`** — the Deno CLI (`--user --pet --timezone [--dry-run]`), at `scripts/` top level per the S4 glob rule (a Deno-global entry under `scripts/demo/` would be checked by nothing).
- **`supabase/functions/generate-signal/demoStory.detection.test.ts`** — Deno validation: ① fires Early (pairs=4, never Established) + ② `consecutive_low` + venison washes out, **across all 24 UTC seed-hours** and at **+48h/+96h** survival.
- **`scripts/demo/demoStory.test.ts`** — jest validation: `computeTrialFacts` flags exactly the 4 beef feedings off-diet / venison permitted / `trialDietRefusal` null; the emitted-SQL guarantees (upsert-only, `'manual'`, `logged_via='app'`, deterministic ids, apostrophe escaping, not-a-migration). B-514 timezone idioms.

## What the story encodes (every value load-bearing — R-3/R-4)

- Venison staple 2 meals/day at 08:00/18:00 UTC rated `all` → the diet **washes out structurally** (control-present in every matched pair → riskDifference ≤ 0 by construction).
- **4** beef exposures (D-16/-12/-8/-3, 16:00) each followed ~3h by a vomit → ① Early (3 is the zero-margin floor; 5 hits `establishedMinMatchedPairs`; ≥3 days apart so no beef sits adjacent to another vomit day).
- Two dip days on `UTC-date(now)` and `UTC-date(now)−1`, both trial meals `some`/`picked` → ② `consecutive_low` (delta ≈ 2.5, well past `minDeclineDelta`). **UTC-anchored** because `detectIntakeDecline` buckets on UTC dates; clamped to `≤ now−5min`.
- One benign photo slot on the D-3 vomit (metadata only — bytes + `analyze-vomit` are live, in-app, per §9/R-9).

## What I verified empirically (Node ran the real engine; the Deno binary ran the real test)

Node 22's `--experimental-strip-types` runs `detection.ts` directly (its imports are `.ts`-extensioned), so I validated the story against the **real** `detectSignals` before writing the Deno test:

- **Base run:** ② `consecutive_low` + ① beef Early, matchedPairs=4 / caseExposed=4 / controlExposed=0, venison absent, exactly the two findings, safety (②) ranked first.
- **24-hour sweep:** ①+② fire at every UTC hour (:30).
- **Survival (seed fixed, read advanced):** at +24h/+48h/+96h ② has **decayed** (the dip left the recent-2-day window) while ① still fires Early — the measured asymmetry that justifies §8's re-seed cadence, not folklore.
- **UTC-midnight singularity:** at exactly 00:00:00 ② cannot fire (no elapsed time on today's UTC date for a past meal); ① fires regardless. Documented and pinned, not hidden — the reason for the seed-run-hour rule + the clamp.

Then I fetched a real `deno` binary and ran the Deno test under the **exact CI flags** (`--lock=deno.lock --cached-only --allow-read=supabase/functions`): type-checks + 5/5 pass, no network. jest: 13/13, and green under TZ=UTC+14 / +12:45 / −10 (the B-514 job). `tsc --noEmit`: clean.

## Decisions / notes

- **The photo (§5 vs §9 seam):** the emitter writes ONE `event_attachments` metadata row (stable id + path) per §5/§8; the EXIF-stripped bytes + the `analyze-vomit` read land LIVE, in-app (§9/R-9). The seed never uploads bytes and never writes `event_ai_analysis`. The stable event id + no-delete upsert are what make the live-added read survive re-seeds (R-7). **Runbook constraint to carry:** the live photo must attach to the **existing D-3 vomit**, not a 5th vomit — a 5th vomit episode would push `matchedPairs` to 5 and flip ① to Established.
- **The 5-minute midnight dead-zone** (`now ∈ [00:00, 00:05)`) is intrinsic to ②, not a bug; the §8 "run after ~09:00 UTC" rule and the sweep's minute-offset both keep production and the test clear of it, and the test pins the exact-midnight case explicitly.

## Gates (DoD)

- `adversarial-reviewer` (mandatory — counterexample stated), `code-reviewer`, `rls-privacy-reviewer` on the emitted SQL + runbook: _see the PR description for outcomes._
- Persona sign-off: Data Scientist / Dr. Chen (honesty properties held under executed attack) · Engineer (schema-correct, upsert-only, glob placement) · Trust & Safety (assertion prelude + food-ownership self-check + no fabricated AI read). No `nyx-voice` (no owner-facing copy).

## Follow-ups (not this PR)

- **PR 2** — `docs/app-review-notes.md` (the reviewer notes, §7). Can ride a later session.
- The **PM-gated live seed** (runbook step 2+): resolve the demo `user_id`/`pet_id`, dry-run counts → execute via the Supabase MCP `execute_sql`, run `generate-signal`, verify.
- **B-324** — parameterized story profiles (the cat profile #2, multi-pet #3); the seam is in place (`buildDemoStory(params)`).
