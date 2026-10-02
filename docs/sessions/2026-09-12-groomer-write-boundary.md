# The groomer's write boundary — what an unattended pass may write vs only report

**Date:** 2026-09-12
**Mode:** BUILD (CUL-922, milestone **W-B · The boundary** of *The workflow audit — the board, the queue, the ceremony*)
**Outcome:** shipped via #842 — one file, `.claude/skills/backlog-groomer/SKILL.md`: a new § *What an unattended pass may WRITE*, the per-step write/report split applied to steps 1, 4, 6, 8 and 10, a new Hard rule, and a rewritten output format whose two halves make the boundary checkable.
**`STATUS.md`:** not touched. No track started or ended; the audit project's row already names W-B as next.

---

## The defect

`.claude/skills/backlog-groomer/SKILL.md` gave two different answers to "may an unattended pass merge issues?". Step 10 said *flag near-duplicates to the PM with a recommendation*; the closing line said *apply the status / label / **dedup** edits directly in Linear via the MCP — reversible and cheap*. A scheduled Routine reading the closing line is authorised to fold issues across all 536. The same shape sat on priority: step 8 instructed `lower its priority with a one-line why`, and Hard rules forbade re-prioritising against the PM's ordering without asking.

Nothing had run unattended yet, which is the only reason this cost nothing. CUL-928 (the weekly Routine) is blocked on this issue for exactly that reason, and the retro's own order names it a **hard prerequisite for anything scheduled**.

## The rule

> *An unattended pass writes only where a named artifact determines the write. If the evidence is a sentence you wrote, it is a report line.*

The reason this one sentence is worth more than the table it generates: **it is checkable from the pass's own output.** Every line under *Applied this pass* ends in a PR number, a branch name and tip date, or a state category. A written line with no artifact beside it is a visible protocol violation — no Linear access needed to audit it. The output format was restructured into *Applied this pass* / *Reported, not applied* so the check is structural rather than remembered.

Four writes survive the rule: `→ Done` under clause 1, `→ In Review` off an open PR, an abandoned claim `→ Todo` off a branch tip date, and the dead-label strip off a state category. Everything else — the deploy-ledger conclusion, narrowing against the tree, the `Quick Win` *add*, closed-but-unfinished, priority, the contract, dedup — is a report line.

**A comment is not a write.** The boundary governs field edits. Comments are the report medium, and a permitted write still carries its own audit comment. Report-only findings go on the standing issue, not one comment per issue across the board.

## What the falsification pass found

Four ways through the boundary as first drafted, each closed in the file:

1. **Mint your own evidence.** A pass could `create_attachment` and then read that attachment as clause 1's evidence. Closed three times over: `create_attachment` is struck from the skill's tool list with the reason, clause 1 forbids it, and step 1 forbids it. *A detector that can author its own evidence is measuring itself.*
2. **The second signal was ambient.** Retro §2 F6 proposed *attachment plus a closing keyword, or the issue already in a started state* — and the started-state half is defeated by F6's own shape. A `CUL` range in a PR title attaches an unrelated issue; a session that claimed and died leaves that issue `In Progress` indefinitely; the two together close it. Tightened: the second signal must tie the issue to **that PR** — a closing keyword naming it, or the issue's claim comment naming that PR's head branch. A started state is ambient; a branch name and a keyword are artifacts.
3. **An open label category.** "Remove a needs-attention label" is a category a pass can extend, and `Area: *` / `Legacy` were one reading away. Closed to exactly `Quick Win` and `Waiting on PM`, in the table and in the step, with the distinction stated: those two say what someone should *do next* and go false on close; the others say what an issue *is* and stay true.
4. **The Routine authorising itself.** "Unattended" could be read as "nobody objected". Stated: scheduling authorises the pass to *run*; the table is what it authorises the pass to *do*.

A fifth, pre-existing: the abandoned-claim row could sweep a PM-blocked issue whose claim was never released. The row now also requires that no comment says the issue is waiting on the PM — precedence resolved toward the non-misleading half, per the C-4 lesson.

## The honest note, written into the skill

The label strip is the highest-yield safe write on the board (~70 dead `Quick Win`, ~5 dead `Waiting on PM` on pass one) and it fixes exactly one thing: *the board does not match reality*. **It does nothing for queue length.** The first pass's impressive write count is not a drain and must never be reported as one.

Clause 1 gets the same treatment, for the opposite reason: **its expected yield is approximately zero, and that is correct.** An attachment present at merge is what makes the integration close the issue itself, so `{still open} ∩ {merged PR} ∩ {attachment}` is nearly empty by construction. Clause 1 is a boundary, not a detector. Writing the yield down up front is retro §5 item 5's instruction, and it exists so no later session widens the clause to make a pass look productive.

## What this leaves for CUL-926

CUL-926 moves these predicates into `scripts/groom/predicates.ts` with a mutation guard. This session is the corrected *rule*; that issue is where it stops being prose — and it now inherits a tightened clause 1 rather than the retro's draft. The detector-liveness clause it owns (*every detector must be shown to fire at least once against a real-board fixture*) will find clause 1 firing zero times against any fixture, which is the expected result and is now documented as such in the skill so it is not read as a bug.

## Persona sign-off

- **Product Owner / Backlog Steward ✓** — the boundary reconciles rather than invents; the `Quick Win` add moving to report-only follows the canonical definition (*grabbable today*), since grabbability is the judgment 8 of the 10 measured false positives turned on.
- **Sr. QA ✓** — the acceptance criteria are the issue's two lists, checked item by item below; the falsification attempts are named above rather than asserted.
- **Trust & Safety N/A** — no pet data, no access-control surface. The write boundary is board hygiene.
- **Engineer ✓** — `tests: N/A — prose procedure, no extractable logic.` The diff touches no store, Edge Function or `lib/` utility. `tsc --noEmit` clean; `guards/groomPreflight.test.ts` + `guards/claudeMdBudget.test.ts` green. CUL-926 is where these predicates become testable code, which is the right vehicle for a mutation suite.

## Acceptance criteria (CUL-922)

| Criterion | Status |
|---|---|
| New § *What an unattended pass may write*, per-step table | ✓ — 13 rows, one per step, sited after step 0 so it is read before any step runs |
| Mechanical: `→ Done` only on an attachment, evidence the PR number | ✓ — **amended**: attachment **plus** a PR-tying second signal (retro F6) |
| Mechanical: `→ In Review` on an open PR, evidence the PR number | ✓ |
| Mechanical: abandoned claim `→ Todo`, evidence branch + tip date | ✓ — plus the PM-blocked precedence clause |
| Mechanical: label hygiene on completed/canceled only | ✓ — closed to `Quick Win` / `Waiting on PM` |
| Report-only: ledger, narrowing, grabbability, closed-but-unfinished, priority, dedup | ✓ — all six in the table as **report** |
| Delete step 8's write instruction | ✓ — step 8 now reads *report, never write* and names the contradiction it removed |
| Drop dedup from the closing line | ✓ — closing line rewritten; *reversible and cheap* retired with the reason |
| The governing rule stated once | ✓ — opens the section |
| Every *Applied this pass* line carries an artifact | ✓ — enforced by the output format's two halves |
| The honest note on label hygiene | ✓ |
