# Session — Widget V2-PR-2: the layout rebuild (B-664)

**Date:** 2026-08-02
**Track:** Home Screen Widget v2 (informational rebuild) — spec `docs/nyx-widget-requirements.md` v2.0
**Shipped via:** #<PR> (draft)
**Builds on:** V2-PR-1 (#569 — the additive snapshot-v2 builders)

---

## What was built

The v2 layout rebuild — the widget goes from a **capture** surface (build 35) to an
**informational** one (V2-1: it never writes; every element is a `Link`).

1. **`widgets/CulpritWidget.tsx`** — full rewrite to the round-7 mock geometry:
   header (mark · pet · trial-day context) → 2×2 content-gated tile grid → ground
   band (trial strip / 7-day pips / dashed Log › chip) → the Up-next tile → the
   door states (signed out / schema mismatch / unbound slot / tombstoned pet).
   Pure renderer; no Button, no capture, no outbox. The schema version is **inlined**
   (`EXPECTED_SCHEMA_VERSION = 2`) because the layout runs as a bare string with no
   module graph (the JSC constraint) — the eval test asserts the door on a mismatch.

2. **`lib/widgetProps.ts`** — the v2 render contract. `WIDGET_PROPS_SCHEMA_VERSION`
   → **2**. New `WidgetPetPanel` (`classTiles` / `upNext` / `trialRecord` / `band`
   / `hasTodayEvents`), with all tile + band DISPLAY STRINGS composed here (the layout
   has no formatter at runtime). Removed the outbox/ui/picker types; kept
   `WidgetPendingCapture` / `V1OutboxProps` / `collectOutbox` **only** for the §3
   one-time v1 residual-outbox drain.

3. **`lib/widgetSnapshot.ts`** — the publisher assembles the v2 block: reads today's
   med doses + symptom events + the 7-day coverage row, resolves the med cadence
   denominator, and reuses **`loadTrialPredicateFacts`** (the trial card's own loader)
   for `computeTrialFacts` coverage + covered-day indices. `buildWidgetSnapshot` now
   builds the block internally from raw inputs (reusing the computed `slotRows`, so
   the Up-next tile and the header read ONE learned-window definition). Removed
   `mealChoices` / `treatChoices`.

4. **`lib/widgetBridge.ts` + `hooks/useWidgetSnapshots.ts`** — retired the per-tick
   `syncWidget` drain-then-publish. Ticks now publish-only; the **first** publish per
   session runs `drainResidualV1Outbox` (§3 upgrade path) — idempotent, a no-op once
   the timeline is v2. The W4 App Intents (`lib/widgetCapture.ts`) stay in the repo,
   **parked** as the B-291 Siri/hardware rail.

5. **`lib/dietTrial.ts`** — added `coveredDayIndices: number[]` to `TrialFacts` (the
   covered local-day set the widget strip paints, from the same set `daysLogged`
   counts — the §5.3 one-predicate rule applied to the strip). Additive; `[]` on the
   null-range paths.

## Decisions made (build-detail calls, flagged for the gate reviews)

- **D-med-denominator:** the aggregate med tile shows a denominator ("1 of 2 today")
  **only** when the pet has exactly one active regimen with a known positive-integer
  `doses_per_day` AND every med dose today belongs to it — otherwise count + recency
  ("2 · last 6:15p"). This is the B-614 confirmability gate applied to the aggregate:
  a denominator renders only when it is unambiguous, never a fabricated cross-med bar
  (N2). The cadence gate mirrors `lib/medStrip.ts`'s `doses_per_day > 0`, not a second
  definition.
- **D-grid-geometry:** the grid rows FLEX (`maxHeight: Infinity`) while the header
  (16pt) and ground band (34pt) are FIXED — so the band can never be squeezed off the
  bottom (round 6's failure), and nothing competes with it. §2.1's "fixed shares" is
  honoured by fixing the two regions that must not move and letting the grid absorb the
  remainder; the tile heights land ~44pt on a standard medium and are verified
  on-device in PR 3.
- **D-symptom-tile:** mixed symptom types lead with the most recent type as the label,
  the leading type's count as the value ("Vomiting ×2"), the total in the sub
  ("3 symptoms today") — the §2.3 ① build-detail call. Symptom labels are uppercased
  small-caps (matching the mock's `text-transform`) in gerund form (Vomiting / Itching
  / Loose stool / Scratching / Skin / Lethargy), the widget's own label set (not the
  History nouns). Both flagged to `pm-feature-review`.
- **D-strip-alignment (known limit):** `buildTrialSnapshot` (V2-PR-1) paints
  `coverage.daysElapsed` dots from the trial's start index. On a HEAD-CLIPPED trial
  (owner back-dated to the clinic visit, logged from home) the clipped `daysElapsed`
  is shorter than days-since-start, so the strip's dots can misalign from the covered
  set — the caption (the authoritative record statement) stays correct. Rare; the
  common no-clip case is exact. Noted for the on-device pass.

## Gates

- `code-reviewer` — <outcome>
- `pm-feature-review` — <outcome>
- Designer (in-context persona) — SHIP-SHAPED against the seven principles: symptom
  tile always first + never dropped (P3), empty state designed + forward-looking (P5),
  Up-next warm-not-nagging + never gains urgency (P4), no monetization/AI (P7/D9),
  coverage-never-wellness on the band (§8). Geometry approximations (flexing grid, the
  pip "today" accent-vs-outline) verify on-device in PR 3.

## Tests

- `widgets/CulpritWidget.test.ts` rewritten — the JSC eval in a faithful stand-in
  context (no import leaks), structural geometry (shell = header · grid · band, 2×2
  rows, fixed 34pt band + Divider, ellipsized lines), the "never writes" gate (no
  Button / press handler on any surface), and the banned-vocabulary grep gate (both a
  rendered-output pass over every state and a source-literal pass).
- `lib/widgetProps.test.ts`, `lib/widgetBridge.test.ts`, `lib/widgetSnapshot.test.ts`
  rewritten for the v2 contract; `lib/dietTrial.test.ts` gains a `coveredDayIndices`
  pass. Timezone-honest (verified UTC / UTC+14 / UTC+12:45 / UTC−10).
- Full suite green (189 suites / 4161 tests); `tsc --noEmit` clean.

## Follow-ups

- **V2-PR-3** — fresh dev-client build from post-PR-2 `main`; walk every §2.6 state on
  the PM's device (incl. stale-snapshot + two-pet stacking), verify the geometry
  approximations render, close **B-481**.
- **V2-PR-4** — the TestFlight cut (widget UI is not OTA-able).
- The `src=widget` deep-link param rides from day one; the widget-sourced-opens metric
  waits on the B-016 analytics rail (§5 success measure).
