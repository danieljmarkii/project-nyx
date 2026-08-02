# 2026-08-02 — Notification foundation PR 4 (B-661): Day Summary + 9pm schedule wiring

**Outcome:** shipped via #568 (draft). Branch `claude/day-summary-feature-qo5ntd`. The first shipped notification's read surface + the wiring that ties the 21:00-local schedule to the owner's preference.

## What was built
- **`lib/daySummary.ts`** (NEW, pure) — `buildDaySummary`: per-pet sections of today's logged events as doorway rows; the zero-log designed state; `localDayBoundsIso`. Reuses `describeDayEvent` (`lib/dayEvents`) and B-421's `localDayIndex`/`localDayIndexOf` — no new day-math. Defense-in-depth filters: **pet scope** (`r.pet_id === input.pet.id`) and **soft-delete** (`deleted_at IS NULL`), each documented as the single enforcement point so a future combined-query refactor can't cross-wire pets or resurrect a deleted row. Zero-log copy is G2-bound and test-asserted. + `daySummary.test.ts` (17, B-514 non-UTC-honest).
- **`lib/notificationSchedule.ts`** (NEW) — the **synced-preferred** enabled-category reader the PR 2 mirror header prescribed (`synced DESC, updated_at DESC, id`), the reconcile, the pure auth-gated `notificationRouteDecision`, and the pure `routeDedup` (route-exactly-once + pre-auth re-attempt). + test (22; production SQL over real `node:sqlite`).
- **`hooks/useDaySummary.ts`** (NEW) — loads today's rows per pet (`getTimeline` + local-day bounds), orders active-first, builds. Error state on read failure, never a false "nothing logged".
- **`hooks/useNotificationScheduling.ts`** (NEW) — reconcile-on-foreground + tap routing (warm listener + one-shot cold-start read, deduped via `routeDedup`, behind the auth gate). Mounted in `_layout`.
- **`app/day-summary.tsx`** (NEW) — the screen: per-pet sections (active first), every row a doorway into `event/[id]`, designed zero-log + error/loading states.
- **`lib/notifications.ts`** (EDIT) — G1-safe static title/body in the registry; `scheduleCategory` reads them (retired PR 1's placeholder). + body assertions in `notifications.test.ts`.
- **`app/_layout.tsx`** (EDIT) — registered `/day-summary`; mounted `useNotificationScheduling`.

## Decisions / scope
- **Built ahead of the mock round on purpose.** Spec §7 gates the screen on a mock (`docs/culprit-notifications-mockups.html`, not yet made). Shipped the design-stable core; **deferred to the mock:** the dedicated trial/med context strips (§5.1/§5.3 — meals+intake / doses+adherence / symptoms / weight already render as doorway rows), a log CTA on the empty state, single-pet body naming (§10 #3), the final visual. That's why it's a **draft**.
- **Inert until PR 3.** No preference write path exists yet (migration 050 defaults off; PR 3 owns the toggle), so `reconcileDailySummary` returns [] and only cancels a stray schedule — a second sign-out-leak backstop alongside `wipeLocalSession`. PR 3's toggle flips it on with no further code.
- **The G1 body is static + neutral** ("Today's record is ready to read.") — iOS runs no JS at fire time, so a content-bearing body could misstate the record; single-pet naming stays an open mock-round call.

## Gates
- **clinical-guardrails** ✓ — the surface has NO per-incident AI read of its own; it *links* to existing reads (G3). Zero-log G2 copy + G1 notification body both **test-asserted** (Pattern 8). No adversarial-reviewer (descriptive, not statistical — spec §7).
- **code-reviewer** ✓ — verdict fix-before-merge (no bugs); both non-nit findings applied: the **pet-scope filter** (defense-in-depth on the first multi-pet builder) and **extracting the route-dedup into the tested pure `routeDedup`** (+ a one-shot cold-start guard for the token-refresh nit). Re-verified green.
- `tsc` clean · jest **189 suites / 4153** green · day-boundary tests green under UTC+14 / UTC−10 / UTC+5:45 (AC #9).

## Owed / next
- **Mock round** (`docs/culprit-notifications-mockups.html`) — gates PR 4's final design + PR 3.
- **PR 3** consent/primer + settings un-mock (owns the toggle that flips PR 4's reconcile on).
- **PR 5** finish pass (nyx-voice, `pm-feature-review`, Dr. Chen read of the zero-log + incident-day states).
- **Tier-2 `design-principles.md` §4 edit** (spec §11) — awaits PM wording approval; NOT written here.
- Nicety: foreground notification presentation (`setNotificationHandler`) — device-QA/PR-5.
