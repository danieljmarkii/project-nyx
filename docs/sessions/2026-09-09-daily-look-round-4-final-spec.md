# The daily look — round 4: the PM's round-3 reactions applied, the last briefs ruled, three asks drawn, and the final requirements doc (Noticed v1.0, CUL-846)

**Date:** 2026-09-09 (the same session as rounds 2 and 3, continued after the PM's third set of reactions)

Shipped via **#814** (draft, the same PR as rounds 2 and 3). Mode: **DISCOVERY, converged** (the spec at v1.0 BUILD-READY; the mock's round 4 on the same URL; no app code, no migration, and — as the PM asked — no step-by-step Linear plan). Branch `claude/daily-look-reactions-o490pn`. Project **Home v2 — the redesign**. Issue **CUL-846** (filed and claimed this round; continues CUL-844 / CUL-840 / CUL-838). Closed: **CUL-839** (the name is *Noticed*). Artifact: the same URL as every round (`https://claude.ai/code/artifact/d0ab2a60-60bb-49b9-a6e6-5a7db90bebc5`).

## What this was

The PM reacted to round 3 in nine lines (verbatim on CUL-846) and said the words this track had been converging toward: *"as long as the product team agrees with me, I think we're at the point where we can start to write up the final requirements for this project … let's just write up the final doc."* The reactions sorted three ways:

- **Rulings:** L-12 (the wash and the check), L-13 (bars for the symptom-class words, the absence as a sentence, the dated strip) and L-14 (*Noticed*) as recommended; L-15 (the coverage line's three forms) and L-16 (the quiet entry) deferred to the team, so the recommendations stand as ruled. Recorded as R16.
- **Asks, drawn:** the selected state "ramped up by about 20 percent" (a deeper wash, a heavier hairline as an inset ring, a larger check, a 4 pt settle ring; geometry still never changes); a way to collapse the word list without scrolling to its foot (the door stays where it was tapped and reads *‹ Show fewer words* at the top; the Done bar pins to the bottom of the screen while the grid is open — T-21; the PM was using the prototype correctly, the foot control was round 2's design and it was wrong for a list this long); a notes experience after a look (How We Feel's "structured first, say more after": *Add a note ›* under the newest entry, a one-line field in place, the note in quotes under the words — T-22; the record already had the column).
- **A question, answered:** "not 100 percent sure how we'll know which meal" — the intake door opens the meal path at the intake step with the pet's most recent food filled in (the "recent" shelf the picker and the FAB already read, `getRecentFoods`: this pet's last meal of each food, newest first), one tap to change; the owner names how much (§4.5).

**The team agreed the doc was ready, with one gate it owed itself:** the fourth adversarial pass on the rules round 3 had added (T-16 – T-20, §8's graph) and on what round 4 added (T-21, T-22, §4.5). It ran on the v1.0 draft and the round-4 mock, with a focused product read beside it; both are recorded below.

## What shipped

- **The mock, round 4** (`docs/culprit-daily-look-mockups.html`, republished to the same URL, now the build-ready page): the masthead re-cut; a round-3 ledger above the round-2 one in §00; §01's "which meal" answer and the prototype's router sheet (*Royal Canin HP — Mochi's most recent food · Change ›*); §02's ramped selected state, the way back at the top with the Done bar pinned in the prototype, and a new beat 4b (the note: the link, the field, the note in quotes); the L-12 and L-13 option boxes gone (git keeps them); §07 with nothing open that gates a build; §09 marked all ruled with the two provisional team calls; §10 with the round-4 reviews.
- **The spec, v1.0 BUILD-READY** (`docs/nyx-daily-look-requirements.md`): the header and the reading guide re-cut for a final doc; R16; every L-brief ruled in §0.2; T-21 and T-22; §3.1a's ramp, the way back at the top, the pinned Done bar, the note; §4.5's meal; §5.2's note column re-commented; §5.5's rows for the note's sinks and the pinned bar; §9's note clause; §10 named a shape, not a decomposition; §11's Q-12 and Q-13 marked provisional team calls; §12's round-4 sign-off and the two reviews.
- **CLAUDE.md v1.34:** a Read-These row for the spec; a version row carrying the four lessons that generalise from the four rounds; v1.31 archived.
- **Linear:** CUL-846 filed, claimed, and closed out by the outcome comment; CUL-839 closed on the name; CUL-844's Waiting on PM label released.

## The reviews

(Filled below once run; both verbatim in the appendices.)
