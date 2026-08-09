# Beta features — PR 3: the self-serve shelf + local opt-in (Gate 2)

**Date:** 2026-08-08
**PR:** shipped via #611 (draft)
**Track:** Beta features program (B-712), Phase 2 / PR 3
**Type:** Feature build. Turns the eligibility flag (PR 1/PR 2) into a self-serve opt-in shelf.

## The ask

Ship Beta Features PR 3 (spec §5 PR 3 + the §4.3 D7–D9 outcome): `app/settings/beta.tsx` (structure from `notifications.tsx`) + the `BETA_REGISTRY` and local opt-in store in `lib/betaFeatures.ts` (default off, wiped in `wipeLocalSession`) + the eligibility-gated Preferences row + route registration; rewire `useWidgetSnapshots` to `eligible && optedIn`. Build the registry with `owner`/`reviewBy`/`serverCost` + the serverCost→server-gate test; reuse Support for feedback (no telemetry/consent surface); keep the allowlist (no `beta_members`).

## What was built

- **`lib/betaFeatures.ts` (new)** — two UI-free pieces so they unit-test in plain jest and `useWidgetSnapshots` can read the opt-in without a screen's import graph:
  - **`BETA_REGISTRY`** — the shelf's single source of truth (D7 §4.3.1). One typed row per beta: `key`/`title`/`blurb`/`owner`/`addedDate`/`reviewBy`/`serverCost`. `reviewBy` is a forcing date, not an auto-disable. The widget is the only v1 entry (`serverCost: false` — client-only publish).
  - **The Gate-2 opt-in store** — a local, per-device, default-off preference (D4), AsyncStorage-backed Zustand with `useBetaOptIn` / `setOptIn` / `hydrateBetaOptIns` / `clearBetaOptIns`, plus tolerant `parseBetaOptIns` (a garbage/legacy/tampered blob decodes to the unset baseline; only known keys with real booleans survive).
- **`app/settings/beta.tsx` (new)** — the shelf: one **self-gating** card per registry entry (each calls `useAllowlistFlag(entry.key)` and returns null if not eligible), rendering an icon tile + title + "Beta" pill + a `Switch` + the blurb + an on-state add-to-home hint; plus the intro framing line and the honesty note ("won't affect your records"). The card lives in the screen file (no new shared component).
- **`app/settings.tsx`** — an eligibility-gated "Beta features" row in the Preferences card (`useAllowlistFlag('widget_enabled')` — one flag in v1; the comment names the beta-#2 OR).
- **`app/_layout.tsx`** — `settings/beta` route registration + `hydrateBetaOptIns()` at startup (alongside `initAppConfig`).
- **`hooks/useWidgetSnapshots.ts`** — the publish gate rewired from `eligible` to `live = eligible && optedIn` (the seam param renamed `eligible`→`live`). Eligible-but-not-opted-in is the neutral signed-in-empty door, never the "Sign in" lie — the spec §2 Phase-2 transition.
- **`lib/session.ts`** — `clearBetaOptIns()` folded into `wipeLocalSession` (T&S: the prior owner's beta choices must not survive sign-out on a shared device).

**Tests:** `lib/betaFeatures.test.ts` (registry shape/invariants, the serverCost→server-gate grep rule with a positive control, parse/serialize tamper-tolerance, opt-in default/set/hydrate/clear, and the hydrate-clobber race); the `useWidgetSnapshots` eligible/opted-out/not-eligible matrix; and a `session.test.ts` assertion that the wipe clears both memory and the persisted key. `tsc` clean; full jest 210 suites / 4631 green; all 3 CI checks green on #611.

## Scope held to the brief (§4.3 D7–D9)

- **No `beta_members` table** — the hand-edited allowlist stays (D9). The scale paths (premium/`entitlements` primary; `beta_members` conditional) are B-722, not this PR.
- **No telemetry, no consent surface** (D8) — feedback rides the existing Settings → Support "Share feedback" row; the local opt-in *is* the consent, nothing is transmitted.
- **serverCost→server-gate rule** (D6) is grep-able and unit-tested — vacuous in v1 (the widget is client-only) but enforced for beta #2, with a positive control (`ask_enabled`) so the scan can't pass on an empty read.
- **Two gates never conflated** — this PR touches Gate 2 only; the future Premium swap stays a one-line Gate-1 change.

## Reviews

- **`code-reviewer`: ship-ready, no bugs.** Anti-pattern scan clean (theme tokens throughout, no inline styles, Rules-of-Hooks hold in the self-gating card and the settings screen, no schema+UI bundling, voice clean). Two low-severity race NITs + the door-copy CLEANUP + the session-doc gap.
- **`pm-feature-review`: Settings row + beta page SHIP-SHAPED**, toggle→widget gate logic sound and the "Sign in" lie correctly avoided. One blocking flag: the not-live **widget door copy** misdirects an eligible-not-opted-in owner.

### Fixes applied this PR
- **Hydrate-clobber race (code-review NIT):** `hydrateFrom` now merges the persisted map *under* the current in-memory one (`{ ...disk, ...memory }`), so a toggle flipped before the one-shot AsyncStorage read resolves is never overwritten by the stale on-disk value. Regression-tested.
- **Voice/mock divergence (pm-review):** the honesty note now reads "may change, or be **pulled**…" (the locked round-1 mock's word) instead of "switched off", which double-dutied with the intro's owner-facing "switch it back off". PR 4 owns the full voice pass.

### Findings routed, not fixed here
- **The not-live widget door → B-725 (Next).** Both reviewers flagged it. The `!live` path reuses the generic "No pet in this slot yet / touch and hold to pick a pet" door, which misdirects a not-opted-in owner (picking a pet won't populate anything) and points nowhere back to Settings → Beta features. It **can't** ride PR 3: the door copy is native (stringified into the widget extension) and the widget can't yet distinguish "not opted in" from "no pet" (both `panel === null`) without a props-schema bump. Must land in the **same native TestFlight cut** that carries PR 3's gate, so the cohort's Phase-1 widget doesn't silently go blank-with-wrong-instructions.
- **Page-level "won't affect your records" → B-726 (Later).** True only because v1's one beta is read-only; qualify per-card before the first write-capable beta.
- **Accepted, not changed:** the persist/clear ordering race (mirrors the accepted `persistActivePetId`/`clearPersistedActivePetId` house pattern; the payload is a boolean preference, not health data, and eligibility fails closed independently); the settings row gating on the single `widget_enabled` flag (matches spec v1 scope; the code comment names the beta-#2 OR).

## DoD

- AC (spec §5 PR 3): all met — registry with owner/reviewBy/serverCost + the serverCost test; opt-in default-off/set/clear/**wiped**; `useWidgetSnapshots` on `eligible && optedIn` with the flag-on paths pinned; eligibility-gated row; route registered; no `beta_members`/telemetry/consent surface.
- Types pass; full jest green; no `any`; no new secret (reuses `app_config`).
- **Tests:** store + gate + wipe covered (betaFeatures.test.ts, useWidgetSnapshots.test.ts, session.test.ts). `app/settings/beta.tsx` + the settings row: `tests: N/A — pure UI; the registry, opt-in store, gate, and wipe are covered`.
- **Persona sign-off:** Designer ✓ (P3/P5/P7 — designed framing + honesty note, on-hint only when useful, records untouched) — Engineer ✓ (two-gates split, registry SSOT, local opt-in wiped, no new component, OTA-able gate) — Data/Dr. Chen N/A (no clinical/statistical logic) — T&S ✓ (opt-in wiped on sign-out, eligibility fails closed, no new health-data boundary, no analytics).
- **Adversarial / rls-privacy: N/A** per spec §7 (no clinical/statistical logic; no new access path to health data).
- **Future-self:** the registry + per-card self-gating is the pattern to keep — adding a beta is one row, and the graduation audit + serverCost rule have something to grep. Kept.

## Owed (not blocking the merge)
- **On-device pass** (pm-review + spec gate): add + remove the widget as eligible/opted-in, eligible/opted-out, and non-eligible accounts; confirm no "Sign in" door for a signed-in owner and the toggle persists across relaunch. Requires the PM's uid in the `widget_enabled` allowlist (the PR 1 enablement step).
- **PR 4** (nyx-voice + pm-feature-review): resolve OPEN-1 (name), OPEN-2 ("N on" count), and the on-hint "already added?" softening.

## PM decision surfaced (decision brief)
- **Deciding:** whether the native, opt-in-aware not-live widget door (B-725) must land *before* the next TestFlight cut, or the interim "pick a pet" misdirect is acceptable for the current cohort-of-one.
- **Options:** (A) **accept the interim, schedule B-725 for the next native cut** *(recommended — holding PR 3 doesn't fix a native door; PR 3's OTA shelf is correct and valuable; the cohort is one)*; (B) hold PR 3's gate off TestFlight until B-725 ships together.
- **Consequence:** (A) ships the self-serve shelf now, with B-725 gating the *native* cut; (B) couples an OTA-ready PR to a native build it doesn't need.

## Documentation updates
- **CLAUDE.md** — no change needed (the Read-These row already points at the requirements spec; per-PR status lives in the backlog).
- **`docs/backlog.md`** — B-712 status updated (PR 3 shipped via #611); **B-725** (not-live door, Next) + **B-726** (per-card records claim, Later) filed. _(Applied.)_
- **Proposed Tier-2 edits (await PM approval, per the Doc Update Protocol):** (1) `docs/nyx-beta-features-requirements.md` §5 — mark PR 3 shipped; (2) `docs/personas.md` §Periodic Process Retro — add **check #5 (beta-shelf audit)** per D7 (flagged in the spec, not yet written).
