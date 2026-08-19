# BreedPicker "Other / not listed" reachability + restored "type it in" hint (CUL-137 / B-261)

**Date:** 2026-08-19
**Shipped via:** #680

## What shipped

A UX-polish change to `components/pet/BreedPicker.tsx` (the shared breed picker used by the
onboarding breed step `app/onboarding/pet-breed.tsx` and `components/profile/EditPetModal.tsx`),
plus its co-located test.

The `Other / not listed` free-text escape hatch was the **last** row of the list, so a rescue or
mixed-breed owner had to scroll past up to 80 dog rows (`MAX_VISIBLE`) or all 71 cat rows to reach
it. And the onboarding mockup's muted **`type it in`** hint beside it had been dropped in the build.

Two changes, no caller edits (shared component → both surfaces benefit):

1. **Pinned `Other / not listed` to the top** of the list container (first row under the search
   box), so it's reachable with zero scrolling on both surfaces.
2. **Restored the inline `type it in` hint** as a muted secondary text on that row (its own
   `otherText` style drops the breed rows' `flex: 1` so the hint sits inline, not pushed to the far
   edge like the selected ✓). Set an explicit `accessibilityLabel="Other / not listed, type it in"`
   so a screen reader speaks it as one coherent action.
3. Updated the empty-state copy `below to add it` → `above to type it in` to match the new position.

Tests (`BreedPicker.test.tsx`): guard the restored hint, the top-of-list render ordering (`Other`
before the first breed row via serialized-tree index), and that both survive a capped long list.

## Design decision — top-pin vs. persistent footer

The issue offered two shapes: pin `Other` near the top **or** make it a persistent footer. Shipped
**top-pin**. A truly sticky footer needs `BreedPicker` to own a bounded internal scroll, but both
callers embed it inside a parent `ScrollView` — a footer would reintroduce the nested-vertical-scroll
anti-pattern (a heavier, riskier change than this "Quick Win"). The one trade of top-pin is that
`Other` sits above the pinned catch-alls (`Mixed breed` / `Domestic Shorthair`); mitigated because
the muted hint frames it as the self-describe option and the catch-alls are the very next rows (still
no scroll) — for a mixed-breed dog owner, `Mixed breed` is a better-than-free-text catalog answer and
is right there. Flagged in the PR + on CUL-137 as the one item for Designer/PM ratification on the
draft; a footer remains a clean follow-up if they'd rather keep the catch-alls strictly first.

**PM ruling (2026-08-19): option A — ship the top-pin as-is.** The PM chose to merge #680 without
changes, accepting the top-pin over the footer (B) and the pin-below-catch-alls middle ground (C).
The Data-Scientist catalog-integrity concern is noted, not overridden silently — if free-text
fragmentation shows up in the breed field later, (C) is the pre-scoped follow-up on this same surface.

## Verification

- **Tests teeth-checked.** Temporarily reverted to the pre-B-261 layout (`Other` at the bottom, no
  hint) → all three new guards failed (hint absent; `Other` after the first breed row; long-list
  reachability), while the five behavior tests correctly still passed. Restored the fix → 8/8 pass.
- `tsc --noEmit` clean (whole project, exit 0).
- `guards/ownerFacingCopy.test.ts` 17/17 (change is in `components/`, so the copy guard was in
  scope — the new copy has no `!`, no error-string extraction, no clinical term).
- Full pre-push suite green: 239 suites / 5314 tests.
- `code-reviewer` subagent run on the diff (fresh un-anchored pass): **ship-ready on code-correctness
  and house rules** (no bugs, tokens-only styling, 44pt tap-target + a11y hold, copy in voice, tests
  real). Its two nits were fixed in a follow-up commit — (a) a test now pins the "above to type it in"
  empty-state wording so a lone copy revert can't slip past the ordering test, and (b) the `radiogroup`
  role was scoped to just the breed radios so the "Other" button (which its top-pin had made the first
  element a screen reader announces on entering the group) no longer sits inside the group. Its one
  non-code item — "Other" above the catch-alls — is the Persona Conflict below, teed up for PM/Designer.

## DoD / notes

- **No adversarial-reviewer pass.** Nothing clinical or statistical: this is list ordering + a copy
  hint, no detection, escalation, or vet-report content. The DoD's adversarial line is N/A (stated).
- **No numbered build-step AC.** Legacy-Backlog polish; the onboarding requirements AC ("BreedPicker
  species-filtered + 'Other' free-text") still holds — `Other` stays always-reachable, now without
  scrolling.
- **Persona sign-off:** Designer ✓ (Principle 1 — no decision at moment of event; Jordan's 10-second
  reachability restored) — Engineer ✓ (shared component, theme tokens only, 44pt tap-target preserved,
  no scroll restructuring) — **Data: open concern, not N/A** (catalog integrity — the pinned catch-alls
  exist to be the default-correct tap and now sit one row *below* the free-text hatch; free text
  fragments the breed field the vet report's disease-risk read depends on) — Dr. Chen N/A. The
  Designer/Engineer ↔ Data tension is a genuine Persona Conflict, surfaced for the PM/Designer on
  CUL-137 per the protocol — **PM ruled option A (ship the top-pin as-is) and merged #680.**
- **STATUS.md untouched.** A Legacy-Backlog onboarding/profile polish changes no working-state field
  (Current Phase / Parallel Track / Blocking OQs / PM Action Items / Runtime), so the minimal — and
  correct — STATUS.md diff is none.
- **Linear:** the PR body's `CUL-137` reference auto-linked #680 and moved the issue Todo → In
  Progress natively; the squash-merge moves it to Done (verified at wrap).

## Residuals

None filed. If the Designer prefers a catch-alls-first ordering with `Other` as a footer, that's the
one open follow-up — noted on CUL-137, not filed as a separate issue since it's the same surface.
