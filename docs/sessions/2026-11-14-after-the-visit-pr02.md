# After the visit PR-02: a saved visit reopens on How did it go?

**Date:** 2026-11-14
**One thing:** T2 L1 — Last write wins: a save that changes nothing still counts as the newest write · check: pending

Dispatched BUILD row for [CUL-2754](https://linear.app/projectnyx/issue/CUL-2754), plan-gated. The plan went up on the issue and the PM typed the go in this session. Shipped via #1536 (draft, left for the PM). The PR body is the record of what changed; this file exists because the row carries `Teach: yes`.

The short story:
- *Edit* and a new *Add to the plan* row on a saved visit now open How did it go? by the visit's id, with or without a booking.
- The screen is seeded from the record and offers chips only on this visit's own items.
- *Done* writes only what changed, and leaving keeps what was typed.

Two reviews ran: `code-reviewer`, and `pm-feature-review` reading as Jordan. Between them they caught three ways the first version could write data nobody typed or say something false. All three are fixed with tests, each test proven by reverting the fix it guards:
- a blur landing before the first render would have diffed a blank form against the record;
- a future-dated visit synced from another phone was rewritten by a reopen that touched nothing;
- a failed save on the way out said "try again" about a screen the owner had already left.

The review's product forks are parked on the issue: the pet's other running meds on a reopen ([CUL-2774](https://linear.app/projectnyx/issue/CUL-2774)), mock A3 against R3 on chips, and *Talked about it* days later (CUL-2755's). The recheck row and app-kill typing are noted on [CUL-2757](https://linear.app/projectnyx/issue/CUL-2757) for PR-03.

## Teach

### One thing — Last write wins: a save that changes nothing still counts as the newest write (T2, L1)
When two phones edit the same record, the app does not try to blend the two versions. Whichever save carries the later timestamp wins, and the other is overwritten. That rule is called last write wins. The catch is that the app cannot tell a real edit from a save that changed nothing: both stamp the record "edited just now". So a *Done* pressed on an untouched screen could quietly beat a real change made a minute earlier on your partner's phone.

**Like:** two people updating a shared whiteboard where only the most recently signed version counts. If you walk past and re-sign it without changing a word, your signature still erases whatever the other person wrote after you last looked.

**In today's work:** `lib/vetVisits.ts:1875`
`if (trimOrNull(fields.notes) !== trimOrNull(record.notes)) patch.notes = fields.notes;`
This line adds the notes to the save only if they differ from what the record already holds. The same check runs for every field. When nothing differs, the save is empty and the function that writes it stops before touching the timestamp, so a reopen you only looked at never becomes "the newest write".

**Why it matters to you as PM:** this is why AC 16 says "a reopen with no change writes nothing (`updated_at` unchanged)". It is a sync rule, not a tidiness rule.

**Check:** You open a visit on your phone and leave it untouched. Meanwhile your partner adds "Recheck in six weeks" on theirs, and both phones sync. If the app had saved your untouched screen anyway, what would the visit say afterwards, and why?
