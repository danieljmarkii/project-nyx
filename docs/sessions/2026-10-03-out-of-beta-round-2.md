# Out of beta, round 2: the project restarted for Noticed, Design v2, History v2 and the trial screen

**Date:** 2026-10-03
**One thing:** P3 L1 — Sequencing and opportunity cost: every ordering decision is also a list of things it delays · check: pending
**One thing (re-ask):** P2 L1 — Reversibility: one-way and two-way doors · check: pending

Shipped via #1011 (STATUS.md only). Everything else this session lives in Linear.

## What the PM asked

Take everything in beta except the home screen widget to GA, and if a project for that already existed, cancel it and start fresh.

## What I found

The beta shelf (`lib/betaFeatures.ts` `BETA_REGISTRY`) held five rows: `widget_enabled`, `daily_look`, `design_v2`, `history_v2`, `trial_screen`. All four non-widget rows in `app_config` read `{"enabled": false, "allowlist": [<PM uid>]}`. No Edge Function reads any of the four keys, so every removal is JS-only and can ship as one OTA. Ask (`ask_enabled`, `ask_general_enabled`) and `engines_v3_en0` are dark allowlist flags that were never on the shelf; they were left out and the PM was told so.

The existing project, *Out of beta — the log sheet, more event types, vet visits* (P-CUL-16), had in fact done its job: all three of its graduations shipped (#891, #892, #893) and their rows read `{"enabled": true}`. Only the closeout and a set of vet-visits follow-ups were left.

Two standing rulings bear on timing: GC-11 (CUL-1225, 2026-09-27) cuts 1.2.0 with `design_v2` dark and GA after App Review; the trial screen's T-2 waits on the submission cut. The 1.2.0 build (CUL-559) has not been cut.

## What I did

- **Canceled P-CUL-16** at the PM's direction, with a comment recording that its graduations shipped and where every open issue went: the closeout pair (CUL-963, CUL-1082) to the new project; eight vet-visits follow-ups (CUL-1083, 1088, 1089, 1090, 1091, 1093, 1096, 1150) back to *Vet visits — the appointment companion*; the widget issue CUL-1095 to no project.
- **Created P-CUL-21**, *Out of beta — Noticed, Design v2, History v2, the trial screen*, with a TL;DR, the verified state, the three-move graduation mechanism, three decision briefs, a seven-step run order and the gate candidates per feature. Moved the four existing GA issues in (CUL-876, CUL-1307, CUL-1175, CUL-1071) with a comment on each naming its step.
- **The removal PRs are serial** (4a Noticed → 4b trial screen → 4c History v2 → 4d Design v2) because all four edit `lib/appConfig.ts`, `lib/betaFeatures.ts` and `app/settings/beta.tsx`, and Noticed and Design v2 share `LookHeader.tsx` / `TodayCard.tsx`. History before Design v2 means Home's `history_v2`-gated motion collapses onto `design_v2` in HV-14, a fork its own description already names.
- **PM ruled D1 (a), D2 (a), D3 (a)** the same session: GA after 1.2.0 clears review, so GC-11 and T-2 stand; one consolidated device sitting; a gate is a "before GA" ruling or a clinical / privacy / regression issue on the four surfaces.
- **Filed CUL-1520** (step 1, the gate triage: DISCOVERY, label `GA gate`, one sitting issue merging CUL-872 / 1070 / 1171 / 1306, one docket) and **CUL-1521** (step 7, the four-row closeout migration and the doc records).
- **STATUS.md:** the old project's row replaced by the new one's, with the rulings; the Event Taxonomy row's pointer updated. Two commits on the branch, one merge of `main`.

## Decisions

- D1–D3 as above, ruled by the PM. Decision briefs are on the project; the ruling comment is the project's newest.
- Team call (Product Owner): the four GA issues move into the graduation project, as the first project did with CUL-905; the gate fixes stay in their home projects so each track's run order holds.

## Residuals

- The four device-pass issues still sit in their home projects; CUL-1520 supersedes them with one sitting and leaves the closing to the sitting.
- The project's gate list is a candidate list until CUL-1520 runs. Roughly 80 open issues sit on the four surfaces; D3 is what keeps that from becoming the launch queue.
- CUL-1090 and CUL-1093 still block the 1.2.0 cut. They were never this project's, and that is unchanged.

— Product Owner + Dir. of Engineering lenses
