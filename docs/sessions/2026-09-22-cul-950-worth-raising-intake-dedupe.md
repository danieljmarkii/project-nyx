# CUL-950 — Worth raising states each intake decline once, and never drops one the Signal isn't stating

**Date:** 2026-09-22 · **Issue:** CUL-950 (Out of beta, milestone 2) · shipped via #890
**Filed:** CUL-1084, CUL-1085, CUL-1086, CUL-1087, CUL-1093, CUL-1094

---

## What this was

Get ready's *Worth raising*, the list an owner reads aloud to the vet, printed one hunger
strike twice. The device's own intake-decline row and the Signal's `intake_decline` finding were
concatenated with no dedupe (`lib/getReady.ts:181`). The PM ruled option (a): prefer the
Signal's phrased sentence and keep the device row as the fallback. The session had to build it
without turning the fallback into a suppression, which is the C-34 shape.

## How the ruling got sharper before any code was written

The plan exposed a sub-question the ruling had not reached. The two sources can disagree about
WHICH decline they are stating: a multi-day low (`consecutive_low`) or a refused food
(`refused_normal_food`). Should the device row drop when the Signal carries ANY intake decline
(the ruling as written, "2"), or only the SAME one ("1")? The PM sent it to the product team.

**The panel.** Seven isolated persona interviews (Dr. Chen, Sam, Jordan, Data Scientist,
Designer, Dir. of Eng, QA) on a neutral brief with no recommendation marked, plus a pre-build
`adversarial-reviewer` pass over both options. Round 1 was 7/7 for (1). The adversarial pass showed
(2) breaks in ordinary use. A rating added after the fact never regenerates the cache
(`app/event/[id].tsx:351-364`), and the server counts free-fed meals the device excludes. So the
cache can say "turned down Chicken Pâté" while the device knows the cat ate under baseline today,
the first day of the feline 48-hour window. The pass also showed trigger-only (1) breaks on the
same trigger with a different food. Round 2 (food identity, order) and round 3 (Dr. Chen's order
dissent, withdrawn once the engine change was routed to its own issue) made it unanimous.

**My brief was wrong twice, and the panel caught both.** First, the "3 days vs 2 days" residual I
priced into option (1) cannot happen: `daysBelowBaseline` is the species constant on both sides
(cat 1, dog 2). Three lenses had attached a "higher count wins" condition to a state the detector
cannot produce, and withdrew it. Second, "a byte-exact mirror" was false: the server does not
exclude free-fed meals. The lesson is the one CLAUDE.md already states twice (C-35, and "verify
a premised surface at file:line before building on it"). I briefed from the code's own header
comments, and a header is a claim.

**The PM then ruled (A):** pass every device flag, not only `flags[0]`. That closed the last
suppression the reviewer found: a cat that ate little today AND refused her trial food, with
neither in the cache, was read to the vet as "eaten less than usual today" and nothing else.

## What shipped (#890)

- `lib/getReady.ts`. `mergeIntake` drops a device decline only when a Signal row this list
  PRINTS states the same one. Identity (`sameDecline`): the trigger, plus the trimmed and
  case-folded food label for a refusal. A nameless device refusal matches any Signal refusal; that
  path is defensive and unreachable today. An unknown trigger never matches. Survivors join the
  Signal's intake run in the engine's trigger order (`INTAKE_TRIGGER_ORDER`, mirrored from
  `detection.ts` and pinned by a test that reads it). With no Signal intake row they lead the band.
  The input is a required structured `intakeDecline` (C-37).
- `lib/dietTrialFacts.ts` / `lib/dietTrialCard.ts`: `intakeDeclineFacts`, every flag with its
  identity and its own `declineHeadline` sentence, set from the same read as the unchanged
  `intakeDeclineHeadline`. Nothing that reads the headline changed.
- `app/rundown.tsx`: `localIntakeDeclines(trialInput)`.
- Tests: the device's and the Signal's declines are both built by the real `detectIntakeDecline`,
  the Signal's at an earlier clock over an earlier record. That is how a cache Get ready never
  refreshes goes stale. There is a wiring test on the screen, a loader test, and a C-34 pin
  against the engine's comparator. The impossible cat fixture at `daysBelowBaseline: 3` is corrected.

## Falsification

- **Mutation**, each red on the case named for it. No dedupe (6 red). Dedupe on "the cache
  answered" (9 red). Dedupe on any intake decline, the ruling's first form (5 red). Trigger-only
  identity. A nameless refusal never matching. No case fold. An unknown trigger matching. Both
  placement shortcuts. Placement walking past another lane's row. A strict null check on an older
  cache. A swapped engine order. The screen wiring dropped, or first-only. The loader keeping
  `flags[0]`. Stated and not tested around: reading raw `input.findings` survives because it is
  equivalent today (a tripwire pins the premise that `visibleFindings` never withholds an intake
  decline), and so do `.trim()` and the `consecutive_low` early return.
- **Post-build `adversarial-reviewer`: SOUND for the diff.** Suppression HOLDS. It found three
  things fixed in the PR: the screen's wiring had no test, one placement mutant survived, and an
  older-engine cache with no food field crashed the page. It found one pre-existing gap outside the
  diff: Get ready only receives the device's decline for a pet on a trial. Filed as **CUL-1093
  (High)**. Whether it gates VV-GA is the PM's call.
- `code-reviewer`: ship-ready. It asked for one cleanup, which was applied: the Signal-sentence
  fixture now throws on a span it does not mirror.
- `tsc` clean. `npm test` 441 suites / 9,629 tests before the base merge. The touched and adjacent
  suites are re-run green after merging #888/#889, and the non-UTC zones are green.

## Residuals

- A food renamed between the two snapshots shows both rows. That is the extra-row direction the
  ruling accepted, and a test pins it.
- With no Signal intake row but a Signal red flag, device rows still lead the band. That is the
  pre-CUL-950 position, and it reverses the engine's red-flag-first order. Kept on purpose; noted
  on #890.
- The follow-ups: CUL-1084 (engine order, Dr. Chen), CUL-1085 ("just turned down" when a day
  old), CUL-1086 (the server's free-fed gap), CUL-1087 (a rating edit never regenerates),
  CUL-1093 (no trial means no device decline on Get ready), CUL-1094 (a model-phrased refusal may
  omit the food).
