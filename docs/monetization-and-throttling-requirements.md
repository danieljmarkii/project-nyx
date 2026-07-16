# Culprit — Monetization & AI Throttling Requirements
**Version:** 1.0 | **Date:** 2026-07-12 | **Status:** Build-ready — every governing decision is ratified (D-M1–D-M8; strategy doc §13/§18)

> **Review amendments — 2026-07-13** (PM review pass, no ratified ruling changed): §4.4 records the clinical ratification of the `analyze-vomit` daily cap value + adds the per-pet-enforcement-vs-per-user-cost note; §9 T3-E + §16 flag B-047/B-016 as an **unowned dependency** (PM action item); §4.2 adds the server-side config-read failure fallback (Dir. of Eng sign-off, T2-3); §4.7 flags the entitlement **grace-window duration** as an open product decision for T3-C. Still open from the review, not yet actioned: the mandated shared client-side response decoder for the §4.5 typed contract (parked pending PM call).

---

## 1. What this is

The build-ready execution spec for the monetization and AI-gating strategy ratified 2026-07-12. It turns `docs/monetization-and-ai-gating-strategy.md` (the strategy/decision record — read it for the *why*) into three things:

1. **Track 2 — AI infrastructure** (pre-submission, small): the `app_config` flag mechanism (B-329), the `ai_usage` throttles (B-001, executing D-M7), flag-aware client states, and flagging the paywall mock out of the submission build (B-330). Five PRs, §8.
2. **Track 3 — Culprit Premium** (post-ratification, never blocking submission): RevenueCat + server-side entitlements (B-331), the B-332 manual-protein prerequisite, the paywall un-mock (B-263/B-264/B-265/B-266), the extraction gate flip, and the ship-dark 4+-pet gate (D-M8). Six PRs, §9.
3. **The numbered offline actions** only the PM can take (App Store Connect, Small Business Program, RevenueCat, product config), each with its decision checkpoint. §10.

**Scope guard:** monetization is NOT on the submission critical path (strategy §4 #8) and must never block it. Track 2 lands pre-submission because D-M4's posture (AI on, free, server-capped) requires the caps; Track 3 runs after or parallel to submission.

**Inputs:** `docs/monetization-and-ai-gating-strategy.md` (all sections; §13 rulings, §16 D-M7 expansions, §17 monthly-forward, §18 D-M8, §19 B-333, §20 hardening); backlog rows B-001, B-263–B-266, B-329–B-333; code anchors verified 2026-07-12 (cited inline throughout).

---

## 2. The ratified decisions this spec executes

| # | Ruling (one line) | Where it lands in this spec |
|---|---|---|
| **D-M1** | Free/premium boundary on the care/convenience line; this is D9 | §3 boundary table; §9 T3-D bullets |
| **D-M2** | Per-incident reads: deterministic escalation free forever (class rule, covers future `analyze-*` siblings); descriptive read launches free | §3.1 class rule; §5.4 the analyze-vomit ordering requirement |
| **D-M3** | Coffee tier dropped | Nothing to build — recorded so nobody resurrects it |
| **D-M4** | Submission posture: AI on, free, server-capped. Revisit checkpoint = Premium launch | §8 Track 2 is the enabling work; §14 checkpoint C1 |
| **D-M5** | $4.99/mo · $39.99/yr · 7-day trial on annual · monthly-forward; final lock at StoreKit config | §9 T3-D; §10 action 4 (checkpoint C2) |
| **D-M6** | "Free during early access" dual-signal labeling on the two extraction surfaces from v1 | §7.2 copy; ships in T2-4 |
| **D-M7** | Caps ratified as spec inputs + cap-hit UX principles (§16.1) + cost ceiling (§16.2) | §4.4 caps table; §6 client states; §5 server enforcement |
| **D-M8** | Pets 1–3 free forever; "large household" Premium at 4+; not wired at launch | §3 boundary table; §7.4/§7.5 copy; §9 T3-F (ship-dark) |

Supporting standing rules inherited whole: **B-252** (no gate/cap decision ever trusts client state — server-side only), **Pets > $ / Principle 7** (premium wraps convenience, never care), the **§20 hardening posture** (§12 below).

---

## 3. The boundary — free forever vs Premium (canonical)

This table is the product-wide source of truth. Any future gating proposal is checked against it; changing a row is a PM decision, not a build call.

| Surface | Tier | Notes |
|---|---|---|
| Core logging (all event types, photos, attachments) | **Free forever** | The record is never gated — including at the cap (§4.4: the cap gates the model call only, never the log) |
| AI Signal — detection + card + phrasing | **Free forever** | Deterministic care; Haiku phrasing is cache-bounded pennies |
| Health alerts / escalations (all lanes, all per-incident reads) | **Free forever** | D-M2 class rule, §3.1 |
| Vet report (full, complete, shareable) | **Free forever** | Principle 6/7; the wedge artifact. Never tier-dependent in content |
| History — all of it, no time cap | **Free forever** | A 90-day gate silently breaks the free trend + report (strategy §3.2) |
| Trend visibility / correlation views | **Free forever** | Principle 3 — the intelligence surface is the care claim |
| Data export / CSV | **Free forever** | A data right (B-041), not a feature |
| Multi-pet, pets 1–3 | **Free forever** | D-M8. Covers the normal household and the whole wedge |
| Descriptive vomit read (and future per-incident descriptive reads) | **Free at launch** | D-M2: any future gating decision is made for the *class*, data-informed — never per-feature ad hoc |
| Photo food extraction (`extract-food-from-photo`) | **Premium** (at gate flip, T3-E) | Free + "early access" labeled until then (D-M6). Gate flip HARD-blocked on B-332 (§9 T3-A) |
| Medication label extraction (`extract-medication-from-photo`) | **Premium** (at gate flip) | Same. The §6.5 strength-confirm safety gate is tier-independent |
| "Ask AI" chat (B-228, unbuilt) | **Born-Premium** | Never listed on the paywall until it exists (Guideline 3.1.2) |
| Widgets / custom themes / priority support | **Premium** | The mock's placeholder bullets, now ratified |
| Multi-pet, 4+ pets ("large household") | **Premium lever, not wired at launch** | D-M8. T3-F builds the server-side check ship-dark |

### 3.1 The D-M2 class rule (verbatim intent, encoded here so `analyze-stool` never relitigates it)

**Standing invariant for every per-incident AI read, current and future** (`analyze-vomit` today; `analyze-stool`/`analyze-skin`/`analyze-eye` when built):

1. The **deterministic escalation logic is free forever and is never disabled** — not by tier, not by cap, not by flag. It runs on every incident regardless of whether the model is called (§5.4 makes this structural).
2. The **descriptive model read launches free** on every new read in the class.
3. Any future decision to gate descriptive reads is made **once, for the class, data-informed** — never per-feature.
4. Cap and flag copy near these surfaces never reads as "pay to analyze" (§6.3, §7.3).

---

## 4. Architecture

### 4.1 Three tables, one lever hierarchy

Three new tables, each in its own additive migration PR (§20 #4): `app_config` (T2-1), `ai_usage` (T2-2), `entitlements` (T3-B). No existing table changes. Confirmed 2026-07-12: no `app_config`/`ai_usage`/`entitlements` reference exists anywhere in code today.

The levers, outermost to innermost — each check is server-side in the Edge Function (B-252); the client only *renders* state:

1. **`ANTHROPIC_API_KEY` unset** — the existing emergency kill switch. Every surface already degrades safely (strategy §2). Unchanged.
2. **`app_config` flags** — the product lever. Per-surface on/off, flippable without a deploy or a binary review cycle.
3. **`ai_usage` caps** — the abuse bound. Per-user, per-function, per-UTC-day (+ per-UTC-month), checked in-function immediately before the Anthropic call.
4. **`entitlements` tier** (Track 3) — free vs Premium, fed by the RevenueCat webhook, read server-side.

### 4.2 `app_config` (migration T2-1)

```sql
CREATE TABLE app_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS: enabled. One policy: SELECT to authenticated USING (true).
-- No INSERT/UPDATE/DELETE policies — writes are service-role/dashboard only.
```

Keys, seeded in the migration. **Ship-dark rule (§20 #1): every seeded value matches today's live behavior byte-for-byte.** Flipping a value is its own deliberate, reviewed act (a documented dashboard/SQL change, recorded in STATUS.md), never a deploy side effect.

| Key | Seeded value | Client fallback when config is unreachable | Meaning |
|---|---|---|---|
| `ai_food_extraction_enabled` | `true` | `true` (fail-open — feature keeps working) | Gates the model call + the capture affordance |
| `ai_med_extraction_enabled` | `true` | `true` (fail-open) | Same |
| `ai_vomit_read_enabled` | `true` | `true` (fail-open) | Gates the descriptive read ONLY — never the escalation (§3.1) |
| `ai_signal_phrasing_enabled` | `true` | `true` (fail-open) | Off = template-only phrasing (already an invisible degradation) |
| `paywall_enabled` | `true` | **`false` (fail-closed)** | Gates `app/onboarding/paywall.tsx`. Fail-closed because a dead trial CTA is a Guideline 2.1/3.1.2 rejection risk (B-330); a missing paywall is merely a skipped screen |
| `ai_caps` | `{}` (empty — code defaults apply) | code defaults | Optional per-function cap overrides, same shape as §4.4. Lets the PM tighten/loosen a cap without a deploy |

- **Server read:** each Edge Function reads its own key(s) at request time via its existing Supabase client (the `authenticated` SELECT policy covers the anon+JWT clients; service-role bypasses RLS anyway). The **function's check is authoritative** — the client's copy only shapes UI.
- **Server-side read-failure fallback (⚠ Dir. of Eng sign-off required, T2-3):** the client fallbacks are tabled above, but the *authoritative* path needs its own defined behavior for when the **function's own `app_config` read errors** (DB blip, timeout, transient RLS failure). The read must never hard-fail the request. Provisional rule — **mirror the client's per-key posture: AI keys fail *open* (proceed as if enabled) so a transient config blip never dark-holes a working feature; the paywall key is client-only so it has no server path.** This keeps the authoritative and rendered behaviors consistent, and it errs toward the feature working rather than a spurious "disabled" state. The Dir. of Eng owns confirming this (and whether a read error should be logged/observable) before T2-3 merges — it is currently *unspecified* in the ratified strategy, so it is an engineering call to ratify, not a re-decision of a PM ruling.
- **Client read:** new `lib/appConfig.ts` + `hooks/useAppConfig` (mirror the existing `hooks/` pattern — `useIsOnline`, `usePet`, etc.). Fetch on app start + on foreground (`useAppActive`); cache last-known-good locally so offline uses the last fetched values, falling back to the per-key shipped defaults above on first-ever run. Storage mechanism is build-time (S1, §15).
- `constants/flags.ts` (`SOCIAL_AUTH_ENABLED`, build-time const) stays as-is — that's a build-time flag; `app_config` is for server-flippable state. Don't merge them.

### 4.3 `ai_usage` (migration T2-2)

```sql
CREATE TABLE ai_usage (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function  TEXT NOT NULL,          -- 'extract_food' | 'extract_medication' | 'analyze_vomit' | 'generate_signal'
  day       DATE NOT NULL,          -- UTC day (house rule: UTC everywhere, convert at the app layer)
  scope_id  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
                                    -- pet_id for generate-signal (per-pet cap); sentinel zero-UUID otherwise
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, function, day, scope_id)
);
-- RLS: enabled. Owner-read: SELECT USING (user_id = auth.uid()).
-- No client write policies — writes happen ONLY via the SECURITY DEFINER RPC below.
```

**The atomic counter RPC** (same migration):

```sql
CREATE FUNCTION record_ai_usage(p_function TEXT, p_scope_id UUID DEFAULT NULL)
RETURNS TABLE (day_count INTEGER, month_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- Derives the caller from auth.uid() — RAISES if null. The uid can never be
-- forged from the request body (B-252). Atomic increment-then-return:
--   INSERT ... ON CONFLICT (user_id, function, day, scope_id)
--   DO UPDATE SET count = ai_usage.count + 1
--   RETURNING count  → day_count
--   plus SELECT COALESCE(SUM(count),...) over the current UTC month → month_count
```

`GRANT EXECUTE ON FUNCTION record_ai_usage TO authenticated;` — called with the caller's JWT client, so it works identically from all four functions with **no new service-role surface** (notably: `generate-signal` keeps its deliberate no-service-role posture, `index.ts:24-25`).

Design points the reviewers should hold us to:

- **Increment-then-check, in the Edge Function.** The RPC increments and returns counts; the *function* compares against the caps (§4.4) and skips the model call when `day_count` or `month_count` exceeds the tier cap. Race-free under concurrent requests (two racers both increment; at worst the counter overshoots the cap by the race width — caps are generous bounds, not billing).
- **Attempts are counted, not successes.** A failed model call burns a unit; retries hit the same counter (ratified, strategy §9). This is the abuse-safe direction.
- **Counters reset on the UTC day / UTC month** (§16.1 #5). Copy says "tomorrow" / "at the start of next month," never a clock time.
- **Transparency without nagging** (§16.1 #6): rows are owner-readable via RLS, but **v1 ships no usage meter UI** — a meter invites cap-anxiety for the 99% who never approach the caps.
- **T&S standing note:** `ai_usage` rows are usage metadata — they stay out of any analytics pipeline until B-016 decides PII posture.
- **Deletion:** `ON DELETE CASCADE` from `auth.users` folds the table into the B-039 hard-delete cascade with no extra work; flag it in the deletion spec's table inventory when that PR lands.

### 4.4 The caps (D-M7, ratified; monthly ceilings derived per §16.2)

Daily caps below are the **ratified D-M7 numbers verbatim**. Monthly ceilings: food's 60/month was ratified explicitly; the remaining monthly values are this spec's derivation — extraction surfaces follow food's "a pantry/med-cabinet is finite" ~4× logic, per-incident and signal follow §16.2's ≈20× formula. They live as code defaults in a single `CAPS` constant per function (overridable via `app_config.ai_caps`), so tuning is config, not deploy.

| Function | Free daily | Free monthly | Premium daily | Premium monthly | Notes |
|---|---|---|---|---|---|
| `extract-food-from-photo` | 15 | 60 | 40 | 160 | Bounded naturally — re-logging a known food is zero-AI |
| `extract-medication-from-photo` | 10 | 40 | 20 | 80 | Same shape |
| `analyze-vomit` | 10 | 200 | 10 | 200 | **Deliberately identical across tiers** (D-M2). Monthly is 20× — a chronic-vomiting month (~90 reads) never hits it. **Cap value clinically ratified (PM, 2026-07-13):** ≥10 incidents *in a single day* is past the domain of at-home logging — it is emergency-room territory, and the deterministic escalation floor fires on incident #11 regardless of whether the descriptive model read is capped (§5.4), so the cap can never suppress a safety signal |
| `generate-signal` | 12/pet | 240/pet | same | same | Backstop against a client bug loop; the 24h cache + debounce do the real work. Scoped per-pet via `scope_id`. This is an **enforcement scope**, not a billing unit — see the per-pet-vs-per-user note below |
| Ask-AI chat (future) | n/a (premium-only) | — | sized in its own spec (B-228) | — | Born-premium, hardest-throttled |

**Cost ceiling check** (per §16.2 call estimates): a determined abuser pinned at every monthly ceiling costs ≈ 60×$0.017 + 40×$0.017 + 200×$0.024 + 240×$0.006 ≈ **$8/user/month** — under the §16.2 ~$15 target. A genuinely heavy honest user stays at $0.60–$3/month. The ceiling is **accounted per user**, not per pet: a multi-pet household multiplies the `generate-signal` line (a 3-pet home ≈ 3× the $1.44 signal component), and the PM has accepted this as an intentionally generous headroom (2026-07-13) — the ceiling still clears the target. **Build-time task (T2-3):** verify the per-call token estimates against real `usage` fields from the deployed functions' logs; adjust the table if reality diverges >2×.

**Per-pet cap vs per-user cost — the two are different axes, not a contradiction.** The `generate-signal` cap is *enforced* per pet (`scope_id = pet_id`) so a 3-pet household isn't throttled to one pet's regeneration budget; every pet gets its own 12/day backstop. Cost, by contrast, is *summed* per user across their pets — which is how the ceiling above is stated. For the modal single-pet owner the two are identical. Enforcement scope (per-pet) answers "who gets throttled"; cost accounting (per-user aggregate) answers "what could a user cost." *(Build guard, tracked for T2-3: the RPC's `p_scope_id` defaults to the sentinel zero-UUID; the signal path MUST pass `petId` or every pet silently collapses onto one shared counter — cover it with a matrix row asserting two pets keep independent counters.)*

**Track 2 ships the free column only, applied to everyone** (there is no entitlement yet). T3-E activates the Premium column via the entitlement read.

### 4.5 The typed response contract

Over-cap and flag-off are **product states, not errors** — they must never surface as a bare 429/500 (today every function's failure path is `{ error, detail }` 500, which the client renders as an error banner; that is exactly the Guideline-2.1 look we're eliminating).

**HTTP contract (extraction functions + generate-signal):** status **200** with a typed body — deliberate, because `supabase.functions.invoke` treats non-2xx as a thrown `FunctionsHttpError` and would route these states into the existing error paths:

```jsonc
// cap reached
{ "cap_reached": true, "cap": "daily" | "monthly", "function": "extract_food", "resets_at": "2026-07-13T00:00:00Z" }
// feature flagged off
{ "feature_disabled": true, "function": "extract_food" }
```

`resets_at` = next UTC midnight (daily) or first of next UTC month (monthly). The client renders designed states from these (§6) — it never parses error strings.

**`analyze-vomit` is row-based** (the client polls `event_ai_analysis`, it doesn't consume the HTTP body — `VomitAnalysisSection.tsx:92-106`): the function ALSO writes the state into the row. `status` is an unconstrained TEXT column (migration 013:167 — verified: no CHECK constraint), so two new values are **not a schema change**:

- `status = 'capped'` — read skipped at the cap, no escalation flags fired. Client renders the §6.3 cap state.
- `status = 'read_disabled'` — read flagged off, no flags fired. Client renders nothing (no dead affordance).
- **If deterministic flags DID fire** (either case): the row is written as a normal `completed` analysis — `recommendation` forced by `applyEscalationFloor`, template `read_text`, `contextual_flags` populated. The owner sees the escalation exactly as if the model had run. This is §3.1 rule 1 made structural.

### 4.6 Identity — every capped function must derive a verified uid

The counter keys on the **JWT-verified** user id, never a body value. Current state (verified 2026-07-12) and the required change:

| Function | Today | Required in T2-3 |
|---|---|---|
| `extract-medication-from-photo` | ✓ already derives uid via `userClient.auth.getUser()` (`index.ts:364`, the B-123 posture) | Reuse it |
| `analyze-vomit` | User client exists (RLS-scoped reads) but no explicit `getUser()` | Add `auth.getUser()` on the existing user client; 401 on failure |
| `generate-signal` | JWT presence check only; identity implicit via RLS | Add `auth.getUser()` on the existing anon+JWT client; pass `petId` as `scope_id` |
| `extract-food-from-photo` | **JWT presence check only; no user client at all** — runs entirely on service-role with body-supplied `food_item_id`/`photo_paths` | Create a user client from the caller JWT + `auth.getUser()`; 401 on failure. (S3, §15: recommend also validating photo-path ownership against the verified uid while we're in here — the same IDOR class B-123 closed for medications. `rls-privacy-reviewer` input) |

### 4.7 `entitlements` (Track 3 shape — locked here so Track 2's code can name it)

```sql
CREATE TABLE entitlements (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'premium'
  expires_at          TIMESTAMPTZ,                    -- NULL for free; RevenueCat-fed for premium
  rc_app_user_id      TEXT,                           -- RevenueCat app_user_id (we set it to the Supabase uid)
  rc_last_event_id    TEXT,                           -- idempotency: last processed webhook event
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS: enabled. Owner-read: SELECT USING (user_id = auth.uid()).
-- Writes: service-role only (the webhook function). No client write path exists (B-252).
```

- **Written only by** the new `revenuecat-webhook` Edge Function (T3-C) — the one function deployed with `verify_jwt = false` (external caller), authenticated instead by the shared `Authorization` header configured in RevenueCat (`REVENUECAT_WEBHOOK_SECRET`, → Secrets Register). Idempotent upsert keyed on the webhook event id. `rls-privacy-reviewer` mandatory.
- **Read server-side** by the gated functions at request time (tier → cap column; T3-E: tier → allow/deny extraction). Missing row = `free`.
- **Read client-side** for rendering only, cached locally with the entitlement's `expires_at` + a grace window — an owner never loses Premium in a dead zone (QA's §6 demand; offline-first house rule). RevenueCat's SDK cache covers the purchase surface; our row covers gated-feature rendering.
  - **⚠ Grace-window duration is an open product decision — flagged, resolve at T3-C build time (PM, 2026-07-13).** The window length has money on *both* sides: too long invites free-riding after a cancellation; too short breaks the "never loses Premium in a dead zone" promise. It is therefore **not** a pure engineer's call — unlike the *storage mechanism* for the cache (S1), the *duration* is a product decision. Provisional default to react to: **72h offline grace keyed to `expires_at`** (covers a weekend dead zone; bounds post-cancel free access to three days). The PM confirms or adjusts the number when T3-C is built — do not lock it silently in code.
- **Lapse behavior (confirmed invariant, strategy §10 #6):** previously-extracted data is the owner's and stays; only the ability to run *new* extractions gates.

---

## 5. Server enforcement, function by function (T2-3)

The check order in every capped function: **auth → flag → (work that must survive the cap) → cap → Anthropic call**. The flag check costs one indexed read; the cap check is one RPC round trip. Both results are authoritative regardless of what the client believed.

### 5.1 `extract-food-from-photo`
1. Verify JWT → uid (§4.6 — new user client).
2. Read `ai_food_extraction_enabled`; if off → `200 { feature_disabled }` **without** touching `ai_extraction_status` (the food row stays `pending`-free; the client never invoked us blind because it hides the affordance, but a stale client gets a clean state, not a failure write).
3. `record_ai_usage('extract_food')` → compare to caps → over: `200 { cap_reached, ... }`, and set the food row's `ai_extraction_status = 'failed'`? **No** — introduce nothing error-shaped: leave extraction status untouched and let the client route to manual fill-in (the photo and the food row are already saved — the cap gates the read, never the record).
4. Under cap: existing Sonnet call + write-back, unchanged.

### 5.2 `extract-medication-from-photo`
Same shape (uid already derived). Stateless function (no DB writes today) — flag-off and cap paths just return the typed 200 bodies; the client routes to manual entry with the label photo saved, exactly like today's failure path but rendered as a designed state.

### 5.3 `generate-signal`
1. uid via `getUser()`; `record_ai_usage('generate_signal', petId)`.
2. Over cap → `200 { cap_reached }` **without regenerating**; the client silently keeps rendering the cached signal (§4.4 — this cap is a bug-loop backstop, invisible to owners; **no UI state ships for it**).
3. `ai_signal_phrasing_enabled` off → run the full deterministic pipeline with phrasing forced to templates (the existing fallback path, `index.ts:146-161`) — invisible by design. Detection itself is **never** flag-gated: the Signal is care (§3).

### 5.4 `analyze-vomit` — the reorder (adversarial-reviewer's target)

**Today's order** (verified): load event → download photo → **vision call** (step 3, `:731-768`) → assemble context + `computeContextualFlags` + `applyEscalationFloor` (step 4, `:770-780`) → write-back.

**Required order** — §16.1 #1 verbatim: *the cap check sits immediately before the Anthropic call, after escalation-flag computation*:

1. Load event, verify uid (§4.6).
2. **Assemble context + `computeContextualFlags` FIRST** — these are DB reads via the user client (`:483-546`), fully independent of the vision result (they already run for photo-less logs).
3. Flag check (`ai_vomit_read_enabled`) and cap check (`record_ai_usage('analyze_vomit')`).
4. **If capped or flagged off:** skip the vision call. If contextual flags fired → write a normal `completed` row with the floor-forced `worth_a_call` recommendation + template `read_text` + `contextual_flags` (the existing no-photo template path). If no flags → write `status='capped'` / `'read_disabled'` (§4.5). **Never-reassure survives the cap by construction: there is no code path from "capped" to a reassuring verdict.**
5. Under cap + enabled: photo download + vision call + merge + floor + write-back as today.

**Invariants the adversarial review must attempt to break** (§20 #2 names this PR mandatory): (a) no input — capped, flagged-off, photo-less, HEIC-unreadable, concurrent duplicate calls — can produce a path where a fired contextual flag fails to escalate; (b) no capped/disabled state renders reassurance or blocks the log; (c) the counter can't be bypassed by parallel requests or forged identity; (d) the reorder doesn't change any currently-passing fixture's outcome (behavior byte-identical while caps are unhit and flags on — the ship-dark bar).

**Tests:** these functions follow the pure-module split (handler untested; logic extracted and Deno-tested). Extract the cap/flag decision into a pure helper (e.g. `resolveGateState(config, counts, caps)`) shared in shape across the four functions, with Deno tests per function covering the §11 matrix rows. `analyze-vomit`'s reorder additions ride its existing `index.test.ts` pure-helper suite.

---

## 6. Client states, surface by surface (T2-4)

QA's standing demand (strategy §6): every gated surface needs a designed **not-included** state, a designed **cap-reached** state, and (Track 3) a designed **entitlement-expired** state. No gate ships without all three. Principle 1 rider (§16.1 #4): a cap/flag state **never interrupts capture mid-flow** — it appears on the result surface only.

### 6.1 Food capture (`app/food-capture.tsx`)
- **Flag off (`ai_food_extraction_enabled=false`):** the intro's camera affordance is hidden; the flow opens directly on the manual `edit` step (the existing `handleManualEntry` path, `:461-466`). No banner, no retry — manual entry IS the designed state. The photo attach affordance (for the owner's own record) stays if it exists independent of extraction.
- **Cap reached (typed response):** route to the `edit` step exactly as the failure path does today (`:337`/`:357`), but render the §7.3 cap state instead of the `failedBanner` error copy (`:689-695`) — visually a calm informational band (theme tokens, not error styling), never red.
- **Genuine extraction failure** keeps today's banner (that path really is a retryable fault) — but T2-4 re-words it away from bare error register where it collides with the new states (Designer pass).

### 6.2 Medication capture (`app/medication-capture.tsx`)
Mirror of 6.1 on the med surface: flag off → straight to `edit` + `MedicationNameChips` (`:538-541`); cap → §7.3 copy replacing the failure banner (`:521-530`). The §6.5 strength-confirm safety gate is untouched — it applies identically to hand-typed values.

### 6.3 Vomit read (`components/event/VomitAnalysisSection.tsx`)
- **Flag off:** if the row lands `status='read_disabled'` and no flags fired, the analysis section renders **nothing** — no dead "Try again" (`:216-230`), no empty frame. If flags fired, the row is a normal completed escalation and renders as today.
- **Cap reached (`status='capped'`, no flags):** render the §7.3 vomit cap state — the read runs tomorrow, everything is saved, and the standard "when to call your vet" guidance stays visible. **Never** error styling, **never** a Premium mention, **never** reassurance. `clinical-guardrails` + Dr. Chen review on this state is mandatory.
- The fire-and-forget trigger (`lib/analysis.ts:14-25`) is unchanged — the function decides; the client renders the row.

### 6.4 AI Signal
No new UI. Cap → cached signal continues rendering (§5.3). Phrasing flag-off → templates (indistinguishable). This is the "invisible by design" column of strategy §2 preserved.

### 6.5 Paywall (`app/onboarding/paywall.tsx`) — T2-5
`paywall_enabled=false` → the pet-age step routes directly to `/onboarding/done` (the screen already sits outside the 5-step progress bar, `:24-27`, so no progress math changes). Shipped client fallback is `false` (§4.2 — fail-closed). T2-5 lands with the seeded value still `true` (ship-dark, byte-identical); **the pre-submission flip to `false` is its own recorded config change** (§8, T2-5 AC).

---

## 7. Copy pack (drafts — every string below requires its named review pass before merge)

House rules apply throughout: `nyx-voice` (warm, specific, no exclamation marks, second-person owner), `clinical-guardrails` on anything near a symptom, theme tokens only. These are **drafts to react to, not final**.

### 7.1 Review-pass matrix

| String set | Required passes |
|---|---|
| Extraction cap/flag states (7.3 food + med) | `nyx-voice`, Designer |
| Vomit cap state (7.3) | `nyx-voice`, `clinical-guardrails`, **Dr. Chen** |
| Early-access labels (7.2) | `nyx-voice`, Designer |
| B-333 commitment line (7.6) | `nyx-voice`, `pm-feature-review` (rides the surfaces it appears on) |
| Done-screen + paywall copy (7.4, 7.5) | `nyx-voice`, `pm-feature-review` (T3-D) |

### 7.2 D-M6 early-access labels (ship in T2-4, retire in T3-E)

Must dual-signal: free **now** AND may become paid **later** — an honest heads-up, not a perk badge. One quiet line on each extraction surface (capture intro screens), small type, no badge styling:

> Label reading is free during early access — it may become part of Premium later.

Same string on both surfaces (food/med). Removed in T3-E when the gate flips (the AC lists it).

### 7.3 Cap-reached states

**Food extraction (daily):**
> You've hit today's limit for label reading. The photo is saved — fill in what you know below, and reading picks back up tomorrow.

**Food extraction (monthly):** same, with "…picks back up at the start of next month."

**Medication extraction (daily):**
> You've hit today's limit for label reading. The label photo is saved — fill in the details below, and reading picks back up tomorrow.

**Vomit read (daily — the sensitive one):**
> Today's photo reads are used up, so this read will run tomorrow. Everything you logged is saved. If {pet} keeps vomiting or seems off, don't wait for the read — check in with your vet.

Constraints checked: no reassurance ("probably fine" is absent by construction), no transaction ("Premium"/"upgrade" never appears near a symptom — §16.1 #3), the record-is-saved fact stated plainly, escalation guidance present. Monthly variant: "…will run at the start of next month."

**Signal cap:** no copy — invisible (§6.4).

### 7.4 Done screen (D-M8 copy pass)

Current (`app/onboarding/done.tsx:92`): "Got more than one pet? You can add them anytime from your profile."

Proposed:
> Got another pet? You can add them anytime from your profile.

Rationale: "another" reads as the second/third pet — true forever for every free household (1–3 free, D-M8) — without promising unbounded capacity the 4+ gate would later break. Minimal diff, survives the ruling. (Ships whenever convenient; required before T3-F flips.)

### 7.5 Paywall bullets + pricing presentation (T3-D, resolves B-263)

`PREMIUM_FEATURES` (`paywall.tsx:38-42`) becomes the ratified list:

> - Photo food entry — snap the label, we do the typing
> - Medication label scanning
> - Custom themes & home-screen widgets
> - Priority support

Rules: **"Ask Culprit's AI" is not listed until it exists** (3.1.2 — never advertise unbuilt functionality); the **"large household (4+ pets)" bullet is withheld until T3-F actually wires the gate**; the "Always free: logging, health alerts, trends & vet reports." line (`:154-157`) stays verbatim and load-bearing.

Pricing presentation (D-M5 + §17 monthly-forward): the static £29.99/£3.99 display (`:114-132`) is replaced by **runtime StoreKit product prices** (localized — never hardcoded currency), **monthly listed first-class**, annual as a genuine save beneath it (never a preselected default), "7-day free trial" attached to annual, and the 3.1.2 disclosure set adjacent to the CTA ("then {price}/mo, cancel anytime"), Restore Purchases, functional ToS + privacy links (B-264). Jordan's 8-week diet trial must never require the annual commitment. Cancellation copy is warm ("glad {pet}'s doing better") — no guilt, no dark patterns.

### 7.6 B-333 care-first commitment line

One sentence, shown **where money appears and nowhere else** (gate states, cap states that ever mention tiers — none in v1 — the paywall, Settings/About via B-283). Never on Home (Principle 3).

> {Pet}'s care is never behind this door — logging, health alerts, trends and the vet report are free, always.

(Settings/About variant uses "Your pet's care…" when no active pet context exists.) Must read as a commitment, not marketing.

---

## 8. Track 2 — PR plan (pre-submission)

Order is strict; each PR is independently shippable and ship-dark (§12). Migrations deploy via the Supabase MCP `apply_migration` + `get_advisors`; function deploys via `scripts/deploy-edge.sh` + `deploy_edge_function`, preserving `verify_jwt=true` (runbook: `docs/edge-deploy-runbook.md`).

### T2-1 — `app_config` migration (B-329, schema half)
- **Contents:** §4.2 table + RLS + the six seeded rows.
- **Migration Safety Pre-flight:** Rollback `DROP TABLE app_config;` · Destructive **n** (purely additive) · Backfill N/A (seed rows ship in the migration).
- **AC:** table + policy visible in `list_tables`/advisors clean; an authenticated client can SELECT; an authenticated client CANNOT write; seeded values match §4.2.
- **Review:** `code-reviewer`.

### T2-2 — `ai_usage` migration + `record_ai_usage` RPC (B-001, schema half)
- **Contents:** §4.3 table + RLS + RPC + grant.
- **Pre-flight:** Rollback `DROP FUNCTION record_ai_usage; DROP TABLE ai_usage;` · Destructive **n** · Backfill N/A.
- **AC:** RPC increments atomically (two concurrent calls → count 2, no error); returns correct day/month counts across a UTC-day boundary; `auth.uid()`-null calls raise; owner can read own rows only; no client write path exists.
- **Review:** `code-reviewer` + **`rls-privacy-reviewer`** (SECURITY DEFINER + RLS + the forged-identity attack).

### T2-3 — server enforcement in the four functions (B-329 + B-001, code half)
- **Contents:** §5 per function — uid derivation (§4.6), flag reads, cap checks, typed responses (§4.5), the `analyze-vomit` reorder (§5.4), the `CAPS` defaults + `ai_caps` override read, the shared-shape pure gate helper + Deno tests. Verify token estimates against live `usage` logs (§4.4).
- **AC:** with all flags on and counters at zero, behavior is **byte-identical** to today across the existing Deno suites (the ship-dark bar); each §11 matrix row has a passing test; over-cap/flag-off returns exactly the §4.5 contract; a capped `analyze-vomit` incident with a fired contextual flag still writes an escalating `completed` row.
- **Review:** `code-reviewer` on all; **`adversarial-reviewer` mandatory** on the `analyze-vomit` path (§5.4 invariants); `rls-privacy-reviewer` on the `extract-food` user-client hardening (S3).
- **Deploy note:** redeploys all four functions from merged `main` — post-deploy smoke per runbook (version bump + ACTIVE + clean 4xx boot test).

### T2-4 — client flag-aware + cap states (B-329 client half; ships D-M6 labels + first B-333 surface)
- **Contents:** `lib/appConfig.ts` + `hooks/useAppConfig` (§4.2); §6.1–6.3 states; §7.2 early-access labels; §7.3 copy. Jest fixtures for the §11 matrix (client rows).
- **AC:** flag-off hides affordances (no dead buttons anywhere); cap states render designed copy, never error styling; capture is never interrupted mid-flow; offline uses last-known-good config; first-run-offline uses shipped defaults; existing failure banners still work for genuine faults.
- **Review:** `code-reviewer`; Designer pass on every state; `nyx-voice` on all strings; `clinical-guardrails` + Dr. Chen on the vomit cap state.

### T2-5 — paywall mock out of the submission build (B-330)
- **Contents:** §6.5 routing gate on `paywall_enabled`; shipped fallback `false`. Seeded value stays `true` (ship-dark).
- **AC:** flag on → today's flow byte-identical; flag off → pet-age routes to done, no paywall reachable; config-unreachable → hidden.
- **The flip itself:** a recorded pre-submission action — set `paywall_enabled=false` in the live `app_config`, note it in STATUS.md. Not part of this PR's deploy.
- **Review:** `code-reviewer`.

**Done-screen copy (§7.4)** is a one-line change — ride it along with T2-4 or T2-5 rather than its own PR.

---

## 9. Track 3 — Culprit Premium (after ratification; never blocking submission)

### T3-A — B-332 manual protein capture ⚠ HARD blocker for T3-E (and worth shipping first regardless)
- **Contents:** "Primary protein" picker — wrapping `components/ui/ChipGroup` (house rule: never an h-scroll chip row), closed set derived from the canonical handling in `lib/protein.ts` (`canonicalizeProtein` + `PROTEIN_JUNK`; the picker offers the common canonical proteins + an "Other" typed escape that runs through `canonicalizeProtein`) — added to (a) the food-capture manual `edit` step (`commitFoodInner` upsert gains `primary_protein`, `food-capture.tsx:409-419` — heed the `:387-390` comment: only write it when the owner touched the field, never null-clobber an AI-hydrated value) and (b) the food detail edit payload (`app/food/[id].tsx:195-203`).
- **Why (D-M1 amendment, strategy §14):** `primary_protein` is extraction-only today and the flagship correlation keys off it — gating extraction without this silently degrades the free tier's flagship care insight (Principle 7 leak). An extraction *failure* leaves the same hole today.
- **AC:** manual food with a picked protein participates in case-crossover naming; edit screen can set/correct protein; an untouched picker never overwrites an AI value; no schema change.
- **Review:** `code-reviewer`; Designer (picker UX); `adversarial-reviewer` light pass — confirm owner-entered protein flows through `canonicalizeProtein` identically to AI-entered (no new correlation edge case).
- **Parallelism:** independent of everything else in both tracks — can run any time, including before Track 2 finishes.

### T3-B — `entitlements` migration
- **Contents:** §4.7 table + RLS.
- **Pre-flight:** Rollback `DROP TABLE entitlements;` · Destructive **n** · Backfill N/A (missing row = free).
- **Review:** `code-reviewer` + **`rls-privacy-reviewer` mandatory**.

### T3-C — RevenueCat wiring + `revenuecat-webhook` function
- **Contents:** `react-native-purchases` SDK (Expo config plugin — managed-workflow compatible, no ejection; Dir. of Eng confirms before merge), app_user_id = Supabase uid; the webhook Edge Function (§4.7 — `verify_jwt=false`, shared-secret header, idempotent by event id, writes `entitlements` only); client entitlement read + local cache w/ grace (§4.7); Secrets Register rows (§10 action 3).
- **AC:** sandbox purchase → webhook → `entitlements` row premium within seconds; expiry/cancel events downgrade; replayed webhook is a no-op; forged webhook (wrong secret) rejected; client renders Premium offline from cache inside grace.
- **Review:** `code-reviewer` + **`rls-privacy-reviewer` mandatory** (webhook auth, confused-deputy, forged-event attacks).
- **Blocked on:** offline actions 1–4 (§10).

### T3-D — paywall un-mock (resolves B-263, B-264, B-265, B-266)
- **Contents:** real purchase flow via RevenueCat on `paywall.tsx`; §7.5 bullets + runtime prices + monthly-forward + 3.1.2 disclosure set + Restore Purchases + ToS/privacy links (B-264); placement work per B-265 (post-first-value trigger moments — "first Signal rendered", "first vet report shared" — with at most a low-pressure onboarding mention); free-escape hierarchy per B-266 (proper secondary "Maybe later" button); B-333 line on the paywall + Settings/About.
- **AC:** 3.1.2 checklist complete; purchase + restore work in sandbox; monthly listed first; free path unmistakable; `paywall_enabled` flips the whole surface.
- **Review:** `code-reviewer`; `nyx-voice`; **`pm-feature-review` mandatory before any flip** (§20 #2).
- **Checkpoint C2 (D-M5):** final price lock happens at product config (§10 action 4) — the code reads prices at runtime, so a price change is App Store Connect config, not a code change.

### T3-E — the gate flip (extraction surfaces go Premium)
- **Contents:** extraction functions check `entitlements` server-side (free tier → designed "not included" state routing to manual entry; premium → premium caps from §4.4); early-access labels retired (D-M6); "entitlement expired" client state (QA's third state); B-333 line inside the gate state.
- **HARD-blocked on:** **T3-A (B-332)** merged + verified, and the **B-047/B-016 instrumentation gate** (§20 #6 — conversion + time-to-first-insight tracking must exist first, or D-M5's revisit has no data).
- **⚠ Unowned-dependency flag (surfaced 2026-07-13):** B-047 (AI-Signal instrumentation) and B-016 (error observability) are **both Open and unbuilt** (B-047 = `Next`, B-016 = `Later` in `docs/backlog.md`) and **neither appears in Track 2's or Track 3's PR plan**. T3-E therefore has a hard prerequisite on work no one currently owns inside this spec. Before T3-E is scheduled, the PM must decide one of: (a) pull the minimum conversion + time-to-first-insight events into Track 3 as an explicit PR with an owner, or (b) run B-047/B-016 as a named parallel prerequisite track. Left unresolved, T3-E will silently slip — a gate cannot flip against instrumentation that does not exist. **PM action item.**
- **AC:** free user hits a designed gate (never an error), record/photo still saves, manual path in-place; premium user unaffected; lapse honors §4.7's invariant (old data stays); the §11 matrix passes for both tiers.
- **Review:** `code-reviewer`; `pm-feature-review` on the full free-tier flow; `adversarial-reviewer` re-run on `analyze-vomit` **only if** its path changed (it should not — vomit reads are tier-identical, D-M2).
- **This is also checkpoint C1 (D-M4 revisit):** Premium launch is the named checkpoint to revisit the AI-on-free-server-capped posture with real usage data.

### T3-F — 4+-pet "large household" gate (D-M8) — built ship-dark, NOT wired at launch
- **Contents:** server-side pet-count check at pet creation (Edge Function or RLS-adjacent RPC — creation must be server-checked, B-252) against `entitlements`: free/lapsed → 3 active pets max; premium → uncapped. Behind its own `app_config` flag, **default off**. Designed "large household" state + the paywall bullet (§7.5) land here but stay flag-gated.
- **Pre-req:** §7.4 done-screen copy shipped.
- **AC (dark):** flag off → byte-identical behavior at any pet count; flag on (test env) → 4th pet creation on free tier hits the designed state; archived pets don't count against the cap.
- **Review:** `code-reviewer`; `pm-feature-review` before any future flip (which is its own PM decision, not scheduled here).

---

## 10. Offline actions — numbered, PM-only, in order

These sequence-block T3-C onward. None block Track 2 or submission.

1. **App Store Connect → Agreements, Tax, and Banking** — complete the Paid Applications agreement, tax forms, and banking. **Prerequisite for configuring any IAP at all.** Decide first: the legal entity / merchant identity (sole trader vs company changes the tax forms). *(Strategy §10 #1.)*
2. **Apple Small Business Program** — enroll at developer.apple.com (≤$1M/yr proceeds → 15% commission). Enroll **before the first paid transaction**; approval is not instant, so do it right after action 1 clears.
3. **RevenueCat** — create the account (free tier) + project; connect the App Store Connect app; generate the **public iOS SDK key** (client-side; → Secrets Register as `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, public-safe) and configure the **webhook** to the Supabase function URL with a generated shared secret (→ `supabase secrets set REVENUECAT_WEBHOOK_SECRET`; server-only). Both rows added to the CLAUDE.md Secrets Register when T3-C lands — flag as PM Action Items at that session.
4. **Product configuration in App Store Connect** — subscription group "Culprit Premium"; two auto-renewables: monthly **$4.99**, annual **$39.99** with a **7-day free trial** introductory offer; localized pricing via Apple's price points; territories per the launch-territory decision (strategy §10 #11 — fewer is simpler). **Checkpoint C2: this is where D-M5's numbers get their final lock.** Also create a **sandbox tester** account for T3-C/T3-D verification, and note the reviewer-access plan (strategy §10 #9: a comp/sandbox entitlement in the review notes at the gate-launch submission).

---

## 11. QA state matrix (fixtures, not vibes — §20 #3)

Enumerated as **jest fixtures** (client states) and **Deno tests** (function gate logic) for every gated surface:

**Tiers/states axis:** free · premium (T3+) · capped-daily · capped-monthly · flag-off · entitlement-expired (T3+)
**Conditions axis:** online · offline · mid-sync

Required rows (minimum):

| # | Surface | State × condition | Expected |
|---|---|---|---|
| 1 | Food capture | flag-off × online | Straight to manual edit; no camera affordance; no banner |
| 2 | Food capture | capped-daily × online | Photo + row saved; §7.3 state on edit step; no error styling |
| 3 | Food capture | free × offline | Manual entry works fully; extraction queues nothing weird; config = last-known-good |
| 4 | Med capture | flag-off / capped × online | Mirror rows 1–2; strength-confirm gate still fires on manual values |
| 5 | Vomit read | capped, **no** contextual flags | Row `capped`; §7.3 state; no retry button; no reassurance string anywhere |
| 6 | Vomit read | capped, contextual flags **fired** | Row `completed` + `worth_a_call` + template read — escalation identical to uncapped |
| 7 | Vomit read | flag-off, flags fired | Same as 6 (§3.1 rule 1) |
| 8 | Signal | capped × online | Cached card renders; no visible change; no new network loop |
| 9 | Any surface | config unreachable, first run | Shipped defaults: AI fail-open, paywall fail-closed |
| 10 | Paywall | flag-off | Route skips to done; nothing dead reachable |
| 11 (T3) | Extraction | free tier post-flip × online/offline | Designed gate; record saves; manual in-place; B-333 line present |
| 12 (T3) | Extraction | premium × offline (cached entitlement, in grace) | Works — Premium never lost in a dead zone |
| 13 (T3) | Extraction | expired entitlement | Designed expired state; old extracted data untouched |
| 14 (T3) | Pet creation | free × 4th pet, T3-F flag on (test env) | Designed large-household state; archived pets excluded from count |

---

## 12. Hardening posture (inherited from strategy §20 — restated as this spec's law)

1. **Ship dark** — every PR lands default-permissive/byte-identical; every flip is its own recorded change.
2. **Review matrix** — `code-reviewer` on every PR; `adversarial-reviewer` on T2-3's `analyze-vomit` path; `rls-privacy-reviewer` on T2-2, T2-3 (extract-food hardening), T3-B, T3-C; `pm-feature-review` on T3-D/T3-E/T3-F flows before any flip.
3. **QA state matrix as fixtures** — §11, deterministic, not manual-only.
4. **Migrations additive + isolated** — `app_config` / `ai_usage` / `entitlements` each in their own PR; pre-flights written in §8/§9; `get_advisors` after every apply.
5. **No client-trusted state** — B-252 throughout; §4.6 makes it concrete.
6. **Instrumentation before the paywall** — B-047/B-016 gate T3-E (not T3-A–D).

---

## 13. Sequencing & parallelism

```
Track 1 (submission)   ──────────────────────────────────────────▶  (independent; unchanged)
Track 2:  T2-1 ─▶ T2-2 ─▶ T2-3 ─▶ T2-4 ─▶ T2-5 ─▶ [flip paywall_enabled=false] ─▶ submission build
Track 3:  T3-A ────────────────────────────────┐   (any time — independent of everything)
          [offline 1 ─▶ 2 ─▶ 3 ─▶ 4] ─▶ T3-B ─▶ T3-C ─▶ T3-D ─▶ T3-E ─▶ (future PM flip) T3-F
                                              (T3-E also gated on T3-A + B-047/B-016)
```

- **Genuinely parallel:** T3-A (protein picker) vs all of Track 2 — disjoint files, no logical dependency; the offline actions 1–4 vs everything (PM-side, zero repo contact); the §7.4 done-screen line vs everything. The one shared-file collision to expect across concurrent sessions: `STATUS.md` at wrap.
- **The single decision that unblocks the most:** none — all decisions are ratified. The single *action* that unblocks the most is offline action 1 (everything paid stacks behind it, and it has external latency).
- **Ready-to-run today:** T2-1, T2-2 (sequential schema PRs), T3-A, the §7.4 copy line, offline action 1.
- `generate-signal` deploy gate check (2026-07-12): the B-182 chain is merged and live (v23, chronicity verified on device 2026-07-01) — nothing blocks T2-3's redeploy; standard rule stands: deploy from merged `main` only.

---

## 14. Checkpoints & explicitly-not-now

| Checkpoint | When | What gets decided |
|---|---|---|
| **C1 — D-M4 revisit** | Premium launch (T3-E ships) | Re-examine AI-on-free-capped posture with real usage/conversion data |
| **C2 — D-M5 final price lock** | Offline action 4 | $4.99/$39.99 confirmed or adjusted in App Store Connect (code reads runtime prices — no code change either way) |
| **C3 — D-M2 class revisit** | Data-informed, post-Premium | Descriptive-read tier for the whole per-incident class; escalation stays free regardless |
| **C4 — T3-F flip** | PM decision, unscheduled | Wire the 4+-pet gate live |

**Out of scope for both tracks** (recorded so it isn't rediscovered): Ask-AI chat (B-228 — own spec; born-premium + hardest-throttled when it comes); Android/Play Billing (RevenueCat makes it config — trigger per strategy §10 #10); promo/offer codes (posture decision only, strategy §10 #8); household-Premium interplay (B-292 — recommendation on record: one Premium covers the household); usage-meter UI (§4.3 — deliberately not v1); any nudge/reminder monetization (B-288 unresolved, don't entangle).

---

## 15. Build-time sub-decisions (engineer's call in-PR; none PM-blocking)

| # | Decision | Lean |
|---|---|---|
| S1 | Local cache store for config + entitlement (SQLite table vs AsyncStorage/SecureStore) | Follow the closest existing pattern; entitlement alongside the session (SecureStore-adjacent), config in lightweight storage |
| S2 | Webhook idempotency detail (event-id column vs `rc_last_event_id` high-watermark) | Per-event-id is safer under out-of-order delivery; decide in T3-C with `rls-privacy-reviewer` input |
| S3 | `extract-food` photo-path ownership validation while adding the user client (§4.6) | Do it — same IDOR class B-123 closed for meds; scope-creep guard: paths validated, no other behavior change |
| S4 | Config fetch cadence beyond start+foreground | None needed — server checks are authoritative; don't poll |
| S5 | Exact picker protein list for T3-A (which canonical proteins get chips) | Derive from live `food_items.primary_protein` distinct values + the common clinical set; Dr. Chen sanity pass |
| S6 | `resolveGateState` helper: shared file vs per-function copy | Functions have no `_shared/` module today (copy-paste convention, e.g. `detectImageMediaType`); keep the shape identical per-function and note consolidation as future refactor rather than inventing `_shared/` mid-track |

---

## 16. Backlog reconciliation (rows this spec activates or touches)

| Row | Effect |
|---|---|
| B-001 | Executed by T2-2 + T2-3. Close when both merge |
| B-329 | Executed by T2-1 + T2-3 + T2-4 |
| B-330 | Executed by T2-5 + the recorded flip |
| B-331 | Executed by T3-B + T3-C (+ T3-D wiring) |
| B-332 | Executed by T3-A. Hard-blocks T3-E |
| B-333 | First surface in T2-4 (cap states); completed across T3-D (paywall + Settings/About, with B-283) |
| B-263 | Resolved by T3-D's bullet swap (§7.5) |
| B-264 / B-265 / B-266 | Folded into T3-D |
| B-252 | Satisfied structurally (§4.6, §4.7) — cite on close |
| B-047 / B-016 | Unchanged, but now **gate T3-E** (§12 #6) — and **both are still Open/unbuilt with no PR in either track** (§9 T3-E unowned-dependency flag). Needs a PM ownership decision before T3-E is scheduled |
| B-086 | Row already amended for D-M8; T3-F is the build |
| B-228 | Unchanged (Later); §14 notes its born-premium posture |

---

*End of spec. The strategy record (`docs/monetization-and-ai-gating-strategy.md`) remains the decision provenance; this document is the build contract. Conflicts between the two are resolved in favor of the strategy record's ratified rulings — and flagged to the PM, not silently patched.*
