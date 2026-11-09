# Clinical voice row 1: the skills and specs name the floor and the deferential formula

**Date:** 2026-11-08
**One thing:** D4 L1 — A ratchet guard: the ceiling only moves down, so freed space cannot be regrown · check: pending

Shipped via #1481, finishing CUL-2666 (row 1 of the clinical voice project, parent CUL-2654). Dispatched, plan-gated; the PM typed the go, then approved all six Tier 2 edits and ruled (a) on both CUL-2675 questions.

## What happened

The PM's 2026-11-07 rulings (`docs/clinical-voice-inventory-2026-11.md` §R) make most vet asks deferential ("Worth a call today") and keep a short floor of direct words: blood, suspected foreign material, a cat with no Most or All meal in 24 h, collapse or breathing, and any `call_now` read. This row wrote those rules before any string moves.

- `clinical-guardrails`: the floor in the opening rule; Pattern 2's words keyed by reason (floor reasons win, never keyed on `tierReasonOf`, structured fields plus `visual_flags` on unedited rows, a live cat check that can only add the floor, unknown → floor on every surface, legacy and unknown tiers included); new Pattern 11, "soften the verb, keep the clock, keep the reason", with the chronic-vomiter counterexample and the Never column as a test.
- `nyx-voice` Pattern 6: the deferential register.
- Six Tier 2 spec edits, PM-approved: the Signal door and a new strip-ask row, the tier-word map's two `call_today` rows and rule 6, Ask §7.7's register, the care-state wording, and *The Owner Decides* under Copy Principles.

## What broke and how

**The budget had 14 bytes of room.** The second ratchet (CLAUDE.md plus every `.claude/**/*.md`) sat 14 B under its ceiling, and every rule added here went over. Each overrun was paid by deleting text in the same two skills: resolved ambiguities, a long code comment, provenance paragraphs. The adversarial pass checked the trims and restored one clause whose reason mattered (why a hold clears an owner's hide).

**Two adversarial passes, both FAIL, all fixed in text.** Pass 1 found eleven gaps. The sharpest: the strip proposal softened a call-now card to "Worth a call today", and nothing said a floor reason beats a deferential one on the same row (`tierReasonOf` returns contextual before visual, so blood plus repeat vomiting could read soft). Pass 2 found four more, the sharpest a rescue write: a blood photo whose write-back failed has `visual_flags: ['blood']` and no structured column, so a rule reading only the structured fields would give it soft words. Every fix made the rule louder. Per the two-pass cap the last five had no third review; row 4 re-runs the falsification against the built code.

**The inventory's strip verbs didn't fit.** "Worth telling your vet" (22) and "Worth a word with your vet" (26) break the live 20-character strip cap; the approved verbs are "Worth telling a vet" and "Worth asking a vet".

## Residuals

- The legacy and unknown tier floor (CUL-2675, ruled (a)) is a rule now and code in row 2.
- The §5 outcome-loop baseline query rides with row 2, the first PR that changes wording.

## Teach

### The ratchet: a guard whose ceiling only moves down (D4, L1)
Some tests in this repo do not test the app; they measure the repo itself. The size guard adds up the bytes of every instruction file a session reads and fails the build if the total is over a fixed ceiling. The twist is that it also fails if the total falls well *below* the ceiling and nobody lowered it, so the ceiling can only ever move down. That is a ratchet: it clicks one way.

**Like:** a belt you can only tighten. Lose weight and you must take in a notch; there is no notch to let it back out.

**In today's work:** `guards/claudeMdBudget.test.ts:222`
```
const TOTAL_CEILING_BYTES = 469_080;   // the most bytes every session may be asked to read
const TOTAL_SLACK_BYTES = 4_096;       // how far below the ceiling the total may drift before the ceiling must follow it down
```
This row needed about 2 KB of new rules with 14 bytes of room, so the build went red four times, and each time the fix was to delete old words, never to raise the number.

**Why it matters to you as PM:** every rule you ask for in a skill now costs a deletion somewhere, which keeps the instructions every session reads from quietly doubling, as they did twice before this guard.

**Check:** if a session deleted 5 KB from a skill and left the ceiling where it was, what would the guard do on that PR, and what would happen to those 5 KB if it didn't?
