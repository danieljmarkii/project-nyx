---
name: backlog-groomer
description: Use this skill to groom and reconcile Nyx's backlog (`docs/backlog.md`) — the operational procedure behind the Product Owner persona. Triggers include the PM asking to "groom the backlog", "reconcile the backlog", "clean up the backlog", "what's stale", or any session-start scan that needs to check the backlog against reality; closing out a shipped item; or whenever the status block claims something shipped that the backlog still lists as Open. Loads the reconciliation procedure: match Status against merged PRs/commits, fix stale rows, re-prioritize aged-Now items, enforce the row contract, de-duplicate, and surface items that block the Current Phase — without inventing scope (new product scope is a PM decision, routed to Open Questions, never a silent backlog edit). For the lens/judgment behind this procedure see the Product Owner persona in `docs/personas.md`; this skill is the how.
---

# Backlog Groomer

The canonical row contract and priority definitions live in `docs/backlog.md` (its header) and the **Backlog Protocol** section of `CLAUDE.md`. This skill is the *procedure* the Product Owner runs to keep that file honest. The lens is the Product Owner persona (`docs/personas.md`); this is the checklist.

## Why this exists

The backlog drifts from reality in a specific, recurring way: an item ships in the codebase and gets narrated as "done" in the status block, but its row in `docs/backlog.md` stays `Open`. Real examples caught 2026-05-31: **B-022** (shipped in PR #59, still read "Open — PR open (draft)") and **B-045** (Steps 1–3 all built/merged via #72/#73/#74/#75, still read "Open — deferred to a dedicated session"). Grooming closes that gap.

## The grooming pass — run in order

1. **Reconcile Status against reality.** For each `Open` row, check whether it actually shipped: `git log --oneline | grep -i "B-0NN"`, the merged-PR list, and the STATUS.md "Recent Sessions" / current-phase claims. If it merged, rewrite Status to `Done — <date> (PR #N)` (or `Done — <date> (<session>)` for non-code closures like persona reviews). Never close without a resolving reference.
2. **Fix stale in-flight rows.** A row reading "Open — PR open (draft); Done on merge" whose PR has merged is Done. A row describing a plan that's since been executed is Done or partially-done — say which steps remain.
3. **Re-evaluate aged priorities.** Any item that's been `Now` across multiple sessions without progress is one of: (a) genuinely blocked — state the blocker in the row; (b) mis-prioritized — move to `Next`/`Later` with a one-line why; (c) effectively dead — flag to PM, don't silently delete. Mirror CLAUDE.md's stale-Open-Question triage, applied to priorities.
4. **Enforce the row contract.** Every row needs: sequential `B-NNN` (never reused), Title, one-line _why_, Priority (`Now`/`Next`/`Later`), `Added` (ISO date), `Blocks` (or `—`), Status. Flag any row missing the _why_. **The Status cell must lead with a structured head token** — `Open` / `In progress` / `Partial` / `Blocked` / `Done` + date + PR, per the contract in `docs/backlog.md`. Flag (and fix) any row whose head reads stale because an update was appended to the tail instead of rewriting the head — the recurring drift this skill exists to catch (B-022/B-045, B-040/B-051/B-075). Rewriting a stale head to match shipped reality is reconciliation, not new scope — apply it directly.
5. **De-duplicate.** If a row restates an existing item, prefer composing/cross-referencing (`composes with B-0NN`) over a new ID. Flag near-duplicates to the PM.
6. **Surface what's relevant now.** List anything whose **Blocks** column matches the Current Phase (from STATUS.md), and any stale-`Now` items, at the top of your report.

## Hard rules

- **Do not invent scope.** Grooming reorders and reconciles; it never adds new product scope. If grooming reveals a real decision (e.g. "do we anonymize or hard-delete on account deletion?"), that belongs in CLAUDE.md → Open Questions, surfaced to the PM — NOT resolved by a backlog edit.
- **Do not re-prioritize against the PM's explicit ordering** without surfacing it as a question first.
- **Closing keeps the row.** Set Status to `Done — <date>`; leave the row in place (per `docs/backlog.md` convention). Note: the file has an unused `## Done` section — keep Done rows in the main table with `Done` status as the existing closed items (B-003, B-027, …) already do, unless the PM asks to physically migrate them.
- **Adding a row is still proactive and unilateral** (per Backlog Protocol) — that does not need PM approval; *grooming/closing/re-prioritizing existing rows* is where you surface and confirm.

## Output format

```
## Backlog grooming — <date>

### Reconciled (Status corrected)
- B-0NN <title>: Open → Done — <date> (PR #N) — <evidence>

### Re-prioritized
- B-0NN: Now → Next — <why>

### Contract / dedup flags
- B-0NN — <missing why | duplicate of B-0MM | …>

### Blocks the Current Phase (<phase>)
- B-0NN <title> — <why it's relevant now>

### Needs PM decision
- <anything that's actually an Open Question, not a deferral>
```

Apply the Status/priority edits directly to `docs/backlog.md` (reversible, cheap). Route anything in "Needs PM decision" to the PM and to CLAUDE.md → Open Questions.
