# Engines v3 PR-14d — the burden card and EN-4's persistence rung

**Date:** 2026-09-29

Shipped via #984. Finishes CUL-1410 (CUL-1311 scope 2). CUL-1311 stays open for scope 3, the `isWorsening` split, which rides PR-32 as CUL-1411.

## What shipped

`symptom_burden` (`detectBurden`, `generate-signal/detection.ts`) is a safety finding for vomiting that needs no earlier week.

- **Count arm:** 4 or more vomits in 7 days. It uses PR-14c's valve count and setting, so for vomit the calm card goes silent exactly when this card speaks.
- **Persistence arm (EN-4's rung):** a vomit on 3 or more consecutive days in the owner's timezone.
- **The ask:** "worth a call to your vet today" while the run is still going (it ended today or yesterday). Otherwise "worth booking a vet visit soon", which is worsening's firm ask.
- **Rank:** between intake decline and chronicity.
- **Copy:** template only.
- **Engine and Home:** the card is additive in `detectSignals`. Only the Home pipeline drops a same-sign worsening card under it (`suppressWorseningUnderBurden`).
- **Vet report:** unchanged (CUL-1427 adds the card to it).
- **Client renderer:** the card, the title, the Home row, the expanded text, the phone script, the cross-pet banner and the fold strip.
- **Rollout:** it goes live with no flag. Installed builds render an unknown type as nothing, so owners see the card itself from the next app build.

## Falsification record

**Adversarial pass 1: FAIL. Fixed.**
- A model sentence could add "Not urgent but…" or "Probably something she ate so…" in front of the template's tail. `validatePhrasing` now refuses every model sentence for this type.
- A "today" held over an incomplete read printed "at least 1 days in a row". A held "today" now states the count.
- The UTC fallback missed an evening Los Angeles cat.
- Two mutants survived: today read in UTC, and the burden tier-hold.
- The net-new chance metric was vacuous, measured over the whole run instead of per evening.

**Adversarial pass 2: FAIL on the no-zone fix. Fixed.**
- Taking the loudest offset invented runs (three vomits in 26 hours) and pulled old runs forward.
- With no zone, a run is now claimed only if it holds in every offset.
- **Priced residual, tested:** a zone-less pet's evening run can go unstated by the persistence arm. The count arm is unaffected, and the app writes the device's zone on launch (`lib/profile.ts`).

**Mutants killed:**
- the count and persistence thresholds;
- the tier cutoff;
- the run selection;
- local versus UTC days;
- today read in UTC;
- the tier-hold scale;
- the zone sweep;
- the quietest-reading order (3 of 4 branches);
- the Home suppression (on and off);
- the carry filter.

**Survivors:**
- The run-length tie-break under zone doubt. Near-equivalent: it changes only the stated run length, when two offsets agree on the run's end.
- The singular "day" and "time" branches. Unreachable today, since the arms need at least 3 days and at least 4 vomits.

**Other reviews:**
- Code review found no fall-through bug on any client surface. A count-only strip no longer states a run of 1.
- nyx-voice ✓.

## Chance rate: PR-15's null pets, 1,000 seeds per scenario, 180-day horizon

| | Share of null pets |
|---|---|
| The card as shipped | 21.8% saw it, 9.0% saw "call today" |
| The count arm alone | 20.1% |
| The persistence arm alone | 9.1% |
| With a run of 2 (the CUL-583 alternative) | 48.2% |
| The shipped worsening card, same pets | 81.1% |
| **Net new: an evening with the burden card and no worsening card** | **3.0%** |

On Home, the card mostly replaces a worsening card that was already showing, at a clearer ask.

Most of the card's showings come from four scenarios:

| Scenario | Why the card shows |
|---|---|
| Clustered 3-a-month cats (67% and 52%) | A 4-vomit week really happens |
| Dog garbage raids (64%) | Real acute clusters |
| Trial started at a peak (48%) | A real 4× flare |

Pets vomiting once a month: under 1%.

Full per-scenario table:


| scenario | pets | saw the card | saw "call today" | card evenings |
|---|---|---|---|---|
| null-staple-1pm | 1000 | 0.7% | 0.2% | 0.0% |
| null-staple-3pm-bursty | 1000 | 66.7% | 36.4% | 2.8% |
| null-rotating-1pm | 1000 | 0.6% | 0.1% | 0.0% |
| null-rotating-3pm-bursty | 1000 | 52.1% | 24.9% | 1.7% |
| null-grazer | 1000 | 7.5% | 2.9% | 0.1% |
| null-wandering-365 | 1000 | 25.6% | 9.7% | 0.8% |
| null-attrition-365 | 1000 | 1.6% | 1.3% | 0.0% |
| null-found-piles | 1000 | 6.0% | 2.7% | 0.1% |
| null-two-cat-home | 2000 | 4.5% | 1.9% | 0.1% |
| null-dog-indiscretion | 1000 | 63.5% | 15.4% | 2.2% |
| null-species-other | 1000 | 0.4% | 0.4% | 0.0% |
| null-trial-at-peak | 1000 | 48.2% | 18.9% | 1.4% |
| null-event-dependent-feeding | 1000 | 22.7% | 8.7% | 0.5% |
| **all null pets** | 14000 | 21.8% | 9.0% | |

Worst scenario: null-staple-3pm-bursty (66.7%).

Reproduce: `deno run --allow-read supabase/functions/_shared/engineCorpus/trajectory/burdenChance.ts 1000`.

## For the CUL-583 ruling sheet

- **The persistence run: 3 days or 2?** Two more than doubles the chance rate (21.8% → 48.2%).
- **Diarrhoea on the card?** The valve mutes the calm card for every sign; the card speaks for vomit only.
- **The zone-less evening residual:** accept it?

## Filed

- CUL-1426: add the type to index.ts's template-only list, after PR-22a. Until then the model is called and its answer discarded.
- CUL-1427: carry the card in the vet report's safety band.

## Persona sign-off

Dr. Chen ✓ (the counterexample fires with and without a photo; the ask is "today" while the run is going; no quieter ask replaces a louder one) · Data Scientist ✓ (the chance rate is measured on the null set, the net new is per evening, and the falsification record is above) · Designer ✓ (one card per sign per week on Home; nyx-voice) · Engineer ✓ (1,766 deno tests, 12,912 jest tests, typecheck clean) · Trust & Safety N/A (no access-control surface).
