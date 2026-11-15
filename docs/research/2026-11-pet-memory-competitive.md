# "What the app knows about you": memory pages, health profiles and who may correct them

**Date:** 2026-11-15 · **Status:** 🧊 frozen point-in-time brief (append-only; corrections land as a dated §V at the foot with inline ⚠ pointers, per `.claude/rules/docs.md`) · **Issue:** [CUL-2787](https://linear.app/projectnyx/issue/CUL-2787) · **Method:** one isolated web research pass, about 75 search and page-fetch calls, vendor pages first · **Lane:** competitive and analogue evidence only. No recommendations.

**The question.** The PM is considering a page, for now called "What Culprit knows about {pet}". It would list the standing facts the app works from for one pet (conditions, vet instructions, sensitivities, the current diet trial and medicines, weight), show where each fact came from, and let the owner correct or remove any. This lane asks: who already shows a user what an AI or a health record holds about them, what does the entry look like, who writes it, what can the user change, and what does the vendor say happens afterwards.

**Evidence tags.**
- `[E: Sn]` the cited page was fetched and read this session.
- `[E†: Sn]` verified only through a search-index excerpt of the cited page. The page itself blocked a fetch (HTTP 403) or returned no body. Wording is the index's rendering of the vendor text and may be trimmed.
- `[lead: Sn]` a press or third-party page, used as a pointer only.
- `[inferred]` a reading across sources, or an absence.
- `[from model memory, unverified]` not fetched and not found in an index this session.

**What could not be verified. Read this first.**
- **Every whoop.com page returned 403**, including the "My Memory" article, the 2026 "What's New" page, the HealthEx page, the press release and the privacy policy. The WHOOP support site returned a loading shell. All WHOOP product claims are `[E†]`, except the WHOOP engineering blog, which was fetched.
- **Every openai.com and help.openai.com page returned 403** (Memory FAQ, Temporary Chat, Health help article, Health Privacy Notice, launch posts, release notes). All ChatGPT claims are `[E†]`.
- **No app was installed. No screen was seen.** No screenshot or official video of any memory screen was retrieved. Entry anatomy (what one row looks like) is therefore the weakest part of this brief for every product.
- **Apple's "View health records" and "Download health records" guide pages** returned only navigation, twice. Whether a provider record can be edited on the phone, and how the source is printed on each record, were not confirmed from Apple's text.
- **What WHOOP does after an edit, a delete or switching memory off** (timing, whether stored entries are erased, whether past chats change) was searched for three times and not found.
- **The "Memory updated" notice in ChatGPT** was found only in third-party guides, not in OpenAI's indexed text.
- **Pet apps.** PawPrint Health, Veta, Maven Pet, Sylvester.ai, Tably, Every Wag and VetLens returned nothing relevant on this topic. VetVault appeared only on an aggregator. Fi's help article and the PetDesk help article returned 403. Petvimo's Play listing returned no body. Pettioe's page returned 404. PetRecord.ai and MyPetID were covered yesterday in the sibling brief and are not redone here.
- **Dates on App Store version notes show no year.** They are read as 2026 `[inferred]`.

**Existing coverage, cited and not repeated.** The sibling brief written 2026-11-14 for CUL-2753 (`scratchpad/cul2753/2026-11-visit-summary-competitive.md`, not yet in this folder) covers the owner-side AI record readers (Pawtient AI, VetGPT, Pawtio, Kovan, Petto, PetCare AI, PetSage, MyPetID, Pawly, Fi, CompanAIn), their confirm-before-save behaviour, and the January 2026 arrival of ChatGPT Health. `docs/research/2026-09-vet-visit-companion-evidence.md` §1 covers clinic scribes and the earlier owner-app cohort. `docs/research/2026-07-ask-ai-ux-landscape.md` covers Oura Advisor and WHOOP Coach as chat products. This brief adds only the memory and profile layer.

---

## 1. Bottom line

- **A user-visible memory page is now standard among the large AI assistants and the two leading wearables.** WHOOP ("My Memory"), ChatGPT ("Saved memories", then a "memory summary"), Gemini ("Saved info", then a "Memory summary"), and Oura ("Memories") each have one. `[E†: S1, S7, S9]` `[E: S14, S15, S17]`
- **In every one of them the AI writes entries without asking first.** WHOOP's engineers describe an agent that asks itself, on every member message, whether the message is worth remembering. OpenAI says ChatGPT may save details without being asked. None of the four asks the user to confirm an entry before it is used. `[E: S4]` `[E†: S7]` `[inferred]` for Oura and Gemini's summary, whose pages do not say.
- **Controls differ more than names do.** WHOOP and Gemini let the user add, edit and delete. Oura documents view and delete only. ChatGPT's legacy list was delete only; its June 2026 summary can be corrected by typing a request. `[E†: S1, S9]` `[E: S14, S15, S17]`
- **No memory page found shows per-entry provenance** (who said it, when, from which chat or document). The nearest are: Gemini's "Memory history" (a change log with dates), ChatGPT's "Sources" icon under a reply (which memories shaped this answer), and WHOOP storing start and end dates internally. `[E: S15, S4]` `[E†: S9]`
- **Vendors say little about what happens after a delete, and what they do say is a limit.** OpenAI: deleting a memory does not remove it from past chats, and logs may be kept up to 30 days. WHOOP on medical records: disconnecting removes the records, but earlier insights "may still reflect" them. Oura: a deleted chat thread is permanent; nothing is said about a deleted memory. `[E†: S7, S3]` `[E: S14]`
- **The health record world works the other way round.** Apple's Medical ID is typed only by the owner. A patient portal problem list is written by clinicians; the patient sends a request and a clinician decides. HIPAA gives a right to ask for an amendment, with 60 days to answer and a right to file a disagreement that travels with the record. Nothing is silently removed. `[E: S19, S24, S25]`
- **No pet app found has a page that lists what its AI holds about the pet for the owner to correct.** Several say the assistant "knows" the profile. Three small products attach a source to extracted facts (PetCare Ally, MyPetID, Pawtient AI's cited answers). One clinic-fed app shows a "Verified by clinic" badge on the profile. `[E: S27, S28, S30, S32]` `[inferred]` that nothing unindexed exists.
- **No product found states a rule that treats safety-relevant facts differently from the rest** on its memory page (for example, a warning before an allergy is deleted). WHOOP's one stated distinction is about time, not safety: temporary things are remembered but not coached on. `[E†: S1, S2]` `[inferred]`

---

## 2. WHOOP: "My Memory"

**Access note.** All WHOOP pages were blocked. Claims are index excerpts unless tagged `[E: S4]`.

**(i) Name and words.** "My Memory". WHOOP's own article is titled "My Memory: what WHOOP knows about you and how to control it". `[E†: S1]` The May 8, 2026 press release calls it a centralised place to view, manage and shape the AI layer and coaching. `[E†: S5]` One WHOOP support article refers to "the Memories feature". `[E†: S3]` Entry points: "the Lightbulb icon in your conversation with Coach", or "Personalization" on the Profile page. `[E†: S6]`

**(ii) Entry anatomy.** Entries sit in categories. The My Memory article lists seven: Goals, Identity, Lifestyle, Preferences, Events, Health History, Mood. `[E†: S1]` The "What's New" page lists five (Goals, Identity, Preferences, Health History, Mood) and the Coach support article uses different words (goals, lifestyle habits, current state, preferences, life events). `[E†: S2, S6]` The three lists do not match. Internally each memory "nugget" is stored with any start and end date the agent could derive. `[E: S4]` Whether a row shows a date, a source label or its category to the member was not found. `[inferred]`

**(iii) Who writes.** The AI, silently, plus the member, plus imported medical records.
- WHOOP's engineering blog (March 5, 2026): on every member message an agent asks "Is this worth remembering? If so, remember it." `[E: S4]`
- The "What's New" page says WHOOP "automatically keeps your Memory up-to-date". `[E†: S2]`
- Members can add entries by hand. `[E†: S1, S5]`
- With the HealthEx integration, imported records "flow into My Memory"; conditions, medications and procedures are named. `[E†: S3b]`
- No source describes a prompt, a notice or a confirmation when an entry is created. `[inferred]`

**(iv) Controls.** View, add, edit, remove any single entry, and "turn memory off entirely at any time". `[E†: S1]` Chat history is separate: swipe left on a conversation to delete it. `[E†: S8]` No export of memory entries was found (WHOOP has a general data export). `[inferred]`

**(v) Downstream after an edit or delete.** Not stated in any indexed WHOOP text. Three related statements were found:
- My Memory feeds Daily Outlook, Activity Insights and Coach conversations. `[E†: S6]`
- For medical records: after disconnecting, records are removed from the app, "but previously generated insights may still reflect earlier shared information". `[E†: S3]` Memories created from health data "can also be edited or deleted" in the Memories feature. `[E†: S3]`
- The privacy policy, on profile data in general: WHOOP "may maintain a copy of the unrevised information". `[E†: S8]`

**(vi) Stated limits.**
- Temporary things, such as a past illness, are remembered for context but WHOOP "won't actively coach you on them". `[E†: S2]`
- Retrieval, per the engineering blog: dated memories are filtered to about 90 days of context; undated ones are pulled in "just in case". The post notes memories without end dates could pile up. `[E: S4]`
- The same post reports pre-launch tests of the save decision, not of whether saved content is true. In its final version an end date was attached in about 12% of test cases and a start date in about 37%. `[E: S4]` (figures read through a page summary; treat as approximate).
- Conversation history may be kept and context from earlier chats may be shared with the model partner. `[E†: S8]`

---

## 3. ChatGPT: memory, and Health

**Access note.** All OpenAI pages were blocked. Claims are index excerpts.

### 3.1 Memory

**(i) Name and words.** Two generations coexist.
- Legacy: "Saved memories" and "Reference chat history", managed at Settings > Personalization > "Manage memories". `[E†: S7]`
- Since June 4, 2026: an improved memory with an editable "memory summary". The FAQ offers "Try improved memory" and a way back to "Saved memories". `[E†: S7, S9]`
- Depending on the account, labels may include Memory, Reference saved memories, Reference chat history, Memory summary, Manage, Saved memories. `[E†: S7]`

**(ii) Entry anatomy.** Legacy: a flat list of short text items. `[E†: S7]` Improved: a prose summary. `[E†: S9]` A saved memory history exists on paid plans, with restore of earlier versions "by date". `[E†: S7]` No per-item source label or category was found. `[inferred]`

**(iii) Who writes.** The user can ask ChatGPT to remember something. ChatGPT may also save details "without you needing to ask". `[E†: S7]` In the improved system memories "are now updated automatically". `[E†: S9]` A "Memory updated" notice at the moment of saving is reported by third-party guides only. `[lead: S10]` `[from model memory, unverified]` that the notice links to the manage screen.

**(iv) Controls.**
- Delete one memory, clear all, or turn saved memory off. Ask ChatGPT in chat to forget something. `[E†: S7]`
- Improved summary (June 12, 2026 note): edit by typing a change in a text box or by highlighting text; delete memories on the summary page; "Delete and turn off memory" in the three-dot menu. `[E†: S9]`
- "Sources" icon under a reply (May 5, 2026 note): shows which saved memories, past chats and custom instructions influenced it; the user can correct, delete or mark one "not relevant". `[E†: S9]`
- Temporary Chat: creates and updates no memories. `[E†: S11]`
- No direct in-place edit of a legacy saved memory was found. `[inferred]`

**(v) Downstream, in OpenAI's words (as indexed).**
- Deleting a saved memory "does not remove mentions of that information from past conversations". `[E†: S7]`
- To remove something fully, delete the saved memory and the chat where it was first shared. `[E†: S7]`
- Turning saved memory off "won't delete anything that's already been remembered". `[E†: S7]`
- Turning off Reference chat history: what was remembered from past chats is deleted from OpenAI systems within 30 days. `[E†: S7]`
- "Delete and turn off memory" does not delete past chats. `[E†: S9]`

**(vi) Limits.** Logs of deleted saved memories may be kept up to 30 days for safety and debugging. `[E†: S7]` Temporary chats may be kept up to 30 days. `[E†: S11]` The Sources view "may not show every factor" behind a reply. `[E†: S9]`

### 3.2 Health (January 2026 launch; renamed "Health in ChatGPT" on wider release)

**(i) Name.** "ChatGPT Health" at launch; later help articles are titled "Health in ChatGPT". Memories are viewed under "View Health Memories". `[E†: S12, S13]`

**(ii) to (iv) What it stores and who controls it.**
- Health chats, files and memories sit in a dedicated space. `[E†: S12b]`
- The user can view or delete Health memories "anytime in Health or Settings > Personalization". `[E†: S12b]`
- Connected sources: medical records (US only at launch, through b.well) and Apple Health. `[E†: S12, S13]`
- By default ChatGPT asks permission each time it wants to use connected records or Apple Health data; the user can choose always allow. `[E†: S13]`
- "Memories are not created directly from data synced in Health." Memories can still form from what the user says in Health chats. `[E†: S13]`

**(v) Downstream.** Disconnecting medical records stops access and the records "will be deleted from our systems". `[E†: S13]`

**(vi) Limits and a conflict.**
- Stated purpose: supports, does not replace, medical care; "not intended for diagnosis or treatment". `[E†: S13]`
- **The sources disagree on whether Health memory is walled off.** The January launch post and OpenAI's own X post say Health information "never flows into your regular chats" and chats outside Health cannot reach Health memories. `[E†: S12, S12b]` The indexed Health Privacy Notice says Health can store memories and "incorporate any memories you have saved in your main ChatGPT account". `[E†: S13b]` A later help article suggests making a separate project with project-only memory if the user wants Health memories kept apart, which implies they are not apart by default. `[E†: S13]` One press lead says the original Health space and the later "Connect Health" follow different rules. `[lead: S10b]` This brief cannot settle it.

---

## 4. Oura Advisor: "Memories"

**(i) Name and words.** "Memories", a row under Advisor's Settings. The support article (last updated November 3, 2026) describes it as: "View or delete past information you've shared." `[E: S14]` Path: Today tab, the + button, Advisor, then Settings at top right. `[E†: S14]`

**(ii) Entry anatomy.** Not described by Oura. A press review gives examples written in the third person, of the form "the user has been sick", each with a trash icon. `[lead: S16]` No date, source or category is mentioned anywhere. `[inferred]`

**(iii) Who writes.** Oura's launch post (March 31, 2025): the member shares something and it is stored as a "Memory"; memories draw on Oura data and on conversation. Its example is a member recovering from knee surgery. `[E: S15b]` The support article says "Information you share with Advisor is stored as memories". `[E: S14]` Neither page mentions asking first. `[inferred]` that saving is silent.

**(iv) Controls.** View and delete. `[E: S14]` No add, no edit and no memory-only off switch are documented. `[E: S14]` "Reset Advisor" erases "all accumulated data, memories, and settings". `[E: S14]` Advisor as a whole is optional. `[E: S14]`

**(v) Downstream.** Nothing is said about what Advisor does after a single memory is deleted. `[E: S14]` Two side effects are stated: after a reset the member must go through setup again `[E: S14]`; and deleting health data for any date range also removes the whole Advisor chat history and all memories, because memories are not tied to dates. `[E†: S14b]`

**(vi) Limits.** Not a medical device; do not change medication, nutrition or training without a professional. No retention period given. `[E: S14]`

---

## 5. Apple Health: Medical ID and Health Records

### 5.1 Medical ID

- **(i) Name.** "Medical ID", under the profile picture in the Health app. `[E: S19]`
- **(ii) Anatomy.** Fields include medications, allergies and conditions, plus emergency contacts with a relationship label. `[E: S19]` Blood type and other basics are part of the same profile area. `[E†: S20]` No per-field date or source is described. `[inferred]`
- **(iii) Who writes.** The phone's owner types every field ("tap Edit or Add" beside a field). `[E: S19]` No AI and no provider writes to it. `[inferred]` from the absence of any other path in Apple's text.
- **(iv) Controls.** Edit, add, and two switches: "Show When Locked" and "Share During Emergency Call". `[E: S19]`
- **(v) Downstream.** With the first switch on, the Medical ID is available from the Lock Screen. With the second, it is sent to responders on an emergency call or text. `[E: S19]`
- **(vi) Limits.** "Apple cannot read your Medical ID information when it is shared with emergency responders." `[E: S19]`

### 5.2 Health Records and the wider Health store

- **(i) Name.** "Health Records". Categories shown under it include Allergies and Clinical Vitals; Apple's download page lists vaccinations, allergies, conditions, medications and labs. `[E†: S21]`
- **(iii) Who writes.** The provider. Records "automatically download" from the organisation over a direct connection. `[E: S22]`
- **(ii) Provenance.** Records can be browsed by category or "by the name of a specific organization", so the source is a first-class way in. `[E†: S21]` For ordinary Health data, each data type has a "Data Sources & Access" list and a source priority order with manually entered data first. `[E: S23]` How the source is printed on a single clinical record was not confirmed. `[from model memory, unverified]`: each record's detail view names the organisation and a date.
- **(iv) Controls.** The documented control is whole-account: "Remove Account", after which that account's records "will be deleted from your devices". `[E: S22]` For ordinary (non-clinical) Health data, the user can add data by hand and delete single records or all records in a type. `[E: S23]` No Apple text found describes editing or deleting one provider record. `[inferred]` that provider records are read-only on the phone; an Apple Community answer says an entry can only be changed if its source app allows it. `[lead: S23b]`
- **(vi) Limits.** Stored encrypted on device and protected by the passcode. `[E: S22]`

---

## 6. Further human analogues

### 6.1 Google Gemini: "Saved info" and "Memory summary"

- **(i) Names.** Four in use at once. "Saved info" (page address and the reply label "Your saved info"), "Personal context" (the settings area), "Your instructions for Gemini" (the toggle), and since November 2026 "Memory summary" under "Personal Intelligence". `[E: S17, S15]`
- **(ii) Anatomy.** Saved info: a list of user-written items. `[E: S17]` Memory summary: grouped bullets under headings such as "The Essentials" and "Fitness & Lifestyle". `[lead: S18]` A "Memory history" view lists changes and when information "was added or modified". `[E: S15]`
- **(iii) Who writes.** Saved info: the user, by an "Add" button or by asking in chat. `[E: S17]` Memory summary: Gemini writes it; the help page does not say from what. `[E: S15]`
- **(iv) Controls.** Saved info: add, edit, delete per item, and an on/off toggle. `[E: S17]` Memory summary: edit and delete by prompt only (the help page's examples are "Add to my memory that I speak Japanese" and removing an old phone number), plus a Memory on/off switch. `[E: S15]`
- **(v) Downstream.** When Gemini uses saved info, the reply's sources area shows "Your saved info". Google warns the label may sometimes appear incorrectly. `[E: S17]` The Memory summary page says nothing about timing or past chats after a delete. `[E: S15]` Gemini "may ask follow-up questions if your request is ambiguous" when asked to change the summary. `[lead: S18]`
- **(vi) Limits.** Adults only; not available in Gemini Live; Memory summary is not available in the EEA, Nigeria, Switzerland or the UK and needs Keep Activity on. `[E: S17, S15]`

### 6.2 Patient portals and the right to amend

- **MyChart (Epic), as configured by Cleveland Clinic.** The Problem List is shown as "Current Health Issues", beside Allergies and Medications. The patient cannot change the list. The patient can request an addition (search, pick a match, add a comment for the provider) or click the minus icon beside an item "you would like your provider to remove", with a reason. `[E: S24]` Items can also arrive from other participating organisations. `[E: S24]` For a real error the patient files a "Request for Amendment of Protected Health Information". `[E: S24]`
- **Other health systems word it more loosely** ("review your allergies and update them as needed"), and some let patients confirm or update lists during eCheck-In before a visit. `[E†: S24b]` Behaviour is set per health system. `[inferred]`
- **HIPAA, 45 CFR 164.526.** A person may ask a covered entity to amend their record. The entity must act within 60 days, with one 30-day extension. It may refuse if the record is "accurate and complete" or was not created by it. `[E: S25]`
  - If accepted: the entity must mark the affected records, append or link the amendment, and make reasonable efforts to tell others who hold or may rely on the old information. `[E: S25]`
  - If refused: the person may file a statement of disagreement, and that statement (or a summary) must go out with future disclosures of the disputed record. `[E: S25]`
  - The original entry is amended by appending or linking, not by erasing. `[E: S25]`
- **OpenNotes evidence on how often the record is wrong.** In Bell et al., JAMA Network Open 2020, about one in five patients who read a note reported finding a mistake, and about 40% of those judged it serious; the most common errors concerned diagnoses, medical history and medications. `[E†: S26]` Secondary sources give 21.1% and 42.3%; the paper itself was not opened. The sibling brief §4.3 covers OpenNotes further.

---

## 7. Pet apps

**Finding, stated plainly: no pet product was found with a page that lists what its AI holds about the pet and lets the owner correct it.** `[inferred]` from the searches below. What exists falls into four groups.

| Product | What it shows | Who writes | Provenance shown | Owner controls | Tag |
|---|---|---|---|---|---|
| **PetCare Ally** (web, $14 a month) | "Pet Records" per pet: conditions, medications, allergies, weight trend, visit history | AI, silently, from chat: a mention "lands in your pet's record automatically" | Yes, in words: each record is "tagged with where it came from". Label format not shown | Edit or delete of one record not stated. Account deletion erases all | `[E: S27]` |
| **MyPetID** | "Digital Pet Identity", one profile that builds over time | AI extracts diagnoses, procedures, medications, vitals, allergies, weight from documents | Yes: "Source attribution traces every extracted fact back to the exact part of the document". Also a confidence score per fact | Review or edit of facts not stated | `[E: S28]` |
| **PETTO** | "Health Records": vaccinations, visits, medicines, allergies and conditions | Owner; AI proposes from a document and "shows you everything before it's saved", unsure items marked | No source label described | "Tap an entry to edit or delete it". On conflict with the profile the owner picks which version to keep | `[E: S29]` |
| **Pawtient AI** | Pet Profile with a "Medical Information" section (allergies, vaccinations, ID). No conditions field described | Owner; AI offers "one-tap suggested entries" from visit summaries | In answers, not on the profile: replies come "with cited sources you can verify" | Not described for AI context | `[E: S30]` |
| **Dexter** | Profile: breed, age, weight, allergies, current medicines | Owner; Smart Import proposes, and "Nothing is saved until you've checked it" | Not described | Not described for what the assistant uses | `[E: S31]` |
| **Digitail Pet Parent App** (clinic-fed) | "Health Card" with Overview, Preventive, Medications, Plans tabs | The clinic. Weights are "logged by the practice" | A "Verified by clinic" badge on the profile, meaning the practice approved or created it | Owner changes the photo. Spay or neuter status needs the clinic | `[E: S32, S33]` |
| **Fi Intelligence** | Answers from collar data and uploaded documents; press says a "complete health profile in one place" | AI reads uploads | Not found | Not found (help article blocked) | `[E†: S34]` |
| **Petvimo, Pettioe, PetNexa, VetGPT** | Listings say the assistant "knows" saved details or keeps a "long-term memory" | AI plus owner | Not found | Not found | `[E†: S35]` |

Notes.
- **"The assistant knows your pet" is a common claim; a place to check what it knows is not.** PETTO says its assistant "knows your pet's profile, schedule and health record" and points to a Privacy Center for what is kept; it does not describe a memory view. `[E: S29]`
- **PetCare Ally is the closest in mechanism and the furthest in control.** It writes to the record silently from chat and tags the source, but its page describes no confirm step and no single-record edit or delete. `[E: S27]`
- **Provenance in pet apps points at documents, not people.** MyPetID traces a fact to a place in a file. Pawtient cites sources under an answer. Digitail's badge says "the clinic". None found labels a fact as "your vet said this on a date" versus "you told us". `[E: S28, S30, S33]` `[inferred]`
- **Confirm-before-save is the pet-app norm for document import** (PETTO, Dexter, and Kovan, Pawly, Pawtio in the sibling brief §2), which is the opposite of the silent-write norm in the big assistants. `[E: S29, S31]`
- Not found at all on this topic: PawPrint Health, Veta, Maven Pet, Sylvester.ai, Tably, Every Wag, VetLens, CompanAIn (its listing mentions "Refreshed Pet Settings" and a searchable timeline only). `[E†: S35]`

---

## 8. Comparison table

Columns follow the brief's items (iii) who writes, (iv) controls, (v) downstream. "n/s" means not stated in any source read. Tags are in the sections above.

| Product, feature name | Who writes an entry | Ask before saving | Add | Edit | Delete one | Off switch | Per-entry source or date shown | What the vendor says happens after a delete or edit |
|---|---|---|---|---|---|---|---|---|
| WHOOP, "My Memory" | AI silently; member; imported medical records | No (none described) | Yes | Yes | Yes | Yes | n/s. Dates stored internally | n/s for entries. For records: earlier insights "may still reflect" them |
| ChatGPT, "Saved memories" (legacy) | AI silently; user on request | No. A notice after saving is reported by press | By asking in chat | Not found | Yes | Yes | No. Version history by date on paid plans | Not removed from past chats; logs up to 30 days; off does not delete |
| ChatGPT, "memory summary" (June 2026) | AI, automatically | No | By typing a request | Yes, by request or highlight | Yes | Yes ("Delete and turn off memory") | No. "Sources" under a reply shows which memories were used | Past chats are not deleted |
| ChatGPT Health, "Health memories" | AI from Health chats; not directly from synced records | Permission prompt is for using records, not for saving memories | n/s | n/s | Yes | Via memory settings, Temporary Chat | n/s | Disconnected records are deleted from OpenAI systems |
| Oura Advisor, "Memories" | AI from what the member shares and Oura data | No (none described) | Not documented | Not documented | Yes | No memory-only switch. "Reset Advisor" | No | n/s. Deleting health data also wipes all memories |
| Gemini, "Saved info" | User only | Not applicable | Yes | Yes | Yes | Yes | No. Reply shows "Your saved info" when used | n/s on the page read |
| Gemini, "Memory summary" | AI | No | By prompt | By prompt | By prompt | Yes | "Memory history" lists changes with dates | n/s |
| Apple Medical ID | Owner only | Not applicable | Yes | Yes | Yes | "Show When Locked" switch | No | Shown on Lock Screen and sent on emergency calls |
| Apple Health Records | Provider only | Not applicable | No | Not found | Whole account only ("Remove Account") | Remove account | Browsable by organisation | Account's records deleted from devices |
| MyChart problem list (one health system) | Clinician | Not applicable | Request only | Request only | Request only (minus icon, with reason) | No | Other organisations' items are marked as such | Provider decides; formal amendment route exists |
| HIPAA right to amend | Clinician | Not applicable | Request | Request | No erasure; amendment appended or linked | No | Disagreement statement travels with record | 60 days to act; others who rely on it are told |
| PetCare Ally, "Pet Records" | AI silently from chat | No | n/s | n/s | n/s (account deletion only) | n/s | Yes, "tagged with where it came from" | n/s |
| PETTO, "Health Records" | Owner; AI proposes | Yes | Yes | Yes | Yes | n/s | No | A changed date moves its reminder |
| Digitail, "Health Card" | Clinic | Not applicable | No | Photo only | No | No | "Verified by clinic" badge | Photo change also updates the practice record |

---

## 9. Patterns

### 9.1 What is common

- **A single page, reached from the profile or from inside the chat.** WHOOP offers both doors (Profile, and a lightbulb in the conversation). ChatGPT and Gemini sit under settings; Oura under the chat's own settings. `[E†: S6, S7]` `[E: S14, S15]`
- **Silent writing, visible afterwards.** The assistants save first and let the user look later. `[E: S4]` `[E†: S7, S2]`
- **Delete is universal. Edit is not.** Every memory page has delete. Edit exists at WHOOP, Gemini and (by request) ChatGPT's summary; not in Oura's documentation; not in ChatGPT's legacy list. `[E†: S1, S9]` `[E: S14, S15, S17]`
- **A global off switch** at WHOOP, ChatGPT and Gemini. Oura offers only a full reset. `[E†: S1, S7]` `[E: S14, S15]`
- **Categories appear when the list gets long.** WHOOP has five to seven named ones; Gemini's summary groups by life area; legacy ChatGPT and Oura are flat. `[E†: S1, S2]` `[lead: S18, S16]`
- **Health material is fenced, or said to be.** ChatGPT Health was launched as a separate space; synced records do not directly become memories. WHOOP puts "Health History" in its own category and lets record-derived memories be edited. `[E†: S12, S13, S1, S3]`
- **Deleting here does not delete there.** OpenAI, WHOOP and Oura each state at least one place where removed information lingers or where a delete elsewhere has a side effect on memory. `[E†: S7, S3, S14b]`
- **In pet apps, document import asks first; chat-derived writing (where it exists) does not.** `[E: S27, S29, S31]`

### 9.2 What a few do

- **A change log.** Gemini's "Memory history"; ChatGPT's saved memory history with restore by date. `[E: S15]` `[E†: S7]`
- **"Which memories shaped this answer."** ChatGPT's Sources icon; Gemini's "Your saved info" label; Pawtient's cited sources. `[E†: S9]` `[E: S17, S30]`
- **A time rule.** WHOOP separates standing facts from temporary ones and stores start and end dates. `[E†: S2]` `[E: S4]`
- **Source on the fact.** PetCare Ally (words only), MyPetID (document location), Digitail (clinic badge), Apple Health Records (organisation). `[E: S27, S28, S33]` `[E†: S21]`
- **Conflict handling.** PETTO lets the owner choose which version to keep when a document disagrees with the profile. Gemini may ask a follow-up when a change request is ambiguous. `[E: S29]` `[lead: S18]`

### 9.3 What nobody found does

All `[inferred]` from absence in the sources read, at help-page and listing strength.

- **Per-fact provenance that names a person and a date** ("your vet, 3 March" versus "you said, in chat"). The assistants show no source on an entry. Health records show an organisation. Pet apps show a document.
- **A stated rule for safety-relevant facts.** No vendor describes a different path for deleting or editing an allergy, a condition or a medicine than for a preference. Apple and the portals avoid the question by separating who may write.
- **A plain statement of when a change takes effect.** No vendor read says the assistant stops using a deleted entry "at once", or by a named time. The statements found are all about what does not change.
- **Confirmation before an AI-written entry is used**, among the assistants and wearables.
- **Removal from past chats.** OpenAI says the opposite. No other vendor addresses it.
- **Export of the memory list** as such.
- **A pet app with an owner-facing "what the AI knows" page.**

### 9.4 Naming patterns

| Vendor | Feature name | Framing words on or about the page | Word for one item |
|---|---|---|---|
| WHOOP | "My Memory" (also "Memories", "Personalization") | "what WHOOP knows about you and how to control it" | entry; memory |
| OpenAI | "Memory"; "Saved memories"; "memory summary"; "Manage memories" | "Reference saved memories", "Reference chat history" | memory |
| OpenAI Health | "Health memories"; "View Health Memories" | dedicated space | memory |
| Oura | "Memories" | "past information you've shared" | Memory |
| Google | "Saved info"; "Personal context"; "Your instructions for Gemini"; "Memory summary"; "Personal Intelligence" | "what Gemini Apps understands about you" | info; detail |
| Apple | "Medical ID"; "Health Details"; "Health Records" | none (labels only) | field; record |
| Epic MyChart | "Health Summary"; "Current Health Issues" (the problem list) | none | health issue |
| PetCare Ally | "Pet Records" | "tagged with where it came from" | record |
| MyPetID | "Digital Pet Identity" | "one profile that builds over time" | fact |
| PETTO | "Health Records" | "knows your pet's profile" | entry |
| Digitail | "Health Card" | "Verified by clinic" | n/s |
| Fi | "Fi Intelligence" (the assistant) | "complete health profile" | n/s |

Three families are visible. `[inferred]`
- **"Memory" words** (WHOOP, OpenAI, Oura, Google's newer page): used where an AI writes the entries.
- **"Info", "context", "instructions" words** (Google's older page): used where the user writes them.
- **"Record", "profile", "ID", "card", "summary" words** (Apple, Epic, every pet app): used where the content is health data, whoever writes it.

Verbs for the vendor's side: WHOOP and Pawtient-style listings use "knows"; Google uses "understands"; OpenAI and Oura use "remembers" or "stored". `[E†: S1]` `[E: S15, S14, S29]` No health-record product read uses "memory", and no AI-assistant product read uses "record", for this page. `[inferred]`

---

## 10. Sources

All fetched or searched 2026-11-15. "403" means the page refused the fetch and is known only through a search-index excerpt.

**WHOOP**
- S1. WHOOP, "My Memory: what WHOOP knows about you and how to control it". https://www.whoop.com/us/en/thelocker/my-memory-whoop/ (403)
- S2. WHOOP, "2026 What's New at WHOOP". https://www.whoop.com/us/en/thelocker/2026-whats-new/ (403)
- S3. WHOOP Support, "HealthEx Integration". https://support.whoop.com/s/article/HealthEx-Integration?language=en_US (index only)
- S3b. WHOOP, "How to connect and use your medical records in the WHOOP app". https://www.whoop.com/us/en/thelocker/healthex-integration/ (index only)
- S4. WHOOP Engineering, "The Crux of Every AI System: Evaluations", March 5, 2026. https://engineering.prod.whoop.com/ai-evaluation-framework/ (fetched)
- S5. WHOOP press release, May 8, 2026, "WHOOP Expands Health Platform with On-Demand Clinician Access and New AI Features". https://www.whoop.com/us/en/press-center/whoop-expands-health-platform-with-on-demand-clinician-access-and-new-ai-features/ (403; Business Wire copy also 403)
- S6. WHOOP Support, "How to Use the AI-Powered WHOOP Coach". https://support.whoop.com/s/article/How-to-Use-the-AI-Powered-WHOOP-Coach?language=en_US (loading shell only)
- S8. WHOOP, Full Privacy Policy. https://www.whoop.com/us/en/full-privacy-policy/ (index only)
- Lead only: StrengthInsight, "Using the WHOOP AI Coach (2026)". https://strengthinsight.app/blog/using-whoop-ai-coach/ (fetched; third party)

**OpenAI**
- S7. OpenAI Help, "Memory FAQ". https://help.openai.com/en/articles/8590148-memory-faq (403)
- S9. OpenAI Help, "ChatGPT release notes" (entries of May 5, June 4, June 12 and June 25, 2026). https://help.openai.com/en/articles/6825453-chatgpt-release-notes (403)
- S10. Lead only: third-party guides reporting the "Memory updated" notice, for example https://www.ai-toolbox.co/chatgpt-management-and-productivity/how-to-manage-chatgpt-memory-2026 (index only)
- S10b. Lead only: Popular AI, "ChatGPT Health privacy: settings to review before connecting". https://www.popularai.org/p/chatgpt-health-privacy-settings (index only)
- S11. OpenAI Help, "Temporary chat in ChatGPT". https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt (index only)
- S12. OpenAI, "Introducing ChatGPT Health". https://openai.com/index/introducing-chatgpt-health/ (403)
- S12b. OpenAI on X, launch post on Health memories. https://x.com/OpenAI/status/2008987795554259156 (index only)
- S13. OpenAI Help, "Health in ChatGPT" (article 20001036, several titles). https://help.openai.com/en/articles/20001036-health-in-chatgpt (403); and "Launching Health in ChatGPT". https://openai.com/index/health-in-chatgpt/ (403)
- S13b. OpenAI, Health Privacy Notice. https://openai.com/policies/health-privacy-policy/ (403)

**Oura**
- S14. Oura Member Care, "Oura Advisor", last updated November 3, 2026. https://support.ouraring.com/hc/en-us/articles/39512345699219/ (fetched)
- S14b. Oura Member Care, data deletion article. https://support.ouraring.com/hc/en-us/articles/360025586673 (index only)
- S15b. Oura blog, "Oura Advisor", March 31, 2025. https://ouraring.com/blog/oura-advisor (fetched)
- S16. Lead only: review reposted at https://pipedot.org/6WA4M (index only; said to be from Lifehacker, not confirmed)

**Google**
- S15. Google, "View & manage your memory summary in Gemini Apps". https://support.google.com/gemini/answer/18617127 (fetched)
- S17. Google, "Save info and reference past chats in Gemini Apps". https://support.google.com/gemini/answer/16413516 (fetched; page truncated)
- S18. Lead only: 9to5Google, November 9, 2026. https://9to5google.com/2026/11/09/google-gemini-memory-summary/ (fetched)

**Apple**
- S19. Apple Support, "Set up your Medical ID in the Health app on your iPhone", published March 10, 2026. https://support.apple.com/en-us/105072 (fetched)
- S20. Apple, iPhone User Guide, "Set up and view your Medical ID" and "Fill out your Health Details". https://support.apple.com/guide/iphone/set-up-and-view-your-medical-id-iph08022b192/ios (index only)
- S21. Apple, iPhone User Guide, "View health records in Health on iPhone" and "Download health records on iPhone". https://support.apple.com/guide/iphone/view-health-records-iph2b3a37ddd/ios (body not returned; index only)
- S22. Apple, "Health Records & Privacy". https://www.apple.com/legal/privacy/data/en/health-records/ (fetched)
- S23. Apple Support, "Manage Health data on your iPhone, iPad, or Apple Watch". https://support.apple.com/en-us/108779 (fetched)
- S23b. Lead only: Apple Community thread. https://discussions.apple.com/thread/255040439 (index only)

**Patient portals and law**
- S24. Cleveland Clinic, "MyChart Frequently Asked Questions". https://my.clevelandclinic.org/online-services/mychart/faq (fetched)
- S24b. Orlando Health, "MyChart For Patients and Families". https://www.orlandohealth.com/mychart/for-patients-and-families (index only)
- S25. 45 CFR 164.526, "Amendment of protected health information", Cornell LII copy. https://www.law.cornell.edu/cfr/text/45/164.526 (fetched)
- S26. OpenNotes news item on Bell SK et al., JAMA Netw Open 2020;3(6):e205867. https://www.opennotes.org/news/jama-open-1-out-of-5-patients-who-read-visit-notes-report-finding-mistakes/ (redirected, not followed; index only). AHRQ PSNet entry: https://psnet.ahrq.gov/issue/frequency-and-types-patient-reported-errors-electronic-health-record-ambulatory-care-notes (index only)

**Pet products**
- S27. PetCare Ally. https://www.petcareally.ai/ (fetched)
- S28. MyPetID, features page. https://mypetid.ai/features (fetched)
- S29. PETTO, Help Center. https://pettoai.app/help/ (fetched)
- S30. Pawtient AI, App Store listing. https://apps.apple.com/app/id6756168872 (fetched)
- S31. Dexter. https://houseofdexter.com/app (fetched)
- S32. Digitail Help, "How to Use the Digitail Pet Parent App to Manage Your Pet's Care", August 26, 2026. https://help.digitail.io/en/articles/12601847-how-to-use-the-digitail-pet-parent-app-to-manage-your-pet-s-care (fetched)
- S33. Digitail Help, "The Patient Profile in the App", September 30, 2024. https://help.digitail.io/en/articles/5007822-the-patient-profile-in-the-app (fetched)
- S34. Fi, "Fi Intelligence" help article. https://support.fitracking.com/hc/en-us/articles/49109803082387-Fi-Intelligence (403); press release March 17, 2026. https://www.businesswire.com/news/home/20260317091481/en (index only)
- S35. Store listings and vendor pages seen only in search excerpts: Petvimo (https://play.google.com/store/apps/details?id=com.petvimo, no body), Pettioe (https://pettioe.lovable.app/, 404), PetNexa (https://apps.apple.com/app/id6756158864), CompanAIn (https://apps.apple.com/app/id6747678727), VetVault (aggregator only, https://marlvel.ai/apps/vetvault-pet-health-records), PetDesk help (https://petdesk.zendesk.com/hc/en-us/articles/360052835393, 403), Voyage Vet Agent blog (https://www.thevoyage.ai/blog/introducing-voyage-vet-agent-ai-memory-that-never-forgets-your-pet, returned an unrelated index page).
