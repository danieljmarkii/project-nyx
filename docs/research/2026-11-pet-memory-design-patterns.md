# "What the app knows" pages: how they look and how a fact is edited

**Date:** 2026-11-15 · **Status:** frozen point-in-time brief · **Issue:** [CUL-2787](https://linear.app/projectnyx/issue/CUL-2787) · **Method:** one isolated web pass after the sibling brief; press pages, vendor help pages and store listings fetched with curl, image URLs pulled from their HTML, 24 image files downloaded and each opened and looked at (about 22 distinct screens across 10 products); a further 6 screens are known only from first-hand text (vendor help text or a hands-on review); everything else asked for was not reached and is listed as such · **Lane:** design evidence only. Options, not a recommendation.

**Read with:** `docs/research/2026-11-pet-memory-competitive.md` (what each feature does, who writes, what the vendor says after a delete). Nothing from that brief is repeated here. This brief answers two design questions from the PM:

- **Q1.** How do these products lay out the page, and how do they mark an item that needs attention. Our mock used an amber highlight and the PM is unsure about it.
- **Q2.** How does the user edit one fact. The PM disliked a form made of several rows of selectable chips.

**Evidence tags.**
- `[seen]` I opened the image file and am describing pixels. File names are in §E.
- `[described: Sn]` first-hand text from the source: vendor help text, or a reviewer who used the screen.
- `[inferred]` a reading across sources, or an absence.
- `[from model memory, unverified]` not fetched this session. Used rarely and never for a 2026 feature.

**What worked and what did not. Read this first.**
- **Worked:** press articles that embed vendor or reviewer screenshots (Gadgets & Wearables, The Decoder, 9to5Google, Android Authority, a Lifehacker image via a repost), vendor blogs with product stills (claude.com, linear.app docs), vendor help centres with images (Apple iPhone User Guide, Digitail), App Store listing pages (WHOOP, PetDesk), one health system's MyChart tip page.
- **Did not work:** whoop.com and help.openai.com still return 403. The Wayback Machine reset the connection for both. The Lifehacker review page itself returned 404. businesswire.com returned 403. Design galleries (Mobbin, Pageflows, Screenlane, Refero) were not tried, because they need a login.
- **WHOOP: the populated list was not seen.** I saw the three onboarding cards, the page in its empty state, the add sheet, and one "Memory detail" screen shown inside an onboarding card. No image of a full list of memories under category headings was found.
- **ChatGPT Health: no screen seen.** Only the general memory summary and the legacy saved memories list.
- **Oura: the Memories list itself was not seen.** I saw the Advisor settings screen that links to it, and read one reviewer's description of the list.
- **Apple Medical ID and Health Records: text only.** Apple's guide pages for these carry no screenshots. Apple Medications was seen (two screens).
- **Not reached at all:** One Medical, Function Health, Levels, Bearable, Flo, Finch, Headspace, Calm, Notion AI, Granola, Rewind or Limitless, Mem, Replika, Pi, Fi, Tractive, Pawp, Petfolk, Chewy Health, MyPetID, PETTO, Dexter, 11pets (its listing returned 404). Claims about these would be from memory, so none are made.
- **Beta caveat.** The WHOOP screens are from beta v5.3 in May 2026. The shipped version may differ.

---

## 1. Screens, one product at a time

### 1.1 WHOOP "My Memory" (6 images seen)

Source: Gadgets & Wearables, "WHOOP beta reveals Memory feature for long term coaching", https://gadgetsandwearables.com/2026/05/08/whoop-memory/ , fetched 2026-11-15. Reviewer screenshots from beta v5.3.

- **Tone and colour.** Near-black ground. White and grey text. One accent family, a blue to violet gradient, used for the spark icon, link text and the on state of a toggle. A green circle with a tick is the final "done" button of onboarding. No amber, no red. `[seen]`
- **Onboarding, three cards.** Each has an illustration on top, a two-line bold headline, two short grey paragraphs, and a round arrow button bottom right with a progress ring. Headlines: "Your life changes. Your coaching should too." then "Tell WHOOP what's going on." then "You're always in control." The last card's body reads "Confirm what's right, refine what's not". `[seen]`
- **Prompt chips as illustration.** Card one shows four outlined pills, each with a spark icon: "What I'm working toward", "What's limiting my time or energy", "My daily routine and schedule", "Injuries or health changes". These are topic prompts, not a form. `[seen]`
- **Page header.** Small caps centred title "MY MEMORY" with a back chevron. Below it a large two-line heading "Shape your WHOOP experience." and a one-line grey subhead "Help WHOOP understand you better." The member's initials sit in a teal circle on the right. `[seen]`
- **Empty state.** One rounded card on a faint violet tint. A small 3D illustration of an open box. "Share something new", then "The more WHOOP knows, the better your guidance becomes". Two equal buttons side by side: "TEXT" with a keyboard icon, "TALK" with a microphone icon. Under them a gradient text link "HOW DOES WHOOP MEMORY WORK?" with an arrow. The same card is the add control once the page has entries (it appears again at the foot of the detail screen as "Share more updates"). `[seen]`
- **Add.** Tapping opens a bottom sheet with a grabber. It is the Coach chat: a "Beta v5.3" pill, a history icon, the coach's opening message, suggested reply pills in white ("Build a consistent strength routine"), and a voice bar with a cross and a tick. Adding a memory is a conversation, not a form. `[seen]`
- **Entry anatomy (from the detail screen and an onboarding illustration).** A title in bold ("Low grade fever reported"). A two to three line sentence in grey that carries the date and context in prose: "On March 31, 2026, you reported experiencing a low grade fever. During this period, your heart rate variability was low...". One small outlined category chip under it ("Health Condition"). In the list illustration an entry row shows an icon in a rounded square, the title, and a small outlined status chip reading "Inactive". `[seen]`
- **Detail screen.** Header "MEMORY DETAIL", back chevron left, trash icon right. Then title, sentence, category chip. Then a full-width row: lightbulb icon, "Active" in bold, a subline in accent colour "This is actively influencing your coaching.", and a toggle. Then the "Share more updates" card with file, TEXT and TALK buttons. `[seen]`
- **State marking.** Status is a word in a neutral outlined chip ("Inactive") and a toggle with a sentence that says what the state does. No warning colour. `[seen]`
- **Edit.** No text field or pencil is visible on the detail screen. The only visible ways to change an entry are the Active toggle, the trash, and "Share more updates" (say or type the change). WHOOP's own text says entries can be edited; the screen that does it was not seen. `[seen]` for what is visible, `[inferred]` that editing runs through the update card.
- **Not seen:** category headers on the list, confirmation on delete, any undo.

### 1.2 WHOOP Advanced Labs (1 image seen)

Source: App Store listing, https://apps.apple.com/us/app/whoop/id933944389 , fetched 2026-11-15.

- Marketing frame. Dark ground, a ring graphic, then a card list. One card carries a small neutral chip with the WHOOP mark and the word "Recommended". Section label in small caps with a hairline rule ("SPECIALIZED PANELS"). Rows end in a chevron. `[seen]`
- Use here: the "Recommended" chip is another example of drawing attention with a word in a quiet chip.

### 1.3 ChatGPT memory summary and saved memories (2 images seen)

Source: The Decoder, 2026-06-04, https://the-decoder.com/chatgpt-now-saves-narrative-dossiers-about-you-sorted-by-work-hobbies-and-travel-preferences/ , fetched 2026-11-15. Both images are credited to OpenAI (desktop web).

**Memory summary (June 2026).**
- **Layout.** A white modal. Header: "Memory summary" with "Updated 2h ago" in grey beside it, close button right. Body is prose. Four bold section headings ("Overview", "Hobbies and Lifestyle", "Travel and Culture", "Community and Education"), each followed by one paragraph of three to five sentences in the second person ("You're a marine biologist..."). No bullets, no rows, no icons, no dates per fact, no source. `[seen]`
- **Edit.** Select any span of text. A small popover appears over the selection with two actions: "Make a correction" and "Don't mention this again". `[seen]`
- **Add.** A pill-shaped text field pinned to the bottom of the modal with placeholder "Add or update" and a round send arrow. `[seen]`
- **Colour.** Black text on white. The only colour is the blue text selection. `[seen]`

**Saved memories (legacy list).**
- **Layout.** A white modal. Title "Saved memories", one grey sentence of explanation with a "Learn more" link. A search field ("Search memories"), a sort icon and a three-dot menu. Then a flat list: one short third-person fragment per row ("Studies whale migration patterns"), hairline dividers, no date, no category, no icon. About 13 rows fit. `[seen]`
- **Row actions.** None visible at rest. `[seen]` Delete is reported as a per-row control that appears on hover. `[from model memory, unverified]`

### 1.4 Google Gemini "Memory summary" (3 images seen)

Sources: 9to5Google, 2026-11-09, https://9to5google.com/2026/11/09/google-gemini-memory-summary/ ; Android Authority, https://www.androidauthority.com/google-gemini-memory-summary-rollout-3733179/ . Both fetched 2026-11-15. Reviewer screenshots, desktop web, light and dark.

- **Entry point.** A settings page titled "Personal Intelligence" with a grey subhead. Two labelled groups, "Your data & preferences" and "About you". Each item is a large rounded grey card: outline icon top left, title, one grey sentence, and either a toggle or a chevron on the right. "Memory summary" is one such card: "View and edit key details that Gemini remembers about you". `[seen]`
- **The summary.** A sheet over the settings page. Header: "Memory summary" with "Updated just now" under it. Three icons right: pencil, three dots, close. `[seen]`
- **Grouping.** A category heading with an emoji ("The Essentials"), then one italic line that says what the category holds ("A snapshot of your core background, location, and key relationships."), then bullets. Each bullet is one full second-person sentence. `[seen]`
- **Other categories.** Career & Professional Projects, Travel & Daily Gear, Media & Entertainment, Fitness & Lifestyle. `[described: 9to5Google]`
- **Edit.** A text field at the bottom labelled to add or remove details by typing a request. The pencil is for broader edits. The three-dot menu holds "Memory history", which shows when a detail was added or changed. `[described: 9to5Google]` The field and the history view were not in the cropped images.
- **Colour.** Monochrome apart from Google blue on toggles. `[seen]`

### 1.5 Claude "Memory" settings (3 images seen)

Source: claude.com blog, 2026-08-25, https://claude.com/blog/claudes-memory-works-everywhere-and-you-decide-whats-in-it , fetched 2026-11-15. Vendor stills, desktop.

- **Layout.** A settings pane. Toggles first (reference chats, generate memory, include sensitive topics), each a title, a grey sentence and a switch. Then the record itself as a two-group table. `[seen]`
- **Grouping.** Two plain bold headings: "You" (rows "Profile", "Preferences") and "Topics" (one row per topic, for example "Meal Planning", "Half Marathon Training"). `[seen]`
- **Entry anatomy.** Three columns in one row: a short name in black; a one-line summary in grey, cut with an ellipsis; "Updated Jul 29" in grey. No icon, no chip, no colour. `[seen]`
- **Row hover.** The row lifts on a light grey ground and a trash icon appears at the far right. `[seen]`
- **Detail.** Back arrow and "Memory" title. The topic name in bold with a bordered "Delete" button on the same line. "Summary" heading and one sentence. "Details" heading and a bullet list of six short facts. A text field pinned to the bottom: "Tell Claude what to change or remove". `[seen]`
- **Edit.** By typing a request in that field, or delete the whole topic. The blog says each file can be read, edited or deleted. `[seen]` and `[described: claude.com blog]`
- **Sensitive topics.** Health and similar subjects are not saved unless a setting is on. When it is on, the user sees a notice each time such a thing is saved. `[described: claude.com blog]`

### 1.6 Oura Advisor (1 image seen, 1 screen described)

Sources: image hosted by Lifehacker, reached through https://pipedot.org/6WA4M (a repost of a March 2025 hands-on review), fetched 2026-11-15.

- **Advisor settings.** Black ground. Centred title "Advisor settings", close button left. One rounded group of three rows: "Style" with its value "Conversational" in grey under the label, "Check-in notifications" with "Daily", and "Memories", each with a chevron. A grey section label "General", then two more rows. Then a separate full-width row with centred red text "Reset Advisor" and a grey footnote under it stating what will be deleted. `[seen]`
- **Memories list.** Third-person sentences, for example "The user participates in competitive weightlifting". A trash can icon beside each. Tap the trash to delete. No edit, no add. `[described: the same review]`
- **Colour.** Red is used once, for the destructive reset. `[seen]`

### 1.7 Apple Health: Medications, Medical ID, Health Records (2 images seen, 3 screens described)

Sources: iPhone User Guide, "Track your medications" https://support.apple.com/en-bw/guide/iphone/iph811670c81/ios , "Set up and view your Medical ID" https://support.apple.com/en-bw/guide/iphone/iph08022b192/ios , "View health records" https://support.apple.com/en-bw/guide/iphone/iph2b3a37ddd/ios , and https://support.apple.com/en-us/105072 . All fetched 2026-11-15.

**Medications list.** `[seen]`
- Title bar "Medications". A week strip of filled circles for adherence. Section "Log": cards on a pale blue tint for what is due now (time in bold, pill icon, name, a blue plus). A grey "Logged" card for what is done, with ticks and "1h ago".
- Section "Your Medications" with a blue text link "Edit" on the same line as the heading. Each medicine is a card with a pill illustration, name, form, and a chevron.
- Attention is carried by position (due items first) and a soft tint of the app's own blue. No warning colour.

**Edit Schedule.** `[seen]`
- A full-height modal sheet. Cross in a circle top left, blue circle with a tick top right, title "Edit Schedule" between them.
- Grey question headings: "When will you take this?", "At what time?", "What is the cycle?", "Duration".
- Under each, one rounded group of rows. Label on the left in black, the current value on the right in blue. Values with a small up and down chevron open a native menu ("Day", "21 days", "7 days"). One row has a "Change" text link.
- A list inside the form: a red minus circle to remove a time, a green plus circle with "Add a Time". The time is a grey capsule that opens the time picker. The dose "2 capsules" is blue text.
- Grey footnotes under groups explain consequences ("Next Pause: April 22").
- No chips anywhere.

**Edit steps, in Apple's words.** `[described: Apple guide]`
- Change a schedule: tap a medication, scroll to Schedule, tap Edit, then "tap a field to change it".
- Change icon, nickname or notes: tap the medication, scroll to Details, tap Edit or tap a text field.
- Archive: swipe left on the name in the list, tap Archive. Restore through Edit above the list and the add button.
- Delete: tap the medication, scroll to the bottom, tap "Delete Medication".
- Reorder: Edit above the list, drag by the handle, Done.

**Medical ID.** `[described: Apple support]`
- Reached from the profile picture. A read view. "Edit" puts the whole page into edit mode. In edit mode the user taps "Edit or Add next to the field" to change it. Emergency contacts use a plus button to add and a delete button to remove. "Done" saves. Two switches sit at the bottom.

**Health Records.** `[described: Apple guide]`
- Browse by category ("Allergies", "Clinical Vitals") or by the name of an organisation. A details button opens more. Lab results can be pinned to the top by swiping left or by touch and hold ("Pin this Lab"). The only removal is the whole account. No per-record edit is described.

### 1.8 MyChart Health Summary (1 image seen)

Source: Austin Regional Clinic, https://www.austinregionalclinic.com/patient-guide/mychart-tips/use-health-summary-for-a-broader-view-of-your-health , fetched 2026-11-15. Desktop web, one health system's build.

- **Layout.** A tinted band at the top with basics in one line (height, weight, age, last visit as a link). Below it a grid of white cards, one per category: "Health Goal", "Treatment Goals", "Medications", "Test Results". Each card has a small coloured icon and a title, then three or four plain rows, then "+ more", then a footer link ("Go to Medications"). `[seen]`
- **Entry anatomy.** Medication rows: name and strength, and under it a grey "Commonly known as:" line. Test rows: name, date under it, an arrow. `[seen]`
- **Empty state.** The Health Goal card shows a grey target icon, "You have no health goals shared with your care team.", one grey sentence on why to add one, and an "Add goal" link with a plus. `[seen]`
- **Attention.** A separate right-hand column titled "Recommended Actions" with a lightbulb icon. Each item is a sentence and a solid purple "View details" button. Things that need the patient are grouped in their own column, in the brand colour, not flagged in place. `[seen]`
- **Edit.** Not on this page. Other health systems describe a Remove button on a medicine with a comment box for the reason, and plus and minus signs on allergies, both sent to the care team. `[described: UK HealthCare, URMC and St. Jude guides, via search excerpts]`

### 1.9 Linear (2 images seen)

Source: Linear Docs, "Triage Intelligence", https://linear.app/docs/triage-intelligence , fetched 2026-11-15.

- **Suggested versus confirmed.** Under the issue title sits one bordered panel, "Triage Intelligence". Rows have a grey label on the left ("Suggestions", "Duplicate of", "Related to"). A suggested value that is not yet applied is a chip with a dashed outline. A value that has been applied is plain text with a small tick after it. Same size, same colours; only the outline and the tick differ. `[seen]`
- **Why.** Clicking a dashed chip opens a popover: the value, a heading "Why this assignee was suggested", two grey bullet reasons, "Alternatives" (another dashed chip), then a wide "Accept suggestion" button and a thumbs-down icon. `[seen]`
- **Settings.** Each property type can be set to show, hide or auto-apply suggestions. `[described: Linear Docs]`
- **Property editing in general.** Click a property value and a small searchable menu opens in place; pick a value and it saves at once. `[from model memory, unverified]` The docs page for this was not found (404).

### 1.10 Pet apps (3 images seen)

**Digitail Pet Parent App.** Source: Digitail Help, https://help.digitail.io/en/articles/5007822-the-patient-profile-in-the-app , fetched 2026-11-15. Android screenshots.
- **Profile tab.** A row of circular pet avatars at the top, the selected one ringed. Tabs "PROFILE", "DIARY", "VISIT SUMMARIES". One white card: photo, name, a green scalloped tick badge (verified by clinic), weight in a tinted box, species and breed in grey caps, age with birth date. `[seen]`
- **Allergy.** "Allergic To: Overcooked Chicken" in red text, directly under the age. On the Health Card the allergy value is again in dark red, under a grey "Allergies" label. `[seen]`
- **Status pills.** A filled red pill "Due date: 01/06/2024" under a preventive item. A filled green pill "Active" beside a medicine, followed by "Created:" and "Expires:" dates in grey. `[seen]`
- **Health Card.** Header "Health Card", back chevron, three-dot menu. A summary card with a teal "Edit" text link top right and a camera badge on the photo. Fields are label above value, two columns (Gender, Age, Color as swatches, Distinctive marks). Three icon tabs: Overview, Preventive (with a red count badge "10"), Medications. Section label "HEALTH" in blue caps, then label over value pairs. `[seen]`
- **Edit.** One "Edit" link for the identity card. Clinic-owned fields show no control. `[seen]`

**PetDesk.** Source: App Store listing, https://apps.apple.com/us/app/petdesk-pet-health-reminders/id631377773 , fetched 2026-11-15. Marketing frame.
- Pet avatars in a row with "Add Pet". A wide photo. Name with a nickname in brackets. A two by two grid of icon and value (sex, age, breed, weight). A grey pill button "Complete Profile". Then a list of rows with coloured square icons ("Medical Records", "Prescriptions") and chevrons. A floating teal plus button. A red count badge on the "To Dos" tab. `[seen]`
- An incomplete profile is marked by a neutral button that names the task, not by a colour.

---

## A. Page design patterns (Q1)

| # | Pattern | Seen in | Strengths | Weaknesses for a health record with provenance |
|---|---|---|---|---|
| A1 | **Prose summary under headings.** Paragraphs or full-sentence bullets, second person. | ChatGPT memory summary `[seen]`; Gemini Memory summary `[seen]` | Reads like being known. Low chrome. Easy to scan for a wrong sentence. | One sentence can hold several facts. Nowhere to hang a source or a date per fact. Hard to remove one fact cleanly. No per-fact state. |
| A2 | **Flat list of short sentences.** One fact per row, hairlines, nothing else. | ChatGPT saved memories `[seen]`; Oura Memories `[described]` | Simplest possible. Search and sort scale it. Delete is obvious. | No grouping, so a medicine sits beside a food preference. No source, date or status. Third-person phrasing ("The user...") reads cold. |
| A3 | **Grouped index rows with a one-line preview, opening a detail.** Name, truncated summary, "Updated" date. | Claude Memory `[seen]`; Apple "Your Medications" cards `[seen]` | Dense and calm. The date sits in a fixed column. Detail has room for everything. | The list hides the fact itself behind a label and an ellipsis. Two taps to check anything. |
| A4 | **Settings-style grouped rows, label left and value right.** | Apple Edit Schedule `[seen]`; Oura Advisor settings `[seen]`; Gemini Personal Intelligence cards `[seen]`; Apple Medical ID `[described]` | Familiar on a phone. Each value is its own tap target. Suits typed values (weight, dose, dates). | Suits short values only. A vet instruction in a sentence does not fit a right-aligned value. Feels like settings, not like a record of a pet. |
| A5 | **One card per category, top rows plus "more".** | MyChart Health Summary `[seen]`; PetDesk profile `[seen]` | Whole record on one screen. Each card has its own empty state and its own add link. | Truncation hides items. On a 390pt phone the cards stack into a long scroll. Provenance has to fit in a sub-line. |
| A6 | **Identity card on top, then tabs of label-over-value fields.** | Digitail Health Card `[seen]` | Pet first. Tabs split the long record. A badge on a tab carries a count. | Tabs hide two thirds of the record. A safety fact on another tab is out of sight. |
| A7 | **Entry as a small titled card with a sentence and a category chip, with its own state.** | WHOOP Memory detail and list illustration `[seen]` | Title for scanning, sentence for the context and date, chip for the group, toggle for "in use or not". The closest seen to a fact with attributes. | Date and source are inside the prose, so they cannot be sorted or shown consistently. Needs a detail screen. |
| A8 | **A separate "needs you" block beside the record.** | MyChart "Recommended Actions" `[seen]`; Linear Triage Intelligence panel `[seen]`; Apple "Log" above "Your Medications" `[seen]` | The record stays calm. Everything that needs an answer is in one place and can empty out. | The item is shown apart from its context unless it links back. Two places to keep in step. |

Notes across the table.
- **Headers are small.** Every product seen uses a plain title, at most one grey sentence under it, and often a quiet "Updated ..." stamp. Only WHOOP adds a large two-line statement heading. `[seen]`
- **Per-fact dates are rare and per-fact sources are absent.** Claude shows "Updated" per topic. Digitail shows "Created" and "Expires" on a medicine. WHOOP writes the date into the sentence. Nothing seen prints who said a fact. `[seen]`
- **Voice.** Second person in the two prose designs ("You work as..."). Third person in the two flat lists. `[seen]` and `[described]`
- **Empty states seen.** WHOOP: illustration, one line of why, two ways to add, a "how does this work" link. MyChart: grey icon, a plain statement, one sentence of benefit, an add link, inside the card it belongs to. `[seen]`

---

## B. Edit patterns (Q2)

| # | Pattern | Seen in | Steps to finish one edit | Structured attributes (who said it, certainty, date) versus free text |
|---|---|---|---|---|
| B1 | **Select text, choose a verb.** A popover on the selection. | ChatGPT memory summary `[seen]` | Select a span, tap "Make a correction", type the correction. Or one tap on "Don't mention this again". | Free text only. Has no way to express an attribute. The second verb is a useful third state between keep and delete. |
| B2 | **A request box pinned under the record.** Type what to change. | ChatGPT ("Add or update") `[seen]`; Claude ("Tell Claude what to change or remove") `[seen]`; Gemini `[described]`; WHOOP TEXT or TALK `[seen]` | Type or say one sentence, send. The system rewrites the entry. Gemini may ask a follow-up. | Handles anything in words, including "the vet said this in March". Nothing shows the user which attributes exist, and the result is not certain until read back. |
| B3 | **Row opens a detail; detail holds the actions.** | WHOOP Memory detail `[seen]`; Claude topic detail `[seen]`; Apple medication detail `[described]` | Tap row. Then toggle, delete, or go on to B2 or B4. | Detail is where attributes can be shown one per line. WHOOP shows a category chip and an Active switch there. |
| B4 | **Modal form of grouped rows with native menus and pickers.** Cross to cancel, tick to save. | Apple Edit Schedule `[seen]` | Tap Edit, tap a blue value, pick from the menu or wheel, tap the tick. | Best fit seen for structured values. Each attribute is one row whose value opens the right control. No chips. Free text gets a plain text row. |
| B5 | **Whole-page edit mode.** "Edit" turns a read view into fields; "Done" saves. | Apple Medical ID `[described]`; Digitail identity card `[seen]`; Apple medications list reorder `[described]` | Tap Edit, change any number of fields, plus and minus circles for list items, tap Done. | Good for several small changes at once. All attributes become visible at once, which is heavy on a long record. |
| B6 | **Swipe a row.** | Apple Medications (Archive) and Lab Results (Pin) `[described]`; WHOOP chat history (delete) `[described: sibling brief]` | Swipe left, tap the action. | One action per swipe, no attributes. Apple reserves swipe for the reversible action (archive) and puts delete at the bottom of the detail. |
| B7 | **Icon on the row.** A trash at the end of each row, or on hover. | Oura Memories `[described]`; Claude list hover `[seen]` | One tap, possibly a confirm. | Delete only. |
| B8 | **A switch that pauses without deleting.** | WHOOP "Active" `[seen]`; Apple Archive `[described]` | One tap. | Encodes one attribute (in use or not) with a sentence that says what it means. |
| B9 | **Accept or decline a suggested value, with reasons.** | Linear Triage Intelligence `[seen]` | Tap the dashed chip, read why, tap "Accept suggestion" or the thumbs-down. | Shows the reason and alternatives for one structured value. Accepting needs no form at all. |
| B10 | **Request to the record's owner.** Remove with a reason; someone else decides. | MyChart `[described]` | Tap remove, type a reason, send. | The reason is free text. The record does not change at once. |

Notes across the table.
- **No product seen edits a fact with rows of selectable chips.** Chips appear as labels (WHOOP category, WHOOP "Inactive", Digitail "Active"), as suggested replies in chat (WHOOP), and as suggestions awaiting a yes (Linear). Where a structured value is chosen, Apple uses a row whose value opens a menu or a picker. `[seen]`
- **The assistants avoid forms altogether.** ChatGPT, Gemini, Claude and WHOOP all route edits through language. Their entries are free text, so they have nothing structured to edit. `[seen]` `[inferred]`
- **Destructive and reversible actions are kept apart.** Apple: swipe to archive, scroll to the bottom to delete. WHOOP: switch to pause, trash in the header to delete. Oura: reset in red, alone, with a sentence of consequence. `[seen]` `[described]`
- **Confirmation and undo.** No confirmation dialog, toast or undo was visible in any image. Apple's emergency-contact removal asks for a second tap on "Delete". ChatGPT keeps a version history on paid plans (sibling brief). Motion was not described by any source. `[described]` `[inferred]`

---

## C. Drawing attention without a warning colour

| Device | Seen in | What it looks like |
|---|---|---|
| A word in a quiet outlined chip | WHOOP "Inactive", "Health Condition"; WHOOP Labs "Recommended" `[seen]` | Neutral outline, same text colour as the body. State is read, not colour-coded. |
| Dashed outline for "not yet confirmed", tick for "confirmed" | Linear `[seen]` | Same chip, same colours. The border style and a tick carry the whole difference. |
| A separate block for things that need an answer | MyChart "Recommended Actions"; Linear panel; Apple "Log" `[seen]` | Its own heading and place on the page. The record below stays plain. |
| Position | Apple (due now first); Apple pinned labs `[seen]` `[described]` | The thing to act on is at the top. |
| A soft tint of the brand colour | Apple due cards (pale blue); WHOOP add card (faint violet) `[seen]` | Background only, low contrast, never a warning hue. |
| A count badge on a tab | Digitail "Preventive 10"; PetDesk "To Dos 2" `[seen]` | Small red circle with a number, on navigation, not on the fact. |
| A neutral button that names the task | PetDesk "Complete Profile"; MyChart "Add goal" `[seen]` | The gap is stated as an action. |
| A sentence that says what the state does | WHOOP "This is actively influencing your coaching."; Oura reset footnote; Apple "Next Pause: April 22" `[seen]` | Grey or accent text under the control. |
| A freshness stamp | ChatGPT "Updated 2h ago"; Gemini "Updated just now"; Claude "Updated Jul 29" `[seen]` | Grey, beside the title or in a column. Signals "this changed" without a flag. |
| A notice at the moment of saving | Claude, for sensitive topics `[described]` | Tells the user when it happens, so the page itself needs no marker. |

**Who uses amber or yellow.** In the 24 images, nobody. No amber or yellow highlight, tint, chip or icon marks a fact in any product seen. `[seen]` The only orange is a status icon on linked issues in Linear, which is that product's fixed colour for an issue state. `[seen]`

**Who uses red, and for what.** `[seen]`
- Digitail: the allergy, as red text, and an overdue date, as a filled red pill.
- Oura: the one destructive action ("Reset Advisor").
- Apple: the minus circle that removes a list item.
- Digitail and PetDesk: count badges on tabs.
- So red means one of three things: a clinical alert, overdue, or destructive. None uses it for "please review".

**Reading.** `[inferred]` In the products seen, "needs review" is treated as a state or a place, and is shown with words, outline style, position and grouping. Warning colours are kept for clinical alerts and destructive actions. This is a description of 10 products, several of them from marketing stills, and it is not a rule.

---

## D. Six directions a designer could take

Each is an option with its precedent. None is recommended here.

**D1. "The letter".** A short prose portrait of the pet under four or five headings, written to the owner.
- Page: A1. Precedent: ChatGPT memory summary, Gemini Memory summary.
- Edit: select a phrase, then "Make a correction" or "Don't mention this again" (B1), plus one "Add or update" box at the foot (B2).
- Open issue from the evidence: no precedent shows a source or date per fact in this layout.

**D2. "The index".** Two or three plain groups of one-line rows: a name, a one-line preview, a quiet date. Tap for the full fact.
- Page: A3. Precedent: Claude Memory, Apple "Your Medications".
- Edit: the detail screen shows the fact, its attributes as lines, a Delete button and one request box (B3 with B2).
- Open issue: the fact itself is one tap away from the list.

**D3. "The chart".** One card per kind of fact (health problems, medicines, diet, weight, what the vet asked for, what you told us), each with its top rows, its own empty state and its own add link.
- Page: A5. Precedent: MyChart Health Summary, PetDesk.
- Edit: tap a row to open a modal of grouped rows, each value opening a native menu or picker, cross and tick in the header (B4). Precedent: Apple Edit Schedule.
- Open issue: length on a phone; truncation behind "+ more".

**D4. "The inbox on top".** A calm record below, and above it one short block that holds only what needs the owner. The block empties as items are answered.
- Page: A8 over any of A2, A3 or A5. Precedent: MyChart "Recommended Actions", Apple "Log" above "Your Medications", Linear's panel.
- Marking: dashed outline until confirmed, a tick after (Linear). No colour.
- Edit: accept or decline in place, with a "why" popover that names the source (B9).
- Open issue: an item is shown apart from its neighbours in the record.

**D5. "The fact card".** Every fact is a small card: a short title, one sentence that carries who and when, one quiet category chip, and a status word.
- Page: A7. Precedent: WHOOP Memory detail and list.
- Edit: tap for detail; a switch pauses the fact with a sentence saying what that does; trash in the header; "tell us what changed" by text or voice (B3, B8, B2).
- Open issue: who and when live in prose, so they are not consistent or sortable unless the design adds fixed lines for them.

**D6. "Pet first, then tabs".** An identity card with the photo, weight and the one safety line, then tabs for the rest, fields as label over value.
- Page: A6 with A4. Precedent: Digitail Health Card, Apple Medical ID.
- Edit: one "Edit" link puts the page into edit mode; plus and minus circles for list items; "Done" saves (B5). Swipe a row to archive, delete at the bottom of the detail (B6).
- Open issue: tabs hide most of the record; a count badge on the tab is the only cue.

Two smaller moves that combine with any of the six. `[seen]`
- A freshness stamp beside the title ("Updated 2h ago") in place of per-row "new" flags.
- A pause state between keep and delete (WHOOP "Active" switch, ChatGPT "Don't mention this again", Apple Archive).

---

## E. Saved image files

All under `/tmp/claude-0/-home-user-project-nyx/f58f460e-30b4-513d-a5a0-bfff5303a1cf/scratchpad/design-refs/`. Session scratch only; not committed. All 24 were opened and viewed.

| File | What it shows |
|---|---|
| `whoop-my-memory-1.jpg` | Onboarding card 1: four outlined prompt pills, headline, "GET STARTED". |
| `whoop-my-memory-2.jpg` | Onboarding card 2: hourglass illustration with a memory row and an "Inactive" chip. |
| `whoop-my-memory-3.jpg` | Onboarding card 3: the "MEMORY DETAIL" screen, trash, title, sentence, category chip, "Active" switch. |
| `whoop-my-memory-4.jpg` | "MY MEMORY" page in its empty state: heading, initials, "Share something new" card with TEXT and TALK. |
| `whoop-my-memory-5.jpg` | Same page with the Coach chat sheet rising from the bottom. |
| `whoop-my-memory-6.jpg` | Coach chat sheet full height: opening message, suggested reply pills, voice bar. |
| `whoop-advanced-labs.jpg` | App Store frame of Advanced Labs: card with a "Recommended" chip, small-caps section label. |
| `chatgpt-memory-summary.webp` | Memory summary modal: prose under four headings, selection popover with two verbs, "Add or update" box. |
| `chatgpt-saved-memories.webp` | Saved memories modal: search, sort, flat list of one-line fragments. |
| `gemini-memory-summary-9to5.jpg` | Memory summary sheet, light: "Updated just now", pencil, three dots, emoji heading, italic descriptor, bullets. |
| `gemini-memory-summary-aa.png` | The same sheet in dark mode. |
| `gemini-personal-intelligence-9to5.jpg` | "Personal Intelligence" settings page: grouped cards with toggles and chevrons, "Memory summary" entry. |
| `claude-memory-1.png` | Memory settings: toggles, then "You" and "Topics" tables with name, preview, "Updated" date, trash on hover. |
| `claude-memory-2.png` | Close view of the same table with one row hovered. |
| `claude-memory-3.png` | A topic's detail: Delete button, Summary, Details bullets, "Tell Claude what to change or remove" box. |
| `oura-advisor-lifehacker.jpg` | Three Oura screens: Advisor settings (with the "Memories" row and red "Reset Advisor") and two chat views. |
| `apple-medications-log.png` | Health, Medications: week strip, tinted "Log" cards, "Logged" card, "Your Medications" with "Edit". |
| `apple-medications-edit-schedule.png` | "Edit Schedule" modal: grouped rows, blue values with menu chevrons, minus and plus circles, footnotes. |
| `mychart-health-summary.jpg` | MyChart Health Summary: basics band, category cards with "+ more", empty Health Goal card, "Recommended Actions" column. |
| `linear-triage-suggestions.png` | Triage Intelligence panel: dashed chip for a suggestion, ticked values for applied ones. |
| `linear-suggestion-why.png` | Suggestion popover: "Why this assignee was suggested", reasons, alternatives, "Accept suggestion", thumbs-down. |
| `digitail-pet-profile-1.jpg` | Digitail profile tab: pet switcher, card with verified badge, red allergy text, red due pill, green "Active" pill. |
| `digitail-pet-profile-2.jpg` | Digitail Health Card: "Edit" link, label-over-value fields, icon tabs with a red count badge, allergy in red. |
| `petdesk-pet-profile.jpg` | PetDesk Pets tab: photo, icon and value grid, "Complete Profile" button, record rows. |

## Sources

All fetched 2026-11-15 unless marked.
- S1. Gadgets & Wearables, WHOOP Memory beta. https://gadgetsandwearables.com/2026/05/08/whoop-memory/
- S2. The Decoder, ChatGPT memory summary, 2026-06-04. https://the-decoder.com/chatgpt-now-saves-narrative-dossiers-about-you-sorted-by-work-hobbies-and-travel-preferences/
- S3. 9to5Google, Gemini Memory summary, 2026-11-09. https://9to5google.com/2026/11/09/google-gemini-memory-summary/
- S4. Android Authority, Gemini Memory summary. https://www.androidauthority.com/google-gemini-memory-summary-rollout-3733179/
- S5. Claude blog, 2026-08-25. https://claude.com/blog/claudes-memory-works-everywhere-and-you-decide-whats-in-it
- S6. Oura Advisor review repost. https://pipedot.org/6WA4M (original Lifehacker page returned 404)
- S7. Apple, iPhone User Guide: medications, Medical ID, health records (URLs in §1.7); Apple Support 105072.
- S8. Austin Regional Clinic, MyChart Health Summary tip (URL in §1.8). Search excerpts only for UK HealthCare, URMC and St. Jude MyChart guides.
- S9. Linear Docs, Triage Intelligence. https://linear.app/docs/triage-intelligence
- S10. Digitail Help, "The Patient Profile in the App". https://help.digitail.io/en/articles/5007822-the-patient-profile-in-the-app
- S11. App Store listings: WHOOP (id933944389), PetDesk (id631377773).
- Blocked or failed: whoop.com (403), help.openai.com (403), web.archive.org (connection reset), businesswire.com (403), lifehacker.com review (404), 11pets App Store listing (404), linear.app/docs/issue-properties (404).
