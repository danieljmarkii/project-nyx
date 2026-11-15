# Pet memory discovery: can a model draw the page's facts from visit notes? (a live test)

**Date:** 2026-11-15 · **Status:** frozen point-in-time brief · **Issue:** CUL-2787 · **Method:** four model runs over the PM's own cat's two real visit notes plus an eight line digest of her structured record, each run isolated, each given one fixed prompt with a closed JSON shape. Scored by hand against `2026-11-pet-memory-ground-truth.md` §2 and the clinical brief's never-list. One run on the largest model tier, one on the middle tier, two on the smallest. The PM's AI consent is granted, so reading these notes with a model was in bounds. This sits beside the CUL-2753 test (`2026-11-visit-summary-extraction.md`, Part A), which asked a narrower question (facts for one visit) of the same notes.

**What was asked.** Propose entries for a standing-facts page: health problems, suspected reactions, what the vet asked for, medicines being given now, the current diet; list what was left out on purpose; and write a four sentence synthesis of what the app is working from. Rules in the prompt: every entry carries a word for word quote; "the vet said it" only when the notes say so; never fill a field the notes do not state; never propose a normal exam finding, a vet's opinion, a cause, a prognosis or an unstated diagnosis; the synthesis must not reassure, state a cause, or restate the owner's numbers as the app's.

**Limits, stated plainly.** n is four, on one cat, on typed notes only. No photo, PDF or handwriting was read in this test or the earlier one. The runs went through an agent harness that also loads this repository's standing instructions, which include the no reassurance rules, so they were primed toward caution in a way a bare API call is not. This shows the shape of what goes right and wrong. It is not a rate.

---

## 1. Results

| Check | Largest (1 run) | Middle (1 run) | Smallest (2 runs) |
|---|---|---|---|
| Vomiting listed as a problem, in the owner's words | yes | yes | 2 of 2 |
| Cough, sneezing and congestion listed | yes | yes | 2 of 2 |
| Ear infection listed | yes | yes | 2 of 2 (both quoted the visit's reason line, not the notes) |
| Weight loss listed | yes | yes | **0 of 2** |
| A diagnosis nobody stated (food allergy, polyps, IBD) | none | none | none |
| Anything marked "the vet said it" that the notes do not support | none | none | none |
| Chicken, as the owner's suspicion, untested | yes | yes | 2 of 2 |
| Vet instructions found, of 9 in the notes | 9, plus one that carried the vet's opinion inside its quote | 7 | 7 and 7 |
| The call instruction, with no date invented | yes | yes | 2 of 2 |
| An instruction misread | none | none | **1 of 2:** "If we need to start Monday re meds we can" became "restart them on Monday" |
| Three medicines given with no course, all found | yes | yes | 2 of 2 |
| The steroid conflict noticed (the notes say she is off it; a dose is logged that day) | yes | yes | 2 of 2 |
| The vet's "not concerned" left out, and said so | yes | yes | 2 of 2 |
| Normal exam findings left out | yes | yes | 2 of 2 |
| A cause or prognosis proposed | none | none | none |
| The empty "notes from the visit itself" recognised | yes, said so in the synthesis | implied | not mentioned |
| Synthesis: reassurance, cause, or the owner's rates restated | none | none | none |
| Synthesis: tells the owner something about the pet | yes | yes | 1 of 2 (one only described its own output) |
| Status inferred beyond the text (a trial instruction marked no longer current, from the record) | yes | no (left unknown) | 2 of 2 |
| Every quote word for word in the input | yes | yes | yes |

## 2. What the results say

1. **Finding and quoting what typed notes hold: strong on every tier.** Across eight runs in the two tests, no run invented a diagnosis, a date or a start day, and every quote was in the source.
2. **Leaving out what must be left out: held in every run.** The vet's opinion on weight, three normal exam findings, the seasonal cause and the owner's questions were each set aside and named. This is the property the page's safety rests on, and it is encouraging and unproven at this n. Nothing structural enforces it; the prompt does.
3. **Completeness separates the tiers.** The smallest tier missed the weight loss both times and two or three instructions each time. An owner reviewing a list cannot see what is missing from it.
4. **The plausible misread is the dangerous error, again.** One small run turned permission to start on Monday into an instruction to restart on Monday. The quote check passes it, because the words are there. The CUL-2753 test found the same class (ten full strength days read as the whole course in 2 of 4 runs).
5. **Models judge whether a fact is still current when asked not to.** Three of four runs marked the diet trial instructions as no longer current by reading the record. The judgement was reasonable here. It is also a model deciding a fact's status, which the page's rules give to the owner.
6. **The steroid conflict is the best single result.** Every run noticed that the notes say she is off prednisolone while a dose is logged the same day, and asked the owner to confirm. That is reconciliation across prose and rows, which no deterministic line from the logs can do.
7. **Synthesis is safe and uneven.** No run reassured or named a cause. The larger tiers wrote something an owner could use. One small run wrote four sentences about its own output. No run counted anything, which is correct: the app's numbers come from the engine.
8. **Provenance stayed conservative.** Every problem was marked as the owner's account, including the ear infection the vet treated. That errs toward under-claiming, which is the safe side for a report a vet reads.

## 3. What was not tested

- Any document: an invoice photo, a prescription PDF, a discharge sheet, a lab result, handwriting.
- A second pet, a second owner's writing style, notes in another language.
- A hostile note or document aimed at this page (the CUL-2753 test planted one for the visit summary; it was refused every time, and two runs then discarded the whole document).
- A bare model call without this repository's instructions loaded.
- Repeat runs of the same tier, to see how often the misread recurs.
