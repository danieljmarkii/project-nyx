# Migration 107: every uploaded row carries the server's time

**Date:** 2026-10-22 · **Issue:** [CUL-2073](https://linear.app/projectnyx/issue/CUL-2073) · **Branch:** `claude/mixed-meals-adhoc-10220037a` · shipped via #1276

## What shipped

Migration 107, schema only and not yet applied. The 15 last-write-wins sync tables' `trg_<t>_updated_at` now fire BEFORE INSERT OR UPDATE, so a row logged offline and uploaded late lands with the server's time, not the phone's, and no other phone's incremental pull can skip it.

## Decided

- **PM go, "go a" (2026-10-22):** the plan, with no backfill. A row already skipped returns on that phone's next cold pull. Restamping every row would re-download every history and fire the AFTER UPDATE triggers on events and meals.
- **PM ruling "A" (2026-10-22):** the [CUL-2074](https://linear.app/projectnyx/issue/CUL-2074) tombstone-final line came back out of 107, which unseats "park 2074"'s "rides with 107". CUL-2074 now waits for [CUL-2096](https://linear.app/projectnyx/issue/CUL-2096).

## What broke and held

- **The insert stamp held.** Fifteen probes on a scratch Postgres 16 (001 to 106 replayed over a Supabase stub), insert and upsert as a signed-in owner: all 15 tables took `now()`. On 106 alone all 15 kept the phone's time. Rollback took 0 of 15 off INSERT; re-apply put 15 of 15 back.
- **`rls-privacy-reviewer`: BOUNDARY HOLDS.** It also found 107 closes a quiet hole: an insert carrying `updated_at = 2099` used to keep it, pinning every other phone's watermark years ahead.
- **`adversarial-reviewer` broke the CUL-2074 line.** The case: A makes a mix and loses both answers, B goes back to one food, A retries. A's stale parent wins and says "mix of 2"; with tombstones kept, no food is live, so the meal names no food and an off-diet heads-up drops. On 106 the same case reads X+Y, wrong but loud. The line turned a loud wrong into a quiet one. Out of 107; the root cause (a stale parent retry always wins) is [CUL-2096](https://linear.app/projectnyx/issue/CUL-2096), which is live in a narrower form today.

## Residuals

- A phone whose clock runs ahead of the server keeps its own copy of a row the server has since changed, until its next edit. The same last-write-wins skew 075 notes; 107 neither causes nor fixes it.
- `meal_components` still uploads every batch twice (CUL-2051's `serverStamp`). It is now redundant, and [CUL-2091](https://linear.app/projectnyx/issue/CUL-2091) retires it after 107 is applied.

**One thing (re-ask):** D4 L1 — A test is proven by breaking the code it guards (from 2026-10-21, row 3: the first fixture for the reversed check stayed green with the bug put back; what would that have told you about the fix?) · check: pending
**One thing:** T2 L1 — The sync queue: a timestamp is only as good as the clock that wrote it · check: pending

### One thing — whose clock wrote the time (T2, L1)
The phone saves every entry first and uploads it later, and each phone later asks the server "what changed since the last time I looked?" That question only works if every row's "changed at" time comes from one clock. Before 107, an update got the server's time but a brand-new row kept the phone's, so an entry logged with no signal at 9:00 and uploaded at 10:00 arrived stamped 9:00, behind where the other phone had already looked.

**Like:** an office inbox sorted by the date written on each letter instead of the date it arrived. A letter written last week and delivered today files itself under last week, and anyone who already read last week's pile never sees it.

**In today's work:** `supabase/migrations/107_insert_stamps_updated_at.sql:83`
```
CREATE OR REPLACE TRIGGER trg_events_updated_at
  BEFORE INSERT OR UPDATE ON public.events   -- was BEFORE UPDATE: new rows now get the server's clock too
```

**Why it matters to you as PM:** "the second phone never shows it" was a data bug with no error anywhere, and the same shape (a time that came from the wrong clock) sits behind several sync rulings you will see again.

**Check:** After 107, a phone whose clock is set an hour fast uploads an entry at 10:00 server time. What time does the server store for it, and why?
