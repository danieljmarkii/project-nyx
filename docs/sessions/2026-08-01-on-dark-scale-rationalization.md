# On-dark alpha scale rationalization (B-646)

**Date:** 2026-08-01

**Shipped via #541** — draft PR, gated on on-device dark-card QA (this is a behaviour change).

## The task

A designer-lens review of the on-dark token block in `constants/theme.ts`: collapse the
near-duplicate alpha steps (text `0.65` / `0.70` / `0.75`; dividers `0.10` / `0.12` / `0.15`)
into a principled scale. Flagged up front as a behaviour change, so it carries an on-device
dark-card QA gate.

## What the review found

The near-duplicate alphas were scattered at the call sites, not in `theme.ts` — three roles each
split across near-duplicate decimals:

- **Secondary** white text on near-black — `0.65` (`AddConditionModal` chip desc) / `0.70`
  (`edit-event`, both cards, chip rows) / `0.75` (`MealCompletionCard` flag + combo text).
- **Faint** white text — `0.55` (`MedicationCompletionCard` in-doubt reason + vehicle label).
- **Divider** hairline on a dark card — `0.10` (Med vehicle) / `0.12` (Meal combo) / `0.15`
  (everything else).

The smoking gun for the designer lens: `MealCompletionCard` and `MedicationCompletionCard` are
meant to be visual twins — their own comments say *"mirrors the meal card"* and *"identical to
the meal card's"* — yet Meal had settled on `0.75` text + `0.12` subtle divider while Medication
settled on `0.70` + `0.10`. Two siblings, one design intent, different decimals. That is one
decision that drifted, not two decisions.

## The mid-session collision with #540 (the important part)

While this was being built, **PR #540 ("Migrate on-dark colour + card spacing literals to theme
tokens", B-066/B-129) merged to `main`.** That was the exact tokenization sweep this work had
deferred *to* B-066/B-129 — but it tokenized each drifted literal at its existing value,
**preserving the drift as separately-named tokens**:

- text: `colorTextOnDarkSubtle` 0.70 / `colorTextOnDarkDetail` 0.75 / `colorTextOnDarkCaption` 0.65
- dividers: `colorDividerOnDark` 0.15 / `colorDividerOnDarkFaint` 0.12 / `colorDividerOnDarkFainter` 0.10
- plus `colorTextOnDarkFaint` 0.55 and `colorFillOnDark` 0.06

`main` also already carried a **B-646 backlog row** filed by another session — *"Rationalize the
on-dark alpha scale (collapse near-duplicate steps)"* — describing this exact follow-up: #540's
sweep preserved the drift as distinct tokens *on purpose* (a zero-behaviour move), leaving the
actual collapse as a separate behaviour-changing pass. So #540 and B-646 are not in conflict on
mandate — #540 = tokenize (mechanical, zero-behaviour); B-646 = rationalize the tokenized scale.

The PR was reconciled onto #540 rather than fighting it: this branch **merged `main`** and
re-expressed the collapse in #540's vocabulary. The original parallel tokens this session first
drafted (`colorTextOnDarkSecondary` alpha reuse, a `#909090` faint hex, a duplicate
`colorDividerOnDark`/`colorFillOnDark` block) were discarded — they'd have fragmented the token
system with second names for the same thing.

## The collapse (as shipped, on #540's tokens)

- **Text:** `colorTextOnDarkDetail` (0.75) and `colorTextOnDarkCaption` (0.65) **removed** → both
  fold onto **`colorTextOnDarkSubtle` (0.70)**, the established majority token (also used by the
  chip rows + PhotoViewer). `colorTextOnDarkFaint` (0.55) kept as the distinct faint rung.
  `colorTextOnDarkSecondary` (#B4B8B4, solid) kept — it's the solid-surface sibling for the
  paywall, a different ground from the translucent card tokens.
- **Dividers:** `colorDividerOnDarkFaint` (0.12) and `colorDividerOnDarkFainter` (0.10)
  **removed** → both fold onto **`colorDividerOnDark` (0.15)**. One rung on purpose: at
  `StyleSheet.hairlineWidth` the three were indistinguishable, so three tokens was the creep, not
  a scale. Subordinate rows (Meal combo, Med vehicle) keep their quiet from a dimmer label +
  spacing + foot-of-stack position, which they already had.
- `colorFillOnDark` (0.06) unchanged.

Verified: the four removed tokens were used **only** in the three files this session touched
(`MealCompletionCard` ×3, `MedicationCompletionCard` ×1, `AddConditionModal` ×1) — no wider blast
radius. After the collapse the two completion cards are identical on every shared on-dark value.

## Files changed (net, after the merge)

- `constants/theme.ts` — collapsed #540's on-dark block (removed `colorTextOnDarkDetail`,
  `colorTextOnDarkCaption`, `colorDividerOnDarkFaint`, `colorDividerOnDarkFainter`); comment
  rewritten to record the B-646 rationalization on top of the B-066/B-129 tokenization.
- `components/ui/MealCompletionCard.tsx` — 5 sites repointed onto `colorTextOnDarkSubtle` / `colorDividerOnDark`.
- `components/ui/MedicationCompletionCard.tsx` — repointed; twin drift repaired.
- `components/profile/AddConditionModal.tsx` — chip desc `Caption` → `Subtle`.
- `app/edit-event.tsx` — food-brand text stays `Subtle` (was 0.70, no change).

## Behaviour deltas (what dark-card QA verifies)

All ≤0.05 alpha, all in the calm direction:

- Meal flag-detail + combo text: `0.75` → `0.70` (a hair dimmer).
- Meal combo divider: `0.12` → `0.15`; Med vehicle divider: `0.10` → `0.15` (a hair more visible —
  the question is whether the subordinate rows still read as subordinate).
- `AddConditionModal` selected-chip desc: `0.65` → `0.70` (a hair brighter).
- Everything else at `0.70` / `0.15` / `0.06` / `0.55`: no visible change (same value, fewer names).

## The design conflict, flagged for the PM

This reverses #540's deliberate 3-way text split + 2-way divider split. Two sessions reached
opposite conclusions on the same tokens: #540 named each drifted step (subtle/detail/caption,
faint/fainter); B-646 says those are drift and collapses them. B-646 is the PM-sanctioned backlog
item explicitly mandating the collapse, and #540's own row on `main` frames its split as the
zero-behaviour interim awaiting exactly this pass — so this completes #540 rather than undoing it.
Surfaced in the PR for ratification; nothing merges without the PM's review + on-device QA.

## Out of scope (unchanged by this)

- Everything else #540 tokenized (PhotoViewer, capture screens, chip rows, PhotoCarousel, the
  page-dot, the black-scrim family) keeps its #540 tokens — those are not near-duplicates and are
  left alone.
- The `rgba(0,0,0,…)` scrim family is a separate scale (#540 named it `colorScrimPhoto` /
  `colorScrimBackdrop`); untouched.
- Distinct from **B-641** (`opacity: 0.4` disabled dim — whole-element opacity, not color-alpha).

## DoD

- `tsc --noEmit`: clean (exit 0), on the merged + collapsed tree.
- Tests: **N/A — pure token/UI change, no extractable logic** (Engineer exemption). Ran
  `jest components/` regardless: **48 suites / 395 tests / 2 snapshots pass**; full pre-push suite
  green on push.
- Anti-patterns: none — this reduces token count and removes redundancy; no new literals.
- Persona sign-off: **Designer ✓** (the collapse + twin-drift repair; a rung that isn't
  perceptibly distinct is creep) — **Engineer ✓** (reconciled onto #540's vocabulary rather than
  forking a parallel one) — **QA: on-device dark-card pass PENDING** (the gate) — Data / Dr. Chen
  N/A.
- Adversarial review: N/A (no clinically/statistically load-bearing logic).
- Future-self: the theme comment records *why* the collapse (drift, not intent; hairline
  indistinguishability; the twin split), so the next reader doesn't re-add a fourth alpha.
