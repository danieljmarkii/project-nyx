# Vet report v2: a cat refusing every meal raises a flag (stopgap)

**Date:** 2026-11-02
**One thing:** D3 L1 — Reading a test: two answers that agree can both be wrong · check: pending

Dispatched BUILD row, plan-gated (Gate: clinical); the PM typed the go in the session. Shipped via #1400. The issue stays open for the final threshold ruling with Dr. Chen, so the PR names no issue.

## What shipped

The intake check compared recent meals with the pet's own normal, so a record with no good meals had no normal to fall from: a cat whose every rated meal for a month was picked at or refused raised no flag on the vet report or the Signal. A new intake trigger, `sustained_refusal`, is an absolute floor beside the relative check: every watched rated meal in the last 72 hours refused or picked at, at least 3 meals on at least 2 owner-local days, cats and dogs, below the coverage floor. Provisional numbers, the louder floor while the ruling waits.

It lives in `supabase/functions/generate-signal/detection.ts` (the issue named a `generate-report/detection.ts` that does not exist; the report and the Signal share this detector) and its phone twin in `lib/analytics.ts`. The Signal card is template-only and asks for a call today; the report's band row states the counts and says no baseline exists to compare with.

## What broke, and how

Two adversarial passes on the stopgap (the cap), then a third, PM-authorised, on the scope change below.

- **Pass 1 broke the plan itself.** The approved plan had the floor yield to `consecutive_low`. A cat that ate well for two weeks and then refused every meal for 72 hours met the floor and still got "eaten less than usual today … if it carries on". The floor now replaces that card when both hold, a departure from the plan on the louder side, stated on the issue. Wording fixes: the window is named in hours, "watched and rated", and the report anchors to its window end.
- **Pass 2 broke the free-fed rule.** The shared free-fed predicate counts an uncertain bowl rating (an old build's take-up day, no toggle-off instant) as a watched meal, which is the safe error for a flag that a bad rating fires and the unsafe one for a flag that a good rating stands down. A bowl's "ate it all" on the take-up morning silenced the floor on both detectors, and the parity suite agreed, because both were wrong the same way. Free-fed spans now carry their widest bounds, and only a certainly watched rating can stand the floor down.

Filed: CUL-2403 (the report reads only in-range meals; Live harm), CUL-2404 (the rule's shape: "some" stands it down, lapsed logging; Waiting on PM, rides the ruling), CUL-2405 (old app builds show the softer card; Live harm), CUL-2406 (three small residuals; Backlog).

## The scope change, and pass 3

Mid-session the PM ruled in the dispatcher session (CUL-2394's newest comment) and gave the go here: the report's intake lane reads the lookback pull up to the window end, not the window alone (CUL-2403), and ruling (a) on the floor's shape (CUL-2404): only a watched "ate most" or "ate it all" clears it, "ate some" is counted with at least one refused or picked-at meal required, and the window can end at the last rating when the owner stops rating. The PM allowed a third adversarial pass on that addition.

Pass 3 broke the anchor: ending the window at the last rating reached a good meal older than 72 hours and silenced a floor the 72 hours to now had raised, at breakfast on the morning after a 23:59 refusal. The anchored window is now a fallback, tried only when the now-window does not qualify. The demo story's intake card is now held by the floor two days after its seeded dip and decays at four. Residuals: the report now shares the Signal's baseline drag (noted on CUL-1797, labelled Live harm), and a cat rated "ate some" at every meal stays silent (an input for the threshold ruling, on CUL-2394).

## Teach

**D3 · Reading a test: two answers that agree can both be wrong** (L1)

The phone and the server each run their own copy of the "is she eating" check, and a test called the parity suite feeds both the same 4,000 made-up meal records and fails if they ever disagree. It passed. The second reviewer then found a record where both copies stayed silent on a cat that had refused six meals: a free-fed bowl rated "ate it all" on the morning an old app build took it up. Both copies read that rating the same wrong way, so they agreed, and agreement was all the test checked.

It is like two students copying from the same answer key: they will always match, and matching says nothing about whether the key is right. A parity test proves the copies are the same; only a test that knows the right answer proves either is correct.

The line that now holds the right answer, from `supabase/functions/generate-signal/detection.sustainedRefusal.test.ts`:

```ts
assert.equal(pre076[0]?.trigger, 'sustained_refusal')
```

It says what the cat should get, a flag, not merely that two programs said the same thing. Breaking the fix turned this test red; the parity suite would have stayed green.

**Check:** the parity suite and this new test both passed after the fix. If someone later broke the free-fed rule the same way in both copies, which of the two would turn red, and why?
