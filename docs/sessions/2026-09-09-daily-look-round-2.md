# The daily look — round 2: the PM's reactions applied, the chip interaction prototyped, the low-energy words and the return on Home re-opened, spec v0.2 (CUL-840)

**Date:** 2026-09-09

Shipped via **#814** (draft). Mode: **DISCOVERY, converging** (round 2 of the mock, the spec at v0.2, four new decision briefs and three restated; no app code, no migration). Branch `claude/daily-look-reactions-o490pn`. Project **Home v2 — the redesign**. Issue **CUL-840** (filed and claimed this session; continues CUL-838 / #813, linked there in a comment only). Filed: **CUL-841** (the FAB tile, deferred), **CUL-842** (the evening notification, deferred), **CUL-843** (an AI-phrased read over the look record, v1.x, gated). The naming board posted on **CUL-839**.

## What this was

The PM reacted to round 1 in fifteen "tweet style" lines and asked for a new round of mocks that is unambiguous about what is current — *"sometimes we mix in elements from mock-a to mock-b and it gets confusing which is current state."* The reactions are posted verbatim on CUL-838. Read one by one, they sort into four kinds, and the session treated each kind differently:

- **Rulings, applied** (each vetoable, recorded as R5–R8 in the spec's §0.1): chips by family, the field retired with its scale (R5); the Home card is the only door in v1, the FAB tile punted (R6); no notification in v1 (R7); multi-select, History and the day spine stand, the in-card pet row goes, the "Haven't really looked yet" chip goes (R8).
- **Design asks, drawn**: "nail the ux and design of this interaction … the transition and back" became a working prototype of the unfold and the way back (mock §02) on the Signal fold's physics; "beautifully design this section" set the round's fidelity bar.
- **Re-opened decisions, drawn as options with a recommendation**: the low-energy words ("the subdued workflow doesn't make sense to me as an end user") → L-9, three shapes; "day 40 and day 200 are the same … day 7 better than day 1", plus the AI-powered view → L-10, the receipt on Home, with the AI read filed; the name → L-11, a naming board on CUL-839; the haptic split → one rule (T-10).
- **Clarifications, not changes**: "storing mapped to a scale" was the field's cost in round 1's comparison table, not the proposal; under chips the record holds words as closed keys, the outcome, the hour, a note, and a vocabulary version — the mock's §01 draws what one saved look holds.

## What shipped

- **`docs/culprit-daily-look-mockups.html` round 2**, republished to the same artifact URL (https://claude.ai/code/artifact/d0ab2a60-60bb-49b9-a6e6-5a7db90bebc5). The page is one proposal; every alternative that is still a real decision sits inside a dashed box labelled *option*, and round 1's retired frames (the field, Doors A / C / D, the pet row, the "haven't looked" chip) are not on the page — they live in git at `de64537`. §00 the ledger of the fifteen reactions (what each ruled, what moved, where the alternative went) · §01 the card at rest (a dog, a cat, the safety morning, what one saved look holds) · §02 the interaction — a **working tap-through prototype** of the card (select, unfold the families, choose a deep word, fold back and watch it travel up, Done; the intake doorway and the emergency door open their sheets; reduced motion crossfades), a five-beat storyboard, the motion table on `foldMotion.ts`'s beats, and the families-first accordion boxed as the option (L-8) · §03 the three shapes for "Off" (the chip says where it goes · a plain question after Done · an observation only) · §04 the resting state (day 1; the quiet answered row on day 40 and day 200, identical; the receipt on the morning something is different; the withheld row under an intake concern; two cats through the header's switcher only) with a coverage line and the AI-phrased read boxed as options (L-10) · §05 History and the day spine (unchanged) · §06 Patterns and the report (unchanged, with the provenance split) · §07 deferred items, each with a Linear home · §08 the naming board · §09 the briefs · §10 who ruled what.
- **`docs/nyx-daily-look-requirements.md` v0.2 DRAFT** — §0.1 R5–R8 from the reactions; §0.2 re-cut (L-1 · L-2 · L-3 RULED, L-4 re-opened as L-10, L-5 · L-6 · L-7 still open and restated, L-8 · L-9 · L-10 · L-11 new); §0.3 T-2 vetoed, T-6 re-opened under L-9, T-10 the haptic rule, T-11 the look follows the header's active pet, T-12 the grid unfolds on the card; §3 marked RULED / GATED section by section with the case each round-1 direction made kept as the record; **§3.1a the disclosure** (the compact card, the unfold, the way back with the travel-up, Done, reduced motion, the option drawn against, the build note); §3.3 the L-10 answer in two halves; §3.5 rewritten for T-11; §3.6 the three shapes for the low-energy words with each lens's condition; §5.2 the outcome set without `not_observed`, `wrote_event_id` for the compound write under L-9 i, the field's ordinal columns struck; **§6.13 the instrument-change rule**; §8 the provenance split; §10 the PR plan re-shaped around the one door (DL-3 and DL-7 deferred, DL-4 carrying the grid, the motion, the compound write); §11 Q-1 vetoed, Q-7 drawn as *Off*, Q-9 answered by the unfold, Q-10 and Q-11 new; §12 the round-2 sign-off.
- **Linear:** the reactions verbatim on CUL-838; CUL-840 filed, claimed, the briefs posted; CUL-841 / CUL-842 / CUL-843 filed with their gates; the naming board on CUL-839.

## The team's recommendations (the PM rules from the frames; nothing here is ratified)

- **L-8 the disclosure → head words first, the families one unfold away, a chosen word travelling up on the way back.** The first thing an owner reads should be something she saw (*Off*), not a category (*Energy*); and in the families-first accordion a word costs one tap more than "nothing unusual" does, which is Door D's asymmetry inside the grid.
- **L-9 the low-energy words → i, the chip says where it goes.** A rose pip on *Off* and *Sleeping more* (and *Scratching more* → itch); one line under the Done bar says, before the tap, that the word also lands in the symptom record as *low energy*; one tap writes both rows; one Undo reverses both; the symptom row carries its provenance. The only shape of the three with zero decisions at the moment of event, and no clinical word on the card. Depends on CUL-509's tile relabel landing first.
- **L-10 the return on Home → the receipt.** The answered row answers back with a count when there is something to count — a symptom-class word's first date beside the coverage before it (*First time you've marked Mochi off in the 118 mornings you've looked since May 3*), then its count of recent looked mornings — and stays byte-identical on a quiet morning. The return on 118 quiet looks arrives on the morning it matters, in the sentence the vet wants. A coverage line and the AI-phrased read are drawn as options and recommended against by every clinical lens.
- **L-11 the name → Noticed / What you noticed.** The owner's act in her register; pairs with *Saw it / Found it*; "Noticed nothing unusual" reads naturally. The spec keeps "the look" as its working name until CUL-839 rules.

## Where the lenses agreed this session

- **The reactions were rulings where they were rulings and asks where they were asks.** No reaction was argued back; the ones the team would have argued (the pet row, the "haven't looked" chip, the FAB tile) were applied with the cost named on the page and the alternative kept with its case in a Linear issue, so the PM can re-read the reasons rather than the team re-litigating.
- **The card's own scaffold is the safety rule.** The first row (absence · the intake doorway · *Not himself*) at equal cost, and the head-word row, survive every shape drawn; L-8's recommendation is the one that keeps a concerning word at the same cost as the absence.
- **One haptic rule.** The PM's instinct ("an expectations mismatch") was right: the round-1 split (symptom-class words buzz, absence and positives are silent) put two feels on one grid. Every chip tap ticks; the save is silent; the symptom haptic belongs to a symptom row, so it fires only when a tap also writes one. Round 1's "no haptic on any save while a safety card is on screen" was over-stated and is corrected in T-10: the structural rule is silence on safety *surfaces*, and the look card is not one.
- **The look follows the header's active pet.** A second switcher inside a pet's own Home was the confusing thing; the header's switcher is where the app already switches. Sam's "one row for both cats" is paid for by the one switch; nothing on one pet's Home ever says another pet is unlooked.

## Where the lenses split (recorded, not resolved — L-9)

**Designer / Jordan / Sam:** i is the only shape with zero decisions at the moment of event, and the pip teaches itself. **Data:** a word that writes a symptom row from a daily prompt changes how often that row is written — the low-energy count steps up on the day the look ships and on the day an owner starts using it; any two-half comparison of that leaf must treat the look's start date as an instrument change (§6.13, the §6.10 shape), and every count prints its provenance split. **Dr. Chen:** accepts i on the condition that the symptom row records its provenance, so a prompted "off" and an unprompted 2am "lethargy" are never one number in his appendix. **PM decision needed:** L-9. The second adversarial pass tested this (below).

## The reviews

REVIEWS_PLACEHOLDER

## Found along the way (filed or noted, not folded in)

- **The artifact watch could not be registered** from this session (the gateway refused the wake subscription, as in the two previous rounds), so a republish or a comment on the page will not wake this session.
- **The repo's pre-push hook runs the full typecheck and jest suite** on every push, including a docs-only push; the push took several minutes for two HTML / markdown files. Not a defect, noted for the next docs-only session's expectations.
- **`events.logged_via`** is the natural carrier for the symptom row's provenance under L-9 i (*from the look*); whether it is an enum or free text today decides whether DL-1 needs a value added — checked at DL-1, not here.

## Residuals / known gaps

- The unfolded card on a device-height screen is the one thing round 2 could not measure; the prototype is a browser render at 316 px, and the product read of §02 is static (INSUFFICIENT where only a device render answers).
- L-5, L-6 and L-7 were not reacted to and are restated for a one-pass ruling; nothing in v0.2 depends on them changing.
- The head word *Off* for both species is drawn, not ruled (Q-7 rides L-9); the `subdued` key is unchanged.
- Under L-9 i the compound write (one insert, two rows, one Undo through `wrote_event_id`) is the one new engineering shape; it is named for DL-2 / DL-4 and not designed in detail here.

## Next

The PM reacts to round 2 and rules L-8 · L-9 · L-10 · L-11 on CUL-840 (L-11 on CUL-839), and L-5 · L-6 · L-7 in one pass. Then v0.3 with the rulings applied (or v1.0 if nothing re-opens), Dr. Chen's signature on §4.6 and the *Off* head word, and DL-0 (the flag seed) and DL-1 (the schema, its own PR) as the first build sessions. DL-4, the Home door, waits on L-8 / L-9 / L-10 and, for the card's placement only, on the Home v2 direction (CUL-811).

---

APPENDICES_PLACEHOLDER
