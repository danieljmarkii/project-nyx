# Engines v3 PR-14b — the intake-decline detectors exclude a free-fed bowl by instant (CUL-1086, CUL-1396)

**Date:** 2026-09-28

Shipped via #970 (CUL-1086), which depends on #973 (CUL-1396, migrations 076–078).

## What shipped

- **One predicate for "was this rating a free-fed bowl?"**: `lib/freeFedIntake.ts`, pure, imported by the phone's detector (`lib/analytics.ts`), `generate-signal/detection.ts` (② and `rate_meals`) and the vet report. A rating is a bowl only if it was logged between the bowl's toggle-on (`created_at`) and toggle-off (`ended_at`). Where an instant is missing the rating counts: a pre-076 end closes at the earliest its local date could begin (UTC+14), a missing `created_at` opens once `active_from` has ended everywhere (UTC−12), and `ended_at` on a re-opened row is ignored.
- **Schema (#973):**
  - 076 adds a nullable `feeding_arrangements.ended_at` (no constraint, C-38), backfilled from `updated_at` (3 rows).
  - `endFreeChoice` writes it; sync push and hydrate carry it.
  - The column upgrade clears the table's hydrate watermark once, in `initDb` (the write layer, C-33), and hydrate fills a local NULL from the server.
  - 077 (a server stamp trigger) shipped and was dropped by 078 in the same session.
  - All three migrations are applied to production.
- **Phone:** `getIntakeDecline` and the daily look's `getQualifyingIntakeMeals` read every free-choice arrangement, ended included, with no food-cache join.
- **Report:**
  - Arrangements are kept by date overlap OR by the predicate covering a window meal (the cross-zone case).
  - The flag appendix lists bowl ratings dated and tagged "free-fed bowl"; they are never the anchor and never in page 1's trajectory. The counted meals are capped separately.
  - Page 1 says how many bowl ratings the flag did not count and how many fall after the last full meal. The caption says "watched".
- `SIGNAL_ENGINE_VERSION` bumped to `signal.2`, which also covers PR-14 (CUL-1190), since it shipped under `signal.1`.

## How it got there (five adversarial rounds, three PM rulings)

1. **By food** (the phone's historic rule, mirrored first). Round 1 broke it three ways:
   - an owner leaving down the food the cat just refused erased the refusals;
   - a past report window read June's meals against a later bowl;
   - a bowl taken up yesterday became page 1's last full meal.

   PM: go by date.
2. **By date, parsed as the UTC day** (the Patterns convention). Round 2:
   - refusals watched on the take-up day vanished;
   - behind UTC, a bowl's evening "ate it all" counted as watched;
   - ahead of UTC, the report's detector and appendix disagreed.
3. **An uncertain window split by the n=1 asymmetry** (count refused/picked, set aside the rest). Round 3:
   - low bowl ratings entered the baseline and a food's normally-eaten history, lowering the bar a later drop had to clear (both surfaces silent);
   - "some" was set aside though the cat detector treats it as a concern day;
   - the report called watched meals bowl ratings.

   PM: record the instant (`ended_at`).
4. **By instant.** Round 4 held on every earlier probe and found three gaps:
   - old builds end without the instant (E1);
   - upgraded phones never re-pulled it (E2);
   - the report's local-date filter dropped a bowl whose instants reached the window (E3).

   All three fixed; E1 by trigger 077.
5. Round 5 held E2 and E3 and broke 077 three ways, on PostgreSQL 16:
   - the server can only stamp late, hiding offline refusals;
   - PostgREST's upsert fires BEFORE INSERT on the proposed row, overwriting a current build's true instant;
   - a re-opened, then re-ended row kept a stale instant.

   PM: drop 077 (078). The builds it served are held by no real owner (1.2.0 is the first).

The lesson that recurs: each inference rule failed on the edge where the record lacked a fact. Adding the fact (`ended_at`) ended the rounds that inference could not.

## Reviews

- **Adversarial (Biostatistician):** five rounds, all counterexamples named in #970 and on CUL-1086. The final state holds every counterexample from rounds 1–4 on current builds.
- **Parity:** `lib/intakeDeclineParity.test.ts` drives the two real detectors over 4,000 generated records and requires the same verdict. The generator covers zones UTC−12…+14, toggles, and missing instants; the floors are 352 fired and 228 decided by the bowls.
- **Cold read (Dr. Chen):** three rounds.
  - Round 1: NOT READY. The page-1 disclosure was missing and the bowl rows were hidden.
  - Round 2: better than before; three copy defects.
  - Round 3: two copy fixes (the caption word and the sentence order), both done.
  - Pre-existing blockers filed as CUL-1394.
- **Privacy (`rls-privacy-reviewer`, 076):** PASS. The row-scoped policy covers the column. The condition that readers ignore `ended_at` while `active_until` is NULL is pinned.
- **Code review:** comment-accuracy fixes applied.

Every rule is proven by mutation. Final runs: tsc clean, jest 12,821, Deno 2,065.

## Residuals

- Builds without #973's client write fall back to the date for their take-ups (dogfood devices only, until they update).
- A crash between the column upgrade and its watermark reset is not retried on that device (low).
- The rate and top-foods cards, the Signal summary's finished rate, and Ask's tools still exclude by food (CUL-1392).
- An untouched free-fed bowl has no way to escalate on either surface (CUL-1391, a PM ruling).
- Pre-existing report copy: "owner-observed" vs "not directly observed", the Appendix E subtitle, and the unanchored "32 h" (CUL-1394).
