# Session — More-events picker redesign, PR 2 (the sheet)

**Date:** 2026-08-13
**Track:** B-745 (More-events / log event-picker redesign) — PR 2 of 3
**Branch:** `claude/event-type-picker-sheet-zqkvyv`
**Outcome:** shipped via #634 (draft)
**Spec:** `docs/nyx-more-events-picker-requirements.md` v1.0 §4 PR 2 · design authority `docs/culprit-more-events-mockups.html` round 4 frame 1

---

## Build phase

Parallel track (not Step 10). B-745 PR 0 (`log_picker_v2` flag seed, #632) and PR 1 (the new picker in place, #633) shipped. This is **PR 2 — the sheet**: the "More events" destination presented as a bottom sheet over the current tab, the Stool sub-step split inline, and a pet switcher on the sheet title. "B-007's destination half." PR 3 (the one-surface confirm) remains.

Presentation and step-structure only (§1): no data-semantics change — same event writes, same `EVENT_TYPES`/`EventIcon` render path, same `occurred_at_confidence` model, same route-param handler.

## What was built

- **`components/log/EventTypeSheet.tsx`** (new) — the "More events" destination as a bottom-sheet `Modal` over the current tab. Chrome matches `SheetShell`/`PetSwitcherSheet`/`ScopeMenu` (scrim `colorScrim`, grabber, `radiusLarge` top corners, safe-area bottom pad). Title = "Log for {pet}" with a `ChevronDown` switch affordance for multi-pet households (single-pet sees a plain non-interactive title — the app-wide switcher convention). The title reuses `PetSwitcherSheet`, rendered as a **sibling Modal** (not nested) so the two transparent Modals stack predictably. Selecting a type closes the sheet and hands off to the existing sub-flow via `router.push('/log?type=X')`.
- **`components/log/EventTypePicker.tsx`** — extracted the grouped grid body into an exported **`GroupedEventGrid`** (no ScrollView of its own) so both the full-screen picker (log.tsx) and the sheet render it inside their own bounded scroll. Added the **split Stool tile**: a full-width row (glyph + "Stool" label, not tappable — identity) with **Normal → `stool_normal`** and **Loose → `diarrhea`** segments (`hitSlop` to clear the 44pt floor). The Normal/Loose sub-step is deleted on the flag-on paths. A general layout rule keeps the grid balanced: within a group, the last regular tile spans full-width when the regular-tile count is odd (the mock's Symptoms case — Vomit+Lethargy pair, Stool spans, Itch fills the row), derived from the group not hardcoded per key. Flat grid untouched → **flag-off byte-identical (snapshot passed pre-`-u`).**
- **`components/log/FAB.tsx`** — "More events" opens the sheet when `log_picker_v2` is live (`useAllowlistFlag('log_picker_v2') && useBetaOptIn('log_picker_v2')`, both hooks unconditional then combined), else pushes `/log` unchanged (byte-identical). Hosts the always-mounted, inert-until-visible `EventTypeSheet`. The quick-food + Vomit/Loose-stool taps are untouched.
- **`app/log.tsx`** — `handleTypeSelect` stool routing now branches on `pickerV2`: the flag-off flat grid's single Stool tile still opens the sub-step; the flag-on grouped grid's split segments (and `diarrhea`) route straight to `simple`. The `stool-type` step is retained for flag-off. One-line change; no other flow touched.
- **Tests** — `EventTypeSheet.test.tsx` (new): titles for the active pet, each tile routes into `/log?type=`, the split segments route to `stool_normal`/`diarrhea`, Meal/Weight route to their sub-flows, and the switch affordance appears only multi-pet. `EventTypePicker.test.tsx` updated for the split-tile routing + group membership; grouped snapshot regenerated; **flat snapshot unchanged (FL-1)**.

## Decisions made

- **Architecture — the FAB hosts the sheet; flag-off is 100% untouched.** `/log`'s route presentation is a static `presentation: 'modal'` in `_layout.tsx` — it can't be made conditionally transparent, and QA spine #2 requires flag-off pixel-identical. So the flag branch lives in the FAB: flag-on opens a `Modal`-based sheet (the app's idiomatic bottom-sheet — `SheetShell`/`PetSwitcherSheet` are all transparent Modals), flag-off pushes `/log`. Clean seam, no route-config change.
- **The sub-step is bypassed by construction, not by a new write path.** The sheet routes `stool_normal`/`diarrhea` through `/log?type=`, which the existing route-param `useEffect` already sends to `simple` (not the sub-step). No data-semantics change; the sub-step survives only on the flag-off flat grid.
- **The split tile lives in the shared `GroupedEventGrid`.** So the flag-on full-screen grouped picker (reached from the secondary bare-`/log` doors) splits Stool identically to the sheet — one grouped presentation, no divergence. The `handleTypeSelect` `!pickerV2` branch is what keeps flag-off's sub-step.
- **Pet switcher via sibling Modal, not nested.** `EventTypeSheet` owns its own `switcherVisible` and renders `PetSwitcherSheet` as a fragment sibling of its Modal (self-contained API: `visible`/`onClose`), avoiding a nested-Modal on Android while keeping the switcher reusable.

## Persona flags / conflicts

None. Presentation-only; the voice + `clinical-guardrails` copy pass is scoped to PR 3 (the confirm register), per §4.

## Known limitations / scope

- **Secondary bare-`/log` doors keep the full-screen picker.** `TodayZone` empty CTA, Ask `EmptyRecord`, and `day-summary` still `router.push('/log')`; flag-on they render the grouped picker full-screen (now with the split Stool, via the shared grid — behaviour-consistent, presentation full-screen rather than sheet). The bottom-sheet-over-tab is the FAB destination, which is the specced scope ("B-007's destination half"). Unifying every door onto the sheet would need a store-mounted sheet reachable from pushed screens — a deliberate follow-up, not silently in scope here. **→ filed B-749.**
- **AC-CHIP** (Saw it / Found it never wrap) governs PR 3's confirm chips, not PR 2's split segments — but the split tile is built robust to the same failure: the "Stool" label flex-shrinks/truncates first, the fixed-width Normal/Loose segments never squeeze. On-device 320pt + max-accessibility-font check is in the QA script.

## DoD

- AC (spec §5 QA spine): 10-second FAB→sheet→type→sub-flow ✓ (routes preserved); flag-off byte-identical ✓ (snapshot); split stool routes ✓ (tested); multi-pet switcher on title ✓ (tested); reduced-motion — the Modal `slide` respects the app's sheet convention (no ambient loop). AC-FOUND / AC-CHIP are PR 3.
- Types ✓ (`tsc --noEmit` clean). Tests ✓ (full suite 215 suites / 4801 green).
- Anti-patterns: theme tokens only ✓, no `any` ✓, hitSlop/44pt ✓, absolute imports ✓, multi-pet write-time identity ✓.
- Persona sign-off: Designer ✓ (matches design-locked round-4 frame 1; daylight register, category tints as identity) — Engineer ✓ (one seam, flag-off untouched) — Data N/A — Dr. Chen N/A (no clinical logic).
- Adversarial review: N/A (no clinical/statistical logic; presentation + routing only).
- **code-reviewer: run → fix-before-merge → all four findings addressed (re-green).** (1) **Nested-Modal scrim bleed-through** — applied the FAB's documented guard proactively: the sheet's own scrim unmounts while the nested switcher is up, so an Android scrim-dismiss tap can't bleed through and close the sheet (safe-by-construction; on-device Android confirmation still in the QA script). (2) **Split-segment hitSlop overlap** — Normal vs Loose is a clinical distinction, so the ambiguous ~4pt hit-boundary overlap was closed by dropping horizontal hitSlop (`SEG_HIT` → `{top:8,bottom:8}`; vertical slop + pill width already clear 44pt). (3) **Tile balancing** — replaced the group-wide odd/even count with **per-contiguous-run** parity (`fullWidthRegularKeys`), which the reviewer showed is the actually-correct rule (the split tile breaks the run; a future regroup would strand a half-tile under the old logic). (4) **Nit** — merged the duplicate `splitTile`/`groupTileFull` styles. Snapshot diff after fixes = hitSlop-only (per-run logic + style merge are byte-identical for the shipped groups); flat snapshot still byte-identical. The reviewer verified the stool routing (all three paths) and FL-1 clean. Noted gap (pre-existing, accepted): `app/log.tsx`'s `handleTypeSelect` branch + the FAB `pickerV2` dispatch have no test harness (neither file ever had one); routing is covered where testable (`EventTypePicker`/`EventTypeSheet` tests).

## Follow-ups filed

- **B-749** — unify the secondary bare-`/log` doors (TodayZone / Ask / day-summary) onto the sheet when `log_picker_v2` is live (store-mounted sheet reachable from pushed screens).
