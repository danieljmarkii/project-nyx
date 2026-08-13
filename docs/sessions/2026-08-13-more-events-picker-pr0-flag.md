# More events / log-picker redesign — PR 0: the `log_picker_v2` flag, dark (B-745)

**Date:** 2026-08-13
**Shipped via #632.**

## What this was

PR 0 of the More-events / log-picker redesign (B-745): seed the `log_picker_v2`
`app_config` allowlist flag the whole track ships dark behind, register it
client-side, and add its Beta-features shelf card — all dark, nothing consuming the
flag yet. The spec (`docs/nyx-more-events-picker-requirements.md` v1.0) was
design-locked the same day (F1, via #629); this is the first build PR against it.
Per §4 / FL-2, PR 0 is the seed-first gate the picker PRs (1–3) queue behind.

Followed the `signal_design_v2` (SR-0, #610) and `widget_enabled` (B-712 PR 1,
#605) precedents exactly — with one composition difference: because the spec put
the shelf card in PR 0, this single PR carries what the Signal track split across
SR-0 (flag seed + registration) **and** FR-FLAG-4 (#622, the `BETA_REGISTRY` row +
shelf card). All still one PR because none of it is schema beyond the seed, and the
seed is inert without the registration.

## What shipped

- **`supabase/migrations/056_log_picker_config.sql`** — seeds `log_picker_v2` into
  `app_config` with the B-712 allowlist shape, **default nobody**
  (`{"enabled": false, "allowlist": []}`), idempotent via `ON CONFLICT DO NOTHING`.
  A structural clone of `054`/`055`, rationale rewritten for the one thing that
  differs (client-render-only, below).
- **`lib/appConfig.ts`** — `log_picker_v2` added to `ALLOWLIST_FLAG_KEYS` and
  `ALLOWLIST_FLAGS_UNSET` (+ the explanatory comment). Not schema, but the seed is
  *inert* without it — `extractAllowlistFlags` picks only registered keys and
  `useAllowlistFlag` is typed to the union, so an unregistered key can't be read or
  gated on.
- **`lib/betaFeatures.ts`** — a `log_picker_v2` `BETA_REGISTRY` row: title
  **"Log screen redesign"**, an nyx-voice blurb ("A clearer way to log an event —
  the types grouped so what you need is easy to find, and simple ones finish without
  opening another screen."), `owner`, `reviewBy` (~1 quarter), **`serverCost: false`**
  — zero server component (the redesign is presentation + step structure only), so
  no server gate is owed and the B-712 "server-cost betas gate server-side" rule is
  checked and doesn't bite (`betaFeatures.test.ts` asserts it).
- **`app/settings/beta.tsx`** — a `SquarePen` icon + **no on-state hint** (like the
  Signal redesign: the new picker takes effect the moment it's on — the owner reaches
  it by tapping the FAB; nothing to place or do, unlike the widget). A distinct
  "log an entry" glyph so the three shelf cards read apart (widget grid / signal
  sparkles / log-picker pen).
- **Tests** — `lib/appConfig.test.ts` gains a `log_picker_v2` block mirroring the
  `widget_enabled` / `signal_design_v2` ones (unset baseline; extract raw off a
  SELECT alongside the other keys; fail-closed when unset / signed-out / dark-seed;
  allow-listed uid on; cache round-trip). `lib/betaFeatures.test.ts` updated (registry
  length 2→3 + the log-picker `serverCost:false` assertion). `lib/session.test.ts`'s
  B-402 sign-out wipe test extended to the new key, since the cached allowlist carries
  account UUIDs and must not outlive the session on a shared device.

## The one decision worth recording: client-render-only

Like `signal_design_v2`, `log_picker_v2` is deliberately **not** registered
server-side, and here the case is even stronger: the redesign is presentation and
step-structure only (spec §1) — same event writes, same `occurred_at_confidence`
model, same photo→AI-read trigger, same sync paths, same `EVENT_TYPES`/`EventIcon`
single render path. There is **zero** server component for a gate to protect.
`supabase/functions/_shared/flags.ts` is a generic resolver (keyed by string param,
no per-key union), so it needs no entry regardless. `serverCost: false` is therefore
correct, and the client-only gate is sound.

## Applied live + advisors

Applied via the Supabase MCP `apply_migration` (`aigchluqluzuhtbfllgh`, name
`log_picker_config`). Read-back after apply confirms `{"enabled": false,
"allowlist": []}` as `jsonb` — dark.

`get_advisors` (security + performance) returns only **pre-existing** lints, all on
other objects: `record_ai_usage` (SECURITY DEFINER), the auth leaked-password
setting, unindexed FKs / RLS-initplan re-eval / unused indexes across
diet_trials/events/medications/food_items/etc. `app_config` appears in **none** of
them — seeding one row into an existing RLS-protected table introduces no table,
policy, function, FK, or index, so it adds zero new advisories. Same "advisors clean"
outcome as the 054/055 seeds.

## Enablement: PM uid allowlisted this session

Unlike SR-0 (which deferred cohort enablement), the task asked to allowlist the PM's
uid when the migration was live. Done, as a **separate config UPDATE** (never baked
into the seed — the 037/054/055 discipline that a re-applied seed must never reset a
live allowlist):

```sql
UPDATE app_config
SET value = '{"enabled": false, "allowlist": ["2eeeaef5-753a-467c-8c17-2b9fed40ee34"]}'::jsonb
WHERE key = 'log_picker_v2';
```

`enabled:false` + the one uid = gated to the PM only (the dark/dogfood state). uid
confirmed live against `auth.users` (danieljmarkii@gmail.com), and it's the same uid
already on `widget_enabled` / `signal_design_v2`.

**Caveat (matches FR-FLAG-4's):** the client gate is inert on-device until a build
carrying this PR's JS is installed, and even then **nothing consumes the flag yet**
(PR 0). So the visible effect today is: the PM sees a "Log screen redesign" card on
the Beta-features shelf (reachable because they're already on `widget_enabled`, which
gates the Settings row) and can toggle its opt-in — but no picker change renders
until PR 1. The value of allowlisting now is that the PM is already in the cohort when
PR 1 lands.

## The gap I found and did NOT close: the Settings row's eligibility gate → B-747

`app/settings.tsx` gates the "Beta features" ROW on `useAllowlistFlag('widget_enabled')`
only (line 55), and `activeBetaCount` counts the widget opt-in only — even though the
shelf now holds three betas, each self-gating its own card. So an account eligible
for a non-widget beta but NOT the widget can't reach the shelf at all. The code's own
comment (line 52) says this should become "an OR over the registry's keys when a
second beta lands" — it landed twice (FR-FLAG-4 + this PR) without the change.

I left `settings.tsx` untouched, deliberately:
1. **The FR-FLAG-4 precedent left it** — "follow the precedent exactly."
2. **It doesn't bite the dogfood cohort** — the PM uid is on `widget_enabled`, so the
   row shows and every eligible card renders.
3. **It's coupled to B-729** (the zero-eligible-card empty state): widening the gate
   makes the undesigned intro-over-no-card moment *more* reachable, so the two should
   ship together, not piecemeal here.

Filed as **B-747** (Next, paired with B-729) so it isn't lost.

## Verification

- `tsc --noEmit` clean. The union extension surfaced exactly one consumer that builds
  a full `AllowlistFlagValues` literal (`lib/session.test.ts`) — fixed by adding the
  key (with a UUID, keeping the wipe test's intent). Everything else spreads
  `ALLOWLIST_FLAGS_UNSET`, so it was untouched. The `.toEqual`-based allowlist tests
  tolerate the new `undefined` baseline key (Jest ignores undefined properties).
- Full `jest` suite green: 213 suites / 4787 tests / 9 snapshots. Targeted run of the
  four affected suites (89 tests) green first.
- `code-reviewer` subagent run against the diff (general health + house rules).

## Notes for the next session

Next is **PR 1** (the new picker, current presentation): custom glyphs (splat +
swirl + loose-stool sibling) behind `EventIcon`, BatteryLow + Ellipsis swaps, the
grouped tile grid extracted to `components/log/EventTypePicker`, photo-first entry
removed, `Header` migration + token cleanup across all five `app/log.tsx` headers,
README icon-section correction. Flag-on only; flag-off must stay byte-identical
(snapshot-pinned, FL-1). It reads `useAllowlistFlag('log_picker_v2')` — now readable.
