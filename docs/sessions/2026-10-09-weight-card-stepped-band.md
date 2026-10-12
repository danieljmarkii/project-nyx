# Weight card: the stepped band and the legibility fixes

**Date:** 2026-10-09
**One thing:** P2 L1 — Reversibility: one-way and two-way doors · check: pending

Shipped via #1136 (CUL-1716).

## What started it

The PM sent a device screenshot of the Patterns weight card at two readings (9.7 → 8.2 lbs) and called it awful. Reading `components/charts/WeightDots.tsx` found three defects, none of them about the low count:

- **The label collision.** The last value's label was clamped to `plotW − 4`, so it ran into the 40pt gutter where the band labels sit. Any change near or past ±10% put "8.2 lbs" on top of "−10%": the bigger the move, the worse the card.
- **The flat read.** The only long line on the chart was the first reading's own level, drawn solid. With two dots and no connecting line it read as the weight, so a 15% loss looked like a held weight. The 8.2 reading was past the fixed ±10% band, so it was a hollow dot pinned to the edge, under the label. A never-reassure problem (B-186), not only a cosmetic one.
- **Cramped.** A 56pt plot, unlabelled "+10% / −10%", the first dot half off the card.

## The mock and the ruling

`docs/culprit-weight-card-mockups.html` (round 1, https://claude.ai/artifact/3LqWTRKYSPKGKfrijVmpgE) drew the shipped card, the layout fixes on the fixed band (A, R4-4 as ruled), and a stepped band (B), all to scale from the PM's numbers with the same arithmetic as `weightBand`. B was drawn at six readings, a 2% change (identical to A, so R4-4's protection holds), past its ±30% cap, and at one reading. The PM ruled **B** ("Let's go stepped band").

Left out on purpose: a connecting segment between dots. I had suggested it before the mock; R4-4 ruled dots by date, and once the reference line stops looking like data the dots read without one. Said in the mock's ledger.

## The build

- `weightBand`: the band is the smallest of `WEIGHT_BAND_STEPS` (±10 / 20 / 30%) holding every reading, never narrower than ±10%; past ±30% a reading clips as before. The step choice and the clip test share one float slack, so a reading the step held is never "outside" (4.4 → 3.96 is 0.10000000000000007 in binary).
- `WeightDots`: edge labels name the width; the ±10% guides stay, labelled, when the band widens; the reference line is dotted hairline; the last value is right-aligned to its dot, above it in the lower half and below it in the upper, flipping off a neighbouring dot but never into the dates; a 96pt plot with label room; the first dot inset.
- `weightDeltaLine`: the interior-dip disclosure moved from "clipped" to `pastFloor` (more than ±10% from the first), worded "· N readings past ±10%". Without it, a widened band holds a 30% dip and "No change" would stand alone over it, a regression the build would otherwise have introduced in the words while fixing the picture.

## Falsification

Every new guard was proven by mutation: the stepped band, the shared slack (one mutant survived at first because the fixture I wrote was not on the float edge it claimed; I searched for real edge values and replaced it, with an assertion that the fixture really is past the edge), the floor-tied disclosure, the solid reference line, and the old label clamp.

The isolated `adversarial-reviewer` returned PASS with two LOW findings:

1. **Fixed here.** The `pastFloor` count read the rounded pounds: 2.29 → 2.02 kg is an 11.8% dip that displays as exactly 10.0% and went unsaid. It now counts the stored kilograms, like the direction and percentage already did.
2. **Filed, CUL-1717.** A decline followed by one high typo reading prints only "Up 28%". Pre-existing; the stepped band makes it slightly easier to miss.

The reviewer also measured the trade-off the PM accepted with B: one outlier reading widens the band for every dot, so a real 6% loss beside a +25% typo draws about 43% smaller than on the fixed band. The words ("Down (6%) · 1 reading past ±10%") and the ±10% guides still carry it.

## Residuals

- CUL-1717 (above).
- The a11y label's comment says "interior only" but counts the last reading too; pre-existing, cosmetic.

## One thing — Reversibility: one-way and two-way doors (P2, L1)

Some decisions are doors you can walk back through; some lock behind you. Today's ruling was a two-way door: the stepped band changes only how the app *draws* weights already stored. No row in the database changed shape, nothing an owner logged reads differently, and putting the fixed band back is a few lines of code. That is why it was right to decide it in one message off a mock instead of convening the team.

The line from today that makes it a two-way door:

```ts
export const WEIGHT_BAND_STEPS = [0.1, 0.2, 0.3] as const;
```

*A constant in the drawing code: change it and the next build draws differently. Nothing stored depends on it.*

Compare a one-way door: a migration that drops a column. Once it runs, the data is gone, which is why migrations need your typed `apply <NNN>` and a rollback plan.

**Check:** CUL-1717 proposes adding "· lowest 8% below" to the weight sentence. Is that a one-way or a two-way door, and what would make it the other kind?
