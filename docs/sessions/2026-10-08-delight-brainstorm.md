# Delight from the record: the brainstorm, round 1

**Date:** 2026-10-08

**Mode:** DISCOVERY (PM prompt, no issue; the outcome lives on CUL-1683). Shipped via the docs-only PR for `claude/zen-wozniak-lltwlz`.

## The ask

The PM asked whether Culprit could surface lighter, delightful nuggets from the record ("your pet is really playful this week", "your pet really likes this food"), perhaps by push, that an owner would not notice week to week.

## What ran

- Scouted the prior art: notifications v2 §5.5 (the portfolio the PM said "none of these are truly calling my name" about), NV-G8/NV-G9, the Daily Recap, Noticed's positive-word rules and never-say lists, intake-is-not-preference, Principle 8.
- Profiled the PM's own record read-only via the Supabase MCP, scoped by pet id paired with the owner (C-27), aggregates and timestamps only, no notes or photos.
- A workflow of ten agents: six persona lenses brainstormed independently (Designer with Motion & IA, Data Scientist, the owners, Dr. Chen, market research with web search, Dir. of Engineering; 80 raw ideas), a facilitator clustered them, a clinical adversarial reviewer and a trust, safety and voice reviewer tried to break every idea, and a synthesis lead ranked the survivors. A container restart killed the first run mid-way; it resumed from the two cached lenses.
- A verification pass checked every load-bearing claim against code and data before anything reached the PM.

## The finding

Delight that depends on how the pet is doing ("playful", "likes", "a quiet week") either asserts wellness the record cannot see or, gated correctly, goes silent for exactly the owners who need warmth. Delight the calendar or the record's size schedules (her birthday, the record's age, day 84, a finish rate with its denominator, the household's rhythm drawn) is true however she is doing. Both PM examples fail on Nyx's record: the "playful" week holds a vomit at 7:06pm, Played at 8:00, a vomit at 8:12 and Hunched at 8:18 on Sep 25; the perfect finish records belong to the chicken treats the trial removed.

## Corrections the verification pass made to the team's draft

- Treat entries before the trial: 527, not about 420.
- The account's zone is America/Chicago, not Eastern: entries peak at 6 am, 5 pm and 9 pm.
- Nyx's trial list holds six foods, not three (the household card must read the whole list).
- Rabbit before the rabbit trial: Instinct rabbit in gravy was 2 entries before Jul 26, not 17. Rabbit first appears May 23 (Rayne rabbit treats); 12 entries across five rabbit foods before Jul 26.
- Weekdays on two frames (Sep 25 is a Friday, Sep 1 a Tuesday).

## Verified in code (each filed)

- The recap's lead, chips, trial strip and forward line render only for a single-pet account (`lib/daySummary.ts`); the PM's account has two active pets, so the PM sees the plain recap. Action for the PM: archive the test pet.
- No "has died" state; archiving a sole pet is blocked with "Adding another pet first makes this possible." (CUL-1684, High)
- The Foods shelf says "Finished 29 of 29 meals" for a food logged 264 times, from ratings that stopped Aug 12; favourites have no time window. (CUL-1685)
- "Vomiting is down 60%" is taught in the design principles, the nyx-voice skill and the Landing preview. (CUL-1686)
- Follow-up notifications name any pet under the names opt-in, outside R-8. (CUL-1687)
- No per-day arbiter for unsolicited sends. (CUL-1688)
- Ask's answer screen blocks only picky, fussy and finicky. (CUL-1689)
- Whether Nyx's vomit reads escalate on rating gaps. (CUL-1690)

## Deliverables

- `docs/culprit-delight-mockups.html`, round 1, published at https://claude.ai/artifact/GEzDASHyiz48QKYzyM7qbs (the shortlist drawn as frames, DB-4's options side by side, two drawings of Nyx's record at real density, the never list, the briefs, the conflicts, the better-than-the-rule cases, the proposed rules).
- CUL-1683 (`Waiting on PM`) carries the eleven decision briefs. DB-1 (a "has died" state) and DB-2 (does delight go quiet when the pet is unwell) come first.

## Decisions made

None. Everything is a proposal awaiting the PM's rulings. No CLAUDE.md or Tier 2 doc edit was made; CUL-1686 carries the one proposed Tier 2 edit.

## Next

Rule DB-1 and DB-2, archive the test pet, then the first slice: the shelf string (CUL-1685 part 1) and the day-84 weigh-in line this week, the death-state schema PR next, the recap's forward line after.
