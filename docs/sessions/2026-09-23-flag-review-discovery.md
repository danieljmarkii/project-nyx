# Flag review discovery: letting an owner answer a photo red flag

**Date:** 2026-09-23 · **Issues:** CUL-1101 (discovery, this session), CUL-1107 (the round 1 rulings, `Waiting on PM`) · shipped via #896
**Project:** none yet (FR-8 proposes a *Flag review* project) · **Mode:** DISCOVERY

---

## What this was

The PM, dogfooding: the per-incident photo read has raised a red flag three or four times (possible blood, suspected foreign material) and each time they disagreed. The only way to say so is to open the incident and edit the structured field, which clears the Home card. They asked whether the warning could be surfaced with a yes/no, maybe a comment, and whether that could help "improve our model", and asked for the product team and stakeholder personas to be convened.

## How it ran

1. **A verified map of today** (one Explore pass, every claim at file:line): the owner edit path, `event_ai_analysis`, the Home `incident_red_flag` card, the incident read card, the vet report, Ask, telemetry, re-analysis. It became the fact sheet every interview read.
2. **Seven isolated persona interviews**, each in its own context against the same fact sheet: Dr. Chen, Jordan, Sam, the Sr. Product Designer, the Sr. Data Scientist, Trust & Safety, and the Dir. of Engineering with QA.
3. **One web research lane** (about 90 calls), committed as a frozen brief: `docs/research/2026-09-owner-answers-to-automated-reads.md`.
4. **Synthesis** into a v0.1 spec, mock round 1 (published) and eight decision briefs.

## What shipped (docs only)

- `docs/nyx-flag-review-requirements.md` v0.1: discovery draft, not build-ready. §0 the eight briefs; §2 the ten-rule spine; §3 the question; §4 each answer per surface; §5 the data model; §6 the learning tiers; §7 a 20-row QA matrix; §8 the deploy order and a provisional PR plan; §10 the panel.
- `docs/culprit-flag-review-mockups.html`, round 1, published at https://claude.ai/artifact/RF8KXzsWafn17MksHhJMC8: today's four frames, the question on the record (Q1 to Q8, with FR-3's alternative beside it), Home's door against an inline answer, the pooled card, Home after each answer, the report's four labels against today's.
- `docs/research/2026-09-owner-answers-to-automated-reads.md` 🧊 and its index row.

## What the panel said

**Five BUILD WITH CONDITIONS (Dr. Chen, Designer, Data Scientist, Trust & Safety, Engineering + QA); both owners ONLY IF; none DON'T BUILD.** The placement converged without prompting: every lens asked chose the record, with Home a door. The shape that emerged:

- **Two witnesses** (Dr. Chen's reframe): the owner's answer sits beside the photo read, never over it. A No stands down the *ask*; the *observation* stays and prints beside the answer on the report.
- **Ask what the owner knows** (Jordan, Sam): name the read's claim, "Do you see it too?", with Yes / No, it's something else / Not sure; a reason after a No; a note after that, under the daily look's rules.
- **Not sure is never No** (Sam, Dr. Chen, the Data Scientist).
- **Nothing trains on answers** (all seven). Culprit trains no model; "improve" means prompt and rule changes checked against a test set built from the PM's own record.

The best single catches, each now a rule or a QA row: Jordan's rope toy ("his toy" beside the vomit clears; shredded into it is foreign material, so "No isn't always good news"); the Designer's pooled-card falsification (a Home No meant for a toy clears the blood the owner never opened); the Data Scientist's replaced photo (an old No silently applied to a new photo showing real blood); Dr. Chen's Lab on carprofen (two disputed coffee-ground vomits, both erased, the ulcer perforates).

## Findings filed along the way

- **CUL-1104 (High):** setting a flagged field to *Unclear* in today's edit form clears the Home card and the report line exactly as *None visible* does. Found by the Sam interview; named a red line independently by Dr. Chen.
- **CUL-1105 (High):** nothing regenerates the Signal when a per-incident read lands, so a flagged photo reaches Home only at the next rebuild (up to 24h). The incident-screen spec's G3 rests on the opposite.
- **CUL-1102:** the vet report never prints stool foreign material; Home's card fires on it.
- **CUL-1103:** doc drift (CLAUDE.md says the red flag card never folds; clinical-guardrails Patterns 7 and 9 cite moved or non-existent code).
- **CUL-1106:** `guards/homeWrites` cannot see a direct PostgREST write.
- **CUL-848, comment:** owner-typed `description` and `foreign_material_note` reach Ask and print under the AI label.

## A premise corrected mid-session

The fact sheet told the panel the per-incident functions sat behind a held redeploy (`STATUS.md`'s "one standing hold", CUL-557). The Engineering interview found, and CUL-557's same-day grooming comment confirms, that `analyze-vomit` v12, `analyze-stool` v5, `ask` v6 and `generate-signal` v34 all equal `main`; only `generate-report` is one deploy behind. The spec's §8 says so; `STATUS.md` and the deploy ledger are the grooming session's to true up, so this session did not touch them.

## Decisions made

None. Every product question is open on CUL-1107 as a decision brief; FR-5 carries a persona conflict with no recommendation (Dr. Chen's repeat rule against Jordan's wallpaper). One engineering dissent (answer columns on `event_ai_analysis` against an append-only review table) is recorded in spec §5 for PR 1's plan gate.

## PM action items

- **CUL-1107** — rule FR-1 to FR-8 (and the two vetoable visual calls in the mock).

## What's next

1. The PM rules CUL-1107.
2. Mock round 2 on the same URL, applying the rulings as one proposal (the reaction-round rule).
3. The Tier-2 edit to `docs/nyx-vet-report-requirements.md` drafted (FR-6), an `adversarial-reviewer` pass on the spec, then v1.0 BUILD-READY and a CLAUDE.md Read-These row (owed then, not now: the file has a size budget and a v0.1 draft is not yet build-critical).
4. Independent of the rulings, and ready now: **CUL-1105** (a client-only regen fix) and a **CUL-1104** stopgap (the edit form never writes *Unclear* over an AI positive). Both are live safety-direction gaps.

**Persona sign-off (discovery):** Designer ✓ (the placement, the post-answer states, the 14 frames it asked for are drawn) · Dr. Chen ✓ (two witnesses; the falsification set: the carprofen Lab, coffee-ground blood, Pepto-black stool) · Data Scientist ✓ (the data model, the metrics with denominators, the direction constraint) · Trust & Safety ✓ (the note's seven rules; Tier 0) · Dir. of Engineering + QA ✓ (the QA matrix, the deploy order) · Jordan ✓ / Sam ✓ (only if: every condition is a rule) · PO ✓ (CUL-208 answered by FR-4; CUL-403's affordance absorbed; six issues filed, none folded in) · tests: N/A (no code) · adversarial review: **not yet run on the spec** (owed before BUILD-READY; the panel's four falsification attempts are recorded above but are not the formal pass).
