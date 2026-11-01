# Vet report v2 PR-16: the composer

**Date:** 2026-11-01 · dispatched row PR-16 · [CUL-2296](https://linear.app/projectnyx/issue/CUL-2296) · shipped via #1385

The record of this change is the PR body (its Definition of Done, the two adversarial passes and the QA script). This file exists because the row carried `Teach: yes`.

**One thing (re-ask):** D2 L1 — Types: a yes/no cannot say "I could not check" (from PR-09 earlier today: an owner skips logging for the whole week before the visit and the itching doubled; had the answer stayed yes/no, where would the itch flag print, and why?) · check: pending

**One thing:** D5 L1 — What a reviewer looks for: two findings that share a name are not the same finding · check: pending

## Teach

### One thing — two findings that share a name are not the same finding (D5, L1)
When code checks whether two lists hold "the same" thing, it has to decide what makes two things the same. Choose too few details and two different things look identical, so the check says "nothing missing" when something is. Today the composer compared the flags the owner's chosen dates would print with the flags live in the last 56 days, and it matched them by kind and symptom alone. The second review built a cat whose trial ended in October: the report for those dates carried a September "eating less" flag, the live set carried this week's "refusing food, then vomiting", and because both were "an eating flag", the warning that should have said "the report won't show this" said nothing.

**Like:** a coat check that matches tickets by colour only. Two black coats, one ticket, and you walk out with someone else's coat while the attendant is sure the right one went home.

**In today's work:** `lib/reportComposer.ts:370`
`const flagKey = (f: ComposerFlag): string => \`${f.kind}:${f.sign ?? ''}:${f.kind === 'intake_decline' ? f.trigger ?? '' : ''}\`;`
This line is the coat ticket: it decides which details make two flags "the same". It now includes what set off an eating flag (a refusal is not a slow dip). For any dates that end before today the composer goes further and confirms nothing by name at all, because an older flag of the same kind can sit there in place of today's.

**Why it matters to you as PM:** when a spec says "warn if X is missing", ask what counts as the same X, because a loose match is exactly how a missing warning reads as present.

**Check:** An owner picks dates that end Oct 10. The report for those dates prints a September flag for blood in vomit, and this week the cat vomited blood again. If the composer still matched flags by kind and symptom only, what would the screen tell the owner about this week's blood, and why?
