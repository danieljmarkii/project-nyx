# Vet report v2 PR-09: the v2 predicates

**Date:** 2026-11-01 · dispatched row PR-09 · [CUL-2289](https://linear.app/projectnyx/issue/CUL-2289) · shipped via #1380

The record of this change is the PR body (its Definition of Done, the mutation table and the QA script). This file exists because the row carried `Teach: yes`.

**One thing:** D2 L1 — Types: a yes/no cannot say "I could not check" · check: pending

## Teach

### One thing — a yes/no cannot say "I could not check" (D2, L1)
A type is the shape a value is allowed to take, and the code is held to it. If an answer can only be yes or no, then "I could not measure it" has nowhere to go and quietly becomes one of the two, usually "no". Today the question was "is this itching getting worse?", and on a week the owner did not log, the engine cannot tell. So the answer was given three shapes instead of two, and the rule that moves a flag out of the safety band accepts only the one that means "measured, and not worse".

**Like:** a smoke detector with a dead battery. If its only lights are "smoke" and "no smoke", a dead one shows "no smoke". A third light, "can't tell", is what stops you sleeping through a fire.

**In today's work:** `supabase/functions/generate-signal/detection.ts:8071`
`export type WorseningOnSign = 'rising' | 'not_rising' | 'not_measured'`
The answer to "is this sign getting worse?" may be one of exactly these three words, and nothing else. `not_measured` is the dead-battery light: the engine had a dark week and could not compare.

**Why it matters to you as PM:** when a spec says a flag may move "when X is false", ask what happens when X could not be checked; that gap is where a warning goes quiet.

**Check:** Suppose the answer had stayed a plain yes/no and the rule read "move the itch flag out of the band when the answer is no". An owner skips logging for the whole week before the visit, and the itching actually doubled. Where does the itch flag print, and why?
