# Engines v3 PR-30q: "Has she eaten since yesterday?" on the record, and the vomit read reading the answer

**Date:** 2026-10-10
**One thing:** T2 L1 — The sync queue: a re-check waits for the answer it is about to read · check: pending

Dispatched session (`/dispatch`, Engines v3), CUL-1724, BUILD. The row was plan-gated: it is a clinical surface, and it adds a new local table to the sign-out wipe. The plan was posted on the issue, and the PM typed "Go" in this session, which also ruled "Yes never quiets" (option A of the plan's brief). Shipped via #1154.

## What shipped

- **The question on the record** (`components/event/IntakeQuestion.tsx`, words in `lib/intakeQuestion.ts`). It sits under the vomit's read, dark behind `engines_v3_en5`.
  - It is a heading plus a radio group ("N of M"), with no timer, never announced.
  - Answered, it folds to "You said: … · Change".
  - Each pet gets its own form of the question:
    - A meal-fed cat is asked "Has Nyx eaten a meal since 6 PM yesterday?"
    - A free-fed cat gets the I2 words. The pronoun follows the recorded sex, and an unknown sex reads "they".
    - A dog, or any pet on a running trial, is asked "Could … have eaten something else?". A Yes opens the meal log for that pet as a door.
    - A trial cat gets both questions. Species "other" gets none.
  - "Not sure" and "Haven't seen" draw a safety-net line, derived at render:
    - Before its hour: "If you haven't seen Nyx eat by 8 AM tomorrow, call your vet."
    - From that hour on: "If you still haven't seen Nyx eat, call your vet now."
    - The hour is always at least two hours after the answer, and never later than 48 h after the hour asked about unless the answer itself came later.
    - The line retires a week after the answer.
- **Storage** (the `vet_calls` precedent):
  - A local `intake_checks` mirror in `BASE_SCHEMA_SQL`, cleared by `LOCAL_WIPE_TABLES` (before events). It has no local FK.
  - The push is parent-gated (`parentLandedSql`) and never sends `created_at`.
  - The pull is incremental with an explicit column list.
  - A Change is an UPDATE that moves `updated_at` and throws on zero rows.
  - An answer the server refused is said on the record and re-sends on the same answer.
- **The server** (`analyze-vomit`, `ruleVersion` vomit5). It reads the answers under this vomit:
  - The read uses an explicit column list and joins on the event's id, pet, type `vomit` and live row.
  - It takes the newest answer per question. A No, or "A little" (stored Picked, I3), fires the cat intake arm.
  - The words: "When I read this, you'd said Nyx hadn't eaten a meal since the day before this vomit."
  - Yes and Not sure never quiet anything, and an answer never enters the Noticed predicate.
  - The raise reaches a stored read through EN-4's refloor (raise-only). The client writes the marker with the answer, and the marker waits until the answer lands.
- **The guards and comments.**
  - `guards/intakeChecks.test.ts` registers analyze-vomit as the one reader and asserts its join clauses.
  - `engines_v3_en5` joins the client allowlist keys.
  - The stale "NOT SEEDED" en5 comment in `_shared/engineFlags.ts` is corrected.

## Decisions

- **PM go, 2026-10-10:** the plan as posted. Yes is stored and shown and never quiets the read (the louder reading of spec §9).
- **PM ruling A, 2026-10-10 (Ask):** the read's own words may cite the answer, and Ask relays them like any read's words. Ask never reads the table, and the vet report reads neither.
  - Recorded in the guard header and at the sentence.
  - 097's header line is narrowed to the table. 097 is applied, so the migration file is unchanged.
- **Stated flip condition:** an answer raises a stored read only while `engines_v3_en4` and `engines_v3_en3` are on. So en5 flips only with them, beside "ships only with EN-8" and #1143's build floor.

## Reviews

- **code-reviewer:** nothing blocking. Four cleanups were taken:
  - a saved answer stays on screen when the re-read fails;
  - a Change to the same answer writes nothing;
  - the other-food door writes no re-check;
  - each Change button tells VoiceOver which question it changes.
- **rls-privacy-reviewer:** every cross-account boundary held: refloor and floor with another account's vomit, pull, push, Change on a foreign id, sign-out mid-push and mid-hydrate, wipe, deletion.
  - Attack 3 (the answer reaching Ask through `read_text`) went to the PM and was ruled A.
  - Attack 5 (a held call quoting a replaced answer) was fixed by pinning the sentence to the read.
- **adversarial-reviewer, four rounds.**
  - **Round 1, BREAKS.** Six findings, all fixed in this PR:
    - **B1:** a failed answers read dropped EN-5 and could turn worth_a_call into monitor. It now reads as unanswered, proven by mutation.
    - **B2:** a replaced answer stayed quoted as current. The sentence is now pinned to the read.
    - **B3:** the 8 AM deadline had no ceiling.
    - **B4:** an answer the server refused was not said on the record.
    - **B5:** one answer across both questions, so a later "Haven't seen" could cancel a No. Now the newest answer per question.
    - **B6:** the rule version was not bumped.
  - **Round 2.** The fixes held. R2-1 (the B3 fix moved 6–8 AM answers to the 48 h cap) was fixed. R2-2 (a failure during the answer's one re-check consumes it) is class-wide and filed as CUL-1747.
  - **Round 3.** R3-1: the line relaxed into an open "today" after its hour and renewed at midnight. Rebuilt to only ever get louder, retired by record age, with matching "seen" wording.
  - **Round 4, PASS.** It swept 85,470 pairs per zone across five zones and found the named hour always at least 2 h away and the line monotone. R4-1 (a clock-change night overshooting the cap by up to an hour) is clamped in this PR.
  - Two judgement calls are recorded for Dr. Chen on CUL-1724, not built:
    - **R4-2:** a late answer keeps its two hours even past the 48 h cap.
    - **R4-3:** re-answering restarts the line.

## Falsification (DoD line)

- **Biostatistician:**
  - A failed answers read over two refusals then a Most → stays worth_a_call with EN-0 on and off ✓.
  - A meal-fed No plus a later free-fed "Haven't seen" → still fires ✓.
  - Each fix reverted → its test reds ✓.
  - Yes mutated to quiet the arm → the corpus property test reds ✓.
- **Dr. Chen:**
  - A year of vomits in five zones at six answer delays → the named hour is always ≥ 2 h after the answer, and the line only goes by-hour → call now → retired ✓.
  - 6:30, 7:59 and 8:00 answers, and a phone clock behind → never quieter, never past tense ✓.

## Residuals

- **CUL-1747:** a refloor that fails for one vomit still answers 200, so the phone marks the re-check done.
- **CUL-1744:** T10b, a dog's "no food in 24 h", has no input. It needs a vet ruling first.
- **`main` is red on Edge Functions** (`generate-signal/incidentRedFlagTier.test.ts:63`, a PR-27p / PR-30a collision). PR-30b (CUL-1746) owns the fix. This PR's own tree passes the full `deno test` locally.
- **Class-wide, not new:** no hydrate step checks `stale()` inside its per-row write loop (privacy pass).

## Teach

### The sync queue: a re-check waits for the answer it is about to read (T2, L1)
When you answer the question, two things are written on the phone at once:
- **Your answer.**
- **A note that says "ask the server to look at this vomit again".**

Both wait in a queue until there is signal. The note must not go first, or the server would re-read the record before your answer had arrived and find nothing new. So the queue holds the note back until the answer it depends on has landed.

**Like:** posting a cheque and a letter that says "I've paid". If the letter arrives first, the bank checks the account and finds no money, so you hold the letter until the cheque has cleared.

**In today's work:** `lib/syncQueue.ts:567`
`WHERE gate_i.event_id = incident_floor_queue.event_id`
In plain words: hold the "look again" note while any answer under the same vomit is still waiting to be sent.

**Why it matters to you as PM:** whenever a feature says "the server will notice", ask what the server reads and whether it can arrive before the thing it reads. The order is a design decision, not a detail.

**Check:** you answer "No" on a plane with no signal, then land and open the app. What does the server see first, and what would have gone wrong if the "look again" note had been sent the moment you tapped?
