# The /design-critique command: the History v2 critique method, packaged

**Date:** 2026-09-25 (the same session as `2026-09-23-history-v2-critique.md`, after #898 merged) · **Issue:** CUL-1176 · **Mode:** BUILD · **Shipped via #906** (`claude/cool-brahmagupta-qs96p3`)

**PM prompt:** after the History v2 critique, the PM asked whether a design critique skill was worth the time, pointed at projects in development and at work already shipped. The session recommended building it in the same session while the method was fresh, filed CUL-1176 with the plan, and the PM said "Run it".

## What shipped

- **`.claude/commands/design-critique.md`**, the method: when to use it (a mock round, a spec, a shipped surface), the light and full depths with their agent counts, the steps (claim a DISCOVERY issue; name what is settled, overruled and open; render; seat the lenses from the persona routing table with a per-lens focus; run the workflow; the lead's pass of spot-checks, Linear dedupe and decision briefs; the dated critique doc and the filing bar; the offer of a mock round), and the stated limit: a shipped surface is critiqued from screenshots plus code, never a device.
- **`.claude/workflows/design-critique.js`**, CUL-1108's orchestration script generalized: the target, the settled items, the lens roster and the depth are arguments, validated on entry. A library carries nine standing lens mandates (designer, motion, mobile_ia, data, drchen, jordan, sam, tns, eng); the existing subagents seat as lenses through `agentType` rather than being restated. Light depth: the lenses, one verifier across every finding, a synthesis. Full: a verifier per lens (pipelined), a synthesis, a completeness critic, up to six follow-up reads, a final synthesis.
- **`scripts/design-critique/render.mjs`**, the render step: the page at 390 and 1280 wide, every frame with its details opened and named by its caption, every demo pressed on a fresh load, Reduce Motion on and off, a `MANIFEST.md` with the sideways-scroll check and page errors, and the page's text. Playwright stays out of the dependencies.
- **CLAUDE.md:** a Command bullet in the persona / subagent / skill list. Main grew to 136,722 B while this was in flight (#905), so the bullet is paid for by trimming the Subagent bullet's detail, which `docs/personas.md` and the agent files already carry, plus its stale "once Step 9 renders one": 136,700 B, under the 136,728 B ceiling.

**One deviation from the plan:** the plan put it at `.claude/skills/design-critique/SKILL.md`. Here `.claude/skills/` holds auto-loaded invariants and `.claude/commands/` holds on-demand rituals, so it lives beside `/pm-review` and is invoked the same way. Recorded on the issue.

## The dry run

Light depth, four lenses (Designer, Jordan, Data, Engineering) on `docs/culprit-food-library-trial-mockups.html`, the round-1 mock of a track that shipped in August, set against the shipped code with D1 to D11 as the settled list. The render: 32 files, no page errors, no sideways scroll at 390. Six agents, about 75 minutes of wall clock (the container runs two agents at a time; the command now says so).

**The numbers:** 38 findings; the verifier confirmed 35, found 3 plausible, refuted none, and added five things the lenses missed. Every lens returned *ready with conditions*.

**What it found that matters:**

- **The same-day launder (CUL-346, B-702), reached independently by three lenses.** The add sheet's own row, *Earlier feedings: Keep the reading they already have*, is false for a feeding earlier the same day, the one that opened the sheet included; the issue had called the sheet "already careful". The verifier also priced option (b), `allowed_from` = tomorrow: the new row would be invisible until tomorrow, the add would be offered again, and the second insert would collide on the natural key. Both went onto CUL-346 as a comment, since the issue is already filed.
- **The overrun phrase:** the Foods strip and the allowed-set screen print "day 35 of 28" where the card says "Day 35 — 7 days past", and the strip's test pins the wrong phrase. The lead re-read both sites and the test; filed as **CUL-1181**.
- **The rest,** verifier-confirmed but not yet spot-checked by a lead, went into one triage issue, **CUL-1182**, for a finish pass to check and split, per the method's own rule that nothing becomes an issue before the lead reads it in the code. Several were already on the board: CUL-400 (the allowed-set screen spins forever on a failed read), CUL-1005 (one name for the list), CUL-328 (a re-photographed bag under a new name).

**What the dry run taught the command:** plan for the wall clock, not just the tokens; and the verifier's *missed* list earns its place (five catches, among them the iOS back swipe that drops an owner out of the add flow, which no lens walked).

## The collision

Another session claimed CUL-1176 at 22:29Z on `claude/elegant-thompson-uxmpeu`, four minutes before this session's claim, which was posted without re-reading the issue's comments (the session had filed the issue minutes earlier). Found after the context was compacted, surfaced to the PM, who ruled that this session builds it; the other claim had no branch, no PR and no running session, and the issue says so. The lesson is the claim rule's own: read the comments immediately before posting a claim, even on an issue you just filed.

## Persona sign-off

Designer ✓ (the method keeps the seven principles, the Design v2 language and the decision-brief shape in every lens's brief) · Engineer ✓ (managed workflow tooling outside the app; `tsc` clean, the full suite green, 456 suites and 9,848 tests; tests: N/A for the scripts themselves, which are proven by the stub harness, the render run and the dry run) · Data ✓ (the filing bar and the counterexample rule for any count claim are in the command) · Product Owner ✓ (a follow-up for the first real run, the dry run's findings deduped against Linear before filing) · Dr. Chen N/A · adversarial review N/A (no clinical or statistical logic changed; the dry run's clinical finding went to its existing issue for Dr. Chen's ruling).

## Filed

CUL-1179 (the first real run on a shipped screen; the PM picks the screen), CUL-1181 (the overrun phrase), CUL-1182 (the dry run's other findings, to spot-check and split), and a comment on CUL-346.

## PM actions

1. CUL-1179: pick the shipped screen for the first real run (the team recommends the first run: landing, sign-up, pet setup and the empty account).
2. Proposed Tier-2 edit, awaiting approval: `docs/personas.md`, the routing table's design-mock row, names `/design-critique` as its backstop, and the "Current subagents / skills" line gains "Current commands".
