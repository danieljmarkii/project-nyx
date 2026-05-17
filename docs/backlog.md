# Project Nyx — Backlog

A running list of items intentionally deferred from the current build sequence. This is the destination for anything that would otherwise be said as "let's log that for the future."

**Access:** PM can type `view backlog`, `show backlog`, or any natural-language equivalent in a session — Claude reads this file and presents it grouped by priority, surfacing anything that blocks the current build phase first.

**Adding items:** Claude adds rows here proactively — do not wait for PM. When raising a "for the future" item mid-session, write it here before continuing. Include a one-line _why_ so future-you can re-evaluate without re-deriving the context.

**IDs:** sequential `B-NNN`. Never reuse. When closing an item, leave the row and mark `Status: Done — <session date>` rather than deleting.

**Priority:**
- **Now** — should be tackled in the current or next session; here only because it's outside the in-flight chunk
- **Next** — tackle within the next 2–3 sessions or the next build phase
- **Later** — real but not time-sensitive; revisit when conditions change (e.g. pre-prod, multi-pet, paid tier)

---

## Open

| ID | Title | Why | Priority | Added | Blocks | Status |
|---|---|---|---|---|---|---|
| B-001 | AI cost & rate-limit strategy | Step 10 (AI Signal) and the food-extraction Edge Function both call Claude. Before real users hit the app, need a per-user/day call cap, caching strategy, and back-of-envelope cost-per-active-user. PM decision May 2026: skip while pre-shipping; revisit before first real-user release. | Later | 2026-05-17 | First real-user release | Open |
| B-002 | Pre-production readiness checklist | Once Step 10 closes, MVP is done — but there's no checklist for first prod build (EAS env populated, app store assets, Sentry/observability, error reporting, privacy policy URL, push notification provider decision). Flesh this out as a `/docs/pre-prod-checklist.md` when prod timing comes into view. | Later | 2026-05-17 | First prod build | Open |
| B-003 | Detail-screen pattern for History events | The food detail screen (Step 6) was praised as a UX motion worth reusing — long-press a row in History → an Event Detail screen with the event's photo, severity, notes, and edit affordances inline. Distinct from the existing `edit-event.tsx` modal, which is form-first. Touches Timeline + edit-event; non-trivial. Punted from the food-library PR. | Next | 2026-05-17 | — | Open |
| B-004 | Food Library as a top-level navigation item | Currently the only way to reach the library is FAB → Meal → picker. The library is gaining prominence and may deserve to be a first-class destination (tab bar entry or drawer). Defer until the rest of the food-library track lands and we see how often owners want to browse without logging. | Later | 2026-05-17 | After food-library track complete | Open |
| B-005 | Smarter library deletes (tombstone instead of cascade) | The Step 6 implementation hard-deletes the food and soft-deletes every meal that ever referenced it ("kills all records" — PM call for the test version). Later we may want to preserve meal history with a tombstoned food reference so correlation/diet-trial data isn't lost when a user re-tidies the library. | Later | 2026-05-17 | Second-user beta | Open |
| B-006 | EXIF extraction on edit-modal photo attach | Today, attaching a photo from the Edit modal does not pull DateTimeOriginal back into `occurred_at` — the event keeps its original time and source. PM flagged this in Step 7 QA as "probably feels right" (a user editing an existing event has already accepted the time); logging as intentional behavior in case we revisit. If we do change it, the edit modal would need the same source-flip dance as `log.tsx`. | Later | 2026-05-17 | — | Open |
| B-007 | FAB experience revamp | PM feedback during Step 7 QA: "the whole FAB experience needs a revamp." Current FAB stacks recent meals, quick symptom chips, photo-log, and "More events" into a tall pop-up that drifts from the three-zone picker pattern we've adopted elsewhere. No specifics yet — needs a fresh design pass before scoping. | Next | 2026-05-17 | — | Open |
| B-008 | Extract `useEditableTimestamp` hook | The flip-on-edit logic for `occurred_at_source` is now duplicated in `app/log.tsx`, `app/food-capture.tsx`, and `app/edit-event.tsx` (three near-identical onChange handlers + seed flow). Pull into a `lib/hooks/useEditableTimestamp.ts` once the behavior settles — premature now, but tag the duplication. | Later | 2026-05-17 | Step 7 follow-up | Open |

---

## Done

_(items move here when closed; keep the row, set Status to `Done — <date>`, and note the resolving PR/session)_
