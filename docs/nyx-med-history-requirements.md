# Medication History — Requirements & PR Plan
**Version:** 1.0 | **Date:** 2026-08-04 | **Status:** 🌱 BUILD-READY for PRs 1–4; PR 5 gated on D2
**Track:** B-140 (extended) | **Mock:** `docs/culprit-med-history-mockups.html` (round 1, exploratory) | **Discussion:** this session (2026-08-04), PR #581

---

## §0 Decision record

| ID | Decision | Status |
|---|---|---|
| **D1** | **Courses are dose-derived; regimens enrich when present.** The course model derives from `medication_administrations` grouped by medication item (via the existing attribution machinery), and a `medications` regimen row — when one exists — adds length, cadence, and an explicit end. A regimen-only view renders near-empty for real accounts (B-394's finding: the PM's own account had 2 regimens, 0 with durations). Same logic the med strip ratified as its D2. | **RATIFIED 2026-08-04** — PM accepted the team recommendation ("let's move forward with this") after the round-1 mock, which was drawn entirely on this assumption. |
| **D2** | **Lifetime medication listing on the vet report** (mock §05) — a compact window-ignoring table beside the windowed Appendix D. Dr. Chen's lens: lifetime is the referral-record standard ("has she ever been on steroids?" doesn't care about a 30-day window). Counter-consideration: report length on a long record — hence one table, not a second appendix. Requires a Tier-2 edit to `nyx-vet-report-requirements.md` §3.8/Appendix D. | **OPEN — gates PR 5 only.** PRs 1–4 are independent of it. |
| **D3** | **The rundown block's window.** Provisional: **past 12 months shown, earlier courses folded behind a count** ("3 earlier courses") — speakable for Sam's chronic cat, complete for the lifetime question. | **PROVISIONAL** (per the CLAUDE.md provisional-decision protocol) — PR 4 builds it; flag for PM confirmation at PR 4's handoff. |
| **D4** | **Sequencing: standalone track, now.** The round-1 recommendation was to fold this into the queued B-394 design session; the PM instead commissioned this build plan directly, which supersedes the fold. B-394 keeps its own scope (the *forward* tense — capture path, `medication_course_status`, promote-on-repeat); this track is the *past* tense; the med strip (B-614) shipped the *present*. All three read the same underlying data and predicates — none re-derives another's. | **RESOLVED 2026-08-04** (by commissioning this plan). |

## §1 The problem

The vet asks *"what medications has she been on?"* and the app cannot answer it anywhere. Three shipped surfaces — the profile med card, the A6 vet-visit rundown, the report's medication machinery — all filter to `status='active'`, so a course vanishes from every surface except the raw History dose stream the moment it ends. The data was all collected; the app has amnesia about it. This is B-140 (filed 2026-06-21, `Next`, Blocks: Step 9), made cheap by infrastructure that shipped since: dose attribution (`attributeDosesToRegimens`), the report's orphan-dose pass, the rundown, and B-618's course predicates.

**The grain rule (from the team discussion):** History answers *what happened* (event grain) and stays exactly as it is. Medication history answers *what has she been on* (course grain) — a derived summary over the same rows, never a second source of truth. Every course-grain claim links back down into the event-grain evidence.

## §2 Scope

**In:** one shared course derivation (`lib/medicationHistory.ts`) + three in-app surfaces (profile "Past medications" section, past-course presentation on the med detail screen, rundown medication-history block) + the D2-gated report table.

**Out (explicitly):** B-302 (promote-to-regimen nudge — its doorway is noted in the detail screen's "No regimen set up" line, nothing more) · B-212 (supplements) · any change to the med strip (B-614) · owner-scored outcomes ("did it help?" — the diet-trial C5 ruling stands: response context, if ever rendered, is the computed symptom trend across course dates) · auto-completing a course (nothing ever ends a course but an owner action) · a per-med History lens (filed as **B-688**; v1 links to History's existing Medication lens).

## §3 The derivation contract — `lib/medicationHistory.ts`

One module, consumed by all four surfaces. **Deno-compatible by construction** (no React Native imports) so `generate-report` imports it directly, the way `report.ts` already imports `lib/dietTrial.ts` — the §5.3 one-predicate lesson applied preemptively.

- **Input:** the pet's `medications` rows + attributed dose tallies (reusing `attributeDosesToRegimens` and `dosesTowardTarget` — this module **reads** the existing predicates, it never re-derives them; a third course-progress definition is the defect the diet-trial track already paid for).
- **Output:** `MedicationCourse[]` — one entry per regimen (enriched: length, cadence, planned doses, explicit end) plus one per medication item whose doses attach to no regimen (dose-derived: name, first/last dose, count, and nothing more).
- **Two end registers, structurally distinct:** `end: { kind: 'ended', at, how }` renders **only** from `status IN ('completed','stopped')` — an owner action. Everything else is `end: { kind: 'none', lastDoseIso }`. There is no code path from silence to an ending (H1).
- **Ordering:** active first, then by last-dose recency. Stable and deterministic.
- **Day math:** through `localDayIndexOf` (the B-441/B-421 primitives), timezone-honest fixtures per the B-514 conventions, non-UTC CI zones included.
- **Soft deletes:** every dose read carries `.is('deleted_at', null)`, matching the tallies it composes with.

## §4 Surfaces (design authority: mock round 1 §02–§05)

1. **Profile "Past medications"** — collapsed section under the active med cards, count on the label, one row per past course, `Ended` / `No end recorded` pills, tappable → detail.
2. **Med detail, past-course presentation** (`app/medication/[id].tsx`) — counted facts (course dates, length, "26 of 28 planned", schedule, how it ended *if an owner ended it*), then the evidence link: "All N doses in History" → History's Medication lens. No adherence percentage, no grade, no outcome field.
3. **Rundown medication-history block** (`lib/rundown.ts` + `app/rundown.tsx`) — "Medications — current" (existing) + "Medications — past 12 months" (D3 provisional), rows written to be read aloud: drug name first, then speakable dates. Deterministic, offline, same derivation as §02.
4. **Report lifetime table** (D2-gated) — mock §05: drug | dates | course | doses logged, with the disclosure footnote ("an absent end date means no end was recorded, not that dosing continued").

## §5 Invariants (H1–H4) — enforced by tests over the derivation and the copy, not by review

| Rule | Never | Instead |
|---|---|---|
| **H1** | "Completed" from silence | "Last dose logged Jun 9." An ending renders only from an owner action. Stale-active is the steady state (the B-422 lesson); a history view that promotes silence into an ending fabricates a clinical fact. |
| **H2** | An adherence percentage or grade | Counted facts — "26 of 28 planned." A percentage judges the owner; the report's adherence narrative already owns that register for the clinical reader. |
| **H3** | "Did it help?" / any owner-scored outcome | Nothing (C5 stands). |
| **H4** | A third course predicate | `lib/medicationHistory.ts` reads `dosesTowardTarget` / `attributeDosesToRegimens`; a contradictory count on two surfaces is a shipped contradiction. |

## §6 PR plan

Chain: **PR 1 is the gate**; PRs 2/3/4 depend only on PR 1 and are **mutually parallel-safe** (disjoint files: `profile.tsx` / `medication/[id].tsx` / `rundown.*`). PR 5 is gated on D2 + the Tier-2 spec edit and **rides the B-494 `generate-report` redeploy vehicle — it never triggers its own deploy**.

| PR | What | Files | Gates & DoD emphasis |
|---|---|---|---|
| **1** | The derivation — `lib/medicationHistory.ts` + tests. Pure, Deno-compatible, no UI change. | `lib/medicationHistory.ts` (+ `.test.ts`) | **`adversarial-reviewer` MANDATORY** (feeds two vet-facing surfaces; counterexamples to try: a regimen with zero logged doses; doses spanning a deleted regimen; a dose after an explicit end; two regimens for the same item; DST/zone straddles). H1/H4 test-asserted. |
| **2** | Profile "Past medications" section. | `app/(tabs)/profile.tsx` (+ components) | Designer (Principles 3/5, collapsed-by-default), `nyx-voice`, copy tests for H1/H2 strings. |
| **3** | Past-course presentation on med detail + the History evidence link. | `app/medication/[id].tsx` | `nyx-voice`; QA: the link lands on History's Medication lens (B-688 notes the per-med lens as future). |
| **4** | Rundown medication-history block (D3 provisional: 12 months + folded earlier count). | `lib/rundown.ts`, `app/rundown.tsx` | `clinical-guardrails` + `nyx-voice`; offline-path QA; **flag D3 for PM confirmation in the handoff**. |
| **5** | Report lifetime table. **GATED: D2 + PM-approved Tier-2 edit to `nyx-vet-report-requirements.md`.** | `supabase/functions/generate-report/report.ts`, `render.ts` | `adversarial-reviewer` + `vet-report-cold-read` MANDATORY (all report changes); `deno test`; deploys **only** with the B-494-gated redeploy. |

**Per-PR kickoff prompts** (paste-ready, one session each):

- **PR 1:** *"Read `docs/nyx-med-history-requirements.md` §3/§5, then build `lib/medicationHistory.ts` — the dose-derived course derivation (D1 ratified) — with tests, Deno-compatible, reading `attributeDosesToRegimens`/`dosesTowardTarget`, never re-deriving. Run the adversarial-reviewer before calling it done. No UI change."*
- **PR 2:** *"Read `docs/nyx-med-history-requirements.md` §4.1 + mock §02, then add the collapsed 'Past medications' section to the profile med card, reading `lib/medicationHistory.ts` (PR 1). Two end registers; H1/H2 copy tests; nyx-voice pass."*
- **PR 3:** *"Read `docs/nyx-med-history-requirements.md` §4.2 + mock §03, then add past-course facts + the 'All N doses in History' link to `app/medication/[id].tsx`, reading `lib/medicationHistory.ts`."*
- **PR 4:** *"Read `docs/nyx-med-history-requirements.md` §4.3 + mock §04, then add the past-medications block to the vet-visit rundown (D3 provisional: 12 months + folded count — flag for PM confirmation). clinical-guardrails + nyx-voice."*
- **PR 5 (only after D2):** *"D2 is ratified: read `docs/nyx-med-history-requirements.md` §4.4 + mock §05, apply the approved Tier-2 edit to `nyx-vet-report-requirements.md`, then add the lifetime medication table to `report.ts`/`render.ts` importing `lib/medicationHistory.ts`. Adversarial + cold-read gates; no standalone deploy — rides the B-494 redeploy."*

## §7 QA acceptance criteria (track-level; each PR lists its own at kickoff)

1. A past regimen the owner explicitly ended renders on all built surfaces with `Ended` and its dates. 2. An ad-hoc med with N doses and no regimen renders with first/last dose and count — and **never** an ending (H1). 3. An active course is never duplicated between the active card/strip and the past section. 4. Dose counts on every surface equal `dosesTowardTarget` for the same course (H4). 5. The detail screen's evidence link lands on History filtered to the Medication lens. 6. The rundown block renders offline. 7. No surface renders a percentage, grade, or outcome field (H2/H3).

---
_Backlog: B-140 (this track) · B-688 (per-med History lens, filed this session) · B-302/B-212 out of scope · B-394 owns the forward tense._
