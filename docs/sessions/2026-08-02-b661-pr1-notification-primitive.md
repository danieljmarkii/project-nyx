# B-661 PR 1 — the notification scheduling primitive + sign-out cancellation

**Date:** 2026-08-02

Shipped via **#562**. The first PR of the notification foundation (spec `docs/nyx-notification-foundation-requirements.md` §3, §7 PR 1). Adds the `expo-notifications` dependency and `lib/notifications.ts` — the building block every future notification workflow (B-288 confirmations, B-227 reminders, B-015 post-meal ask, B-662 vet-appt) sits on — plus the non-negotiable Trust & Safety piece: `wipeLocalSession` now cancels every scheduled notification on sign-out. **Zero user-visible change**: nothing on a user path schedules anything yet (no toggle: PR 3; no preferences store: PR 2).

## What shipped

- **`lib/notifications.ts`** (new) — pure-core + I/O-shell split (the `hydration.ts`/`sync.ts` precedent):
  - **Registry** — `NOTIFICATION_CATEGORIES`, v1 registers exactly `daily_summary` (channel = category, 21:00 device-local, route `/day-summary`, budget weight 1). Adding a category is an explicit edit here + the PR-2 CHECK, never an implicit default (G6).
  - **Pure decision** — `computeReconcileActions` (the load-bearing logic: schedule desired+permitted+not-live, cancel un-desired, cancel *everything* when permission is revoked, budget backstop can only schedule fewer), `wouldExceedBudget`/`totalBudgetWeight`, `scheduleIdentifier`/`categoryFromIdentifier` (deterministic per-category ids, so cancel/reconcile map by id with no content scan).
  - **I/O shell** — `ensurePermission(request=false)` (never fires the system prompt on a read — the one-prompt-per-install rule), `scheduleCategory`/`cancelCategory`/`reconcileSchedules`, `getScheduledCategories`, `cancelAllScheduledNotifications`.
  - **Budget enforcement point (D1)** — `scheduleCategory` refuses past `PER_ACCOUNT_NOTIFICATION_BUDGET`. The *number* is a placeholder ceiling B-288 owns (§9); what Part 1 owes is the point existing.
  - **Interaction accounting (§3, §5.4)** — `recordCategoryInteraction`/`readCategoryInteractions`/`clearNotificationInteractions`, an AsyncStorage ledger of last-interaction-per-category. The data B-288's self-pruning ("3 ignored days → propose a pause") reads; the behavior ships with B-288, the data accrues from here.
- **`lib/session.ts`** — `wipeLocalSession` gains `cancelAllScheduledNotifications()` + `clearNotificationInteractions()`, placed with the App Group wipes (the "state outside the SQLite sandbox" class). A 9pm summary scheduled by the account signing out must never fire on a shared device and name the previous owner's pet on the lock screen — the same leak class the local-wipe rules exist for.
- **`lib/notifications.test.ts`** (new) + **`lib/session.test.ts`** — the primitive's suite (registry, identifiers, budget, the full `computeReconcileActions` drift matrix, permission never-fires-on-read, cancel-all, interaction round-trip + tamper-resistance) and the wipe assertions (cancellation runs on every sign-out, and survives an earlier wipe step throwing).
- **`package.json`** — `expo-notifications ~57.0.8` (via `expo install`, SDK-57-correct).
- **`plugins/withoutPushEntitlement.js`** — comment-only note recording *why* the expo-notifications config plugin is deliberately NOT in `app.json`'s `plugins` array.

## The one real build decision: no config plugin (D2)

The `expo-notifications` config plugin's only iOS effect is to add `aps-environment` **unconditionally** (`withNotificationsIOS.js` lines 11–13) — the exact entitlement D2 forbids in Part 1 ("no APNs entitlement") and the exact key `withoutPushEntitlement.js` exists to strip. iOS *local* notifications need a runtime permission, not a build entitlement; the native module is linked by its presence in `dependencies` alone; the plugin's other effects (Android icon/colour, notification sounds) are unused and Android is not the PR-1 QA target. So the plugin is omitted rather than added-then-stripped. The reasoning is recorded in the `withoutPushEntitlement.js` header, where a PR-3/4 engineer who later needs the Android icon will look — with the instruction to register it *before* `withoutPushEntitlement` in the array (the reverse-order rule) so the strip still covers it. `app.json` is untouched.

## What was deliberately NOT done in PR 1 (deferred to later PRs, per §7)

- **No wiring to app foreground.** `reconcileSchedules(desired)` takes the desired set as a parameter because Part 1 has no preferences store (PR 2) and no toggle (PR 3). Wiring reconcile-on-foreground lands in PR 4 with the pref. Calling it now would be an app-startup side effect, i.e. not "zero change".
- **No real notification content.** `scheduleCategory`'s body is a neutral placeholder; PR 4 owns the G1-safe copy (the body must never assert record contents — iOS runs no JS at fire time). Nothing calls `scheduleCategory` on a user path in PR 1, so it never reaches a device.
- **No schema.** `notification_preferences` + local mirror is PR 2 (own schema PR). The interaction ledger is AsyncStorage on purpose — no new SQLite table in PR 1, so the B-424 hydration schema-source scan is untouched.

## Gates

- **tsc** clean; **jest** full suite green (186 suites / 4076 tests — no `wipeLocalSession`-caller test broke; `jest-expo` mocks `expo-notifications` for the transitive importers). The pre-push hook re-ran the suite green. CI green on all three jobs (App typecheck+jest, App non-UTC timezones, Edge Functions deno test).
- **code-reviewer** — **SHIP-READY.** No correctness bugs, no anti-patterns; it ran `npx expo config --type introspect` and empirically confirmed the final entitlements carry **no `aps-environment`**, validating the config-plugin omission. Its three non-blocking, forward-looking CLEANUP notes were folded in as comment-only hardening (zero logic change): (1) `computeReconcileActions` diffs on category **presence** only — documented that a config/fire-time change won't propagate to an already-live schedule without an explicit cancel+reschedule (matters at PR 4 / §9); (2) the budget-skip branch is unreachable while the registry has one category — noted to add a `computeReconcileActions`-level test when a second category lands (B-288/B-227); (3) `scheduleCategory` trusts the caller for OS permission — documented the contract (go through `reconcileSchedules`, which gates on `ensurePermission`, never schedule blind).
- DoD: Engineer ✓ (pure/shell split, best-effort teardown, no `any`, explicit error handling on every async). Designer N/A (no user-facing surface; the one placeholder string never ships). Data/Dr. Chen N/A (no statistical/clinical logic — the summary builder that would trigger adversarial review is PR 4, and is descriptive). Adversarial review not triggered (§7: no threshold/verdict in this PR).

## Residuals

- The per-account budget *number* is a placeholder (B-288 owns it).
- The self-pruning *behavior* (3 ignored days → propose pause) is B-288; PR 1 ships the data it reads.
- The Tier-2 `design-principles.md` §4 D1 carve-out edit (spec §11) is still awaiting PM wording approval — not this PR.

## Next

PR 2 (the `notification_preferences` migration + local mirror + sync — own schema PR, `rls-privacy-reviewer` gate) is build-ready and unblocked. The mock round (`docs/culprit-notifications-mockups.html`) gates PRs 3–4 and is independent of PR 2 — the two can run in parallel.
