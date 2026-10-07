# Engines v3 PR-23e: the summary validator requires every safety clause verbatim

**Date:** 2026-10-06

Dispatched session (`/dispatch`, Engines v3 PR-23e), BUILD mode on CUL-1618. Shipped via #1086.

## What shipped

- `generate-signal/summary.ts`: the fact packet carries `safetyClauses` (the asking templates, then the watched EN-9 heads, as they lead `clauses`). `validateSummary` requires a model summary, whitespace normalised, to open with them verbatim and in order. The text after them (the tail) may name no vet (`VET_WORD_RE`: vet, veterinarian, doctor, DVM, clinic), on any packet, because no non-safety clause does. The reassurance, preference, causal, disease and care-claim screens read the tail only; numbers are still checked over the whole text.
- `summaryModelPayload` hands `safety_sentences` apart from the `draft_sentences` the model may smooth; system prompt rule 7 says copy them first, word for word.
- `asksVet`, `VET_ASK_RE` and `VET_KNOWS_RE` (CUL-1608, PR-23d) are removed. The verbatim lead subsumes them, and `VET_KNOWS_RE` would have rejected a watched clause whose care text lacks the head.
- Side effect, closed for this surface: a food name with screened vocabulary ("Royal Canin Recovery") and the red-flag template's "not a diagnosis" no longer fail the validator, since they sit in the lead.
- No runtime change: `SUMMARY_MODEL_PHRASING_ENABLED` stays false and `shouldPhraseWithModel` still refuses every safety packet. The merge redeploys `generate-signal` with identical output. `pipeline.ts` and `careState.ts` untouched.

## Decisions

- Fix shape (1) from the issue (verbatim per-clause gate), as the issue title names it, over (2) (reject every safety packet in the validator). The issue named the contract change to the old "accepts a faithful model paraphrase" test; that test now asserts that a paraphrase of the safety clause is rejected.
- The vet-word ban covers the tail of every packet, not only safety packets: "no need to see the vet" on a reflection summary is reassurance too.

## Adversarial pass

Biostatistician / Dr. Chen (adversarial-reviewer subagent, isolated): tried moving, dropping, negating, reordering and downgrading the vet ask on a mixed decline + watched packet; the verbatim lead rejects all of them ✓. Tried a vet-free tail that undoes the lead ("Pixel ate everything this morning.", "Skip the appointment for now.", "The doctor already checked Pixel."); the first two still pass, so the lead is necessary, not sufficient. "doctor" and kin were added to the tail screen. The rest is inert because `shouldPhraseWithModel` keeps every safety packet template-only (`index.ts:277`), and the code now says this check never licenses lifting that. Tried every safety template against its own validator: chronicity with cough adjacency, red flag plus weight, and multi-safety packets exceed the four-sentence cap (fail-closed, pre-existing). A double-spaced food label failed the lead and is fixed here (lead whitespace normalised). Residuals filed as CUL-1630.

Mutation proofs: removing the lead check, the tail vet check, tail-only screening, or the whitespace normalisation each turns a named test red.

## Definition of Done

- Acceptance criteria (CUL-1618): every safety clause required verbatim ✓; the issue's counterexamples rejected (care claim moved, decline dropped, negated / past asks, urgency downgrade) ✓; templates pass their own validator for the shapes the issue covers ✓.
- Anti-patterns: none introduced. No owner-facing copy changed; the model prompt is gated off.
- Types: `npx tsc --noEmit` clean; `deno check` of `generate-signal/index.ts` clean.
- Tests: `deno test` over `generate-signal`, 880 passed.
- Secrets: none.
- Personas: Engineer ✓ (one rule replaces two regexes) · Data Scientist / Dr. Chen ✓ (adversarial pass above) · Designer N/A (no rendered copy) · T&S N/A.
- Future-self: a verbatim lead plus tail-only screens is the right shape for any deterministic-sentence-plus-model surface; the residual is written in the code and filed.
- Manual QA: none on device (model path off); CI's Edge Functions job is the check.
- PM actions: none.

## Teach

### One thing — A passing test proves the case it ran, not the rule you meant (D3, L1)
A test runs one example and checks one answer. When it passes, it proves the code got that example right. It does not prove the code follows the rule you had in mind. The old safety test fed in one good summary and checked that it was accepted. It never fed in a bad summary that looked good, so it could not tell "checks the vet is asked about the right problem" apart from "checks the word vet appears somewhere". Both pass that test.

**Like:** a smoke alarm tested only by checking it stays quiet in a clean kitchen. Every alarm with the battery removed passes that test too.

**In today's work:** `supabase/functions/generate-signal/summary.test.ts:552`
`assert.equal(validateSummary(paraphrase, p), false)`: a summary that reads faithfully but rewords the safety sentence must now be refused. The old test only asked for the good case to be accepted.

**Why it matters to you as PM:** when a PR says "tests pass", ask whether any test feeds in the bad case the change exists to stop.

**Check:** if the old test had stayed exactly as it was, would it have caught a model writing "no need for a call to your vet yet"? Why or why not?

**One thing:** D3 L1 — A passing test proves the case it ran, not the rule you meant · check: pending
