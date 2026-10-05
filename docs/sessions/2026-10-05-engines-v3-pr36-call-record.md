# Engines v3 PR-36: EN-14's client — the call record, the follow-up, the notification

**Date:** 2026-10-05
**One thing:** none — dispatched session, not this round's teach row

Dispatched session (`/dispatch`, Engines v3 round), BUILD on CUL-1419. Shipped via #1072. The first build stopped after five adversarial passes (below); the PM held it (CUL-1604, A), migration 084 landed via #1074 (CUL-1605), and the client was rebuilt on the stored cover the same day. **The ninth pass holds.** #1072 stays a draft until the PM's word.

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
7. **A call's cover is stored at the tap (084):** the bout's first live read's time and the TAPPED read's rank. Coverage reads only that, never the reads' current tiers. (Supersedes the first build's "a call-today tap into a call-now bout covers the bout", which pass 6 broke.)
8. **One question per call (PM ruling A, CUL-1604).** Calls share a question only when their stored covers are identical. Two phones that anchored one bout differently each ask, the accepted extra question.
9. **The tap's walk reads live reads only** (CUL-1604's deleted-anchor question, the recommended side).
10. **The pull adopts the server's `created_at`** on rows the phone already holds, so answers and notes order the same on every phone; ties break by id.

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

### The rebuild on the stored cover (passes 6–9)

- **Migration 084** (#1074, applied on the PM's word): `covers_rank` and `covers_from` on the root call, a CHECK tying them to roots only, a column grant. rls-privacy-reviewer PASS on the client's push and pull.
- **Pass 6: BROKE.** R: a late earlier call regrouped an answered escalation and re-asked. B: a call-today tap stored a call-now rank and silenced call-now offers. D: answer precedence by each phone's own clock. Fixed (tapped rank, server `created_at` adopted, an answer-by-relation rule).
- **Pass 7: BROKE.** The tapped-rank fix let a later bout's call merge into an earlier answered one, never asked. Seven passes had now broken every rule that merged near covers, so the PM ruled A: one question per call, merging only identical covers.
- **Pass 8: BROKE** within ruling A: a member without its owed row hid another's question; the shown answer could swap; the incident pick depended on row order. Fixed by choosing the speaking member over every member's rows and a total order.
- **Pass 9: HOLDS** on every hard failure. Three defects fixed (the owner's own call is the one shown, so her note and the row's day never move; one answer predicate). One transient case stated: a call whose anchor event has not been pulled stands alone until it is.
- Every fix carries a regression test, each proven by mutation.

## Definition of Done

- **Acceptance (CUL-1419, spec §6):** all pass, including "never re-asks after an answer" across phones (passes 8–9), within ruling A's accepted extra question.
- **Anti-patterns:** pass. ThemedText, theme tokens, C-5 44pt boxes, C-7 (no `disabled` on answers), C-9 record pet, C-12, C-14 (one Modal), C-21 (one net), C-40 (parsed instants), and Home's write classes unchanged.
- **Types and tests:** `tsc` clean; the full jest suite passed on each push (latest 13,643).
- **Secrets:** none.
- **Personas:**
  - Designer ✓: TD-4, no Home control, AC 19 words.
  - Engineer ✓: queues, wipe, fence, Undo refused at the writer for another phone's call.
  - Trust & Safety ✓: rls-privacy-reviewer, twice (first build; the 084 columns).
  - Dr. Chen / Biostatistician (pass 9): a member with no owed row beside one that owes → the question still shows ✓; a later answer with a lower id → the first answer stays ✓; four row-insertion orders → identical views and incident pick ✓; a call-today tap in a call-now bout → the call-now read stays offered ✓; answering through a non-speaking member → the whole group answered ✓.
- **Adversarial:** HOLDS (pass 9).

## Residuals (filed)

- CUL-1597: TD-5, for the PM.
- CUL-1598: the switch into `notification_preferences`.
- CUL-1599: a new reason class at the same rung.
- CUL-1601: Vet visits pet-switch race.
- CUL-1602: the server rank column. It blocks two-phone use.
- CUL-1603: an edited anchor time splits a bout.
- CUL-1604: ruled A twice (hold and redesign; one question per call).
- CUL-1602: closes by hand when #1072 merges (#1072 names only CUL-1419).
