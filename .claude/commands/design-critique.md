---
description: Run the house design critique on one surface (a mock round, a spec, or a shipped screen). Isolated persona lenses read the same rendered pixels, a verifier tries to refute every finding, and the survivors come back as a QA-note critique plus decision briefs. Light or full depth.
---

# /design-critique: the house critique, on any surface

The method behind CUL-1060, CUL-1076 and CUL-1108, packaged (CUL-1176). CUL-1108 ran it at full depth on the History v2 round-3 mock: nine isolated lenses, a verifier each, a synthesis, a completeness critic, six follow-ups, a final synthesis (27 agents). 118 findings confirmed, 12 plausible, 13 mock artifacts, 2 refuted; eleven decision briefs for the PM and eleven defects filed against shipped code, all before a line of the feature was built.

What makes it work, and what this command locks in:

1. **Every lens reads the same pixels.** Render first; the renders are the primary evidence for anything visual.
2. **Every lens reads in isolation.** It carries the settled rulings, and challenges one only with evidence the ruling could not have had (a better-than-the-rule brief).
3. **Every finding faces a verifier** whose job is to refute it.
4. **The output is decisions,** not a list: briefs with a recommendation, team defaults the PM can veto. Only verified defects become issues.
5. **It feeds the next step,** usually a mock round that draws the recommendations.

## When to use it

| Target | `kind` | Typical moment |
|---|---|---|
| A mock round (`docs/culprit-*-mockups.html`) | `mock` | before the requirements are written from it |
| A requirements spec (`docs/nyx-*-requirements.md`) | `spec` | before the build issues are cut |
| A shipped surface: its screen and component files, plus the PM's screenshots | `shipped` | to improve what ships, or a finish pass before GA |

Not for a code diff (`/code-review`, `code-reviewer`), a statistics check (`adversarial-reviewer`), an access-control check (`rls-privacy-reviewer`), or a quick product read of a built feature with no decisions to make (`/pm-review`).

## Depth

| | light | full |
|---|---|---|
| Lenses | about four, picked for the surface | the routing table's lenses for the surface, usually eight or nine |
| Verify | one verifier across every finding | one verifier per lens |
| After the synthesis | stop | a completeness critic, up to six follow-up reads, a final synthesis |
| Agents | lenses + 2 (six for four lenses) | 2 × lenses + 3 to 9 (CUL-1108: 27) |
| Use for | a small surface, a second opinion, a finish pass | a mock round before requirements, anything the PM will rule on |

Default to full for a mock round or a spec headed to build, light otherwise. Name the depth and why in the claim comment: a full run is a deliberate spend. A workflow runs at most CPUs − 2 agents at once (two on a 4-core cloud container), so the lenses read in waves; plan for the wall clock as well as the tokens.

## Steps

0. **Claim a DISCOVERY issue** (CLAUDE.md § Starting from a Linear issue); file one if none exists. The deliverable is a critique and decision briefs, never code and never a redraw.

1. **Scope.** Name the target (files, the artifact URL, the PM's screenshots), the `kind`, and the `next_step` the critique feeds (for example "the v1.0 requirements"). Then read what is settled (the mock's own rulings section, the spec's §0, the issue's comments, newest wins) and write three lists:
   - `settled`: the PM's rulings, which every lens carries;
   - `overruled`: dissents already recorded, so no lens re-raises them as new;
   - `open`: items the critique must carry, saying what the next step needs about each.

2. **Render,** so every lens critiques the same pixels.
   - **Mock:** `node scripts/design-critique/render.mjs <mock.html> <scratch>/renders`. It shoots the whole page at 390 and 1280 wide, every frame with its `<details>` open, every demo pressed on a fresh load, Reduce Motion on and off, and writes `MANIFEST.md` plus the page's text (`page.txt`). Pass `--frames` or `--buttons` when the page does not use the `.phone` / `.frame` classes. Then look at the shots yourself and add bespoke ones for the states the defaults miss (CUL-1108 needed a long list scrolled one viewport at a time); list each in the manifest.
   - **Spec:** render any mock it cites; the text is the artifact.
   - **Shipped:** the live app cannot be rendered here. Ask the PM for screenshots of every state that matters (the golden path, empty, loading, a failed read, a long record, multi-pet, dark mode, the largest Dynamic Type, Reduce Motion), put them in one folder with a `MANIFEST.md` naming each, and list the screen and component files as `artifact.code`. **The critique is only as good as those screenshots; the critique doc says so.**

3. **Seat the lenses** from `docs/personas.md` § Persona Routing Table for the surface, and write each lens a `focus`: what to try to break on this surface, concretely (the frames, the counts, the states, the shipped predicate it must match). The workflow's library carries the standing mandates for `designer`, `motion`, `mobile_ia`, `data`, `drchen`, `jordan`, `sam`, `tns` and `eng`; any other lens passes its own `name`, `code` and `mandate`.
   Where the routing table names a subagent, seat it **as** the lens with `agentType`, never beside it and never restated:
   - `tns` with `agentType: 'rls-privacy-reviewer'` on a surface that widens who can read the record (links, sharing, export, photos);
   - `drchen` with `agentType: 'vet-report-cold-read'` on a rendered vet report (hand it renders only; its value is not knowing the code);
   - `jordan` or `sam` with `agentType: 'pm-feature-review'` on a shipped feature's flows;
   - `data` with `agentType: 'adversarial-reviewer'` where the surface states a clinical or statistical claim.

4. **Run the workflow.** It is the orchestration; this file is the method.

   ```js
   Workflow({ scriptPath: '.claude/workflows/design-critique.js', args: {
     issue: 'CUL-NNNN',
     title: 'the History v2 round-3 proposal',
     kind: 'mock',                          // mock | spec | shipped
     depth: 'full',                         // light | full
     next_step: 'the v1.0 requirements',    // what the critique gates
     scratch: '<scratchpad>/critique',      // each lens writes only under here
     artifact: {
       sources: ['docs/culprit-history-v2-mockups.html'],   // what the design intends
       renders: '<scratchpad>/critique/renders',            // holds MANIFEST.md and the PNGs
       text: '<scratchpad>/critique/renders/page.txt',      // optional
       code: ['app/(tabs)/history.tsx', 'lib/dayNodes.ts'], // shipped code to compare against
       notes: 'optional: anything every lens must know',
     },
     settled: ['...'], overruled: ['...'], open: ['...'],
     exclude: ['CUL-NNNN comments', 'docs/sessions/<the round record>.md'],   // deliberation a lens reads only after its findings
     standards: ['docs/nyx-<surface>-requirements.md §1'],                   // on top of the principles, Design v2, C-rules, personas
     lenses: [
       { key: 'designer', focus: '...' },
       { key: 'tns', agentType: 'rls-privacy-reviewer', focus: '...' },
       { key: 'a11y', name: 'Accessibility', code: 'A11Y', mandate: '...', focus: '...' },
     ],
   } })
   ```

   It returns `final` (the synthesis: overall and per-lens verdicts, the items in the taxonomy, conflicts, `gating_changes` with brief fields, carried open items, what held, what was refuted or a mock artifact), plus `merged` (every finding with its verification), `missed`, `dropped_lenses`, and at full depth `critic` and `followups`. The run's journal keeps every agent's return.

5. **The lead's pass.** Nothing leaves the session before it.
   - Spot-check in the code every claim that will become an issue, and every load-bearing claim about shipped code.
   - Dedupe against Linear: search for issues filed on this surface since the artifact was drawn (other sessions file in parallel, and the lenses cannot see them). A finding already filed is carried, not refiled; an issue that changes a finding's framing is set beside it.
   - Curate `gating_changes` into decision briefs (CLAUDE.md § Presenting decisions to the PM): deciding, options with the recommendation marked, consequence. Move small calls to team defaults the PM can veto. A genuine persona conflict stays in the Conflict Protocol shape, never resolved silently.
   - Audit the run: `git status` shows no repo change the lead did not make, and the issue carries no comment the lead did not write.

6. **Write it down.**
   - A dated 🧊 review, `docs/<surface>-critique-<yyyy-mm>.md` (CUL-1108's is `docs/history-v2-round3-critique-2026-09.md`): the verdict by lens, the briefs, the team defaults, the rules the next step carries without a ruling, the sequencing, the carried items, the full critique in the taxonomy, what held, what was refuted, and the method (lenses, depth, agent count, the renders and their page errors). The next step's spec cites it as evidence.
   - The briefs, posted on the issue.
   - **The filing bar:** a finding becomes a Linear issue only when a verifier CONFIRMED it (or the lead reproduced it) **and** it is a defect in shipped code or a gate on the next step. Everything else lives in the doc.

7. **Offer the next step:** a mock round that draws the recommendations as current frames with the open alternatives beside them (CLAUDE.md § Mock what you change; a reaction round republishes as one proposal).

## Rules

- A clinical, statistical or count claim carries the concrete record shape that breaks it. A finding without one has not been reviewed.
- The agents read the repo and Linear and write only to the scratch folder. The lead writes every repo file and every Linear post.
- No silent caps: the workflow logs a lens that returned nothing and any critic gaps past six; the doc repeats them.
- A shipped surface is critiqued from screenshots and code, never from a device. Name every finding that needs a device to confirm, and hand those to the device pass.

$ARGUMENTS
