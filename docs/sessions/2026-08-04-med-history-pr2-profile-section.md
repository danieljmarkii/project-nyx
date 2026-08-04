# Medication history (B-140 extended) PR 2 — the profile "Past medications" section

**Date:** 2026-08-04 · **Shipped via #587** · **Track:** B-140 extended (`docs/nyx-med-history-requirements.md` §4.1, mock §02)

## What shipped

The first surface to read PR 1's shared course derivation (`lib/medicationHistory.ts`, #585). A collapsed-by-default **"Past medications"** section under the profile's "Current medications" card that finally answers the vet-chair question the app has never been able to answer anywhere — *"what has she been on?"* — for both completed/stopped regimens **and** ad-hoc drugs logged without a regimen (most of the real data, per D1).

- **`lib/pastMedications.ts` (+ `.test.ts`)** — a pure copy layer over `MedicationCourse` (the `lib/dietTrialCard.ts` resolver pattern): name resolution (a regimen names itself; an orphan resolves brand-first from the catalog via `drugDisplayName`; an honest `"Medication"` fallback, never a guess), a **lexical** date formatter (parses `YYYY-MM-DD`, never `new Date(dateStr)` — clock-free, locale-free, timezone-honest per B-441/B-514), and the two-register fact line + pill.
- **`components/profile/PastMedicationsSection.tsx`** — the collapsed section (header + count + chevron; divider-separated rows; non-tappable — see below).
- **`app/(tabs)/profile.tsx`** — `loadPastMedications` (all regimens + all doses → `deriveMedicationCourses` → resolve orphan names → `buildPastCourseRows`), wired into the focus effect + `handleEndRegimen`, rendered after the Current card; plus the empty-copy fix and the shared dose-mapper adoption.
- **`lib/medications.ts` (+ `.test.ts`)** — extracted `mapDoseRowsToAttributable` (the B-196 dose-embed shape handling), now read by both profile loaders.
- **`constants/theme.ts`** — `colorEventMedicationInk` (readable slate-blue for text on the medication wash; twin of `colorAccentInk` / `colorEventSymptomInk`).

## The two end registers (H1), and how the copy makes silence un-endable

The pill is the tell — **"Ended"** (neutral grey) renders *only* from an owner action (`status IN (completed, stopped)`); **"No end recorded"** (medication-blue) for everything else, with the last-dose date standing in for the absent ending. The section switches on the derivation's `end.kind`, never on a date, so there is no code path from "went quiet" to "Ended". **H2**: the fact line is a **count** (`dosesTowardTarget` = given+partial), never a percentage, an "of N" denominator, or a grade. Both are pinned by copy tests, not review.

## Decisions made this session

- **Row taps are gated OFF in PR 2** (reversing the initial build). They routed to `app/medication/[id]`, which today is an editable drug-**catalog** form with a Save button — `pm-feature-review` called a tap there *"worse than no tap"* (it invites editing the shared catalog row while the owner thinks they're annotating history). PR 3 builds the past-course detail on that screen and lights up the tap then; `medicationItemId` is retained on the row model + `petId` is ready to pass, so PR 3 only wires the destination. This keeps the two PRs disjoint the intended way (PR 2 owns `profile.tsx`, PR 3 owns `medication/[id].tsx`).
- **No-end register reads `"N doses given · last dose {date}"`, never a `start – end` range.** The initial build used the same closed-window grammar as the ended register, which read as a completed course and fought the "No end recorded" pill — and made an ad-hoc drug logged in months-apart bursts look continuous. Naming only the last dose fixes both.
- **`"doses given"`, not `"doses logged"`.** The count is `dosesTowardTarget`; "logged" implied all recorded events and quietly disowned the refused/missed doses the count already excludes.
- **Empty-copy collision fixed.** A pet with past history but zero *active* meds showed "No medications **yet**" directly above a populated past list; now "No medications right now — {pet}'s past courses are just below" when history exists.

## What broke and how it was caught

Two mandatory-review subagents ran before the PR was marked ready (both isolated-context):

- **`pm-feature-review`** — SHIP-SHAPED on the read; NEEDS-WORK on the surrounding experience. Caught the empty-copy collision (highest-value), the interim-tap footgun, the closed-range-vs-pill grammar contradiction, and the "logged" verb hiding refusals. All folded in (commit `8ed991b`); the refusal-visibility depth routed to **B-694**.
- **`code-reviewer`** — fix-before-merge on one real **bug**: `loadPastMedications`'s catch cleared `pastRows` on *any* failure, so a transient refetch error silently erased already-rendered history (indistinguishable from "never had any"). Now leaves the prior result standing, matching the sibling `loadMedications`. Also flagged the duplicated dose-embed mapping → extracted to the tested shared `mapDoseRowsToAttributable`. Everything else confirmed sound (data path, RLS/multi-pet scope, day-math, soft-delete, active-XOR-past no-duplication, tap nav).

No `adversarial-reviewer` pass: PR 2 is presentation/copy over PR 1's already-adversarially-reviewed derivation and adds no new clinical/statistical logic — the one count is the existing `dosesTowardTarget` predicate (H4), and H1/H2 are pinned by copy tests.

## Residuals (filed)

- **B-694** (Next) — refusal visibility on past courses: `dosesTowardTarget` correctly excludes refusals, so an all-refused ad-hoc drug reads "No doses given"; whether this *reference* surface should surface a refusal signal is a `clinical-guardrails` + Designer/Dr. Chen call.
- **B-695** (Later) — episode-splitting for orphan bursts (derivation groups by item only; the "last dose" framing mitigates the visual, not the grouping).
- **B-696** (Later) — window/cap the per-focus dose read for years-long records (the rundown's §4.3/D3 precedent).
- **B-697** (Later) — a `paused` regimen files under Past (correct on H1, wrong on categorization; latent until a pause affordance ships).

## Verification

`tsc --noEmit` clean · full jest **198 suites / 4337 green** (incl. the non-UTC CI zones) · pre-push hook green on both pushes · CI green on `8ed991b` (all three jobs). Persona sign-off: **Designer ✓** (Principles 3/5 — collapsed-by-default, empty-state-as-absence; `pm-feature-review` SHIP-SHAPED on the read) · **Engineer ✓** (`code-reviewer`, the error-path bug fixed) · **Data / Dr. Chen N/A** (no new clinical engine).
