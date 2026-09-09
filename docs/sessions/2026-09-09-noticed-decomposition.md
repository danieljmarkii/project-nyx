# Noticed — ratified, spec v1.1, and the PR-by-PR plan in Linear (CUL-862, continued)

**Date:** 2026-09-09 (the same session as the pre-decomposition review, continued after the PM's ruling)

Shipped via **#816** (draft; the same PR as the review). Mode: **DISCOVERY → planning** (a Tier-2 spec edit the PM ratified, eleven Linear issues, the run order on the project; no app code, no schema). Branch `claude/daily-look-requirements-review-u5ra4x`. Project **Home v2 — the redesign**. Issue **CUL-862**.

## What the PM said

> "let's commit this spec as the path forward. We should then take this spec, break down pr by pr and add those issues to linear so that we can build them sequentially. I'd also love the pr by pr plan added to the linear project so that we can follow it. If anything can be built in parallel.. let's make sure to call that out. If anything needs edge functions deployed.. let's make sure to call that out.. etc. … there are some tasks related to home v2 in the linear project. There may have already even been some committed directly for this 'look' work. But since those were generated prior to converging on final designs like we have here.. let's archive those tasks so that we're only working from the requirements that we aligned on here"

Read as: the review's path is ratified (the errata as spec v1.1; the ten-PR shape), the recommended options on the three open briefs are the working assumption until the PM rules otherwise, and the Home v2 tasks that predate the convergence are retired.

## What shipped

1. **`docs/nyx-daily-look-requirements.md` v1.1.** Every erratum from the review applied inline under a **⚠ v1.1** marker where the text changed (25 markers): the intake door named as a new sheet (E-1); the DDL's `local_day` CHECK removed and the bound moved into the same-pet trigger, now in 023's exact shape (E-2, E-3); the withheld predicate described from the file it lives in and the private helper named (E-4, E-5); the picker exclusion (E-6); the record screens' new branches (E-7); the Today nudge's real predicate (E-8); the overlay precedent and the FAB flag (E-9); the list cap (E-10); five module paths (E-11); five category consumers (E-12); Patterns' engine-computed order (E-13); species Other (E-14); the chief-complaint label for `unknown` (E-15); one router label (E-16); R11's stale text superseded by T-16 (E-17); the right mirror in the walk row (E-18); the migration numbers and "never verbatim" (E-19). **§10 rewritten as the Linear run order** with the issue ids, gates, deploy needs and parallel lanes. A v1.1 line at the head of §12.
2. **Eleven Linear issues on five milestones** in the Home v2 project, each with a plain-English TL;DR, the scope with corrected file paths, an acceptance-criteria block, its gate, its deploy need, the reviews it owes and its lane:

   | Milestone | Issue | PR |
   |---|---|---|
   | Noticed A · Foundation | CUL-866 | N-0 the rollout flag (migration 063) |
   | | CUL-867 | N-1 the schema (migration 064; `rls-privacy-reviewer`) |
   | | CUL-868 | N-2 the mirror and the vocabulary (Dr. Chen signs here) |
   | Noticed B · The record and the door | CUL-869 | N-3 the record: History, the day spine, the record and edit screens |
   | | CUL-870 | N-3b the intake-first meal sheet (gated on CUL-863) |
   | Noticed C · The card | CUL-871 | N-4a the Home card and the write |
   | | CUL-872 | the device pass (the PM) |
   | | CUL-873 | N-4b the today list, receipts, footer, withheld state, the note |
   | Noticed D · Read-back | CUL-874 | N-5 Patterns (gated on CUL-849) |
   | | CUL-875 | N-6 the vet report (an Edge Function change; rides CUL-19) |
   | Noticed E · GA | CUL-876 | GA: flip, then retire |

   `blockedBy` relations carry the sequence: 866 → 867 → 868 → {869, 871, 874, 875}; 870 ← 863; 871 ← {868, 863, 864, 865, 870}; 872 ← 871; 873 ← {871, 869, 872}; 874 ← {868, 849}; 875 ← {868, 865}; 876 ← {872, 873, 874}.
3. **The run order on the project description** (`Home v2 — the redesign`): the table above with gates and deploys, the parallel lanes, what needs a deploy, the assumed rulings, and the retirements.
4. **Retired at the PM's direction:** CUL-811 (the pre-convergence Home v2 spec / plan / flag-strategy issue) cancelled with a comment naming what is not lost; the stale `Waiting on PM` labels on CUL-810 (DC-1…6, D1, D6, DB-3, DB-4 — parked, not ruled) and CUL-829 (DV-1…7 — overtaken by R1–R16, each mapped in the comment) cleared, the records kept. The `archive` action is not exposed by the Linear tool, so CUL-811 is Canceled rather than archived; the PM can archive it from the UI.
5. `CLAUDE.md` v1.35 (the Read-These row to v1.1 + the decomposition; a Version History row; v1.32 moved to `docs/CLAUDE-md-history.md`); `STATUS.md`'s Home v2 row updated (a track boundary moved: Noticed is now the live build track).

## Parallelism and deploys, said once

- **Lane 1 (sequential):** N-0 → N-1 → N-2. Two migrations (063, 064) — never minted from two sessions at once.
- **N-3b** is independent of lane 1 and can start the moment CUL-863 rules (a).
- **After N-2:** N-3, N-4a, N-5 and N-6 are four disjoint lanes (the history/event screens · Home · the dashboard · the Edge Function) and can run as separate sessions. N-4b follows N-4a, N-3 and the device pass. GA follows N-4b, N-5 and the device pass.
- **Deploys:** N-0 and N-1 are live database writes through the Supabase MCP (`apply_migration`; the post-apply checks pasted into each PR). **N-6 is the one Edge Function change** — `generate-report` — and it rides the held CUL-19 redeploy, so it merges inert. GA is a config UPDATE plus a retirement migration. Nothing else touches a function.
- **Collisions by design: none.** `lib/looks.ts` is written in N-2 and only read afterwards; the receipts, coverage, withheld, comparison and pairing modules are each their own file; the two theme tokens land in N-4a only; `app/(tabs)/index.tsx` is N-4a's alone.

## Questions for the PM (none block N-0 → N-2)

1. **The three open briefs are assumed as recommended.** CUL-863 (a) build the intake sheet · CUL-864 (a) today's Home after the medication strip, and no card for species Other · CUL-865 approve both Tier-2 edits. Each issue names where the assumption binds; a different ruling changes N-3b, N-4a or N-6 as the issue says. Rule them on their issues (or say "as recommended" in one line).
2. **Home v2's layout direction.** CUL-811 is cancelled and the briefs on CUL-810 / CUL-829 are parked. If the broader layout redesign (the instrument that expands, Ask on Home, the note row) should resume after Noticed ships, say so and a fresh issue restates the live briefs against the Home Noticed leaves; if Noticed *is* Home v2 for now, nothing more is needed.
3. **GA and Ask.** GA does not wait on Ask learning that looks exist (CUL-845 gate 1, an `ask` change on the held CUL-557 chain). Veto on CUL-845 if you would rather it did.

## Persona sign-off

**Product Owner ✓** — every PR has an issue, every issue an AC block, every deferral a home; the stale labels cleared; the run order on the project. **Dir. of Engineering ✓** — the lanes are disjoint by file; the two migrations are sequenced; the one function change is named with its hold. **Designer ✓ · Data ✓ · Dr. Chen ✓ · T&S ✓** — the errata applied change no ruling; the reviews each PR owes are named on its issue. **QA ✓** — acceptance criteria per issue; the device pass is its own issue with its script. **Adversarial:** N/A (no rule changed; the four passes stand). **tests:** N/A (no code).

## Next Session Kickoff

**Recommended first prompt:**
> Start Noticed N-0 from CUL-866 (claim it, then the `daily_look` seed at migration 063, the client key in `lib/appConfig.ts`, the `BETA_REGISTRY` row; apply via the Supabase MCP and add my uid to the allowlist), then N-1 from CUL-867 in the same session if it fits (migration 064 as corrected in spec v1.1 §5.2 — never the v1.0 DDL; the Migration Safety Pre-flight; the post-apply checks; `rls-privacy-reviewer`). Read `docs/nyx-daily-look-requirements.md` v1.1 §5 and §10 first.

**Alternate prompts:**
- Rule CUL-863, CUL-864 and CUL-865 (and CUL-849) on their issues, then start N-3b from CUL-870 — it is independent of lane 1.
- Rule CUL-848 (the shipped notes field) so N-6's cue and toggle serve both fields.

**Parallel / efficiencies:** N-0 → N-2 in one lane; N-3b alongside once CUL-863 rules; after N-2, four sessions can run at once (N-3, N-4a, N-5, N-6) with no shared files.
