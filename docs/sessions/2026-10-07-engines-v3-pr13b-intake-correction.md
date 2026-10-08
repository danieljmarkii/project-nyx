# Engines v3 PR-13b — EN-0 part 2: a dated correction beside a stored vomit read

**Date:** 2026-10-07

Shipped via #1093 (CUL-1648, migrations 085 + 086 and the mock) and #1094 (CUL-1649, the screen and Ask), both left open for the first build after 1.2.0. Parent CUL-1406. Dispatched by `/dispatch`, BUILD mode, on `claude/engines-v3-pr13b-10070058`; the code half is on `claude/engines-v3-pr13b-10070058-code` (a second branch the PM approved in session so the schema stays in its own PR).

## What shipped

- **Facts, not words, in the database.** `event_ai_analysis` gained server-only correction facts (when; meals in the 24 h before the read; how many unrated; how many Most or All) and `intake_read_at`, all in 075/079's freeze. Triggers keep them current as meals move. The verdict and the stored words are never touched.
- **One word source.** `lib/readCorrection.ts` turns the facts into the block for the incident card and Ask's relay alike.
- **Ask** carries the stored words and their correction as one string, so no relay can carry one without the other.
- **Live (after 086):** 8 stored reads, all still `worth_a_call`. 6/12, 8/19, 9/4 and both 9/26 reads say *Corrected*; 9/22 and both 7/27 reads say *From the meal log*.

## Rulings (PM, 2026-10-07)

- **R-5 → C-A:** words kept, a grey block under them, no strikethrough.
- **Refresh → (a):** a meal landing later recounts the correction.
- **Window → (a)**, after adversarial pass 1 broke 085: count the 24 h before the read ran, correct only where the record shows missing ratings, an empty log, or a Most or All meal since.
- **R-6 → O-iii**, after pass 3: refusals beside unrated meals get a dated record line, never *Corrected*.

## Reviews

- **rls-privacy-reviewer on 085:** one BREAK, a cross-account meals row counted into the facts. Fixed (`m.pet_id = e.pet_id`), proven by mutation.
- **Adversarial pass 1:** BREAKS. "Went further" over a refusal-backed warning (B1), and the wrong window (B2). Fixed by 086 and ruling (a).
- **Pass 2:** BREAKS. The opener read as a retraction in Ask; refusals were left out; the backfill anchored early. All fixed.
- **Pass 3:** wording HOLDS. A late-photo anchor broke and was fixed (no correction where a photo landed > 5 min after the row). The residual became R-6.

## Not done here, filed

- CUL-1650: meals has no same-pet guard (analyze-vomit's embed still joins on the event alone).
- CUL-1651: clients can UPDATE a read's words and verdict.
- CUL-1652: EN-4 with EN-0 off would re-write the old sentence.

## Notes for the next session

- The Supabase MCP `apply_migration` timed out three times on 086 (each left nothing behind); the PM applied it in the SQL Editor, so 086 has no row in the project's migration history.
- An earlier statement to the PM that 7/27 would show no block was wrong: its window holds one unrated meal. Corrected on CUL-1406, in the mock (W4 now illustrative) and in both PRs.
