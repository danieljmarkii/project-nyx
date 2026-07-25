# Vet-report protein render — B-351 Phase A, slice 5

**Date:** 2026-07-25

Shipped via **#448** (draft). Step 9 / B-351 Phase A slice 5 — the last Phase A slice, and the one
that puts multi-protein capture in front of the person it was built for.

## What shipped

`generate-report` read `food_items.primary_protein` and nothing else, so every secondary protein
slices 1–4 taught the app to capture was invisible on the one surface a clinician actually reads.
The three food joins widened to `proteins, ingredients_notes, ai_extraction_confidence` and the
report now renders the captured **set**:

- **Page 1, trial-diet line** — the trial food's own off-trial protein (§8 shape ①), *and* any
  off-trial protein sitting in a free-fed bowl, *and* an explicit note when the trial food's panel
  was never captured.
- **Appendix B** — a new "Proteins in the diet" block: one row per food the pet lives on, primary
  bold, secondaries subordinate, provenance stated once.
- **Appendix C + E** — the full set in the protein column, with `list not read` where the panel was
  never captured.
- **Tally + weekly chart** — set membership. A duck-and-chicken treat is a chicken exposure; the
  units (feedings vs exposures) are carried separately and the render says so.

D10 governs every claim about what is *not* in a food: the same `mayClaimCompleteProteinSet` gate
the client's Tier-1 disclosure uses, extended to the aggregate as a "floor, not a total" disclosure.

## The bug the reviews caught, and why it matters beyond this slice

The first implementation used `deriveProteinSet` to turn a stored row into a set. That is a **write
path** function — it applies D3a's Class-B rules (aliases, tissue and descriptor strips) — while the
trial target resolved through `canonicalizeProtein` (Class A). So the two sides of the off-trial
equality were keyed by different functions, and any protein whose Class-B key differs from its
Class-A key **failed to match itself**.

A trial food stored `ocean whitefish` — spec §11 records three such rows live — rendered, in bold on
page 1: *"The trial food's own label also lists Whitefish."* For a whitefish trial. Same break for
`Buffalo`, `Deer`, `Deboned Chicken`, `Chicken Liver`, `Egg Whites`.

Two things make this worth writing down rather than just fixing:

1. **`lib/protein.ts:202` already banned it in so many words** — *"Never call
   normalizeExtractedProtein / deriveProteinSet from a read path"* — and the code was written anyway,
   by someone who had read that file. A comment is not a guardrail.
2. **It re-created the exact split the session had just refactored to prevent.** `lib/trialProtein.ts`
   was extracted *in this session* so the client and the report could not disagree about the off-trial
   question. Keying the set differently reintroduced the disagreement one layer down: the app would
   have told the owner the trial was clean while the report told the vet it was contaminated.

Fix: `readProteinSet` in `lib/protein.ts` — `deriveProteinSet`'s shape (hoist the owner-designated
primary, dedupe) keyed Class-A only. The rule is not "normalize both sides", it is **a read path uses
one keying function**. Semantic re-keying of stored rows stays B-416's job, on the write path, where
an owner can see and correct it.

The regression test was verified to fail against the old code before the fix was restored.

## The cold read's blocking findings

The `vet-report-cold-read` returned **NOT READY** on the first artifact, and its most valuable finding
was not a bug at all — it was that page 1 told the *wrong story about the case*. Reading page 1 alone,
Dr. Chen concluded "contaminated trial food, fix the treats and re-run". The real answer was that a
free-fed chicken/turkey bowl meant the elimination diet **was never run** — and that fact was on
page 3. Two fixes came out of it:

- The ad-lib competing antigen now sits on the line the trial is described on. An ad-lib exposure
  outranks the discrete ones below it.
- Appendix E — the table a vet checks for what the patient actually ate — was rendering the
  contaminated trial food as clean `duck`. Slice 5 had added sets to B and C and missed E.

Also from the cold read: page-1 silence conflated "clean trial diet" with "nobody read its label"
(and today unread is the common state, so silence defaulted to the reassuring reading); the table-cell
marker hierarchy was inverted (bold `*`, near-universal and low-information, against a faint `…`
carrying the highest-information fact on the sheet); and the provenance line implied a *human* read a
label when it is an automated read of an owner's photo.

## Deliberate deferrals

Four findings were real but out of this slice's blast radius, and are filed rather than fixed:

- **B-441** — a stale `ai_extraction_confidence` can manufacture "nothing else on the label" after an
  owner edits the set. Unsafe direction, and the mirror of B-437. Not fixed here because the available
  proxy (`food_items.source`) flips on *any* AI-field override, so gating on it would retire the
  completeness claim on genuinely panel-read sets over a brand-name typo — degrading a PM-ratified
  predicate on the report's behalf without a PM call. The precise fix is on the write path.
- **B-442 / B-443** — the cold read's other two blocking findings, both pre-existing: the bare negative
  correlation line (absence rendering with more confidence than a finding), and 90 rated meals
  collapsing to a single `—`.
- **B-444 / B-445** — the false "reads in black & white" claim, and trend arrows that split the window
  into unequal halves and so bias toward "worsening".

## Notes for the next session here

- **Phase A is complete with this slice.** Phase B (slice 6, set-membership *correlation* with
  collinearity clustering) is the gated, `adversarial-reviewer`-mandatory one. The report currently
  *displays* a wider exposure picture than it *correlates* over; that seam is commented in `report.ts`.
- **B-416 matters more now than it did yesterday.** All 59 live rows have `|proteins| ≤ 1`, so on
  today's data almost every food renders single-protein-and-incomplete. The report is honest about it,
  but the feature does not actually pay off until the backfill runs.
- `tsconfig.json` gained `allowImportingTsExtensions` — a `lib/` module shared with the Edge Functions
  has to spell its own intra-lib import the one way both Deno and Metro resolve.
