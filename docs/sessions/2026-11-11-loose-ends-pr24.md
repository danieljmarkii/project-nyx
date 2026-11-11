# Loose ends PR-24: a refused trial's page 1 stops counting refused bowls as feedings of the diet

**Date:** 2026-11-11
**One thing:** T6 L1 — The report: one fact on three surfaces needs one question, and a fix on one surface leaves the others saying the old thing · check: pending

Shipped via #1519 ([CUL-2714](https://linear.app/projectnyx/issue/CUL-2714)). Loose ends PR-24, launched by `/sweep`, Teach: yes.

## What happened

CUL-2707 fixed the "Interpreting this record" box on a refused trial: the treat became a plain fact, with no ratio. Two lines higher on page 1 still printed "1 of 22 logged feedings did not match the trial diet … see the diet section before reading the trial as a result" and a "1 / 22" tile. Both counted 21 refused bowls as feedings of the diet.

- **One predicate.** The box's inline refusal gate became `trialRefusalDocumented` in `render.ts`. The box, the headline and the tile all read it, and pass 1 proved it equivalent to the old inline gate on every path.
- **The tile** prints the bare count with its days ("1 · Fed off the trial diet on Jun 3, 2026").
- **The box's later-permitted branch** drops its denominator under the same gate and keeps its uncertainty.
- **The headline** prints the bare count only where the refusal band already leads page 1. Adversarial pass 1 broke the first version: one bout of three refused bowls among 63 unrated holds the gate but raises no band, so the bare headline left the top line with no warning. There the ratio and its pointer stay.

Every gate is mutation-proven: removing any one of them reds a test.

Dr. Chen's cold read of the rendered fixture: page 1 reads as a refusal, and the treat agrees across headline, tile, box and appendix C. It raised two QUIET findings outside this change: the headline's "the logged observations" fallback and the bare "0 / N d" trial symptom tile. They were filed as one class, [CUL-2718](https://linear.app/projectnyx/issue/CUL-2718).

## Teach

### One thing — The report: one fact on three surfaces needs one question (T6, L1)
Page 1 says the same fact in three places: the headline, a tile and the "Interpreting this record" box. Yesterday's fix taught the box that a refused diet is not a delivered one, but the box made that call with its own private test. The headline and the tile never asked, so they kept saying "1 of 22", as if the cat ate 21 bowls. Today the test moved out of the box into one named check, and all three places ask it.

**Like:** three shop signs showing one price, each updated by hand. Change the price on the door and the window still shows the old one. Pull all three from one price list and they cannot disagree.

**In today's work:** `supabase/functions/generate-report/render.ts`
```
export function trialRefusalDocumented(t) {
```
One check, now called from the box, the headline and the tile, so a future change to what "refused" means reaches all three at once.

**Why it matters to you as PM:** when a fix lands on one surface, ask "where else does the page say this?" The cold read on CUL-2707 found these two lines only because nobody had asked.

**Check:** Suppose next month someone decides a trial counts as refused only when two thirds of rated bowls were left, not half. Before today, how many places would they have had to change, and what would a vet have seen if they changed only one?
