# Nyx Vet Visit Reminders: Requirements

**Version:** 1.0 | **Last Updated:** 2026-11-13 | **Status:** BUILD-READY for rows 02 and 03; row 04 opens with a build ready mock round (§8).
**Issue:** [CUL-253](https://linear.app/projectnyx/issue/CUL-253) (parent). **Project:** *Vet visit reminders* (team Culprit; the run order lives on the project page).
**Read with:** `docs/nyx-notification-foundation-requirements.md` (D1 to D4, G1 to G6, the primitive this extends), `docs/nyx-notifications-v2-requirements.md` §5 (NV-G7, the new category checklist), `docs/nyx-vet-visits-requirements.md` §4.1 (booking, the Home strip, Get ready), `docs/nyx-vet-report-v2-requirements.md` §11.3 (the report line this carries), `docs/research/2026-11-engine-lessons-from-nyx-round-3.md` §4 (why the early reminder exists).
**Mock:** `docs/culprit-vet-reminder-mockups.html` (round 1, exploratory; published at https://claude.ai/artifact/1SUq7hGD8hmNobbJLtgfr9, and round 2 republishes to the same URL).

---

## 0. Decision record (PM-ruled 2026-11-13, kickoff session)

| # | Decision | Ruling |
|---|---|---|
| **R1** | When reminders fire | **Two per appointment.** *Ahead:* three local days before the appointment's date, at **18:00** device local. *Day of:* **08:00**, or **two hours before** the appointment when that is earlier; an appointment too early for that (before 08:00) moves the day-of reminder to **19:00 the evening before**. A booking with no time takes 08:00. Replaces the spec's earlier T-2d / T-1d (`nyx-vet-visits-requirements.md` §4.1, CUL-253's 2026-09-10 comment). |
| **R2** | A booking made inside a reminder's window | **The reminder it already missed is skipped**, never fired late. Booked two days out: day-of only. Booked the morning of after its fire time: none. |
| **R3** | On or off by default | **Off**, like every category (G6). A one-tap **Remind me** on the booking sheet is the owner intent that may spend the primer and the OS prompt. Which categories *should* default on is a portfolio question, filed separately (§10). |
| **R4** | What the lock screen says | **The day and time only.** The pet's name only when the account's existing name choice is on (single pet, migration 058). **Never** the reason, the clinic, the vet, a question or anything from the record. |
| **R5** | Scope | **Reminders only.** The deep dive's prep findings (a weigh-in nudge, re-asking the lifestyle card, the vet's conditional instruction) are later work (§10). |
| **R6** | Where the report line lives | **The day-of reminder carries it and opens Get ready**, whose one primary is already *Send the vet report*. **Unseats [CUL-2302](https://linear.app/projectnyx/issue/CUL-2302) ruling 1a (2026-11-02)** on two points: the line rode a T-1d reminder (none exists now) and deep-linked to the composer anchored to the visit (no composer anchor is built; Get ready is the door). The line's words and its never-a-finished-file rule carry over unchanged. |

**Team calls inside the rulings (reversible, logged on CUL-253):** two hours as the lead; 06:00 as the earliest a day-of reminder fires before it moves to the evening before; 19:00 for that evening slot; one notification per kind per day per account (§3.3); the name choice shared with the daily summary rather than a second toggle (§4).

---

## 1. Why this, why now

- **The data and the door exist.** `vet_appointments` (VV-1, migration 066) holds a time, and Get ready (`/rundown?appointmentId=`) is the prep surface. `app/rundown.tsx` already names this deep link as its next entry point. Vet visits is GA (2026-09-23).
- **The deep dive's lesson (PR #1512).** Before Nyx's 11-14 visit she had not been weighed in eight weeks, her eating had not been recorded since August, and the vet's own condition for a call had been met. All four clinical lenses led with *phone the clinic before the visit*. A morning-of ping fixes none of that; one three days out leaves room to weigh, log and call ahead. That is why the ahead reminder exists and why it lands at 6pm, when there is time to act.
- **There is a precedent, and it is the template.** The registry in `lib/notifications.ts` and the prefs CHECK still hold only `daily_summary`, and that registry assumes one *repeating daily* trigger. But a dated notification already ships beside it: the vet call follow-up, `lib/followUpNotifications.ts` (CUL-1419), with its own identifier prefix, its own reconcile (foreground and every hydration tick), a tap kind in `lib/notificationRouting.ts`, a sign-out epoch fence, and its own settings row. Its one departure is that its switch lives in AsyncStorage, not `notification_preferences` (D4); [CUL-1598](https://linear.app/projectnyx/issue/CUL-1598) moves it. **This reminder copies the follow-up's shape and keeps the switch in the server table**, so it does not repeat that departure.

---

## 2. What it is not

No medication reminder and no wording that implies one (G4; "bring her meds" is out). No new screen. No server push, no stored timezone, no calendar write. No AI and no record contents on the lock screen (G1). No re-nag: an ignored reminder records nothing and fires nothing more (G5). No change to booking for owners who never tap Remind me.

---

## 3. Timing: the planner (`lib/vetReminders.ts`, pure)

A pure function from *(now, live appointments, the pref, the name choice, pet count)* to the notifications that should be scheduled. All math in device local wall clock (the foundation's §3 rule: DST and travel are free); `scheduled_at` is parsed, never compared as text (C-40); the no-time sentinel is read through `appointmentTimeKnown` (`lib/vetVisits.ts`), never re-derived.

### 3.1 Which appointments count
`deleted_at` null, `cancelled_at` null, `vet_visit_id` null (a logged visit is over), and the appointment's local day is today or later.

### 3.2 The two instants

| Kind | Fires at | Skipped when |
|---|---|---|
| `ahead` | 18:00 local on (appointment local date − 3 days) | that instant is not in the future at plan time (R2) |
| `day_of` | time known: the earlier of 08:00 on the day and (appointment − 2h); if that is before 06:00, 19:00 the evening before. No time: 08:00 on the day | that instant is not in the future at plan time (R2) |

Worked: 10:30 → 08:00. 09:30 → 07:30. 08:15 → 06:15. 07:30 → 19:00 the evening before. 18:00 → 08:00. No time → 08:00.

### 3.3 Collapse: one per kind per day per account
Two appointments whose instants for the same kind fall on the same local day produce **one** notification (D3's one-per-account lineage; the "Also for {other pet}" booking makes this the common two-pet case). Its tap opens the **Vet visits list**, not a single Get ready. Its copy is the neutral multi-visit shape (§4).

### 3.4 When it runs (reconcile)
The schedule is rebuilt by diffing the planner's output against what the OS holds, through the foundation's `reconcileSchedules` and its content signature, at: app foreground (existing); every local write to `vet_appointments` (book, edit, cancel, delete, link to a logged visit); after a sync pull that touches `vet_appointments`; a pref or name-choice change; a permission change. Sign out already cancels everything (`wipeLocalSession`).
**Residual, stated:** an appointment edited on another device is repaired here only when this phone next hydrates or foregrounds. The copy carries no detail that can mislead dangerously if stale (R4), which is why that residual is acceptable.

### 3.5 The scheduler (`lib/vetReminderNotifications.ts`, modelled on `lib/followUpNotifications.ts`)
A standalone module, not a change to the daily registry: its own identifier prefix (`nyx.vetreminder.<kind>.<local date>`) outside the registry's `nyx.notif.` prefix, so neither reconcile ever touches the other's; its own Android channel (`vet_visit`); one-shot date triggers; a reconcile that schedules what the planner wants and cancels anything it cannot justify; the follow-up's sign-out epoch fence, so a reconcile that began before sign-out schedules nothing after the wipe; a tap kind (`vet_visit`, with an appointment id or none for a collapsed reminder) read by `lib/notificationRouting.ts`. The **switch reads `notification_preferences`** (category `vet_visit`, account-wide), not AsyncStorage. Budget: the category counts **1**. The self-pruning hook does not apply to event-anchored reminders; the module header says so rather than leaving it out.

---

## 4. Copy (direction; final strings at the row 04 mock round, `nyx-voice` + `clinical-guardrails`)

The body is computed at schedule time and recomputed on every reconcile; it states only the owner's own booking (day, time) and the report window, never the record.

| Kind | Title | Body |
|---|---|---|
| ahead, one visit | *Vet visit Monday* · named: *Nyx sees the vet Monday* | *Monday, Nov 16 at 10:30. A few minutes in Get ready now, while there's time to weigh in or call ahead.* (no time: drop "at 10:30") |
| day of, one visit | *Vet visit today at 10:30* · named: *Nyx sees the vet today at 10:30* | *Make a report of Sep 16 to today to take along.* |
| day of, evening before | *Vet visit tomorrow at 7:30* · named: *Nyx sees the vet tomorrow at 7:30* | same body |
| collapsed (two visits) | *Two vet visits Monday* / *today* | *Tap to get ready for both.* |

- **The report window's start** is the date the composer would start from (the report's scope cascade, rung 1: the most recent visit strictly before today). Read it from the composer's own default, never re-derive it. No earlier visit → *Make a report to take along.* Never names a finished file (CUL-2302).
- **The name** follows the account's existing choice (the `use_pet_name` column on the account-wide row, single pet only). Its settings sublabel stops saying "at 9pm" and the row sits where both categories can see it.
- **Forbidden:** the reason, the clinic, a question, any count, "don't forget", "bring her meds", an exclamation mark, any urgency that grows as the day nears.

---

## 5. Consent and the two entry points

- **Notification Center** (`app/settings/notifications.tsx`): a row of its own, *Vet visit reminders* · *Three days before at 6pm, and the morning of*, as a component beside `FollowUpNotificationRow` (`components/settings/`), with the three honest states the other rows render. Off by default. The screen's lock-screen promise ("the notification only says the day's ready to read") is written for the daily summary alone and is widened to cover every row.
- **The booking sheet** (`BookVisitSheet`, booked branch only): when the category is off, one quiet control, **Remind me** (*three days before and the morning of*). Tapping it is the owner intent: primer (a `vet_visit` descriptor) → OS prompt if never asked → the account-wide pref on. When the category is already on, the control is replaced by one line saying reminders are on. When OS permission is denied, the control renders inert with the settings deep link, as the settings row does. It never blocks or delays saving the booking.
- The pref is **account-wide** (`pet_id` null), like the daily summary: turning it on covers every pet's appointments.

---

## 6. Data

One additive migration: `notification_preferences.category` CHECK gains `'vet_visit'` (and the local mirror's DDL with it). No new table, no new column, no backfill (absence of a row means off). Rollback: restore the one-value CHECK after deleting `vet_visit` rows. Destructive: **n**.

---

## 7. Acceptance criteria (the project is done when)

1. With the category off, no appointment schedules anything, and booking behaves exactly as today.
2. Remind me on the booking sheet runs primer → OS prompt → pref on, and the booking saves whatever the answer.
3. An appointment booked 5+ days out at 10:30 schedules an ahead reminder at 18:00 three days before and a day-of at 08:00; at 07:30, the day-of is 19:00 the evening before; with no time, 08:00.
4. A booking inside a window schedules only the reminders still in the future (R2).
5. Editing the time or day moves both; cancelling, deleting or logging the visit removes both; turning the category off removes all; sign out removes all.
6. Two pets booked the same day produce one ahead and one day-of notification, which open the Vet visits list.
7. Tapping a single-visit reminder opens that appointment's Get ready, behind the auth gate, from a cold start.
8. No lock-screen string carries the reason, clinic, vet, a question or a count; the name shows only under the existing choice.
9. Planner tests pass under the non-UTC CI zones and across a DST change, including a DST day on which local midnight does not exist (the no-time sentinel).
10. `pm-feature-review`, `nyx-voice` and a device QA pass with a real booked appointment.

---

## 8. Build plan (mirrors the project's run order)

| PR | What | Gates |
|---|---|---|
| 01 | This spec and mock round 1 (this session) | PM rulings R1 to R6 |
| 02 | Migration: the `vet_visit` category in the CHECK and the local mirror | Migration pre-flight; applied only on the PM's typed `apply <NNN>`; `rls-privacy-reviewer` not required (no policy change), Engineer confirms |
| 03 | The planner and the scheduler module (§3.5), with reconcile hooks on every appointment write and sync pull; no UI | `code-reviewer`; timezone-honest tests (C-29); `adversarial-reviewer` not required (no clinical logic) |
| 04 | Build ready mock round 2, then the settings row, the primer descriptor, Remind me on the booking sheet, the copy and the tap routing | `nyx-voice`; `clinical-guardrails` (G1, G4); Designer |
| 05 | Finish: `pm-feature-review`, device QA, AC sweep | PM device pass |

Ships over the air: `expo-notifications` is already in the binary, and no native config changes.

---

## 9. Open items

- None blocking. The 1.2.0 question (whether this rides the first build after the cut) was not ruled at kickoff; by default it ships when its rows merge, over the air.

## 10. Deliberately deferred (with homes)

- **Which notifications default on** (the PM's portfolio question, R3): its own Backlog issue.
- **The deep dive's prep findings** (weigh-in before a visit, the lifestyle card re-asked, the vet's conditional instruction): `docs/research/2026-11-engine-lessons-from-nyx-round-3.md` §4 and [CUL-2710](https://linear.app/projectnyx/issue/CUL-2710); the instruction stays held behind [CUL-435](https://linear.app/projectnyx/issue/CUL-435).
- **A composer anchored to a visit**: not needed while Get ready is the door (R6).
- **An owner-chosen reminder time**: later, beside the daily summary's.
