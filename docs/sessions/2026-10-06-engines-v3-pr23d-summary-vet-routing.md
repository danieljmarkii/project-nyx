# Engines v3 PR-23d: the summary validator requires the vet ask (CUL-1608)

**Date:** 2026-10-06
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1078. Dispatched session, BUILD.

## What shipped
- `SummaryFactPacket.asksVet` (generate-signal/summary.ts): true when any safety clause is its lane's asking template rather than an EN-9 watched head. Set in `buildSummaryPacket`, the packet's only constructor.
- `validateSummary`: on `asksVet` it requires `VET_ASK_RE` (the ask itself: "a word with / a call to / raising with your vet", "a vet visit", close paraphrases). On a safety packet whose every clause is watched it requires `VET_KNOWS_RE` ("your vet knows", the head's own words). The bare `/\bvet\b/` check is gone, because "Rex's vomiting, your vet knows." satisfied it without asking anything.
- Six tests (summary.test.ts). Mutation proof: restoring the bare-word check reds the mixed-packet drop test and the watched-only drop test.
- `pipeline.ts` and `careState.ts` untouched (PR-23c's files).

Inert today: `SUMMARY_MODEL_PHRASING_ENABLED` is false and `shouldPhraseWithModel` is false for every safety packet. This is the routing half of the B-096 re-enable gate.

## Falsification
The adversarial reviewer generated 44 safety-card strings from the real templates (six lanes, every tier and trigger, plus carried cards). All 44 match `VET_ASK_RE`, so no template rejects itself. The mixed packet with the ask dropped is rejected. `asksVet` cannot be wrong, because care state is one per sign. Verdict: HOLDS WITH NOTES.

The notes, filed as CUL-1618: the check is lexical over the whole text. On a mixed packet a model can move "your vet knows" onto the intake decline and the ask onto the watched sign, negate the ask ("no need for a call to your vet"), or downgrade "today", and still pass. That defect predates this diff. The fix is to require every safety clause verbatim, which changes an existing test's contract, so it gets its own issue. This PR corrected the regex comment's overclaim and tightened `VET_KNOWS_RE` to "your vet knows".

## Residuals
- CUL-1618: the per-clause gate (each safety clause verbatim) before model phrasing on safety summaries is re-enabled.
- Older and inert, noted on CUL-1618: the red-flag and chronicity templates say "not a diagnosis", which `DISEASE_RE` rejects.
