# Medication revamp: the team brainstorm, the competitive research, mock round 1

**Date:** 2026-09-27 · **Issue:** CUL-1349 (DISCOVERY) · **Outcome:** a frozen research brief, round 1 of the mock with nine decision briefs, eight Linear writes on issues found along the way; shipped via #954

## The prompt

The PM called medication "a working v1" with a significant opportunity, and asked the team to brainstorm and to research how the leaders handle it. Eight observations drove the session: the UX feels disjointed and starts from the Pet tab; a Home card could answer "how much longer does Nyx have on this med?", borrowing the diet-trial screen's calendar; does medication feed the Signal; is a dose logged from + really part of a course started elsewhere; History v2 now shows some medication data; Home once had a "log a dose" that felt like a second logging button, and now shows nothing while a course runs; what could a med screen show, like the trial's vomiting before and after; and which delight moments fit.

## Method

The house brainstorm, as for CUL-1291:

1. Two Explore passes: every medication surface and door, and what the trial screen and Home compose from.
2. A read-only check of production: the deployed `generate-signal` and `ask` bundles, the gateway logs, and the PM's own record (scoped once in a CTE, C-27).
3. An isolated competitive and evidence sweep, committed as `docs/research/2026-09-medication-competitive-landscape.md`. Four load-bearing claims were re-verified at use (its §V).
4. Five isolated reads on one shared brief: Jordan; Sam; Dr. Chen with the Data Scientist; the Designer with the Mobile IA, Data Viz and Motion; Engineering with QA, the Product Owner and T&S.
5. Every code claim a read leaned on was re-checked on `main` (5b9bd69) before it went into the mock or Linear.

## What was true (verified)

- **The Signal and Ask have read no medication dose since June 23, and CUL-1099 had been closed without a fix.** PR #924 named it "Related, not closed" but carried it as an attachment, so the merge moved it to Done (the CUL-803 attachment trap). Deployed `generate-signal` v39 (deployed that morning) still sends the unhinted embed; 41 of 41 dose reads in the retained logs returned HTTP 300 (PGRST201), and `doseEventsRes.data ?? []` turns each failure into "no doses". The med-with-food pairing is dead with it. The Engines v3 project description lists CUL-1099 under "Already shipped", and EN-10 depends on it. **Reopened** with the proof.
- **Observation 6 is the PM's own Design v2 ruling of 2026-09-19** ("Nothing about medication on Home beyond the dose as a fact once logged", shipped in #880). `app/(tabs)/index.tsx` renders no MedStrip under `design_v2`: the whole card went, not only the button. The PM's sentence that day stopped at "But I absolutely think that we should…".
- **The link between a dose and its course is written at log time, by two of four paths, and never shown.** One component creates a course (`AddMedicationModal`, from the Pet tab or the after-visit screen). Four paths write doses: + links only when the picked library item is exactly the course's; photo capture always creates a new library item and an unlinked dose; Home's strip (Design v2 off) and the Pet tab's button link. Eight readers use at least five rules for "which course is this dose in". The FAB finds the course and then shows only the drug's name.
- **The PM's record:** Nyx's July Motozol was logged dose-first (16 doses over eight days, then a course back-dated to Jul 16); those 16 were never linked, the 12 after were. Prednisone (course first) has 7 of 7 linked, all recorded Partial; the Pet tab reads 0% given and asks for the vet. Sixteen Zyrtec doses have no course. Schrödinger's Cat has a duplicate cetirizine course still "active" after 98 days. 38 of Nyx's 57 live doses carry no course link. Real usage is the PM's account alone.
- **There is no screen for an active course.** `app/medication/[id]` is the drug-library item; the Pet tab card is the only place a course is managed, and it still says "missed" and draws an adherence-% bar.

## What every lens agreed

- A course gets its own screen on the trial screen's spine: it only shows, the ledger is a record, safety replaces the top, the pet comes from the course.
- The plumbing comes first: one timezone-aware rule for course membership, imported by the app, the report, Ask and the Signal (CUL-991, CUL-1351); drug identity bound when a course is created; local reads everywhere (CUL-938); a same-pet database check.
- + offers the pet's courses first, and the card names the course.
- A course set up after its first doses counts them, at read time, said once.
- No "% given", "missed" or "administered" where a missing log could read as a missing pill; the dose amount lives on the course and the chips ask how much she got.
- No before-and-after on a drug's page, never a zero beside a drug start, never "helped".
- No completion at the target (D7), no pill pack that pops (vetoed by Jordan, Sam, Dr. Chen and the Data Scientist independently), no streaks.
- A refusal is never quiet; it backs up another signal and escalates alone only for a critical drug.

## Where the team split (on the mock, §11)

Home's register (Jordan: the one-tap back; Sam: nothing on a quiet day; Designer: a door row per running course); the ledger at the milestone (Designer: absent; Dr. Chen: kept, gaps as evidence); the mark vocabulary (dashed means "today" on the trial ledger and "not in full" on History v2); a symptom line on the course screen (Data yes, Dr. Chen no); reminders (Engineering and T&S hold G4; Dr. Chen argues Apple's shape with server-side household follow-ups); tapping a day to back-fill (Jordan yes; Designer no, C-5).

## Decision briefs (mock §12, and on CUL-1349)

D1 start the track, foundations first · D2 Home (recommended H-E′: a door row per course with an end, plus a row for any course with a refusal; no write) · D3 the end of a course (conflict) · D4 doses after a course's end (beside, never in the count) · D5 split the dose words ("½ tablet" on the course; All of it · Some of it · None of it · Not given) · D6 an owner-set pill face · D7 reminders (hold G4, B-227 gets its own spec) · D8 the app-wide mark vocabulary · D9 two better-than-the-rule briefs (B-153/B-154 linked doses outside their dates; B-117 §8's medication cap).

## Found along the way (Linear)

- **CUL-1099 reopened**, with the production proof; **CUL-1140** commented (its prerequisite is not met).
- **CUL-1355 filed (High, Engines v3):** the Signal's "down from N episodes" reflection reads no medication, so a falling vomit week can print while Cerenia is on board, naming no drug. Verified: `detectReflections` takes no medication input and `decorateFinding` never gives a reflection the med line.
- **CUL-417 commented:** any drug present caps a food finding below Established, and the vet report prints Established only, so a pet on a steady daily drug never gets a food finding on its report; an unended course is on board forever (`regimenEndIso(null)`).
- **CUL-1353 filed:** a dose given "in a pill pocket" or "in a treat" never reaches the diet trial unless the treat is logged separately (`lib/dietTrial.ts:1192`).
- **CUL-1354 filed (High):** after a pet switch with a failed read, the Pet tab keeps the previous pet's courses, and "Log a dose" writes to the new pet with the old pet's course id.
- **CUL-1350 filed:** Get ready's medication tiles pass a course id to the drug-library screen and open "Medication not found".
- **CUL-1351 filed:** Ask's own copy of the course rule still compares end dates as text, dropping every final-day dose; latent until CUL-1099 lands.

## Artifacts

- **Mock:** `docs/culprit-medication-revamp-mockups.html`, round 1, published at https://claude.ai/artifact/4wb5JyHeiH8RXvbUBFqJ35. Drawn by one generator so every ledger and count agrees across its 29 frames. Fixtures: Nyx (the PM's real record), Mochi (Clavamox, twice a day, an evening first dose), Pixel (methimazole, no end).
- **Research:** `docs/research/2026-09-medication-competitive-landscape.md` (🧊 frozen).
- **Linear:** CUL-1349 (the discovery, carrying the briefs), CUL-1350, CUL-1351, CUL-1353, CUL-1354, CUL-1355; comments on CUL-1099, CUL-1140, CUL-417 and CUL-1071.

## Personas

Designer ✓ (Principles 1, 2, 3, 5; the register rule) · Mobile IA ✓ (the fold, drawn) · Data Viz ✓ (the grain follows the prescription) · Motion ✓ (one draw-in, the visible link) · Dr. Chen ✓ · Data Scientist ✓ · Jordan ✓ · Sam ✓ · Engineering ✓ · QA ✓ · Product Owner ✓ · T&S ✓ (reminders on the lock screen; no new data exposure in the proposal).

Adversarial line: N/A, no logic changed. The counterexamples each clinical lens tried are recorded where they bite: the Cerenia week (CUL-1355), the methimazole cat and the 98-day course (CUL-417), phenobarbital entered as 30 days and a prednisolone taper entered as 10 (mock §02, the end), the pill that pops (§08).

## Open for the PM

Two questions only the PM can answer, both on the mock's masthead: were Nyx's seven Partial prednisone doses partly taken, or is her dose half a tablet; and how the Sep 19 sentence ended.
