# Pet memory discovery: ground truth from Nyx's real record

**Date:** 2026-11-15 · **Status:** frozen point-in-time brief · **Issue:** CUL-2787 · **Method:** read-only SQL against production, scoped to the PM's own cat (one pet id, paired with its owner), run 2026-11-15 00:40 UTC. Every list below was written by hand from the rows. Which function reads which field comes from `2026-11-visit-summary-input-audit.md` (CUL-2753) and is not re-derived here. Which screen shows each fact comes from a read of the client at commit `13d6ac194`. No other account was read. No stored file was opened.

This file is the test for every later claim in the discovery: a page that lists "what Culprit knows about Nyx" must be able to show section 1 honestly, and a design that claims to close a gap must be checked against section 2.

---

## 1. Everything the app holds as a standing fact about Nyx today

A standing fact is something that stays true between logs: who she is, what she has, what she is on, what her vet said. A single meal or a single vomit is not one.

"Signal", "Ask" and "Report" are `generate-signal`, `ask` and `generate-report`. "Flagged" means the read sits behind an engine flag that is on for one account.

| # | Fact, as stored | Table | Where the owner sees it | Signal | Ask | Report |
|---|---|---|---|---|---|---|
| 1 | Cat | `pets.species` | Pet tab, identity line | reads | reads | reads |
| 2 | American Shorthair, female | `pets.breed`, `sex` | Pet tab, identity line | no | no | reads |
| 3 | Born 2023-09-01, exact (3 years old) | `pets.date_of_birth`, `_precision` | Pet tab, as an age | flagged (weight lane only) | no | reads |
| 4 | Microchip: empty | `pets.microchip_number` | nowhere; no screen writes or shows it | no | no | no |
| 5 | Profile weight 3.69 kg | `pets.weight_kg` | Pet tab weight card; Edit profile | no | no | selected, unused |
| 6 | Weigh-ins: 4.40 kg Jun 15, 3.73 kg Sep 16, 3.69 kg Nov 14. All three stored as `home_scale` | `weight_checks` + `events` | Pet tab weight card, weight history, each reading's event screen. The source is never shown | flagged | reads the number | reads |
| 7 | Conditions: **none. The table has no row for Nyx** | `conditions` | Pet tab, Conditions card (empty state) | no | no | reads |
| 8 | Course: Motozol ear drops, 1 drop twice a day, for "Ear infection", Jul 16 to Aug 9, completed | `medications` | Pet tab, Past medications (collapsed) | reads name and dates | reads name, dates, dose | reads all |
| 9 | Course: prednisolone 5 mg, once a day for 10 days then every other day, for "Coughing", prescribed by "Dr. Miller", Sep 21 to Oct 11, completed | `medications` | Pet tab, Past medications | reads name and dates | reads name, dates, dose | reads all but the prescriber |
| 10 | No course is active | (absence) | Pet tab, Current medications (empty) | n/a | n/a | n/a |
| 11 | Diet trial: Jul 26 to Oct 20, completed, for "gi", 84 days (first set to 56, extended as vet directed), linked to the Sep 16 visit, outcome "improved" with a typed outcome note. **Target protein: empty** | `diet_trials` | The trial screen while it ran. Since it ended, the Pet tab shows only the card that starts a new trial | active trial only, so nothing now | active trial only, so nothing now | reads history and outcome |
| 12 | Six allowed foods, all rabbit | `diet_trial_foods` | "What Nyx can eat", reachable from the trial screen | no | no | reads |
| 13 | No feeding arrangement (a free feeding row from June was removed) | `feeding_arrangements` | a food's own page | reads | reads | reads |
| 14 | Two vet visits: Sep 16 ("Potential ear infection") and Nov 14 ("Vomiting & congestion"), same clinic, two vets, typed notes on both, no recheck date | `vet_visits` | Pet tab Vet visits card, the visits list, each visit | flagged, date only | no | date only |
| 15 | Two appointments, both linked to their visits | `vet_appointments` | the visits list | flagged, dates only | no | no |
| 16 | Two documents: an invoice photo on the Sep 16 visit; a prescription PDF dated Jul 30 linked to no visit | `vet_documents` | Vet Files | no | no | no |
| 17 | "Her vet started the trial for the vomiting", recorded Oct 11 | `care_acknowledgements` | **no list anywhere.** Shown as a sentence on a Signal finding while that finding is in the matching state | flagged | no | no |
| 18 | "My vet knows about the cough", Oct 11 | same | same | flagged | no | no |
| 19 | "My vet knows about the vomiting", Oct 11. The engine treated both vomiting answers as lapsed and raised the concern again on Nov 8 | same | same | flagged | no | no |
| 20 | No vet calls recorded | `vet_calls` | the visits list, Calls; History | no | no | no |
| 21 | Vet instructions: no table exists yet (CUL-2731 is building it) | n/a | n/a | n/a | n/a | n/a |

Two things are not standing facts but behave like them, because the engine computes them fresh each day and speaks them as context:

- **The Signal's own findings**, stored in `ai_signals`. On Nov 14: a possible blood read on a vomit photo from Nov 12 (call today); weight down from 4.40 kg to 3.69 kg; vomiting on 16 days of the last 56, 12 episodes in the recent four weeks against 6 in the four before; coughing on 7 days; 13 of 19 timed vomits within 30 minutes of eating.
- **The context lines on those findings**, which already cite standing facts by name: "Prednisolone, Sep 21 to Oct 11. It can hide vomiting." and "Since the Sep 16 visit, 59 days: 20 episodes, with something logged on 58 of 59."

So the loop the PM asked to see (a finding that cites a fact) exists today in one direction. The owner can read the citation. There is no place to open the fact it cites, see where it came from, or see the full set.

---

## 2. What a vet or a careful owner would say is true about Nyx, and the app has nowhere to hold or does not hold

Written from the record itself: the visit notes (as characterised in the CUL-2753 ground truth), the courses, the doses, the meals and the Signal. Each line says whether a home exists and is empty, or no home exists.

| # | True about Nyx | Evidence in the record | Home today |
|---|---|---|---|
| G1 | **She has a long-running vomiting problem.** It is the reason for the diet trial and the Nov 14 visit | 14 vomits in the last 30 days; the trial's indication "gi"; both visits | `conditions` could hold it and is empty. Nothing ever asked the owner to fill it. The app's only standing statement of the problem is the trial's one word, "gi" |
| G2 | **Recurrent ear infections.** One in July (both ears, per the notes), one in September (left ear), ear drops again from Nov 10 | a course indication, a visit reason, a sentence in notes, ten doses | `conditions` could hold it and is empty |
| G3 | **A cough with sneezing and congestion** that eased on prednisolone and returned after it | 4 coughs and 9 sneezes in 30 days; a course indication; the Nov 14 visit reason | `conditions` could hold it and is empty |
| G4 | **She has lost about 16% of her body weight since June and has not regained it** | three weigh-ins | Held as readings and a finding. Not held as a problem. Two of the three readings were taken at the clinic and are labelled home scale |
| G5 | **Ear drops are being given now.** Motozol twice a day since Nov 10 | 10 doses logged against no course | `medications` is the home. No course exists, so the Pet tab says there are no current medications and the engine cannot tell an ear treatment is running |
| G6 | **She has been getting an antihistamine.** Zyrtec, 8 doses between Oct 12 and Nov 11, which the owner's notes say does not seem to help | doses against no course | Same. Never a course |
| G7 | **Prednisolone may have restarted on Nov 14** | one dose against no course, on the visit day | Same. A steroid that can hide the two signs the Signal is tracking is running with no span the engine can see |
| G8 | **She still eats rabbit only.** The trial ended on Oct 20 in the record; every meal in the last 14 days is one of six rabbit foods | 74 meals | No home. Outside a running trial the app holds no statement of a pet's current diet or of a restriction. The Signal and Ask read the active trial only, so both now see no diet context at all |
| G9 | **Chicken was tried after the trial and the owner believes vomiting rose** (the owner's own weekly rates in the Nov 14 notes) | prose in visit notes | No home. The trial's target protein was never set, and no field anywhere holds a suspected sensitivity |
| G10 | **Standing instructions from her vet:** ear cleaning every 4 weeks; no pill treats until the trial ends; reintroduce one protein at a time; food can be increased as needed | prose in the Sep 16 notes | No home. CUL-2731's table will hold a dated "call me if". None of these has a date |
| G11 | **A dated instruction that came true:** call if still coughing after the 10 full strength days of prednisolone | prose in the Sep 16 notes | CUL-2731's table, once built |
| G12 | **She eats fast and brings it back up.** The owner's outcome note names it and says a slow feeder is in use; the engine independently finds 13 of 19 timed vomits within 30 minutes of eating | `diet_trials.outcome_notes`; a Signal finding | The engine's half is a finding. The owner's half is free text on an ended trial that only the report reads |
| G13 | **What her vet thought.** In September the vet was not very concerned about the weight loss | prose in notes | No home, and by the house rule it gets none that an engine can read |
| G14 | **Basic chart facts a first visit asks for:** neuter status, indoor or outdoor, other animals in the home, vaccination and parasite status, known drug reactions | nothing | No home for any of them. `sex` holds female and nothing about neutering |
| G15 | **Who her vets are** | two visit rows carrying a clinic and two names as text | Text on each visit. No contact record (the vet contacts spec plans none) |
| G16 | **Open questions the owner took to the vet on Nov 14:** is something other than food going on, could it be ear polyps, are more tests needed | prose in notes | Appointment questions exist as a field; these were typed into notes instead. Not facts |

---

## 3. What the gap list says

1. **The table built for standing facts is empty for the one real pet.** Nyx has three or four entries any vet would put on a problem list and `conditions` has no row. The store exists; nothing fills it. A new store would start in the same place unless something changes how facts arrive.
2. **The largest gaps are behaviours the record already shows.** G5 to G8 are visible in doses and meals. The app holds the evidence and has drawn no standing fact from it. No model is needed to notice ten doses of a drug with no course.
3. **Three facts changed state and the app's view of the pet went quiet.** When the trial ended the Signal and Ask lost all diet context (fact 11, G8). When the courses ended the Pet tab said no medications while three were being given (fact 10, G5 to G7). The record's "current" view is wrong in the direction of knowing less.
4. **The owner's answers are the least visible facts in the app.** Facts 17 to 19 change what Home asks, were given a month ago, and cannot be listed or, once the finding moves on, taken back.
5. **Provenance already exists for some facts and is shown for almost none.** A prescriber name, a vet-directed flag on the trial length, a visit link on the trial, a scale source on each weight. Only the prescriber is ever shown. The scale source is wrong on two of three readings.
6. **Some true things should stay out of any store the engine reads.** G13 is the clear case. G9 is the hard one: it is the single most useful thing the owner has learned, and it is a causal belief built on the owner's own counts.
7. **Free text is where the vet's words live.** G9, G10, G11, G13 and G16 exist only as prose. Whatever shape is chosen, these arrive either by the owner typing them again or by a model proposing them from the notes, which is CUL-2753's subject.
