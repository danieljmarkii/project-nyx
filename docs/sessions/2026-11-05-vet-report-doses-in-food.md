# Vet report: page 1 names the doses given in food that appendix B counts

**Date:** 2026-11-05
**One thing:** T6 L1 — The report: two sections that count one thing must ask one question, or they drift · check: pending

Dispatched row, [CUL-2525](https://linear.app/projectnyx/issue/CUL-2525), plan-gated; the PM typed the go in session. Shipped via #1437.

## What happened

On Nyx's current record, page 1 of the vet report said nothing about doses given in food, while appendix B's "Food used to give medication" row counted 20 feedings that carried a dose. An older copy had said 18 doses were given in a food off the allowed list.

The real record, read through `scripts/report-preview/`, gave the cause in three parts:
- **The 18 paired doses in the trial days all rode inside allowed foods** (Royal Canin Selected Protein PR Wet × 17, Instinct Rabbit × 1). The oral-route detector correctly keeps a pill in the prescribed diet out of the exposure count. That was right, but it left page 1 with nothing to say. The old 18 came from the time before each vehicle matched the allowed list.
- **One unpaired dose** (Cetirizine, Oct 3, logged "in food", no meal paired) never reached page 1. The detector returned nothing for any dose without a pairing, although appendix B already counted it. This was the QUIET bug.
- **Appendix B counts the whole report window, Sep 16 to Nov 4.** That window includes a chicken treat that carried a dose on Oct 24, after the trial ended on Oct 20. Page 1 counts trial days only, and neither section said which span it used.

## What shipped

`lib/dietTrial.ts` gained `doseRouteOf`, one decision for every dose by mouth. A dose is an exposure, a dose inside an allowed food, or neither; `classifyDose` is now its exposure half. An unpaired dose logged in food, a treat or a pill pocket is an exposure whose food is unknown. Page 1 now states the doses given in allowed foods. Appendix B now lists each vehicle with its count and dates, says it counts the whole window, and quotes page 1's counts over the trial days, so both sections read the same facts.

## Reviews

- **Adversarial pass 1 (6ad0e16): FAIL, one QUIET break.** The first on-list sentence said "a food on the list carries no protein the trial excludes". That is false beside a contaminated extra or trial diet, and over a diet nobody read. The claim was removed; a vehicle the contamination fact names is pointed at instead.
- **Adversarial pass 2 (22cae53): no QUIET break.** Every residual is LOUD or neutral, so the row ships at the cap. The residuals are filed as CUL-2528 and CUL-2530.
- **Three cold reads (22cae53, e79cc89, bb47627).** These added the unread-panel clause, appendix B's window and per-food dates, and the "no food recorded" wording. The final verdict at bb47627 is NOT READY on report-wide grounds that already exist on `main` (CUL-2529, CUL-2515). The doses-in-food lines themselves read as clinic-grade.

## Stopgap and ruling

Counting an unpaired "in food" dose is the louder side of an open clinical question on CUL-1353: the food might have been the trial diet itself. The app's trial card still never reads how a dose was given, which is live and QUIET, tracked there.

## Teach

### One thing — two sections that count one thing must ask one question (T6, L1)
The vet report is built by reading many rows from the record, then summarising them in several places. Here the same pills were counted twice: on page 1, and in appendix B's diet history. Each place had its own way of deciding what counts as "a dose given in food", so the two numbers drifted apart and the quieter one won. The fix makes both places ask the same function, and then print the scope each one covers.

**Like:** two clerks at one shop each keep their own tally of returns, one by the till and one in the stockroom. Their numbers disagree, and no one can tell whether a return went missing. Give them one returns book that both read, and if one of them counts only this week, have them say so on the page.

**In today's work:** `supabase/functions/generate-report/render.ts:196`
`const on = onListDosesOf(snap)` — appendix B no longer counts the doses in allowed foods for itself; it reads the number page 1 prints, which came from the one shared decision, `doseRouteOf`.

**Why it matters to you as PM:** when two parts of a report disagree, ask "do these two numbers come from one place?" before asking which one is right.

**Check:** if a later change teaches the detector to ignore missed doses, and only page 1 is retested, what happens to appendix B's line quoting page 1's count?
