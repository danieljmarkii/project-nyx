# The clinical ruling sheet, October 2026 (CUL-583)

**Date:** 2026-10-01 · **For:** the PM, ruling under E-6 (amended 2026-09-26) ·
**Replaces:** the "batched Dr. Chen sitting" CUL-583 was filed to book ·
**Status:** 🧊 dated artifact. The input to a ruling, not a spec. Each row is superseded by the ruling it gets.
**Read on a phone:** Part 1 is published as an Artifact page, linked from the CUL-583 comment that carries its ruling table.

## How to read this

Dr. Alex Chen is a persona (`docs/personas.md`), not a veterinarian, so nobody could ever book the sitting this issue
was filed for (the 2026-09-23 team review on CUL-583). On 2026-09-26 you ruled the replacement (E-6, amended):

* **Louder** (a change that makes the app speak up more: a new safety card, a lower floor on a safety lane) is
  **adopted provisionally** through this sheet.
* **Quieter** (a raised floor, a relaxed count, a muted ask) **needs your sign-off** and harness proof that detection
  is no worse on CUL-508's pets with injected problems. Without that proof the louder number stays live.
* The lowest-evidence numbers go on the **real-vet list** (CUL-1312). That list blocks nothing.
* **Neutral** rows (wording, disclosure, a ratification of what already ships) need only your agree.

**One harness fact governs every quieter row in Part 1.** CUL-508's synthetic corpus (Engines v3 PR-15) scores the
Signal engine in `supabase/functions/generate-signal/`. It does not score the diet-trial card (`lib/dietTrialCard.ts`),
the trial facts (`lib/dietTrial.ts`) or the vet report's trial block (`supabase/functions/generate-report/trial.ts`).
So for a quieter row on those surfaces **the harness proof is missing**, and each such row names the substitute proof
a build session can produce instead. Read the quieter rows with that in mind.

**Every row was written to the same shape:** the question; today's behaviour at file:line; the recommendation and its
one line why; the counterexample tried against it and whether it held; the direction versus today; the verdict E-6
gives that direction. The `adversarial-reviewer` pass over Part 1 is recorded in §1.5, and where it broke a
recommendation the recommendation was changed, not argued with.

Part 1 covers the items that gate the **1.2.0 cut**, and you rule it first. Part 2 covers the **Engines v3** items
posted on CUL-583 since 2026-09-24, grouped by the PR each one gates so you can rule them just in time.

---

# Part 1 · The 1.2.0 cut

## 1.0 The ruling table

Answer each row with **agree** (take the recommendation, always option A) or a letter. About thirty minutes.
"Before the cut" means the build that applies the ruling should land before CUL-559 cuts 1.2.0.

| # | Issue | The question | A (recommended) | Other options | Direction | Verdict | Before the cut |
|---|---|---|---|---|---|---|---|
| **R1** | **CUL-60(b)** | A cat fed once a day whose trial food the app cannot recognise refuses every bowl: should the card stay silent for nine days? | Speak from the meal record as soon as nothing has matched the trial food, from the third rated bowl (day 3), not the tenth | B: lower the count to 5 · C: no change | Louder | Adopt provisionally | **Yes** |
| **R2** | **CUL-54(a)** | May the trial card say "needs a call today" from refusals that are weeks old? | When only old refusals hold the card, it speaks in dated past tense and keeps the call conditional on today | B: let the card expire after 14 quiet days · C: no change | Neutral (same records fire) | Adopt provisionally, your explicit agree on the tense | **Yes, the must-have** |
| **R3** | **CUL-54(b)** | Should the refusal card wait a minimum number of trial days before it may speak? | No floor. Keep today's day 2 behaviour | B: a 3 day floor · C: a 7 day floor | Neutral (no change) | Real-vet list | No |
| **R4** | **CUL-57** | A cat picking at every bowl and a cat eating nothing get the same sentence: should the app tell them apart? | Add a duration lead line when every recent rated meal was refused or only picked at, naming the count and the date it started. Leave the picker's sentence unchanged | B: also soften the picker's "today" · C: no change | Louder | Adopt provisionally (B goes to the real-vet list) | Yes |
| **R5** | **CUL-59** | A substitute food the pet eats waters down a refusal of the trial food when the app cannot recognise the trial food: fix it now? | No threshold change. The dilution case is a pet that is eating; it stays a known limit fixed by food recognition (B-529) | B: test each food separately under the fallback | Neutral (no change) | Agree only | No |
| **R6** | **CUL-60(a)** | Three rated meals can drive the vet report's refusal flag however many unrated meals surround them: raise the bar? | Keep the bar. Print the logged and unrated counts beside the rated ones on the flag | B: require a rated share · C: no change | Neutral (disclosure only) | Adopt provisionally, plus real-vet list | No |
| **R7** | **CUL-55** | A grazing bowl is topped up all day: may the refusal card still say the cat isn't eating what's put down? | Keep the card where it is; add one line naming the grazing bowl and narrow the claim to the meals the owner rated | B: put the grazing card above the refusal card | Neutral (no firing change) | Adopt provisionally, mock first | No |
| **R8** | **CUL-56(1)** | Once the refusal card latches, the one line that says how to clear it never shows: add it? | Add one line under the refusal card when too few recent meals are rated for it to stand down | B: no change | Louder (adds a line) | Adopt provisionally, mock first | No |
| **R9** | **CUL-56(2)** | The "rate your meals" line looks at the whole trial, so four diligent weeks buy four silent ones: add recency? | Also test the last 14 days; show the line if either window is under half rated | B: last 14 days only | Louder | Adopt provisionally | No |
| **R10** | **CUL-179** | Should the "ongoing for weeks" vomiting card need 5 episodes instead of 6? | 5, with its noise gate re-pinned on both sides as cough's already is | B: keep 6 | Louder | Adopt provisionally, plus real-vet list | No |
| **R11** | **CUL-267** | Is eight weeks the right grace before an overdue trial stops being treated as running? | Ratify 56 days as it ships | B: 28 · C: 84 | Neutral (no change) | Agree only | No |
| **R12** | **CUL-367** | A gut trial meets "This trial is done" five times before twelve weeks, a skin trial twice: change the numbers? | One tap on a gut trial below 84 days moves it to 84 days. Keep the starting windows | B: gut extension +28 flat · C: ratify as is · D: split assessment from continuation | Neutral, protective (fewer invitations to stop; no warning muted) | Adopt provisionally; cat gut 42 days to the real-vet list | No |
| **R13a** | **CUL-758 / 757** | A meal of the trial's own prescribed diet, on a day before the app recorded it as the diet, is counted as an off-diet breach and charted as antigen exposure. Should it be? | No. Where no trial diet was recorded for that day, a meal of the food that becomes the trial diet leaves the off-diet count and the antigen chart and is shown as a gap in the record | B: count it, caption it · C: exclude only when it is the trial's only diet | **Quieter** | **Needs your sign-off.** Harness proof missing; substitute proof named | No (report half rides CUL-19) |
| **R13b** | **CUL-311** | On a back-dated trial, a treat the vet permitted is treated as permitted for weeks before the owner told the app. Should it be? | No. A permitted extra opens on the day it was entered; earlier feedings of it are counted and labelled "fed before it was added" | B: today's behaviour · C: open it at the trial start and say so on the report | Louder | Adopt provisionally | No |
| **R14** | **CUL-749** | The vet report's refusal flag cannot see refusals in trial days the report's window cuts off. Should it? | The flag reads the whole trial, from its start to the report's end, and labels which dates sit outside the window | B: a one line count in the trial block · C: disclose only (today) | Louder | Adopt provisionally | No (rides CUL-19) |
| **R15** | **CUL-381** | What do Refused, Picked, Some, Most and All mean? | Five plain definitions, tap to reveal, with Some and Most split at "about half" | B: split at "three quarters" | Neutral (input calibration) | Adopt provisionally as copy; the half line to the real-vet list | No |

**Recorded, not for ruling:** CUL-747 was ruled by the team on 2026-09-23 (keep the off-diet count, state its
coverage, never print it as a rate below the coverage floor). It is listed in §1.4 so the record is in one place.

---

## 1.1 The most dangerous row first: R1 · CUL-60(b)

**The question.** A cat fed once a day whose trial food the app cannot recognise refuses every bowl. Should the card
stay silent for nine days, when the warning's own words cite a 48 to 72 hour window?

**Today, at file:line.**
* The refusal lane measures the trial food alone (`lib/dietTrial.ts:2687`, the narrow population). When the app
  cannot tell which logged food is the trial diet, that population is empty, and the lane falls back to every logged
  meal only once `allowedSetUnavailable` is true (`lib/dietTrial.ts:2769-2770`, `:2860-2861`).
* `allowedSetUnavailable` is true at once when the trial has no `primary_diet` row (`lib/dietTrial.ts:2272`), but when
  a row exists and simply never matched (a re-photographed bag, a cold food cache) it waits for
  `UNHYDRATED_SET_FLOOR = 10` feedings (`lib/dietTrial.ts:2019`).
* That floor's own docstring says it is "deliberately NOT clinical": it is a test of whether a database join is
  plausible, not of whether a pet is eating (`lib/dietTrial.ts:2004-2019`). It was never derived for this job.
* A cat fed once a day reaches ten feedings on day 10. Days 1 to 9 are silent on the card and on the report's safety
  band, which reads the same fact (`supabase/functions/generate-report/report.ts:4248-4268`).
* The report's feline line names the window the silence overruns: "In cats, ≥48–72 h of markedly reduced intake is a
  hepatic-lipidosis risk window" (`supabase/functions/generate-report/render.ts:2006`).
* When the trial food IS recognised, the same cat fires on day 3: three rated bowls across two days spanning at least
  12 hours (`lib/dietTrial.ts:2021-2023`, `:2045`, `:2863-2867`). So the nine days are a property of the recognition
  failure, not of the cat.

**Recommendation (A).** Split the refusal lane's fallback gate from `allowedSetUnavailable`. The refusal lane speaks
from the meal record whenever **no logged feeding has matched the trial food at all** (`narrow.feedings === 0`), at any
count. Every other use of `allowedSetUnavailable` (the "allowed list is missing" disclosure, `mayClaimAllMatched`)
keeps the ten feeding floor it was built with. **Why:** the floor answers "is the join broken?", and the lane needs
"is the cat eating?"; borrowing one number for the other question is the defect (CLAUDE.md C-34, a mirrored constant
must answer the same question).

**Counterexamples tried.**
1. *The B-530 history.* Two earlier attempts to widen this gate were broken by adversarial review
   (`lib/dietTrial.ts:2816-2858`). Round 1 found the gate too narrow; round 2 broke a per-window selector that keyed on
   rating presence and let the two refusal facts come from different populations. **Held:** A keeps the round 1 gate's
   condition (nothing matched, ever) and changes only the count, so neither round 2 break is reachable: a partial
   match still keeps the narrow population, and both facts still come from one population.
2. *A rival food on day 1.* An owner logs three refused bowls of a food that is not the trial diet before ever
   logging the trial diet. **Held, as an over-fire:** the fallback's copy already says it cannot name the food
   ("Culprit can't match these meals to the foods on this trial's list", `lib/dietTrial.ts:3484-3487`), and the claim
   it makes, that what the cat is offered isn't being eaten, is true of that record.
3. *A dog.* The same change reaches dogs. **Held:** the dog note is "it's worth a call to your vet"
   (`lib/dietTrial.ts:3476`), with no feline clock.

**Direction:** louder (fires on day 3 where it fired on day 10). **Verdict: adopt provisionally.** Recommended before
the cut: it is the false negative on the agenda.

---

## 1.2 The refusal register: R2 to R9

### R2 · CUL-54(a) · may old refusals speak in the present tense? (the cut's must-have)

**Today.** The live card speaks from the now-fact (`trialDietRefusal`, bounded to the last 14 days,
`lib/dietTrial.ts:2031`) or, failing that, from the whole-trial range fact when it spans at least 12 hours and the pet
is not shown to be eating now (`lib/dietTrialCard.ts:892-898`). The span test is the only age test, so three refusals
on days 3 and 4 followed by 41 unrated days still render the present-tense feline note "a cat that isn't eating
what's put down needs a call today" (`lib/dietTrial.ts:3474-3475`, `:3490-3494`). The file marks this as Dr. Chen's
open call (`lib/dietTrialCard.ts:884-890`).

**Recommendation (A).** No new number. When the card is held only by the range fact (the now-fact is null, which by
construction means nothing in the last 14 days meets the floors), the headline becomes a **dated past fact** and the
call becomes conditional on today:

> Between 3 and 4 March, 3 of the 3 trial-diet feedings you rated were left unfinished. Nothing rated since shows
> whether that has changed.
> If Mochi still isn't eating it, a cat that isn't eating needs a call today, whatever the trial is doing. Rating the
> next meal tells Culprit.

(The dog note becomes "If Rex still isn't eating it, it's worth a call to your vet.") **Why:** the defect is a false
tense, not a false alarm; dating the fact makes every word true and keeps the card on the screen, which is the E-6
comment's own recommendation (re-word as a dated past fact rather than go silent).

**Counterexamples tried.**
1. *The cat still refusing, owner stopped rating.* Under B (expiry) the card would vanish over a cat that is still
   refusing: the "silence must not cancel an alarm" rule (`lib/dietTrialCard.ts:843-850`). **Held under A:** the card
   stays and asks for the one rating that would answer it.
2. *A refusal 10 days ago plus two recent ones below the floor.* The range fact holds the card; the dated sentence
   ("Between 18 and 27 March…") is still true. **Held.**
3. *Is A quieter?* It fires on exactly the records it fires on today; only the tense moves. **Held as neutral**, but
   the tense is softer on the page, which is why the verdict asks for your explicit agree rather than taking it by
   implication.

**Direction:** neutral (no record changes whether it fires). **Verdict: adopt provisionally, with your explicit agree on
the tense.** Required before the cut (CUL-54's own fallback names this as the one true pre-cut gate).

### R3 · CUL-54(b) · a minimum trial-day floor for the now-fact?

**Today.** The now-fact fires on day 2 for a dog rated some, all, some (`lib/dietTrial.ts:2863-2867`, verified in the
registry note at `lib/dietTrialCard.ts:978-990`), because Some scores as not finished (`lib/dietTrial.ts:1981-1995`).

**Recommendation (A).** No floor. **Why:** any floor is quieter, the harness cannot measure it (the trial card is
outside CUL-508's corpus), and the day 2 dog already gets the mildest note on the card ("it's worth a call to your
vet"). The real fix for the some, all, some dog is calibration of what Some means (R15), not a floor.

**Counterexample tried.** *A cat refusing from day 1 of a new trial diet.* A 3 day floor silences her on days 1 and 2,
inside the window the feline note cites; a 7 day floor silences her past it. **Held:** no floor is the only option that
does not create that miss.

**Direction:** neutral (no change). **Verdict: real-vet list** (should a trial refusal card wait for N trial days?).

### R4 · CUL-57 · share versus duration

**Today.** The register keys on a share of rated feedings (`REFUSAL_SHARE = 0.5`, `lib/dietTrial.ts:2023`), and Some,
Picked and Refused all count as not finished (`lib/dietTrial.ts:1981-1995`). The headline states a share
(`lib/dietTrial.ts:3377-3418`), so a cat eating about a third of every bowl for three weeks and a cat that has eaten
nothing since Tuesday read the same sentence, and both get "needs a call today".

**Recommendation (A).** Keep the share register exactly as it is and **add a duration lead line above it** for the
worse case: when the most recent rated feedings in an unbroken run (at least the existing `REFUSAL_MIN_RATED = 3`,
spanning at least the existing 12 hours) were all **Refused or Picked**, the card leads with the run's count and the
date it began:

> The last 4 meals you rated, back to Tuesday 6 PM, were refused or only picked at.

No new number: the run reuses the floors the register already fires on. **Why:** the emergency gets a different, more
specific sentence, and the picker is not made quieter. The run is anchored on **rated** meals and states a count and a
start date, never "nothing eaten for 52 hours", because unrated meals between them are unknown, and a duration claim
over unknown meals would alarm on absence (the CLAUDE.md C-19 rule: a date is free, a duration is guarded).

**Counterexamples tried.**
1. *A cat with a rated Some on Wednesday between refusals.* The run breaks; no lead line; the share register still
   fires. **Held:** Some is food going in.
2. *Ten unrated days inside the run.* The line says "the last 4 meals you rated, back to …"; it makes no claim about
   the unrated days. **Held.**
3. *Option B (soften the picker's "today").* A cat eating about a third of every bowl is also markedly reduced intake,
   the very state the feline note's window is about. **B is quieter with no harness, and the counterexample is the
   wedge patient.** Sent to the real-vet list, not recommended.

**Direction:** louder (a more alarming lead on the worst records; nothing quieter). **Verdict: adopt provisionally.**
Whether a run of 48 hours or more should become "call now" rather than "today" joins the real-vet list and pairs with
Part 2's T10.

### R5 · CUL-59 · the two identity-shaped blind spots

**Today.** (1) A partial match of the trial food keeps the narrow population non-empty, so the fallback never opens
(`lib/dietTrial.ts:1498-1505`). (2) Under the fallback, a substitute the pet eats sits in the share's denominator:
14 of 14 prescribed bowls refused beside 28 tuna meals finished leaves `rangeRefusal` null
(`lib/dietTrial.ts:1511-1522`). Both are pinned as `KNOWN LIMIT` tests in `lib/dietTrial.test.ts`.

**Recommendation (A).** No threshold change. (1) needs no clinical number: it is food recognition (B-529), and R1
narrows it further. (2) is a pet that is eating, so it is a trial viability miss, not a starvation miss, and the
narrow population, which catches trial viability, is immune by construction. **Why:** R4's duration line does not fix
dilution and should not claim to; per food shares under the fallback (B) would fire on a disliked topper with the
feline "call today" note.

**Counterexample tried.** *The tuna cat is losing weight.* Then the weight lane (Part 2, EN-8) and the intake decline
detector are the watchers, not this one. **Held, with the dependency named.**

**Direction:** neutral. **Verdict: agree only.**

### R6 · CUL-60(a) · three rated meals among many unrated ones

**Today.** The floors are 3 rated feedings across 2 days at a 50% share (`lib/dietTrial.ts:2021-2023`), counted over
rated feedings only, whatever the unrated count. The report's flag prints "N of M rated feedings … left unfinished
across D days" (`supabase/functions/generate-report/render.ts:2020-2024`).

**Recommendation (A).** Keep the floors. Add the logged count to the flag, in the report's register:
"3 of 3 rated feedings of z/d left unfinished across 2 days (64 logged in these dates; 61 not rated)." **Why:** raising
the bar is quieter with no harness; the vet's first question is how much of the record this is, and the flag already
argues that "the denominator is not optional" (`render.ts:2011-2012`).

**Counterexample tried.** *A careful owner who rated only the bad meals.* The vet now sees 3 of 64 rated and can weigh
it. **Held.**

**Direction:** neutral (disclosure). **Verdict: adopt provisionally; real-vet list** (is 3 rated enough to lead the
vet's safety band?).

### R7 · CUL-55 · the grazing bowl

**Today.** `stateFor` returns `trial_refusal` before `free_fed` (`lib/dietTrialCard.ts:1257`, `:1260`), and the
refusal register emits two flag lines with no grazing disclosure (`lib/dietTrialCard.ts:1518-1531`), so the note says
"a cat that isn't eating what's put down needs a call today" over a bowl whose intake is unobservable.

**Recommendation (A).** Keep the order: the refusal card stays on top. When a grazing bowl is in force, add one line
and narrow the claim:

> Mochi also grazes from a bowl that's topped up, so these are only the meals you rated, not everything she ate.
> A cat leaving the meals you rate unfinished needs a call today, whatever the trial is doing.

**Why:** B (grazing card above) would hide a real refusal of rated wet meals behind a card that says nothing about
intake; A keeps the escalation and stops the unsupported claim.

**Counterexample tried.** *A cat grazing well from the bowl and refusing a disliked wet topper.* A still fires: an
over-fire, the survivable direction, now with the grazing bowl named so the owner can tell her vet. **Held.**

**Direction:** neutral (no firing change). **Verdict: adopt provisionally.** The issue carries `Gate: design`, so the
build session draws the line in the diet-trial mock round before any code.

### R8 · CUL-56(1) · the line that says how to clear the card

**Today.** The refusal branch returns early (`lib/dietTrialCard.ts:1763`), so `pushTeachLine` (called at `:1948`)
never runs under it. The stand-down needs at least 3 recent ratings (`lib/dietTrialCard.ts:908-913`).

**Recommendation (A).** When fewer than 3 meals are rated in the last 14 days, the refusal card adds:

> Rating the next few meals is how this card can tell that Mochi is eating again.

**Why:** the owner who stopped rating is the one owner who can never be told what would help.

**Counterexample tried.** *Does the line read as "rate meals and the warning goes away"?* The stand-down needs the
same weight of evidence the fire needed (`lib/dietTrialCard.ts:869-877`), so only genuinely finished meals clear it.
**Held.**

**Direction:** louder (adds a line; nothing hidden). **Verdict: adopt provisionally**, drawn in the mock round first.

### R9 · CUL-56(2) · recency on the "rate your meals" line

**Today.** The teach line compares the rated share over the whole trial against 50% (`lib/dietTrialCard.ts:691-692`,
`:2247-2282`), so four diligent weeks keep it silent through four unrated ones.

**Recommendation (A).** Compute the share over the last 14 days too (the ratified `REFUSAL_WINDOW_DAYS`), and show the
line when either window is under half rated. **Why:** reuses a ratified window; only adds a line.

**Counterexample tried.** *An owner who rated every meal for 4 weeks, then nothing for 5 days.* The 14 day share falls
under half on about day 8 of the gap and the line appears. **Held.**

**Direction:** louder. **Verdict: adopt provisionally.**

---

## 1.3 The other Part 1 rows: R10 to R15

### R10 · CUL-179 · chronicity at 5 episodes or 6

**Today.** `minEpisodes: 6` (`supabase/functions/generate-signal/detection.ts:2577`). The calibration note
(`detection.ts:2555-2573`) says 4 fired on about 9.9% of occasional vomiters, 6 on about 1.3%, and names 6 versus 5 as
the open ratification. The required gate asserts a rate under 2%
(`supabase/functions/generate-signal/detection.test.ts:2524-2548`).

**Recommendation (A).** 5, and re-pin the gate on both sides the way the cough floor's gate already is
(`detection.test.ts:2549-2575`): pin the noise rate at the measured value so it cannot drift, and pin the sensitivity
case that 5 buys (a once weekly course of 5 episodes fires). **Why:** a safety lane errs toward firing (CUL-179's own
TL;DR), and E-6 adopts louder floors provisionally.

**Counterexamples tried.**
1. *The noise rate at 5.* Vomit's own rate at 5 was never measured, but the cough sweep runs the identical null (about
   two sporadic events in 56 days) and measured 4 → 9.44%, **5 → 4.13%**, 6 → 1.38% (`detection.test.ts:2559`). So 5
   roughly triples the false card rate on a healthy occasional vomiter, and **fails today's required gate (< 2%)**.
   **Held only with the gate re-pinned**, which the build must do openly (CLAUDE.md: never weaken a check without
   saying so in the PR).
2. *What 5 actually rescues.* Weekly × 5 fires at 5 and is silent at 6. The q2wk × 4 course the issue also names stays
   **silent at 5** (`detection.test.ts:2560`, same null). **Held, narrowed:** 5 rescues one of the two named misses.

**Direction:** louder. **Verdict: adopt provisionally; real-vet list** (is two sporadic vomits in eight weeks the right
model of a healthy pet, and is about 4% an acceptable false card rate for this lane?).

### R11 · CUL-267 · the overrun grace

**Today.** `TRIAL_OVERRUN_GRACE_DAYS = 56` (`lib/dietTrial.ts:327`), raised from 28 after the adversarial pass showed the
report's trial block vanishing on day 71 of a gut trial a vet had asked to run to day 84 (`lib/dietTrial.ts:296-326`).

**Recommendation (A).** Ratify 56. **Why:** it is the smallest value that clears every starting window against its own
clinical ceiling (dog gut 28 → 84; cat gut 42 → 98; skin 56 → 112).

**Counterexample tried.** *An abandoned trial.* It keeps its widget row and detector suppressions up to eight weeks past
target; bounded, and the cost the docstring accepts. **Held.**

**Direction:** neutral. **Verdict: agree only.** Note: CUL-267 was marked Done on 2026-09-17 without this ratification
on record; your agree here is the ratification it was waiting for.

### R12 · CUL-367 · the gut trial's invitations to stop

**Today.** `extensionDays('gi') = 14`, skin and other 28 (`lib/dietTrialCompletion.ts:89-91`); starting windows dog gut
28, cat gut 42, skin 56 (`lib/dietTrialSetup.ts:100-101`). Tapped on time, dog gut meets "This trial is done" at 28,
42, 56, 70 and 84; skin twice (the CUL-367 package, `docs/diet-trial-duration-ratification-2026-09.md` §3). The
mid-trial window sheet the package found unbuilt is now in the tree (`components/profile/TrialWindowPanel.tsx`, reached
from `TrialManageSheet`), so an owner can already set any total.

**Recommendation (A, the package's option b).** One `Keep going` tap on a gut trial below 84 days moves it to 84.
Starting windows unchanged. **Why:** the note beside the button already says gut diets are "often continued for around
three months"; the tap should do what the sentence says. The package's own advice to rule what the number means first
is honoured: A treats 28 as the assessment point (the day 28 card still offers `Stopped early` and `This trial is done`
for a diet that is not working) and 84 as the continuation length.

**Counterexamples tried.**
1. *A dog not responding at day 28.* Its vet switches diet; the owner taps `Stopped early` or `This trial is done`,
   both still on the card. **Held.**
2. *Cat gut.* 42 → 84 is one tap. But cat gut 42 rests on feline skin evidence and canine gut evidence, with no feline
   gut duration source anywhere (package §7). **Not held as evidence:** sent to the real-vet list.
3. *The two runtime sweep.* `guards/trialWindow.test.ts:811` pins a hand copied value so a change reds the build
   (package §1). A cost, not a counterexample.

**Direction:** neutral and protective (fewer invitations to stop early; no warning goes quiet). **Verdict: adopt
provisionally; cat gut 42 days to the real-vet list.** `Keep going` stops being a fixed phrase ("to twelve weeks"),
so the voice pass re-reads it in the build.

### R13 · CUL-311, CUL-757, CUL-758 · `allowed_from` records entry time, not prescription time

One fact behind three issues. `diet_trial_foods.allowed_from` defaults to the day the row is written
(`supabase/migrations/040_diet_trial_lifecycle.sql:162`, `DEFAULT CURRENT_DATE`). At trial creation every row opens on
the trial's start (`lib/dietTrialSetup.ts:436-444`); a mid-trial add opens today (`lib/dietTrialSetup.ts:1294`).
Membership is read day by day (`lib/dietTrial.ts:585-598`). So the app's dates say when it was told, not when the vet
said so, and two opposite errors fall out of it. **One rule settles both: the trial's own diet is never a breach of
itself; anything else the app learned about late is counted, and labelled with why.**

**R13a · CUL-758 and CUL-757 · the prescribed diet before its row.**

*Today.* A feeding of a food whose `primary_diet` row opens later than the feeding falls into the off-diet numerator
(`lib/dietTrial.ts:2698-2702`) shared by the card, `ask` and the report, and into the antigen chart, which bins every
off-diet feeding by protein with no reason split (`supabase/functions/generate-report/report.ts:4660-4680`). The
artifact on CUL-758: a 9 of 10 off-diet tile over a dog that ate the prescribed hydrolysate at every meal; on CUL-757
a "Soy ×7" bar that drops to zero on the day the row opened.

*Recommendation (A, CUL-758's option A applied to both surfaces).* A feeding of a food that is (or later becomes) a
`primary_diet` row of this trial, on a day when **no** `primary_diet` row is in force, is not an off-diet exposure: it
leaves the numerator and the antigen chart and is disclosed as a gap in the record, in the register the report already
owns ("Antigen check paused", `supabase/functions/generate-report/render.ts:2981`). *Why:* on such a day the app is
measuring its own record, not the animal.

*Counterexamples tried.*
1. *A real switch between two hydrolysates.* On the days before the second diet's row opens, the first diet's row is in
   force, so a feeding of the second diet still counts. **Held:** the "no row in force" condition is what separates the
   two cases CUL-758 warns must not be conflated.
2. *A mid-trial add used to bless contraband (§7 D5).* `addTrialFood` cannot write a `primary_diet` row
   (`lib/dietTrialSetup.ts:1264-1268`), so this path cannot be reached through the front door. **Held.**
3. *An owner who removed the only diet and kept feeding it.* After `allowed_until` no row is in force, so those
   feedings leave the count too. **Partly broken:** the report says the antigen check is paused for those days rather
   than counting them. Acceptable only because the paused row is on the page; the build must test that it is.

*Direction:* **quieter** (the off-diet count falls on these records). *Verdict:* **needs your sign-off.** **Harness proof
is missing**: CUL-508's corpus does not score `computeTrialFacts`. The substitute proof the build can produce is a
property test over generated trials showing the change removes only feedings whose food is a `primary_diet` of the
trial on a day with no `primary_diet` row in force, and that every other feeding's classification is identical before
and after. Without your sign-off, today's count stays.

**R13b · CUL-311 · a permitted extra on a back-dated trial.**

*Today.* A permitted treat added at creation opens on the back-dated start (`lib/dietTrialSetup.ts:436-444`), so three
weeks of it before the trial was entered convert from off-diet to permitted (`lib/dietTrial.ts:569-584` documents the
trade and routes it here).

*Recommendation (A).* At creation, a `permitted_*` row opens on the day it was entered, not the back-dated start;
feedings of it in between are counted and carry the reason the report already renders for this case, "Fed before it
was permitted (allowed from …)" (`supabase/functions/generate-report/render.ts:7978`). *Why:* §5.2 rules the count a
floor, never a total, and a floor may only err upward; the reason column stops an honest owner reading as a careless
one (§6.9's false accusation weight).

*Counterexample tried.* *The vet really did permit the treat from day one.* The count rises by those feedings, each
labelled as fed before it was added, not as a breach. **Held.**

*Direction:* louder. *Verdict:* **adopt provisionally.** It changes the write in `lib/dietTrialSetup.ts`, so it is its
own PR.

### R14 · CUL-749 · refusals in trial days the window crops

**Today.** The report's trial facts are scoped to the trial and the report window together (`lib/dietTrial.ts:2556`),
and the safety flag reads those facts (`supabase/functions/generate-report/report.ts:4248-4268`). A cat that refused
the prescribed diet on 42 cropped days gets no flag and no count.

**Recommendation (A, the issue's shape 2).** The `trial_diet_refusal` flag reads the trial's evidence from its start to
the report's end, and its date line names each span ("Dates covered: Apr 21 to Jul 2, from the trial's start, before
this report's window opens on Jun 2"). The trial block's counts stay window scoped, so its "No count below is measured
over the trial as a whole" sentence stays true. **Why:** a refusing patient is exactly what the flag exists for; a
date may reach outside the window when a count in the same block may not (CLAUDE.md C-37).

**Counterexample tried.** *A refusal months ago that has resolved.* The flag fires on a report whose window shows a cat
eating. **Held as an over-fire with its dates on it:** a history is a defensible thing for a report to escalate on
(the same argument `report.ts:4240-4246` makes for B-581).

**Direction:** louder. **Verdict: adopt provisionally.** Rides the `generate-report` deploy (CUL-19).

### R15 · CUL-381 · what the five intake words mean

**Today.** Five chips, no definitions (`components/log/IntakeChipRow.tsx:14-20`). Scores refused 0, picked 1, some 2,
most 3, all 4, with "finished" at Most or All (`lib/analytics.ts:80-87`; the trial lane's copy at
`lib/dietTrial.ts:1981-1995`). Two lines are load-bearing for different lanes: **Some versus Most** decides finished
versus not finished for the refusal lane and the feline intake flag; **Refused versus Picked** decides whether a meal
anchors meal timing (`lib/mealTiming.ts:161`, CUL-1122).

**Recommendation (A).** Tap to reveal, never always on (the issue's Designer constraint):

| Chip | Definition |
|---|---|
| Refused | Didn't eat any. A sniff or a lick counts as refused. |
| Picked | A few bites. |
| Some | More than a few bites, about half or less. |
| Most | More than half, with some left. |
| All | Finished it. |

**Why:** the line that matters for the feline flag is Some versus Most, and "about half" is the plainest line an owner
can judge at a glance.

**Counterexample tried.** *An owner who used to tap Most for a cat that ate 40%.* She now taps Some, and the refusal
lane sees it (louder). *One who used to tap Some for 60%* now taps Most (quieter). **Held as neutral in aggregate but
not measurable**, which is why the half line goes on the real-vet list.

**Direction:** neutral. **Verdict: adopt provisionally as copy; the half line to the real-vet list.**

### nyx-voice read of the proposed words (R2, R4, R7, R8, R15)

* Pet by name, owner as "you"; no exclamation marks; no jargon (no "hepatic lipidosis", no "anorexia"); every line
  names a count, a date or a food (Patterns 1, 2, 4, 5). **Pass.**
* R2's "Nothing rated since shows whether that has changed" is an honest absence statement, not reassurance; it says
  what would answer the question (Pattern 6, 8). **Pass.**
* R4 says "refused or only picked at", reporting the record, never "won't eat" (the volitional frame
  `lib/dietTrial.ts:3441-3446` forbids) and never "picky". **Pass.**
* R8 is an instruction a caring friend would give, not a nag; it appears only while it is true. **Pass.**
* R15 "A sniff or a lick counts as refused" was preferred to "Barely touched it", which blurs Refused and Picked, the
  boundary CUL-381 exists to sharpen. **Pass.**

---

## 1.4 Recorded, and not on this sheet

* **CUL-747** (team ruled 2026-09-23): keep the off-diet count, state its coverage, never print it as a rate below the
  coverage floor. No PM ruling needed.
* **The cold read's three asks on CUL-583's original agenda** (left-censoring disclosure, unlogged medication caveat,
  the delta render) were not in the Part 1 scope the PM set on 2026-10-01 and are not ruled here. Their current state
  was not re-verified this session.

## 1.5 The adversarial pass over Part 1

_Pending: recorded here when the `adversarial-reviewer` pass returns._

## 1.6 The real-vet list from Part 1 (for CUL-1312)

1. **R3:** should a trial refusal card wait a minimum number of trial days before it speaks?
2. **R4:** should a run of refused or picked meals spanning 48 hours or more in a cat move from "call today" to "call
   now"? Should the share-only picker keep "today"?
3. **R6:** are 3 rated feedings enough to put a refusal flag on the vet's safety band?
4. **R10:** is two sporadic vomits in eight weeks the right model of a healthy pet, and is about 4% an acceptable false
   card rate for the chronicity lane?
5. **R12:** cat gut trial length: 42 days, with no feline gut duration source on record.
6. **R15:** is "about half" the right line between Some and Most for an intake flag?

---

# Part 2 · Engines v3

_In progress in this session; written below Part 1 in the same document._
