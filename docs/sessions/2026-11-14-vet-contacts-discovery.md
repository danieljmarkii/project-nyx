# 2026-11-14 · Vet contacts discovery: a call, text or email that wasn't an exam

**Date:** 2026-11-14
**One thing:** D4 L2 — A guard is a test that reads the code, so "every reader declares exam or any contact" holds for code nobody has written yet · check: pending

**Issue:** [CUL-2749](https://linear.app/projectnyx/issue/CUL-2749) (DISCOVERY) · **Branch:** `claude/sleepy-gauss-v6xxu1` · **Outcome:** shipped via #1529 · **Project created:** Vet contacts (P-CUL-40), rows [CUL-2763](https://linear.app/projectnyx/issue/CUL-2763) to [CUL-2770](https://linear.app/projectnyx/issue/CUL-2770), PM step [CUL-2771](https://linear.app/projectnyx/issue/CUL-2771); follow-up [CUL-2762](https://linear.app/projectnyx/issue/CUL-2762)

## What happened

- **The PM's own feedback started it.** On Nov 9 Nyx's vet recommended an ear medication after a phone call and texts. There was no way to log that contact: `vet_visits` means an exam and anchors the report window, and `vet_calls` needs an escalation.
- **Team convening:** 8 for, Product Owner "after App Store 1.2.0", none against. One persona conflict: a channel field on `vet_visits` (Data Scientist) or a contacts table (Dir. of Engineering).
- **Mock round 1** drew one entry, a channel chip, the after screen, the record and the report. Round 2 applied the PM's reactions: attachments through Vet Files, and Email as a channel.
- **Owner review** (Jordan and Sam, isolated `pm-feature-review`): both NEEDS-WORK. Blocking findings:
  - the trial row was below the fold;
  - the "call back if" instruction was lost in notes;
  - a check-mark false closure after "she's barely eaten";
  - a logged call softening Home.
  - Sam's multi-pet claim was verified: `alsoForPetIds` is sent only when booked (`BookVisitSheet.tsx:205`).
- **Round 3** applied the PM's three rulings (call me if ships with this; awareness only; share into Culprit pulled forward) and every review fix.
- **Round 3.1** recorded the last three rulings (one entry; the window stays at the exam; a channel field) and removed the option boxes.
- **Spec** `docs/nyx-vet-contacts-requirements.md` v1.0, then the Linear project with the rulings, the run order (8 rows), the build notes, the critical path and Done means. PR-01's After was checked against `scripts/dispatch/page.ts`'s `classifyAfter`.

## Rulings (PM)

R1 to R9 on the project page and in spec §0.1:
- worth building;
- attachments;
- the four channels;
- call me if ships with this;
- awareness only;
- share into Culprit as a follow-up;
- one entry;
- the window stays at the last exam;
- a channel field with a reader guard.

## Files

- `docs/culprit-vet-contact-mockups.html` (new; rounds 1 to 3.1; published at https://claude.ai/artifact/97ohC4DfPN2sUa2Cf9kyqV)
- `docs/nyx-vet-contacts-requirements.md` (new)
- `CLAUDE.md`:
  - the vet visits Read-These row names the new spec;
  - a stale `app/vet-visit.tsx` path is dropped (the file is gone);
  - one redundant sentence is trimmed to stay under the budget guard.

## Open

- The ear medication's real name, needed for PR-01's real-payload frame ([CUL-2771](https://linear.app/projectnyx/issue/CUL-2771)).
- Cross-project: Vet instructions PR-04 ([CUL-2743](https://linear.app/projectnyx/issue/CUL-2743)) and this project's PR-05 both edit `app/vet-visits/after.tsx`. Whichever merges second wires the watch row onto contacts (comments on both).
