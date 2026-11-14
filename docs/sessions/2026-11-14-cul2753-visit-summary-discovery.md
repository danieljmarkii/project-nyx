# 2026-11-14 · Visit summary discovery: a summary of the visit as the way vet data reaches Signals

**Date:** 2026-11-14
**One thing:** none: a discovery session with no code; the concept it turns on (a confirm tap checks that a value is plausible, not that it is right) is the synthesis itself

**Issue:** [CUL-2753](https://linear.app/projectnyx/issue/CUL-2753) (DISCOVERY) · **Branch:** `claude/gifted-curie-2k7r5a` · **Outcome:** shipped via the session's PR (number on the issue's outcome comment) · **Mock:** https://claude.ai/artifact/BNFhhLWe6jdWgXXsnTUEPs (round 1)

## What happened

- **Ground truth first.** Read-only SQL on the PM's own pet: two real visits, two Vet Files rows, the courses, trial, weights and care answers around them. A correct summary and fact list for each visit was written by hand before any model ran. The stored files themselves could not be read (SQL access, no Storage path), and the record holds no discharge sheet or lab result.
- **Input audit.** An isolated agent mapped every table and field against `generate-signal`, `ask` and `generate-report`; flag values were then checked live. For every owner but the PM the Signal reads no vet date and no weight.
- **Four research lanes in parallel,** each a dated brief: competitive, clinical (Dr. Chen lens), extraction feasibility, privacy and trust.
- **Two isolated reviewers on the proposal.** `adversarial-reviewer` on the fact list: the claim "a confirmed fact is safe to count" broke four ways on Nyx's record, traced through the shipped engine (it ran the real weight story module from a scratch script and changed nothing). `rls-privacy-reviewer` on the read path: FAIL at design stage on four points.
- **A live extraction test:** four model runs on the two real notes and one planted attack, scored against the ground truth.
- **Mock round 1** drawn on Nyx's real visits and published.
- **Eight decision briefs and three persona conflicts** posted to the issue as one round.

## What the reviews changed

The idea as pitched had the model fill each fact in and the owner tap yes. After review:
- a clinic weight re-labels a same-day reading and never adds one;
- a medicine arrives as a name only, into the shipped form, and nothing sets a start day;
- the recheck and a trial change are shown and not proposed; the injection question stays with CUL-1446;
- vet attributed lines in the summary are verbatim quotes, and what the vet asked the owner to watch for leads;
- the read path checks each storage key's exact shape, routes by bytes, sets hard size limits and fails closed on the cap.

## Findings outside the brief (routed, not fixed)

- **Path traversal on privileged photo reads.** Re-found independently by the privacy red-team; already on file. Commented there that it is now a prerequisite of any document read. Not named here so this PR does not close it.
- **A clinic label can soften the weight card** through the mixed-scale band. Carried as brief D7; it also bears on CUL-1390.
- **Today's Signal still read "A vet visit is booked for Nov 14"** five hours after that visit was saved. Noted on the issue for the care state's owner; not investigated.
- **Three claims in earlier briefs did not survive re-verification** (a named competitor that cannot be found; "exactly one" visit recorder; a pricing table). Recorded in the competitive brief §8, not edited into the old briefs.

## Rulings

None. The PM rules D1 to D8 and conflicts 1 to 3 on the issue.

## Team calls made (reversible; reverse any by comment)

- The synthesis lives at `docs/visit-summary-discovery-2026-11.md`, outside `docs/research/`, because that folder holds evidence and no recommendations.
- The summary does not judge whether an owner's question was answered (Dr. Chen's condition); it shows the owner's own ticks.
- The reconciliation list is not sent to the model; "already on record" is worked out in code.

## Files

- `docs/visit-summary-discovery-2026-11.md` (the proposal, the rulings it unseats, the briefs, the spec session's kickoff prompt)
- `docs/research/2026-11-visit-summary-{ground-truth,input-audit,competitive,clinical,extraction,privacy}.md` and six index rows
- `docs/culprit-visit-summary-mockups.html`

## Limits

- No real document was read by a model. Document accuracy is literature only.
- The live test is four runs through an agent harness that also loads this repository's instructions, so it was primed toward caution. It shows the shape of errors, not a rate.
- Competitor claims are at store listing strength; no app was installed.
- Both reviews are design stage. The spec gets both again.

## Next session

The paste ready kickoff prompt is §10 of `docs/visit-summary-discovery-2026-11.md`. It needs the PM's rulings first.
