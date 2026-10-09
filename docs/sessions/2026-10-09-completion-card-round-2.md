# Completion card, round 2: what the record says it is for

**Date:** 2026-10-09
**One thing:** none (discovery round, no code)

DISCOVERY for CUL-1694 (sub-issue of CUL-1691), shipped via the session's PR. No code, no schema, no flag.

## The ask

The PM: the completion card is shown after nearly every log, so is there a better, more efficient design? Think divergently.

## What the record says

Read from production, counts only, mostly one household's dogfood.

- About 7 completion surfaces a day over the last 60 days (454 live logs, 59 active days), 8 in 10 of them meals.
- On the meal card: Change time on 22 of 232 meals (re-timed 1–30s after the write, last 45 days); an intake answer on 4 of 185 meals since Sep 1, all four less than "All"; Undo on 4 of 363 (deleted within 15s, last 60 days).
- 26 of 294 logs arrive within 10s of the previous one, while its card is still up.
- For the one pet logged continuously since May (real-time logging, not seeded: distinct create minutes track the row count), the share of meals with an intake answer: May 69%, Jun 89%, Jul 65%, Aug 19%, Sep 1%, Oct 1–8 5%. August also brought the trial heads-up panel (Aug 4) and Undo (Aug 23), so habituation, a busier card and a changed routine cannot be separated. All three point the same way.

## The diagnosis

Three jobs share one form: confirm and reverse (every log, acted on ~1%), capture at recall (time ~10%, intake ~2%), and carry the rare exception (a vomit read raised to a call, an off-list trial food, a double dose). The exception arrives in the form the owner has learned to skip; the in-repo habituation evidence (`docs/research/2026-09-home-insight-fold-and-freshness-patterns.md` §4) says repetition attenuates fast and a changed form resists it. A check on a dark card also fails Principle 9's cover-the-words test.

## The round

`docs/culprit-completion-card-mockups.html`, round 2, republished to the same URL. Five directions beside the shipped card: A the receipt, B the bowl you can see, C the exception changes form, D in place on Home, E the stack. Recommended: A + B + C. Round 1's frames are kept in a collapsed section at the bottom.

## Decisions requested

1. What round 3 draws (recommended A + B + C).
2. Whether the meal card asks about this bowl or the newest bowl old enough to answer (recommended: the latter, behind a flag, measured for three weeks; clinical, so Dr. Chen, the Data Scientist and an adversarial pass first).
3. Whether a card carrying a vet call holds until closed (recommended, call tiers only; Tier-2 edits to polish spec §5 and incident tiers §6 item 3).

## Persona lenses

Designer: the routine card is a receipt drawn in the record's own row shape; the exception gets its own ground and feel. Dr. Chen and Data Scientist: B moves when intake is asked, not whether, and keeps default null; latency and attribution are theirs to rule. Engineer: D is rejected for the Home write rule (`guards/homeWrites.test.ts`) and for doubling the forms. T&S: N/A (no new data path).
