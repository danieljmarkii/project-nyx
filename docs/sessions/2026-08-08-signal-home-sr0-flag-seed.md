# Signal/Home uplift — SR-0 flag-seed migration + the §10 Tier-2 edits (B-721)

**Date:** 2026-08-08
**Shipped via #610** (draft).

## What this was

SR-0 of the Signal/Home design uplift (B-721): seed the `signal_design_v2`
`app_config` allowlist flag the whole track ships dark behind, applied live, with
the three PM-approved Tier-2 doc edits from the spec's §10 written in the same PR.
The spec (`docs/nyx-signal-home-requirements.md` v1.1) was finalized the day before
(#606); this is the first build PR against it. Per the §8 plan SR-0 is the gate
everything queues behind — FR-FLAG-3: the seed merges and is applied live before
any UI PR merges.

## What shipped

- **`supabase/migrations/055_signal_design_v2_config.sql`** — seeds `signal_design_v2`
  into `app_config` with the B-712 allowlist shape, **default nobody**
  (`{"enabled": false, "allowlist": []}`), idempotent via `ON CONFLICT DO NOTHING`.
  A near-verbatim structural clone of `054_widget_config.sql`, with the rationale
  rewritten for the one thing that differs (below).
- **`lib/appConfig.ts`** — `signal_design_v2` added to `ALLOWLIST_FLAG_KEYS` and
  `ALLOWLIST_FLAGS_UNSET`. This two-line client registration rides the seed PR per
  the 054 precedent: it is not schema, but the seed is *inert* without it —
  `extractAllowlistFlags` picks only registered keys, and `useAllowlistFlag` is
  typed to the union, so an unregistered key can't be read or gated on.
- **Tests** — `lib/appConfig.test.ts` gains a `signal_design_v2` block mirroring the
  `widget_enabled` one (unset baseline; extract raw off a SELECT; fail-closed when
  unset / signed-out / dark-seed; allow-listed uid on; cache round-trip).
  `lib/session.test.ts`'s B-402 sign-out wipe test is extended to the new key, since
  the cached allowlist carries account UUIDs and must not outlive the session on a
  shared device.

## The one decision worth recording: client-render-only

`signal_design_v2` is deliberately **not** registered server-side (there was a live
temptation to mirror it into `supabase/functions/_shared/flags.ts` the way `ask_*`
is gated in `ask/index.ts`). It isn't, for a reason the spec is explicit about
(§7/§101): unlike `widget_enabled` (which gates server-*computed data*) and Ask
(which gates an *Edge Function*), this flag gates only what the **client draws**
(SR-1..SR-6). The uplift's single server change — SR-4's additive `generate-signal`
payload (med-on-board facts + `densityComparable`) — is computed *uniformly for
every account* and is flag-independent: old clients ignore the new fields, and the
density gate only ever *withholds* a comparison (safe in both worlds, Dr. Chen's
fail-toward-escalation direction). So there is nothing for a server gate to protect,
and `_shared/flags.ts` is a generic resolver that needs no per-key entry anyway. The
B-712 "server-cost betas must gate server-side too" rule was checked and does not
bite here — this is client-render-only, so the widget precedent's client gate is
sound.

## Applied live + advisors

Applied via the Supabase MCP `apply_migration` (`aigchluqluzuhtbfllgh`, name
`signal_design_v2_config`). Pre-flight sanity check first (`SELECT key ... WHERE key
= 'signal_design_v2'` → 0 rows, the key didn't exist). Read-back after apply
confirms `{"enabled": false, "allowlist": []}` with `allowlist_len = 0` — dark.

`get_advisors` (security + performance) returns only **pre-existing** lints, all on
other objects: `record_ai_usage` (SECURITY DEFINER), the auth leaked-password
setting, unindexed FKs and RLS-initplan re-eval and unused indexes across
diet_trials/events/medications/food_items/etc. `app_config` appears in **none** of
them — seeding one row introduces no table, policy, function, FK, or index, so it
adds zero new advisories. Same "advisors clean" outcome as the 054/053 seeds.

## The three Tier-2 edits (spec §10, PM-approved this session)

Written, not just flagged, because the task carried the approval:

1. **`docs/nyx-design-principles-v1_0.md` (v1.0 → v1.1).** Principle 3 gains the S1
   register-drop rule (richer evidence lives on the insight lane only; safety cards
   stay deliberately plain so plainness itself signals severity). Principle 5 gains
   the S6 quiet-is-labeled rule (a presence-gated surface labels its quiet in one
   explicit line, never shortens silently). Both are *additions*, placed with
   provenance in the existing revision-note style; header + version-history bumped.
2. **`docs/culprit-in-app-brand-requirements.md` §7.5 (new) + §8.2 pointer + D8 row.**
   Records D8 closed **light**, night variant unbuilt — `SIGNAL_NIGHT_GROUND` is
   never created (confirmed: it exists only in docs, never in `constants/flags.ts`
   or any code). N4 (§7) and N7 (§8.2) are absorbed by the now-canonical
   `nyx-signal-home-requirements.md`. The §7.2 "both variants built" / §7.4
   on-device-gate framing and AC-N4's night-ground snapshot rows are marked moot.
3. **`docs/nyx-ai-signal-requirements.md` §11(f).** The per-type card-presentation
   design pass — a reserved design-phase task since rev 6 — is marked **resolved**
   by the B-721 spec (the S10-judged receipt system), with the summary line at the
   top of the doc updated to match. That spec composes with, never modifies, this
   engine substrate.

## Verification

- `tsc --noEmit` clean. The union extension surfaced exactly one consumer that
  builds a full `AllowlistFlagValues` literal (`lib/session.test.ts`) — fixed by
  adding the key (with a UUID, keeping the wipe test's intent). Everything else
  spreads `ALLOWLIST_FLAGS_UNSET`, so it was untouched.
- Full `jest` suite green: 209 suites / 4619 tests. The existing `toEqual`-based
  allowlist tests tolerate the new `undefined` baseline key (Jest ignores undefined
  properties), so nothing regressed.
- Pre-push hook (typecheck + jest) passed on push.
- A `code-reviewer` subagent was run against the diff (general health + house rules).

## Notes for the next session

Next is **SR-1 (receipt components) ∥ SR-2 (empty states)** — disjoint, parallel-safe
(separate branches; the one collision is STATUS.md at wrap). Both land dark behind
`useAllowlistFlag('signal_design_v2')`, which is now readable. SR-4 (the
`generate-signal` additive payload, adversarial-reviewer mandatory) can run parallel
once SR-1's types merge. Cohort enablement stays a later recorded `app_config`
UPDATE (PM action), never a deploy side effect.
