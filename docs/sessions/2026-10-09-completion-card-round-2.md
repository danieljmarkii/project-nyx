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

## Round 3, same session: the card in daylight

The PM's reaction to round 2: no massive overhaul now, but the card is "jarringly black", the only jarring black chunk aside from the day screen. Round 2's directions left the page (commit 8b9f3da keeps them); its two findings were filed as CUL-1696 (when the intake question asks) and CUL-1697 (a vet call's look and timer).

A workflow (4 readers, 4 candidates, 4 lens judges, 2 adversarial verifiers) settled the ground:

- **Inventory:** the cards and the snackbar share #0A0A0A, no ruling ever chose it (it came in as an "Undo send" snackbar, #37). The day screen is brand night #13112E, deliberate. The app has no system dark mode.
- **Scores (design / contrast / engineering / brand):** daylight 8/6/7/8, warm paper 4/8/4/5, graphite 5/4/6/5, brand night 3/8/3/2. Daylight is the only one that removes the block and keeps every brand rule (register rule 2: capture stays in the day system).
- **What the verifiers caught, now in the proposal:** the deeper teal disc fails 3:1 against its own gold halo in the celebrate state (fixed with a 2pt white gap before the halo); an outline would match the content cards, so the lift is shadow only; the amber trial panel needs a stronger bar to keep its chroma (one new token); a log from the day screen would land a white card on night, so the card takes the night ground over a night screen; the symptom card's dim passes taps through to Home's look chips.

Decisions requested (on the page): approve daylight with polish §5 R1 reworded (a better-than-the-rule brief); the mark (deeper teal with a gap, recommended, or the teal ink disc); a tap on the symptom card's dim closes the card (recommended).

## Round 4, same session: the check writes itself

**PM rulings on round 3:** call 1 (daylight) and call 2 (the deeper teal disc with the white gap) approved; call 3 (the dim) held for a plainer explanation. The PM asked for motion on the new check ("like we do with the FAB") and asked whether the night state exists.

A second workflow (4 readers, 4 motion concepts, 5 lens judges, a synthesis, an adversarial pass) chose the motion. Scores: the check writes itself 7.8, the pill becomes the check 7.2, quiet weight 6.6, into the record 4.1. The adversarial pass returned 15 issues; the ones that change what the PM sees are now in the mock:
- the gold fades in at scale 1 (a bloom would close the 2pt gap);
- on the + path the teal fill reveals the check in one beat, no separate pen (four beats would tire at 7 a day);
- finishing on touch never advances the gold, so a finger on "Refused" never flashes it;
- Undo makes the controls inert at once.

The rest (timers keyed to the record, the vessel fill keyed to the flight's `landed` phase, the trial flag resolving before the gold) are build rules in the new spec.

**Night state:** it exists on one narrow path (9pm summary on, nothing logged, "Log an event", then a meal, dose or weight through `/log`), at most once a night. No night variant; the daylight card plays the same there.

**The dim:** round 3's "tap closes the card" is withdrawn. The dim covers the + button and the tabs, so + would take two taps, and closing early ends the Undo window. New recommendation: dimmed means inactive (the look chips under the dim ignore taps).

**Shipped in this PR:** round 4 of `docs/culprit-completion-card-mockups.html` (seven playable states, a 4× slow-motion toggle, frame-by-frame stills and a timeline); the new `docs/nyx-completion-card-requirements.md` v0.9 (the ground token map, the motion timeline and constants, every state, the engines rule, the PR plan and QA matrix). It becomes v1.0 BUILD-READY on the two open calls. The spec is not yet in CLAUDE.md's Read-These table; that table is size-guarded, so add it in the first build PR with an offsetting trim.

**Open calls:** R4-1 (on the + path, the name lands at about 0.2s, recommended, or after the mark at about 0.9s); R4-2 (the dim: dimmed means inactive, recommended).
