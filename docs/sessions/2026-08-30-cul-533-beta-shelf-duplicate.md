# CUL-533 — the beta-shelf entry point was already fixed; closed as a duplicate

**Date:** 2026-08-30

Shipped via #771 — this record only. **No app code changed this session**, and that is the outcome rather than a shortfall: the defect CUL-533 describes was already fixed on `main`, and the session's work was establishing that with evidence instead of taking a commit message's word for it.

## What CUL-533 asked for

The Settings → "Beta features" row and its "N on" count were gated on `useAllowlistFlag('widget_enabled')` alone rather than an OR across `BETA_REGISTRY`. Consequence: an account allowlisted for a Signal or log-picker beta but *not* the widget could never reach the shelf, so it could never satisfy Gate 2 (the local opt-in) and the eligibility add silently did nothing forever. Filed 2026-08-17 by an agent session while adding the PM's account to the `signals_v2` allowlist.

## What was actually there

The fix landed in `dc01867` / #727 — "Event-taxonomy W1-PR-0 … + the full B-747 OR-gate fix" (CUL-673) — and it is exactly the fix the issue specifies:

- `hooks/useBetaShelf.ts` (new) wrapping the pure `deriveBetaShelf` in `lib/betaFeatures.ts` — the OR over `BETA_REGISTRY`.
- Each store read in **bulk once** and reduced in plain JS, which is the rules-of-hooks shape the issue's Fix section called for; the old `app/settings.tsx` comment warning against a per-entry hook inside a `.map()` is retired by the hook.
- `activeCount` = eligible **AND** opted in across the registry, so the "N on" subtitle counts a non-widget beta. It deliberately does *not* count an opted-in-but-no-longer-eligible beta (a killed flag) — that feature has already stopped rendering for the account, so calling it "on" would state something the app isn't doing.
- `app/settings.tsx:60` and `app/settings/beta.tsx:143` read the **same** hook, so the row and the shelf cannot disagree about eligibility.

CUL-533 is therefore a duplicate of **CUL-499** (`B-747: Settings "Beta features" row gate is widget_enabled-only…`, Done). CUL-499 came over in the 2026-08-15 backlog migration; CUL-533 was filed independently two days later by a session that didn't spot it. Closed as `Duplicate` with the relation set, not as `Done` — the status should say *why* it closed without a diff of its own.

## How the closure was verified — by mutation

Three tests carry names that claim to cover this (`app/settings.test.tsx:81` and `:94`, `lib/betaFeatures.test.ts:96`). Per the CUL-613 rule — *a guard that has only ever been green has not been tested* — a matching name is not evidence, so the defect was reinstated and the suite re-run.

Mutation: gate `betaEligible` and the count on `widget_enabled` alone, the original shape.

Result: **3 failed, 1 passed.** Both CUL-533 tests went red, and so did `hides the count at 0 on`. `shows no row (and no hint the program exists) when no beta is eligible` correctly stayed **green** — it is the fail-closed case, which the defect does not change, so a red there would have meant the test was keying on something other than the defect. Reverted; `git diff` empty; 54/54 green across `lib/betaFeatures.test.ts` and the four `app/settings` suites.

That green-by-design fourth test is the part worth keeping. A mutation pass is only informative if you predict which tests *should not* move: three-of-four red is evidence the guards discriminate on this specific defect, where four-of-four would have suggested they were keying on something coarser.

## Residuals

- The one surviving `useAllowlistFlag('widget_enabled')` in the tree, `hooks/useWidgetSnapshots.ts:97`, is the widget feature's own self-gate rather than an entry point. Correct as-is; deliberately not touched.
- `signal_design_v2` and `signals_v2` were retired from the registry at GA (CUL-546/547/548), so two of the three betas CUL-533 names no longer exist. `log_picker_v2` and `event_types_v2` are the live rows the fix now serves.

## The process note

Two issues for one defect coexisted for 13 days, and the duplicate was created *by* an agent session two days after the migration that created its twin — i.e. the pre-filing search either wasn't run or didn't match `B-747`'s title against a plain-language restatement of the same bug. Near-duplicate detection already sits in the `backlog-groomer` skill's remit, so this is a known-covered gap rather than new scope and no issue was filed for it. Recording it here because the *shape* is what a groomer pass should look for: the two titles share almost no vocabulary (`widget_enabled`-only vs. "hardcoded to widget_enabled"), so title similarity alone would not have caught it — the flag name in the body would have.
