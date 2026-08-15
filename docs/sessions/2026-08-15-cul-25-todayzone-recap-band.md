# TodayZone v2 — the recap band (CUL-25 / DR-2)

**Date:** 2026-08-15

Shipped via **#658** (draft at time of writing). Parallel track — **The Daily Recap** (B-762), DR-2. Blocked-by DR-1 (CUL-23, merged #656); blocks DR-7 (CUL-27). No core build-sequence step.

## What shipped

TodayZone (Home's "Today" zone) gained the **recap band** where its plain header sat — the Daily Recap's Home presence (R-5, resolves B-673). Design lock = the mock's §3; spec `docs/nyx-daily-recap-requirements.md` §3.

The band, top to bottom, inside TodayZone's existing single `Card` (**no new card**):
- **`TODAY SO FAR`** label (the shared `SectionLabel`, replacing the old "Today" header).
- the **compact day lane** — category-tinted dots at their real event times over a fixed 6a→12a track (the horizontal cousin of DR-1's night day spine).
- an **honest count line** — `2 meals · 1 dose logged`.
- **`Full day ›`** → `/day-summary`.

The capped event rows continue beneath, unchanged, now leading to the same full-day recap as the band (**one door**). The old `openHistoryToday` header shortcut was **removed** — History stays one tab away. Zero-log renders an empty 6a→12a lane beside TodayZone's existing empty nudge; no count line.

**Files:**
- New: `lib/todayLane.ts` (pure builder — dot positions on a clamped 6a→12a track + the count line, reusing `buildCountChips`), `components/recap/DayLane.tsx` (presentational lane, light ground), + co-located tests, + `components/home/TodayZone.test.tsx`.
- Edited: `components/home/TodayZone.tsx` (the band + the single door), `components/recap/nodeTints.ts` (added `NODE_DOT_SIZE`/`NODE_DOT_RING`), `components/recap/DaySpine.tsx` (references the shared geometry — values unchanged), `lib/dayEvents.ts` (extracted `eventTintCategory`), `lib/daySummary.ts` (loosened `buildCountChips` to a `CountableEvent = Pick<DaySummaryRow,'category'|'eventType'>`).

## The design spine — one shared node language

The load-bearing decision: Home's glance and the evening recap must never state the day differently. So there is exactly one source for each of the three things a node "is":
- **tint + geometry** — `nodeTints.ts` (`NODE_TINT_DAY`/`_NIGHT`, `NODE_DOT_SIZE`, `NODE_DOT_RING`), imported by both the night `DaySpine` and the light `DayLane`.
- **category** — `eventTintCategory` (extracted from `describeDayEvent`), which decides symptom/meal/medication/other for every surface.
- **counts** — `buildCountChips`, the recap's own C2 chip builder, now fed by both the recap screen and Home's count line.

Loosening `buildCountChips`'s param (it only ever reads `.category`/`.eventType`) let the Home lane feed it raw events without a `TimelineRow` round-trip.

## What broke and how it was fixed (review gates)

Both required gates ran (`pm-feature-review` + `code-reviewer`), plus a self-check that adversarial review is N/A here.

- **`code-reviewer` — fix-before-merge (a real bug):** `buildTodayLane` built `dots` from the sorted events but `counts` from the *unsorted* input. `buildCountChips` orders its "other" bucket (weight, normal stool — no fixed order list) by **encounter order**, so a day with both a `weight_check` and a `stool_normal` could list those chips in a different order on Home (its DB query is latest-first) than in the night recap (earliest-first `section.rows`) — the exact drift the shared source exists to prevent. **Fix:** derive both outputs from one earliest-first sort (which also matches the recap's order). Added a regression test asserting order-invariance + recap parity. Also folded a NIT (bare `accessibilityElementsHidden` to match the codebase idiom, dropping a `Platform` import) and added `TodayZone.test.tsx` (the flagged test gap). One cosmetic NIT backlogged (B-785).
- **`pm-feature-review` — SHIP-SHAPED on the named gate (Principle 3):** Signal still leads Home, band is one zone evolving (facts + one door), no new card/badge/verdict; removing the History shortcut is not a regression. Two non-blocking PM decisions surfaced (below). Two states it can't judge from static code (zero-log band, daytime day→night jump) → the DR-7 device pass.

## Falsification attempts (why the logic holds)

Not clinically/statistically load-bearing (a display/glance surface; no detection/escalation/AI/thresholds — `code-reviewer` agreed no `adversarial-reviewer` pass is warranted), but the ones that matter here:
- **Ordering drift** — the bug above. Tried a `weight_check` + `stool_normal` day fed latest-first (Home's real order) vs earliest-first; before the fix the chip order flipped, after it both match the recap. Test pins it.
- **Timezone honesty (B-514)** — `laneEventPosition` reads the LOCAL clock hour, so tests build instants from local components (`new Date(2026,6,24,h,m)`), never UTC literals; the non-UTC CI job (UTC+14/+12:45/−10) is green.
- **Pre-6am clamp** — a 2am event clamps to the track's 6a start (documented); it still shows and is still counted, precision lives in the count line + rows. Cosmetic edge, noted.
- **Zero-log never reassures** — an empty day renders an empty lane + no count line + the existing nudge; nothing manufactured, no all-clear.

## Decisions made / surfaced

- **One shared node language** (tints + geometry + category + counts from single sources) — the pattern this PR establishes; the future-self answer is yes (it prevents Home↔recap drift by construction).
- **Home count-line symptom register: NEUTRAL, provisionally** — the shared `DayCountChip.tone` (rose in the night recap) is deliberately not applied on Home; the lane's rose dot carries the symptom colour, the count stays a calm fact, and a legible rose *text* token on the light ground (the dot's `#F43F5E` fails AA as 13px text) is a Designer/AA call. Documented in `TodayZone.tsx`; surfaced for PM ratification → **B-786**.
- **Capped strip kept UNCHANGED** per the issue's "rows continue beneath unchanged" — the pre-DR-2 strip was already a silent door (to History); the affordance/per-row-nav improvement is a PM call → **B-787**.

## Residuals / backlog filed

- **B-785** (Later) — day-lane dots collide silently for near-coincident events (a B-156 combo meal+dose); cosmetic, the count line + rows carry the truth.
- **B-786** (Next) — ratify the count-line symptom register (neutral vs rose).
- **B-787** (Next) — capped-strip tap affordance / per-row nav.
- **DR-7 device pass** owns the zero-log band screenshot sign-off + the daytime day→night look-check.

## Verification

`tsc --noEmit` clean; full suite **235 suites / 5220 tests** green; non-UTC CI job green; all three CI checks passed on the branch. Closes **B-673**; unblocks **DR-7 (CUL-27)** — only **DR-3 (CUL-26)** remains before the finish pass.
