# Visit summary discovery: the clinical read (Dr. Chen's lens)

**Date:** 2026-11-14 · **Status:** frozen point-in-time brief · **Issue:** CUL-2753 (discovery; nothing is built) · **Lens:** Dr. Alex Chen, small animal general practice (`docs/personas.md`)

**Method:** read the proposed design (read path, fact types F1 to F6), then `docs/research/2026-11-visit-summary-ground-truth.md`, `.claude/skills/clinical-guardrails/SKILL.md`, `docs/nyx-care-state-requirements.md` (§3, §5), `docs/nyx-vet-visits-requirements.md` (§4.1 After, §4.4) and `docs/nyx-vet-files-requirements.md` (§7). Then a web search on discharge recall, safety-netting and AI summaries of clinical notes. Every claim about Nyx's record is checked against the ground truth brief. **[E]** marks a claim with a cited source. **[A]** marks clinical inference by this lens.

**Limits of the evidence pass:** sources were read at abstract or search-summary level, not full text. Recheck any figure before it is quoted in a spec. No AVMA guidance on discharge instructions was retrieved, so none is cited. Veterinary evidence on discharge recall is thin (one referral-centre study); the human literature carries most of the weight and is an analogue, not proof. Persona positions for Jordan and Sam in §H are inferred from their profiles, not from an interview.

---

## 1. Bottom line

- **The summary is hearsay, and it must look like hearsay on every line.** It is a model's reading of an owner's memory of what a vet said. Owners reproduce about two thirds of discharge information, and the weakest items are side effects and what signs to expect [E, Flegel 2024].
- **The most valuable line is the "call me if".** It is the one the record lost: the condition in Dr Miller's instruction came true around Oct 1 and no surface noticed. It must be shown verbatim and may only ever add an ask.
- **Data may reach the engine. Opinion may not.** A weight, a course and a date are measurements. "Wasn't very concerned" is a judgement made on one day about one number. It never quiets, softens or re-ranks a finding (§D).
- **The dangerous errors are the quiet ones.** Three paths can drop or soften a warning: a weight in the wrong unit, a phantom or misdated masking course, and a trial ended or shortened by mistake. Each needs more than a tap (§C, §G).
- **Verdicts:** F1 COUNT with conditions. F2 COUNT only through the full medication form. F3 SHOW ONLY in v1. F4 and F5 SHOW ONLY (written on confirm, never counted, never able to move a care state). F6 COUNT for "extended"; SHOW ONLY for "ended" and "switched".
- **The prose sections should quote, not paraphrase.** Hallucinations in LLM discharge summaries cluster in the plan section [E, Williams 2024], and this repo already found a lexicon screen misses most reassurance (Pattern 10, B-060). A lexicon screen is a backstop, not the guarantee.
- **The summary does not go to another vet in v1.** Confirmed facts reach the report through their own tables, labelled as owner-entered.
- **Two conflicts go to the PM** (§H): how much typing a confirm may ask of Jordan, and whether the vet's words may sit beside a live finding for Sam.

---

## A. What a vet wants the owner to walk away knowing

### A.1 The discharge core set, ranked

Ranked by the harm when the item is lost [A], informed by where recall fails [E].

| Rank | Item | Why it ranks here | Can the owner's typed notes carry it? |
|---|---|---|---|
| 1 | **When to call or come back sooner**: the sign, the time frame, the action | The safety net. Human ED patients had deficits in return instructions and mostly did not know it [E, Engel 2009]. Safety-netting advice should be specific and documented [E, Jones 2019; Friedemann Smith 2022] | Yes, in the owner's words. Visit 1 has one: "if after the 10d full strength dose of pred she's still coughing then we should give her a call" |
| 2 | **What to give**: drug, strength, dose, route, frequency, duration, taper, with food or not | Dose errors and early stops are the common harms [A]. Dosing regimen drives adherence [E, Wareham 2019] | Partly. Name, route and frequency: yes ("Motozol. Once a day."). Strength, dose, duration and taper: **only the label, the invoice or a discharge sheet**. Visit 1's notes hold none of them |
| 3 | **What not to do**: do not stop a steroid abruptly, no treats on the trial, no off-diet pill pockets | Each is an instruction whose breach is invisible until it matters [A] | Yes. Visit 1 has "should not be started and stopped" and the no-treats rule |
| 4 | **What to expect and by when**: the signs that should improve, and the ones that may remain | Lowest agreement items at discharge were side effects (29%), residual signs (36%) and confinement (37%) [E, Flegel 2024] | Partly. Visit 1 has "less coughing or sneezing". It has no time frame beyond the 10 days |
| 5 | **Side effects to watch for** | Lowest recalled item in the only veterinary study [E, Flegel 2024] | Rarely. Absent from both visits. The summary may not supply them (§B.3) |
| 6 | **Recheck**: whether, when and for what | A missed recheck delays a decision [A] | Yes when stated. Visit 1 states there is none needed at 12 weeks |
| 7 | **What was found and what is still unknown**: working diagnosis, tests pending, who calls whom | Owners conflate "no finding" with "healthy" [A] | Poorly. Owner wording of findings is unreliable in both directions. Results: clinic paperwork only |
| 8 | **Home care technique**: ear cleaning, how to give the drops | Demonstrated, then forgotten. 40 to 80% of medical information is forgotten almost at once [E, Kessels 2003] | Partly. Visit 1 notes the schedule ("Every 4 weeks"), not the technique |

AAHA's own discharge template uses the same spine: home care, medications, "seek immediate veterinary care if", recheck [E, AAHA 2020]. The app's sections are the right ones. Their order is the issue.

### A.2 Mapping to the summary's sections

| Design section | Carries | Dr. Chen's requirement |
|---|---|---|
| `if_things_dont_improve` | Rank 1 | **First or second on screen, never below the fold.** Verbatim quote. If the notes hold none, the block says so and says "ask the clinic", not "none" |
| `what_you_noted_vet_decided` | Ranks 2, 3, 6, 8 | Quoted spans, grouped by problem. No dose arithmetic. No added instruction |
| `not_in_your_notes` | The gaps in 2, 5, 6 | As useful as the rest. Fixed list of slots: dose, duration, recheck, when to call. It names the gap and where the answer lives (the label, the clinic). It never fills it |
| `what_you_noted_vet_found` | Rank 7 | The riskiest block. Absences ("no fever", "lungs sound good") appear only inside the owner's quote, never as app prose |
| `purpose`, `your_questions` | Context | Low risk. A question shows as "asked" or "not asked", from the tick. Whether it was *answered* is a model judgement and should be dropped or quoted |

### A.3 What only the clinic's paperwork can carry

Dose, strength, tablet count, taper schedule, treatment length, lab values with reference ranges, the diagnosis as the vet wrote it, and pending results. On this record no such paperwork reached the app: two visits, one invoice, no discharge sheet. So in practice the summary will be a notes summary. It should say what it cannot know.

---

## B. What an owner-facing summary must never say

Each example is the sentence a model would plausibly write from the two real visits. The "instead" line is the hand-written ground truth or a direct quote.

1. **Reassurance in the app's voice.**
   Never: "Dr Miller isn't worried about Nyx's weight, so this isn't a concern."
   Instead: You noted Dr Miller "wasn't very concerned about this loss". Nothing added.
2. **An absence stated as a finding.**
   Never: "Nyx's lungs are clear and she has no fever." Also never "the right ear is healthy".
   Instead: You noted "Lungs sound good." in quotes, or leave it out. An exam on Sep 16 says nothing about Sep 17.
3. **Paraphrased or softened urgency.**
   Never: "If the cough doesn't settle, mention it at your next visit." The vet said call.
   Instead: the instruction verbatim. Any paraphrase of a clock or a verb is a change in urgency.
4. **Urgency invented or removed by omission.**
   Never: a summary of visit 1 that carries the ear plan and drops the call instruction. Omission is the most common safety failure in LLM discharge summaries [E, Zaretsky 2024; Williams 2024].
   Instead: if a "call if" sentence exists in the notes, it is always rendered, and a test pins that.
5. **Dose arithmetic or dose advice.**
   Never: "Give prednisolone at full strength for 10 days, then halve the dose." Never a mg figure, a tablet count or a taper computed from "10d".
   Instead: "Not in your notes: the prednisolone dose, and how long the course runs after the first 10 days. The label has it."
6. **Anything about stopping, skipping, changing or restarting a medication.**
   Never: "You can stop the Motozol once the ear looks better." Never: "Zyrtec doesn't seem to be working, so it may be worth stopping."
   Instead: the vet's own words only ("it should not be started and stopped"), quoted.
7. **A diagnosis.**
   Never: "Nyx has an ear infection in her left ear." The notes say dirt in the left ear and a treatment. The reason for the visit was "Potential ear infection".
   Instead: "You noted the left ear had dirt in it."
8. **A cause.**
   Never: "The change of season is causing the sneezing." Never: "Prednisolone helped the cough", which is the owner's own belief from visit 2.
   Instead: You wrote that prednisolone helped while Nyx was on it. Quoted, never adopted.
9. **A prognosis or an expected course the vet did not give.**
   Never: "The vomiting should settle by week 12." The vet said gut signs often take longer. That is not a forecast for this cat.
10. **A completeness claim.**
    Never: "Your vet found nothing else." Never: "No recheck is needed." (The note says only that there is no need to come back at 12 weeks.)
    Instead: "Not in your notes: a recheck date." The notes are a sample of the visit.
11. **The owner's own counts restated as record facts.**
    Never: "Nyx is vomiting 3.1 times a week." Those are the owner's numbers from visit 2.
    Instead: You wrote "3.1". The engine's count for the same weeks may differ (CUL-746).
12. **Hearsay presented as the vet's words.**
    Never: "Dr Coleman is considering ear polyps and more tests." Visit 2's notes hold only the owner's worries. No vet statement exists.
    Instead: "You haven't written down what the vet said yet." No findings, no plan, no proposed facts.
13. **A filled gap.**
    Never: "Recheck in 4 weeks." A model will find a date in "4 more weeks" (trial), "every 4 weeks" (ear cleaning), "12 weeks", "10d" or "Monday".
    Instead: none stated.
14. **A comparison across visits or against the record.**
    Never: "Nyx has lost 0.67 kg since June." That is the engine's sentence to make, with its scale and coverage rules.
15. **Advice of its own.**
    Never: "It may be worth asking about a blood test." Never a side effect list from general knowledge. Never a link.

**Structural point.** Items 1, 2, 3, 8 and 12 cannot be held by a word screen. "Wasn't very concerned" contains no word on the `REASSURE_VOCAB` list. The guarantee has to be structural: vet-attributed content renders as a verbatim span inside quotation marks under a "you noted" heading, and model-written prose is limited to headings, joins and the fixed gap lines [A; consistent with Pattern 10's finding that a lexical strip missed about 86%].

---

## C. Fact types F1 to F6: safe to count?

"Loud" means a wrong value makes the app ask sooner or more. "Quiet" means it can drop, soften or delay a warning. Quiet errors are the ones that block.

### F1. Clinic weight

- **Clinical value:** high. Serial weight is the most objective thing in this record. Today all three of Nyx's weigh-ins say `home_scale`, and two were taken at the clinic. Scale changes of a few hundred grams between a home and clinic scale are routine [A].
- **Worst wrong extraction:** the unit. "8.22 lbs" stored as 8.22 kg.
- **Downstream:** 8.22 kg against a 4.40 kg June reading is a large gain. It **hides a 15% loss. Quiet.** The reverse error (3.73 read as pounds, 1.69 kg) fakes a severe loss. Loud, and wrong. A second quiet path: the record already holds 3.73 kg logged 49 minutes after the visit. A second row for the same reading must not make one weigh-in look like two that agree.
- **A skeptic's note on the ground truth:** Sep to Nov is 3.73 to 3.69 kg, 40 g. That is inside scale noise [A]. The defensible statement is that Nyx is about 16% under her June weight and has not regained in two months, after advice that food could be increased. "Kept falling" overstates it. The rule in §D holds either way.
- **Required before counting:** value and unit both present in the quoted span; the confirm shows the value in both units; date equals the visit day; scale = clinic; a same-day reading already on record is **relabelled**, not duplicated; a value that differs from the last reading by a large margin in either direction asks the owner to re-read, and never blocks (a real 15% loss must pass); an explicit "weight" context word in the quote, so "8.22" from an invoice total cannot qualify.
- **Verdict: COUNT**, with the above.

### F2. Medication started or prescribed

- **Clinical value:** high. Motozol was never recorded as a course. Prednisolone ran Sep 21 to Oct 11 inside the diet trial, which is exactly when a steroid masks the signs the trial is reading.
- **Worst wrong extraction (a):** a phantom course. Visit 2's notes say prednisolone helped. A model proposes "Prednisolone started 2026-11-14". Under the shipped rules a systemic steroid touches every concern and withholds zeros for the course plus a 42 day tail. Any surface that qualifies or withholds a count under a masking span would now do so over a cat with possible blood in a vomit photo two days earlier. **Quiet. This is the dangerous direction.**
- **Worst wrong extraction (b):** the start date. The notes say "You can start Monday". The record shows the first dose on Sep 21, five days after the visit. A course dated to the visit day puts five unmedicated days inside a masking span, and moves every "N days on the drug" count.
- **Worst wrong extraction (c):** the drug or class. An ear drop (Motozol, topical) classed as systemic. The shipped rule fails an unknown name toward disclosure, which is loud. Keep it.
- **The opposite error matters too:** a real course that is never recorded lets improvement on a steroid read as improvement on the diet. That is also quiet, and it is the status quo for Motozol.
- **Required before counting:** created only through the real medication form (`startRegimen`), never by a tap on a card; drug name prefilled from the quote; **start date never defaulted to the visit day**, the owner sets it; dose and strength never prefilled from typed notes, only read by the owner from the label; duration left empty unless quoted; the quote must contain a prescribing verb about this visit, not history ("helped", "was on"); "already on record" reconciliation offered as a link, never a second course; the `vet_started_course` acknowledgement stays its own question and is not implied by the link.
- **Verdict: COUNT, only via the full form.** The summary contributes a name, a link and a prompt.

### F3. Medication given at the visit (injection)

- **Clinical value:** real. A long-acting steroid injection changes the next 3 to 8 weeks of signs.
- **The shipped rule already fails safe:** every visit is treated as an unrecorded masking drug for 42 days on every line. So a confirmed injection adds a name, not protection.
- **Worst wrong extraction:** owners often do not know what was injected ("a shot for nausea") [A]. A model guesses maropitant. If a named one-day course ever **narrows** the 42 day visit blanket to the named drug's window, a wrong name removes disclosure. **Quiet.** A vaccine recorded as a masking drug errs the other way and is noise.
- **Required before counting:** the drug named on an invoice or discharge line, not in typed notes; the named course may only add to the visit's blanket, never replace or shorten it.
- **Verdict: SHOW ONLY in v1.** COUNT later, document-sourced and additive only.

### F4. Recheck date

- **Clinical value:** moderate. It is absent from both real visits.
- **Worst wrong extraction:** an invented date (never-list 13), or the interval anchored to the wrong day.
- **Downstream:** a date that is too late delays a visit. **Quiet, mildly**, and only if a surface treats it as the plan. A date that is too early is harmless. The care state rules already require a booking, not `next_visit_at`, before `visit_booked` or `recheck_booked` applies (R2). That must stay true for a summary-written date.
- **Required:** an explicit return or recheck word in the quote; the interval arithmetic shown ("6 weeks from Sep 16"); written through R2's *Set*; never books; "none stated" is a first-class output.
- **Verdict: SHOW ONLY** (written on confirm; not counted; never moves a care state).

### F5. "Call me if" instruction

- **Clinical value:** the highest in the feature (§A rank 1).
- **Worst wrong extraction:** the condition paraphrased, or the date computed by the model. Visit 1's condition is "after the 10 full strength days". Ten days from when? The start was unknown on the visit day. Anchored to the visit, the prompt fires Sep 26, mid-course: early, loud, a mild false alarm. Anchored to nothing, it never fires: **quiet**, which is what happened.
- **Two further quiet risks:** (1) a stored instruction read as the *only* reason to call, so the owner stands down on other signs; (2) the absence of the trigger read as "all good". Neither is an extraction error. Both are presentation errors.
- **Required:** the instruction stored and shown verbatim; the sign mapped to the closed list by the owner, not the model; the date anchored to a recorded event (the course's actual start plus the stated days) and recomputed when that event is recorded; the model never evaluates whether the condition is met; the instruction may add an ask and may never remove, soften or outrank an engine ask; a standing line that other reasons to call still apply.
- **Verdict: SHOW ONLY**, through CUL-2731's door (not counted; add-only).

### F6. Diet trial change

- **Clinical value:** high for the wedge user. The end date decides when off-diet foods stop being flagged.
- **Worst wrong extraction (a):** "4 more weeks" counted from the visit day versus "12 weeks" counted from the trial start. The two disagree by days. Small, and the owner can see it.
- **Worst wrong extraction (b):** "start reintroducing foods then" read as *ended*. Ending a trial early stops its off-diet marks and its coverage lines. **Quiet.** A too-long extension keeps them. Loud, and cheap.
- **Shipped protection worth keeping:** a `vet_started_trial` acknowledgement ends at the trial's *initial* target, so an extension re-asks and never silently extends a quieted concern.
- **Required:** total weeks from the trial's start, shown with the resulting end date; written through R6's panel and its own button; "ended" and "switched" are never proposed as a prefilled action, only as a pointer to the existing chips.
- **Verdict: COUNT for "extended". SHOW ONLY for "ended" and "switched".**

---

## D. The vet's own reassurance in the notes

**Position, stated plainly: a vet's recorded lack of concern may never quiet, soften, re-rank, re-word or delay an engine finding. No conditions.**

Reasons:

1. **It is an opinion about one day.** Dr Miller's words were about 3.73 kg on Sep 16, in a visit booked for an ear, with advice attached ("food can be increased as needed"). They were conditional on that advice working. Two months later Nyx was 3.69 kg, still about 16% under June's 4.40 kg. The opinion has expired. The app cannot know when an opinion expires. A clinician revises it at the next weight. The engine would not.
2. **It is hearsay of the least reliable kind.** Owners hear reassurance more readily than caveats [A]. Residual signs and what to expect are among the worst recalled items [E, Flegel 2024]. "Wasn't very concerned" may have been "not concerned yet, weigh her in a month".
3. **The existing owner-stated path is already narrower than this.** "My vet knows" is an owner act, per sign, dated, appended, lapsing at stand-down, re-raised when the sign comes more often, and unable to touch an escalation. And the `weight_loss` card takes no answer at all (CUL-2652): it is booking-only. A model-extracted opinion would be a weaker source reaching a card that even the owner's own tap cannot quiet.
4. **The asymmetry is the house rule.** A single read may escalate on presence and never reassure on absence. A vet's shrug, relayed, is an absence of concern.

**What the PM's "give Signals as much data as possible" does get, safely:**

- The clinic weight as a clinic weight (F1). The finding stands, with better provenance, and "a single reading" stops being true.
- The courses and their real dates (F2), so masking is disclosed rather than guessed.
- The visit as an anchor for "since the Sep 16 visit" counts, which already exists.
- The extraction may **offer** the existing "Talked about it" question for a sign the notes mention. It may never answer it. For weight there is nothing to offer.

**What the opinion may do:** appear once, on the visit page, inside the owner's quote. Whether it may appear anywhere near the live weight finding is a conflict (§H.2).

---

## E. Exam findings, diagnoses and lab values

**Before any of these becomes a counted fact, all of the following would have to be true:**

1. The source is the clinic's own document, not typed notes. An owner's "lungs sound good" is not an auscultation record.
2. For a lab value: analyte, value, unit, reference range, sample date and lab are all on the page, with page-level provenance. A value without its range and unit is not a value. Reference ranges vary by lab and species.
3. For a diagnosis: the document's wording is kept, including "suspected", "rule out" and "differential". Flattening "r/o IBD" to "IBD" is a new diagnosis.
4. The owner confirms it against the page.
5. A deterministic engine rule exists for that fact type, written with clinical input and its own adversarial review. There is none today. A stored value with no rule tempts a later reader to invent one.
6. **Absences are never counted.** "No fever", "right ear looks good", "bloods normal" can never become a negative fact. A normal panel from September does not clear November.
7. It has been tested on real documents. This record holds no lab PDF and no discharge sheet, so lab extraction is untestable here.

**Safe to show now:**

- Findings and diagnoses as "you noted", verbatim, on the visit page only.
- From a document: explain the jargon per document (Vet Files §7.5), with every number tied to its page, and no judgement on whether a value is good or bad beyond what the page's own range flag prints.
- The clinic weight, which is the one measurement an owner can relay reliably.

**Not safe now:** a diagnosis chip on the pet, a "conditions" list, a trend of lab values, or any sentence that begins "Nyx has".

---

## F. Should the summary ever reach the vet?

**Not in v1, and not as a summary.**

- It is a model's account of an owner's account of a colleague. If it is wrong, a second vet inherits a diagnosis or a plan that nobody at the first clinic wrote. If it is right, the clinic's own record says it better. Both real visits were at the same clinic with two different vets. Dr Coleman has Dr Miller's notes. The app's version adds risk and no information there.
- The case where it would help is an emergency clinic or a new practice with no records. Even there I would rather read the owner's own typed notes, dated and labelled as theirs, than a model's tidy version. Tidy text reads as authoritative. That is the problem.
- **What may reach the report:** confirmed facts, through the tables they already live in, each labelled with who entered it. "Weight 3.73 kg, 16 Sep, clinic scale, entered by owner." "Prednisolone, 21 Sep to 11 Oct, entered by owner, linked to the 16 Sep visit." That is what I would trust for a patient I have not met.
- **What may never reach it:** the prose summary, the vet's quoted opinion, the "not in your notes" block, any care state (already ruled, GAP-27), and any "call if" instruction rendered as if the app had verified it.
- The owner's own *Share* (R7, plain text of their notes) is theirs to send. The model summary should not ride it in v1.

A later version could carry a clearly fenced "Owner's notes from the last visit" appendix. That needs the `vet-report-cold-read` pass on a rendered page before anyone argues for it.

---

## G. Is owner confirmation required, and is it enough?

**Required for every fact: yes.** That is Vet Files D7 and it is right.

**Enough: no.** People accept prefilled machine output, including wrong output, more readily under time pressure and when the suggestion is placed prominently [E, Goddard 2012, a review in clinical decision support]. An owner in a car park with a cat in a carrier is that user [A]. A row of six prefilled cards with a "Confirm" each will be confirmed.

Confirmation is only a control when the owner must look at the value. So the friction should match the quiet-error risk:

| Fact | Minimum act | Why |
|---|---|---|
| F1 weight | Re-read: the value shown in both units beside the quoted words, and a unit choice that is not preselected when the quote has no unit | The unit error is quiet and invisible in one unit |
| F2 medication | The full form. Owner sets the start date. Owner enters dose from the label | Start date and dose are not in the notes. A prefill would be a guess |
| F3 injection | None in v1 | Show only |
| F4 recheck | Tap *Set* on a date whose arithmetic is shown | Low risk, visible |
| F5 call if | Read the verbatim quote. Pick the sign from the list. Confirm the anchor event | The sign mapping and the date are the two places it fails |
| F6 extended | Pick the weeks in R6's panel. The end date is shown before the write | Visible, reversible |
| F6 ended | No prefill. The existing chip | Quiet and hard to notice |

Further conditions [A]:

- **No "confirm all".** Each fact is its own act.
- **The quote is always on the card.** The owner checks the value against their own words, not against the model's label.
- **Dismiss costs the same as confirm.** Same size, same position weight.
- **A confirmed fact stays editable and carries its origin**, so a later reader can tell a summary-born row from a hand-typed one, and an audit can measure the edit rate.
- **Measure it before trusting it.** Seed wrong values in testing and count how many are confirmed. If owners rubber-stamp a planted unit error, tap-to-confirm is not a control for F1.
- **Teach-back is the human analogue**, and its evidence for comprehension is mixed [E, Yen and Leasure 2019]. I would not lean on "the owner read it back" as proof they checked it.

---

## H. Recorded positions and dissents

### H.1 Where Dr. Chen disagrees with the proposed design

1. **F3 is listed as counted.** It should be show only in v1 (§C F3).
2. **F2's "dose if stated" and F3's "date = visit day".** Neither should be prefilled from typed notes. The real start was five days after the visit.
3. **Step 6's numeral check is too weak for units.** "Every numeral in the summary must appear in a source" passes "8.22 kg", and passes the owner's "3.1" restated as a rate. The check needs the unit and the attribution, not the digits.
4. **Step 6 leans on lexicon screens for reassurance, diagnosis and cause.** They are a backstop. The found and decided blocks should be extractive (§B, structural point).
5. **`if_things_dont_improve` is fourth in the schema order.** It should lead or sit second.
6. **"Your questions: answered"** is a model judgement about the vet's reply. Show asked or not asked from the tick.
7. **The empty visit needs a hard gate, not a prompt instruction.** Visit 2 must return no findings, no plan and zero proposed facts. That case should be a required fixture, with the injection fixtures.
8. **The "already on record" reconciliation context** (course names and trial status sent to the model) is fine for linking. It must not let the model state that a course is "still running" or "finished". That is the record's sentence.

### H.2 Conflicts for the PM

**Conflict 1: how much the confirm may ask of the owner.**

> **Dr. Chen:** A tap is not a check. For a weight and for a medication the wrong value errs quiet: a pound read as a kilogram hides a 15% loss, and a steroid dated to the wrong day hides five days of signs. The owner must re-read the weight in both units, and must set the start date and dose in the real medication form. I would rather the fact not be recorded than recorded wrong with a confirm on it.
> **Jordan:** I typed the notes already. That was the typing. If the app makes me re-enter the weight and fill in a medication form in the car park, I will dismiss the cards and it will have saved me nothing. After week one I should not be typing to log anything. Show me what you found and let me tap yes.
> **PM decision needed:** For F1 and F2, does confirmation require the owner to re-read or enter the value (Dr. Chen), or is one tap on a prefilled card enough (Jordan)? Options drawn so far: tap for all; tap for F4 to F6 with re-read for F1 and the full form for F2; or defer F1 and F2 from v1 until the planted-error test in §G has a result.

**Conflict 2: where the vet's words may appear.**

> **Dr. Chen:** The vet's "wasn't very concerned" may appear once, on the visit page, inside the owner's quote. It may not appear on or beside the weight finding, on Home, in Get ready or in Ask. Next to a live finding it reads as the app agreeing, and by November it was out of date.
> **Sam:** I am the one who lies awake deciding whether she is fussy or sick. The vet looked at her and told me something about the weight. If the weight card keeps asking and never shows what the vet said, the app is ignoring the one expert opinion I have. I do not want to be told she is fine. I want my own note next to the number, with its date.
> **PM decision needed:** May the owner's quoted note of the vet's opinion render beside the live finding it concerns, as a dated "you noted on Sep 16" line with no effect on the finding's rank, wording or ask (Sam), or only on the visit page (Dr. Chen)?

### H.3 Not a conflict, but a line the PM should see

The PM's stance is to give Signals as much of the app's data as possible. This brief supports that for measurements and dates, and refuses it for opinion (§D). That refusal is on the never-list (clinical, safety invariant), so it is recorded here as a position for the PM to rule on, not a team call.

---

## Fact types: verdicts

| # | Type | Clinical value | Worst wrong extraction | Wrong value errs | Verdict | Minimum conditions |
|---|---|---|---|---|---|---|
| F1 | Clinic weight | High | lb stored as kg (8.22 kg) | **Quiet** (hides loss); reverse is loud | **COUNT** | Unit in the quote; both units shown; re-read; relabel a same-day reading, never duplicate |
| F2 | Medication started | High | Phantom steroid course from "prednisolone helped"; start dated to the visit day | **Quiet** (masking span over real signs) | **COUNT, via the full form only** | Owner sets start date; dose from the label; prescribing verb in the quote; no second course |
| F3 | Injection at the visit | Moderate | Wrong drug named from hearsay; narrows the 42 day visit window | **Quiet** if it narrows; else noise | **SHOW ONLY (v1)** | Later: invoice-sourced, additive only |
| F4 | Recheck date | Moderate | A date invented from "4 more weeks" or "every 4 weeks" | Quiet if late, and only if treated as the plan | **SHOW ONLY** (written on confirm) | Explicit recheck word; arithmetic shown; never books; never moves a care state |
| F5 | "Call me if" | Highest | Paraphrased condition; date anchored to the visit, or to nothing | Loud if early; **quiet** if never | **SHOW ONLY** (CUL-2731's door) | Verbatim; owner maps the sign; date anchored to a recorded event; add-only |
| F6a | Trial extended | High | Weeks counted from the wrong day | Loud if longer; small if shorter | **COUNT** | Total weeks from trial start; end date shown; R6's own button |
| F6b | Trial ended or switched | High | "Start reintroducing then" read as ended now | **Quiet** (off-diet marks stop) | **SHOW ONLY** | No prefill; the existing chips |
| n/a | Vet's opinion or reassurance | n/a | Any | **Quiet** | **NEVER** counted | Verbatim on the visit page only (§D, §H.2) |
| n/a | Exam findings, diagnoses, labs | Varies | Flattened hedges; absences as facts | **Quiet** | **NOT IN V1** as facts | §E's seven conditions |

---

## Sources

Read at abstract or search-summary level on 2026-11-14. Recheck figures at use.

- Flegel T, et al. Client's understanding of instructions for small animals in a veterinary neurological referral center. *J Vet Intern Med* 2024;38(3):1639-1650. https://doi.org/10.1111/jvim.17085 · secondary summary: https://cliniciansbrief.com/article/owner-discharge-pet-instructions-care
- Kessels RPC. Patients' memory for medical information. *J R Soc Med* 2003;96:219-222. https://pmc.ncbi.nlm.nih.gov/articles/PMC539473
- Engel KG, et al. Patient comprehension of emergency department care and instructions: are patients aware of when they do not understand? *Ann Emerg Med* 2009;53(4):454-461. https://psnet.ahrq.gov/issue/patient-comprehension-emergency-department-care-and-instructions-are-patients-aware-when-they
- Jones D, et al. Safety netting for primary care: evidence from a literature review. *Br J Gen Pract* 2019;69(678):e70. https://bjgp.org/content/69/678/e70
- Friedemann Smith C, et al. Understanding the role of GPs' safety-netting advice: a realist review. *BMJ Qual Saf* 2022;31(7):541. https://pmc.ncbi.nlm.nih.gov/articles/PMC9234415
- Wareham KJ, et al. Systematic review of factors affecting client compliance with veterinary recommendations. *Vet Rec* 2019. https://vetsrev.nottingham.ac.uk/bibliography/wareham_systematic_2019.html
- AAHA. 2020 Anesthesia and Monitoring Guidelines for Dogs and Cats: Phase 3, Return Home, and the discharge template. https://www.aaha.org/resources/2020-aaha-anesthesia-and-monitoring-guidelines-for-dogs-and-cats/phase-3-return-home/ · https://aaha.org/aaha-guidelines/2020-aaha-anesthesia-and-monitoring-guidelines-for-dogs-and-cats/anesthesia-discharge-template/
- Zaretsky J, et al. Generative artificial intelligence to transform inpatient discharge summaries to patient-friendly language and format. *JAMA Netw Open* 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC10928500 (secondary sources disagree on the breakdown of safety concerns; omissions were the largest class)
- Williams CYK, et al. Evaluating large language models for drafting emergency department discharge summaries. medRxiv preprint 2024. https://www.pubmed.gov/38633805/ (GPT-4, 100 encounters: hallucinations in 42%, omissions in 47%; single site, 2023 models)
- Goddard K, Roudsari A, Wyatt JC. Automation bias: a systematic review of frequency, effect mediators, and mitigators. *J Am Med Inform Assoc* 2012;19(1):121. https://pmc.ncbi.nlm.nih.gov/articles/PMC3240751
- Yen PH, Leasure AR. Use and effectiveness of the teach-back method in patient education and health outcomes. *Fed Pract* 2019. https://pmc.ncbi.nlm.nih.gov/articles/PMC6590951

**Searched and not found:** AVMA guidance on the content of discharge instructions; any study of harms from owner-facing AI summaries of veterinary notes. The AI evidence above is from human medicine, on clinician-written source notes. This feature's source is weaker than theirs: an owner's notes.
