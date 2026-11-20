# Vet contacts PR-10: a corrected visit rebuilds its pet's warnings; the visit chips switch on

**Date:** 2026-11-20
**One thing:** T2 L1 — The sync queue: a send can land while its answer is lost, so the phone cannot always know what the server holds · check: pending

Shipped via #1577 ([CUL-2835](https://linear.app/projectnyx/issue/CUL-2835), [CUL-2842](https://linear.app/projectnyx/issue/CUL-2842)). A dispatched, plan-gated row (Gate: clinical) and this round's teach row. The PR body carries the Definition of Done and the QA script.

## What shipped

- **A corrected visit rebuilds Home's warnings when it lands.**
  - Just before a visit is sent up, the phone reads what the server holds for it.
  - If the push changes whether the visit is an exam, or deletes it, that pet's warnings rebuild.
  - The comparison is with the server, not with the answers on this phone. So a phone that holds none of the visit's answers still triggers the rebuild.
- **A backstop that survives an app kill.**
  - Whenever Home reads its warnings, it also checks for a visit that turned into a contact, or was deleted, after the last build.
  - It also runs on an expired build, and as soon as another phone's correction is pulled in.
- **The visit → call chips are on.** They still sit behind `vet_contacts_enabled` and the beta opt-in.

## How it went

- **The plan held for the first rebuild.** Both adversarial passes went after what happens when that rebuild never runs.
- **Pass 1** found three ways to stay quiet:
  - The push commits but its answer is lost.
  - The app is killed during the five-second wait before the rebuild.
  - A second phone's stale save undoes the correction.
  
  The first two are fixed by the backstop. The third needs a ruling on last-write-wins, so it is filed: [CUL-2843](https://linear.app/projectnyx/issue/CUL-2843), which blocks the allowlist step.
- **Pass 2** found four more gaps around the backstop:
  - It was skipped on an expired build, whose rebuild the AI cap can turn away.
  - A failing read check switched it off.
  - It waited for the next Home visit after a pull.
  - A rebuild slower than two minutes can stamp itself after a change it never read.
  
  The first three are fixed. The fourth is server-side and already live for per-incident reads, so it is filed: [CUL-2844](https://linear.app/projectnyx/issue/CUL-2844).
- **The cap was reached.** No third pass; the remaining residuals are filed.

## Residual

[CUL-2843](https://linear.app/projectnyx/issue/CUL-2843) waits on your ruling: a second phone that has not synced yet can save its stale copy of the visit, and that undoes the correction.

## Teach

Re-ask first, from PR-09, still ungraded: an owner taps "Talked about it" on Monday on her old phone, switches to a new phone on Tuesday, and corrects that visit to a call on Wednesday. Before PR-09, would her warning come back? After it?

### One thing — A send can land while its answer is lost (T2, L1)
The phone sends a change to the server and waits for a reply saying "got it". The change and the reply travel separately. The server can save the change and the reply can still vanish on a dropped connection. The phone then believes nothing happened and sends the change again. The server already has it, so on the second try nothing looks new. Anything the phone meant to do "once it lands" is skipped. Today's fix stops asking only "did my send work?" and also checks, every time Home loads, for a change the last rebuild did not include.

**Like:** you post a cheque and the bank cashes it, but the receipt is lost in the mail. You post a second copy, the bank says "already paid", and the thank-you note you meant to send when it cleared never goes out.

**In today's work:** `lib/signal.ts` (`landedReadRebuildKey`)
```
moved = await visitMovedNearBuild(petId, row.generatedAt, LANDED_READ_RACE_MS);   // ask the record itself, not the lost reply: did a visit become a call after Home's warnings were built?
```

**Why it matters to you as PM:** when a spec says "when X syncs, do Y", ask what happens if the phone never hears that X synced. The safe answer re-checks the record later, not the moment.

**Check:** an owner corrects a visit to a call on a train. The upload goes through, but the signal drops before the reply arrives, and she closes the app. What does Home show the next morning, and why?
