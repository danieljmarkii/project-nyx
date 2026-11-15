# 2026-11-15 · Pet memory discovery: from "show what the AI holds" to an AI forward Pet tab

**Date:** 2026-11-15
**One thing:** none: a discovery session with no code. The concept it kept returning to is that emphasis is a safety property. A fact that only ever adds context can still make something quieter by the path it travels or by what it sits beside: an unknown line kind dropping its neighbours on old app builds, amber on missing paperwork beside a plain row for a 1.6 lb weight loss, a "since last visit" number of 0.1 lb next to a standing loss of 1.6.

**Issue:** [CUL-2787](https://linear.app/projectnyx/issue/CUL-2787) (DISCOVERY) · **Branch:** `claude/jolly-sagan-25klw1` · **Outcome:** shipped via #1540 · **Mock:** https://claude.ai/artifact/8wgBTBSJZhjt5yn9mB2XKF (round 3; rounds 1 and 2 are in git at `5a01128f4` and `4c2fc5f70`)

## What happened

**The first pass (the brief as asked).**

- **Ground truth first.** Read-only SQL on the PM's own cat. Every standing fact the app holds about her, by table, screen and reader, then sixteen things a vet or careful owner would say are true that the record has no home for or leaves empty. `conditions` has no row for her.
- **Built on the CUL-2753 input audit,** read from its unmerged branch.
- **Four research lanes,** each a dated brief: competitive, clinical, a code walk of every reader of every standing fact, and a privacy audit.
- **Two isolated reviewers on the first proposal.** `rls-privacy-reviewer`: FAIL as written on two blockers, PASS WITH CONDITIONS once stated. `adversarial-reviewer`: BREAKS as written on six quiet paths; it re-traced six edges of the code walk and all held.
- **Mock round 1** and **seven decision briefs with two persona conflicts,** posted as one round.

**The second pass (the PM's reactions, same day).**

- **"What if this replaced the Pet tab?"** Drawn on Nyx's record. Jordan and Sam each read it alone: both said replace, with conditions, and both distrusted a door on the old tab.
- **Reactions to round 1:** the night header "is bold"; unsure about amber; the edit chips "feel funky"; a lean to replace the tab; how sure are we about AI extraction; next round as a few directions, fresh, on brand, with motion.
- **A design read** of about 22 screens from 10 products, seen as images. No screen uses amber for "look at this"; none edits a fact with rows of chips; none says who told it a fact.
- **A live extraction test:** four runs across three model tiers on Nyx's two real visit notes, scored by hand.
- **Mock round 2:** an on brand page; three no-model tab shapes, three edit patterns, four attention treatments, the house motion played at its shipped timings.
- **"Why isn't this AI forward?"** Conceded and redrawn: a read-back, a question about what conflicts, suggestions beside the owner's words, a box to tell it things. Jordan and Sam read it: AI forward, with conditions.
- **PM direction:** go AI forward with their feedback; research others' functions, not only WHOOP's design; round 1 was closest to the vision; mock a few directions per key screen.
- **A functionality read** of about 65 AI health, assistant and pet products (12 from their own pages).
- **Mock round 3:** four tops, three fact layouts, three review flows, a fact detail, the permission screen, six function sketches. Jordan and Sam ranked them alone, with the team's captions removed.

## What the reviews and reads changed

- The first read rules broke six ways and were amended (synthesis §5; safety brief §7).
- `conditions` needs a three-verb access policy, column grants and a same-pet trigger before it grows, and every reader must filter removed rows in the query (privacy brief §I).
- A prompt about missing paperwork is never styled louder than a row that feeds a live safety finding (Sam).
- A model-written read opens with what the record shows about the pet, in the engine's numbers, says what it read and did not, and is never the only place a gap could show (both owners).
- A "since last time" number never appears without the standing one (both owners caught 0.1 lb beside 1.6 lb).
- A remark the owner types to the AI ("always been fussy") is kept as dated words and is an input to nothing.

## Where the owners landed on round 3

Both: facts sorted "now, then before"; the review as "safe ones together" with every line in view before the button. Split on the top (Jordan: daylight on the rail; Sam: the record leads); neither put night or the conversation first. Both want "before a visit" most of the six functions. Both would not allow the AI until the permission screen states the real retention and training answer.

## Findings outside the brief (routed, not fixed)

- **Fifteen edges where an owner's edit already quiets a warning in the shipped app,** plus two found by the falsification pass. One parked class issue with the clinical gate label. Not named here so this PR does not close it.
- **The access rule on `conditions` today** lets a row be hard deleted or moved between an owner's own two pets. Carried into the proposal's migration row.
- **The CUL-2753 input audit missed `analyze-vomit`.** Recorded in the safety brief; the frozen audit is not edited.
- **The vet documents bucket is private** (checked by SQL), which closes a dashboard check the CUL-2753 round asked for.

## Rulings and direction

- **Direction, PM, 2026-11-15:** AI forward, taking Jordan's and Sam's feedback. Round 1's look was closest to the vision. A lean toward replacing the Pet tab.
- **Not ruled:** D1 to D7 and the two conflicts from round 1; the better than the rule brief on stored model text (Ask's no memories rule, 2026-07-18); the night ground on the Pet tab (brand rule 2); the size, about 18 rows; the "Add all" conflict; reactions to round 3.
- The round's open homes are two issues outside this PR: the rulings issue on the `Waiting on PM` label, and a new discovery issue for the next session.

## Team calls made (reversible; reverse any by comment)

- The synthesis lives at `docs/pet-memory-discovery-2026-11.md`, outside `docs/research/`.
- "About Nyx" is the working title, ahead of a ruling.
- The clinic or home label on a weight is left to the separate weights discovery.
- The vet's opinion, absences and causes get no place on the page.
- Round 3 marks no team pick; the PM asked for directions to react to.
- The two stored vet files were not fetched. This session could run SQL and held no key that reads Storage; the routes that would have worked without the PM change a private health document bucket.

## Files

- `docs/pet-memory-discovery-2026-11.md` (17 sections; §18 is the next session's kickoff prompt)
- `docs/research/2026-11-pet-memory-{ground-truth,competitive,clinical,safety,privacy,design-patterns,extraction-test,functionality}.md` and eight index rows
- `docs/culprit-pet-memory-mockups.html` (round 3)

## Limits

- WHOOP's and OpenAI's own pages refused automated fetches throughout. WHOOP's screens are from its May 2026 beta and its filled-in list was not seen.
- The functionality read reached 12 of about 65 products from their own pages; 13 not at all.
- The extraction test is four runs on typed notes through tooling that loads this repository's safety rules. No document, photo or handwriting has been tested.
- The code walk executed nothing; one edge stays partly verified.
- Six persona reads (Jordan and Sam, three times each), all from static renders, one pass each. Not real owners and not a device pass. The frames drawn from their round 3 reads have not been read by either.
- The mock's motion was driven in a browser, not on a phone.
- The permission screen's wording about the AI provider is a placeholder.
- Both reviews are design stage, on the first, no-model proposal. The AI forward direction has had neither.

## Next session

The paste ready kickoff prompt is §18 of `docs/pet-memory-discovery-2026-11.md`.
