# B-441 — the regimen day counter joins the one day-boundary primitive, and three more instances of the same bug came with it

**Date:** 2026-07-31

Shipped via **#524**. Closes the last carve-out in the B-421 guard test; unblocks **B-614** (the Home medication strip, whose day counter must route through the same primitive). Spawned **B-618** (filed as B-616; renumbered at wrap — `main` took that ID via #520).

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

- **`regimenDaysElapsed` moved to `lib/medications.ts`** and re-anchored on `localDayIndexOf` (start) + `localDayIndex` (today) — calendar-component indexing, so a `DATE` is never re-read as UTC midnight and every local day advances the count by exactly 1 regardless of DST. Client-side there is now **one** definition of "a day".
- **`app/(tabs)/profile.tsx` holds no day arithmetic at all.** `formatRegimenStart` parses the stored key with `dayKeyToLocalDate`; the `Day N` / `Started …` choice is precomputed in `buildRegimenDisplay` alongside the other derived lines, matching the file's own convention.
- **`AddMedicationModal`** reads with `dayKeyToLocalDate` and writes with `toLocalDayKey`.
- **Unknown is now a state, not a `NaN`.** `regimenDaysElapsed` returns `number | null`; `RegimenComplianceInput.daysElapsed` accepts null and routes to `percent = null` ("not tracked"). The old code produced `NaN` for an unreadable date and rendered **"Day NaN of 14"**.

### The false-absence branch that null made reachable

`regimenComplianceLine` had one `percent == null` branch and it returned **"No doses logged yet"**. That was safe only because of an invariant the null breaks: with `daysElapsed ≥ 1` and `dosesPerDay ≥ 1`, `expectedDoses` was always `> 0`, so a non-PRN regimen with logged doses always got a percent. An unknown denominator reaches that branch *with a non-zero tally* — printing "No doses logged yet" over three doses the owner did log.

That is a **false absence claim** in the B-494 shape: silence rendered as a negative result, reading as *"you haven't been giving this"* to an owner who has. The branch now reports the count it knows and claims nothing about the rate.

## The guard test flipped from pinning the flaw to forbidding it

`lib/dietTrialDayMath.guard.test.ts` asserted the defect's continued existence — `divisions).toHaveLength(1)`, `occurrences).toHaveLength(2)`, `toMatch(/function regimenDaysElapsed/)` — as a deliberate carve-out with B-441 named in the comment. Those three assertions are now their negations plus a delegation check, and a fourth was added for the display twin (`not.toMatch(/new Date\(\s*reg\.started_at\s*\)/)`). The budgeted count is gone: the screen holds **zero** day arithmetic, which is a stronger and less brittle guarantee than "exactly one".

## Falsification attempts (adversarial pass, in-context — see caveat below)

| Attempt | Result |
|---|---|
| Does the floor `Math.max(1, …)` let a future-dated start read "Day 1" and flatter the %? | **Held — but only by an external bound.** 1 is the smallest denominator there is, so it *is* the reassuring direction. Unreachable because `AddMedicationModal` sets `maximumDate={new Date()}`. Noted in the code: relax that bound and this floor needs a "hasn't started yet" branch. |
| Does a `null` denominator get silently substituted with 1 anywhere? | **Held.** `safeDays` stays null and `expectedDoses` stays 0; the null flows to `percent = null`. A fallback of 1 would print "100% given" over one dose in a fortnight. |
| Does the degraded path lose the *safety* half? | **Held.** `flaggedDoses` (refused + missed + partial) is independent of the denominator and still counts — a possible disease signal survives an unreadable date. Test added. |
| Does a full ISO timestamp in `started_at` (the local SQLite mirror types it `TEXT`) break it? | **Held.** `localDayIndexOf` falls through to instant-indexing in the owner's zone, which is correct for a timestamp — no `NaN`, no silent wrong day. |
| Do the two zone bugs cancel on a round-trip through the modal? | **Partially, and that is why #3 and #4 both had to be fixed.** Read-UTC + write-UTC round-trips a stored value unchanged while *displaying* the wrong day; touch the picker and the write shifts it. Fixing only one of the pair would have made re-saving walk the date. |

**Caveat, flagged rather than papered over:** the DoD mandates the isolated `adversarial-reviewer` subagent for clinically load-bearing logic, and this session's harness instructions forbid spawning subagents. The falsification pass above was done in-context, which is exactly the anchoring the subagent exists to avoid. **Recommend a `adversarial-reviewer` run on this diff before merge** — the DoD line is not satisfied by the table above.

## Deliberately out of scope → B-618

`attributeDosesToRegimens` bounds its item+window fallback with `d.occurred_at < reg.started_at` — a lexicographic compare of a UTC instant against a local DATE, so the regimen boundary sits at UTC midnight. Same root cause, same fix shape, but a different function with a documented rationale, and changing it **changes dose counts** on the card and in the `ask/tools.ts` port (which the header marks KEEP IN LOCKSTEP). It needs its own test pass, not a ride-along.

## Verification

`tsc --noEmit` clean · **3623 jest tests green** (159 suites), 11 new. Deno suites not run locally (no `deno` binary in this container) — no `supabase/functions/` code is touched and `lib/medications.ts` has no Deno consumer, so CI's Edge Functions job is the check.
