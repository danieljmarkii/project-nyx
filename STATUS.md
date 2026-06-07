# Project Nyx — Status

_Canonical answer to "where are we?". High-churn: update inline at session end and any time these change mid-session. CLAUDE.md is the stable operating manual; this file is the volatile state. Keep this scannable — prose paragraphs belong in session summaries and the backlog, not here._

**Last updated:** 2026-06-06

---

## Current Phase

**Step 10 — AI Signal (`generate-signal`).** B-045 is a 3-step plan (no Step 4):

| Step | What | Status |
|---|---|---|
| 1 | Deterministic detection engine (`detection.ts`) — detector ① case-crossover (B-050) + detector ② intake-decline flag | ✅ Shipped, merged to main (PR #72, `c45738d`) — 29 tests green |
| 2 | `generate-signal` Edge Function — detect → curate → Haiku-phrase (parallel, templated fallback) → cache findings set (24h TTL) | ✅ Built (PR #74); migration `015_ai_signals_findings.sql` (additive `findings jsonb`) shipped as its own PR (#73) |
| 3 | `SignalZone` wired to cached `findings` (cache-only read, per-type renderer registry, confidence tags, tap-to-expand, live/building/stale/`no_pattern` states, async regen) | ✅ Built + merged (PR #75); folded in: `usePet` onboarding-bounce fix + interim `no_pattern` copy (B-051) |

**Architecture:** deterministic detection + LLM phrasing — server computes & ranks a *true* finding (deterministic in `detection.ts`); Haiku 4.5 only renders copy, with a deterministic template fallback. `phrasing.ts` holds pure phrasing/curation/guardrail logic (offline-unit-tested); `index.ts` is the I/O shell. `validatePhrasing` rejects model drift (no `!`; never-reassure / never-"picky" on safety; associational-only on correlation) — clinical-guardrails Pattern 8 as test assertions.

**On-device QA gap:** empty / `no_pattern` states verified on device. The **LIVE / safety-card path is NOT yet verified on device** — cat Nyx's real data legitimately yields zero findings (chicken is a ~3×/day constant staple → case-crossover correctly washes it out; intake is healthy → safety flag correctly quiet).

**Next insight work (PM-elevated to Now, 2026-05-31):**
- **B-051** — reflection detector ③ (surface *presence*: counts/trends, no causal claim; Dr. Chen's §7.1 amendment — a *declining* trend routes to safety, not a neutral card).
- **B-052** — normalize `primary_protein` (`chicken`/`Chicken`/`Chicken By-Product Meal` fragment the correlation key).
- **B-053** (Next) — explain *why* there's no signal (coverage / near-miss diagnostics on `no_pattern`: staple-washout, below-floor, unrated meals) to drive retention + corrective logging.

**After Step 10:** Step 9 (vet report PDF) resumes — formally interrupted by the PM for B-045 dogfooding value.

**Side track in flight — B-054 multi-device down-sync (hydration).** New backlog scope (requirements: `docs/multi-device-sync-requirements.md`; 4 phases). **Phase 0 DONE** — jest runner wired (closes B-026); PR #82 **merged to main 2026-06-05**. **Phase 1 BUILT (PR #83, draft) — ENGINE COMPLETE, on-device QA all-but-one green.** `hydrateFromCloud()` in `lib/sync.ts` (events/meals/event_attachments/vet_visits/vet_visit_attachments; paginated full pull; `ON CONFLICT DO UPDATE`/`DO NOTHING`, never `INSERT OR REPLACE`, to dodge the cascade footgun), wired into `runSync` push-before-pull (FR-2), FR-9 logout local-wipe gated on `SIGNED_OUT` (`lib/db.ts` `clearLocalData` + `app/_layout.tsx`), FR-10 attachment render-from-Storage tolerance. Pure reconcile logic in `lib/hydration.ts` (unit-tested). **Adversarial review broke the first cut twice** → fixed: FR-6 "meals immutable" is false → `'refresh-if-synced'` strategy (principled `meals.updated_at` fix = **B-055**, Phase 2); un-paginated pull truncated at 1,000 rows → `fetchAllRows` paginates. **This session (2026-06-06) added, from two-device dogfooding:** FAB quick-log now pushes on-log (was synced=0-until-foreground); **pull-to-refresh on History** (manual "sync now" via new shared `syncNow()`); and a **real bug fix — cross-device delete/edit didn't propagate from the *creating* device** (SQLite `datetime('now')` space-format `updated_at` parsed as local time, corrupting LWW; `parseTs` now normalizes to UTC + FAB writes ISO). **PM on-device QA PASSED:** AC-1 cold start, AC-2 both directions, AC-4 delete (incl. creator-device), `refresh-if-synced` intake edit. **MERGE GATE OUTSTANDING: AC-6 logout-wipe** (Trust & Safety ship gate) not yet verified on-device — the one thing between PR #83 and merge. **Still NOT built (gated on §6 ruling):** "Catching up…" loading state + reactive refresh-after-hydrate (Home doesn't auto-refresh; History now has pull-to-refresh). **Sequencing vs Step 9/10 = open PM roadmap call** (§9.5).

---

## Parallel Track — Food Library / Intake

- B-014 intake capture surfaces COMPLETE (all four shipped).
- B-024 (`jerky` in `food_format`) DONE — merged 2026-05-26 (PR #60), shipped standalone (NOT bundled with B-017's destructive enum reshape).
- Next food-track items: backlog (B-017 `food_format`/`food_type` overlap, B-009/B-018 dedup) or downstream intake consumers (diet-trial compliance, AI Signal intake lines, vet-report intake rendering).

---

## Blocking Open Questions

- **PDF rendering library for Step 9** (`pdf-lib` vs `puppeteer` vs `react-pdf`). See CLAUDE.md → Open Questions.

---

## Open PM Action Items

- [ ] One-time EAS setup in Codespace: `npm install -g eas-cli && eas login && eas init && eas update:configure`, then commit + push the `app.json` changes (`extra.eas.projectId`, `updates.url`, `runtimeVersion`).
- [ ] After first `eas update --branch preview`, open Expo Go → confirm app loads end-to-end (log a meal, snap a food photo, confirm Claude extraction returns).
- [ ] Start Apple Developer enrollment ($99/yr, 1–3 day approval) to graduate from Runtime A (Expo Go + `eas update`) to a real TestFlight build.
- [ ] **Finish auditing migration drift** (B-044). `vet_visit_attachments` was applied 2026-06-06 (via MCP `complete_003_vet_visit_attachments` — surfaced as a hydrate warning during B-054 dogfooding; the `event_attachments` block had been applied back in B-027, but this block never was). **Still to verify:** `food_items.photo_path` (singular, from migration 003 — note the app reads `photo_paths` plural, so the singular may be unused) and a full **repo-migrations-vs-live-DB reconciliation** so we stop discovering half-applied migrations one runtime error at a time.
- [ ] **Delete the leftover `tmp-img-export` Edge Function** (B-043) from the Supabase dashboard — neutralized to a `410` stub but should be removed entirely (no MCP delete tool exists).
- [ ] **Decide on draft PR #79** (env fail-fast guard + CLAUDE.md doc fix) — mark ready/merge or close. Independent of the build; prevents the missing-key flavor of the "Invalid API key" chase recurring.
- [x] ~~Decide on draft PR #82 (B-054 Phase 0 — jest runner, closes B-026).~~ **Merged to main 2026-06-05.**
- [ ] **B-054 sequencing call** — is multi-device sync a now/next priority (slips Step 9/10), or does it stay queued? See `docs/multi-device-sync-requirements.md` §9.5.
- [ ] **B-054 §6 cold-start UX ruling** — needed before Phase 1's UI (not its engine): blocking-when-empty vs progressive vs always-block. (Dismissed this session.)
- [ ] **Supabase CLI dev-dependency** — added on branch `claude/epic-volta-H8d6o` (`supabase@^2.102.0`, committed there). Not on `main` or the Phase 0 branch yet. Decide whether to fold it into a PR so it survives merge (addresses the long-standing "CLI not installed" action item).

---

## Runtime in Use

QA on-device via **Runtime B** — Metro dev server (`npx expo start --tunnel`, scan QR in Expo Go). ⚠️ `eas update` does NOT reach Expo Go (EAS Update targets a *build* with a matching channel + `runtimeVersion`, not the generic Expo Go app). Runtime A is blocked until a real dev/preview build exists (blocked on Apple Developer enrollment). Treat Runtime B as the daily driver for now.

---

## Recent Sessions

- **2026-06-06 — B-054 Phase 1 merged-to-Phase-0 + built (PR #83, draft) + two-device dogfooding.** Merged PR #82 (Phase 0). Built the Phase 1 hydration engine (`hydrateFromCloud`, push-before-pull, FR-9 wipe, FR-10), pure reconcile in `lib/hydration.ts`. Two `adversarial-reviewer` passes broke it twice (FR-6 meals-not-immutable → `refresh-if-synced`; 1,000-row truncation → pagination), both fixed, re-review PASSED; `code-reviewer` found 2 bugs (edit-event empty-uri, useSync race) → fixed. Then real-device dogfooding with PM's wife drove three follow-ups: FAB pushes on-log, **pull-to-refresh on History** (shared `syncNow()`), and a **cross-device delete/edit bug** (SQLite space-format `updated_at` parsed as local time → LWW corruption; fixed in `parseTs` + FAB ISO writes). Applied the missing `vet_visit_attachments` table to live DB (B-044, surfaced as a hydrate warning). PM on-device QA passed AC-1/AC-2/AC-4 + intake edit; **AC-6 logout-wipe outstanding = merge gate.** 69 tests green.
- **2026-06-05 — B-054 Phase 0: jest runner wired (closes B-026).** Picked up the multi-device-sync backlog item; got up to speed on `docs/multi-device-sync-requirements.md` (4-phase plan). Shipped Phase 0 (PR #82, draft): installed `jest-expo`@~54 + `jest`@29 + testing-library + `babel-preset-expo`, added `babel.config.js` / `jest.config.js` (ignores the `supabase/functions/**` Deno tests), `test` script, pre-push runs `npm test`. 45/45 RN tests green (verified on PM's machine too). Caught + fixed a latent state-leak in `store/toastStore.test.ts` the never-run tests had hidden. Phases 1–3 not started; sequencing + §6 cold-start UX ruling open.
- **2026-06-04 — Sign-in "Invalid API key" debug + DX guard (no build progress).** Diagnosed Expo Go sign-in failure: env files were correct (`.env` had the valid anon key; verified `HTTP 200` against `/auth/v1/settings` from the Codespace) — root cause was a **stale Metro bundle**, fixed by `rm -rf .expo node_modules/.cache && npx expo start --tunnel -c` + cold-reopen. PM confirmed back in. Shipped a small hardening fix (PR #79, draft): fail-fast guard in `lib/supabase.ts` for missing/placeholder env + corrected stale CLAUDE.md note (env is `process.env.EXPO_PUBLIC_*`, not `app.config.ts`).
- **2026-05-31 — Workflow tooling (no product code).** Added `/wrap` + `/kickoff` commands (`.claude/commands/`) and `docs/dev-handoff-runbook.md`; trimmed the verbose Runtime A/B scripts out of CLAUDE.md (v1.21). Raced PR #76 (the v1.20 persona/STATUS.md split) — re-cut onto it keeping only the additive command/runbook work. Did not advance the build.
- **2026-05-31 — B-045 Steps 1–3 shipped.** Detection engine (PR #72, incl. B-050 case-crossover rewrite), migration 015 (PR #73), `generate-signal` Edge Function (PR #74), `SignalZone` wiring (PR #75). Dogfooding on cat Nyx surfaced B-051/B-052/B-053.
- **2026-05-30 — AI Signal design + spec.** `docs/nyx-ai-signal-requirements.md` finalized (rev 6); Principle 3 revised + approved; speed-vs-rigor "value ladder" (§7.1); B-050 case-crossover redesign caught by PM; DoD strengthened with the adversarial-review rule.
- **2026-05-24 — B-027 (per-incident vomit AI) shipped end-to-end** (#54/#55/#56). Established the `event_ai_analysis` table + the parameterized analyze-function/detail-component pattern; surfaced the migration-003 gap and the sync-upsert/photo-pipeline bug classes (now in the `supabase-sync` skill).
