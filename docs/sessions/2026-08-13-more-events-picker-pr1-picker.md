# Session — More-events picker redesign, PR 1 (picker in place)

**Date:** 2026-08-13
**Track:** B-745 (More-events / log event-picker redesign) — PR 1 of 3
**Branch:** `claude/event-picker-v2-redesign-0pyqp9`
**Outcome:** shipped via #633 (draft)
**Spec:** `docs/nyx-more-events-picker-requirements.md` v1.0 · design authority `docs/culprit-more-events-mockups.html` round 4

---

## Build phase

Parallel track (not Step 10). B-745 PR 0 (the `log_picker_v2` flag seed) shipped via #632; this is **PR 1 — the new picker in the current presentation**, dark behind `log_picker_v2` (`eligible && optedIn`). PR 2 (the sheet) and PR 3 (the one-surface confirm) remain.

## What was built

- **The custom glyph family, first three glyphs** — `components/event/eventGlyphs.tsx`: `VomitGlyph` (the splat, G1b), `StoolFormedGlyph` (the swirl, G1a), `StoolLooseGlyph` (its runny sibling). react-native-svg components conforming to the Lucide interface (`size`/`color`/`strokeWidth`), house line style (24×24, no fill, 1.75 stroke, round caps/joins). The splat + swirl paths are copied verbatim from the round-4 mock; the loose sibling (not in the mock — the strip drew only the two anchors) reuses the pile body + a runny ripple line, flagged as a build draft for on-device Designer confirmation.
- **Global glyph swap** — `constants/eventTypes.ts`: `vomit`→splat, `stool_normal`→swirl, `diarrhea`→loose sibling, `lethargy`→`BatteryLow` (R2, Moon retired), `other`→`Ellipsis` (Plus reserved for add/create). The `icon` type broadened `LucideIcon`→`EventGlyph` so a custom and a Lucide icon are interchangeable behind the ONE render path; `EVENT_TYPES` stays the single point of change. `ScopeMenu`'s option icon type broadened to a local generic `GlyphComponent` (kept ui/ decoupled from the event domain).
- **`components/log/EventTypePicker.tsx`** — a pure props component (no store/hook) rendering the flat grid (`grouped={false}`, flag-off, byte-identical to today) or the grouped grid (`grouped={true}`, flag-on: Symptoms / Food & care / Body & more, tinted category circles, 2-up bordered tiles). Stool is one tile that still opens its sub-step — the split-inline stool is PR 2, so PR 1 is zero flow change.
- **`app/log.tsx` rework** — all five step headers migrated to the shared `Header` (B-075); the `log_picker_v2` flag wired (both hooks called unconditionally then combined — Rules of Hooks, SignalZone precedent); the photo-first entry removed as dead code (the mount-time `pendingAttachment` consumer, the "photo is attached" banner, the dashed photo tile — nothing has written `pendingAttachment` since before 2026-07-26); dead styles + token literals cleaned up.
- **README icon-section correction** — `docs/design-system/README.md` (open-questions item 3) + `docs/design-system/_system/README.md` (§Iconography + §Emoji): the "event icons are emoji / no icon font is loaded" claims were false since design-system PR 3; corrected to Lucide-loaded + the custom family underway (B-745 shipped three, B-746 commissions the rest).
- **Tests** — `EventIcon.test.ts` updated to pin the new glyph mapping; `EventTypePicker.test.tsx` (new): flag-off flat-grid snapshot (byte-identical), flag-on grouped snapshot, group-membership structural pins, and routing (Stool still → `stool_normal` sub-step).

## Decisions made

- **The glyph swap is GLOBAL, not flag-gated** (the one genuine spec-tension call). The load-bearing directives — "resolving through `EVENT_TYPES` → `EventIcon`", "`EVENT_TYPES` stays the single point of change", B-746 "narrows to the remaining six glyphs", and the B-410 widget carve-out — all only make sense if the family is a permanent, app-wide icon-system change. So the splat/swirl/loose/BatteryLow/Ellipsis render everywhere `EventIcon` does (History, Today, detail screens, and both flag paths of the picker). The server-side vet report has its own icon path and is untouched. **`FL-1` "flag-off byte-identical" is therefore read as: the flag gates the grouped-grid PRESENTATION (flat vs grouped), not the shared glyph system** — the flag-off flat grid keeps today's structure/order/labels (snapshot-pinned) while adopting the global glyph refresh + shared Header. Flagged for the PM below.
- **Type-step close relocates right→left.** The original hand-rolled type header had a right-side ✕; the shared `Header` standardizes the dismiss to the leading slot, so it's now `leading="close"` (left X, Lucide). Consistent with `edit-event`'s left-Cancel. Applies to both flag paths (the Header migration is global).
- **The orphaned `attachmentStore` stays** (filed B-748). Removing `log.tsx`'s consumer fully orphaned `store/attachmentStore.ts`, but deleting it + its test is beyond the three items the spec listed to remove, so it's tracked rather than folded in.

## Persona flags

- **Designer / Eng ✓** — the "byte-identical off" reading above is the one judgment call; surfaced as a PM note, not resolved silently. The flag-off flat grid is snapshot-pinned so its structure genuinely can't drift in PRs 2–3.
- **Designer ✓** (principles: large tap targets, category tint = identity not verdict) — grouped tiles clear 44pt; tints keyed per-type so a regroup can't mis-tint. The loose-stool glyph is a draft needing an on-device look (no mock reference existed).
- Data / Dr. Chen — **N/A** (no clinical/statistical/data-model logic; presentation + step structure only).

## Known issues / tech debt

- Loose-stool glyph is a build draft (ripple beneath the pile) — Designer to confirm at 24px on device; no mock frame existed for it.
- `attachmentStore` orphaned → **B-748**.
- Beta-shelf row still gated `widget_enabled`-only (**B-747**, pre-existing) — an account eligible for `log_picker_v2` but not the widget can't yet reach the shelf to opt in. Not biting the dogfood cohort. Not in this PR's scope.

## PM action items

- [ ] **Confirm the global-glyph reading of FL-1** (glyphs global; flag gates the grouped-grid presentation, not the shared glyph system). If glyphs should instead be gated with the grid, it's a small follow-up (wrap glyph resolution in the flag) — but that contradicts the EVENT_TYPES-single-point + B-746 framing.
- [ ] On-device look at the **loose-stool glyph** (the one glyph with no mock reference).
- [ ] To dogfood PR 1: opt into "Log screen redesign" on Settings → Beta features (the PM uid is already allowlisted from PR 0). Note B-747 if testing a non-widget-eligible account.

## Recommended next steps

1. **PR 2 — the sheet** (`log_picker_v2`): bottom-sheet presentation over the current tab, the split-inline stool tile (sub-step deleted), pet switcher on the title. This is B-007's destination half. Independent of PR 3.
2. **PR 3 — the one-surface confirm**: the step machine reworked so symptoms + Other complete in-sheet (pill rows, teal chips AC-CHIP, the live summary-pill save, AC-FOUND states), plus the full `nyx-voice` + `clinical-guardrails` copy pass.
