# Password reset adopts the recovery session auth-js emits (CUL-1886)

**Date:** 2026-10-12
**One thing:** D3 L1 — Reading a test: a mock that agrees with your assumption cannot catch a wrong assumption · check: pending

Shipped via #1202. BUILD session on [CUL-1886](https://linear.app/projectnyx/issue/CUL-1886), found by the PM's device QA of the new Culprit reset email the same afternoon.

## What broke

Forgot password failed on every device. The server side was correct: `/recover` 200, `/verify` 303, `POST /token?grant_type=pkce` 200. Then the app sat on "Checking your link" for 20 seconds and said "Couldn't finish that".

auth-js 2.105.4 stores the reset's PKCE verifier as `<verifier>/recovery`. `_exchangeCodeForSession` splits that suffix off and emits `PASSWORD_RECOVERY` instead of `SIGNED_IN`. The recovery exchange window (`shouldAdoptSessionDuringRecovery`, `lib/authRouting.ts`) admitted only `SIGNED_IN`, so the root listener dropped the new owner's session. auth-js had already saved it, which left the device holding a live session the UI never showed. The issue named the suffix `/PASSWORD_RECOVERY`; the source says `/recovery`, and the event is `PASSWORD_RECOVERY`. The diagnosis was otherwise exact.

Why nothing caught it: `lib/recoveryDeepLink.test.ts` mocks `exchangeCodeForSession` and sets the session directly. The B-280 spec assumed `SIGNED_IN`, the tests encoded that assumption, and the device checks ([CUL-66](https://linear.app/projectnyx/issue/CUL-66)) had not run.

## What shipped

- **The guard admits only `PASSWORD_RECOVERY` during the window.** The issue's plan was "alongside `SIGNED_IN`". The `rls-privacy-reviewer` found that `SIGNED_IN` is not exchange-only. `_recoverAndRefresh` emits it carrying the *stored* session, so on a cold start from a reset link it can be the pre-recovery owner A, racing `handleRecoveryDeepLink` setting the pending flag. That is a pre-existing Trap-2 path. A successful recovery exchange can never emit `SIGNED_IN`, because its code only matches a `/recovery` verifier, so dropping it costs nothing and closes the path. Logged on the issue as a team call (Trust & Safety + Engineer); the PM can reverse it.
- **`lib/authEventContract.test.ts`** drives the real auth-js `AuthClient` through `resetPasswordForEmail` and then `exchangeCodeForSession`, with in-memory storage and a fake fetch. It pins `['PASSWORD_RECOVERY']` and asserts that the guard adopts it. It is the first test in the repo that runs the library rather than a mock of it on this path.
- Comments naming `SIGNED_IN` as the exchange's event are corrected in `app/_layout.tsx`, `lib/recoveryDeepLink.ts` and `store/authStore.ts`.

Mutation proof: with `SIGNED_IN`-only restored, 2 tests fail (the contract test and the unit test). With `SIGNED_IN` re-admitted, 1 test fails. Full suite: 655 suites, 16,622 tests green; tsc clean.

## Reviews

- **rls-privacy-reviewer: PASS.** It listed all four `PASSWORD_RECOVERY` emitters in auth-js. The exchange (L1496) and `verifyOtp` (L1913) send a server-minted session for the presented code. URL detection (L324) and the BroadcastChannel relay (L216) need `isBrowser()`, which is false on React Native, and `detectSessionInUrl: false` is set anyway. It also checked three attacks:
  - A stale `/recovery` verifier from A's own earlier send: one slot, plus the server's challenge check, binds the session to the code's account.
  - A late `PASSWORD_RECOVERY` after the window closes: it is awaited inside the exchange, so it is adopted before pending clears.
  - The `SIGNED_IN(A)` residual above: fixed in this PR.
- **code-reviewer: ship-ready.** Its comment nits were applied, and the contract test's `expires_at` is now a fixed constant.

## Found along the way

[CUL-1888](https://linear.app/projectnyx/issue/CUL-1888): "Try again" on a failed exchange can never succeed. auth-js deletes the verifier on any failed exchange, and the reconcile signOut deletes it again. Two smaller items ride on the same issue: retry runs without the pending flag, and two back-to-back links can self-DoS. Parked in Backlog; it changes a designed state, so it needs a mock frame.

## Residual

The device rerun has not happened. [CUL-66](https://linear.app/projectnyx/issue/CUL-66) step 1 holds it, and the PR body carries the five-step script.
