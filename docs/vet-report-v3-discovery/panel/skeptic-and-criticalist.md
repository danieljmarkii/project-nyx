# Vet report panel: the skeptic GP and the criticalist

These are two reviewers, each written in their own voice and kept separate on purpose. Neither one softens the other, and where they disagree the disagreement is left standing.

**What they read:** today's `renderReport` output, browser print, Letter.
- `nyx-safety-cat`, pages 1–3: a cat with 23 vomits and three safety flags.
- `mira-refused-trial-cat`, pages 1–2: a cat who refused z/d and lost weight.
- `cooper-trial-dog`, page 1: a dog on a hydrolysed-soy skin trial.

The `.txt` text layers and the appendices were used to check details.

**A caveat on the fixtures.** In these fixtures every Nyx vomit is timed 10:00/10:00, and every Mira event has its "occurred" time equal to its "logged" time. That may be a seeding artifact. The reviewers still treat it as something a real report could show, because the report does nothing to detect or disclose it.

---

## (A) The skeptical GP

*Fifteen years in general practice. I've had the Dr. Google printout, the 40-page spreadsheet and the "my app says it's the chicken" owner. My default is that an owner log is noise until it proves otherwise. My time budget is the 60–90 seconds before I walk into the room, or 30 seconds while the owner holds out a phone.*

### 1. My read of today's report in 90 seconds

**What I used:**
- **Signalment and the window box (all three).** They are clean and complete, and the window says what it is ("Since diet-trial start", "Last 90 days"). Better than most referral letters.
- **Mira, the weight line: 4.4 → 4.1 kg, about 7%.** It's the one number on the page I'd act on. I used it, and then I wanted to know how she was weighed, because a 4 kg cat held on a bathroom scale has an error of ±0.2 kg. The report says "home-scale" but not the method.
- **Mira, "Stopped because Mira would not eat it."** Plain and useful. It's the best sentence on the page.
- **Nyx, the vomiting bar chart, from May 16 on.** About 3 a week, flat for six weeks. In two seconds it told me this is chronic, not acute and not worsening. That's what a chart is for.
- **Cooper, "First day of an unbroken run of logged days with only foods on the trial's list: Jun 28."** This is the most important fact on the Cooper page, and it sits in the fourth row of a table. It means this "day 46 of 56" trial has been clean for 4 days, and I'd have caught that only by luck.

**What wasted my time:**
- **Caveats.** I stopped reading them by about the third, so I'll miss the one that matters.
  - "A floor, not a total", "not a diagnosis", "intake not directly observed", "worth confirming against the bag", "Culprit does not judge whether…", "that is the report's assumption, not an observation".
  - The Mira DIET NOT EATEN flag runs to about 120 words, and roughly half of them are the report defending itself.
- **The "NOT TRIGGERED" block inside the safety box.** It's a list of checks that didn't fire, with their trigger thresholds, in the box I'm meant to read first. I don't need to know that the ongoing-vomiting rule needs 6 episodes in 3 separate weeks. It belongs in your engineering doc.
- **"Symptoms vs logging" (Mira, Cooper).** I read it twice and still don't know what it's for.
- **The Nyx "Off-diet protein exposure" chart.** It sits in a report that also says there's no diet trial. It uses the only colour in the document, so my eye goes straight to the least important chart on the page: Chicken treats.
- **Nyx's "20 treats" tile.** It gets the same size and weight as "23 vomiting". On a vomiting cat, treats aren't a quarter of the story.

**What I didn't trust:**
- **Mira, "38 of 38 rated feedings… left unfinished".** Appendix E says **Refused ×34, Ate some ×4**. Page 1 swapped "refused" for the softer "unfinished". If the summary is softer than the data underneath it, I assume every other summary line is too.
- **Mira, "Elimination diet trial — Chicken."** z/d is a hydrolysed diet. Calling it a "Chicken" trial, and then writing that "Chicken is in most of what Mira is offered, so it can't be isolated", tells me the software doesn't know what a hydrolysed diet is. Cooper's "Soy" has the same problem. After that I discount the rest of the diet section.
- **Cooper, "4 / 154 feedings not matched".** Two rows later the same page says "Chicken ×29". The 25 Dentastix are "approved" but contain chicken. Both numbers can be true, but a page that shows me 4 and 29 for the same question has made me do arithmetic to find out which one is the real answer.
- **Cooper, Apoquel.** It has been running since Apr 30, through the whole pruritus trial, and it's on sheet 2. The drug that most changes how I read the primary sign isn't on page 1.
- **Nyx, the foreign-material flag.** It leads the safety box. It reads "Owner/AI note: possible plastic fragment": owner *or* AI, which one? Appendix A says the photo is "NO LONGER RETAINED". The first thing you put in front of me is a machine's guess about a picture I can't see, and the label doesn't make clear who said it.
- **Every time in the event log being identical** (all 10:00, with occurred = logged) under the line "Every time below was witnessed by the owner." In a real record that would read to me as a default value, not a witness. One fabricated-looking column and I throw out the appendix.
- **"Trial directed by Dr. A. Chen."** Says who? The owner entered it. Don't put a colleague's name on a claim without saying it's owner-reported.
- **Nyx, the "3 → 20" tile.** It reads as a seven-fold rise. The first half was logged on 4 of 45 days. The small print admits it, but the big type sets the impression.

### 2. What would make me discard it

- **Any interpretation I didn't ask for.** "Likely food allergy", "consistent with IBD", "the culprit may be chicken". Your *brand name* already leans this way.
- **A summary softer than its own appendix.** Today's "unfinished" for "refused" is already one strike.
- **A number I can't trace to a row in under ten seconds.**
- **Anything that looks like marketing.** A QR code to your website on a medical document is an ad. So is a pet glamour photo, a "Made with ♥" line or a premium badge.
- **More than one page I have to read before I know why the owner is here.**
- **AI-written prose that I can't tell apart from the owner's own words or the app's arithmetic.**
- **Proof that a value was defaulted or fabricated**: identical timestamps, round weights every time, times later than the "logged" time.

### 3. The AI summary

**The worst plausible AI summary for Mira.** It is fluent and confident, and every clause is dangerous:

> *Mira is an 8-year-old spayed DSH with a history of chronic vomiting who began a Hill's z/d elimination trial on June 1. She showed a clear preference for her usual food (Purina ONE) and was picky with the new diet, so the owner appropriately discontinued the trial on day 19. Encouragingly, vomiting decreased from two episodes per week at the start of the trial to none in the final two weeks of the record, suggesting her GI signs are settling. Her weight is essentially stable at 4.1 kg, a modest change within normal home-scale variation, and no concerning findings such as blood or foreign material were identified. Consider re-attempting an elimination trial with a more palatable novel-protein diet and a gradual transition.*

What's wrong with it, clause by clause:
- **"Preference" and "picky."** 34 outright refusals in a cat get recast as taste. That's the intake-is-not-preference failure, and it's the one that kills cats.
- **"Vomiting decreased… to none."** The last two weeks were logged on 0 of 7 days and 0 of 4 days. Absence of logging is read as absence of disease.
- **"Essentially stable… modest."** It's 7% in 18 days, in a cat refusing food.
- **"No… blood or foreign material identified."** No photo was read, so the check had nothing to look at. The report says so explicitly, and the summary inverted it.
- **"Appropriately discontinued."** The AI is grading the owner.
- **"Consider re-attempting…".** That's a treatment plan, which is my job.
- **What it leaves out:** the 13 days of silence and the hepatic-lipidosis window. Those two things *are* the case.

**The guardrail that would have stopped it:** *the summary may only restate engine-computed facts, and it must restate every one of them.*

1. Every sentence cites a fact ID in the snapshot.
2. Any number in the prose must match one in the snapshot.
3. Every safety flag must appear, with its number and its date, or the summary isn't emitted.
4. The summary may make **no** claim of trend, normality, stability or absence over a span the snapshot marks as under-logged, unchecked or unread.
5. Behind those, a hard lexicon ban on *picky, fussy, preference, stable, settling, improving, encouraging, no concerning, appropriately*, plus any verb that recommends.

Rule 4 is the one that matters. The others are belt and braces.

**Would I accept any AI summary?** Honestly, I'd rather have none. Your competitors shipping one is a reason for me to trust *them* less, not a reason for you to copy them. If you must ship one, these are my terms:
- **What it is:** three lines at most, written as an *index*, not a story. "Here because: vomiting ×23 in 7 weeks; one possible foreign-material photo (May 23, photo deleted); 4 in the last 7 days." No adjectives, no "suggests".
- **Label:** "Written by software from the owner's log. Not reviewed by a veterinarian." That goes *on the block*, not in a footer.
- **Placement:** below the patient block and the flags, never above them. The flags are your arithmetic. The summary is a paraphrase of your arithmetic, so it goes second.
- **Provenance:** every clause carries a superscript that resolves to an appendix row.
- **Owner approval does not count as a safety credential.** It makes things worse: an owner who approves AI prose has put their own narrative in a machine's voice. If the owner edited it, stamp it "edited by owner" and show what changed.
- **Fallback:** if the guardrail rejects the text, print nothing, not a degraded version.

### 4. Design: where "beautiful" starts costing trust

The PM wants "less clinical, fewer words, premium". Two of the three are right. Your report isn't too *clinical*. It's too *lawyerly*. Clinical means terse, dated, numeric, scannable. That's what I want, and it's compatible with premium. The owner's screen can be warm. This PDF is for me.

Where beauty costs trust, concretely:
- **Colour that encodes a verdict.** Green or amber or red status chips, or a green tick beside "Medication: none". Green tells me "normal", and you don't know normal. Colour also has to survive a greyscale printer and a fax, and plenty of clinics still have both. Today's gold Chicken bars are the right instinct (texture backs the colour), on the wrong chart.
- **Rounded cards, one per metric.** A card grid gives every fact equal weight. "20 treats" in the same card as "23 vomits" is a hierarchy failure in a nice frame. One ruled table beats six cards.
- **A big hero number.** Pick the wrong one and it lies loudly. "3 → 20" in 30-point type would be today's worst offender. A hero number should only ever be a *dated count of a flagged sign*, and you will be tempted to make it a "score".
- **A headline sentence.** "Mira's vomiting is easing." Any headline is a conclusion. If there's a top line, make it the reason for the visit: "Refused prescribed diet 34 of 38 meals; −7% weight in 18 days; no record after Jun 19."
- **Icons.** A paw, a heart, a sparkle for "AI". The sparkle is the worst: it makes machine output look like a feature instead of a caveat. Keep the warning triangle and nothing else.
- **Brand.** "Culprit" printed in a serif wordmark at the top of a clinical document says the app thinks it's found the cause. Keep the brand to a footer line. Drop the QR code, or move it to the last page.
- **Whitespace.** Fine, until it pushes the Apoquel line onto sheet 2. Today Nyx page 1 is a third empty while page 2 is crammed. Premium whitespace that costs page-1 facts is a bad trade.
- **Light grey type.** The "≈7% of body weight" sits in small grey type under a big "−0.3 kg". The clinically important number is the quiet one.

### 5. Questions for the vet

**Owner's questions:** useful, *if* they are the owner's own words, capped at three, at the end, and unedited by AI. Presumptuous, and Dr. Google with a better font, if the software writes them ("Ask your vet whether Mira could have IBD or lymphoma"). Never generate them. Never "suggest" them.

**"What this record can't answer":** this is the most useful idea in the brief. It is how a log earns credibility: by telling me where it's blind. Keep it to one block with no more than five lines, phrased as gaps, not as questions to me.

What I'd accept for Mira:

> **Owner's questions** *(in Sam's words)*
> 1. "She won't eat the z/d — what should she eat instead?"
> 2. "Is the weight loss serious?"
>
> **Not on this record**
> - What Mira ate from the free-fed Purina bowl, 1–19 June.
> - Anything after 19 June (13 days).
> - Whether the other cat's food was accessible.
> - Body condition, stool, urination.
> - How she was weighed.

### 6. The safety band

I'm not the 2 a.m. reader, so I'll defer to (B) on what goes in it. My one rule is that the band uses the same nouns as the data. If the appendix says *refused*, the band says *refused*.

### 7. A clinic AI reading first

**The failure that worries me most: negation and hedge loss.** Your report is built on "not": not a clean elimination, not a negative result, not checked, not evidence none was fed, AI read · unconfirmed. Summarisers drop qualifiers. That produces:
- "possible foreign material, AI read, unconfirmed" → "**foreign body ingestion**"
- "no food reached the association threshold — not a negative result" → "**no food association found**"

That lands in my medical record under my login, and next year's locum reads it as history. Owner-reported observations become charted fact.

What I need from you:
- Each fact as one self-contained sentence, carrying its own subject, number, unit, date and source ("owner-reported", "software photo read").
- Hedges inside the sentence, never in a separate caveat line a summariser can skip.
- **No hidden machine layer** that says something the visible page doesn't. If your PDF talks differently to my AI than to me, I'm out.

### Saved reports attached to visits

Yes. This is the feature that makes it a record. Requirements:
- The saved report is **frozen**: what I saw at the 3 June visit is what's attached to the 3 June visit, forever.
- Later edits create a new version, with a visible "superseded by" link.
- Generation time to the minute, plus the window.
- If the owner deleted a photo or an event after the report was saved, the saved copy doesn't silently change.

---

## (B) The emergency and critical care vet

*It's 2 a.m. I've never met this patient. The owner is in reception crying, the tech is getting vitals, and the phone with your PDF on it was handed to me at arm's length. I have about 20 seconds before I put my hands on the animal, and another minute afterwards. All I care about is what could kill this animal tonight, and what I'd do differently because of your page.*

### 1. My read of today's report in 20 seconds

**What I used:**
- **The bordered SAFETY box.** I found it instantly. A black border and a triangle at the top of the page is exactly right, and I don't want it prettier.
- **Mira: "Weight fell 4.4 → 4.1 kg… about 7%", "hepatic-lipidosis risk window", "No event of any kind logged after Jun 19 (the last 13 days)".** Those three facts change what I do tonight: bloods with a liver panel and bilirubin, a check for jaundice, and whether we go to a feeding tube. All three are inside one 120-word paragraph, and I found them on the *second* pass.
- **Nyx: "4 vomiting entries in the last 7 days" and "most recent 2 days ago".** Current burden, with a date. Good.
- **Nyx: "possible foreign material… plastic fragment".** In a cat still vomiting six weeks later, I'm now thinking partial obstruction or a linear foreign body, and I'm feeling the belly and looking under the tongue. Useful, even unconfirmed.

**What wasted my time:**
- **The patient block above the safety box on Mira.** Grey italic "owner-recorded, as of this report" and "not a finding in this window" are stopping my eye before the box.
- **The safety box ordering on Nyx.** A 40-day-old unconfirmed photo read leads. The current state (4 in 7 days, last 2 days ago, record stops Jun 30) comes second, and the flag doesn't say how old the photo read is. Order by *tonight*: current burden first, history-of-concern second, each with its age.
- **"NOT TRIGGERED" in the safety box.** At 2 a.m. it makes me read three lines of rule thresholds to learn nothing.
- **Everything below the weight line.** At-a-glance tiles, trial tables and charts are for the GP on Thursday. I didn't need them, and I'd rather they weren't competing.

**What I didn't trust:**
- **"Unfinished."** For a cat, I need *refused* versus *ate some*. That breakdown (34 refused, 4 ate some) is on sheet 7. It belongs in the flag.
- **The foreign-material flag, which doesn't tell me the photo is gone.** I find that out in an appendix I'll never reach. If I'd known, I'd weight it differently and ask the owner what *they* saw.
- **Anything the owner was "told".** Nyx: "The owner was told to call the vet soon." Told by whom? Your app? Then say "Culprit advised the owner…", so I know an algorithm triaged this animal before I did.

### 2. What would make me discard it

- **Something reassuring.** "Stable", "improving", "no red flags", "normal", or a green anything. The moment a consumer document tries to reassure me about an animal in my ER, I stop reading it, because it has shown me it's not on my side.
- **No timestamp on the last logged event**, or a "generated" date that hides how stale the record is. Mira's report is "generated Jul 2" and ends Jun 19. If that gap isn't impossible to miss, the report is lying by layout.
- **Safety facts below the first screen of a phone.** The INDEX says the report renders at 6–7 pt body text on a phone, because a 794-pixel page gets squashed to 390. I will be reading this on the owner's phone. If I have to pinch-zoom to find the flag, I won't.
- **An AI summary on top.**
- **More than ten seconds to find the weight, the last meal eaten, and the last vomit.**

### 3. The AI summary

**The worst plausible AI summary for Mira.** Mine is shorter than (A)'s, because at 2 a.m. the short one is the dangerous one:

> *Mira (8y FS DSH, chronic vomiting) — z/d trial discontinued day 19 due to palatability; transitioned back to regular diet. Vomiting resolved over the final two weeks. Weight 4.1 kg. No red flags on photo review.*

What's wrong with it:
- **"Palatability."** A refused prescription diet becomes a flavour problem.
- **"Transitioned back to regular diet."** Invented. The record says nothing after Jun 19. Whether she's eating *anything* is the question I'm asking.
- **"Vomiting resolved."** It's 0 of 11 days logged.
- **"Weight 4.1 kg."** True, and it strips the −7% and the date, so it reads as a current weight.
- **"No red flags on photo review."** No photo existed.

Every sentence is grammatical and individually close to true. Together, it gets a cat sent home without a liver panel, and that cat comes back in four days, yellow.

**The guardrail that would have stopped it:** *a staleness and absence lock.* Any claim about the current state ("resolved", "back to", "now", "stable", a bare current weight) must be anchored to a dated event inside the last 48 hours of logged data. If the record has a gap, the gap must be stated before any such claim, and claims across the gap are forbidden. Mechanically:
- The prose generator gets **no tokens** for "resolved, improved, stable, back to, no red flags".
- Any weight must print with its date and its delta.
- The "last logged" date is a required field the summary can't be emitted without.

**Would I accept any AI summary?** Not LLM prose, not on the page I read at 2 a.m. I would accept a **deterministic, templated line**, which isn't "AI" at all. For example:

> "Record ends 19 Jun (13 days before this report). Prescribed diet refused 34/38 meals. Weight −7% (4.4→4.1 kg, 1–19 Jun)."

It's generated by code from the flags, reproducible, and identical every time for the same data. If the PM needs to put "AI" in the marketing, put it in the owner's app, where the owner can be told "this is an AI read" and a vet isn't relying on it.

If an LLM summary exists at all, these are my terms:
- **Placement:** last on page 1 or on its own page. Never first, never inside the safety box, never in the text layer before the flags.
- **Label:** "AI-generated from owner logs · not vet-reviewed", in the same type weight as the content.
- **Sourcing:** every number cited to a row.
- **Approval:** owner approval doesn't matter to me. What matters is that the engine checked it. A summary that fails the check is *not shown*. It is not shown with a warning.

On this, (A) and I disagree: (A) would accept a three-line index in prose. I want no prose at all in my first 20 seconds. Code-written or nothing.

### 4. Design: where "beautiful" starts costing trust

My bar isn't trust. It's *latency*: anything between my eye and the flag costs me time.
- **Rounded cards and soft shadows.** They're fine on a screen. Printed on a clinic laser printer, a soft grey card background goes muddy or vanishes, and a border is what carries the box. Keep the hard black rule on the safety box. It's the best design element in the report today.
- **Colour.** One alarm colour, used *only* for the safety band, backed by a border and a word, so it survives greyscale. If the brand palette has a warm accent, it must never appear in the safety band, or the alarm stops meaning anything.
- **The hero number.** I'd *welcome* one, if it's the right one: the most dangerous fact, with its date. For Mira that's "−7% in 18 d". For Nyx it's "4 vomits / 7 d · last 2 d ago". A hero number that's a brand metric (a "health score", "days tracked", a streak) is a reason to discard.
- **A headline sentence.** Only if it's the templated line above. "Mira's been a little off her food" is a premium voice that kills cats.
- **Brand in the first 3 inches.** The masthead (wordmark, QR code, "owner-reported pet-health summary", three lines of disclaimer) is about 1.3 inches of the first 3 on every report. That's nearly half my safety band spent on Culprit. Shrink it to one line.
- **"Less clinical" copy.** "Mira wasn't keen on her new food" is the exact sentence I'm afraid of. Warmth belongs on the owner's screen.

### 5. Questions for the vet

**Owner's questions:** irrelevant to me at 2 a.m., and fine for the GP. Put them after the clinical content, never on the first screen, and only in the owner's words.

**"What this record can't answer":** essential. It's the other half of the safety band. I don't want it as questions. I want it as **unknowns, stated as unknowns, at the top**. What I'd accept for Mira, inside the band:

> **Not on this record:** anything after 19 Jun · what she ate from the free-fed bowl · urination / litter · stool · lethargy · toxin access · body condition.

For Nyx:

> **Not on this record:** anything after 30 Jun · weight (never weighed) · appetite / intake from free-fed bowls · stool (none logged — not "normal") · the May 23 photo (deleted by owner).

### 6. The safety band

**What must be in the first 3 inches of page 1**, in this order, fitting a phone's first screen at a legible size:
1. **Identity**: name, species, age, sex/neuter, and **last weight with its date** (or "never weighed").
2. **Record edges.** "Record ends [date, time] — N days before this report", in type as large as the pet's name. For Mira it's 13 days. That number is a finding.
3. **Active flags, one line each, ordered by tonight**, each with a count, a date and the age of the evidence:
   - Mira: "**Refused prescribed diet** — 34 of 38 meals refused, 4 partly eaten (1–19 Jun). **Weight −7%** (4.4→4.1 kg, 1–19 Jun, home scale). Cat: ≥48–72 h low intake = hepatic-lipidosis risk."
   - Nyx: "**Vomiting 4× in last 7 d**, last 2 d ago. **Possible plastic in vomit** — software photo read, 23 May (40 d ago), *photo deleted, unconfirmed*."
4. **Current meds**, or "none entered — not verified". Cooper's Apoquel belongs *here*.
5. **Known conditions**, one line.
6. **Not on this record**: the unknowns line.

Anything else, "Not triggered" included, goes below the band.

**What must NEVER be implied by absence:**
- No vomit logged ≠ no vomiting. A falling bar in an under-logged week ≠ improving.
- No stool logged ≠ normal stool (and ≠ constipation). Say "not logged".
- No urination or litter-box data ≠ urinating. In a male cat that's an obstruction I could miss.
- No blood or foreign-material flag ≠ no blood or foreign material, when no photo was read or the photo is gone.
- No medication logged ≠ no medication. NSAIDs, steroids, a neighbour's permethrin flea product: none of it is in your app.
- No toxin logged ≠ no toxin. Lilies, string, human meds.
- No weight ≠ stable weight. A bare last weight without its date ≠ today's weight.
- "Not triggered" ≠ absent.
- "Unfinished" ≠ mostly eaten.
- No events since the last log ≠ recovered. **The silence is the finding.**
- No off-diet food logged ≠ clean diet.
- "Generated today" ≠ "current today".

### 7. A clinic AI reading first

**The failure that worries me most: reading order and orphaned labels.** Look at your own text layer (`mira-refused-trial-cat.txt`):
- The flag label **"DIET NOT EATEN" comes *after* its paragraph**, and **"NOT TRIGGERED" comes *after* "Ran and did not trigger, which does not rule these out: ongoing vomiting…"**. The labels float free of their content. A summariser that chunks on those boundaries can bind "NOT TRIGGERED" to the next thing it sees, or reduce "ongoing vomiting… not triggered" to **"no ongoing vomiting"**.
- The at-a-glance tiles come out as loose numbers. "19 / 19" lands right after the heading "DIET TRIAL — Trial". A machine reads that as "**trial 19/19**": a complete, adherent trial, for a cat who refused it.
- The chart values ("2 2 1 – –") lose their week labels entirely.

The second worry is truncation. Clinic tools often summarise the first N tokens. Today, the first ~150 tokens of the text layer are the masthead, disclaimers, QR alt-text, signalment and the window box. The flags begin after that. If the tool truncates, the flags are the first casualty.

What I need:
- A tagged PDF with a real reading order, where the flag label precedes its content.
- The safety band as the **first text in the file** after the patient name.
- Each flag as one self-contained sentence carrying number, unit, date and source.
- Tiles written as sentences in the text layer, not orphan numerals.
- Explicit unknowns written as "Not recorded: …", never as silence.
- Like (A): no hidden machine-only layer. Whatever the clinic AI reads, I must be able to see.

### Saved reports attached to visits

Useful to me only if the attached report says, in the band, **how old it is**: "Saved at the 3 June visit — 27 days ago. Newer data may exist." Otherwise a frozen report is a stale report wearing a visit's authority. If the app holds newer logs than the saved copy, the in-app view should say so on top.

---

## Where the two reviewers do not agree (left unresolved)

| Question | (A) Skeptic GP | (B) Criticalist |
|---|---|---|
| AI summary | None preferred. Will tolerate a 3-line cited *index*, below the flags, labelled. | No LLM prose in the first 20 seconds at all. Accepts a deterministic, code-written line only. |
| Hero number | Distrusts it. It'll become a "score". | Wants one, if it's the most dangerous dated fact. |
| Page 1 density | Fewer things on page 1. | A dense dated band is fine, if it's the right things. |
| Owner questions | Useful in the owner's own words, capped at 3, last. | Irrelevant at 2 a.m., harmless if placed last. |

**Where they agree:**
- Cut the hedging. Keep the hard-ruled safety box.
- Use the appendix's nouns on page 1 ("refused", not "unfinished").
- Put meds that change the reading (Apoquel) on page 1.
- Show the record's end date as large as the pet's name.
- Every flag carries a date and the age of its evidence.
- Unknowns are stated, never implied.
- Fix the PDF's reading order before optimising it for any clinic AI.
- No machine layer the vet can't see.
