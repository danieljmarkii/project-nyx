# Engines v3 PR-35: EN-9's answers on the finding screen, at the vet and after it

**Date:** 2026-10-03
**One thing:** T1 L1 — Local-first: the write lands on the phone before any network · check: pending

Dispatched session (`/dispatch`, Engines v3 round), BUILD on CUL-1418. Shipped via #1020.

## What shipped

The app half of EN-9's care state. It is dark: nothing new renders unless the server wrote `careState` on a concern, which needs the `engines_v3_en9` key.

- **The finding's screen** (`components/designV2/signal/CareAnswers.tsx`):
  - **On a raised concern:** *Book a visit · My vet knows · Not yet*, with at most one question above them.
  - **The question is one of:** PMD-4 A's trial question, the same for a course, or the latest visit. It is asked once, at most one a day, and remembered on the device (`lib/careQuestionAsked.ts`).
  - **The answers:** *My vet knows* writes one dated answer for one sign. Its confirmation (mock 2b) carries an Undo, which writes a retraction row, plus the offline line (3e). *Not yet* writes nothing. *Book a visit* opens the booking form for this pet with the finding as its reason.
- **Home** (`SignalRow`): a watched concern shows **Your vet knows** (D6), the server's sentence and "Not asking you to book. Back here if it comes more often." A concern that came back shows its "Back because…" line above the shipped row, ask intact. Display only.
- **At the vet:** Home's concerns are tickable. Ticks are device-local and only pre-select.
- **How did it go?:** *What Home was raising*, with *Talked about it · Not this time · Later*. Saving writes `at_vet_tick` / `visit_answer` against the new visit.
- **Data:** a local `care_acknowledgements` mirror in the wipe list, and an insert-only, parent-gated push.
  - It sends 082's nine granted columns.
  - A 23505 on our own id counts as landed.
  - The drain re-selects until nothing moves, regenerates the Signal per landed pet, and stops on a sign-out.
- **Server:** the sentence opens "…, your vet knows." (D6), and a raised-again fact carries `backLine`. Both are dark behind the key.
- **Spec v1.2:** D6's vocabulary.

## Decisions (team calls, logged on CUL-1418)

1. **The gate is the server's field.** No app-side key is needed: a surface draws only where `careState` exists.
2. **The incident screen gets nothing.** An incident carries no care state, and its "I've called" is PR-36's.
3. **The at-the-vet tick is device-local.** It is kept off the appointment's `questions`, which five readers count as owner questions.
4. **"You noted" rows** (Undo after leaving the screen) are filed as CUL-1541. The recheck question waits on CUL-1531 and is filed as CUL-1542.

## Reviews

- **code-reviewer: fix-before-merge, all fixed.**
  - A double tap or a double Save wrote two rows, so Undo retracted one.
  - A landed row lost its regen when a later row failed.
  - The regen listener was lazy, so it missed a restart.
  - The back line was split at "Mr." in a pet's name.
  - A missing catch.
- **rls-privacy-reviewer: one break (the CUL-642 class), fixed.** A drain could arm a regen with the previous account's pet id after the sign-out wipe. Now an epoch check stops it. Everything else held: the columns, C-9, the wipe, no off-device leak.
- **adversarial-reviewer: three passes.**
  - **Pass 1:**
    - F1: an old question on a raised-again concern quieted the worsening.
    - F2: an offline Undo left Home quiet for a cycle.
    - F3: a 2025 methimazole course was offered for 2026 vomiting.
  - **Pass 2:** the F3 fix reopened on the worsening card (a null onset). Undo on a latch-only re-raise lost the latch (a server weakness, CUL-1545). A transient Undo failure still regenerated. A stale question could survive a state change.
  - **Pass 3: PASS.** No question without a known onset, a confirm-first with no Undo on a re-raise, the regen held behind a landed answer's Undo, and the answers re-keyed on the state.
  - Each fix has a test, proven by mutation.

The lesson PR-23 recorded held again: a fix toward "louder" opened a quieter path (the null onset), and only a fresh pass found it.

## Definition of Done

- **Acceptance (CUL-1418 and the PR-35 build note):**
  - Pass: finding-screen answers with "My vet knows", tickable rows at the vet, *What Home was raising*, the past-visit question, and the display-only watched rows.
  - Incident screen: N/A. It carries no care state, and its answer is PR-36's.
- **Anti-patterns:** pass.
  - Theme tokens and `ThemedText` throughout; C-5 by a 44pt box with no slop; no `disabled` on the answers (C-7).
  - The record's pet everywhere (C-9).
  - Every write path handles its error.
  - Home's write classes are unchanged (`guards/homeWrites.test.ts`).
- **Types and tests:** `tsc` clean. The full jest suite passed on push (13,510 passed). Deno did not run locally, so CI covers `careState.test.ts`.
- **Secrets:** none.
- **Personas:**
  - Designer ✓: TD-4 (no Home control), D6's words, C-21 (one safety net), §7's spoken labels.
  - Engineer ✓: the insert-only queue, parent gates, epoch and wipe.
  - Data ✓: one sign per row; no question without an onset; the 60-day bound.
  - Dr. Chen ✓: escalations untouched (AC 3), a re-raise never quieted by a past answer.
  - Trust & Safety ✓: rls-privacy-reviewer.
- **Adversarial:** three isolated passes; the third PASSED.
  - Tried: a raised-again concern re-asked about a past visit → no question.
  - Tried: a 2025 methimazole course on a worsening card → not asked.
  - Tried: an offline answer and its Undo → the regen held until both landed.
  - Tried: a sign-out mid-drain → nothing marked or armed.
  - Tried: Jordan's trial, started three days before his first logged vomit → still asked.
- **Future self:** an answer table written from four surfaces through one writer and one queue is the shape PR-36's call record should copy.

## Residuals

- **CUL-1545:** the server latch releases on `created_at`, not on the answer's day, and a retracted answer can lose it. That blocks go-live; the client no longer reaches either path.
- **Quarantined and offline look the same:** a quarantined answer shows the same "once you're back online" line as an offline one.
- **Accepted by pass 3:** a meal or daily regen while an Undo waits shows "Your vet knows" briefly, and the next drain corrects it. A quarantined Undo of a landed answer leaves it shown (low, deliberate).
- **The 60-day bound** for "started for this sign" is a client call, and the server has no equivalent.

## Teach

### T1 — Local-first: the write lands on the phone before any network (L1)
When an owner taps "My vet knows", the app writes the answer into a small database on the phone first, marked "not sent yet". Sending it to the cloud is a separate step that happens afterwards: straight away when there is signal, later when there isn't. So the tap never waits on the network and never gets lost because the network was gone. The cost is that, for a while, the phone knows something the server doesn't.

**Like:** writing a cheque into your own checkbook register before the bank has cleared it. The register is right the moment you write it; the bank catches up when the cheque reaches it.

**In today's work:** `lib/careAnswers.ts:77`
`VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)`: the answer goes into the phone's own table, and the final `0` means "not sent yet". The push in `lib/sync.ts` later finds every row still marked `0`, sends it, and flips it to `1`.

**Why it matters to you as PM:** this is why the screen can promise only "Saved on this phone. Home updates once you're back online." Home's "Your vet knows" is worked out on the server, so the server must have the row first. That gap is a product decision, not a bug.

**Check:** Jordan taps "My vet knows" in a clinic car park with no signal, then closes the app. What does Home show him tonight at home on wifi, and what has to happen first?
