# DR-0 — the Day Summary fire-day anchor (CUL-20 / B-672)

**Date:** 2026-08-15

Shipped via **#651** (draft). First PR of the Daily Recap chunk (B-762; the spec `docs/nyx-daily-recap-requirements.md` landed on `main` via #645 mid-session and was merged in); DR-0, the foundational plumbing that DR-1 (CUL-23, the screen + four states) and DR-7 (CUL-27, finish pass) build on.

Verified against the spec after it landed: the build matches **§1** (routing passes the instant through → `buildDaySummary` `nowMs` → clamp; header names the rendered day), **§8 AC #1** (12:40am → fired-for day; ≥2-day-old → today; header names the rendered day), the **§7 DR-0 row** (gates: `code-reviewer`, B-514 fixtures, non-UTC CI), and the **R-4 ruling** — which rules the anchor "per the standing recommendation," i.e. the B-672 backlog row's delivery-instant shape, exactly what was built.

## The bug

The 9pm Day Summary notification fires **for** a given day, but `useDaySummary` computed "today" from `Date.now()` and handed it to `buildDaySummary`. So an owner who taps the still-present notification after midnight — late at night, or over Sunday breakfast — landed on the new, near-empty day, and a Saturday they diligently logged read **"Nothing in {pet}'s record today."** On the surface whose *primary* entry point is that notification, that reads as "the app lost my logs" — the exact false-empty the module works to avoid. It was the `pm-feature-review` #1 finding on B-661 PR 5, carried as B-672 with an open PM decision.

## What shipped

Thread the instant the notification **fired** through the tap route, and anchor the rendered day to it with a staleness clamp.

- **`lib/notificationRouting.ts` — `normalizeFireInstant` (pure, new).** The fire instant is the OS delivery time (`response.notification.date`). It normalizes expo's platform split in `Notification.date`: **seconds on iOS** (`NotificationRecords.swift:441` = `timeIntervalSince1970`) but **milliseconds on Android** (`NotificationSerializer.java:52` = `getTime()`), with nothing in the JS layer reconciling them. A seconds-scale value (`< 1e12`) is promoted ×1000. **This is load-bearing, not defensive:** read raw, every iOS delivery (~1.7e9) resolves to a 1970 day and clamps to today on every tap — the anchor would silently never fire on the iOS-first (TestFlight) build. Returns null for missing/garbage → no anchor → the pre-B-672 default (today).
- **`lib/daySummary.ts` — `resolveDaySummaryAnchorMs` (pure, new).** The clamp. Honours the fired-for day only while its B-421 `localDayIndex` is `todayIndex` or `todayIndex - 1`; anything older (a stale, un-dismissed notification) or a future instant (a bad clock/payload) falls back to `nowMs`.
- **`hooks/useDaySummary.ts`.** Takes an optional `firedForMs`, bakes the anchor once (so the SQL prefetch bound and the builder clip agree), passes it as `buildDaySummary`'s `nowMs`, and exposes the resolved `anchorMs` in the ready state.
- **`app/day-summary.tsx`.** Reads the `firedAt` route param (parsed defensively), passes it to the hook; the date header now names the **rendered** day (`dayLabel(anchorMs)`) rather than the wall clock.
- **`hooks/useNotificationScheduling.ts`.** Passes the normalized instant as the `firedAt` route param on tap. **`routeDedup` untouched** — it still keys its dedup signature on the raw delivery time.

## Decisions

- **Delivery instant, not a schedule-time payload field.** Both the Linear issue and spec §1 phrase the payload as carrying the fire-day "computed at schedule time," but a repeating expo `DAILY` trigger's `content.data` is scheduled once and is static — it cannot carry a per-fire day, and baking the schedule-creation day would make every tap past day 2 clamp (the anchor would never help). The spec's own **R-4 ruling resolves this**: it rules the anchor "per the standing recommendation," which is the B-672 backlog row's **delivery-instant** shape — and the §1 clamp requirement only functions with a per-fire instant. So the delivery instant is the coherent reading, and it is what shipped.
- **The clamp resolves the B-672 PM decision** (fire-date-vs-accept): anchor to the delivered day, clamp when the fired-for day is >1 local day old — so the cross-midnight case is fixed without a stale 3-day-old tap opening a 3-day-old summary.
- **Never widens a false-empty** (clinical-guardrails, checked deliberately): the un-anchored path is unchanged; the anchored path only ever moves the render to a day the record itself holds (today/yesterday); the stale path lands on today; and even a normalization miss fails safe to today. B-672 strictly *reduces* false-empties.

## The empty-state copy (a spec decision, confirmed — not a gap)

When the anchored day is *yesterday and itself empty*, the zero-log copy still reads "Nothing in {pet}'s record **today**." This is intentional: spec **§2 keeps the zero-log copy "verbatim from shipped v1,"** so DR-0 leaves it untouched by design (and DR-1 rebuilds the four states on the night ground with that same verbatim copy). Benign either way — the empty state only renders when the anchored day had no logs, so there is nothing to "lose"; and the header (the DR-0-scoped surface, §1) does name the rendered day. Flagged as a minor observation to the PM, but the spec has ruled the copy stays verbatim, so no action.

## Tests & gates

- `lib/daySummary.test.ts` — the clamp boundary (no-instant → now; age 0 → fired-for; **12:40am tap → yesterday**; **2-day-old tap → today**; future → now; non-finite → now; a device-path cross-midnight case from local components). B-514-honest.
- `lib/notificationRouting.test.ts` — `normalizeFireInstant` (Android ms kept, iOS seconds promoted, stringified params, fractional-second rounding, garbage → null). `routeDedup`'s existing tests untouched.
- `tsc --noEmit` clean; full jest suite green (220 suites / 4967 tests); the two touched suites green under Pacific/Kiritimati (UTC+14), Pacific/Chatham (UTC+12:45), Pacific/Honolulu (UTC−10).
- Gate: `code-reviewer`.

## Persona sign-off

Engineer ✓ (pure-core/IO-shell split; `routeDedup` untouched; the seconds/ms normalization is the load-bearing catch) — Data N/A — Designer ✓ (header names the rendered day; empty-copy day-awareness scoped to DR-1) — Dr. Chen / clinical-guardrails ✓ (no false-empty widened; anchor fails safe to today) — QA ✓ (clamp boundaries + non-UTC zones).
