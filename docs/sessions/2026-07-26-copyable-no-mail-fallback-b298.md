# Copyable no-mail-client fallback (B-298)

**Date:** 2026-07-26

Shipped via **#487**. Small, self-contained fix on the B-283 settings track — spec `docs/nyx-settings-requirements.md` §4.5. No schema.

## What shipped

§4.5 promises a **copyable**-address fallback when the device has no mail client. Both support paths — Contact support (`app/settings.tsx`, #316) and the Share-feedback composer (`app/settings/feedback.tsx`, #318) — rendered `SUPPORT_EMAIL` inside an `Alert.alert` *body*, which isn't selectable on iOS. The owner could read the address and then had to retype it by hand. That is the wrong failure mode for the one path someone reaches for when nothing else in the app is working.

- **New `lib/supportFallback.ts`** — `showNoMailFallback(email)` owns the alert; `copySupportAddress(email)` owns the clipboard write.
- The alert gains **Copy address** beside a cancel-styled **Close**.
- Success confirms through the root-mounted `Snackbar`: `Copied support@getculprit.app`.
- A failed clipboard write alerts honestly (`Couldn't copy`, address restated) rather than leaving the owner believing they have it.
- `Alert` drops out of `feedback.tsx` entirely.
- Adds **`expo-clipboard@~57.0.1`** — checked first, it was not already a dependency. Installed via `npx expo install` so the version is SDK-57-matched. No config plugin, so `app.json` is untouched.
- 5 unit tests in `lib/supportFallback.test.ts`.

## Decisions taken in-session

**The shared module lives beside `lib/support.ts`, not inside it.** The B-298 row's own instruction was "do it once for both", and both screens did carry byte-identical inlined `noMailFallback` copies. But `lib/support.ts` opens with an explicit contract — *"No expo-constants, no Platform, no I/O here"* — and the whole reason those helpers are pure is that they're unit-testable without a device. This fallback does two kinds of I/O (a clipboard write and an alert), so folding it in would have quietly broken the one property that file was built to have. A sibling module keeps both contracts legible, and both headers now say which is which.

**Confirmation goes through the existing `Snackbar`, not a second alert.** Two stacked alerts is the obvious way to confirm a copy and it reads terribly. The root-mounted snackbar already exists for exactly this shape (store-driven, survives the dismissal of whatever surface armed it), so it needed no new component and no new styles. Two details that mattered: it's armed with the store's `delayMs` (250 ms) so it doesn't slide up *behind* the alert's own dismiss animation — the same reason `snackbarStore` grew that option for modals — and it uses a shorter dwell than the 5 s Undo default, because this is a neutral confirmation with nothing to reach for, not a reversible action.

**The snackbar names the address rather than saying "Copied".** `nyx-voice` Pattern 2 (specific over generic): the owner is about to paste it somewhere and should be able to see what they've got.

## What was verified

`tsc --noEmit` clean. **140 suites / 2670 tests green** (5 new). CI green on both required checks — `App (typecheck + jest)` and `Edge Functions (deno test)`. No ESLint config exists in this repo, so the DoD's lint line is genuinely n/a rather than skipped.

The tests pin the four things the row was actually about: the alert offers the action, the action writes the *exact* address, success confirms via snackbar, and a failed write alerts honestly and **never** arms a success snackbar.

## Residuals

- **`code-reviewer` was not run.** This session's harness config disallows dispatching subagents, so the DoD's review line is unmet rather than ceremonially ticked. Flagged in the PR body too. `adversarial-reviewer` / `rls-privacy-reviewer` are genuinely N/A — no schema, no network, no clinical or statistical logic, no new access path.
- **The dev client must be rebuilt before this can be exercised on-device** (`eas build --platform ios --profile development`). `expo-clipboard` is a native module — Metro will start fine and then the app errors at load. Filed as a PM action item in `STATUS.md`; it's the runbook's "when the dev client itself goes stale" case, one-time, unrelated to the TestFlight cut.
- **The no-mail path is not reachable on a stock iPhone.** iOS always has Mail, so `canOpenURL('mailto:…')` returns `true`. Manual QA therefore has to force the branch (`const canOpen = false` in both screens, reverted before merge) — recorded in the PR's test steps so the next person doesn't rediscover it.
- **B-297 is untouched and unaffected.** If `expo-mail-composer` is ever adopted, this stays the correct fallback *behind* the sheet rather than behind a `mailto` — same role, no rework.

## Process note

No scheduled PR check-in was armed. Three sibling drafts opened within fifteen minutes of this one (#486, #488, #489), but all were open drafts on the same base rather than anything landing on `main`, and it was ~23:20 UTC — the case CLAUDE.md v1.27's bounded-check-in rule was measured against. Webhooks covered CI and review comments; the merge from `main` at wrap was clean, including `docs/backlog.md`.
