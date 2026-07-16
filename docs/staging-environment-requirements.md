# Staging Environment — Requirements & Execution Plan

**Version:** 1.0 | **Date:** 2026-07-16 | **Status:** Build-ready pending PM ratification of D1–D3 (D4/D5 are workflow recs)
**Backlog:** B-353 (schema replay) · B-354 (edge deploy tooling) · B-355 (client env wiring) · B-356 (smoke + adoption) · B-357 (future: staging app variant)

---

## 1. Why

Today there is **one** Supabase project (`aigchluqluzuhtbfllgh`) and everything points at it: all three `eas.json` build profiles, `.env.local`, `scripts/deploy-edge.sh`, the deploy runbook, and every MCP `apply_migration` / `deploy_edge_function` call. Every migration is a **live write to the database holding the PM's real pet data**; every Edge Function deploy replaces the code the PM's phone calls. The workflow is build → test on Expo Go (against prod) → deploy to prod.

That was the right call at prototype scale. It is not the right posture for an App Store app:

- **Migrations are the highest-blast-radius action in the repo** (CLAUDE.md's own words) and currently have no rehearsal stage.
- **Pre-submission config flips** (`paywall_enabled=false`), **email-confirm ON** (B-152), and the **demo-account seed** (B-271) all need a place to be exercised that isn't production.
- **Step 9 PR 6** (the public share-token route — the first deliberately unauthenticated path to pet health data) should be attacked on staging before it exists in prod.
- Real pet data + the PM's own photos are currently the test substrate for every risky change (Trust & Safety flag).

This spec adds **one staging environment** (stage + prod). Dev/stage/prod is a future extension (§8), not this build.

The app-store-submission-guide has no environments step; this track is an addendum to it.

## 2. Current state — every place "prod" is wired

| Touchpoint | Where | Notes |
|---|---|---|
| Client env (Runtime B / Metro) | `.env.local` → `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY`, inlined at Metro start | `lib/supabase.ts` fails fast on missing/placeholder values — a clean seam |
| EAS build profiles | `eas.json` — `development`, `preview`, `production` all carry the prod URL + anon key | The PM's TestFlight daily driver is channel `preview` |
| EAS Update (Runtime A) | `eas update --branch preview` — env is inlined **at publish time from the local shell** | ⚠️ Footgun: see §9.1 |
| Edge Function deploys | `scripts/deploy-edge.sh` + MCP `deploy_edge_function(project_id="aigchluqluzuhtbfllgh")` | 6 functions: `generate-signal`, `generate-report`, `extract-food-from-photo`, `extract-medication-from-photo`, `analyze-vomit`, `delete-account` |
| Migrations | MCP `apply_migration(project_id="aigch…")` — a live prod write | 31 files on disk; history table sparse (17 legacy dashboard-pastes unrecorded); **two files share number 018** |
| Storage buckets (dashboard-created) | `nyx-pet-photos`, `nyx-food-photos`, `nyx-medication-photos`, `nyx-event-attachments`, `nyx-vet-attachments`, `nyx-vet-reports` | Must be created via dashboard UI, never SQL (the 42501 owner-null landmine) |
| Edge Function secrets | `ANTHROPIC_API_KEY` via `supabase secrets` | `SUPABASE_SERVICE_ROLE_KEY` is auto-injected per project |
| Auth config (dashboard) | Email confirm currently OFF; site/redirect URLs | Not captured in migrations |
| Seeded/global data | `app_config` (migration 030 seeds; live values may drift by design), `food_items` global catalog | Staging needs its own copies |

## 3. Decision record

### D1 — Separate Supabase project, not Supabase branching. **Dir. of Engineering recommendation; PM to ratify.**

Both are available (org is on Pro) and cost the same (~$10/mo project vs $0.01344/hr ≈ $9.80/mo persistent branch — verified via MCP `get_cost`, 2026-07-16). The Dir. of Eng. recommends a **dedicated staging project** because:

1. **Our migration history is dishonest to branching.** Branch create/merge semantics lean on the recorded migration history; 17 of our 31 migrations were dashboard-pasted and never recorded. A branch would not faithfully reproduce prod, and `merge_branch` back to prod would be untrustworthy.
2. **Branching doesn't cover the config that bites us.** Storage buckets, auth settings, and secrets are exactly the dashboard-side state that has caused past incidents (the bucket-RLS landmine); a separate project forces us to enumerate and mirror them once, explicitly.
3. **Full isolation is the point.** Separate auth users, storage, logs, secrets, and rate/usage counters — staging incidents can't touch real data by construction.
4. **The replay is a hidden win.** Rebuilding the schema from `supabase/migrations/` proves the repo is the source of truth — which is also our disaster-recovery story. Any replay break is a real repo bug found early.
5. It generalizes cleanly to dev/stage/prod later; branching would have to be re-litigated.

### D2 — Environment mapping. **PM to ratify (workflow-shaped).**

| Surface | Today | Proposed |
|---|---|---|
| Runtime B (Metro + tunnel, per-push QA) | `.env.local` → prod | Explicit npm scripts: **`npm run start:staging`** / **`npm run start:prod`** (each sources its own env file and clears cache). `.env.local` remains a manual override. Real-data QA (e.g. Signal on Nyx's live history) stays a deliberate `start:prod`. |
| `eas.json` `development` profile (dev client) | prod | **staging** |
| `eas.json` `preview` (TestFlight — PM's daily driver, real data) | prod | **prod, unchanged** |
| `eas.json` `production` (App Store) | prod | prod |
| Runtime A (`eas update --branch preview`) | prod, env implicit from shell | prod via a guarded **`npm run update:prod`** (§9.1) |

Rationale: the PM's TestFlight app is effectively their production instance (real pet data) — it must never silently repoint. Staging is reached through Metro (cheap, per-push) and, later, an optional dedicated staging build (B-357).

### D3 — Second Anthropic API key for staging. **PM to ratify (it's their Anthropic console).**

Create a second key named `culprit-staging` and set it as staging's `ANTHROPIC_API_KEY`. Cost attribution stays clean (staging experiments never muddy the prod cost picture that D-M7's caps were sized against), and a leaked/burned staging key is revocable without touching prod. Reusing the prod key works but loses both properties. Five minutes in the Anthropic console.

### D4 — Auth/dashboard config: parity first, divergence second. (Workflow rec, no ratification needed.)

Staging launches configured to **match prod** (email confirm OFF, same bucket privacy). Only after the smoke test passes does staging start *leading* prod: email-confirm ON rehearsal (B-152), pre-submission flag flips, etc. Parity before divergence keeps the first end-to-end test interpretable.

### D5 — Staging-first deploy rule. (Engineering hard-constraint candidate; adopt at B-356.)

Once staging is live:
- **Migrations: always staging-first.** `apply_migration` to staging → verify (`get_advisors`, targeted SELECTs) → then prod. No exceptions — this is the blast-radius item.
- **Edge Functions: staging-first by default.** It's one extra MCP call. A prod-only hotfix is allowed at Engineer discretion when staging is broken/blocked, recorded in STATUS.md.
- **Every MCP call names its `project_id` explicitly** — never "the default project." The runbook gains a two-ref table; prod deploys follow the runbook checklist.

## 4. Target architecture

```
                    ┌─ staging ──────────────────────┐   ┌─ prod ─────────────────────────┐
                    │ Supabase project culprit-staging│   │ aigchluqluzuhtbfllgh           │
                    │ own DB / auth / storage / logs  │   │ real pet data                  │
                    │ ANTHROPIC_API_KEY=staging key   │   │ ANTHROPIC_API_KEY=prod key     │
                    └────────────▲───────────────────┘   └───────────▲────────────────────┘
  npm run start:staging ────────┘                                    │
  eas build --profile development ┘                                  │
                                        npm run start:prod ──────────┤
                                        TestFlight (preview channel) ┤
                                        App Store (production) ──────┘
```

Deploy flow for any backend change: `deploy to staging → verify → deploy to prod`, both via the same MCP calls with different `project_id`.

## 5. Step-by-step execution plan

Total: ~30 min of PM dashboard work + 3 Claude Code sessions + a 15-min on-device smoke. **Steps 3 and 5 are parallelizable** (disjoint files); Step 4 follows Step 3.

### Step 1 — PM, offline (~10 min): create the staging project
1. Supabase dashboard → same org (`danieljmarkii's org`) → **New project**.
2. Name: **`culprit-staging`**. Region: **us-east-1** (match prod). Compute: **Micro** (default).
3. Database password: generate strong, store in your password manager (never needed by the repo).
4. **Cost: $10/mo** (the second Pro project consumes compute credit beyond the included instance). The project can be paused from the dashboard if it's ever idle long-term.
5. Nothing to record manually — the session in Step 3 reads the new ref + anon key via MCP.

### Step 2 — PM, offline (~20 min): dashboard-only config parity
Things only the dashboard can do (the landmine list):
1. **Create all six buckets via the dashboard UI** (never SQL — the 42501 owner-null landmine): `nyx-pet-photos`, `nyx-food-photos`, `nyx-medication-photos`, `nyx-event-attachments`, `nyx-vet-attachments`, `nyx-vet-reports`. Mirror each bucket's **Private/Public setting from prod** (check prod's Storage page side-by-side; expected: all Private).
2. **Anthropic key** (per D3): Anthropic console → new key `culprit-staging` → staging dashboard → Edge Functions → Secrets → add `ANTHROPIC_API_KEY`.
3. **Auth parity** (per D4): Authentication → Sign In / Up → confirm **email confirmation OFF** (matches prod today); leave site/redirect URLs default unless prod has custom values (check side-by-side).

### Step 3 — Claude session: migration replay + schema parity audit (B-353)
Applies the 31 on-disk migrations to staging in order via MCP `apply_migration` (recorded history from row one — staging's history will be *honest*, unlike prod's), fixes anything that breaks replay (repo bugs worth finding), and proves parity. Includes the **duplicate-018 renumber** (rec: `018_feeding_arrangements.sql` → `018b_…` to keep lexical order without cascading renames — build-time call). Seeds `app_config` to **live prod values** (not the migration defaults) and optionally copies the global `food_items` catalog (non-PII). Ships one PR (renumber + any replay fixes + parity report).

> **Kickoff prompt:**
> Read `docs/staging-environment-requirements.md` and execute **Step 3 (B-353)** — migration replay + schema parity audit. The staging project `culprit-staging` exists with buckets/secrets/auth configured (Steps 1–2 done). Find its project ref via MCP `list_projects`. First fix the duplicate migration numbering (two files are `018_*`), then apply all on-disk migrations to **staging only** in order via `apply_migration`, fixing any replay breaks in the repo as you go. Then prove parity: `list_tables` + `generate_typescript_types` diffed against prod, `get_advisors` (security + performance) clean, RLS on every `pet_id` table. Seed `app_config` to match **live prod values**, and copy the global `food_items` catalog rows from prod (they're global/non-PII). Do NOT write anything to prod. One PR: the renumber + replay fixes + a parity report in the PR description.

### Step 4 — Claude session: Edge Functions to staging + deploy tooling/runbook (B-354)
Parameterizes the deploy path by environment and deploys all six functions to staging. Updates `docs/edge-deploy-runbook.md` (two-ref env table, staging-first rule per D5), CLAUDE.md (Secrets Register staging rows; D5 under the engineering constraints), and `scripts/deploy-edge.sh` (env-aware output).

> **Kickoff prompt:**
> Read `docs/staging-environment-requirements.md` and execute **Step 4 (B-354)** — Edge Functions to staging + deploy tooling. B-353 (schema parity) is done. Deploy all six Edge Functions to the staging project via the runbook path (`scripts/deploy-edge.sh` bundle → MCP `deploy_edge_function`, `verify_jwt=true` preserved, sha read-back + clean-4xx boot smoke each — the smoke-test curl needs staging's URL + anon key via `get_publishable_keys`). Verify the staging `ANTHROPIC_API_KEY` is live (e.g. `generate-signal` degrades to templates if unset — check `get_logs`). Then codify: update `docs/edge-deploy-runbook.md` with the staging/prod project-ref table, the D5 staging-first rule, and the §10.4 prod promotion checklist; update `scripts/deploy-edge.sh` to name both refs in its printed instructions, and update CLAUDE.md's Secrets Register with the staging rows. One PR.

### Step 5 — Claude session: client env wiring (B-355) — parallel with Step 3
The client-side seam: env files + scripts + `eas.json`.

> **Kickoff prompt:**
> Read `docs/staging-environment-requirements.md` and execute **Step 5 (B-355)** — client env wiring, per decision D2. Add `.env.staging` + `.env.production` example convention (gitignored real files, committed `.example` templates; staging values come from MCP `list_projects` + `get_publishable_keys`), npm scripts `start:staging` / `start:prod` (each sources its env file and runs `npx expo start -c --tunnel`), and a guarded `update:prod` script that pins prod env for `eas update` (see spec §9.1 — an `eas update` run from a staging-pointed shell must never be able to ship staging config to TestFlight). Repoint the `eas.json` `development` profile at staging; `preview` and `production` stay prod. Update `.env.example` and `docs/dev-handoff-runbook.md` (each handoff now names which env to start). One PR. Do not touch `supabase/`.

### Step 6 — PM on-device (~15 min): end-to-end staging smoke

```
### Manual QA — staging environment
1. `npm run start:staging`, scan QR in Expo Go → Landing renders (staging reached; fail-fast guard passed)
2. Create a fresh account (fake email) → onboarding completes → a NEW user appears in the STAGING dashboard's Auth page, and NOT in prod's
3. Onboard a test pet, log a meal + a vomit event with a photo → photo upload succeeds (bucket + RLS parity proven — this was the 42501 failure mode)
4. Food photo capture → AI extraction returns real fields (staging ANTHROPIC_API_KEY + extract-food-from-photo live)
5. Pull-to-refresh Home → Signal zone reaches `no_pattern`/building state without error (generate-signal boots against staging schema)
6. Prod check: open the prod dashboard → no new users, no new rows in events/pets from this session
7. `npm run start:prod`, reload → your real pets render (prod path unbroken)
```

### Step 7 — Adopt (B-356, rides Step 6's session or the next wrap)
- D5 goes into CLAUDE.md's engineering hard constraints (if not already via Step 4).
- The submission guide gains an environments section referencing this doc.
- Synergies begin (§7).

## 6. Cost

**$10/mo** for the staging project (verified via MCP `get_cost` against the org, 2026-07-16). One new Anthropic key (usage-billed as today; staging usage is small and now separately attributable). No other new spend — EAS, ngrok, Apple unchanged.

## 7. What this unlocks (planned synergies)

| Item | How staging serves it |
|---|---|
| B-271 demo account | The Cooper seed script gets developed + verified on staging before it ever runs against prod |
| B-152 email-confirm ON | Rehearsed on staging first (auth config divergence with a rollback story) |
| Pre-submission flips (`paywall_enabled=false`) | Rehearsed on staging, then applied to prod as a recorded change |
| Step 9 PR 6 (public share-token route) | The first unauthenticated path gets `rls-privacy-reviewer`'s attacks run against staging, not the DB with real data |
| Migration discipline | The Safety Pre-flight gains a real rehearsal stage; staging's migration history is honest from day one |
| Disaster recovery | Proven: the repo's migrations reconstruct the schema from zero |

## 8. Out of scope (future)

- **Dev environment** (dev/stage/prod): add a third project later; everything in this spec parameterizes cleanly.
- **B-357 — staging app variant:** a separate bundle ID (`com.projectnyx.app.staging`) via `app.config.ts` + `APP_VARIANT` so a staging build installs side-by-side on the PM's phone (TestFlight or dev client). Deliberately deferred — Metro covers staging QA today, and this interacts with the CNG/dev-client Open Question (2026-07-10).
- **CI-gated deploys:** there is no server CI today; automated staging deploys on merge are a post-submission conversation.
- **Backfilling prod's 17 unrecorded legacy migration rows** — still the deferred PM call from the runbook; staging makes it less urgent (staging's history is the honest one).

## 9. Risks & gotchas

### 9.1 The `eas update` env footgun (the one that could hurt)
`EXPO_PUBLIC_*` values are inlined **at publish time from the local shell/env files** when running `eas update`. If a Codespace is pointed at staging and the PM runs `eas update --branch preview`, the **TestFlight app silently repoints to staging** — the PM's daily driver loses its real data view and starts writing to staging. Mitigation (Step 5): all Runtime A publishes go through `npm run update:prod`, which pins prod env explicitly; the dev-handoff runbook stops mentioning bare `eas update`.

### 9.2 Migration replay breaks
Expected, not feared: the two 018s, any dashboard-era DDL that a file assumes (e.g. policies referencing buckets — mitigated by creating buckets in Step 2 first), ordering deps. Every break found is a repo bug fixed while stakes are zero.

### 9.3 Wrong-project MCP calls
Two live refs exist after Step 1. Guardrails: D5's explicit-`project_id` rule, the runbook's two-ref table, and the convention that **prod writes happen only inside the runbook checklist**. The asymmetry is deliberate: defaulting to staging means a mistake hits the env with no real data.

### 9.4 Config drift between envs
Dashboard-side config (buckets, auth toggles) is mirrored by hand and can drift. Accepted at this scale; the parity checklist in §2/Step 2 is the source of truth, and any deliberate divergence (B-152 rehearsal) is recorded in STATUS.md.

## 10. The day-to-day deploy lifecycle (how deploys change)

The current workflow is *build → test on Expo Go (against prod) → deploy to prod*. With staging live, the lifecycle depends on what kind of change the PR carries. One property makes all of this work: **the client env selects the whole backend.** Expo Go pointed at staging (`start:staging`) calls staging's Edge Functions, staging's database, staging's buckets — there is no cross-wiring, because every backend call goes through the one baked-in Supabase URL.

### 10.1 Client-only PR (most PRs — UI, stores, copy)

| | Today | After staging |
|---|---|---|
| Build | branch + PR | unchanged |
| On-device QA (Runtime B) | Metro + tunnel against **prod** (real data is the test substrate) | **`npm run start:staging`** against seeded/fake data — the default QA substrate. A **read-only** real-data pass (e.g. "does the Signal render right on Nyx's real history?") stays available as a deliberate `npm run start:prod`. |
| "Deploy" | merge | merge — client JS reaches phones only via Runtime A later; nothing else to do |

Net change: one word in the Dev Handoff (`start:staging` instead of `npx expo start --tunnel`). Handoffs name the env explicitly from B-355 on.

### 10.2 Backend PR (Edge Function and/or migration) — the flow that really changes

Today the session deploys straight to prod mid-build, then QA happens against prod. New flow (D5):

1. **Build session → staging deploy.** Migration (if any): `apply_migration` → **staging** → `get_advisors` → verify. Function (if any): bundle → `deploy_edge_function` → **staging** → sha read-back + boot smoke. (Work-branch deploys to staging are always fine — that's what staging is for.)
2. **On-device QA against staging.** `npm run start:staging` — the staging client exercises the staging function against the staging schema end-to-end. The Manual QA Script in the handoff targets staging.
3. **Merge** the PR.
4. **Promote to prod** — the checklist in §10.4, from merged `main`.

Data-dependent backend work (Signal detection lanes) still gets its primary verification from the offline test fixtures, as today; staging QA proves boot/wiring, and a lane that only Nyx's real history exercises is verified read-only on prod post-promotion. A prod→staging anonymized-timeline clone tool (seeding staging with a real pet's shape, via `scripts/export-pet-timeline.sql`) is logged as **B-358** for when fixtures aren't enough.

### 10.3 Config flips (`app_config`, auth toggles)

Rehearse on staging (flip → observe the client state via `start:staging`) → apply to prod → record in STATUS.md. This is exactly the pre-submission `paywall_enabled=false` path.

### 10.4 The prod promotion checklist (the new ritual)

Runs after merge, per backend-touching PR (or batched at a natural point for low-risk changes — Engineer's call, recorded either way):

1. PR merged to `main`; staging already verified (steps 1–2 above).
2. Migration → `apply_migration` to **prod** → `get_advisors` → verify. *(Migrate-before-deploy gate, as today.)*
3. Function → bundle from `main` → `deploy_edge_function` to **prod** (`verify_jwt` preserved) → sha read-back + clean-4xx boot smoke.
4. Config flips applied + recorded.
5. `npm run start:prod` → golden-path smoke of the changed surface.
6. STATUS.md records the promotion (versions bumped, verified).

### 10.5 Where Expo Go and TestFlight sit

- **Expo Go / Metro (Runtime B)** stays the per-push QA runtime — it just gains an env switch. Staging by default, prod deliberately.
- **TestFlight (Runtime A)** is unchanged in cadence and **stays a prod client, full stop**. It is the release-candidate surface, not a staging surface: cut a build / publish OTA (via the guarded `npm run update:prod`) when a body of merged work warrants it, exactly as today. A staging TestFlight variant is B-357, deliberately deferred.
- **The one new hard rule for Runtime A:** never publish an OTA update whose client code depends on a migration or function that hasn't been promoted to prod yet (§10.4 before `update:prod`). In the Metro world you control both ends; an OTA update goes to a device you don't babysit.

### 10.6 The shape at a glance

```
build PR ──► deploy backend to STAGING ──► QA on-device via start:staging ──► merge
                                                                                │
                              (backend PRs) promote to PROD (§10.4 checklist) ◄─┘
                                                    │
       (when a release is warranted) TestFlight: eas build / npm run update:prod
```

Client-only PRs skip the promotion box; config flips are §10.3. The extra cost per backend PR is one more MCP deploy call and a checklist — the win is that nothing reaches the database with real pet data un-rehearsed.
