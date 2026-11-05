# Vet report v2 PR-30: sheet 1 carries every v1 page-1 block, guarded

**Date:** 2026-11-05
**One thing:** D4 L1 — Guards: a guard that reads the source's own output catches facts nobody listed · check: pending

Dispatched row, [CUL-2551](https://linear.app/projectnyx/issue/CUL-2551), plan-gated. The PM typed the go in session and approved all five briefs (1a, 2a, 3a, 4a, 5a). Shipped via #1446, left open for the PM: the final cold read found a new QUIET gap, and the row stops on that.

## What happened

The PM ruled fork (a): v2's sheet 1 carries every block of v1's page 1, either word for word or as a named reformat, and a guard fails the build when one goes missing.

- `sheet1CarryV2.ts` reads v1's page 1 from `renderReport`'s own output and places each top-level block. Furniture is dropped. The identity block becomes the masthead and the safety band becomes the band. The trial goes to `trial_reading`. Vomit and stool go to `episodes`, in v1's position. Every other block is carried in v1's order, with v2's pointers and without its SVGs (brief 3a).
- `sheet1MustCarry.test.ts` compares every v1 page-1 leaf against the print and phone sheet 1. A leaf passes only if it appears verbatim or through a named reformat; anything else reds the build. Mutation tests prove it against a dropped diet block, a dropped trial row, an unknown new v1 block, and a broken band or masthead.
- The folded issues each got a test in `sheet1Pr30.test.ts`. These cover the refusal run, meal totals and bowls, the trial span label, post-trial food rows, zero-sign change ticks, the short-week label, and the phone axis and push note.
- **The guard paid for itself mid-row.** [CUL-2529](https://linear.app/projectnyx/issue/CUL-2529) landed on `main` and changed v1's band. CI went red because v2's band no longer carried v1's new facts. Nobody had listed those facts anywhere. The guard read them off v1's output.

## Reviews

- **Adversarial pass 1:** one QUIET break (a pinned row capped the refusal run) and one LOUD break. Both fixed.
- **Adversarial pass 2:** three QUIET breaks (a bowl's date, zero-sign ticks, a fabricated post-trial start) and two LOUD breaks. All fixed and mutation-proven, which brought the row to the cap.
- **Cold read at b1b6262: NOT READY on placement.** Each of these sits later on sheet 1 than v1 had it, or is gone: the masthead's "not a diagnosis", the word "associational", the trial headline, and the Noticed caveat. Captions also print with no chart under them. This is a new QUIET gap, so the row stopped. The placement fork is [CUL-2579](https://linear.app/projectnyx/issue/CUL-2579).
- **Open for the PM:** a trial sign's falling halves are left off sheet 1 for now ([CUL-2564](https://linear.app/projectnyx/issue/CUL-2564)), because v2's extraction rule bars stating a decline in a trial's own sign.

## Teach

### One thing — a guard that reads the source catches what nobody listed (D4, L1)
The guard has no list of v1's sentences. Each time it runs, it renders v1's page 1 for the same record, splits it into its smallest blocks of text, and checks that each one appears on v2's sheet 1. Halfway through this row, another change gave v1's warning band two new facts. No one told v2. The guard failed anyway, because it read the new facts straight off v1's page.

**Like:** to check that a translated menu still has every dish, a checklist someone wrote last month misses tonight's specials. Holding the two menus side by side does not.

**In today's work:** `supabase/functions/generate-report/sheet1MustCarry.testutil.ts:143`
`for (const div of topLevelDivs(v1Page1Html(snap)))` reads the blocks from v1's rendered page each run, never from a stored list.

**Why it matters to you as PM:** when someone says "the new version covers everything the old one did," ask whether the check reads the old version itself or a list someone made of it.

**Check:** if v1 adds a new section to page 1 tomorrow and nobody touches v2, does the build stay green or go red, and why?
