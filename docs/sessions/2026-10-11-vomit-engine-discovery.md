# The vomit engine, 10x: discovery kickoff and mock round 1

**Date:** 2026-10-11
**One thing (re-ask):** D2 L1 — Types: a function can only use what it is handed (from 2026-10-10, PR-09's stack) · check: pending
**One thing:** D3 L1 — Reading a test: a test that reads the real clock passes or fails by the hour it runs · check: pending

DISCOVERY session on [CUL-1765](https://linear.app/projectnyx/issue/CUL-1765), opened from the PM's prompt rather than an issue. No app or engine code. Shipped via #1179 (merged on the PM's `/wrap and merge`; the seven rulings stay open on the issue).

## The ask

The PM has logged about 50 vomit photos for Nyx and the 50th read returns what the 1st did. Two questions: what does the API return that the app never shows, and what prompt or training changes would improve it. Then: what is a 10x vomit engine and downstream UX.

## What the session found

- **Why read 50 matches read 1.** The model sees one photo and one fixed sentence (clinical-guardrails Pattern 3). Its own words reach the owner only on a self-raised call (Pattern 10), so every calm read is one template: 26 of Nyx's 44 completed reads carry one of three fixed texts. The facts the app does compute (meal timing via `lib/mealTiming.ts`, counts, photo composition) show on Home and in the report, never on the incident screen.
- **Not surfaced:** `bile_present` (in the schema, never rendered as its own row); `ai_confidence` (written, read by nothing); the meal timing and counts the app already computes.
- **What the evidence broke at kickoff:** the digestion grade is a default ("partially digested" on 41 of 44 reads, 13 of 14 within 10 minutes of eating); the "empty-stomach bile" kind has no instances for Nyx; "22 within 30 minutes" is 16 under the shipped predicate; a plain model-ID swap to Sonnet 5.5 or Opus 5.5 returns a 400 on every read, which the pipeline shows as "couldn't read the photo"; the June 4.4 kg weight was overwritten Sep 16, so the app cannot see her loss.
- **The strong finding:** 9 of her 11 timed vomits since Aug 2 came within 10 minutes of a logged feeding, against 3.5% of clock minutes.

## Method

Kickoff: two Explore/general agents mapped the read's fields to the UI and the prior Engines v3 work; aggregate read-only queries over the record. Then a workflow of five isolated lanes (clinical, model and API via the claude-api skill, a read-only replay of Nyx's record through the real `lib/mealTiming.ts`, prior art, adversarial), each checked by an independent verifier (84 findings: 39 held, 43 amended, 2 unverifiable, none refuted), then a synthesis. A second workflow wrote the brief and ran a fidelity and a conventions check over it (49 issues, 6 must, all applied). Raw replay rows stayed in the session scratchpad.

## Rulings and decisions

- **PM at kickoff (2026-10-10):** R1 both audiences, owner screen first; R2 reopen "calm copy stays generic" (2026-07-17) and "no timing clause in the read" (EN-0) for presence-only record lines; R3 unsure (name her recurring kinds?), drawn three ways; R4 discovery now, build after 1.2.0 clears review.
- **For the PM (on CUL-1765, `Waiting on PM`):** D1 (R3, a Designer vs Dr. Chen conflict, no team recommendation), D2 (narrow R2: drop novelty lines), D4 (timing words, better than the rule), D6 (the shipped 6-hour "recognizable food" line), D7 (the post-save heave question), D10 (fund the eval, who labels), D14 (what Re-run does).
- **Team calls, applied and logged:** D3, D5, D8, D9, D11, D12, D13.
- **Correction mid-session:** the first Linear comment presented D1 with a team recommendation and D4 and D14 as team calls. The fidelity pass moved D1 to a named conflict (the Conflict Protocol) and D4 and D14 to the PM (D4 is a better-than-the-rule call on another project's shipped string). The mock and the issue were corrected to match.

## Files

- `docs/culprit-vomit-engine-mockups.html`, mock round 1, published as an Artifact.
- `docs/research/2026-10-vomit-engine-evidence.md`, the frozen evidence brief, plus its row in `docs/research/README.md`. It proposes §V addenda to three frozen documents and edits none of them.

## Filed

- [CUL-1782](https://linear.app/projectnyx/issue/CUL-1782): a cat's plant-material read gets the calm template and no lily question (first build after 1.2.0).
- [CUL-1783](https://linear.app/projectnyx/issue/CUL-1783): a model-ID upgrade on any Claude call site breaks it silently.
- [CUL-1784](https://linear.app/projectnyx/issue/CUL-1784): the IntakeQuestion test fails in the hour after local midnight in each zone the non-UTC job runs (about 10:00 to 11:15 UTC). It reddened this PR's job twice; one re-run at 11:21 UTC passed.
- [CUL-1785](https://linear.app/projectnyx/issue/CUL-1785): the shipped "Recognizable food 6h" line, waiting on D6.
- [CUL-1786](https://linear.app/projectnyx/issue/CUL-1786): a vet-labelled photo set, the labelling successor to the canceled CUL-1312, waiting on D10.
- [CUL-1787](https://linear.app/projectnyx/issue/CUL-1787): the Trust & Safety confirmation for D11.

## Next

Rule the seven decisions on CUL-1765. Round 2 then recomputes the count lines per logged vomit (D3), checks whether the Signal's rapid lane fires for Nyx today, and turns the bets into a build project with a run order. Building starts after 1.2.0 clears review, except CUL-1782.
