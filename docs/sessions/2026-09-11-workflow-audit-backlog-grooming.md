# Workflow audit — the backlog, Linear, and the session rituals

**Date:** 2026-09-11
**Mode:** DISCOVERY (PM-initiated: *"take a hard look at our backlog grooming workflows and any workflow that touches our status, project management, Linear"*)
**Outcome:** shipped via #829 — `docs/workflow-retro-2026-09.md` (the record), the published decision surface, the `personas.md` retro-log entry, and ten Linear issues (CUL-919 … CUL-928, all on the *Backlog → Linear: operationalize the cutover* project).
**Decision surface:** <https://claude.ai/code/artifact/0c92f9a1-523c-44b0-b9b5-3a506b63b578> — *The Culprit Workflow Audit*. The artifact is the PM-facing read; this file and the retro are the durable record.
**Full findings:** `docs/workflow-retro-2026-09.md`. This file is the cross-issue narrative only.

---

## What this session did

Seven expert lenses over the workflow surfaces, run in isolation so none was anchored by the others: Product Owner (critiquing its own skill), a Linear power-user consultant, PM operations / decision throughput, Dir. Engineering (designing the fan-out the PM asked for), Sr. QA (pre-morteming the automation before it exists), a process-cost critic mandated to cut, and a repo archaeologist whose only job was to stop the session recommending things this repo has already tried and failed at.

Each lens's finding set was then attacked by a dedicated red-team pass on three axes — prior art, contradiction against a documented rule, and operational reality for a solo part-time PM — and the survivors went to a completeness/net-out critic. 14 agents, ~2.5M subagent tokens.

**The red team was worth more than the lenses.** It rejected 5 of 41 findings outright and materially revised most of the rest, and its revisions consistently *stripped machinery* — the recurring correction being "do this inside the grooming pass that already runs, not in new infrastructure." It also caught a factual error the main session had already stated to the PM (see below).

Every load-bearing measurement was re-verified against the working tree before publication. Five of them turned out to be live defects.

---

## The five defects (all verified, all in `docs/workflow-retro-2026-09.md` §2)

1. **`SKILL.md:30` reads `main`, which is 19 commits behind `origin/main`** — 17 `CUL` ids invisible to every reconciliation step, including CUL-871/CUL-873 from the previous night. One-word fix, and it must land first because every downstream predicate reads that ref.
2. **The abandoned-claim detector has never fired and structurally cannot.** It declares a claim stale when `git ls-remote origin <branch>` finds nothing; measured, there are **779 `origin/claude/*` branches of 789 total heads** — claim branches are never pruned, so the ref always exists. ~10 issues sit claimed and untouched for 13 days while the report reads healthy.
3. **Step 0 exits non-zero on a healthy repo** (`test -f .git/shallow && …` returns 1 in the success case).
4. **This ritual's own trigger was never built.** `personas.md:335` specified it on 2026-07-19; `grep -rin "retro" .claude/` returns 0. One retro in 367 sessions.
5. **CLAUDE.md contradicts itself on its first screen** — line 10 says the Build Sequence is complete, line 146 says step 9 is the current phase.

Defects 2 and 4 are the same shape and produced the session's most generalizable law: **a detector whose only evidence is the existence of a ref, a file or a label is not a detector** — and it was found by applying the repo's own mutation-proof convention to rules made entirely of prose.

---

## The finding the PM most needs

`Waiting on PM` is at **97 issues**, twenty days after the 2026-08-22 migration deleted a 102-item PM checklist from `STATUS.md` for being unreadable. Sixteen places in the repo mandate adding to the label; **none tells anything to take it off.**

The audit went looking for a drain and every candidate died correctly under red-team. What survives fixes *inflow*; nothing closes an open item. The evidence that this is not a tooling problem is CUL-583 — a fully-assembled single sitting that discharges ten issues, filed Urgent on 2026-08-22, flagged by two consecutive grooming passes, still `Todo`.

So the honest position was delivered as the headline rather than buried: **better batching improves the arithmetic of a sitting that happens; it does not cause one to happen.** The recommendation pairs every queue-facing change with a falsifier — a recurring 30-minute calendar hold, the one scheduler the PM already obeys — and states up front that two consecutive empty holds mean the whole queue-facing branch should be abandoned rather than refined.

---

## A correction the red team forced

Mid-session the main thread told the PM that PR #529 (*"Quick-wins batch: 10 self-contained PRs across 22 backlog items"*, open since 2026-08-01) was evidence that batching fails here and that merge, not build, was the bottleneck. The second half is right; **the evidence was wrong.** #529 is a 153-line planning document, not a batch of code. The real record is the opposite: **#792 (7 issues), #794 (5 issues) and #812 all merged as stacked multi-issue batch PRs.**

Batching is the shape that already works in this repo, which changed the `/swarm` design from "forbid batch PRs" to "package the batch shape that lands, and split off the half that genuinely parallelises." The correction was stated to the PM in-session rather than quietly folded in.

---

## Rulings recorded

The full set is `docs/workflow-retro-2026-09.md` §3. The two with the widest reach:

- **`Waiting on PM` becomes exactly one Linear workflow state, `Needs PM`, type `unstarted`.** The team is on stock default statuses with no state meaning "blocked on a human", which is precisely why it became a label. A state is exclusive and vacates on close, so "closed and still queued" becomes unrepresentable. **It fixes representation, not volume, and must not be described as a drain.** A mid-build PM block keeps `In Progress` — `kickoff.md` is explicit that the claim comment's branch name *and* the status are both load-bearing, and the claim is the repo's only issue-scoped collision guardrail.
- **The fan-out answer is "fan out the read, serialize the write."** Verification is read-only, worktree-isolable, collides with nothing, and is where the losses are (10 of 21 title-judged quick wins fell out on reading the body). Building is not — one session, one commit per issue, one stacked PR, which is the #792 shape.

---

## What this session deliberately did NOT do

No Linear writes beyond filing the ten issues above — no status corrections, no label hygiene, no sweep. The PM ruled the scheduled pass may make safe writes; **that ruling is for the pass, not for a discovery session**, and the write-boundary table (CUL-922) is a hard prerequisite for any of it. Applying ~90 hygiene writes before the boundary is written down is exactly the shape the audit is warning about.

No code, no schema, no deploy, no build-phase change. The `personas.md` edit is the retro log entry, which the ritual itself instructs. Every other `/docs/` and CLAUDE.md change is proposed, not written.

---

## Residuals

- The **Read-These table** (23 KB / 35 rows) and the **`Area: *` taxonomy** (12 labels, minority coverage) are named in §6 as still-owed cuts to pay for the one unpaid addition (the weekly Routine). Both are Tier-2 and need PM sign-off.
- `docs/sessions/` is at **367 records / 4.8 MB** with no index and no retention answer. Raised, not solved.
- Six Linear projects read `In Progress`, two of which `STATUS.md` itself describes as shipped. Left for the first pass that has a written write-boundary.
