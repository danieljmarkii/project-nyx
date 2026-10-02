# Engines deep dive: the Signal and the vomit read, replayed against the record

**Date:** 2026-09-24, wrapped 2026-09-25 after the PM's first rulings · **Issue:** CUL-1117 · **Mode:** DISCOVERY · **Shipped via #899** (`claude/lucid-mccarthy-q2wkb4`) · **Artifact:** *The Accountable Engine*, https://claude.ai/artifact/JrGK8oz2eJeXeLgpP29xPu (version 3)

**PM prompt:** a deep dive on the Signal generation engine and the per-incident vomit analysis. "What can we do to ensure a step level improvement in our signals and analysis engine", learning from the record now in the database and from the literature; the vomit read "has raised more red flags for me than it's worth"; "these analysis engines are our wedge. They need to be our moat."

## What the ramp-up questions ruled

- **Weight:** the June 4.4 kg on the profile was a real weigh-in, not an estimate, so the fall to the 3.73 kg measured at the 9/16 visit is a finding.
- **A real veterinarian:** not this round. Every threshold in the brief stays persona-ratified, and nothing ships a "clinical-grade" claim until one reviews it.
- **Intake rating:** "software labeling of intake is tough"; the PM asked for a backlog issue on whether the feature is still worth it. Filed as CUL-1118 and folded into D2.
- **Deliverable:** brief plus a proposed project (the recommended option).

## Method

Six isolated lanes (engine map, vomit-read map, prior-work ledger, statistical methods frontier, veterinary vomiting evidence, AI triage calibration), then something no earlier dogfood brief did: **replay the shipped engines** instead of reading them.

- `scripts/engine-replay/` reconstructs the record as it stood at any instant (created by T, not deleted by T, occurred by T; the model's pre-edit photo fields before a later owner edit) and feeds it to the unmodified engine modules. The scripts import the engines and never restate them (C-34).
- **Fidelity was proven before anything was trusted.** The Signal replay of 9/23 matches the live `ai_signals` row word for word. The incident replay started at 41 of 43 stored flag sets; the two misses were real replay errors, fixed rather than explained away: the May and June edit flow re-created a vomit row and deleted the old one in the same operation that ran its read (a five-minute settle grace), and a re-run read's flags come from its last run, so an unedited row anchors at `updated_at`. After both: **43 of 43**.
- Data never enters the repo. `export.sql` names the pet by id paired with its owner (C-27), and deliberately omits the trial window-provenance columns (`guards/dietTrialProvenance.test.ts`); the replay reads the trial at its current length and says so in its header.

## What it found

- **The Signal is a latch.** A safety-class card on 119 of 129 evenings; the vomiting card asked for a vet on 110 consecutive evenings ("worth booking a vet visit" on 101) and on every evening after the 9/16 visit. The ask is clinically right (FCEAI moderate to severe); what is wrong is that nothing can stand it down. The engine reads neither visits nor treatment.
- **A 15% weight loss no engine can see** (4.4 kg in June, 3.73 kg on 9/16). The 9/16 reading overwrote the June value in place, so the history the loss needs no longer exists in the schema; it survives only in three June briefs and an 8/2 QA clone.
- **Insight lanes speak on noise:** first-week food "culprit" cards from a tier with no test (p = 0.25 against a corrected 0.007); a "worsening" safety card on two episodes against zero.
- **The vomit read escalated 11 of 45 reads at a single urgency.** Every contextual flag was derived from logging behaviour: three intake flags keyed on meals logged without a rating (the read told the owner the cat "hasn't eaten a full meal recently"), two repeat flags counting log entries. Four mechanisms no prior brief named: windows anchored at analysis time, not the vomit; logging order creating intake alarms; the old edit flow's transient duplicates; a contextual sentence displacing the photo finding (9/22's possible foreign material went unnamed).
- **Zero outcomes recorded.** No alert has ever learned whether it was right.

## The adversarial pass

An isolated `adversarial-reviewer` failed the first draft as a package: **P2** (episode counting) chained a retching dog into one episode and merged two found piles; **P3** (unrated means unknown) went silent in every lane on a cat with about 42 unrated servings in a week while losing 15%. It also marked two evidence claims overstated: **E1** ("alarms were mostly mechanical" conflated derived with false) and **E3** (the replay says what today's engine says, not what the owner saw). Every verdict is folded into the brief (§3 reframed, §7 amendments B1 to B5 and C1 to C3, §8 the record).

## What shipped

- `docs/research/2026-09-engines-step-change.md` (the brief), `…-evidence-pack.md` (lanes D, E, F with two ⚠ editor's notes), `…-source-maps.md` (lanes A, B, C), three rows in `docs/research/README.md`.
- Two additive §V corrections to frozen briefs: the 2026-05 feeding brief's hepatic-lipidosis durations are not on the pages it cites; the 2026-08 signals brief's F5 pause did not persist.
- `scripts/engine-replay/` (`export.sql`, `record.deno.ts`, `signalReplay.deno.ts`, `incidentReplay.deno.ts`, README). The `.deno.ts` suffix keeps them out of the app's `tsc`.
- `docs/culprit-engines-step-change.html`, published as the artifact above: the 129-evening chart, the eleven-row escalation table, today-vs-proposed frames of Home and the read, D1 to D8, the run order.
- Linear: project **Engines v3: the accountable engine** (P-CUL-17, Backlog, awaiting greenlight) with EN-0 to EN-15 as CUL-1130 to CUL-1145, and EN-F as CUL-1267 (filed at the wrap, below); CUL-1118 (intake rating); CUL-1146 (the decision briefs, `Waiting on PM`).

## The PM's rulings at the wrap (2026-09-25)

- **The build ships behind a feature flag.** "Let's make sure this would be wrapped in a feature flag." Filed as EN-F (CUL-1267), Phase 0, ahead of EN-0 and blocking every EN issue that changes what an owner sees. It is an `app_config` allowlist flag in the Ask §8 shape, **read on the server**, because the engines run there and every rollout flag since `daily_look` has been client-render-only. Flag-off is asserted against the new code's absence (C-36), and the PM's account goes first. Measurement work (EN-1, EN-2) and additive schema need no flag.
- **D6 goes to flag review.** The PM is building, in another session, a way for the owner to decline a photo escalation directly (CUL-1101, CUL-1107). EN-6 (CUL-1137) drops its own owner question and builds on that path; the rest of EN-6 stands. Dr. Chen's dissent is recorded: a visible bleed is rare, and the floor is usually cleaned before a retake. One input carried to that track, not imposed on it: this session's adversarial pass found that an "Unsure" answer should keep the call, since agreement between reads cannot settle a systematic lookalike (liver pâté reads as blood three times out of three).
- **Direction endorsed** ("I like where we're starting to land"). D1 to D5, D7 and D8 stay open on CUL-1146. Nothing was ruled by implication, and the project stays in Backlog until they are.

## Persona sign-off

Data Scientist ✓ (both fidelity checks; the p = 0.25 recomputation; the replay's blind spots stated in its header, not left to read as coverage) · Dr. Chen ✓ (the clinical lane; every threshold marked persona-ratified pending a real vet; D6 left without a recommendation, and the dissent recorded when the PM routed it to flag review) · Jordan / Sam ✓ (the D6 dissent, recorded verbatim) · Designer ✓ (the frames drawn in Culprit's daylight register; every decision in the brief shape) · Trust & Safety ✓ (no record data in the repo; C-27 on the export; provenance columns excluded) · Engineer ✓ (deno check, re-run against `main` at the wrap; `tsc`; the full jest suite in the pre-push hook; CI green on every push) · Product Owner ✓ (one project with a run order; decisions on one issue, not scattered).

## PM actions

- CUL-1146: rule D1 to D5, D7 and D8 (D6 was ruled at the wrap).
- CUL-1118: whether meal intake rating stays (rides D2).
- P-CUL-17: greenlight the project, or not, after the rulings. Only Phase 0 can start before them: the flag (EN-F, CUL-1267), then EN-0 (CUL-1130).
- Not a product call: share the June 4.4 kg reading with the vet beside the 9/16 one, and whether any of the loss was intended (noted on CUL-1146).

## Definition of Done

Acceptance (CUL-1117's deliverables, listed on #899) ✓ · anti-patterns: none introduced (docs and research scripts; no app code) · `tsc` and the full jest suite ✓ · tests: N/A for the app (no store, Edge Function or `lib/` change); the replay scripts' own check is fidelity (43 of 43 stored flag sets; the 9/23 ledger equals the live cache) · no new secret · adversarial review ✓ (isolated; the counterexamples are in the brief §8) · future self: the replay tooling is a new pattern worth keeping, since it is the seed of EN-1; its one drift risk is `shippedInput` restating `assembleContext`, and a drift prints as a mismatch rather than passing silently · Dev Handoff: docs only, nothing to load on a phone · PM actions filed in Linear (above).
