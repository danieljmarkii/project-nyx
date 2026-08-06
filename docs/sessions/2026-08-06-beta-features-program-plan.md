# Beta features program — build-ready spec + PR plan (v1.0)

**Date:** 2026-08-06
**PR:** shipped via #NNN (draft — docs-only, the requirements + PR plan)
**Track:** Beta features program (B-712); guardrails (B-713)
**Type:** Spec / planning. No app code, no schema. Follows the same-day mocks session (`2026-08-06-beta-features-program-mocks.md`).

## What shipped
`docs/nyx-beta-features-requirements.md` **v1.0** — build-ready for Phase 1. Grounded in verified reads of the actual primitives, not memory:
- `lib/appConfig.ts` — `resolveAllowlistFlag` (pure, client+server-mirrored), `ALLOWLIST_FLAG_KEYS` (the one list to extend), fail-closed.
- `hooks/useAppConfig.ts` — `useAllowlistFlag(key)` (resolves per signed-in uid).
- `hooks/useWidgetSnapshots.ts` — the single publish choke point (effect gated only on `[session]`).
- `widgets/CulpritWidget.tsx` — the door state machine; `!signedIn` → "Sign in to start logging" (the lie to fix); `WIDGET_PROPS_SCHEMA_VERSION = 2`, stringified into the native extension.
- `037_ask_config.sql` — the seed template; next migration = `054`.

Plus state hygiene: STATUS.md B-712 track updated to "spec v1.0 build-ready"; backlog B-712 status bumped; CLAUDE.md Read-These row added for the new spec.

## The plan in one screen
- **Architecture — two gates:** `live = eligible && optedIn && !killed`. Eligibility = `widget_enabled` allowlist (server, ours). Opt-in = a local per-device toggle (owner's), default off, Phase 2+. The premium swap (later) changes *only* Gate 1's predicate ("uid ∈ allowlist" → "isPremium OR ∈ allowlist"); the page/toggle/widget don't move.
- **Phase 1 (protects the submission):** PR 1 seed `widget_enabled` (dark) + register the key → enablement config UPDATE (add PM uid) → PR 2 gate the publish + a presentable neutral empty state (never "Sign in" for a signed-in owner). **Both land before the submission TestFlight cut.**
- **Phase 2 (the shelf, gated on the §4.3 guardrail scoping):** PR 3 `app/settings/beta.tsx` + local opt-in (wiped on sign-out) + Preferences row (eligible-gated) + publish becomes `eligible && optedIn` → PR 4 copy/voice.
- **Phase 3:** premium gate — deferred to Track-3, one-line swap.

## Decisions recorded (spec §0)
D1 no Premium in v1 · D2 reuse the Ask allowlist primitive · D3 two gates never conflated · D4 opt-in is local per-device (correct for a per-device widget, not a shortcut) · D5 the widget can't be hidden per-account → empty state is Phase-1 + in the submission binary · D6 widget = client-only gate, but the *next* server-cost beta must gate server-side too. Open: name (OPEN-1), "N on" count (OPEN-2), feedback channel (OPEN-3).

## Key constraints carried (from the pre-mortem, B-713)
- **iOS won't hide a widget per-account** — the flag gates data, not gallery availability. The empty/ungated door must be presentable and must ship in the submission binary (a reviewer can add the widget).
- **Client-only gate doesn't generalize** — the widget is safe client-side (own local data); beta #2 that spends a server resource re-checks in `_shared/flags.ts` + rides `ai_usage`.
- **OTA vs native:** the publish gate is app-JS (OTA-able); any `CulpritWidget.tsx` door change is stringified into the native extension (needs a build) → put the door in the submission cut.

## Persona lenses
Engineer (choke point, reuse the primitive, OTA/native split), Designer (empty-state honesty, Principle 5), T&S (opt-in wiped on sign-out, no new health-data boundary, no v1 analytics), QA (flag-on paths tested explicitly), Product Owner (guardrails scoped as B-713 gating Phase 2), PM/wedge (Phase 1 protects the submission; the program must not compete with shipping).

## Next
PR 1 (the `054_widget_config.sql` seed + `widget_enabled` registration). Independent of every other live track; disjoint files; the only shared-file collision is STATUS.md at wrap.
