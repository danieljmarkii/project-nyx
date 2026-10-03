# The device pass made runnable: a fixture account, a forced cold start, a safe Noticed seed (CUL-1222, PR-21)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-21 of the Out of beta project. Shipped via #1027.

## What shipped

- **The fixture story** (`scripts/fixture/fixtureStory.ts`): one plus-alias account (`…+culprit-fixture@…`, the rule in `lib/deviceFixture.ts`) and four pets, each declaring its Signal lead. Juniper (dog, venison trial day 22, one off-diet chicken treat, one refused dinner) leads with the time-of-day pattern, a benign insight that draws a chart. Miso (cat, rabbit trial, eight days of picked-at and refused bowls, vomiting down week over week) leads with intake decline. Pepper (dog, no trial; the 21-row long day, the grazer's day, the Noticed seed's pet) and Fig (cat, brand new) lead with nothing.
- **Certified both ways.** Deno runs the shipped `runSignalPipeline` over each pet under every Signal engine key, four UTC hours and two time zones, with the weight lane fed through the production mapper. Jest checks the trial facts through `lib/dietTrial` (Juniper: exactly one off-diet feeding, not refusing; Miso: refusing), pins the Noticed seed's vomit days to the story, and checks the emitted SQL.
- **The emitter** (`scripts/fixture/emitFixtureSql.ts`, CLI `scripts/emit-fixture-seed.deno.ts`) writes upserts only, inside one transaction. Its prelude refuses unless the id and the email name one user, the email is a fixture alias, the account owns no other pet, and no fixture id on any table it writes belongs to another account or pet. The dry run ends in an error that carries the counts, because `execute_sql` only shows the last statement. The demo seed's literal builders are exported and reused.
- **`__forceColdStart()`** (`lib/devColdStart.ts`, read once by `hooks/useSync.ts`) arms one blocking first sync for the next reload. Release builds are unchanged.
- **`__seedNoticed` rebuilt (BRK-48).** It refuses any account but the fixture alias and any pet the account does not own. It reads the species off the record, clamps today to the minute before the run, writes vomits through `insertSimpleEvent`, catches errors, and is idempotent by day. Its vomit moved from today to day 8 so the quiet pet stays quiet.
- **`docs/device-pass-fixture-runbook.md`** lists every PM step: create the account, the one recorded allowlist update on all four flags, the dry run and the live seed, the phone steps, and the morning `ai_signals` lead check.

## What the build found

- My first story gave Juniper ten weeks of vomiting and the chronicity lane fired, so her Home led with a safety card: exactly MFU-1's problem. Pepper's three itches on the long day fired worsening, and so did the old Noticed seed's vomit today. The Deno test caught all three before any account was touched. Each fix is commented where it was made.
- Miso first read as a two-day dip, which fires intake decline but not the trial screen's refusal fact (more than half the bowls in 14 days). The sitting's step 42 needs both, so she now refuses for eight days.

## Deviations from the issue

- **Idempotent by day, not by deterministic ids.** Minting ids would mean adding an id parameter to `insertLook` and `insertSimpleEvent` that only a dev seed would ever pass. Re-runs fill only the missing days instead, which is what the deterministic ids were for.
- **The script itself was already rewritten on CUL-1529** by the gate triage. This PR fills in its "Before you start" and points it at the runbook.

## Review

- `code-reviewer`: fix before merge. Fixed: the weight lane was not fed in the certification (now fed, and a planted weight drop on Juniper reds it); `seedNoticedLooks` had no error handling; the dry run's read-back was invisible; the symptom list was restated (now imported from production); only one zone was tested.
- `rls-privacy-reviewer`: FAIL, low severity. Fixed: check (d) now covers events, meals, weight checks, trials and trial foods, so a planted v5 id cannot pull another account's row into the fixture; the prelude's literal admits only an address charset (an email containing `$do$` closed the DO body early); the runbook's lead read re-checks the alias tag. Everything else held, including the PM's id, the demo account, the allowlist update's scoping and release-build reachability.
- **Adversarial review: N/A.** No detection, escalation or report logic changed. The Deno test runs the shipped engine as is and asserts its output.

## Residuals

- A live check is still owed: `execute_sql` stopping at the first error, which the prelude depends on. The runbook makes this a one-time step: a dry run with a deliberately wrong `--user`.
- Rows the PM logs during the sitting survive a re-seed. The declared leads hold for the start of a sitting.
