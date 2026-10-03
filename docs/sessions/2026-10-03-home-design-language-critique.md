# Home design-language critique under design_v2 (CUL-1496)

**Date:** 2026-10-03
**One thing:** P2 L1 — Reversibility: one-way vs two-way doors · check: pending
**One thing (re-ask):** G1 L1 — A commit is a saved snapshot · check: pending

Shipped via #1007. Mode: DISCOVERY.

## What happened

The PM sent a device screenshot of Home on the latest build: *"it just feels like the different sections are speaking a different design language."* A first read in code found the cause. Under `design_v2`, Home is three tracks on one scroll. Design v2 drew the Signal and Today. The Trial screen track (TS-5, CUL-1301) drew the trial door after the v2 mock rounds, which never put a trial strip on Home. Everything sits on the pre-v2 `components/ui/Card`, where the Signal is `elevated` and every other card is bordered.

The PM asked for `/design-critique`. I filed and claimed CUL-1496 at **light** depth: four lenses (Designer; Data Viz with the Data Scientist; Mobile IA; Jordan), one verifier, one synthesis, six agents. The PM added two screenshots (the top of Home, the bottom). A container restart killed the first run during verification. The workflow's resume replayed the four finished lenses from cache and completed the verifier and the synthesis.

**Verdict: NOT READY.** Confirmed: two card surfaces no mock drew, three left text edges, five door glyphs, teal with six or seven meanings, and a trial door denser than the insights above it. Refuted: the trial door's circled well is deliberate (TS-5 drew it), and the serif look question is designed (v4 §01). The doc is `docs/home-design-language-critique-2026-10.md` (🧊).

## The lead's pass

Every claim that became an issue was re-checked in code before filing. Two needed more than code:

- **The extended trial's "56 of 56 days" under "day 69 of 84" (CUL-1498).** The verifier inferred an extension from code. I confirmed it with one read of the PM's own `diet_trials` row (service-role path, scoped by id and owner, C-27): `target_duration_days_initial = 56`, `target_duration_days = 84`, moved 2026-09-18. CUL-1038 froze coverage at the designed window on purpose. The report discloses it (`render.ts:2825`). The app's strip and card do not, beyond the same-day "window now runs to" line.
- **The falling vomiting pair beside prednisone (BRK-1).** This was already filed as CUL-1443, which names the falling-pair case. I carried this live instance there rather than filing a duplicate.

Carried, not refiled: CUL-1443 (BRK-1), CUL-1217 (BRK-3 "since August" over an 8-week count; BRK-5 greedy weeks vs calendar bars; WBC-1). Filed: CUL-1498, CUL-1499 (the timing lane's labels and dots are not at their times), CUL-1500 (the strip's food label; "3 outside" has no noun), CUL-1501 (the refusal door renders last), CUL-1502 (comments + one Patterns label). Device-pass additions went to CUL-1070.

## Decisions

Five briefs were posted on CUL-1496, which carries `Waiting on PM`: G1 card surface and door glyph; G2 the trial door's grammar; G3 what a context card may say beside a safety card (clinical, PM and Dr. Chen); G4 teal (a persona conflict, no recommendation); G6 a fold budget (a better-than-the-rule brief against CUL-1285). Team defaults the PM can veto are in the doc.

**Tracking (PM, this session):** the work lives in Design v2, not a new project, so GA (CUL-1071) cannot ship around it. It is a new milestone, **Step 3b · One Home language**, with a run order in its description. CUL-1496, CUL-1374, CUL-1499, CUL-1500, CUL-1501 and CUL-1502 sit in it. CUL-1500 moved from the trial screen project to make that possible.

## Residuals

- Merging #1007 closes CUL-1496 while its five rulings are open. It is reopened after the merge (Todo, `Waiting on PM`), because the rulings are its remaining work.
- No lens saw a real phone, large Dynamic Type or dark mode. Those checks are on CUL-1070.
- The build issues for G1 to G6 are filed only after the PM rules and a mock round draws the rulings.
