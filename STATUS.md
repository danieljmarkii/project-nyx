# Project Nyx — Status

_Canonical answer to "where are we?". High-churn: update inline at session end and any time these change mid-session. CLAUDE.md is the stable operating manual; this file is the volatile state. **Keep it scannable** — prose narrative and build history belong in PR descriptions + git, not here (the file is reconstructable via `git log -p STATUS.md`)._

**Last updated:** 2026-06-22 — **B-028 shipped (#220): editable per-incident AI structured fields + "Edited [date]" provenance** — the read-only vomit fields are now owner-editable (`VomitFieldsEditor`), with a per-field "edited" marker + one calm "Edited [date]" line; the n=1 read stays dismissible-not-editable + owner-facing-only. The **never-clobber-on-re-analysis guard** is extracted to pure fns and TESTED both halves — `buildAnalysisWriteBack` (server, deno) + `buildVomitEditWrite`/`deriveEditedFields` (client, jest); **adversarial-reviewer PASS**, code-reviewer fixes applied. No schema (migration 013 already carries `edited_at` + `ai_raw_payload`). _Prior:_ **B-115 exact-ms treat-collapse (#219)** + **B-044 migration-drift audit (#218, zero drift)** — **all three Step 9 preconditions (B-044, B-115, B-028) are now cleared**; Phase 1 is gated only on the two PM calls (real-vet R1/R2 + HTML-first ratification). _Earlier:_ **Vet-report (Step 9): build-ready requirements spec + 10-PR plan** — `docs/nyx-vet-report-requirements.md` (draft); §8.1 vet-only + §8.3 scope/cherry-pick folded in, §8.4/§8.5 ratified, **NO new schema**, **spec locks after the real-vet R1/R2 pass**. NO build-phase change — **Step 10 + parallel tracks unchanged**.

---

## Current Phase

**Step 10 — AI Signal (`generate-signal`).** B-045 (3-step plan, no Step 4) shipped & merged:

| Step | What | Status |
|---|---|---|
| 1 | Deterministic detection engine (`detection.ts`) — case-crossover (B-050) + intake-decline flag | ✅ #72 (29 tests) |
| 2 | `generate-signal` Edge Function — detect → curate → Haiku-phrase → cache findings set (24h TTL); migration 015 (`findings jsonb`) | ✅ #74 (migration #73) |
| 3 | `SignalZone` wired to cached findings (per-type renderer, confidence tags, tap-to-expand, live/building/stale/`no_pattern`, async regen) | ✅ #75 |

**Architecture:** deterministic detection + LLM phrasing — the server computes & ranks a *true* finding in `detection.ts`; Haiku 4.5 only renders copy, with a deterministic template fallback. `phrasing.ts` = pure phrasing/curation/guardrails (offline unit-tested); `index.ts` = I/O shell. `validatePhrasing` rejects model drift (no `!`; never-reassure / never-"picky" on safety; associational-only on correlation).

**Signal engine — detectors live (deployed `generate-signal` v21):** ① case-crossover, ② intake-decline, ③ reflection (presence/counts; a *declining* trend routes to safety), ④ symptom-worsening lane (B-077), ⑤ post-prandial timing (B-078), ⑥ time-of-day clustering (B-079); + no-signal coverage diagnostics (B-053, incl. **B-070** ≥80%-dominance staple-washout + treats-vs-meals copy register, live v21); + **medication confounders** (B-117 PR 9 #207 — a drug on-board in a symptom window enters `detectCorrelations` as a confounder: case-enriched → suppress, concordant → cap at Early). Open follow-ups: **B-052** write-time protein normalization (read-time half shipped #92); **B-067** reflection/Trend dedup; **B-080** diet-structure placement (blocks descriptive Phase 3, PM call).

**On-device QA gap:** empty / `no_pattern` + reflection paths verified on device; the **LIVE safety-card path is still unverified on device** (cat Nyx's real data legitimately yields zero safety findings — chicken is a ~3×/day staple → case-crossover correctly washes it out; intake healthy → flag correctly quiet).

**After Step 10:** Step 9 (vet report) resumes — interrupted by PM for B-045 dogfooding value. **Discovery → mock → requirements-spec all complete:** `docs/vet-report-discovery.md` (#214) → `docs/vet-report-mock.html` + `-mock-review.md` (#216) → **`docs/nyx-vet-report-requirements.md` (build-ready DRAFT)** with the 4-phase / ~10-PR plan. **§8.1 vet-only** + **§8.3 scope/cherry-pick** + the must-carry consumers are folded in; §8.4/§8.5 ratified. **Preconditions ALL CLEAR:** ~~B-044~~ ✅ (#218, zero drift) + ~~B-115~~ ✅ (#219, exact-ms treat-collapse — guards the EXIF/batch case; per-tap residual → B-163) + ~~B-028~~ ✅ (#220, editable AI fields). **Two PM gates remain before Phase 1 locks/merges:** (1) **real-vet R1/R2 validation** (the spec-lock gate — recruit 5–8 GPs; build the companion cat/safety-led mock first); (2) **PM formally ratifies §8.2 HTML-first** (demotes the PDF-library question to the B-144 render spike).

---

## Parallel Tracks

### B-054 Multi-device down-sync (hydration) — v1 COMPLETE
Spec `docs/multi-device-sync-requirements.md`. Phases 0–3 + §6 cold-start UI all merged (#82–#86); migration 016 (`meals.updated_at`) applied live. Server-time LWW, incremental per-table watermark hydration, meal-ghost absence-reconcile. **Remaining: the physical AC-6 logout-wipe on-device gate** (Trust & Safety; code passes). Phase 4 (Realtime) is post-v1/optional. Residual assumption logged B-058.

### B-117 Medication logging — Phases A–C done; Phase D in flight (PR 9 shipped; PR 10 gated on Step 9)
Spec `docs/nyx-medication-logging-requirements.md` (§12 = 10-PR plan). Model = **regimen + dose-events** (mirrors food: `medication_items`≈`food_items`, `medications`≈`diet_trials`, `medication_administrations`≈`meals`+`intake_rating`). Net-new additive schema (migration 020 applied live; 021 med-photos RLS applied; `nyx-medication-photos` bucket created PRIVATE). Configure regimen once → one-tap dose log. Safety: adherence inherits both invariants (n=1 never reassures; refusal→health flag; missed critical-drug→escalate; AI-extracted dose never silently trusted).

| Phase | PRs | Status |
|---|---|---|
| A — Foundation | 1–3 | ✅ schema (#192) · local mirror+sync (#194) · text-first quick-log (#196) |
| B — Photo + library | 4–6 | ✅ bucket+RLS (#197) · capture + `extract-medication-from-photo` + dose-confirm (#199) · picker detail/edit (#201) |
| C — Regimen + surfaces | 7–8 | ✅ "Current medications" card + compliance % (#202) · timeline + retroactive adherence + double-dose B-135 (#204) |
| D — Clinical consumers | 9–10 | ✅ PR 9 Signal confounder pass (#207 — `detection.ts` `medicationWindows`; case-enriched drug → suppress, concordant → cap at Early; adversarial PASS, fixed a Bonferroni family-shrink; residuals B-138; deployed v19) · ⬜ PR 10 vet-report section (gated on Step 9) |

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

- **PDF rendering library for Step 9** (`pdf-lib` vs `puppeteer` vs `react-pdf`). Blocks the vet report. See CLAUDE.md → Open Questions. **Reshaped by discovery (#214) + the requirements spec (this session):** the spec's design basis is HTML-first (`docs/nyx-vet-report-requirements.md` §8.2), demoting this to the B-144 render spike (Phase 4 PR 10). **Now needs only the PM's formal ratification of HTML-first** — it does **not** block Phase 1's data/query layer (render-agnostic).

---

## Open PM Action Items

**Ship gates / on-device QA**
- [ ] **B-039 PR 2** (#193, merged) — on-device end-to-end deletion QA on a **throwaway** account; closes the App Store 5.1.1(v) blocker. Code + 527 tests pass.
- [ ] **Toggle Supabase "Confirm email" OFF** (Auth → Providers → Email) to unblock the B-039 throwaway-account QA above — new-account creation silently failed under email-confirmation (fixed in #213 to show "Check your email"; re-enable before launch — B-152).
- [ ] **#213 med-QA fixes — on-device spot-check** (Manual QA in the PR): account-creation "Check your email"; strength-gate toggle; "Current medications" counts a logged dose; End-button red; no `meals 23503` on logging an existing food.
- [ ] **AC-6 logout-wipe** — sign out on a populated device → confirm data empties → sign into a *different* account → confirm no prior-pet data shows (Trust & Safety gate; code passes).
- [ ] **B-053 on-device QA** — Signal regens against v10; the staple-washout diagnostic only shows in `no_pattern` (Nyx may show the reflection finding instead — correct, not a bug).
- [ ] **Confirm AI summary on-device** — open Patterns for Nyx; expect a safety-led, vet-routing summary with every number matching a card.
- [ ] **Whole-system aesthetic on-device QA** — walk the app vs `docs/design-system/_system/.../index.html` for the holistic Calm/Linear/Oura pass (deferred to end-of-system; all 4 design PRs merged).

**Decisions**
- [x] **B-070 deploy mechanism — RESOLVED 2026-06-21 (PM chose pre-verified MCP deploy).** Deployed `generate-signal` v20 via the B-082 MCP path: authored the 80 KB bundle, proved it byte-identical to `scripts/deploy-edge.sh`'s artifact (sha `a4759d20…`) via a scratch-file round-trip BEFORE deploy, then confirmed the live read-back is byte-identical + a clean boot smoke-test. **B-082-path finding (logged, low urgency):** the inline-content transcription is only safe with the scratch-file sha gate; provisioning a `SUPABASE_ACCESS_TOKEN` cloud-env secret so `supabase functions deploy` reads the file directly is the durable fix for large clinically-load-bearing functions (runbook's "optional future convenience").
- [ ] **B-099** — reopen spec §13 #2 (over-time views + dashboard 7d/30d range) before building B-099.
- [ ] **B-080** — placement of diet-structure observations (Signal band-2 vs B-053 coverage lane); blocks descriptive Phase 3.
- [ ] **B-023 colour** — reconcile Home `TrendZone` (colours a falling symptom "improving" in the accent, `TrendZone.tsx:66/79`) to the §11 #3 ruling, or accept the cross-tier difference.
- [ ] **B-065** — should the food-capture add-then-log path also show the meal completion card (intake chips + "Change time")?
- [ ] **B-063** — approve the Tier-2 design-principles line (tone-aware "moment" — calm, never festive on a worrying event); awaiting PM sign-off before writing.
- [ ] **PR #79** — env fail-fast guard + CLAUDE.md doc fix: mark ready/merge or close.
- [x] **Vet-report owner band (§8.1 / R4) — RESOLVED 2026-06-22 (PM): band removed; report is vet-only (Strawman A).** Owner's surface = Patterns dashboard (B-023). §8.1 closed → option (a); formalize in the requirements spec.
- [ ] **Vet-report requirements spec — two gates before Phase 1 builds/merges** (`docs/nyx-vet-report-requirements.md`): (a) **formally ratify §8.2 HTML-first** → demotes the PDF-library Open Question to the B-144 render spike; (b) **recruit 5–8 real practicing GPs** for the R1/R2 cold-read — **the spec-lock gate** (capture in `vet-report-mock-review.md` §5); (c) greenlight the **companion cat/safety-led mock** (Sam — feline 48h window) so that panel can exercise the safety-leads slot the Mochi mock can't.
- [ ] **Principle 6 doc-drift (Tier-2 edit)** — `nyx-design-principles-v1_0.md` §6 **and** `nyx-technical-spec-v1_0.md` §7 AC both still list "severity averages" as desired report content; the mock + spec §8.4 deliberately use frequency-over-severity (Dr. Chen's stated preference). Both cold reads flagged it. Approve the doc-line update on **both** files (+ the §7 must-carry-section / HTML-first / PDF-library-reshape edits the spec §13 flags — all flagged, not written).
- [ ] **Vet-report mock — synthetic-panel feedback logged** (`docs/vet-report-mock-review.md`). PM follow-ups from it: (a) **B&W test-print** the mock (zebra/band gray on a mono laser); (b) decide the spec-level **report-range cherry-pick guard** (disclose events outside a custom window); (c) greenlight the **second mock — cat/safety-led case** (Sam, feline 48h window) to exercise the safety-leads slot. The real-vet R1/R2/R4 panel is the gate (§5 of that doc is reserved for it).

**Cleanup / infra**
- [ ] **B-118** — delete the leftover `smart-worker` Edge Function from the dashboard (stock template, no callers, carries a `secret`-auth path that bypasses RLS).
- [x] **B-044** — DONE 2026-06-22: full live-DB reconciliation — **zero schema drift, nothing to apply.** `vet_visit_attachments` already present (003 gap closed 2026-06-06 by `complete_003_vet_visit_attachments`); `food_items.photo_path` singular is dead (superseded by 007 `photo_paths`; no code reads it). All 22 migrations' objects verified live. History records only 5/22 (001–019 dashboard-pasted, unrecorded) → backfill spun out to **B-162** (latent `db push` re-apply footgun; PM-blessed, low urgency).
- [ ] **B-128(b)** — defense-at-rest `BEFORE INSERT/UPDATE` trigger on `medication_items` (own schema PR; run the backfill pre-check first). Not urgent — the consumer-side guard is live via #200.
- [x] **Re-deploy `generate-signal` from merged `main`** — DONE 2026-06-21: redeployed **v21** from merged `main` (447af3f) after #211 merged; live read-back byte-identical to the merged-main bundle (sha `a4759d20…`) + clean boot smoke-test. (v20 from-branch had the same bytes; this is the clean-provenance bump.)
- [ ] **Revoke the Supabase personal access token** (`nyx-cli-deploy`, 2026-06-07) — account-level, lives in a session transcript. Now obsolete: B-082 (#208) made backend deploys a token-free MCP path, so nothing uses it.
- [ ] **Supabase CLI dev-dependency** — fold `supabase@^2.102.0` (on branch `claude/epic-volta-H8d6o`) into a PR so it survives merge.
- [ ] _(awareness, no action)_ **B-074** — the free-fed exclusion fails safe but a single stray free-fed day landing on a selected control day can silence a real correlate.
- [ ] _(awareness, before treating vet-report §8.6 as fully closed)_ **B-115 residual → B-163** — the shipped exact-ms treat-collapse (#219) guards the diet-confounder over-count for the **EXIF-collision / future-batch** case only; today's full-precision `new Date()` stamps mean a **rapid per-tap handful (distinct ms) is still over-counted**. Fully closing it needs a real-data-gated near-window widening (under-count tension) or a batch-log path — Phase-2/PR-6 can proceed; just don't read §8.6 as "fully resolved."

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

- 2026-06-22 — **B-147: empty-state copy sweep (Principle 5)** — warmed the genuinely-plain owner-facing empty states on the older top-level screens (History filtered + true-empty, Foods title, Profile Conditions + Medications, edit-event food picker) up to the bar the Home/dashboard surfaces already set; pet-named + forward-looking per `nyx-voice` Pattern 3, **copy-only** (no style/logic), every rewrite a prompt-to-log never a wellness verdict (§11 #2 / Pattern 6). Left by design: `VomitAnalysisSection` n=1 read, event-not-found / no-pet guards, the 📷 hero (→ B-062), archived-pets. Designer + Engineer lenses (per PM scope); Data-Scientist one-line safety check clean. Engineer de-dup follow-up (shared `EmptyState` primitive + copy-lint) → **B-165**. No build-phase / precondition change. tsc clean; 698 jest green. — shipped via #223
- 2026-06-22 — **B-028: editable per-incident AI structured fields + "Edited [date]" provenance** — the read-only vomit AI fields are now owner-editable on the event detail screen (`VomitFieldsEditor` + shared `vomitFields` vocab); per-field "edited" marker (derived: live field vs cached `ai_raw_payload`) + one calm "Edited [date]" line; n=1 read stays dismissible-not-editable + owner-facing-only (never on the report). **The never-clobber-on-re-analysis guard — untested until now — is extracted to pure fns and tested both halves:** `buildAnalysisWriteBack` (server; edited_at set ⟹ refresh read/flags only, never a structured field or `ai_raw_payload`; 3 deno tests) + `buildVomitEditWrite`/`deriveEditedFields` (client; write only editable fields + edited_at, never a read column; jest). **adversarial-reviewer PASS** (re-read-clobber, escalation-floor-bypass, revert-to-AI provenance, read↔field divergence all held; one cosmetic `contents`-dedup finding fixed + tested). code-reviewer fix-before-merge addressed (hitSlop→16; broken entity; tokens). **Clears the last Step 9 precondition (PR-7 owner-confirmed fields).** Per-tap-failure-hides-edits UX residual → B-164. No schema (migration 013). jest 690 · deno 28 · tsc clean. — shipped via #220
- 2026-06-22 — **B-115: exact-timestamp treat re-log collapse** — new pure `collapseTreatRelogs` (`lib/analytics.ts`) dedups `(foodItemId, ms)`-identical TREAT rows to one EXPOSURE before `computeTopProteins`/`computeTopFoods` ranking, so a multi-piece handful logged per-piece can't inflate a treat's count/share/rank/floor on the vet-report-bound diet-confounder line (spec §8.6 / §11). Treat-only + exact-ms + non-null-id = narrowest SAFE scope (never over-collapses a genuine giving → never hides a confounder; meals untouched → §11 #1 finished-rate + decline lane unaffected **by construction**; B-111 + §11 #5 floor preserved). Decision settled Data-Scientist-lens (dedup, not raw-count). 8 new tests. Adversarial-reviewer PASS. Clears the Step 9 Phase-2/PR-6 precondition **for the EXIF-collision/future-batch case**; rapid per-tap residual (distinct ms) → B-163. No schema; jest 679. — shipped via #219
- 2026-06-22 — **B-044 migration-drift audit closed** — full repo-migrations-vs-live-DB reconciliation: **zero schema drift, nothing to apply.** `vet_visit_attachments` (table+index+RLS) already present (003 partial-apply gap closed 2026-06-06 by `complete_003_vet_visit_attachments`); `food_items.photo_path` singular is **dead** (superseded by 007 `photo_paths` TEXT[]; `refreshFoodCache` reads `photo_paths`, derives `[0]` into the *local* cache only). All 22 on-disk migrations' objects verified live (22 enums · ALTERed cols · RLS + 13 storage policies · `on_auth_user_created` + `updated_at` triggers · 5 buckets). Root cause: `schema_migrations` records only 5/22 (001–019 dashboard-pasted, unrecorded) → live introspection is the only trustworthy drift signal. Clears the Step 9 B-044 precondition; history-backfill residual → B-162. Docs-only. — shipped via #218

- 2026-06-22 — Vet-report (Step 9): **build-ready requirements spec + 10-PR plan** — `docs/nyx-vet-report-requirements.md` (DRAFT): the section contract + the server-side `generate-report` architecture (pure `report.ts`/`render.ts` + I/O shell, mirrors `generate-signal`; **deterministic, no LLM on clinical content**) + a 4-phase / ~10-PR plan. Folds **§8.1 vet-only** + **§8.3 scope-cascade/cherry-pick-guard** + the must-carry consumers as owned PRs (B-117 PR 10 / B-040 / B-102 PR 6 / B-010 / B-023 PR 5 / B-143 / B-144); §8.4/§8.5 ratified one-line. **NO new schema/app code; locks after the real-vet R1/R2 pass; preconditions B-044/B-115/B-028 flagged.** Backlog rows reconciled (B-010/B-028/B-115/B-143/B-144). — shipped via #217
- 2026-06-22 — Vet-report (Step 9): rendered HTML mock (Strawman C) **+ synthetic vet-panel review** — `docs/vet-report-mock.html` + `docs/vet-report-mock-review.md`, the HTML-first artifacts for §10 R1/R2/R4 real-vet validation (clinical-grade, B&W-safe, unbranded; Mochi sample reconciles to its appendix). Isolated GP `vet-report-cold-read` → **CLINIC-READY**; applied its fixes (metronidazole confound moved adjacent to the trend, chart date/trial-start markers, owner-band reframed change-not-success, chronic duration on p1). **Owner band removed (PM) → §8.1 resolved, report is vet-only**; report-range cherry-pick guard → spec. **Real vets remain the gate.** No schema/app code — shipped via #216
- 2026-06-21 — Medication QA-pass fixes + `pm-feature-review` subagent + B-150 — shipped via #213. 2 P0s (strength-confirm gate restored — real toggle/seed-closed/explicit-tick; account-creation null-session → "Check your email"), 4 P1s (compliance matches doses by `medication_item_id`+window via tested `attributeDosesToRegimens`; regimen spinner-hang `.maybeSingle()`; End-button red; meals FK sync race gated on a synced parent event), B-150 banner staleness (`signalTick` — a successful regen re-reads the Signal + cross-pet banner without a re-focus). New `pm-feature-review` subagent + `/pm-review` registered + **dogfooded** on med logging → independently re-found the regimen-vs-dose confusion + a missed bug (free-text regimen never counts doses → B-153). 18 backlog rows (mine renumbered around main's IDs → B-156–B-161); jest 667. Reconciled onto main +8 (incl. B-117 PR 9 #207).
- 2026-06-21 — Vet-report (Step 9) product-discovery round — `docs/vet-report-discovery.md` (synthetic; decidable Open Qs + ranked real-vet research-debt gate; HTML-first delivery reshapes the PDF-library question; B-143/B-144/B-145 logged) — shipped via #214
- 2026-06-21 — B-070: `staple_washout` ≥80%-dominance + honest treats-vs-meals copy register (engine-only; adversarial PASS; **deployed via B-082 MCP path, byte-verified; redeployed v21 from merged main** — first real use of B-082) — shipped via #211
- 2026-06-21 — Vet-report (Step 9) discovery kickoff prompt — `docs/vet-report-discovery-PROMPT.md` (process/meta; team-reviewed, PM-ratified scope) — shipped via #212
- 2026-06-21 — Restore never-committed research + competitive-landscape docs (CLAUDE.md refs fixed) + refresh spec Project Structure tree — #210
- 2026-06-21 — B-141: slim STATUS + backlog to their scannable contracts — #209
- 2026-06-20 — B-082: repeatable Edge-Function + migration deploy path via the Supabase MCP (`scripts/deploy-edge.sh` + `docs/edge-deploy-runbook.md`) — #208
- 2026-06-20 — B-117 PR 9: Signal medication confounder pass (§8) — meds enter the engine as confounders — #207
- 2026-06-20 — History filters: scope menu + unified type lens — #205
- 2026-06-20 — Multi-pet PR 6: cross-pet safety banner + all-active-pets signal freshness (B-086) — #203
- 2026-06-20 — B-117 PR 8: medication timeline + retroactive adherence + double-dose (B-135) — #204
- 2026-06-19 — B-117 PR 7: regimen setup + "Current medications" card + compliance % — #202
