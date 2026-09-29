# Engines v3 PR-18: each weight reading's source (migration 081)

**Date:** 2026-09-29

Shipped via #986. Finishes CUL-1412 (EN-8 part 1, the first of the weight lane's three PRs under CUL-1135).

## What shipped

- **Migration 081.** `weight_checks.source` holds where a reading was taken: `clinic`, `home_scale` or `estimate`. `source_basis` holds how that was decided: `entry`, `owner` or `legacy`. Both are TEXT NOT NULL with a CHECK over their closed set.
  - The W2 backfill is the column default, so every existing row reads `home_scale` / `legacy`.
  - The defaults stay after the backfill. Installed 1.2.0 phones upsert without the columns; without a default, every weigh-in they send would fail with 23502 and quarantine.
  - **Applied by the PM's go-ahead in-session.** Before: 6 rows, no columns. After: all 6 rows `home_scale` / `legacy`, no NULLs. Advisors: nothing new.
- **Local mirror** (`lib/localSchema.ts`). Both columns are in `BASE_SCHEMA_SQL` and `COLUMN_UPGRADES`, with the server's constant defaults, and `rehydrate` is set.
- **Log weigh-in** (`lib/weight.ts`). Writes `home_scale` / `entry` explicitly, not the local default.
- **Sync** (`lib/sync.ts`).
  - The push sends both columns.
  - Hydrate selects them and updates them under LWW.
  - A fill pass sets the label on every synced row fetched. This is the CUL-1396 shape: the rehydrate re-pull returns rows whose `updated_at` is unchanged, and LWW skips those.
- **Spec** (`docs/nyx-weight-lane-requirements.md` v1.1). §0 marks W1 A and W2 home scale as ruled. §7 gains an "as built" note that corrects two slips in the R-5 line:
  - RLS on the table is one FOR ALL policy, not per-verb policies.
  - The App Store label gains nothing, because weight is already declared.

## What broke and how

The first commit set `rehydrate` and assumed the re-pull would fill the new columns. It would not: `shouldWriteRemoteRow` returns strict-greater, so an equal `updated_at` is a no-op. An upgraded phone would therefore keep the default label, and its next weight edit would push that default over the server's label. After PR-37 that would silently undo an owner's "at the vet" correction.

The `code-reviewer` and the `rls-privacy-reviewer` both caught it independently. The fix mirrors `hydrateFeedingArrangements`:
- It fills only synced rows.
- It never compares `updated_at` as text (C-40).
- It never writes `updated_at`.

## Decisions

- **No CHECK pairing `estimate` with `owner`.** A client bug would then refuse the whole reading (C-38). The pairing is PR-37's writer contract.
- **The `guards/weightDisplacements.test.ts` reader entry waits for PR-19,** which ships the reader (C-32). Spec §7 had said "same PR"; that is corrected in the as-built note.
- **Rows written by pre-081 builds are also `legacy`,** meaning labelled by rule, not by the writer. This follows from W2's text and is stated in the migration header.

## Reviews

- **`rls-privacy-reviewer`: privacy held.** Attacks tried: a cross-account upsert with a foreign JWT, an old build editing a corrected row, model reads (Ask and report use explicit column lists), the cascade, the wipe list, and hydrate/push scoping. The one break was the integrity bug above.
- **`code-reviewer`:** found the same bug and the apply-before-client ordering; both are now in the PR and the migration header.
- **Adversarial:** N/A. No detection, threshold or AI-read logic is in this PR.

## Residuals

- **CUL-1428:** `weight_checks` has no same-pet trigger (pre-existing since 024).
- **The spec's export line** is unverifiable until an export exists (B-041).
- **Next in the lane:** PR-19, the lane in `generate-signal`. It needs Lane C and PR-11b, with CUL-583's cutoffs and PMD-9 before GA.
