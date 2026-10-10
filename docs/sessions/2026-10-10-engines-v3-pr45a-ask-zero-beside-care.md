# Engines v3 PR-45a: Ask refuses a zero beside a visit or a masking drug

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Dispatched session for CUL-1429, PR-45a in the Engines v3 run order. Shipped via #1152.

## What shipped

Ask could answer "Has she vomited since the visit?" with "Since the Sep 16 visit, 0 vomiting episodes are logged." That reads as "it worked", and an injection given at the visit or a steroid can hide the very sign being counted. The Signal already withholds that zero structurally (`generate-signal/careContext.ts`). Ask had no rule against it, and `lib/careClaimScreens.ts`'s header even called "none LOGGED since" the honest form. With `engines_v3_en10` on, EN-10's visit and course lines reach Ask through `ai_signals.findings`, so this fix gates turning the key on for every account.

- **`lib/careClaimScreens.ts` `zeroBesideCareReason`.** A count-aware screen that judges drugs with the Signal's own table (`lib/maskingSpans.ts` `resolveDrugClasses` + `courseEffectOn`), so the two surfaces agree on which drugs mask. It reads the zero per clause. Clauses about meals, doses, a medication not logged, or the log's own coverage are set aside. Routing advice ("call the clinic") is blanked before the visit test. It is stricter than the Signal in the safe direction, because a sentence carries no dates: any visit word counts, past or booked.
- **`supabase/functions/ask/answer.ts`.** `validateAnswer` runs the screen in both modes and `sanitizeFollowups` drops chips that fail it. `careNamesFrom` places every regimen the turn already loaded with `assessCourse`: on board, in its 42-day tail, or with a span touching the widest window read. It also reads a visit the owner's question names. `screenProvenanceZero` drops the "0 events" half of the provenance line. Rule (10) of the prompt now asks for the window and the logging instead.
- **Guards.** `SIGN_WORDS` is registered in `guards/symptomLists.test.ts` and has a membership-walk row. `ALL_SIGNS` is exported from `lib/maskingSpans.ts` and read rather than restated.

## The falsification record

Five isolated `adversarial-reviewer` passes ran, each against the previous push. A refusal deflects the whole answer with no re-phrase, so every pass hunted false positives as hard as leaks.

1. **FAIL.** Findings:
   - The provenance line printed "0 events" beside the prompt's own recommended sentence.
   - On board depended on whether the model called `medications`, and missed the 42-day tail.
   - About 40 zero wordings were missing.
   - Visit and generic medication words were missing.
   - An "other than" clause mis-mapped the sign.
   - Intake declines and missed doses were deflected.

   All fixed.
2. **FAIL.** Findings:
   - A visit named only by its date. Fixed with `visitInContext` from the question.
   - "hasn't thrown up and is eating well" was smuggled past the intake set-aside. Fixed with a per-clause judgement and one shared symptom list.
   - "another", "couldn't find any", "no record of".
   - Courses judged against today rather than the window.
   - Routing advice counted as a visit.
   - "hasn't stopped vomiting" read as a zero.
   - Missed-dose sentences deflected.

   All fixed.
3. **FAIL.** Findings:
   - Rule 10's own logging-gap disclosure ("nothing was logged on Tuesday") was refused.
   - "no sign of it slowing down" was refused.
   - "isn't among them", "hasn't been a", "hasn't shown up" leaked.

   All fixed. A zero implied by a "last logged on" date is a scope question, filed as CUL-1745.
4. **FAIL.** Findings:
   - The new coverage blanking could erase a real zero: a "days without a log" clause swallowed the rest of the sentence, and "nothing logged on 11 of 11 days" was read as coverage.
   - Four escalations regressed.

   Fixed: blanking is per clause, skipped in a clause naming a sign, and an all-days count is the zero.
5. **FAIL.** Findings:
   - Base-form verbs after "didn't" ("she didn't vomit after the visit").
   - "wasn't logged", and a "can't" that the negation list misspelled.
   - "none of this week's entries", "free of", "there aren't any", "not once".
   - False positives on "no record of a follow-up visit", "without more days logged" and "no coughing-free stretch".

   All fixed. Its third family ("the last vomiting logged was Sep 14, before her Sep 16 visit") is CUL-1745's scope question and was added there.

**No pass returned PASS.**

The pattern across the passes is the lesson. Each pass closes leaks and opens false positives at the edges of the arms it added, because a denylist is not paraphrase-proof. The structural answer, an allowlisted recount or a judge, is CUL-271's, and this screen's header says so. What a denylist can promise is that the prompt-shaped phrasings are covered and the common honest ones pass. The tests pin every counterexample the five passes produced.

Mutation proofs: disabling the `validateAnswer` arm reds both CUL-1429 validateAnswer tests. Removing the regimen on-board placement reds the `careNamesFrom` test.

## Found along the way

- **`main` is red** (filed as CUL-1743, now a duplicate of CUL-1746, which PR-30b owns). #1147 merged after #1150 with a test asserting the opposite of #1150's ruling (`newRuleCallOf` on an unstamped stored `call_now`). It fails the required `Edge Functions (deno test)` check on `main` and on every PR, this one included. That file is PR-30b's lane, so nothing was ported here.
- **CUL-1745 (Waiting on PM): a date that implies a zero** ("The most recent vomiting logged is Sep 12" beside a Sep 16 visit). Is it in AC 17's scope?

## Where it stands

The PM ruled **(b)** on 2026-10-10: merge this screen as a safety layer, and hold the every-account `engines_v3_en10` flip until an allowlisted recount lands (CUL-1748). The PM also ruled a date that implies a zero (CUL-1745) in scope of AC 17, and folded it into that recount rather than this phrase list. `main` went green with #1155 (PR-30b) and was merged into the branch. The PM then said, in this session, to merge once green.

The adversarial line has no PASS, and the ruling accepts that knowingly. Five passes each found a fresh ring of paraphrases or false positives, and all of them are now fixed and pinned. The screen is a denylist, and the recount is the structural answer.

## Residuals

- A visit named only by its date, when neither the answer nor the current question names it. Earlier conversation turns are not read.
- Zero wordings no arm lists. The recount (CUL-1748) is the structural answer.
- A deflection drops the deterministic photo-read line, because `finalizeAnswer` returns before building it. This predates the PR, but the new screen makes deflections more frequent.
