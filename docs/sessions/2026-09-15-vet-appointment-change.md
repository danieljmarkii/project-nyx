# 2026-09-15 — Vet visits: a booked appointment can be changed (CUL-952)

**Outcome:** shipped via #851. **Mode:** BUILD. **Branch:** `claude/nifty-einstein-atx892`.

---

## What the issue was

Three gaps that were one gap: an appointment could be **booked** and **ended**, never **changed**.

1. The ⋯ item on Get ready named *Change the appointment* pushed `/vet-visits`, where the only control is **Add** — so following the app's own instruction booked a *second* appointment beside the one the owner meant to move. Home then led with whichever was earlier.
2. `APPOINTMENT_WINDOW_DAYS = 5` bounds the after-the-day ask as well as the before, so the only cancel in the app expired. A booking missed by a week was furniture in *Waiting on you* forever, telling the owner to log a visit that never happened.
3. *Waiting on you* asked a two-answer question and offered one answer.

Three finders: `pm-feature-review` as Jordan, as Sam, and the PM's own device pass ("once a visit is scheduled it can never be edited. Why?").

**The honest answer to "why?" turned out to be narrower than the issue's.** Mock round 2 **already drew** the `Change` door on E1 (`<span class="door ghost">Change</span>`). It was specified in the design authority and shipped without a destination. So it is a spec gap on the ⋯ item *and a build gap on the list* — which means the VV-6 finish pass was checking against a mock that already showed the missing control and did not notice. That is a process finding, recorded here because it bears on VV-GA.

## What was built

**`lib/vetVisits.ts`**
- `updateAppointmentDetails` — the missing middle. Column-by-column (C-10), `updated_at` moves (C-23), quarantine pair clears, zero rows throws (C-39). The `WHERE` is `LIVE_APPOINTMENT_SQL`, a race guard: the screen stays open while another device logs or cancels the same booking, and a bare-id UPDATE would write a reschedule onto a row that is no longer a booking.
- `decomposeScheduledAt` — the inverse of `composeScheduledAt`, property-tested over a day × time cross product.
- `removeAppointmentCopy` — one confirm for three doors.
- `readEditableAppointment` — the read scoped to exactly what the write accepts.
- `appointmentPrepNote` — conditional, specific.
- `AppointmentView` gains `scheduledAt`.

**Screens** — `app/vet-visits/edit-appointment.tsx` + `AppointmentEditBody` (new); two doors on `AppointmentActions`; the list wiring; `app/rundown.tsx`'s menu destination and its focus re-read.

**Design** — mock round 3 (E4, E5), republished over round 2's URL, then E4 redrawn again to match what shipped.

## The three bugs worth remembering

**1. The no-time sentinel, nearly destroyed by the obvious seed.** A booking with no time is stored as local midnight. Seeding the time picker from the raw instant hands it a real `Date` at 00:00 that the picker cannot distinguish from a chosen one; save untouched and `composeScheduledAt` takes its one-minute nudge branch and writes `00:01`. An owner who fixed a typo in the clinic name would start seeing "12:01 am" on Home, the Pet-tab card and Get ready. Caught while writing `decomposeScheduledAt`, not by a test — which is why the test exists now.

**2. Get ready went stale after the edit it launches.** `app/rundown.tsx` loaded in a `useEffect` keyed `[petId, wantsGetReady, appointmentId]`; none change when a screen pushed *from* there pops. Harmless while every door out was read-only, and **created by this PR** the moment ⋯ *Change* got a destination: move Tuesday, tap Save, land on a page whose eyebrow still reads TUESDAY 3:00 PM. That reads as "it didn't save", so the obvious next move is to do it again — and the second booking this whole issue exists to prevent is back by another route. The same hook fixed the removal case, a G5 violation. Found by `pm-feature-review`, not by a test.

**3. A guard hole this PR opened while closing a false positive.** `IMPORTS_NAMESPACE_RE` bounds its middle with `[^;\n]`, so it cannot span a newline — and prettier wraps any import with two specifiers. The new screen delegated correctly and was reported as drawing inline. Collapsing braced imports fixed that and **widened the rule's accepted blind spot**: `import { type X } from '…'` is erased at runtime exactly like `import type { X }`, was never guarded, and previously could not reach the regex at all. `code-reviewer` demonstrated it with a working file that reads the flag, draws its vet UI inline, and passes. Per-specifier `type` tokens are now stripped, and an emptied brace list is normalised to `import type {} from` so it is rejected by the `(?!type\s)` the pattern already carries.

**The generalisable lesson:** *fixing a false positive in a detector is a change to what it accepts, and the new acceptances need enumerating.* A guard that blesses the exact leak it exists to catch is worse than no guard, because it reads as coverage.

## Also fixed, from the reviews

- The day picker's floor **ratcheted**: derived from `fields.day`, it moved to whatever was just picked, so on a passed booking choosing a date blocked an earlier correction. Now from the row — which is what the comment beside it had always claimed.
- A booking whose visit was **already logged** could be opened for editing and never saved, behind a retryable-looking "That didn't save". `readAppointmentById` deliberately does not filter `vet_visit_id` (Take notes needs it); the write does. `readEditableAppointment` gives the read and the write one clause. `guards/visitReaders.test.ts` caught the first attempt, which had put the check in the screen.
- The edit footnote was unconditional, naming questions and notes to a first-time rescheduler who has neither — and sat one divider above *Remove this appointment*, so the foot of the screen read as a promise that removal is safe. Now conditional, specific, and above Save.
- `AppointmentStrip`'s confirm said **"upcoming visits"** on every removal, although *It didn't* only ever renders once the day has passed. Shipped bug, fixed by the shared helper.

## Two test-harness traps hit

- The getready fixture resolved `readAppointmentById` as `mockAppointments[id] ?? mockAppointment`, so an override of `null` fell straight back to the appointment. The removal test asserted the opposite of what it claimed **until it failed**. Now keyed on `in`.
- Adding `scheduledAt` to `AppointmentView` made the compiler demand a real instant in every fixture — the C-35 discipline enforced by the type rather than by remembering.

## Verification

Typecheck clean. **8,305 tests pass** across 382 suites. Touched suites and every guard green at `Pacific/Kiritimati`, `Pacific/Chatham`, `Pacific/Honolulu` and `America/Santiago` — the last has a DST transition at local midnight, which the CI matrix does not cover and which is where the sentinel is weakest.

Every new assertion proven by mutation. One **equivalent** mutant (`startOfLocalDay` vs `new Date(y,m,d)`) is recorded as equivalent in both source and test, because an undocumented survivor reads as a coverage hole.

## Filed, not folded in

- **CUL-984** — the iOS time-picker seed is not a value (device check first; same shape in `BookVisitSheet`).
- **CUL-985** — the Pet-tab card shows the empty state over a live unanswered booking.
- **CUL-986** — the *Waiting on you* note's placement and subset; "Optional" vs "not set".
- **CUL-987** (`Waiting on PM`) — three decisions batched: the Home door, what the remove confirm promises, the multi-pet line.
- **CUL-988** (`Waiting on PM`) — the on-device pass. Merged before it ran, on the PM's explicit instruction; the DoD box it covers is the one that stayed open.
- **CUL-970** — commented, not touched. This removes the cause most likely to mint a second booking; it does not change what the list shows when two exist.
