# Operating kit: the team, rituals and lessons, extracted for a new project

**Date:** 2026-09-29
**Issue:** CUL-1400 · **Mode:** DISCOVERY (the deliverable is a committed doc set) · **Outcome:** shipped via #976

The PM is starting a new project in a different domain and asked for everything this repo has learned about *how we work* to be extracted so the new project starts at the mature state.

## What shipped
`operating-kit/`, a self-contained, domain-neutral install kit (~45 files):
- **The team:** `docs/personas.template.md` (10 personas with domain slots, routing table, guards as a fourth tier) and five subagents (`adversarial-reviewer`, `code-reviewer`, `security-privacy-reviewer` from `rls-privacy-reviewer`, `expert-cold-read` from `vet-report-cold-read`, `pm-feature-review`).
- **The rituals:** `/kickoff`, `/wrap`, `/handoff`, `/pm-review`, `/dispatch`, `/design-critique` (+ its workflow and renderer), and a new `/retro`.
- **The invariants:** `ai-output-guardrails` (the ten structural patterns of `clinical-guardrails`, domain-neutral), a `product-voice` template, a condensed `backlog-groomer`, and the skill-authoring template.
- **The manual:** `CLAUDE.template.md` at ~20 KB, with the byte ratchet guard to hold it there.
- **The knowledge:** `docs/operating-model.md` (12 laws and the pain behind every ritual), `docs/engineering-lessons.md` (~110 portable laws distilled from C-1…C-44, R-*, P-*), spec / research-brief / mock-round templates.
- **`BOOTSTRAP.md`:** the paste-in prompt, a four-round PM interview that fills every placeholder, the file map, tracker setup and verification.

## Decisions
- **The kit is inert here.** Claude config under `dot-claude/` (nested `.claude/` dirs would surface as scoped skills in Nyx sessions); code files carry `.template` (jest and tsc would otherwise pick them up). Verified: jest lists 0 kit tests; `tsc --noEmit` exit 0.
- **Four of this repo's unsolved problems are fixed in the kit rather than inherited:** `Needs PM` as a workflow state (the label reached 144); the retro trigger computed by the SessionStart hook (the prose trigger fired 0 times); record-only PRs non-draft; tracker close-on-merge rules written down.
- **Laws port, thresholds don't.** BOOTSTRAP tells the new project to tune the numbers (retro every 10, 90-minute check-ins, 14-day claim staleness) at its first retro.

## Method
Three isolated research passes (engineering lessons → portable laws; process history → timeline and laws; design/research methods → templates), then the kit written from them, then an isolated cold read of the kit as a new session in an unrelated domain. The SessionStart hook was exercised in three repo states; a ceiling-parsing bug found there was fixed.

The cold read (posing as an accounting-reconciliation product's first session) returned ~40 findings, all applied in a second commit: a renamed agent still referenced by `/design-critique`; the hook's install line trapped in a comment; an invalid `@<sha>` in CI that the placeholder grep could not see; section references that did not match the manual's headings; a C-number scheme that collided with Tier C; draft-vs-non-draft and 24h-vs-14-day contradictions (now two named thresholds with two jobs); principles enforced before ratification; consumer-mobile assumptions in the principles, voice and QA edge cases (now flagged "rewrite, don't fill"); ~30 placeholders the interview never collected (now a derived/defaulted table); and a day-one vs when-first-needed install split so `/dispatch`, `/design-critique` and the groom preflight are not installed before they have work.

## Residuals
- The hook's retro/manual-budget lines would help this repo too (retro F4 is still prose here). Not applied: out of scope for a kit PR, and CLAUDE.md is at its ceiling. Filed as CUL-1401.
