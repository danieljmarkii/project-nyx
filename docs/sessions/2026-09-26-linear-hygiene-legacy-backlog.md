# Linear hygiene: Legacy Backlog closed, 102 issues rehomed

**Date:** 2026-09-26

Shipped via #930. Issues: CUL-1284 (the audit and fix), CUL-1043 (the trial window track's project). Mode: DISCOVERY that became BUILD on the PM's rulings.

## What the PM asked

"I've noticed us filing new issues with the legacy backlog tag. I was under the impression that would only be used on tasks that came over from the GitHub backlog." Plus: what else keeps Linear tidy.

## What was actually wrong

The `Legacy` **label** was clean: zero issues created after the 2026-08-15 cutover carried it. The **Legacy Backlog project** was not. 153 issues filed natively in Linear after the cutover had landed in it, beside the 487 migrated rows.

Two rules compounded:

1. `CLAUDE.md` § Backlog Protocol, the issue-shape table, named Legacy Backlog as the default project for any issue that did not extend a live track.
2. `backlog-groomer` step 9, the issue contract, required every issue to have a project. With no neutral home, Legacy Backlog was the only fallback.

`STATUS.md` said the opposite ("the migrated B-NNN rows"), so the docs contradicted each other and sessions followed `CLAUDE.md`.

The leak was still live during the session: CUL-1286 was filed into Legacy Backlog at 14:33, after the audit had diagnosed it. It was moved out with the rest.

## Rulings

- **Q1, the default home (PM):** a project is not required; a standalone issue is fine. The Triage-inbox recommendation was dropped. A new issue joins a live project only when it extends that project's work, otherwise no project plus an `Area:` label.
- **Q2, the existing 153 (PM):** option (a). Move the **open** ones after a mapping table is approved; closed ones stay where they are. Approved as posted on CUL-1284.

## What shipped

**Rules (#930):** the `CLAUDE.md` Project row, `backlog-groomer` step 9 (Area label in the contract, project out, and a per-pass check that lists and moves any new arrival in Legacy Backlog), and two `STATUS.md` rows (Legacy Backlog closed; the new trial window project). `CLAUDE.md` stays under its byte ceiling, 136,708 of 136,728 after merging `main`.

**Linear:**

- New project *Diet trial — change the window* (P-CUL-19): its 10 open issues plus the 7 shipped PRs (CUL-1036–1041, 1051), so its progress reads true. Resolves CUL-1043.
- 18 into live projects: Engines v3 9, v15 remediation 3, Event Taxonomy 2, and one each to History v2, Design v2, Out of beta, Workflow audit.
- 60 to no project with an `Area:` label added; 12 to no project that already carried one.
- Legacy Backlog got a summary and description: migrated rows only, closed to new issues.
- `Waiting on PM` removed from CUL-1284 and CUL-1043 once ruled.

Verified against Linear after the moves rather than from the two worker agents' reports: the only post-cutover issues still open in Legacy Backlog are CUL-570 and CUL-781, both tagged `Propose close` and left for the PM's sweep.

## Other findings, surfaced and not acted on

- **`Waiting on PM` is at 144**, up from 97 when the workflow audit (P-CUL-12) started on 2026-09-11. That project's own falsifier is that this number drops. CUL-923 (the `Needs PM` state) needs about two minutes in Linear settings; two closed issues (CUL-719, CUL-1008) still carry the label.
- **51 `Propose close` issues** have waited on a bulk cancel since 2026-09-24.
- **Stale project statuses:** Signals v2 still In Progress though GA'd 2026-08-20; "Backlog → Linear: operationalize the cutover" still Backlog though executed; The Daily Recap Backlog while its umbrella is In Progress; five projects have no lead.
- **Labels:** `Bug` / `Feature` / `Improvement` are barely used; the `Area:` labels covered a minority of issues before today's pass.

## Residuals

- The rule is only enforced once #930 merges; until then a session reading the old `CLAUDE.md` still routes to Legacy Backlog.
- The groomer's per-pass check is prose in a skill, which the workflow audit's L2 says fires approximately never. It becomes real when CUL-928 (the weekly pass) runs it.
