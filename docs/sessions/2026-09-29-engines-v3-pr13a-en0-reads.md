# Engines v3 PR-13a — EN-0: the vomit read states the record, anchored to the vomit

**Date:** 2026-09-29

Shipped via #979 (CUL-1130, PR-13a of its split). Dispatched by `/dispatch`, BUILD mode, on `claude/cul-1130-pr13a-0929`, beside PR-14c (CUL-1311) and PR-25 (CUL-1133). Neither touched these files.

## What shipped

Server only, behind `engines_v3_en0` for the pet's owner. Flag-off read words, flags and queries are unchanged. The only flag-off difference is the `rule_version` stamp (`f1.vomit2`); `engine_flags` still says off.

- **The union** (`analyze-vomit/context.ts`, `EN0_CONTEXT_STEP`, filling PR-11a's seam). Each contextual flag is the OR of the shipped read-time evaluation and one anchored on the vomit:
  - repeated vomiting over [v − 24 h, v + 24 h];
  - feline intake over [v − 24 h, v], with tracking over [v − 7 d, v], and never on an empty window (PM ruling (a), below);
  - lethargy on its shipped window only.

  It can add a warning and can never remove one.
- **Bounded anchored reads** (`vomitAnchoredReads`). The shipped queries are untouched. Flag-on, extra reads fetch only the anchored rows the shipped read doesn't cover, bounded on both sides by the vomit and strictly before the shipped bound, so no row is read twice.
- **Record-stating copy, pinned to the read's moment.** "When I read this, 6 meals were logged for Nyx in the 24 hours before this vomit, and none was marked Most or All. In a cat that's vomiting, that's worth a call to your vet sooner rather than later." The read-time branch says "… had been logged … in the 24 hours before then".
- **Photo finding first.** A contextual read over a vomit photo that escalated on its own (a visual flag, or the model's own call on a photo it says is vomit) leads with the visual template. Pattern 10 is unchanged.
- **Shared pipeline** (`_shared/incident-analysis.ts`):
  - a descriptor may return a per-run copy with its flags, used at the full, capped and rescue read sites;
  - `IncidentCopy.contextualWithPhotoFinding` is optional;
  - `selectReadText` takes `modelEscalated`;
  - stool's output doesn't change.
- **Replay** (`incidentReplay.deno.ts`): a new EN-0 column with its intake record, a lost-escalation count, and an exit 1 on any loss.

## Proof

- **Property test** `_shared/engineCorpus/en0Union.test.ts`:
  - covers the named fixtures plus 400 seeded records, sweeping every read time to four days after the vomit (~180k evaluations);
  - EN-0's flags always contain the shipped flags;
  - mutation-proven on the intake half. The vomit-list half is an equivalent mutant, and the file says why.
- **Hand-stated flag-on expectations** on all 21 corpus cases.
- **With-and-without pipeline diff** over the real descriptor (`analyze-vomit/pipeline.test.ts`). Four cases are mutation-proven: the late read needing the anchored read, no double count, the 6/7 hold with its words still true, and a not-vomit photo.
- **Replay on the PM's allowlisted pet:**
  - shipped-rule mismatches: 0 over 45 live vomit reads;
  - EN-0 lost escalations: 0;
  - 3 reads gain a flag: two repeated vomiting, one intake with 9 meals logged before the vomit.
- **Suites:** Edge Functions deno suite 2150 passed; jest guards and replay scripts 819 passed; `deno check` clean.

## What broke and how it was fixed

The adversarial pass on the first push returned BREAKS:

1. **The stored sentence could go false.** The intake sentence was present tense ("6 meals are logged"). A meal back-filled after the read made it false, and CUL-1201's hold then kept it beside the escalation. The fix pins it to the read's moment, in the past tense, and the voice pass was re-run.
2. **Latent C-42.** Widening the shipped read's lower bound left an old vomit's read unbounded above, exposed to the max-rows cap. The fix replaced it with separate reads, bounded on both sides.
3. **A not-vomit photo read as a finding.** The code review found a not-vomit photo with the model's own worth_a_call described as holding a finding. That branch is now gated on `appearsToShowSubject`.

"No warning lost" held against everything tried: a late-logged found vomit; a vomit logged before the day's meals; ate, vomited, then refused, read late; a same-instant `+00:00` meal; and a future or unparseable `occurred_at`.

A pipeline fixture that sat on the read-time window's edge flickered with the real clock. Its rows were moved off the edge.

## Decided

- **PM ruling (a), 2026-09-29.** The anchored intake half never escalates when it counted zero meals: a logging gap is not a finding. A corpus case pins it, mutation-proven.

## Residuals

- **Stored false sentences** from before EN-0 (9/4, 9/22, and back-filled cases) keep their words: CUL-1406 (PR-13b).
- **Stool is left as is:** its `Date.now()` anchors and selector ordering.
- **After-vomit order rule:** within the read's 24 h, a good meal before the vomit still silences refusals after it, as shipped. That is EN-5's.
