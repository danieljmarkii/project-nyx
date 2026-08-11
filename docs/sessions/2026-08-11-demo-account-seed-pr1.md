# Demo-account seed — PR 1 (story module + SQL emitter + honest-firing validation)

**Date:** 2026-08-11

B-271, PR 1 of the App Review demo-account plan (`docs/nyx-demo-account-requirements.md` §12.2, v2.1). Produces the Tier-1+2 seed for the "Cooper" demo account **and proves, offline against the real engine, that it fires both committed findings honestly** — at every UTC hour and for days after seeding — before any live account is touched. No app code, no schema, not a migration.

## What shipped

Six new files, all pure/runtime-neutral or test-only:

- **`scripts/demo/uuidv5.ts`** — a hand-rolled, synchronous, dependency-free UUIDv5 (SHA-1). The `uuid` npm package won't resolve in the Deno `--cached-only` graph (and ships no types), and Web Crypto's SHA-1 is async; this module needs a pure `id = uuidV5(slotKey, petId)`. Verified against RFC 4122 v5 golden vectors (12 frozen from `uuid@7.0.3`, incl. apostrophe + multibyte + the known nil-namespace vector) in the jest test.
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

- **`rls-privacy-reviewer` → PASS.** Every attack held: swapped userId/petId → the prelude's exact-email-match + pet-ownership RAISE before any write; cross-pet `diet_trial_foods` → the 041 trigger (fires under the service role); deterministic food-id collision clobber → the prelude's food self-check; upsert-only (zero DELETE, no `storage.objects`/`event_ai_analysis` write); photo metadata-only under the 025 owner-scoped private-bucket RLS + pet-prefix CHECK. **One low-severity residual fixed:** the dollar-quote guard checked the full tag `$demolit$` but a value *ending* in `$demolit` still breaks out (the wrapper supplies the trailing `$`) — now guards on `$demolit` (the reviewer's one-line fix), with a partial-tag + full-tag + malformed-uuid test through the public API. Residual #2 (the food self-check couples to `story.foods`, latent for a future profile referencing a food outside it) closed with an invariant test. PM runbook checks it flagged (unverifiable from the repo): `execute_sql` abort semantics (the dry-run backstops it), the `nyx-event-attachments` bucket-private flag, the `app_config` allowlist handover check.
- **`adversarial-reviewer` → one executed break, addressed.** The washout (venison **cannot** be falsely implicated — tested under ±179-min jitter, a 220-day read sweep, and venison-fed-past-the-vomit → riskDifference 0 by construction), ①-Early-never-Established (`matchedPairs` capped at 4 < 5, structurally impossible), ②-honest-firing (silent only in `[00:00,00:05)` UTC — the `:30` sweep is honest, the singularity pinned), the survival asymmetry, and never-reassure **all held under execution**. **BUT** `trialDietRefusal` is null only near seed time: as `now` advances without a re-seed, the *finished* baseline venison meals age out of the 14-day refusal-recency window while the recent-edge dip (which ② needs) stays, so the not-finished **share** climbs past `REFUSAL_SHARE` — it **FIRES at read = seed+10/+11/+12d** (0.50/0.67/1.00), surfacing a FALSE "this diet isn't being eaten" register on the live trial card (`dietTrialCard.ts`). The single-instant jest assertion gave false confidence. Intrinsic (② requires the recent dip), so the only lever is freshness. **Addressed:** ① the jest validation now sweeps read-time and pins `trialDietRefusal === null` across the whole `[seed, seed+9d]` window + the measured first-flip at `+10d` (the number that justifies the ceiling, sibling of the Deno `+48h/+96h` survival test); ② the §8 cadence bound is flagged below (spec/runbook, not code).
- **`code-reviewer` → fix-before-merge (one item), addressed.** It verified empirically (real Postgres, migrations 001–055, the actual emitted SQL run to COMMIT — every column/cast/NOT-NULL matched, 56/48/2/1/2/1 rows; the `LEAST()` clamp landing at `now−5min`; idempotent re-seed; the prelude's rollback-on-decoy; the S4 glob placement). **Fix-before-merge:** `uuidv5.ts`'s docstring + this record claimed a golden-vector test that didn't exist (I verified the crypto in a throwaway harness, then deleted it) — now shipped as a real test (12 vectors frozen from `uuid@7.0.3`, the docstring corrected). **Two nits addressed:** the `diet_trial_foods` upsert now sets `deleted_at` so a re-seed revives a soft-deleted allowed-food row (R-7 "re-seed heals everything"); vomit `occurredAtConfidence` now varies witnessed/estimated per §5 (inert to ①–④, keeps ⑤/⑥ silent).
- Persona sign-off: Data Scientist / Dr. Chen (honesty properties held under executed attack) · Engineer (schema-correct, upsert-only, glob placement — code-reviewer empirically confirmed) · Trust & Safety (assertion prelude + food-ownership self-check + no fabricated AI read). No `nyx-voice` (no owner-facing copy).

## Documentation updates (Tier 2 — flagged for PM, NOT written)

**`docs/nyx-demo-account-requirements.md` §8 — bound the re-seed cadence carve-out.** The adversarial finding above means §8's "re-seed every 24–48h, **skipping any run while ASC shows In Review**" has an unbounded tail: a review that sits "In Review" for ≥10 days silently turns Cooper into the refusal case the story was designed *not* to be (the false `trial_diet_refusal` card at read+10d, and the report too once the B-494 redeploy lands). Proposed edit: add a **hard ≤9-day ceiling since the last seed, enforced even during "In Review"** (well inside the measured +10d flip; at 10+ days stale ② has also been dead for 9+ days, so a stale demo is already visibly degraded — but that is not a substitute for the bound). Awaiting PM approval to write.

## Follow-ups (not this PR)

- **PR 2** — `docs/app-review-notes.md` (the reviewer notes, §7). Can ride a later session.
- The **PM-gated live seed** (runbook step 2+): resolve the demo `user_id`/`pet_id`, dry-run counts → execute via the Supabase MCP `execute_sql`, run `generate-signal`, verify.
- **B-324** — parameterized story profiles (the cat profile #2, multi-pet #3); the seam is in place (`buildDemoStory(params)`).
