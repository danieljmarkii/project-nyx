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
- **`lib/daySummary.ts` — `buildAnchoredDaySummary` (pure, new).** Wraps the clamp with the **empty-fired-day fallback** (the R-4 refinement, PM-ruled 2026-08-15 — see Code review below): if the anchor is a PAST day (an age-1 tap) that is itself **empty**, it yields to today, so a symptom logged after midnight is never hidden behind an empty "nothing today." A fired-for day *with* rows still wins (B-672 preserved). Returns `{ model, renderedMs }` — `renderedMs` is the day actually shown, which the date header names.
- **`hooks/useDaySummary.ts`.** Takes an optional `firedForMs`, bakes the anchor once (so the SQL prefetch and the builder clip agree), fetches the anchor-day-**through**-today window (one query, so the fallback re-clips without a second read), calls `buildAnchoredDaySummary`, and exposes the resolved `renderedMs` as `anchorMs` in the ready state.
- **`app/day-summary.tsx`.** Reads the `firedAt` route param (parsed defensively), passes it to the hook; the inline **date header** (`dayLabel(anchorMs)`) now names the **rendered** day rather than the wall clock. (The nav-bar title stays **"Today"** per spec R-9 — it is the screen/feature name, not the date; the date header is the caption.)
- **`hooks/useNotificationScheduling.ts`.** Passes the normalized instant as the `firedAt` route param on tap. **`routeDedup` untouched** — it still keys its dedup signature on the raw delivery time.

## Decisions

- **Delivery instant, not a schedule-time payload field.** Both the Linear issue and spec §1 phrase the payload as carrying the fire-day "computed at schedule time," but a repeating expo `DAILY` trigger's `content.data` is scheduled once and is static — it cannot carry a per-fire day, and baking the schedule-creation day would make every tap past day 2 clamp (the anchor would never help). The spec's own **R-4 ruling resolves this**: it rules the anchor "per the standing recommendation," which is the B-672 backlog row's **delivery-instant** shape — and the §1 clamp requirement only functions with a per-fire instant. So the delivery instant is the coherent reading, and it is what shipped.
- **The clamp resolves the B-672 PM decision** (fire-date-vs-accept): anchor to the delivered day, clamp when the fired-for day is >1 local day old — so the cross-midnight case is fixed without a stale 3-day-old tap opening a 3-day-old summary.
- **Never widens a false-empty** (clinical-guardrails, checked deliberately, then re-checked after code review — see below): the un-anchored path is unchanged; the anchored path only ever renders a day the record itself holds; the stale path lands on today; a normalization miss fails safe to today; and the empty-fired-day fallback closes the one case where the anchor could have hidden a fresh log. B-672 strictly *reduces* false-empties.

## Code review — needs-work → resolved

The `code-reviewer` gate returned **needs-work** with two CONFIRMED findings. The mechanism itself it confirmed solid (clamp boundaries; the seconds/ms normalization, verified against the actual native sources; `routeDedup` untouched; timezone honesty under all three CI zones).

- **Finding #1 (real, fixed) — the age-1 anchor could hide an already-logged today entry.** If the fired-for day (yesterday) was empty and the owner logged a symptom after midnight, anchoring to the empty yesterday rendered "Nothing in {pet}'s record today" over a just-logged event — reachable via the empty state's own "Log an event" CTA (`/log` → `router.back()` → same anchored empty screen). This is the exact false-empty the feature exists to kill, mirrored. **PM-ruled (2026-08-15): fall back to today when the fired-for day is empty** — implemented as `buildAnchoredDaySummary`. Preserves B-672 (a fired-for day *with* rows still shows); spec §8 AC #1's "12:40am opens the fired-for day" now carries the "unless it's empty and today has the record" refinement.
- **Finding #2 (precision, not a bug) — the nav `Header title="Today"`.** The reviewer (working from the ticket, not the spec, which landed mid-review) read the unconditional nav title as contradicting "the header names the rendered day." But spec **R-9 rules the nav title stays "Today"** — it is the screen/feature name. The *date header* that names the rendered day is the inline caption, which is fixed. So the nav title is correct as built; only this session's wording ("Header") was imprecise and is now "date header (caption)". The reviewer's suggested nav-title change would have violated R-9. **The empty-state "today"-copy concern the reviewer raised is dissolved by Finding #1's fix:** an empty state now only ever renders for the actual today, so its verbatim-from-v1 "…record today" copy (kept per §2) is always accurate.

## Tests & gates

- `lib/daySummary.test.ts` — the clamp boundary (no-instant → now; age 0 → fired-for; **12:40am tap → yesterday**; **2-day-old tap → today**; future → now; non-finite → now; a device-path cross-midnight case from local components) **and** `buildAnchoredDaySummary` (fired-for-has-rows → fired-for [B-672]; **fired-for empty + fresh today log → today** [finding #1]; both empty → today; age-0 → today; no-instant → today; ≥2-day-old → today, never the stale day). B-514-honest.
- `lib/notificationRouting.test.ts` — `normalizeFireInstant` (Android ms kept, iOS seconds promoted, stringified params, fractional-second rounding, garbage → null). `routeDedup`'s existing tests untouched.
- `tsc --noEmit` clean; full jest suite green (224 suites / 5011 tests — includes the #645/#649 code merged from `main`); the two touched suites green under Pacific/Kiritimati (UTC+14), Pacific/Chatham (UTC+12:45), Pacific/Honolulu (UTC−10).
- Gate: `code-reviewer` (needs-work → both findings resolved above; re-review not re-run — finding #1's fix is pure and unit-tested, finding #2 needed no code change).

## Persona sign-off

Engineer ✓ (pure-core/IO-shell split; `routeDedup` untouched; the seconds/ms normalization is the load-bearing catch; the fallback is one pure, tested function) — Data N/A — Designer ✓ (the **date header** names the rendered day; the nav title stays "Today" per R-9; empty state only renders for the actual today) — Dr. Chen / clinical-guardrails ✓ (no false-empty widened — the empty-fired-day case that would have is closed by the fallback; anchor fails safe to today) — QA ✓ (clamp + fallback boundaries, non-UTC zones).
