# 2026-11-15 · Pet memory discovery: one page for what Culprit is working from

**Date:** 2026-11-15
**One thing:** none: a discovery session with no code. The concept it turns on is that a fact which only ever adds context can still make something quieter through the path it travels (an unknown line kind dropping its neighbours on old app builds; a helpful door opening a question whose yes stands an ask down).

**Issue:** [CUL-2787](https://linear.app/projectnyx/issue/CUL-2787) (DISCOVERY) · **Branch:** `claude/jolly-sagan-25klw1` · **Outcome:** shipped via #1540 · **Mock:** https://claude.ai/artifact/8wgBTBSJZhjt5yn9mB2XKF (round 1)

## What happened

- **Ground truth first.** Read-only SQL on the PM's own cat. Every standing fact the app holds about her, by table, screen and reader, written by hand. Then sixteen things a vet or careful owner would say are true that the record has no home for or leaves empty. The table built for this, `conditions`, has no row for her.
- **Built on the CUL-2753 input audit,** read from its unmerged branch. Not repeated.
- **Four research lanes in parallel,** each a dated brief: competitive and analogues; clinical (Dr. Chen lens); a code walk of every reader of every standing fact; a privacy audit of what persists, consent, deletion, export and household sharing. A fifth agent mapped where the client shows and edits each fact today.
- **Two isolated reviewers on the proposal.** `rls-privacy-reviewer`: FAIL as written on two blockers, PASS WITH CONDITIONS once the controls are stated. `adversarial-reviewer` on the read rules: BREAKS as written on six quiet paths; it re-traced six edges of the code walk and all held.
- **Mock round 1** drawn on Nyx's real record, published, then republished once with the falsification pass's copy fixes.
- **Seven decision briefs and two persona conflicts** posted to the issue as one round.

## What the reviews changed

The first draft said a listed fact may add a line and nothing else, and offered helpful doors from the logs. After review:

- a new kind of line must travel so older app builds ignore it; today one unknown line makes the client drop every line on the card;
- a line citing a listed problem sits last, repeats the count, attaches to no red flag, burden, worsening or intake card, and never says "expected", "known" or "linked";
- "we haven't seen it lately" keeps the problem on the vet report's first page with the count logged since; there is no "resolved";
- a course opened from loose doses is bounded first dose to last dose, and the page never asks whether the vet started it; loose doses of a masking drug need their own masking span;
- "rabbit foods only" was the positive form of the banned "no off-diet foods logged" and was rewritten;
- a removed reading that anchors a live safety finding leaves a dated line (the recommended option in brief D4);
- a trial is never ended from the page;
- Ask reads nothing from the page until an answer check exists;
- `conditions` needs a three-verb access policy, column grants and a same-pet trigger before it grows, and every reader must filter removed rows in the query.

## Findings outside the brief (routed, not fixed)

- **Fifteen edges where an owner's edit already quiets a warning in the shipped app,** plus two found by the falsification pass (loose steroid doses make no masking span; the client's all-or-nothing line check). Filed as one class issue, parked, with the clinical gate label. Not named here so this PR does not close it.
- **The access rule on `conditions` today** lets a row be hard deleted or moved between an owner's own two pets. Low harm (the owner's own data); carried into the proposal's migration row.
- **The CUL-2753 input audit missed `analyze-vomit`,** which reads feeding arrangements, intake checks and date of birth. Recorded in the safety brief; the frozen audit is not edited.

## Rulings

None. The PM rules D1 to D7 and conflicts 1 and 2. The round's open home is its own issue with the `Waiting on PM` label, since the discovery issue closes on merge.

## Team calls made (reversible; reverse any by comment)

- The synthesis lives at `docs/pet-memory-discovery-2026-11.md`, outside `docs/research/`, because that folder holds evidence and no recommendations.
- The mock uses "About Nyx" as its working title, ahead of the ruling on D5, so the frames could be drawn. The PM's title is drawn in the naming table.
- The clinic or home label on a weight is left to the separate weights discovery the PM asked for on CUL-2753. The mock shows the label and offers no ruling on changing it.
- The vet's opinion, absences and causes get no place on the page. This follows the no reassurance rule and was not put to a ruling.

## Files

- `docs/pet-memory-discovery-2026-11.md` (the proposal, the read rules, the rules it touches, the briefs, the spec session's kickoff prompt in §11)
- `docs/research/2026-11-pet-memory-{ground-truth,competitive,clinical,safety,privacy}.md` and five index rows
- `docs/culprit-pet-memory-mockups.html`

## Limits

- Whoop's and OpenAI's own pages refused automated fetches. Their claims rest on search excerpts and are marked. No app was installed and no screenshot was seen.
- The code walk executed nothing. Every scenario is traced by reading; one edge stays partly verified.
- Clinical sources were read at abstract level; AAHA's standards text was not retrieved.
- Jordan and Sam did not run as isolated panels. Their positions in the two conflicts are inferred from their profiles.
- Both reviews are design stage. The spec gets both again, and that is the adversarial reviewer's second and last pass.

## Next session

The paste ready kickoff prompt is §11 of `docs/pet-memory-discovery-2026-11.md`. It needs the PM's rulings first.
