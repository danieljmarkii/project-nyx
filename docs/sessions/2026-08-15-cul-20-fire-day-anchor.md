# DR-0 — the Day Summary fire-day anchor (CUL-20 / B-672)

**Date:** 2026-08-15

Shipped via **#651** (draft). First PR of the Daily Recap track (B-760); DR-0, the foundational plumbing that DR-1 (CUL-23, the screen + four states) and DR-7 (CUL-27, finish pass) build on.

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

- **Delivery instant, not a schedule-time payload field.** The Linear issue phrases the payload as carrying the fire-day "computed at schedule time," but a repeating expo `DAILY` trigger's `content.data` is scheduled once and is static — it cannot carry a per-fire day. The authoritative B-672 backlog row (line 720) prescribes carrying the **delivery instant** as a tap param, which is what shipped. Baking a schedule-time day would be strictly worse than useless: it would be the schedule-creation day, so every tap past day 2 would clamp and the anchor would never help.
- **The clamp resolves the B-672 PM decision** (fire-date-vs-accept): anchor to the delivered day, clamp when the fired-for day is >1 local day old — so the cross-midnight case is fixed without a stale 3-day-old tap opening a 3-day-old summary.
- **Never widens a false-empty** (clinical-guardrails, checked deliberately): the un-anchored path is unchanged; the anchored path only ever moves the render to a day the record itself holds (today/yesterday); the stale path lands on today; and even a normalization miss fails safe to today. B-672 strictly *reduces* false-empties.

## Deferred to DR-1 (CUL-23)

When the anchored day is *yesterday and itself empty*, the empty-state copy still reads "Nothing in {pet}'s record **today**." DR-1 owns the four states (including the empty-state copy), so the day-aware empty copy was left there rather than partially reworked here. Benign — the empty state only renders when the anchored day had no logs, so there is nothing to "lose"; the header (the DR-0-scoped surface) does name the rendered day.

## Tests & gates

- `lib/daySummary.test.ts` — the clamp boundary (no-instant → now; age 0 → fired-for; **12:40am tap → yesterday**; **2-day-old tap → today**; future → now; non-finite → now; a device-path cross-midnight case from local components). B-514-honest.
- `lib/notificationRouting.test.ts` — `normalizeFireInstant` (Android ms kept, iOS seconds promoted, stringified params, fractional-second rounding, garbage → null). `routeDedup`'s existing tests untouched.
- `tsc --noEmit` clean; full jest suite green (220 suites / 4967 tests); the two touched suites green under Pacific/Kiritimati (UTC+14), Pacific/Chatham (UTC+12:45), Pacific/Honolulu (UTC−10).
- Gate: `code-reviewer`.

## Persona sign-off

Engineer ✓ (pure-core/IO-shell split; `routeDedup` untouched; the seconds/ms normalization is the load-bearing catch) — Data N/A — Designer ✓ (header names the rendered day; empty-copy day-awareness scoped to DR-1) — Dr. Chen / clinical-guardrails ✓ (no false-empty widened; anchor fails safe to today) — QA ✓ (clamp boundaries + non-UTC zones).
