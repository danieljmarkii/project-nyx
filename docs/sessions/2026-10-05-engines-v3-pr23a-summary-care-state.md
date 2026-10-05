# Engines v3 PR-23a — a watched concern stops asking in the Signal summary (CUL-1538)

**Date:** 2026-10-05
**One thing:** none — dispatched session, not this round's teach row

This was a dispatched session (Engines v3 · PR-23a). It shipped via #1076. The code is server-only and sits behind `engines_v3_en9`, which is not live, so nothing changes for an owner until EN-9 ships.

## What shipped

- **`summary.ts` `buildSummaryPacket`** takes a required `watchedSentenceFor` (C-37). A safety finding whose concern is watched (`with_vet` / `recheck_booked`) contributes the card's head ("Rex's vomiting, your vet knows.") in place of the lane's "talk to your vet" sentence. The watched clauses follow every clause that still asks (the same order as `rankWatchedLast` on Home), and each sign's clause appears once. `hasSafety` stays true, so the finished-meal rate stays out, the model stays off, and the forward tail is the safety one.
- **`pipeline.ts`**: `runSignalPipeline` changes only in its summary step, which now passes `watchedSentenceLookup(decorated)`. The new `watchedSentenceLookup` reads the care state off 3d's output and keys it by sign. The packet still reads `curated`, so neither EN-10's lines nor the decoration reach it. `careState.ts` was not edited (PR-23c owns it).
- **Tests.** There are six unit cases in `summary.test.ts`: watched-only, recheck_booked / raised / raised_again, an escalation beside a watched concern, a different sign still asking, chronicity+worsening said once, and three watched signs inside the cap. A corpus property, `(c-en9) CUL-1538` in `signalPipeline.test.ts`, answers every concern through the real step and checks two things. First, each watched head is in the summary and its detail is not. Second, every asking card's sentence plus "vet" stays in the summary. Three mutations were each proven red: ignoring the lookup, wiring it to `curated`, and dropping the head cut.

## Decisions

**The summary carries the head, not the card's whole sentence.** The first cut used the card's full care sentence. The adversarial pass showed that this is three sentences per watched sign (head, source, since line), so two watched signs overflow the summary's cap: 3 watched plus 1 raised came to 10 sentences, and the template then fails `validateSummary`. The head says what the issue asks for, which is that the concern is watched and nothing is being asked. The detail stays on the card. The head is cut from the card's own text at `, your vet knows.` and never re-spelled in the pipeline. A text without that phrase is said whole, which is still the card's words and still not an ask. A side effect: a zero-count since line ("0 episodes") can no longer open Home's top line. The reviewer had flagged that as a Dr. Chen question.

**A watched concern is still `hasSafety`.** It is still a safety finding (Home keeps it in the safety band). Making it non-safety would let the finished-meal rate sit beside a concern and would open the model path.

## Adversarial review

The `adversarial-reviewer` ran in isolation and passed on all four invariants: the summary still routes to the vet whenever any raised, raised_again or escalated card is present; nothing reassures; flag-off is byte-identical; an incomplete read still produces no packet. Counterexamples it tried that held: a watched vomit plus a raised cough; chronicity plus worsening on one sign; an intake decline or a same-sign burden beside a watched concern; a care state planted on an insight finding or on the owner-writable prior row. It found one defect, the sentence cap, and it is fixed above. It also found one latent weakness, filed as CUL-1608: "your vet knows" satisfies the validator's vet-routing regex. That is inert while safety summaries never go to the model.

## Residuals

- CUL-1608 (filed): tighten the validator before model phrasing is ever re-enabled on safety summaries.
- The burden card on a watched sign keeps asking in both places until CUL-1537 rules on it. This PR matches the card, not that ruling.
