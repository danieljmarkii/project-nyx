# Project Nyx — Status

_Canonical answer to "where are we?". High-churn: update inline at session end and any time these change mid-session. CLAUDE.md is the stable operating manual; this file is the volatile state. **Keep it scannable** — prose narrative and build history belong in PR descriptions + git, not here (the file is reconstructable via `git log -p STATUS.md`)._

**Last updated:** 2026-06-21 — **B-141: slimmed STATUS + backlog.** Both canonical state files had outgrown their own "scannable / one-line Why" contracts (STATUS 225 KB, backlog 266 KB) and accreted ~67 K tokens of session narrative + ~40 Done rows carrying full build play-by-plays. Pruned to live state only; history left in git + PR descriptions (#72–#205). Build phase **unchanged** — Step 10 + parallel tracks.

---

## Current Phase

**Step 10 — AI Signal (`generate-signal`).** B-045 (3-step plan, no Step 4) shipped & merged:

| Step | What | Status |
|---|---|---|
| 1 | Deterministic detection engine (`detection.ts`) — case-crossover (B-050) + intake-decline flag | ✅ #72 (29 tests) |
| 2 | `generate-signal` Edge Function — detect → curate → Haiku-phrase → cache findings set (24h TTL); migration 015 (`findings jsonb`) | ✅ #74 (migration #73) |
| 3 | `SignalZone` wired to cached findings (per-type renderer, confidence tags, tap-to-expand, live/building/stale/`no_pattern`, async regen) | ✅ #75 |

**Architecture:** deterministic detection + LLM phrasing — the server computes & ranks a *true* finding in `detection.ts`; Haiku 4.5 only renders copy, with a deterministic template fallback. `phrasing.ts` = pure phrasing/curation/guardrails (offline unit-tested); `index.ts` = I/O shell. `validatePhrasing` rejects model drift (no `!`; never-reassure / never-"picky" on safety; associational-only on correlation).

**Signal engine — detectors live (deployed `generate-signal` v14):** ① case-crossover, ② intake-decline, ③ reflection (presence/counts; a *declining* trend routes to safety), ④ symptom-worsening lane (B-077), ⑤ post-prandial timing (B-078), ⑥ time-of-day clustering (B-079); + no-signal coverage diagnostics (B-053). Open follow-ups: **B-052** write-time protein normalization (read-time half shipped #92); **B-070** (P0) dominant-staple refinement + treats-vs-meals denominator; **B-067** reflection/Trend dedup; **B-080** diet-structure placement (blocks descriptive Phase 3, PM call).

**On-device QA gap:** empty / `no_pattern` + reflection paths verified on device; the **LIVE safety-card path is still unverified on device** (cat Nyx's real data legitimately yields zero safety findings — chicken is a ~3×/day staple → case-crossover correctly washes it out; intake healthy → flag correctly quiet).

**After Step 10:** Step 9 (vet report PDF) resumes — interrupted by PM for B-045 dogfooding value; **blocked on the PDF-library open question**.

---

## Parallel Tracks

### B-054 Multi-device down-sync (hydration) — v1 COMPLETE
Spec `docs/multi-device-sync-requirements.md`. Phases 0–3 + §6 cold-start UI all merged (#82–#86); migration 016 (`meals.updated_at`) applied live. Server-time LWW, incremental per-table watermark hydration, meal-ghost absence-reconcile. **Remaining: the physical AC-6 logout-wipe on-device gate** (Trust & Safety; code passes). Phase 4 (Realtime) is post-v1/optional. Residual assumption logged B-058.

### B-117 Medication logging — Phases A–C done; Phase D next
Spec `docs/nyx-medication-logging-requirements.md` (§12 = 10-PR plan). Model = **regimen + dose-events** (mirrors food: `medication_items`≈`food_items`, `medications`≈`diet_trials`, `medication_administrations`≈`meals`+`intake_rating`). Net-new additive schema (migration 020 applied live; 021 med-photos RLS applied; `nyx-medication-photos` bucket created PRIVATE). Configure regimen once → one-tap dose log. Safety: adherence inherits both invariants (n=1 never reassures; refusal→health flag; missed critical-drug→escalate; AI-extracted dose never silently trusted).

| Phase | PRs | Status |
|---|---|---|
| A — Foundation | 1–3 | ✅ schema (#192) · local mirror+sync (#194) · text-first quick-log (#196) |
| B — Photo + library | 4–6 | ✅ bucket+RLS (#197) · capture + `extract-medication-from-photo` + dose-confirm (#199) · picker detail/edit (#201) |
| C — Regimen + surfaces | 7–8 | ✅ "Current medications" card + compliance % (#202) · timeline + retroactive adherence + double-dose B-135 (#204) |
| D — Clinical consumers | 9–10 | ⬜ **PR 9 Signal confounder pass** (`detection.ts` `medicationWindows`, **adversarial-mandatory**) · PR 10 vet-report section (gated on Step 9) |

Carry-forwards: B-122/123 satisfied; B-131 honored; B-128(b) defense-at-rest trigger (own schema PR); open sub-decisions B-132 (library delete), B-133 (`is_critical` owner toggle — PM call).

### B-023 Patterns dashboard — PRs 1–4 merged; PR 5 blocked on Step 9
Spec `docs/nyx-analytics-dashboard-requirements.md`. **No schema** (rides existing tables + `ai_signals` jsonb; migration 018 added an additive `summary`). Build gates resolved: §13 #1 name = "Patterns", §13 #6 colour-as-wellness ruling.

| PR | What | Status |
|---|---|---|
| 1 | Aggregate layer `lib/analytics.ts` + shared `lib/protein.ts` | ✅ #155 |
| 2 | Card components + §13 #6 colour ruling | ✅ #158 |
| 3 | Dashboard screen + Home doorways + `ComingSoonSummary` | ✅ #159 |
| 4 | AI summary — **template-only** (Haiku path built but gated off = B-096); migration 018 | ✅ #160, deployed live |
| 5 | Vet-report bridge ("Share with my vet") | ⬜ blocked on Step 9 |

Open follow-ups: B-094 (decline-watch/diet-trial cards), B-095 (correlations/coverage cards), B-096 (re-enable Haiku summary), B-099 (over-time + dashboard range — reopens §13 #2), B-116 (summary↔card grounding). Shipped polish: #162/#163/#164/#185.

### B-086 Multi-pet v1 — COMPLETE
Spec `docs/nyx-multi-pet-requirements.md`. PRs 1–6 all shipped (#144–#148, #203); **zero schema** (`pet_id`/RLS/`is_active`/`feeding_arrangements` were multi-pet-ready by construction). Single-pet households see no new chrome. PR 6 = cross-pet safety banner + all-active-pets signal freshness (adversarial PASS). Household §7 on-device cases fold into the TestFlight QA pass.

### B-040 Free-feeding R1 — COMPLETE
Spec `docs/nyx-free-feeding-requirements.md`. PRs 1–4 shipped (#119/#121/#122/#123); migration 018 applied live. Schema → capture/view → History rendering (ambient strip + boundary markers + stale-only freshness) → engine ingestion (free-fed protein excluded from candidacy, caps others at Early; adversarial PASS). **Guardrail (every consumer):** free-fed intake is NOT directly observed — never read absence of witnessed intake as "didn't eat"; vet report carries "intake not directly observed" verbatim. Remaining Step 9 consumer: vet-report feeding-method rendering. Open: B-073 (stale-nudge on-device QA), B-074 (exclusion can silence a real finding — awareness).

### Food library / intake
- **B-004 standalone Food Library — COMPLETE** (#176–#182, 7 slices). 4th `Foods` tab, brand grouping, reliable-favorites, row thumbnails; picker stays 2-up tiles (PR 7 decision). + post-QA fixes #183/#184.
- **B-102 `human_food` food_format — in progress** (PRs 1–2, #166/#167). Migration 019 applied live + capture/display parity. Remaining PRs 3–7 (AI-extraction mapping, analytics regression, engine provenance, vet-report line, diet-trial note) — PRs 3/4 are disjoint and parallelizable.
- Open QA findings: B-111 (treats in Top Proteins, clinical call), B-113 (picker↔tab harmonization, #186), B-112/B-114, B-108 (closed #183). Downstream: B-017 (`food_format`/`food_type` overlap, carries B-024/B-102), B-009/B-018 dedup.

### Design-system v1.2 "Linear Clean" — COMPLETE
Plan `docs/design-system-migration-plan.md`. 4 PRs merged: palette (#99), fonts Geist+Newsreader (#100), Lucide event icons (#101), completion "moment" (#103) + B-064 folded meal card (#105). Open: B-061 app-wide Geist body rollout (open question — wrapper vs shim); B-063 tone-aware-moment design-principles line (PM sign-off). Whole-system aesthetic on-device QA still due.

---

## Blocking Open Questions

- **PDF rendering library for Step 9** (`pdf-lib` vs `puppeteer` vs `react-pdf`). Blocks the vet report. See CLAUDE.md → Open Questions.

---

## Open PM Action Items

**Ship gates / on-device QA**
- [ ] **B-039 PR 2** (#193, merged) — on-device end-to-end deletion QA on a **throwaway** account; closes the App Store 5.1.1(v) blocker. Code + 527 tests pass.
- [ ] **AC-6 logout-wipe** — sign out on a populated device → confirm data empties → sign into a *different* account → confirm no prior-pet data shows (Trust & Safety gate; code passes).
- [ ] **B-053 on-device QA** — Signal regens against v10; the staple-washout diagnostic only shows in `no_pattern` (Nyx may show the reflection finding instead — correct, not a bug).
- [ ] **Confirm AI summary on-device** — open Patterns for Nyx; expect a safety-led, vet-routing summary with every number matching a card.
- [ ] **Whole-system aesthetic on-device QA** — walk the app vs `docs/design-system/_system/.../index.html` for the holistic Calm/Linear/Oura pass (deferred to end-of-system; all 4 design PRs merged).

**Decisions**
- [ ] **B-099** — reopen spec §13 #2 (over-time views + dashboard 7d/30d range) before building B-099.
- [ ] **B-080** — placement of diet-structure observations (Signal band-2 vs B-053 coverage lane); blocks descriptive Phase 3.
- [ ] **B-023 colour** — reconcile Home `TrendZone` (colours a falling symptom "improving" in the accent, `TrendZone.tsx:66/79`) to the §11 #3 ruling, or accept the cross-tier difference.
- [ ] **B-065** — should the food-capture add-then-log path also show the meal completion card (intake chips + "Change time")?
- [ ] **B-063** — approve the Tier-2 design-principles line (tone-aware "moment" — calm, never festive on a worrying event); awaiting PM sign-off before writing.
- [ ] **PR #79** — env fail-fast guard + CLAUDE.md doc fix: mark ready/merge or close.

**Cleanup / infra**
- [ ] **B-118** — delete the leftover `smart-worker` Edge Function from the dashboard (stock template, no callers, carries a `secret`-auth path that bypasses RLS).
- [ ] **B-044** — finish auditing migration drift (verify `food_items.photo_path` singular vs `photo_paths` plural; full repo-migrations-vs-live-DB reconciliation).
- [ ] **B-128(b)** — defense-at-rest `BEFORE INSERT/UPDATE` trigger on `medication_items` (own schema PR; run the backfill pre-check first). Not urgent — the consumer-side guard is live via #200.
- [ ] **Re-deploy `generate-signal` from merged `main`** for provenance (live v14 was deployed from-branch; low urgency — the live bytes are the merged code).
- [ ] **Revoke the Supabase personal access token** (`nyx-cli-deploy`, 2026-06-07) — account-level, lives in a session transcript.
- [ ] **Supabase CLI dev-dependency** — fold `supabase@^2.102.0` (on branch `claude/epic-volta-H8d6o`) into a PR so it survives merge.
- [ ] _(awareness, no action)_ **B-074** — the free-fed exclusion fails safe but a single stray free-fed day landing on a selected control day can silence a real correlate.

---

## Runtime in Use

**TestFlight (real iOS builds) — primary on-device target since 2026-06-07.** Runtime B (Metro `npx expo start --tunnel` + Expo Go) remains available for fast local iteration.

**Cut a new TestFlight build** (verified build 22 from `main`, 2026-06-12) — one command builds the store-signed binary and submits that same artifact:
```
eas build --platform ios --profile production --auto-submit
```
**OTA to the installed build:** `eas update --branch production` (the build's channel is `production`, NOT `preview`).

**Traps (each cost a session — do not repeat):**
- Never build TestFlight with the `preview` profile — it's `distribution: internal` (ad-hoc), never store-submittable. Use `production`.
- Never submit with `eas submit --latest` — it skips internal builds and re-uploads a stale store build (the "build number 8 already used" loop). Use `--auto-submit` (binds the upload to the binary just built).
- "Build number N already used" = EAS counter is behind App Store Connect → `eas build:version:set --platform ios`, then rebuild. (Build numbers live on EAS; `appVersionSource: remote`, `autoIncrement`.)
- All 3 `eas.json` build profiles carry the `EXPO_PUBLIC_SUPABASE_*` `env` block (#90) — EAS cloud builds never see the gitignored `.env.local`; don't strip it (was the first crash-on-launch).
- `app.json` → `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` (#121) auto-answers Apple's encryption questionnaire; keep it committed.

---

## Recent Sessions

_Last ~13 only; older history lives in git (`git log`) + PR descriptions._

- 2026-06-21 — B-141: slim STATUS + backlog to their scannable contracts — #209
- 2026-06-20 — History filters: scope menu + unified type lens — #205
- 2026-06-20 — Multi-pet PR 6: cross-pet safety banner + all-active-pets signal freshness (B-086) — #203
- 2026-06-20 — B-117 PR 8: medication timeline + retroactive adherence + double-dose (B-135) — #204
- 2026-06-19 — B-117 PR 7: regimen setup + "Current medications" card + compliance % — #202
- 2026-06-19 — B-117 PR 6: medication picker library + detail/edit — #201
- 2026-06-19 — B-128: scope delete-account med-photo purge to `{uid}/` prefix — #200
- 2026-06-19 — B-117 PR 5: medication photo capture + AI extraction + dose-confirm — #199
- 2026-06-19 — B-127: purge `nyx-medication-photos` in delete-account — #198
- 2026-06-19 — B-117 PR 4: `nyx-medication-photos` bucket + RLS — #197
- 2026-06-19 — B-117 PR 3: text-first medication quick-log — #196
- 2026-06-19 — B-117 PR 2: medication local mirror + sync plumbing — #194
- 2026-06-19 — B-039 PR 2: client account-deletion UX — #193
- 2026-06-19 — B-117 PR 1 (schema 020) + B-039 plan + B-043 cleanup — #192 / #189 / #188
