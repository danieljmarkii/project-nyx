# Medication revamp round 4: the full design critique, persona sign off and team readout

**Date:** 2026-10-13 · 🧊 Frozen point in time review. Do not version bump; correct additively in a dated section at the foot. · **Issue:** CUL-1903 · **Target:** round 4 of `docs/culprit-medication-revamp-mockups.html` (merged in #1137, `a630b35`), published at https://claude.ai/artifact/4wb5JyHeiH8RXvbUBFqJ35 · **Feeds:** the PM's rulings on CUL-1902, then the medication requirements and the build project (D1).

> **What this is.** The house critique (`.claude/commands/design-critique.md`) at full depth, run on round 4 at the PM's request (2026-10-12: a hard review of where the project is, stress testing the ideal use case, the user and vet personas' agreement with the direction, and the product team with its consultants going over where things stand). On Oct 10 the team had agreed the full depth critique runs on the round before the requirements; this is that run. Thirteen isolated lenses walked one shared stress sheet over one set of renders, a verifier tried to refute every finding, a completeness critic hunted for gaps, six follow up reads answered them, and a final synthesis merged the survivors. It is evidence for the PM's rulings and for the requirements, not a ruling. Every ruling stays the PM's; the briefs below are how they come back.

## The verdict

**Ready with conditions, and the direction is unanimous.** All thirteen lenses and all six follow up reads agree with the direction: a course belongs to its pet, logging stays on +, the end of a course asks a question and never celebrates, the medication ledger speaks the trial screen's language, and reminders are built around the double dose hazard. Nothing in the run argues for a different direction.

**The round is not yet a spec.** Its frames lean on four things that do not exist in the schema or the run order: a slot model, a stored link between a dose and its meal, one write contract for every door that logs a dose, and a complete concern table. Where the frames guess, a refusal can read as forgetting, a critical drug at half doses never escalates, the trial count disagrees with shipped code, and "is it working" can read as a verdict. Setup also breaks the settled GC-5 A ruling (the steps carry no confirm), and the page's fold line sits 81pt too low, so several "it fits" claims, D2 and L1 among them, were judged from the wrong line.

**Twelve gates stand before the requirements** (five rules the team writes, seven PM rulings), the honest forecast for the track is **about 25 rows, not 14**, and **twelve defects were found in shipped code**, eight filed new and four carried. The most urgent is [CUL-1915](https://linear.app/projectnyx/issue/CUL-1915): Nyx's trial completion sheet opens on Sat Oct 17 and will print her before and during counts without mentioning the prednisolone.

| Lens | On the direction | Why, in a line |
|---|---|---|
| Sr. Product Designer | Agrees, with conditions | It holds as one feature. The course screen does not yet answer "is it working" honestly at a glance, the end card is drawn four ways, and day 0 and setup without consent are not drawn. |
| Motion consultant | Agrees, with conditions | One physics is described in words, but only one motion is specified. Course pills can re-deal under the thumb, and the safety row has to arrive through the Signal's gate. |
| Mobile IA consultant | Agrees, with conditions | Each job has the right home, but the fold is measured 81pt optimistic, so several "it fits" claims hold only at a density the record does not have. |
| Visual Design & Brand consultant | Agrees, with conditions | The system is right and the report survives the fax. As drawn it looks like a mock, and some marks say the wrong thing: tones under the contrast floor, and a partial dose in the good fact teal. |
| Accessibility consultant | Agrees, with conditions | Facts are in words wherever the owner decides something. Not yet true that every state reads without colour, with VoiceOver and at the largest text size. |
| Sr. Data Scientist (as `adversarial-reviewer`) | Agrees, with conditions | The arithmetic adds up and the unit model is right. Seven breaks would pass silently, chiefly "is it working" reading as a verdict, and counts that fail on record shapes the fixtures already hold. |
| Dr. Chen | Agrees, with conditions | He would hand the course screen to an owner at discharge once the requirements cover vomited and re-given doses, the double dose danger, and D1's count. |
| Dr. Chen, cold read of the report page (`vet-report-cold-read`, renders only) | Agrees with the page's shape; this render is not clinic ready | The status cell overclaims, the day axis places doses up to a day off, no dose is linked to a vomit that follows it, and only the gentlest fixture is drawn. |
| Veterinary technician consultant | Agrees, with conditions | It carries the vet's plan. The five commonest callbacks (spat, vomited, skipped, doubled, ran out) all dead end, and none records what the vet said to do. |
| Jordan | Agrees, with conditions | He would trust it over the fridge note once there is a slot state table, an honest trial count, and an end that works with a recheck. |
| Sam | Agrees, with conditions | It never shames a gap, but in six places it either falsely reassures or keeps a spat pill quiet. |
| Trust & Safety (as `rls-privacy-reviewer`) | Agrees, with conditions | Local reminders off by default and user prefixed storage are right. Six gaps remain, including reminders outliving the record, label retention, and who the report's notes are for. |
| Dir. of Engineering with Sr. QA | Agrees, with conditions | Buildable on shipped code, but the frames depend on a slot model, three numerators and stored facts that neither the schema nor the run order has. |

The six follow up reads (Data Scientist, Designer, Engineering, Mobile IA, Sam, Dr. Chen) all returned the same verdict; their findings are folded into the items below.

## What the critique changes

### Twelve gates before the requirements

The synthesis numbered these GC-1 to GC-12. They are renamed **Gate 1 to Gate 12** here, because round 2's critique already used GC labels and GC-5 A is a settled PM ruling.

**Five rules the team writes** (team defaults; the PM can veto any):

* **Gate 2 · One slot model, one partition, one end fact.** Slots are worked out on read, with the assignment rule, tie break, off day case, time zone and DST stated. A second attempt is recorded in its slot without erasing the refusal. Extras sit beside the slots and never fill them. Course membership is worked out on read; the stored link is provenance only. Tablets used counts slot doses plus extras, and the refill line keys on the earliest date. Each bound kind has one end fact, which the fan pill, Home, the end question, reminders and the masking span all read. Every course with more than one slot a day gets a Today block. *(GAP-1, GAP-2, GAP-11, GAP-16, GAP-32, GAP-33, BRK-4.)*
* **Gate 3 · One write contract for every dose.** All eight doors that log a dose call one write function, whose default depends on the vehicle and the paired meal's intake, never on the door. One repeat predicate counts unanswered doses. Tiles name the pet the write goes to, and nothing links silently to a stale course. One hook after every write (insert, re-rate, re-vehicle, re-time, reverse, pull) re-arms the Signal, raises the record change signal, reconciles reminders and rechecks the slot. Corrections happen on the dose's own record, and every owner answer has a stated store and inverse. The meal link is set by the owner at write time, never inferred. Each vehicle has one home and records where it came from. Doses are never counted as feedings. A removed link reads as absent in one shared reader. The report reads each dose's own vehicle. *(BRK-8, BRK-12, BRK-13, BRK-14, GAP-3, GAP-34 to GAP-36, GAP-40, GAP-41, MFU-12 to MFU-14.)*
* **Gate 4 · One complete concern table, built as its own row.** Slot state by drug class by surface, with a stated precedence and one fixture per cell. A refusal reads "not taken". Not answered and Not sure get their own clause; nothing logged is stated but never scored. A critical drug escalates on partial, unanswered, extra and vomited up doses, with class and name matching (brands included) set with Dr. Chen. A lifelong drug gets a cluster term. A whole course total always shows beside the count that tells against it. C3 reaches Home as a safety class finding, with a local fallback offline, and its render is in `ALWAYS_SCANNED`. *(GAP-4 to GAP-8, BRK-2, BRK-3, WBC-3.)*
* **Gate 5 · Setup and the box.** Every proposed field, steps included, carries a confirm, and Start stays off until all are confirmed (settled GC-5 A). Every safety check (the wrong drug catch above all) runs on the confirmed fields on every tier, so it never sits behind the label reader, a cap or Premium. "Does it end?" comes before any bound; an until gone step needs the quantity. Amounts are stored in the prescribed unit; a box of a different strength never recomputes the dose and sends the owner to the vet or pharmacist. Strength lives on the box. All five reader outcomes are drawn. The label is read with its bytes sent inline, not from Storage, and each label has a delete, a retention rule, a share rule and an export line. The after plan shows in the owner's voice and never on the end card. *Its label clauses are privacy and go through the `rls-privacy-reviewer` at build.* *(BRK-5, GAP-12 to GAP-14, GAP-27, GAP-28, GAP-39, WBC-6, MFU-16.)*
* **Gate 6 · Surface rules: fold, motion, accessibility, doors.** Each surface states its fold budget in points from main's chrome. The requirements carry a motion and accessibility section (radio groups; a dwell that holds for screen readers). A course pill is never dropped, and the pill set is fixed at local midnight. The ledger is one component lifted from `TrialLedger`, and each row opens in place into 44pt slot rows that open each dose's record. The Pet tab has one medication block, ordered by what each row asks. A route table replaces `app/medication/[id].tsx` and keeps the History course door on every course state. *(BRK-7, MFU-2, GAP-17 to GAP-19, GAP-21, GAP-37, GAP-38.)*

**Seven PM rulings** (decision briefs):

> **Gate 1 · Restate D1's run order before any row is dispatched.**
> *Deciding:* which run order the track starts on, and so its size.
> *Options:* **A, requirements first (recommended):** with their fixtures and a motion and accessibility section; M0 split into its pure fixes, its migration and its two clinical rulings; the missing rows added (slots, the write contract and after-write hook, the concern function, the setup catch, the route table, Home, the end card); the steps migration as expand and contract · B, the run order as drawn, requirements at row 6 · C, build only M0's pure fixes and hold the rest.
> *Why A:* requirements written last only describe what was already built, and M0 as drawn cannot merge until three separate gates clear.
> *Consequence:* M0's pure fixes and the shipped defect fixes can start now. **Forecast: about 25 rows (D1 forecast 14); the plan returns at 26.**

> **Gate 7 · The headline count and the end trigger, against ratified D1** (better than the rule).
> *Deciding:* which count every headline shows, and what opens the end question.
> *Options:* **A (recommended):** D1's delivered count, or "N logged · M went in" on one line; the question opens once the last planned slot's time has passed, and its sentence names every dose that did not go in · B, "N of M logged" alone, opening as soon as the last slot holds any dose (as drawn) · C, D1 as ratified, opening on the counter.
> *Why A:* it keeps D1's protection, never lets a run of refusals at the end read as complete, and ends the stall when the last doses are refused or the bottle runs out early.
> *Consequence:* overrides D1's count trigger for courses counted in doses (re-rules dose duration D1 and D6), and "15 of 15 logged" never appears without its breakdown, the report included.

> **Gate 8 · May the repeat card stop a dose before it is written?** (better than Principle 1 and the shipped after-write note)
> *Deciding:* whether a second dose into an occupied slot can be held for one decision.
> *Options:* **A (recommended):** a card before the write only when the dose already in the slot went in, with the safe action primary and nothing blocking; otherwise write, then state the fact with Undo · B, a card before every write into an occupied slot (as drawn) · C, after the write only, as shipped.
> *Why A:* stopping a second antibiotic or insulin dose is worth one decision; a refused or unanswered slot is not.
> *Consequence:* unblocks M0's [CUL-572](https://linear.app/projectnyx/issue/CUL-572) row, and narrows Principle 1 for one case only.

> **Gate 9 · Is it working: the watching rules first, then what prints beside the drug** (persona conflict).
> *The rules (team):* one day axis with step boundaries; per step counts; coverage counted as days the owner answered the look, today excluded; zeros and falls withheld while any span could mask; every span named; After starts at the owner's end; the caveat first; every masking reader, the shipped completion sheet included, follows the same rule.
> *Deciding:* whether paired before and during counts print once those rules hold.
> *Options:* **A, day strips with window totals only, in the report's shape (recommended)** · B, per step counts, each with its own logged day denominator, behind `lookComparison`'s gates · C, as drawn.
> *Dissent:* Dr. Chen keeps the split, per step, because the cough's return on the first every 48 hours doses is the fact that changes the consult.
> *Consequence:* row 2 builds after another adversarial pass. **Forecast: 3 rows.** The completion sheet fix ships now, outside the track ([CUL-1915](https://linear.app/projectnyx/issue/CUL-1915)).

> **Gate 10 · D5 with L5: what the chip records for a pill in food, and so where supplements live** (persona conflict; rule after Gate 3 defines the linked and unlinked cases).
> *Options:* **A, two facts (recommended):** the bowl lives on the paired meal, the chip records only the tablet, neither is inferred from the other; Not sure stored separately; supplements are courses logged from the meal they go in · B, the dose takes its amount from the paired meal's rating (one answer per bowl) · C, Some of it on the chip also writes the bowl.
> *Why A:* one fact per record holds for the dog who eats the bowl and leaves the pill, and for the cat who eats the cheese and spits the tablet.
> *Dissent:* Sam, one bowl, one answer (B). Sam's lens reversed the position round 4 gives Sam on D5.
> *Consequence:* L2 and L5's frames are redrawn on W, and the requirements say what "how much" means when another pet shares the bowl.

> **Gate 11 · D8's marks: contrast floors, shape marks and one colour per answer** (better than the rule; ruled Oct 12).
> *Options:* **A (recommended):** keep the trial's fill for All of it; draw Some of it in ink; mark a refusal in the cell; give Not given its own mark; the meal's three tones on Today's tags and ink on summaries; every pair pinned in the contrast test · B, a partial dose as a shape, as History v2 already does · C, as ruled Oct 12.
> *Why A:* keeps D8's grammar and the trial screen match, while All of it and Some of it stop being told apart by tone alone (1.66:1 between them and 2.26:1 against the card, under the 3:1 floor; None of it already passes at 5.33:1).
> *Dissent:* Accessibility, move off tone for amount (B).
> *Consequence:* amends D8; the shipped `AdherenceChipRow` rose and the trial ledger ([CUL-1890](https://linear.app/projectnyx/issue/CUL-1890), [CUL-1666](https://linear.app/projectnyx/issue/CUL-1666)) change with it.

> **Gate 12 · D2, Home's course row, measured on main's chrome first.**
> *Options:* **A (recommended):** words only lines in one card, capped like the fan, shown only when they say something Today does not; concern and end question lines never fold; the end question asks for three days, then moves to the Pet tab · B, an always present row per course · C, no course row on Home.
> *Why A:* measured on main's chrome, one drawn row already pushes the look's chips under the tab bar.
> *Consequence:* unblocks Home's row and L1's ruling. If no compaction fits, the look loses its place on the first screen, and that cost comes back named.

### Five persona conflicts

> **Is it working: what prints beside the drug** (Gate 9)
> **Dr. Chen, with the vet tech on dates:** keep the before and during split, per step, each with its own logged day denominator and the step change marked: the cough's return on the first every 48 hours doses changes the consult.
> **Data Scientist, Sam, the cold read vet:** window totals only. A paired count beside a drug reads as "it worked", the shipped engine refuses that comparison, and a 25% fall is what regression to the mean alone produces.
> **PM decision needed:** totals only, or a per step split behind `lookComparison`'s gates?

> **The medicine's name on a lock screen**
> **Dr. Chen:** name it, or two bottles due at 8 AM get confused. His new middle path: keep the name off but state the count ("Pixel · 2 planned at 8:00 AM").
> **Trust & Safety, the vet tech, Accessibility:** off by default, per phone. A name switched on is also read aloud and mirrored to a watch, and the wrong bottle risk arises at the bottle, where + names every course.
> **PM decision needed:** off by default with a count line, or show the name?

> **D5: one answer or two facts per bowl** (Gate 10)
> **Sam:** one bowl, one answer: the dose takes how much she got from the paired meal's rating, as shipped B-156 already does.
> **Dr. Chen, Jordan, the Data Scientist:** two facts. The bowl lives on the meal, the chip asks only what the owner saw of the tablet, and neither is inferred from the other.
> **PM decision needed:** take the dose from the meal, or record it separately?

> **D8: the fill for "all of it"** (Gate 11)
> **Visual Design:** keep the trial screen's `colorAccent` so the two screens match, and add contrast floors elsewhere as a team call within D8.
> **Accessibility:** add a shape channel, matching History v2's broken line for a partial dose.
> **PM decision needed:** keep the trial match and add floors, or move the fill to a shape?

> **The end card's order (reading D3)**
> **Designer:** ledger above the question, as in frame-25 (the frame the PM liked), with a fallback when it will not fit above the fold.
> **Mobile IA:** question first with the ledger directly under it (frame-47), so the actions sit above the fold.
> **PM decision needed:** which reading of "the record, then the question"? Rule before the end card row.

### The open briefs on CUL-1902, after the critique

| Brief | After the critique | What changes |
|---|---|---|
| L1 · where the list lives | Sharpened; every lens that judged it favours W | W must be shown as an image at Nyx's and Pixel's density and at AX1 (it was judged from a description and a crop). If W: door one is the bottom row of the pet's medication block, and Foods' bottom inset rises to 88. Every course state carries an "About {medicine}" door. L2 and L5 depend on it. |
| G4 · medicine reminders | Sharpened | Reissue the brief naming everything it overturns: G1, DR-6 with CUL-1419 decision 5, the settings promise line, D4 and migration 050's CHECK. If lifted: one shot DATE triggers over a rolling window reconciled from the record, logging a dose counts as the answer, a cap under 64 shared with the daily summary, the tap binds to the reminder's pet and course. T&S and Sam recommend the pet's name on by default for medicine reminders (an exception to DR-6). Gates row 4. Forecast: 4 rows. |
| Lock screen name | Conflict, sharpened | Above. Off by default, per phone, wiped on sign-out, with Dr. Chen's count line as a third option. |
| Halfway or the day before | Day before recommended, sharpened | Also covers tapers and until gone courses, carries the owner's noted after plan, and has no count or date in the body. "Any tablets left over?" asks for a number, stored beside the count and never merged into it. |
| Is it working | Now blocking | Gate 9. |
| D10 · tapers of amount | Sharpened | Store the bound's kind (days, doses or tablets) and the amount in its prescribed unit with the strength it was confirmed against. A box of a different strength stops the tablet line and sends the owner to the vet or pharmacist. "Is the bottle empty?" recommended yes. Each dose records its amount at logging. Forecast: 3 rows. |
| D5 · the dose words | Conflict, sharpened | Gate 10. Not sure gets its own stored marker and words. Close the carried S1 with a `vomited_up` state rather than a parallel one. |
| The report page as a milestone | Sharpened | Third cold read: NOT clinic ready as rendered. Before the next read: the status cell gives the split, one date scale, a column for not answered, each dose's own vehicle, the bowl read from the meal, the Mochi, Pixel, Biscuit and empty account fixtures rendered, the R-17 type floor, and "Last dose before this visit". Still after the steps migration and [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859). Forecast: 2 rows. |
| D1 · start the track | Now blocking | Gate 1. |
| L2 · Foods says whose list it is | Unchanged | Redraw both options on W's Foods. Sam's option needs an amendment to trial awareness D7. |
| L3b · does the pill stay | Resolved by evidence | Every lens now says it stays; a team default below. |
| L5 · supplements | Sharpened | Ruled with D5 (Gate 10): option C's rule inside option A's container. |
| L6 · the vehicle per dose | Sharpened | The meal link is set at write time; each vehicle has one home; the default comes from this pet's last logged meal; three `classifyDose` changes; doses never counted as feedings; a named off list vehicle outranks an allowed linked meal; "In something else" opens the food picker. Dr. Chen signed off the cheese case. |
| D2 · Home | Now blocking | Gate 12. |
| D4 · a dose after the end | Sharpened | Membership worked out on read; a late dose can be marked "the tablet left over"; Change the end date only for a real extension. |
| D6 · glyphs | Sharpened | Draw a single object event glyph at 16pt and below, redraw transdermal as an applicator (usually methimazole gel on the ear), give "other" its own glyph, and re-render §11 with real discs before CUL-493's device pass. |

### Briefs to rule later, before the row that needs each

* **The vet's after plan chips** (PMD-6, clinical): drop "Stop", split "Recheck first" into "stop, then recheck" and "keep giving until the recheck", and flag a "Taper down" with no steps from day 1. With Dr. Chen, before the setup row.
* **A table of side effects a drug can cause** (PMD-12, clinical scope): a short list Dr. Chen keeps, where a listed sign tells the owner to call the vet (a cat on meloxicam vomiting on day 3).
* **The label's food, storage and discard instructions** (PMD-13, better than GC-5 A): three more structured fields the owner confirms; all three of GC-5 A's protections still hold.
* **Whether an empty slot opens + to fill in a missing dose** (PMD-14, clinical, before row 2). Recommended yes, preset to the planned time, with "logged Oct 4 for Thu, Sep 24 evening" shown on the end card and the report.
* **Whether a pet's first dose of a medicine another pet holds asks first** (PMD-15, clinical, before row 3). Recommended: one sheet, once per pet and medicine pair, ever ("Methimazole is Pixel's. Who had it?").
* **Where the word Premium may appear now that setup carries symptom chips** (PMD-16, money). Recommended: on the snap door only.
* **On [CUL-1915](https://linear.app/projectnyx/issue/CUL-1915):** whether the completion sheet's quieting covers vet visits as well as courses (PMD-18), and whether a masking course changes the trial's Keep going default (PMD-17).

### Team defaults (the PM can veto any)

* **L3b: the course pill stays** after today's dose, carrying the last dose with its outcome; every path that logs a dose goes through the repeat check; the pill set is fixed at local midnight. Every lens, Jordan included, now agrees.
* **A dose celebrates only on the owner's own tap** (PMD-11 A), never on a pre lit chip, so Pixel's weekly spat tablet never gets the gold. Rides [CUL-1710](https://linear.app/projectnyx/issue/CUL-1710) into M0.
* **The course screen neither logs nor edits a dose.** A dose opens its own record, and every correction happens there (a team reading of L4, GAP-36).
* **Gates 2 to 6**, above.

### Sequencing

1. **Now, outside the track:** [CUL-1915](https://linear.app/projectnyx/issue/CUL-1915) (the completion sheet; Nyx's opens Oct 17, and no fix lands in time), then the other seven filed defects.
2. **The PM rules** Gates 1 and 7 to 12 and the open briefs on CUL-1902.
3. **Round 5** draws the rulings and the states this round left undrawn (the readout below lists the frames).
4. **The requirements**, written from round 5 with Gates 2 to 6 as their spine and the fixtures named (MFU-5); their non-visual sections (slot model, write contract, concern table) can start as soon as Gates 1 and 7 are ruled.
5. **The track**, per Gate 1: M0's pure fixes can start once Gate 1 is ruled; CUL-572's row waits on Gate 8; row 2 waits on Gate 9 and an adversarial pass; the doors wait on L1 and Gate 12; reminders wait on G4's reissued brief; the report page waits on the steps migration and CUL-1859.

## Filed and carried (shipped code)

| Item | What | Where it lives now |
|---|---|---|
| MFU-15 | The trial completion sheet prints before and during counts without reading any course; Nyx's opens Sat Oct 17 | **Filed: [CUL-1915](https://linear.app/projectnyx/issue/CUL-1915)** (Live harm, QUIET, Waiting on PM for two clinical questions) |
| MFU-12 | Logging, re-rating or re-vehicling a dose never regenerates the Signal | **Filed: [CUL-1916](https://linear.app/projectnyx/issue/CUL-1916)** (Live harm, QUIET) |
| MFU-13 | A dose linked to a removed meal is read three ways (trial card, report, History) | **Filed: [CUL-1917](https://linear.app/projectnyx/issue/CUL-1917)** (Live harm, QUIET) |
| MFU-14 | The vet report says no dose was given in food over doses logged in food (`how_given` is never read) | **Filed: [CUL-1918](https://linear.app/projectnyx/issue/CUL-1918)** (Live harm, QUIET) |
| MFU-18 | The report's trial block drops a course that ended before the trial though its masking tail runs into it | **Filed: [CUL-1919](https://linear.app/projectnyx/issue/CUL-1919)** (Live harm, QUIET) |
| MFU-16 | Offline, capture says the label photo is saved when it never uploaded | **Filed: [CUL-1920](https://linear.app/projectnyx/issue/CUL-1920)** (Live harm, data loss) |
| MFU-11 | Delivered notifications outlive sign-out and account deletion; a tap checks only that a session exists | **Filed: [CUL-1921](https://linear.app/projectnyx/issue/CUL-1921)** (privacy hygiene; no record content in today's bodies) |
| MFU-10 | The dose card cuts off the drug name it exists to confirm | **Filed: [CUL-1922](https://linear.app/projectnyx/issue/CUL-1922)** (Backlog) |
| MFU-1 | The calm dose plays the success haptic | **Carried on [CUL-1710](https://linear.app/projectnyx/issue/CUL-1710)**, sequenced into M0 |
| MFU-6 | The masking table treats Clavamox, cetirizine, Motozol and phenobarbital as masking every sign | **Carried on [CUL-1892](https://linear.app/projectnyx/issue/CUL-1892)** (still errs toward caution; the class is wider than antihistamines) |
| MFU-7 | The trial ledger's teal fill measures 2.26:1 while its comment claims 3:1 | **Carried on [CUL-1666](https://linear.app/projectnyx/issue/CUL-1666)** (a site its measured set missed) |
| MFU-8 | Abandoned label photos stay in the bucket for the life of the account | **Carried on [CUL-231](https://linear.app/projectnyx/issue/CUL-231)** (the orphan sweep) |

[CUL-572](https://linear.app/projectnyx/issue/CUL-572) also carries the critique's shape for the repeat check and Gate 8's dependency.

## The lead's pass

* **Main moved during the run.** Round 4 and the lenses read `a630b35`; by the lead's pass `main` was at `4949559`. Of the files the filed defects name, only `app/medication-capture.tsx` and `lib/session.ts` changed, both for AI consent (CUL-1834: the consent door now sits before the label snap, and the sign-out wipe clears the cached consent answer). Neither change touches a defect. One consequence for Gate 5: on main, declining AI consent now opens the typed form with no label photo at all, which makes Gate 5's line ("snapping a label is part of the record, and reading it is a convenience") a change to shipped behaviour, not only to the mock.
* **Spot checks.** Every claim that became an issue was re-read in code before filing: `lib/medicationDose.ts:12-16` (the Signal wire still waiting on PR 9) and its three writers calling only `notifyDoseChanged`; `lib/dietTrialFacts.ts` `dosesQuery` (no check of the paired meal's `deleted_at`); `generate-report/report.ts` `medicationVehicles` (paired doses only; no `how_given` anywhere in the function); `generate-report/trial.ts` `medicationOverlap` (no masking tail); the three completion sheet files (no read of courses or masking); `app/medication-capture.tsx` (the "saved either way" banner after a failed upload, and `photo_path` written regardless); `lib/session.ts:202` (scheduled notifications only); `MedicationCompletionCard.tsx:482-483` (`numberOfLines={1}`); `lib/maskingSpans.ts` `courseEffectOn(null)`; and `TrialLedger.tsx`'s `colorAccent` fill, measured at 2.26:1 on white.
* **Dedupe.** Linear was searched for each defect before filing (completion and outcome sheets, Signal regeneration, vehicles, deleted meals, overlap, truncation, offline capture, notifications at sign-out, label photos, contrast). Four were already carried by an open issue and got a comment instead of a new issue.
* **The cold read held its isolation.** The `vet-report-cold-read` lens read only the three report renders and says so in its own output (it skipped its usual source cross check on purpose).
* **The naming fix.** The synthesis's GC-1 to GC-12 are Gate 1 to Gate 12 in this doc and on Linear.
* **One verifier refutation worth knowing.** The Motion lens's "the target dose glows" (MOT-1) was refuted: every dose gets the same beat, so nothing marks the target. Whether a dose after the end should commit calm is carried as PMD-11.
* **The two pass cap.** This PR holds two adversarial passes: the Data Scientist lens (the "is it working" pass §13 asked for) and the report's cold read (its third read overall, its first in this PR). Both found QUIET residuals, so "is it working" stays blocking and needs another pass in its own build PR, and the report page needs one more cold read after its fixes, in the report milestone's PR.
* **Run audit.** No repository file changed during the run, and the only Linear posts are the lead's.

## The full critique

Every item below survived its verifier (CONFIRMED unless it says PLAUSIBLE) and was merged across lenses by the synthesis. Severity, whether it gates the requirements, and whether it is in shipped code follow each title.

### Broken (14)

**BRK-1 · The course screen draws doses and the watched sign on two axes and pools both steps, which hides the cough's return on step 2** (high, gates the requirements; Designer, Data Scientist, Dr. Chen, Vet tech, Visual Design, Accessibility)

* *Where:* §04 frame-24, frame-25
* *Evidence:* Step 2 is drawn as 5 cells. The cough strip is 20 day cells in a separate card, with no step boundary. Coughs fall on Sep 23, Oct 2 and Oct 4, and Oct 2 and 4 are the first two every-48-hours doses. One pooled '3 days · 20 of 20' prints under '4 · 13 of 14'. Cold read 1 found this defect on the report and draft 3 fixed it there. The strip's 9x12pt marks also reuse the ledger's greys.
* *Counterexample:* Nyx coughed on 1 of 10 days on step 1, then on 2 of 10 days from Oct 1 to 10. The pooled 3 against 4 reads as improvement, while the sign came back as the dosing dropped.
* *Resolution:* Whatever Gate 9 rules, doses and the sign share one column per calendar day from Before through After. Step changes are marked on both rows with date ticks, and counts are given per step, never only as a pooled total. Sign marks use their own primitive (an ink tick of 12pt or more) and share no fill with dose cells.
* *Verified:* CONFIRMED (all six). Source ids: DES-01, DAT-02, VET-04, VT-14, VIS-4, A11Y-8.

**BRK-2 · The frames leave out the concern rule's own vet asks and are quieter than main** (high, gates the requirements; Sam, Data Scientist, Vet tech)

* *Where:* frame-01, frame-06, frame-07, frame-24, frame-25 against frame-12 and the §02 concern table
* *Evidence:* Main's Pet tab says '11 doses not fully taken, worth a word with your vet'. The proposed Home and Pet tab rows say only '15 of 15 logged · Is this course finished?'. On Sep 30 the window holds 6 Some of it out of 7, which is C1 with the ask, yet frame-24 shows no ask. frame-06 on Oct 9 owes the ask and shows nothing. frame-25's end card asks from a whole-course rule that the one function does not contain.
* *Counterexample:* Nyx on Oct 10: the window (her last 6 planned doses) holds 2 partials, so the function returns C1 with no ask, even though 11 of 15 doses went in only partly. The row asking 'finished?' never mentions this.
* *Resolution:* Any surface that gives a whole-course total also gives the count against it ('15 of 15 logged · some of it on 11, in her food'). The end card's ask comes from the one concern function, and the frames are regenerated from it. A guard on Nyx's fixture fails if '15 of 15 logged' renders on its own.
* *Verified:* CONFIRMED. This is a regression from the shipped regimenFlagLine. frame-06 was found by a verifier. Source ids: SAM-1, DAT-03, VT-13.

**BRK-3 · A refused dose is relabelled 'not given'** (high, gates the requirements; Designer, Dr. Chen)

* *Where:* frame-11 course row; §02 C2 and C3 wording
* *Evidence:* Biscuit's record is Fri 7 PM Not given, then Sat 7 AM None of it. The Signal says 'not taken', but the course row says 'Not given on 2 of her last 3 doses'. C2's and C3's own text says 'not given at all', which collides with the chip word.
* *Counterexample:* A second caregiver reads 'not given' as someone forgetting and gives another phenobarbital tablet. The refusal, which is the clinical signal, is lost.
* *Resolution:* The concern levels say 'not taken'. One function writes the course row, the Pet tab row and the Signal line. When the run is mixed, each state gets its own word ('Not given last night · none of it this morning'), and every count carries its noun.
* *Verified:* CONFIRMED. The root cause is C3's own wording. Source ids: DES-04, VET-06.

**BRK-4 · An off-day tablet fills an empty slot's count, the until-gone course never ends, and the pill and the end question follow different rules** (high, gates the requirements; Data Scientist, Dr. Chen, Vet tech, Engineering)

* *Where:* frame-26, frame-17, frame-32; D10; lib/medications.ts courseReachedPlannedEnd
* *Evidence:* frame-26 prints '15 given for 15 planned' while the Oct 10 cell is still 'not yet', because it counts the Oct 9 off-day tablet. The step runs until the 15 tablets are gone, so the bottle is empty and 'No question about the end until it is logged' can never resolve. frame-17 removes the pill when the count is reached, frame-26 waits for the last slot, and frame-32 still arms the Oct 10 reminder. A course that is never ended keeps its masking span running to today plus 42 days.
* *Counterexample:* Nyx, Oct 10 at 7:03 AM: there is no prednisolone pill (the count rule), no end question (the slot rule), and a reminder that still fires (the plan rule). The only way to log is More events, which is the 16th tablet frame-17 was meant to stop. The Signal withholds every zero with no end date.
* *Resolution:* Each kind of bound names one end fact. An until-gone step ends when tablets used (slot doses plus extras) reach the box quantity, and then asks 'Is the bottle empty?'. A days or doses step ends at its last planned slot. Extras are reported separately and never fill a slot ('14 of 15 planned · 1 more on Fri, Oct 9'). The pill, the end question, reminders and the masking span all read that one predicate, with a property test that every state of an active course shows either the pill or the end question.
* *Verified:* CONFIRMED (all five). Source ids: DAT-07, VET-07, VT-05, ENG-03, ENGF-3.

**BRK-5 · Setup breaks settled GC-5 A: the steps have no confirm, and the mismatch card binds a different drug with one ambiguous tap** (high, gates the requirements; Designer, Dr. Chen, Accessibility, Motion)

* *Where:* frame-27, frame-28, frame-44
* *Evidence:* Strength and How many are ticked but no step is, even though frame-27's own aria-label says every field is. frame-28's three taper steps and all of frame-44 have no confirm, and Start is live. The mismatch card offers 'Use the label's' or 'Keep Prednisone', and 'Keep' can mean either starting on the house's Prednisone 10 mg or keeping it as a separate medicine. The 'Prednisone 10 mg, added Jun 21' it cites appears neither in frame-03 nor in §00.
* *Counterexample:* The reader proposes '1 tablet (5 mg)' for frame-28's '½ tablet' step. The strength and count ticks are correct, the step is never confirmed, and the last four steroid doses go in at double. Or a hurried owner taps 'Keep Prednisone' and binds a Prednisolone 5 mg box to Prednisone 10 mg.
* *Resolution:* Every proposed field, including each step's interval, amount and bound, has a confirm that spells the amount out in tablets and mg. Editing a field re-opens its confirm, and Start stays inactive until every field is ticked, as the shipped strength gate does. The mismatch answers are named by what they do ('A different medicine: add Prednisolone 5 mg' · 'The same box: correct the house entry'), sit in the attention panel, and never offer a one-tap path to a course the confirmed box contradicts. A mutation test deletes one step's tick and must fail.
* *Verified:* CONFIRMED. DES-07 raised to broken and high; DESF-2 and DESF-10 are follow-up findings. Source ids: DES-07, VET-13, A11Y-12, MOT-14, DESF-2, DESF-10.

**BRK-6 · The report's status cell says 'All 15 planned doses given' over 11 partly eaten doses** (high, does not gate; Dr. Chen cold read, Dr. Chen, Data Scientist)

* *Where:* §12 report page, 'Status on Oct 10' cell and legend
* *Evidence:* The cell reads 'All 15 planned doses given; … none further planned', while the dose table shows 11 'ate part' and the legend calls the filled mark 'all taken'. Cold read 1 flagged this kind of phrase, and draft 3 removed it from the table. The status cell, written to answer cold read 2, brings it back, and the course was still open on Oct 10.
* *Counterexample:* The vet reads 'All 15 given', sees coughs on Oct 2 and 4 at 1.34 mg/kg, and escalates to radiographs instead of asking about underdosing.
* *Resolution:* One function feeds the cell, the legend and the table ('15 of 15 planned doses logged, each in a meal: ate all 4, ate part 11 (tablet amount not known); no end recorded as of Oct 10'), with a guard that fails when 'all' comes before a count whose partial is not zero. This gates the §12 milestone; the cross-surface count rule behind it sits in Gate 7.
* *Verified:* CONFIRMED. RPT-01 corrected to broken. Source ids: RPT-01, VET-14, DAT-09.

**BRK-7 · The mock's fold line sits about 81pt too low, and D2 and L1 were judged from it** (high, gates the requirements; Mobile IA)

* *Where:* Every .phone.full tab frame
* *Evidence:* The dashed line marks 844pt, the bottom of the screen, and the tab bar and FAB are drawn below it. On main the tab bar takes 81pt, so tab content ends at 763pt and the FAB covers 716 to 772pt. The Pet tab frames also draw a header row that main does not have (CUL-618 rejected one), and a 58 to 220pt hero where main's is roughly 340pt.
* *Counterexample:* In frame-07, the look's first chip row centres near 768pt, which is under the tab bar on a 390x844 iPhone.
* *Resolution:* The requirements give each surface's fold budget in points, taken from the shipped constants, and re-measure every fold claim on main's chrome. The header row is dropped, or briefed as a reversal of CUL-618. D1's finish row adds device checks at 390, 320 and AX1, and the critique harness draws the tab bar over the content.
* *Verified:* CONFIRMED. The header row was found by a verifier. Source ids: MIA-01.

**BRK-8 · The trial count is drawn as shipped, but it is not: doses are not feedings, a refused dose's vehicle drops out, and a dose can carry two vehicles** (high, gates the requirements; Jordan, Data Scientist, Engineering, Vet tech)

* *Where:* frame-44, frame-45, frame-46; lib/dietTrial.ts classifyDose; lib/dietTrialCard.ts cardLine
* *Evidence:* frame-46 calls the cheese doses 'two off-diet feedings, on the shipped card'. Shipped classifyDose returns null for a dose with no paired meal, for a refused dose before it reads the vehicle, and for a vehicle on the trial list. Even after L6's change, doses land in a separate oral-route list that is never folded into the card's feeding count. Once a vehicle field exists beside the meal pairing, a paired dose carries two foods, and classifyDose reads the paired meal first.
* *Counterexample:* Mochi eats the cheese and spits out the Clavamox, Jordan logs None of it, and the cheese drops out of the trial count the card just promised. Or the pill is wrapped in cheese, put in her rabbit bowl and paired to that meal: the allowed meal wins and no exposure is counted.
* *Resolution:* L6 lists all three classifyDose changes, each with a fixture. One function decides a dose's trial reading, and both the app and the report call it. A named off-list vehicle, or a vehicle nobody named, outranks an allowed paired meal. The card states doses separately from feedings ('N off-diet feedings · M doses in off-list food'), and the dose card's trial line ships in the same row as the classifyDose change. The day-0 line says only food off the list counts. A chewable adds the shipped substitution sentence; Dr. Chen confirms the form of the fixture's Clavamox.
* *Verified:* CONFIRMED. JOR-05 is PLAUSIBLE; DATF-F04 and F05 are follow-up findings. Source ids: JOR-06, DAT-10, ENG-09, VT-06, JOR-05, DATF-F04, DATF-F05.

**BRK-9 · The as-needed strip draws dots and half-filled dots, which D8 rules out, and they overlap** (medium, does not gate; Designer, Visual Design, Dr. Chen, Mobile IA)

* *Where:* frame-51
* *Evidence:* It draws 17 round dots, 5 of them half filled with no key. The clusters overlap, so only about 12 marks can be told apart.
* *Counterexample:* July's 6 doses read as 3 or 4 marks, and an owner reads the half-filled Oct 3 mark as half a capsule.
* *Resolution:* Either D8 covers the as-needed strip, or the requirements explicitly scope it to CUL-1890. Use D8's cells on a true axis within a named 12-week window, binned by week with a count on each, and with the key in words.
* *Verified:* CONFIRMED. Source ids: DES-11, VIS-10, VET-17, MIA-10.

**BRK-10 · The report's day axis uses three scales, and it fails at the shipped default window** (high, does not gate; Dr. Chen cold read)

* *Where:* §12 'Doses and signs, one day axis'
* *Evidence:* The sign rows run at 16.1 px a day, yet the first dose sits 9 px left of Sep 21 and the ear drops step at 19 px. 'Oct 10' labels Oct 9's vomit. The cause is 7 px marks widening 6.6 px grid tracks, and shipped report.ts picks a 77-day window for Nyx, which is about 3 px a day.
* *Counterexample:* Read by its label, the last vomit falls on Oct 10, a dose day. Read by its scale, it falls on Oct 9, an off day. That difference decides whether the 8:51 AM tablet may have come back up.
* *Resolution:* One date-to-x function places every mark and tick, with weekly ticks centred on their dates. No mark is wider than its day slot minus a gap, the strip bins by week wherever marks won't fit, and the page names how its window was chosen. A render test checks that a dose and a sign on the same date sit within 1 px of each other. This gates the next cold read.
* *Verified:* CONFIRMED. The window basis was found by a verifier. Source ids: RPT-02.

**BRK-11 · The report's summaries claim more than the record holds: cetirizine's glyph, Motozol's span and the missing as-needed doses** (medium, does not gate; Dr. Chen cold read, Data Scientist)

* *Where:* §12; frame-03
* *Evidence:* Both cetirizine marks are drawn as 'partly taken, in food' with no text to support that, and the trial section leaves them out. 'Motozol, twice a day, Jul 16 to Aug 9' reads as 25 days of dosing, while the record holds 28 doses from Jul 16 to 30. 'Before this window' omits 15 as-needed cetirizine doses, nine of them inside the rabbit trial.
* *Counterexample:* A vet reads about 50 doses of an unknown ear product, and sees no antihistamine exposures during the trial.
* *Resolution:* Every glyph state is counted in its row's text. Every oral dose shows its vehicle, or 'not recorded'. The trial section lists every oral dose in the window. A span prints the dosing span and the end date as two separate facts, as frame-52 does.
* *Verified:* CONFIRMED. DAT-18 raised to medium. Source ids: RPT-06, DAT-18.

**BRK-12 · 'Another way to give it' turns a steroid cat's falling intake into a delivery fix** (high, gates the requirements; Dr. Chen, Dr. Chen cold read, Data Scientist)

* *Where:* frame-25 end card; §12; §13 still-open list; frame-43
* *Evidence:* The ask follows 11 of 15 dosed meals being partly eaten, in a cat on prednisolone (which raises appetite) whose Signal reads 'vomiting within 30 min of eating, 7 of 8'. §13 itself still lists intake at meals with no tablet as open. The planned comparison has a reassuring branch and preference wording ('a tablet she dislikes'), and it is only as good as the meal pairing.
* *Counterexample:* A cat developing pancreatitis leaves every meal, dosed or not, and the screen suggests changing how the tablet is given. Pixel on methimazole refusing her dosed breakfast reads as disliking the sachet.
* *Resolution:* The ask is worked out from three facts over the same days, using owner-confirmed pairs only: the dose chip, the paired meal's rating, and intake at meals with no tablet. If meals without a tablet were also left, it names appetite and joins the intake lane. It may name the tablet only if the meals without a tablet were finished. Days with unpaired in-food doses are left out of both groups, with that count disclosed, and each group needs a minimum count. The comparison never removes a meal from the intake lane and never says her appetite is fine. The report uses the same function.
* *Verified:* CONFIRMED. Moved from works but confusing: copy in a proposal frame softens a decline, which breaks the settled rule that intake is not preference. Source ids: VET-03, RPT-04, DATF-F09.

**BRK-13 · The page draws pill doses both linked and not linked to a meal, and states no rule for which** (high, gates the requirements; Data Scientist)

* *Where:* frame-07, frame-09, frame-15, frame-16, frame-21, frame-43; lib/medicationDose.ts; app/log.tsx; migration 023
* *Evidence:* frame-16 draws a meal and a dose as two unlinked rows. frame-07 and frame-09 draw 'in the 7:30 AM meal' and 'with Clavamox', which only the shipped combo doors produce, while golden path A logs every Clavamox dose from the pill. insertMedicationDose sets no pair on any standalone path, and nothing links an existing dose to a meal afterwards.
* *Counterexample:* Inferring the link from the nearest meal before the dose fails without anyone noticing. Pixel's direct methimazole at 8:02 turns her 7:45 breakfast into a vehicle and drops its protein from detector one. Nyx's refused 6:30 meal, linked to a dose later given in a treat, takes prednisolone off board under B-174 and blames the refusal on the tablet. A link across pets is rejected by migration 023 and never syncs.
* *Resolution:* The requirements name the dose-to-meal link as a stored fact with its writers and its readers. The writers are the dose card's meal chip (built only from this pet's meals within a named window), the meal card's add-med, event detail, and a new link action. The link is written only by an owner's tap and is never inferred or worked out when the record is read. 'Directly' and an ignored card never create a link. Every frame that draws a link names the door that wrote it.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DATF-F01, DATF-F02.

**BRK-14 · Six other doors write 'given' in exactly the case R2 says must stay not answered** (high, gates the requirements; Data Scientist)

* *Where:* §03 R2; lib/medications.ts initialComboDoseAdherence; app/log.tsx; app/(tabs)/profile.tsx; app/medication-capture.tsx; MedicationPicker
* *Evidence:* The meal card's add-med pre-lights 'given' unless the meal was rated refused or picked. The retroactive door writes 'given' and shows no card at all. The Pet tab and capture's first dose write 'given' every time. The combo picker lists any drug dosed in the last 14 days, so the 16th tablet frame-17 avoids is one tap away through the meal card.
* *Counterexample:* Sep 27: Jordan logs Mochi's dinner without rating it and adds Clavamox from the meal card. The card stores 'given', though she picked the pill out; the same dose logged from the pill would be stored as not answered. C1 counts nothing.
* *Resolution:* R2 lists every door that writes a course dose: the pill, the Medications door, the More events picker, the meal card's add-med, event detail's add-med, combo mode, the Pet tab and capture. Each one calls a single write function, whose default depends on the vehicle and on the paired meal's intake, never on which door was used. The combo picker hides a course past its length. A guard lists every caller of insertMedicationDose and fails on a new one.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DATF-F06.

### Works, but confusing (9)

**WBC-1 · The masking caveat comes after the counts: last in VoiceOver order and below the fold** (high, gates the requirements; Accessibility, Mobile IA)

* *Where:* frame-24, frame-25
* *Evidence:* The counts sit at about 700 and 778pt. The caveat sits at about 1,000pt, after the key, in the card's smallest and faintest text.
* *Counterexample:* A VoiceOver user hears 4, then 1, and concludes 'it's working'. Prednisolone hides coughing, so a count of 1 is expected whatever the disease is doing.
* *Resolution:* The counts and the caveat are one accessible element, and the caveat is read first. The caveat's first clause renders above the first count and is never the faintest text on the card. The adversarial pass checks the fold at 390x844 and at AX3.
* *Verified:* CONFIRMED. Source ids: A11Y-4, MIA-08.

**WBC-2 · The report's 'Ate all of the dosed meal / Ate part' columns print the dose chip as if it were the meal's intake** (medium, does not gate; Data Scientist)

* *Where:* §12 'Prednisolone, dose by dose' and its note
* *Evidence:* The columns come from the dose's own answer, but the headers and the note describe the meal. A dose linked to a meal holds two facts that can legitimately disagree, and a dose with no linked meal has no meal for the column to describe.
* *Counterexample:* The meal is rated refused, the owner then gives the pill directly and answers All of it, and the report prints 'Ate all of the dosed meal' for a refused meal.
* *Resolution:* The dose table prints the dose's own words (All of it, Some of it, None of it, Not given, not answered). The linked meal's intake prints in its own column, read from the meal row, and 'meal not linked' prints where there is no meal. This gates the §12 milestone.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DATF-F10.

**WBC-3 · Not answered and Not sure are counted as 'not fully taken' and shown as questions still waiting for an answer** (medium, gates the requirements; Jordan, Sam)

* *Where:* frame-15, frame-16; §02 C1; D5
* *Evidence:* Not answered is the default for every food course, and it counts toward C1's vet ask. Not sure is stored the same way and renders as 'Tap to say how much she got'. The card does not draw a Not sure chip.
* *Counterexample:* Jordan logs 14 Clavamox doses as the bowl goes down and Mochi finishes every bowl, yet the Pet tab says 'worth a word with your vet'.
* *Resolution:* Not answered and Not sure get their own clause in every count ('5 not answered · tap one to say'), with the dates listed as rows that open each dose's record (GAP-37). They are never counted as given or as not fully taken, and they reach a vet ask only as unknown. Not sure gets its own stored marker and its own words, and the chip is drawn before the card is locked.
* *Verified:* CONFIRMED. The card's claim about unanswered doses was added by a verifier. Source ids: JOR-09, SAM-4.

**WBC-4 · The repeat card makes a second dose its primary action and accepts touches while it is still rising** (high, gates the requirements; Designer, Motion)

* *Where:* frame-23
* *Evidence:* 'Log another dose' is the filled primary button under the thumb, and the body says 'slot'. Nothing defines how the card arrives, when it starts accepting touches, or where focus goes.
* *Counterexample:* Alex taps the pill, feels nothing, and taps again about 300 ms later. The second tap lands on 'Log another dose'.
* *Resolution:* The safe action is primary and named ('Leave it at the 7:30 PM dose'), and 'Log a second tablet' is a named secondary. The card rises on sheetMotion, makes no sound, accepts no touch until it is at rest, and puts focus on its fact. A test proves that a press during the rise writes nothing. This lands with Gate 8 and CUL-572.
* *Verified:* CONFIRMED. Source ids: DES-09, MOT-6.

**WBC-5 · The page argues both for and against 'a full grid at the target'** (medium, gates the requirements; Designer, Motion)

* *Where:* frame-08, frame-25, frame-47, frame-48 captions
* *Evidence:* frame-48 says D7 forbids 'a full grid', yet its grid matches frame-47's, and frame-25 draws a full 15 of 15. D7's text does not mention a grid. D3 also reverses the trial screen's §0.3 rule (no ledger at the milestone) without saying so, and frame-08 credits CUL-1526 with a reason its own record does not give.
* *Resolution:* A ledger fills in as doses are logged, and nothing changes state at the target. Strike 'a full grid' from D7's list, record D3 as a deliberate departure from trial §0.3 so the TrialLedger lift does not import that rule, and drop the misattributed reason from the D2 brief.
* *Verified:* CONFIRMED. DES-02 corrected to works but confusing. Source ids: DES-02, MOT-10.

**WBC-6 · Two parts are off the house's visual register: heads-ups drawn in the category wash, and a title block with two left edges** (medium, gates the requirements; Visual Design)

* *Where:* frame-27, frame-45; course title blocks
* *Evidence:* A drug and strength mismatch, and an off-list vehicle, are drawn in the medication wash (1.10:1, documented as 'never a verdict') or as a grey caption. The shipped meal card draws the same fact in the amber attention panel (B-693). The title's count line is indented 36px and set in semibold grey.
* *Resolution:* Both heads-ups use the shipped attention panel, lifted into components/ui. The title block uses TrialScreen's titleBlock tokens.
* *Verified:* CONFIRMED. VIS-9 lowered to low. Source ids: VIS-8, VIS-9.

**WBC-7 · Voice pass: the words drift, 'given' counts partial doses, and nav titles come in three forms** (medium, does not gate; Designer, Mobile IA)

* *Where:* Frames 04, 07, 09, 10, 18, 26, 27, 30, 33, 34, 51
* *Evidence:* 'Logged', 'given' and 'went in' count the same doses. GIVEN appears next to D5's words. 'None of it on 3 of 14' has no noun. A notification title carries 'day 7 of 14'. Nav titles come in three forms, and frame-04's back label runs into its title.
* *Resolution:* Write a copy table. 'Logged' is the word for the record, D5's words say how much went in, 'given' is never a count, and every count has its noun. No counter goes in a notification title, and 'Keep going' appears only as a named action. The nav title says whose page it is and drops when a large title follows. Re-run the voice pass after Dr. Chen's edits.
* *Verified:* CONFIRMED. The title collision is a mock artifact; the naming rule stands. Source ids: DES-15, MIA-14, MIAF-9.

**WBC-8 · On the report, a blank reads as an observed normal day, and nothing says which signs are shown** (medium, does not gate; Dr. Chen cold read)

* *Where:* §12 strip legend and footer
* *Evidence:* 'A blank: logged, no sign' means only that some entry existed that day. The absence sentence covers doses only, though the shipped report already prints one for signs. Itching, the reason for cetirizine, has no row.
* *Counterexample:* Oct 5 to 10 look cough-free when only meals were logged, and Oct 10 was cut short because the report was generated that morning.
* *Resolution:* The legend reads 'other entries that day, no [sign] entered'. Carry over the shipped absence sentence for signs. Label a partial day or leave it out, and either show every sign entered or end with 'no other sign was entered'. This gates the §12 milestone.
* *Verified:* CONFIRMED. Source ids: RPT-08, RPT-13.

**WBC-9 · L2 and option B of L5 are drawn on option X's 'Food | Medicines' switch, which W removes** (medium, gates the requirements; Mobile IA, Sam)

* *Where:* frame-38 to frame-40, frame-42 against frame-02
* *Evidence:* All four frames carry X's switch, while W keeps 'Foods' with the medicines row at its foot. frame-42 and frame-02 also place supplements differently.
* *Resolution:* The L2 and L5 briefs say their frames were drawn on X and that the rulings depend on L1. Redraw them on W, and state the header for each L1 outcome.
* *Verified:* CONFIRMED. Source ids: MIA-11, SAM-8.

### Design gaps (43)

**GAP-1 · No slot model exists, yet every frame depends on one** (high, gates the requirements; Engineering, Data Scientist)

* *Where:* Schema (started_at is a DATE); §14 row 1 and M0; frame-23, frame-47, frame-50
* *Evidence:* lib/ has no medication slot. Row 1 stores no planned times and no first-slot part of day, and cadenceOn works by the day. Nyx has doses at 3:30 AM, 1:00 PM and 6:00 PM. US daylight saving ends Nov 1, during Pixel's and Biscuit's twice-daily courses. Nothing says whether a dose's slot is stored or worked out from its time.
* *Counterexample:* A dose at 11:58 PM followed by one at 3:30 AM fills two calendar slots, so no repeat card fires on a near-double. If the first is logged at 12:03 AM instead, it leaves an empty outline and triggers a false repeat card. If slots were stored at write time, removing Jordan's 7:30 PM dose would leave Alex's 9:30 PM dose marked 'extra' forever.
* *Resolution:* Row 1 stores each step's planned times. Pure planSlots and assignDose functions live in lib/medications.ts and are worked out on every read, so Undo, re-time and delete need nothing to reverse them. They state the assignment rule, the tie-break, the off-day case (a dose never claims a future slot) and which time zone anchors the day. Every surface reads them, a guard fails on any other derivation, and fixtures include a daylight saving change and a travelling owner.
* *Verified:* CONFIRMED. DST was found by a verifier; ENGF-8 is a follow-up finding. Source ids: ENG-02, DAT-15, ENGF-8.

**GAP-2 · A second try in one slot, and a dose that doesn't go in, have no record shape and no route to the vet's instruction** (high, gates the requirements; Designer, Dr. Chen, Jordan, Vet tech, Sam)

* *Where:* Dose card; frame-23; frame-45; frame-50 box line; setup
* *Evidence:* Nothing follows None of it, and Mochi's picked-out attempt is lost from the record. frame-50 admits that tablets get re-given. Setup never asks what the vet said to do when a pill is spat out, which is the most common callback.
* *Counterexample:* Pixel spits out her 8 PM dose and Sam gives another. Either the refusal leaves the concern rule, or the slot holds two doses that no rule counts.
* *Resolution:* A retry links to the refused dose in the same slot. The cell shows the last outcome with a second-try mark, the refusal stays counted, and the box counts every tablet. Setup asks, for the owner to answer, 'If a dose doesn't go in, your vet said…', and that answer is only ever shown back in the owner's own words or as a route to the clinic. A critical drug always adds 'worth a call to your vet'.
* *Verified:* CONFIRMED. The 'last dose wins' fixes were refuted because they erase the refusal. Source ids: DES-05, VET-02, JOR-02, VT-01, SAM-3.

**GAP-3 · The repeat check only sees 'given', the retroactive door runs none, and the pill shows when a dose was logged but not what went in** (high, gates the requirements; Engineering, Vet tech, Jordan, Data Scientist)

* *Where:* lib/medications.ts detectDoubleDose; lib/db.ts getDoubleDoseFlag; app/log.tsx retroactive combo; frame-23, frame-31
* *Evidence:* detectDoubleDose skips any dose that isn't 'given', and an unanswered food dose is stored as NULL. The retroactive combo returns before the check runs, and no shipped write links an existing dose to a meal, so saying 'the pill was in this meal' writes a second dose. The pill and the repeat card show the time and vehicle, never the outcome.
* *Counterexample:* S11: two offline phones each log Mochi's 7:30 PM dose and neither answers the card, so neither is flagged after sync. Or on Oct 8 the pill is logged at 6:32 and left unanswered, then the 6:35 meal's '+ gave a med with this' writes a second 'given' dose. Home reads 15 of 15 and the pill leaves while Oct 10's tablet is still in the bottle.
* *Resolution:* slotOccupied counts NULL and None of it, but not Not given. The repeat card fires on an occupied slot, with a floor of half the interval, from every door, and re-runs after every sync. A meal logged after a dose offers 'link this dose', an update by id, and never writes a second dose. Every last-logged line names any outcome other than All of it. A guard fails if the check narrows back to 'given'.
* *Verified:* CONFIRMED. VT-03 corrected to design gap; DATF-F07 is a follow-up finding. Source ids: ENG-06, VT-03, JOR-01, DATF-F07.

**GAP-4 · A second dose that really went in never escalates, and is_critical can neither say which way a drug is dangerous nor match the names owners type** (high, gates the requirements; Dr. Chen, Vet tech, Designer)

* *Where:* §02 C3; frame-23; frame-26; frame-36; lib/medications.ts is_critical and COMMON_MEDICATIONS
* *Evidence:* Every concern level counts doses that did not go in. is_critical is a single 0/1 flag that nothing sets yet (CUL-272), and the only critical marker in code is the name 'Insulin'. A typed 'Vetsulin', 'ProZinc', 'Metacam' or 'Palladia' would not match, although the label reader would resolve the brand.
* *Counterexample:* Biscuit on insulin: two caregivers each give the evening dose, and Home stays quiet through the hypoglycaemia window. Or a free owner types 'Vetsulin' on a pet someone else also doses, and the reminder switch frame-36 forbids appears anyway.
* *Resolution:* CUL-272 stores, for each drug class, which way it is dangerous: missed, extra, or given while she isn't eating. It matches on the confirmed name and brand on both paths, with brand lists signed off by Dr. Chen, plus a form backstop: an injection on a shared pet gets no reminder switch. C3 gains an extra-dose arm that states the fact and says to call the vet now, and on every write path the repeat card states the hazard first.
* *Verified:* CONFIRMED. DESF-9 is a follow-up finding. Source ids: VET-05, VT-04, DESF-9.

**GAP-5 · A dose vomited back up has no state; close the carried S1 instead of inventing a new one** (high, gates the requirements; Dr. Chen, Vet tech, Jordan, Data Scientist, Dr. Chen cold read)

* *Where:* Dose card; §12 dose table; nyx-medication-logging-requirements §11 S1; migration 020
* *Evidence:* D5's words cannot say 'went in, came back up', and a vomit logged from + never touches the dose. S1 has carried a 'vomited_up' value since June, and migration 020 left room for it.
* *Counterexample:* S17: Mochi vomits 10 minutes after her Clavamox. The ledger still fills, and the report says 'ate all of the dosed meal'.
* *Resolution:* Close S1. A witnessed vomit within a window Dr. Chen sets (the shipped 30-minute window is the candidate) shows 'may have come back up' next to the dose, counts as not fully taken (toward C3 for a critical drug), and prints in the report. The owner can confirm it as vomited_up. The copy points to the vet's instruction and never says to give another dose.
* *Verified:* CONFIRMED. Source ids: VET-01, VT-02, JOR-03, DAT-16, RPT-03.

**GAP-6 · The one concern rule is incomplete: some states have no place, critical partials never escalate, one class is undefined, and one clause can't be computed** (high, gates the requirements; Data Scientist, Vet tech)

* *Where:* §02 concern table
* *Evidence:* No cell places 'nothing logged', and 'not answered' appears only in a caption. C3's arms miss Some of it and Not sure. 'May-be-critical' is not defined. 'Held because she didn't eat' needs a stored reason that nothing stores. On an every-48-hours step the window mixes steps, and Home's C1 cell for a course with an end is missing.
* *Counterexample:* Biscuit spits out half her phenobarbital three times while eating normally. That is C1, so Home shows one row in 8 weeks and never turns rose.
* *Resolution:* Write a full table of slot state × drug class × surface, with stated precedence and a fixture for each cell that drives the real function. For a critical drug, Some of it and not answered count toward C3. 'Nothing logged' is stated and never scored as not given. Define the class and how it is matched with Dr. Chen. Give Not given an optional reason that never lowers an escalation, and say whether the window is per step.
* *Verified:* CONFIRMED. VT-09 is PLAUSIBLE; three of the arms were found by verifiers. Source ids: DAT-06, VT-09.

**GAP-7 · C3 reaches Home only through a server-side Signal that can't update offline, and a C3 computed on the phone would bypass the safety gate** (high, gates the requirements; Motion, Engineering)

* *Where:* components/home/SignalZone.tsx; lib/signal.ts; guards/haptics.test.ts
* *Evidence:* Silence, sweep suppression and the spoken arrival all key on server findings marked priorityClass 'safety'. The concern function's list of readers leaves out the Signal. The haptics guard does not scan app/ screens, and no run-order row builds the function.
* *Counterexample:* Biscuit at a cabin: two missed doses are logged offline, and Home shows only an ink row, with no rose, until the phone reconnects.
* *Resolution:* Give concernLevel its own row as a pure module in the Deno closure, with its adversarial pass first. C3 reaches Home as a safety-class finding, and falls back to the local row when the Signal on screen does not have it yet. The C3 render is listed in ALWAYS_SCANNED, proven by mutation, and a test checks that the client and Deno versions give the same result.
* *Verified:* CONFIRMED. Source ids: MOT-9, ENG-05.

**GAP-8 · A lifelong drug's run of refusals stays off Home, and 'her usual' treats a refusal rate as normal** (medium, gates the requirements; Sam, Dr. Chen, Data Scientist)

* *Where:* §02 C1 and C2; frame-10, frame-50
* *Evidence:* C1 shows a lifelong drug on Home only for the first such dose in 8 weeks. 'About one a week is her usual' is printed in grey. 'Her own rate' names no window and includes the very run it is compared against, and the 14% figure holds only at its stated base rate.
* *Counterexample:* Pixel on Sep 27: 3 spat out of 14 is C1, so Home shows nothing unless her meals were also logged as refused.
* *Resolution:* Add a cluster term (2 of the last 4 planned doses, or a second refusal within 96 hours), re-measured against the 14% false-fire rate, and a joint term with refused meals. A lifelong drug asks once and the ask stays. Rates are stated as counts over a named window that ends before the concern window, and 'her usual' is removed.
* *Verified:* CONFIRMED. SAM-2 lowered to medium. Source ids: SAM-2, VET-12, DAT-13.

**GAP-9 · The watching counts' denominator is built from dose logs and from today's unfinished day** (high, gates the requirements; Data Scientist, Sam)

* *Where:* frame-24, frame-25; careContext.ts coverage
* *Evidence:* Coverage counts any event, and a dose is an event, so on a daily course every 'On it' day counts as logged by definition. Today at 9:20 AM is counted as 'no cough'. Under a masking drug only a zero is withheld, not a fall.
* *Counterexample:* Doxycycline (which masks nothing) for a cough, with only doses logged: the screen shows 'On it 0 days · 7 of 7', and the antibiotic gets stopped early.
* *Resolution:* Count only days the owner answered the daily look (lookCoverage's floor), or at least days with an event that isn't a dose, and leave out today. Below the floor, print no count. While a drug could mask the sign, withhold a zero or a fall. Raise the same question for EN-10.
* *Verified:* CONFIRMED. SAM-7 raised to high; today's partial day found by a verifier. Source ids: DAT-04, SAM-7.

**GAP-10 · The watching windows ignore other drugs' masking spans, and the After window starts from the counter** (high, gates the requirements; Data Scientist, Engineering, Dr. Chen)

* *Where:* frame-24, frame-25; lib/maskingSpans.ts
* *Evidence:* Motozol is not in the table and so masks everything. Its tail ends Sep 20, which covers the whole Before window, and its doses outside any course fall inside On it. The caveat names only prednisolone. After says 'Starts once the last dose is logged' before the end question has been answered, and a drug the table doesn't know would print 'can hide coughing'.
* *Counterexample:* A second steroid course starting Oct 30 would have its whole Before window inside the first course's tail.
* *Resolution:* Each window reads every masking span (courses, doses outside a course, visits) and names each one. After keys on the course's ended status, the owner's or vet's end, and has a fixed length. The caveat names signs only for a drug the table recognises.
* *Verified:* CONFIRMED. VET-16 is PLAUSIBLE; the After window and the span's end were found by a verifier. Source ids: DAT-05, ENG-04, VET-16.

**GAP-11 · An off day of an every-48-hours step has no state where the owner's thumb acts** (medium, gates the requirements; Designer, Mobile IA, Dr. Chen)

* *Where:* frame-06, frame-14, frame-23, frame-24
* *Evidence:* The pill stays on off days and says only 'last logged'. 'Next planned' appears only on the course screen. The repeat card's copy ('slot already filled') is false on an off day. A change of interval gets no first-day line, though a change of amount does.
* *Counterexample:* Thu Oct 1, after ten daily tablets: habit plus the pill under the thumb gives an extra 5 mg of steroid.
* *Resolution:* Home's row and the pill put the record next to the plan ('last logged Wed · next planned Fri, Oct 2') and never say 'due'. A day with no planned slot gets a card that states the fact first, and a dose on an off day never claims tomorrow's slot. Test F1's Oct 1 at the fan.
* *Verified:* CONFIRMED. MIA-07 lowered to medium. Source ids: DES-10, MIA-07, VET-09.

**GAP-12 · Strength and amount have no canonical unit, a refill box changes what the plan means, and the item's Strength field rewrites history** (high, gates the requirements; Data Scientist, Dr. Chen, Vet tech, Engineering, Designer, Mobile IA)

* *Where:* frame-28, frame-29; frame-04; D10; migration 020; app/medication/[id].tsx; generate-report item join
* *Evidence:* Amounts are stored in tablets, and mg is worked out from whichever box is current. Manual entry makes strength optional, so a typed refill box gives the catch nothing to compare against. The shipped screen edits the item's strength, and the report reads strength live through the item join.
* *Counterexample:* S7: a 20 mg box arrives mid-taper and the step reads '1 tablet (20 mg)', four times the dose, or the app works out ¼, then ⅛, of a tablet. Editing the item's strength to 10 mg relabels every printed past course.
* *Resolution:* Steps store the prescribed amount in its own unit, together with the strength it was confirmed against. A box of a different strength shows 'Ask your vet or pharmacist how much to give' and never works out a split. A box joining a running course requires its strength and a confirm on both paths. Strength lives on the box and is never edited on the item once a box exists; the migration moves the report's join to the box. Each dose records dose_amount at the time of logging, and a label with a different generic name offers only 'add as a new medicine'.
* *Verified:* CONFIRMED. VT-12 and ENG-14 raised to high; DESF-4 and MIAF-6 are follow-up findings. Source ids: DAT-11, VET-08, VT-12, ENG-14, DESF-4, MIAF-6.

**GAP-13 · Setup needs one spec: order of questions, the same fields on every pet, the ongoing case, the quantity for an until-gone step, and a typed editor built from chips** (high, gates the requirements; Designer, Jordan, Sam)

* *Where:* frame-27, frame-44
* *Evidence:* Reminders are asked before 'who gives it'. Mochi's setup drops fields, and Nyx's setup during her trial has chips that name no food and no trial line. The quantity becomes a bound, and no ongoing course is drawn. There is no path for a first dose the clinic gave. After the T3-E flip the typed step editor becomes every free owner's setup, and it is not drawn.
* *Counterexample:* Pixel's 'Qty 60' becomes 60 doses, and Home asks 'Is this course finished?' about her thyroid drug. A typed q12h x10d step with 15 tablets plans 25 doses against 15 tablets and nothing says so.
* *Resolution:* Order the fields: label fields, what it's for, how it's given, who gives it, reminders, after-plan. Ask 'Does it end?' before proposing any bound. An until-gone step requires the quantity, and the app plainly states any mismatch between the tablets the steps need and the box. Steps are typed as chips (interval, amount with ½ and ¼, end, form), never as free-text directions. On a trial pet the chips name the trial foods, and 'In something else' opens the food picker. Ask whether the clinic gave the first dose.
* *Verified:* CONFIRMED. SAM-10 is PLAUSIBLE; DESF-3 and DESF-11 are follow-up findings; the food picker rule from JOR-16 was restored. Source ids: DES-07, JOR-16, SAM-10, DESF-3, DESF-11.

**GAP-14 · Day 0, the empty household list, and setup when the label reader does not run are not drawn** (high, gates the requirements; Designer, Mobile IA, Trust & Safety)

* *Where:* §01, §04; app/medication-capture.tsx flag-off path; monetization §6.2
* *Evidence:* None of these are drawn: an empty list, a course with no doses, an empty Before window, setup with AI consent off, a reached cap, the flag off, the Premium gate, no network, an unreadable label, or a medicine with no label. The shipped flag-off path hides the camera, and T3-E's not-included state copies it. The consent mock and this mock disagree about whether the label photo is kept.
* *Counterexample:* After the flip, a free owner sets up Mochi's Clavamox with no camera, so the box has no label photo. At the recheck, the vet's 'which strength was the last box?' has no answer.
* *Resolution:* Draw these before rows 2 and 3. Setup is one screen with five reader outcomes, and all of them land on the same fields, the same checks and the same disabled Start, with the label photo pinned above the fields. Snapping a label is part of the record on every tier, under every flag and offline; reading it is the convenience. With AI off, the door offers 'Snap the label to keep it (not read)'. Name each add button by what it creates.
* *Verified:* CONFIRMED. DESF-5 and DESF-7 are follow-up findings. Source ids: DES-03, MIA-13, TNS-11, DESF-5, DESF-7.

**GAP-15 · The end card is drawn four ways, its actions sit below the fold, and nothing lets the owner change or end the course partway through** (high, does not gate; Designer, Mobile IA)

* *Where:* frame-25, frame-35, frame-47, frame-49
* *Evidence:* The ledger sits above the question in frame-25 and below it in frame-47. 'Change the end date' appears twice on one screen. The buttons sit at about 829 to 874pt, and there is no control to change or end the plan partway through.
* *Counterexample:* A vet stops an antibiotic on day 5, and the owner has no control until the end question asks.
* *Resolution:* Use one end card: the record, the ledger, the question, the plan the owner noted, the leftover question, and two actions with a single 'Change the end date'. Set a fold budget so both actions sit above about 810pt for F1 to F6 and S7. Add an always-present 'Change the plan or end it' control. Rule the end-card order conflict before the end-card row.
* *Verified:* CONFIRMED. The fold budget and the mid-course control were found by a verifier. Source ids: DES-06, MIA-04.

**GAP-16 · A dose's course membership is a stored link that is never re-checked, so D4's late tablet and a re-timed dose are counted wrongly, and the leftover answer holds no number** (medium, gates the requirements; Engineering, Jordan, Data Scientist, Vet tech, Dr. Chen)

* *Where:* lib/medicationQueries.ts; lib/medications.ts attributeDoses; frame-35, frame-49
* *Evidence:* The log path and the picker link each dose to the drug's active course with no date check, and an explicit link wins outright in attributeDoses. Neither re-time path checks it again. The leftover question has no number and claims it shows 'how many doses went in'.
* *Counterexample:* Mochi's Oct 5 leftover tablet, logged through the picker, makes the count 28 of 28, where frame-49 draws 27 plus one beside the course. Her 28th dose re-timed past the last slot still counts, so the header reads 27 of 28 over 26 filled cells.
* *Resolution:* Whether a dose is in the count, beside the step, or beside the course is worked out on read, from its time against the plan's slots. medication_id records how the dose was logged and only breaks ties. A late dose can be marked 'the tablet left over'. The leftover is a dated number shown next to the count and never merged into it, and 'Some' routes to the vet. Fixtures: frame-49's Oct 5 dose logged through the picker, and the re-timed 28th dose.
* *Verified:* CONFIRMED. ENGF-4 is a follow-up finding. Source ids: ENG-15, JOR-11, DAT-14, VT-08, VET-11, ENGF-4.

**GAP-17 · Course pills have no place in the fan's budget, and they get reshuffled under a thumb that has learned where things are** (high, gates the requirements; Motion, Engineering, Mobile IA, Accessibility)

* *Where:* lib/fanBudget.ts; components/log/FAB.tsx MAX_SLOTS; frame-17, frame-20
* *Evidence:* No drop order is ever chosen, and at 390 AX3 the pill is dropped. frame-17 swaps a pill for a one-tap treat partway through the day, which breaks CUL-1647.
* *Counterexample:* Alex at AX3 opens + from the reminder, finds no Clavamox pill, and logs a second tablet.
* *Resolution:* A course pill is never dropped: foods go first, then the pills fold into the Medications door. The pill set is fixed at midnight, and a pill whose course ends becomes a door that doesn't write. Its accessibility hint says it writes. Device checks at 320pt and AX3.
* *Verified:* CONFIRMED. MOT-3 lowered to medium. Source ids: MOT-3, ENG-10, MIA-06, A11Y-5.

**GAP-18 · The dose card that asks a question has no VoiceOver model and leaves after 5 seconds under a screen reader** (high, gates the requirements; Accessibility, Motion)

* *Where:* AdherenceChipRow.tsx; momentStore.ts MEDICATION_DURATION_MS; frame-27 chip groups
* *Evidence:* The chips are not a radio group. The 5-second dwell pauses only on touch, which VoiceOver swipes don't trigger. The vehicle chip comes pre-lit. Setup's single-choice chip groups have no radio semantics, and the long course screen has no headings.
* *Counterexample:* Fifteen doses time out as not answered and reach the vet ask. A pre-lit cheese chip records an exposure nobody heard announced.
* *Resolution:* Make each chip set a radio group. Hold the dwell while a screen reader is running (CUL-1224). Announce pre-lit values and answers (C-44). Give the course screen's sections header roles, so the rotor can jump to the caveat.
* *Verified:* CONFIRMED. Setup groups and headings were found by a verifier. Source ids: A11Y-7, MOT-8.

**GAP-19 · The medication ledger needs one component lifted from TrialLedger, not four drawing styles** (medium, gates the requirements; Designer, Mobile IA, Visual Design, Accessibility)

* *Where:* frame-24, frame-25, frame-47, frame-50, frame-41, frame-28; TrialLedger.tsx
* *Evidence:* There are four drawing styles. Twice-a-day cells are about 12pt, step rows don't wrap, and the legends are static. LedgerRow is not exported, LedgerCell carries an offDiet dot, and nothing marks a dose after the end. A long taper's plan card adds a row for every step.
* *Resolution:* Lift TrialLedger behind a wrapper that cannot set offDiet. Use 7 columns at 19pt, a sub-row per slot, a group per step, every planned slot drawn, the end line plus an extension band, and a legend computed from what is shown. Past steps on a long taper shrink to their count line. Export LedgerRow first.
* *Verified:* CONFIRMED. VIS-3 is PLAUSIBLE; plan-card compaction restored from MIA-10. Source ids: DES-13, MIA-05, VIS-5, A11Y-10, VIS-14, VIS-3.

**GAP-20 · None of it, Not given, today and nothing logged differ only by marks that vanish at half-cell size** (medium, gates the requirements; Accessibility)

* *Where:* Mark table; mock .c.split rules; AdherenceChipRow CHIP_HITSLOP note
* *Evidence:* None of it and Not given share one fill (#6B6B6B) and differ only by a 2px white bar, which a split half-cell does not draw. D8 also draws Not given filled, though nothing went in. Today and nothing logged differ only by hue (1.11:1).
* *Counterexample:* On a twice-a-day ledger, a deliberately skipped Clavamox evening draws as a refusal, losing the distinction between the owner skipping and the pet refusing, which AdherenceChipRow exists to keep.
* *Resolution:* The mark table specifies every state at full, half and third cell size. Not given gets its own mark and never borrows the refusal's fill. Today and nothing logged differ by shape, and both outlines clear 3:1. Ruled within Gate 11.
* *Verified:* MOCK_ARTIFACT for the render; the rule stands. The half-cell and shared-fill gaps were found by verifiers. Source ids: A11Y-2.

**GAP-21 · The Pet tab's medication block is drawn three ways, and the row that asks a question sorts last** (medium, gates the requirements; Mobile IA, Jordan)

* *Where:* frame-01, frame-13, frame-53
* *Evidence:* The block is titled 'Current' in some frames and not in others, and past courses sit inside it in some frames and are missing in others. The stale question sorts last, and cetirizine, given as needed, has no row.
* *Counterexample:* Jordan sees an empty 'Current' block and tells the vet there has been no antibiotic this year.
* *Resolution:* Use one block per pet, ordered by what each row asks, with past courses behind a count and as-needed rows included. The shipped Past section is retired. Measure at AX1.
* *Verified:* CONFIRMED. Source ids: MIA-12, JOR-15, MIA-09.

**GAP-22 · L1's option W was judged from a description and a cropped frame** (medium, gates the requirements; Mobile IA)

* *Where:* frame-01, frame-02, the §01 blind check
* *Evidence:* On main's layout, door one falls under the tab bar on Pixel's tab, and no frame draws it there.
* *Resolution:* Show W as an image with each door's measured position at Nyx's and Pixel's density and at AX1. If W is chosen, door one is the bottom row of the pet's medication block, and Foods' bottom inset rises to 88.
* *Verified:* CONFIRMED. Corrected to a medium design gap. Source ids: MIA-03.

**GAP-23 · Medicines at home grows as medicines times pets, never moves ended medicines down, and counts doses without regard to the pet** (medium, does not gate; Designer, Trust & Safety, Engineering, Vet tech, Mobile IA)

* *Where:* frame-03, frame-04; attributeDoses
* *Evidence:* Rows grow as medicines times pets, including 'none logged' lines, and the ended Motozol keeps its place. RegimenWindow has no pet_id, and nothing says whether archived pets appear. A box set up for one pet says nothing when it is used for another.
* *Counterexample:* F5: Nyx's cetirizine doses, which belong to no course, are counted inside Schrödinger's open course.
* *Resolution:* Sort running, then recent, then 'Ended · n'. Fold a medicine's pets with nothing logged into one 'Not logged for …' line. Archived pets appear only where they have doses. attributeDoses refuses to match across pets. A box set up for one pet says so when used for another.
* *Verified:* CONFIRMED. VT-11 is PLAUSIBLE; the ordering rule was restored from MIA-10. Source ids: DES-14, TNS-13, ENG-15, VT-11, MIA-10.

**GAP-24 · Reminder mechanics are undefined: how far ahead they're scheduled, the trigger kind, what happens on Undo, the cap, and what counts as answered** (medium, does not gate; Trust & Safety, Engineering, Sam, Designer)

* *Where:* lib/notifications.ts; lib/followUpNotifications.ts; §05
* *Evidence:* There is one repeating trigger per category, and reconcile only checks whether a category exists. Logging a dose cancels nothing, and an Undo re-arms nothing. Per-course slots bypass the per-account budget, iOS keeps only 64 pending notifications, and self-pruning counts taps, so an owner who logs from + looks like one who ignores reminders.
* *Counterexample:* Phone A ends a course and phone B keeps reminding. Or Jordan logs at 7:15 PM and undoes at 7:20, and the 7:30 reminder never comes back. Or after three days of logging from +, Sam is offered a pause on her cat's lifelong methimazole reminder.
* *Resolution:* In B-227: one-shot DATE triggers over a rolling window. The schedule is a pure function of the record, reconciled using computeFollowUpActions' diff against a plan version. It re-runs on every dose write and reversal, every sync pull, every course write, the switch, and the sign-out epoch. The cap is shared with the daily summary and stays below 64. A dose logged in the slot counts as the answer. The + route is registered with a validated payload, and the offline line is keyed on the last successful pull. This gates row 4.
* *Verified:* CONFIRMED. The cap, plan version and answered rules restored from ENG-11 and DES-16; ENGF-2 is a follow-up finding. Source ids: TNS-01, ENG-11, SAM-9, DES-16, ENGF-2.

**GAP-25 · With two caregivers, both phones buzz at the risky minute, and a phone that hasn't synced makes the slot look open** (high, does not gate; Jordan, Vet tech)

* *Where:* §05, frame-30, frame-31, frame-32
* *Evidence:* Both phones fire before either has logged. The offline line covers only this phone being offline, and the course screen does not show this phone's reminder state.
* *Counterexample:* S11: Jordan logs offline, and Alex's phone, which is online, still shows only the morning dose, so he gives a second tablet.
* *Resolution:* Each phone arms only the slots it is chosen for. The copy points to the other person ('check with them'). The pill line only states what this phone holds. The course screen shows this phone's reminder state in one line. This gates row 4.
* *Verified:* CONFIRMED. Source ids: JOR-14, VT-17.

**GAP-26 · Naming on the lock screen: identical reminders at the same time, an undefined switch scope, and the step-change amount hidden** (medium, does not gate; Designer, Dr. Chen, Accessibility, Trust & Safety)

* *Where:* frame-30, frame-32; migration 050
* *Evidence:* Pixel's two 8 AM courses would produce identical notifications. The switch is scoped 'this phone', against DR-6's account-wide setting and D4. migration 050 allows only 'daily_summary', and the caption leaves out the watch and read-aloud. frame-32 omits the shipped pet-name switch.
* *Resolution:* Send one notification per pet per time, with a count. The switches are per phone and wiped on sign-out, recorded as a departure from D4. The label names every surface the text reaches. Redraw frame-32 with both switches. On the day a step changes, the notification may say 'a new amount today' without the drug's name. This gates row 4.
* *Verified:* CONFIRMED. VET-15 is PLAUSIBLE. Source ids: DES-16, VET-15, A11Y-9, TNS-03, A11Y-16.

**GAP-27 · Row 0F says 'upload after confirm', but the reader reads the label from Storage before confirm** (medium, gates the requirements; Trust & Safety, Engineering)

* *Where:* extract-medication-from-photo; app/medication-capture.tsx; §14 row 0F
* *Evidence:* The extractor downloads the label from a path, and capture uploads before reading. GC-5 A needs the directions parsed, and CUL-1764's purge has already shipped.
* *Counterexample:* A label snapped and then abandoned keeps the owner's address in Storage.
* *Resolution:* Recommended: send the image bytes inline and store the label only at confirm. Pin a closed extractor schema with a fixture that checks personal details are stripped. Drop CUL-1764 from 0F. Review by the RLS and privacy reviewer.
* *Verified:* CONFIRMED. Source ids: TNS-05, ENG-12, TNS-10.

**GAP-28 · Box labels have no delete, no retention rule, no share rule and no export line** (medium, gates the requirements; Trust & Safety)

* *Where:* frame-04; schema row 1
* *Evidence:* Each box keeps a photo of its label, showing name, address and Rx number. 'Remove' archives the box and keeps the photo. A code comment still says SET NULL where the schema now cascades.
* *Resolution:* Add a delete per box with a confirm, a stated retention period, and ON DELETE CASCADE. Labels are shared only through the share sheet. List the new export categories.
* *Verified:* CONFIRMED. Source ids: TNS-07, TNS-08, TNS-12.

**GAP-29 · A masking course that overlaps a diet trial is named only on the report** (medium, does not gate; Dr. Chen cold read, Jordan)

* *Where:* components/trialScreen/; §12 trial section
* *Evidence:* Prednisolone ran on days 58 to 77 of Nyx's 84-day trial, and the trial screen never reads a course.
* *Counterexample:* A quiet end to the trial reads as a response to the diet when it may be the steroid.
* *Resolution:* The trial screen and the report name any overlapping course and the gap between its last dose and the trial's end, never as a verdict. The completion sheet is MFU-15.
* *Verified:* CONFIRMED. Source ids: RPT-07, JOR-04.

**GAP-30 · The report page is drawn only on the gentlest fixture and has no column for not answered** (high, does not gate; Dr. Chen cold read)

* *Where:* §12
* *Evidence:* Only Nyx is drawn, and every refusal cell is a typed 0. A twice-a-day course cannot be drawn, and there is no column for not answered.
* *Counterexample:* Pixel's course, which ran out and was never ended, must not read as 'on it'.
* *Resolution:* Render Mochi, Pixel, Biscuit and an empty account as render tests with computed cells, and add the not answered column. This gates the §12 cold read, not the requirements.
* *Verified:* CONFIRMED. Gating corrected: it gates the next cold read. Source ids: RPT-11.

**GAP-31 · Glyphs: the event glyph is two objects at 14pt, and transdermal reads as a bandage** (medium, does not gate; Visual Design, Designer)

* *Where:* §11
* *Evidence:* Capsule and transdermal share one silhouette, 'Other' reuses the event glyph, and the discs never render.
* *Counterexample:* Pixel's likely next step, transdermal methimazole gel, would be drawn as a wound dressing.
* *Resolution:* Re-render with real discs, list every placement, draw a single-object event glyph at 16pt and below, and redraw transdermal. CUL-493 signs off on a device.
* *Verified:* CONFIRMED. The CSS defect is a mock artifact. Source ids: VIS-7, DES-12, VIS-6.

**GAP-32 · The refill line counts the plan, not the record, and names the latest date** (medium, gates the requirements; Data Scientist)

* *Where:* §10 frame-50, 'The box'
* *Evidence:* frame-50 says the 60 tablets last to about Tue, Oct 13 at 2 a day, with 'Sooner if a spat-out tablet was given again' as a caveat with no date. §10 names running out as the risk for methimazole and phenobarbital.
* *Counterexample:* Pixel: the 53 doses logged up to Oct 10 leave 7 tablets (lasting to Oct 13) only if none of the 5 spat tablets was replaced. If each was replaced, 2 remain and she runs out after the morning of Sun, Oct 11.
* *Resolution:* The box line counts tablets used from the box (slot doses plus extras and re-gives), taking the larger of planned and logged so a forgotten log never delays it. It states the None of it count as the uncertainty, gives the earliest date first, and keys the refill heads-up on it. If the count passes the box quantity, it asks about a new box and never prints a negative number.
* *Verified:* CONFIRMED; restored after the first synthesis dropped it. Source ids: DAT-12.

**GAP-33 · Mochi's twice-a-day screen partway through the course is not drawn, and 'Next planned' can skip today's unlogged slot** (medium, gates the requirements; Jordan)

* *Where:* frame-24, frame-50; golden path A step 6
* *Evidence:* frame-24's 'Last logged / Next planned' is drawn only for a once-a-day course. frame-50's slot-by-slot Today block is drawn only for a medicine with no end.
* *Counterexample:* Sep 24, 9:30 PM, with the 7:30 PM slot unlogged: 'Next planned' either shows a time already past, which implies overdue without saying so, or jumps to Fri 7:30 AM and drops tonight's slot from the one line Jordan reads.
* *Resolution:* Every course with more than one planned dose a day gets frame-50's Today block: one row per slot, showing 'logged HH:MM, outcome' or 'planned', with no verdict word. 'Next planned' never skips today's unlogged slot, which reads 'not logged'. Draw Mochi's Sep 29 screen in the next round.
* *Verified:* CONFIRMED; restored after the first synthesis dropped it. Source ids: JOR-08.

**GAP-34 · The vehicle carried over from the last dose is lit and stored when the card is ignored** (medium, gates the requirements; Data Scientist)

* *Where:* frame-15 ('from her last dose'); §08; frame-45
* *Evidence:* frame-15 lights 'In Selected Protein PR, Wet' while the amount stays unlit. An ignored card, or a VoiceOver timeout, therefore stores the trial food, which matchAllowed never counts, so §08's 'a vehicle nobody named counts' almost never happens.
* *Counterexample:* Sep 27: Jordan uses a chicken pill pocket, taps All of it and leaves the lit vehicle. The dose stores 'In Selected Protein PR', the trial card stays clean, and the report says 'both foods named, both on the list'.
* *Resolution:* The default vehicle comes from the record (the meal this pet logged just before the dose), not from the last dose. Where there is no such meal, the dose stores whether its vehicle was confirmed or carried over, and any 'all matched' claim says how many were carried over. Dr. Chen signs off whether a carried-over allowed vehicle counts.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DATF-F11.

**GAP-35 · The owner's answers at the end of a course have no stored home and no way to undo them, and Keep going has no defined effect** (medium, gates the requirements; Engineering)

* *Where:* frame-17, frame-25, frame-35, frame-47 to frame-49, frame-18; app/(tabs)/profile.tsx; lib/dietTrialCompletion.ts
* *Evidence:* Keep going, the leftover answer, Change the end date, a late dose's 'left over' mark, and Home's three-day ask window have no stated storage. §03 says a course past its length has no pill, frame-17 says Keep going brings it back, and D4 keeps any later dose out of the count. The house's trial Keep going writes a new plan, and its reversible answers use a retraction row.
* *Counterexample:* FX-K1: the PM taps Keep going at 15 of 15, removes the 8:51 dose (it was Schrödinger's) and re-logs Nyx's real 15th. If Keep going was stored as a dismissal, the question never asks again and the pill offers a 16th tablet. F3: Keep going on one phone and Mark as finished on the other resolve by whichever full row was written last, with no trace.
* *Resolution:* List each owner answer with where it is stored and how it is undone. Answers stand when the record later changes, while the counts beside them are recomputed. Keep going either writes a new plan with a named end, as the trial does, or is retired in favour of Change the end date. Home's ask window keys on a date in the record. A reversible answer follows the retraction-row pattern. F3 is stated and tested, and any column-patch sync goes to the PM as a brief against full-row last-write-wins.
* *Verified:* CONFIRMED. ENGF-6 is a follow-up finding. Source ids: ENG-08, ENGF-6.

**GAP-36 · Change time and editing the dose's record are write paths that skip everything a new dose triggers** (high, gates the requirements; Engineering, Mobile IA)

* *Where:* components/ui/MedicationCompletionCard.tsx savePicker; app/edit-event.tsx; app/event/[id].tsx; L4
* *Evidence:* The card's Change time writes, hides the card, and runs no repeat check, Signal refresh or record-change signal. edit-event is the only shipped place a past dose is answered or re-timed, yet round 4 never names it. Change time is drawn on an in-food dose, though the shipped card hides it for a paired dose.
* *Counterexample:* FX-T3: Alex logs at 8:10 AM, then re-times the dose to Sep 20 7:35 PM, where Jordan's 7:30 PM dose already sits. Nothing fires, and the slot holds two doses. Correcting Sep 27's vehicle to cheese in edit-event leaves the trial card's count unchanged unless L6's classification follows the edit.
* *Resolution:* The course screen neither logs nor edits a dose. A dose opens its record, and every correction happens there (a team reading of L4, logged on the issue). Editing the record uses D5's words and L6's vehicle with its trial line, and re-places a re-timed dose by the same rules as a new log. Insert, re-rate, re-vehicle, re-time, reverse and a sync pull all call one after-write hook, and a guard fails on any write to occurred_at or medication_administrations outside it.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: ENGF-7, MIAF-2.

**GAP-37 · Nothing drawn reaches a past dose: a ledger cell is too small to tap, and an unanswered dose counts against her with no way to answer it** (high, gates the requirements; Mobile IA)

* *Where:* frame-24 to frame-26, frame-29, frame-47 to frame-50; TrialLedger.tsx; frame-16
* *Evidence:* Daily cells are about 24.7pt with 4.9pt gaps, and twice-a-day halves are about 12.3pt. No cell is tappable, and the shipped trial ledger is one image whose row links open its lists. 'Tap to say how much she got' appears only on Today, so every unanswered food dose before today stays 'not fully taken'.
* *Counterexample:* Making a 24.7pt cell a 44pt target needs 9.7pt of extra touch area on each side against a 4.9pt gap, which C-5 forbids. Jordan aiming at Mochi's empty Sep 24 evening hits the logged morning. Leaving Oct 2, 6 and 8 unanswered raises 'worth a word with your vet', with nowhere drawn to answer them.
* *Resolution:* The ledger is a drawing (role image, one spoken sentence per row). Each row, a step or a week, opens in place into its planned slots as 44pt rows. A logged or unanswered dose opens its record, and an empty slot shows its date and planned time. Wherever a concern count includes unanswered doses, the course screen lists them by date as rows that open each record. A guard fails if a ledger cell becomes tappable.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: MIAF-1, MIAF-8.

**GAP-38 · Nothing replaces app/medication/[id].tsx: six doors land on it with two kinds of id, and the course screen loses its link to History and to its own label** (high, gates the requirements; Mobile IA)

* *Where:* app/medication/[id].tsx; app/_layout.tsx; lib/historyDoors.ts; lib/rundown.ts; frame-03, frame-04, frame-24, frame-50 to frame-52
* *Evidence:* The shipped route expects an item id. Get ready passes a course id instead (CUL-1350), and opening a dose record from another pet shows the active pet's courses (CUL-764). Round 4 draws three medicine screens with no route table, drops the registered 'See doses in History' link (CUL-488), and gives only the ongoing screen a link to the medicine page.
* *Counterexample:* Sam taps methimazole on Pixel's Get ready and gets 'Medication not found'; a build that simply re-points the route to frame-04 keeps the bug. At Mochi's recheck, Jordan needs five moves to get from the Clavamox screen to the box's label.
* *Resolution:* Add a route table with one row per screen and per sender. An item id opens the household medicine page. A course id opens the course screen, which closes CUL-1350. A dose's drug link opens that dose's course for the record's pet (CUL-764). Every course state carries one set of footer links: the History course link (registered, and re-homed in the PR that retires the old screen), the medicine page and the report. The back label follows where the owner came from.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: MIAF-4, MIAF-5, MIAF-7.

**GAP-39 · The wrong-drug catch exists only where the label reader runs, and on the free path the house list is where the wrong drug gets picked** (high, gates the requirements; Designer)

* *Where:* frame-27 (div.idcheck); §04 table; docs/monetization-and-throttling-requirements.md §3
* *Evidence:* frame-27's 'Not Prednisone 10 mg?' compares what the reader found on the label with Medicines at home. Nothing makes that comparison on the typed path. Monetization §3 makes the reader Premium at the T3-E flip, and names only the strength confirm as available on every tier.
* *Counterexample:* Nyx on Sep 21 after the flip, with a free owner: she types 'pred', taps the house's 'Prednisone 10 mg', and starts the course. Nothing contradicts it, and the course, the ledger and the report all print twice the strength. A Premium owner who snaps the same box is caught.
* *Resolution:* The reader only proposes values, and every check runs on the confirmed fields on every tier. That means a fixed rule that checks the confirmed name against similar names in Medicines at home, a box confirm whenever a course starts from a house entry, and wording on the typed path that never says 'The label says'. M0 gains this rule, with a guard that renders setup under each reader outcome. If it cannot be made a fixed rule, the D-M1 boundary goes back to the PM, because money decisions always go to the PM.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DESF-1.

**GAP-40 · With Juniper active, More events offers Pixel's methimazole as an unnamed tile, and one tap logs it to Juniper as given** (high, gates the requirements; Sam)

* *Where:* components/log/MedicationPicker.tsx; app/log.tsx handlePickMedication; §14 row 3
* *Evidence:* MedicationPicker's Library ignores which pet is active, no tile shows a pet's name, and the tile's hint is 'Logs a dose'. handlePickMedication writes 'given' for the active pet. frame-03 names every pet on every medicine, but that list writes nothing, and the picker that does write is not in §14.
* *Counterexample:* Oct 10, 8:05 PM: Sam logs Juniper's dinner, then picks Methimazole, and the dose lands on Juniper as given. Pixel's 8 PM slot stays empty, her last dose at the T4 recheck reads 8:02 AM, Juniper's report prints an ad-hoc methimazole dose, and once CUL-1700 lands, a drug Juniper never had would be listed as context for her vomiting.
* *Resolution:* The picker follows the household list's rule. Every Library tile carries its line for each pet. The active pet's medicines come first under her name, and the rest come under 'In the house'. The tile's hint names the pet the write goes to. The picker joins row 3, tested with two pets.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: SAMF-1.

**GAP-41 · A dose logged from the picker for one pet can silently reopen another pet's stale course** (medium, gates the requirements; Sam)

* *Where:* §14 M0 one course rule; lib/medicationQueries.ts; frame-18; frame-51
* *Evidence:* The link query matches any active course for that pet with no staleness limit, and M0's one-course rule lets an open course through.
* *Counterexample:* In the PM's house, with Schrödinger active, a cetirizine given to Nyx is logged on Schrödinger and linked to her course, which has been open since Jun 21. The stale question vanishes, her pill returns, Nyx's strip loses a dose, and the course keeps masking every sign for six more weeks.
* *Resolution:* A dose never links silently to a course that has gone stale. The write first asks that course's own question ('Is Schrödinger's Cat's cetirizine still going?'). M0's one-course rule says so, with a test on the PM's fixture.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: SAMF-4.

**GAP-42 · Tapping a reminder opens + for whichever cat is active, with no wait shown, so the pill and the repeat card the reminder relies on may be missing** (high, does not gate; Sam, Motion)

* *Where:* §05 frame-30, frame-31; hooks/useNotificationScheduling.ts; lib/notificationRouting.ts; components/log/FAB.tsx
* *Evidence:* The tap opens a screen with only the source and the time it fired, and nothing selects the pet. frame-31 is drawn for a one-pet house. The page jumps from the lock screen to a settled fan with no wait in between, VoiceOver focus lands on the first row, and at AX3 the pill can be dropped.
* *Counterexample:* Sam logs Juniper's dinner at 7:55 PM. Pixel's 8:00 PM reminder opens Juniper's fan, which has no methimazole pill and no 'logged today at 8:02 AM', so the repeat card cannot fire. Or Alex double-taps a pill that still says 'logged this morning' during a 3-second sync.
* *Resolution:* A medicine reminder carries its pet and course ids. Tapping it switches the active pet, or opens frame-21's door sheet already bound to that pet, and the pet's name leads. + opens at once, with the pill shown waiting and inactive until the sync answers or a named timeout passes. VoiceOver focus lands on that pill, and a pill opened from a reminder is never dropped. If the pet is archived or the course has ended, + opens with no pet-specific choice. Draw the two-pet frame. This gates row 4.
* *Verified:* CONFIRMED. The pet switch, focus and never-dropped rules were restored from MOT-5; SAMF-3 is a follow-up finding. Source ids: SAMF-3, MOT-5.

**GAP-43 · Every masking reader prints an open course past its length as 'On board'** (medium, gates the requirements; Dr. Chen)

* *Where:* lib/maskingSpans.ts assessCourse; lib/screenMasking.ts maskScriptRows; frames 17 and 18
* *Evidence:* assessCourse treats an open course with no end as on board through today, and maskScriptRows labels it 'On board · Prednisolone since Sep 25'. Under D7 a counter never ends a course, so this is a lasting state for Pixel's, Schrödinger's and Nyx's courses.
* *Counterexample:* Pixel's duck trial reaches day 56 on Nov 15, 42 days after her last prednisolone. The sheet or the vet's phone script says she has been on prednisolone since Sep 25, which is false information for a clinician weighing an NSAID.
* *Resolution:* The masking span stays cautious (today plus the tail), but every masking reader prints the last logged dose and 'still open in the record' ('Prednisolone, from Sep 25, last dose logged Oct 4; the course is still open'), never 'On board' or 'stopped'. One helper produces both this and the course row's wording.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: VETF-6.

### Missing follow ups (19)

**MFU-1 · CUL-1710 belongs in M0: a calm commit plays the success haptic** (high, gates the requirements, shipped code; Motion)

* *Where:* store/momentStore.ts playCommitHaptic
* *Evidence:* Every medication dose plays the success double-tap, and M0 makes the calm card the default for every course given in food.
* *Resolution:* CUL-1710 ships with M0's unanswered state or before it, and it needs a new haptic verb for a calm dose.
* *Verified:* CONFIRMED. Source ids: MOT-2.
* *Filed:* carried on [CUL-1710](https://linear.app/projectnyx/issue/CUL-1710) (comment).

**MFU-2 · The requirements have no section on motion and accessibility** (high, gates the requirements; Accessibility, Motion)

* *Where:* The whole page; §14
* *Evidence:* Only one motion is specified, VoiceOver is never mentioned, no ledger is read out as a sentence, and no run-order row has a device check.
* *Resolution:* Add a section modelled on §6 of the trial-screen requirements: a motion table, ledger rows labelled as sentences, rules for the end haptic and for waiting on the label read, and a device pass at 320pt, AX1, AX3, VoiceOver and Grayscale for every row.
* *Verified:* CONFIRMED. Source ids: A11Y-13, MOT-13, A11Y-3, MOT-7, MOT-11, MOT-12.

**MFU-3 · The run order hides rulings and migrations inside M0, ships the pills before anything can read an unpaired dose, and writes the requirements last** (high, gates the requirements; Engineering, Data Scientist)

* *Where:* §14
* *Evidence:* M0 includes a trigger migration and clinical lists. Rows are missing for slots, the write contract, pairing, the concern function, Home and the end card. Row 3 ships the fan pills, but readers only learn a dose's own vehicle at row 5, and the requirements come at row 6.
* *Resolution:* Requirements first. Split M0 and add the missing rows. Row 3 ships only with or after MFU-14, BRK-8's card line and the vehicle precedence. F6's fixture is logged through the pill with no meal link. Restate the forecast as about 25 rows.
* *Verified:* CONFIRMED. DATF-F13 is a follow-up finding. Source ids: ENG-13, DATF-F13.

**MFU-4 · The steps migration has no plan for older app builds still in use** (high, gates the requirements; Engineering)

* *Where:* §14 row 1
* *Evidence:* Nineteen files read doses_per_day, and with whole-row last-write-wins, old builds overwrite the columns.
* *Resolution:* Use expand/contract with a server trigger, ship the report edit in its own PR after the migration is applied, and keep a registry of legacy readers that may only shrink.
* *Verified:* CONFIRMED. Source ids: ENG-07.

**MFU-5 · The fixtures and guards the requirements must name** (medium, gates the requirements; Engineering, Data Scientist)

* *Where:* §00
* *Evidence:* The hard cases have no fixtures, and a guard against forbidden words would fail on main today because of 'Missed'.
* *Resolution:* Name the full set of fixtures and the guards, each proven by mutation. Ship the forbidden-words guard together with D5's words. Lock the watched sign at setup. Register the setup sign list under C-11.
* *Verified:* CONFIRMED. Source ids: ENG-16, DAT-17.

**MFU-6 · The shipped masking table treats Clavamox and three other fixture drugs as masking every sign** (medium, does not gate, shipped code; Engineering, Jordan)

* *Where:* lib/maskingSpans.ts
* *Evidence:* Clavamox, cetirizine, Motozol and phenobarbital all resolve to null, and null masks everything.
* *Counterexample:* Mochi's Signal withholds every zero until Nov 15.
* *Resolution:* File this beside CUL-1892 as its own M0 row. Dr. Chen sets the classes (antibiotic, anticonvulsant, otic, and first- against second-generation antihistamines), and a test checks that every fixture drug resolves. The requirements do not wait on it, because Gate 9's caveat rule names signs only for drugs the table resolves.
* *Verified:* CONFIRMED. Gating corrected: the class rows land in their own row. Source ids: ENG-04, JOR-04.
* *Filed:* carried on [CUL-1892](https://linear.app/projectnyx/issue/CUL-1892) (comment).

**MFU-7 · The shipped trial ledger fails the 3:1 contrast its own comment claims** (medium, does not gate, shipped code; Accessibility)

* *Where:* TrialLedger.tsx FILL_STYLES
* *Evidence:* colorAccent measures 2.26:1, and no contrast test covers it.
* *Resolution:* Bring it to Gate 11's mark table alongside CUL-1890, correct the comment, and add trial ledger rows to the contrast test.
* *Verified:* CONFIRMED. Source ids: A11Y-14.
* *Filed:* carried on [CUL-1666](https://linear.app/projectnyx/issue/CUL-1666) (comment).

**MFU-8 · Abandoned label photos stay in the bucket for the life of the account** (low, does not gate, shipped code; Trust & Safety)

* *Where:* nyx-medication-photos
* *Evidence:* Photos are uploaded before any row exists, and only account deletion removes them.
* *Resolution:* Run a one-time sweep for each user before the public release.
* *Verified:* CONFIRMED. Source ids: TNS-06.
* *Filed:* carried on [CUL-231](https://linear.app/projectnyx/issue/CUL-231) (comment).

**MFU-9 · Follow-ups for the report milestone: header, minimum type size, fax test, provenance, who the notes are for, and the last dose before a visit** (medium, does not gate; Dr. Chen cold read, Accessibility, Visual Design, Trust & Safety, Vet tech)

* *Where:* §12
* *Evidence:* Text runs below the 10px floor. There is no running header or page count. The 'print' render is just the screen render. Provenance is thin, and the disclosure does not mention medicine notes. The page cannot say 'last dose before this visit' and does not count a dose given after the end.
* *Resolution:* Build it inside the report stylesheet, and test with a real PDF and a fax pass. Show who logged each dose and when it was entered. Name medicine notes in the disclosure. For a monitored drug on the day of a booked visit, print 'Last dose before this visit', with the true last dose including any given after the end.
* *Verified:* CONFIRMED. VT-16's recheck request was restored here. Source ids: RPT-09, RPT-10, A11Y-11, VIS-11, RPT-12, TNS-09, VT-16.

**MFU-10 · Shipped: the dose card cuts off the drug name it exists to confirm** (medium, does not gate, shipped code; Designer, Visual Design, Accessibility)

* *Where:* components/ui/MedicationCompletionCard.tsx; frame-15
* *Evidence:* 'Logged · {drugName}' and the combo sub-label are both limited to one line, so the card renders 'Logged · Prednisol…'. Pixel's two tablets share one glyph, so the name is the only way to tell them apart.
* *Counterexample:* At AX2, Sam cannot see whether she logged prednisolone or a second methimazole.
* *Resolution:* File now: the drug name and strength are never cut off, and 'Logged' and the time give way first (C-8). Add an AX2 fixture with Pixel's two tablets.
* *Verified:* CONFIRMED. Moved from broken: a defect in shipped code to file now. Source ids: DES-17, VIS-13, A11Y-6.
* *Filed:* filed as [CUL-1922](https://linear.app/projectnyx/issue/CUL-1922).

**MFU-11 · Shipped: notifications outlive sign-out and account deletion** (medium, does not gate, shipped code; Trust & Safety)

* *Where:* lib/notifications.ts cancelAllScheduledNotifications; delete-account; notificationRouteDecision
* *Evidence:* Sign-out cancels only scheduled notifications, so delivered ones stay. delete-account cannot reach another phone's schedule. The tap handler checks that a session exists, never which account it belongs to.
* *Resolution:* File now against the shipped foundation. wipeLocalSession dismisses delivered notifications (extend AC 7, with a test). The delete confirmation says reminders on another phone stop when that phone opens Culprit. B-227 adds an account check on the tap.
* *Verified:* CONFIRMED. Moved from broken. Source ids: TNS-02.
* *Filed:* filed as [CUL-1921](https://linear.app/projectnyx/issue/CUL-1921).

**MFU-12 · Shipped: logging a dose never refreshes the Signal, so a refusal's safety row appears late and a corrected tap can leave a false one up for 24 hours** (high, gates the requirements, shipped code; Engineering)

* *Where:* lib/medicationDose.ts insertMedicationDose, rateDoseAdherence, recordDoseHowGiven; MedicationCompletionCard savePicker
* *Evidence:* medicationDose.ts's header still says the Signal refresh waits for PR 9, which has since landed. Only Undo, meals and edit-event's time change trigger a refresh, so otherwise the Signal waits for its 24-hour cache to expire or a pull to refresh.
* *Counterexample:* Biscuit: Fri 7 PM Not given and Sat 7:04 AM None of it, with no meal logged. C3's rose 'call your vet today' waits until Saturday's cache expires. A None of it tapped by mistake and corrected to All of it keeps a false safety row up for up to 24 hours, while Undo would have cleared it in 5 seconds.
* *Resolution:* File now: logging a dose triggers a Signal refresh for the pet on the record (the pet read from the row), and the stale comment is removed. In the revamp, the refresh lives in the one after-write hook (GAP-36), with fixture FX-D1 checking that both surfaces update within one refresh.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: ENGF-1, ENGF-9.
* *Filed:* filed as [CUL-1916](https://linear.app/projectnyx/issue/CUL-1916).

**MFU-13 · Shipped: a dose linked to a removed meal is read three ways by the app's trial, the report and History** (high, gates the requirements, shipped code; Engineering, Data Scientist)

* *Where:* lib/dietTrialFacts.ts dosesQuery; generate-report report.ts and trial.ts; lib/db.ts timeline join
* *Evidence:* A node probe running dosesQuery confirmed it still finds a deleted meal's food, because the join never checks the meal's deleted_at. The report builds its events only from rows that are not deleted, so it treats the vehicle as unknown and classifyDose counts that as an exposure. History shows the dose on its own.
* *Counterexample:* Nyx's 8:50 AM meal is removed because it was logged twice. Home's trial card reads 3 off-diet feedings and the vet report reads 4.
* *Resolution:* File now: dosesQuery checks the linked meal's deleted_at. In the revamp, one shared reader treats any link to a removed record (meal, retry, leftover) as absent and classifies the dose by its own stored vehicle. The app, generate-report and Ask all import it, and a guard catches any join that does not check its target's deleted_at.
* *Verified:* CONFIRMED (follow-up, node probe). Source ids: ENGF-5, DATF-F12.
* *Filed:* filed as [CUL-1917](https://linear.app/projectnyx/issue/CUL-1917).

**MFU-14 · Shipped: the vet report says no dose was given in food over doses logged as given in food** (high, gates the requirements, shipped code; Data Scientist)

* *Where:* supabase/functions/generate-report/report.ts medicationVehicles; render.ts vehicle row
* *Evidence:* medicationVehicles is built only from doses linked to a meal, and render.ts prints 'no dose in this window was logged as given in food' whenever no dose is linked. generate-report never reads how_given at all.
* *Counterexample:* Mochi's 28 Clavamox doses are logged from the pill as 'In Selected Protein PR', two of them in cheese, none linked to a meal. The vet report's 'Food used to give medication' row says no dose was given in food, on an elimination trial.
* *Resolution:* File now: the vehicle row reads each dose's own vehicle as well as any linked meal, and states 'N given in food, M with the meal named, the rest not linked to a logged meal'. The 'no dose' sentence prints only when no dose names an in-food vehicle. Nothing ever creates a meal just to make a link, because that would count a day with only a pill as a covered trial day.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DATF-F03.
* *Filed:* filed as [CUL-1918](https://linear.app/projectnyx/issue/CUL-1918).

**MFU-15 · Shipped, and due Sat Oct 17: the trial completion sheet prints before and during counts without reading any course** (high, gates the requirements, shipped code; Dr. Chen)

* *Where:* lib/dietTrialOutcomeFacts.ts; lib/dietTrialCompletion.ts buildOutcomeSheet; components/profile/TrialCompletionSheet.tsx
* *Evidence:* dietTrialOutcomeFacts reads only event types and times, and the sheet is not one of the masking readers. For Nyx's courses, maskingSpansFor covers all 84 trial days (Motozol's tail runs to Sep 20, and prednisolone starts Sep 21), yet the sheet still prints before and during counts. A rise in a masked baseline, or after a steroid stops, would also read as the diet failing.
* *Counterexample:* Nyx on Oct 17: a fall in itch or vomiting prints with no drug named, next to a Save that ends the trial. A dog given oral prednisolone during a 56-day 'before' stretch shows 'Itch: 4 before · 18 during', and the owner drops a diet the vet has not yet judged.
* *Resolution:* File now in the diet-trial area. The sheet applies the shipped D2 rule in both directions: a fall or a zero in a stretch that a course touches goes quiet, and a rise always shows with the course named and dated. It names each course that touches either stretch, and takes a required masking input with no default. Tests drive Nyx's case and a Cytopoint-at-day-0 case. No build can land by Oct 17, so tell the PM that Nyx's sheet will not account for prednisolone or Motozol.
* *Verified:* CONFIRMED (follow-up, probe against the real modules). Source ids: VETF-1, VETF-4.
* *Filed:* filed as [CUL-1915](https://linear.app/projectnyx/issue/CUL-1915).

**MFU-16 · Shipped: offline, capture says the label photo is saved when it was never uploaded** (medium, gates the requirements, shipped code; Designer)

* *Where:* app/medication-capture.tsx; lib/storage.ts; lib/sync.ts presyncMedicationItems
* *Evidence:* uploadPhoto throws because there is no queue, yet the edit step still says the photo is saved. The save writes a path for an object that was never uploaded, and nothing retries. This fails PR 5's acceptance criterion.
* *Counterexample:* Jordan sets up Clavamox in the vet's car park with no signal. At the recheck, the box's label is not in the app.
* *Resolution:* File now. In 0F: keep the photo on the phone and queue its upload with the box, say 'Not read: no connection', never claim the photo is saved until it is, and offer 'Read it now' once when the connection returns.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DESF-8.
* *Filed:* filed as [CUL-1920](https://linear.app/projectnyx/issue/CUL-1920).

**MFU-17 · The monetization spec and its test matrix still describe the capture screen this track replaces** (medium, does not gate; Designer)

* *Where:* docs/monetization-and-throttling-requirements.md §3, §6.2, §11; constants/monetizationCopy.ts
* *Evidence:* The spec's notes name only the strength confirm as available on every tier, its test matrix covers only 'Med capture', and the early-access line has no place in round 4's flow.
* *Counterexample:* T3-E passes on the capture screen while course setup, adding a box and the house-list catch go untested, so the gate flips with the safety catch available only to Premium owners.
* *Resolution:* Propose the Tier 2 edit that names every setup check available on every tier. Add §11 rows for course setup and for adding a box, under each reader outcome. Keep the early-access line on the snap door until T3-E. Add a blocks relation from the setup row to T3-E.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DESF-12.

**MFU-18 · Shipped: the report's trial block drops a course that ended before the trial, though its masking tail runs into it** (medium, does not gate, shipped code; Dr. Chen)

* *Where:* supabase/functions/generate-report/trial.ts medicationOverlap; render.ts §7.2 caveat
* *Evidence:* medicationOverlap skips a course that ended before the trial started, so §7.2 can print its affirmative 'supports interpreting it', while the masking engine runs that course's span to its end plus 42 days.
* *Counterexample:* Oral prednisolone from Jul 10 to 24 and a trial from Jul 26: the report says no medication overlaps the trial.
* *Resolution:* File against the report. One overlap function (end plus tail, from maskingSpans) feeds both the trial block and the completion sheet, with real dates ('ended Jul 24, 2 days before the trial'), and fires §7.2's caveat.
* *Verified:* CONFIRMED (follow-up, code read). Source ids: VETF-5.
* *Filed:* filed as [CUL-1919](https://linear.app/projectnyx/issue/CUL-1919).

**MFU-19 · The requirements must not present M0's same-pet check as a guard against wrong-pet doses** (low, does not gate; Sam)

* *Where:* §14 M0; .claude/rules/migrations.md C-38
* *Evidence:* A wrong-pet methimazole dose has no course link, and the medicine catalogue is per account, not per pet, so the relational check has nothing to compare and passes.
* *Counterexample:* Juniper with Pixel's methimazole passes the check, and so does Schrödinger with Nyx's cetirizine linked to Schrödinger's own course.
* *Resolution:* Describe the check as relational integrity only, say that wrong-pet cases are handled by GAP-40, GAP-41 and GAP-42, and put the same note in the guard's file.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: SAMF-5.

### PM decisions (18)

**PMD-1 · The headline count and the end trigger depart from ratified D1 without a brief** (high, gates the requirements; Engineering, Data Scientist, Dr. Chen, Jordan, Sam)

* *Where:* frame-06 to frame-09, frame-26, frame-47, frame-50; §09
* *Evidence:* The headline switches from 'dose 14 of 15' (doses delivered) to '15 of 15 logged' (any outcome), and §09 opens the end question as soon as any dose sits in the last slot. D1 (PM, Jul 31) counts given plus partial so that a run of refusals at the end never reads as complete, and no brief names the departure.
* *Counterexample:* A course counted in doses whose last three doses are spat out reads 'N of N logged · Is this course finished?' with three not delivered. On Mochi's course, which is counted in days, the problem is disclosure: Home's '28 of 28 logged' hides three None of it.
* *Resolution:* See Gate 7. Every count string maps to one named function (slots planned, doses logged, therapy delivered, tablets used), and 'given' never labels a partial dose.
* *Verified:* CONFIRMED. ENG-01's Mochi example corrected: the shipped days trigger would also ask on Oct 4. Source ids: ENG-01, DAT-08, VET-10, JOR-07, SAM-6.

**PMD-2 · Is it working: what prints beside the drug (a persona conflict)** (high, gates the requirements; Data Scientist, Dr. Chen cold read)

* *Where:* frame-24, frame-25; §12
* *Evidence:* The windows being compared are of unequal length. The shipped EN-10 never compares two windows, and the 25% fall in Nyx's count is about what regression to the mean alone produces.
* *Counterexample:* A 5-day course with an unchanged rate prints 3, then 1.
* *Resolution:* See Gate 9.
* *Verified:* CONFIRMED. Source ids: DAT-01, RPT-05.

**PMD-3 · D5 and L5 together: what the dose chip records for a pill given in food (a persona conflict)** (high, gates the requirements; Dr. Chen, Data Scientist, Sam, Jordan)

* *Where:* frame-25 against §12; frame-16; frame-41, frame-43
* *Evidence:* The app says the 11 doses went in only partly, while the report says that amount is not known, and the drawn report quietly takes one side. Juniper shares Pixel's bowl. With no meal link on the pill path, Sam's option leaves the bowl recorded nowhere.
* *Counterexample:* Mochi finishes the bowl and leaves the pill; if the dose and the bowl are linked, this reads as a refused meal. Nyx's pill doses are logged with unrated meals and 'Some of it' on 9 cards; under Sam's option with no meal link, the intake lane sees zero part-eaten meals for a cat on prednisolone.
* *Resolution:* See Gate 10, which is ruled after Gate 3 defines both the linked and the unlinked case. Whichever option is chosen, the report reads the bowl from the meal, and the requirements say what a dose's 'how much' means when another pet shares the bowl.
* *Verified:* CONFIRMED. JOR-17 is PLAUSIBLE; DATF-F08 is a follow-up finding. Source ids: VET-14, DAT-09, SAM-5, JOR-17, DATF-F08.

**PMD-4 · D8's tones fall below the contrast floor (better than the rule)** (high, gates the requirements; Accessibility, Visual Design)

* *Where:* §04 marks; constants/theme.contrast.test.ts
* *Evidence:* 'Some of it' measures 1.37:1 against the card, all against some measures 1.66:1, and the trial's own filled cell measures 2.26:1. Under deuteranopia, all of it and none of it become two greys 2.19:1 apart. CUL-1165 already ships a partial dose as a shape (a broken line) and retired the paler 'left some' tone because owners could not see it.
* *Counterexample:* In greyscale, Nyx's step 1 (9 some of it, 1 all of it) reads as 'mostly still to come'.
* *Resolution:* The rule being challenged is D8 (PM, Oct 12), which protected two things: no half fill that reads as half a tablet, and one visual language with the trial screen. The better option keeps that grammar and adds measured contrast floors plus a channel other than tone for the refusal and the partial dose. Both protections still hold. See Gate 11. The accessibility lens's proposed numbers are not carried forward (colorAccentGlyph against the some-of-it fill is only 2.39:1).
* *Verified:* CONFIRMED. Source ids: A11Y-1, VIS-1.

**PMD-5 · One colour for a dose's answer on every surface** (high, gates the requirements; Visual Design)

* *Where:* frame-07, frame-10; AdherenceChipRow; lib/rowChips.ts
* *Evidence:* 'Some of it' is rose on Today and teal on the ledger. The shipped meal tags already use three tiers: All and Most in teal, Some in grey, Picked at and Refused in rose.
* *Counterexample:* Nyx's 11 partial doses get the mildest mark on the screen.
* *Resolution:* Decided within Gate 11: the meal's three-tier tones on Today's tags, and ink on every summary. This changes the shipped AdherenceChipRow rose for partial doses.
* *Verified:* CONFIRMED. Source ids: VIS-2.

**PMD-6 · The vet's after-plan chips** (high, does not gate; Designer, Vet tech, Jordan)

* *Where:* frame-27, frame-44, frame-47
* *Evidence:* 'Stop' can print at the target in the vet's voice. 'Recheck first' loses what the vet meant. 'Taper down' can be saved with no steps.
* *Counterexample:* 'Your vet said: stop.' appears next to Mark as finished.
* *Resolution:* Gate 5 writes down what must hold whatever the chips are: the after-plan always shows in the owner's voice with its date, never on the end card, and a 'Taper down' with no steps is flagged from day 1. Which chips setup offers (dropping 'Stop', splitting 'Recheck first' into 'stop, then recheck' and 'keep giving until the recheck') is ruled with Dr. Chen's sign-off before the setup row.
* *Verified:* CONFIRMED. JOR-10 is PLAUSIBLE and lowered to low. Source ids: DES-08, VT-07, JOR-10.

**PMD-7 · D2: Home's course row, with a cap, a rule for when it shows, and an exit** (high, gates the requirements; Designer, Mobile IA)

* *Where:* frame-06, frame-07, frame-18
* *Evidence:* Measured against main's chrome, a single row pushes the look's chips under the tab bar, and there is no cap. A course that has reached its target has no exit from its end question, while the stale case moves to the Pet tab after three days.
* *Counterexample:* Two courses after a dental visit push the look off the first screen.
* *Resolution:* See Gate 12. D2 is already briefed as better than the Sep 19 rule; this adds the cap, the rule for when the row shows, and the exit.
* *Verified:* CONFIRMED. Source ids: DES-18, MIA-02.

**PMD-8 · L3b: every lens now says the course pill stays** (medium, does not gate; Motion, Jordan)

* *Where:* frame-19 against frame-22; MedicationPicker
* *Evidence:* Collapsing the pill puts a one-tap treat under the thumb and removes the last-logged fact, and the picker shows no history.
* *Resolution:* Recommend that the pill stays. Every path that logs a dose shows the last logged dose with its outcome and goes through the repeat check, and the set of pills is fixed at local midnight. Rule before row 3.
* *Verified:* CONFIRMED. Source ids: MOT-4, JOR-12.

**PMD-9 · The repeat card stops a dose before it is written (better than Principle 1)** (medium, gates the requirements; Jordan)

* *Where:* frame-23; lib/medicationDose.ts applyLogTimeDoubleDoseCheck
* *Evidence:* The shipped check runs after the dose is saved (B-157, Principle 1). Round 2 asked for the card to state the fact with Undo. frame-23 moves it before the write, with Cancel as the way out, and no brief was written.
* *Counterexample:* At 9:30 PM Alex needs to give the dose because Jordan's 7:30 entry was Not given, and a card before the write steers him to Cancel.
* *Resolution:* The rule being challenged is Principle 1 together with the shipped after-the-write note, which protect against asking for decisions at the moment of the event. The better option stops the write only when the slot's dose already went in, where avoiding a second antibiotic or insulin dose is worth one decision. In every other case the protection stays exactly as it is. See Gate 8.
* *Verified:* CONFIRMED. Source ids: JOR-13.

**PMD-10 · The G4 brief overturns more than G4, and the pet's name on a reminder needs its own ruling** (medium, does not gate; Trust & Safety, Sam)

* *Where:* §13 G4; frame-30 to frame-34; app/settings/notifications.tsx; hooks/useFollowUps.ts
* *Evidence:* The brief names only G4, but the drawn reminders also break G1 (counts and plan dates on the lock screen), DR-6 together with CUL-1419 decision 5 (a pet's name only when the owner opts in), the settings promise line, and D4. frame-30 names the pet unconditionally, and frame-32, captioned as the shipped screen, leaves out the DR-6 row and the promise line.
* *Counterexample:* Sam's multi-pet lock screen would name Pixel twice a day with no switch to turn it off. With names off, both cats' 8 PM reminders look identical.
* *Resolution:* Reissue the brief naming every ruling it overturns. Sam and Trust & Safety both recommend showing the pet's name by default on medicine reminders, recorded as an exception to DR-6, with the medicine's name behind its own per-phone switch, no count or date in any notification body, and the promise line rewritten in the same PR. This gates row 4.
* *Verified:* CONFIRMED. SAMF-6 is a follow-up finding. Source ids: TNS-04, SAMF-6.

**PMD-11 · May a dose celebrate before the owner answers?** (medium, does not gate; Motion)

* *Where:* §03
* *Evidence:* A pre-lit 'All of it' plays the gold and the haptic before the owner can say she spat it out.
* *Counterexample:* Pixel's spat tablet gets a celebration every week.
* *Resolution:* Options. A (recommended): celebrate only on the owner's own tap. B: stay calm only for critical drugs. C: keep the shipped behaviour. Dr. Chen decides the tone for a D4 dose.
* *Verified:* CONFIRMED. Source ids: MOT-16, MOT-1.

**PMD-12 · There is no table of side effects a drug can cause** (high, does not gate; Vet tech)

* *Where:* §02
* *Evidence:* The concern rule only looks at whether doses went in.
* *Counterexample:* A cat on meloxicam vomits on day 3, and nothing escalates.
* *Resolution:* Dr. Chen keeps a short table of adverse signs, and a listed sign tells the owner to call the vet. This is clinical scope, so the PM rules.
* *Verified:* PLAUSIBLE. Source ids: VT-15.

**PMD-13 · GC-5 A leaves out the label's instructions about food, storage and discard date (better than the rule)** (medium, does not gate; Vet tech)

* *Where:* §04 setup
* *Evidence:* 'With food', 'Refrigerate' and 'Discard after' are never asked for.
* *Counterexample:* Doxycycline given to a cat with no food or water risks injuring its oesophagus.
* *Resolution:* The rule being challenged is GC-5 A (PM, Oct 12), which protects three things: no label text is stored, the owner confirms every field, and the AI consent gate stays in place. The better option adds three structured fields the owner confirms, and all three protections still hold.
* *Verified:* PLAUSIBLE. Source ids: VT-10.

**PMD-14 · Whether an empty slot on the course screen opens + to fill in a missing dose** (high, does not gate; Mobile IA)

* *Where:* Stress sheet A4; frame-23, frame-35, frame-47 to frame-49; lib/historyDays.ts
* *Evidence:* Stress case A4 has no frame. The repeat card offers no 'it was an earlier dose', the pill is gone after the end, History works in whole days so a missing evening is invisible there, and the course screen names the gap but gives no way to fill it (L4).
* *Counterexample:* Mochi on Oct 4: a fill-in button turns the end card into 28 of 28, while the leftover tablet shows a dose was missed, so 29 tablets are logged from a 28-tablet box. With no button, the only way to log Alex's real Sep 24 dose is More events, then the picker, then Change time.
* *Resolution:* Decision brief. Deciding: whether an empty slot opens + preset to its planned time. Options: (a, recommended) yes, from the opened ledger row and the sentence that names the gap; the write still happens on +, a dose logged more than a day late is shown as 'logged Oct 4 for Thu, Sep 24 evening' on the end card and in the report, and the box count flags more doses than tablets. (b) No button; the repeat card gains 'It was an earlier dose'. (c) Neither. Consequence: (a) adds a 'logged later' fact the report must print, which is Dr. Chen's call. Rule before row 2.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: MIAF-3.

**PMD-15 · Whether the first dose of a medicine for a pet who has never had it asks first, when another pet's record holds it** (high, does not gate; Sam)

* *Where:* app/log.tsx handlePickMedication; docs/nyx-multi-pet-requirements.md
* *Evidence:* No history check sits between the tap and the write, multi-pet v1 rules out moving a dose to another pet, and the direct card closes itself with All of it already lit. frame-03 admits Juniper eats from Pixel's bowls, so a real accidental dose must still be recordable.
* *Counterexample:* Asking whenever the pet has no course fires on all 17 of Nyx's as-needed cetirizine doses, which fails Principle 1. Asking only when the pet has never had a dose and another pet has fires once per pet and medicine pair, and never for a new account's first medicine.
* *Resolution:* Decision brief. Deciding: whether that first dose asks before it writes. Options: (A, recommended) one sheet, once per pet and medicine pair, ever: 'Methimazole is Pixel's. Who had it?', with each pet as an answer that writes and no cancel. (B) No question; rely on GAP-40's names. (C) Write first, then offer 'Move to Pixel', which reopens multi-pet v1. Consequence: A adds one tap on a rare path; B leaves stray doses to be found later on the report. This is clinical and always goes to the PM. Rule before row 3.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: SAMF-2.

**PMD-16 · Where the word Premium may appear, now that setup carries symptom chips** (medium, does not gate; Designer)

* *Where:* frame-27 sign picker; monetization §7.3 and strategy §16.1 #3
* *Evidence:* The redesigned setup puts symptom words on the same scroll where a cap or not-included band would appear, and §16.1 #3 says Premium never appears near a symptom.
* *Counterexample:* After the flip, 'Label reading is part of Premium' sits two fields above Pixel's 'Loose stool' chip.
* *Resolution:* Options. A (recommended): on the snap door only, while the setup band says only 'Not read. Fill in what the box says; the label photo is kept with this box'. B: in the setup band, with the care-first line. C: nowhere in the flow. Consequence: A moves T3-E's line to the door. Money always goes to the PM.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: DESF-6.

**PMD-17 · Whether a masking course changes the trial's named Keep going default** (medium, does not gate; Dr. Chen)

* *Where:* lib/dietTrialCompletion.ts extensionDays, milestoneNote; lib/maskingSpans.ts MASK_TAIL_DAYS
* *Evidence:* Both the GI default (+14 days) and the skin default (+28) end inside the 42-day masking tail of Nyx's last prednisolone dose. MASK_TAIL_DAYS answers whether a zero may print, not how long a diet should run.
* *Counterexample:* Lengthening the trial to last dose plus 42 days adds six weeks of a restrictive diet for oral prednisolone, which stops suppressing itch within about two weeks.
* *Resolution:* Options. (a, recommended) Keep the default, and add 'Nyx had prednisolone until Oct 10. It can hide the signs this trial is watching, so ask your vet how long to keep going.' (b) Lengthen to the last dose plus 42 days, rejected under C-34. (c) Per-drug washout lengths after CUL-583. This is clinical and goes to Waiting on PM.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: VETF-2.

**PMD-18 · Whether the completion sheet's quieting covers vet visits as well as courses** (medium, does not gate; Dr. Chen)

* *Where:* lib/maskingSpans.ts VISIT_NO_ZERO_DAYS; lib/screenMasking.ts
* *Evidence:* The span rule treats every visit as an unrecorded masking drug for 42 days, because an injection given in the room never enters `medications`, and most trials a vet starts begin at a logged visit.
* *Counterexample:* A skin consult on Jul 26 with Cytopoint given in the room and not logged: a rule covering courses only prints 'Itch: 30 before · 6 during'.
* *Resolution:* Options. (a, recommended) Yes: one span rule, with maskCaption's sentence about the visit. (b) Courses only, with a line naming the visit. (c) Withhold the whole comparison whenever anything overlaps. Consequence: (a) narrows the 2026-07-25 'leads with data' ruling, named as a re-ruling, and CUL-1446 then lifts it visit by visit.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: VETF-3.

### Backlog (4)

**BKL-1 · The door sheet's More events link looks like a caption** (low, does not gate; Accessibility)

* *Where:* frame-21
* *Evidence:* It has no row height and nothing that shows it can be tapped.
* *Resolution:* Make it a full row of at least 44pt, or say plainly where other medicines are logged.
* *Verified:* CONFIRMED. Source ids: A11Y-15.

**BKL-2 · Drops, gels and transdermal medicines need a site field** (low, does not gate; Vet tech)

* *Where:* Setup; D5 chips
* *Evidence:* The report prints 'which ear not recorded'.
* *Resolution:* Add a site field the owner confirms, and choose the dose words for each form.
* *Verified:* CONFIRMED. Source ids: VT-18.

**BKL-3 · Copy nits on the report** (low, does not gate; Dr. Chen cold read)

* *Where:* §12
* *Evidence:* 'One day axis' reads as 24 hours, and the same state is called both 'Not recorded' and 'None recorded'.
* *Resolution:* Title the strip 'by day', use one phrase, and keep the status column to status only.
* *Verified:* CONFIRMED. Source ids: RPT-14.

**BKL-4 · Nothing in the masking model can hide a refusal: appetite stimulants and steroids are invisible to the intake lane** (low, does not gate; Dr. Chen)

* *Where:* lib/maskingSpans.ts MaskSign; lib/analytics.ts IntakeDeclineInput
* *Evidence:* The completion sheet's only protection against a refusal is the intake-decline headline, which reads only meals. Mirtazapine is the first chip a cat owner sees.
* *Counterexample:* A cat on transdermal mirtazapine eats the trial diet only because of the stimulant, and the sheet prints 'Days you logged any food: 56 of 56'.
* *Resolution:* Add an intake effect to CUL-583's per-drug table, as a disclosure only, never a suppression of the decline lane.
* *Verified:* CONFIRMED (follow-up, self-verified). Source ids: VETF-7.

## What held

The strongest falsification attempts that failed, from the synthesis:

* Data Scientist: the trial food used as the vehicle for every dose washes out cleanly, because classifyDose ignores an on-list vehicle and detector one drops vehicle meals.
* Several lenses: every count adds up across §00 to §12 (Nyx 15 = 4 + 11, Pixel 55 = 50 + 5, Mochi 27 of 28).
* Designer and Motion: nothing on Home or the course screen fills, glows or celebrates when a course reaches its target.
* Jordan: with both phones synced, the course pill answers 'has she had it?' without writing anything, and the repeat card catches the 9:30 PM double dose.
* Dr. Chen and Sam: no 'missed', 'due' or 'overdue' appears in any proposal frame.
* Vet tech: when Biscuit refuses doses while eating normally, Home leads in rose with 'worth a call to your vet today'.
* Sam: Pixel's spat pill plus a refused meal is never called picky, and the intake row leads.
* Data Scientist (follow-up): unlinked doses err toward warning for intake, because the intake lane reads each meal's own rating.
* Dir. of Engineering (follow-up): counts hold up under Undo and soft delete, because every dose reader filters deleted_at and there is one guarded reversal path.
* Sam (follow-up): the fan's course pills belong to one pet by design, so the fan itself can never log Pixel's drug on Juniper.
* Dr. Chen (follow-up): a refusal stays prominent on the trial completion sheet even with a steroid on board, because the intake-decline headline replaces the counts.
* Trust & Safety: the report pulls data by pet_id, so no other pet's data appears, and account deletion purges every label photo under the owner's prefix.

And from the lenses' own lists:

* **Every count adds up across the page.** Nyx 15 = 10 + 5 by step, 4 + 11 by answer; Pixel 55 planned, 50 all of it, 5 spat; Mochi 27 of 28 over 13 + 14 + 1 slots; the taper what-if 5×2 + 5×1 + 4×½ = 17 tablets over 14 doses; the report's 9 and 8 sign days of 39 logged. Checked independently by the Designer, the Data Scientist, Engineering, Sam and the cold read.
* **The report page survives the fax.** Through a 1 bit simulation every distinction survives as a shape; no grey carries meaning (Visual Design; a verifier also refuted two of the cold read's fax findings on a standard mode simulation).
* **The house language holds.** The commit, answer and settle match shipped `completionMotion`; the empties match the shipped `TrialLedger`; the selected chip and Start button are shipped variants; the end card's two actions carry equal weight (Motion, Visual Design).
* **The safety copy holds.** No "missed", "due", "overdue" or "% given" in any proposal frame; the lock screen never says "give it" and carries no Log button; the no-reminder list for insulin, oral chemotherapy and NSAIDs in cats on a shared pet is the right list (Dr. Chen, Jordan, Sam, the vet tech).
* **Privacy holds where it was attacked.** The report pulls by `pet_id`, so Schrödinger's cetirizine never reaches Nyx's page; the extractor builds the label path from the verified caller; new local tables are wiped at sign-out by construction (Trust & Safety).

## Refuted, or a mock artifact

* **MOT-1** (The target dose glows): Refuted. Every dose gets the same beat, so nothing marks the target. Whether a D4 dose after the end should commit calm is carried in PMD-11.
* **MOT-15** (Fold veil and dead keyframes): Mock artifact. D8 already covers it; the mock owner deletes the dead keyframes.
* **VIS-12** (Render defects): Mock artifact. How it interacts with the name switch is kept in GAP-26.
* **VIS-6** (Glyph discs not rendered): Mock artifact (missing CSS). The glyph rules are kept in GAP-31.
* **A11Y-2** (Solid ring for 'today' on a split cell): The render is a mock artifact. The rule for the mark table is kept in GAP-20.
* **MIA-14** (Back label collides with the nav title): Mock artifact; iOS truncates the label. The naming rule is kept in WBC-7.
* **A11Y-1** (Proposed contrast numbers): Partly refuted: colorAccentGlyph against the some-of-it fill measures 2.39:1, not 3:1, so the fix does not reach its own floor.
* **VET-16** (Antihistamine rows mask nothing beyond itch): Partly refuted: first-generation antihistamines can mask vomiting and cough.
* **DES-05** (A two-dose slot counts once, by its last dose): Refuted as a fix: it would erase the refusal. Replaced by GAP-2's recorded second attempt.
* **JOR-02** (Amend the refused dose in place): Refuted as a fix: it overwrites the first refusal. Replaced by GAP-2.
* **SAM-3** (The box counts logged tablets only): Refuted as a fix: a forgotten log would delay the refill heads-up. Replaced by GAP-32 (the larger of planned and logged, earliest date first).
* **SAM-2** (The own-rate arm turns a high baseline into silence): Refuted: that arm is OR'd with the quarter arm and can only add firings.
* **RPT-05** (Touching bars merge on a fax): Refuted by a 204x98 dpi standard-mode simulation; the gaps survive.
* **RPT-10** (Column headers become unreadable on a standard fax): Refuted: they stay legible though thin. The type-floor finding stands in MFU-9.
* **ENG-01** (Mochi's three refused last doses would read finished only under the proposal): Counterexample corrected: Mochi's course is counted in days, so the shipped trigger also asks. The finding stands for courses counted in doses (PMD-1).
* **VT-11** (The household list invites one pet's prescription for another): Partly refuted: no drawn path starts a course from that row. The setup gap is kept in GAP-23.

## The team readout: where we are

*The product team and the consultants, in one sitting, after the run.*

### Where the project stands

1. **Ruled:** L3, L4, GC-5 A, D3 and D8 (Oct 12), and D6 as a team call. The direction (medicine lives with the pet; logging on +; no completion language; reminders built around the double dose hazard) now has every lens's agreement.
2. **Open:** CUL-1902's briefs, now joined by three new PM rulings (Gate 7 the headline count, Gate 8 the repeat card before a write, Gate 11 D8's colours), with four of its existing briefs reshaped into gates (D1, "is it working", D5 with L5, D2).
3. **What the critique changed:** four missing models (slots, the meal link, one write contract, the concern table) become Gates 2 to 4; the fold is re-measured; setup is brought back under GC-5 A; the forecast moves from 14 rows to about 25.
4. **Shipped code:** twelve defects; eight filed new (six `Live harm`), four carried. [CUL-1915](https://linear.app/projectnyx/issue/CUL-1915) is the one with a date on it.
5. **Next:** rule the gates, then a focused round 5, then the requirements; the filed defects and M0's pure fixes can start in parallel.

### Roll call

* **Sr. Product Designer:** agrees. Conditions: the watching card on one day axis with the doses; the end card specified once with its actions above the fold; day 0, the empty house, setup without consent, the None of it card, a two dose slot and the off day tap drawn; one ledger component; one function that never relabels a refusal; the safe action primary on the repeat card.
* **Motion consultant:** agrees. Conditions: a calm commit at or past the target with its own haptic ([CUL-1710](https://linear.app/projectnyx/issue/CUL-1710) into M0); pills follow the fan's one order per day; the reminder to + path drawn with its wait; C3 arrives only as a safety class Signal finding; a motion table in the requirements.
* **Mobile IA consultant:** agrees. Conditions: every fold claim re-measured on main's chrome (tab content ends near 763pt at 390 × 844); Home's course lines in one capped card; W re-shown at real density; one end state order; the trial ledger's grammar; a pill never dropped; the off day defined; the caveat on screen with the counts.
* **Visual Design & Brand consultant:** agrees. Conditions: one mark system with measured floors on the shipped `LedgerCell`; the course title on `TrialScreen`'s title block; heads-ups in the shipped attention panel; the glyphs judged as they ship.
* **Accessibility consultant:** agrees. Conditions: a second channel for how much went in; today and nothing logged told apart by shape; a VoiceOver section; pills never dropped at accessibility sizes; the dose card as a radio group whose dwell holds under VoiceOver; an accessibility check on every run order row.
* **Sr. Data Scientist:** agrees, and dissents on "is it working" as drawn (prefers the report's shape). Conditions: one slot partition; the full concern table; three `classifyDose` changes; the chip never writes the bowl; the refill line counts the record. *DoD line: tried Nyx's own taper (cough on Oct 2 and 4, the first every 48 hour doses) and the pooled On it count hides it (BROKE, QUIET); tried doxycycline for a cough with dose logs only and a zero prints over coverage the doses manufactured (BROKE, QUIET); tried the rabbit trial food as a daily vehicle and it washes out of both the trial and the correlation (HELD); tried 55 = 50 + 5 and 15 = 4 + 11 across §04, §10 and §12 (HELD).*
* **Dr. Chen:** agrees, and would hand the course screen to an owner at discharge once: a vomited dose and a second attempt have a record shape; the critical list says which way each drug is dangerous; the headline counts the way D1 counts; "another way to give it" names appetite as well as taste; watching is counted per step; a new strength mid taper stops the tablet count; every proposed step has its own confirm. On the open briefs: W for L1, lift G4 under the drawn rules, the day before over halfway, the per step split for "is it working", the bowl recorded once on the meal.
* **Dr. Chen, cold read:** agrees with the page's shape; this render is not clinic ready. *DoD line: read report-page-900 print, screen and fax in 60 seconds; extracted the medicines with prescribed and OTC provenance, the 4 and 11 intake split, and sign window totals with denominators; signalment partial; NOT clinic ready: the status overclaims, the day axis misplaces doses by up to a day, no dose then vomit link, Mochi and Pixel undrawn.*
* **Veterinary technician consultant:** agrees. Conditions: setup records the vet's instruction for a dose that did not go in ("They didn't say" by default) and shows it back, or sends the owner to the clinic, never the app's own instruction; the duplicate check counts unanswered and partial doses and runs after sync; an until gone step ends on tablets; a flavoured chewable on a trial is handled; each after plan answer has a rule for when it shows; another pet's prescription is never offered without saying whose label it is; a new strength never makes the app work out a tablet count.
* **Jordan:** agrees, and would trust it over the fridge note once there is one slot state table, an honest trial count, Not answered as its own clause, an end that works with a recheck, and a Today block for every twice a day course. *Timed: a dose from + is 3 taps in about 5 seconds; Alex checks "has she had it?" in 2 taps; setup is about 10 taps in under a minute, once.*
* **Sam:** agrees; never shamed, but falsely reassured or kept quiet in six places. Conditions: the end question row states the not fully taken count as main does today; a run of refused doses reaches Home without depending on whether the meals were logged; a spat pill has a path; Not sure has its own state; D5 and L5 ruled together as one bowl, one answer.
* **Trust & Safety:** agrees. Conditions: reminders as a short rolling window of one shot notifications; the sign-out wipe clears delivered ones and a tap checks the account; the name switch per phone; the G4 brief names every ruling it overturns; the label read with bytes inline; each label with a delete, a retention and a share rule; the report's notes for the owner version only.
* **Dir. of Engineering with Sr. QA:** agrees. Conditions: requirements before row 1, naming the slot model and one function per count; the steps migration as expand and contract for builds in the field; the masking table resolving every fixture drug; the concern function as its own row; the repeat predicate keyed on an occupied slot; M0 and row 3 split; B-227's schedule kind defined. Its own estimate was about 22 rows; the synthesis, adding the requirements and the missing rows, says about 25.

### Is it beautiful?

**Not yet. The bones are; the round is not.** The Visual Design consultant: the system is right (one ledger language with the trial screen, one glyph per form on the house line, a words only Home row in the trial card's grammar, a report that survives the fax), but as drawn it looks like a mock, and some marks say the wrong thing. The Motion consultant: one physics is described in words and matches what ships, but only one motion is actually specified, and two places let the shipped engine move things the page's own rules forbid. Measured against Calm, Linear, Oura and Apple Health's Medications, the three changes that would lift it most:

1. **One mark system with measured floors**, built on the shipped `LedgerCell`: every logged tone at 3:1 or better on its card and pinned in `theme.contrast.test.ts`, one hue per answer on every surface (a partial dose never in the good fact teal, a non-critical refusal never rose on Today), and a twice a day dose as stacked AM and PM squares in the trial's day columns rather than tall bars.
2. **The course screen made, not mocked:** `TrialScreen`'s title block (Newsreader 26/34, one flush left edge, no grey semibold), heads-ups in the shipped attention panel, and the watching strip sharing the dose ledger's day columns with the step change marked on both.
3. **Motion specified, not implied:** a table in the requirements giving every gesture its house module constant, its Reduce Motion frame, its VoiceOver focus rule and its haptic; a calm commit with its own haptic verb; course pills that never re-deal under a thumb that has learned where they are.

### From the counter

The vet tech: **"It carries the vet's plan, but not the calls I take most. Spat, vomited, skipped, doubled, ran out: each one dead ends, and the app never asked the vet what to do. Capture the vet's instruction for a dose that didn't go in at setup, show it back at the moment it matters, and send everything else to the clinic. That one field cuts more callbacks than any reminder."**

### Readiness

**Recommendation: rule the gates, then a focused round 5, then the requirements.** The requirements cannot be written from round 4 as drawn: the frames contradict the rules the requirements would state (the fold, the setup confirms, the end card's four versions), and several states are not drawn at all. The house rule is to mock what changes, so the rulings and the rules' visual consequences land as frames first. Round 5 needs, at minimum:

* the course screen with the watching strip on the dose ledger's day axis, per Gate 9's ruling, on Nyx's record;
* the end card as one composite (record, ledger, question, the noted after plan, "Any tablets left over?" as a number, two actions above the fold), on Mochi's Oct 4 and Oct 5;
* setup redrawn under GC-5 A (a confirm on every step) and in all five reader outcomes (read, no consent, cap reached, Premium gate, offline), plus day 0 and the empty house;
* the slot states: a second attempt after a spat pill, a vomited dose, an unanswered dose answered from its record, an off day tap;
* Mochi mid course (twice a day) and Pixel's Today block;
* the marks per Gate 11's ruling, with contrast measured;
* Home re-measured on main's chrome, per Gate 12, and W shown as an image at real density;
* the reminder tap in a two pet house, with the wait drawn;
* §11's glyphs with real discs and the single object event glyph.

The requirements' non-visual spine (the slot model, the write contract, the concern table, the fixtures) can be drafted alongside round 5 once Gates 1 and 7 are ruled.

### The path to build

About 25 rows (Gate 1 A), up from 14. **M0's pure fixes and the eight filed defects can start once Gate 1 is ruled; none needs a design ruling.** The risks that could stall it:

* **The slot model.** Every surface reads it and none exists yet; time zones, DST and the off day case make it the hardest piece to get right.
* **Dr. Chen's sittings.** The critical list's direction of danger, the masking classes (antibiotic, anticonvulsant, otic, two generations of antihistamine), the after plan chips and the side effects table all need clinical rulings; batching them into one sitting (the R8 precedent) saves weeks.
* **The push provider.** Taking a reminder back across two phones needs push, still an Open Question; until then shared pets get the "check the app first" line, and some drugs get no reminder at all.
* **The steps migration** must be expand and contract, because app builds already in the field write full rows under last write wins.
* **CUL-1859.** The report page waits on the vet report v2 ruling.
* **The two pass cap.** "Is it working" and the report page each have one adversarial pass left in their build PRs; a QUIET residual after the second blocks.

## Method

* **Depth: full**, as agreed on Oct 10 for the round before the requirements. Thirteen lenses: the Sr. Product Designer, a Motion consultant, a Mobile IA consultant, a Visual Design & Brand consultant, an Accessibility consultant, the Sr. Data Scientist seated as `adversarial-reviewer`, Dr. Chen, Dr. Chen's cold read seated as `vet-report-cold-read`, a Veterinary technician consultant, Jordan, Sam, Trust & Safety seated as `rls-privacy-reviewer`, and the Dir. of Engineering with Sr. QA. A verifier per lens, a synthesis, a completeness critic, six follow up reads and a final synthesis: **35 agents, none failed**, about 9.3 million subagent tokens and 1,851 tool calls, **about 15 hours of wall clock** at two agents at a time (the plan said four to five; the lenses ran long on images and code).
* **The stress sheet.** Before any lens ran, the lead wrote three golden paths (Jordan and Mochi: Clavamox in food on a rabbit trial with two caregivers; Sam and Pixel: methimazole twice a day for life with spat pills; the PM and Nyx: the real prednisolone course) and 22 stress cases, including two new fixtures (a pill vomited up minutes after it was given, and a T4 draw timed to the last dose), plus one success line per lens. Every lens walked it and gave its verdict on the direction against its success line.
* **Renders** (`scripts/design-critique/render.mjs --frames ".frame"`, plus a bespoke script): the 53 frames with Reduce Motion on and off, the whole page at 390 and 1280, every section at 390 in the light and dark page themes, §12's report page alone at 900px in screen and print media plus a 1 bit fax simulation, and §11 at 3x. No page errors and no sideways scroll at 390. The page has no demo buttons, so the motion and reduced renders are byte identical; nothing on the page is animated, which is itself evidence for MFU-2. Every phone is drawn at 390pt with default text, so 320pt and the accessibility sizes were judged from §03's fan table and the shipped fan budget, never rendered.
* **Isolation.** Lenses did not read the comments on CUL-1698 or CUL-1903, the session records or the round 2 critique until their findings were written. The cold read lens read only the three report renders.
* **Counts.** 201 lens findings (182 confirmed, 13 plausible, 5 mock artifacts, 1 refuted) and 56 follow up findings, merged into 107 items: 14 broken, 9 works but confusing, 43 design gaps, 19 missing follow ups, 18 PM decisions, 4 backlog. 55 high, 46 medium, 6 low. The critic restored 8 findings the first synthesis had dropped and corrected 5 categories; the verifiers listed 62 things the lenses missed, which the synthesis weighed.
* **No silent caps.** The critic raised six gaps and all six were followed up. It listed 25 renders no finding cited, most of them the motion twins and the dark section shots; it looked at two dark shots itself (the pale "some of it" cell becomes the brightest mark on the dark page ground, supporting the contrast finding).
* **The run's scratch** (renders, the stress sheet, the args and every agent's return) stayed in the session's scratchpad; the workflow journal is `wf_1214a8b8-cba`.
