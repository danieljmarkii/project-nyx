# History v2 step 2, HV-6: the row's rules, on Home and History

**Date:** 2026-09-25

Shipped via #914 (CUL-1163; fixes CUL-1121 and CUL-1197).

## The ask

HV-6 of History v2, one session and one PR, run beside HV-7, HV-8 and HV-9. Home's day spine (behind `design_v2`) folded meals logged back to back into one line like "3 meals" whatever was eaten, so a refused lunch disappeared inside the line (CUL-1121). The issue gave the one row Home and History share round 3's rules: a run joins only meals of one product eaten normally (rule B), only a run carries a chevron (rule D), every meal is named and a run names its product (rule K), the dose row carries its four chips and names its drug and its meal, the meal a timing line measures from keeps its own row, and the read slot draws the one predicate's states. `lib/dayNodes.ts`'s signature and `components/historyV2/` were off limits (HV-7 renders from the pipeline in parallel). Plan posted; the PM ruled two open points and said go.

## What changed

- **Rule B, one predicate** (`lib/spineCompaction.ts`): a run joins meals of one product key and one kind on one local day, each rated Most or All or unrated, with no photo, note, dose given in it, timing anchor, or found or estimated time. A recorded rating below Most (or one this build does not know) is always its own row; a missing rating never breaks a run, so CUL-1118 cannot change what a run means. Ties sort on the row id (rule H).
- **One product across wet and dry** (`lib/dayEvents.ts`): the owner's library holds "Selected Protein PR, Dry" (dry_kibble) and "Selected Protein PR, Wet" (wet_canned) as two items. A trailing word is dropped only when it repeats the item's own recorded format (`FORMAT_LABEL`) and the row shows that format as its tag; that name, folded by `canonicalizeBrand`, is the product key. A Class A key: convergent, pinned by a cross product property test. Before and after, over every account: 4 of 131 food items carry a format echo (2 accounts), and all 4 now pair into 2 shared keys, covering 341 meals.
- **Rule K** (`lib/spineNode.ts`): a run reads *4 meals · Royal Canin · Selected Protein PR* over *1 wet · 3 dry* (or *all dry*); a single meal reads *Meal · Royal Canin · Selected Protein PR* beside its DRY tag. One `foodLabelOf`, now in `lib/food.ts` (the lane's copy in `lib/patternsTiming.ts` is gone; its evidence label now joins with " · ").
- **The dose row:** the drug from the item, else the course, else only *Medication*; the four shipped chips; *in the 01:00 PM meal* from the stored `paired_event_id`, with the meal's intake beside it when it was not finished (in the meal chip's ink); *Unconfirmed* only for a dose in doubt (`isComboDoseInDoubt`). The meal says *with Prednisone* (or *with 2 doses of Prednisone*, *with a dose*).
- **The rest of the row:** the intake chip (All and Most teal, Some grey, Picked and Refused rose); FOUND or ESTIMATED under a time the owner did not witness (`SpineRowFrame` gained an optional tag, the column unchanged without one); *Weight · 9.9 lbs*; one accessible label per row in reading order (C-8).
- **The read slot:** the rose word, the grey *Photo not read*, the breathing tick, and nothing for a calm read. The read gate keys on what can carry a read, never the symptom tint (`mayCarryRead`, shared by the pipeline and TodayCard's copy read; CUL-1197).
- **Open in place, the static half:** every member of an opened run is the same full row a single event draws, with the run's rail over the thread.
- **Home's today read** (`lib/todayEventsQuery.ts`, a tested constant): it never selected the meal's intake rating, so on a cold open every refusal read as unrated and CUL-1121's fix would have done nothing on Home. It now also carries the dose's stored pair and that meal's intake, the course name (never across pets) and the weight. The optimistic dose row carries its pair too (`app/log.tsx`).
- **The timed meal is stable:** the lane's feedings sort on (time, id) before it runs, so two bowls at one instant always anchor the same one (HV-2's handoff). A cross-day anchor rides in an optional `timings.timedElsewhere` for History's per-day cards.
- **`guards/dayRowOneWay.test.ts`** (AC 15): Home and History draw a day only through `DayNodeRow` over the pipeline. History's side asserts zero callers until HV-7 lands its list (C-32).
- **Spec v1.5:** the two rulings as ⚠ RULED errata (§3.6, §5.4, AC 18).

## Decisions

- **PM rulings:** an unnamed dose says only *Medication* (never *no medicine named*, which is false while a sync is in flight); a finished `not_enough_to_say` read draws the grey *Photo not read* (nothing was really checked), and its verdict still rides for the Signal gallery's words.
- **Team calls, stated before building and unobjected:** the product key from the item's own format (above); Home's today read widened; CUL-1197 absorbed; *Photo not read* keeps H-4b's words (false only before a fresh install's first pull, or after a failed copy, CUL-1198).
- **The chip reads *Picked*, the log sheet's own word** (B-035: one spelling per rating), where the spec and the mock drew *Picked at*; the dose line's phrase stays *picked at*.
- **A found or estimated meal is its own row:** a run's time column holds only its range and cannot carry a member's tag.

## Verification

(to be completed)

## Reviews

(to be completed)
