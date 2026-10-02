# The clinical ruling sheet, October 2026 (CUL-583)

**Date:** 2026-10-01 · **For:** the PM, ruling under E-6 (amended 2026-09-26) ·
**Replaces:** the "batched Dr. Chen sitting" CUL-583 was filed to book ·
**Status:** 🧊 dated artifact. The input to a ruling, not a spec. Each row is superseded by the ruling it gets.
**Read on a phone:** Part 1 is published as an Artifact page, https://claude.ai/artifact/KogqNFeWk8CKTd2juAinQh (source: `docs/clinical-ruling-sheet-part1.html`), where each row can be ruled with a tap and the rulings copied into a CUL-583 comment.

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

## 2.1 The Part 2 ruling table

| # | Gates | The question | A (recommended) | Other options | Direction | Verdict |
|---|---|---|---|---|---|---|
| **N1** | PR-16 (merged) | `EN-9.scored` tolerance | 0 | B: a count noise tolerance like `EN-11.eligible` | Neutral (a test line; stricter) | Agree only |
| **N2** | PR-16, PR-23 | `EN-9.reRaise` / `reRaiseEver` still read "unruled" | Set both to 0.05, the 2026-09-28 ruling | none | Neutral (housekeeping) | Agree only |
| **N3** | PR-16 | The other unruled pass lines | Rule each with its wave (§2.2 lists them); none now | rule all now | Neutral | Agree only |
| **N4** | PR-31 | D4's null phenotypes | Ratify PR-15's 13 null scenarios as the null set; E-4's budget stays open for PR-31 | none | Neutral | Agree, plus real-vet list |
| **W1** | PR-19 | Must a weight level be confirmed before it can raise a card? (PMD-9) | Yes: a clinic reading alone, or two consecutive home readings, **together with W2** | B: D7 as written (any single reading anchors) | Louder than today; **quieter than D7** | **Needs your sign-off**; proof missing until PR-19 feeds weights to the corpus |
| **W2** | PR-19 | Should a drop of 3 × the scale's noise (0.6 kg) raise the row without confirmation? | Yes, but it confirms the two ends only: the row still needs the 5% line | B: as specced (0.6 kg alone raises the row) | Louder than PMD-9 alone; quieter than spec wording for large dogs | Adopt provisionally |
| **W3** | PR-19 | Does the clinic versus home margin scale with body weight for dogs? | No change to the formula; real-vet question | B: scale it | Neutral | Real-vet list |
| **W4** | PR-19 | Soft 5%, firm 10%, 12 month window, the noise band (≤ 5% and ≤ 0.5 lb, only when one end is a single reading) | Adopt as specced | none | Louder than today; same as D7 | Adopt provisionally, plus real-vet list |
| **W5** | PR-19 | Juveniles under 12 months: any confirmed drop clearing the band raises the row; "no gain in four weeks" off | Adopt as specced | B: keep "no gain" on | Louder than today; **quieter than D7's juvenile wording** | **Needs your sign-off** (the measured cost of B is on record) |
| **W6** | PR-19, PR-37 | Planned loss: set from a vet plan only; fires above 2% a week; pre-plan readings never anchor again | Adopt as specced | B: no planned state | **Quieter than D7 while a plan runs** | **Needs your sign-off**, plus real-vet list |
| **W7** | PR-19 | The weight row's rank | Below the burden card, above chronicity | B: above the burden card (the spec's `weight_loss: 2`) | Neutral (ordering) | Agree only |
| **W8** | PR-19 | Species "other" | Same rows as cats and dogs (D7 as ruled) | B: descriptive only (the spec) | A louder than spec; B **quieter than D7** | Adopt provisionally |
| **C1** | PR-23 | Concern words and co-sign sources (critique PMD-10) | **Cannot be ruled: no proposal exists in any spec.** File it before PR-23 | none | n/a | Missing input |
| **C2** | PR-22 (shipped) | "Too soon to read" window | Ratify 42 days as shipped | none | Neutral | Agree, plus real-vet list (per drug) |
| **T1** | PR-26 (built dark) | T23: a normal stool after a recent vomit stops the stool read calling | Adopt as built, behind its flag | B: today's call stands | **Quieter** | **Needs your sign-off**; proof missing until CUL-1439 |
| **T2** | PR-26 | T19: the model's own call, with no field behind it, maps to call today | Ratify | none | Neutral | Agree only |
| **T3** | PR-28 | T3: vomiting plus lethargy, 24 h either side | Call now, 24 h either side, as built; the Noticed door moves to match (CUL-1436) | B: call today | Louder | Adopt provisionally |
| **T4** | PR-28 | T4: three vomits in 24 h in a cat: today or now? | Today, as shipped | B: now | Neutral (no change) | Real-vet list |
| **T5** | PR-28 | T5a: two logs within 4 h stay call today | Yes, as shipped | B: the EN-4 draft's "keep an eye out" | Neutral (no change) | Agree only |
| **T6** | PR-28 | T5c: two logs 10 min apart are one onset; found piles stop being onsets for T5a | Merge logs ≤ 10 min apart; keep counting found piles | B: both as specced · C: neither | **Quieter** (the merge half) | **Needs your sign-off**; proof missing until CUL-1439 |
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
| **I1** | PR-30 | T10: replace today's 24 h feline arm with the Noticed predicate | No. Run both in union (T10c stays) until the harness can show T10 alone is no worse | B: replace | B is **quieter** | Agree (A changes nothing) |
| **I2** | PR-30 | The free-fed check's words | "Have you seen Pixel eat since 6 PM yesterday?" Yes · No, she wouldn't · Haven't seen | B: as drafted | Neutral (wording) | Adopt provisionally |
| **I3** | PR-30 | What "A little" stores | Picked, not Some | B: Some (the spec) | Louder | Adopt provisionally |
| **I4** | PR-30 | CUL-1195's six refused-meal strings | Ratify; add the vet tail to the three card surfaces that lack it; no time window | B: add a window · C: ratify as is | Louder (the tail) | Adopt provisionally |
| **I5** | PR-30 | CUL-1196: refused, then vomited within minutes, as its own flag | Build it as a line on the cat intake card, not a new card; values on the real-vet list | B: a new safety card · C: no | Louder | Adopt provisionally (dark until built), plus real-vet list |
| **E1** | PR-32 | Worsening's sensitivity-first floor | No value proposed anywhere; EN-11 must show detection no worse than the shipped floor | none | Neutral | Agree only |
| **D1** | every lane's GA | Dogs and species "other" (R-4) | Per row above (W8, T7, T8, T9); no blanket rule | none | n/a | Agree only |

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

### W1 · PMD-9, confirmed levels

* **Today:** no card. **Spec:** a clinic reading is a confirmed level on its own; two consecutive home readings confirm
  the level both reached (`:162-164`).
* **Recommendation:** adopt, **only together with W2**. **Why:** D7 as written anchors on any single reading, and the
  critique measured it flagging 87% of stable monthly weighed cats (PMD-9, `docs/engines-v3-critique-2026-09.md:848-856`);
  a lane that fires on most healthy cats will be ignored. PMD-9 brings that to 6% and catches 99% of true losses.
* **Counterexamples tried.** (1) *The Nyx record:* PMD-9 alone is silent forever on 4.4 home then 3.73 clinic.
  **Broken alone, held with W2**, which is why they are one ruling. (2) *A steady 1.5% a week loss on monthly
  weigh-ins* never confirming a peak (spec §12 attack 1): **held**, fixed in the spec by confirming from pairs.
* **Direction:** louder than today; **quieter than D7**. **Verdict: needs your sign-off.** Harness proof is missing:
  `EN-8` is not observed until PR-19 feeds weights to the corpus (`passLines.ts:50-57`), and the critique's figures
  were run on its own wording; the spec says PR-16 re-runs them on the exact definition before PMD-9 is ruled
  (`:178`). So: sign off now for the dark build; the lane does not go live until that re-run is on the record.

### W2 · noise-scaled confirmation

* **Spec:** a difference of at least 3 × 0.2 kg raises the row whether or not either end is confirmed (`:180`).
* **The defect in the wording.** 0.6 kg is 20% of a 3 kg cat and 2% of a 30 kg dog, and the spec does not say whether
  the 5% line still applies. As written, a 30 kg dog dropping 0.6 kg (2%) raises a row the lines say is not one.
* **Recommendation:** a 0.6 kg difference **confirms both ends**; the row still needs the 5% line. **Why:** it keeps
  W2's purpose (catching the Nyx record and a single high reading) without inventing a second, unscaled line.
* **Counterexample tried.** *The Nyx record:* 0.67 kg and 15% clears both. **Held.** *A 3 kg kitten-sized adult cat
  losing 0.4 kg (13%) on single readings:* not caught by W2, caught by W1 once two readings agree. **Held, slower.**
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
  single reading (`:186`; today's descriptive band is `lib/chartCopy.ts:182`, `:228`).
* **Recommendation:** adopt. **Why:** the lines are D7's own; the window is the pre-diagnosis year; the band narrows a
  caveat so it cannot sit over a slow real loss (spec §12 attack 5).
* **Counterexample tried.** *A healthy cat at 4.12 kg in March, 3.90 kg in July on a kitchen scale* (5.3%): under
  W1 it needs two agreeing readings before it can fire. **Held with W1.**
* **Direction:** louder than today, same as D7. **Verdict: adopt provisionally; real-vet list** (5% and 10%).

### W5 · juveniles

* **Spec:** under 12 months by birthday, a confirmed drop clearing the band raises the soft row at any percentage;
  "no gain in four weeks" ships off; unknown birthday reads adult (`:198`).
* **Recommendation:** adopt. **Why:** the brief's "no gain" rule gave a growing kitten a false card in 62% to 98% of
  runs (PMD-9); a rule that fires on most kittens teaches owners to ignore the lane.
* **Counterexample tried.** *A kitten that stops growing because it is sick.* "No gain" off misses it until it loses.
  **Broken, accepted:** the cost of B is measured and the cost of A is not, so this needs your sign-off.
* **Direction:** louder than today; quieter than D7's juvenile wording. **Verdict: needs your sign-off**; real-vet list
  (what growth stall in a kitten should prompt a call?).

### W6 · planned loss

* **Spec:** set from a vet plan only; while it runs the soft line is off and the firm line becomes a rate of 2% of
  body weight a week; pre-plan readings never anchor again (`:199`).
* **Recommendation:** adopt. **Why:** without it a vet directed diet produces a card every week; with it, the case the
  vet cares about (losing too fast, a hepatic lipidosis risk in an overweight cat) still fires.
* **Counterexample tried.** *A plan that ends and the cat keeps losing.* Pre-plan readings never anchor, so the loss is
  measured from the plan's end level. **Held**, by design (spec §12 attack 12).
* **Direction:** quieter than D7 while a plan runs. **Verdict: needs your sign-off; real-vet list** (is 2% a week the
  right rate for a cat?). The plan row is W6 of the EN-8 client work (PR-37), still open.

### W7 · rank

* **Spec:** `weight_loss: 2`, after the photo red flag and intake decline, before chronicity (`:206`). Since written,
  PR-14d put `symptom_burden: 2` in the same order (`supabase/functions/generate-signal/detection.ts:6914-6920`).
* **Recommendation:** weight sits below the burden card and above chronicity. **Why:** four or more vomits this week is
  the more acute ask; a confirmed loss over months is the more serious finding than a course of vomiting alone.
* **Direction:** neutral. **Verdict: agree only.**

### W8 · species "other"

* **Spec:** descriptive only, no row, until this sheet says otherwise (`:200`). D7 as ruled made no species exception.
* **Recommendation (A):** species "other" gets the rows at the same lines. **Why:** E-6 keeps the louder rule where the
  quieter one has no proof, and a 10% loss in a rabbit or a ferret is not less worth a call.
* **Counterexample tried.** *A bearded dragon's seasonal weight swing.* A false row. **Held as an over-fire**, and on
  the real-vet list with the dog items (R-4).
* **Direction:** A louder than the spec, same as D7. **Verdict: adopt provisionally.**

---

## 2.4 Before PR-23 goes live (EN-9 server) and around PR-22

### C1 · concern words and co-sign sources

The critique (PMD-10, `docs/engines-v3-critique-2026-09.md:858`) sends these to this sheet. **No later spec proposes
them** (searched the care state, incident tiers and daily look specs for "co-sign" and "concern word"). There is
nothing to rule. **Recommendation:** the PR-23 session files the proposal as its first step, and it returns here as a
row. **Verdict: missing input.**

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
  complete read shows Bristol 2 to 4, not logged Loose, the vomiting not meeting the repeat rule, and the cat intake
  arm not met (`:97-120`).
* **Recommendation:** adopt as built. **Why:** today's flag puts a false sentence ("Vomiting and loose stool
  together…") on a formed stool.
* **Counterexample tried.** *A cat with one vomit and no food for a day, then a formed stool.* The intake arm keeps the
  call. **Held** (PR-26's adversarial F1 and F2, `:103-114`).
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

* **Today:** T5a counts raw logs. The 30 minute merge and found pile exclusion exist only inside the louder T1/T2 rows
  (`lib/incidentFloor.ts:44`, `:171-182`).
* **Recommendation:** merge logs no more than 10 minutes apart into one onset (a double tap is the record's artefact,
  not the animal's); **keep counting found piles** as onsets for T5a. **Why:** a found pile is a real vomit whose time
  is unknown; dropping it is the absence based quieting the guardrails forbid.
* **Counterexample tried.** *Two real vomits 8 minutes apart.* Merged into one onset: quieter on a real pair. **Broken
  at the margin, accepted:** the burst rule (T1, three in 30 min) still sees a third.
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

* **Today:** `persistenceMinDays: 3` (`supabase/functions/generate-signal/detection.ts:2542`; the floor's
  `FLOOR_PERSISTENCE_DAYS = 3`, `lib/incidentFloor.ts:53`).
* **Recommendation:** keep 3. **Why, measured:** on PR-15's null pets the burden card shows to 21.8% at 3 and **48.2% at
  2** (`docs/sessions/2026-09-29-engines-v3-pr14d-burden-card.md:62`). Declining the louder option is deliberate: a card
  shown to half of healthy pets stops being a safety card.
* **Direction:** neutral. **Verdict: real-vet list.**

### T12 · absolute burden, 4 in 7 days

`burdenMuteMinEpisodes: 4` (`detection.ts:2538`, "provisional, FCEAI severe … CUL-583 ratifies"). **Recommendation:**
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
  what the spec already ships meanwhile. **Verdict: agree** (A changes nothing).

### I2 · the free-fed check's words (nyx-voice read)

Drafted (`docs/nyx-incident-tiers-requirements.md:152`; mock `docs/culprit-incident-tiers-mockups.html:781`): "Did you
see Pixel eat since 6 PM yesterday? … Yes · No, she wouldn't · Didn't see". **Recommendation:** "Have you seen Pixel eat
since 6 PM yesterday?" Yes · No, she wouldn't · Haven't seen. **Why:** "since" needs the perfect tense, and the third
answer should match the question. "Haven't seen" and no answer still store intake not observable, never normal.
**Voice:** pet by name, plain, no exclamation, the honest answer is offered as a fine one (Patterns 1, 5, 8). **Pass.**
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
* **Recommendation:** ratify the six as worded, and add "worth mentioning to your vet" to the three card surfaces that
  end bare (the timing card face, the trial card and the Patterns panel); the terse Home row stays as is because it
  opens the card. No time window. **Why:** a window would drop long gap refusals from the count (quieter); the tail is
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

## 2.8 Before PR-32 (EN-11) and every lane's GA

* **E1 · worsening's sensitivity first floor.** No value is proposed anywhere; the shipped floor is
  `worseningMinEpisodes: 2`, `worseningDenseDayFloor: 4` (`detection.ts:2528-2534`). EN-11 must show detection no worse
  than it on the harness (the one wave the harness observes). **Agree only.**
* **D1 · dogs and species "other" (R-4).** Ruled row by row above (W8, T7, T8, T9); no blanket rule. **Agree only.**

---

## 2.9 The real-vet list from Part 2 (for CUL-1312)

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
