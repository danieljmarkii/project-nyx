# Notification foundation PR 2 — `notification_preferences` schema + local mirror

**Date:** 2026-08-02
**Shipped via #564** (B-661 PR 2, Notification Foundation Part 1).

## What shipped

The per-account **preferences substrate** for every future notification workflow — the D4 "server table + local mirror" half of the notification foundation. Pure infrastructure: **no UI, no user-visible change**. The write path (settings toggles) is PR 3 and the daily-summary consumer is PR 4; both consume what this ships.

- **Migration `050_notification_preferences.sql`** — the table + partial-unique pair + `set_updated_at` trigger + RLS + grants. Applied live via the Supabase MCP; `get_advisors` clean for the table.
- **Migration `051_notification_preferences_pet_scope.sql`** — the `pet_id` ownership trigger, added after the gate reviews (see below). Applied live; functionally verified.
- **Local mirror `lib/notificationPreferences.ts`** — `NOTIFICATION_SCHEMA_SQL`, the row shape, the push-queue SQL, and `notificationPreferenceRowToRemote(row, userId)`. The `dietTrialMirror` shape.
- **Wiring** — `initDb` runs the DDL (`lib/db.ts`); the table is in `LOCAL_WIPE_TABLES` (`lib/hydration.ts`) and `SYNC_QUEUES` (`lib/syncQueue.ts`); both test schema-source lists updated so the B-424/B-398 fail-closed guards cover it. Bidirectional sync in `lib/sync.ts` (`syncPendingNotificationPreferences` push + `hydrateNotificationPreferences` LWW pull, both wired into the cycle).
- **Tests** — `lib/notificationPreferences.test.ts` (DDL round-trip incl. G6 off-default, INTEGER↔BOOLEAN coercion, verbatim wall-clock preservation, the deliberate absence of a local unique/FK, the quarantine push-queue filter, and the mapper's key-set completeness + `user_id` stamp + local-only-column exclusion).

## Decisions made (all documented in-file)

- **Account-scoped (`user_id`), not pet-scoped.** The first account-scoped synced table in the repo — every prior one scopes by `pet_id → pets`. A notification is an account-level decision (D3: one notification per account across all pets). `pet_id` is **nullable — NULL = account-wide**, the whole v1 shape; the per-pet row is a reserved affordance v1 never writes.
- **`fire_local_time` is WALL-CLOCK TEXT** — the one documented exception to the house all-timestamps-UTC rule. A 9pm ritual is a wall-clock fact; an instant would drift on DST/travel. The device interprets `HH:MM` at schedule time. Never parsed, never compared to a timestamp.
- **`category` is a CHECK enum** (`'daily_summary'` only) — adding a member (B-288/B-227) is an explicit additive migration, never a silent widening.
- **Off-not-erased.** RLS default-deny, owner-only select/insert/update via `(select auth.uid())`; **no DELETE policy** *and* `REVOKE DELETE FROM authenticated`. Keeps the "was this ever on" audit the self-pruning hook reads. Account deletion still folds the rows away via the `auth.users` CASCADE (service-role path).
- **The server's partial uniques are deliberately NOT mirrored locally** — the diet-trial active-index lesson. The mirror must be able to *represent* the cross-device duplicate (two devices enable the same category offline; one loses the server's 23505). With only the primary key unique locally, hydration's `ON CONFLICT(id)` can never trip a natural-key collision, so — unlike `diet_trial_foods` — this mirror needs no collision-resolution SQL. The account owner (`user_id`) is likewise not stored locally (single-account DB); the push mapper stamps it from the session, the `medicationItemRowToRemote` idiom.

## Gates

Both mandatory gates ran in isolated context and **independently converged on the same single finding.**

- **`rls-privacy-reviewer` — PASS on all five boundaries it attacked**, each against a concrete exploit: cross-user read/create/update (RLS + `WITH CHECK` fail closed), no-delete (missing policy + `REVOKE DELETE`, `auth.users` CASCADE erasure intact), anon (`REVOKE ALL` + no policy), sign-out wipe (in `LOCAL_WIPE_TABLES`, B-424 guard covers it), cross-account push (uid stamped from the JWT's own session).
- **`code-reviewer` — fix-before-merge** on the one shared finding; its other notes were inherited debt and a PR-3 carry-forward (below).

### The finding (both reviewers): `pet_id` bare FK
`pet_id → pets(id)` was existence-checked but never **ownership**-checked — and FK checks bypass RLS — so an authenticated owner could write a row into their *own* account naming *another* account's `pet_id`. **Not a v1 breach:** the row stays RLS-scoped to the attacker's own `user_id`, `pet_id` is an opaque UUID, and no v1 write path emits a non-NULL `pet_id` (every v1 pref is account-wide). But it's the exact bare-FK class migrations 041/023/044 close, it's free at zero rows, and it becomes a real **cross-account disclosure primitive** once Part 2's **service-role** push reads `pet_id` (a push joining `pet_id → pets` to name the pet would render the victim's pet name into the attacker's notification).

### The fix — migration 051 (trigger, not `WITH CHECK`)
`enforce_notification_pref_pet_scope()` `BEFORE INSERT OR UPDATE`, mirroring 041/023. A **trigger** because service-role callers bypass RLS (a `WITH CHECK` using `auth.uid()` is NULL under service role); it checks `pets.user_id = NEW.user_id`, so it holds under **both** client and service-role contexts. **NULL `pet_id` (account-wide — the whole v1 shape) is skipped** — load-bearing, or it would reject every preference v1 writes. `search_path` pinned to `''`, `public.pets` schema-qualified. **Functionally verified in a rolled-back transaction:** account-wide (NULL) accepted, own pet accepted, foreign pet blocked with `check_violation`; table still 0 rows; `get_advisors` unchanged (the function is SECURITY INVOKER, not flagged).

## Base-drift at wrap
`#561` (thrown-upload classification + orphan-food reap, B-586/B-369) landed on `main` mid-session and touched the same sync-layer files. Merged `origin/main` into the branch — **clean, no conflicts** (its additions and mine were in disjoint regions). Re-verified: `tsc` exit 0, jest **187 suites / 4113 tests** green (up from 4096; #561 added coverage), no duplicate B-IDs, no conflict markers.

## Residuals / carry-forward
- **PR 3 read path must prefer the synced row** — `ORDER BY synced DESC, updated_at DESC, id`, the `ACTIVE_DIET_TRIAL_QUERY` precedent — so a cross-device quarantined loser can't surface over the winner. Captured as an inline note in `lib/notificationPreferences.ts` (code-reviewer's NIT). No reader ships in this PR, so nothing to build yet.
- **Hydrate/push SQL is untested at the `sync.ts` seam** — inherited debt, not a regression: the whole hydrate layer is untested that way (`sync.test.ts` mocks out the `hydration` helpers). Both reviewers hand-traced the new SQL and confirmed it correct. #561 began adding `sync.test.ts` coverage; a broader pass over all mirrors' hydrate SQL is the real fix, out of scope here.

## DoD
tsc ✓ · jest 4113 ✓ (incl. the fail-closed guards now covering the table) · no anti-patterns introduced · tests present for the new `lib/` logic ✓ · Secrets Register N/A (no new secret) · migration pre-flight present (050 + 051, both destructive=n) · `get_advisors` clean · **Trust & Safety / Privacy** sign-off via `rls-privacy-reviewer` PASS + the 051 fix (the DoD privacy line is on the PR). Adversarial-review line **N/A** — the diff is schema + sync plumbing, no clinical/statistical logic; the RLS surface got its correct sibling reviewer instead.

Personas: **Trust & Safety / Privacy** (the RLS surface + off-not-erased + sign-out wipe), **Dir. of Engineering** (the account-scoped-first-table call, the wall-clock exception, the no-mirror-of-uniques decision), **Sr. Data Scientist** (the LWW/mirror integrity + the fail-closed guards). Designer / Dr. Chen / owners **N/A** (no owner-facing surface this PR).
