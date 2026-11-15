# Visit summary discovery: ground truth from Nyx's real record

**Date:** 2026-11-14 · **Status:** frozen point-in-time brief · **Issue:** CUL-2753 · **Method:** read-only SQL against production, scoped to the PM's own pet (`pets.id = bf7b196e…`, paired with its owner id), run 2026-11-14 23:40 UTC. Every summary and fact list below was written by hand from the rows, before any model saw them. This file is the test every later claim in the discovery is checked against.

**What was not read:** the bytes of the two Vet Files documents. This session has SQL access and no Storage read path, so the invoice photo and the prescription PDF are known by their rows only (§4). No other account's data was read; the one other real account with a visit (a dog, one visit) was counted and not opened.

---

## 1. What the record holds

| Thing | Count | Notes |
|---|---|---|
| Vet visits | 2 | 2026-09-16 (Dr Miller) and 2026-11-14 (Dr Coleman), both at the same clinic |
| Appointments | 2 | one per visit, both linked. The September one carries two owner questions, both ticked as asked. The November one carries none |
| Vet Files documents | 2 | an invoice photo linked to the September visit; a prescription PDF dated 2026-07-30 linked to no visit |
| Discharge sheets, lab PDFs | 0 | neither visit produced one that reached the app |
| Courses (`medications`) | 2 | Motozol ear drops Jul 16 to Aug 9; prednisolone Sep 21 to Oct 11. Neither is linked to a visit |
| Diet trial | 1 | Jul 26 to Oct 20, linked to the September visit, extended to 84 days as vet directed on Sep 18 |
| Weigh-ins | 3 | 4.40 kg (Jun 15), 3.73 kg (Sep 16), 3.69 kg (Nov 14). All three say `home_scale` |
| Care acknowledgements | 3 | trial started by the vet (vomit); "my vet knows" for cough and vomit, both dated Oct 11 |
| AI consent | granted | scope `ai_boundary`, decided 2026-10-13 |

The record is small and it is the honest shape of a real owner's visits: long typed notes, an invoice, and no discharge sheet.

---

## 2. Visit 1: 2026-09-16, Dr Miller, "Potential ear infection"

### 2.1 Inputs a summary would be handed

- **Notes:** about 2,300 characters, typed in the room and after. One paragraph per thought, no headings.
- **Questions (both asked):** "When she's had ear infections in the past, which ear has it been in?" and "We're coming up on 8 weeks of the diet trial. Is it worth continuing?"
- **Documents:** one photo, kind `invoice_estimate`, titled "Nyx - Invoice", taken at 21:59 UTC on the visit day.

### 2.2 A good summary, written by hand

> **What the visit was for.** A possible ear infection, with the diet trial and the cough also discussed.
>
> **What you noted the vet found.** Weight 8.22 lb. No fever. Left ear had dirt in it; right ear looked good. Lungs sounded good. You noted that the last ear infection was in both ears and this one looks like the left only. Nyx sneezed and shook her ear in the room, and you showed the video of the cough.
>
> **What you noted the vet decided.**
> - Ears: treat the left ear with Motozol once a day. The clinic cleaned the ear and showed you how. Routine cleaning every 4 weeks, starting from the visit day; the clinic is sending a cleaner.
> - Cough: a steroid (prednisolone). You can start Monday, and it should not be started and stopped. What to look for is less coughing or sneezing.
> - Diet trial: stay on it. Minimum 8 weeks, 12 recommended, so about 4 more weeks. No delectable treats to help with pills until the trial ends, because gut signs often take longer to settle. No need to come back in at 12 weeks: start reintroducing foods then, your previous dry food or others, one protein at a time.
> - Weight: you noted Dr Miller "wasn't very concerned about this loss" and said food can be increased as needed.
>
> **What the vet asked you to do if things don't improve.** If Nyx is still coughing after the 10 days of full strength prednisolone, call.
>
> **Your questions.** Which ear in past infections: answered (both ears last time). Is the trial worth continuing: answered (yes, to 12 weeks).
>
> **Not in your notes.** A recheck date. The prednisolone dose and how long the course runs after the first 10 days. How long to give the Motozol.

Three things about this summary matter for the design:

1. **Every line is the owner's account of what the vet said.** The summary has to say so. It is never "the vet found"; it is "you noted".
2. **The weight line quotes the vet's lack of concern as the owner wrote it and adds nothing.** A paraphrase such as "the weight loss is not a concern" is a reassurance the app would be making in its own voice.
3. **The last block is as useful as the rest.** A model asked for a recheck date will find one in "4 more weeks", "every 4 weeks", "12 weeks", "10d" or "Monday" unless it is allowed to say none was stated.

### 2.3 The fact list a good extractor proposes

| # | Fact | Value | Source words | Lands in | What the record did instead |
|---|---|---|---|---|---|
| 1 | Clinic weight | 8.22 lb (3.73 kg), 2026-09-16, clinic scale | "8.22 lbs" | `weight_checks`, source clinic | The owner logged 3.73 kg 49 minutes after the visit, and it is stored as `home_scale` |
| 2 | Medication started | Prednisolone, for coughing, 10 days at full strength then a taper, start when ready | "Steroid for coughing", "Pred", "10d full strength dose" | a course via `startRegimen`, linked to the visit | Entered by hand five days later with the dose and schedule from the label; not linked to the visit |
| 3 | Medication started | Motozol, left ear, once a day, length not stated | "Treat left ear. Motozol. Once a day." | a course, linked to the visit | **Never recorded.** Motozol doses are logged against no course |
| 4 | Call instruction | Sign: cough. Condition: still coughing after the 10 full strength days. Action: call | "if after the 10d 'full strength' dose of pred she's still coughing then we should give her a call" | `vet_instructions` (CUL-2731) | Nothing. The condition came true around Oct 1 and no surface noticed |
| 5 | Trial length | Extended to 12 weeks, vet directed | "Min 8 week. Recommending 12." | `extendTrial` (R6) | Set by hand two days later |
| 6 | Recheck | **None stated** | "Don't need to come back in when the 12 weeks hit" | nothing | Correct: `next_visit_at` is null |
| 7 | Recurring care | Ear cleaning every 4 weeks from the visit day | "Start monthly w the cleaning. Every 4 weeks. First one way today." | no home in the app today | Nothing |
| 8 | Reintroduction plan | After week 12, one protein at a time | "keep it to a single protein" | no structured home; the trial's end flow could quote it | Nothing |

Not facts, and a good extractor proposes none of them: "No fever", "Lungs sound good", "Right looks good" (absences, and the engine may never count an absence), the vet's lack of concern about weight (a reassurance), "Change of season might impact the sneeze and cough" (a cause), "GI issues often take longer to settle" (general advice).

### 2.4 What Signals would have done differently

| Had it known | Signals today | With the confirmed fact |
|---|---|---|
| Fact 1, the clinic weight as a clinic weight | Today's Signal reads "8.1 lb on November 14 on a home scale, down from 9.7 lb on June 15 on a home scale, a single reading". Two of the three weigh-ins were taken at the clinic | The weight lane has two clinic readings two months apart and one older home reading. It can say which scale each number came from, and "a single reading" stops being true. The direction of the change is the same: down, and the finding stands |
| Fact 4, the call instruction | Nothing on Oct 1. Coughs were logged in the weeks of Sep 21 and Sep 28, inside the course | CUL-2731's door opens on the date. This discovery adds nothing to that design except a way to prefill it |
| Fact 3, the Motozol course | Ear drop doses with no course. The engine cannot tell an ear treatment is running | A course with a start, a frequency and a visit behind it. Dose counts and the med strip work |
| Fact 2, linked | The course exists but its origin is a typed "Dr. Miller" | The course is linked to the visit, so the visit page shows its plan and the masking span is anchored to a prescription the visit made |
| The vet's lack of concern about weight | Not known | **Nothing changes, on purpose.** Two months later Nyx was still about 16% under her June weight (3.69 kg against 4.40 kg; the 40 g between September and November is inside scale noise). Had the engine quieted the weight finding on the vet's September words, it would have stayed quiet over a loss that was never regained |

### 2.5 The invoice

Unread in this session. From its row: one JPEG, camera, kind invoice. An invoice from this kind of visit usually lists the exam, anything dispensed (the ear drops, the cleaner, the steroid), any test run on the ear, and sometimes the weight in the patient header. If it lists the prednisolone tablets and count, it would fill the "dose not in your notes" gap in §2.2. That is the single most useful thing a document adds to this visit, and it is why the invoice is worth reading even though its clinical value is low.

---

## 3. Visit 2: 2026-11-14, Dr Coleman, "Vomiting & congestion"

### 3.1 Inputs

- **Notes:** about 900 characters, and **none of them are from the visit.** The owner wrote the concerns and questions into the notes field before going in: vomiting continues on rabbit only; congestion, sneezing and daily coughing; prednisolone helped and the cough returned after it ended; whether something other than a food allergy is going on; the owner's own weekly vomiting rates (1.8, then 3.4 on chicken, then 3.1 back on rabbit); weight; ear polyps; more tests. The note ends with the heading "Notes from the visit itself." and nothing under it.
- **Questions on the appointment:** none. They are in the notes.
- **Documents:** none.

### 3.2 A good summary

> **You haven't written down what the vet said yet.** Your notes for this visit hold what you wanted to raise.
>
> **What you went in with.** Vomiting that continued on rabbit only. Congestion, sneezing and coughing, with the cough daily. You wrote that prednisolone helped while Nyx was on it and the cough came back afterwards, and that Zyrtec doesn't seem to be helping.
>
> **Your questions.** Is something other than a food allergy going on? Is this much vomiting normal? How concerned should we be about weight? Could it be ear polyps? Should any more tests be run?
>
> Add what the vet said and summarize again.

This visit is the most important test in the file. A model handed these notes and asked for "what the vet said" will produce a confident summary of a visit from the owner's worries. The correct output has no findings, no plan and **no proposed facts**.

Two further traps in the text:

- **The owner's rates.** "1.8 times a week", "3.4", "3.1" are the owner's own numbers. A summary may quote them as "you wrote". It may not restate them as the record's rate, because the engine's count over the same weeks may differ and the app would then hold two numbers for one thing (CUL-746).
- **"Prednisolone helped."** A cause, in the owner's words. Quoted, never adopted.

### 3.3 Facts around this visit that the record implies and no note states

These are not extractions. They are things the after-visit screen should ask, and they show what a notes-only summary misses:

| Observation in the record | What it suggests |
|---|---|
| A weigh-in of 3.69 kg logged at 15:06 UTC, six minutes into a 15:00 appointment, stored as `home_scale` | A clinic weight entered as a home weight. CUL-1390's "At the vet today?" question covers it |
| Motozol doses twice a day from Nov 10, against no course | An ear treatment is running that the record has no course for |
| A prednisolone dose on Nov 14, against no course (the last course ended Oct 11) | A new course may have started at this visit |
| The Signal generated at 20:38 UTC, five hours after the visit was saved, still says "A vet visit is booked for Nov 14. Worth mentioning Nyx's weight" (and vomiting, and coughing) and, on weight, "worth booking a vet visit" | The same-day visit did not reach the Signal's context lines. Not this discovery's subject; noted on the issue |
| A vomit photo read on Nov 12 showed possible blood; "call your vet today" leads the Signal | The visit two days later is the answer to that card, and nothing connects them |

### 3.4 What Signals would have done differently

With today's notes: nothing, and that is correct. Once the owner writes what Dr Coleman said, the candidates are the same types as visit 1: a clinic weight, any new course, any test ordered, any recheck, any call instruction.

---

## 4. The two documents

| Document | Row facts | In a visit summary's scope? |
|---|---|---|
| "Nyx - Invoice", JPEG, 2026-09-16 | linked to visit 1 | Yes |
| "Science Diet — Rabbit Prescription Food", PDF, 88 KB, 2026-07-30, kind `prescription` | linked to no visit. It predates both logged visits and matches the trial's start week | **No.** A per-visit summary never reads it |

The second row is a finding on its own. The document that authorises the diet trial, the single most important vet directive in this record, hangs off no visit, because the visit that produced it was never logged. A feature whose only door is "a visit" cannot reach it. A per-document read can.

---

## 5. What this ground truth says about the idea

1. **The notes are the main input, and they are good.** Visit 1's notes yield six confirmable facts. The documents add one gap fill (the dose) at most.
2. **Half of the real visits have nothing to summarize yet.** The empty state is a primary state.
3. **The highest value fact types on this record are the call instruction, the unrecorded course and the weight's scale.** Recheck date, the lead example in the idea as pitched, is absent from both visits, and the test there is whether the model can say so.
4. **Three of the six facts were entered by hand anyway, two to five days late and without the link.** The summary's first job on this record is to lower the cost of confirming, not to discover.
5. **The vet's reassurance is in the notes in plain words.** It is the sharpest collision between "give Signals everything" and the no-reassurance rule, and this record shows why the rule should win: the weight was never regained.
6. **Nothing a vet said reached the app as a lab value or a diagnosis.** Lab extraction is untestable on this record.
