# B-441 — the regimen day counter joins the one day-boundary primitive, and three more instances of the same bug came with it

**Date:** 2026-07-31

Shipped via **#524**. Spawned **B-621/B-622/B-623** (filed as B-616/B-618/B-619/B-620 and renumbered twice — see the collision note at the end).

> **⚠️ Read this first — the PR was re-cut at wrap.** A sibling session fixed B-441 independently and landed it on `main` as **#525** while this branch was open. That fix covers the **READ** half only: the counter and the `Started …` label. It does **not** touch the write path, so `AddMedicationModal` still wrote `startedAt.toISOString().split('T')[0]` and `handleEndRegimen` still wrote `ended_at` the same way.
>
> **That combination is worse than either bug alone**, and it is exactly the configuration the `adversarial-reviewer` flagged on this branch: a corrected reader consuming rows a broken writer is still producing, trusting a skew it can no longer detect. So this PR was **re-cut on top of #525** — its counter implementation is kept wholesale (it landed first and is equivalent), and what remains here is the half `main` lacks.

## What was wrong

B-421 unified the *diet-trial* day counter onto `lib/utils.localDayIndexOf` and deliberately left the *medication regimen* counter alone on scope grounds, annotating it in place. That annotation was accurate and the defect was real:

```ts
function regimenDaysElapsed(startedAt: string): number {
  const start = new Date(startedAt);   // ← a DATE parsed as UTC midnight
  start.setHours(0, 0, 0, 0);          // ← then floored to LOCAL midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1);
}
```

`medications.started_at` is a Postgres `DATE` (migration `020_medication_logging.sql:169`). `new Date('2026-07-31')` is UTC midnight, which for anyone behind UTC is *the previous local day* — so the start landed a day early and the count read one too high. The millisecond-span divide also loses an hour across a DST transition, so a 23-hour local day can floor away entirely.

It feeds `computeRegimenCompliance` → `regimenComplianceLine`, i.e. `clinical-guardrails` adherence copy, and it had no test coverage.

### The counter was only half of it

Grepping every consumer of `medications.started_at` found **three more instances of the same date-only↔UTC round-trip**, all on the same feature. Two of them are on the same *line of UI* as the counter:

| # | Where | What it did |
|---|---|---|
| 1 | `profile.tsx` `regimenDaysElapsed` | the counter above — read one day high behind UTC |
| 2 | `profile.tsx` the `Started …` fallback | `new Date(reg.started_at).toLocaleDateString()` — **named** the previous day behind UTC |
| 3 | `AddMedicationModal:143` (read) | `new Date(existing.started_at)` seeded the picker and its label with the previous day |
| 4 | `AddMedicationModal:208` (**write**) | `startedAt.toISOString().split('T')[0]` — a **UTC** day key |

**#4 is the one that made the fix necessary rather than cosmetic.** It is the mirror image of #1–#3: it breaks for owners *ahead* of UTC. Local midnight in Sydney is still yesterday in UTC, so an owner picking "today" stored **yesterday**, permanently, in the database. Fixing the counter while the stored value was wrong would have been half a fix for half the world — and #3 + #4 together mean a behind-UTC owner who edits a regimen sees yesterday's date in the picker, which is the display bug feeding the write bug.

## The direction of the error, stated because it is the opposite of the guess

An inflated `daysElapsed` inflates `expectedDoses`, and `percent = given ÷ expected`. So the bug made the app **under-report** adherence:

> Day 1 of a 2×/day course, owner in PDT, both doses given.
> **Was:** `Day 2 of 14 · 50% given · 2 of 4 doses`
> **Now:** `Day 1 of 14 · 100% given · 2 of 2 doses`

Reported compliance therefore **rises** for most of the user base — the Americas are all behind UTC. That is accuracy, not softening, but it is a visible change to a clinical number and it should not arrive unexplained.

## What shipped

**The counter half — superseded by #525, and its implementation is what shipped.** This branch and the sibling reached the same design independently (`regimenDaysElapsed` in `lib/medications`, anchored on `localDayIndexOf` + `localDayIndex`, returning `number | null`, with `formatRegimenStart` parsing via `dayKeyToLocalDate`). #525 landed first, so its version is kept verbatim. The one substantive difference is null handling: #525 routes a null denominator to the PRN path (`dosesPerDay: null`), where this branch widened `RegimenComplianceInput` to accept null. #525's is simpler, reaches the same honest "count, not a percent" outcome, and is already merged — so it stands, and this branch's version was discarded rather than argued for.

**The write half — what this PR actually contributes, and what `main` does not have:**

- **`AddMedicationModal` WRITE** — `toLocalDayKey(startedAt)`, was `toISOString().split('T')[0]`. The mirror bug: local midnight in Sydney is still yesterday in UTC, so an owner ahead of UTC picking "today" stored **yesterday**, permanently. **#525's corrected counter reads those rows one day low.**
- **`AddMedicationModal` READ** — `dayKeyToLocalDate`, was `new Date(existing.started_at)`; seeded the picker and its label with the previous day behind UTC.
- **`handleEndRegimen`** — `ended_at` via `toLocalDayKey`, fourteen lines below code #525 rewrote. It widens `attributeDosesToRegimens`' upper bound and the vet report's regimen span.
- **The dead `todayDateOnly()` UTC-key helper**, still sitting in the file #525 de-UTC'd (`tsconfig.json` has no `noUnusedLocals`).

### The false-absence trap both branches had to avoid (and did, differently)

`regimenComplianceLine`'s single `percent == null` branch returns **"No doses logged yet"**, which is safe only because of an invariant a null denominator breaks: with `daysElapsed ≥ 1` and `dosesPerDay ≥ 1`, `expectedDoses` was always `> 0`, so a scheduled regimen with logged doses always got a percent. Introduce a null and that branch becomes reachable *with a non-zero tally* — printing "No doses logged yet" over doses the owner did log. That is a **false absence claim** in the B-494 shape, reading as *"you haven't been giving this"* to someone who has.

Both implementations avoided it, by different routes: this branch added an explicit `loggedDoses > 0` branch, #525 routes the null through `dosesPerDay: null` so the PRN path (which already reports a count) handles it. #525's shipped. Worth recording because the trap is invisible until someone makes `daysElapsed` nullable, and the next person to touch this — B-614's Home strip — will be doing exactly that.

## The guard test flipped from pinning the flaw to forbidding it

`lib/dietTrialDayMath.guard.test.ts` used to assert the defect's *continued existence* as a deliberate carve-out. #525 flipped those assertions to their negations, which is right and is kept.

**But #525's guard passed while #525's own write bug was live in a file it guards** — because it forbids `new Date(reg.started_at)`, bound to the identifier `reg`, and says nothing about the write direction at all. A guard that covers only the direction you happened to fix certifies the other by silence.

So this PR adds a guard on the **class**: two patterns (`.toISOString().split('T')[0]` / `.slice(0,10)`, and `new Date(<any>.started_at|ended_at|completed_at)`) across both medication surfaces. It was mutation-tested rather than assumed — reintroducing the UTC key fails the suite, restoring it passes. Five instances of one defect in one feature, three of them in files a prior fix had already edited, is the argument for guarding the shape instead of the sighting.

## Falsification attempts (adversarial pass, in-context — see caveat below)

| Attempt | Result |
|---|---|
| Does the floor `Math.max(1, …)` let a future-dated start read "Day 1" and flatter the %? | **Held — but only by an external bound.** 1 is the smallest denominator there is, so it *is* the reassuring direction. Unreachable because `AddMedicationModal` sets `maximumDate={new Date()}`. Noted in the code: relax that bound and this floor needs a "hasn't started yet" branch. |
| Does a `null` denominator get silently substituted with 1 anywhere? | **Held.** `safeDays` stays null and `expectedDoses` stays 0; the null flows to `percent = null`. A fallback of 1 would print "100% given" over one dose in a fortnight. |
| Does the degraded path lose the *safety* half? | **Held.** `flaggedDoses` (refused + missed + partial) is independent of the denominator and still counts — a possible disease signal survives an unreadable date. Test added. |
| Does a full ISO timestamp in `started_at` (the local SQLite mirror types it `TEXT`) break it? | **Held.** `localDayIndexOf` falls through to instant-indexing in the owner's zone, which is correct for a timestamp — no `NaN`, no silent wrong day. |
| Do the two zone bugs cancel on a round-trip through the modal? | **Partially, and that is why #3 and #4 both had to be fixed.** Read-UTC + write-UTC round-trips a stored value unchanged while *displaying* the wrong day; touch the picker and the write shifts it. Fixing only one of the pair would have made re-saving walk the date. |

**The in-context pass was run first and was not sufficient — the isolated `adversarial-reviewer` returned FAIL and found what it missed.** That is the whole argument for the subagent, demonstrated on this diff: the six attempts above were authored by the same reasoning that wrote the code, and every one of them probed the code's *new* behaviour. None probed the code's behaviour on **data the old code had already written**.

### The adversarial-reviewer's blocking finding: the fix removed a COMPENSATING error

The old writer stored `startedAt.toISOString().split('T')[0]`, and `startedAt` carries the **current time of day** (`useState<Date>(new Date())`), not midnight. So an owner behind UTC creating a regimen in the evening — 20:37 in `America/New_York`, the canonical "home from the vet" moment — crossed the UTC rollover and stored **tomorrow's** date:

```
picked (local):  2026-06-09 20:37 EDT
old writer:      2026-06-10        ← one day LATE, permanently
```

On that row the two bugs cancelled, so the **old counter was correct** and the new one reads one day **low**:

| | `daysElapsed` | line rendered |
|---|---|---|
| old code on a skewed row | 10 (correct) | `90% given · 18 of 20 doses` |
| **new code on a skewed row** | **9** | **`100% given · 18 of 18 doses`** |

Two unlogged doses vanish into a shrunken denominator, and nothing else on the card carries the fact — `flaggedDoses` is 0 because nothing was logged as `missed`, so `regimenFlagLine` is null. The denominator *was* the only signal. The progress bar fills to 100%. That is a manufactured reassurance on a `clinical-guardrails` surface, in the direction the guardrail exists to forbid — reproduced against the shipped modules, not simulated.

It also splits the "compliance rises" claim above in two, and only one half was true: rows created **before** the local UTC rollover were stored correctly and the fix corrects them; rows created **after** it were stored a day late and the fix pushes them *past* the truth.

**Blast radius, measured rather than assumed:** the triage query below returns **0 rows** against live production (3 regimens total). So the defect is real and confirmed but has no live victims today, and the fix is safe to land on the current data.

```sql
SELECT m.id, m.started_at, m.created_at, up.timezone
FROM medications m
JOIN pets p ON p.id = m.pet_id
LEFT JOIN user_profiles up ON up.id = p.user_id
WHERE m.started_at =  (m.created_at AT TIME ZONE 'UTC')::date
  AND m.started_at <> (m.created_at AT TIME ZONE coalesce(up.timezone,'America/New_York'))::date;
```

What remains is a **mixed-client window**: an un-updated TestFlight/OTA client keeps writing UTC-keyed starts that an updated client then reads one day low. Tracked as **B-619**; re-run the query before the next TestFlight cut.

### Its second finding: the same defect class survived in the files this PR edited

The record above claimed a grep of "every consumer of `medications.started_at`". The defect is a *pattern*, not a column, and grepping the pattern found two more — both fixed in this PR after the review:

- **`profile.tsx:549`** — `handleEndRegimen` wrote `ended_at: new Date().toISOString().split('T')[0]`, the identical UTC day key, **fourteen lines below** code this PR had already rewritten. It widens `attributeDosesToRegimens`' upper bound and the vet report's regimen span.
- **`AddMedicationModal.tsx:102`** — `todayDateOnly()`, the exact same helper, left as **dead code** in the file this PR de-UTC'd. `tsconfig.json` has no `noUnusedLocals`, so nothing flagged it.

**So the guard test was rewritten against the CLASS rather than the instances.** The first version pinned `new Date(reg.started_at)` — bound to the identifier `reg`, defeated by renaming it to `r`, and pinning only the past. It now forbids two patterns (`.toISOString().split('T')[0]` / `.slice(0,10)`, and `new Date(<anything>.started_at|ended_at|completed_at)`) across both medication surfaces. Five instances of one defect in one feature, three of them in files a previous fix had already touched, is the argument for guarding the shape instead of the sighting.

### Findings accepted but not acted on

- **Unrated doses go unqualified** in the new `percent == null` branch: 6 `unrated` (B-156 G1 *unconfirmed* — evidence **against** compliance) renders `6 doses logged` with no counterpart line. Real, but confined to the unreachable path below. → **B-620**.
- **The whole `null` path is unreachable in production.** `started_at` is `DATE NOT NULL`, PostgREST always returns a well-formed key, and `lib/sync.ts` mirrors it verbatim. The null plumbing is *defensive*, not load-bearing — corrected in the record above rather than left as the PR's safety story.
- **`generate-report/report.ts:3633`** computes its own windowed expected-dose denominator from the same column. Zone-correct on its own terms and asking a deliberately different question, so not a disagreeing counter — but it inherits the skew, which is why B-619 covers the report too.
- **Device-zone dependence** (the card buckets by device zone, the report by `user_profiles.timezone`) is pre-existing, is B-443's shape, and is not a regression of this PR.

## Deliberately out of scope → B-618

`attributeDosesToRegimens` bounds its item+window fallback with `d.occurred_at < reg.started_at` — a lexicographic compare of a UTC instant against a local DATE, so the regimen boundary sits at UTC midnight. Same root cause, same fix shape, but a different function with a documented rationale, and changing it **changes dose counts** on the card and in the `ask/tools.ts` port (which the header marks KEEP IN LOCKSTEP). It needs its own test pass, not a ride-along.

## Verification

`tsc --noEmit` clean · **3636 jest tests green** (160 suites), 13 new. CI green on both required checks (`App (typecheck + jest)`, `Edge Functions (deno test)`). Deno suites not run locally (no `deno` binary in this container) — no `supabase/functions/` code is touched and `lib/medications.ts` has no Deno consumer, so CI's Edge Functions job is the check.

**Process note worth keeping.** This session flagged the missing `adversarial-reviewer` pass three times as a known DoD gap and was ready to describe the work as done without it, on the strength of an in-context falsification table that looked thorough and was. The subagent then returned FAIL inside ten minutes on a case that table structurally could not reach. The isolation is not ceremony — the in-context reviewer inherits the build's frame, and this diff's frame was *"the old code was wrong, the new code is right"*, which is precisely the assumption the blocking finding violates.
