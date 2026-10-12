# Engines v3 PR-27n: the read's landing names the pet and the call

**Date:** 2026-10-10
**One thing:** D2 L1 — Types: a required parameter turns a forgotten value into a red build · check: pending

Shipped via #1145 (CUL-1514). Dispatched by `/dispatch`, BUILD mode, on `claude/engines-v3-pr27n-10101150`. The build note was the plan.

## What shipped

- When a per-incident read lands on the open record, VoiceOver and TalkBack now say **"Biscuit's read: call your vet now."** This applies to every verdict and replaces "AI read: Worth a call". The form is mock §04's spoken contract (`docs/culprit-incident-tiers-mockups.html`).
- The sentence lives in `lib/incidentFloorWords.ts` as `readLandedLine`.
  - The completion card's raise line (`raisedReadLine`, self branch) now uses the same function. A landing heard on the record and the same landing on the card can never be worded two ways.
  - Only a line that opens with a tier-map label is lower-cased after the colon.
  - Anything after the label (CUL-819's held-call disclosure, the phone's worked-out line) rides the same utterance.
  - A non-verdict line (failed, capped, hidden) keeps its own words after the name.
- The landing hook takes a **required** `petName`, read on the landing commit.
  - Both sections pass the name the screen resolves with `resolveRecordPetName` (C-9).
  - A blank name speaks as "Your pet's read".
- No Edge Function imports either file (C-26), so the merge redeploys nothing.

## Decisions

- **The channel did not change.** The issue names `useLiveRegionAnnouncement`. The read's landing has never used that hook, because the stage is not a live region (a live region would re-speak on every edit). It announces on both platforms through its own CUL-1275 hook, `useReadLandingAnnouncement`. This PR changes the words that hook speaks.
- **Not built, because each is a new word:**
  - The mock's "keep an eye out. What would change that is below." The second sentence is not in the tier map, and the build note rules "never new words".
  - "Part of a pattern", which has no tier until K2.
  - Both are noted on CUL-1514. When the pattern tier lands, its label speaks through this same function with no change here.

## Falsification attempts

- **Is a section test that calls `readLandedCopy` on both sides proving anything?** No, it would be a tautology (C-34). The hook suite, the lib suite and one assertion per section use literal strings.
- **Mutation 1:** drop the name from the hook's sentence. 10 tests red.
- **Mutation 2:** remove the vomit section's `petName` wiring. 16 tests red.
- **Could a proper noun be lower-cased?** Only a line that opens with a tier label is lower-cased, and every label opens with a common word. A line led by the pet's name (the cap copy) is never touched.
- **Could a late-resolving name be missed?** The name is read in the landing's layout effect from a ref, not captured when the wait began. Tested: null when the wait began, "Mochi" at landing, and the landing says "Mochi's read".
- **Adversarial review:** N/A. No engine, threshold or escalation logic changed, only the words for an already-decided tier. Every verdict is spoken in the same form, so silence still never means calm.

## Review

The `code-reviewer` found no bugs. Its one NIT with teeth was to make `petName` required (C-37), which was done. The rest were optional (a section-level literal for the held disclosure, comment line width).

## Residuals

- None blocking.
- The mock's "What would change that is below." is unbuilt pending a tier-map word, if the PM wants it.

## Teach

**D2 L1 — Types: a required parameter turns a forgotten value into a red build**

*In plain words.* TypeScript checks, before the app runs, that every function gets the values it asks for. A parameter can be **optional** (leave it out and the code uses a fallback) or **required** (leave it out and the build fails).

*Everyday analogy.* A form with a "Name (optional)" box against one with a "Name" box that blocks submission until it's filled. The optional box is friendlier, and it's also how forms reach the office unsigned.

*From today's diff:*

```ts
petName: string | null | undefined;   // was: petName?: string | null;
```

The first draft wrote `petName?:`, with the question mark making it optional. Every current caller passed the name, so it worked. The trap was the next caller. A third screen that forgot the name would have compiled cleanly, and VoiceOver would have said "Your pet's read" over a record that has a name, a quiet regression no test was watching for. Dropping the `?` doesn't change what the app does today. It changes what a mistake costs tomorrow: forgetting the name is now a red build on the developer's machine, not a wrong sentence in a blind owner's ear. The value can still be `null` (a pet with no name). It just has to be *said*.

*Check question:* the new type still allows `null`. Why is "you must pass it, but it may be null" safer than "you may leave it out"?
