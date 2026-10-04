# A bowl that held every counted day leaves no meals-logged ratio, on any surface (CUL-1572)

**Date:** 2026-10-04
**One thing:** S2 L1 — Data vs schema: a fact computed at read time needs no migration · check: pending

BUILD session dispatched by `/dispatch` as PR-43d of the Out of beta run order. Shipped via #1051.

## What shipped

- `lib/dietTrial.ts`: `TrialFacts.intakeNotDirectlyObservedThroughout`, via the exported `arrangementsCoverRange`. It asks whether the union of the bowls' spans holds every day of the clipped coverage `range`, which is the window of the claim it gates (C-35). End day inclusive; an unreadable end reads as open, the withholding direction. It is the third question beside "any overlap" (`intakeNotDirectlyObserved`) and "in force now" (`intakeNotDirectlyObservedNow`).
- `lib/dietTrialFacts.ts`: the card input `freeFedThroughout`, carrying the counted span (start and end day) rather than a boolean.
- `lib/dietTrialCard.ts`:
  - a `bowl_throughout` withholding reason, so the Home strip, the this-week lane and Get ready (which quotes the strip line) never print the ratio on it;
  - `withoutBowlRatio`, which projects `coverage: null` at the one entry `resolveTrialCard` and `planTrialCard` share, so every register and both terminal cards resolve without the ratio while the feeding counts and the off-diet floor stay;
  - the past-bowl caveat names the counted span by date: *Mochi had a bowl that was topped up every day from Jul 3 to Aug 27, so those days can't have a meal-by-meal count.* It fires even when the bowl is still down at the end of a completed trial.
- `lib/widgetSnapshot.ts`: `widgetTrialCoverage` withholds the widget's "N of M trial days logged" on the strip's two bowl facts.
- Tests: the issue's record over the real loader (screen, card, strip, day 60 and day 90), the armed partial-bowl control, the overrun / completed / sub-floor / head-clip / extended registers, `arrangementsCoverRange` boundaries, and the widget helper. Both halves of the card change proven by mutation: disabling the projection or dropping the reason reds the real-loader tests.

No schema change: the fact is derived on every read, so it applies to every existing trial the moment the code ships. `lib/dietTrial.ts` sits in the Edge Function closure, so the merge redeploys `generate-report` and `ask`; the field is additive and not read server-side.

## Falsification

First `adversarial-reviewer` pass: FAIL. Every path through `resolveTrialCard` / `withholdingReasons` held (timezones UTC / +14 / −10 / +5:45, two bowls with and without a gap, a bowl before the trial, an off-list bowl, the day-56 / day-55 boundary, head clip, bowl-only, completed and abandoned, extended). It broke five things:

1. The widget printed the ratio with no bowl check. **Fixed here** (`widgetTrialCoverage`).
2. The vet report prints the ratio over bowl days. Predates this PR, Edge Function scope: **filed CUL-1577**.
3. A bowl that held only part of the window still gets a plain ratio on Home. Predates this PR, the understating direction: **filed CUL-1578**.
4. The first cut's caveat, "on every day this trial counts", read false on an extended trial (the count is the designed window) and a head-clipped one, and the projection had dropped the head line. **Fixed:** the caveat names dates; the head line stays.
5. A completed trial with the bowl down on its last day lost its ratio and named no cause. **Fixed:** the dated caveat fires there.

Second pass on the corrections: see the outcome comment on CUL-1572.

## Persona sign-off

Designer ✓ (Principle 5 and the voice pass on the rewritten caveat: specific, dated, no blame, no `!`; C-28) — Engineer ✓ (one projection at one entry; one predicate at the source) — Data ✓ (the gate's window is the claim's window) — Dr. Chen N/A (no report change; CUL-1577 carries that) — QA ✓.

## Residuals

- CUL-1577 (report) and CUL-1578 (partial bowl on Home) as above.
- The widget gates only on the bowl, not on the strip's whole withholding list. That is wider than this issue; the strip's other reasons (decline, refusal, untracked head) are not mirrored on the widget's trial strip.

## Teach

### One thing — Data vs schema: a fact computed at read time needs no migration (S2, L1)
Some facts are stored in the database, and changing their shape takes a migration: a change to the database's structure that ships like code and runs against every row. Other facts are worked out fresh every time the app reads the record. Today's "the bowl held every counted day" is the second kind. Nothing new is stored, so it applies to every trial already on every phone the moment the update lands, with no migration and no backfill.

**Like:** a bank statement's running balance. The bank stores your transactions, not the balance on each line. Change how the balance is shown and every old statement shows it the new way, because it is recomputed when you open it.

**In today's work:** `lib/dietTrial.ts`, in `computeTrialFacts`
`intakeNotDirectlyObservedThroughout: arrangementsCoverRange(input.arrangements ?? [], range, input.timeZone),`
The bowls (`arrangements`) and the counted days (`range`) are already read from the record; this line only asks a new question of them each time.

**Why it matters to you as PM:** "does this need a migration?" decides whether a fix is a one-PR OTA update or a schema PR with its own pre-flight, so it is the first scoping question on any data fix.

**Check:** If the team later wanted a surface to show *when* the bowl came up, would that need a migration? Why or why not?
