# Vet report v2 PR-03: the Weight block prints kg at the stored 2 dp

**Date:** 2026-10-31
**One thing:** D5 L1 — What a reviewer looks for: the same mistake one function over · check: pending

Shipped via #1374. Finishes CUL-2284.

## What shipped

The vet report's Weight block rounded kilograms to one decimal, so a cat going 1.95 to 1.86 kg printed "1.9 → 1.9 kg" and a 4.6% loss read as steady. All four kilograms in the block now print the stored two decimals, and render tests fail on any one-decimal number in it. The adversarial pass found the same rounding on the page 1 weight tile, which can print a 0.04 kg loss as "-0.0 kg"; that is filed as CUL-2326 (Live harm) rather than folded in. The PR body is the full record.

## Teach

### One thing — What a reviewer looks for: the same mistake one function over (D5, L1)
A fix is usually written for the place the bug was reported. A good reviewer asks a wider question: where else does the code make the same choice? Today the issue named one section of the report, and that section was fixed. The reviewer then searched the whole file for the same rounding and found four more places, one of which can hide a real loss on the first number a vet reads.

**Like:** a plumber called for one dripping tap fixes it, then checks the other taps on the same pipe, because the cause was the washer type, not that one tap.

**In today's work:** `supabase/functions/generate-report/render.ts:5978`
`` `${sign}${d.toFixed(1)}`, ``
This is the page 1 weight tile, outside the section the issue named. `d` is the weight change; `toFixed(1)` rounds it to one decimal, so a change of -0.04 kg prints as "-0.0". The fixed section now says the cat lost weight while this tile says it did not.

**Why it matters to you as PM:** when an issue names one surface, the useful follow-up question is "is this a one-off or a habit of the code?", because a habit fixed in one place leaves the page contradicting itself.

**Check:** If this PR merges and CUL-2326 does not, a vet opens the report for a cat that went 1.95 to 1.91 kg. What do the Weight section and the page 1 tile each say, and which one would a vet scanning in 60 seconds most likely trust?
