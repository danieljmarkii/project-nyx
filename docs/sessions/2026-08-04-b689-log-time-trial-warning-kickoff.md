# B-689 — the log-time trial-list heads-up: filed, discussed, mocked, design-locked

**Date:** 2026-08-04

**Outcome: shipped via #580** (docs-only — backlog row + design-locked mock; no app code).

The PM's dogfood idea — "if a food is logged that shouldn't be, because it's not on the trial, warn" —
checked out as a genuine gap, not a duplicate: the shipped log-time flag (B-351 slice 4, re-based by
B-417 PR 5 onto `classifyFeeding`) fires on rung 2 (`off_diet_protein`) only, so a rung-3
`off_diet_unrecognised` feeding — the modal case on a real library — is counted in the exposure record
but never surfaced at the moment of logging. No existing row covered the membership-based delta
(nearest neighbours: B-595; B-439, closed by B-616 D4).

## What shipped

- **Backlog row** — filed as B-686 at kickoff; **renumbered to B-689 at this wrap's merge from `main`**
  (B-686 was taken on `main` first by the vet-report caveat de-dup row, PR #582; first-lands-keeps per
  B-435; B-687/B-688 were also taken by the same sibling wrap). Provenance note is in the row.
- **`docs/culprit-trial-log-warning-mockups.html`** — two mock rounds in one session, published as an
  Artifact (same URL across rounds). Round 1: the gap, the shipped rung-2 flag for contrast, variant
  A (prose-only) vs B (quiet add line), the reused confirm sheet, the after-state, six silence states.
  Round 2: A/B ruled → the two warning intensities (amber attention vs rose danger) side by side on the
  real dark completion card. **Design-locked same day** — the amber §2 frame is the build authority;
  the rose frame is retained as the decision record.

## Decisions (all PM, 2026-08-04, in one sitting)

1. **The warning exists** — "we have a duty to show that an off-trial food has been logged." Scope
   ruling folded in: B-616 D2's positive-marking-only rule governs the library's *standing marks*, not
   the log-time *event register* (the register the exposures screen already uses).
2. **Variant B** — heads-up + the quiet "+ Add to the trial list" line, opening the shipped
   `AddTrialFoodSheet` (dated membership; the fired feeding keeps its off-list reading — an add never
   launders an exposure).
3. **Active trial only** — renders only while a trial is genuinely running (`isTrialRunning`, per the
   B-422 convention, never the raw status column). Settles B-595 for this flag; the team recommends
   the same gate on the shipped rung-2 flag in the build PR, which would close B-595 outright.
4. **Intensity: amber "attention", not rose "danger"** — the PM asked for danger styling; the team
   rendered it faithfully beside the amber treatment with the dissent recorded (Dr. Chen: "warn" is
   right, "danger" asserts harm the record hasn't established — the claim is list-absence; Designer:
   this would have been Culprit's first danger-styled surface, red-that's-usually-wrong trains
   dismissal per C2). The PM took the recommendation off the frames.

## Invariants ratified (inherited from the shipped flag)

Fires after the save, never gates the log (Principle 1) · once per food per trial via the existing
heads-up ledger · membership language only ("isn't on the trial list" — never "off-diet"/"contaminant"
for an unread food) · silence under every uncertainty state, and silence is never an all-clear (G2) ·
rung-2 precedence (never both flags at once).

## Build plan (next sessions; one predicate, no schema)

- **PR 1 — lib:** extend the log-time decision (`lib/trialContaminant.ts`) to emit a typed membership
  flag on `off_diet_unrecognised` via `classifyFeeding` (never a re-derivation); rung-2 precedence;
  the `isTrialRunning` gate on BOTH log-time flags (closes B-595); ledger reuse; `adversarial-reviewer`
  on claim-strength.
- **PR 2 — surface:** the amber inset panel on `MealCompletionCard` + the add line → `AddTrialFoodSheet`;
  budget spent on render (`noteTrialFlagShown`); Designer + `pm-feature-review`.
- **PR 3 — copy/safety + QA:** `nyx-voice` pass, the silence-state QA matrix, on-device script.

## Process notes

- The dup-ID race (B-435's scenario) hit again: two sessions minted B-686 the same day; a third took
  B-687/B-688. Renumbered at wrap after merging `main`, cross-references fixed by attribution (the mock
  file's four; the sibling's session records untouched).
- Mock re-publish discipline held: both rounds + the design-lock went to the same Artifact URL.
