# The clinical ruling sheet, October 2026 (CUL-583)

**Date:** 2026-10-01 · **For:** the PM, ruling under E-6 (amended 2026-09-26) ·
**Replaces:** the "batched Dr. Chen sitting" CUL-583 was filed to book ·
**Status:** 🧊 dated artifact. The input to a ruling, not a spec. Each row is superseded by the ruling it gets.
**Read on a phone:** Part 1 is published as an Artifact page, https://claude.ai/artifact/KogqNFeWk8CKTd2juAinQh (source: `docs/clinical-ruling-sheet-part1.html`), where each row can be ruled with a tap and the rulings copied into a CUL-583 comment. Part 2 likewise, at https://claude.ai/artifact/DQbPKibWVQTB6rAdDvyHmh (source: `docs/clinical-ruling-sheet-part2.html`).

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
| **R1** | **CUL-60(b)** | A cat fed once a day whose trial food the app has never recognised refuses every bowl: should the card stay silent for nine days? | Speak from the meal record as soon as nothing has matched the trial food, from the third rated bowl (day 3), not the tenth; caveat the off-diet count on that card | B: lower the count to 5 · C: no change | Louder | Adopt provisionally | **Yes** |
| **R2** | **CUL-54(a)** | May the trial card say "needs a call today" from refusals that are weeks old? | Only when nothing in the last 14 days was left unfinished, the card speaks in dated past tense ("on 3 days between …") and asks for the next few ratings; any recent unfinished meal keeps today's present tense | B: let the card expire after 14 quiet days · C: no change | Neutral in firing; softer tense on stale evidence only | Adopt provisionally, your explicit agree on the tense | **Yes, the must-have** |
| **R3** | **CUL-54(b)** | Should the refusal card wait a minimum number of trial days before it may speak? | No floor. Keep today's day 2 behaviour | B: a 3 day floor · C: a 7 day floor | Neutral (no change) | Real-vet list | No |
| **R4** | **CUL-57** | A cat picking at every bowl and a cat eating nothing get the same sentence: should the app tell them apart? | Add a lead line when every recent rated trial-diet feeding was refused or only picked at, naming the count and the date it started. Leave the picker's sentence unchanged | B: also soften the picker's "today" · C: no change | Louder | Adopt provisionally (B goes to the real-vet list) | Yes |
| **R5** | **CUL-59** | Two blind spots when the app recognises the trial food only partly, or a substitute waters the refusal down: fix them now? | Two louder fallbacks: fall back to the meal record when no trial-diet feeding was logged in the last 14 days, and under the fallback also test each food on its own | B: no change, wait for food recognition (B-529) | Louder | Adopt provisionally | No |
| **R6** | **CUL-60(a)** | Three rated meals can drive the vet report's refusal flag however many unrated meals surround them: raise the bar? | Keep the bar. Print the logged and unrated counts beside the rated ones on the flag | B: require a rated share · C: no change | Neutral (disclosure only) | Adopt provisionally, plus real-vet list | No |
| **R7** | **CUL-55** | A grazing bowl is topped up all day: may the refusal card still say the cat isn't eating what's put down? | Keep the card where it is; add one line saying Culprit can't see what she takes from the bowl, and narrow the claim to the meals the owner rated | B: put the grazing card above the refusal card | Neutral (no firing change) | Adopt provisionally, mock first | No |
| **R8** | **CUL-56(1)** | Once the refusal card latches, the one line that says how to clear it never shows: add it? | Add one line under the refusal card when too few recent meals are rated for it to stand down | B: no change | Louder (adds a line) | Adopt provisionally, mock first | No |
| **R9** | **CUL-56(2)** | The "rate your meals" line looks at the whole trial, so four diligent weeks buy four silent ones: add recency? | Also test the last 14 days; show the line if either window is under half rated | B: last 14 days only | Louder | Adopt provisionally | No |
| **R10** | **CUL-179** | Should the "ongoing for weeks" vomiting card need 5 episodes instead of 6? | 5, with its noise gate re-pinned on both sides as cough's already is | B: keep 6 | Louder | Adopt provisionally, plus real-vet list | No |
| **R11** | **CUL-267** | Is eight weeks the right grace before an overdue trial stops being treated as running? | Ratify 56 days as it ships | B: 28 · C: 84 | Neutral (no change) | Agree only | No |
| **R12** | **CUL-367** | A gut trial meets "This trial is done" five times before twelve weeks, a skin trial twice: change the numbers? | One `Keep going` tap on a gut trial moves it to 84 days, or 14 days past today if that is later. Keep the starting windows | B: gut extension +28 flat · C: ratify as is · D: split assessment from continuation | Fewer asks (E-6 counts a muted ask as quieter), clinically protective | **Needs your explicit agree**; cat gut 42 days to the real-vet list | No |
| **R13a** | **CUL-758 / 757** | A meal of the trial's own prescribed diet, eaten before the app recorded it as the diet, is counted as an off-diet breach and charted as antigen exposure. Should it be? | No, but only before that food's first trial-diet row opens, never after a row ends. Those meals leave the count and the chart, still block the "clean" claim, and are shown as a gap on the card and the report | B: count it, caption it · C: exclude only when it is the trial's only diet | **Quieter** | **Needs your sign-off.** Harness proof missing; substitute proof named | No (report half rides CUL-19) |
| **R13b** | **CUL-311** | On a back-dated trial, a treat the vet permitted is treated as permitted for weeks before the owner told the app. Should it be? | No. A permitted extra opens on the day it was entered; earlier feedings of it are counted and labelled "fed before it was added" on every surface, the card and Ask included | B: today's behaviour · C: open it at the trial start and say so on the report | Louder | Adopt provisionally | No |
| **R14** | **CUL-749** | The vet report's refusal flag cannot see refusals in trial days the report's window cuts off. Should it? | The flag fires on the window's refusals **or** the whole trial's, never one replacing the other, and prints the two spans' counts separately | B: a one line count in the trial block · C: disclose only (today) | Louder | Adopt provisionally | No (rides CUL-19) |
| **R15** | **CUL-381** | What do Refused, Picked, Some, Most and All mean? | Five plain definitions, tap to reveal, with Some and Most split at "about half" | B: split at "three quarters" | Neutral (input calibration) | Adopt provisionally as copy; the half line to the real-vet list | No |

**Recorded, not for ruling:** CUL-747 was ruled by the team on 2026-09-23 (keep the off-diet count, state its
coverage, never print it as a rate below the coverage floor). It is listed in §1.4 so the record is in one place.

---

## 1.0a Rulings received (PM, 2026-10-01)

* **R2: agree (A), explicit.** The dated past tense, on stale evidence only.
* **R1, R3 to R11, R13b, R14, R15: agree (A)**, the PM deferring to the recommendations.
* **R13a: agree (A), the PM deferring to the recommendation** after asking what a "breach before the trial started"
  means. In plain terms: nothing is breached. The app's record of *which food is the trial diet* can be dated later
  than the trial itself, so meals of the prescribed food in between look to the app like a food that is not on the
  list. A stops calling those meals off-diet and shows them as a gap in the record. The build still owes the property
  test named in the row.
* **R12: E (2026-10-02), the PM deferring to the product team** after asking why the app doesn't just ask the owner
  how long to extend. The answer and option E are below.

**R12, revisited.** The app already asks. *Change the window* (`components/profile/TrialWindowPanel.tsx`, reached from
the trial's Manage door) lets an owner set any total ("How long is this trial now?"), and its spec forbids Culprit
proposing a length (TE-5). The milestone's `Keep going` is deliberately different: it is a one-tap named default,
kept because Jordan's review found that a named default is what stops an owner tapping `This trial is done` at the
milestone (§4.3). So the question is not "ask or don't ask" but **what the milestone shows**:

* **E (recommended): both.** `Keep going` stays one tap and, on a gut trial, goes to twelve weeks (A's size); directly
  under it, a link *Your vet said a different length* opens the existing sheet. The vet's number is one tap away, and
  the protective default stays. Direction: fewer asks, as A.
* **F: ask only.** `Keep going` opens the sheet with no preset (TE-5 forbids one). Every gut owner types or picks a
  number at the moment stopping is easiest. Direction: neutral on asks, but it adds a decision where the one-tap
  default was doing protective work.
* A, B, C and D as in the row below remain on the table.

## 1.1 The most dangerous row first: R1 · CUL-60(b)

**The question.** A cat fed once a day whose trial food the app has never recognised refuses every bowl. Should the card
stay silent for nine days, when the warning's own words cite a 48 to 72 hour window?

**Today, at file:line.**
* The refusal lane measures the trial food alone (`lib/dietTrial.ts:2687`, the narrow population). When the app
  cannot tell which logged food is the trial diet, that population is empty, and the lane falls back to every logged
  meal only once `allowedSetUnavailable` is true (`lib/dietTrial.ts:2769-2770`, `:2860-2861`).
* `allowedSetUnavailable` is true at once when the trial has no `primary_diet` row (`lib/dietTrial.ts:2272`), but when
  a row exists and simply never matched (a bag photographed before the trial food was added, a cold food cache) it waits for
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
4. *The executed case (adversarial pass).* A once-a-day cat whose `primary_diet` row exists and never matches,
   refusing on 1, 2 and 3 July: with the gate split, the now-fact fires on day 3 (3 of 3, meal record). The 1,103
   tests in the trial suites stay green. **Held, strictly louder:** below ten feedings the narrow counters are all
   zero, so no stand-down can be lost.
5. *A bag re-photographed after it had matched once (adversarial pass).* The narrow population is not empty, so R1
   does not reach this cat, and today it stays silent **indefinitely**, not for nine days. **Not fixed by R1**; R5's
   recency fallback is the row that reaches her.
6. *One card, two answers (adversarial pass).* In this state the card also shows "off-diet: 3", and those three are
   the prescribed bowls, beside "Culprit can't match these meals". **Fixed in A:** while the refusal lane speaks from
   the meal record, the off-diet count carries the same can't-match caveat. It is caveated, not hidden; hiding would be
   quieter.

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

**Recommendation (A, revised after the adversarial pass).** No new number. The card switches to a **dated past fact**
only when **no unfinished rated feeding of the population it speaks for lies inside the last 14 days**
(`REFUSAL_WINDOW_DAYS`). Any recent unfinished feeding keeps today's present tense. The past-tense form:

> On 2 days between 3 and 4 March, 3 of the 3 trial-diet feedings you rated were left unfinished. Nothing rated since
> shows whether that has changed.
> If Mochi still isn't eating it, a cat that isn't eating needs a call today, whatever the trial is doing. Rating the
> next few meals tells Culprit.

The evidence is dated as "on N days between A and B", never "between A and B", because the range counts distinct
days, not a span. "Nothing rated since" is said only when no rated feeding follows the last unfinished one; otherwise
the line says what was rated since ("Since then, 1 of 1 rated feeding was finished."). The dog note becomes "If Rex
still isn't eating it, it's worth a call to your vet." **Why:** the defect is a false tense, not a false alarm; dating
the fact makes every word true and keeps the card on the screen, which is the E-6 comment's own recommendation
(re-word as a dated past fact rather than go silent).

**Counterexamples tried.**
1. *The cat still refusing, owner stopped rating.* Under B (expiry) the card would vanish over a cat that is still
   refusing: the "silence must not cancel an alarm" rule (`lib/dietTrialCard.ts:843-850`). **Held under A:** the card
   stays and asks for the ratings that would answer it.
2. *The adversarial pass's cat (executed):* 3 refusals on 1 to 2 July, 22 unrated days, then on 25 July refused at
   08:00, picked at 12:00, all at 18:00. The now-fact is null (one recent day), the range fact holds the card. The
   first draft of this row keyed the past tense on "the now-fact is null" and so rendered "Nothing rated since … if
   Mochi still isn't eating it" over a cat that refused twice that day, with a false "nothing rated since" (an All was
   rated after the last refusal) and "between 1 and 25 July" turning three days into a 25-day span. **Broken, fixed:**
   the gate is now "no unfinished feeding in 14 days", so this cat keeps the present tense.
3. *The first draft's own second counterexample* (a refusal 10 days ago plus two recent ones) was mis-traced: three
   rated across two days 12 hours apart fire the now-fact, so the range fact never held that card. Removed.
4. *"Rating the next meal tells Culprit."* False: re-firing and standing down both need 3 ratings. **Fixed** to "the
   next few meals".

**Direction:** neutral in firing (no record changes whether it fires); softer in tense on stale evidence only.
**Verdict: adopt provisionally, with your explicit agree on the tense.** Required before the cut (CUL-54's own
fallback names this as the one true pre-cut gate).

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

**Recommendation (A).** Keep the share register exactly as it is and **add a lead line above it** for the worse case:
when the most recent rated feedings of the population the card speaks for, in an unbroken run (at least the existing
`REFUSAL_MIN_RATED = 3`, spanning at least the existing 12 hours), were all **Refused or Picked**, the card leads with
the run's count and the date it began. **The noun follows the population** (the B-530 rule the headline already
obeys): "trial-diet feedings" under the narrow population, "meals" under the meal-record fallback. The start is a
weekday and time inside six days, a full date beyond that.

> The last 4 trial-diet feedings you rated, back to Tuesday 6 PM, were refused or only picked at.

No new number: the run reuses the floors the register already fires on. **Why:** the emergency gets a different, more
specific sentence, and the picker is not made quieter. The run is anchored on **rated** feedings and states a count
and a start date, never "nothing eaten for 52 hours", because unrated meals between them are unknown, and a duration
claim over unknown meals would alarm on absence (CLAUDE.md C-19: a date is free, a duration is guarded).

**Counterexamples tried.**
1. *A cat with a rated Some on Wednesday between refusals.* The run breaks; no lead line; the share register still
   fires. **Held:** Some is food going in.
2. *Ten unrated days inside the run.* The line says "the last 4 … you rated"; it makes no claim about the unrated
   days. **Held.**
3. *A cat refusing the trial diet but finishing rated toppers (adversarial pass).* Under the narrow population the
   toppers are not in the run, so "the last 4 meals you rated were refused" was false and alarming, the "a cat eating
   this little" over-claim `trialViabilityNote` forbids (`lib/dietTrial.ts:3433-3437`). **Broken, fixed** by the noun
   rule above.
4. *A cat that eats for 10 days, then refuses.* No card: the share dilutes the run. **Held, with the dependency
   named:** the Signal's single-day feline decline path covers her (`supabase/functions/generate-signal/detection.ts:2508-2519`).
5. *Option B (soften the picker's "today").* A cat eating about a third of every bowl is also markedly reduced
   intake, the very state the feline note's window is about. B is quieter with no harness, and the counterexample is
   the wedge patient. Sent to the real-vet list, not recommended.

**Direction:** louder (a more specific lead on the worst records; nothing quieter). **Verdict: adopt provisionally.**
Whether a run of 48 hours or more should become "call now" rather than "today" joins the real-vet list and pairs with
Part 2's T10.

### R5 · CUL-59 · the two identity-shaped blind spots

**Today.** (1) A partial match of the trial food keeps the narrow population non-empty, so the fallback never opens
(`lib/dietTrial.ts:1498-1505`): the ate-for-seven-days, bag-re-photographed, refused-42-of-42 cat stays silent
indefinitely. (2) Under the fallback, a substitute the pet eats sits in the share's denominator: 14 of 14 prescribed
bowls refused beside 28 tuna meals finished leaves `rangeRefusal` null (`lib/dietTrial.ts:1511-1522`). Both are pinned
as `KNOWN LIMIT` tests in `lib/dietTrial.test.ts`.

**Recommendation (A, revised after the adversarial pass).** Two louder fallbacks, both inside the B-530 rules (one
population per call, chosen on feeding presence, never rating presence):
1. **Recency fallback for blind spot (1):** the refusal lane also falls back to the meal record when **no trial-diet
   feeding at all was logged in the last 14 days**. A bag re-photographed weeks ago no longer silences the cat.
2. **Per-food test for blind spot (2):** under the meal-record fallback, the same floors are also tested over each
   food on its own, and the lane fires if the whole record or any single food clears them.

**Why:** the first draft declined (2) because it "would fire on a disliked topper with the feline call-today note",
and the adversarial pass showed that reason contradicts R1 and R7, which both accept exactly that over-fire. E-6 adopts
louder changes provisionally, so the consistent answer is to adopt. The first draft also claimed R1 narrows blind spot
(1); it does not (R1 only acts where nothing ever matched), and that sentence is withdrawn.

**Counterexamples tried.**
1. *The re-shot bag cat.* Fires once 14 days pass with no matched feeding, and earlier if nothing ever matched (R1).
   **Held**, slower than R1's case.
2. *A cat refusing a disliked topper three times while eating the trial diet (unrecognised).* Fires under (2): an
   over-fire with the "can't match these meals" disclosure already on the card. **Held as an over-fire.**
3. *B-530 round 2's break (a per-window selector misrouting the escalation).* (1) keys on feeding presence and picks
   one population for both facts, so neither round 2 break is reachable. **Held**, and the build runs its own
   adversarial pass on it.

**Direction:** louder. **Verdict: adopt provisionally.**

### R6 · CUL-60(a) · three rated meals among many unrated ones

**Today.** The floors are 3 rated feedings across 2 days at a 50% share (`lib/dietTrial.ts:2021-2023`), counted over
rated feedings only, whatever the unrated count. The report's flag prints "N of M rated feedings … left unfinished
across D days" (`supabase/functions/generate-report/render.ts:2020-2024`).

**Recommendation (A).** Keep the floors. Add the logged count to the flag, over the same population and the same dates
as M (CLAUDE.md C-3), worded so an unrated meal cannot read as eaten: "3 of 3 rated feedings of z/d left unfinished
across 2 days (64 logged in these dates; 61 with no intake recorded)." **Why:** raising the bar is quieter with no
harness; the vet's first question is how much of the record this is, and the flag already argues that "the
denominator is not optional" (`render.ts:2011-2012`).

**Counterexample tried.** *A careful owner who rated only the bad meals.* The vet now sees 3 of 64 rated and can weigh
it. **Held.** The adversarial pass asked for "with no intake recorded" over "not rated", since a bare "not rated"
invites reading those meals as eaten. Taken.

**Direction:** neutral (disclosure). **Verdict: adopt provisionally; real-vet list** (is 3 rated enough to lead the
vet's safety band?).

### R7 · CUL-55 · the grazing bowl

**Today.** `stateFor` returns `trial_refusal` before `free_fed` (`lib/dietTrialCard.ts:1257`, `:1260`), and the
refusal register emits two flag lines with no grazing disclosure (`lib/dietTrialCard.ts:1518-1531`), so the note says
"a cat that isn't eating what's put down needs a call today" over a bowl whose intake is unobservable.

**Recommendation (A).** Keep the order: the refusal card stays on top. When a grazing bowl is in force, add one line
and narrow the claim:

> Mochi also grazes from a bowl that's topped up, so Culprit can't see what she takes from the bowl.
> A cat leaving the meals you rate unfinished needs a call today, whatever the trial is doing.

**Why:** B (grazing card above) would hide a real refusal of rated wet meals behind a card that says nothing about
intake; A keeps the escalation and stops the unsupported claim.

**Counterexamples tried.**
1. *A cat grazing well from the bowl and refusing a disliked wet topper.* A still fires: an over-fire, the survivable
   direction, now with the grazing bowl named so the owner can tell her vet. **Held.**
2. *The first draft's wording* ("these are only the meals you rated, not everything she ate") presumed she ate from
   the bowl: reassurance by absence (adversarial pass). **Broken, fixed** to "Culprit can't see what she takes from
   the bowl".

**Direction:** neutral (no firing change; the claim narrows to what the record shows). **Verdict: adopt
provisionally.** The issue carries `Gate: design`, so the build session draws the line in the diet-trial mock round
before any code.

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

**Recommendation (A).** Compute the share over the last 14 days too (the ratified `REFUSAL_WINDOW_DAYS`), with the same
narrow-then-wide population rule `pushTeachLine` already uses, and show the line when either window is under half
rated. **Why:** reuses a ratified window; only adds a line.

**Counterexample tried.** *An owner who rated every meal for 4 weeks, then nothing.* The 14 day share falls under half
on the eighth day of the gap (at five days it is 9 of 14 rated, so the line rightly stays off). **Held.** The first
draft's arithmetic here was wrong and is corrected (adversarial pass).

**Direction:** louder. **Verdict: adopt provisionally.**

## 1.3 The other Part 1 rows: R10 to R15

### R10 · CUL-179 · chronicity at 5 episodes or 6

**Today.** `minEpisodes: 6` (`supabase/functions/generate-signal/detection.ts:2577`). The calibration note
(`detection.ts:2555-2573`) says 4 fired on about 9.9% of occasional vomiters, 6 on about 1.3%, and names 6 versus 5 as
the open ratification. The required gate asserts a rate under 2%
(`supabase/functions/generate-signal/detection.test.ts:2524-2548`).

**Recommendation (A).** 5, and re-pin the gate on both sides the way the cough floor's gate already is
(`detection.test.ts:2549-2575`): pin the noise rate at the measured value so it cannot drift, and pin the sensitivity
cases 5 buys. **Why:** a safety lane errs toward firing (CUL-179's own TL;DR), and E-6 adopts louder floors
provisionally.

**Counterexamples tried.**
1. *The noise rate at 5, measured on vomit's own null.* The adversarial pass ran fixture 14's generator (20,000
   trials): 4 → 9.44%, **5 → 4.13%**, 6 → 1.38%, identical to the cough sweep's figures (`detection.test.ts:2559`). So 5
   roughly triples the false card rate on a healthy occasional vomiter and **fails today's required gate (< 2%)**.
   **Held only with the gate re-pinned**, which the build must do openly (CLAUDE.md: never weaken a check without
   saying so in the PR).
2. *What 5 rescues.* Weekly × 5 and fortnightly × 5 fire at 5 and are silent at 6. Weekly × 4 and fortnightly × 4
   stay **silent at both**. **Held, narrowed:** 5 rescues the five-episode courses, not the four-episode ones the
   issue also names.
3. *Other tests at 5.* `supabase/functions/generate-signal/standDown.test.ts:347` premises a 5-episode vomit relapse
   that chronicity cannot see under a floor of 6. At 5 the course fires and that guard's vomit half goes vacuous.
   **Held with a second re-pin** (4 in-window episodes). No other loadable chronicity suite changed.

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
mid-trial window sheet the package found unbuilt is now reachable with no flag gate
(`components/profile/TrialWindowPanel.tsx`, via `TrialManageSheet` and `TrialLifecycleSheets` from the profile tab),
so an owner can already set any total.

**Recommendation (A, the package's option b, revised).** One `Keep going` tap on a gut trial sets the target to **84
days, or 14 days past today if that is later**. Starting windows unchanged. **Why:** the note beside the button already
says gut diets are "often continued for around three months"; the tap should do what the sentence says. The package's
advice to rule what the number means first is honoured: A treats 28 as the assessment point (the day 28 card still
offers `Stopped early` and `This trial is done` for a diet that is not working) and 84 as the continuation length.

**Counterexamples tried.**
1. *A dog not responding at day 28.* Its vet switches diet; the owner taps `Stopped early` or `This trial is done`,
   both still on the card. **Held.**
2. *A tap on day 90 of a trial targeted at 70 (adversarial pass).* "Moves it to 84" writes a target already past, and
   the `nextTargetDays` clamp degrades it to 91. **Broken, fixed** by "or 14 days past today if that is later".
3. *Cat gut.* 42 → 84 is one tap. But cat gut 42 rests on feline skin evidence and canine gut evidence, with no feline
   gut duration source anywhere (package §7). **Not held as evidence:** sent to the real-vet list.
4. *An abandoned trial after one tap* now holds its running state, and its explanation-only suppressions, until day
   140 (84 + the 56 day grace). A cost, accepted.
5. *The guard.* The first draft cited `guards/trialWindow.test.ts:811` as a hand-copied pin; it is a comment, and the
   guard derives from `extensionDays` (`:643-646`, `:785`). Corrected; the Deno side's hand-copied value
   (`supabase/functions/generate-report/trial.test.ts:4947`, per the package) still needs the sweep.

**Direction:** fewer asks. The tap removes the day 42, 56 and 70 milestone asks, and E-6 lists "a muted ask" as
quieter, so this is not neutral even though it is clinically protective. **Verdict: needs your explicit agree** (no
harness measures it; the protective direction is the argument). Cat gut 42 days goes to the real-vet list. `Keep going`
stops being a fixed phrase ("to twelve weeks"), so the voice pass re-reads it in the build.

### R13 · CUL-311, CUL-757, CUL-758 · `allowed_from` records entry time, not prescription time

One fact behind three issues. `diet_trial_foods.allowed_from` defaults to the day the row is written
(`supabase/migrations/040_diet_trial_lifecycle.sql:162`, `DEFAULT CURRENT_DATE`). At trial creation every row opens on
the trial's start (`lib/dietTrialSetup.ts:436-444`); a mid-trial add opens today (`lib/dietTrialSetup.ts:1294`).
Membership is read day by day (`lib/dietTrial.ts:585-598`). So the app's dates say when it was told, not when the vet
said so, and two opposite errors fall out of it. **One rule settles both: the trial's own diet is never a breach of
itself before the app knew it was the diet; anything else the app learned about late is counted, and labelled with
why.**

**R13a · CUL-758 and CUL-757 · the prescribed diet before its row.**

*Today.* A feeding of a food whose `primary_diet` row opens later than the feeding falls into the off-diet numerator
(`lib/dietTrial.ts:2698-2702`) shared by the card, `ask` and the report, and into the antigen chart, which bins every
off-diet feeding by protein with no reason split (`supabase/functions/generate-report/report.ts:4660-4680`). The
artifact on CUL-758: a 9 of 10 off-diet tile over a dog that ate the prescribed hydrolysate at every meal; on CUL-757
a "Soy ×7" bar that drops to zero on the day the row opened.

*Recommendation (A, revised after the adversarial pass broke the first draft).* A feeding is excluded from the
off-diet numerator and the antigen chart **only when it is dated before the earliest `allowed_from` of any
`primary_diet` row of that same food in this trial**. Three conditions are part of the rule, not options:
1. **Never after an `allowed_until`.** A food whose trial-diet row the vet ended stays counted when it is fed again.
2. **An excluded feeding still darkens the arm.** It stays in `darkDays` and still blocks `mayClaimAllMatched` and
   `mayStateRecordClean`, so no "clean" or "all matched" claim can rest on it.
3. **The gap is disclosed on the card as well as the report** (the report's "Antigen check paused" register,
   `supabase/functions/generate-report/render.ts:2981`; the card has no paused row today, so it gains one).

*Why:* before the row opened, the app was measuring its own record, not the animal; but a gap in the record is a
reason to withhold the clean claim, never to make it.

*Counterexamples tried.*
1. *A soy hydrolysate row from 1 to 10 July that the vet ended, with the owner feeding it 11 to 20 July (adversarial
   pass, executed).* The first draft ("is or later becomes a primary diet, on a day with no row in force") excluded all
   ten, flipped the arm from dark to clear and unlocked `mayStateRecordClean` with interpretability `supports`: an
   affirmative clean read over ten feedings of the antigen the vet removed. **Broken, fixed** by conditions 1 and 2:
   those feedings are after the food's first row opened, so they stay counted, and nothing excluded can unlock a clean
   claim.
2. *A real switch between two hydrolysates.* The second diet's feedings before its own row opens are before that
   food's first row, so they would be excluded; condition 2 keeps the clean claim withheld for those days and
   condition 3 says why. **Held, and named:** this is the case CUL-758 warns must not be conflated, and the build must
   test that the disclosure reads as a record gap, not as compliance.
3. *A wet row at the start and a dry row added late, both primary.* The dry food's early feedings are before its first
   row, so they are excluded under A. Today they count. Under A they disclose a gap instead. **Held as quieter, named,
   and inside the sign-off.**
4. *A mid-trial add used to bless contraband (§7 D5).* `addTrialFood` cannot write a `primary_diet` row
   (`lib/dietTrialSetup.ts:1264-1268`). **Held.**

*Direction:* **quieter** (the off-diet count falls on these records). *Verdict:* **needs your sign-off.** **Harness proof
is missing**: CUL-508's corpus does not score `computeTrialFacts`. The substitute proof the build can produce is a
property test over generated trials showing (a) the change removes only feedings dated before their food's first
`primary_diet` row, (b) no excluded feeding ever turns `mayStateRecordClean` or `mayClaimAllMatched` true, (c) the
withdrawn-diet record above keeps every feeding counted, and (d) every other feeding's classification is identical
before and after. Without your sign-off, today's count stays.

**R13b · CUL-311 · a permitted extra on a back-dated trial.**

*Today.* A permitted treat added at creation opens on the back-dated start (`lib/dietTrialSetup.ts:436-444`), so three
weeks of it before the trial was entered convert from off-diet to permitted (`lib/dietTrial.ts:569-584` documents the
trade and routes it here).

*Recommendation (A).* At creation, a `permitted_*` row opens on the day it was entered, not the back-dated start;
feedings of it in between are counted and carry the reason "fed before it was added" **on every surface that shows
them**: the report already renders "Fed before it was permitted (allowed from …)"
(`supabase/functions/generate-report/render.ts:7978`), and the same PR carries the reason to the trial card, the
off-diet screen, the day ledger's marks and `ask`. *Why:* §5.2 rules the count a floor, never a total, and a floor may
only err upward; the reason stops an honest owner reading as a careless one (§6.9's false accusation weight).

*Counterexamples tried.*
1. *The vet really did permit the treat from day one.* The count rises by those feedings, each labelled as fed before
   it was added. **Held**, but only with the reason on the owner's surfaces too.
2. *A back-dated trial with a permitted daily chew (adversarial pass).* With the reason on the report alone, the card
   and Ask would show weeks of unexplained off-diet feedings on the day the trial is created: the false accusation the
   row exists to prevent. **Broken, fixed** by carrying the reason to every surface in the same PR.

*Direction:* louder. *Verdict:* **adopt provisionally.** It changes the write in `lib/dietTrialSetup.ts`, so it is its
own PR.

### R14 · CUL-749 · refusals in trial days the window crops

**Today.** The report's trial facts are scoped to the trial and the report window together (`lib/dietTrial.ts:2556`),
and the safety flag reads those facts (`supabase/functions/generate-report/report.ts:4248-4268`). A cat that refused
the prescribed diet on 42 cropped days gets no flag and no count.

**Recommendation (A, revised after the adversarial pass).** The `trial_diet_refusal` flag fires on the **window's**
refusal facts **or** the **whole trial's** (from its start to the report's end), never one replacing the other, and
prints the two spans' counts separately: "7 of 8 rated feedings left unfinished in this report's window (Jun 2 to
Jul 2); a further 42 of 42 before it (Apr 21 to Jun 1)." The trial block's counts stay window scoped, so its "No count
below is measured over the trial as a whole" sentence stays true, and the flag never adds a count across the window
edge. **Why:** a refusing patient is exactly what the flag exists for; a date may reach outside the window and a count
may not, so each count stays inside its own named span (CLAUDE.md C-37).

**Counterexamples tried.**
1. *A cat that ate 40 rated meals from 21 April to 30 May, left 7 of 8 unfinished 5 to 8 June, then went unrated, with
   a 2 June to 2 July window (adversarial pass, executed).* The first draft read the whole trial **instead of** the
   window: 7 of 48 is under the share, the now-fact is empty, and the flag that fires today vanished. Labelled louder,
   it was quieter. **Broken, fixed** by the OR.
2. *The whole-trial read choosing a different population* (an early match makes it narrow where the window read fell
   back to the meal record). Under the OR the window's own fact still fires. **Held.**
3. *A refusal months ago that has resolved.* The flag fires on a report whose window shows a cat eating. **Held as an
   over-fire with its span named:** a history is a defensible thing for a report to escalate on (the argument
   `report.ts:4240-4246` makes for B-581).

**Direction:** louder (fires on every record it fires on today, and on more). **Verdict: adopt provisionally.** Rides
the `generate-report` deploy (CUL-19).

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

**Counterexamples tried.**
1. *An owner who used to tap Most for a cat that ate 40%.* She now taps Some, and the refusal lane sees it (louder).
   *One who used to tap Some for 60%* now taps Most (quieter). **Held as neutral in aggregate but not measurable.**
2. *Definitions arriving mid-record (adversarial pass).* One owner's taps re-calibrate on the day the definitions
   ship, which moves the intake decline detector's relative baseline; an upward shift (Some to Most) during a real
   decline can cancel it, which is quieter for that pet. **Held as a named risk**, added to the real-vet list item and
   to the build's acceptance: the release note for the definitions should be checked against a decline fixture that
   straddles the change.
3. *Conflict with scoring.* None: Most or All stays finished, Picked stays food for meal timing, and R4's Refused or
   Picked run matches analytics' decline half (`PICKED_SCORE`). **Held.**

**Direction:** neutral. **Verdict: adopt provisionally as copy; the half line to the real-vet list.**

### nyx-voice read of the proposed words (R2, R4, R7, R8, R15)

* Pet by name, owner as "you"; no exclamation marks; no jargon (no "hepatic lipidosis", no "anorexia"); every line
  names a count, a date or a food (Patterns 1, 2, 4, 5). **Pass.**
* R2's "Nothing rated since shows whether that has changed" is an honest absence statement, not reassurance; it says
  what would answer the question (Pattern 6, 8). **Pass.**
* R4 says "refused or only picked at", reporting the record, never "won't eat" (the volitional frame
  `lib/dietTrial.ts:3441-3446` forbids) and never "picky". **Pass.**
* R8 is an instruction a caring friend would give, not a nag; it appears only while it is true. **Pass.**
* R7, re-read after the review: "Culprit can't see what she takes from the bowl" states the blind spot without implying
  she ate; the call keeps its "today" (Pattern 6, no reassurance by absence). **Pass.**
* R2, re-read after the review: "On 2 days between 3 and 4 March" names the days and the span separately, and "Rating
  the next few meals tells Culprit" matches what the card actually needs (three ratings). **Pass.**
* R4, re-read after the review: "trial-diet feedings" under the narrow population matches the headline it sits above
  (`trialViabilityHeadline`), so the two lines never use different nouns for one population. **Pass.**
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

An isolated `adversarial-reviewer` ran over every Part 1 row on 2026-10-01, executing its counterexamples in a scratch
copy of the repo (no repo file was edited). **Verdict: FAIL on the first draft**, with three rows breaking in the
dangerous direction. Every break changed the recommendation above; none was argued with.

| Row | What the reviewer tried | Result | What changed |
|---|---|---|---|
| R1 | Unmatched once-a-day cat, refusals 1 to 3 July (executed) | Held, strictly louder | Added: a bag that matched once is not reached (R5 is); the off-diet count is caveated under the meal-record fallback |
| **R2** | A cat refusing twice today while the range fact holds the card (executed) | **Broken:** past tense and a false "nothing rated since" over a cat refusing now; "between 1 and 25 July" a false span | Gate moved to "no unfinished feeding in 14 days"; "on N days between"; "nothing rated since" only when true; "next few meals"; relabelled softer tense on stale evidence |
| R3 | Any louder option | Held: a floor can only be quieter | None |
| R4 | A cat finishing rated toppers while refusing the trial diet | Wording broken: "meals" over-claimed | The noun follows the population; full date past six days |
| R5 | The declined per-food option against R1 and R7 | **Reasoning broken:** the decline contradicted two other rows; "R1 narrows it" was false | Adopted both louder fallbacks provisionally |
| R6 | Wording of the unrated count | Held | "with no intake recorded"; same population and dates as M |
| R7 | "not everything she ate" | Wording broken: reassurance by absence | "Culprit can't see what she takes from the bowl" |
| R8 | The teach line as a way to clear the warning | Held | None |
| R9 | The 4 weeks on, 5 days off arithmetic | Held, arithmetic corrected | The line shows on day 8 of the gap; the narrow-then-wide rule applies |
| R10 | Vomit's own null at 5 (executed, 20,000 trials) | Held: 4.13%, measured | A second fixture to re-pin (`standDown.test.ts:347`) |
| R11 | None found | Held | None |
| R12 | A tap on day 90 of a 70 day target; the guard citation; the label | Wording and label broken | `max(84, today + 14)`; citation corrected; relabelled "fewer asks", explicit agree |
| **R13a** | A withdrawn soy hydrolysate fed ten more days (executed) | **Broken:** the exclusion unlocked an affirmative clean claim over the antigen the vet removed | Exclude only before the food's first row; never after an end; excluded meals keep the clean claim withheld; the gap shows on the card; the proof includes this case |
| R13b | A back-dated trial with a permitted daily chew | Missing piece: the reason lived on the report only | The reason rides to the card, the off-diet screen, the ledger and Ask in the same PR |
| **R14** | A window refusal after 40 eaten days (executed) | **Broken:** reading the whole trial instead of the window diluted 7/8 to 7/48 and dropped a flag that fires today | Window fact OR whole-trial fact; counts printed per span |
| R15 | Scoring conflicts; definitions arriving mid-record | Held; a quieter n=1 path named | Added to the real-vet list and the build's acceptance |

**The reviewer's DoD line, verbatim in substance:** tried a withdrawn soy hydrolysate fed ten more days, and R13a as
first worded erased it and unlocked a clean claim (fixed); tried a window refusal after 40 eaten days, and R14's single
whole-trial read dropped the flag (fixed); tried a cat refusing twice today under a range-fact hold, and R2 rendered a
false past tense (fixed); tried an unmatched once-a-day cat, and R1 fires on day 3, strictly louder (held); re-ran the
vomit chronicity null at 5, 4.13% with one more fixture to re-pin (held).

**Not re-run.** The revised rows were checked against the reviewer's own required changes, not by a second isolated
pass. The build sessions that apply R2, R5, R13a and R14 each owe their own `adversarial-reviewer` pass on the code.

## 1.6 The real-vet list from Part 1 (for CUL-1312)

1. **R3:** should a trial refusal card wait a minimum number of trial days before it speaks?
2. **R4:** should a run of refused or picked meals spanning 48 hours or more in a cat move from "call today" to "call
   now"? Should the share-only picker keep "today"?
3. **R6:** are 3 rated feedings enough to put a refusal flag on the vet's safety band?
4. **R10:** is two sporadic vomits in eight weeks the right model of a healthy pet, and is about 4% an acceptable false
   card rate for the chronicity lane?
5. **R12:** cat gut trial length: 42 days, with no feline gut duration source on record.
6. **R15:** is "about half" the right line between Some and Most for an intake flag, and how should the app handle
   owners whose taps re-calibrate when the definitions arrive mid-record?
7. **R12:** is moving a gut trial's one-tap extension to twelve weeks right for cats as well as dogs?

---


# Part 2 · Engines v3

## 2.0 How Part 2 is organised

Every Engines v3 item posted on CUL-583 since 2026-09-24, in the order of the PR it gates, so each group can be ruled
just before that PR needs it. The run order lives only in the Linear project description ("Engines v3: the
accountable engine", *The plan, PR by PR, in run order*); the repo holds partial copies (weight spec §10, incident
tiers header, care state §13).

**The baseline that changes how "today" reads in Part 2.**
* Most Engines v3 lanes are **not live**. The weight lane is not built at all (`lib/weight.ts:12-16`: "the engine has
  no weight lane"), so every weight row is louder than today; the meaningful comparison is against **D7 as ruled**
  (CUL-1146, 2026-09-26: "5% loss or more is a safety card, 10% or more firm … a comparison against the peak"), which
  the weight spec's own §9 table uses. Where a row is quieter than D7, it is treated as quieter under E-6.
* EN-4's floor merged dark (PR-28, #992, behind `engines_v3_en4`, rows T1, T2, T3, T6, T7, T8 in
  `lib/incidentFloor.ts:17-24`). "Today" for a tier row means the flag-off read, unless the row says otherwise.
* **Harness reach.** PR-16's scorecard observes **EN-11 only** today (`HARNESS_OBSERVES`,
  `supabase/functions/generate-signal/eval/passLines.ts:50-57`). EN-8 waits on weights being fed to the corpus,
  EN-9 on PR-23, EN-3/4/7 on CUL-1439. So for every quieter row below outside EN-11, **the harness proof is
  missing today**, and the row says when it can exist.

**Revised 2026-10-02.** C1 was drafted (as C1a and C1b, CUL-1445), E2 was added (CUL-1489), §2.3 gained the map
between this sheet's W rows and CUL-1390's, and an isolated `adversarial-reviewer` failed the first draft on T1, C1a,
W1/W2, W6, T6 and C1b. Every break was rewritten; the record is §2.9. The phone page is
https://claude.ai/artifact/DQbPKibWVQTB6rAdDvyHmh (source: `docs/clinical-ruling-sheet-part2.html`).

## 2.1 The Part 2 ruling table

| # | Gates | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **N1** | PR-16 (merged) | `EN-9.scored` tolerance | 0 | B: a count noise tolerance like `EN-11.eligible` | Neutral (a test line; stricter) | Agree only |
| **N2** | PR-16, PR-23 | `EN-9.reRaise` / `reRaiseEver` still read "unruled" | Set both to 0.05, the 2026-09-28 ruling | none | Neutral (housekeeping) | Agree only |
| **N3** | PR-16 | The other unruled pass lines | Rule each with its wave (§2.2 lists them); none now | rule all now | Neutral | Agree only |
| **N4** | PR-31 | D4's null phenotypes | Ratify PR-15's 13 null scenarios as the null set; E-4's budget stays open for PR-31 | none | Neutral | Agree, plus real-vet list |
| **W1** | PR-19 | Must a weight level be confirmed before it can raise a card? (PMD-9) | Yes: a clinic reading alone, or two consecutive home readings, **together with W2**, plus one louder fix: a confirmed level 10% or more below a single earlier reading raises the soft row, saying the high was one reading | B: D7 as written (any single reading anchors) | Louder than today; **quieter than D7** | **Needs your sign-off**; proof missing until PR-19 feeds weights to the corpus |
| **W2** | PR-19 | Should a drop of 3 × the scale's noise (0.6 kg) raise the row without confirmation? | Yes, but it confirms the two ends only: the row still needs the 5% line | B: as specced (0.6 kg alone raises the row) | Louder than PMD-9 alone; quieter than spec wording for large dogs | Adopt provisionally |
| **W3** | PR-19 | Does the clinic versus home margin scale with body weight for dogs? | No change to the formula; real-vet question | B: scale it | Neutral | Real-vet list |
| **W4** | PR-19 | Soft 5%, firm 10%, 12 month window, the noise band (≤ 5% and ≤ 0.5 lb, only when one end is a single reading) | Adopt as specced | none | Louder than today; same as D7 | Adopt provisionally, plus real-vet list |
| **W5** | PR-19 | Juveniles under 12 months: any confirmed drop clearing the band raises the row, and a 10% drop is firm; "no gain in four weeks" off; an unknown birthday reads **young** | Adopt, with the two §2.9 fixes (firm at 10%; unknown reads young) | B: keep "no gain" on | Louder than today; **quieter than D7's juvenile wording** | **Needs your sign-off** (both costs on record) |
| **W6** | PR-19, PR-37 | Planned loss: while a plan runs the soft line is off and the firm line becomes 2% a week, plus a cumulative line; the plan lapses at its recheck date; pre-plan readings never anchor again (who may set the plan is CUL-1390 W6, not this row) | Adopt, with the §2.9 fixes (a lapse date and a cumulative line) | B: no planned state | **Quieter than D7 while a plan runs** | **Needs your sign-off**, plus real-vet list |
| **W7** | PR-19 | The weight row's rank | Below the burden card, above chronicity | B: above the burden card (the spec's `weight_loss: 2`) | Neutral (ordering) | Agree only |
| **W8** | PR-19 | Species "other" | Same rows as cats and dogs (D7 as ruled) | B: descriptive only (the spec) | A louder than spec; B **quieter than D7** | A: adopt provisionally · B **needs your sign-off** |
| **C1a** | PR-23 | Co-sign sources: which other sign brings a watched concern back? | Diarrhea (or vomiting) and low energy each on 2 or more days, or the Noticed intake predicate met, each absent in the 28 days before the anchor and dated after the answer; presence only; inside the 5% cap, with the day floor set by PR-16 | B: the spec as written (no co-signs) | Louder than the spec | **Needs your explicit agree** (it spends the 5% cap) |
| **C1b** | CUL-845 / EN-4 (no Wave 3 PR) | Concern words: may a daily-look word lift a vomit or stool escalation? | Yes, escalate only, within 24 h either side: *Off* or *Hunched* to call now (matching T3 and the Noticed door); *Hiding*, *Not herself*, *Trembling*, a film across the eye, and a dog's *Didn't want the walk* to call today; an edit never lowers it; writes no row, moves no count | B: T-5 stands (a look raises nothing) | Louder; **amends your T-5** | **Needs your explicit agree** |
| **C2** | PR-22 (shipped) | "Too soon to read" window | Ratify 42 days as shipped | none | Neutral | Agree, plus real-vet list (per drug) |
| **T1** | PR-26 (built dark) | T23: a normal stool after a recent vomit stops the stool read calling | Adopt only with a fourth condition: the call stays whenever EN-4's floor meets any rung on the vomits beside the stool; until that is built, T23 stays dark | B: today's call stands | **Quieter** | **Needs your sign-off**; proof missing until CUL-1439 |
| **T2** | PR-26 | T19: the model's own call, with no field behind it, maps to call today | Ratify | none | Neutral | Agree only |
| **T3** | PR-28 | T3: vomiting plus lethargy, 24 h either side | Call now, 24 h either side, as built; the Noticed door moves to match (CUL-1436) | B: call today | Louder | Adopt provisionally |
| **T4** | PR-28 | T4: three vomits in 24 h in a cat: today or now? | Today, as shipped | B: now | Neutral (no change) | Real-vet list |
| **T5** | PR-28 | T5a: two logs within 4 h stay call today | Yes, as shipped | B: the EN-4 draft's "keep an eye out" | Neutral (no change) | Agree only |
| **T6** | PR-28 | T5c: two witnessed logs 10 min apart are one onset for T5a; found piles never merge and stay onsets | Merge witnessed logs ≤ 10 min apart for T5a only, never for T4 or the stool check; keep counting found piles | B: both as specced · C: neither | **Quieter** (the merge half) | **Needs your sign-off**; proof missing until CUL-1439 |
| **T7** | PR-28 | T6: a dog's second vomit in 24 h is call today | Yes, as built | none | Louder | Adopt provisionally |
| **T8** | PR-28, PR-30 | T10b: does a "not eating" rung cover dogs? | Yes, paired with a vomit: no food seen in 24 h plus a vomit is call today | B: refusal alone · C: no | Louder | Adopt provisionally, plus real-vet list |
| **T9** | PR-28 | T11: dog bloat | Stays held for capture (GAP-14); the static line stays | none | Neutral | Agree only |
| **T10** | PR-28 | T22: known conditions move a vomit up one rung? | None until conditions are captured (EN-15) | B: one rung up for a named list | Neutral (no change) | Real-vet list |
| **T11** | PR-28 | Persistence rung: 3 days running or 2? | 3, as shipped | B: 2 | Neutral (no change) | Real-vet list |
| **T12** | PR-28 | Absolute burden: 4 or more vomits in 7 days | Ratify, as shipped | none | Neutral | Agree, plus real-vet list |
| **T13** | PR-29 | T13: fresh blood: a streak versus a lot | Any fresh red blood stays call today until a quantity field exists; a lot, once captured, is call now | B: any fresh blood is call now | Neutral now; louder later | Real-vet list |
| **T14** | PR-29 | T14: foreign material | Call today; string, thread or ribbon in a cat is call now; a toy fragment in a bright dog stays call today | B: all call now | Louder (the string half) | Adopt provisionally |
| **T15** | PR-29 | T17: a visible tablet or pill | Call today; call now on a critical drug once the T20 list exists | none | Louder | Adopt provisionally |
| **T16** | PR-29 | T18: plant material in a cat | Ask the lily question; Yes is call now, Not sure is call today with lilies named | B: Not sure is call now | Louder | Adopt provisionally, plus real-vet list |
| **T17** | PR-29 | The critical drug list, new course, comorbidity, unknown age | T21 (a course started in the last 14 days plus vomiting is call today) and T7 (unknown age reads young) adopted; **the drug list is the vet's** | none | Louder | Adopt T21 provisionally; the list goes to the real-vet list |
| **I1** | PR-30 | T10: replace today's 24 h feline arm with the Noticed predicate | No. Run both in union (T10c stays) until the harness can show T10 alone is no worse | B: replace | A **louder** (the union adds T10); B **quieter** | A: adopt provisionally · B **needs your sign-off** |
| **I2** | PR-30 | The free-fed check's words | "Have you seen Pixel eat since 6 PM yesterday?" Yes · No, she wouldn't · Haven't seen (the pronoun follows the pet's recorded sex; unknown reads "they") | B: as drafted | Neutral (wording) | Adopt provisionally |
| **I3** | PR-30 | What "A little" stores | Picked, not Some | B: Some (the spec) | Louder | Adopt provisionally |
| **I4** | PR-30 | CUL-1195's six refused-meal strings | Ratify with two voice edits: the vet tail on the three card surfaces that lack it, and the trial card reworded so its middot cannot split the claim; no time window | B: add a window · C: ratify as is | Louder (the tail) | Adopt provisionally |
| **I5** | PR-30 | CUL-1196: refused, then vomited within minutes, as its own flag | Build it as a line on the cat intake card, not a new card; values on the real-vet list | B: a new safety card · C: no | Louder | Adopt provisionally (dark until built), plus real-vet list |
| **E1** | PR-32 | Worsening's sensitivity-first floor | No value proposed anywhere; EN-11 must show detection no worse than the shipped floor | none | Neutral | Agree only |
| **E2** | EN-11's GA (CUL-1489) | EN-11 cuts chance cards on healthy pets (83% to 28%) and false food culprits (44% to 0), but catches worsening less and later (new diarrhea 60% to 7%; a vomiting doubling caught 85% to 46%, in 22 days instead of 7.5), so it misses E1's bar | Keep the food half (D5 = B); rework worsening before GA, then re-run PR-16's line, the reversed controls measured too | B: ship as built, amending E-6 · C: drop the worsening floor from EN-11 | A neutral (GA waits); **B quieter** | Agree (A); B **needs your sign-off** |
| **D1** | every lane's GA | Dogs and species "other" (R-4) | Per row above (W8, T7, T8, T9); no blanket rule | none | n/a | Agree only |


## 2.0a Rulings received (PM, 2026-10-02)

**"All agree except C1b B, E2 A."** Every Part 2 row is now ruled:

* **C1b: B.** T-5 stands: a look never enters the engine and raises nothing. No look word lifts an escalation; the
  Noticed door's "Subdued and hiding" row stays a threshold that can never be met; CUL-845 keeps the question.
  The C1b real-vet question is moot.
* **⚠ E2: A, re-opened the same evening.** CUL-1489's re-measure (posted 21:18Z, minutes before this ruling, by a
  parallel session; `docs/sessions/2026-10-02-cul-1489-en11-trade-remeasured.md`) found that **A's persistence arm
  cannot fire at these rates** (diarrhea on 3 days running happens to under 1% of cats in 56 days at 1.5 a month), and
  that above chance EN-11 catches the vomit doubling about as well as today (+21 against +23 points; the cost is the
  first ask, a median of 16 days against 5). It replaced A/B/C with **B′** (ship floor 3, amend E-6 to read detection
  above a placebo; recommended there), **A′** (rework the floor relative to each pet's own rate before GA, the nearest
  match to A's intent) and **C**. The card the PM ruled on carried the original A. **E2 is open again until the PM
  picks B′, A′ or C;** CUL-1495, filed for the original A, is on hold. The text below records the ruling as given.
  ⚠ **Ruled B′ on 2026-10-02; see §2.0b.**
  Original: EN-11's GA waits on one detection PR. It gives diarrhea, itch and skin the burden card's persistence arm
  or a dated onset line, restores vomiting's doubling detection (85% shipped against 46% under EN-11), and puts the
  reversed-in-time controls on ① and ⑤ on PR-16's re-run. Then the PR-16 line is re-run against E1's bar. B's E-6
  amendment is not taken.
* **Every other row: agree (A)**, as written after the §2.9 rewrites. That includes the sign-off rows: **C1a**
  (co-signs inside the 5% cap), **W1** (with W2 and the 10%-below-a-single-reading fix), **W5** (firm at 10%,
  unknown birthday reads young), **W6** (a lapse date and a cumulative line), **T1** (the fourth condition; dark until
  built) and **T6** (witnessed logs, T5a only). For W8 and I1, A was taken, so neither B sign-off arises.
* **Not ruled here:** CUL-1390's own product calls W3 to W7 (§2.3's map). Those stay open on CUL-1390.

**What each ruling now lets start.**

| Build | Unblocked by | What it can start | Still gated on |
|---|---|---|---|
| PR-19, the weight lane (CUL-1413) | W1 to W8 | The dark build with the ruled values and fixes | PR-18; going live needs PMD-9 re-run on the exact definition by cadence; PR-37 needs CUL-1390 W3 to W7 |
| CUL-1444, the pass lines | N2 | Now: both lines to 0.05, the 59–75% / 64–81% figure re-measured | Nothing |
| PR-23, the care state server (CUL-1417) | C1a, N1, N2, C2 | Co-signs in the build: diarrhea or vomiting and lethargy on 2+ days, new before the anchor and after the answer; `EN-9.scored` at 0; 42 days | Going live needs corpus null diarrhea, lethargy and refused/picked ratings, then PR-16's combined 5% line; source 3 waits on GAP-28's shared intake module |
| PR-26 and PR-28, Wave 4 | T1 to T12 | T23's fourth condition (dark); the T5a-only witnessed merge; T3, T7 and T8 as louder rows | Wave 4 goes live after CUL-1312 and CUL-1439 |
| PR-29, the photo rows (CUL-1137) | T13 to T17 | String in a cat is call now; tablet call today; the lily question; a new course is call today; unknown age reads young | The critical drug list (the vet's) |
| PR-30, intake evidence (CUL-1136) | I1 to I5 | Both intake checks in union; the free-fed words with the pronoun rule; "A little" stores Picked; the six strings with the voice edits; the refused-then-vomited line, dark | CUL-1118's D2; ships only with EN-8 |
| EN-11's GA (CUL-1489) | E2 | ⚠ Superseded by §2.0b (E2 = B′) | See §2.0b |
| PR-31 | N4 | The null set is ratified | E-4's budget |

## 2.0b E2 ruled: B′ (PM, 2026-10-02)

**"E2 = B′."** The PM picked from the re-measured options on CUL-1489, and this replaces the "E2 A" in §2.0a. The
evidence is CUL-1489's re-measure comment (21:18Z) and `docs/sessions/2026-10-02-cul-1489-en11-trade-remeasured.md`.

**What was ruled.**

* **EN-11 ships its worsening floor at 3, as built in PR-32.** The food half ships too (D5 = B: false food culprits
  44% to 0, at no cost to worsening detection).
* **E-6's detection line is amended.** "Detection no worse than shipped" (E1's bar) now reads **detection above
  chance**: a quieter change's catch rate *minus* the same scenario's placebo (the same pets and draws with the injected
  rise removed), flag on against flag off. It is read beside **any vet ask within 56 days, with its median delay
  stated**. The re-measure showed why the old line could not be met: the shipped rate counts chance cards (62% of the
  vomit-doubling cats are "caught" with no doubling), so any change that removes chance cards failed it by construction.
* **What the ruling accepts, stated plainly:** above chance, EN-11 catches the vomit doubling about as well as today
  (+21 against +23 points; at 30 seeds the noise is about ±13, so this is no visible difference, not a pass). The first
  vet ask on a doubling cat comes later: a median of **16 days against 5**. The diarrhea card itself catches far less
  above chance (+7 against +50 points); in the corpus that never cost the cat a vet ask, because every diarrhea onset
  rides a vomit rise. That last fact is why CUL-1494 is a gate.
* **Not taken:** A′ (a per-pet floor before GA) and C (drop the floor). A′ is held as the contingency below.

**EN-11's GA now waits on four things,** all of them already filed:

| Gate | What it settles |
|---|---|
| CUL-1493 · the placebo arm in PR-16's scorecard | Makes the amended line computable in CI rather than in a scratch probe |
| CUL-1494 · a cat whose diarrhea rises on its own | The one case where the floor could cost an owner the vet ask. **If EN-11 misses the vet ask on its moderate rise, A′ becomes the gate** |
| CUL-1487 · the vet report's dated recent-onset line | Two episodes after a quiet spell still reach the vet, as dates and counts with no trend word (the Dr. Chen lens's condition for silence on Home) |
| CUL-1495 · the GA verdict run, rewritten for B′ | The amended line at the go-live size (1,000 seeds, after CUL-1441 / CUL-1442), and a line of its own for EN-11's two reversed-in-time controls on ① and ⑤ |

**Why the reversed controls stay a gate under B′.** §2.8 found they are quieter and unmeasured, and that holds under every
option, not only A and C: B′ ships them as built. The re-measure did not measure them. So they get their own line on
the amended reading in the GA run (CUL-1495), or come back to the PM as a quieter row.

**Scope of the amendment.** E-6's detection line is one rule, so the amended reading applies to every harness-measured
quieter row from here on, wherever the harness can run a placebo. Rows already signed off in §2.0a (W1, W5, W6, T1, T6)
are not re-opened by it. Surfaces the harness does not score (Part 1's trial card and report rows) are untouched: their
substitute proofs stand as written.

**What changes elsewhere.**

* **CUL-1495** is rewritten from the original A's rework (which the re-measure showed cannot fire at these rates) to
  the B′ GA verdict run in the table above. It builds no detection change unless CUL-1494 triggers A′.
* **CUL-1489** is done.
* **CUL-583**: with E2 ruled, every row in Parts 1 and 2 has a ruling. What remains lives on other issues (CUL-1390's
  own W3 to W7, the real-vet list on CUL-1312, and each build issue).

**Adversarial note.** The ruling rests on 30 seeds, where +21 and +23 cannot be told apart, and on a corpus with no
lone diarrhea rise. Both limits are what CUL-1495 and CUL-1494 exist to close, and EN-11 stays dark until they do.

---

## 2.2 Before PR-16's lines are used (the scorecard, merged as #993)

### N1 · `EN-9.scored` tolerance

* **Question.** How many more cats may the care state leave unscored (never acknowledged, or acknowledged too late)
  with the flag on than with it off?
* **Today.** `value: null`, "a tolerance in pets, unruled (CUL-583), for the same count-noise reason as
  EN-11.eligible" (`passLines.ts:206`, `:221-222`).
* **Recommendation.** 0. **Why:** the PR-16 comment on CUL-583 (2026-09-30) argues a sound EN-9 changes nothing before
  the acknowledgement, and both arms draw every number from streams named by seed, scenario, pet, component and day
  (`_shared/engineCorpus/trajectory/README.md:19`). Whether a cat is acknowledged, and when, is decided before EN-9
  acts, so the two counts should be identical; any difference is EN-9 reaching behaviour it must not touch.
* **Counterexample tried.** The corpus README's exception: "the acknowledgement only happens if the engine asked, so the
  injected truth differs between arms." **Held:** that exception covers detections **after** an acknowledgement; the
  ask that produces the acknowledgement is the pre-EN-9 Signal in both arms. If PR-23 changes the first ask at all (a
  folded card, a moved rank), this line goes red, and that is the line doing its job, not noise.
* **Direction:** neutral (a test line, stricter). **Verdict: agree only.**

### N2 · the re-raise lines say "unruled" after the ruling

* `EN-9.reRaise` and `EN-9.reRaiseEver` hold `null` (`passLines.ts:114-115`, `:184-185`), but the tolerance was ruled
  on 2026-09-28: "at most 5% of stable pets may be asked again within eight weeks"
  (`docs/nyx-care-state-requirements.md:15`, `:48`). **Recommendation:** set both to 0.05 in the PR that next touches
  the file. **Also correct the record:** `passLines.ts:115` says the drafted 1.5× trigger re-raised 59% to 75% of
  stable cats; the critique's BRK-4 (`docs/engines-v3-critique-2026-09.md:225`) says 64% to 81%. One of them is
  stale; the build session re-measures rather than picking. **Verdict: agree only.**

### N3 · the other unruled pass lines

Every line except `EN-9.lapseReassurance` and `EN-3.redFlagTier` (both ruled 0, `passLines.ts:237`, `:293`) is null.
None can be ruled usefully before its wave's harness observes it, so the recommendation is to rule each in the PR
that turns its wave on, from a measured noise band rather than a chosen number:

| Lines | Rule when | Recommended basis |
|---|---|---|
| `EN-8.falseCards`, `EN-8.delay` (`:243-275`) | PR-19, with W1 | PMD-9's measured frontier, re-run on the spec's exact definition |
| `EN-9.doubling`, `doublingDelay`, `silence`, `askAfterAck` (`:119-202`) | PR-23 | Report the frontier the 5% cap buys; no separate floor (care state §4.2 calls ≥80% within 4 weeks infeasible) |
| `EN-3.nullCallRate` (`:298-309`) | CUL-1439 | Report, never gate: a louder row is adopted provisionally, so this is its cost, not its test |
| `EN-11.*` (`:317-573`) | PR-32 | Detection no worse than shipped, within the Monte Carlo band; `EN-11.eligible` and `foodEligible` are retired by CUL-1441 first, so do not rule them |

**Verdict: agree only.**

### N4 · D4's null phenotypes

* **Today.** Thirteen null scenarios, from 0.5 to 3 vomits a month, including a grazer, found piles, a two cat home,
  a dog with garbage raids and species "other" (`_shared/engineCorpus/trajectory/scenarios.null.ts`, header `:1-15`:
  "The rates are a grid, never one assumed value").
* **Recommendation.** Ratify the grid as the null set the chance budget is measured on. E-4's number (the budget
  itself) stays open and gates PR-31. **Why:** a grid that spans the plausible range is the honest null when no base
  rate is known; picking one rate would be a clinical number we do not have.
* **Counterexample tried.** *A healthy cat that vomits hairballs weekly in spring.* About 4 a month, above the grid's
  top. **Held as a gap**, named for the real-vet list: is 3 a month the right ceiling for "healthy"?
* **Direction:** neutral. **Verdict: agree; real-vet list** (are these base rates plausible for healthy cats and dogs?).

---

## 2.3 Before PR-19 goes live (EN-8, the weight lane)

Spec: `docs/nyx-weight-lane-requirements.md` §5 and §9 (`:158-200`, `:271-286`). Not built; behind the Engines v3 flag
when it is. **The case on the record:** 4.4 kg in June, 3.73 kg on 2026-09-16, a 15.2% loss no engine can see
(`:252-260`). Under D7 as written it raises the firm row once June is re-entered; under PMD-9 alone it stays silent
for good unless June was a clinic weight; under PMD-9 plus W2's noise-scaled rule it raises the firm row
(0.67 kg > 0.6 kg).

**Two sets of W numbers (added 2026-10-02).** CUL-1390, the weight lane's product calls
(`docs/nyx-weight-lane-requirements.md` §0), also numbers its questions W1 to W7, and they are different questions:
this sheet's rows are thresholds, CUL-1390's are product calls. Below, CUL-1390's are always written "CUL-1390 W*n*".
CUL-1390 W1 and W2 were ruled on 2026-09-28 and are inputs here, never re-ruled.

| This sheet | CUL-1390 call it touches | That call's state | Who rules what |
|---|---|---|---|
| W1 confirmation | W2 (legacy readings are home scale, so they need two to confirm); W5 (what Home shows on one unconfirmed drop) | W2 ruled 9/28 · W5 open | W1 here rules when a level is confirmed; the Home row for an unconfirmed drop is CUL-1390 W5 |
| W2 noise-scaled | none | | here |
| W3 dog margin | none | | here (real-vet list) |
| W4 lines, window, band | W1 (estimates never anchor); W4 (the percentage on Patterns) | W1 ruled 9/28 · W4 open | W4 here rules the lines; whether Patterns prints a percentage is CUL-1390 W4 |
| W5 juveniles | none | | here |
| W6 planned loss | W6 (who may set a plan) | open | W6 here rules the rate and the anchoring; who may set the state is CUL-1390 W6 |
| W7 rank, W8 species "other" | none | | here |
| none | W3 (the vet report), W7 (a clinic weight on "How did it go?") | open | CUL-1390 only |

### W1 · PMD-9, confirmed levels

* **Today:** no card. **Spec:** a clinic reading is a confirmed level on its own; two consecutive home readings confirm
  the level both reached (`:162-164`).
* **Recommendation (rewritten after §2.9):** adopt, **only together with W2**, and with one louder fix: **a confirmed
  level 10% or more below a single earlier home reading raises the soft row**, which says the higher reading was one
  reading ("down from 4.2 kg, a single reading on Jun 3"). **Why:** D7 as written anchors on any single reading, and on
  a stable 4.0 kg cat with 0.1 kg of scale noise it gives a false card in 87% of years at monthly weighing; PMD-9 brings
  that to 6% (critique PMD-9, `docs/engines-v3-critique-2026-09.md:848-856`, re-simulated in §2.9: 86.6% against
  6.1%). A lane that fires on most healthy cats will be ignored. The fix closes the one case PMD-9 left silent for good.
* **What the 6% depends on (§2.9).** It holds at monthly weighing only. Over the same year PMD-9 gives a false card in
  25% of fortnightly-weighed stable cats and 59% of weekly ones (D7: 99.7% and 100%). Still far below D7, but an owner
  who weighs weekly sees a false card more often than not.
* **Counterexamples tried.**
  1. *The Nyx record (4.4 kg home in June, 3.73 kg at the clinic):* PMD-9 alone is silent for good. **Broken alone,
     held with W2** (0.67 kg clears 0.6 kg by only 0.07 kg) **and with the fix** (15% below a single reading).
  2. *A lone high reading: 4.2 kg once, then 3.73 kg three times,* an 11% loss (§2.9). D7 gives the firm row; PMD-9 plus
     W2 never fires (0.47 kg is under 0.6 kg). **Broken as first drafted; held with the fix** (soft row, stated as one
     reading).
  3. *A steady 1.5% a week loss on monthly weigh-ins* (spec §12 attack 1). Caught at the fourth reading, at the soft
     tier, by which time the true loss is about 17%; D7 is soft at the second reading and firm at the third. **Held,
     two readings late and one tier low** (the first draft said "held" without the cost).
  4. *A 1% a week loss:* caught at a median of week 13 on monthly weighing, near week 8 only on fortnightly (the
     critique's "near week 8" assumed fortnightly). **Held, slower than D7, stated.**
* **Direction:** louder than today; **quieter than D7**. **Verdict: needs your sign-off.** Harness proof is missing:
  `EN-8` is not observed until PR-19 feeds weights to the corpus (`passLines.ts:50-57`), and the spec says PR-16
  re-runs PMD-9 on the exact definition before PMD-9 goes live (`:178`). So: sign off now for the dark build; the lane
  does not go live until that re-run, by cadence, is on the record.

### W2 · noise-scaled confirmation

* **Spec:** a difference of at least 3 × 0.2 kg raises the row whether or not either end is confirmed (`:180`).
* **The defect in the wording.** 0.6 kg is 20% of a 3 kg cat and 2% of a 30 kg dog, and the spec does not say whether
  the 5% line still applies. As written, a 30 kg dog dropping 0.6 kg (2%) raises a row the lines say is not one.
* **Recommendation:** a 0.6 kg difference **confirms both ends**; the row still needs the 5% line. **Why:** it keeps
  W2's purpose (catching the Nyx record and a single high reading) without inventing a second, unscaled line.
* **Counterexamples tried.** *The Nyx record:* 0.67 kg and 15% clears both. **Held.** *A 3 kg cat: 3.0 kg once, then
  2.6 kg twice* (13%, 0.4 kg). The first draft said W1 catches it "once two readings agree"; that was false (§2.9):
  under PMD-9 plus W2 it is **silent while the high end is a single reading**. **Broken as first drafted; held with
  W1's fix** (the confirmed 2.6 kg is 13% below a single reading, so the soft row fires).
* **Direction:** louder than PMD-9 alone; for large dogs, quieter than the spec's literal wording but not than D7.
  **Verdict: adopt provisionally.**

### W3 · the mixed instrument margin for dogs

* **Spec:** a clinic level against a home level must clear the line plus the band (`:166`); the sheet decides whether
  it scales with body weight (`:200`). As written the band is "≤ 5% and ≤ 0.5 lb", so above about 4.5 kg the 0.5 lb
  term binds and every dog gets a fixed margin of about 0.23 kg. It does not scale.
* **Recommendation:** leave the formula; put the question to the vet. **Why:** whether a home scale's error grows with
  the animal (owner holds the dog, subtracts themselves) is an instrument fact we have no source for.
* **Direction:** neutral. **Verdict: real-vet list.**

### W4 · the lines, the window and the noise band

* Soft 5% ("Worth raising with your vet"), firm 10% ("Worth booking a vet visit") as a share of the confirmed high
  (`:143-144`, `:165`); 12 months (`:156`); noise band ≤ 5% and ≤ 0.5 lb, the caveat only when one end rests on a
  single reading (`:186`; today's descriptive band is `lib/chartCopy.ts:218`, `:264`).
* **Recommendation:** adopt. **Why:** the lines are D7's own; the window is the pre-diagnosis year; the band narrows a
  caveat so it cannot sit over a slow real loss (spec §12 attack 5).
* **Counterexample tried.** *A healthy cat at 4.12 kg in March, 3.90 kg in July on a kitchen scale* (5.3%): under
  W1 it needs two agreeing readings before it can fire. **Held with W1.**
* **Direction:** louder than today, same as D7. **Verdict: adopt provisionally; real-vet list** (5% and 10%).

### W5 · juveniles

* **Spec:** under 12 months by birthday, a confirmed drop clearing the band raises the soft row at any percentage;
  "no gain in four weeks" ships off; unknown birthday reads adult (`:198`).
* **Recommendation (rewritten after §2.9):** adopt, with two changes. (1) A juvenile's confirmed drop of 10% or more is
  the **firm** row, as for an adult; "soft at any percentage" must never cap a 15% kitten loss at soft. (2) An
  **unknown birthday reads young**, matching T7's "unknown age reads young" adopted on this sheet (T17); reading adult
  was the quieter choice for a large-breed puppy. **Why:** the brief's "no gain" rule gave a growing kitten a false
  card in 62% to 98% of runs (PMD-9); a rule that fires on most kittens teaches owners to ignore the lane.
* **Counterexamples tried.** (1) *A kitten that stops growing because it is sick.* "No gain" off misses it until it
  loses. **Broken, accepted.** (2) *A kitten weighed weekly, 1.0, 1.1, 1.2, 1.1, 1.05, 1.0, 0.95 kg* (§2.9). It raises
  a row only at the seventh reading, 21% below its peak; D7's juvenile wording raises it at the fourth. **Broken,
  measured:** the band's 5% term means a juvenile under about 4.5 kg is no more sensitive than the adult soft line.
  Both costs are the price of A and are stated, not hidden.
* **Direction:** louder than today; quieter than D7's juvenile wording (three readings later on that kitten).
  **Verdict: needs your sign-off**; real-vet list (what growth stall in a kitten should prompt a call?).

### W6 · planned loss

* **Spec:** while a plan runs the soft line is off and the firm line becomes a rate of 2% of body weight a week;
  pre-plan readings never anchor again (`:199`); the plan ends only "when a later visit's plan says so" (§5.6). Who
  may set the plan (the spec says a vet plan only) is CUL-1390 W6 and is not ruled by this row.
* **Recommendation (rewritten after §2.9):** adopt, with two additions. (1) **A plan lapses** at the recheck date the
  plan names, or 12 weeks after it was set if it names none; after the lapse the ordinary lines apply. (2) **A
  cumulative line runs during the plan:** the firm row also fires when the loss from the plan's start level passes the
  plan's target, or 10% if the plan names no target (placeholder; the real-vet list). **Why:** without a plan state a
  vet directed diet produces a card every week; with it, losing too fast (a hepatic lipidosis risk in an overweight
  cat) still fires, and a plan can no longer outlive the vet's intent.
* **Counterexamples tried.** (1) *A plan that ends and the cat keeps losing.* Pre-plan readings never anchor, so the
  loss is measured from the plan's end level. **Held** (spec §12 attack 12). (2) *A cat on a plan losing 1.5% a week for
  30 weeks, about 36%* (§2.9). As specced it never crosses 2% a week and the soft line is off: **silent indefinitely,
  broken.** Under the rewrite the cumulative line fires at 10% (about week 7) and the plan lapses at week 12. **Held.**
  (3) *A disease loss that starts during a plan:* caught by the cumulative line, not by the rate. **Held, slower than
  D7.**
* **Direction:** quieter than D7 while a plan runs. **Verdict: needs your sign-off; real-vet list** (is 2% a week the
  right rate for a cat, and what cumulative loss should end a plan's quiet?). The plan row is CUL-1390 W6's client
  work (PR-37), still open.

### W7 · rank

* **Spec:** `weight_loss: 2`, after the photo red flag and intake decline, before chronicity (`:206`). Since written,
  PR-14d put `symptom_burden: 2` in the same order (`supabase/functions/generate-signal/detection.ts:7163-7170`).
* **Recommendation:** weight sits below the burden card and above chronicity. **Why:** four or more vomits this week is
  the more acute ask; a confirmed loss over months is the more serious finding than a course of vomiting alone.
* **Direction:** neutral. **Verdict: agree only.**

### W8 · species "other"

* **Spec:** descriptive only, no row, until this sheet says otherwise (`:200`). D7 as ruled made no species exception.
* **Recommendation (A):** species "other" gets the rows at the same lines. **Why:** E-6 keeps the louder rule where the
  quieter one has no proof, and a 10% loss in a rabbit or a ferret is not less worth a call.
* **Counterexample tried.** *A bearded dragon's seasonal weight swing, or a ferret's winter coat and fat.* A false row
  every year. **Held as an over-fire, accepted**, and on the real-vet list with the dog items (R-4).
* **Direction:** A louder than the spec, same as D7; B quieter than D7. **Verdict: A, adopt provisionally; B needs your
  sign-off.**

---

## 2.4 Before PR-23 goes live (EN-9 server) and around PR-22

### C1 · concern words and co-sign sources (CUL-1445)

Drafted 2026-10-02 to fill the gap §2.1 first recorded as "missing input": no spec ever proposed these (CUL-1445;
critique PMD-10 at `docs/engines-v3-critique-2026-09.md:858-866` and R-2 at `:140`, `:551`, `:671`). They are two
different questions that share a sentence in the critique, so they are two rows, and only C1a gates PR-23.

#### C1a · co-sign sources: which other sign brings a watched concern back? (gates PR-23)

* **Question.** While a concern is `with_vet` or `recheck_booked`, which *other* sign appearing in the record brings it
  back? The step-change brief named "a new co-sign (diarrhoea, lethargy, refusal)" as a re-raise
  (`docs/research/2026-09-engines-step-change.md:184`); the critique kept co-signs and asked the EN-9 brief to name
  their sources, read intake through the one predicate with its coverage, and say which object a co-sign raises
  (R-2, GAP-28, GAP-33).
* **Today.** No care state is live; the chronic row asks every evening. **The spec as written** has no co-sign: §4.1's
  only triggers are the rate test, the dense-day arm and the cough/vomit pair (`docs/nyx-care-state-requirements.md:152`).
  The other signs are not silent there (intake decline, a call-tier read and the burden card are never quieted, §3.1; a
  diarrhea concern of its own is born `raised`, §3.2), but the vomiting row keeps saying "With your vet" about a picture
  the vet never saw.
* **Recommendation (A, rewritten after §2.9).** Three co-sign sources, each a record fact, none a look word:
  1. **Diarrhea** (`diarrhea` rows, episodes collapsed as ⑦ collapses them) on **2 or more local days** in the current
     14-day window, for a vomiting concern; **vomiting**, the same way, for a diarrhea concern.
  2. **Low energy** (`lethargy` rows, the + menu leaf) on **2 or more local days** in the current window, for a vomiting
     or diarrhea concern. Never one day: §4.1's "never one bad day" binds a co-sign too, and a one-day trigger over any
     background rate is a timer.
  3. **Not eating:** the **Noticed intake predicate** (`lib/lookEmergencyFacts.ts:40-43`, two of the last three
     qualifying meals refused or picked), the one predicate R-2 and GAP-28 name, read with its coverage, through the
     shared module GAP-28 moves server side. Not detector ② (`detection.ts:4042`), which measures a decline from a
     baseline and so never fires on a cat whose baseline was already poor. Source 3 is not built until that module
     exists.
  * **New** means: **no rows of the sign (for intake, the predicate never met) in the 28 days before the
    acknowledgement's anchor**, never the post-anchor reference §4.2 may fall back to, **and every qualifying row is
    dated after the acknowledgement was written**. The second half stops a re-answer bouncing straight back.
  * **Presence only.** A co-sign raises on presence and its absence says nothing: no row ever prints "no diarrhea" or
    "eating well". Below the intake predicate's coverage floor, source 3 neither fires nor prints as absent.
  * **The object it raises** is the **concern** (`with_vet` or `recheck_booked` to `raised_again`, latched as §4.5),
    with the DF-8 line (words in the voice read below). Where the co-sign arrives inside an open escalation's bout, it
    also attaches to the **escalation** as a new reason class (GAP-33), never to the read.
  * **Inside the 5% cap, not beside it.** The tolerance you ruled on 2026-09-28 caps *false returns* at 5% of stable
    pets within eight weeks, and you declined a 10% cap; a separate budget would have bought one quietly. So co-sign
    returns and rate-test returns share the 5%, PR-16 reports the co-sign share as `EN-9.coSignReRaise`, and the
    day floors in sources 1 and 2 are knobs PR-16 sets from the measured frontier with α and r. **On the corpus's own
    diarrhea background (0.5 to 2 a month), a 2-day floor alone returns 8% to 15% of stable pets within eight weeks**
    (§2.9), so the measured floor will be higher than 2, or the cap will bind the rate test harder.
  * **The harness cannot see this yet.** The corpus generates only vomit, diarrhea and cough, never refuses or picks
    a meal, and gives no null cat diarrhea (`_shared/engineCorpus/trajectory/types.ts:22`, `simulate.ts:542`), so the
    co-sign line reads about 0 by construction. Before PR-23 goes live the corpus gains a null diarrhea background,
    lethargy rows and refused and picked ratings.
  * **Not in v1, named:** increased thirst or urination (Cornell, evidence pack trigger 6,
    `docs/research/2026-09-engines-evidence-pack.md:879`) and a male cat straining have no leaf the engine reads
    (`drinking_more` is a look word, so T-5 keeps it out and C1b leaves it out). Itch, scratch and cough concerns take no
    co-signs in v1 (cough already has the pair trigger).
* **Why.** FCEAI and the owner guidance in the evidence pack (`:860-880`) treat a new sign beside a known chronic one as
  a reason to call; the vet's "come back if it continues" was given about a picture without it.
* **Counterexamples tried.**
  1. *A watched vomiting cat whose diarrhea starts on day 20.* Under the spec as written the vomiting row stays "With
     your vet" while a separate diarrhea row stands raised: two rows disagree about whether the vet has seen this cat.
     Under A the vomiting row comes back on the second diarrhea day. **Held.**
  2. *Jordan logged sparsely before the visit, so §4.2 takes its reference after the anchor, and diarrhea starts on day
     10* (§2.9). As first drafted, "new" read the post-anchor reference, which contains the diarrhea: never a co-sign.
     **Broken; held after the rewrite** (new is judged on the 28 days before the anchor).
  3. *A GI trial answered "the vet started it", diet-change diarrhea, the owner re-answers after each return* (§2.9). As
     first drafted the trial anchor never moved, so each re-answer bounced back on the next run, rebuilding the
     every-evening ask. **Broken; held after the rewrite** (qualifying rows must postdate the answer).
  4. *A stable cat with background diarrhea at 1 a month* (§2.9). At a 2-day floor, 8% to 15% return within eight
     weeks; at a 1-day floor, 14% to 38%. **Broken as a separate budget; held only inside the 5% cap**, which is why
     the floor is PR-16's to set.
  5. *One loose stool after a food change.* Misses any multi-day floor. **Held.**
  6. *A cat not finishing meals, rated on 2 of 14 days.* Below the intake coverage floor, source 3 does not fire and
     prints nothing. **Held as a gap:** the intake lane's own coverage line is the disclosure.
* **Direction:** louder than the spec as written (adds triggers, removes none). **Verdict: needs your explicit agree,**
  because it spends the 5% cap you ruled and makes PR-23's live gate wait on corpus work; under E-6 a louder row would
  otherwise be adopted provisionally.

#### C1b · concern words: may a look word lift an incident's escalation? (gates no Wave 3 PR)

* **Question.** The daily look records words like *Off* and *Hiding*; your T-5 (2026-09-09, R10) says a look never
  enters the engine and raises nothing (`docs/nyx-daily-look-requirements.md:64`). PMD-10 found the cost: the morning
  after a vomit read, Sam taps *Off* and *Hiding*, the signs a vet would ask about, and nothing changes. Its proposal is
  an **escalate-only, same-day concern word** that writes no row and moves no count, from a set this sheet ratifies.
* **Today.** The per-incident floor reads `lethargy` rows only (`supabase/functions/analyze-vomit/index.ts:326-327`;
  EN-4 dark: low energy within 24 h either side is call now, `lib/incidentFloor.ts:49`). The Noticed door's "Subdued and
  hiding" row can never be met (`lib/lookEmergency.ts:127-133`), and after CUL-1436 its "Subdued and vomiting" row reads
  call now. A look raises nothing anywhere.
* **Recommendation (A, rewritten after §2.9).** A look carrying a concern word, whose check-in is within **24 hours
  either side** of a vomit or stool incident (T3's bound), lifts that incident's escalation, escalate only:
  * **To call now:** `subdued` (*Off*) and `hunched` (*Hunched or tucked up*; a dog's *Hunched*). *Off* is the look's
    word for what T3 calls lethargy, and the Noticed door on the same card prints "Subdued and vomiting" as call now; one
    animal on one surface gets one rung (T3's own rule). Hunched with vomiting is the abdominal pain posture.
  * **To at least call today:** `hiding` (*Hiding*; a dog's *Keeping away*), `not_herself` (*Not herself / himself /
    themself*, the chief-complaint chip), `trembling` (with vomiting it points toward a toxin), `third_eyelid` (*A film
    across the eye*, cats), and a dog's `walk_refused` (*Didn't want the walk*).
  * **What it never does:** write a row, or enter a lane, a count, a coverage line, a density or comparison gate,
    Patterns, Ask's counts or the vet report's counts (the report already prints the words in its Noticed section). A
    look without these words, "Nothing new", or no look at all changes nothing and is never read as reassurance.
  * **An edit never lowers it.** Undoing or editing the look after the lift leaves the escalation as it is (never lower
    a stored escalation automatically); the escalation row's line states the edit ("You marked Off for Pixel on
    Sep 22, then removed it."). The cost, a mis-tap holding a call until the escalation's quiet window, is accepted.
  * **Where it attaches:** the escalation (EN-4's object), never the read; the read's own words are not rewritten. The
    escalation row gains "You marked {Off and Hiding} for {Pet} on {Mon d}." beside its unchanged ask. A look saved after
    the read lifts it too (the PMD-10 case is the morning after), so the build owes a re-evaluation on the look's save.
  * **Left out, on purpose:** *Sleeping more*, *Restless*, *Clingy*, *Not coming to say hello*, *Eating grass* and the
    sound and coat words (common in well pets, so they would lift most reads); *Lip-licking* and *Drooling* (nausea
    signs: they say the vomiting is real, which the incident already says); *Drinking more* / *Drinking less* (a real
    sign for a vet, but not a lift on one vomit; the real-vet list).
* **Counterexamples tried.**
  1. *PMD-10's case: a read at keep an eye out, then* Off *and* Hiding *the next morning.* Lifted to call now. **Held.**
  2. *The same cat with* Off *on the look and "Subdued and vomiting" on the Noticed door* (§2.9). As first drafted, the
     look gave call today while the door printed call now: two rungs on one card. **Broken; held after the rewrite**
     (*Off* lifts to call now).
  3. *An old cat whose owner taps* Off *most mornings, then one hairball.* Every hairball read becomes call now: an
     over-fire. **Held as a cost, accepted:** escalate only, no count, and the alternative is the T3 split above.
  4. *A mis-tapped* Off*, removed an hour later* (§2.9: undo was unruled). The call stays and the row says the word was
     removed. **Held, cost accepted.**
  5. *A look with no concern word the morning after a call-today read.* Nothing changes. **Held.**
* **Direction:** louder (today a look raises nothing). **Verdict: needs your explicit agree,** because it amends T-5, a
  ruling of yours; under E-6 a louder change would otherwise be adopted provisionally. CUL-845 owns the question and
  EN-4's escalation object carries the build; no Wave 3 PR waits on it. Real-vet list: should *Drinking less* in a
  vomiting cat lift a call, and is *Off* plus one vomit really call now?

### C2 · "too soon to read"

Ruled 42 days provisionally on 2026-09-29 for the visit and a masking course's tail "until CUL-583 rules per drug"
(`docs/nyx-care-state-requirements.md:224-225`; built in PR-22). **Recommendation:** ratify 42 days; per drug values
go to the real-vet list. **Direction:** neutral. **Verdict: agree; real-vet list.**

---

## 2.5 Before Wave 4 goes live: PR-26 and PR-28 (EN-3, EN-4, EN-7)

Spec: `docs/nyx-incident-tiers-requirements.md` §7 (`:88-130`). Its own rule (`:90`): louder rows adopted
provisionally, quieter rows wait on harness proof, your sign-off and the vet review. **All of Wave 4 goes live only
after CUL-1312.**

### T1 · T23, a normal stool after a vomit (PR-26, built dark)

* **Today:** any vomit in 24 h puts `concurrent_vomiting` on every stool read, with the call
  (`supabase/functions/analyze-stool/index.ts:94`, `:416-418`, copy `:457-458`). **Built dark:** withdrawn only after a
  complete read shows Bristol 2 to 4, not logged Loose, the vomiting not meeting the shipped repeat rule, and the cat
  intake arm not met (`:97-120`, `:636-655`). Nothing in analyze-stool consults EN-4's floor (`lib/incidentFloor.ts`).
* **Recommendation (rewritten after §2.9):** adopt **only with a fourth condition**: the withdrawal never applies when
  EN-4's floor meets **any** rung on the vomits beside the stool (the stool asks the vomits' own questions, C-34). Until
  that check is built and proven, T23 stays dark. **Why:** today's flag puts a false sentence ("Vomiting and loose stool
  together…") on a formed stool, but the stool read is sometimes the only read a vomit ever gets.
* **Counterexamples tried.** (1) *A cat with one vomit and no food for a day, then a formed stool.* The intake arm keeps
  the call. **Held** (PR-26's F1 and F2, `:103-114`). (2) *A dog vomits twice, 10 hours apart, with no photo (T7 calls
  that today), then a photographed formed stool* (§2.9). A photoless vomit gets no read at log time, so the stool read
  is the only call; as built, T23 withdraws it and nothing else calls. The same holds for a kitten under T17's young
  rung and for the three-days-running rung. **Broken as built; held under the fourth condition.**
* **Direction: quieter.** **Verdict: needs your sign-off.** Harness proof missing until CUL-1439 makes EN-7 observable.

### T2 · T19, the model's own call

Maps to call today, words kept, counted separately (`docs/nyx-incident-tiers-requirements.md:116`; `clinical-guardrails`
Pattern 2). **Neutral. Agree only.**

### T3 · T3, vomiting plus lethargy

* **Today:** `concurrent_lethargy` when lethargy is within 24 h before the read time
  (`supabase/functions/analyze-vomit/context.ts:38`, `:104`, `:193`) → worth a call; the Noticed door says call today
  (`lib/lookEmergency.ts:122-124`, `:147-149`). **Built dark:** call now, lethargy within 24 h either side of the vomit
  (`lib/incidentFloor.ts:49`, `:95`, `:185-187`); the read time flag kept, so nothing is quieter.
* **Recommendation:** adopt as built; move the Noticed door to match in CUL-1436. **Why:** the same animal must not get
  call now on one surface and call today on the other.
* **Counterexample tried.** *Lethargy logged 30 h after a vomit on a very late read.* Today's read time window could
  reach it; the floor's 24 h after cannot, but the read time flag still fires the call. **Held** (PR-28's review: "nothing
  is quieter than today under any flag combination").
* **Direction:** louder. **Verdict: adopt provisionally.**

### T4 · T4, three in 24 hours for a cat

* **Today:** `repeated_vomiting` at three in 24 h → call today (`_shared/vomitRepeat.ts:16-17`, `:29`).
* **Recommendation:** keep call today. **Why:** the clustered shapes already reach call now (T1: three in 30 minutes;
  T2: three in 4 h, `lib/incidentFloor.ts:44-48`); three spread over a day is the "today" pattern. Declining the louder
  option is deliberate: "now" sends owners to emergency care on a pattern most vets triage by phone.
* **Direction:** neutral. **Verdict: real-vet list.**

### T5 · T5a, two logs within four hours

Stays call today as shipped (`_shared/vomitRepeat.ts:14-15`, `:28`); the EN-4 draft's "keep an eye out" is quieter with
no proof. **Neutral. Agree only.**

### T6 · T5c, merging logs and found piles

* **Today:** T5a counts raw logs (`_shared/vomitRepeat.ts:14-15`). The 30 minute merge and found pile exclusion exist
  only inside the louder T1/T2 rows (`lib/incidentFloor.ts:44`, `:171-182`); the spec's merge and the code's apply to
  **witnessed** logs only (`docs/nyx-incident-tiers-requirements.md:99`).
* **Recommendation (rewritten after §2.9):** merge **witnessed** logs no more than 10 minutes apart into one onset
  **for T5a only** (a double tap is the record's artefact, not the animal's); found piles never merge and **keep
  counting** as onsets. T4 and the stool's EN-7 check share `meetsVomitRepeatRuleAt` with T5a, so the build splits the
  merge out and those two keep counting raw logs. **Why:** a found pile is a real vomit whose time is unknown; dropping
  it is the absence based quieting the guardrails forbid.
* **Counterexample tried.** *Two real vomits 8 minutes apart, and nothing else* (§2.9). Merged into one onset, they go
  from call today to no call. **Broken, accepted only with your sign-off:** the earlier "the burst rule still sees a
  third" consolation does not apply (there is no third, and T1's burst rule is dark), so this is a plain quieter case
  on a real pair.
* **Direction: quieter** (the merge). **Verdict: needs your sign-off**; harness proof missing until CUL-1439.

### T7 · T6, a dog's second vomit in 24 hours

Built dark as call today (`lib/incidentFloor.ts:50-51`, `:96`, `:195`); matches the Noticed door
(`lib/lookEmergency.ts:152-154`). **Louder. Adopt provisionally.**

### T8 · T10b, a "not eating" rung for dogs

* **Today:** the read's intake arm is cat only (`analyze-vomit/index.ts:322`); the Noticed door gives dogs only
  "Subdued and no food for 24 hours", which needs lethargy too (`lib/lookEmergency.ts:142-144`).
* **Recommendation:** a dog with no food seen in 24 hours plus a vomit is call today. **Why:** vomiting and not eating
  together is the pairing a vet asks about in either species; a refusal alone in a dog stays quiet, since dogs skip
  meals more benignly than cats.
* **Counterexample tried.** *A dog that skipped breakfast after a garbage raid and vomited once.* Call today: an
  over-fire, survivable. **Held.**
* **Direction:** louder. **Verdict: adopt provisionally; real-vet list.**

### T9 · T11, bloat

Held for capture until "nothing came up" can be logged (GAP-14; `lib/incidentFloor.ts:26-27`); the static dog line stays
on the watch-for list. **Neutral. Agree only.**

### T10 · T22, known conditions

No condition list is captured yet (EN-15 is discovery). **Recommendation:** none until conditions are captured.
**Neutral. Real-vet list** (which conditions, if any, should move a vomit up one rung?).

### T11 · the persistence rung, 2 or 3 days

* **Today:** `persistenceMinDays: 3` (`supabase/functions/generate-signal/detection.ts:2591`; the floor's
  `FLOOR_PERSISTENCE_DAYS = 3`, `lib/incidentFloor.ts:53`).
* **Recommendation:** keep 3. **Why, measured:** on PR-15's null pets the burden card shows to 21.8% at 3 and **48.2% at
  2** (`docs/sessions/2026-09-29-engines-v3-pr14d-burden-card.md:62`). Declining the louder option is deliberate: a card
  shown to half of healthy pets stops being a safety card.
* **Direction:** neutral. **Verdict: real-vet list.**

### T12 · absolute burden, 4 in 7 days

`burdenMuteMinEpisodes: 4` (`detection.ts:2587`, "provisional, FCEAI severe … CUL-583 ratifies"). **Recommendation:**
ratify. **Neutral. Agree; real-vet list.**

---

## 2.6 Before PR-29 (EN-6, the photo rows)

None of these is built; no run order row names T13 to T18 explicitly, so the PR-29 attribution is inferred from
`_shared/incident-analysis.ts:349-351`.

* **T13 · fresh blood.** Today `fresh_red` → worth a call (`analyze-vomit/index.ts:256-258`); there is no quantity
  field. **Recommendation:** any fresh red blood stays call today until a quantity field exists; "a lot" or clots,
  once captured, is call now. Declining the table's call now for every streak is deliberate: a streak after hard
  retching is common, and call now without quantity would send most of them to emergency care. **Real-vet list.**
* **T14 · foreign material.** Today `suspected_foreign_material` → worth a call (`:259-261`). **Recommendation:** call
  today; string, thread, tinsel or ribbon in a cat is call now (linear foreign bodies); a toy fragment in a bright dog
  stays call today. **Louder (the string half). Adopt provisionally.**
* **T15 · a visible tablet.** Today only the model's own call. **Recommendation:** call today; call now on a critical
  drug once T20's list exists. **Louder. Adopt provisionally.**
* **T16 · plant material in a cat.** Today folded into foreign material (`:163`). **Recommendation:** ask
  "Could Pixel have chewed a lily, or anything from a bouquet?" Yes · No · Not sure. Yes is call now; Not sure is call
  today with lilies named. **Louder. Adopt provisionally; real-vet list** (should Not sure be call now?).
* **T17 · drugs and age.** T21 (a course started in the last 14 days plus vomiting → call today) and T7 (an unknown age
  reads young, built at `lib/incidentFloor.ts:52`) are adopted provisionally (louder). **The critical drug list (T20)
  is a clinical list and the team will not write it**; it goes to the real-vet list, and T20 and T17's call now half
  stay held until it exists.

---

## 2.7 Before PR-30 (EN-5, intake evidence)

### I1 · T10, the Noticed predicate in the read

* **Today:** the cat intake arm fires on no Most or All meal in 24 h (`analyze-vomit/index.ts:322-324`); the Noticed
  predicate ("two of the last three qualifying meals refused or picked", `lib/lookEmergencyFacts.ts:40-43`) is not in
  the read. The spec makes T10 replace the arm (quieter) and keeps T10c in union until it passes (`:105-106`, `:177`).
* **Recommendation:** run both in union; do not replace. **Why:** replacement is quieter with no proof; the union is
  what the spec already ships meanwhile.
* **Counterexample tried (§2.9).** *A cat with two meals rated Some in 24 hours,* or *one refused breakfast after full
  meals.* Today's arm fires (no Most or All meal); the Noticed predicate does not (it counts refused or picked, two of
  three). So B is quieter on a real record. A adds the Noticed predicate to the read, so it is **louder** than today, not
  "no change" as the first draft said.
* **Direction:** A louder; B quieter. **Verdict: A, adopt provisionally; B needs your sign-off.**

### I2 · the free-fed check's words (nyx-voice read)

Drafted (`docs/nyx-incident-tiers-requirements.md:152`; mock `docs/culprit-incident-tiers-mockups.html:781`): "Did you
see Pixel eat since 6 PM yesterday? … Yes · No, she wouldn't · Didn't see". **Recommendation:** "Have you seen Pixel eat
since 6 PM yesterday?" Yes · No, she wouldn't · Haven't seen. **Why:** "since" needs the perfect tense, and the third
answer should match the question. "Haven't seen" and no answer still store intake not observable, never normal.
**Voice:** pet by name, plain, no exclamation, the honest answer is offered as a fine one (Patterns 1, 5, 8); the
pronoun follows the pet's recorded sex and `unknown` reads "No, they wouldn't". **Pass** (the voice table below).
**Neutral. Adopt provisionally.**

### I3 · "A little"

* **Spec:** "A little" maps to `some`, "to confirm with CUL-583" (`:154`).
* **Recommendation:** map it to `picked`. **Why:** "A little" in answer to "has she eaten a meal?" is a few bites, the
  Picked definition in Part 1's R15; and the Noticed predicate counts refused or picked, so `some` would let a cat that
  ate a few bites escape it.
* **Counterexample tried.** *An owner who means "about half".* Stored as picked: an over-fire on the intake rung,
  survivable. **Held.**
* **Direction:** louder. **Verdict: adopt provisionally.**

### I4 · CUL-1195's refused-meal strings

* **Today (provisional, #990):** the six strings at `supabase/functions/generate-signal/phrasing.ts:430` (clause
  `:417-420`) and `:451`; `lib/signalCopy.ts:1700` and `:1863`; `lib/signalHomeLine.ts:125-126`;
  `lib/patternsTrial.ts:287`. "Followed" is computed with no window of its own (`lib/mealTiming.ts:535-539`, header
  `:54-63`): a refusal anywhere between the last eaten meal and the vomit counts, so up to about 24 hours.
* **Recommendation:** ratify the six, with two voice edits: add "That's worth mentioning to your vet." to the three card
  surfaces that end bare (the timing card face, the trial card and the Patterns panel), and reword the trial card so its
  middot cannot split the claim ("Of those 6 hours or more after eating, these followed a refused meal: K in the trial
  · J before it."). The terse Home row stays as is because it opens the card. No time window. **Why:** a window would drop long gap refusals from the count (quieter); the tail is
  the guard against the hunger reading ("give her a snack") that open point 2 raises.
* **Counterexample tried.** *A refusal 10 hours before a vomit.* Disclosed (PR #990's pass). **Held**, over-inclusive
  toward escalation.
* **Direction:** louder (the tail). **Verdict: adopt provisionally;** whether the clause should distinguish minutes from
  hours goes to the real-vet list with I5.

### I5 · CUL-1196, refused then vomited within minutes

* **Today:** unbuilt; no spec proposes a value. The lane fact exists (`afterRefusal`, `lib/mealTiming.ts:535-539`). The
  critique's counterexample: the alternate night refuser escapes EN-5 and detector ②, "and only CUL-1196 would catch
  her" (`docs/engines-v3-critique-2026-09.md:701`).
* **Recommendation:** build it as a line on the cat intake card (it rides the intake lane, CUL-189), not a new card,
  dark until built. Values are the vet's: the window, the floor and the species go to the real-vet list; the build
  starts from the existing 30 minute rapid band (`lib/mealTiming.ts:242`) and two episodes on two days, and its
  absence says nothing. **Why:** a new safety card for a pattern with no floor on record would crowd Home (Principle 3);
  a line on the card that already owns intake does not.
* **Direction:** louder. **Verdict: adopt provisionally (dark until built); real-vet list.**

---

### nyx-voice read of the proposed words (I2, I4, T16, C1a, C1b), 2026-10-02

Read against the `nyx-voice` skill (Patterns 1 to 8) and `clinical-guardrails` Pattern 6 for anything health-adjacent.
Every string below is the version the rows above now carry.

| Row | The words | Read | Result |
|---|---|---|---|
| I2 | "Have you seen Pixel eat since 6 PM yesterday?" Yes · No, she wouldn't · Haven't seen | Pet by name, plain, no `!`; "Haven't seen" is offered as a fine answer and stores *not observable*, never normal (P1, P5, P6). **One fix:** the pronoun follows the pet's recorded sex, and `unknown` takes "No, they wouldn't" (the look's `notHerselfLabel` precedent, E-15); the app never guesses "she". | Pass with the pronoun rule |
| I4 | The L1 clause and the two-kinds-of-time clause ("…; K of those followed a refused meal, a timing pattern worth mentioning to your vet") | Specific (a count over a named population), no verdict, the vet tail does the honest work against the hunger reading (P2, P6). | Pass |
| I4 | Timing card face and Patterns panel: "K of the N episodes 6h or more after eating followed a refused meal." | Specific; ends bare. **Add** a second sentence, "That's worth mentioning to your vet." (the row's tail), never a fragment. | Pass with the tail |
| I4 | Trial card: "Of those 6h or more after eating, K in the trial · J before it followed a refused meal." | **Fails on reading:** the middot splits the sentence, so "followed a refused meal" reads as true of J only. **Rewrite:** "Of those 6 hours or more after eating, these followed a refused meal: K in the trial · J before it. That's worth mentioning to your vet." A window with none is still omitted, never printed as 0. | Rewritten |
| I4 | Home row: "N of M timed episodes, at least 6 hours after eating; K followed a refused meal" | Terse on purpose (it opens the card that carries the tail); no verdict. | Pass |
| T16 | "Could Pixel have chewed a lily, or anything from a bouquet?" Yes · No · Not sure | Names the plant a vet asks about and where it comes from, without alarm or a toxicology lecture (P5, P6); "Not sure" stays call today with lilies named. | Pass |
| C1a | "Back because {Pet} has also had loose stools on {k} days since {Mon d}." · "Back because {Pet} has also vomited on {k} days since {Mon d}." · "Back because {Pet} has also been logged with lethargy on {k} days since {Mon d}." · "Back because {Pet} has also been refusing or picking at meals since {Mon d}." | The shipped DF-8 cue ("Back because …", `lib/signalCopy.strip.test.ts:547-551`); "loose stools" and "lethargy" are the shipped leaf labels (`constants/eventTypes.ts:94`, `:103`); "refusing or picking at" is the record's own words, never "won't eat" or "picky" (P5; intake is not preference). Each names a count or a date. No line ever states an absence. | Pass |
| C1b | "You marked {Off and Hiding} for {Pet} on {Mon d}." on the escalation row, and after an edit "You marked Off for {Pet} on {Mon d}, then removed it." | The look's chip heads quoted as words, so a head like *Didn't want the walk* still reads ("You marked Didn't want the walk for Rex on Sep 22"); "marked" is what the owner did, never "Pixel was lethargic" (the app knows only the tap, P1, the care state's "you said" rule). The escalation's own ask is unchanged beside it. | Pass |

No proposed string carries an exclamation mark, a jargon term, a reassurance or a calendar claim.

---

## 2.8 Before PR-32 (EN-11) and every lane's GA

* **E1 · worsening's sensitivity first floor.** No value is proposed anywhere; the shipped floor is
  `worseningMinEpisodes: 2`, `worseningDenseDayFloor: 4` (`detection.ts:2580-2584`). EN-11 must show detection no worse
  than it on the harness (the one wave the harness observes). **Agree only.**
* **D1 · dogs and species "other" (R-4).** Ruled row by row above (W8, T7, T8, T9); no blanket rule. **Agree only.**

---

### E2 · EN-11's trade (CUL-1489, from PR-32, #1002)

> ⚠ **Superseded on CUL-1489, 2026-10-02 21:18Z:** a re-measure replaced the A/B/C below with B′ / A′ / C (see §2.0a).
> The row is kept as ruled; E2 is open again.
> ⚠ **Ruled B′, 2026-10-02 (§2.0b).**

* **Question.** EN-11, built dark in PR-32, misses E1's bar. On PR-16's synthetic pets (30 seeds per scenario) it cuts
  chance "worth a word with your vet" cards on healthy pets from 83% to 28%, and false food culprits from 44% to 0, but
  it catches worsening more slowly: a new run of diarrhea 7% of the time instead of 60%, a doubling of vomiting in 22
  days instead of 7. Food culprit naming within 56 days also falls to 0, the expected cost of retiring Early (D5).
* **Today.** The shipped worsening floor is live (`detection.ts:2580-2584`); EN-11 is dark behind its flag.
* **Options (as filed on CUL-1489).**
  * **A · Keep D5 = B for food, and rework worsening before GA (recommended).** Give diarrhea, itch and skin the burden
    card's persistence arm, or a dated onset line, so the floor stops costing onset detection; then re-run PR-16's
    line. *Why:* the food half delivers D5 (false food cards 44% to 0); the worsening loss is mostly diarrhea, which has
    no burden card.
  * **B · Ship as built:** accept the slower detection. This amends E-6's line.
  * **C · Drop the worsening floor from EN-11,** keeping the food half and the reversed control.
* **Consequence.** A adds one detection PR before EN-11's GA. B is an E-6 amendment. C leaves the floor code dark and
  unused.
* **Two facts the filing leaves out (§2.9), added so the ruling sees them.**
  * PR-32's own record shows **a doubling of vomiting caught 85% of the time shipped and 46% under EN-11**
    (`docs/sessions/2026-10-02-engines-v3-pr32-en11.md:46-47`), not only slower. So the worsening loss is not mostly
    diarrhea, as A's "why" says; A's rework must restore vomiting's doubling detection as well, and PR-16's re-run is
    judged on both.
  * **A and C both ship EN-11's reversed-in-time controls on ① and ⑤** (`detection.ts:5407-5427`), which withhold a
    timing card when a meal follows a vomit as often as one precedes it. They are quieter, and their cost to detection
    is not separately measured. Case: a cat that vomits within 30 minutes of eating and is re-fed within 30 minutes of
    vomiting has ⑤ withheld. So under A or C, the reversed controls need their own line on PR-16's re-run before GA,
    or your sign-off as a quieter change.
* **Direction.** A: neutral today (EN-11 stays dark until the rework passes E1). B: **quieter** (slower detection of
  real worsening is a relaxed count under E-6). C: neutral for worsening (the shipped floor stays), the food half as A.
* **Verdict.** A: agree, with the reversed controls measured before GA. B: **needs your sign-off as an E-6
  amendment**, and E-6 asks for harness proof that detection is no worse, which PR-32 measured and B fails. C: agree,
  with the same reversed-control line.

## 2.9 The adversarial pass over Part 2

An isolated `adversarial-reviewer` ran over Part 2 on 2026-10-02, focused on every row marked quieter or needing your
sign-off (W1, W5, W6, W8 option B, T1, T6, I1 option B) and on the three rows drafted that day (C1a, C1b, E2), then
swept every direction label and spot-checked citations. It executed its counterexamples in a scratch copy (a weight
simulation over §5.3's definition and a co-sign simulation over the corpus's background rates); no repo file was
edited. **Verdict: FAIL on the first draft.** Every break changed the row above; none was argued with.

| Row | What the reviewer tried | Result | What changed |
|---|---|---|---|
| **T1** | A photoless dog with two vomits 10 h apart, then a photographed formed stool | **Broken:** T23 withdraws the only call the vomits ever get; it checked the cat intake arm only | The call stays whenever EN-4's floor meets any rung on the vomits beside the stool; T23 stays dark until built |
| **C1a** | A post-anchor reference; a GI trial re-answered; the corpus's own diarrhea background | **Broken four ways:** "new" read a reference that contained the sign; re-answers bounced back; a separate budget re-raised 8% to 15% at a 2-day floor (14% to 38% at 1 day), quietly buying the 10% cap you declined; the harness cannot see lethargy or refusals | New judged on the 28 days before the anchor and rows dated after the answer; low energy needs 2 days; intake reads the Noticed predicate; co-signs inside the 5% cap with PR-16 setting the floor; corpus work before PR-23 goes live; verdict now your explicit agree |
| W1 / W2 | Re-ran PMD-9 on §5.3's definition by cadence; a lone high reading; W2's own example | Labels held; **two claims broken:** 6% holds at monthly only (25% fortnightly, 59% weekly; D7 99.7% and 100%); a single 4.2 kg then three 3.73 kg readings (11%) is silent for good, as is W2's own 3.0 then 2.6 kg | Added the louder fix (a confirmed level 10% or more below a single reading raises the soft row); costs stated (two readings late and one tier low on a 1.5% a week loss; week 13 at 1% a week monthly) |
| **W6** | A plan that runs 30 weeks at 1.5% a week (about 36%) | **Broken:** silent indefinitely | A plan lapses at its recheck date (or 12 weeks); a cumulative line runs during it (the plan's target, else 10%) |
| W5 | A kitten weighed weekly that peaks then slides | Label held, cost understated: fires at the seventh reading (21% down) against D7's fourth; "soft at any percentage" could cap a 15% loss; unknown birthday read adult against T7's young | Firm at 10%; unknown birthday reads young; costs written in |
| T6 | Two real vomits 8 minutes apart | Label held, **consolation broken:** they go from call today to no call; the burst rule has no third to see and is dark | Witnessed logs only; T5a only (T4 and the stool check keep raw counts); found piles never merge; the cost stated |
| **C1b** | *Off* plus a vomit beside the Noticed door; words left out; an undo | **Broken:** call today beside the door's call now on one card; three words left out with no reason; undo unruled | *Off* and *Hunched* lift to call now; *Not herself*, *Trembling* and *A film across the eye* added at call today; an edit never lowers the lift and the row says so |
| E2 | PR-32's session record; the reversed controls | Labels held; **carriage incomplete:** vomiting doubling caught falls 85% to 46%; A and C ship two quieter, unmeasured reversed controls | Both facts added; the reversed controls are measured before GA under A or C |
| I1 | Two meals rated Some in 24 h; one refused breakfast after full meals | **Label broken:** A adds T10, so it is louder, not "no change"; B quieter confirmed | A adopted provisionally; B needs your sign-off |
| W8 | A ferret's seasonal swing | Held; B's verdict cell lacked the sign-off | B marked "needs your sign-off"; the over-fire stated |
| §2.3 map | Every sheet row against CUL-1390's W1 to W7 | Held: no double ruling | None |
| Citations | Ten or more spot-checked | Five stale after PR-32 (`detection.ts` worsening, burden, persistence and rank lines; `lib/chartCopy.ts`'s band) | Corrected |

**The reviewer's DoD line, verbatim in substance:** tried a photoless dog's two vomits plus a formed stool, and T23
withdrew the only call (fixed); tried a post-anchor reference and a GI-trial re-answer, and C1a's "new" rule swallowed
the sign or looped (fixed); tried a co-sign on the corpus's own background rates, 8% to 38% returns with the harness
blind (moved inside the cap, corpus work named); re-ran PMD-9, 87% against 6% reproduces at monthly only and a lone-high
11% loss was silent for good (fixed, costs stated); tried a plan with no end, silent at 36% (fixed); tried a two-vomit
8-minute pair, silenced with an irrelevant consolation (restated as a plain quieter cost); tried the §2.3 mapping (held).

**Not re-run.** The revised rows were checked against the reviewer's own required changes, not by a second isolated
pass. The build sessions for PR-19 (W1, W5, W6), PR-23 (C1a), PR-26 (T1), PR-28 (T6) and EN-11's GA (E2) each owe their
own `adversarial-reviewer` pass on the code.

## 2.10 The real-vet list from Part 2 (for CUL-1312)

1. **N4:** are 0.5 to 3 vomits a month plausible base rates for healthy cats and dogs, and is 3 the right ceiling?
2. **W3:** does a home scale's error grow with a dog's size?
3. **W4:** 5% soft and 10% firm weight loss lines.
4. **W5:** what growth stall in a kitten should prompt a call?
5. **W6:** is 2% a week the right planned loss rate for a cat?
6. **W8 / D1:** weight lines for species "other".
7. **C2:** "too soon to read" windows per drug.
8. **T4:** three vomits in 24 hours in a cat: today or now?
9. **T8:** a dog with no food in 24 hours plus a vomit: call today?
10. **T10:** which known conditions, if any, move a vomit up one rung?
11. **T11:** persistence at 2 or 3 days running.
12. **T12:** 4 vomits in 7 days as the burden line.
13. **T13:** fresh blood: when is it call now?
14. **T16:** a cat with plant material and an owner who is not sure about lilies: call now?
15. **T17:** the critical drug list.
16. **I4 / I5:** refused then vomited: the window, the floor, the species, and whether minutes versus hours should be
    said.
17. **W1:** is "10% below a single earlier reading" the right line for raising a soft row on one high reading?
18. **W6:** what cumulative loss should end a planned-loss quiet when the plan names no target (placeholder 10%)?
19. **C1a:** which new signs beside chronic vomiting or diarrhea should bring a watched concern back, and on how many days?
20. ~~**C1b:** is *Off* plus one vomit call now?~~ Moot: C1b ruled B (T-5 stands).
