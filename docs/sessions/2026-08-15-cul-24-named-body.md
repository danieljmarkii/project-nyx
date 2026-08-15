# DR-6 (CUL-24) — The named body: pet-name opt-in

**Date:** 2026-08-15

Built the client half of the Daily Recap **warmth opt-in** (B-671 / spec §6, R-8). DR-5 (#653) shipped the `use_pet_name` column; this makes it a feature. Shipped via **#657** (draft), rebased onto **DR-4 (#654)**.

Single-pet accounts get a settings row under Daily summary — **"Use {Pet}'s name in notifications"** — that, when on, makes the scheduled 9pm notification name the pet (title **"Biscuit's day"**, body **"Biscuit's day is ready to read."**) instead of the neutral registry copy. Multi-pet accounts never see the row and stay neutral by construction. Default off; wiped on sign-out; LWW-synced; reconcile carries the named body.

## What changed

- **`lib/notificationPreferences.ts`** — `use_pet_name` on the local mirror: schema column (`INTEGER NOT NULL DEFAULT 0`), `LocalNotificationPreference` / `RemoteNotificationPreferenceUpsert`, and the row→remote mapper's `Boolean(row.use_pet_name)` coercion.
- **`lib/notifications.ts`** — `resolveDailySummaryContent({ usePetName, petName })` (pure copy resolver → named iff opted-in AND a single pet name, else neutral) + `contentSignature` (JSON-encoded, control-char-free so it round-trips through the OS payload); `scheduleCategory(category, content?)` stamps `data.contentSig`; `getScheduledCategoryState()`; content-drift reschedule in `reconcileSchedules(desired, content?)`.
- **`lib/notificationSettings.ts`** — `readUsePetName` / `setUsePetName` / `applyUsePetName`; `reconcileFromPreferences` resolves the single-pet name from the store (`usePetStore.getState().pets`) and passes the resolved daily-summary content.
- **`lib/sync.ts`** — `hydrateNotificationPreferences` + `RemoteNotificationPreference` carry `use_pet_name` (LWW pull).
- **`app/settings/notifications.tsx`** — the single-pet-only pet-name row, revealed only when the summary is genuinely on (`permission === 'granted' && enabled`); `usePetName` state read on focus; toggle → `applyUsePetName`.
- **`lib/localSchema.ts`** — the `COLUMN_UPGRADES` entry that adds `use_pet_name` to an already-installed device (see the review-catch section below).

## The design spine

- **One copy predicate, `resolveDailySummaryContent`.** The multi-pet-neutral guard lives here (returns neutral unless `usePetName && a single non-empty petName`) AND at the call site (the screen passes `null` for a multi-pet/nameless account), so "multi-pet stays neutral by construction" holds at the **reconcile layer**, not only the UI.
- **"Reconcile carries it" — two senses.**
  1. *Schedule reconcile:* `computeReconcileActions` keeps a live category without inspecting its copy (the code even anticipated this — "give it a content field this compares"), so a **content-drift refresh** in `reconcileSchedules` reschedules a kept schedule when the live `contentSig` ≠ the desired copy. It runs on settings-focus, on **app-foreground** (`useNotificationScheduling`), and on **cross-device hydration** (`hydrationTick`) — so a rename or a second pet propagates to the lock screen without any caller threading — and it does **not** churn when the copy already matches (the signature approach, chosen over always-reschedule precisely so app-foreground doesn't tear down a matching daily trigger every open).
  2. *Sync reconcile:* `use_pet_name` rides the existing LWW prefs mirror — push mapper + hydrate SELECT/INSERT/ON CONFLICT all carry it.
- **Wiped on sign-out (the real T&S mechanism).** The pref row is already in `LOCAL_WIPE_TABLES`; the **named OS schedule is cancelled** by `cancelAllScheduledNotifications()` in `wipeLocalSession` — a named notification can't fire for the next account on a shared device.

## T&S gate — the involuntarily-public tradeoff is the owner's explicit, informed choice

- **Default off / neutral** (migration 058's `DEFAULT false`), G6.
- **Single-pet only, two-sided** (UI + reconcile) → multi-pet neutral by construction.
- **Informed choice:** the row's sublabel states the tradeoff plainly — *"Shows their name on the lock screen at 9pm. Off keeps the summary neutral."*
- **No cross-account leak:** sign-out cancels the named schedule.
- **Coexists with DR-4's relocated lock-screen privacy promise** (*"…never what's in the record"*): that promise is about **record content** (still absolute — the named body asserts nothing about the record); the **name** is a separately-disclosed opt-in. The two lines together give the complete lock-screen picture. Flagged for **DR-7's copy sweep** to confirm the coherence.

## The bug the isolated review caught (fix-before-merge, fixed)

`code-reviewer` (run isolated, on the correct `origin/main...HEAD` base) found a **real regression I was anchored past**: `NOTIFICATION_SCHEMA_SQL` adds `use_pet_name` via `CREATE TABLE IF NOT EXISTS`, which is a **no-op on a device that already has the table** — and `notification_preferences` shipped in migration 050, long before this PR (058 added only the *server* column). The repo's mechanism for exactly this is `COLUMN_UPGRADES` in `lib/localSchema.ts` (precedent: `target_protein`, `source_filename`, `target_duration_doses`), and I hadn't added an entry. Worse than "the new feature doesn't work": `CATEGORY_PREFERENCE_READ_SQL` now `SELECT`s `use_pet_name` and that query backs the **already-shipped Daily Summary toggle**, so on any OTA-upgraded device (Runtime A/B never recreates the SQLite file — i.e. the PM's own test device on the next pull) every read/write on the notifications screen would throw `no such column`, get swallowed by the screen's try/catch, and silently revert the toggle.

**Fixed:** added `{ table: 'notification_preferences', column: 'use_pet_name', type: 'INTEGER NOT NULL DEFAULT 0' }` to `COLUMN_UPGRADES` (constant default; `0` = neutral backfill, mirroring migration 058's server `DEFAULT false`), plus a **regression test** (`notificationPreferences.test.ts`) that builds a pre-058 table, asserts the DR-6 read throws before the upgrade, applies the entry, and asserts the column lands at `0` with the pre-existing `enabled` untouched. Also folded the reviewer's NIT (a no-interpolation template literal → plain string on the sublabel).

Two lower-severity notes from the review, deliberately **not** changed here (recorded for the PM): (1) rename / add-2nd-pet propagation to the named body is **eventual** (next app-foreground / settings-focus / hydration tick), not wired to the pet-edit save itself — a narrow, cosmetic window consistent with the app's eventual-consistency design (spec §6's "reconcile carries it" is about surviving wipe + LWW, which holds); (2) `hydrateNotificationPreferences`'s new column has no *direct* pull test (an inherited gap — the function had none pre-PR; the push/mapper half is key-set-tested). Both → backlog candidates, neither a merge blocker.

## Gates

- **nyx-voice ✓** — named title/body name the pet (Pattern 1), no "!" (Pattern 4), the body speaks to the ritual never the record so it never reassures (Pattern 6), the sublabel states the tradeoff honestly (Pattern 8).
- **code-reviewer: fix-before-merge → fix applied.** The one BUG (the `COLUMN_UPGRADES` gap) is fixed + regression-tested; everything else the review checked came back clean (content-drift reconcile logic, the LWW round trip with no column drift, the two-sided multi-pet guard, the B-398 quarantine-clearing write, sign-out coverage).
- **Adversarial review: N/A** — inert body warmth. `use_pet_name` changes only notification *text*; it never gates delivery, changes routing/scope, or feeds an escalation threshold, a correlation, or the vet report. No clinical or statistical logic. (Data ✓ — account-scoped, rides 050's RLS + the LWW mirror; Engineer ✓ — signature-based reconcile, no churn; Designer ✓ — Principle 5 honest reveal-when-on.)
- **tsc + full jest (227 suites / 5154) green.** Non-UTC CI unaffected — no new day-math (the pref is a boolean; `fire_local_time` untouched).

## Integration note (rebase onto DR-4)

`origin/main` had advanced to **DR-4 (#654)**, which rebuilt the primer (`NotificationPrimerSheet` → `NotificationPrimer`, all copy moved to a per-category registry `primer` descriptor) and relocated the lock-screen privacy line to this screen. Rebased cleanly except one test-file conflict in the 4th-state primer test — resolved by keeping DR-4's new hero copy (`/Biscuit.s day, gathered up/`) and my `getByLabelText('Daily summary')` selector (the DR-6 second switch makes a bare `getByRole('switch')` ambiguous). `lib/notifications.ts` and `notifications.tsx` auto-merged (disjoint regions).

## Backlog touched

- **B-671** (the opt-in setting) — **Done via #657** (the DR-6 feature); DR-5 migration shipped #653.
- **B-762** (Daily Recap umbrella) — DR-0 (#651) + DR-4 (#654) + DR-5 (#653) + **DR-6 (#657)** shipped; remaining: DR-1 (screen), DR-2 (TodayZone v2), DR-3 (offer), DR-7 (finish).
- **B-783** (filed as B-775, renumbered) — a build-time guard that every column in a local schema constant is either in its `CREATE TABLE` or in `COLUMN_UPGRADES` (the class the review-catch bug fell through).
- **B-784** (filed as B-776, renumbered) — optionally wire the pet-edit / pet-create save to refresh the named body immediately rather than on the next reconcile tick.
