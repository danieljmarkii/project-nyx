# Backlog migration to Linear

**Date:** 2026-08-15

## What happened

The PM asked whether moving the backlog off `docs/backlog.md` (453 KB, session-start scans reduced to `grep`ing a single file) onto Linear was a sound strategy, given a few recent PRs had already been running Linear-first for the Signals v2 and Daily Recap build tracks. Walked through the tradeoffs, ran a quick sanity check with the Product Owner/Backlog Steward and Dir. of Engineering personas (both in favor; PO flagged the risk of a half-migrated dual-source-of-truth state and of the Legacy Backlog project becoming a flat unscannable pile at scale — noted, not blocking), then executed the full migration across two work sessions in this thread.

## What shipped

**Phase 1 — Now-priority rows (47 items).** Parsed `docs/backlog.md`'s markdown table by hand (handling the escaped-pipe convention), classified each row into an existing build-track Linear project (Signals v2, Daily Recap) or a new **Legacy Backlog** project by content match, and created each issue individually via the Linear MCP (`mcp__Linear__save_issue`), condensing multi-thousand-word build-log entries (e.g. B-228 "Ask AI", B-403 config hardening) down to a why + current-state + remaining-work shape rather than reproducing the full backlog.md prose. Every issue: `B-NNN` prefix in the title, `Legacy` label, a `_Migrated from docs/backlog.md (B-NNN)_` footer, priority mapped Now→High.

**Phase 2 — the rest (440 candidate rows: 176 Next + 264 Later after a parser fix recovered 10 more rows than the naive count).** Given the scale, hand-authoring one issue per `save_issue` call wasn't practical — built a Python parser to extract every non-Done row, excluded 10 genuinely malformed rows (missing table cells in the source, not just unescaped pipes) rather than risk porting corrupted data, batched the remaining 440 into JSON files of ~40 items, and dispatched parallel background `Agent` calls (11 initially, later 6 more for a resume pass) each reading its batch file and calling `save_issue` per item.

**Hit a real blocker mid-flight:** batch 11's agent hit the Linear workspace's free-plan issue cap partway through (400 error, "exceeded the free issue limit"). Stopped the other 10 running agents immediately (via `TaskStop`) rather than let them burn tokens hitting the identical wall. Reported the blocker to the PM rather than working around it. PM upgraded the Linear plan; verified the cap was actually lifted with a single test issue before relaunching, then rebuilt batch files for exactly the 239 items confirmed missing (diffed against Linear's actual issue list, not the killed agents' self-reported counts, which had already shown drift under load in the first pass) and re-dispatched 6 batches.

**Final verification:** paginated `list_issues` for the `Legacy` label across the whole workspace (487 issues, two pages) and diffed the full set of created B-IDs against the full candidate list (Now + Next/Later). **487 of 487 — zero missing, zero duplicates.** One accidental duplicate along the way (a test-probe issue that grabbed B-005's real ID when verifying the cap was lifted) was fixed in place rather than left as a stray.

**Docs updated:**
- `docs/backlog.md` — frozen. Banner at the top states the freeze, points to Linear, and names the 10 unmigrated malformed rows (B-128, B-137, B-218, B-267, B-351, B-441, B-466, B-555, B-616, B-618) for manual follow-up.
- `CLAUDE.md` — Backlog Protocol section rewritten: new "let's log that for later" items go to Linear via the MCP tools now, not a markdown row. Open Questions table is explicitly untouched (stays in CLAUDE.md — different kind of thing, unresolved decisions vs. resolved deferrals).

## Decisions made

- **Structure for the Legacy Backlog project: flat, single project + the `Legacy` label, no subsystem sub-projects for now.** PM wants a dedicated future session with the product team to decide whether subsystem projects make sense once the full backlog is visible in Linear — deliberately deferred rather than invented unilaterally now.
- **Priority mapping:** Now → High (2), Next → Medium (3), Later → Low (4). All Now-priority items got High rather than differentiating further within that tier — a call made without explicit PM ratification; worth revisiting if it doesn't hold up in practice.
- **Malformed source rows excluded rather than best-effort parsed.** 10 rows had missing table cells in the raw markdown (not just an unescaped-pipe issue the parser could safely repair) — automated porting risked corrupting data, so they were flagged for manual handling instead.

## Process notes for future large migrations

- **Don't trust a killed/interrupted subagent's self-reported counts.** The first cap-hit incident showed batch agents miscounting under load ("24 of 21... let me count"). Ground truth came from querying Linear directly and diffing IDs, every time — this caught the real gap (239 missing, not the ballpark the agents reported) and should be the default verification method for any bulk-write task delegated to subagents.
- **Stop siblings immediately on a shared-resource blocker.** The other 10 running agents were about to hit the identical plan-cap error repeatedly; stopping them via `TaskStop` as soon as one agent's failure pattern was diagnosed avoided burning ~10x the tokens for zero additional information.

## Residuals / follow-ups

- 10 malformed backlog.md rows need manual fixing + porting or confirmed-dead disposition (named in the new backlog.md banner).
- A future session should convene the product team on whether the Legacy Backlog project should split into subsystem projects now that its true size (487 issues) is visible.
- Priority-mapping calls (Now→High uniformly, Next→Medium, Later→Low) were not individually PM-reviewed at the item level — spot-check if any surprise re-prioritization is needed.

## Shipped via

#663
