# Backlog → Linear: operationalize the cutover (CUL-515…521)

**Date:** 2026-08-16

Executed the Linear project **[Backlog → Linear: operationalize the cutover](https://linear.app/projectnyx/project/backlog-linear-operationalize-the-cutover-ad7ca873aa78)** — all seven issues in one branch, **shipped via #664** (draft). Pure process/meta: no app code, no schema, no build-phase change.

## Why

`docs/backlog.md` (487 rows) was migrated to Linear via #663, but the *workflow* never moved. CLAUDE.md, `/wrap`, `/kickoff`, the `backlog-groomer` skill, and the Product Owner persona all still told sessions to read and write the frozen markdown file — so new `B-NNN` rows kept getting appended to it (B-768…B-788 on migration day itself), recreating the dual-source-of-truth the migration had just eliminated. This session rewired the muscle memory, wired merge→Linear status, and wrote down the docs source-of-truth rule.

## What shipped (per issue)

- **CUL-515** — reconciled CLAUDE.md to "migration complete." Killed the stale "only 47 `Now` rows migrated; `Next`/`Later` authoritative in `docs/backlog.md`" claim in the Backlog Protocol intro and `view backlog`. Marked the Read-These row 🧊 frozen. Caught two stale present-tense claims the issue didn't name: the **roster one-liner** and the **version-history preamble** ("single home for deferred items"). Grep-verified no live write-path to `docs/backlog.md` survives.
- **CUL-519** — added the **"Merge → Linear status"** rule to CLAUDE.md § Git Workflow (reference `CUL-NNN` in every PR title/body; the `claude/<slug>`-branch gap; the `/wrap` backstop; no custom GitHub Action) + a `CUL-NNN` line to "PR descriptions must include." Done before CUL-516 because the `/wrap` "confirm PR linked" step depends on it.
- **CUL-516** — rewrote `/wrap` Step 4 to reconcile the touched **Linear issues** (set status, post an outcome comment, confirm the PR is linked). **Deleted the entire duplicate-`B-ID` machinery** (the `grep … uniq -d` check, first-lands-keeps renumber, cross-reference-by-attribution) — server-assigned `CUL-NNN` IDs can't collide. Kept STATUS.md discipline + one-PR-per-session.
- **CUL-517** — rewrote `/kickoff` Step 2 to **query Linear** (`list_issues` — in-flight / phase-relevant / high-priority) instead of grepping the frozen file. Kept the STATUS.md + recent-`docs/sessions/` reads. Updated the frontmatter description + the CLAUDE.md `/kickoff` shortcut line.
- **CUL-518** — **rewrote (not retired)** `backlog-groomer` as Linear hygiene; kept it a skill (substantive after dropping all row/ID mechanics), which preserves the "PO is the lens, the skill is the procedure" references. Re-pointed the PO persona, the retro state-file check (#4), `pm-feature-review`'s "Backlog candidates" bucket, and `/pm-review`'s file-the-tail step from `docs/backlog.md` to Linear.
- **CUL-520** — codified the per-issue trail as a new **"Working the issues in Linear"** subsection in CLAUDE.md (scope change → description patch; decisions/conflicts/findings → comment; new scope → new issue; light attribution; `docs/sessions/` stays the cross-issue narrative) + a pointer from the personas.md Conflict Protocol.
- **CUL-521** — wrote the **read-path → git; work-path → Linear** rule + its test into CLAUDE.md § Documentation Update Protocol; formalized "link the canonical spec as a Linear project Resource, repo wins on divergence"; clarified only `docs/backlog.md` is deprecated. Fixed the state-file-hygiene paragraph that still called the frozen file "working state," and the intro's "log-it-for-the-future → `docs/backlog.md`" pointer.

## Files touched

`CLAUDE.md`, `docs/personas.md`, `.claude/commands/wrap.md`, `.claude/commands/kickoff.md`, `.claude/commands/pm-review.md`, `.claude/skills/backlog-groomer/SKILL.md`, `.claude/agents/pm-feature-review.md`. (`docs/backlog.md` left untouched — it already carries an authoritative frozen banner from #663, and editing a frozen historical record would contradict the principle this session codified.)

## Dogfooding the new conventions

This PR is the first to run the workflow it establishes. Observed live: PR #664's body reference (`Closes CUL-515…521`) **auto-linked all seven issues** (each shows #664 as an attachment) — but the native integration left them at `In Progress` rather than advancing, so the CUL-516/CUL-519 **`/wrap` backstop** set them to `In Review` explicitly. That is exactly the `claude/*`-branch case CUL-519 describes, confirmed rather than assumed. Each issue also carries an attributed **outcome comment** (the CUL-520 per-issue trail), and this file is the CUL-520 cross-issue narrative.

## Verification

- CI green on #664 — `App (typecheck + jest)`, `App (jest, non-UTC timezones)`, `Edge Functions (deno test)` all ✓ (docs-only change; no code path affected).
- `grep -rn "docs/backlog.md" CLAUDE.md .claude docs/personas.md` — every surviving hit is a frozen/historical reference or a "file in Linear instead" instruction; no live write-path remains.

## PM action

- **Confirm the Linear↔GitHub integration config** (PR opened → In Progress, merged → Done) so the merge→status convention fires end-to-end. Low-stakes — the auto-link half is already proven this session; the merge→Done half proves out when #664 merges. Recorded on CUL-519.

## Residuals (out of scope this session — tracked in the Linear project)

From #663, still open in the project: the Legacy Backlog subsystem-split, the priority-mapping spot-check, and 10 malformed rows unmigrated (B-128, B-137, B-218, B-267, B-351, B-441, B-466, B-555, B-616, B-618).
