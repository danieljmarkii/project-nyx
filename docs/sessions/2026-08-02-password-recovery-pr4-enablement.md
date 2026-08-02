# Password recovery PR 4 — enablement (B-280)

**Date:** 2026-08-02

PR 4 of the 5-PR track (`docs/nyx-password-recovery-requirements.md` §8/§9). Flips the build-time gate `PASSWORD_RECOVERY_ENABLED` from `false → true`, closing the returning-owner dead end. **B-280 CLOSED.** Shipped via **#554** (draft).

## What landed

- **`constants/flags.ts`** — `PASSWORD_RECOVERY_ENABLED = true` (was `false`). This single line lights up the whole flow already merged in PRs 1–3: the FR-1 login link, the §5.1b failure-alert Reset action, the deep-link handler routing, and the FR-20 evicted-device banner. The flag comment was rewritten to record the enablement, its date, and the met prerequisites (SMTP live+verified B-152; redirect allowlist `nyx://**` B-432). The "why a build-time constant, not `app_config`" rationale is preserved.
- **`app/(auth)/login.test.tsx`** — pinned to the flag-OFF state with a module mock (`PASSWORD_RECOVERY_ENABLED: false`), mirroring how `login-recovery.test.tsx` pins it ON. This file previously read the *real* constant to assert the flag-off rendering (link absent, plain alert with no Reset action), so it would have broken on the flip. Between the two files both flag states stay covered independent of the production default — no coverage lost. Two stale comments ("ships false in PR 2") updated.

## Why this needed a PM decision, and what was ruled

The flip is a **one-way, submission-blocking, user-facing** action the spec explicitly ties to on-device verification ("a 'check your inbox' state that lies is worse than the honest dead end"). The §9.2 prerequisites the task named ("remaining before the flip") are all **Supabase GoTrue platform config** — email templates, enumeration protection, password-changed email, JWT expiry — reachable only via the Supabase Dashboard or the Management API. **The cloud session has no Management API token (`SUPABASE_ACCESS_TOKEN` absent, per the Secrets Register) and no device**, so none of those four, nor the §10 on-device QA, could be performed here. The public `/auth/v1/settings` endpoint confirms only that email confirmation is ON (`mailer_autoconfirm: false`).

Surfaced this to the PM with three options (draft-gated / hold / flip-and-close). **PM chose "flip + close B-280 now"** — the dashboard checklist + on-device QA become PM action items, tracked as **B-657** so they survive B-280's closure.

## Gates

- **`tsc --noEmit`** — clean.
- **`jest --ci`** — green, **183 suites / 4003 tests**. Verified the flag-affected files (`login.test.tsx` flag-off, `login-recovery.test.tsx` flag-on, `authRouting.test.ts`, `passwordRecovery.test.ts`) plus the full suite.
- Confirmed no other test reads the real constant: `authRouting.test.ts` passes `recoveryEnabled` as an explicit param; there is no `_layout`/tabs-layout test depending on the flag.
- `code-reviewer` / `adversarial-reviewer` — **N/A**: a one-line flag flip over already-reviewed code (PRs 1–3 carried the mandatory `rls-privacy-reviewer` + `nyx-voice` + `pm-feature-review` + `code-reviewer` gates). No new clinically/statistically load-bearing logic. The Engineer signs off the exemption.

## The residual — B-657 (PM-only, gates real-user go-live)

*(Filed as B-655; renumbered to B-657 at wrap when a sibling PR (#552) had already landed a B-655 on `main` — first-lands-keeps.)*

The flow is now *reachable in code*; it is not yet correct/safe for real owners until:
- **Dashboard (§9.2):** recovery email template off "Nyx" → Culprit (+ the "open on this phone" line); confirm enumeration-protection state before changing; turn ON password-changed email; read JWT + OTP expiry; confirm "Secure password change" ON.
- **On-device (§10):** the §9.3 device checks (Q1/Q2/Q3) + the §10 matrix rows 1–33 on a dev client carrying the App Group entitlement (row 7 is vacuous in Expo Go).

## Outcome

B-280 closed (PRs 1–4 shipped via #554). PR 5 (email change, D9) → B-427. Go-live prerequisites → B-657.
