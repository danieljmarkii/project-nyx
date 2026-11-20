# Vet contacts PR-09: a visit answer stands a warning down only on an exam

**Date:** 2026-11-20
**One thing:** T5 L1 — Edge Functions: the server holds every phone's answers, so a rule about all of them can only live there · check: pending

Shipped via #1576 ([CUL-2841](https://linear.app/projectnyx/issue/CUL-2841)). A dispatched, plan-gated row (Gate: clinical) and this round's teach row. The PR body carries the Definition of Done and the QA script.

## What shipped

Server only, in the warning engine (`generate-signal`):

- **An answer about a visit counts only when that visit was an exam.** "Talked about it" on a visit later corrected to a call, text or email no longer quiets the warning.
- **Every unknown keeps the warning up.** That covers a deleted visit, a missing one, a channel the server does not recognise, and a visit read that came back short.
- **"My vet knows" answers are untouched.** So are trial and course answers.

## How it went

- **One departure from the build note, stated in the plan before any code.** The note said to drop these answers in the shell. The build keeps them and lets the engine refuse them instead. A dropped answer also drops its "back again" history, and keeping it is the louder choice.
- **A mutation caught a test that proved nothing.** The first replay test still passed with the new check deleted, because the engine caught the case another way. A third answer in the fixture forced the path the check guards, and the mutant now reds.
- **Both adversarial passes found quiet holes beside the filter.** Each was fixed in this PR, louder:
  - Pass 1: once the answer was refused, a vet visit booked in the last week stepped in and quieted the concern again, with "how it went isn't recorded yet".
  - Pass 2: a concern that had come back ("Back because…") could go quiet as "A vet visit is booked".
  - Now a corrected answer keeps the concern off every booked-visit quiet, and a "back" concern stays back.
- **The cap was reached.** The pass 2 fix shipped without a third pass, because it errs loud.
- **Filed:**
  - [CUL-2842](https://linear.app/projectnyx/issue/CUL-2842): nothing rebuilds Home's warnings when a visit is corrected on the phone. It blocks the call chips.
  - The other signs and the weight card are an instance of [CUL-2829](https://linear.app/projectnyx/issue/CUL-2829).

## Residual

"Phoned, then booked an exam" now keeps its ask beside the date rather than "A vet visit is booked". That is louder by design, and parked on CUL-2841 for a calmer rule with its own review.

## Teach

Re-ask first, from PR-06, still ungraded: a session edits three files, commits two and pushes that commit, and then the container is reclaimed. Which of the three can the next session get back, and from where?

### One thing — The server holds every phone's answers (T5, L1)
An Edge Function is code that runs on the server rather than on the owner's phone. The phone only knows what was typed on it, or what it has synced since its last install. The server sees every answer from every phone the owner has ever used. When a visit is corrected to a phone call, this phone can take back the answers it holds. An answer typed on a second phone, or before a reinstall, exists only on the server. So the rule "a call never quiets a warning" has to be enforced where all the answers are.

**Like:** a shared family calendar. You can delete the events on your own phone, but only the calendar server can cancel one your partner added from theirs.

**In today's work:** `supabase/functions/generate-signal/careState.ts:514`
```
if (!answerStandsOnAnExam(ack)) return 'not_an_exam'   // the server refuses any visit answer whose visit is not an exam, whichever phone wrote it
```

**Why it matters to you as PM:** when a spec says "the app stops doing X", ask which copy of the data decides it. If the answer lives on more than one phone, only the server can make the rule true everywhere.

**Check:** an owner taps "Talked about it" on Monday on her old phone, switches to a new phone on Tuesday, and corrects that visit to a call on Wednesday. Before this PR, would her warning come back? After it?
