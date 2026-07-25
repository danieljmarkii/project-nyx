# B-421 — the diet-trial day counter is timezone-honest, and there is one of it

**Date:** 2026-07-25

Shipped via **#449**. Prerequisite for B-417 PR 4; spawned **B-441**.

## What was wrong

Four implementations of *"what day of the trial is it"* disagreed by up to two days on a single screen unlock:

| # | Where | What it computed |
|---|---|---|
| 1 | `lib/analytics.ts:841` `getDietTrialProgress` | `Math.floor(ms / MS_PER_DAY)` on both ends — a **UTC** epoch-day index |
| 2 | `supabase/functions/ask/tools.ts:1168` | a faithful port of the same UTC math (it faithfully ported the bug) |
| 3 | `hooks/useTrend.ts:113` | a raw millisecond span with **no `+1`** — off by one by construction, before timezone enters |
| 4 | `app/(tabs)/profile.tsx:106` | `setHours(0,0,0,0)` — device-local midnight, the closest to right |

B-417 §8 instructs PR 4 to unify onto the helper, so the helper had to be corrected *first*: unifying onto the UTC version would have divided a local-day coverage numerator by a UTC-day denominator, silently, at the exact moment the wedge feature finally gets real data.

## What shipped

The day boundary is **LOCAL midnight** — defined once in `docs/nyx-diet-trial-requirements.md` §5.1, now implemented once in `lib/utils`.

- **`localDayIndex(ms, timeZone?)` / `localDayIndexOf(value, timeZone?)`** index *calendar components* via `Date.UTC(y, m, d)` rather than dividing a millisecond span.
- **`getDietTrialProgress`** re-anchored onto that pair.
- **The ad-hoc math in `useTrend.ts` and `profile.tsx` is deleted.** Both call the helper. Client-side there is now exactly one implementation.
- **`ask/tools.ts dietTrialStatus`** ported in lockstep and upgraded past UTC: it buckets by `user_profiles.timezone` (present since migration 001:9) as its neighbours already do — `localHourOfDay` at `tools.ts:1496`, `generate-signal/detection.ts:3137`. `answer.ts` hands it the zone it already loads for `time_of_day`.

### Two things the calendar-component approach fixed that weren't in the brief

**DST.** 6 Mar → 9 Mar in `America/Los_Angeles` is 71 local hours, so a millisecond-span divide floors to 2 and reads Day 3. The truth is Day 4. Indexing calendar days makes every local day advance the index by exactly 1, whether it is 23, 24 or 25 hours long.

**`profile.tsx` was not actually right.** The brief named it "the one that is actually right," and it was the closest — but `diet_trials.started_at` is a Postgres `DATE`, and `new Date('2026-06-10')` parses as **UTC** midnight. Flooring that to local midnight lands it on the *previous* local day for anyone behind UTC, counting one day too many. So `localDayIndexOf` treats a `YYYY-MM-DD` string as an already-resolved calendar day and indexes it verbatim, zone-independently. Copying profile.tsx's approach — the obvious move — would have shipped an off-by-one under the banner of fixing off-by-ones.

### The deliberate side effect

`lib/widgetResolution.ts:355` consumes `getDietTrialProgress`, so the widget header's "Day N of M" moved too. That is the fix: the widget currently disagrees with the profile card on the same day.

## The test-harness trap

The obvious way to test zones is `process.env.TZ = 'Etc/GMT+7'`. **Under jest that silently does nothing** — jest replaces `process.env` with a plain object, which drops Node's TZ setter hook, so `Date` never relocates. The first draft of the suite did exactly that and **passed for the wrong reason**: every assertion ran in one zone and agreed with itself. Verified by probe before rewriting.

The fix was to make the zone an explicit optional argument that every production client caller omits. It earns its keep beyond testability: it is what lets the jest and Deno suites assert the *same numbers against the same instants*, so a drift between client and server port fails a test rather than reaching an owner.

The oracle is written against B-417 PR 4's acceptance criterion, so **PR 4 inherits it**: the counter pinned under UTC−7 and UTC+11 at 00:30 and 23:30 local with all readings agreeing, plus the started-yesterday-local-but-today-UTC case, a DST crossing, and a date-only start that must never be re-read as UTC midnight.

## Verification

**Mutation-checked, not assumed.** Each of the three regressions this change removes was reintroduced and confirmed to turn the suites red before being reverted:

| Mutation | Result |
|---|---|
| helper back to `Math.floor(ms / MS_PER_DAY)` | 8 failures |
| ad-hoc math back in `useTrend.ts` | 2 failures (guard test) |
| Edge port back to UTC | 3 failures (Deno) |

The same skepticism caught a bug in the guard test itself: an initial slice had its bounds reversed (`loadConditions` precedes `loadDietTrial` in the file), returning `''` — which made every `not.toMatch` pass vacuously. A guard test that fails open is worse than no guard test. Now asserted non-empty and correctly ordered before any negative assertion runs.

`tsc --noEmit` clean · jest **1927 passed / 119 suites** · `deno test` **835 passed / 0 failed** · CI green on both required checks.

## What was deliberately not done

**`regimenDaysElapsed` (`profile.tsx`) carries the identical flaw** for medication regimens — same UTC-parse-then-floor-to-local, same DST loss. It was left alone and filed as **B-441**, annotated in place so the next reader is not misled. Reasoning: it is a different feature's counter and it feeds `computeRegimenCompliance` → the clinical-guardrails adherence copy, which has no test coverage on that screen. Moving a clinical compliance number under a timezone PR, untested, is not a call to make silently.

**`TrendZone`'s coverage numerator** still buckets by UTC day while its denominator is now local-day. That is B-417 PR 5's scope (coverage/adherence numerators), flagged in the PR rather than quietly touched. Note the direction: `trialDaysElapsed` is now one *higher*, so the pre-existing chance of rendering >100% compliance strictly *decreased*.

## Backlog

- **B-421** → `Done — 2026-07-25 (PR #449)`
- **B-441** → new, `Open` — route `regimenDaysElapsed` through `lib/utils.localDayIndexOf` when medication regimens are next touched
