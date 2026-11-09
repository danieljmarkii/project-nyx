# Intake decline: the decline never counts as the normal

**Date:** 2026-11-09
**One thing:** D3 L1 — A property test states a promise and lets a generator hunt for the record that breaks it · check: pending

Shipped via #1498 ([CUL-1797](https://linear.app/projectnyx/issue/CUL-1797)). Loose ends PR-01, a shaping row launched by `/sweep`.

## What happened

The row came in as a shaping brief: the intake card judged recent days against a "normal" that still held a refusal day from before CUL-94's buffer day, so the harder a cat refused on day 1, the more surely she lost her card on day 3.

The session measured the defect through both real detectors before proposing anything. The cat (nine good days, n refusals on Oct 10, "some" since) was silent at n ≥ 4 on the morning of Oct 12; the dog was silent at n = 3 and 4 on the evening of Oct 10. The sustained-refusal floor shipped since the issue was filed (CUL-2404) covered some hours but not these. The same mistake turned up live on the refusal arm and was filed as [CUL-2696](https://linear.app/projectnyx/issue/CUL-2696): four refusals of a food three days back silenced a fresh refusal of it.

The brief offered three options: leave out the decline uncapped, leave it out capped at 72 hours, or use a median baseline. The PM ruled option 1: the decline never counts as the normal, on both arms, uncapped inside the 14-day window, read alongside today's normal so it can only add cards.

## What shipped

- **The day-count arm** (`intakeBaselineReadings`, server and phone).
  - Each day before the buffer, oldest first, is low when it sits a full point under the normal of the earlier days that were not low.
  - The unbroken run of low days just before the buffer is the decline. The day before that run is where it may have begun, so it is read meal by meal, like the buffer.
  - The normal is read at every split from that day to the buffer, each split with every prefix of the buffer day.
- **The refusal arm** (`normallyEatenDayMean`). When the food's history is under the floor meal by meal, it is read again day by day, with its trailing low days left out. A day's refusals count once, so four refusals on one bad day are one bad day, and the evening half of a bout across midnight is the decline.
- **The old readings come first and outrank the new ones**, so every card that fired before is unchanged.
- **Tests.**
  - The cat and dog fixtures are pinned at every refusal count and hour.
  - The refusal arm's two shapes are pinned.
  - A steady record stays quiet.
  - The parity suite gains a property: refusing harder on the day before the buffer never quiets the card (669 of 8,000 generated records reach it).

## What broke, and how it was caught

- **The first build failed the property, at seed 1744.** A thin normal needed the buffer day's one good meal, and a refusal two days back pushed it under. Reading the earlier splits without the buffer's prefixes lost that reading. Combining them fixed it, and the property now proves the day before the buffer can only add readings.
- **The differential found a quiet change.** It ran 100,000 generated records against the shipped detector: zero lost cards and 6,709 gained. But 184 refusal cards named a different food, because the new reading could win the "largest drop" tiebreak. The old reading now outranks it, and a rerun showed zero changed.
- **The brief's refusal-arm wording was too narrow.** "The unbroken run before the latest refusal" would not have reached CUL-2696, where a good day sits between. The day-by-day reading is what closes it. Both readings are additive, so the ruling's direction holds.
- **Adversarial pass 1 broke the build twice, both QUIET.** First, the walk ran backward and judged each day against older meals that still held the refusals, so a seventh refusal two days before the buffer stopped it a day short: the cat fired at six refusals and went silent at seven. Days are now classified oldest first, against the normal of the earlier days that were not low. Second, the refusal arm averaged refused re-offers within a day, so a second refusal on a mixed day quieted it; a day's refusals now count once. Both counterexamples are pinned. After the fixes the differential still shows zero lost, zero changed, 6,908 gained.
- **Adversarial pass 2 (the last allowed) found one QUIET regression against the pass-1 build.** Counting a day's refusals once could lift that day exactly to the floor, stop the trailing drop, and keep older refusal days in the food's normal. The refusal arm now tries both by-day readings, refusals collapsed and not, and the accusing one stands. Pinned and proven by mutation. Pass 2 also confirmed, over 27,000 records, that nothing main raised is lost or changed, and that every clean decline with two or more good days fires.
- **Pass 1 also found a LOUD case.** The "which she normally eats" card can fire for a food refused all week. Filed as [CUL-2699](https://linear.app/projectnyx/issue/CUL-2699).
- **Mutation proof.** Each of these breaks reds the suites: disabling the walk, disabling the by-day reading, disabling the trailing-day drop.
- **A pinned contrast flipped.** `lib/analytics.test.ts` asserted that two "picked" days before a refusal silence the food's card when no free-fed span hides them. That suppression is this issue, so the assertion now expects the card.

## Residuals

- **[CUL-2698](https://linear.app/projectnyx/issue/CUL-2698), filed live.** A day that does not read as low on its own ends the decline, and refusals before it stay in the normal. The old code was silent there too. Pass 2's lead case: three days of refusals, then one fair day, then low days, and the card stays silent. The day just before the buffer is proven by the property.
- About 0.05% of ordinary records now raise a false "eating less" (pass 2, C4). That is LOUD, and it is parked on CUL-1797 because removing it brings back a quiet case.
- The "which she normally eats" wording on a food refused for days: [CUL-2699](https://linear.app/projectnyx/issue/CUL-2699).
- The vet report's intake lane runs the same detector, so it inherits the fix (the 2026-11-02 instance on this issue).

## Teach

### One thing — a property test states a promise and lets a generator hunt for the record that breaks it (D3, L1)
An ordinary test checks one example you wrote: "this cat, these meals, expect a card." A property test states a promise instead: "refusing harder before the judged days never takes a card away." A generator then builds thousands of made-up pets and checks the promise on each one. It finds the pet you would never have thought to write.

**Like:** A ruler checks one length; a building inspector walks every floor. The examples you write are the ruler; the property is the inspector.

**In today's work:** `lib/intakeDeclineParity.test.ts:363`
`expect({ seed, k, card }).toEqual({ seed, k, card: true });` reads: for generated pet number `seed`, after `k` extra refusals, there must still be a card. My first fix passed every example I wrote, and this line failed on pet 1744. That pet's normal was thin and leaned on one good meal, and the fix had thrown that meal away.

**Why it matters to you as PM:** when a PR says "the cat at four refusals now gets her card," that is one example. A property line is the claim that the whole class is closed, and it is the line that found today's real bug.

**Check:** the property only appends refusals to the day just before the buffer. A cat refuses hard three days back, on a day that started with a good breakfast. Does this test say anything about whether she keeps her card, and why?
