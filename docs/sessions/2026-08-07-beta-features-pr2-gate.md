# Beta Features PR 2 — gate the widget publish on `widget_enabled` + presentable empty state

**Date:** 2026-08-07
**Shipped via:** #608 (draft) · Branch `claude/beta-features-pr2-gate-empty-avq6k8`
**Backlog:** B-712 (Phase 1, PR 2 of 4) · Spec `docs/nyx-beta-features-requirements.md` §4.1 + §5 PR 2

---

## What shipped

The client-side **eligibility gate** for the Home Screen widget — the second Phase-1 PR of the Beta features program. The widget now publishes **real per-pet data only for an account in the `widget_enabled` allowlist** (seeded dark by PR 1, #605). A signed-in owner who is **not** eligible gets a **neutral signed-in-empty** payload → the honest **"No pet in this slot yet"** door — **never** the `signedIn:false` **"Sign in to start logging"** door, which is a lie for a signed-in owner and exactly what §4.1 exists to prevent. This keeps the widget's ungated state presentable in the **App Store submission binary** (iOS can't hide a widget per-account — a reviewer or any non-cohort user can add it — D5 / B-713 #1).

- **`hooks/useWidgetSnapshots.ts`** — the gate:
  - Read `const widgetEligible = useAllowlistFlag('widget_enabled');` (render-only, fail-CLOSED) and added it to the effect deps `[session, widgetEligible]`, so adding/removing the account from the allowlist re-publishes on the next config refresh.
  - Extracted the publish choke into an exported **`buildWidgetPublishProps(eligible, deps)`** seam: eligible → `publishWidgetSnapshots` + `buildWidgetProps({…, signedIn: true})` (unchanged); not eligible → `clearWidgetData()` **and** `buildWidgetProps({ index: null, snapshots: [], signedIn: true })`. The extraction mirrors the `publishWidgetPass` pattern in `lib/widgetBridge.ts` — a seam pulled OUT of the effect precisely so both branches are unit-testable (the "CI can't reach a flag's on-state unless a test sets it" lesson, spec §7).
  - The gate runs **inside `publishWidgetPass`**, so the §3 residual-v1 drain still applies a build-35 user's un-drained capture to their record **regardless of eligibility** — the gate withholds the widget's *data*, not the owner's *log*.
- **`hooks/useWidgetSnapshots.test.ts`** (new, 6 cases): Part A pins the seam directly with injected deps — eligible → real data + never clears; not eligible → clears + signed-in-EMPTY, `signedIn` always `true`, real-data path never taken; the empty payload carries the **current** `WIDGET_PROPS_SCHEMA_VERSION` (the neutral door, not the §3 mismatch door); defaults wire to the real collaborators. Part B renders the hook (renderHook + fake timers) and flips the allowlist to prove the resolved flag flows through **and** that a flip re-publishes (the effect-deps wiring the seam test can't see).

## Decisions taken this session

- **Dedicated door — deliberately NOT built; reused the existing "No pet in this slot yet" door.** A purpose-built door that renders *only* for the not-eligible case would need a new props field to distinguish it from a genuinely-unbound slot on an *eligible* account → a `WIDGET_PROPS_SCHEMA_VERSION` bump (2→3) + a **native rebuild** + an upgrade transient where every existing widget shows the schema-mismatch door until it republishes. Not worth the native-build churn for a cosmetic gain; the existing door already satisfies §4.1 (neutral, honest, reveals no beta). **Consequence: this PR is 100% app-process JS → OTA-able, with no `widgets/CulpritWidget.tsx` change and no schema-version bump.**
- **App Review demo-account handling — rely on the neutral empty door; do NOT allowlist the review account** (spec §4.1 / §8.4 recommendation). Keeps the beta invisible to reviewers; the added widget reads as a normal unconfigured widget, not a broken one.
- **The enablement config `UPDATE` was NOT run this session** (see PM action item). It is a live `app_config` write and — per STATUS.md's own note — belongs *after* PR 2's gate is on-device, because the client gate is inert until PR 2's JS deploys. Enabling earlier renders nothing. Flagged with exact SQL, not executed unilaterally.

## Scope discipline

OTA/app-JS only. No schema, no migration, no Edge Function, no native extension change, no new secret (reuses `app_config.widget_enabled` + `useAllowlistFlag`). Server-side `_shared/flags.ts` untouched — the widget is client-only gated (§0 D6); the standing rule that a *server-cost* beta (#2+) must also gate server-side does not apply here.

## Reviews / gates

- **`tsc --noEmit`** clean. **Full jest** green: **209 suites / 4593 tests** (incl. the 6 new). Pre-push hook (tsc + jest) passed. **CI green on #608** — all three required check-runs (`App (typecheck + jest)`, `Edge Functions (deno test)`, `App (jest, non-UTC timezones)`) `success`.
- **`code-reviewer`:** in flight at docs-commit time (background subagent). Any findings are folded into this draft before it is marked ready-for-review.
- **Adversarial review: N/A** — no clinical/statistical logic (spec §7). **`rls-privacy-reviewer`: not required** — no new access path to health data; the widget already reads the owner's own local record, and the gate only *withholds* it. (T&S upside: the not-eligible path also `clearWidgetData()`s, so per-pet health snapshots don't linger in the App Group for an account that shouldn't have a widget.)
- **Persona sign-off:** Engineer ✓ (allowlist-primitive reuse; seam extracted for testability like `publishWidgetPass`; effect-deps correct; drain-before-neutralize preserved) — Designer ✓ (§4.1 — neutral door, never the "Sign in" lie; no new copy) — Trust & Safety ✓ (fail-closed resolution; snapshot files dropped for a not-eligible account) — Data N/A — Dr. Chen N/A.
- **Future-self review:** the extracted `buildWidgetPublishProps` seam is the exact choke Phase 2 (PR 3) rewires to `eligible && optedIn` — a deliberate, low-risk pattern that mirrors the established `publishWidgetPass` extraction. Would want it here in 12 months.

## Residuals / next

- **PM action — run the enablement `UPDATE`** when cutting the build (add the PM's uid to the `widget_enabled` allowlist). Exact SQL in the PR body / PM action items.
- **PM action — land #605 (merged) + #608 before the next TestFlight / submission cut** (the door fix must be in that binary).
- **Phase 2 = PR 3** (`app/settings/beta.tsx` beta page + local opt-in, default off, wiped on sign-out; rewire the publish condition to `eligible && optedIn`) — **gated on the B-713 §4.3 guardrail-scoping pass** (graduation/kill policy, measurement/consent, scale mechanism).
