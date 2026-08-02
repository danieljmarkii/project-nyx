# Password recovery PR 3 — in-app Change password in Settings

**Date:** 2026-08-02

**Shipped via #551.** Third of the five-PR password-recovery track (B-280, spec `docs/nyx-password-recovery-requirements.md` §5.7 + FR-19; D4 ruled *yes*). Self-contained: sits on PR 1's foundations but shares none of the recovery deep-link machinery, and needs no SMTP (it's an authenticated `updateUser`, no email), so it works regardless of the B-152 gate.

## What shipped

- **`app/settings/password.tsx`** (new) — Change-password screen: Current / New password fields (shared `TextField` + the signup `passwordError`), the FR-19 **"Also sign out other devices"** checkbox (**default off**), Save. Success confirms with the root `Snackbar` ("Password updated."), not an alert (§5.7).
- **`app/settings.tsx`** — the `:163` "coming soon" note is replaced by an inline **Change password** nav row (built inline to match the Account card's padded inline rows rather than a deeper-inset `SettingsRow`) + the residual line **"To change your account email, contact support."** (a support path, not another undated "coming soon" — nyx-voice Pattern 3).
- **`lib/authErrors.ts`** — exported `isInvalidCredentials` (sibling of `isEmailNotConfirmed`/`isRateLimited`/`isOffline`), + a `'password'` `AuthContext`.
- **`app/_layout.tsx`** — registered the `settings/password` route.
- Tests: 9 screen tests + `isInvalidCredentials` unit tests + a `reset`/`password` fallback-title assertion.

## The one design decision that mattered: what the "current-password re-check" actually is

Supabase's `updateUser({ password })` takes **no** current-password parameter and there is no verify-only endpoint. Confirmed against the docs: the dashboard's "Secure password change" ("require reauthentication when changing password") setting gates the write on an **email OTP nonce**, *not* on the current password — and it exempts a session created within the last 24h from needing that nonce at all.

So the genuine current-password check can only be **client-side**: `signInWithPassword({ email, currentPassword })`. This has three properties that make it the right instrument:

1. It actually verifies the current password (a mismatch is `invalid_credentials`, surfaced **inline on the field**, never as "wrong email" — the D2 enumeration posture).
2. It mints a **fresh** session, which is "recently logged in" (< 24h), so the subsequent `updateUser` proceeds **without** an email nonce **whether or not** "Secure password change" is on — enabling the server setting does not break the flow.
3. `SIGNED_IN` from the reauth is a no-op in the root listener (`setSession` + `refreshAppConfig`, no routing), so the mid-flow session swap doesn't bounce the owner.

**Ordering (FR-18/FR-19):** re-check → `updateUser({ password })` → `signOut({ scope: 'others' })` **only after a successful write, only when the box is ticked**. Verified in the installed `@supabase/auth-js` types that `scope: 'others'` fires **no local `SIGNED_OUT`** — so the resetting device keeps its session and is never bounced to the login wall. An eviction failure is reported honestly alongside the (already-true) success rather than treated as a hard failure.

**The flag to the PM (already in STATUS.md's PM actions, §9.2):** the client re-check makes the field real at the app layer but does NOT close the direct-API path — an unlocked phone's stored session token can call `updateUser` straight past this screen. Turning on "Secure password change" is the server-side backstop; **without it the current-password field is decorative** and this is a Settings-screen account takeover.

## Reviews

- **`nyx-voice`** — applied two consistency fixes (contraction register; align "updated" between the snackbar and the eviction-failure alert).
- **`code-reviewer`** — verdict *fix-before-merge*; traced and confirmed the reauth→update→evict ordering correct, then flagged four cleanups, **all folded in**: the `updateUser` failure path used the `'login'` context (would show "Couldn't sign you in" on a change-password screen) → added a `'password'` context; explicit `minHeight: 44` on the option row; a leaked snackbar timer in two success-path tests → stubbed `show` in `beforeEach` + `restoreAllMocks`; and the `isInvalidCredentials` duplication → `authErrorCopy` now reuses the predicate.

## Merge-time integration (this was the interesting part of the wrap)

PR 2 (#553 — the whole recovery flow) merged to `main` *while this PR was open*, and it independently added `isInvalidCredentials` (identical body) **and** a sibling `AuthContext` value (`'reset'`) to the same `lib/authErrors.ts`. Merging `main` conflicted on exactly those regions. Resolved by:

- Keeping **both** contexts: `AuthContext = … | 'reset' | 'password'`, with both `FALLBACK_TITLE` entries.
- Keeping **one** `isInvalidCredentials` (bodies were identical) under a merged comment covering both call sites (login §5.1b "moment of discovery" + the change-password re-check).
- Extending the test's no-raw-strings `CONTEXTS` sweep to cover `'reset'` too — PR 2 had added that context **without** test coverage, so this is a net gain, not a duplication.

Full jest suite green on the merged tree (183 suites / 4003 tests); `tsc` clean. The wrap's duplicate-B-ID check (run after the merge) was empty.

## Residuals / not done

- **No new B-IDs filed.** The one PM dashboard action ("Secure password change" + the password-changed notification email) was already captured in STATUS.md's PM-actions §9.2 block from PR 2's scoping.
- On-device QA is the PM's pass (manual QA script in the PR body / Dev Handoff). Everything in this PR is testable on today's binary — no native module was added.
