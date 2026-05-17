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
| B-007 | FAB experience revamp | PM feedback during Step 7 QA: "the whole FAB experience needs a revamp." Current FAB stacks recent meals, quick symptom chips, photo-log, and "More events" into a tall pop-up that drifts from the three-zone picker pattern we've adopted elsewhere. **Specific requirement added 2026-05-17:** Vomit and Stool quick actions should launch a photo-or-manual flow modeled on food-capture — "Add with photo" / "Add manually" — to actively encourage photo documentation of adverse events for the vet report. Needs a fresh design pass before scoping the rest. | Next | 2026-05-17 | — | Open |
| B-008 | Extract `useEditableTimestamp` hook | The flip-on-edit logic for `occurred_at_source` is now duplicated in `app/log.tsx`, `app/food-capture.tsx`, and `app/edit-event.tsx` (three near-identical onChange handlers + seed flow). Pull into a `lib/hooks/useEditableTimestamp.ts` once the behavior settles — premature now, but tag the duplication. | Later | 2026-05-17 | Step 7 follow-up | Open |
| B-009 | UPC collision: merge-to-existing instead of null-drop | `food_items` is globally scoped with a unique constraint on `upc_barcode`. When Claude extracts a UPC that already exists, the Edge Function currently catches the 23505 violation and retries with `upc_barcode: null` — extraction completes but a duplicate food (sans barcode) lands in the library. Proper fix: on collision, look up the existing row, soft-delete or repoint the pending row, and have the client redirect the user to the canonical food. Cleaner library, honors the confirmation-over-entry principle. Bumped to Next once the food-library track stabilizes — duplicates compound quickly once real users scan the same products. | Next | 2026-05-17 | Food-library track close-out | Open |
| B-010 | Food Library — ingredient completeness indicator | In the library list view, surface (without requiring a tap into the Food Detail screen) which foods have ingredients on file and which don't. Lets us nudge users to enrich incomplete entries and improves correlation-engine signal as the library matures. Likely a small chip / icon / row state on each library row plus an empty-ingredients filter. | Next | 2026-05-17 | — | Open |
| B-011 | Medication event logging (event-level, not just pet-level) | Add a `medication` event type so meds can be logged against the timeline with precise `occurred_at` (e.g. "Zyrtec, 8:00 AM"). Manual entry to start; a per-pet medication list (with default doses) is the obvious follow-up. Today there's no way to surface meds in correlation queries or the vet report — Dr. Chen will ask for this. Schema impact: new event type + child `medications` row (name, dose, route) following the same pattern as `meals`. | Next | 2026-05-17 | — | Open |
| B-012 | Differentiate treats from meals | Today everything logged via the Meal flow is `event_type='meal'`, including treats. Treats skew calorie estimates, diet-trial compliance, and meal-history density. Options: a `meal_kind` sub-field on `meals` (`meal` / `treat` / `chew`) or a separate `event_type='treat'`. UX side: picker needs a way to mark a food as a treat (likely a per-food flag on `food_items` so it carries forward). | Next | 2026-05-17 | — | Open |
| B-013 | Home page revisit + AI Signal grounded in food history (P1) | PM-flagged **P1**. Step 5 shipped Zones 2 & 3; Zone 1 (AI Signal) was deferred to Step 10. Bring it forward and ground it in the maturing food + symptom history so the home screen finally becomes the intelligence surface the brief calls for. Connects to B-001 (AI cost & rate-limit) — those guardrails need to ship alongside or before. | Now | 2026-05-17 | Step 10 / first real-user release | Open |

---

## Done

_(items move here when closed; keep the row, set Status to `Done — <date>`, and note the resolving PR/session)_
