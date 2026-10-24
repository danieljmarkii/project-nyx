# Session: Backlog grooming (Linear, team Culprit), the first pass under steps 12 to 18

**Date:** 2026-10-16
**One thing:** P1 L1 — The strategy kernel: an action has to pass the policy it cites (D5 (a) cited the sort, which never parks the 46 harm findings it would have parked) · check: pending
**One thing (re-ask):** P7 L1 — Writing for decisions: a brief is only as good as its freshest evidence (from 2026-10-02, the ruling sheet part 2; asked again on D5: what did the 10-16 brief never check before it recommended parking all 54?) · check: pending
**Mode:** DISCOVERY (Product Owner / Backlog Steward lens), attended: the PM asked for the pass
**Outcome:** shipped via #1233 (this record only; the pass's writes are in Linear)
**Branch:** `claude/serene-noether-jgdean`
**Report:** the standing grooming issue [CUL-1962](https://linear.app/projectnyx/issue/CUL-1962), created by this pass. It holds the full report as a comment and the PM's open calls.
**Predecessor:** `docs/sessions/2026-09-23-backlog-grooming.md`. Its record issue, CUL-719, is closed, and every one of its calls has a home (checked this pass).

---

## What ran

The whole `backlog-groomer` procedure, steps 0 to 18. This is the first run of the steps added since 09-23:
- the PM-queue drain (12);
- pruning and the veto window (13 to 15);
- gates as relations (16);
- orphaned follow-ups (17);
- the parked sitting (18).

The 2026-10-11 session had already run an attended staleness pass over the queue alone.

Eleven read-only lenses ran as background agents, each from one shared brief with the read-only rule written in:
- the PM queue, in three batches of 28;
- the retirement sweep with the closed-project leftovers;
- the veto window with staleness decay;
- the In Progress and In Review sort;
- Urgent/High aging, the issue contract and orphans;
- closed-but-unfinished;
- gates with the parked sitting;
- quick wins;
- dedup.

This session verified each lens's load-bearing claims against `origin/main` or Linear before acting. Four narrow writer agents then did the writes: two label strips, one fixed operations file executed verbatim with every precondition re-checked at write time, and one report post. One container restart mid-pass stopped two lenses; both resumed from their transcripts.

### Evidence base

| | |
|---|---|
| Git history | `scripts/groom/preflight.sh` PASS: 1,207 commits on `origin/main` against a floor of 837, history intact |
| Board at start | 996 open: 886 `Todo`, 77 `Backlog`, 25 `In Progress`, 8 `In Review`, 0 triage |
| Open PRs | 54 at the start; #1229 and #1230 merged mid-pass and closed three issues on their own |
| Deploys | `deploy-manifest.json` holds `{}`; Deploy Edge Functions runs on `main` green through run #324 |
| Gate contract | the clause "a gate is a relation" landed in CLAUDE.md on 2026-10-06 (#1084), so step 16's write row is live |

## Headline findings

1. **Merged-work drift is zero for the fourth pass running.** Only six open issues appear in a merged commit's subject line. All six are legitimately open: a spent parent, umbrellas and spec gates.
2. **The 1.2.0 cut is waiting on launches, not rulings.**
   - The App Store run order lists PR-25 (CUL-54 and CUL-57, both Urgent), PR-27, PR-28 and PR-29 (CUL-1205, Urgent) with no prerequisite. The page says they "may run together", yet none is on the 10-15 Board and no session holds any of them.
   - PR-35's only prerequisite has merged.
   - PR-26's plan (CUL-1560) has waited ten days for the PM's typed go.
3. **The PM queue is 84 against a cap of 30, and one sitting is most of the excess.** About 38 of the labelled issues are rows on one unruled clinical sheet, CUL-1795 (Sheet B). Each row's issue keeps its own label, so the queue counts one 30-minute sitting 38 times.
   - Across the 84: no team calls, one default, 15 docket briefs.
   - The label total is already below the 153 baseline, so CUL-1366's kill criterion does not fire.
4. **CUL-1915 is time-critical and outside every run order.** Nyx's trial outcome sheet opens 2026-10-17. It reads no medication course, so her prednisolone can make a fall in symptoms read as the diet working. The issue's own TL;DR tells the PM how to read the sheet tomorrow.
5. **The leak that closes unfinished work has moved.**
   - Docs-only PR attachments no longer close other issues' work. That was the 09-23 mechanism, and it held this window.
   - What leaks now is waiver closures of device sittings that had absorbed other issues' checks: CUL-1529's five passes on 10-04, and CUL-1482 on 10-12.
   - Prose routing into issues that were already closed does the same; CUL-1725's clinical D6 question went to the canceled CUL-1312.
   - The CUL-1482 waiver was the PM's, made knowingly. What it leaves unreconciled is AC-6, the two-account sign-out wipe, which `docs/app-store-submission-guide.md:163` still calls "the ship gate".
6. **Three projects or piles are invisible to the dispatchers.**
   - Engines v3.1 has no run order, and 21 High issues wait on it. Its *Found along the way* milestone holds 54 issues, all in `Todo` rather than `Backlog`.
   - Ask v2 keeps its run order inside an issue, CUL-1802.
   - The reintroduction track has no project.
7. **The board grew from 704 to about 1,000 open since 09-23.**
   - 862 opened and about 566 closed, a net of +296.
   - This pass put 53 `Propose close` issues on a dated clock. The first cancels come on or after 2026-10-23.

## What was applied

Every write names its evidence, and every one sits inside the skill's boundary table (§ What an unattended pass may WRITE).

| Write | Count | Evidence |
|---|---|---|
| `Quick Win` stripped from closed issues | 127 | state category completed, canceled or duplicate; no per-issue comment, as on 09-23 (CUL-615) |
| `Waiting on PM` stripped from a closed issue | 1 (CUL-1539) | Done mid-pass via #1230 |
| In Progress → In Review, with a signed comment | 5 | open PRs whose sessions ended: CUL-1903 (#1210), CUL-1808 (#1183), CUL-1179 (#913), CUL-1756 (#1161), CUL-1769 (#1184) |
| Clock started on a pre-rule `Propose close` (dated, reasoned comment) | 36 | proposed 2026-09-24 (CUL-383 on 10-05) with no cancel date; cancels on or after 2026-10-23 |
| New `Propose close`, reason obsolete, label plus signed comment | 17 | the retiring PRs #1066, #1068, #1069, #1070; exemptions re-checked at write time |
| Carry-over notes (surface deleted, ask still live on the successor) | 8 | file:line on `origin/main` |
| `Dies at CUL-559` mark | 1 (CUL-217) | #1228 removed the widget's beta gate on `main`; the installed build keeps it until the cut |
| Default posted (comment only; label kept) | 1 (CUL-1231) | the description's recommendation (a); applies on or after 2026-10-19 |
| Notes for live work | 2 | CUL-963: #1064's migration 084 collides with `084_vet_call_cover.sql`. CUL-1848: `docs/app-review-notes.md:53-54` describes an Early access section that renders for no one since #1228 |
| The standing record | 1 (CUL-1962) | replaces dated record issues, per CUL-928's design |

### Not written, on purpose

- **No cancels.** No proposal carried a cancel date before today.
- **No `blocks` relations.** Every post-clause gate line that names an open issue was already linked.
- **No team calls.**
- **No default on CUL-591 or CUL-646**, both read in full first:
  - CUL-591 is Sheet B row Q36. Its "let it stand" option is the one the sheet's adversarial pass broke: on day 412 of 56, Ask says "complete".
  - CUL-646's option (A) makes CUL-648's clinical collision likelier, so it rides Q11 with CUL-648.

**Held for the PM's word rather than labelled:** CUL-568 and CUL-798. Their surfaces were retired in #1070, but both are clinical-adjacent, and a safety-adjacent issue leaves by a ruling, not by expiry.

## Lenses' claims that did not survive verification

- **CUL-591 as a default.** The queue lens recommended defaulting it to "let the carve-out stand". Sheet B records that option as broken (above).
- **A "first pass under step 12".** It was not quite the first: the 10-11 session ran an attended staleness pass over the queue (`docs/sessions/2026-10-11-clinical-ruling-sheet-second-sitting.md:8-10`).
- **The ruleset read.** One lens reported `main` unprotected with no rulesets, from a read-only API call. CLAUDE.md says the opposite, and this session could not verify either way. It is reported to the PM as a lead under CUL-1491, not as a finding.
- **CUL-1482's safety slice "with no home".** The checks were waived, and the waiver was the PM's knowing call ("This waiver supersedes D6 for 1.2.0"). Only AC-6's record is unreconciled.

## The PM's calls

Briefed on CUL-1962, each with a recommendation:
- **D1:** launch the ready 1.2.0 rows.
- **D2:** book the Sheet B sitting.
- **D3:** a ruling sheet carries the label for its rows.
- **D4:** AC-6 joins the binary-sitting script.
- **D5:** Engines v3.1's pile is parked, and the project gets a run order.
- **D6:** Ask v2 and Reintroduction become projects.
- **D7:** one "go" for about 40 low-risk board edits the write boundary keeps from an unattended pass (seating, closes on the PM's word, re-ranks, stale relations, two promotions).
- **D8:** label four harm findings `Live harm` and 22 quick wins `Quick Win`.

## Quick wins (step 6)

The quick-win lens read 50 of the 283 eligible issues filed since 09-23, plus the four existing `Quick Win` issues. Every site it cites was checked on `origin/main`.

- **Existing labels:** keep CUL-1901 and CUL-1766. Drop CUL-421: its PR #791 waits on the PM's stale-PR round, and two later CI steps can rewrite `deno.lock`, so the PR's premise no longer holds. Drop CUL-1449, which was proposed for close.
- **Recommended:** 22 issues, each one session: tests and CI, dead code left after GA, small trial-surface fixes, and accessibility and copy fixes. The list and each fix shape are on CUL-1962.
- **Four are live harm, not quick wins.** By `/dispatch`'s sort they can corrupt or lose what a reader sees, in code every account runs:
  - CUL-1354: after an offline pet switch, a logged dose lands on the wrong pet and reaches the vet report.
  - CUL-1601: Vet visits shows the previous pet after a switch.
  - CUL-1286: Edit profile clears the stored weight on bad input.
  - CUL-1547: the emergency sheet can read calmer than the record.

  All four were filed before the sort existed, so no dispatcher has read them.

## 2026-10-23: the PM's rulings, applied

The PM answered all eight calls a week later in this session. The rulings are recorded on CUL-1962, and every write below carries its own signed comment.

| Call | Ruling | What was applied |
|---|---|---|
| D1 | Hold: other work is being dispatched | Nothing. CUL-1560 (PR-26) had already gone Done during the week, so its "waiting on your go" is moot |
| D2 | A separate session | The Sheet B sitting runs as its own cloud session. It claims CUL-1795 and carries CUL-1725's orphaned D6 question, posted on CUL-1795 |
| D3 | (a) | 36 sheet-row issues gave up `Waiting on PM`, each with a pointer to its Q number. Q12 and Q14's issues had already closed, so a note on CUL-1795 says where their rulings go. Writing the rule into CLAUDE.md and the skill costs bytes against both ratchets, so it is filed separately as CUL-2169 |
| D4 | (a), via a pasted prompt | The AC-6 scope is posted on CUL-1851, and the PM has the kickoff prompt |
| D5 | (a), applied where it holds | 8 findings parked in Backlog, each with a comment quoting why; CUL-1741 and CUL-1749 lost their sub-issue links. The project page carries a 23-row run order, with Done means written as a proposal for the PM to confirm, and CUL-2186 filed as row 23's en10 go-live. 46 findings were not parked: see below |
| D6 | (a) | Two projects were created: *Ask v2: answers in the pet's calendar*, whose page is CUL-1802's run order in the /dispatch layout with 10 issues moved in, and *Reintroduction: after the diet trial*, whose rows wait on CUL-1821 and which has 8 issues moved in |
| D7 | Go | 10 issues seated out of In Progress, 2 labelled. 9 closed on the PM's word, plus 1 duplicate. 13 re-ranks. 3 project moves. 7 relation fixes. 2 parked findings promoted to blocking rows. 9 QUIET-by-text findings given `Live harm`. *Home v1: The Signal fold* closed as Completed |
| D8 | (a) | `Live harm` on CUL-1354, 1601, 1286 and 1547. `Quick Win` added to 21 issues; CUL-1562 took `Live harm` instead. The label came off CUL-421 and CUL-1449 |

**One D7 item was deliberately not applied:** closing CUL-590. It is Sheet B row Q37. Under D3 a sheet row hands its label to the sheet and stays open until its ruling posts. Closing it first would route the sitting's ruling into a closed issue, which is the leak this pass reported.

**D5 was half wrong, and the wrong half is back with the PM.** The 10-16 brief called all 54 *Found along the way* findings parkable. Under the sort, 46 of them are harm: each can quiet a warning, or corrupt or expose data, in live code, and the sort never parks harm. They stay open and untouched, and D5b on CUL-1962 re-poses them (recommended: file 13 classes, each `Live harm`). CUL-1394 was on the lens's park list, but its own text says a vet report subtitle "is false", which is not plainly polish, so it stayed with the 46. The page's build notes sit one to a line behind `**PR-NN:**`, because dispatch's parser cuts a note at its line end; the lens drafted them as sub-bullets, which would have left every gate and hotspot unread. The page went through `scripts/dispatch/page.ts` before it was saved.

**A correction to this pass's own write.** The 72-hour default posted on CUL-1231 on 10-16 was withdrawn, unapplied. CUL-1231 is Sheet B row Q30. The sheet's adversarial pass rates the recommendation **quieter** on the dose row, so it needs the PM's explicit agree under E-6, and a default cannot supply that. The queue lens and this session both missed that it was a sheet row.

**Step 14 ran on schedule.** All 53 dated `Propose close` issues passed every check: the label was still on, no reply had come in seven days, and no exempt label had been added. All 53 were canceled, each with a comment that it can be reopened. By reason: 25 obsolete, 14 stale, 12 won't do, 2 superseded. One is worth the PM's glance: CUL-88 (a detection tie-break label). An older, September comment of its own asked for the PM's nod; its body says no owner-facing output changes.

## Lessons

- **A sitting that absorbs other issues' checks is a single point of loss.** When it is waived, everything folded into it goes with it. The fold should copy each absorbed check's id into the sitting's script, so a waiver can name what it waives.
- **A ruling sheet multiplies the queue it was built to shrink,** unless its rows give up their labels to it. That is D3.
- **Test a brief's premise against the rule it leans on.** D5 cited the sort's door 4 for a whole pile without running a single finding through the sort's harm test, and 46 of 54 failed it. A brief that applies a rule to a set samples the set against that rule before it recommends.
- **Verify a lens's recommendation, not only its facts.** CUL-591's facts were right and its recommended default was the broken option. Only reading the sheet row caught it.
- **The detector that cannot fire, again.** Step 18's Misrouted check ("no `Direction:` line and no `relatedTo`") found nothing because every sampled issue carries a `relatedTo`. The QUIET findings it exists to catch were found by reading their text instead (CUL-1946 and eight others). Changing that wording is a skill change, and tool PRs are paused until CUL-1876's readout, so it is reported rather than fixed.
