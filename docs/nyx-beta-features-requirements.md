# Nyx — Beta Features Program: Requirements & PR Plan

**Version:** 1.1 — build-ready for **Phase 1 + Phase 2** (§4.3 scoping resolved) | **Last Updated:** 2026-08-21 (§4.3.1 — first two graduations recorded: the two Signal betas, GA 2026-08-20, CUL-551)
**Backlog:** B-712 (program), B-713 (pre-mortem guardrails — §4.3 scoping **RESOLVED** 2026-08-08, D7–D9)
**Status:** PM **phased-GO** 2026-08-06; the **§4.3 Phase-2 scoping pass is resolved** (D7–D9, delegated to the team by the PM 2026-08-08) → **PR 3 unblocked**. Round-1 mocks shipped via #601 → `docs/culprit-beta-features-mockups.html` (artifact 🧪). Session records: `docs/sessions/2026-08-06-beta-features-program-mocks.md` + `docs/sessions/2026-08-08-beta-features-b713-scoping.md`.

---

## §0 Decisions

| # | Decision | Ruling |
|---|---|---|
| **D1** | **No Premium gating in v1.** Access is a hand-picked cohort. | **RULED (PM 2026-08-06).** Premium becomes the eligibility gate later as a one-line swap (§2). Do **not** build RevenueCat / `entitlements` for this. |
| **D2** | **Eligibility = the Ask allowlist primitive.** `app_config` key `widget_enabled`, shape `{"enabled": bool, "allowlist": [uuid…]}`, resolved client-side via `useAllowlistFlag`. | **RULED.** Zero new schema beyond one seed row; reuses `resolveAllowlistFlag` (`lib/appConfig.ts`) verbatim. |
| **D3** | **Two gates, never conflated:** eligibility (allowlist, server-owned) vs. opt-in (the toggle, owner-owned). | **RULED.** This split is what makes D1's premium swap one line. See §2. |
| **D4** | **Opt-in is a LOCAL, per-device preference, default off.** | **RULED (design lead).** The widget is inherently a per-device home-screen object; a per-device opt-in is *more* correct than a synced pref, not a shortcut. Upgrade path to a server record is a B-713 #4 (measurement) decision, not a v1 need. Wiped in `wipeLocalSession` (T&S). |
| **D5** | **The widget can't be hidden per-account (iOS).** The flag gates the widget's *data*, never its *availability* in the iOS gallery. | **RULED / accepted constraint (B-713 #1).** Consequence: the widget's ungated state must be presentable — this is **Phase-1 work**, and it must be in the **App Store submission binary** (reviewers can add the widget). See §4.1, PR 2. |
| **D6** | **Widget = client-only gate.** No server gate needed (publish is client-side, reads the owner's own local data). | **RULED, with a standing rule (B-713 #2):** the *next* beta that consumes a server resource (e.g. Ask — AI credits) **must** also gate server-side via `supabase/functions/_shared/flags.ts` + the existing `ai_usage` caps. The widget's client-only pattern does **not** generalize. §4.2. |
| **D7** | **Graduation / kill policy + per-beta owner & expiry** (B-713 #3, the "graveyard"; folds in #6 "taketh-away"). | **RULED (team, delegated by PM 2026-08-08).** Every beta is a typed row in a `BETA_REGISTRY` (the single source of truth PR 3 builds for the shelf) carrying `owner` + `addedDate` + `reviewBy` + `serverCost`. Three terminal states — **graduate** (explicit GA call, FR-FLAG-5; leaves the shelf), **kill** (remove code + flag + row), **extend** (new `reviewBy`). Expiry is a *review-by*, not an auto-disable — it forces a decision, never surprises the cohort. Audited at the periodic retro (new check #5). **Grandfather rule (#6):** a tester who had a beta never loses it to a later premium gate — Pets > $. See §4.3.1. |
| **D8** | **Measurement + consent plan** (B-713 #4; resolves OPEN-3). | **RULED (team, delegated by PM 2026-08-08).** v1 measurement is **qualitative** — reuse Settings → Support "Share feedback" (OPEN-3 = reuse), plus the signals already server-visible for free (the allowlist *is* the known cohort; `ai_usage` *is* the usage trail for a server-cost beta). **No telemetry pipeline and no new consent surface in v1** — the local opt-in already *is* the consent, and nothing is transmitted. Quantitative telemetry is **deferred to the scale trigger (D9)**, where it rides the scale infra (`entitlements`/`beta_members` already make cohort membership server-visible) and inherits the standing T&S bar (B-375/B-016/B-047: separate consent — never bundled into opt-in — data-minimized to non-health events, owner-deletable, B-039 cascade). See §4.3.2. |
| **D9** | **Scale mechanism** (B-713 #5): hand-edited allowlist → premium check or a `beta_members` table. | **RULED (team, delegated by PM 2026-08-08).** **Keep the hand-edited allowlist now** (correct at dogfood scale) with a **documented soft ceiling (~25 UUIDs)** as an explicit trip-wire — the ceiling is a *privacy* limit, not ergonomics: every allow-listed UUID ships to (and is cached on) every signed-in client's device, which is why B-402 wipes that cache on sign-out. **Primary scale path = the premium check (`entitlements`)** — this *is* the already-ratified D1 Gate-1 swap; "customers" scale in by being Premium (per-account, RLS-scoped, no global-array leak) and the allowlist shrinks back to internal testers. A **`beta_members` table + join flow is the conditional fallback** — built only if a *non-premium* cohort larger than the ceiling is ever actually needed (a free open beta), never speculatively; if built it is the `entitlements` RLS shape and `rls-privacy-reviewer` is mandatory. See §4.3.3. |
| **OPEN-1** | **Name:** "Beta features" / "Labs" / "Early access". | **Resolved (team, PR 4 — 2026-08-09) — "Beta features".** The plainest, most honest label (nyx-voice Pattern 5): every owner reads "beta" as *unfinished, may change*, which is exactly the expectation the program needs to set. "Labs" is dev-culture jargon (wrong register for a calm pet-health app — Calm/Oura, not a developer tool); "Early access" pre-optimises for a Premium future D1 deferred and carries a subtle "you're first in line" promise "beta" doesn't. Already the mock's + the code's word, so zero churn; if Premium reframes it later, renaming is a one-string change. **PM may override the name before submission.** |
| **OPEN-2** | The optional **"N on"** count on the Settings row. | **Resolved (team, PR 4 — 2026-08-09) — ship it, minimal.** A quiet accent-ink trailing note (echoing the Beta pill's "active" register, per the mock), counting betas that are **eligible ∧ opted-in** — never a beta opted-in-but-killed (the widget path has already stopped publishing for that account). **Hidden at 0** so an eligible owner who's turned nothing on sees a clean doorway, not a deadening "0 on" (Principle 5). One beta in v1 so it reads directly alongside the eligibility flag; folds into a registry count when the shelf grows. |
| **OPEN-3** | **Feedback channel:** reuse Settings → Support "Share feedback", or a beta-specific prompt. | **RESOLVED by D8 (2026-08-08) — reuse Settings → Support "Share feedback".** A beta-specific channel was the B-713 #4 (measurement) call; the v1 measurement plan is qualitative, so reuse is correct — no bespoke channel until the program scales. |

---

## §1 What this is, and why

The Home Screen widget is slow, secondary work that must not gate the App Store submission. A per-account feature flag lets it ship **dark in the store binary** — on for a hand-picked cohort, invisible to everyone else — and a **Beta features** page in Settings turns that flag into a self-serve shelf a cohort can opt into, feature by feature. The widget is the first (and, in v1, only) beta.

**Wedge relevance:** none directly — this is a *velocity / release-management* tool. Its value is (a) decoupling unfinished work from the release, and (b) a feedback channel from engaged owners. It must **not** compete with the submission; that's why it's phased.

---

## §2 Architecture — two gates

The widget is live for an account iff **all** of:

```
live  =  eligible          # Gate 1 — server allowlist (we own it)
      && optedIn           # Gate 2 — local toggle (the owner owns it), Phase 2+
      && !globallyKilled   # the flag's `enabled:false` + empty allowlist, or the account removed
```

- **Gate 1 — eligibility.** `resolveAllowlistFlag(raw, uid, false)` over `app_config.widget_enabled`. Ships dark (`{"enabled": false, "allowlist": []}`). Enable one account = add its uid (a recorded config UPDATE, no deploy). This also gates the **Settings row + page visibility** (Phase 2): the row renders iff eligible for ≥1 beta (an OR over beta flags; one flag today).
- **Gate 2 — opt-in.** A local preference, default off, flipped on the beta page (Phase 2). Being eligible does **not** turn anything on.

**The premium swap (D1, later, Track-3):** Gate 1's check changes from *"uid ∈ allowlist"* to *"isPremium OR uid ∈ allowlist"* (keep the allowlist for internal testers). **Gate 2, the page, and the widget do not change.** That single-predicate swap is the entire reason the gates are kept separate — do not entangle them.

**Phase transition, stated so it can't surprise us:** Phase 1 makes `live = eligible` (no opt-in yet). Phase 2 makes `live = eligible && optedIn`, opt-in default **off**. So when Phase 2 ships, a cohort user whose widget worked under Phase 1 **re-enables it once** on the beta page. That is intentional — it's the moment the self-serve program begins, and it matches the mock's "nothing on yet" landing state.

---

## §3 The scope cut (what we are deliberately NOT building)

- No RevenueCat, no `entitlements` table, no paywall wiring (D1).
- No server-side opt-in record / analytics in v1 (D4; the measurement plan is B-713 #4, gates Phase 2 scale, not Phase 1).
- No "request beta access" flow — eligibility is hand-managed in the DB (fine for dogfooding; the scale mechanism is B-713 #5).
- No second beta yet — the shelf is built to hold more (one card = one flag + one toggle), but only the widget ships.

---

## §4 Guardrails from the pre-mortem (B-713) — which bind which phase

### §4.1 The widget is un-hideable → presentable empty state is Phase-1 (D5)
Because iOS surfaces the widget in the gallery to anyone with the app, a non-cohort user (or an App Reviewer on the demo account) can add it. Today an ungated/no-data widget can render **"Sign in to start logging"** (`CulpritWidget.tsx:602-603`) — a lie for a signed-in owner, and it looks broken. **Requirement:** a signed-in owner with no published widget data must see a **neutral, honest** door, never the sign-in door, and nothing that reveals a beta program exists. This must be in the **submission binary** (PR 2).

**Also decide (PR 2):** the **App Review demo account** (B-271) — either add its uid to the `widget_enabled` allowlist so the widget renders complete for reviewers, **or** rely on the neutral empty door. Recommend: neutral empty door (keeps the beta invisible), and don't allowlist the review account.

### §4.2 Server-cost betas gate server-side too (D6)
The widget gates client-only and that's correct (§2). **Standing rule for beta #2+:** any beta that spends a server resource re-checks eligibility in the Edge Function (`supabase/functions/_shared/flags.ts` mirrors `resolveAllowlistFlag`) and rides the `ai_usage` caps. Do not copy the widget's client-only gate onto a server feature.

### §4.3 The Phase-2 scoping pass — RESOLVED 2026-08-08 (D7–D9)

The PM delegated this pass to the team. All four pre-mortem residuals (#3 graduation, #4 measurement, #5 scale, #6 taketh-away) are now decided; **Phase 2 (PR 3) is unblocked.** The through-line of all three rulings: **do not build ahead of the current scale.** The program today is one client-only beta and a hand-picked dogfood cohort (the PM's account); each ruling installs a *real but lightweight* rule now and defers the heavyweight infrastructure to the concrete trigger that will actually need it — with that infrastructure's guardrails written down so the trigger doesn't ship it unexamined.

Nothing here adds a user-facing surface, so no mock is owed (the PR-3 beta page keeps its round-1 mock; the registry's `owner`/`reviewBy` are internal metadata an owner never sees).

#### §4.3.1 Graduation / kill policy + per-beta owner & expiry (D7; folds in #6)

The "beta graveyard" forms when a shipped-dark feature has no owner and no forcing date, so nobody ever revisits it and it accretes as debt. The counter-force is a small registry with teeth, not a heavyweight process.

- **The `BETA_REGISTRY` is the single source of truth for the shelf** (built in PR 3 — it is the metadata the page needs to render one card per beta anyway, so the policy adds fields, not a structure). Each entry is typed and keyed on the `AllowlistFlagKey`:
  ```ts
  // lib/betaFeatures.ts — one entry per beta; the shelf maps over the eligible ones.
  interface BetaFeature {
    key: AllowlistFlagKey;   // the app_config eligibility flag (also the opt-in store key)
    title: string;           // card title (nyx-voice, PR 4)
    blurb: string;           // card sub-copy
    owner: string;           // the persona / track accountable for graduate-or-kill
    addedDate: string;       // ISO — when it joined the shelf
    reviewBy: string;        // ISO — the forcing date (see below)
    serverCost: boolean;     // true ⇒ D6 requires a server-side gate too (checkable, §4.2)
  }
  ```
  Widget entry at Phase 2: `{ key: 'widget_enabled', owner: 'Widget track / Eng', serverCost: false, … }`.
- **`reviewBy` is a *review-by date, not an auto-disable*.** On that date the owner must make an explicit call — the point is to force a decision, never to silently pull a working feature out from under the cohort (auto-kill optimises tidiness over the owner's experience, which is backwards). A beta past `reviewBy` with no decision is the exact thing the audit catches.
- **Three terminal states:**
  - **Graduate to GA** — the feature is done and leaves the shelf. Mechanically: flip the flag to `{"enabled": true}` (on for everyone) or delete the gate + flag + registry row. Per **FR-FLAG-5**, a beta is retired from the shelf **only** by a deliberate GA call, never silently.
  - **Kill** — the feature is abandoned: remove its code, its flag row (or `enabled:false` + empty allowlist — the existing kill-switch, §2), and its registry row.
  - **Extend** — a deliberate "keep dogfooding" with a fresh `reviewBy`.
- **Audit venue:** the **periodic process retro** (`docs/personas.md` §Periodic Process Retro) gains a **check #5 — beta-shelf audit:** for every registry entry past `reviewBy`, force graduate / kill / extend. This reuses an existing ritual instead of inventing a standing meeting, matching the state-file-hygiene check #4 pattern. _(Adding check #5 to `personas.md` is a Tier-2 edit — flagged for PM approval in the session summary, not written unilaterally.)_
- **Grandfather rule (#6 — "taketh away"):** when a beta graduates into a world where the program gates on Premium (D1/D9), a tester who *had* the feature keeps it — never paywall a care feature out from under someone who was using it (Pets > $, Principle 7). Implementation lands with the Track-3 premium gate (filed as its own backlog row so it is not lost at build time).

**FIRST GRADUATIONS EXERCISED — the two Signal betas (GA 2026-08-20, recorded at CUL-551).** The D7 policy above had its first real use: the PM called GA (2026-08-20, CUL-546) for **both** Signal betas at once, each reaching the **graduate** terminal state — the first betas to leave the shelf, and the first `reviewBy` dates **closed early** rather than lapsing to the audit.
  - **`signal_design_v2`** ("Signal redesign" / B-721) — `reviewBy` 2026-11-08 region, graduated ~11 weeks early. Retired via the "delete the gate + flag + registry row" mechanics: client render-path removed (GA-1, CUL-547, #690), the `BETA_REGISTRY` row removed (#690 — a comment left in `lib/betaFeatures.ts` records the removal), `app_config` flipped `{"enabled": true}` for continuity then the row deleted (CUL-549 / GA-4, CUL-551, migration 060).
  - **`signals_v2`** ("Deeper signals" / B-755) — `reviewBy` 2026-11-13 region, graduated early. Same mechanics (GA-2, CUL-548, #690 + GA-3 server-gate removal, CUL-550, #691 + row deletion, CUL-551, migration 060).
  - **What this validated:** the graduate path is a *deliberate PM call that retires the row*, exactly as specced — not an auto-disable, and the mechanism (the allowlist primitive, the opt-in store) survived untouched for the still-live betas (`widget_enabled`, `log_picker_v2`). One wrinkle worth recording for the next graduation: a beta whose engine gates **server-side** (`signals_v2` did, via B-777) adds a step the client-only betas don't have — the server gate must be **removed and redeployed** before the `app_config` row can be deleted, because a fail-closed server read of a missing row silently reverts the feature for everyone (`serverCost: true` betas inherit this ordering; §4.2's D6 rule is why it was caught). The `log_picker_v2` GA (FL-4) is client-only and can reuse the simpler shape.

#### §4.3.2 Measurement + consent plan (D8; resolves OPEN-3)

Ground truth that shapes this: **there is no analytics pipeline today** (B-016 error observability and B-047 Signal instrumentation are both Open — no events, no sink, no PII decision), and the app's whole posture is data-minimisation (Ask persists *no* question text, B-375; photos are transform-only; the vet report strips EXIF). A beta-telemetry pipeline would be a **new health-data-adjacent boundary — a T&S decision, not plumbing.** And the widget is near-unobservable by construction (iOS won't report whether it is on a home screen; the App-Group snapshot read is the only future proxy, and it is exactly the kind of thing that needs the T&S pass).

- **v1 measurement is qualitative, and that is the right tool at this scale.** You do not instrument a dozen dogfooders — you talk to them. The learning loop is a **feedback channel: reuse Settings → Support "Share feedback"** (this *is* the resolution of OPEN-3; a beta-specific channel waits for scale). Alongside it, two signals are **already server-visible for free**: the `widget_enabled` allowlist *is* the exact known cohort (we hand-maintain it), and for a *server-cost* beta the `ai_usage` rows *are* the usage trail (every gated call is already counted). The widget spends no server resource, so it has no such trail — which is the concrete reason its measurement is deferred, not free.
- **No new consent surface in v1.** The local opt-in toggle already *is* the consent to use the beta, and nothing is transmitted, so there is no second boundary to consent to. The Support feedback channel is owner-initiated (consent by initiation).
- **Keep opt-in local (D4 stands); do NOT mirror it server-side for measurement.** The one cheap quantitative signal would be the opt-in *rate*, obtained by mirroring the toggle to a per-account row — but D4 chose local-per-device deliberately (a per-device widget wants a per-device toggle), and mirroring it re-introduces exactly the health-data-adjacent boundary + consent question we are avoiding, to measure a dozen people we can simply ask. It also risks **bundling** "join the beta" with "we record your opt-in," which must never be one gate (the two-gates discipline, T&S).
- **Quantitative telemetry is a *rider on the scale decision (D9)*, in both its branches.** The premium path makes cohort membership server-visible via `entitlements`; the `beta_members` fallback makes it server-visible as a property of that table. So the quantitative signal arrives *with* the scale infrastructure, gated by that infra's T&S pass — building a separate beta-telemetry pipeline now is both premature and redundant. When it lands it inherits the standing bar verbatim (B-375/B-016/B-047): a **separate** consent from the opt-in, **data-minimised to non-health events** (counts/flags, never health-record content — the Ask boundary rule generalises), **owner-deletable**, and **folded into the B-039 deletion cascade**.

#### §4.3.3 Scale mechanism (D9)

The hand-edited `app_config` allowlist is **correct right now** and has a **hard ceiling that is a privacy limit, not an ergonomic one.** `fetchAppConfig` selects every `app_config` row for every signed-in client, so the *entire* `widget_enabled.allowlist` array — every beta tester's UUID — is downloaded and cached on every user's device (this is precisely why B-402 wipes that cache on sign-out: "the cache carries … a list of other people's user UUIDs, persisted on a device that may now be in someone else's hands"). At a dozen dogfooders this is bounded and accepted; at hundreds of "customers" it is an unbounded membership-leak in a global row. So:

- **Now (dogfood, ≤ ~25 UUIDs):** keep the hand-edited allowlist. Correct at this scale, zero infra. **Soft trip-wire ~25 internal testers** — past it, do not grow the array to hold customers; migrate. The D7 retro audit checks the array size against this ceiling.
- **Primary scale path — the premium check (`entitlements`).** This *is* the already-ratified **D1 Gate-1 swap** (§2): the predicate becomes `isPremium OR uid ∈ allowlist`. "Customers" then scale in **by being Premium** — read from the per-account, RLS-scoped `entitlements` table (server-read, no global array, no leak) — and the allowlist shrinks back to its right size (internal testers, bounded). This matches the PM's own part-4 framing ("customers, *maybe premium*, opt into beta features") and needs **no new beta-specific infrastructure** beyond Track-3, which is already planned. Gate 2, the page, and the widget do not move.
- **Conditional fallback — a `beta_members` table + join flow.** Built **only if** a concrete need for a *non-premium* cohort larger than the ceiling ever appears (a free open beta) — never speculatively (YAGNI: one beta, a dozen testers today). If built, it is the `entitlements` shape for betas: a per-account, RLS-scoped row (`user_id`, `beta_key`, `joined_at`, consent metadata), eligibility resolved against a per-uid read instead of a global array, plus a self-serve join surface. **`rls-privacy-reviewer` is mandatory** — it is a new access path. Filed as a backlog row so the option is not lost, but it is *not* on the Phase-2 path.

**Why not build `beta_members` now (the tempting over-build):** it is the "clean, scalable" answer, but it solves a problem the program does not have yet (customer-scale, non-premium), at the cost of a migration + RLS + a join UI + a privacy review, for one client-only beta and a cohort we can name individually. The premium path already covers the customer case the PM actually described. Build the fallback when a free-open-beta need is real, not before.

---

## §5 The PR plan

Phase 1 = PRs 1–2 (+ the enablement step). Phase 2 = PRs 3–4. Phase 3 = deferred. Each PR is independently shippable; schema is isolated per CLAUDE.md.

### PHASE 1 — Widget behind the eligibility flag (protects the submission)

#### PR 1 — Seed the `widget_enabled` flag (schema PR, ships dark)
- **File:** `supabase/migrations/054_widget_config.sql` (re-check the next free number at build — 053 is highest as of 2026-08-06; a sibling may take 054).
- **What:** one `app_config` row, exact 037 template:
  ```sql
  INSERT INTO app_config (key, value) VALUES
    ('widget_enabled', '{"enabled": false, "allowlist": []}'::jsonb)
  ON CONFLICT (key) DO NOTHING;
  ```
- **Client registration (same PR — it's not schema, but it's the tiny wiring the migration is useless without, and it touches no other feature):** add `'widget_enabled'` to `ALLOWLIST_FLAG_KEYS` and `widget_enabled: undefined` to `ALLOWLIST_FLAGS_UNSET` in `lib/appConfig.ts`. This propagates through `extractAllowlistFlags` / `coerceAllowlistFlags` automatically. _(If the reviewer prefers strict schema-only isolation, split the `appConfig.ts` two-line change into PR 2 — either is fine; keeping them together makes PR 1 self-verifying.)_
- **Migration Safety Pre-flight:** Destructive **n** (additive, one seed row). Rollback `DELETE FROM app_config WHERE key = 'widget_enabled';`. Backfill N/A. Affected table `app_config` (INSERT only); pre-check `SELECT key FROM app_config WHERE key='widget_enabled';` → expect 0 rows.
- **Apply:** via Supabase MCP `apply_migration`, then `get_advisors`. Ship dark — changes nothing an owner sees.
- **Tests:** the existing `lib/appConfig` tests already exercise the resolver; add/confirm a case that `widget_enabled` extracts + resolves fail-closed when unset.
- **Gates:** code-reviewer. **DoD:** tests pass; no anti-patterns; migration preflight complete.

#### Enablement step (config UPDATE, after PR 1 merges — NOT a migration, NOT baked into the seed)
The seed ships empty on purpose (037 lesson: a re-applied seed must not reset a live allowlist). To turn the widget on for the PM's account:
1. Resolve the PM's auth uid: `SELECT id FROM auth.users WHERE email = '<PM email>';` (via Supabase MCP `execute_sql`).
2. `UPDATE app_config SET value = jsonb_set(value, '{allowlist}', '["<uid>"]'::jsonb) WHERE key = 'widget_enabled';`
3. Verify: re-`SELECT`, confirm the uid is present. A recorded, reversible config write — no deploy.

#### PR 2 — Gate the publish + presentable empty state (the submission-safe piece)
- **Files:** `hooks/useWidgetSnapshots.ts` (the gate — the choke point), `lib/widgetSnapshot.ts` / `lib/widgetProps.ts` / `lib/widgetBridge.ts` (the neutral-empty publish helper), and — for the dedicated door — `widgets/CulpritWidget.tsx` + `widgets/CulpritWidget.test.ts`.
- **The gate (OTA-able — app-process JS):**
  - In `useWidgetSnapshots`, read `const widgetEligible = useAllowlistFlag('widget_enabled');` and add it to the effect deps (`[session, widgetEligible]`).
  - Eligible → publish as today.
  - Not eligible → do **not** publish real data: `clearWidgetData()` (drop snapshot files) **and** publish a **neutral signed-in-empty** timeline — `buildWidgetProps({ index: <empty>, snapshots: {}, signedIn: true })` — so the added-widget shows the existing **"No pet in this slot yet"** door, **not** the "Sign in" door (`clearWidgetTimeline` pushes `signedIn:false`, which is the lie — do not use it here). This is the §4.1 requirement, met OTA.
- **The dedicated door (native — rides the next build; put it in the submission cut):** optionally add a purpose-built neutral state to `CulpritWidget.tsx` (e.g. *"Open Culprit"* / *"Nothing to show here yet"*) rather than reusing "No pet in this slot yet". Any `CulpritWidget.tsx` change is stringified into the native extension → **requires a native build, not OTA**, and bumps `WIDGET_PROPS_SCHEMA_VERSION` (2→3, kept in lockstep with the extension's `EXPECTED_SCHEMA_VERSION`) only if the props shape changes; a copy-only door needs no bump. Covered by the JSC-eval test (`CulpritWidget.test.ts`).
- **Kill/removal safety:** removing an account from the allowlist (or `enabled:false`) flips `widgetEligible` false → the same not-eligible path clears + neutralizes. Note the client caches `app_config` (`useAppConfig` refresh on foreground/sign-in), so a kill isn't instant and a home-screen widget shows its last snapshot until the app next runs — acceptable, documented (B-713 ops footgun).
- **Tests (B-713 QA — CI won't test the flag-on path unless we add it):** a `useWidgetSnapshots` test asserting eligible → publishes real data; not-eligible → clears + publishes signed-in-empty (never `signedIn:false`). If the dedicated door lands, the JSC-eval test covers its render.
- **Gates:** code-reviewer; on-device pass (add + remove the widget as an eligible and a non-eligible account; confirm no "Sign in" door for a signed-in owner). **DoD:** flag-on path tested; empty-state honest; OTA vs native split called out in the PR body.

**End of Phase 1:** the widget publishes only for cohort accounts; a non-cohort/added widget shows an honest neutral door; the submission is safe to cut. **Land PR 1 + PR 2 before the submission TestFlight build** (the door fix must be in that binary).

### PHASE 2 — The Beta features shelf (self-serve) — gated on the §4.3 scoping pass

#### PR 3 — The beta page + the opt-in preference
- **New:** `app/settings/beta.tsx` (structure copied from `app/settings/notifications.tsx`: `SafeAreaView` → `Header title="Beta features" leading="back"` → `ScrollView` → cards). One card per eligible beta: `SettingsRow` + RN `<Switch>` in the `trailing` slot (the notifications idiom — no new component). Widget card: title + a "Beta" pill, sub copy, the switch, and the on-state "add it to your home screen" hint (see mock).
- **Beta registry (D7) — build this; it is the shelf's single source of truth:** define `BETA_REGISTRY: BetaFeature[]` in `lib/betaFeatures.ts` (shape in §4.3.1 — `key`/`title`/`blurb`/`owner`/`addedDate`/`reviewBy`/`serverCost`). The page maps over the entries that are *eligible* (`useAllowlistFlag(entry.key)`), rendering one card each; the widget is the only entry in v1. This makes "one card = one flag" structural (not hand-coded per card) and gives the D7 graduation audit + the D6 server-cost rule something to grep. Add a unit test asserting every `serverCost: true` entry has a matching server gate (none in v1 — the test documents the D6 rule for beta #2).
- **Opt-in store (D4):** a small local pref (`lib/betaFeatures.ts`, alongside the registry — an AsyncStorage-backed Zustand store, or extend an existing prefs store), default off, per feature key. **Add its AsyncStorage key to `wipeLocalSession`** (CLAUDE.md wipe rule — account state outside SQLite must be wiped).
- **Feedback channel (D8):** none new — the page does **not** add telemetry or a bespoke feedback prompt; feedback rides the existing Settings → Support "Share feedback" row (OPEN-3 resolved). No consent surface (the opt-in toggle is the consent; nothing is transmitted).
- **Settings hub:** in `app/settings.tsx`, add a "Beta features" `SettingsRow` in the **Preferences** card (after Notifications), rendered **iff eligible for ≥1 beta** (`useAllowlistFlag('widget_enabled')` today). Optional "N on" trailing count (OPEN-2). Register `settings/beta` in `app/_layout.tsx`'s Stack (alongside `settings/notifications`).
- **Rewire the publish condition:** `useWidgetSnapshots` publishes iff `eligible && optedIn` (§2 phase transition — cohort re-enables once).
- **Tests:** the opt-in store (default off; set/clear; wiped on sign-out); the updated `useWidgetSnapshots` condition.
- **Gates:** code-reviewer; **pm-feature-review** (the legibility read); on-device.

#### PR 4 — Copy / voice / safety pass
- **nyx-voice** over every string (page intro, beta pill, hint, empty states, the honesty line — warm, honest, reversible, no exclamation).
- **pm-feature-review** on the full flow as Jordan/Sam.
- Resolve OPEN-1 (name), OPEN-2 ("N on"), OPEN-3 (feedback channel) here.
- **Gates:** nyx-voice, pm-feature-review, Designer.

### PHASE 3 — Premium gating (deferred, Track-3)
The one-line Gate-1 predicate swap (§2), when RevenueCat + `entitlements` land. Not planned in detail here; a single row until Track-3 is live. Carries the B-713 #6 "taketh away" rule.

---

## §6 Per-PR kickoff prompts

- **PR 1:** "Ship Beta Features PR 1 — seed `app_config.widget_enabled` = `{"enabled":false,"allowlist":[]}` (migration `054_widget_config.sql`, own PR, 037 template + safety preflight) and register `widget_enabled` in `ALLOWLIST_FLAG_KEYS`/`ALLOWLIST_FLAGS_UNSET` in `lib/appConfig.ts`. Apply via MCP + `get_advisors`. Read `docs/nyx-beta-features-requirements.md` §5 PR 1."
- **Enablement:** "Enable the widget beta for my account — resolve my auth uid from `auth.users` and `UPDATE app_config.widget_enabled`'s allowlist to include it (recorded config UPDATE, not a migration). §5 enablement step."
- **PR 2:** "Ship Beta Features PR 2 — gate the widget publish on `useAllowlistFlag('widget_enabled')` in `hooks/useWidgetSnapshots.ts`; not-eligible → clear + publish a signed-in-empty state (never the 'Sign in' door). Add the flag-on/off test. Decide the demo-account handling. Read `docs/nyx-beta-features-requirements.md` §4.1 + §5 PR 2. Call out OTA (the gate) vs native build (any `CulpritWidget.tsx` door change) in the PR body; the door fix must be in the submission binary."
- **PR 3:** "Ship Beta Features PR 3 — `app/settings/beta.tsx` (copy of notifications.tsx) + the `BETA_REGISTRY` + local opt-in store in `lib/betaFeatures.ts` (default off, wiped in `wipeLocalSession`) + the Preferences row (eligible-gated) + route registration; rewire `useWidgetSnapshots` to `eligible && optedIn`. First read `docs/nyx-beta-features-requirements.md` §5 PR 3 and the §4.3 scoping outcome (D7–D9): build the registry (owner/reviewBy/serverCost), reuse Support for feedback (no telemetry/consent surface), no `beta_members` (allowlist stays)."
- **PR 4:** "Beta Features PR 4 — nyx-voice + pm-feature-review pass; resolve the name / 'N on' / feedback-channel open items."

---

## §7 Testing & DoD notes

- **Flag-on paths are tested explicitly** (B-713 QA): the eligible and not-eligible `useWidgetSnapshots` branches, and the opt-in store. CI does not exercise a flag's on-state unless the test sets it.
- **No new secret** (reuses `app_config`, no key).
- **T&S:** the opt-in pref is wiped on sign-out; eligibility resolves per-uid and fails closed; no health data crosses a new boundary; no analytics added in v1.
- **Adversarial review:** N/A — no clinical/statistical logic. `rls-privacy-reviewer`: not required (no new access path to health data; the widget already reads the owner's own local record, unchanged).

---

## §8 Open items (carry to the build)

1. **Name** — **RESOLVED (PR 4, 2026-08-09) — "Beta features"** (team recommendation; PM may override before submission). See §0 OPEN-1.
2. **"N on" count** — **RESOLVED (PR 4, 2026-08-09) — shipped, minimal** (accent-ink trailing note, eligible ∧ opted-in, hidden at 0). See §0 OPEN-2.
3. **Feedback channel** — **RESOLVED by D8 (2026-08-08) — reuse Settings → Support "Share feedback".** See §0 OPEN-3.
4. **Demo-account handling** for App Review (PR 2; recommend: neutral empty door, don't allowlist the review account).
5. **§4.3 scoping pass — RESOLVED 2026-08-08 (D7–D9), Phase 2 unblocked.** Graduation policy (D7 §4.3.1), measurement/consent (D8 §4.3.2), scale mechanism (D9 §4.3.3). The genuinely-deferred *builds* — a `beta_members` table + join flow (B-722), beta telemetry + its T&S pass (B-723), the grandfather-at-premium-graduation rule (B-724) — are filed as their own backlog rows, triggered by scale, and are **not** Phase-2 blockers. One Tier-2 edit flagged: `personas.md` retro check #5 (the beta-shelf audit).
