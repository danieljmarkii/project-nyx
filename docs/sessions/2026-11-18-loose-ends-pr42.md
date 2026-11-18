# Loose ends PR-42: the vet report headline says an unread off-diet food's ingredients were not read

**Date:** 2026-11-18
**One thing:** D5 L1 — What a reviewer looks for: a sentence can be true and still be read as an all-clear · check: pending
**One thing (re-ask):** T2 L1 — A check inside the write has no gap (PR-39's check) · asked again in this session's return, ungraded: no answer yet

Shipped via #1562 ([CUL-2810](https://linear.app/projectnyx/issue/CUL-2810)). A dispatched, plan-gated row: the plan was posted on the issue, the PM typed `go`, and the build followed in the same session.

## What was wrong

The vet report's page 1 headline lists what the off-diet feedings carried. Feedings with no off-trial protein on file printed "7 with no off-trial protein recorded". Read in a hurry, that is seven feedings checked and found harmless. They were feedings of a food whose label nobody read.

The phrase lived in one function. The tile, the diet section, appendix C and the newer sheets never printed it.

## What shipped

The headline clause now says why no protein is on file, and never states that something was looked for and not found:

- No ingredient panel on file: "ingredients not read for N on (days)".
- Some protein on file, none flagged: "protein content not confirmed for N on (days)".
- "carrying" opens the clause only when a protein is named.

## What changed from the plan

The posted plan had a second wording for a food whose list was read and named nothing off trial: "ingredient list read, no off-trial protein named in it". Both reviews rejected it before the PR opened.

- **The cold read** (Dr. Chen on the rendered page): "list read, no off-trial protein" scans as "checked, clean". The label read is automatic and unconfirmed, and one label's silence is not reassurance.
- **Adversarial pass 1**: the record's "panel was read" flag only means "some protein is on file". A protein taken from a product name, or typed by the owner, sets it. So does a bowl with a food missing from the record. Both printed "ingredient list read" over a list nobody read.

The clause was replaced with "protein content not confirmed", which claims nothing. Adversarial pass 2 tried an incomplete bowl, a name-only protein, a food fed before its allowed date, a stored copy without the field and all three headline shapes. None reads as checked and harmless.

## Residuals

- **A mixed bowl** with one named protein and one unread food prints only the protein. It was so before this PR. Filed as a live finding; the issue is linked from CUL-2810's comments.
- **A listed food fed before its allowed date**, with its proteins on file and all inside the trial diet, now reads "protein content not confirmed". Vaguer than the record, in the cautious direction.
- **The diet section's breakdown** says "no ingredient list captured" for every unrecognised feeding, including ones with proteins on file. Loud, and not this PR's.

## Teach

**What a reviewer looks for: a sentence can be true and still be read as an all-clear** (D5, L1)

A reviewer does not only ask whether a sentence is correct. They ask what a tired reader takes from it in five seconds. "Ingredient list read, no off-trial protein named in it" was accurate for the case it was written for. A vet scanning page 1 hears "checked, fine". The review's job was to read it the way the vet would, and then to find the records where it was not even accurate.

**Like:** a mechanic's note that says "brakes inspected, no fault found" when they only looked at the front pair. Every word is defensible. The driver still leaves believing the brakes are fine.

**In today's work:** `supabase/functions/generate-report/render.ts` (`headlineOffDietCarried`)

```ts
if (x.panelWasRead === true) unconfirmed.push(day)
```

Even when some protein is on file for this food, the feeding goes into the "not confirmed" pile. There is no pile for "read and clean" any more, because the record cannot prove a clean read.

**Why it matters to you as PM:** when you approve wording for the vet report, the question is what the fastest reader concludes, and whether the data behind the sentence can carry that conclusion.

**Check:** the old phrase and the rejected one both described feedings by what was not found. Suppose a later spec asks the report to say "no blood seen in 12 stool photos". What would a reviewer ask before letting that sentence print?
