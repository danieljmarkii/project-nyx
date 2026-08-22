# STATUS.md → a pointer card; the state moved to Linear (CUL-563)

**Date:** 2026-08-22 · shipped via #695
**Session type:** process / hygiene. Deliverable = a rewritten `STATUS.md`, 17 new Linear issues, 5 fold-in comments, and the workflow rewiring that keeps the file from regrowing. No app code, no schema, no build-phase change.
**Lenses:** Product Owner / Backlog Steward (primary) · Dir. of Engineering (the deploy-ordering constraints) · Trust & Safety (the privacy items) · Sr. QA Associate (the device-QA fold-in).
**Advances:** CUL-563 (scope expanded in-session, per the Backlog Protocol).

---

## The question

> "When kicking off a session you still check STATUS.md. We've moved to Linear. Should you be checking Linear instead? I believe STATUS.md is bloated and needs pruned, and w the workflows that touch it in the linear world we live in now."

Three questions, and the answer to all three is yes — with the third being the one that matters, because the first two are symptoms of it.

## What was measured

| | |
|---|---|
| `STATUS.md` size | **239 KB / 32,748 words / 487 lines** — against its own self-declared ~200-line budget |
| `## Parallel Tracks` | **146 KB — 61% of the file.** 25 track sections; ~14 read as fully shipped |
| `## Open PM Action Items` | **62 KB, 102 open items, 0 checked** |
| `## Blocking Open Questions` | 16 KB, and mostly *closed* questions — a narrative of the diet-trial track's history |
| `## Current Phase` | 11 KB, led by a build table for PRs #72–#75 (shipped in June) |
| `## Runtime in Use` | 2 KB — stable facts, not volatile state |
| `## Recent Sessions` | 491 B — already just a pointer to `docs/sessions/` |

Two independent confirmations that the file had stopped tracking reality, both pre-dating this session:

- The **2026-08-20 backlog reconciliation** flagged it in passing: *"STATUS.md's `## Current Phase` header still says Step 10 — AI Signal — months stale"*, and separately that **Ask is not a live track** despite the file calling it "⭐ THE NEXT MAIN PROJECT".
- **CUL-563** had already been filed for exactly this ("orientation docs mislead at session start"), scoped as a pruning/reframe pass. The PM's question expanded it to the migration + rewiring.

## The finding that shaped the fix

`STATUS.md` was pruned once already — **210 KB → 86 KB at the 2026-07-19 workflow retro**, which instituted a ~200-line budget and gave `/wrap` "prune while you prepend" teeth. It regrew past its *starting* size in five weeks.

So the diagnosis is not "the file needs pruning". It is:

> **A size budget without a structural fix only buys time.** The structure was that `/wrap` step 3b told every session to write its state here. A file that six-plus parallel sessions each append to can only grow — and is, by construction, also the repo's worst merge-conflict surface. v1.27 had already solved the *session-list* half of this the right way: not by pruning the list, but by **removing the shared write** (one file per session in `docs/sessions/`). This session applies the same move to everything else the file held.

## What was decided

**Linear is the state; `STATUS.md` is the routing.** Section by section, against the read-path→git / work-path→Linear rule (CUL-521):

| Section | Verdict | Where it went |
|---|---|---|
| Parallel Tracks | **Delete** — Linear projects already carry status + summary per track, and the copy here was the stale one | `list_projects` |
| Open PM Action Items | **Migrate** — Linear already had the mechanism (the `Waiting on PM` label, created 2026-08-20, 10 issues) and this was a second, drifting copy of it | Linear issues |
| Blocking Open Questions | **Delete** — a third copy of rows CLAUDE.md § Open Questions owns, wrapped in shipped-work narrative | CLAUDE.md + `docs/sessions/` |
| Current Phase | **Keep, cut to a table** — Linear has no home for "which build step are we on" | `STATUS.md` |
| Runtime in Use | **Move** — stable, and only ever read while emitting a handoff | `docs/dev-handoff-runbook.md` § Current build state |
| Recent Sessions | **Keep** — already a pointer | `STATUS.md` |

`STATUS.md` survives rather than being deleted outright for two reasons: Linear has nowhere to put the Build-Sequence phase, and a routing table is what stops the next session from writing its state into the wrong place. It is now **61 lines**.

## The PM-item migration — triaged, not bulk-migrated

Filing 102 issues would have *damaged* the board the 2026-08-20 pass had just cleaned. Each item was instead matched against the full Linear inventory (CUL-1…CUL-580, pulled in three pages):

- **~55 already had a live `CUL` issue.** Nothing filed; several folded in as comments.
- **~20 were verifiably done or already archived** — e.g. "revoke the `nyx-cli-deploy` PAT" (CLAUDE.md's own Secrets Register records it revoked), "redeploy `generate-signal` to un-gate detector ⑦" (live is v32), the #213/#255/#257/#361/#362 device-QA items (all June PRs, long merged), B-074 and B-163 (both `Canceled`-as-archived on 2026-08-20).
- **17 were genuinely live with no Linear home** → **CUL-582 … CUL-598**, all on the `Waiting on PM` label.
- **The remainder folded as comments** onto the issues that own them: CUL-19, CUL-64, CUL-369, CUL-556, CUL-557.

### What the triage found that nobody was tracking

1. **Migration 052 was authored and never applied.** `052_backfill_occurred_at_confidence.sql` (PR #565) sits on disk; the live history runs 047 → 048 → 049 → 050 → 051 → **053**. 146 live meal rows still carry a NULL `occurred_at_confidence`. → **CUL-582**. Verified against `list_migrations`, not inferred.
2. **Two rows the backlog→Linear migration dropped** — **B-080** (diet-structure observation placement; blocks descriptive Phase 3) and **B-128(b)** (the at-rest `photo_paths` guard, a latent cross-tenant *delete* primitive). Both confirmed absent from Linear; B-128 is named in CUL-522's own malformed-row list. → **CUL-596**, **CUL-597**, and evidence for CUL-522.
3. **The Dr. Chen sitting had no issue.** The reconciliation called it "the single highest-leverage decision on the board" and routed it to the PM in a report section; it was never filed. Ten issues converge on it. → **CUL-583** (Urgent).
4. **The real-vet R1 gate had no issue** — carried as a STATUS.md bullet since 2026-07-02, and it gates the irreversible public-share path. → **CUL-598**.
5. **Six Tier-2 doc edits** were waiting on one word each, invisible to the board. → **CUL-585**.

Two load-bearing safety constraints were preserved as comments rather than as prose in a file nobody reads: the **A8 deploy ordering** (`analyze-vomit` → `analyze-stool` → `ask`; reversing it opens an AC-13 window where a live read sends a raw un-stripped original) on CUL-557, and the **PR-6 build-cut hold** (shipping B-417 PR 6 to a device before the `generate-report` redeploy makes completing a trial delete it from the report) on CUL-19.

## The rewiring — why it cannot regrow

The prune is the visible half; this is the half that lasts.

- **`/kickoff`** now queries Linear **first** (projects → in-flight → `Waiting on PM` → Urgent/High Todo), reads `STATUS.md` for routing only, and scopes queries by project so a phase-wide sweep doesn't bury the answer. Its doc-drift check was re-pointed at the failure it actually catches.
- **`/wrap` step 3b** now opens *"usually you change nothing"* and lists the **four** conditions that justify an edit (a track started or ended · a standing hold changed · the Build-Sequence phase moved · a pointer is wrong). It names the five things never to re-add, and states the rule directly: *if you are about to add a paragraph describing this session's work, that paragraph is in the wrong file.*
- **`/wrap` step 4** gains a rule with teeth: **every PM action is filed as an issue, not written as prose** — `Waiting on PM`, the remaining step as its first line — and the Session Summary lists `CUL-NNN` links instead of a second checklist.
- **CLAUDE.md** § Status rewritten (it still opened with "Step 10 — AI Signal"); the Session-Summary template's PM Action Items block now routes to Linear; the DoD line requires it; the Secrets Register's ✗ path files an issue.
- **The state-file-hygiene rule** (§ Documentation Update Protocol) and the **retro's check #4** were narrowed: `STATUS.md` is out of both, because nothing writes to it any more. The 239 KB regrowth is recorded there as the evidence that a budget alone doesn't hold.

## One drive-by fix, in scope

CLAUDE.md's Runtime A quick-reference told the PM to run **`eas update --branch preview`**. The channel is `production`; `preview` is `distribution: internal` and can never be store-submitted. The `STATUS.md` section being moved in this session carried a trap warning about that exact mistake ("cost a session"), two screens away from the line making it. Corrected, and both traps now sit in the runbook beside the commands.

## Definition of Done

- **Acceptance criteria** — N/A: process/meta session, no build step advanced.
- **Anti-patterns** — none introduced; docs only.
- **Types / lint** — N/A: no source file touched (`.md` only).
- **Automated tests** — `tests: N/A — no store, Edge Function, or `lib/` utility in the diff.` Engineer persona signs off: the diff is documentation and workflow prompts.
- **Secrets Register** — no new secret; its ✗ path was re-pointed at Linear.
- **Persona sign-off** — Product Owner ✓ (triage: nothing deleted without a Linear home or a verified done-state) · Dir. of Eng ✓ (the two deploy-ordering constraints survived the move, with their mechanisms intact) · Trust & Safety ✓ (CUL-588/593/594/597 preserve the four unverifiable checks, the keychain-tier call, the pet-photo posture and the at-rest guard) · QA ✓ (device checks consolidated into CUL-556's script; the stale ones named so they aren't re-added) · Designer N/A · Dr. Chen N/A.
- **Adversarial review** — N/A (no clinically or statistically load-bearing logic). The equivalent discipline was applied to the *deletions*: every claim of "already covered" was checked against the live Linear inventory, and every claim of "already done" against the migration history, the merge ledger, or the Secrets Register — which is how the unapplied migration 052 and the two dropped rows surfaced instead of being deleted with the rest.
- **Future-self review** — *would I want this in 12 months?* Yes, and the test is specific: the file only stays short if `/wrap` keeps step 3b's four conditions. If a future session finds `STATUS.md` growing again, the fix is not to prune it — it is to find the write that was re-introduced.

## Residuals

- **CUL-522** (dual-source bleed) gains two confirmed instances; it is still open and still the right place for a systematic sweep.
- **CUL-584** collects the five holds the archive pass deliberately left unruled.
- `docs/backlog.md` is untouched — frozen, and read only to recover a ported row's history (which is exactly how B-080 and B-128 were recovered here).
