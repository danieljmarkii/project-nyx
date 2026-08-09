# Signal/Home uplift (B-721) — join the beta shelf (FR-FLAG-4)

**Date:** 2026-08-09 · **PR:** shipped via #622 (draft) · **Server:** none (client code; eligibility is a PM `app_config` UPDATE)

Follow-up to the SR-6 wrap (#620), prompted by on-device PM feedback: the new TestFlight build shows the **beta features** screen, but the Signal/Home redesign wasn't on it — only the widget. That's exactly the **FR-FLAG-4** gate the SR-6 GA recommendation flagged (the spec's "beta-shelf before GA" clause). This PR closes the **code** half; the **eligibility** half is a one-line config the PM runs.

## Why it wasn't there — two gaps

1. **Code:** the Signal uplift was gated **allowlist-only** (`useAllowlistFlag('signal_design_v2')`) and had **no `BETA_REGISTRY` row**, so the beta shelf (which maps over the registry) had no card to render for it. The widget shows because it *has* a registry row.
2. **Config:** even with a row, a card only renders when the account is **eligible** — its uid is in `app_config.signal_design_v2`'s allowlist, which is seeded empty (nobody).

## What shipped (code — #622)

The **FR-FLAG-4 composition**, exactly as specced in `docs/nyx-signal-home-requirements.md` §7 + the SR-6 GA rec:

- **`lib/betaFeatures.ts`** — a `signal_design_v2` `BETA_REGISTRY` row: title **"Signal redesign"**, an nyx-voice blurb ("A clearer Signal on Home — the evidence behind each insight, one tap away, and a plain read of how this week compares with last."), `owner`, `reviewBy` (~1 quarter). **`serverCost: false`** — the uplift is client-render-only (SR-4's payload is computed uniformly for every account, not per-cohort), so no server gate is owed and the B-712 "server-cost betas gate server-side" rule is checked and doesn't bite (`betaFeatures.test.ts` asserts it).
- **`app/settings/beta.tsx`** — a `Sparkles` icon + **no on-state hint** (unlike the widget, the redesign takes effect the moment it's on — nothing for the owner to place or do).
- **`components/home/SignalZone.tsx`** — the render gate now composes the **B-712 two-gate rule, never conflated**: `eligible` (`useAllowlistFlag`) **&&** `optedIn` (`useBetaOptIn`). Both hooks are called **unconditionally** then combined (Rules of Hooks — no `&&` short-circuit on the hook calls), mirroring `BetaFeatureCard`. Being in the cohort makes the card **visible**; the owner's local opt-in (default off, wiped on sign-out) turns the redesign **on**.

`SignalZone` is the **only** place that resolves `signal_design_v2` (every other consumer receives the `designV2` prop), so composing it here closes the whole surface — no partial leak (FR-FLAG-1). Flag-off / opted-out is byte-identical (snapshot-pinned, FR-FLAG-2).

## The eligibility step (PM action — the config half)

The card appears on the beta shelf **only for an eligible account**. To dogfood on your own device, add your uid to the allowlist (`{"enabled": false, "allowlist": [...]}` = on for those uids only; `"enabled": true` would be GA-for-everyone — not what we want yet):

```sql
-- your uid: Supabase dashboard → Authentication → Users (your email), or
--   SELECT id FROM auth.users WHERE email = '<your-email>';
UPDATE app_config
SET value = '{"enabled": false, "allowlist": ["<YOUR-UID>"]}'::jsonb
WHERE key = 'signal_design_v2';
```

Reversible any time (`… "allowlist": []` to clear). **Sequence + a caveat worth knowing:**
1. Merge #622, then get it on the device (`eas update --branch preview` / a new build).
2. Run the UPDATE above (your uid).
3. On the new build, the **"Signal redesign"** card appears on `Settings → Beta features` — toggle it **on** to enable the redesign.

**Caveat:** if you run the UPDATE *before* the device has #622, the build still carries the old allowlist-only gate — so being allowlisted would turn the redesign **on directly** (no card, no opt-in). That's the sanctioned dark/dogfood behavior, but it's a surprise if you expected the shelf card. Do #622 → device → then the UPDATE for the clean shelf flow.

## Definition of Done

- [x] AC — FR-FLAG-4 two-gate composition (`eligible && optedIn`, never conflated) test-asserted (eligible-but-opted-out → shipped surface); FR-FLAG-1/2 hold (single resolution point; flag-off/opted-out byte-identical, snapshot-pinned).
- [x] Types clean (`tsc --noEmit`); full suite green (4763 tests, 9 snapshots) in the pre-push hook; `SignalZone` + `betaFeatures` suites updated (registry length 1→2 + serverCost assertions; the two-gate test).
- [x] Anti-patterns: theme tokens only; the registry grows by a data row (no hand-coded card); no new secret.
- [x] nyx-voice on the shelf copy — concrete, no exclamation, doesn't over-sell "new" (Designer). Persona: Designer ✓ (copy + icon) — Engineer ✓ (two-gate gate, Rules of Hooks, single resolution point) — QA ✓ (two-gate + FR-FLAG snapshots) — Data N/A — T&S ✓ (opt-in is local, wiped on sign-out; no new data boundary).
- [x] Future-self: the shelf grows by adding a `BETA_REGISTRY` row + composing the gate — the pattern the next beta reuses.

## Known follow-ups / process notes

- **Shelf-row copy has no dedicated B-712 mock frame** (the "mock what you change" directive). It's a near-identical variant of the widget card, built to unblock the PM's dogfood; a mock frame in the B-712 round is the proper follow-up if the copy wants refining.
- The other GA gates are unchanged and still open: the **SR-4 deploy + B-727**, **B-734/B-735** (the E1 issues), and the register/lane device-pass. FR-FLAG-4 (this) is now closed.

## Next Session Kickoff

**Recommended first prompt:**
> Deploy the SR-4 `generate-signal` payload (B-721) and land B-727 together — the pair that activates the already-built SR-5 client (#621). Run `scripts/deploy-edge.sh generate-signal --deploy` from the Codespace (verify per the edge-deploy runbook; generate-signal is not under the B-494 hold), and retire "after none" across the server card sentence + client `evidenceText` + compose `New` into the worsening card's a11y label, with a pinning test. Read `docs/nyx-signal-home-requirements.md` §5.5/§9 and the B-727 backlog row first.

**Alternate prompts:**
- Fix the E1 load-flash (B-734) — don't force the heavy building state during the network cache read; clear `localCtx` on pet switch.
- Resolve B-735 (needs a PM copy/threshold decision first).
