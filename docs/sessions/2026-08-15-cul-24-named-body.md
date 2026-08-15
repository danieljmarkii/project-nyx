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

## Gates

- **nyx-voice ✓** — named title/body name the pet (Pattern 1), no "!" (Pattern 4), the body speaks to the ritual never the record so it never reassures (Pattern 6), the sublabel states the tradeoff honestly (Pattern 8).
- **code-reviewer** — run on the diff (see PR thread for the result / any folded fixes).
- **Adversarial review: N/A** — inert body warmth. `use_pet_name` changes only notification *text*; it never gates delivery, changes routing/scope, or feeds an escalation threshold, a correlation, or the vet report. No clinical or statistical logic. (Data ✓ — account-scoped, rides 050's RLS + the LWW mirror; Engineer ✓ — signature-based reconcile, no churn; Designer ✓ — Principle 5 honest reveal-when-on.)
- **tsc + full jest (227 suites / 5154) green.** Non-UTC CI unaffected — no new day-math (the pref is a boolean; `fire_local_time` untouched).

## Integration note (rebase onto DR-4)

`origin/main` had advanced to **DR-4 (#654)**, which rebuilt the primer (`NotificationPrimerSheet` → `NotificationPrimer`, all copy moved to a per-category registry `primer` descriptor) and relocated the lock-screen privacy line to this screen. Rebased cleanly except one test-file conflict in the 4th-state primer test — resolved by keeping DR-4's new hero copy (`/Biscuit.s day, gathered up/`) and my `getByLabelText('Daily summary')` selector (the DR-6 second switch makes a bare `getByRole('switch')` ambiguous). `lib/notifications.ts` and `notifications.tsx` auto-merged (disjoint regions).

## Backlog touched

- **B-671** (the opt-in setting) — **Done via #657** (the DR-6 feature); DR-5 migration shipped #653.
- **B-762** (Daily Recap umbrella) — DR-0 (#651) + DR-4 (#654) + DR-5 (#653) + **DR-6 (#657)** shipped; remaining: DR-1 (screen), DR-2 (TodayZone v2), DR-3 (offer), DR-7 (finish).
