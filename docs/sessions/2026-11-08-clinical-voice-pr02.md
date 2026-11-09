# Clinical voice row 2: the reason-keyed words module and the client copy

**Date:** 2026-11-08
**One thing:** P4 L1 — A lagging indicator with no events behind it cannot warn you · check: pending

Shipped via #1485, finishing CUL-2667, CUL-2663 and CUL-2675 (row 2 of the clinical voice project, parent CUL-2654). Dispatched, plan-gated; the PM typed the go.

## What happened

One pure module, `lib/incidentAskWords.ts`, now decides from a read's stored reasons whether its ask is the floor ("Call your vet today. If they're closed, call an emergency clinic.") or deferential ("Worth a call today" plus a same-day line that keeps the emergency clinic). Anything it does not recognise, or a reason a surface was never handed, is the floor. The record, the Signal (strip, banner, Home line), the diet trial's decline line, the "When to call the vet" door and the report send card take their words from it. The report send card now asks as loudly as its loudest live flag (CUL-2663), and a floor sign on an earlier-rule or unknown tier gets the floor (CUL-2675 (a)). A guard keeps the floor's literal in the module and sweeps every ask for Pattern 11's Never column.

The 90-day call-answer baseline ran before any copy moved: 12 call reads, 0 "I've called". It is recorded on CUL-2667.

## What broke and how

**The first adversarial pass failed with three QUIET findings, all fixed louder.** The sharpest: a cat can be 37 hours without a Most or All meal while the engine still files it as "eating less", so the mock §05 split (a cat's partial decline goes deferential) softened the diet trial line and the report send card below the floor. Without a live meal check those surfaces now keep the floor for every cat decline; the split waits on CUL-2680. The other two: an owner edit to another field silenced the photo's own blood flag (now only the owner's explicit "none" on that sign does), and a pet the store does not hold skipped the cat check (now it runs it). The second (final) pass at 85659c8 held the cat and species fixes and failed the edit fix twice, both QUIET, one root cause: a negative the model wrote itself was taken as the owner's word, and either family's blood column could cancel the flag. Fixed louder at the next commit by reading the record's own diff against the model's payload: a photo flag is silenced only when the owner changed that sign's own column to none. Per the two-pass cap, that last fix had no third review; it only removes a way to go deferential.

**The consent card's vet line could not move.** The inventory's split names blood, and a 2026-10-12 ruling keeps blood off that line. It ships unchanged; the PM ruled (a) the same day, keep it (CUL-2679).

**The list surfaces cannot see reasons.** History, the month, the gallery and the Home spine read a phone copy with no reasons in it, so they keep "Call today" (louder) and, on old blood reads, "Worth a call" (quieter, shipped before this row). CUL-2678.

## Residuals

- Row 3 (CUL-2668) moves the server: a self-expiring parity exception and one guard exemption name exactly what it must align (comment on CUL-2668).
- CUL-2680 (live harm, shipped before this row): Home and the banner do not firm up for a 24 h cat under an "eating less" card.

## Teach

### One thing — A lagging indicator with no events behind it cannot warn you (P4, L1)
A leading indicator moves before the outcome you care about; a lagging one moves after it, once the outcome has happened. The ruling's safety condition is lagging: "if owners stop saying they called on floor warnings, revert the floor's words." That only works if there are calls to stop. Over 90 days the app showed 12 call warnings and recorded zero calls, so the rate is already at the bottom and cannot fall, and the condition can never fire.

**Like:** a smoke alarm in a room nobody ever enters. It is wired correctly, but it is not protecting anything.

**In today's work:** `scripts/clinical-voice/call-baseline.sql:56`
`round(100.0 * count(c.event_id) / count(*), 1)   AS called_pct,` — the share of call warnings the owner answered with "I've called"; today it is 0.0 in every row.

**Why it matters to you as PM:** row 4's 30-day read will report "the floor rate held" whether or not the words changed behaviour, so a hold there is not evidence; the protection has to come from somewhere else (the floor's own rules), or from a leading measure you choose now.

**Check:** If row 4 comes back with "floor called rate: 0% before, 0% after", what can you conclude about whether the softer words changed what owners do?
