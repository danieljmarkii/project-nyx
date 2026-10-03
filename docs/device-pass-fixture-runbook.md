# The device-pass fixture account — runbook

**For:** the one device sitting, CUL-1529 (Noticed, Design v2, History v2 and the trial screen, all four on).
**Built by:** CUL-1222 (GC-2, MFU-1, MFU-2, MFU-10, BRK-48). **Last updated:** 2026-10-03.

The sitting runs on a dedicated test account so nothing it logs lands in Nyx's record. This page is every step to get that account ready, in order. Steps marked **PM** are yours; nothing here was run by the session that wrote it, because creating an account and writing `app_config` are yours to do.

## What the account holds

One plus-alias account, four pets. Each pet declares the Signal it leads with, and CI runs the shipped engine over its rows to prove it (`supabase/functions/generate-signal/fixtureStory.detection.test.ts`, every engine key, four hours of the UTC day).

| Pet | What it is for | Declared lead |
|---|---|---|
| **Juniper** (dog) | A venison trial, day 22 of 56: one off-diet chicken treat (6 days ago), one refused dinner (3 days ago). Her Home is the **benign-lead** Home (the chart card, steps 2, 29, 36–43). Today unanswered. | Benign: the time-of-day pattern (a dot-lane chart) |
| **Miso** (cat) | A rabbit trial, day 13: picked at breakfast and refused dinner for eight days; vomiting fell week over week. The **safety-lead** Home and the **refusing-trial** pet (steps 3, 17, 32, 42). | Safety: intake decline |
| **Pepper** (dog) | No trial. Yesterday is the **long record** (21 rows, step 5); 6 days ago is the **grazer's day** (step 28); the **Noticed** seed runs here (steps 6, 20). The **quiet** Home and the **second pet with no trial** (step 45). | None: the Signal's building state |
| **Fig** (cat) | **Brand new**, nothing logged. Every designed empty state. | None |

Never seeded, on purpose: an AI read (only a real analyze call writes one), a look (looks go through the app), a medication, a photo.

## 1 · Create the account (PM, once)

1. On the dev client, sign up with `<your address>+culprit-fixture@<your domain>`, e.g. `danieljmarkii+culprit-fixture@gmail.com`. The tag must sit right before the `@`; the seed refuses anything else, and it refuses the App Review demo account by construction.
2. Confirm the email from your inbox.
3. **Stop at "add your pet"**: close the app. The seed refuses an account that owns any pet that is not one of its four, so a pet made in onboarding blocks it.
4. Read the account's id (Supabase MCP `execute_sql`):
   ```sql
   SELECT id, email FROM auth.users WHERE email = '<alias>';
   ```

## 2 · Allowlist it on all four flags (PM, once, one recorded update)

Run these three statements in order and paste the before and after into CUL-1529.

```sql
-- before
SELECT key, value FROM app_config
 WHERE key IN ('daily_look', 'design_v2', 'history_v2', 'trial_screen') ORDER BY key;

-- the update: appends the fixture id to each flag that is still dark and does not already list it
WITH fixture AS (
  SELECT id::text AS uid FROM auth.users
   WHERE email = '<alias>' AND split_part(email, '@', 1) LIKE '_%+culprit-fixture'
)
UPDATE app_config c
   SET value = jsonb_set(c.value, '{allowlist}', COALESCE(c.value -> 'allowlist', '[]'::jsonb) || to_jsonb(f.uid)),
       updated_at = now()
  FROM fixture f
 WHERE c.key IN ('daily_look', 'design_v2', 'history_v2', 'trial_screen')
   AND COALESCE((c.value ->> 'enabled')::boolean, false) = false
   AND NOT (COALESCE(c.value -> 'allowlist', '[]'::jsonb) ? f.uid)
RETURNING c.key, c.value;

-- after
SELECT key, value FROM app_config
 WHERE key IN ('daily_look', 'design_v2', 'history_v2', 'trial_screen') ORDER BY key;
```

The `WITH` resolves the id from the alias and re-checks the tag, so a mistyped address updates nothing (zero rows returned means stop, not "already done": compare the before and after). Allowlist values are readable by every signed-in client (B-744); that is why the demo account is never allowlisted, and it is harmless for a test account. Each flag's GA PR retires its row, allowlist included.

## 3 · Seed the account (PM, the morning of the sitting)

1. Emit the SQL (Deno, from the repo root). Dry run first:
   ```bash
   deno run scripts/emit-fixture-seed.deno.ts --user <uuid> --email <alias> --timezone America/New_York --dry-run > fixture-dry.sql
   ```
   Run `fixture-dry.sql` through Supabase MCP `execute_sql`. It writes, reads each pet's live-event count back, then rolls back. Expect four rows (Fig with 0 events) and `active_trials` = 1 for Juniper and Miso.
2. Emit and run the live seed (the same command without `--dry-run`). It is upsert-only, so running it again later moves every seeded row back to its place and revives any you removed. Rows you log during the sitting are kept.
3. Any `fixture seed refused: …` means nothing was written. The message names the check: the id and the email disagree, the email is not an alias, the account owns a non-fixture pet, or a fixture id belongs to someone else.

Use your own time zone for `--timezone`; it is stored on the account and only the time-of-day lane reads it.

## 4 · On the phone (PM)

1. Sign in to the fixture account on the dev client. Settings → Early access → **Noticed**, **Design v2**, **History v2**, **Diet trial screen**, all on.
2. Open the Metro console (`j` in the Metro terminal opens the debugger) and run, with Pepper's Home open:
   ```js
   await __seedNoticed('Pepper')
   ```
   It refuses any account but the fixture account and any pet that account does not own. A re-run fills only the days that are missing.
3. For step 1 of the sitting, the forced cold start:
   ```js
   await __forceColdStart()
   ```
   then press `r` in Metro. The next launch's first sync blocks behind the real cold-start wait once.
4. **The worth-a-call day (steps 23, 61–66)** is a live photo read, never seeded. Log it on **Miso** (already a safety Home), with a photo you expect to read as worth a call; if the read lands on another verdict, note it and carry on. Do not log it on Juniper: a red flag would replace her benign lead, and the chart steps would have nothing to judge.

## 5 · Check the leads (PM, the morning of the sitting, after Home has opened each pet once)

```sql
WITH fixture AS (SELECT id FROM auth.users WHERE email = '<alias>')
SELECT p.name,
       s.generated_at,
       s.is_building,
       s.findings -> 0 -> 'finding' ->> 'type'          AS lead_type,
       s.findings -> 0 -> 'finding' ->> 'priorityClass' AS lead_class
  FROM pets p
  JOIN fixture f ON p.user_id = f.id
  LEFT JOIN LATERAL (
        SELECT * FROM ai_signals a WHERE a.pet_id = p.id ORDER BY a.expires_at DESC LIMIT 1
       ) s ON true
 ORDER BY p.name;
```

Expect: Juniper `timeofday_clustering` / `insight`; Miso `intake_decline` / `safety`; Pepper and Fig building (no lead). A different answer means the engine or its flags moved since CI last certified the story: post it on CUL-1529 before the sitting rather than judging the wrong card.

## What the old seed got wrong, and what changed (BRK-48)

| Was | Now |
|---|---|
| 7:04 PM on every day, today included: a morning seed wrote a future look that outranked the PM's own tap | Today's look sits a minute before the seed runs, never before local midnight |
| Doubled on a re-run | Idempotent by day: a day already answered, or already holding a seeded vomit, gets nothing new |
| Took any pet id and any species | Fixture account only; the pet must be the account's own; the species is the record's |
| Vomits by raw `INSERT`, no push, no Signal regen | Vomits through `insertSimpleEvent` (push and regen included), never today's |
