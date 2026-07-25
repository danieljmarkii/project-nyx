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

## The adversarial pass failed the first cut, and was right to

`adversarial-reviewer` returned **FAIL** on commit `250cede`. The day-counter arithmetic itself held every attack — DST both directions, non-integer offsets (+05:30, +05:45, +12:45, +14), the `Etc/GMT` sign inversion, an Intl-vs-`Date` parity sweep of 13 zones × 3600 instants with 0 mismatches, and the `en-US` hardcode that (deliberately) blocks a Buddhist-era year from a `th-TH` device. What failed were **claims the diff made about its own blast radius**. All three reproduced.

**1. The docstring asserted an invariant the diff itself violated.** `analytics.ts` claimed *"coverage numerators are local-day too, so this keeps the numerator and the denominator on the same clock"* — but `useTrend.ts` still keyed its numerator by **UTC** day (`occurred_at.split('T')[0]`) while the denominator had just moved to **local**. Reproduced: LA owner, trial from 10 Jun, two meals a day, at 20:00 local on the 14th → Home renders **"6 of 5 days logged — 120% food compliance"** beside the profile card's 100%, same pet, same second.

I had flagged this area as out of scope and claimed the risk "strictly decreased." That was directionally true about *magnitude* (peak 125–133% → 120%) and wrong about *kind*: before, both sides were UTC-ish; this change made the mismatch structural. **Fixed** — the numerator now keys on `toLocalDayKey`, verified 6-of-5/120% → 5-of-5/100%. The clock only; the trial-food filter is still B-418 and redefining the metric is still B-417 PR 5.

**2. "One implementation" was true client-side only.** `generate-report/report.ts:1979` keeps its own counter and `render.ts:921` prints it as the report *headline*. It floors at 0 rather than 1 (a future-dated start prints **"day 0 of 14"** where the card says Day 1) and anchors on scope end rather than today (an owner on day 15 requesting a 3-day window gets **"day 3 of 14"**). Not changed — the vet report headline needs a cold-read pass — but recorded as **B-442**, and the guard test now pins the divergence as a known fact instead of leaving it to be rediscovered.

**3. The G5 parity claim breaks exactly where the two "mirror" suites can't look.** Every shared case passes an *explicit* zone, so the only place the implementations differ by construction was untested. Client fallback is the device zone; server fallback is UTC → Sydney owner with no stored zone: card Day 5, Ask Day 4. And the reachable case is worse: `user_profiles.timezone` is `NOT NULL DEFAULT 'America/New_York'`, so an unstamped profile never *reaches* the fallback — it buckets a Kolkata owner by New York for ~10.5h of every day with nothing aware. Filed as **B-443**; both cases now pinned by tests so the gap is sized rather than assumed away.

**Also fixed from the same pass:** `localDayIndexOf`'s regex validated shape, not validity, and `Date.UTC` rolls over — `'2026-13-45'` became 2027-02-14 and reported a confident wrong day instead of the documented `null`. Now round-trip-validated. And one of my own new tests asserted a literal (`5`) that only holds in a band of host zones — it failed under `TZ=Pacific/Kiritimati`, where the device day genuinely *is* 6. It now asserts the property (equals the no-zone result), because `jest.config.js` pins no TZ and a literal there was CI's UTC leaking into the assertion rather than a claim about the code.

The lesson worth keeping: the arithmetic was the easy part and survived everything. What broke was every sentence I wrote about what the change *touched*.

## What was deliberately not done

**`regimenDaysElapsed` (`profile.tsx`) carries the identical flaw** for medication regimens — same UTC-parse-then-floor-to-local, same DST loss. It was left alone and filed as **B-441**, annotated in place so the next reader is not misled. Reasoning: it is a different feature's counter and it feeds `computeRegimenCompliance` → the clinical-guardrails adherence copy, which has no test coverage on that screen. Moving a clinical compliance number under a timezone PR, untested, is not a call to make silently.

**`TrendZone`'s coverage numerator** still buckets by UTC day while its denominator is now local-day. That is B-417 PR 5's scope (coverage/adherence numerators), flagged in the PR rather than quietly touched. Note the direction: `trialDaysElapsed` is now one *higher*, so the pre-existing chance of rendering >100% compliance strictly *decreased*.

## Backlog

- **B-421** → `Done — 2026-07-25 (PR #449)`
- **B-441** → new, `Open` — route `regimenDaysElapsed` through `lib/utils.localDayIndexOf` when medication regimens are next touched
- **B-442** → new, `Open` — the vet report's own trial day counter (`report.ts:1979`), which prints "day 0" where the card prints "Day 1"
- **B-443** → new, `Open` — `user_profiles.timezone` stamping; Ask's counter is only as good as the stored zone, and its `NOT NULL DEFAULT 'America/New_York'` cannot express "unknown"
