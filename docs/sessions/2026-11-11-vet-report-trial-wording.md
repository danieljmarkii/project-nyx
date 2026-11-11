# Vet report trial wording: the bracket and the denominator say what they count

**Date:** 2026-11-11
**One thing:** T6 L1 — The report: a number on the page is only as true as the word beside it · check: pending

Shipped via #1509 ([CUL-1823](https://linear.app/projectnyx/issue/CUL-1823)). Loose ends PR-13, launched by `/sweep`, Teach: yes.

## What happened

The vet report cold read on CUL-1779's fixtures found three trial sentences whose numbers misread. Rendering both fixtures first showed that two needed fixing and one was already right:

- **The refusal bracket** printed "(21 of 21)" after "not one rated feeding was finished". It now prints "(0 of 21 finished)".
- **The coverage sentence** called its denominator "this report's window" while it counted trial days. Its one source is `interpretabilityStatement` in `lib/dietTrial.ts`, and only the report renders it. It now reads "covers 27 of the 38 trial days in this window".
- **The meal-day halves** already agreed with the coverage line on main. An odd span names its middle day and prints the total, so the third item only needed a pin.

The CUL-2094 byte-identity guard went red on three windowed cases. Diffing the before and after HTML showed the coverage sentence was the only changed line, so the digests were re-recorded. Reverting either fix reds its new pin.

Dr. Chen's cold read confirmed all three. It also found a QUIET defect outside this row: a refused trial with one off-diet treat ends its bottom line "an elimination that was broken", which recasts the refusal as a compliance slip. That was filed as [CUL-2707](https://linear.app/projectnyx/issue/CUL-2707). Its other findings went as comments on CUL-49, CUL-2276 and CUL-748, and the rest were parked on CUL-1823.

## Teach

### One thing — The report: a number on the page is only as true as the word beside it (T6, L1)
The report reads many records and prints a few numbers, and every number needs a noun saying what it counts. "27 of 38 days of this report's window" had the right numbers but the wrong noun. The window ran 52 days; the 38 were the trial's days inside it. A vet reading "of this window" does the arithmetic against the wrong total and concludes the dog was tracked for less of the window than the page claims.

**Like:** a receipt that says "3 of 5 items" when you bought 8. The 5 are the items on sale. The count is right and the receipt still misleads.

**In today's work:** `lib/dietTrial.ts:4296`
```
const days = truncated ? `${daysLogged} of the ${daysElapsed} trial days` : `${daysLogged} of ${daysElapsed} days`;
```
When the report's window and the trial's span differ, the sentence now says the second number counts trial days.

**Why it matters to you as PM:** when you read a report draft, the question for each number is "of what?" A cold read catches a wrong noun more often than a wrong number.

**Check:** A report's window runs Jun 1 to Jun 30, and a trial started Jun 11 and is still running. The page says "covers 15 of the 20 trial days in this window". What would a vet wrongly conclude if it said "15 of 20 days of this window"?
