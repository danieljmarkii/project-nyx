# Daily look: the widget and Ask stop saying "nothing logged" beside a look (CUL-1475)

**Date:** 2026-10-04
**One thing:** D4 L1 — Guards: tests that scan the code itself, proven by breaking it · check: pending

Shipped via #PRNUM. BUILD, one PR, no schema change.

## What shipped

Two surfaces still claimed an empty record over a record the owner had been answering with daily looks. The daily-look spec rules that false (T-9) and gives the form to use instead (§5.1 row 1b, Home's own lead line).

- **The Home Screen widget.** On an empty day (no meal, treat, dose or symptom) the line was *Nothing logged yet today* even when the owner had made a look. The snapshot now carries one boolean, `lookOnlyToday`, true only when today has rows and every one is a look. The empty-day line then reads *Noticed today · nothing else logged yet*. The bit comes from the 7-day coverage read the publisher already runs (no new query), is built by a pure, timezone-honest `buildLookOnlyToday` in `lib/widgetSnapshotV2.ts`, rides `lib/widgetProps.ts` (an absent field reads as false), and the layout inlines both strings, since nothing outside the widget function exists in the extension's context. A stale render after midnight keeps the plain line: yesterday's look is not today's.
- **Ask's empty record.** A record holding only looks is still empty to Ask, whose tools stay blind to looks (spec §9), but the headline *Once a few days are logged…* sat over weeks of looks. `loadAskSuggestions` now returns `hasLooks` (existence only, off the same per-type count), and the empty record's second form says *What you've noticed is on {pet}'s record. Nothing else is logged yet.* / *Ask reads counts, trends, foods and meds, not the looks themselves. Log a meal or a symptom and I'll have something honest to say.* The door is unchanged.

## Decided

**A better-than-the-rule brief, ruled by the PM (option 1).** The issue's fix ("the flag rides the snapshot") collided with a binding row in the daily-look spec §5.5: *the widget snapshot never carries a look*. The rule protects the owner's perception (the words, the note) from the Home Screen; a bare existence bit carries neither. Options put: (1) allow one existence-only boolean, (2) keep the rule absolute and suppress the widget's absence line on any day with rows outside its four tile classes, (3) fix Ask only. The PM chose 1 and approved the copy. The spec row now reads "never a word, note or count", with the ruling inline under a ⚠ marker; the widget spec's §2.6 / §2.7 carry the second empty line. Logged on CUL-1475.

**"Every row is a look", not "a look exists".** The 1b line makes a claim about the whole day (*nothing else logged yet*). A look beside a weight takes the widget's empty branch too (a weight has no tile), so a presence flag alone would have printed a new false sentence. The predicate refuses that case, and a real-database test pins it.

## Verification

- Tests added across the pure builder, the real publisher read on node:sqlite (look-only, look plus weight, yesterday's look, a soft-deleted look), the props carry, the layout evaluated through its emitted string (both lines, the stale branch, an absent field), Ask's presence read over the real schema (a deleted look, another pet's look), and the screen's two forms.
- The snapshot's field allowlist test (`D9 by construction`) failed on the new key, as it should; the key was added with its ruling, plus a test that the snapshot carries the look as one boolean and nothing else.
- Eight mutants, each killed: the every-row rule removed, an empty day marked, the today filter removed, the publisher marking every row a look, props dropping the flag, the layout ignoring it, Ask's presence dropping looks, Ask's screen ignoring `hasLooks`.
- `tsc --noEmit` clean; full jest 614 suites / 13,741 passed; the touched suites pass under UTC+14, UTC+12:45 and UTC−10.

## Filed, not folded

- **CUL-1563**: the widget says *Nothing logged yet today* over a day holding only a weight or a normal stool (types the four tiles never show). Pre-existing; the same coverage read can carry a sibling bit.
- **CUL-1564**: the trial card's day-1 line *Nothing logged yet today.* renders beside a logged look, symptom or weight; it is keyed on feedings only.

## Residuals

- The widget's look bit buckets by `occurred_at` in the device zone, like every other row the widget reads, not by `looks.local_day`. The two differ only after the owner changes time zone between making a look and the publish; the widget's other facts share the same clock, so the line stays consistent with them.
- The widget line is longer than the plain one; it fits a systemMedium widget (the only family shipped, V2-5), unconfirmed on a device.
