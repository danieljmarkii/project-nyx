# TS-0: the trial_screen flag, its hook, its shelf row and its flag-off guard

**Date:** 2026-09-26

Shipped via #941 (CUL-1296). Step 1 of the Linear project **Diet trial — its own screen**, one of four parallel sessions (TS-1 CUL-1297, TS-2 CUL-1298, the widget's pet CUL-1292).

## The ask

Put the switch in before the screen: seed `app_config.trial_screen` dark, give it one reader, a Beta shelf row and a flag-off guard on the History v2 template, so every later lane (TS-4 the route and screen onward) lands invisible. Spec: `docs/nyx-trial-screen-requirements.md` §0.2 T-2, §2 S10, §7, §11 TS-0. The plan was posted on the issue; the PM said go and ruled that `app/settings/beta.tsx` (the shelf card's icon and on-hint) waits for TS-4.

## What changed

- **Migration 073** (`supabase/migrations/073_trial_screen_config.sql`): one `app_config` row, `{"enabled": false, "allowlist": []}`, `ON CONFLICT DO NOTHING`, 071's header and Migration Safety Pre-flight. **Applied to prod via the Supabase MCP this session** (preflight 0 rows, post-check the dark value); advisors show nothing new.
- **Registration** (`lib/appConfig.ts`): the key joins `ALLOWLIST_FLAG_KEYS` and `ALLOWLIST_FLAGS_UNSET`. Outside the issue's four files and unavoidable: `AllowlistFlagKey` derives from that array.
- **The hook** (`hooks/useTrialScreen.ts`): `useAllowlistFlag('trial_screen') && useBetaOptIn('trial_screen')`, the `useHistoryV2` shape. Tested over the four combinations, the unset baseline, a signed-out caller, and with `design_v2` / `history_v2` live (T-2: its own flag).
- **The shelf row** (`lib/betaFeatures.ts`): *Diet trial screen*, `serverCost: false`, review by 2026-12-26. Blurb: "The diet trial on a screen of its own: what they can eat, the trial week by week, and its facts in one place. Switch it off and the trial stays on the Pet tab, exactly as it was." The second sentence names where the trial lives today, so the promise tells the owner where to find it. Hidden for an ineligible account (asserted through `deriveBetaShelf`, dark seed and non-listed uid). With no case in `beta.tsx` the card falls through to the default flask icon until TS-4.
- **The guard** (`guards/trialScreenFlagOff.test.tsx`): the C-36 harness over `components/trialScreen/`, with `SURFACES` asserted empty until TS-4 (C-32) and the four surfaces §7 names listed in the header against the PR that registers each. The consumer list is pinned to `[]`; the key is read only in the hook; no aliasing; scan dirs derived from the repo (C-38); the mocked-module closure is walked. The C-41 async blind spot is stated, with the proof each surface owes in its own suite. The namespace may not exist yet (TS-2 creates it in parallel), and an absent namespace reads as empty, so merge order does not matter.

## Proofs by mutation

In the file (fixture trees outside the repo, `guards/fixtureRoot.ts`):
- The equivalence half: a synthetic surface rendering a namespace module ungated makes the two trees differ.
- The consumer scans, new relative to the template: the scan functions take a root, and a fixture tree with a route reading the gate and drawing inline reds the delegation rule and the route rule; a second direct read reds the one-reader rule; a well-behaved door (gate + namespace import) passes delegation.

By hand against the real tree, each reverted:
- M1, `app/trial/[pet].tsx` reading the gate and drawing inline: 4 red (the pinned list, the namespace-holds-a-component rule, delegation, the route rule).
- M2, a second `useAllowlistFlag('trial_screen')` in `hooks/`: the one-reader test red.
- M3, `useTrialScreen as useT`: the alias test red.
- M4, a route that imports the namespace correctly: delegation green, the pinned list and the route rule red, which is what forces TS-4 to register its surface.

## Review

`code-reviewer`: ship-ready. Its one nit (a `components/` consumer is not forced to register its host screen) is now a stated blind spot in the guard header.

## Checks

`tsc --noEmit` clean; full `jest` 530 suites green.

## Next

TS-4 (CUL-1300) is the first consumer: it edits `SURFACES` and the pinned consumer list in this guard, owes the async flag-off proof in the screen's own suite, and adds the shelf card's icon and on-hint to `app/settings/beta.tsx`. Steps 2 onward wait for the App Store submission cut (T-2).
