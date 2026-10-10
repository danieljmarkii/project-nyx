# Engines v3 PR-30m: migration 097, intake_checks

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Dispatched by `/dispatch` for CUL-1723 (a sub-issue of CUL-1136, EN-5's intake evidence). It was plan-gated: the plan was posted on CUL-1723, and the PM's go was typed in session. Shipped via #1146, as a draft left for the PM: the migration applies on `apply 097` in the dispatcher session, and this session never applies or merges it.

## What shipped

- **`supabase/migrations/097_intake_checks.sql`.** A new table holds the owner's answer to the one-tap intake question under a vomit read, so the answer never has to pretend to be a meal row (CUL-1190, the Noticed window, no honest home for "Not sure"). Its main properties:
  - The answer stores its meaning, not its words: `yes | a_little | no | not_observable`. `a_little` is valid on `meal_fed` only.
  - There is no free text.
  - The table is mutable and synced last-write-wins, soft-deleted, with RLS by pet ownership and no DELETE for any role.
  - A same-pet guard checks every insert. It carries 082's ownership arm, and it freezes the identity columns on update.
  - Rows cascade from pets and events.
  - The migration also seeds `engines_v3_en5` off.
- **`guards/intakeChecks.test.ts`.** This is the R-5 line:
  - every text column is CHECK-bounded;
  - soft delete only, including schema-wide grants and default privileges;
  - no Edge Function reader yet (the allow-set is empty, C-32);
  - `generate-report` and `ask` may never name the table.
- **`lib/functionHardening.test.ts`** registers the new guard function.

## Decisions (build calls, recorded on CUL-1723's plan)

- **No uniqueness on `event_id`.** Two devices answering one vomit offline would otherwise hit a terminal 23505 on the second push. The reader rule (newest live row by `answered_at`, then `id`) is in the table comment for PR-30q.
- **Column-scoped INSERT and UPDATE grants that exclude `created_at`.** This is narrower than any other synced table in the repo. The identity columns are frozen by the trigger, not the grant, because the sync upsert SETs every column it sends.
- **No local mirror and no wipe-list entry yet.** PR-30q adds both with the first client writer (082's split).

## How it was proven

- **A PG16 behavioural replay** (stub `auth.uid()`, pets, events), covering every refusal, the upsert path, the soft delete, the cascade, the grants and the edit after a parent re-type.
- **Mutation of the guard.** With the ownership arm removed, the victim-pair insert returns 42501 instead of 23514, which brings the membership oracle back. So the arm is load-bearing.
- **Mutations of the guard test.** Three mutants were planted in the real tree and all three were killed: an unbounded `note`, a `GRANT DELETE`, and an `ask/` source naming the table.
- **The repo's checks:** `tsc` is clean, and the full jest run passes (635 suites).
- **`rls-privacy-reviewer`: HOLDS.** Three notes were folded in:
  - F1, a platform-wide Postgres quirk: `ON CONFLICT … WHERE` is evaluated before RLS. No client path reaches it today. It is stated in the file and filed as CUL-1738.
  - F2: the guard now also catches schema-wide grants and default privileges.
  - F3: 075's app_config allowlist warning is restated.

## Residuals

- **The en5 comment.** `_shared/engineFlags.ts` still says en5 is "NOT SEEDED". It is PR-30's (#1140) file, so whichever of the two lands second fixes the comment.
- **PR-30q's reader** must join on `event_id` AND `pet_id` AND `event_type = 'vomit'` AND `deleted_at IS NULL` (the reviewer's note, posted on CUL-1723).
