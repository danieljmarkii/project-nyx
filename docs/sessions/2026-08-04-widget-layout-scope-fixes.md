# Widget layout & scope fixes — treat-scoped picker, profile slot label, iPhone-only extension

**Date:** 2026-08-04

Four widget-track follow-ups filed at the W5 `pm-feature-review` (B-406/B-407/B-415) plus a backlog reconciliation (B-410). All app-side / build-time; **no schema, no edge-function change, no deploy.** Shipped via **#583** (draft).

## Context that reshaped two of the four

The widget has already been **rebuilt to v2** (`widgets/CulpritWidget.tsx`, spec `docs/nyx-widget-requirements.md` v2.0, PM-ratified 2026-08-02): informational-only, **never writes**, capture retired (V2-1). Two of these rows were filed 2026-07-24 against the **v1/build-35 capture** widget, so the v2 reality changed what "closing" them means:

- **B-406** is genuinely app-side (`FoodPicker` + `log.tsx`), so it lands unchanged — but there is **no live consumer** on the widget anymore (no treat capture door in v2). It ships as forward infrastructure.
- **B-410** is **obsoleted** by v2 (see below).

## What shipped

**B-406 — the treat door lands treat-scoped.**
- `lib/food.ts` → `parseFoodScope(value)` validates an untrusted deep-link `scope` string to a `FoodScope` or `undefined`, **failing closed** on anything unknown (so a malformed link never blocks logging). The valid set is derived from `FOOD_SCOPE_OPTIONS`, so a new chip can't drift from what a link may preselect.
- `components/log/FoodPicker.tsx` gains `initialScope?: FoodScope`, seeding the pinned scope chip at **mount** (the picker is mounted fresh each time the log screen reaches the food step; once open the chip is the owner's to change). Every existing caller passes nothing → the picker's `'all'` default, unchanged.
- `app/log.tsx` reads a `scope` route param and passes `initialScope`. A treat door therefore deep-links `log?type=meal&scope=treat` — a treat is a meal **event** carrying a `food_type='treat'` food, so there's no `treat` event type to preselect; the scope preselects the picker instead, exactly as a manual "Treats" tap would. The rotation shelf stays unfiltered by design (the B-347 scope-chip contract filters only the library).
- Tests: `parseFoodScope` (accepts the five values, resolves `treat`, fails closed on label/case/garbage); `FoodPicker` opens scoped to treats (treat shows, meal filtered) with an unscoped control.

**B-407 — the pet profile names each pet's widget slot.**
- A quiet `Home Screen widget · Pet N` caption on the profile (`app/(tabs)/profile.tsx`, under the Age/Sex/Weight chips), turning slot binding from trial-and-error into a lookup. Renders only when the pet holds a real active slot; iOS-only.
- It reads the **same published `pets-index.json`** the widget binds through — new `lib/widgetSlot.ts` (`readPublishedSlotIndex` / `readPetSlotLabel`, an App Group reader) + `hooks/useWidgetSlotLabel.ts` (re-reads on focus) + the pure `petSlotLabel(index, petId)` in `lib/widgetResolution.ts`. **The design point:** it reads the persisted **sticky/tombstoned** index, never a fresh `assignPetSlots(null, pets)` re-derivation — because after a pet is removed a re-derivation would name a *different* slot than the widget uses (a two-pet account can genuinely be Pet 2 + Pet 3), which is the exact drift this line exists to prevent.
- Tests: `petSlotLabel` (names the sticky slot after a removal, null for tombstone / no-slot / null / corrupt index); `widgetSlot` reader against a mocked App Group (null container, parse guard, absent file, delegate).

**B-415 — the widget extension follows the app to iPhone-only.**
- `expo-widgets` hardcodes the extension target to `TARGETED_DEVICE_FAMILY = "1,2"` (`addXCConfigurationList.ts`) with no config passthrough, so after `ios.supportsTablet: false` (B-269) the extension still advertised iPad support the app doesn't have — an App Store upload-validation risk.
- New `plugins/withWidgetIphoneOnly.js` — a `withXcodeProject` mod that pins the `ExpoWidgetsTarget` build configs to `"1"`. Registered in `app.json` **before** `expo-widgets` so its base mod runs **after** expo-widgets' (the verified `withoutPushEntitlement` reverse-order rule); no-ops safely if the target is ever renamed.
- **Verified by a real prebuild** — the "verify at the build-cut" the row asked for, done now rather than deferred: `npx expo prebuild -p ios` shows the widget target's Debug+Release configs read `"1"` **with** the plugin and `"1,2"` **without** it (a control run with the plugin removed), proving causation. The app target reads `"1"` in both (from `supportsTablet: false`). The generated `ios/` dir is gitignored and was cleaned; prebuild's `package.json` script edit was reverted.
- This was the PM's designated **scope valve** ("drop it if it fights back"). It did not fight back.

**B-410 — closed as SUPERSEDED (no code).** The row (filed 2026-07-24) describes the *v1/build-35* widget's `fork.knife`/`pawprint` SF Symbols clashing with the app's Lucide. The **v2 rebuild's §2.3** (PM-ratified 2026-08-02, *postdating* the row) deliberately dropped iconographic symbols for **abstract geometric glyphs** (filled circle / small circle / rounded square / diamond / hollow ring) chosen so "every distinction survives monochrome rendering on shape alone." The specific seam the row named **no longer exists**, and its proposed fix — ship the app's Lucide glyphs into the widget — would now **revert §2.3** (Lucide line-art doesn't survive tinted/monochrome the way a filled circle does), so it's a design reversal, not a bug-fix. Closed as superseded; reopening as a §2.3 reversal is a fresh Designer+PM decision if ever wanted.

## Persona flags

> **Designer:** B-410's premise was overtaken by the ratified v2 §2.3 geometric-glyph decision. Doing it silently would revert a shipped design choice.
> **Resolution:** surfaced, not silently actioned — closed as superseded with the reopen-as-§2.3-reversal lever handed to the PM. (Recorded in the PR's Open Questions.)

## DoD

- Acceptance criteria (per backlog row) listed pass/fail in the PR. QA ✓.
- Diff scanned vs anti-patterns — theme tokens only (the new profile caption uses `textXS`/`colorTextTertiary`/`space1`), no `any`, fail-closed parse, error handling on the App Group read. None introduced.
- `tsc --noEmit` clean; full `jest` green (195 suites / 4265 tests via the pre-push hook). Deno job green (untouched).
- Tests added for the three shared-lib helpers + the reader (DoD "touches a shared util in lib/"). The config plugin is verified by a real prebuild rather than a unit test (build-time `.js`, the repo's `withoutPushEntitlement` precedent has no test either).
- **Adversarial review: N/A** — UI + config + pure string/lookup helpers, no clinical/statistical/escalation logic.
- Persona sign-off: Designer ✓ (the B-410 supersession call; the quiet caption placement) — Engineer ✓ (plugin ordering + no-op safety, iOS-only degrade, no schema) — Data N/A — Dr. Chen N/A.
- `code-reviewer` subagent run on the diff (general health + house rules).

## Known limits / follow-ups

- B-406 has no live consumer yet; the treat link is consumed when a treat door ships (B-291 Siri/Action-Button capture, or an in-app "log a treat" affordance).
- B-407 is iOS-only and needs the widget snapshot to have published once (normal app use does this). On-device slot-label check remains the V2-PR-3 PM item; this is its cheap in-app mitigation.
