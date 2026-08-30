# Session — Linear backlog grooming: TL;DRs, quick wins, status reconciliation

**Date:** 2026-08-29
**Branch:** `claude/linear-backlog-grooming-zvv4wm`
**Mode:** DISCOVERY + board maintenance (no app code, no schema, no build-phase change)
**Advances:** CUL-719 (the outcome record + the five open calls)

---

## What the PM asked for

Three things, in one grooming session:

1. Extend the plain-English `TL;DR` convention (instituted 2026-08-26) to **all existing Linear issues**.
2. Identify quick wins and label them.
3. Ensure task statuses are up to date.

## What was decided before starting

Three scoping questions were put to the PM as decision briefs; all three took the recommendation:

- **TL;DR scope** → open issues only (Todo / Backlog / In Progress / In Review). The 149 `Done` and the Canceled/Duplicate sets were skipped: a plain-English summary on a closed issue is archaeology, not something anyone sorts by.
- **Quick Win definition** → *small **AND** grabbable today*. One focused session, ~1 PR, no schema/deploy chain, no pending PM/design/clinical ruling, not on either standing deploy hold, not a device/App-Store-Connect chore, not carrying `Waiting on PM`, and genuinely worth doing.
- **Status edits** → fix statuses directly (the `backlog-groomer` skill already authorises this); **report** priority drift rather than silently re-ranking the PM's ordering.

## How it ran

536 open issues, batched 8 per agent → 67 agents across 5 parallel `Workflow` shards.

One mechanical finding worth recording: the box has **4 CPUs**, so a single workflow caps at `min(16, cpus-2)` = **2** concurrent agents. The first run would have taken ~2.5 hours. Sharding the same script across five concurrent top-level `Workflow` invocations gave 10 effective lanes and brought it to ~30 minutes. The work is I/O-bound on the Linear API, so oversubscribing the CPUs costs nothing.

The pass was designed to be **idempotent** — an agent that finds a TL;DR already present records `already-present` and skips — which is what made it safe to stop the first run mid-flight and relaunch.

## Results

| | |
|---|---|
| Issues processed | **536 / 536**, 0 failures |
| TL;DRs written | **494** (42 already had one) |
| `Quick Win` applied | **97** → ~108 open quick wins |
| Closed as already shipped | **12**, each with a commit-level evidence comment |
| `Waiting on PM` added | **13** |

### Verification

Two independent checks, because 494 permanent writes to the PM's board is not something to take on trust:

1. **Contract audit** — a mechanical AST-ish scan over ~500 of the written TL;DRs for the house rules (no backticks, no file paths, no `§` refs, no internal codenames, no exclamation marks, correct `**TL;DR — plain English:**` + `---` framing). **0 missing TL;DRs, 1 violation** (CUL-698 carried a backticked number) — fixed.
2. **Blast-radius audit** — every `save_issue` call across all agent transcripts was scanned for `state` or `priority` keys. **Zero.** The report-only instruction held.

A third check caught a real hazard early: Linear's `labels` field **replaces** the whole label set, so an agent adding `Quick Win` without echoing the existing labels would silently strip `Waiting on PM` / `Legacy` / `Area: *` across the board. Agents were instructed to read-then-write within the same turn, and the first four label writes were verified against the pre-run manifest before the rest landed.

### Closures

`CUL-364` (Geist rollout — all seven sub-PRs merged and now CI-guarded), `CUL-118`, `CUL-379`, `CUL-391`, `CUL-615`, `CUL-462`, `CUL-666` (the W1 cough/sneeze wave shipped despite its "NOT greenlit" title), `CUL-410`, `CUL-429`, `CUL-653`, `CUL-175`, `CUL-37`.

Each carries a comment naming the commit(s) and, where relevant, the issue that inherits the residual — `CUL-653` → `CUL-655`, `CUL-175` → `CUL-65`. Nothing was closed without a resolving reference.

## Findings the PM has to rule on — recorded as CUL-719

1. **The board is 76% archive.** 368 of 484 `Todo` issues are legacy rows migrated 2026-08-15 and untouched since; only **116** are native post-migration issues. The 347-row Legacy Backlog drowns the live work in any priority-sorted view.
2. **`Waiting on PM` is under-applied by ~63 issues — and applying them all would break it.** 76 issues have a PM/clinical gate as their only next step; only 13 matched the label's stated definition (*engineering-complete, one named step left*) and were applied. Tripling the sweep would destroy the one view the PM actually uses. Recorded as a choice, not resolved.
3. **31 open PRs, ~25 stale drafts back to 12 June** — including #529 *"Quick-wins batch: 10 self-contained PRs across 22 backlog items"*. Untouched; closing someone's PR is not a grooming action.
4. **29 possible duplicate pairs**, clearest being CUL-48 ↔ CUL-37 and CUL-536 ↔ CUL-537.
5. **The Urgent list is really one meeting.** Six of twelve Urgent issues wait on the same Dr. Chen sitting that `CUL-583` exists to schedule.

## Notes for future sessions

- **The `Quick Win` label already existed** (seeded from a 2026-08 triage of the frozen `docs/backlog.md`) but had gone stale — 36 issues carried it and most were already `Done`, leaving ~12 live. Re-deriving it against the current board is what made it useful again.
- **Status hygiene on `CUL-` issues is genuinely good.** Only one open issue had a `CUL-`-referencing commit on `main`, and it was a correctly-open umbrella. The GitHub↔Linear integration is doing its job; the drift lives in the older `B-NNN` legacy rows, whose commits predate the identifier.
- **The repo arrives as a shallow clone (43 commits).** Any status reconciliation must `git fetch --unshallow` first, or the evidence base is a tenth of the history.
- **Linear's search index lags writes.** A `TL;DR` search returned 113 while 165 had been written. Trust the write count, not the search, when measuring a bulk pass.
