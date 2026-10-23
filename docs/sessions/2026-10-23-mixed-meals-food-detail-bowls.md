# Food detail: the In mixed bowls section

**Date:** 2026-10-23 · **Issue:** [CUL-2085](https://linear.app/projectnyx/issue/CUL-2085) · **Branch:** `claude/mixed-meals-adhoc-10231157` · shipped via #1286

## What shipped

Spec §7.4's read-only section on a food's detail screen: one line per food it was mixed with ("8 bowls with Rabbit Pâté · last Oct 22"), absent for a food never mixed, a retry on a failed read, each line a door into History on its newest bowl's day. The section and the Foods tab's "· 8 in a mix" note now read one shared rule, so the lines always add up to the note.

## Residuals

- The mock frame waits on #1285, which owns the mixed-meals mock page.
- A line lands on its newest bowl's day only; History has no "bowls with this food" filter, so the earlier bowls are a scroll away rather than a filter away.

**One thing (re-ask):** T2 L1 — The sync queue: a timestamp is only as good as the clock that wrote it (from 2026-10-22, migration 107: a meal logged offline at 9:00 and uploaded at 10:00, before 107, which time did the server keep, and why did the other phone miss it?) · check: pending
**One thing:** D3 L1 — Reading a test: a test that two numbers agree proves they agree, not that either is right · check: pending

## Teach

### One thing — a test that two numbers agree (D3, L1)
Today two places on screen count the same thing: the Foods tab says "8 in a mix", and the new section lists the bowls that make up those 8. One test checks that the section's lines add up to the tab's number. That test is good at one job, catching the two drifting apart, and blind to another: if both counts went wrong in the same way, they would still agree and the test would stay green.

**Like:** two clerks counting the same till who compare totals. If they disagree, someone miscounted. If they agree, either both counted right or both skipped the same drawer.

**In today's work:** `lib/foodMixedBowls.test.ts:106`
```
expect(lines.reduce((sum, l) => sum + l.bowlCount, 0)).toBe(stat?.mix_count);
//      add up every line's bowl count  ...  must equal the Foods tab's "in a mix" number
```

**Why it matters to you as PM:** when a PR says "the two surfaces always agree", ask what proves each one is right on its own; here it is the other three tests, which spell out the exact words each case must print.

**Check:** Suppose a later change makes the shared rule skip every bowl whose second food wasn't recorded. Does this sum test go red, and which kind of test would catch it instead?
