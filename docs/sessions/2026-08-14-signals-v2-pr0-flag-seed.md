# Signals v2 — PR 0: the `signals_v2` flag seed, dark (B-755 / CUL-5)

**Date:** 2026-08-14
**Shipped via #641.**

## What this was

PR 0 of the Signals v2 track (B-755, Linear CUL-5): seed the `signals_v2`
`app_config` allowlist flag the whole track ships dark behind, and register it
client-side. Schema-isolated — migration + the inseparable client registration +
its unit tests only; **nothing consumes the flag yet** (spec §7 PR 0). The build
contract (`docs/nyx-signals-v2-requirements.md` v1.1) was ratified the same day;
this is the seed-first gate every client PR (1–9) queues behind (§5 "seed first").

Followed the `signal_design_v2` (SR-0, #610) and `widget_enabled` (B-712 PR 1,
#605) precedents. Scope matches the **054/055** seed PRs (appConfig registration
only) — deliberately **not** widened to a beta-shelf row like 056's PR 0; per spec
§7 the shelf row is PR 10 (before GA).

## What shipped

- **`supabase/migrations/057_signals_v2_config.sql`** — seeds `signals_v2` into
  `app_config` with the B-712 allowlist shape, **default nobody**
  (`{"enabled": false, "allowlist": []}`), idempotent via `ON CONFLICT DO NOTHING`
  (a re-applied seed never resets a live allowlist). A structural clone of `055`,
  rationale rewritten for the one thing that differs (own-flag, below).
- **`lib/appConfig.ts`** — `signals_v2` added to `ALLOWLIST_FLAG_KEYS` and
  `ALLOWLIST_FLAGS_UNSET` (+ the explanatory comment). Not schema, but the seed is
  *inert* without it — `extractAllowlistFlags` picks only registered keys and
  `useAllowlistFlag` is typed to the union, so an unregistered key can't be read or
  gated on.
- **`lib/appConfig.test.ts`** — a `signals_v2` `describe` block mirroring the
  `log_picker_v2` one (unset baseline; extract raw off a SELECT alongside the four
  sibling keys, undisturbed; fail-closed when unset; dark-seed off for everyone incl.
  signed-out no-leak; allow-listed uid on; cache round-trip).
- **`lib/session.test.ts`** — the B-402 sign-out wipe test extended to the new key,
  since the cached allowlist carries account UUIDs and must not outlive the session
  on a shared device.

## The one decision worth recording: its OWN flag, still client-render-only

`signals_v2` is deliberately **not** `signal_design_v2` (spec §0 D6). The two split
by *concern*, not by architecture:

- `signal_design_v2` gates **how** the Signal cards render (B-721's receipt/register
  uplift).
- `signals_v2` gates **what** the engine says — four new lanes (L1 empty-stomach
  timing / L2 trial-response / L3 photo-record composition / L4 gap-shortening) plus
  an eventual `generate-signal` redeploy.

Because the track changes engine output and will carry its own server deploy, it
needs a **separate kill-switch and a separate GA call** — you don't want a "turn off
the new lanes" action to also revert the card-rendering uplift, or vice versa. The
accepted cost is one extra beta-shelf row about the Signal (PR 10).

But the **gating architecture is identical to 055's**: the new server lanes are
computed **uniformly for every account** and are flag-independent — an old/flag-off
client simply ignores the additive payload, and the deterministic escalation is never
gated. So there's no per-cohort server cost, `serverCost` will be false on the shelf
row, and there is deliberately **no** server-side registration of this key
(`supabase/functions/_shared/flags.ts` is a generic resolver and needs no per-key
entry). The engine's redeploy discipline is a **separate** deploy gate — **G10**:
`generate-signal` is redeployed with a new finding/payload type only after the client
PR that renders-or-safely-ignores it merges — not something this flag enforces.

## Applied live + advisors

Applied via the Supabase MCP `apply_migration` (`aigchluqluzuhtbfllgh`, name
`signals_v2_config`), **before merge** per FR seed-first. Pre-apply check returned 0
rows; read-back after apply confirms `{"enabled": false, "allowlist": []}` as `jsonb`
— dark.

`get_advisors` (security) returns only two **pre-existing, unrelated** WARNs
(`record_ai_usage` SECURITY DEFINER; the auth leaked-password setting). `app_config`
appears in neither — seeding one row into an existing RLS-protected table introduces
no table, policy, function, FK, or index, so it adds zero new advisories. Same
"advisors clean" outcome as the 054/055/056 seeds.

## No enablement UPDATE this session — by the issue

Unlike the `log_picker_v2` PR 0 (whose task asked to allowlist the PM uid), CUL-5
specifies **default nobody** and nothing more. So no cohort UPDATE was run — the flag
sits fully dark. Cohort enablement is a later, recorded `app_config` write (a PM
action), never baked into the seed.

## Verification

- `tsc --noEmit` clean. The union extension surfaced exactly one consumer that builds
  a full `AllowlistFlagValues` literal (`lib/session.test.ts`) — fixed by adding the
  key with a UUID, keeping the wipe test's intent. Everything else spreads
  `ALLOWLIST_FLAGS_UNSET`, so it was untouched.
- Full `jest` suite green: **220 suites / 4917 tests / 11 snapshots** (locally and
  again in the pre-push hook). CI green on all three checks (`App (typecheck + jest)`,
  `Edge Functions (deno test)`, `App (jest, non-UTC timezones)`).
- Flag-off is byte-identical by construction — nothing consumes the flag, and
  resolution is fail-closed (unset ⇒ `undefined` ⇒ `fallback=false`; dark seed off for
  every caller incl. signed-out). No consumer snapshot to pin yet; that lands with the
  first UI PR.

## Notes for the next session

The track's foundation is now down: PR 0 (this, the flag, #641) + **PR 1 (CUL-6, the
`lib/mealTiming.ts` + `lib/rateContrast.ts` primitives + the G10 unknown-type pin,
#639)** both shipped. Next is **PR 2 (CUL-7): the L1 `empty_stomach_timing` detector +
the `timing_story` composition + the episode-set-aware suppression fix** — a server PR
(no deploy), **adversarial-reviewer mandatory**, with the property-sweep-against-null-
models ritual before the floors lock (`minLongGapEpisodes` 3 / `minEligibleEpisodes` 6
/ `minLongGapFraction` 0.25, all provisional; `longGapHours` already ruled 6h, CUL-16).
It builds directly on PR 1's `lib/mealTiming.ts` (the one-predicate rule, G9). The flag
is now readable via `useAllowlistFlag('signals_v2')` when the client PRs (5–7, 9) reach
it.
