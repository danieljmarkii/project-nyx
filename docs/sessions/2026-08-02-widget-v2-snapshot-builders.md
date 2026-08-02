# Widget V2 PR 1 — the snapshot v2 builders

**Date:** 2026-08-02

**Shipped via #____** (draft). Branch `claude/widget-v2-snapshot-builders-ae416o`.

## What this is

**V2-PR-1** of the informational-widget redesign (**B-664**). Per the ratified
spec **`docs/nyx-widget-requirements.md` v2.0 §3 + §7**: the four additive snapshot
builders, alongside the v1 fields, "nothing consumes them yet; build-35 widgets
keep rendering v1 props." The layout rebuild + props-schema flip to 2 + publisher
DB reads are **V2-PR-2**.

New: `lib/widgetSnapshotV2.ts` (+ `.test.ts`). Touched: `lib/widgetSnapshot.ts`
(four optional fields + a passthrough opt-in), `lib/widgetSnapshot.test.ts` (wiring
tests).

## A mid-session spec landing (why the diff reconciled once)

The task said "build the snapshot v2 additions **per §3**." At the commit this
branch forked from (`7c2d5ae`), that §3 was still the v1 `logged_via` section and
no `todayByClass`/`upNext`/`sevenDays` shapes existed anywhere — so the first cut
built to *provisional* semantics and flagged D8/§8/B-542 as open PM calls. Mid-
session, a sibling session merged **#563** to `main` — the PM-ratified **spec v2.0**
(the informational-widget redesign, rounds 4–7) — which defines these exact fields.
After a clean fast-forward of the base, the builders were **reconciled to §3's
shapes**, and the four flags the first cut raised are all **resolved by the spec**:

- **D8** reshaped: v2 has no capture, so the med/symptom *display* exclusion
  dissolves — all four classes render as record facts.
- **V2-3**: symptom naming ("Vomiting ×2") is ratified on the post-unlock Home
  Screen, so the tiles carry names.
- **B-542 R6** (diet-name privacy): the ratified trial block shows **day counts
  only**, never the diet name — so `foodLabel` was dropped from the trial shape.
- **upNext**: the Up-next tile is the **learned meal window only** (§2.4); meds get
  their own tile with a cadence-gated count. The provisional med-in-upNext path was
  removed.

## The four builders (to spec §3)

| Builder | Output | Reuse (no re-derivation) |
|---|---|---|
| `buildTodayByClass` | per class `{count, lastAt, names[], times[]}`; meds `+expectedToday`; symptoms `+leadingType` | `localDayIndex`/`localDayIndexOf` |
| `buildUpNext` | `{label, approxTime} \| null` — next unlogged learned window | the learned `WidgetSlotRow`s (SLOT_MIN_DAYS floor inherited) |
| `buildSevenDays` | `[{dayKey, logged, symptomLogged}]` — coverage booleans, local days | `localDayIndex`/`localDayIndexOf`/`dayKeyFromIndex` |
| `buildTrialSnapshot` | `{day, target, daysLogged, daysElapsed, stripDays[]}` \| null | `getDietTrialProgress` (day/target) + `isTrialRunning` (B-422 gate); `daysLogged`/`daysElapsed` **passed in from `computeTrialFacts().coverage`** |

Decisions worth carrying:
- **The trial numbers come from the card's own `computeTrialFacts().coverage`**, not
  a widget re-derivation — AC 5 (strip agrees with the card) is satisfied by
  construction. `stripDays` is painted from `coveredDayIndices` (the same covered-day
  set), but `daysLogged`/`daysElapsed` are taken from `coverage` and never recomputed
  from the set, so an inconsistent set can never make the caption drift from the card.
  A test feeds a deliberately inconsistent set to pin this.
- **`todayByClass`/`sevenDays` take pre-classified rows** — the event_type→class
  mapping and name resolution is the loader's job (V2-PR-2), so the builders never
  re-derive the app's event taxonomy; they own the tz-honest bucketing, which is the
  substance the tests pin.
- **`sevenDays` is LOCAL-day honest**, deliberately unlike `hooks/useTrend.ts`
  (still UTC-keyed via `occurred_at.split('T')[0]`).
- **`buildTrialSnapshot` re-gates internally** with `isTrialRunning`, so a stale-
  active trial (B-422) drops exactly as the v1 counter does.
- **`medExpectedToday`** is resolved upstream from the same `doses_per_day` the
  med-strip cadence predicate reads (the B-614 gate) and passed in — the denominator
  renders only when the cadence is known.

## The additive wiring

`WidgetSnapshot` gains four **optional** fields, carried by `buildWidgetSnapshot`
as a **passthrough** of a pre-built `WidgetSnapshotV2` (the opt-in `v2` input). The
production publisher passes nothing, so the default path is **byte-identical** —
the existing D9 "no forbidden field" contract test passes unchanged, and nothing
new reaches the App Group until V2-PR-2. `WIDGET_PROPS_SCHEMA_VERSION` is **not**
bumped here (that is PR-2's flip).

## DoD

- **AC:** the spec §5 v2 ACs that this data layer underwrites — AC 5 (trial strip
  agrees with the card: numbers from shared `computeTrialFacts`), AC 8 (no AI/
  reassurance/monetization: counts/coverage/labels only). The render-side ACs
  (1–4, 6, 7, 9, 10) are V2-PR-2/PR-3.
- **Types:** `tsc --noEmit` clean, no `any`.
- **Tests:** `lib/widgetSnapshotV2.test.ts` (each builder, B-514 timezone-honest —
  explicit zone args, `Pacific/Kiritimati` / `Pacific/Honolulu` drift proofs) +
  `lib/widgetSnapshot.test.ts` passthrough/additivity tests. Full suite green and
  both widget suites green under the three CI zones (UTC+14 / UTC+12:45 / UTC−10).
- **Adversarial review:** N/A — projects already-reviewed predicates
  (`isTrialRunning`, `getDietTrialProgress`, `computeTrialFacts` coverage), computes
  no new clinical/statistical judgment. `code-reviewer` ran; it independently
  reached the same shape-reconciliation finding (against the pre-reconciliation cut)
  and verified the day-math/predicate-reuse/additivity/tz-honesty of the structure.
- **Persona sign-off:** Engineer ✓ (additive, passthrough, one-predicate reuse) —
  Data ✓ (counts/coverage/day-math only) — Designer N/A (no UI) — Dr. Chen N/A —
  T&S ✓ (spec §8 invariants carried; symptom naming within the ratified post-unlock
  posture).
- **Future-self:** the v2 snapshot block is a new pattern — worth it: it isolates
  the redesign's data from its render and keeps the App-Group surface gated behind
  an opt-in the publisher does not yet flip.
