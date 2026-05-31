# Project Nyx — Status

_Canonical answer to "where are we?". High-churn: update inline at session end and any time these change mid-session. CLAUDE.md is the stable operating manual; this file is the volatile state. Keep this scannable — prose paragraphs belong in session summaries and the backlog, not here._

**Last updated:** 2026-05-31

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
- **B-052** — ✅ code complete, **PR #78 (draft)**. `primary_protein` now canonicalized via shared `supabase/functions/_shared/protein.ts` at both write (`extract-food-from-photo`) and read (`detection.ts`) time. Adversarial-review gate passed on the fix (first cut failed on a hydrolyzed-elimination merge + `sweet potato`→`potato` + blend fragmentation — all fixed + regression-tested). Optional historical backfill deferred as a non-blocking PM data action.
- **B-053** (Next) — explain *why* there's no signal (coverage / near-miss diagnostics on `no_pattern`: staple-washout, below-floor, unrated meals) to drive retention + corrective logging.

**After Step 10:** Step 9 (vet report PDF) resumes — formally interrupted by the PM for B-045 dogfooding value.

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

- [x] **Deploy `extract-food-from-photo` + `generate-signal` for B-052 (PR #78).** ✅ Done 2026-05-31 via `npx supabase functions deploy` — CLI bundled the `_shared/protein.ts` import for both (script sizes 63.86kB / 83.42kB, no import errors). Supabase CLI now installed as a repo dev-dependency, so `npx supabase …` works going forward.
- [ ] _(Optional, non-blocking)_ **B-052 historical backfill** of existing `food_items.primary_protein` to canonical values. The defensive read-time normalization already covers dirty/legacy rows, so this is data hygiene only — do it if/when you want stored values clean (no SQL shipped, to avoid drift from the TS normalizer).
- [ ] One-time EAS setup in Codespace: `npm install -g eas-cli && eas login && eas init && eas update:configure`, then commit + push the `app.json` changes (`extra.eas.projectId`, `updates.url`, `runtimeVersion`).
- [ ] After first `eas update --branch preview`, open Expo Go → confirm app loads end-to-end (log a meal, snap a food photo, confirm Claude extraction returns).
- [ ] Start Apple Developer enrollment ($99/yr, 1–3 day approval) to graduate from Runtime A (Expo Go + `eas update`) to a real TestFlight build.
- [ ] **Apply the rest of migration `003_attachments.sql`** (B-044) — only the `event_attachments` block was applied to the live DB; `vet_visit_attachments` + `food_items.photo_path` likely still missing server-side. Then **audit which migrations are actually applied**.
- [ ] **Delete the leftover `tmp-img-export` Edge Function** (B-043) from the Supabase dashboard — neutralized to a `410` stub but should be removed entirely (no MCP delete tool exists).

---

## Runtime in Use

QA on-device via **Runtime B** — Metro dev server (`npx expo start --tunnel`, scan QR in Expo Go). ⚠️ `eas update` does NOT reach Expo Go (EAS Update targets a *build* with a matching channel + `runtimeVersion`, not the generic Expo Go app). Runtime A is blocked until a real dev/preview build exists (blocked on Apple Developer enrollment). Treat Runtime B as the daily driver for now.

---

## Recent Sessions

- **2026-05-31 — B-052 protein normalization + backlog groom (PR #78, draft).** Shared `_shared/protein.ts` `normalizeProtein` (repo's first cross-function module), wired at write (`extract-food-from-photo`) + defensive read (`detection.ts`) time; 53 Deno tests (run via a Node transpile harness — Deno uninstallable in the sandbox). Adversarial-review gate failed the first cut (hydrolyzed-elimination merge, `sweet potato`→`potato`, blend fragmentation) and passed the fix. Groom pass: re-prioritized stale-`Now` B-010 + B-013 → `Next` (gated on paused/unscheduled work); no shipped-but-Open drift found.
- **2026-05-31 — Workflow tooling (no product code).** Added `/wrap` + `/kickoff` commands (`.claude/commands/`) and `docs/dev-handoff-runbook.md`; trimmed the verbose Runtime A/B scripts out of CLAUDE.md (v1.21). Raced PR #76 (the v1.20 persona/STATUS.md split) — re-cut onto it keeping only the additive command/runbook work. Did not advance the build.
- **2026-05-31 — B-045 Steps 1–3 shipped.** Detection engine (PR #72, incl. B-050 case-crossover rewrite), migration 015 (PR #73), `generate-signal` Edge Function (PR #74), `SignalZone` wiring (PR #75). Dogfooding on cat Nyx surfaced B-051/B-052/B-053.
- **2026-05-30 — AI Signal design + spec.** `docs/nyx-ai-signal-requirements.md` finalized (rev 6); Principle 3 revised + approved; speed-vs-rigor "value ladder" (§7.1); B-050 case-crossover redesign caught by PM; DoD strengthened with the adversarial-review rule.
- **2026-05-24 — B-027 (per-incident vomit AI) shipped end-to-end** (#54/#55/#56). Established the `event_ai_analysis` table + the parameterized analyze-function/detail-component pattern; surfaced the migration-003 gap and the sync-upsert/photo-pipeline bug classes (now in the `supabase-sync` skill).
