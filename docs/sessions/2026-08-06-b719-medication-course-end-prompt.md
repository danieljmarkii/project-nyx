# B-719 — confirm-in-the-loop finish prompt for a completed medication course

**Date:** 2026-08-06

Shipped via **#600** (branch `claude/medication-status-display-bzbn06`).

## The problem
PM dogfood: Nyx's Motozol, a 28-dose course, showed **28/28 doses given** yet still sat under **Current medications** — because the only `status: active → completed` transition is the owner tapping **End**, an easily-missed word in the `Log a dose · Edit · End` utility row. Even a PM fluent in the app didn't know End was required. A prescription *has* a defined end (a dose count or a day span); the app should recognise it.

## The decision
PM ruled the mechanism **confirm-in-the-loop** — over auto-end and auto-end-with-undo, both considered and rejected: when an active course reaches its planned end, the card offers a calm prompt to finish it; it never auto-ends (H1/B-422) and never asserts completion (D7). A round-1 mock (`docs/culprit-med-course-end-mockups.html`, published as an Artifact) took the copy + states to the PM, who chose the plain question form and — initially — dropping B-642's vet-deferral hedge ("the vet already weighed in via the dosing schedule").

## What was built
- **`lib/medications.ts`** — `courseReachedPlannedEnd(...)`, the one tested predicate, **composing** the two existing course definitions (`DoseCourseProgress.atTarget` for the dose trigger; `regimenDaysElapsed` for the day trigger) rather than re-deriving them (the diet-trial §5.3 one-predicate lesson). Plus `courseEndPromptLede` + the prompt copy constants.
  - **The dose-vs-day threshold asymmetry is deliberate and load-bearing:** dose fires at `count >= target` (inclusive — delivering the Nth dose completes an N-dose course); day fires at `daysElapsed > target` (**strict** — the full span elapses only *after* the last day passes). The 1-day course is the proof: `>=` would fire "Is this course finished?" on the *start* day of a 1-day course, and would make "the N days are up" false on the last day.
- **`app/(tabs)/profile.tsx`** — `courseEnd` wired through `buildRegimenDisplay` (the `doseCourse` const hoisted so the predicate reuses the exact same value); the prompt renders for both dose- and day-denominated courses, replacing B-642's inert "vet's call" note. The tap reuses the shipped `confirmEndRegimen` dialog; the utility-row **End** stays (early-end still possible).
- **`lib/medications.test.ts`** — cases pinning the threshold asymmetry, the status gate, the partial-at-target trigger, and the copy invariants.

## The adversarial review — FAIL, then fixed
The mandatory `adversarial-reviewer` pass **FAILed** the first cut. The trigger machinery **held** (it tried PRN, completed, mid-run, and the 1-day/1-dose boundaries — the predicate never fires on an unfinished, open-ended, or ended course; the day lede stays calendar-only over 4 missed doses). Three real breaks in the copy + consequences, each resolved:

1. **Dose lede overstated on partials (③).** `dosesTowardTarget = given + partial`, so a course reaches its target *with partials in the count* — "Nyx has had all 28 doses" is false when partials made up the count (worst case `partial=30/target=28` → "had all 28" with **zero** fully given), and it rendered *more prominently* than the flag line correcting it. **Fixed:** record-framed — *"Nyx's 28 doses are all logged."* — true regardless of the given/partial split. Pinned with a partial-at-target test.
2. **Dropping the vet-deferral was a real hazard (④).** A bare "Is this course finished?" on a **prednisolone** entered as a 10-day course nudges an abrupt stop — steroids must be *tapered*. The app can't distinguish a taper (or a "finish till the recheck" antibiotic) from a simple course, so removing B-642's hedge removed the safety net exactly where it matters. **Fixed:** restored a short hedge — *"Your vet has the final say."* — at B-642's original quiet register. The reviewer also caught that a code comment falsely claimed a "Dr. Chen-reviewed" sign-off that never happened; corrected. **The exact wording is the one open PM/Dr. Chen call.**
3. **Ending orphans a trailing dose (⑤).** After finishing, a vet-extended dose logs unlinked (Past is non-tappable, no reactivate path). Inherited from End, but B-719 amplifies it by surfacing End right when a trailing dose is likely. **Filed as B-720** (deferred; no data loss, under-counts therapy, safe direction).

## The code review
`code-reviewer` returned **fix-before-merge**, whose one blocking item was the B-ID collision (below) — resolved by the renumber. Two NITs folded in: the button's `minHeight` aligned to the screen's documented **44pt tap floor** (was a bare `40`), and a status-gate test swapped `'paused'/'archived'` (wrong table) for the real `medication_status` value `'stopped'`. Everything else checked clean — theme tokens, the fully-dead `medCourseNote` removed, the hoisted const (no behavior change), the type narrowing, `activePet.name` guarded, and the threshold asymmetry.

## The B-ID collision
A parallel session (the diet-trial log-warning race) had already landed **B-710 and B-711** on `main` (#599, 2026-08-05). Per the wrap first-to-land-keeps rule, this session's two rows were renumbered **B-710 → B-719** and **B-711 → B-720** (max was 718), with provenance notes; cross-references in the code, tests, and mock were updated *by attribution* (the sibling's B-710 references in `STATUS.md` and its own session record were left untouched). The dup-ID check is clean after the renumber.

## Residuals / open
- **④ copy pending final PM/Dr. Chen sign-off** — the restored hedge is the safe default; the PM may keep it, go fuller, or accept variant A's risk. The one open copy call.
- **B-720** — trailing-dose orphaning after End (deferred).
- On-device QA of the prompt (PM action).

## Persona lenses
Designer (Principle 2 — confirmation, not entry), Dr. Chen + `adversarial-reviewer` (the D7 / taper clinical safety), `nyx-voice` (the copy), `code-reviewer` (house rules), Product Owner (the B-ID reconciliation).
