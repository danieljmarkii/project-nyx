# Engines v3 PR-36: EN-14's client — the call record, the follow-up, the notification

**Date:** 2026-10-05
**One thing:** none — dispatched session, not this round's teach row

Dispatched session (`/dispatch`, Engines v3 round), BUILD on CUL-1419. Shipped via #1072, **left open for the PM**: the adversarial review does not pass for two phones until CUL-1602's migration lands.

## What shipped (dark behind `engines_v3_en14`)

- **A client allowlist key**, `engines_v3_en14`. It is not seeded, so it is off for everyone. PMD-12 keeps it to the PM's account.
- **The incident screen** (`components/event/CallAnswers.tsx`):
  - *I've called · Not yet* below a call-tier read.
  - After a call: "You called on {Mon d}." with Undo, and from 48 h a door to *What did the vet say?*.
  - The read above keeps its words.
- **The follow-up screen** (`app/vet-call/[id].tsx`):
  - The answers follow spec §6.3. *Wants to see him* opens the booking form; *Started a treatment* opens the medication form.
  - Then the optional worth-it question, and a note that nothing reads.
- **The call record:** a section in Vet visits, and its own date-only item in History.
- **Home:** one navigation line under the Signal while a question is due.
- **The notification:** a switch in Settings, off by default and device-local. It schedules one local notification at the due time, and is fenced at sign-out.
- **Data:** local mirrors of `vet_calls` and `vet_call_follow_ups`.
  - Insert-only, parent-gated pushes of 082's granted columns.
  - Pulls, so an answer on one phone is seen on the other.
  - Both mirrors are in the wipe list.

## Decisions (team calls, logged on CUL-1419)

1. **TD-5 is provisional, Jordan's side:** *Not yet* writes nothing. The ruling is filed as CUL-1597.
2. **The follow-up switch is device-local**, departing from D4, because a server category is a migration. Filed as CUL-1598.
3. **Home's line sits under the Signal.** Most call-tier reads have no Home row two days later.
4. ***Keep watching* reads "Keep an eye on {him}"** (AC 19).
5. **The notification body names the pet only under DR-6's opt-in.**
6. **Expiry is derived, never written.**
7. **The escalation is the unit (§6.1).** A call-today tap into a bout whose first read is call now covers the bout.

## Reviews

- **code-reviewer: fix-before-merge, all fixed.**
  - Atomic call writes and Undo writes.
  - The null event label.
  - The note draft.
  - A note-bearing Undo now confirms first.
  - The unguarded wipe line.
- **rls-privacy-reviewer: PASS, no cross-account path.** Residuals fixed: a sign-out fence on the reconcile, and per-row stale checks in the pulls. Filed: the Vet visits pet-switch race (CUL-1601).
- **adversarial-reviewer: five passes.** The safety invariant (a call never lowers, rewords or hides a read's ask) held on every pass, including a 400-seed fuzz and 1,858 fuzzed taps with no dead "I've called". The accounting failed four times, and each pass's fixes opened the next:
  - **Pass 1:**
    - P1: a re-floor raise let an old call cover a new call-now read.
    - P2: the anchor came from the previous bout.
    - P3: a deleted anchor stopped bounding its bout.
    - P4: two phones on one bout.
    - P5: an Undo raced an answer.
  - **Pass 2:** grouping by anchor plus current ranks reopened P1; a pulled answered call re-offered.
  - **Pass 3:** stored and unknown ranks split one escalation across phones.
  - **Pass 4:**
    - A: a read timed before the anchor, landing after the call.
    - B/C: cross-phone under-cover and re-ask.
    - D: Take back could withdraw the other phone's call.
  - **Pass 5 (one phone, 1,200-seed fuzz): FAIL, towards asking too often.**
    - No dead tap, no louder read covered, and no answer lands on a withdrawn call.
    - Breaks: the cover for a read timed before the called anchor (A) is not stable. A raise of the anchor, or a louder read landing between the two, un-covers a read that was covered and answered, so "I've called" and a second question come back (`lib/vetCallReads.ts`, the walk clause).
    - Open for a ruling: a soft-deleted call-now first read sets the call's stored rank.
- **Why the session stopped:** five passes, and each round of fixes opened the next round's break. The model is being patched in pieces instead of being designed once. The design it needs is (1) the rank and anchor time stored on the server (CUL-1602) and (2) a cover that latches once shown. That is a fresh build session against a ruled design, not a sixth patch. The PM decides (CUL-1604).
- The root cause of every cross-phone failure is that 082 stores no rank on the call. Only a server column fixes it (CUL-1602, raised to High).

## Definition of Done

- **Acceptance (CUL-1419, spec §6):**
  - Pass: the call record in Vet visits and History.
  - Pass: the follow-up opens the booking and medication forms.
  - Pass: the notification under G1/G5/G6.
  - Pass: the confirmation never names a day.
  - Pass: the note reaches no server code.
  - **Fail, for two phones on one account:** "never re-asks after an answer" (CUL-1144 acceptance, AC 10). It holds on one phone.
- **Anti-patterns:** pass. ThemedText, theme tokens, C-5 44pt boxes, C-7 (no `disabled` on answers), C-9 record pet, C-12, C-14 (one Modal), C-21 (one net), C-40 (parsed instants), and Home's write classes unchanged.
- **Types and tests:** `tsc` clean; the full jest suite passed on each push (latest 13,621).
- **Secrets:** none.
- **Personas:**
  - Designer ✓: TD-4, no Home control, AC 19 words.
  - Engineer ✓: queues, wipe, fence.
  - Trust & Safety ✓: rls-privacy-reviewer.
  - Dr. Chen / Data: the adversarial passes above.
- **Adversarial:** not PASS for two phones. This is the merge condition that failed.

## Residuals (filed)

- CUL-1597: TD-5, for the PM.
- CUL-1598: the switch into `notification_preferences`.
- CUL-1599: a new reason class at the same rung.
- CUL-1601: Vet visits pet-switch race.
- CUL-1602: the server rank column. It blocks two-phone use.
- CUL-1603: an edited anchor time splits a bout.
- CUL-1604: the PM's call on PR-36 (merge dark, or wait for the redesign), with the pass-5 findings.
