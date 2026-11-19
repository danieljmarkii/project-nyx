# Vet contacts PR-03: a call, text or email never anchors the report window

**Date:** 2026-11-19
**One thing:** T2 L2 — The push sends only what the phone knows: an unknown is left out, never guessed · check: pending

Shipped via #1569 ([CUL-2765](https://linear.app/projectnyx/issue/CUL-2765)). A dispatched row, plan-gated because it moves the report window's reader. No screens changed. The PR body carries the Definition of Done and the QA script.

## What shipped

- **Window readers are exams only.** On the phone and on the server, every reader that means "the last time a vet examined the pet" now skips calls, texts and emails:
  - the report window and its composer;
  - Rundown's and History's "since the last visit";
  - the care questions' latest visit;
  - "is this the latest visit";
  - the booking prefill;
  - the warning engine's visit line.
- **Masking reads every contact.** The 42 days during which a zero is withheld after a visit now count a contact too, because a vet can phone in a steroid.
- **A guard** makes every read of the visits table declare which of the two questions it answers.
- **The phone stores both new columns and syncs them.** The flag and its beta row are in, dark.

## How it went

- **The plan was posted, and the PM said go in the session.**
- **The code review caught a CI break before it landed.** The report-preview harness mirrors the report's visit read. Its export query is privacy-pinned, so the `rls-privacy-reviewer` re-read it and passed it.
- **Adversarial pass 1 failed on two QUIET breaks,** both fixed:
  - **Masking had gone exam-only,** so a phoned-in steroid could let "0 episodes" print. Masking now reads every contact, while the window stays exam-only. AC 10's wording goes to the PM as [CUL-2830](https://linear.app/projectnyx/issue/CUL-2830).
  - **The push could re-stamp a call as an exam.** A row an older build pulled read as `in_clinic` through the local default, and its next edit sent that default over the server's `phone`. The local column is now nullable with no default: unknown is not an exam, and the push leaves an unknown channel out.
  - **Filed from the same pass:**
    - [CUL-2828](https://linear.app/projectnyx/issue/CUL-2828): builds without this PR read a synced call as an exam, so a rollout gate is needed before anyone is allowlisted.
    - [CUL-2829](https://linear.app/projectnyx/issue/CUL-2829): surfaces that still call a contact a visit.
- **Adversarial pass 2 found no QUIET break.** Its one LOUD break (reopening a call claimed to move the window) was fixed, and so was its batching residual. Ships at the two-pass cap.

## Residual

A pre-upgrade row that never reached the server stays "unknown" on its phone. Its window falls back to the exam before it (louder, never quieter). Parked on [CUL-2765](https://linear.app/projectnyx/issue/CUL-2765).

## Teach

Re-ask first, from PR-02, still ungraded: if `channel` had defaulted to the current time instead of `'in_clinic'`, would adding it have rewritten `vet_visits`?

### One thing — The push sends only what the phone knows (T2, L2)
When the phone syncs a row, it sends a list of named fields, and the server keeps whatever it is not sent. So the dangerous field is the one the phone sends without knowing it. Phones running an older app pulled visits before the "how did you hear" field existed. Had the field arrived on those phones with a ready-made answer ("at the clinic"), the phone would have sent that guess up with the owner's next edit, and a phone call would have become an exam on every device. Now the phone stores "unknown" and leaves the field out of the send, so the server's own answer stands.

**Like:** filling in a form for someone. If you don't know their middle name, you leave the box blank. Writing a plausible guess means the office files your guess over what they already had.

**In today's work:** `lib/sync.ts:1805`
```ts
const toRemote = (v: QueuedVisit) => ({          // build the fields this row sends
  id: v.id, pet_id: v.pet_id, visited_at: v.visited_at,   // always known
  ...                                             // the rest of the visit, as written
  ...(v.channel === null                          // does this phone know how the owner heard?
    ? {}                                          // no: send nothing, the server keeps its own
    : { channel: v.channel, contacted_at: v.contacted_at }),  // yes: send it
  created_at: v.created_at, updated_at: v.updated_at,
});
const known = unsyncedVisits.filter((v) => v.channel !== null);    // rows that know
const unknown = unsyncedVisits.filter((v) => v.channel === null);  // rows that don't
for (const batch of [known, unknown]) { ... }     // sent apart: in one batch the server
                                                  // would treat a missing field as "empty"
```
Why it was written this way: the first version gave the new field a default, which looked safe and was a claim the phone could not back. The two batches exist because the database library merges a batch's fields across every row.

**Why it matters to you as PM:** whenever a spec adds a field to something people already have on their phones, "what does an old row say" is a product decision, and "a sensible default" can be a false statement about the record.

**Check:** your partner's phone runs last month's build and pulls your Nov 9 phone call, then updates. Before it syncs again, does the vet report on *that* phone start at Nov 9, at your Sep 18 exam, or somewhere else, and why?
