# Password recovery PR 2 — the whole flow (B-280)

**Date:** 2026-08-01

PR 2 of the 5-PR track, built from `docs/nyx-password-recovery-requirements.md` §9 on top of PR 1's foundations (#444). FR-1 → FR-20. **No user-visible change** — `PASSWORD_RECOVERY_ENABLED` ships off; enabling it is PR 4. Draft **#553**.

## What landed

- **`lib/recoveryDeepLink.ts` (new)** — the §6.4 handler (cold + warm), implementing **option (d)**: null the *store* session (`setSession(null)`) + run `wipeLocalSession()` DIRECTLY before `exchangeCodeForSession`, with NO pre-exchange `signOut()` (that deletes the PKCE verifier — B-576). A real `signOut({ scope: 'local' })` runs only on the failure path (the reconcile). Shares `runExchangeAndFinalize` with the §5.6 retry.
- **`app/(auth)/forgot-password.tsx` (new)** — §5.2 request (FR-2 pre-fill), §5.3 neutral Sent (D2; resend cooldown from first paint, edit-address, support-after-first-of-(resend or 60 s)), §5.6 request-failed (offline vs "on our end", FR-10). Records the FR-12/FR-14 marker before the send.
- **`app/(auth)/reset-password.tsx` (new)** — §5.4 set-password (FR-8), §5.5 link-no-longer-works, §5.5b wrong-device, §5.6-style failed exchange, the FR-16 escape, FR-18 evict-others-after-write. Renders purely from store state; a 20 s watchdog keeps the working state from being a dead end.
- **`app/_layout.tsx`** — cold-start recovery dispatch (skips the normal `getSession` routing so the two don't race), persisted-gate resume (row 21, incl. the transient-`retain` case), the FR-6 `SIGNED_IN` branch, the FR-15/FR-20 `SIGNED_OUT` routing, and the `recoveryExchangePending` adoption guard.
- **`app/(tabs)/_layout.tsx`** — the §6.5 router gate (`<Redirect>` while `recoveryInProgress`; the widget-tap acceptance test, row 22).
- **`app/(auth)/login.tsx`** — FR-1 link (flag-gated) + §5.1b failure alert with a Reset password action (FR-13) + FR-20 §5.6b evicted-device banner.
- **`store/authStore.ts`** — `recoveryScreen`, `recoveryEmail`, `recoveryExchangePending`, and the `deliberateSignOut` / `signedOutInvoluntarily` one-shots. **`lib/authRouting.ts`** — pure `signedOutRoute` + `shouldAdoptSessionDuringRecovery`. Deliberate-sign-out markers added at `settings.tsx` and `confirm.tsx`.
- Fixed the two stale "pre-exchange signOut" comments in `lib/session.ts` (and the matching test comment) to option (d); added `reset-password` to `AUTH_DEEP_LINK_PATHS`.

## Decisions and findings worth carrying forward

**The three-way exchange collapse (PR 1) drove the screen model.** `recoveryScreen` holds only the three *failure* outcomes; success and the working state are derived from `(session && recoveryInProgress)` vs. neither. Because the handler nulls the store session before routing (see below), the working spinner — not the form — is what shows while the exchange runs.

**The SIGNED_OUT handler routing is now `signedOutRoute`-driven, and FR-20 is gated on the flag.** An involuntary `SIGNED_OUT` (the FR-18 eviction on another device) routes to login with the §5.6b banner — but only when `PASSWORD_RECOVERY_ENABLED` is on, so PR 2 is inert. Deliberate sign-outs are marked at their origin; a recovery-failure `SIGNED_OUT` (gate still armed) is teardown-only (the handler owns its routing + gate release, to avoid a route/release race).

**`recoveryEmail` is held in memory past the wipe by design and must NOT be added to `wipeLocalSession`.** The wipe clears the *disk* marker at step 4; the handler read the email at step 2 (FR-12), so the failure-state pre-fill comes from the store field. It is cleared on the terminal exits instead (success + escape) — the safe place. (The rls re-review suggested wipe-list parity with `justDeletedAccount`; that would break FR-12, so it was deliberately declined.)

## Gates

- **`rls-privacy-reviewer` (mandatory merge gate) — PASS, F1–F5 all HELD.** Then re-verified after the code-review fixes → **PASS again**. It named one narrow, pre-existing Trap-2 residual (auth-js `TOKEN_REFRESHED(A)` re-adopted mid-flush) that the fixes *narrowed* but didn't fully close — **now closed** in this PR by the `recoveryExchangePending` guard (`shouldAdoptSessionDuringRecovery`): while the exchange window is open the root listener adopts ONLY the exchange's `SIGNED_IN(B)`, and a resume never sets the flag so it doesn't regress F3.
- **`code-reviewer` — fix-before-merge, all closed.** Two were real access-control bugs on the Trap-2 boundary: **(1)** the handler routed to the form *before* nulling the store session, with an unbounded `flushForSignOut()` in between — on a **warm** link A's live session was still in the store, so a "Save" tap in that window would write B's password onto A's account. Fixed by nulling the store before the route (the flush pushes via auth-js's session, so A's queue still drains to A). **(2)** the FR-15 reconcile `signOut()` defaulted to `global` scope, evicting A on every device for a routine failed exchange → scoped `local`. Plus the cold-start `isLoading` flash (`.finally`), two `spaceMicro` nits, and a dead `force` param.
- **`nyx-voice` — ✓.** Copy matches §5 verbatim; the load-bearing "usually" is present in §5.6b. Two optional polish notes; one ("Not now" → "Cancel") was adopted because `pm-feature-review` flagged it too.
- **`pm-feature-review`** — login + forgot-password **SHIP-SHAPED**; reset-password **NEEDS-WORK ×2**, both fixed: the working state had no exit/timeout (→ the watchdog) and "Not now" mislabelled a full sign-out (→ "Cancel"). Filed **B-651** (a "Back to log in" on the Sent state) and **B-652** (a reset-success confirmation) as Later.
- `clinical-guardrails` **N/A**, stated (§7).

tsc clean; jest **3970 / 180 suites** (~55 new recovery cases); no Edge Function files touched.

## Still open (PM, for enablement — PR 4)

The §9.2 dashboard items (redirect allowlist — likely already covered by B-432's `nyx://**`; enumeration protection; the "Nyx" recovery email template; link-lifetime ≤ 24 h vs. `RECOVERY_PROVENANCE_WINDOW_MS`; "Secure password change" for PR 3; the password-changed notification email) and the §9.3 device checks (Q1 desktop-burns-token, Q2 verifier-absent-distinguishable, Q3 `message://` reaches Gmail). None are code; all are named on the PR and STATUS.md.
