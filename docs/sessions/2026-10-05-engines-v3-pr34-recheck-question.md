# Engines v3 PR-34: the vet-keyed eight-week question, built off and measured

**Date:** 2026-10-05
**One thing:** D3 L1 — Reading a test: it proves only the cases it builds · check: pending

Dispatched session for CUL-1290 (EN-9b), Engines v3 Wave 5. Shipped via #1071.

## What shipped

- **`recheckQuestionFor`** (`supabase/functions/generate-signal/careState.ts`). On a `with_vet` concern whose answer was a visit, a tick or "My vet knows", the row gains one question, "Did your vet want to see {name} again?", when all three hold:
  - the answer is `recheckQuestionDays` old, counted from the later of its date and the day it was written;
  - no visit is booked in the next 28 days;
  - the answer was not a vet-started trial or course (those end by their own rules).

  It changes no state, rank, ask or sentence. **It ships off:** `CARE_STATE_CONFIG.recheckQuestionDays` is `null`, and with the knob off the key is never written.
- **Corpus:**
  - an `improvement` effect, which thins episodes the way the trial responder does;
  - one scenario, `own-vet-knows-improves`;
  - the answer key's `recheckQuestion: wanted | for_nothing`;
  - the pin for the new scenario only (no other scenario moved).
- **Scorecard:**
  - `recheckQuestion/{wanted,forNothing}/…` rows;
  - the observer's `careConfig`;
  - the runner's `SCORECARD_RECHECK_QUESTION_DAYS`;
  - ADEMP rows, and the stated blind spot that the corpus owner answers once;
  - the committed `scorecard.json` regenerated (additive rows only).
- **Spec:** `docs/nyx-care-state-requirements.md` v1.3, §4.8. It records the measurement, the removed gate and the DF-5 brief.

## What broke and how

The first build withheld the question when a one-sided test showed the rate had fallen against EN-9's frozen reference. The `adversarial-reviewer` broke it three ways:

1. **Regression to the mean.** The reference is the month before the visit, which is the flare that sent the owner there. A steady cat whose answer followed a 16-episode month read as improved at every grid point.
2. **Partial logging.** An owner logging one vomit in four, while logging every meal, read as improved.
3. **No persistence.** A quieting test re-run nightly had no persistence, so it dropped the question on 11 to 72% of steady cats on some evening.

A test that withholds a care prompt is a reassurance path. E-6 puts the proof on the quieter change, and this one failed it, so the gate was removed. The same pass found three smaller issues, all fixed:
- an `undefined` knob read as on;
- a backdated "My vet knows" asked the evening it was given;
- any appointment, however far ahead, suppressed the question.

A re-check at 0ffd69e passed, and each new test was proven by mutation.

## The two-sided test

Offline run, `engines_v3_en9` on, the question at 56 days, seeds 10000–10299.

| Scenario | Watched at 8 weeks | Asked, of those |
|---|---|---|
| Steady cat (wanted) | 9.7% | 100% |
| Halved cat (asks for nothing) | 6.3% | 100% |
| Steady cat, logging lapse | 0% | n/a |

The question cannot tell the two cats apart. Its reach is tiny because 91 to 100% of answered cats were raised again inside eight weeks. That comes from the corpus owner answering only once, plus CUL-1537.

## Decisions

- No improvement gate (the adversarial finding above).
- The question ships off. The PM rules on CUL-1596: A keep it off (recommended), B turn it on (Dr. Chen's dissent), or C re-measure after CUL-1531 and CUL-1537.
- DF-5 brief: the question re-opens no ask and states a record fact, so DF-5's protection holds if it stays a single door.

## Residuals

- The Home door for the question is unbuilt. It is needed only if CUL-1596 rules B.
- The harness cannot estimate production reach until the corpus owner can answer twice.

## Teach

### One thing — Reading a test: it proves only the cases it builds (D3, L1)
A test sets up a situation, runs the code, and checks the answer. It proves the code is right *for the situations someone thought to build*, and says nothing about the ones nobody built. My first version had a test with an "improving cat", and it passed. The reviewer built a different cat, one that had a bad month right before the vet visit and then went back to normal. That cat fooled the code. The new test keeps that cat, so the mistake can't come back.

**Like:** a car's crash test only tells you about the crashes they staged. A side impact nobody ran is unknown, not safe.

**In today's work:** `supabase/functions/generate-signal/careState.test.ts:553`
`const flare = events('vomit', [...everyNth(3.5, 170, 99)…, ...everyNth(1.75, 98, 71)…, ...everyNth(4, 69, 0)])`
This builds a cat: twice a week for months, about four a week in the month before the visit, then back to twice a week. The test asserts the question is still asked.

**Why it matters to you as PM:** when a PR says "tests pass", the useful question is which situations the tests built, not whether they are green.

**Check:** if the reviewer had never thought of the flare-before-the-visit cat, would the old version's tests have caught the problem, and what would an owner have seen?
