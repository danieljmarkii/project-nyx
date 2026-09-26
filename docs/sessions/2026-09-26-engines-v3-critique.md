# Engines v3: a design critique of the proposal before the greenlight

**Date:** 2026-09-26 · **Issue:** CUL-1268 · **Mode:** DISCOVERY · **Branch:** `claude/beautiful-lovelace-9axaj7` · **Artifact:** `docs/engines-v3-critique-2026-09.md`

**PM prompt:** "We've recently worked on a project to improve the signals engine … Engines v3: the accountable engine. I'm impressed w what I've seen so far. But I'd like a /design-critique session run on it before we do anything else." Asked light or full, the PM chose full (seven lenses).

## What ran

`/design-critique` at full depth on the Engines v3 proposal as a `spec`: the brief (`docs/research/2026-09-engines-step-change.md`), a snapshot of the Linear build plan taken so every lens read the same words (the project description, CUL-1146's D1 to D8, EN-F and EN-0 to EN-15, CUL-1118, CUL-1190, CUL-1195, CUL-1196), and the strategy page rendered as secondary evidence (identical to its published artifact). Seven isolated lenses: Dr. Chen; the Data Scientist seated as the `adversarial-reviewer`; the Designer; Sam; Jordan; Trust & Safety seated as the `rls-privacy-reviewer`; Engineering with QA. A verifier each, a synthesis, a completeness critic, six follow-ups (cough and vomiting, Ask, the rule-change seam, the model's own escalation, accessibility, the episode latch), a final synthesis: 23 agents, no errors, about 10.2 million subagent tokens, 5 hours 24 minutes at two agents in flight.

123 lens findings: 118 confirmed, 4 plausible, 1 refuted. The synthesis produced 71 items (12 broken, 4 works-but-confusing, 33 design gaps, 9 missing follow-ups, 13 PM decisions), 10 of them defects in shipped code. Every lens and follow-up returned *ready with conditions*.

## What it found

- **The direction holds;** every headline figure in the brief reproduces.
- **The first builds are not buildable as written.** EN-F's flag-off guard has no committed input until Phase 1, misses `generate-report` (which re-runs `detectSignals` itself), stamps nothing, and cites a clinical-guardrails rule that does not exist (Pattern 7 says the opposite). A server flag cannot protect installed builds: a new verdict renders blank on the record and as "Worth a call" elsewhere. EN-0's re-anchored intake window can only remove the warning, for a cat that ate, vomited, then stopped eating.
- **D3 rests on a record the app never keeps** (Worth raising is re-derived at render, and AC 10 bars visits from engine inputs); **D4 has no estimand;** **D7's "the vets" is the Dr. Chen persona's ruling sheet** (CUL-583's 9/23 correction); the plan draws the Home Design v2 is replacing, while the PM's own 9/26 device reaction (CUL-1270, filed by another session during the run) calls today's Signal on Home "SO text heavy".
- **Shipped defects:** every first weigh-in destroys the only earlier weight (how June's 4.4 kg vanished); Ask's validator passes "under control" and "the prednisone is helping"; the chronicity ask softens while the count holds; the fold re-opens with false reasons; the report prints the rated-meal count as meals fed; completion cards are silent to VoiceOver on iOS; the replay passes its fidelity check over an empty export.

## The lead's pass

`main` did not move during the run (`ffacb4e` at both ends). Reproduced by running: Ask's validator on seven sentences; the Engineering lens's null sweep on the shipped engine (68 of 100 synthetic healthy cats saw a worsening safety card in 180 evenings, 93 a food culprit card); the adjacency leader swapping 7 times in 54 co-chronic evenings; the chronicity softening on 6/16 to 6/23; 4 of 14 worsening evenings at 2 against 0; 2026-09-23 a Wednesday. Every other claim filed or cited in a brief was read at file:line. Deduplicated against every issue filed on these surfaces since 9/24, including two filed during the run. Audit: no repository change and no Linear comment by any agent.

## What shipped (this PR)

- `docs/engines-v3-critique-2026-09.md` (🧊): TL;DR, the verdict by lens, six briefs (E-1 D8 restated; E-2 D3 restated; E-3 D3's timer, a persona conflict; E-4 D4 restated; E-5 D5, recommend B; E-6 how thresholds get ratified), five narrower rulings, five team defaults, five rules, sequencing, the carried items, what the lead verified, the full taxonomy, what held, what was refuted, the device checklist, the method.
- `docs/research/2026-09-engines-step-change.md`: an additive §V (R4's "two against zero" held on 4 of 14 evenings; the replay ledger predates HV-2 with no engine commit) with ⚠ pointers at both claims; `docs/research/README.md`'s row notes it.

## Linear

- **Filed:** CUL-1271 (Ask's screens), CUL-1272 (the chronicity ask softens), CUL-1273 (the fold's false re-open reasons), CUL-1274 (the report's meal count), CUL-1275 (VoiceOver after a save), CUL-1276 (the replay's vacuous pass), CUL-1277 (before the 1.2.0 cut, an installed build handles an unknown verdict).
- **Carried, with comments:** CUL-1203, CUL-694 (raised to High), CUL-534, CUL-271, CUL-583.
- **Briefs:** posted on CUL-1268, with a pointer on CUL-1146; each EN issue the critique amends carries a comment naming its items.

## Next

The PM rules E-1 to E-6 on CUL-1268 (or vetoes a team default). The team defaults' four live fixes (TD-1) and the other filed defects can start at once, whatever the rulings. The offered next step is a mock round: the strategy page republished as the rules would render it (the ledger of what was ruled in place of the stale decisions grid, the Sep 23 frames as the plan can produce them, readable at 390), with the answer placement (TD-4) drawn both ways, sequenced after CUL-1270's Design v2 round.
