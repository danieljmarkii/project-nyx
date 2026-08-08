# Beta Features PR 1 — seed the `widget_enabled` eligibility flag (schema)

**Date:** 2026-08-06
**Shipped via:** #605 (draft → merged) · Branch `claude/beta-features-pr1-schema-jovuo7`
**Backlog:** B-712 (Phase 1, PR 1 of 4) · Spec `docs/nyx-beta-features-requirements.md` §5 PR 1

---

## What shipped

The first build PR of the Beta features program (B-712). It seeds the single per-account **eligibility flag** that lets the Home Screen widget ship **dark** in the App Store submission binary — on for a hand-picked cohort, invisible to everyone else — so slow/secondary widget work never gates the release. Reuses the **Ask allowlist primitive** (`app_config` + `resolveAllowlistFlag`) verbatim; zero new mechanism.

- **`supabase/migrations/054_widget_config.sql`** — one `app_config` row, `('widget_enabled', '{"enabled": false, "allowlist": []}'::jsonb)` with `ON CONFLICT (key) DO NOTHING`. Byte-for-byte the 037 template + the full Migration Safety Pre-flight. No new table/column/type/policy — inherits `app_config`'s existing read-only-to-authenticated RLS (030). `054` confirmed the next free number (053 highest on `origin/main`; no sibling took it).
- **`lib/appConfig.ts`** — registered `'widget_enabled'` in `ALLOWLIST_FLAG_KEYS` + `ALLOWLIST_FLAGS_UNSET`. Propagates automatically through `extractAllowlistFlags` / `coerceAllowlistFlags` / `resolveAllowlistFlag` (all iterate the key list; no per-key special-casing anywhere).
- **`lib/appConfig.test.ts`** — a `widget_enabled` block covering all three code paths for the new key: **extract** (off an `app_config` SELECT), **resolve** (fail-closed off when unset / signed-out / against the dark seed; on only for an allow-listed uid), and **coerce** (cache round-trip; a legacy cache lacking the key decodes to `undefined`).
- **`lib/session.test.ts`** — fixture fix: the sign-out wipe test's cached bundle now carries `widget_enabled` (its allowlist UUIDs must be wiped on sign-out too). Required by the type system, not cosmetic — `AllowlistFlagValues = Record<AllowlistFlagKey, unknown>` forces every literal-typed bundle to grow the third key, which is the compile-time guarantee against a half-registered flag.

**Applied to prod** via Supabase MCP `apply_migration` (project `aigchluqluzuhtbfllgh`, recorded as `widget_config`): pre-check returned 0 rows → applied → verified the row is present with value `{"enabled": false, "allowlist": []}`. `get_advisors` (security + performance) surfaced **no finding referencing `app_config`/`widget_enabled`** — all advisories are pre-existing baseline (unrelated FKs, RLS init-plan, unused indexes). A single-row INSERT into an already-RLS'd table can't produce a new advisor finding; expected clean.

**Zero behavior change.** The seed is eligible for no one; nothing an owner sees changes. Turning it on for an account is a later, recorded config `UPDATE` (§5 enablement step), deliberately not baked into the seed (the 037 lesson: a re-applied seed must never reset a live allowlist).

## Scope discipline

Schema-PR isolated. **No client gate** on the widget publish path here — that's PR 2 (`hooks/useWidgetSnapshots.ts`). The server-side `supabase/functions/_shared/flags.ts` is untouched: the widget is **client-only gated** (§0 D6), and the module is key-agnostic anyway (takes `key: string`). Per §5, the two-line `appConfig.ts` registration rides this schema PR because the seed is inert without it and it touches no other feature — `code-reviewer` confirmed this is explicitly pre-authorized and doesn't trip the "schema bundled with UI" rule's real concern.

## Reviews / gates

- **`code-reviewer`: Ship-ready.** No bugs, no anti-patterns. It independently re-ran `tsc --noEmit` (clean) and jest (green), and traced the full flag pipeline by hand to confirm the two-line registration is genuinely sufficient (no other call site hardcodes the key list; `HomeHeader.tsx` reads only `ask_enabled`, untouched). It confirmed deploy-order safety both directions (seed-before-client → unknown key ignored; client-before-seed → `undefined` → fail-closed).
  - One substantive coverage note — the cache-decode path (`coerceAllowlistFlags`) lacked a `widget_enabled`-specific assertion — **addressed** in the follow-up commit (`c94a9f9c`).
  - Two non-blocking notes needed no action: the registration-in-schema-PR bundling (§5 authorizes it), and two resolve assertions that re-derive generic behavior (they satisfy the DoD line).
- **Adversarial review: N/A** — no clinical/statistical logic (spec §7). **`rls-privacy-reviewer`: not required** — no new access path to health data; the widget already reads the owner's own local record, unchanged.
- **Persona sign-off:** Engineer ✓ (primitive reuse, migration isolation, ship-dark discipline) — Data ✓ (additive seed, RLS inherited, fail-closed) — Trust & Safety ✓ (allowlist UUIDs wiped on sign-out; resolves per-uid, fails closed) — Designer N/A (no owner-visible surface) — Dr. Chen N/A.

## CI note (GitHub Actions outage)

The PR was opened during a major GitHub Actions outage — at open time the head had **0 checks registered** (`total_count: 0`), so the branch-protection floor wasn't enforcing. The merge was **held** per instruction and a single ~90-min self check-in armed. By wrap, Actions had recovered and all three required checks were **green** on the head (`App (typecheck + jest)`, `Edge Functions (deno test)`, `App (jest, non-UTC timezones)`). (Note: the legacy `get_status` API reads `pending/0` because Actions reports via **check-runs**, not commit statuses — read `get_check_runs`, not `get_status`, to judge CI here.)

## Residuals / next

- **PR 2** (next): gate `useWidgetSnapshots` on `useAllowlistFlag('widget_enabled')`; not-eligible → clear + publish a **neutral signed-in-empty** door (never the "Sign in" door — that's the §4.1 lie). Must land in the submission binary. Decide the App Review demo-account handling (recommend: neutral empty door, don't allowlist the review account).
- **Enablement** (add the PM's uid to the allowlist) is a recorded config `UPDATE`, but it renders nothing until PR 2's gate exists — do it *after* PR 2, not now.
- Program guardrails = **B-713** (items 1+2 fold into Phase 1; the rest gate Phase 2).
