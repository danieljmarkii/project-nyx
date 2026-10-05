# Engines v3 PR-23b — the raised-again latch reads what an answer is about (CUL-1545)

**Date:** 2026-10-05
**One thing:** S2 L1 — Data vs schema: a new fact stored inside a saved JSON row needs no migration, but it lives only as long as that row · check: pending

A dispatched session (Engines v3 · PR-23b). It shipped via #1073.

## What shipped

`supabase/functions/generate-signal/careState.ts`, EN-9's care state, behind `engines_v3_en9` (off).

**The bug (CUL-1545 F1).** §4.5 says a concern that came back stays back "until the owner answers again with an acknowledgement dated after the re-raise". The latch released whenever the newest answer had been *written* after the previous run. A visit answer, a vet-started trial or a vet-started course written today about a visit or start date from before the re-raise therefore quieted a concern that had come back. The rate arm then restarted from that answer's creation day, so Home stayed quiet for a week or more.

**The second path (N2, from PR-35's second adversarial pass).** After "My vet knows" and then Undo, the next run's prior row said `with_vet`. With no `raised_again` in the prior row, the latch was gone for good.

**The fix.**
- **`raisedAgainAt` on the care fact.** It holds the instant a run first said the concern was back. It is carried on every later state while the concern stays in the set, and only a fresh re-raise replaces it. A concern that was never re-raised writes no key, so the shipped row's shape is unchanged.
- **`answersReRaise`.** An answer counts only if it was written after that instant and its `anchor_on` falls on or after that instant's local day.
- **The latch.** It holds until some live answer (unretracted, unlapsed) qualifies. It is evaluated over the whole live set, not only the newest answer, which gives three behaviours:
  - An Undo brings the latch back.
  - A qualifying trial or course that lapses brings the latch back.
  - A later answer about an older visit does not re-raise a concern the owner had already answered properly.
- **Legacy rows.** A prior `raised_again` row written before the marker existed stands on its own generation time, which is the louder reading.

**Tests.** There are four new cases (F1, N2, the live-set rule, fresh-vs-held and legacy markers), and 48 of 48 pass. Each new case is proven by mutation:
- reverting to the old rule reds 4;
- reading the newest answer only reds 1;
- dropping the anchor half reds 3;
- dropping the written-after half reds 1;
- not carrying the marker on `with_vet` reds 3.

The whole generate-signal suite (869) and ask (150) are green, and `tsc` is clean.

## Adversarial review

I ran the isolated `adversarial-reviewer` on a scratch copy.

**It holds for the diff.**
- The latch held against every probe:
  - a late old visit against `recheck_booked`;
  - an undone qualifying answer that sits beside an old-anchored newer one;
  - a qualifying course that ended;
  - two lanes of one sign carrying different markers, in both orders;
  - malformed, legacy and future markers;
  - the D4 leave-and-return.
- The false-loud checks also held: a trial started today, a visit on the re-raise day, and a tap after the re-raise each release.
- No new quiet path is reachable without forging the owner-writable cache row, and a forged `with_vet` row could already quiet a concern before this change.

**One breach the old code shared.** An incomplete read skips the step, and `carryPriorSafety` strips care state. So the night after a skipped read loses the marker, and a late answer about an older visit quiets a concern that is still doubling. A real fix stamps the marker through `pipeline.ts`, so this PR states the gap in the file header and files it as **CUL-1600**. The timezone flap, the pooling order, the trust placed in `anchor_on` and a copy nit from the same review are filed there too.

## Decisions

- **The marker is the run's instant, not the evaluated firing day.** "After the re-raise" means after the Signal that told the owner, which matches PR-35's client rule ("How did it go?" offers a raised-again concern only on a visit dated on or after that Signal).
- **Both halves are required.**
  - Without "written after", the answer the re-raise was tested against would release it the next day.
  - Without "about a day on or after", F1 stands.
- **The marker stays after release.** Otherwise N2 (an Undo) cannot be told apart from a stable watched concern.

## Teach

### One thing — Data vs schema: a new fact stored inside a saved row (S2, L1)
The database has a shape (tables and columns), and changing that shape takes a migration, which is code someone has to apply. But some columns hold a free-form bundle of data (JSON). Adding a new fact *inside* that bundle changes no shape, so it needs no migration. The catch is that the fact lives only where that bundle lives: if the row is rewritten without it, the fact is gone.

**Like:** writing a reminder on the back of today's receipt instead of in your diary. You need no new notebook, but if tomorrow's receipt replaces today's and nobody copies the note over, the reminder is lost.

**In today's work:** `supabase/functions/generate-signal/careState.ts`
`raisedAgainAt?: string` is the moment the app first said a symptom was back. It is stored inside the cached Signal row's JSON, so this PR has no migration. Each night copies it forward from the night before. On a night that skips the care step, nothing copies it, which is exactly the hole the review found (CUL-1600).

**Why it matters to you as PM:** "no schema change" makes a PR cheap to ship, but the fact it stores is only as durable as the row carrying it. That is a trade you can ask about whenever a spec says "remember X".

**Check:** If a future change made the nightly Signal row get rebuilt from scratch every night (nothing copied from yesterday), what would happen to a symptom that came back last week?
