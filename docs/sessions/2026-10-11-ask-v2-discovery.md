# Ask v2 discovery — why the Oct 10 treatment question was deflected, and Ask that answers in the pet's calendar

**Date:** 2026-10-11

**Mode:** DISCOVERY ([CUL-1798](https://linear.app/projectnyx/issue/CUL-1798)). Deliverable: `docs/culprit-ask-v2-mockups.html` round 1, published at https://claude.ai/artifact/MzZzUzVWKVLLskLxYLUTyk. Shipped via #1182.

## What happened at 7:24pm

The PM asked Ask, on Nyx, whether the prednisolone (started Sep 21) or the diet trial (day 77 of 84) was helping her vomiting and cough since the Sep 16 visit. The server keeps no transcript, so the interaction was reconstructed from what it does keep:

- Edge logs: one POST to `ask` at 2026-10-11T00:24:05Z, HTTP 200, 4078 ms, deployment v18, no warning or error lines.
- `ai_usage`: `ask_message` +1, `ask_conversation` +0, so the outcome was a non-answer.
- Request 393 bytes minus 110 bytes of envelope with an empty conversation gives a question of about 280 characters.
- Response 637 bytes. Recomputing every `buildDeflection` body for both pets, with and without the structural `safetyLead`, gives exactly one match: Nyx + `ambiguous` + the vomit-chronicity safety text (636 bytes with the default clarifier; the one-byte gap is a model-written clarifier). Every other reply is at least 67 bytes off.

So the PM saw the vomiting safety card, "Quick check so I get it right.", a clarifier, and the fixed chips This week / This month / All time. The cough-chronicity card (also safety class) was dropped.

## Why

- Ask's windows are `7d / 14d / 30d / all / since_trial_start` (`answer.ts:236`). Two of the three anchors in the question (the visit, the course start) cannot be expressed, and the `decline` tool offers "unclear window" as `ambiguous`.
- Competing explanation (from the completeness critic, not disproved): the `engine_findings` description does send the model to the Signal before any symptom answer (`answer.ts:407`), and those findings carry all five anchored care lines. If the model read them, the one-outcome, two-sentence answer shape plus rule (10)'s ban on effect words made declining the safe exit. No tool trace exists to settle it; the replay lane in [CUL-1804](https://linear.app/projectnyx/issue/CUL-1804) can.
- Either way, the fix is the same: the server builds the ledger from the engine's lines and the model only frames it.

## Method

Ultracode workflow, 32 agents: five parallel readers (Ask's code path, Nyx's record ground truth, the spec's rules, Linear, reusable engine parts), three independent design lenses (owner, clinician, architecture), a synthesizer, eleven exemplar writers each followed by an `adversarial-reviewer` verifier, and a completeness critic. All eleven exemplars needed fixes and none was rejected. The main session then re-verified the critic's three load-bearing corrections against the database before filing anything.

## Found on the way (verified by hand)

- The Signal's "N of the last 8 weeks" uses the greedy chronicity measure: vomiting reads 5 against 7 of 8 calendar weeks, coughing 6 against 8. Filed High: [CUL-1799](https://linear.app/projectnyx/issue/CUL-1799).
- Ask's `relayPayload` passes the chronicity card's raw compare (cough 9 then 5) to the model while prednisolone is on board. Filed High: [CUL-1800](https://linear.app/projectnyx/issue/CUL-1800).
- Motozol was dosed 7 times from Sep 21, outside any course, starting 55 minutes before the first prednisolone; the care lines can't see it. Filed: [CUL-1801](https://linear.app/projectnyx/issue/CUL-1801).
- Rule (10)'s few-shot example names Nyx's real visit with the wrong count; folded into the relay slice [CUL-1803](https://linear.app/projectnyx/issue/CUL-1803).
- Two weigh-ins, 4.40 kg (Jun 15) and 3.73 kg (Sep 16), none since; the EN-8 weight lane has no flag row, so nothing raises it. Data point on [CUL-1544](https://linear.app/projectnyx/issue/CUL-1544).
- Prednisolone reached its 15-dose target on Oct 10 and still reads active (only an owner action ends a course); errs loud, noted only.

## Decisions and filings

- Parent and run order: [CUL-1802](https://linear.app/projectnyx/issue/CUL-1802). Sub-issues: relay slice [CUL-1803](https://linear.app/projectnyx/issue/CUL-1803), diagnostics and golden set [CUL-1804](https://linear.app/projectnyx/issue/CUL-1804), record-anchored clarifiers [CUL-1805](https://linear.app/projectnyx/issue/CUL-1805), urgent route [CUL-1806](https://linear.app/projectnyx/issue/CUL-1806).
- One PM decision round, six rulings, three of them genuine persona conflicts drawn in the mock: [CUL-1807](https://linear.app/projectnyx/issue/CUL-1807).
- Team calls logged on CUL-1807: objected to [CUL-160](https://linear.app/projectnyx/issue/CUL-160)'s Propose close; the live-model eval lane is opt-in; Ask keeps reading no vet tables.
- No code, schema, CLAUDE.md or Tier-2 doc changed this session.

## Persona flags

- Designer vs Dr. Chen and the Data Scientist on a History door to the weeks before an anchor (ruling 5).
- Motion & IA vs Dr. Chen on compacting the second safety card (ruling 6).
- Data Scientist vs Dir. of Engineering and Designer on food-and-symptom tools in Ask (ruling 4).

## Next

Step 0 ([CUL-1800](https://linear.app/projectnyx/issue/CUL-1800)) is ready to build with no ruling; step 1 ([CUL-1803](https://linear.app/projectnyx/issue/CUL-1803)) follows it and ships on merge without an app release.
