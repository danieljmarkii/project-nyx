# 2026-10-12 · CLAUDE.md split by when it is needed (CUL-1874, retro 4 D5)

**Date:** 2026-10-12
**One thing:** D4 L1 — A ratchet only moves down, and its own check must be measured against the repo, not against itself · check: pending

**Outcome:** shipped via #1198. Mode BUILD, plan-gated; the PM typed `Go` on the posted plan.

## What changed
- **CLAUDE.md 136,073 B → 49,068 B** (596 → 392 lines). It keeps the always-on core: status, product, personas and protocol, the nine principles, hard constraints, the safety invariants, general conventions, Git workflow, the launch ritual, decision briefs, the DoD, the Tier rules, the backlog rules, and an index of the rule files.
- **Nine path-scoped rule files** in `.claude/rules/` (ui, copy, counts-and-claims, data-and-sync, edge-functions, migrations, guards-and-tests, widgets, docs). All 57 convention bullets moved verbatim with their C-numbers and guards. No guard changed, so every guarded convention still fails CI.
- **Read-These** went to one line per row (23.6 KB → 5.4 KB). The diet-trial row keeps its two never-rules inline.
- **Moved:** Open Questions → `docs/open-questions.md`; the Secrets Register → `docs/secrets-register.md`; the Dev Handoff rules → `docs/dev-handoff-runbook.md`; the Session Summary and Next Session Kickoff formats → `wrap.md` § Formats. Pointers re-aimed in `/kickoff`, `/wrap`, `/pm-review`, `pm-coach`, the groomer, `supabase-sync`, `STATUS.md`, and the dispatch hotspot list.
- **Dispatched rows** skip the every-session reads (launch ritual step 1).
- **Tier 1** now spans CLAUDE.md plus the rule files (it replaces the 2026-09-12 rule).
- **`guards/claudeMdBudget.test.ts`:** the core ceiling is 49,068 B. A second two-way ratchet caps CLAUDE.md + every `.claude/**/*.md` + the three moved docs at 469,080 B. The same set weighed 475,109 B before the split and 466,421 B after it; #1197, merged in, added 2,659 B before this ratchet existed. A rule-index check requires every rule file to be named in § Code Conventions, every name to exist, and every file to carry `paths:`.

## Verification
- Path scoping works on the installed CLI (2.1.296). Scratch repo: a rule loaded when `src/a.ts` was read and stayed out for `other/b.ts`. On the real repo in headless sessions: `components/ui/ChipGroup.tsx` loaded `ui.md` + `counts-and-claims.md`; the newest migration loaded `migrations.md`; `guards/haptics.test.ts` loaded `guards-and-tests.md`; `package.json` loaded none.
- Guard mutations, each red then restored: an unindexed rule file; a rule with its `paths:` stripped; +6 KB in `dispatch.md`; the walk narrowed to `.claude/rules`; an 11 KB trim with a stale ceiling.
- Loss check: every substantive line of the old CLAUDE.md is present in the new set, except the intentional rewrites (Read-These rows, retargeted pointers, the Tier 1 sentence).
- `tsc --noEmit` clean; `jest guards scripts` 76 suites, 1,635 tests green.

## Residuals
- A session that reads no code file never sees a surface rule. The index names each file so a review or planning session can read it by hand. This is the D5 risk the PM accepted.
- `operating-kit/` still has the old shape: CUL-1881 (Backlog).
- Subagents: not tested whether path rules load inside a subagent's own reads. `code-reviewer` and `rls-privacy-reviewer` keep CLAUDE.md, which now points at the rule files.
