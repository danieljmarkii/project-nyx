# Engines v3 PR-23f: safety summaries stay template-only, written and tested

**Date:** 2026-10-07
**One thing:** D2 L1 — Types: a promise the compiler checks, so a new safety type cannot slip past the test · check: pending

Dispatched build of CUL-1630, shipped via #1091. Mode BUILD.

## What shipped

The PM ruled A on CUL-1630: no model ever writes or rephrases a Signal summary that holds a safety clause. The validator gaps the issue first listed (an undoing tail, the four-sentence cap against multi-sentence safety templates, curly apostrophes, a pet named "Vet") are moot under that rule and were deliberately left alone.

- `supabase/functions/generate-signal/summary.ts`: a header rule stating the ruling, that a passing `validateSummary` never licenses lifting it, and that lifting it takes a new ruling. A new `modelMayPhraseSummary(packet, phrasingSwitchOn)`: the kill-switch and the safety policy in one gate, with the switch a required argument so a test can force it on.
- `index.ts`: the summary path calls that gate instead of the inline pair. Behaviour is identical (the switch is still off).
- `summary.test.ts`: four tests. With the switch forced on the gate refuses 30 safety packet shapes: each of the six safety types alone, beside a reflection (not quiet, so only the safety refusal holds it), below the EN-11 card floor, and watched under EN-9, plus four compositions. The fixture is a `Record<SafetyFindingType, Finding>`, so a seventh safety type fails the type check until it joins the test. A reflective packet is the non-vacuity floor. One test shows an undoing tail ("Pixel ate everything this morning.") passing `validateSummary` while the gate still refuses, which is the ruling's reason in executable form.

## Falsification

Four mutants against the real file, each killed: the policy without `hasSafety` (5 red), the gate ignoring the policy (3 red), the gate always false (the non-vacuity floor, 1 red), `weight_loss` dropped from the fixture (TS2741). An `adversarial-reviewer` pass ran over the diff; its verdict is in the CUL-1630 outcome comment.

## Checks

`deno test` over `generate-signal/` 884 passed; `deno check generate-signal/index.ts` clean; `tsc --noEmit` clean; `jest guards/` 735 passed.

## Residuals

None of substance. The weight fixture comes from the real lane (`detectWeightLoss`), so it moves if that lane's output does; the test asserts the lane still fires.

## Teach

### One thing — Types: a promise the compiler checks (D2, L1)
A type is a written promise about what shape a value has, and TypeScript checks every promise before the code is allowed to run. When the promise is "one entry for every kind of safety finding," the compiler counts the kinds for you, so adding a new kind without adding its entry is an error you see in seconds, not a gap someone finds months later.

**Like:** a seating chart printed from the guest list. Add a guest to the list and the chart visibly has an empty seat until someone places them.

**In today's work:** `supabase/functions/generate-signal/summary.test.ts`
`const SAFETY_FINDING_BY_TYPE: Record<SafetyFindingType, Finding> = {`
"A table with exactly one finding for every safety type the engine knows." When we deleted the weight entry on purpose, the test refused to compile.

**Why it matters to you as PM:** when someone adds a seventh safety card, the rule that keeps safety summaries away from the model is checked for it automatically, with no one having to remember.

**Check:** a future session adds a new safety finding type, `breathing_change`, and forgets this test. What happens when CI runs, and why is that better than the test simply passing?
