# Engines v3 PR-45 — EN-10 goes live for the PM's account

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via the draft PR on `claude/engines-v3-pr45-10101243` (CUL-1727). Dispatched by `/dispatch`, BUILD mode. Plan-gated: the plan and the gate check were posted on CUL-1727 and the PM typed `go B` in session. Not applied here; applying takes the PM's `apply 098` in the dispatcher session.

## What shipped

- **Migration 098** (`098_engines_v3_en10_seed.sql`) seeds `engines_v3_en10` as `{"enabled": false, "allowlist": ["<PM uid>"]}`.
  - **Ruling B (PM, 2026-10-10):** the uid is resolved at apply time from the owner's email, so no uid literal enters a committed migration (075's rule) and the allowlist lands in one reviewed write rather than a second hand-run UPDATE.
  - It raises unless exactly one account matches the email: a dead allowlist recorded as applied would be a go-live that never happened (096's reasoning; C-27, zero rows is never "fine").
  - `ON CONFLICT DO NOTHING`, with a NOTICE when a row already exists, so a re-apply never resets a live row.
- **No code change.** `engines_v3_en10` is already in `ENGINE_KEYS`; generate-signal reads it per request. It is a decorating key (`SIGNAL_DECORATING_KEYS`), so flipping it, or rolling it back, cannot mint a stand-down.

## Gate check

- CUL-1140 (EN-10) and CUL-1440 (no zero beside a masking drug or a recent visit, the flip's named gate) are Done. Spec §5.1's 42-day ruling is built. §5.2's dose-level context waits on CUL-1099 by design.
- **CUL-1429 gates the every-account flip, not this seed.** With the key on, a finding's `careContext` lines ride `ai_signals.findings` into Ask verbatim, which first puts a visit date in front of Ask's model (Ask reads no `vet_visits` itself), and `lib/careClaimScreens.ts` still passes "Since the Sep 16 visit, 0 vomiting episodes are logged." Dogfooded on the PM's account; fixed before `enabled: true`.

## Proof

Run against a scratch Postgres 16 (`auth.users` + `app_config` in 030's shape):

- zero matching accounts → raises, nothing written;
- two matching accounts → raises, nothing written;
- a row already present → left unchanged, NOTICE;
- one match beside a demo account → `{"enabled": false, "allowlist": ["<that uid>"]}`, the VERIFY query reads `false | 1 | true`;
- re-apply → NOTICE, row unchanged.

Fast checks: `tsc --noEmit` clean; `jest guards/` 53 suites, 1138 tests green; `lib/appConfig.test.ts` green. Deno is not installed in this container; the PR touches no Edge Function, and CI runs the Deno suite.

## Falsification attempts

- **Could the demo account end up allowlisted?** Only the one email is looked up; the demo row in the scratch run was ignored. Held.
- **Could a duplicate-email state seed the wrong uid?** The count must be exactly one or the migration raises. Held.
- **Could a re-apply undo a later live edit?** `DO NOTHING` leaves the row; proven on the re-apply case. Held.
- **Could flipping cost an owner a stand-down?** en10 is a decorating key, outside `SIGNAL_ENGINE_KEYS`, and the corpus guard proves flag-on less the field equals flag-off. Held.

## PM actions

- `apply 098` in the dispatcher session, then the VERIFY query at the file's foot and `get_advisors`.
