# On-dark alpha scale rationalization (B-646)

**Date:** 2026-08-01

**Shipped via #TBD** — draft PR, gated on on-device dark-card QA (this is a behaviour change).

## The task

A designer-lens review of the on-dark token block in `constants/theme.ts`: collapse the
near-duplicate alpha steps the backlog described (text `0.65` / `0.70` / `0.75`; dividers
`0.10` / `0.12` / `0.15`) into a principled scale. Flagged up front as a behaviour change, so
it carries an on-device dark-card QA gate.

## What the review found

The near-duplicate alphas **were not in `theme.ts`** — they lived scattered at the call sites,
which is precisely why they drifted. Mapping every on-dark white literal to its semantic role,
three roles were each split across near-duplicate decimals:

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

## The principled scale (added to `theme.ts`)

**On-dark ink ladder** (solid hexes, matching the existing on-dark text convention — an
alpha-white would shift hue over a *coloured* dark ground; alpha is reserved for photo scrims):

| Rung | Token | Value | Absorbs |
|---|---|---|---|
| primary | `colorTextOnDark` (existing) | `#FFFFFF` | — |
| emphasis | `colorTextOnDarkMuted` (existing) | `rgba(…,0.92)` (scrim only) | — |
| secondary | `colorTextOnDarkSecondary` (existing) | `#B4B8B4` (≈0.70 on near-black) | 0.65 / 0.70 / 0.75 |
| faint | `colorTextOnDarkFaint` (**new**) | `#909090` (≈0.55 on near-black) | 0.55 |

`#B4B8B4` on the cards' `#0A0A0A` ground computes to ≈ `rgba(255,255,255,0.70)`, so the trio
collapses onto the *existing* secondary token with no visible change at 0.70 and a ≤0.05 shift
at the drifted ends.

**On-dark line/fill** (translucent white — a hairline should read as "N% of white showing
through" and track the card ground):

| Rung | Token | Value | Absorbs |
|---|---|---|---|
| divider | `colorDividerOnDark` (**new**) | `rgba(…,0.15)` | 0.10 / 0.12 / 0.15 |
| fill | `colorFillOnDark` (**new**) | `rgba(…,0.06)` | 0.06 |

**One** divider rung on purpose: at `StyleSheet.hairlineWidth` (~0.5px), `0.10` / `0.12` / `0.15`
white are perceptually indistinguishable, so three values is itself the creep we're fixing. The
subordinate rows (Meal's combo entry, Med's vehicle row) keep their quiet from a dimmer label +
tighter spacing + foot-of-stack position, which they already had. If on-device QA finds a
subordinate row now reads as a peer, the fix is spacing/label weight — not a fourth alpha (noted
in the token comment).

## Files changed

- `constants/theme.ts` — the ladder + 3 new tokens (`colorTextOnDarkFaint`, `colorDividerOnDark`,
  `colorFillOnDark`), documented.
- `components/ui/MealCompletionCard.tsx` — 8 literals → tokens (this repairs its half of the twin drift).
- `components/ui/MedicationCompletionCard.tsx` — 7 literals → tokens (its half of the drift).
- `components/profile/AddConditionModal.tsx` — selected-chip desc `0.65` → secondary.
- `app/edit-event.tsx` — selected food-brand `0.70` → secondary.

After this, the two completion cards are byte-for-byte identical on their shared on-dark values.

## Behaviour deltas (what dark-card QA verifies)

All ≤0.05 alpha, all in the calm direction:

- Meal flag-detail + combo text: `0.75` → ≈`0.70` (a hair dimmer).
- Meal combo divider: `0.12` → `0.15`; Med vehicle divider: `0.10` → `0.15` (a hair more visible —
  the question is whether the subordinate rows still read as subordinate).
- `AddConditionModal` selected-chip desc: `0.65` → ≈`0.70` (a hair brighter).
- Everything at `0.70` / `0.15` / `0.06` / `0.55`: no visible change (same value, now named).

## Out of scope (handed to the existing sweep)

- Photo-scrim / chip-outline literals — `PhotoViewer`, the capture screens, `FilterChip`
  (`0.85` chip label, `0.3` chip outline), `food-capture`, `PhotoCarousel`, `profile` — belong to
  the **B-066 / B-129** on-dark literal sweep, which should point at these tokens when it runs.
- The **black-scrim** family (`colorScrim` 0.35, the `rgba(0,0,0,0.4)` card backdrops,
  `colorScrimDark` 0.55) is a *separate* scale from this white-ink one; left untouched. The
  `rgba(0,0,0,0.4)` backdrops in the two cards are the only rgba literals remaining there.
- Distinct from **B-641** (`theme.opacityDisabled` for the `opacity: 0.4` disabled dim) — that's
  whole-element opacity; this is rgba color-alpha. No overlap.
- The `'#fff'` primary literals in the cards (`title`, `action`, `flagHeadline`) are unambiguous
  primary, not near-duplicates — left for the B-066 literal sweep to keep this diff to the *scale*.

## DoD

- Acceptance criteria: N/A build-step (design-token rationalization, backlog B-646).
- `tsc --noEmit`: clean (exit 0).
- Tests: **N/A — pure token/UI change, no extractable logic** (Engineer exemption). `theme.ts` is
  constants; the two cards have no co-located tests. Ran `jest components/` regardless: **48
  suites / 389 tests / 2 snapshots all pass** (the snapshots don't pin these values).
- Anti-patterns: none introduced — this *removes* hardcoded on-dark values (advances the
  "theme tokens only" rule + B-066/B-129).
- Persona sign-off: **Designer ✓** (the ladder + the twin-drift repair; principle: a scale rung
  must be perceptibly distinct or it's creep) — **Engineer ✓** (token architecture: solid hex for
  solid grounds, alpha for translucent lines; `colorDividerOnDark` named distinctly from the solid
  `colorBorderOnDark`) — **QA: on-device dark-card pass PENDING** (the gate) — Data / Dr. Chen N/A
  (no clinical/statistical logic).
- Adversarial review: N/A (no clinically/statistically load-bearing logic).
- Future-self: the ladder is documented in-token with the "why one divider rung" rationale, so the
  next reader inherits the decision, not a mystery decimal.
