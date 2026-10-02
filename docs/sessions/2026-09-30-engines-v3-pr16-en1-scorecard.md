# Engines v3 PR-16 — EN-1, the engine scorecard, and eleven adversarial passes

**Date:** 2026-09-30

Shipped via #993 (CUL-1131). A dispatched BUILD session on branch `claude/cul-1131-pr16-0930`.

## What shipped

- **The scorecard**, `supabase/functions/generate-signal/eval/`:
  - It runs the shipped Signal pipeline (`runSignalPipeline`, PR-11b) each evening at 21:00 local over PR-15's 38 synthetic scenarios.
  - Each card's vet ask comes from Home's own `signalHomeLine(f)?.ask`, never a text match. The runner is jest (`npm run scorecard`, `scripts/engine-scorecard/`) because that closure reaches expo modules Deno cannot load.
  - It commits 914 flat rows at CI seeds, flag off, on main a1ca847: `scorecard.json`.
  - A separate, path-filtered, non-required workflow prints the diff and the pass lines on every engine PR (`.github/workflows/engine-scorecard.yml`).
- **The replay core's as-of rule** moved to `eval/asOf.ts`. `scripts/engine-replay/record.deno.ts` re-exports it, so the dogfood replay and the scorecard read a record through one rule.
- **The pass lines** (`passLines.ts`, pinned by digest in `passLines.test.ts`) are fixed per wave before any flag-on run: EN-9, EN-8, EN-3/4/7 and EN-11.
  - Only two values are ruled: the red-flag property (0), and EN-9's lapse no-reassurance line (no worse than flag off, from the n=1 invariant).
  - Every other value is null and names its ruling-sheet source.
  - `ADEMP.md` is the design, including the offline go-live procedure (≥1,000 seeds per scenario, paired arms).

## How the review loop went

The DoD requires adversarial review for statistically load-bearing logic, and the scorecard is the instrument that later waves' go-live decisions read. So it was run hard: eleven isolated `adversarial-reviewer` passes. The first ten each found a way for a flag-on arm to pass (or fail) a wave by construction, and each fix is pinned by a test.

| Pass | What broke | Fix |
|---|---|---|
| 1 | Detection credited a card already standing before the effect. Several lines passed over missing or empty arms. | Detection counts an onset; lines name exact rows. |
| 2 | A week-9 latch or a 57-day timer passed EN-9. A one-evening flicker counted as detection. EN-11 had no false-card cost. | Whole-run EN-9 lines; score only pets clear for 7 evenings; a 56-day window. |
| 3 | A renamed arm passed EN-11 and EN-3. One margin covered shares and days. A card latch shrank EN-11's denominator. | Required keys per wave; EN-11 split by unit; the scored-pets line; floors on every rate. |
| 4 | The real `engines_v3_en3` key passed EN-3/4/7 with rows identical to flag off, because the harness does not run the per-incident read. | `HARNESS_OBSERVES`; an arm that moved nothing is incomparable; EN-9's scored population. |
| 5 | EN-11's lines read only worsening, while EN-11 changes the food lane most. Bundled keys defeated the equality check. | Food lines (PM-approved); exact keys per wave; EN-8 marked not observed. |
| 6 | Naming all nine proteins on every card raised food detection. | A wrong-protein row. Joint cards count as wrong (PM ruling). |
| 7 | The per-pet wrong share saturates after the first wrong card. | A wrong-protein evenings row. |
| 8 | Naming everything, then dropping after week 8, lowered every wrong row. | A food detection is the culprit alone (PM ruling), plus persistence and precision lines. |
| 9 | The shipped engine shows single cards per protein, so adding a lone culprit card to an already-wrong evening was free. | A detection is an EVENING naming the culprit and nothing else. |
| 10 | Cutting hedges to one card hid the culprit on the evenings it guessed wrong. | The culprit-absent line, completing the partition: alone / hedged / absent. |
| 11 | Renaming cards to the most-exposed protein passes on the reacting pets, because the corpus's hidden culprit is the most-exposed protein by design. | `EN-11.stapleBlame` on the healthy staple feeders. The reacting scenario is CUL-1442. |

The PM chose to close the loop after pass 11. The remaining gap is corpus coverage, not scoring, and it is tracked to land before EN-11's first flag-on run. No pass returned PASS; the last verdict was FAIL on that deferred item.

## Decisions (PM, in session)

- EN-11's pass lines cover the food lane, beyond the 9/26 worsening-only wording.
- A joint card counts as a wrong attribution.
- A food detection is an evening whose food cards name the reacting protein and nothing else.
- Close the review loop after pass 11, with the corpus scenario filed.

## What the scorecard already found in the shipped engine

- An improving reflection card behind a symptom-only logging lapse (1 of 3 lapse-doubling pets at CI seeds): CUL-1438.
- The Early food lane names a protein with no effect on about 63% of beef-reacting cats, some for 150+ evenings. On the hidden-chicken scenario it names duck beside chicken, so flag off's hidden-chicken detection reads 0 at CI seeds under the evening rule. Posted to CUL-1141 as D5 evidence.

## Residuals and follow-ups

- **CUL-1439:** the per-incident observer (call rate by tier, escalations per bout), after PR-28.
- **CUL-1441:** scoring detection over pets clear in both arms (retiring `EN-11.eligible` and `foodEligible`), delay over those pets with misses censored, a commit digest in `meta`, and stacked-wave comparisons.
- **CUL-1442:** a reacting scenario whose culprit is not the most-exposed protein.
- **Every unruled pass-line value is the ruling sheet's (CUL-583).** `EN-9.scored` can soundly be 0.
- **Deploy coupling:** `deploy-edge.sh` runs `generate-signal/` tests recursively under 180 s, and the eval suites add about 13 s. No function's shipping closure changed.
- **At wrap**, main had moved (PR-28 added `engines_v3_en4`). It is now in EN-3/4/7's wave keys; the wave stays not-observed until CUL-1439.
