# App Store 1.2.0 PR-17: lift the six AI consent holds

**Date:** 2026-10-13

Row PR-17 of *App Store 1.2.0 · the first public release* (Wave 2), [CUL-1836](https://linear.app/projectnyx/issue/CUL-1836), the last sub-issue of [CUL-552](https://linear.app/projectnyx/issue/CUL-552). Shipped via draft PR (number in its body). Interactive; the PM ruled in session: **(a)** open the draft now, merge after the gate.

## What it does

Deletes the six `holds` entries in `supabase/functions/deploy-manifest.json` (analyze-vomit, analyze-stool, ask, extract-food-from-photo, extract-medication-from-photo, generate-signal). The merge deploys all six from `main`, which turns on the server consent gate: every Anthropic call reads the caller's `ai_boundary` answer and fails closed without a yes. CLAUDE.md's "Deploy holds" line now reads none.

## What the merge deploys

Each function's live version was read from production (`list_edge_functions`) and its closure walked with `scripts/edge-deploy/fingerprint.ts`. From each live version, `main` adds only:

- #1187, the server consent gate (CUL-1810): all six.
- #1209, "sent only if you tap" in `_shared/aiConsent.ts` (CUL-1835): all six.
- #1189, the trial ledger's extension weeks in `lib/dietTrial.ts` (CUL-1855): generate-signal only, inlined and unread.

The food and medication extractors were last deployed 2026-09-24; nothing else touched their closures since. The fingerprints on `main` matched the held ones exactly.

## The merge gate

PR-14 on the PM's phone by OTA, and the PM's own `ai_consent` row reading back by id (D12). At the time of writing production holds **zero** `ai_consent` rows, the PM's included, so the gate is not met and the PR stays a draft. Old builds have no way to say yes and fail closed, which is compliant.

## Linear

- The owed "owner and caller" ruling moved from CUL-552 to [CUL-194](https://linear.app/projectnyx/issue/CUL-194) (households) as a decision brief, recommending a no from either wins. It gates households, not 1.2.0.
- The auto mode classifier refused the manifest edit through the shell as a production deploy; with the PM's explicit go it was made through the editor. Nothing deploys until the merge.

## Checks

`tsc --noEmit` clean; `guards/` and `scripts/edge-deploy/` 1,311 tests green, including `guards/edgeFunctionDeploy.test.ts` and `guards/claudeMdBudget.test.ts`.
