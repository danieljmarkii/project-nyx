# Colour fills PR-06: the teal ink becomes role only

**Date:** 2026-10-27
**One thing:** D2 L1 — A type check reads every name you wrote: 78 renamed colours, each one checked to exist before the app runs · check: pending

Shipped via #1337 ([CUL-2201](https://linear.app/projectnyx/issue/CUL-2201)). Dispatched BUILD row, branch `claude/colour-fills-pr06-10262349`. The PR body is the record; this file exists for the teach row.

## Teach

### One thing — A type check reads every name you wrote (D2, L1)
TypeScript knows the shape of every object the app defines. When code names a colour as `colorRoles.positive.fillUnderLabel`, the type check walks that path and refuses the build if any step does not exist. It runs before the app does, on every file, so a typo cannot hide in a screen nobody opened today.

**Like:** A wedding seating chart checked against the guest list before the printer runs. A card with a misspelled name is caught at the desk, not at table nine.

**In today's work:** `components/log/AdherenceChipRow.tsx:141`
```
return concern ? theme.colorEventSymptomInk : colorRoles.positive.fillUnderLabel;
```
`fillUnderLabel` did not exist this morning; it was added to `colorRoles` in `constants/theme.ts` today. This line, and 77 others that swapped `theme.colorAccentInk` for a role, all had to name a path that really exists. One `npx tsc --noEmit` run checked all 78 in seconds. What it cannot check is whether the name is the right one: `action.onLight` and `positive.textOnLight` both exist, so choosing between them was read by hand, site by site.

**Why it matters to you as PM:** When a PR says "types pass," that is a promise that every name in it is real, not that every name is the right choice. The second question is the review's, and it is where today's judgment went.

**Check:** If a later session wrote `colorRoles.positive.textOnLigth` (the h and t swapped) in a screen nobody opens in testing, when would anyone find out, and what would they see?
