# Meal stops calling treats meals; a look-only day stops reading "nothing logged" (CUL-1243, CUL-1244, PR-36)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-36 of the second Out of beta project. Shipped via #1023.

## What shipped

- **CUL-1243 (a).** `DayFacts` gains `treats`: the meal events whose row says *Treat* (`mealRowLabel`, the row's own word), a subset of `byType.meal`. Under Meal, `dayHeaderOf` names the two kinds apart (*2 meals · 8 treats · 10 in all · 2 meals not finished*). The count line reads *30 meals and 12 treats on 20 days*, and the strip's spoken label reads *2 meals and 8 treats logged*. The words come from one helper, `mealSplitParts`. *Not finished* is untouched (the intake lens's qualifying meals, never a treat, H-2). The ruling's example said *10 logged*; HV-12's approved *in all* (CUL-1266) is the word for the day's total beside a filtered count, so that is what shipped.
- **CUL-1244 (b).** `readLookRows` reads the answered looks over the loaded span with the Noticed filter's own condition. The store carries them as `HistorySnapshot.looks`, under All types with no search only, merged on each next page. The day card places them among the rows by time, on the hollow bead. They are read beside the page, never into it. The node pipeline (`buildSpine`) does not filter `check_in`, so a look in the whole days would have become a node. One predicate, `filterShowsDay`, decides whether a day is a card for the list, the header and the strip. A look-only day is a card whose header is the date alone. Coverage and the strip's words still call it unlogged (R-1).
- Spec v1.10, §3.2 and §3.5.

## What broke on the way

- The first push was blocked by the pre-push hook. The v2 screen's harness mocks `historyQueries` partly, so the real `readLookRows` hit a stub DB and the load failed. Fixed by mocking the new read beside the others.
- `code-reviewer` found the strip disagreeing with the list: a look-only day before the list's first claim (today, in practice) was a card in the list but not a door on the strip. Fixed with the shared predicate. It also flagged the Meal label on the strip, which still said *10 meals*.

## Falsification

- Data lens: a refused treat beside a refused meal. *Not finished* counts the meal only, and the split still names the treat, so the refusal is never folded into a routine-looking total. Treat-only day: *1 treat · 1 in all*, no "meals" claim.
- Data lens: a look-only day must not move any number. The window total equals the row count, coverage still lists Sep 5 and Sep 12, and the store test proves no `check_in` row reaches the pages, the whole days or the facts.
- Mutations: dropping the header exemption reds 5 tests, the section rule 2, the header split 3, the count-line split 1, and the strip door 1. Each new rule has at least one test that fails without it.

## Residual

- The look's place in the thread uses its `occurred_at`, while its day is its `local_day`. A look answered across midnight in another zone sorts to the day's edge. That is harmless.
