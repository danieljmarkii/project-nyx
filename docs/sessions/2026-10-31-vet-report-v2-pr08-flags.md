# Vet report v2 PR-08: the two report flags, seeded off

**Date:** 2026-10-31
**One thing:** T3 L1 — Migrations: a seed written so running it twice changes nothing · check: pending

Dispatched BUILD row VR2-8 ([CUL-2288](https://linear.app/projectnyx/issue/CUL-2288)), plan-gated as a migration. Shipped via #1371. The PM went with option (a) and applied migration 111 by hand in the Supabase SQL Editor; a read-back confirmed both rows, off.

## What shipped

- **Migration 111** adds `report_composer_v2` and `report_document_v2` to `app_config`, both `{"enabled": false, "allowlist": []}`, `ON CONFLICT DO NOTHING`.
- **`lib/appConfig.ts`** registers both keys; **`lib/betaFeatures.ts`** gains a required `careSurface` field (the named narrowing of beta-features D9: a care surface never moves behind Premium) and the "New report flow" shelf entry.
- **`guards/reportNoEntitlement.test.ts`**: report modules never read an entitlement or say Premium; a beta gate file that reads one must name `careSurface`. Proven by mutation on the real tree and on fixtures outside it.

## Ruling

- **(a), PM 2026-10-31:** `report_document_v2`'s shelf entry is `serverCost: true` and lands with its server check in VR2-10 ([CUL-2290](https://linear.app/projectnyx/issue/CUL-2290)), so the shelf never offers a switch the server ignores. The spec's "new layout by default" against the shelf's default-off switch is noted there too.

## Reviews

`code-reviewer` at 5e9cdca: fix-before-merge on migration isolation alone. Answered in the PR: the PM-approved plan named the 063 composition (seed, client registration, shelf entry together; no screen, no Edge Function). Its blind-spot note was applied.

### One thing — Migrations: a seed written so running it twice changes nothing (T3, L1)
A migration is a script that changes the cloud database. This one adds two settings rows, both switched off. The danger is the second run: if anyone ever runs it again after you have switched a flag on for your test group, a careless script would quietly switch it back off for everyone. So the script says "add this row only if it is not already there", and a second run does nothing.

**Like:** a sign-up sheet that says "write your name if it is not already on the list". Running down it twice never crosses anyone off.

**In today's work:** `supabase/migrations/111_vet_report_v2_flags.sql:62`
`ON CONFLICT (key) DO NOTHING;` means: if a row with this name already exists, leave it exactly as it is.

**Why it matters to you as PM:** your cohort edits to these flags (adding your account to the allowlist) are safe from any later re-run of this migration, so turning a beta on is a setting, not a release.

**Check:** next week you add your account to `report_composer_v2`'s allowlist, then someone re-runs migration 111. What does that row say afterwards, and would your phone still show "New report flow"?
