# Food variant display — naming a food's wet/dry form on every event surface (B-568)

**Date:** 2026-07-28

Shipped via **#500**.

Filed as B-556 and **renumbered to B-568** at wrap: a concurrent session (B-533 diet-trial
card viability) claimed B-556–B-567 while this branch was in flight, and first-lands-keeps
gives them the block. Their `docs/sessions/` file was restored untouched — one file per
session, never edit another's.

## The report

PM-reported from live use, not from a spec: they started their cat on Royal Canin
Selected Protein PR, which is stocked in **both wet and dry**. On the History tab and
on Home they saw "Selected Protein PR" twice and could not tell which one the cat had
actually eaten.

Live data confirmed it exactly — the two library rows differ *only* in `format`, and
both are actively fed:

| format | meals logged | first | last |
|---|---|---|---|
| `wet_canned` | 4 | 2026-07-25 | 2026-07-28 11:48 |
| `dry_kibble` | 4 | 2026-07-27 | 2026-07-28 09:43 |

## Root cause

`food_items.format` is a first-class column that the **library** surfaces have always
rendered as a `BRAND · FORMAT` meta line (`FoodTile`, `FoodRow`, `ArchivedFoodRow`) and
the **event** surfaces have always dropped. Brand + product do not identify a food: one
prescription line stocked in two forms shares *both* fields, so five surfaces rendered
two genuinely different foods as the same string.

| Surface | Rendered | Result |
|---|---|---|
| Foods tab / picker / archived | `BRAND · FORMAT` | correct |
| Home → Today (`TodayZone.tsx`) | `product_name` **alone** | the worst of the five |
| History (`EventRow.tsx`) | `brand · product` | the reported case |
| Calendar drill-in (`dayEvents.ts`) | `brand · product` | same |
| Meal completion card | `brand product` | same |
| **Vet report** (`generate-report`) | `brand product` | clinically material |

The fix needed **no migration**: `format` is already `NOT NULL` on `food_items_cache`.
The timeline queries simply never selected it. This was a select list, a type, and a
renderer.

Worth noting `ArchivedFoodRow`'s own docstring already argued the point — the format
meta exists there "so a food removed in one format stays distinguishable from an active
capture of the same name in another." That reasoning had just never been carried across
to the event surfaces.

## Decisions

**Always shown, not only on a collision** (PM-ratified). Wet-vs-dry is clinically
material on its own — hydration, urinary and GI relevance — and under a diet trial the
two forms are separately adherent. The collision-only alternative would also require
each row to know the whole library, so a paginated row would change appearance as the
library grew; always-on is deterministic and stateless.

**The tag is a sibling element, never a string suffix.** This is the load-bearing build
detail. `EventRow`'s food name is `flex: 1` + `numberOfLines={1}` with the intake badge
pinned flush-right, so an appended `· Dry` is the **first thing clipped** — on exactly
the long prescription product names that need it most. The tag carries `flexShrink: 0`
and the *name* truncates around it. Register is quiet tracked-uppercase tertiary so it
never competes with the intake badge, which carries the safety read.

**Suppressed when it would echo the row label**, so a treat-format treat reads
"Treat / Temptations · Tasty Chicken" and not "… TREAT" twice.

**Report code ships, deploy does not.** `generate-report`'s redeploy is already held
behind **B-494** (the empty safety band on a refusing patient). This rides that existing
gate rather than introducing a new one — the deployed report keeps the old collapsed
label until B-494 lifts.

## Build notes that bind future work

**One map, two runtimes.** `lib/foodFormat.ts` is deliberately **dependency-free** (no
imports at all, `.ts`-resolvable) so the Deno Edge Functions import the *same* copy the
app renders from — `lib/food.ts` re-exports it so the three existing library-surface
imports did not move. A second copy inside `supabase/functions` is precisely the B-103
drift class, where `jerky` reached the enum and the pickers but not the label map and a
jerky tile rendered its brand alone.

**The silent-drop trap.** `app/(tabs)/history.tsx` maps `TimelineRow` → `NyxEvent`
through an **explicit object literal**, and `food_format` is *optional* on `NyxEvent` —
so omitting it there compiles clean and silently drops the variant, leaving History
rendering the exact collision this work exists to fix. Caught in self-review, not by
`tsc`, and commented at the site. **Any new `TimelineRow` field needs a line in that
mapper; the type will not tell you.** It is currently the only mapper of that shape.

**Report-side reach.** `mealFoodLabel` feeds six call sites including the traceable meal
appendix, the off-diet exposure list and the free-fed rollup — where it is also the
*fallback grouping key* (`foodItemId ?? mealFoodLabel(m)`). Adding the form therefore
also **sharpens** that key: two forms of one product no longer collide into a single
group when the food id is absent.

## Verification

- `tsc --noEmit` clean
- `jest` — 148 suites / **3006 passed** (+9 from this work; the rest arrived with the `main` merge)
- `deno test` over `supabase/functions/` — **1001 passed** (+2)
- **CI green on both required checks** (`App (typecheck + jest)`, `Edge Functions (deno test)`)

All three were re-run *after* merging `main`, not only before it.

Deno is not installed in the cloud session by default; it was installed locally for this
run, which was worth it — its type-check caught two `generate-report` fixtures missing
the new join field that `tsc` never sees (`tsconfig.json` excludes `supabase/functions`).
The `deno.lock` churn from that install was reverted as unrelated (B-434 territory).

**Three existing report assertions were updated deliberately** — they encoded the old
collapsed naming (`Instinct Chicken` → `Instinct Chicken (Wet)`, `Instinct Turkey`,
`RC Weight` → `RC Weight (Dry)`). Called out in the PR rather than quietly rewritten.

New tests pin the rule rather than the rendering: full `FORMAT_LABEL` coverage so a
future enum value cannot silently render blank, the unspecified/unknown degradation
(no empty parenthetical), echo suppression, and — in both `dayEvents` and
`generate-report` — the actual B-568 case of two forms of one product staying
distinguishable.

## Not done

No `adversarial-reviewer` gate: no detection, escalation, or correlation logic changed.
The report's deploy gate (B-494) is untouched and still closed.
