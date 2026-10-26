# Colour fills row 3: links and choices onto the action and selected roles (CUL-2161)

**Date:** 2026-10-26
**One thing (re-ask):** D4 L1 — A ratchet only moves down (from 2026-10-12, the CLAUDE.md split; today's guard fell from 44 to 24: if next week a new screen draws one raw teal chip, what does the build say, and what is the one fix it will not accept?) · check: pending
**One thing:** D1 L1 — Reading a diff: when 51 files change, find the file that states the rule, then read one repetition · check: pending

Shipped via #1334. Dispatched row, `Teach: yes`. The PR body is the record of what changed and what review found; this file carries the teach.

## Teach

### One thing — reading a big diff: find the rule, then read one repetition (D1, L1)
A diff lists every line a change removed (marked `-`) and every line it added (marked `+`). Today's change touched 51 files, which looks like a lot to review. It is not: almost every file holds the same pair, one line out and one line in, swapping a colour's name. The work of reviewing is to find the one or two files that say what the rule is, read those carefully, then check that one repetition really follows the rule. The rest are the same sentence said again, plus the tests that check it.

**Like:** a landlord changes the lock on every flat in a building. You check the master key once, then try one door. You do not need to try all forty doors to know the master key is right.

**In today's work:** `components/ui/Snackbar.tsx:158`
```
-    color: theme.colorAccentInk,
+    color: colorRoles.action.onLight,
```
The minus line asked for a colour by its hue (the teal ink). The plus line asks for it by its job: "an action, on a light ground". The rule that says what that job resolves to (indigo) lives once, in `constants/theme.ts`, and the colour guard keeps the old name from coming back.

**Why it matters to you as PM:** when a PR says "51 files changed", the question to ask is "which file holds the rule, and was it reviewed", not "were all 51 read line by line".

**Check:** Suppose the round had ruled the action colour a different indigo. How many files would that change touch, and why?
