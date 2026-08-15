# Daily Recap DR-1 — the night spine + four states (CUL-23)

**Date:** 2026-08-15

Built the centrepiece of the Daily Recap track (B-762): `app/day-summary.tsx` rebuilt
from a light doorway-list into the always-night "day spine" recap, with the pure models,
the shared night node-tint constants, and the four state frames from the design lock
(`docs/culprit-daily-recap-mockups.html` §2). Shipped via **#<PR> (draft)**. Blocked-by
CUL-20 (the fire-day anchor) landed first (#651), so DR-1 was unblocked at session start.

## What shipped

- **`constants/theme.ts`** — minted `colorEventMedicationOnNight` (`#93ADCB`), the night
  sibling of the light-ground med slate. AA verified, not asserted: **7.91:1 on
  `colorBrandNight` #13112E, 6.43:1 on `colorBrandNightElevated` #251F57** — clears AA
  *text* on both grounds (the dot only needs the 3:1 graphical target).
- **`lib/daySummary.ts`** — grew the pure recap models (no I/O, no throw):
  - **C0 lead line** — one count-anchored serif sentence by fixed precedence **symptom →
    trial → counts**; deterministic + unit-tested; no verdict/arrow/percentage.
  - **C2 count chips** — per-category, symptoms named + rose-toned, never totalled.
  - **C3 trial strip** — `Day N of M · K trial-diet meals logged today` (K a floor count),
    identity via `trialIdentityLabel`, day-math via `getDietTrialProgress`, gated on
    `isTrialRunning` — shipped predicates only, no re-derivation.
  - **C4 med course strips** — mapped from the pure `resolveMedStrips` (so the §7 collapse
    rule, `dosesTowardTarget` and the withholding set are inherited); flat doorways, no
    confirm button, no bar.
  - **C5 forward line** — `Tomorrow is day N+1 of the trial.` only when a real, within-target
    tomorrow-fact exists; never a manufactured "day M+1".
  - **"Trial diet" spine sub-line** — a meal TODAY's trial classifies as `primary_diet`
    (from the shipped `TrialExposureItem`s), positive-marking only (D2). The strip count is
    read back off the marked rows, so "K trial-diet meals" IS the number of "Trial diet"
    sub-lines on screen — one fact, two renders.
- **`components/recap/`** — `nodeTints.ts` (the shared day/night dot map, so DR-2's lane
  can't drift), `DaySpine.tsx` (the timeline-as-list — time labels, category-tinted nodes
  on a thread, every node → `/event/[id]`), `RecapStrip.tsx` (the flat night doorway for
  C3/C4), `CountChips.tsx`.
- **`hooks/useDaySummary.ts`** — loads the rich single-pet inputs (`loadDietTrialFacts` +
  `loadTrialPredicateFacts` + `loadMedStripInput`) defensively (a rich-load failure degrades
  to no-strip, never blanks the recap — the error state is reserved for a failed ROW read).
- **`components/ui/Header.tsx`** — additive `night` prop (brand-night, borderless,
  on-night glyphs); every existing light call site is byte-identical.
- **Tests** — `lib/daySummary.test.ts` (+34 cases: lead precedence, chips, strip, forward,
  med-map, sub-line/count invariant, single-vs-multi gating, refusal surfacing, a G2 /
  Change-Contract banned-words scan); `components/recap/*.test.*` (13); `app/day-summary.test.tsx`
  (4-state wiring). All green; non-UTC CI (UTC+14 / −10 / +12:45) honest.

## Decisions made

- **Always-night, single-pet-rich / multi-pet-plain** (mock-faithful): the lead/chips/
  strips/forward/"Trial diet" sub-lines are the SINGLE-pet experience; a multi-pet account
  renders plain per-pet spines. This matches the ratified mock's four frames but withholds
  the wedge content from every two-pet owner — surfaced as a **PM decision brief** (below;
  execution filed B-770).
- **The trial-diet count is OFFERED feedings, not eaten** — spec §2.5 mandates "predicates
  only", and `classifyFeeding` deliberately does not read intake ("a bowl put down and
  refused is a day the owner kept the record"). So the count includes refused trial-diet
  meals; intake is disclosed per-row (`· refused`) and refusal *flagging* stays on the
  Signal card / vet report (the verdict surfaces), not the record-facts recap. Framework-
  consistent by construction.
- **Refusal surfacing in the lead (PROVISIONAL — enforced as a safety default).** Both the
  Dr. Chen read and `pm-feature-review` flagged that the lead counting refused meals as
  plain "meals" is the product-surface version of *intake-is-not-preference* (a full-refusal
  trial day would headline "three meals in Biscuit's record"). Added `mealRefusalClause`: the
  lead names refused bowls (`, all refused` / `, two refused`), keeping the all-eaten day
  byte-identical to the mock. Errs toward surfacing the concern; flagged for clinical-guardrails
  / Dr. Chen / PM copy ratification + a mock frame (the chips half is B-769).
- **Strips are doorways only** — no confirm button, no progress bar (R-3). They door to the
  Pet tab (matching the Home strips); a deep-link to the specific card is B-771.

## Gates

- **nyx-voice** ✓ — pet named by name (P1), specific/count-anchored (P2), plain "vomit"/
  "loose stool" not "emesis"/"diarrhea" (P5), no `!` (P4, test-scanned), no reassurance on
  absence (P6, G2-tested), designed zero-log + calm error copy (P3/P8).
- **Night AA** ✓ — full matrix computed, every combo clears its target (text ≥4.5:1: lead
  15.8 / titles 15.4/12.5 / muted 7.6/6.2 / rose 6.8/5.5 / accent-CTA 8.1; glyph ≥3:1: dots
  meal 8.1 / med 7.9 / symptom 6.8 / other 7.6).
- **Dr. Chen (in-context)** ✓ with one surfaced point — the refused-trial-diet-meal count.
  Verified the count semantics are framework-consistent (offered feedings, refusal disclosed
  per-row) and the recap correctly leaves *flagging* to the verdict surfaces. The one live
  concern (the lead burying refusal) was addressed by the provisional refusal clause; the
  exact copy/precedence + the chips half await Dr. Chen ratification.
- **pm-feature-review** — single-pet good-day recap SHIP-SHAPED / on-wedge; zero-log + error
  SHIP-SHAPED; **NEEDS-WORK** on the refusal-blind lead (now addressed provisionally) and a
  **PM decision** on multi-pet suppression (below). INSUFFICIENT items (need the device pass):
  window-time in the serif lead (verified sentence-safe in code — all `describeOccurredAt`
  compact forms compose cleanly), night-ground beauty/spacing, med-strip-vs-spine-dose density.
- **code-reviewer** — **Fix-before-merge**, all findings addressed: **[BUG]** the med strip
  computed its day-math against wall-clock now, not the rendered/anchored day — on a stale
  after-midnight tap (anchor = yesterday) it would describe *today's* dosing on a yesterday-
  dated screen (fixed by threading the builder's `input.nowMs`/`timeZone` into `resolveMedStrips`,
  + a locking test — the anchor-fallback made the reviewer's "pass anchorMs to the loader"
  suggestion incomplete, so the fix lives in the builder against the rendered day). **[anti-pattern]**
  DaySpine row tap target fell to ~40pt (`minHeight` bounds the border-box) — bumped to 44.
  **[cleanup]** the trial predicate was read twice per tick — collapsed to one
  `loadTrialPredicateFacts` (it returns the protein-named trial AND `facts.exposures.items`; my
  earlier two-call read was redundant). **[nit]** rich reads now skip a zero-log day. The reviewer
  independently verified the night AA numbers, the `lib/daySummary` purity precedent, the `Header`
  night prop's 19 untouched call sites, and the count/sub-line invariant, and re-routed the refusal-
  lead judgment to the clinical gate (addressed above).
- **Adversarial review** — N/A: the recap adds no new detection/escalation/threshold and does
  not feed the vet report; the one clinically load-bearing input (the feeding classification)
  is the shipped, already-adversarially-reviewed `classifyFeeding`, consumed not re-derived.
  The refusal clause counts a logged fact (`detail === 'refused'`), asserted by unit tests.

## PM decision briefs

1. **Multi-pet suppression.** *Deciding:* does a multi-pet account keep plain per-pet spines,
   or do the per-pet trial strip + "Trial diet" sub-lines render inside each pet's section?
   *Options:* (A) keep as-locked (single-pet-only rich recap) — mock-faithful, simplest, but a
   two-pet wedge owner loses their trial dog's recap surface at a hard cliff; (B, recommended)
   render the per-pet strip + sub-lines per section (the whole-screen lead/chips stay single-pet)
   — it's the wedge content and it's unambiguous per-pet. *Consequence:* (B) is a spec §2
   states-clause edit + a new mock frame + un-gating the hook's per-pet rich load (B-770); (A)
   ships as-is and documents the single-pet-only wedge as a knowing tradeoff.
2. **Refusal in the lead/chips — ratify the provisional clause.** *Deciding:* the exact copy +
   whether the chips also surface refusal. *Options:* (A, shipped provisionally) lead appends
   `, all refused` / `, N refused`, chips unchanged; (B) also break refusal into the chips
   (needs a model call — a distinct chip vs a tone, without conflating category with intake);
   (C) revert to offered-count-only + rely on per-row `· refused`. *Recommendation:* keep (A)
   as the safe interim, route the chips (B-769) + a mock refusal-day frame to Dr. Chen/nyx-voice.
   *Consequence:* the clinical gate signs the copy; a mock frame lands in the next round.

## Follow-ups filed

B-768 ("Photo attached" sub-line — the timeline query carries no attachment flag) · B-769
(refusal-aware chips) · B-770 (multi-pet per-pet strip + sub-lines, gated on decision 1) ·
B-771 (strips deep-link to the specific card) · B-772 (WET/DRY format tag on the spine).

## Next

DR-2 (CUL-25, TodayZone v2 — the recap band) and DR-3 (CUL-26, the offer) are unblocked by
DR-1. DR-2 reuses `components/recap/nodeTints.ts` for its horizontal lane. Both are parallel-safe.
