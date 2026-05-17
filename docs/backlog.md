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

---

## Done

_(items move here when closed; keep the row, set Status to `Done — <date>`, and note the resolving PR/session)_
