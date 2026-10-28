# T8 said "three days in a row" over two days (CUL-2223)

**Date:** 2026-10-28
**One thing:** S2 L2 — Code changes what is written next; an UPDATE changes what is already written · check: pending

Shipped via #1339.

## What happened

The PM found Nyx's vomit read (Oct 27, 07:44 CDT) saying "Nyx has vomited on three days in a row", call today. The record held two days: 06:10 and 06:26 on Oct 26, 07:44 on Oct 27.

**Root cause.** EN-4's floor row T8 (`lib/incidentFloor.ts`) fires on a vomit in each of three back-to-back 24-hour spans whose start may sit anywhere. A start at Oct 25 06:26 CDT cut between the two Oct 26 vomits, sixteen minutes apart, so about 25 hours on two days met "three spans". The sentence in `floorSentence` then named calendar days the rule never counted. The rule's comment assumed the server knows no zone; `user_profiles.timezone` exists, and the burden detector already counts calendar days in it after catching this same class.

## What shipped

- **The call is unchanged.** T8 fires on exactly the records it fired on before, in every zone.
- **The words count the owner's calendar days.** `FloorResult.persistence` (`logs`, `days`, `consecutive`) is set when T8 fires and a zone resolves. "Three days in a row" only over three consecutive days of known-time logs (a found pile is dated when found, so never supplies a day); otherwise "{n} times, on {d} separate days"; with a found pile in the run or no zone, "{n} times across more than a day".
- `readFloorRows` reads `user_profiles.timezone`; a failed read names no days and never throws.
- Nyx's one stored read was corrected in production on the PM's word (one row, guarded on the old text; tier and flags unchanged). It was the only stored read carrying the sentence.

## Adversarial review (two passes, the cap)

- **Pass 1 FAIL.** The first design moved the *tier* to calendar days. Zone-less, once-a-day runs fired 0.38% against 100% on `main`, with no repeat-rule backstop; a stale profile zone could skip a call the watch-for line promised. Rejected for the words-only design.
- **Pass 2.** 300k fuzzed records: tier, rows and counts identical to `main`; no false "in a row". Found and fixed: a throwing profile read dropped every flag at the pipeline's catch (QUIET); a found pile could supply the third day (LOUD); counts depended on read order.
- **Residuals, accepted:** a stale profile zone can shift a day boundary in the words (the app re-stamps it on every foreground); "times" counts logs, as T1's sentence does and as the owner counts.

Every other "days in a row" surface (burden card, `signalTitle`, `signalHomeLine`, `generate-signal/phrasing`, the vet report) already counted calendar days.

## The lesson

A sentence's claim and the rule's predicate must be the same predicate. The tier asked "is this persistent enough to call?", which spans answer well; the sentence asked "on how many days?", which only a calendar answers. Splitting them kept the warning as loud and made the words true.
