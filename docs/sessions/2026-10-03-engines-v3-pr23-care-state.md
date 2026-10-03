# Engines v3 PR-23: EN-9's care state on the live safety finding, built dark

**Date:** 2026-10-03
**One thing:** S3 L1 — A flag changes behaviour by a row, not a release · check: pending

Dispatched session (`/dispatch`, Engines v3 round), BUILD on CUL-1417. Shipped via #1016.

## What shipped

- **`supabase/functions/generate-signal/careState.ts`** (new, pure): each concern (a chronicity or worsening safety finding) gets `careState`: raised, `with_vet`, `recheck_booked` or `raised_again`.
  - **Answers and lapses (§3.2):** it reads the owner's answers, using the newest live one per sign. An answer stops counting when it is retracted, when its concern stood down, when it is a visit answer for a visit before onset, when its trial passes the initial target or its course ends, or when its date lies in the future.
  - **Re-raise triggers:** the exact conditional binomial against a frozen reference, with the 10-of-14 floor and t / t+7..14 persistence (§4.2); the dense-day arm (§4.3); C1a's co-signs (diarrhea ↔ vomiting, and lethargy, on 2+ days, new against the 28 days before the anchor, every row after the answer); the cough/vomit pair.
  - **The latch:** `raised_again` holds until a newer answer.
  - **Text and rank:** sentences are template-only, and no zero appears beside a masking drug or a recent visit. A watched concern ranks below every other safety finding, and nothing else moves.
- **Pipeline step 3d**, behind a new Signal key `engines_v3_en9` (unseeded). It is skipped over an incomplete read or when the logging facts did not answer.
- **The shell**: `readCareRecord` reads behind the key, by explicit columns, paged. Care-state cards never reach the model. Version is now `signal.7`.
- **Ask** leads with a raised finding over a watched one and relays only the state word.
- **Home**: `lib/careState.ts` is the one client reader. `signalHomeLine` drops the ask on a watched state. The rendering is PR-35.
- **Guards**:
  - The report never names the care tables or `careState` (AC 9, proven by a planted import).
  - The shell's columns are pinned in `visitReaders`.
  - The co-sign list is registered with a membership walk row (proven by mutation).
  - `dietTrialProvenance` registers the one `target_duration_days_initial` read.
  - The C-36 absence guard `(c-en9)`, an AC-3 property test, and a D1 carry test (proven by mutation).
- **Harness**: the observer maps the corpus's answers and concern-carrying visits onto the care record. `HARNESS_OBSERVES['EN-9']` is on. N1 = 0 and N2 = 0.05 are re-pinned.

## Decisions (team calls, logged on CUL-1417)

1. **§4.7 vs AC 10.** "About this sign" needs an appointment's reason or questions, which the amended AC 10 keeps from the engine. The pure rule is built, and the shell passes no appointments, so `recheck_booked` cannot fire yet (CUL-1531).
2. **The weight line (§4.1)** stays a go-live gate beside EN-8 (PR-19, running in parallel).
3. **N1 (adversarial):** a dense week must lie wholly after the answer. A week the owner had already seen is not a tested change.

## The adversarial pass

The first verdict was **FAIL, seven defects**. All seven are fixed in this PR, each with a regression test:

- **D1:** a card carried over an incomplete read kept the prior row's `with_vet`. Home and Ask would then drop an escalation's ask. Now the carry strips it, and both readers ignore a care state on anything but a concern.
- **D2:** a future anchor gave a count-less `with_vet`.
- **D3:** a course with a target and no logged dose never lapsed.
- **D4:** no lapse when a worsening concern left the set.
- **D5:** the latch dropped back to an older answer.
- **D6:** the pair trigger could be lost on a skipped run. It now reads the record at the answer's instant.
- **D7:** the reference slid once its window left the 180-day read.

N2 (a full-logging zero beside "vet knows") went to Dr. Chen on CUL-1537. The re-verification of the fixes is recorded on CUL-1417.

## What the harness says (the go-live gate, not this PR's)

On the stable 10-a-month cat (30 seeds), the share asked again within eight weeks is 0.93 against the ruled 5% cap. Two causes:

- **The burden card**, which a care state must never quiet (AC 3), re-asks 18 of 30 cats on its own.
- **The concern itself** re-asks 8 to 10 of 30: about 4 come from the lapse rule the spec mandates, and the dense-day arm and the rate test add the rest.

Asks per pet-month after the answer fall from 28 to 11. **As read today, the line cannot pass at any setting.** That is CUL-1537's D-a.

## Residuals

- CUL-1537 (PM): how the 5% line is read, and the zero wording.
- CUL-1538: the summary still routes to the vet on a watched-only pet.
- CUL-1531: a legal read for `recheck_booked`.

## Teach

### S3 — A flag changes behaviour by a row, not a release (L1)
Everything in this PR is already in the code that will reach the server when it merges, and none of it runs. The engine checks one switch first. That switch is a row in a database table, and no such row exists yet, so the switch reads as off for every account. Turning it on for one tester is inserting a row; turning it off again is deleting it. No new app build and no redeploy are involved.

**Like:** a new wing of a building finished behind a locked door. The wing is built and inspected, and opening it is turning a key, not more construction.

**In today's work:** `supabase/functions/_shared/engineFlags.ts:52`
`export const ENGINE_KEYS = [..., 'engines_v3_en9', ...]`: the switch's name. The engine reads it with `isEngineKeyOn(engineFlags, 'engines_v3_en9')`, and with no row it reads off. That is why this PR can merge today while the harness says it is not ready.

**Why it matters to you as PM:** "merged" and "live" are separate decisions here. CUL-1537 decides when the row gets written, not when the code ships.

**Check:** If CUL-1537 is ruled tomorrow and the harness then passes, what has to happen for Jordan to see "With your vet": a new TestFlight build, a merge, or something else?
