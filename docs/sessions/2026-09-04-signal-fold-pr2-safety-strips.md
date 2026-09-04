# Signal fold PR 2 — the safety strips: standing + acute, the ask line, the last-episode date, the FS-3 guard (CUL-785)

**Date:** 2026-09-04
**Outcome:** shipped via #799 (draft) — Home v1, PR 2 of 3. With this and PR 1 (#796) the fold reaches every card class; PR 3 (CUL-788, the motion) is the last rung. Mode: BUILD, plan-gated (the plan and three decision briefs posted to the issue; the session ran unattended, so the draft PR is the redirect point — the PR 1 precedent). Branch `claude/signal-fold-pr2-safety-strips-itej59`.

## What this was

The PM's own screen: a red "recurring vomiting, worth a vet visit" card at Newsreader size, leading Home for six weeks. DF-2 (PM, 2026-09-03) ruled that every safety card folds, the acute class included, on Dr. Chen's conditions — the strip keeps the rail at full opacity, the symptom, the ask verb, the count with its span, and the DATE of the last episode, never a counter; the record re-opens it, never the calendar. PR 1 shipped the primitive with the safety class gated closed. This session flipped the gate and built the safety strip.

## What shipped

- **`lib/signalCopy.ts`** — `stripAskLine` (the card's own vet verb, compressed to ≤ 20 characters so it can never break mid-phrase; `STRIP_ASKS` pins the four signed strings), the four safety name forms (`Recurring {symptom}` · `{Symptom} up this week` · `Eating less than usual` / `Refused the usual food` · `Blood in a {vomit|stool} photo` / `Something unusual in a … photo`, blood leading when both flags are set), the compact count forms (Dr. Chen's own `14 episodes, 5 of 8 weeks · last Aug 26`; worsening on the axis that rose with the zero-prior pair dropped exactly as the face does; intake's day count and meal denominator; the red flag's `AI read of N logged photos · last Sep 1`), `StripContext` (the last-episode instant), `stripDayLocal` (device-zone day off local components, B-514) and `stripDayUTC` (the red flag's day — the same day its sentence and phone script print), `chronicityLastEpisodeFallbackIso` (`expiresAt − 24h − daysSinceLastEpisode`), and `stripA11yLabel` = `{name}. {ask}. {count}, last {Month D}.` with the month spoken in full.
- **`lib/signalFold.ts`** — `canFold` is now true for every card class, with **`intake_decline` held closed behind `INTAKE_DECLINE_FOLDS = false`** (below). The intake row of `MATERIAL_FIELDS` keeps the spec's field with a corrected comment.
- **`hooks/useLastEpisodeDates.ts`** — the §3.4 read: `MAX(occurred_at)` over the pet's non-deleted events of the finding's `symptomType` (the engine maps `event_type` → `symptomType` one-to-one in `mapSymptomRows`, so one key per query and no symptom list to register — C-11), synchronous inside a `useMemo` so the FIRST paint of a strip carries the record's date (a date that flipped a frame after mount would look like the pet moved), keyed on the pet + the symptom set + `hydrationTick` + `signalTick` + a focus tick (the mount focus skipped — the first render already read). `null` per type when the store did not answer; the strip prints no date rather than a guess. `useSignal` exposes `expiresAt` for chronicity's fallback; worsening has no fallback and prints the count alone.
- **`components/home/InsightCard.tsx`** — `FoldedStrip` gains the ask line (its own `ThemedText`, textSM regular in primary ink — the rail is the only warm mark, S1) and `lastEpisodeIso`; the a11y label comes from `stripA11yLabel`; **a safety strip that cannot say its ask is not drawn** (the FS-3 runtime half). The control now renders on safety cards through the same `canFold`.
- **`components/home/SignalZone.tsx`** — `LiveStack` threads the dates and the expiry; the folded predicate requires the ask on a safety finding (else the open card, FS-7); the record's date wins over the fallback.
- **Tests** — `lib/signalCopy.strip.test.ts` carries the FS-3 build guard (a walk over every `InsightType` — asserted equal to `MATERIAL_FIELDS`' keys — every variant of every safety type must yield a ratified ask, under the cap, spoken in the label; a benign strip must yield none; a new safety type has to be added to the walk with its ask before it can ship), the verbatim safety forms, the FS-11 worst cases (`Recurring skin irritation` · `Check with your vet` · two-digit counts with the widest date), the local/UTC day helpers, the "a date, never a counter" screen; `lib/signalFold.test.ts` the class gate, the intake hold pinned to its constant, improving-then-relapsing through a stood-down marker, the refusing cat, the red flag's nothing-else; `InsightCard.fold.test.tsx` the safety strip's anatomy, styles, one-button C-6 check, spoken label, the intake card without a control, the FS-3 runtime refusal proven by spying the copy layer to null; `SignalZone.fold.test.tsx` the strip at rank 0 above every benign card with no inherited canvas, the record's date before the regen, the fallback, the record-over-fallback precedence, the net-zero re-open vs the window aging, the tier flip, improving-then-relapsing end to end, the all-folded zone with the ask still on screen, the acute red-flag fold and its newer-photo re-open; `hooks/useLastEpisodeDates.test.ts` the SQL shape, dedup, the ticks, the pet switch, the throw. The nothing-folded snapshot changes by exactly one node (the safety card's control, 54 lines).

## Three places the spec's premise and the shipped code disagree (decision briefs on the issue; CUL-796 on `Waiting on PM`)

**A — the intake-decline fold is not record-bounded.** DF-2's bound reads "`daysBelowBaseline` climbs daily, so an acute fold lasts one regen cycle". In `detectIntakeDecline` the loop runs exactly `consecutiveDays` iterations, so the field is a constant 1 (cat) / 2 (dog), and the refusal branch writes 0. A folded not-eating-cat strip would have stayed folded for the whole decline, with DF-5 forbidding the clock. Built: the gate held closed for that one type, the strip copy and tests shipped, the flip one line. The fail-toward-escalation default, reversible, and the ruling was made on a premise that does not hold. CUL-797 files the engine change (count the true run of below-baseline days, or emit an assessed-day marker), noting `detection.ts` is inlined by `generate-report` (CUL-19's ledger).

**B — worsening's firm tier says "worth booking a vet visit soon"**, where the §4 table gave worsening one form. The strip mirrors the card (the binding rule): firm → `Worth a vet visit`, standard / soft → `Tell your vet`.

**C — `Call your vet today` is unreachable.** Both intake sentences end "a word with your vet if it carries on"; the feline floor is a single day, not three. The strip may not out-escalate its card, so both triggers carry `Check with your vet`; the spec's stronger feline verb is Dr. Chen's call on CUL-797.

## Verification

- `npx tsc --noEmit` clean. `npx jest`: 308 suites / 6642 tests green (the full run, every guard included) before the last fixture; the touched suites re-run green after it.
- **Mutation ledger (C-18):**

| Mutation | Red |
|---|---|
| `stripAskLine` → null for chronicity | 17 (the FS-3 walk, the verbatim forms, the strip anatomy, the zone) |
| `INTAKE_DECLINE_FOLDS = true` | 4 (the gate pin, the control, the zone) |
| Drop `FoldedStrip`'s safety-without-ask refusal | 1 (the runtime half) |
| Invert the record / fallback precedence | 0 on the first pass — no fixture had both a record date and an expiry — then 1 after `the RECORD wins over the engine fallback when both answer` was added |

The fourth row is the finding worth keeping: three green mutations proved nothing about precedence, and a guard that reds on none of the mutations you try is a fixture missing, not a guard passing.

## Reviews

_(filled in below once the three isolated passes returned)_

## DoD

_(filled in at wrap)_

## Residuals

- The intake-decline hold (CUL-796 to ratify; CUL-797 to make the premise true).
- Tier-2 edits to `docs/nyx-signal-fold-requirements.md` §0 DF-2 / §3.4 / §4 / §7 proposed on CUL-796 — not written; the spec header still says v1.2.
- On-device pass on the PM's own record — the seed cannot reproduce six weeks of chronicity (the PR's manual steps).
- PR 3 (CUL-788): the motion, which now also has to choreograph a three-line strip.
