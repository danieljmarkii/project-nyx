# Nyx — Scaling Readiness Plan

**Status:** DRAFT — Tier 2 document, awaiting PM ratification (Documentation Update Protocol). Nothing in here is a decision; it is an audit + proposed plan.
**Date:** 2026-06-12 | **Session:** scaling-readiness audit (audit + plan only — no refactors)
**Method:** Five parallel codebase sweeps (client performance, sync/offline, Edge Functions cost/abuse, database/RLS, App Store/operational readiness), with the load-bearing findings re-verified by hand against source (`lib/sync.ts`, `hooks/useSignal.ts`, `supabase/functions/extract-food-from-photo/index.ts`, `app.json`, `eas.json`). Claude pricing from the current model catalog (Haiku 4.5 $1/$5 per MTok, Sonnet 4.6 $3/$15 per MTok).

**Constraints honored throughout:** clinical invariants (never-reassure, intake-is-not-preference), soft deletes, UTC storage, last-write-wins, server-side correlation/PDF, and the seven design principles are fixed points — no item below touches them. No rewrites are proposed; every item is the smallest change that removes a specific ceiling. Anything that would contradict decided architecture is routed to **PM decisions needed** (§6), not recommended. Nothing here preempts Step 9 (vet report) or Step 10 (AI Signal) — see sequencing in §3.

---

## 1. What breaks first — the ceiling order, 1 → 100 → 10k users

### Ceiling 0 — before any scale: we cannot submit at all

Five Apple hard blockers, all confirmed absent in the repo:

1. **No in-app account deletion** (Guideline 5.1.1(v); backlog B-039, already `Now`). `app/(tabs)/profile.tsx:237–242` has only Sign out. Blocked on the GDPR-cascade Open Question.
2. **No privacy policy or terms URLs** — nothing in `app.json`, no hosted policy, no in-app link.
3. **No camera / photo-library usage strings** — `app.json:16–22` carries only `ITSAppUsesNonExemptEncryption`. The app captures health photos; the generated Info.plist must carry health-photo-specific `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` wording (build 22 passed upload validation, so library defaults may be filling in generic strings — verify the built plist, then set our own).
4. **App Privacy / privacy manifest disclosures** — no `ios.privacyManifests` config; the App Store Connect data-collection questionnaire (health data, photos, identifiers) has no prepared answers in the repo.
5. **Apple Sign-In** — `technical-spec.md` §Stack says "Email + Apple Sign-In required for App Store submission," but only email auth exists (no `expo-apple-authentication` anywhere). Note: Apple's actual rule mandates Sign in with Apple only when *other third-party* logins are offered; email-only apps are exempt. Spec vs. Apple-rule discrepancy → PM decision (§6.4).

Operational near-blockers in the same bucket: **no password reset flow** (a locked-out user has no recovery path and no support channel to ask for one), **no crash/error reporting** (B-016 — confirmed: no Sentry/Bugsnag/error boundary/global handler anywhere; errors land in `console.error` (6 call sites in `lib/`) or `Alert.alert`), **no in-app support/feedback link**.

### Ceiling 1 — first 100 users: abuse surface, blind operation, and one shared-table trap

These bite at the *first* stranger, not the ten-thousandth:

- **Unmetered, under-scoped AI endpoints.** `extract-food-from-photo` checks only that an `Authorization` header is *present* (`index.ts:219–222`; the gateway's `verify_jwt` validates the token) and then uses the **service role** (`index.ts:247–250`) to download any caller-supplied `photo_paths` from `nyx-food-photos` and write extraction output onto any caller-supplied `food_item_id` (`index.ts:345–348` — no `created_by_user_id` check, no idempotency: re-invoking a `completed` food fires a fresh Sonnet vision call). Any authed user can burn Sonnet calls in a loop and overwrite any global-catalog row's extraction fields. `analyze-vomit` and `generate-signal` scope reads through the caller's JWT/RLS (good), but none of the three has any per-user rate limit or cost cap.
- **Regen retry storm.** `hooks/useSignal.ts:116–127`: every Home focus, if the signal cache is stale, fires `regenerateSignal` with no cooldown, no in-flight guard across focuses, and no backoff. If the Edge Function fails persistently (Anthropic outage, bad deploy), the cache stays stale and **every Home open of every user retries** — an invocation storm exactly when the backend is least healthy. The 5s debounce in `lib/signal.ts:266` covers only the after-log path.
- **Operating blind.** With zero crash/error reporting and zero analytics, the first support email arrives with no stack trace, no breadcrumbs, and no way to know whether 1 user or 40 are affected. This converts every other item on this list from "detected and fixed" to "discovered via 1-star review."
- **Poison-row sync stall.** `lib/sync.ts:162–192`: meals (and events, `:224–251`; vet visits; feeding arrangements) flush as one batch upsert; the statement is atomic, so a single bad row (e.g. FK violation) fails the whole batch, nothing is marked synced, and the *same* batch is retried wholesale on every foreground/reconnect — forever. One corrupt row strands a user's entire queue, invisibly (see "operating blind").
- **The global `food_items` table is the one table that grows with the user base, not the user.** `refreshFoodCache` (`lib/sync.ts:370–392`) pulls the **entire** table (no watermark, no pagination) and rewrites it into SQLite **one row at a time, per sync cycle, on every device**. 100 users contributing foods → thousands of rows → every user's every sync cycle pays the full-catalog rewrite. This is the earliest pure-scaling ceiling in the codebase.

### Ceiling 2 — 100 → 10k users: database and sync amplification

- **Watermark pulls have no matching index.** Incremental hydration filters `events`/`meals` on `updated_at >= watermark` (`lib/sync.ts:539–544`, `605–609`), but every index on those tables is built on `occurred_at` (`001_schema.sql:191–201`; migration 016 adds the `meals.updated_at` column but no index). Today every pull is a scan of the user's rows; fine at n=1, a per-sync-cycle tax across the whole fleet at 10k.
- **RLS policy shape.** Every pet-scoped table uses `pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())` (`001_schema.sql:211–219`, `003_attachments.sql:22–25/43–46`, `005_ai_signals.sql:26–33`, `013_event_ai_analysis.sql:222–225`, `018_feeding_arrangements.sql:117–120`). This is correct, but it's the form the Supabase performance advisor flags: `auth.uid()` not wrapped as an initplan (`(select auth.uid())`), evaluated per row on the hottest reads (events/meals). Same semantics are available in a cheaper shape.
- **`reconcileDeletedMeals` is O(all meals) per sync cycle per device.** `lib/sync.ts:793–833` pulls *every* server meal ID every cycle (paginated at 1,000/page) to absence-reconcile hard-deleted meals. Correct and well-guarded (count-verified, never deletes `synced=0`), but a 2-year account pays ~10+ requests *per foreground* even when nothing changed, multiplied across devices.
- **Per-row SQLite writes during hydration.** `hydrateEvents`/`hydrateMeals`/`refreshFoodCache` run one `runAsync` per row with no transaction (`lib/sync.ts:554–578`, `615–638`, `380–391`). Cold-starting a 20k-event account = tens of thousands of individual statements behind the "Catching up…" overlay.
- **Meals LWW trusts the client clock on first insert.** Migration 016's trigger rewrites `updated_at` to server-now only on the conflict-UPDATE branch; a brand-new INSERT lands with the client's clock (`lib/sync.ts:172–176`). A device with a skewed clock can permanently win conflicts it should lose. Events already get server time; meals are the gap.
- **Storage grows with no lifecycle.** Hard-deleted `event_attachments` rows leave their Storage objects orphaned; replaced food photos are never cleaned (no UPDATE/DELETE policies on `nyx-food-photos`, `008_food_photos_rls.sql:43–48`; B-031 documents the event-attachment variant). At 10k users with health photos, this is real storage spend and a real GDPR-deletion liability.
- **Cost-to-serve** is *not* a near-term ceiling at honest usage (§4: roughly $0.45–0.75/user/month, Haiku-dominated) — the ceiling is the *unboundedness* (Ceiling 1), not the baseline.

### Ceiling 3 — the individual power user (2 years of logs, any fleet size)

- `getLocalSignalContext` runs a **synchronous** COUNT/MIN aggregate over all of the pet's events on every Home focus (`hooks/useSignal.ts:46–52`, `getAllSync` on the JS thread). `useTrend` similarly `getAllSync`s the 14-day window and multi-pass-filters it in JS (`hooks/useTrend.ts:52–81`).
- History pagination is correct (50/page, `app/(tabs)/history.tsx:119–146`) but the FlatList has no `windowSize`/`removeClippedSubviews` tuning and the event+marker merge re-sorts on every change (`history.tsx:316–335`).
- Cold-start hydration of a 20k-event account: ~20 network pages + ~20k single-row writes behind a blocking overlay with no progress indication and no timeout.
- The food picker reads the entire deduped food cache with no LIMIT on every open (`lib/db.ts:578–586`) — composes badly with the global-catalog growth above.

None of ceiling 3 violates an acceptance criterion today; it is the "2 years of logs instead of 2 months" debt the audit was asked to find.

---

## 2. The plan — prioritized items

Effort: S (≤half session) / M (1 session) / L (multi-session). Risk = risk to existing behavior.

### Track G — launch gates (App Store / operational)

| # | Item | Impact | Effort | Risk | Evidence |
|---|---|---|---|---|---|
| G1 | **In-app account deletion** (B-039): Edge Function (service role) cascading per the GDPR decision + "Delete account" UI in profile | Apple hard blocker | M | Low (new surface) — T&S ship gate | `app/(tabs)/profile.tsx:237–242` (absent); B-039 |
| G2 | **Privacy policy + ToS**: host both, link in-app, prepare App Privacy questionnaire answers (health data, photos) | Apple hard blocker | S code + PM/legal | None | `app.json` (no URLs); repo-wide absence |
| G3 | **iOS permission strings + privacy manifest**: verify built Info.plist; set health-photo-specific `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription` (+ photo-add), review `ios.privacyManifests` | Apple hard blocker (or weak generic strings) | S | None (config; needs new binary) | `app.json:16–22` |
| G4 | **Apple Sign-In** — PM decision (§6.4): implement (`expo-apple-authentication`, M) or descope the spec line (email-only is Apple-compliant) | Spec/compliance clarity | M or 0 | Low | spec §Stack; no implementation found |
| G5 | **Password reset** (`supabase.auth.resetPasswordForEmail` + deep-link screen); decide email-confirmation posture at the same time | Locked-out users have no path; support load | S/M | Low | `app/(auth)/login.tsx` (no flow) |
| G6 | **Crash/error reporting** (B-016): vendor per PM (§6.2; recommend Sentry — `sentry-expo` works in managed workflow), wrap root in an error boundary, route the existing 6 `lib/` `console.error` sites through it. T&S precondition: PII-redaction config (no health-photo payloads, no event content in breadcrumbs) | Everything else becomes observable; converts review-discovered bugs into tickets | M | Low | repo-wide absence; `lib/sync.ts:183,246,278,460`, `lib/meals.ts:88`, `lib/feedingArrangements.ts:229` |

### Track A — abuse & cost hardening (server-side; first true scaling ceiling)

| # | Item | Impact | Effort | Risk | Evidence |
|---|---|---|---|---|---|
| A1 | **`extract-food-from-photo` scoping + idempotency**: resolve the caller from the JWT; require `food_items.created_by_user_id = caller` (or `IS NULL`-claim) before download/extract/write; skip when `ai_extraction_status='completed'` unless an explicit re-extract flag; validate `photo_paths` belong to the food's own `photo_paths[]` | Closes unmetered-Sonnet loop + global-catalog overwrite | S | Low — legit client always passes its own fresh food | `index.ts:219–250` (header-presence only, service role), `:345–348` (unscoped write) |
| A2 | **Client regen cooldown**: per-pet in-flight + failure-cooldown (e.g. ≥10 min after a failed regen) around the stale-cache regen path; one regen attempt per focus burst | Kills the retry storm; protects the function during outages | S | Low — stale cache copy already designed for this state | `hooks/useSignal.ts:116–127`, `lib/signal.ts:261–279` |
| A3 | **Per-user daily AI budget** (schema → own PR): tiny `ai_call_ledger` (user_id, day, function, count) checked at entry of all three functions; generous caps (proposed: 30 signal regens, 20 vision calls/user/day — PM ratifies §6.5); over-cap returns the templated/cached path, never an error that breaks the UI. Never-reassure unaffected — caps gate *invocation*, not content | Bounds worst-case spend at any fleet size | M | Low — caps sized far above honest usage | cost model §4; no limiter exists in any function |
| A4 | **`analyze-vomit` photo guard**: check object size via Storage metadata before download (5MB base64 limit is currently enforced only *after* download, `analyze-vomit/index.ts:539–547`); mirror the client-side compression used for food photos on the vomit-photo path | Cuts wasted egress + the easiest cost-amplifier | S | Low — degrade path (photo-unreadable → contextual flags) already exists and is the clinically-reviewed behavior | `analyze-vomit/index.ts:537–547`; `lib/storage.ts` compression exists for food path |

### Track D — database (additive, high leverage)

| # | Item | Impact | Effort | Risk | Evidence |
|---|---|---|---|---|---|
| D1 | **Migration: watermark indexes + cache uniqueness** — partial indexes `events(pet_id, updated_at)` and `meals(pet_id, updated_at)`; `UNIQUE (pet_id)` on `ai_signals` | Watermark pulls become index scans fleet-wide; enables D2 | S | None (additive; `ai_signals` is already 1-row-per-pet by app logic) | `lib/sync.ts:539–544,605–609` vs `001_schema.sql:191–201`; `generate-signal/index.ts:370–377` |
| D2 | **`generate-signal` cache upsert**: replace delete-then-insert with `upsert(..., { onConflict: 'pet_id' })` | Removes the crash-mid-cycle no-cache window + daily dead-row churn | S | Low — same row shape; depends on D1's constraint | `generate-signal/index.ts:370–377`, `005_ai_signals.sql` |
| D3 | **RLS initplan rewrite** (own migration PR): re-create the pet-scoped policies in the advisor-recommended shape (initplan'd `auth.uid()`; lookup against `pets` pkey) — *identical semantics*, cheaper plan | Cuts per-row RLS cost on the hottest reads (events/meals) at fleet scale | M | Medium-low — semantics identical but touches every table's policy; verify with `get_advisors` + a cross-account read test before/after | `001_schema.sql:211–219`, `003_attachments.sql`, `005/013/018` migrations |
| D4 | **Storage lifecycle**: delete Storage objects when their owning row is hard-deleted (attachment cascade), clean replaced food photos; retention policy for photos of soft-deleted events = PM decision (§6.3) | Stops unbounded orphan growth; prerequisite for honest GDPR deletion (composes with G1/B-039, B-031) | M | Medium — deletion code near health photos; gate behind the retention decision | `008_food_photos_rls.sql:43–48`; B-031; no cleanup code in `lib/storage.ts`/`lib/sync.ts` |

### Track S — sync engine

| # | Item | Impact | Effort | Risk | Evidence |
|---|---|---|---|---|---|
| S1 | **Poison-row isolation**: when a batch upsert errors, retry that batch per-row once; mark the good rows synced, leave only the bad row(s) `synced=0` and surface them (G6) | One corrupt row no longer strands the queue forever | S/M | Low — same LWW semantics; per-row path is the existing attachment pattern (`sync.ts:317–334`) | `lib/sync.ts:162–192, 224–251, 449–461` |
| S2 | **Reconnect backoff**: consecutive-failure counter in `syncStore` + exponential backoff with jitter gating *automatic* (foreground/reconnect) `runSync`; manual pull-to-refresh `syncNow()` bypasses | Flaky connections stop multiplying full sync cycles | S | Low — additive guard around existing triggers | `hooks/useSync.ts:68–86`, `lib/sync.ts:886–903` (in-flight guard only) |
| S3 | **Transaction-wrap local write loops**: wrap hydrate + food-cache per-row writes in a single SQLite transaction per table batch | Order-of-magnitude cold-start/hydration write speedup; no behavior change | S | Low — same statements, one transaction | `lib/sync.ts:554–578, 615–638, 380–391` |
| S4 | **Incremental food cache** (schema first: additive `food_items.updated_at` + touch trigger; then client watermark pull) | Removes the only ceiling that scales with the user base (global catalog) | M (2 PRs: schema, client) | Low — additive column; pull falls back to full refresh when watermark absent | `lib/sync.ts:370–392`; `food_items` has no `updated_at` (001_schema.sql) |
| S5 | **`reconcileDeletedMeals` cadence**: run on cold start + at most every 24h (or after a food-delete locally), not every cycle | Cuts O(all meals) pull per foreground to ~1/day | S | Behavior nuance: a cross-device food-delete's meal-ghosts can persist up to 24h on another device — PM accepts (§6.6) | `lib/sync.ts:793–833, 868` |
| S6 | **Meals server-time LWW on INSERT**: extend migration-016 trigger to BEFORE INSERT (server stamps first push, matching events) | Closes the client-clock-skew LWW hole on meals | S (own schema PR) | Low — first-push `updated_at` becomes sync-time not log-time; LWW comparisons only; flag to PM (§6.7) | `lib/sync.ts:172–176`; `016_meals_updated_at.sql` |

### Track C — client performance (power-user debt)

| # | Item | Impact | Effort | Risk | Evidence |
|---|---|---|---|---|---|
| C1 | **Async-ify Home hot-path reads**: `getAllSync` → `getAllAsync` in `getLocalSignalContext` and `useTrend` (state-set on completion; render path unchanged) | Unblocks the JS thread on every Home focus for large accounts | S | Low — both already feed `useState` | `hooks/useSignal.ts:46–52`, `hooks/useTrend.ts:52–81` |
| C2 | **History FlatList tuning**: `windowSize`, `removeClippedSubviews`, memoized `renderItem`/`keyExtractor`; memoize the event+marker merge | Smooth scroll at 10k+ rows; no UX change | S | Low | `app/(tabs)/history.tsx:316–335, 387–404` |
| C3 | **Food picker bound** (deferred to backlog): LIMIT + search once the catalog is non-trivial; composes with S4 | Picker stays fast as the global catalog grows | S | Low | `lib/db.ts:578–586`, `components/log/FoodPicker.tsx:68` |
| C4 | **Cold-start UX hardening** (deferred): progress text per table + a defensive max-duration on the blocking overlay (already an open note from #85) | A 2-year account's first login doesn't look hung | S | Low | `lib/sync.ts:69–96`; STATUS §6 cold-start notes |

---

## 3. Sequencing — PR-sized chunks that respect the house rules

Rules respected: one PR per session; schema migrations always alone in their PR with the Migration Safety Pre-flight; nothing blocks Step 9 (vet report) / Step 10 (AI Signal) — these slot *around* the build sequence. Track A/G server- and config-side items don't touch the build-phase surfaces at all. Items needing a PM decision are gated on it, not queued ahead of it.

**Phase 1 — before App Store submission (interleaved with Step 9/10 sessions):**

| PR | Contents | Schema? | Pre-flight |
|---|---|---|---|
| 1 | **A1 + A2 + A4** — Edge hardening (ownership/idempotency, regen cooldown, photo guard) | No | — |
| 2 | **D1** — migration `019_scaling_indexes.sql` (2 partial indexes + `ai_signals` UNIQUE) | **Yes — alone** | Rollback: `DROP INDEX …; ALTER TABLE ai_signals DROP CONSTRAINT …`. Destructive: **n** (purely additive; UNIQUE is satisfied today — verify with `SELECT pet_id, count(*) FROM ai_signals GROUP BY 1 HAVING count(*)>1` before applying). Backfill: N/A |
| 3 | **D2** — `generate-signal` upsert + redeploy (B-082 esbuild runbook) | No | — |
| 4 | **G3 + G5** — app.json permission strings/manifest + password reset (binary-affecting config + small auth screen) | No | — |
| 5 | **G6** — error reporting (after vendor decision §6.2; includes PII-redaction config) | No | — |
| 6 | **G1** — account deletion (after GDPR decision §6.1): Edge Function PR, then UI; composes with D4's storage deletion | No (uses service role) | — |
| — | **G2** — PM/legal: host policy + ToS, App Privacy questionnaire (code side rides PR 4) | — | — |

**Phase 2 — before/at public growth (post-submission):**

| PR | Contents | Schema? | Pre-flight |
|---|---|---|---|
| 7 | **S1 + S2 + S3** — sync poison-row isolation, backoff, transaction-wrapped writes | No | — |
| 8 | **A3a** — migration `020_ai_call_ledger.sql` (after cap values §6.5) | **Yes — alone** | Rollback: `DROP TABLE ai_call_ledger`. Destructive: n. Backfill: N/A |
| 9 | **A3b** — ledger checks in the three functions + redeploy | No | — |
| 10 | **D3** — migration `021_rls_initplan.sql` (policy re-create, semantics-identical) | **Yes — alone** | Rollback: re-run the original policy DDL (kept in the migration header). Destructive: n (DROP POLICY/CREATE POLICY pairs; no data touched). Verify: `get_advisors` clean + cross-account read denied before merge sign-off |
| 11 | **S4a** — migration `022_food_items_updated_at.sql` (additive column + trigger) | **Yes — alone** | Rollback: `DROP TRIGGER …; ALTER TABLE food_items DROP COLUMN updated_at`. Destructive: n. Backfill: `UPDATE food_items SET updated_at = created_at WHERE updated_at IS NULL` |
| 12 | **S4b + S5 + C3** — incremental food cache + reconcile cadence + picker bound | No | — |

**Phase 3 — power-user / cost hygiene (opportunistic):**

| PR | Contents | Schema? |
|---|---|---|
| 13 | **C1 + C2 + C4** — client perf pass | No |
| 14 | **S6** — migration `023_meals_insert_trigger.sql` (after §6.7) | **Yes — alone** (rollback: restore UPDATE-only trigger; destructive n) |
| 15 | **D4** — storage lifecycle/orphan cleanup (after retention decision §6.3; composes with G1, B-031) | Policy SQL via dashboard + code |

Adversarial-review note for execution: PR 3 (cache write path), PR 9 (gates on AI surfaces), PR 10 (RLS), and PR 7's S1 (sync correctness) get the `adversarial-reviewer` pass when built — PR 10 because RLS *is* the multi-tenant safety boundary, PR 9 because a wrong gate could silence a safety-lane regen (the over-cap path must serve the cached/stale state honestly, never an "all clear").

---

## 4. Cost-to-serve model (Claude API)

Per-call economics from the code (verified prompt construction; pricing: Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15 per MTok):

| Function | Model | Per-invocation | Tokens (in/out) | ≈Cost/call |
|---|---|---|---|---|
| `generate-signal` | Haiku 4.5 (`index.ts:70`, max_tokens 200) | 1–4 parallel phrasing calls (≤ VISIBLE_CARD_CAP; structured payload only — never a raw event log) | ~2,000 / ~100 each | ~$0.0025 |
| `extract-food-from-photo` | Sonnet 4.6 (`index.ts:287`, max_tokens 2048) | 1 vision call, ≤3 images | ~3,000 / ~400 | ~$0.015 |
| `analyze-vomit` | Sonnet 4.6 (`index.ts:440`, max_tokens 1024) | 1 vision call if photo; contextual flags are deterministic | ~2,500 / ~500 | ~$0.015 |

Honest-usage envelope (2 pets, daily signal regen + after-log regens ≈ 90 invocations/mo × ~2 phrasings; ~5 new foods/mo; ~3 vomit analyses/mo):

- **≈ $0.45–0.75 / user / month**, Haiku-phrasing-dominated.
- **1k users ≈ $450–750/mo; 10k users ≈ $4.5k–7.5k/mo.** Manageable — *if bounded*.
- Unbounded worst cases (why Track A exists): a scripted client looping `extract-food` pays ~$15 per 1,000 calls of *our* money with no cap and no ownership check; an Anthropic outage turns every Home focus fleet-wide into Edge invocations (A2). The architecture is already cost-sane (deterministic detection, cached signal, templated fallback, no raw-log prompts); the gap is purely the absence of gates.

---

## 5. Proposed backlog rows (B-086+; PO to enter on ratification)

Existing rows referenced, not duplicated: **B-039** (account deletion = G1), **B-041** (data export — unchanged), **B-016** (error observability = G6 — propose elevating `Later`→`Now`), **B-047** (signal instrumentation — composes with G6), **B-031** (attachment re-upload/UPDATE policy — composes with D4), **B-002** (pre-prod checklist — this plan supersedes most of its content; close into it), **B-044** (migration-drift audit — do before applying migration 019 so we index a reconciled DB), **B-085** (timezone write — unrelated, already `Now`).

| ID | Title | Why | Priority | Blocks | Plan ref |
|---|---|---|---|---|---|
| B-086 | Edge Function abuse hardening (extract-food ownership+idempotency, regen cooldown, vomit photo guard) | Any authed client can burn unmetered Sonnet calls / overwrite catalog rows; regen retries storm on outage | Now | App Store submission | A1, A2, A4 |
| B-087 | Watermark indexes + `ai_signals` UNIQUE (migration 019) | Hydration pulls scan instead of index-seek fleet-wide; unblocks cache upsert | Now | First 100 users | D1 |
| B-088 | `generate-signal` cache upsert (delete-then-insert → upsert) | Crash-window with no cache + daily dead-row churn | Next | — (after B-087) | D2 |
| B-089 | Sync resilience: poison-row isolation, reconnect backoff, transaction-wrapped local writes | One bad row strands the queue forever; flaky networks multiply full cycles; cold start 10× slower than needed | Next | First real users with big queues | S1–S3 |
| B-090 | RLS initplan policy rewrite (semantics-identical) | Per-row subquery shape on the hottest tables; advisor-flagged form | Next | ~100+ active users | D3 |
| B-091 | Incremental food-items cache (additive `updated_at` + watermark pull) | Only table that grows with the user base; full rewrite per device per cycle today | Next | Catalog growth (~100 users) | S4 |
| B-092 | `reconcileDeletedMeals` cadence (cold start + daily) | O(all meals) server pull every cycle per device | Later | Large accounts | S5 |
| B-093 | Meals server-time LWW on INSERT path | Client clock skew can permanently win conflicts; events already server-stamped | Later | Multi-device growth | S6 |
| B-094 | Per-user daily AI budget ledger | Bounds worst-case Claude spend at any fleet size | Next | Public beta; needs §6.5 cap values | A3 |
| B-095 | Storage lifecycle: orphan cleanup + photo retention policy | Orphaned health photos = cost + GDPR-deletion liability | Later | §6.3 decision; composes with B-039/B-031 | D4 |
| B-096 | Client perf pass for 2-year accounts (async Home reads, FlatList tuning, cold-start UX) | JS-thread sync reads + untuned list degrade with years of logs | Later | — | C1, C2, C4 |
| B-097 | Password reset flow (+ email-confirmation posture) | Locked-out users have no recovery path | Now | App Store submission | G5 |
| B-098 | Apple Sign-In: implement or descope spec line | Spec says required; Apple requires it only alongside other third-party logins | Now (decision) | App Store submission | G4 |
| B-099 | App Store config: permission strings, privacy manifest, policy/ToS links in-app | Apple hard blockers; health-photo wording matters for review | Now | App Store submission | G2, G3 |
| B-100 | In-app support/feedback link | No channel for the first stranger to report the first bug | Later | First public release | §1 ceiling 1 |
| B-101 | Food picker LIMIT + search | Unbounded read of the global catalog on every picker open | Later | Catalog growth; composes with B-091 | C3 |

---

## 6. PM decisions needed

1. **GDPR deletion cascade** (existing Open Question, Step 1) — anonymize vs hard delete. Now *actually* blocking: B-039/G1 → App Store submission. The earliest hard decision in this plan.
2. **Error-reporting vendor** (G6/B-016). Recommendation: Sentry via `sentry-expo` (managed-workflow compatible, free tier sufficient at launch). T&S precondition: PII-redaction config ships in the same PR.
3. **Photo retention policy** (D4/B-095): when an event is soft-deleted, do its photos persist (correlation integrity says the *event row* must; nothing requires the photo bytes), and for how long? When a food photo is replaced, delete the old object? Trust & Safety + Dr. Chen lenses.
4. **Apple Sign-In** (G4/B-098): implement now (~1 session) or amend the spec line — email-only is Apple-compliant as long as no other third-party login is offered.
5. **AI budget cap values** (A3/B-094): proposed 30 signal regens + 20 vision calls per user per day (≈10× honest usage). Over-cap behavior: serve cached/templated state — never an error, never an "all clear."
6. **Reconcile cadence trade-off** (S5/B-092): accept that a food deleted on device A can leave ghost meals on device B for up to 24h (vs. every-cycle reconciliation today)?
7. **Meals INSERT trigger semantics** (S6/B-093): first-push `updated_at` becomes server sync-time rather than client log-time (LWW comparisons only — `occurred_at` untouched). Matches existing events behavior.
8. **Analytics posture pre-launch**: beyond crash reporting, do we ship any product analytics at v1 (B-047's signal instrumentation is the candidate)? Privacy lens requires PII-redaction rules first; "none at launch, Sentry only" is a defensible default.

---

## 7. Explicitly not proposed

- No WatermelonDB / sync-engine rewrite — the queue + watermark architecture is sound; every fix above is a guard, an index, or a cadence change.
- No client-side correlation/PDF, no merge-conflict logic, no hard deletes, no local-timezone storage — all decided architecture.
- No change to detection/curation/phrasing logic or any clinical threshold — the AI Signal engine is out of scope for this plan except its *cache write* (D2) and *invocation gating* (A2/A3), both of which preserve content and the never-reassure asymmetry.
- No `hydrationTick` redesign — broad invalidation is correct today; per-table ticks only if profiling ever shows it (kept out of the backlog deliberately to avoid speculative work).
