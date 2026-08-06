# Beta features program — approach, round-1 mocks, phased go

**Date:** 2026-08-06
**PR:** shipped via #601 (draft — docs-only, round-1 mocks)
**Track:** Beta features program (B-712); guardrails (B-713)
**Type:** Discovery + design (mock round 1) + product decision. No app code, no schema.

## The ask

The PM proposed: (1) wrap the Home Screen widget in a feature toggle, (2) enable it for their own account, (3) add a "beta features" style page under account settings, (4) let customers (maybe premium) opt into beta features feature-by-feature and test them for us. The stated goal: keep the slow, secondary widget work from gating the App Store submission. They asked what the team thought and the level of effort, then asked for mocks, then asked for the shortcomings, then for a go/no-go.

## What was found (research)

Three parallel research passes over the codebase established the ground truth the effort estimate rides on:

- **The feature-flag primitive already exists and is the exact thing the PM remembered from Ask.** `037_ask_config.sql` defines a per-account allowlist flag in `app_config`, shaped `{"enabled": bool, "allowlist": ["<uuid>", …]}`, resolved per signed-in uid via `resolveAllowlistFlag()` / `useAllowlistFlag()` (`lib/appConfig.ts:66`, `hooks/useAppConfig.ts:87`). Ships dark; enable-for-one-account = add a uid (one config UPDATE). Client-resolved, fail-closed.
- **The widget has a single clean choke point:** `hooks/useWidgetSnapshots.ts` — everything the widget shows flows through one publish call; today the only gate is `if (!session) return`. Teardown helpers already exist (`clearWidgetData`, `clearWidgetTimeline`).
- **The settings page is ~90% scaffolded** for a beta page: `app/settings.tsx` hub + `app/settings/notifications.tsx` sub-page pattern; a toggle row is `SettingsRow` + RN `<Switch>`. A beta page ≈ copy notifications.tsx + one row + one route line.
- **There is no `isPremium` check today.** No RevenueCat, no `entitlements` table, paywall built-but-mocked and flagged OFF. Premium gating is blocked on the unbuilt Track-3 — which is *why* the PM's scope cut (allowlist now, premium later) is the right call.

## Decision — phased GO (PM, 2026-08-06)

The team read was a decisive, phased yes; no hard persona conflict (team converged). The decision is not one thing:

1. **Phase 1 — widget behind the flag, on for the PM's account: unambiguous yes, build now.** Reuses the Ask primitive; near-zero new infra; fully reversible; directly protects the submission.
2. **The program (self-serve shelf, parts 3–4): yes in principle, don't big-bang it.** Gate the shelf build on a short scoping pass (graduation/kill policy, measurement + consent, scale mechanism).
3. **Premium gating (part 4): correctly deferred** — the one-line Gate-1 swap waits for Track-3.

**Scope cut ratified:** no premium now; access is the DB-managed allowlist; the widget is the first and only beta; everything defaults off. The mock's core IA is **two gates, never conflated** — eligibility (allowlist, owned by us) vs. opt-in (the toggle, owned by the owner) — which is what makes the eventual premium swap a one-line change.

## The pre-mortem (what we'll regret if we don't see it now)

The PM explicitly asked for the shortcomings. The load-bearing findings, captured as B-713:

1. **A home-screen widget can't be hidden per-account.** iOS surfaces every app's widgets in the gallery to anyone with the app installed; the flag gates the widget's *data* (the App Group snapshot), not its *availability*. This corrected an over-strong claim I'd made earlier ("reviewers never see it") — reviewers won't see the in-app beta *row*, but they can add the *widget* and see its ungated state. **Consequence: the widget's honest empty state is Phase-1 relevant, not a Phase-2 nicety**, and the App Review demo-account handling must be decided. The mock's Section-1 callout and footer were corrected in this PR.
2. **The client-side gate doesn't generalize to server-cost betas.** The widget is safe on a client-only gate (reads its own local data). The next beta (Ask) burns AI credits per call and *must* gate on the server too. Write the rule down before beta #2.
3. **The hand-edited allowlist can't scale to "customers"** — fine for a dozen dogfooders, a bottleneck for the part-4 vision. Scale needs the premium check or a `beta_members` table + join flow.
4. **No feedback/measurement loop = a slower ship, not a beta program** — and the widget is near-unobservable (iOS won't say whether it's on a home screen). Measurement over health data ties to the parked analytics/T&S questions (B-016/B-047).
5. **The beta graveyard** — without a graduation/kill policy + per-beta owner & expiry, unfinished features accrete as debt and erode the quality bar.
6. **Premium-later is a "taketh away" moment** with Pets > $ tension — grandfather testers; never paywall a care feature that graduated.

Second-tier, named not solved: flag combinatorics (QA matrix + CI won't test flag-on paths unless added); App Review Guideline 2.1 gray area for visibly-incomplete production features; ops footguns (re-applying the 037-style seed migration wipes the allowlist; client caches the flag so the kill-switch isn't instant; app_config global blast radius).

## What shipped this session

- `docs/culprit-beta-features-mockups.html` — round-1 mocks, matched to the house mock system (indigo paper / Charter serif / mono labels / real `theme.ts` device-frame tokens). Frames: Settings entry point (cohort vs. everyone-else), the beta page (nothing-on / widget-on), the two-gate access schematic, an illustrative grown shelf (widget + Ask, clearly marked not-committed). Published as an Artifact (favicon 🧪): https://claude.ai/code/artifact/e378a607-f39f-430f-b479-3fa2caf7b577 — future rounds re-publish to the same URL.
- Corrected the "reviewers never see it" over-claim (callout + footer) after the pre-mortem.

## Persona lenses applied

Engineer (choke point + reuse-the-Ask-primitive), Designer (two-gate honesty, invisible-unless-opted-in, Principle-5 empty states, Pets > $ on premium-later), Data Scientist (measurement/observability gap), Trust & Safety (client-gate ≠ paywall; server-gate rule; health-data measurement consent), QA (flag combinatorics, flag-on test), Product Owner (guardrails captured as B-713), PM/wedge (submission is the priority; the program must not compete with shipping).

## Residuals / next

- **Next:** a PR-by-PR plan to ship the program (the PM's stated next step). Phase 1 first (schema PR to seed `widget_enabled` ship-dark + client PR to gate the publish and read the toggle + a presentable widget empty state), then the scoping pass on B-713's guardrails before the shelf.
- Open design items in the mock: the name (Beta features / Labs / Early access), the "1 on" Settings-row count, feedback channel (reuse Support row vs. beta-specific).
