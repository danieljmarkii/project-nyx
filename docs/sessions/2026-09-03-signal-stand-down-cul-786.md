# Signal v1.1-a — the labeled stand-down when a chronicity course goes quiet

**Date:** 2026-09-03
**Shipped via:** #798 (draft) — CUL-786, under the Home v1 — The Signal fold project. One PM action filed on `Waiting on PM` (the deploy gate). One note left on CUL-784 (the strip veto regex).

## What this session was

The first of the two v1.1 follow-ups the fold spec registered under DF-9(a): when a symptom-chronicity card stops firing because its recency floor closed, it used to vanish wordlessly — Dr. Chen's "reassurance-by-absence wearing an honesty costume", Sam's "a card that vanishes tells me less than a card that folds". The issue's shape was already specific (an engine marker + one client line, Dr. Chen's four conditions binding, adversarial-gated, never on the report), so the session was claim → orient → plan-gate → build → two reviews → fixes → wrap. The PM ruled the one mechanism fork at the plan-gate: **option (a)**, the marker rides the existing `ai_signals.findings` array. No schema change.

## What shipped

**Engine.** `supabase/functions/generate-signal/standDown.ts` (pure) + a fenced block in the shell (`index.ts`). Before the cache row is replaced, the prior row is read with the caller's JWT and a `stood_down` marker is minted for a chronicity course that stopped on the recency gate alone and whose gap since the last episode was logged across. "Recency alone" is decided with the one existing predicate rather than a copy of the floors: `detectChronicity` is re-run under a counterfactual config with `ongoingRecencyDays: Infinity` at every resolution level (global, per-type, the feline override); firing there and not under the real floors means every other floor still holds. `detection.ts` is untouched, so the report's held ledger entry (CUL-19) does not drift — the guard confirmed only `generate-signal` and, later, `ask` moved. The marker carries the tier the card last emitted (the ask that was on the card is the ask that survives), re-emits for at most seven days, and ends on a re-fire or on any newer episode. The line is template-only, Dr. Chen's verbatim: *No vomiting logged for Nyx in 14 days — this card has stood down. That isn't an all-clear. If you haven't been, the visit is still worth booking.* (standard tier: *…If you haven't yet, it's still worth a word with your vet.*)

**Client.** `StoodDownMarker` in `lib/signal.ts`; `isStoodDown` / `stoodDownExpired` in `lib/signalCopy.ts` (the pure module — a value import from `lib/signal.ts` would have loaded the fail-fast Supabase client into every zone test); `StoodDownLine` in `SignalZone`'s `LiveStack` — no rail, `textSM` secondary, indented to the card text column, announced as one sentence, not a control; the arrival moment's count excludes it; `InsightCard` gets a defensive null renderer and exports `RAIL_WIDTH`. Never on the vet report by construction: `generate-report` re-runs detection and never reads `ai_signals`; a Deno test pins that `detectSignals` never emits the type.

**Mid-session merge.** PR 1 of the fold (#796) landed on `main` and rewrote `LiveStack`. Resolution: the marker branches before the fold's folded/open fork, `canFold` refuses it, and `MATERIAL_FIELDS` carries an inert row because the table is exhaustive over `InsightType`, pinned by its own test and excluded from the property walks by name.

## The adversarial pass — FAIL, then fixed

The issue said `adversarial-reviewer` mandatory ("it is a sentence about absence") and the pass earned its keep. Run in isolation against the live detector, it returned **FAIL** with two reproduced breaks:

1. **The carry re-emitted a false statement on a relapse ⑦ could not see.** A dog vomits three hours ago, but the window has slid two old onsets out, so the residual in-window count sits under the episode floor and ⑦ stays silent — and the carry, gated only on "did the course come back", said *No vomiting logged in 14 days* on the day the owner logged one. For cough (floor 5, recency 28, a relapsing-remitting sign) this is the modal case, not a corner. **Fix:** the carry is anchored to the episode the marker was minted against; any newer log of that symptom ends the line, and a record with no episode at all ends it too.
2. **The marker took rank 0 over a live safety card.** The cat that stops vomiting because it stopped eating: chronicity stands down the same regen `intake_decline` fires, and the absence sentence rendered above, and larger than, the feline 48-hour-window card. **Fix:** `mergeStandDowns` splices below every safety finding; the client binds the lead canvas to the first *card* rather than the first row. (This is deliberately different from a fold under DF-7: a folded card still holds its rank as a strip, so nothing below it inherits the canvas; a stood-down card is gone.)

Held: the counterfactual against a dark half-span, an aged-out course, and the cough/cat floors (recency is provably the only gate that closed — same input, same config, one gate moved); the carried tier (span is non-increasing as the window slides, so the carried ask is always the stronger one); the frozen "in 14 days" (the floor that fired, true and understated at mint, and freezing it is what stops it becoming the days-since counter §3.4 forbids); the arrival moment, the cross-pet banner, and the vet report (three independent gates). **Accepted residual, recorded on the issue and in the module:** `gapLoggingHeld` detects *abandonment*, not *attention* — for the diet-trial owner logging meals by protocol, condition 4 is met by construction, and the direction argument ⑦'s own coverage guard makes does not transfer to a sentence about absence. The honesty is carried by the copy ("logged", never "happened"; "That isn't an all-clear."), not by the guard. Two tightenings came out of the same finding: the last episode's own day no longer counts as watching afterwards (meals at 14/10/5/3/1 days now withhold), and the guard filters to the engine's fetch union instead of trusting the caller.

**A consumer nobody had named: Ask.** `ask/index.ts` relays every `ai_signals.findings` entry to the model, so a marker-only pet would have flipped `hasFindings` true and handed the model a sentence about absence to paraphrase. Fixed in `engineFindings` (`tools.ts`, one filter + a test); Ask's ledger entry re-fingerprinted, still riding the CUL-557 chain. The module header's "never on the report by construction" argument was right about the report and silent about Ask — the recurring seam.

## The code review

One fix-before-merge: the stand-down block sat inside the handler's outer `try`, so a throw in the new logic would have 500'd the whole regen and written no row — blanking the pet's Signal over a bug in what is decoration on the record. The block is now fenced; a throw costs the marker, never the regen. Nits taken: a vacuous helper test dropped. Confirmed clean: tokens, `ThemedText`, the copy guard, the banner's allow-list, the G10 old-client fallback, no scope creep.

## Mutation ledger

Scratch copy of the function directory; the live tree was never mutated. Each mutation reddened exactly the fixtures that guard it; restored, 29/29 (34 after the review fixes).

| Mutation | Red fixtures |
|---|---|
| Drop the counterfactual gate | stopped-on-coverage, aged-out |
| `gapLoggingHeld` always true | dark gap, half-dark gap, halves helper |
| TTL `>=` → `>` | expiry boundary |
| Re-fire no longer drops the marker | re-fire |
| Tier re-resolved instead of carried | golden mint, carried-tier |

## Verification

Deno: `standDown.test.ts` 34 fixtures; full `generate-signal` suite 579, `ask` 141 — all green under Deno 2.9.4 (CI's pin, installed in-session). Jest: 307 suites / 6558 tests green, `tsc` clean, every guard green with both ledger entries updated. The deploy ledger moved `generate-signal` to `pending` naming the gate: an older build renders the unknown type as nothing, so on a marker-only pet it shows a blank Signal card for up to seven days — redeploy only once a build carrying this client is live.

## DoD

- AC (spec §8 v1.1-a + Dr. Chen's four conditions): **pass** — listed on the PR.
- Anti-pattern scan: **pass** (code review + adversarial pass).
- Types + lint: **pass**.
- Automated tests: **pass** — engine, client, and guard.
- Secrets: **N/A** — none new.
- Persona sign-off: Dr. Chen ✓ (four conditions; the relapse-in-carry and the not-eating-cat breaks stated and closed) — Data Scientist ✓ (the counterfactual as the one predicate; the arrival/banner/report gates) — Designer ✓ / `nyx-voice` ✓ (the line is the clinical lens's ratified copy: "logged", no `!`, no verdict word; the Designer read is that "stood down" and "isn't an all-clear" in one breath is a deliberate tension, and the register — secondary, no rail, in the gutter of the missing rail — says which half wins) — Dir. of Eng ✓ (no `detection.ts` change, no schema, the fence) — T&S ✓ (prior read RLS-scoped; nothing new leaves the account) — QA ✓ — PO ✓ (issues reconciled).
- Adversarial review: **pass, with the falsification attempts stated above** (FAIL → fixed).
- Future-self: the counterfactual-config trick is the pattern worth keeping — "which floor closed?" answered by the detector itself, never by a copy of its floors. The marker-in-findings shape is the pattern worth watching: every consumer of `findings` now has to know to skip it (three did; Ask didn't until the reviewer looked). If a second marker type ever appears, that is the moment for its own column.
- Dev Handoff + QA script: in the Session Summary.
- PM actions: filed (below).
