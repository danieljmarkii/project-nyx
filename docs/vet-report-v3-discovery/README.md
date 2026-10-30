# Vet report round 3 (clean slate): the team's working papers

**Date:** 2026-10-30 · **Issue:** [CUL-2275](https://linear.app/projectnyx/issue/CUL-2275) · **Mock:** `docs/culprit-vet-report-v3-mockups.html`

Frozen point-in-time papers from the round 3 discovery. They carry the team's recommendations, so they live here rather than in `docs/research/`, whose briefs are evidence only. The two evidence sweeps are `docs/research/2026-10-vet-report-competitor-teardown.md` and `docs/research/2026-10-vet-report-analog-reports.md`. Decisions are made on the issue, never in these files.

| Paper | Lens | What it holds |
|---|---|---|
| `v1-rules-audit.md` | Dir. of Engineering + Designer | Every design, scope and format rule with its date and what it protected; eight better than the rule briefs; what "too clinical" is in `render.ts`; the safety floor |
| `design-language.md` | Information design consultant | The app's design DNA, the gap in the report, the translation to paper, three page 1 directions, patterns to steal |
| `ai-options.md` | AI product architect | Six AI summary architectures with real examples and hazard analysis; the AI-readable report; questions; a risk register |
| `flow-and-features.md` | Designer + Product Owner | Today's flow from the button with file:line; three IAs; the supporting features catalogue; the v1/v2 toggle |
| `panel/dr-chen.md` | Veterinarian (GP) | The 60 second read of today's renders |
| `panel/skeptic-and-criticalist.md` | Skeptical GP, emergency criticalist | Discard triggers; the worst plausible AI summary and the guardrail that stops it |
| `panel/tech-and-clinic-ai.md` | Vet tech, clinic AI vendor PM | How the PDF is filed, emailed and machine read; predicted summarizer output |
| `panel/owners.md` | Jordan, Sam | Today's flow walked; the dream flow; saved reports, links, AI, questions, deleted entries |
| `panel/data-and-ts.md` | Data Scientist, Trust & Safety | Visual encodings that break the numbers; a guardrail they would sign; saved reports, links, consent |

Every panel reader is a simulated persona and read browser renders of `main` at `18c86dc7` (fixtures, not live data). Paths marked "(session scratchpad)" point at session-local renders that were not committed; the fixtures and the harness method are reproducible from `docs/research/2026-10-vet-report-guardrail-map.md` Appendix A.
