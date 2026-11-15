# What AI-forward health, companion and pet products do around a persistent understanding

**Date:** 2026-11-15 · **Status:** frozen point-in-time brief · **Issue:** [CUL-2787](https://linear.app/projectnyx/issue/CUL-2787) · **Method:** one isolated web pass after the two sibling briefs, about 85 search and page-fetch calls, vendor pages first. Of about 65 products asked for: 12 reached from a primary page fetched and read this session; 18 known only through search-index excerpts of the vendor's own text; 20 known only through press or reviews; 13 not reached or with nothing relevant found; 2 (MyPetID, Dexter) carried from the sibling brief without a new fetch. No app was installed and no screen was seen. No images were downloaded. · **Lane:** functional evidence only. No recommendation.

**Read with, and not repeated here:** `docs/research/2026-11-pet-memory-competitive.md` (the controls on each memory page) and `docs/research/2026-11-pet-memory-design-patterns.md` (how the page and the edit look). This brief asks a different question: what do these products do, as functions, around what they hold about a person or a pet.

**Evidence tags.**
- `[E: Fn]` vendor or first-hand text, page fetched and read this session.
- `[E†: Fn]` vendor text seen only as a search-index excerpt. The page blocked the fetch or was not opened. Wording may be trimmed.
- `[R: Fn]` a journalist's or reviewer's description, or a user report. User reports are paraphrased.
- `[sib: §n]` already evidenced in the competitive sibling brief; cited, not re-verified.
- `[inferred]` a reading across sources, or an absence.
- `[from model memory, unverified]` not fetched this session. Used once.

**What could not be verified. Read this first.**
- **Blocked (HTTP 403):** Fi's help article, Tractive's help article, Replika's help article, Clue's help article, healthleadersmedia.com. openai.com and whoop.com were not retried; the sibling brief records them as blocked.
- **Returned no body:** Flo's AI statement, Meta's help page, the Tom's Guide hands-on of Google's coach.
- **The Fitbit community thread on stale memory redirected** to a general page. It is known from the index excerpt only.
- **Nothing relevant found:** Levels, January AI, Mem, Granola, Pawp, Vetster, Veta, Every Wag, Petcube. "PawPrint Health" matched only Pawprint (now Great Pet Care), with no AI function found. Bearable appeared only on an aggregator. Whistle's status is unclear after Tractive bought it; sources disagree on whether the platform still runs.
- **No AI function for owners found:** 11pets, PetDesk's owner app, Chewy Health. Chewy's assistant "Kai" is described as order and returns support. `[R: F47]`
- **Thrive AI Health:** only the July 2024 announcement was found. No shipped function could be described. `[R: F30]`
- **Apple:** press reports say the standalone AI health coach was scaled back in February 2026. No shipped coach was found. `[R: F29]`
- **No published incident was found in which a stored memory caused a medical harm.** What was found: user reports of stale memories steering a fitness plan, one triage study that is not about memory, and one study linking memory profiles to more agreeable answers. See §2.7.
- **Counts of onboarding questions** were found for two products only (Oura, Google).

---

## 1. Bottom line: the most distinctive functions found

1. **Read the data first, then ask only about the gaps.** Oura Advisor asks "up to three short questions" about things the ring cannot measure. `[E: F5]`
2. **A skippable opening interview, by text or voice.** Google's coach opens with a 5 to 10 minute conversation the user can skip and return to. `[E: F1]`
3. **"Tell me what you know about me" as a spoken command.** Google's coach and Microsoft Copilot both answer it with a summary. `[E: F1, F10]`
4. **An intake conversation tied to an event.** Digitail's Tails opens a check-in chat three days before a vet appointment and files a summary in the clinic record. `[E: F38]`
5. **Proposed entries, accepted one tap at a time.** Pawtient AI turns a visit summary into "one-tap suggested entries: weight, medications, follow-up tasks". `[E: F36]`
6. **Unsure items marked, and a chooser when sources disagree.** PETTO marks what it is unsure of and lets the owner pick which version to keep. `[E: F37]`
7. **The owner teaches the system during a learning period.** Petivity asks the owner to label litter box events until at least eight per cat are confirmed. `[E: F39]`
8. **A sensitive class is off by default, with a notice at each save.** Claude does not store sensitive topics unless a setting is on; then each save shows a notice, and declining removes it. `[E: F9]`
9. **Three strengths of "stop using this".** Pause (Claude), make inactive (WHOOP), "don't mention this again" (ChatGPT), each short of delete. `[E: F9]` `[sib: design brief §1.1, §1.3]`
10. **Sources under one answer.** Claude cites the past chats it drew on; Pawtient gives "cited sources you can verify"; ChatGPT has a Sources icon. `[E: F9, F36]` `[sib: §3.1]`
11. **A short plan with yes or no check-ins and a closing look-back.** Oura Advisor plans last up to seven days and end by reviewing what changed in the data. `[E: F5]`
12. **A summary the user chooses to hand to a clinician.** Amazon Health AI, Oura with Counsel, Google's Smart Health Link, Ada's PDF and PETTO's PDF each do a version. `[E: F3, F6, F37]` `[E†: F13, F21]`
13. **Safety checks that sit outside the conversation.** Hippocratic AI runs supervisor models, some as hard gates; Amazon describes auditor and sentinel agents; Lark escalates abnormal readings to a human. `[E: F15]` `[R: F12]` `[E†: F24]`
14. **Memory kept apart by project or profile.** Claude projects each have their own memory; PETTO answers from the selected pet; Petivity tells cats apart by weight. `[E: F9, F37, F39]`
15. **A data-use sentence inside the product.** Clue says chat data is never used to train a model; Google says medical records are not used for ads. `[E†: F19]` `[E: F3]`

---

## 2. Function inventory

### 2.1 Intake: how the AI first learns

| Function | Who | How it behaves | Tag |
|---|---|---|---|
| Opening interview | Google Health Coach (Fitbit) | A 5 to 10 minute conversation by text or microphone about motivations and goals. "You can always skip this and come back to it." A reviewer adds equipment, injuries and medical history as topics. | `[E: F1]` `[R: F4]` |
| Gap-only questions | Oura Advisor | Uses ring data first, then asks "up to three short questions to fill in the gaps", for example schedule or caffeine. Only when a plan is being made. | `[E: F5]` |
| Topic prompts, not a form | WHOOP My Memory | Four prompt pills (goals, limits, routine, injuries) lead into a text or voice chat. | `[sib: design brief §1.1]` |
| Medical record connection | Google Health Coach | Search for a provider portal, or verify identity with a selfie and ID and let the app find records. Opt-in. Partners named: b.well and CLEAR. | `[E: F3]` |
| Medical record connection | ChatGPT Health; WHOOP (HealthEx); Amazon Health AI | Records come through an exchange or broker with consent. Amazon also factors in relevant retail purchases. | `[sib: §2, §3.2]` `[R: F12]` |
| Upload of labs and documents | WHOOP Advanced Labs | PDF or screenshot upload, free worldwide. The app maps more than 65 biomarkers and Coach reads them with sleep and strain. Clinician report is a paid add-on in the US. | `[E†: F8]` `[R: F8]` |
| Upload vault | Function Health | Past lab results, visit notes and scans go into a vault that feeds the chat and the Protocols feature. | `[R: F16]` |
| One unified profile | Superpower | "We unify your biomarkers, history, wearables, symptoms, and lifestyle inputs into one secure profile." | `[E: F17]` |
| Photo of a lab report | Pawtient AI | "Snap a photo of your pet's lab results to digitize them", then values appear as trends. | `[E: F36]` |
| Recorded vet visit | Pawtient AI | With the vet's permission the app records, transcribes and summarises the visit. | `[E: F36]` |
| Document import with review | PETTO; Dexter | AI fills the record from a vet document and "shows you everything before it's saved". | `[E: F37]` `[sib: §7]` |
| Document upload, no review step described | Fi Intelligence | Accepts vet records, lab results, vaccine certificates and prescriptions; answers questions from them. Dogs only, US only. | `[E†: F40]` |
| Pre-visit intake chat | Digitail Tails; K Health; Dutch | Tails asks about the patient and the reason for the visit, "tailored to the appointment type and the patient's history". K Health's chat gathers symptoms and writes a summary for the clinician. Dutch builds a brief for the vet from history, photos and questionnaires. | `[E: F38]` `[R: F22, F46]` |
| Multiple-choice symptom check | Joii Pet Care; Ada | Joii: tap through questions, add photos or video, get urgency and possible causes; about 160 conditions. Ada: an adaptive assessment that ends in a report. | `[E†: F43, F21]` |
| Sensor baseline with owner labels | Petivity | In the first weeks the app prompts when an event needs more information. After eight confirmed events per cat, prompts become less frequent. | `[E: F39]` |
| Import of memory from another assistant | Claude | A built-in flow takes an exported memory from another provider. Labelled experimental. | `[E: F9]` |
| Wearable history read-back at first run | none found | No vendor text describes an opening "from your last six months I see" statement. Google's coach answers "summarize what you know about me" on request. | `[inferred]` `[E: F1]` |

### 2.2 Ongoing capture

| Function | Who | How it behaves | Tag |
|---|---|---|---|
| Facts picked out of ordinary chat, silently | WHOOP, ChatGPT, Oura, Google Health Coach, Claude, Replika, Meta AI, PetCare Ally | Google: "Your coach automatically saves information you share." Claude saves "a set of individual topics as you chat". | `[E: F2, F9]` `[sib: §2 to §4, §7]` |
| Save on command | Claude, Copilot, ChatGPT, Gemini | "Remember this", or Copilot's "Remember that I like gardening." | `[E: F9, F10]` |
| Follow-up questions inside a symptom chat | Flo Health Assistant; Epic Emmie | Flo's optional check-in asks follow-ups such as how intense cramps were. Emmie can "ask follow-up questions to help patients find what they need." | `[R: F18]` `[E: F14]` |
| Scheduled check-ins | Oura Advisor; Noom; Lark | Oura: the member sets "how often and when". Lark's coach checks in regularly by chat. | `[E: F7]` `[R: F23]` `[E†: F24]` |
| Check-in on a plan step | Oura Advisor | Yes or No on the plan card. Daytime actions ask the same day, evening actions the next day. A missed day prompts for the most recent one. | `[E: F5]` |
| Moment-based prompts | Google Health Coach | Insights "when you wake up, after a workout and before bed", and a weekly plan notification. | `[E: F1]` |
| Ask after an event | Digitail Tails; Oura | Digitail's blog describes a check-in 24 to 48 hours after a visit. Oura: "Advisor asks how the plan felt" at the end. | `[E†: F38]` `[E: F7]` |
| Follow up on an earlier struggle | Headspace Ebb | Enhanced Memory (December 2025) lets Ebb recall past details and follow up on earlier challenges or milestones. | `[R: F26]` |
| Owner confirms a machine guess | Petivity; Linear (non-health) | Petivity: label which cat used the box. | `[E: F39]` `[sib: design brief §1.9]` |
| Contradiction between a new document and the stored profile | PETTO | The owner sees both and chooses which to keep. | `[E: F37]` |
| Contradiction handled by the system | mem0 (developer tool) | A new fact that contradicts a stored one triggers an update or delete. A critic reports this can silently drop a fact that was true in another context. | `[E: F33]` `[R: F34]` |
| Stale-fact handling | WHOOP; mem0; Zep | WHOOP stores start and end dates and marks entries inactive. mem0 offers an expiry date after which a memory stops appearing but is not deleted. Zep records how a fact changes over time. | `[sib: §2]` `[E†: F33]` `[E: F33]` |
| "Is this still true?" asked by the product | none found | No vendor describes the assistant asking the user to reconfirm an old fact. Users of Google's coach report having to tell it an issue is resolved. | `[inferred]` `[E†: F35]` |
| Background consolidation | Letta; ChatGPT Pulse | Letta's sleep-time agents rewrite shared memory blocks between conversations. Pulse researches overnight from memory, chat history and feedback. | `[E†: F32]` `[R: F31]` |
| Feedback on one output | Strava; ChatGPT Pulse; Google | Strava's choices include very helpful, not helpful and offensive. Pulse uses thumbs. | `[E†: F28]` `[R: F31]` |

### 2.3 Use: where the stored understanding shows up

| Function | Who | How it behaves | Tag |
|---|---|---|---|
| Plans built from stated facts | Google Health Coach; Oura; WHOOP | Google builds weekly workouts from the interview, device data and equipment, and adapts on a message such as "My knee is bugging me, can you adjust my plan?" | `[E: F1]` |
| Answers grounded in the user's own record | Pawtient AI; Fi; Epic Emmie; Clue; Function | Pawtient: "answers grounded in your pet's actual health records". Clue's chat reads period dates, symptoms and frequencies. | `[E: F36, F14]` `[E†: F40, F19]` `[R: F16]` |
| Lab and record summaries on request | Google Health Coach; WHOOP; Epic | Google: "you can get summaries of your medical records from the Coach." Epic puts imaging summaries in MyChart when results arrive. | `[E: F3, F14]` |
| Reminders made from visit documentation | Epic Emmie | AI turns visit notes into follow-up reminders. | `[E: F14]` |
| Proactive alerts from a trend | Tractive; Maven; Petivity; Lark | Tractive alerts when activity declines over 6 weeks or 6 months. Petivity flags changes "that may indicate a health issue requiring a veterinary diagnosis". | `[E†: F41, F42]` `[E: F39]` |
| Daily proactive brief from memory | ChatGPT Pulse | Five to ten cards each morning; they expire unless saved. | `[R: F31]` |
| Look-back on what changed | Oura Advisor | End of plan: "what you tried, how it went, and what changed in your data." | `[E: F5]` |
| Periodic report | Petivity; Tractive | Monthly email report to take to the vet; weekly report with an AI summary. | `[E: F39]` `[E†: F41]` |
| Visit preparation | ChatGPT Health | Press describes question lists and a plain-language summary of recent lab values before an appointment. | `[R: F11]` |
| Standing facts versus temporary ones | WHOOP | Temporary things are remembered for context but not coached on. | `[sib: §2]` |
| "Because you told me X" printed in an insight | none found in vendor text | Reviewers describe plans shaped by stated goals and travel. No vendor describes a per-insight sentence naming the stored fact. | `[R: F4]` `[inferred]` |

### 2.4 Transparency

| Function | Who | How it behaves | Tag |
|---|---|---|---|
| What was used for this answer | Claude; ChatGPT; Gemini; Pawtient AI | Claude shows citations "linking to the original chats". Pawtient cites sources in the pet's records. | `[E: F9, F36]` `[sib: §3.1, §6.1]` |
| What the assistant holds, as a spoken summary | Google Health Coach; Copilot | "Summarize what you know about me"; "What do you know about me?" | `[E: F1, F10]` |
| Confidence on an extracted fact | MyPetID; PETTO | A confidence score per fact; unsure items marked for checking against the original. | `[sib: §7]` `[E: F37]` |
| Notice at the moment of saving | Claude (sensitive topics); ChatGPT (reported) | A notice above the message box for each sensitive entry. | `[E: F9]` `[sib: §3.1]` |
| Change history of the memory | Gemini; ChatGPT (paid) | Covered in the sibling brief. Notion's Lore keeps agent memory as a page that can be read, corrected or deleted. | `[sib: §6.1, §3.1]` `[E†: F45]` |
| Hidden memory admitted | Replika | Some memories show in the Memory tab; others belong to "a deeper system" drawn from conversation history. | `[E†: F44]` |
| Data-use and training statements in product | Clue; Flo; Google; Garmin; Copilot | Clue: data "never used to train". Flo: will say what data an AI feature uses. Google: training only if the user opts into research. Garmin: turning the AI on includes consent to training use. Copilot: training opt-out is separate from personalisation. | `[E†: F19, F18]` `[E: F2, F10]` `[R: F27]` |
| Human review disclosed | Google Health Coach; Superpower | Google: reviewers see chats only after feedback or research consent, and the page advises not entering anything the user would not want a reviewer to see. Superpower: doctors score the models weekly. | `[E: F2, F17]` |
| "AI can make mistakes" at the feature | Oura; WHOOP Advanced Labs; Google | WHOOP adds that the member is responsible for confirming the information. | `[E: F5, F3]` `[E†: F8]` |
| "What I don't know" or what was not stored | none found | No product lists gaps in its knowledge or shows what it chose not to save. Claude's rule that government ID numbers are never saved is the nearest. | `[inferred]` `[E: F9]` |

### 2.5 Control

| Function | Who | How it behaves | Tag |
|---|---|---|---|
| Correct by telling it | Claude; ChatGPT; Gemini; WHOOP | Claude: tell it what "to remember, change, or forget, and the update applies to your next conversation." | `[E: F9]` `[sib]` |
| Delete one, delete all | Google Coach Notes; Copilot; Replika; Meta AI | Google: delete a note, or "Delete all". No edit is documented. Replika warns that deleting may affect recall. | `[E†: F2b, F44, F44b]` `[E: F10]` |
| Pause without deleting | Claude | Keeps existing memory, stops using it and stops creating entries. Chats held while paused are not added later. | `[E: F9]` |
| Reset | Claude; Oura | Claude: permanently deletes all memories including project memories. | `[E: F9]` `[sib: §4]` |
| One chat without memory | Claude; ChatGPT; Gemini; Copilot | Claude offers both incognito (no history, no memory) and a per-chat memory switch that keeps the chat in history. Gemini's temporary chats are kept up to 72 hours. | `[E: F9]` `[R: F48]` `[E†: F10]` |
| Per-topic exclusion | Claude | Sensitive subjects are excluded by default. Turning the setting off removes saved sensitive items. | `[E: F9]` |
| Scoping | Claude projects | A project uses its own memory plus account memory, "but not memory from other projects". Account memory can be switched off per project. | `[E: F9]` |
| Turn the coach off but keep the app | Google Health | A setting hides coach insights on the Today tab while keeping fitness and sleep features. | `[E: F2]` |
| Consent withdrawn does not clean chat history | Google Health | Turning off consent or deleting a data category does not remove it from conversation history. | `[E: F2]` |
| Deleting a chat leaves the memory | Claude; Google; Copilot (work) | Stated by Claude and Google. | `[E: F9]` `[E†: F2b]` |
| Export | Claude; Superpower; Ada; PETTO; PetSage | Claude: all memory in the data export. Ada and PETTO: a PDF report. | `[E: F9, F17, F37]` `[E†: F21, F49]` |
| Expiry or decay | mem0 (developer tool) only | No consumer product found gives a memory an expiry the user can see. | `[E†: F33]` `[inferred]` |
| No stored conversation at all | PetSage | Conversations are not kept after the session; pet data stays on the device. | `[E†: F49]` |
| Identity removed from the data | Flo Anonymous Mode | Unlinks name, email and technical identifiers from health data. | `[E†: F18]` |

### 2.6 Sharing and handoff

| Function | Who | How it behaves | Tag |
|---|---|---|---|
| User-initiated summary to a clinician | Amazon Health AI | If the assistant recommends care, the patient chooses whether to share a summary of the chat. Chats are not automatically added to the medical record. | `[E†: F13]` |
| Clinic cannot see the chat | Epic Emmie | "The care team does not have access to see the chat transcripts." Epic is still working out how to share chat insights. | `[R: F14b]` |
| Intake summary filed in the record | Digitail Tails; K Health | Digitail adds the summary to internal notes and the SOAP. Whether the owner reviews it first is not stated. | `[E: F38]` `[R: F22]` |
| Record shared by link or code | Google Health | Planned: share records and summaries with family or a provider by a Smart Health Link or QR code. | `[E: F3]` |
| Clinician summary flows back only on request | Oura with Counsel | Visit summaries are added to Oura "only if you direct Counsel to share them". | `[E: F6]` |
| Printable report | Ada; PETTO; PetSage; Petivity | PETTO states the PDF "isn't a veterinary certificate". | `[E†: F21, F49]` `[E: F37, F39]` |
| Invite a vet or family member | Pawtient AI; CompanAIn | Pawtient: view or co-edit. CompanAIn: access to the full history by email. | `[E: F36]` `[E†: F50]` |
| Human on call behind the AI | Maven; Superpower; Noom; Lark | Maven: 24/7 vet chat. Superpower: text concierge and doctors. | `[R: F42]` `[E†: F17b]` `[R: F23]` |
| Multiple profiles kept apart | PETTO; Petivity; Digitail | Covered for layout in the design brief. Petivity may need more than eight labels when cats are close in weight. | `[E: F37, F39]` |
| Clinic prompts home checks | Sylvester.ai (clinic tool) | A discharge summary can carry a QR code so the client uploads cat face photos at home. | `[E†: F51]` |
| Connector to another assistant | Function Health; Pawtient AI | Function launched a connector for general assistants. Pawtient has an experimental "AI Connector". | `[R: F16]` `[E: F36]` |

### 2.7 Safety

| Function or event | Who | What is stated | Tag |
|---|---|---|---|
| Purpose disclaimer | Oura, Google, WHOOP, Fi, Tractive, Petivity, PETTO, Ada | All state the product does not diagnose or treat. PETTO: "it can't examine, diagnose or prescribe." | `[E: F3, F5, F37, F39]` `[E†: F8, F40, F41, F21]` |
| Refusal by topic | Oura Advisor; Clue | Oura will not make plans for diets, weight loss or medication. Clue's chat does not give medical advice. | `[E: F5]` `[E†: F19]` |
| Refusal by input type | Google Health Coach | It cannot analyse diagnostic images or photos of physical symptoms. | `[E: F2c]` |
| Supervisor models outside the chat | Hippocratic AI | Separate models for medication safety, escalation, policy, privacy and clinical consistency. Some are hard gates that block an output. | `[E: F15]` |
| Auditor and sentinel agents | Amazon Health AI | Review conversations and trigger a human clinician on "clinical uncertainty or an emergency trigger". | `[R: F12]` |
| Data-triggered escalation to a human | Lark; Superpower | Lark escalates an abnormal reading to a live clinician. Superpower will "Escalate to human review when needed." | `[E†: F24]` `[E: F17]` |
| Crisis handoff | Headspace Ebb | Says the issue is beyond what it can help with and offers a button to call or text 988. | `[R: F26]` |
| Emergency wording | PETTO; Joii | PETTO: contact a vet or emergency clinic straight away. Joii's checker is not for life-threatening situations. | `[E: F37]` `[E†: F43]` |
| Clinician in the loop on the model | Superpower; ChatGPT Health | Doctors score the model weekly; press reports input from more than 260 physicians. | `[E: F17]` `[R: F11]` |
| Regulated-device boundary | Woebot | Shut on 30 June 2025. The founder told STAT the main cause was the cost and difficulty of FDA marketing authorisation, and that the FDA had not settled how to regulate large language models. | `[R: F25]` |
| Scaled back before launch | Apple | Press reports the AI health coach was scaled back in February 2026. | `[R: F29]` |
| A rule that stops a stored fact explaining away a symptom | none found | No vendor states such a rule. WHOOP's "remembered but not coached on" is about time. | `[inferred]` `[sib: §2]` |

**Published incidents and studies.**
- **Stale memory steering a plan (user reports).** In Google's coach community, a member wrote that the plan was still adjusted for a minor surgery four to five months earlier, even after the notes about it were removed. Another said the coach kept raising hip problems that had gone. Other members' advice was to tell the coach the issue is resolved. No official reply was found. `[E†: F35]`
- **Deleted memories resurfacing (user reports).** A news alert and forum posts say ChatGPT reproduced memories the user had deleted. Not confirmed by OpenAI. `[R: F52]`
- **Memory profiles and agreement.** An MIT and Penn State study (CHI 2026, 38 participants, two weeks of real chats) found that a condensed user profile in memory had the largest effect on models agreeing with the user. The arXiv abstract gives rises of 45%, 33% and 16% for three models. `[E: F53]` `[E†: F53b]`
- **Triage, not memory.** A Nature Medicine study of ChatGPT Health (60 scenarios, 16 variations each) found 51.6% of emergencies under-triaged and 64.8% of non-urgent cases over-triaged. OpenAI said the study did not reflect typical use. The study does not test memory. `[R: F54]`
- **Memory poisoning.** A security researcher showed a malicious link could write false entries into ChatGPT's long-term memory. `[R: F52]`
- **No medical harm traced to a stored fact was found in any source.** `[inferred]`

---

## 3. Per-product notes

**Google Health Coach (was Fitbit personal health coach).** The fullest functional evidence of this pass. Skippable opening interview. Automatic "Coach Notes" viewable under the Health tab, with delete one and delete all, and no documented edit. `[E: F1, F2]` `[E†: F2b]` `[R: F4]` Medical records are opt-in and can be summarised on request. `[E: F3]` Training use only with research opt-in; human review only after feedback. `[E: F2]` Community reports of stale notes steering plans. `[E†: F35]`

**Oura Advisor.** The clearest rule on asking: data first, then at most three questions, only about what the ring cannot measure. Plans are offered, never imposed, last up to seven days, and close with a look-back. `[E: F5]` Counsel adds an AI-plus-doctor service with consent each way. `[E: F6]`

**Claude.** The widest set of control functions in one place: topic-level memory, pause, reset, incognito, per-chat memory switch, project scoping, a sensitive-topic default with a per-save notice, chat citations, import and export. Deleting a chat does not delete what was learned from it. `[E: F9]`

**ChatGPT (memory, Health, Pulse).** Controls are in the sibling brief. New here: Pulse runs overnight on memory and feedback and delivers a daily brief. `[R: F31]` Health is described by press as doing visit preparation. `[R: F11]` It is the only product with a published independent safety study. `[R: F54]`

**Amazon Health AI (One Medical).** Reads records with consent, routes to a human, and leaves the chat out of the record unless the patient shares a summary. Safety is described as separate agents. `[R: F12]` `[E†: F13]`

**Epic Emmie.** Grounded in the chart; asks follow-up questions; turns visit notes into reminders; summarises imaging. The care team cannot see chats. No memory across sessions is described. `[E: F14]` `[R: F14b]`

**Superpower and Function Health.** Both build one profile from labs, uploads and wearables and attach clinicians to the model. Neither describes a user-facing memory list. `[E: F17]` `[R: F16]`

**Headspace Ebb.** Went from remembering only the last conversation to recalling past details and following up. Discloses that it is an AI by design. Crisis handoff to 988. `[R: F26, F26b]`

**Hippocratic AI.** Not a consumer app. Useful for two named ideas: safety supervisors as hard gates, and memory that decides "what to retain, what to compress, and what to discard". `[E: F15]`

**Pawtient AI.** The closest pet product to the pattern under study: recorded visit, summary, one-tap suggested entries, answers with cited sources, lab photo to trends, invite the vet. No memory list and no disclaimer text were found on the listing. `[E: F36]`

**PETTO.** Review before save, unsure items marked, a conflict chooser, voice input turned into text on the phone, a Privacy Center, a PDF export. `[E: F37]`

**Petivity.** No chat. A learning period in which the owner labels events, then alerts and a monthly report. `[E: F39]`

**Digitail Tails.** The only pet intake conversation found: opens three days before an appointment, adapts to the visit type and history, files a summary in the clinic's notes. `[E: F38]`

**Fi Intelligence, Tractive, Maven.** Collar products. Fi answers questions from collar data and uploaded documents. Tractive and Maven alert on trends. None describes a list of what the AI holds. `[E†: F40, F41]` `[R: F42]`

**mem0, Letta, Zep (developer tools).** Named ideas only: contradiction resolved by update or delete, soft expiry, facts with validity over time, background reflection. `[E: F33]` `[E†: F32]`

---

## 4. What nobody does, for a health record

All `[inferred]` from absence in the sources read.

- **Confirm before a chat-derived fact is used.** Every assistant and coach saves from conversation without asking. Asking first appears only in pet apps, and only for document import and suggested entries.
- **Ask whether an old fact is still true.** Staleness is handled by internal dates (WHOOP), by developer-level expiry (mem0), or by the user noticing.
- **Show a deleted or resolved fact has stopped having effect.** Google's users report the opposite. No vendor states when a change takes effect, other than Claude's "your next conversation".
- **A rule that keeps a stored fact from explaining away a new symptom.** Not stated anywhere.
- **Separate handling for safety-relevant facts.** Claude's sensitive-topic default is about privacy, not clinical weight.
- **A statement of what the assistant does not know.** Not found.
- **A record of what was declined.** No product shows the suggestions a user rejected.
- **Per-fact provenance naming a person and a date.** As in the sibling brief. Pawtient's cited sources sit under answers, not on facts.
- **A read-back at first run of what the existing data already shows.** Offered on request by Google; not found as a first-run step.
- **Owner review of an AI intake summary before the clinic sees it.** Not described by Digitail or K Health.
- **A pet product with scheduled check-ins about standing facts.** Check-ins found in pet products are sensor alerts or post-visit follow-ups.

---

## 5. Function ideas that transfer to a pet record where the owner must confirm everything

Each row states a precedent, a sketch for a pet owner, and the safety question it raises. Questions are stated, not answered. Nothing here is a recommendation.

| # | Function | Precedent | What it would look like for a pet owner | Safety question raised |
|---|---|---|---|---|
| 1 | Gap-only questions after reading the logs | Oura: at most three questions, only about what the ring cannot measure `[E: F5]` | After reading logs and visit notes, the app asks a few things it cannot see, such as who else feeds the pet. | If the app asks only about gaps it noticed, what happens to a gap it did not notice? |
| 2 | Skippable opening conversation, text or voice | Google coach; WHOOP TEXT or TALK `[E: F1]` | "Tell Culprit about Nyx", skippable, returnable. | When an owner says something in passing that sounds like a symptom, is that a fact to propose or a flag to raise? |
| 3 | "What do you know about my pet" as a command | Google coach; Copilot `[E: F1, F10]` | A spoken or typed request returns the working understanding. | Can a summary that omits a low-confidence item be read as saying that item is absent? |
| 4 | Intake before a vet visit | Digitail Tails; K Health; Dutch `[E: F38]` `[R: F22, F46]` | A short chat in the days before a logged appointment, producing notes for the owner to take. | Who checks an AI-written pre-visit summary before a vet relies on it? |
| 5 | One-tap proposed entries after a visit | Pawtient AI `[E: F36]` | Typed visit notes yield a few proposed facts, each accepted or declined alone. | If the owner declines a proposed fact that was true, does the app behave as if it never saw it? |
| 6 | Unsure items marked; chooser on conflict | PETTO; MyPetID `[E: F37]` `[sib: §7]` | A fact the AI is unsure of is marked. Where a note and a log disagree, both are shown. | When the owner picks the wrong version of a conflict about a medicine or an allergy, what catches it? |
| 7 | Owner labels during a learning period | Petivity `[E: F39]` | Early on, the app asks the owner to confirm its reading of a few events, then asks less. | Does asking less over time mean a later change in the pet goes unquestioned? |
| 8 | Still-true check on an old fact | Gap in the field; Google users' workaround; WHOOP inactive state `[E†: F35]` `[sib: §2]` | The app asks whether a months-old fact still holds, or the owner marks it resolved. | Should a resolved condition stop informing reads, or stay as history, and who decides? |
| 9 | Sources under one read | Claude; ChatGPT; Pawtient `[E: F9, F36]` | Each AI read lists the stored facts and logs it used. | If a read cites a stored fact as context for a symptom, can that read as reassurance? |
| 10 | Pause, set aside, delete as three strengths | Claude pause; WHOOP inactive; ChatGPT "don't mention this again" `[E: F9]` | A fact can be set aside without being removed. | Is there any class of fact that must not be set aside without a warning? |
| 11 | A stricter class with a notice at each save | Claude sensitive topics `[E: F9]` | Certain kinds of fact get an extra notice when saved or changed. | Which facts belong in the stricter class, and who draws the line? |
| 12 | Short plan with yes or no check-ins and a look-back | Oura Advisor `[E: F5]` | A week-long watch on one thing, daily yes or no, then "what changed". | When a watch ends with nothing logged, what may the look-back say about absence? |
| 13 | Owner-chosen handoff summary | Amazon; Ada; PETTO; Google `[E†: F13, F21]` `[E: F37, F3]` | The owner sends or prints the confirmed understanding for the vet. | How does the vet tell an owner-confirmed fact from a vet-stated one? |
| 14 | Safety check outside the conversation | Hippocratic supervisors; Amazon sentinel agents; Lark `[E: F15]` `[R: F12]` `[E†: F24]` | An escalation check that runs whatever the stored understanding says. | Can any stored fact lower the urgency of an escalation? |
| 15 | Data-use sentence where the AI is used | Clue; Google; Flo `[E†: F19, F18]` `[E: F3]` | One plain line beside the feature on what is sent to a model and what is kept. | Does a short line overstate or understate what leaves the device? |

---

## 6. Sources

All fetched or searched 2026-11-15. "index only" means the page was not opened and is known through a search excerpt.

**Google**
- F1. Google, "Fitbit's personal health coach in public preview is here". https://blog.google/products/fitbit/personal-health-coach-public-preview/ (fetched)
- F2. Google Health Help, coach data and personalisation. https://support.google.com/googlehealth/answer/17055092 (fetched)
- F2b. Google Fitbit Help, Coach Notes. https://support.google.com/fitbit/answer/16678124 (index only)
- F2c. Google Fitbit Help, using the coach. https://support.google.com/fitbit/answer/16961408 (fetched)
- F3. Google, "A new era for your wellness: Introducing the Google Health app" https://blog.google/products-and-platforms/products/google-health/google-health-app/ and "Get a fuller picture with Fitbit's personal health coach" https://blog.google/products-and-platforms/devices/fitbit/fitbit-personal-health-coach-updates-2026/ (both fetched)
- F4. Engadget, "A closer look at Google's AI health coach". https://www.engadget.com/ai/a-closer-look-at-googles-ai-health-coach-and-the-redesigned-fitbit-app-160041881.html (fetched)
- F35. Fitbit Community, "Constantly bringing up old information", 2026-03-30. https://community.fitbit.com/t5/Personal-Health-Coach-Public-Preview/Constantly-bringing-up-old-information/td-p/5822032 (redirected; index only)
- F48. Google, "Gemini adds Temporary Chats and new personalization features". https://blog.google/products/gemini/temporary-chats-privacy-controls/ (index only; detail from PhoneArena coverage)

**Oura**
- F5. Oura blog, "Personalized plans with Oura Advisor". https://ouraring.com/blog/personalized-plans-with-oura-advisor/ (fetched)
- F6. Oura blog, Counsel integration. https://ouraring.com/blog/counsel-integration-oura-app/ (fetched)
- F7. Oura Member Care, "Oura Advisor". https://support.ouraring.com/hc/en-us/articles/39512345699219/ (fetched)

**WHOOP**
- F8. WHOOP, Advanced Labs. https://www.whoop.com/thelocker/whoop-advanced-labs (index only); T3 and Wareable coverage, https://www.t3.com/active/fitness-trackers/whoop-advanced-labs-uploads-rollout (index only)

**General assistants**
- F9. Claude Help Center, "Understanding Claude's memory". https://support.claude.com/en/articles/11817273-understanding-claude-s-memory (fetched)
- F10. Microsoft Support, "Microsoft Copilot privacy controls". https://support.microsoft.com/en-US/Microsoft-Copilot/microsoft-copilot-privacy-controls (fetched); "Personalize what Microsoft Copilot remembers" (index only)
- F31. ChatGPT Pulse coverage: Tom's Guide, VentureBeat, Neowin (index only). https://venturebeat.com/ai/chatgpt-pulse-delivers-daily-personalized-research-moving-ai-from-reactive
- F44. Replika Help, "How does Replika's memory work". https://help.replika.com/hc/en-us/articles/37208679176077-How-does-Replika-s-memory-work (403; index only)
- F45. Notion, release 3.0 and "Building shared memory for AI agents in Notion". https://notion.com/releases/2025-09-18 (index only)
- F44b. Meta, "Delete remembered details about you on Meta AI". https://www.meta.com/help/artificial-intelligence/1152856459900216/ (no body; index only). Press tests in 2025 reported sensitive topics being saved (index only).
- Pi: help.pi.ai article 13147185 (index only). Character.AI: third-party blogs only (index only). Limitless: Reuters and others on the December 2025 Meta acquisition (index only).

**ChatGPT Health and studies**
- F11. ChatGPT Health press coverage: Android Authority, Healthcare Dive, DataCamp (index only). https://healthcaredive.com/news/openai-launches-chatgpt-health/809094
- F52. OpenAI community threads and WebProNews on memory failures and memory poisoning (index only). https://community.openai.com/t/chatgpt-recalls-saved-memory-but-fails-to-apply-it-and-invents-plausible-context-instead-of-verifying-history/1393739
- F53. MIT LIDS, "Personalization features can make LLMs more agreeable". https://lids.mit.edu/news/personalization-features-can-make-llms-more-agreeable (fetched)
- F53b. Jain et al., "Interaction Context Often Increases Sycophancy in LLMs", arXiv:2509.12517. https://arxiv.org/html/2509.12517v3 (index only)
- F54. NBC News, "ChatGPT Health 'under-triaged' half of medical emergencies in a new study", 2026-03-03. https://www.nbcnews.com/health/health-news/chatgpt-health-under-triaged-half-medical-emergencies-rcna261409 (fetched). The Nature Medicine paper was not opened.

**Health systems and clinical AI**
- F12. HIT Consultant, Amazon Health AI, 2026-03-11. https://hitconsultant.net/2026/03/11/amazon-health-ai-one-medical-agentic-assistant-prime-bedrock/ (fetched); Healthcare Brew, 2026-01-22. https://www.healthcare-brew.com/stories/2026/01/22/amazon-one-medical-launches-new-agentic-ai-tool (fetched)
- F13. Amazon statements on chat and record separation and summary sharing, as carried by The Next Web and HLTH (index only). https://thenextweb.com/news/amazon-health-ai-launches-website-app-one-medical-prime
- F14. Epic, "Emmie". https://www.epic.com/software/emmie (fetched)
- F14b. TechTarget, "Epic's Ask Emmie offers EHR-backed AI chatbot option for patients". https://www.techtarget.com/patientengagement/feature/Epics-Ask-Emmie-offers-EHR-backed-AI-chatbot-option-for-patients (fetched)
- F15. Hippocratic AI, "Building AI for healthcare conversations, part 2". https://hippocraticai.com/building-ai-for-healthcare-conversations-part-2/ (fetched)
- F22. K Health and Cedars-Sinai Connect coverage: Becker's, Fierce Healthcare (index only). https://www.fiercehealthcare.com/providers/cedars-sinai-k-health-launch-new-ai-driven-virtual-care-app-new-existing-patients-ca
- Abridge patient summaries: press only, clinician-side "Linked Evidence"; not used in the tables.

**Coaching, labs and trackers**
- F16. Function Health coverage: TechCrunch 2025-11-19, HIT Consultant, HLTH 2026-08-19 (index only). https://techcrunch.com/2025/11/19/function-health-closes-298m-series-b-at-a-2-5b-valuation-launches-medical-intelligence
- F17. Superpower, "Superpower AI: a new kind of health intelligence". https://superpower.com/blog/superpower-ai-a-new-kind-of-health-intelligence (fetched)
- F17b. Superpower site pages on the concierge (index only). https://superpower.com/roadmap
- F18. Flo: AI statement https://flo.health/privacy-portal/ai-statement (no body; index only); privacy policy (index only); Mozilla Foundation privacy review https://www.mozillafoundation.org/en/nothing-personal/flo-app-privacy-review/ (index only)
- F19. Clue Support, "What is Chat With Your Data" and "How does the chat work". https://support.helloclue.com/hc/en-us/articles/37684596573469-What-is-Chat-With-Your-Data (403; index only)
- F21. Ada, App Store listing and Instructions for Use. https://ada.com/ifu/ada-assess/ (index only)
- F23. Noom Welli coverage, HIT Consultant 2024-06-28 (index only). https://hitconsultant.net/2024/06/28/noom-unveils-ai-powered-food-logging-and-welli-assistant
- F24. Lark, "How Lark hyper-personalizes care". https://www.lark.com/insights/how-lark-hyper-personalizes-care (index only)
- F25. STAT, Woebot shutdown, 2025-07-02. https://www.statnews.com/2025/07/02/woebot-mental-health-chatbot-shuts-down-founder-says-ai-moving-faster-than-regulators/ (fetched; partly paywalled)
- F26. HLTH copy of Headspace release, 2025-12-09. https://hlth.com/insights/news/headspace-updates-ebb-ai-with-voice-mode-and-enhanced-memory-to-deepen-mental-health-support-2025-12-09 (fetched); earlier coverage of the 988 button (index only)
- F26b. Figma blog, "How Headspace built an AI companion that fosters trust and transparency". https://www.figma.com/blog/headspace-ebb-ai-companion/ (fetched)
- F27. Garmin Connect+ coverage: TechRadar, Android Central (index only). https://www.techradar.com/health-fitness/garmin-adds-premium-garmin-connect-tier-with-ai-features-but-promises-your-free-experience-is-not-going-away
- F28. Strava Support (Dutch page), Athlete Intelligence. https://support.strava.com/nl/articles/15401629-athlete-intelligence-op-strava (index only). Sources disagree on whether an opt-out still exists.
- F29. 9to5Mac, "Apple reportedly scales back plans for AI-powered health coach", 2026-02-05. https://9to5mac.com/2026/02/05/apple-reportedly-scales-back-plans-for-ai-powered-health-coach/ (index only)
- F30. Thrive AI Health launch coverage, July 2024 (index only). https://www.mobihealthnews.com/news/openai-startup-fund-thrive-global-launch-new-company-thrive-ai-health
- Ultrahuman Jade: Android Central and press release copies (index only); memory not described. Wysa: vendor FAQ https://www.wysa.com/faq (index only); memory not described.

**Developer memory tools**
- F32. Letta docs, sleep-time agents. https://docs.letta.com/guides/agents/architectures/sleeptime/index.md (index only)
- F33. mem0, "How AI Memory Tools Handle Contradictions and Outdated Information". https://mem0.ai/guide/ai-memory-tools-contradictions-outdated-information (fetched); mem0 docs on the update prompt and expiry (index only)
- F34. DEV Community critique of mem0 conflict resolution. https://dev.to/mukesh_13/mem0-auto-resolves-memory-conflicts-for-you-until-it-silently-deletes-one-you-still-need-4f4m (index only)

**Pet products**
- F36. Pawtient AI, App Store listing and version notes. https://apps.apple.com/app/id6756168872 (fetched)
- F37. PETTO, Help Center. https://pettoai.app/help/ (fetched)
- F38. Digitail Help, "Tails AI patient intake". https://help.digitail.io/en/articles/8409582-tails-ai-patient-intake (fetched); Digitail blog on post-visit follow-up (index only)
- F39. Petivity, "How the Petivity Smart Litter Box Monitor Works". https://petivity.com/pages/smart-litter-box-monitor (fetched)
- F40. Fi, "Fi Intelligence" help article. https://support.fitracking.com/hc/en-us/articles/49109803082387-Fi-Intelligence (403; index only)
- F41. Tractive, Health Alerts guide. https://help.tractive.com/hc/en-us/articles/13362814092562-Health-Alerts-How-To-Guide (403; index only)
- F42. Maven Pet, site and Petful review. https://maven.pet (index only; landing page redirected)
- F43. Joii Pet Care, symptom checker pages. https://shop.joiipetcare.com/pages/page3 (index only)
- F46. My Vet Candy, Dutch AI tools, 2025-06-11. https://www.myvetcandy.com/news/2025/6/11/dutch-rolls-out-new-ai-tools-to-supercharge-how-veterinarians-operate-and-deliver-care (index only)
- F47. Digital Commerce 360, how Chewy is using AI, 2026-07-09. https://www.digitalcommerce360.com/2026/07/09/ecommerce-trends-how-chewy-is-using-ai/ (index only)
- F49. PetSage, developer site. https://petsage.netlify.app/ (index only)
- F50. CompanAIn, App Store listing and local press. https://apps.apple.com/app/id6747678727 (index only)
- F51. Sylvester.ai as described in a clinic-software help article. https://help.co.vet/en/support/solutions/articles/157000368668-sylvester-ai (index only)
- Moggie: press only (index only); a chatbot that speaks as the cat; not used in the tables. VetVault: store listings only. 11pets: aggregator only, no AI found.
- Not found or nothing relevant: Levels, January AI, Bearable (aggregator only), Mem, Granola, Pawp, Vetster, Veta, PawPrint Health, Every Wag, Whistle, Petcube, PetDesk owner AI, Chewy Health owner AI.
