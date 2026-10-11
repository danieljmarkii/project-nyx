# Retro 4 PR-B: the sort, rulings travel, the forecast budget (CUL-1870)

**Date:** 2026-10-11
**One thing:** P3 L1 — Opportunity cost: every finding offered as a row spends PM attention the core track needed · check: pending

Shipped via #1195 (draft). BUILD, plan-gated: the plan went up on the issue, and the PM typed `go` in session.

## What shipped

- **`.claude/commands/dispatch.md` v1.8.**
  - A new **§ The sort** holds the retro's five rules in one place:
    - the direction tag (untagged counts as QUIET);
    - the four doors;
    - the stopgap;
    - class not instance;
    - a ruling travels with its work;
    - the two forecast alarms;
    - `Done means (rows):`.
  - Steps 1, 3, 5, 6, 7b and the page format read it.
  - The header carries D4's one-week tool pause.
- **`wrap.md` step 4:** every session files findings through the sort, and `Waiting on PM` goes on a finding only in the D2 cases.
- **`backlog-groomer`:**
  - 13 never proposes `Live harm`, a dark gate, or a QUIET or untagged issue.
  - 16 never adds a `blocks` relation from a parked or LOUD finding.
  - A new step 18, the weekly parked sitting (report only).
  - `guards/groomWriteBoundary.test.ts` pins the new report row.
- **CLAUDE.md** gained the State row change, `Forecast:`, "a ruling travels", the parked **Blocks:** exception and the tool pause. It is netted under the byte ceiling by trimming the per-issue-trail section (136,079 of 136,093 B).
- **Linear:** created the `Live harm` label.

## What the two adversarial passes did

The rule text was the deliverable, so it got the falsification passes. Both failed it, and both were worth it.

**Pass 1** found 11 breaks. The worst one is the one the retro exists for: the Signal's live "improving" defect, filed by an interactive `/wrap` with `Waiting on PM`. Step 1 skipped `Waiting on PM` issues *before* sorting, so the live fix would never have been offered. Others:
- door 3's first-fit let a LOUD-only finding hold an on-path row;
- a key missing from production counted as dark;
- CLAUDE.md's **Blocks:** "set both" rule contradicted door 4.

**Pass 2** confirmed six of those closed and found eight new breaks in the fixes. The worst: production uses `{enabled: true, allowlist: []}` to mean "on for everyone", so "dark when every allowlist is empty" would have gated a fully live feature as dark. Also:
- a "hypothetical" exemption that would park every counterexample-shaped QUIET finding;
- a stopgap ("switch the quieter output off") that could delete the only warning.

The second round of fixes was structural rather than patchwork. Step 1 is now an ordered procedure:
1. The harm read runs first on every finding, team-wide, before covered, skipped or `Waiting on PM` can suppress it.
2. Every filer labels harm `Live harm`, and only the dispatcher's production read can prove it dark and remove the label.
3. Door 3 takes only findings tagged `neither`.

The cap (two passes) was reached, so the version that shipped is the one whose residuals all err loud:
- `unlink` waits for the PM;
- untagged issues since 10-03 are never pruned;
- two dispatchers may both see one team-wide `Live harm` issue.

One stated blind spot remains: an issue with no tag, no relation and no gate label is indistinguishable from asked-for work.

## Decisions

- Dark-gate labels map onto the existing `Gate: clinical` (QUIET, corruption) and `Gate: privacy` (exposure, loss), rather than a new label. This was stated in the plan before the go.
- A page with no `Done means (rows):` line has no path, so nothing on it launches `auto` until the PM fixes Unblock kind *g*. This errs toward asking.

## Residuals and follow-ups

- `operating-kit/dot-claude/commands/dispatch.md` is a templated copy that already drifts from the live file. This PR leaves it, as the retro noted.
- CUL-1872 (PR-C) should carry pass 2's worst three as named tests: the `{enabled: true}` dark read, the `Waiting on PM` skip, and the QUIET-into-door-3 shape.
