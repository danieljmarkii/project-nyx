# Dose-course adherence line — re-base to the dispensed total (B-618 fix; resolves B-645)

**Date:** 2026-08-02
**Shipped via #557** (branch `claude/dose-counter-completion-bug-26glpd`).

## What shipped

A one-function fix to the profile **Current medications** card so a dose-denominated course's adherence line stops contradicting its own dose counter. `computeRegimenCompliance` (`lib/medications.ts`) gained an optional `targetDoses`; the caller in `app/(tabs)/profile.tsx` (`buildRegimenDisplay`) passes `reg.target_duration_doses`. 12 new unit tests. No schema, no Edge Function, no migration.

## The bug (PM TestFlight report, with screenshot)

Motozol was dispensed as **#28** (`target_duration_doses = 28`), 2×/day. On calendar day 18 the card showed two contradictory progress lines at once:

- **Dose 28 of 28** (full bar) — the B-618 counter (`dosesTowardTarget` = given + partial), course complete.
- **78% given · 28 of 36 doses** — the PR-7 adherence line (`regimenComplianceLine`), apparently *behind*.

The owner had given **all 28 prescribed doses**, yet the card said 78% and "acting as if I need to log doses". Root cause: the adherence denominator was the **calendar pace** — `computeRegimenCompliance`'s `expectedDoses = doses_per_day × daysElapsed` = 2 × 18 = **36** — which keeps climbing past the dispensed total. Those 8 "missing" doses were never prescribed. Strictly, "% of what you should have given by now" is also the *pace* concept D3 punted from v1.

(The persistent "Log a dose" button was **not** the bug — that's D7, intentional: nothing auto-completes a course; the vet ends it and a real extra dose must stay recordable. The contradiction was the "78% / 28 of 36" line.)

## The decision — resolves B-645

This is exactly **B-645** ("does the day-scheduled compliance % earn its place on a doses card?"), which `pm-feature-review` raised during B-618 PR 4 and left for the PM. B-645 listed three options (keep as-is / trim to "88% given" / suppress). The PM chose a fourth that emerged this session: **re-base the denominator to the dispensed total.** The day-scheduled framing — the thing B-645 questioned — is gone; the line stays but now measures *the prescribed course*, not the calendar pace. Asked via `AskUserQuestion` (re-base vs drop); PM picked **re-base (keep the line)**.

## The fix

When `targetDoses > 0`, `expectedDoses = targetDoses` (the dispensed total) instead of `doses_per_day × daysElapsed`, and such a course is never treated as PRN (it always has a real denominator). Everything else is unchanged:

- **Numerator** stays `tally.given` (given-only) — the deliberate D1 gap vs `dosesTowardTarget` (given + partial) is preserved, so on a course with partials the counter and the % differ by exactly `tally.partial` and the partials surface on the flag line.
- **`percent = null`** on a zero-logged course (never "0% = compliant", §6.1) — the `loggedDoses > 0` guard is untouched.
- A corrupt/legacy `0` target (the local SQLite mirror does not enforce the server `> 0` CHECK) falls back to the pace path, never a 0 denominator.
- Days / ongoing / PRN courses are **byte-for-byte unchanged** (opt-in: omit `targetDoses` → identical). Verified by a test.

Card now reads **"100% given · 28 of 28 doses"**, agreeing with the counter.

## Falsification — `adversarial-reviewer`, PASS

Ran the isolated pass on the diff. Verdict: clinically sound to ship; *"over-reassurance is structurally impossible without either genuine near-complete delivery or a firing flag line; the only distortion is a safe-direction under-read early in a course."* Confirmed D6 holds (the only other consumers — `ask/tools.ts`, the vet report — don't use this denominator, so no cross-surface drift). Counterexamples that held:

- **Refusal-heavy cat, past nominal end** (26 given / 20 refused of #28): re-based % reads the honest 93% *of prescribed doses delivered* while the 22 refusals surface intact on the denominator-independent flag line ("22 doses not fully taken — worth a word with your vet"). Re-basing cannot suppress the flag line.
- **`given ≈ target` with a silent flag line**: impossible to construct without genuine near-complete delivery. And `percent` can't reach 100% before the *counter* reaches target (`dosesTowardTarget ≥ given`), so no early-completion false signal (D7).
- **Zero-logged / all-unrated / target ≤ 0 / NaN / Infinity**: `null` "No doses logged yet" or pace fallback — never a nonsense or zero denominator.

## Residual (filed, not fixed)

**B-658** — the adversarial reviewer's non-blocking observation: "% given" now means an *adherence-to-date rate* on the pace path but *fraction-of-the-prescribed-course delivered* on the dose path. A perfectly-adherent owner on day 5 of a 14-day #28 course reads "36% given · 10 of 28 doses", which can *feel* like a low score. It is the safe direction (under-reads, never over-reassures), carries no D3 "behind" language, and the "10 of 28" disambiguates — but the shared wording deserves a `nyx-voice`/Dr. Chen glance for whether course-progress wants distinct copy from adherence-rate. Sits alongside the still-open B-642 (at-target keep-going line) / B-643 (zero-state voice) / B-644 (PRN-with-target QA).

The reviewer's second observation (a mis-entered low target is trusted as truth — enter #60 as #28 and it reads "100% of 28") is inherent to dose-denomination, not this fix, and renders no stop language (D7 holds). No action.

## DoD

- Types ✓ · jest ✓ (185 suites / 4039, incl. 12 new; pre-push hook + CI both green — Edge Functions, non-UTC timezones, typecheck+jest all passed)
- Data Scientist ✓ (denominator honesty; numerator + null-state unchanged) — Designer ✓ (the two lines now agree) — Engineer ✓ (opt-in param, one tested denominator decision, `profile.tsx` sole caller) — Dr. Chen / adversarial ✓ (PASS, falsifications above) — QA ✓ (Motozol case + past-target + regression pinned)
- Tier-2 doc: `docs/nyx-medication-dose-duration-requirements.md` §6 updated to reflect the PM-ratified re-base (it previously said "compliance line renders exactly as today", now false for a dose course).
