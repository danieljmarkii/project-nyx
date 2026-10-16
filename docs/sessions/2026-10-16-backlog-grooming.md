# Session: Backlog grooming (Linear, team Culprit), the first pass under steps 12 to 18

**Date:** 2026-10-16
**Mode:** DISCOVERY (Product Owner / Backlog Steward lens), attended: the PM asked for the pass
**Outcome:** shipped via #PR_NUMBER (this record only; the pass's writes are in Linear)
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

Thirteen read-only lenses ran as background agents, each from one shared brief with the read-only rule written in:
- the PM queue, in three batches of 28;
- the retirement sweep with the closed-project leftovers;
- the veto window with staleness decay;
- the In Progress and In Review sort;
- Urgent/High aging, the issue contract and orphans;
- closed-but-unfinished;
- gates with the parked sitting;
- quick wins;
- dedup.

This session verified each lens's load-bearing claims against `origin/main` or Linear before acting. Three narrow writer agents then executed a fixed operations file verbatim, each re-checking every precondition at write time. One container restart mid-pass stopped two lenses; both resumed from their transcripts.

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

## Lessons

- **A sitting that absorbs other issues' checks is a single point of loss.** When it is waived, everything folded into it goes with it. The fold should copy each absorbed check's id into the sitting's script, so a waiver can name what it waives.
- **A ruling sheet multiplies the queue it was built to shrink,** unless its rows give up their labels to it. That is D3.
- **Verify a lens's recommendation, not only its facts.** CUL-591's facts were right and its recommended default was the broken option. Only reading the sheet row caught it.
- **The detector that cannot fire, again.** Step 18's Misrouted check ("no `Direction:` line and no `relatedTo`") found nothing because every sampled issue carries a `relatedTo`. The QUIET findings it exists to catch were found by reading their text instead (CUL-1946 and eight others). Changing that wording is a skill change, and tool PRs are paused until CUL-1876's readout, so it is reported rather than fixed.
