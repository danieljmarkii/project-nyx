# Nyx Vet Contacts: a call, text or email that was not an exam — Requirements

**Version:** 1.1 | **Last Updated:** 2026-11-19 | **Issue:** CUL-2749 (discovery) | **Linear project:** *Vet contacts: a call, text or email that wasn't an exam* | **Design authority:** the build-ready mock round (PR-01, 2026-11-19), https://claude.ai/artifact/97ohC4DfPN2sUa2Cf9kyqV (canonical file `docs/culprit-vet-contact-mockups.html`; the repo file wins on divergence). It supersedes round 3.1.

**Read with:** `docs/nyx-vet-visits-requirements.md` (the visit lifecycle this extends; §5.6's reader bound), `docs/nyx-care-state-requirements.md` (the awareness-only rule rides its §6 shapes), `docs/nyx-vet-files-requirements.md` (attachments; D7, D8, D14), the Vet instructions spec once it lands (`docs/nyx-vet-instructions-requirements.md`, project *Vet instructions*, CUL-2731), `docs/nyx-diet-trial-requirements.md` (the trial row), `docs/nyx-beta-features-requirements.md` (the flag).

---

## TL;DR — plain English

Owners hear from the vet by phone, text and email far more often than in the exam room. On 2026-11-09 the PM's vet recommended an ear medication for Nyx after a call and a few texts, and the app had nowhere to put it: a visit means an exam happened, and "I've called" exists only as an answer to an app warning. This feature lets an owner log **a vet contact** in a few taps, say **how** it happened, attach **what the vet sent** (screenshots, a PDF), start **what the vet started**, and note **what to watch for**. A contact reads as **"no exam"** everywhere. It never becomes the report's "last visit", and it never quiets a warning.

---

## 0. Decision record

### 0.1 Rulings (PM)

| # | Ruling | Date |
|---|---|---|
| R1 | **Worth building**, after a product team convening (8 for, Product Owner "later", none against). | 2026-11-13 |
| R2 | **Attachments:** any contact can carry what the vet sent: screenshots, a PDF, a photo of a sheet. Filed into Vet Files, linked to the contact. | 2026-11-14 |
| R3 | **Email** is a channel. The set is **At the clinic · Phone · Text · Email**; Text covers clinic apps and portal messages. | 2026-11-14 |
| R4 | **The vet's "call me if" ships with this.** A contact's after screen hosts the Vet instructions capture (*Anything to watch for?*), reused as ruled in that project. | 2026-11-14 |
| R5 | **Awareness only.** A logged contact may add a context line to a warning. It never removes, softens, delays, reorders or rewords one, and it is never an exam for the care state. | 2026-11-14 |
| R6 | **Share into Culprit** from Messages, Mail or a clinic app is pulled forward, as a follow-up (CUL-2762), not in this run order. | 2026-11-14 |
| R7 | **One entry:** the Vet visits card's second button becomes *Log a visit, call, text or email*. No second door. | 2026-11-14 |
| R8 | **The report window stays at the last exam.** A contact is listed in the period it falls in; it never becomes "since the last visit". | 2026-11-14 |
| R9 | **A channel field on `vet_visits`**, not a contacts table. Engineering's condition rides it: every `vet_visits` reader declares *exams only* or *any contact*, held by a guard. | 2026-11-14 |
| R10 | **The card of a pet that already has a visit gains the logging button**, with or without a booking (the critique's G1, option A). The shipped button renders only while a pet has no visits; without this, a pet with a visit has no way to log a contact. | 2026-11-19 |
| R11 | **A card that already says "You called on" gains the contact line only when its day or channel differs** from that shipped line (G3, option B). An identical fact is said once. R5 holds in both cases. | 2026-11-19 |
| R12 | **A saved contact's channel can be edited**, all four chips (G4, option A). The report window follows the corrected record in both directions. | 2026-11-19 |

### 0.2 The owner review (Jordan, Sam; isolated `pm-feature-review` on round 2) — folded in as rules

| Finding | Rule here |
|---|---|
| "Has this happened?" is pointless from the logging door (both) | §4.2: the logging door opens on a past contact; the question stays only on the booking door |
| "The report still starts from Sep 18" is jargon (both) | §4.2: one plain footnote per channel |
| One contact spans days (both) | §4.3: each thing the vet sent carries its own date (`vet_documents.document_date`) |
| The trial was below the fold; "two more weeks" had nowhere to go (Jordan) | §4.3: on a pet with a running trial, the trial row leads, with *Keep going until* |
| A supplement started mid trial (Jordan) | §4.3: the row is *Start a medicine or supplement*; a course started during a trial is shown on the trial (display only, §8) |
| "Owner holds the vet's texts" read as attached (Jordan) | §4.6: "Texts on the owner's phone, not attached" |
| The green check after "she's barely eaten" felt handled (Sam, blocking) | §4.4: no check mark while a warning is live or a sign is watched |
| One call about both cats (Sam) | §4.2: *Also about* on a past contact, multi pet homes only |
| "Try warming the food" must not turn a decline into preference (Sam, blocking) | §6.2: nothing started from a contact changes how intake is read |
| A logged call must never soften Home (Sam, blocking) | R5, §4.5, AC 9–10 |

### 0.3 Decided on the fly, named here so the build does not re-ask

- **The report keeps clinical words** ("Phone consult, no exam"): the vet is its reader (Dr. Chen). Owner-facing copy says "phone call".
- **Booking stays clinic only.** An appointment is a visit by definition; the channel chips appear only on a past contact.
- **Clinic** moves under *What it was about* as an optional field on a remote contact.
- **The optional time** is stored as a UTC instant (C-10), shown in the owner's zone.
- **Also about** writes one independent row per pet, the shape `alsoForPetIds` already uses for bookings and Vet Files D13 uses for documents. Edits diverge by design ("Juniper's fine").

---

## 1. The problem

| Today | Consequence |
|---|---|
| `vet_visits` means an exam happened. It anchors the report's default window (rung 1, the most recent visit strictly before today) and every "since the last visit" read. | Logging the Nov 9 call as a visit would tell the next vet Nyx was examined that day and cut the report to five days. |
| `vet_calls` (082) is the outcome loop's "I've called": NOT NULL `event_id` (an escalation), an owner-only note no server reads. | It cannot hold a contact the owner started, and its note can never reach the vet. |
| A course started from a phone call has no source. | On the report, "ear drops, started Nov 9" with no exam on record reads as self medication (Dr. Chen). |
| The vet's "call back if…" lives in the owner's head. | The Vet instructions project fixes this for visits only. |

---

## 2. What exists (verified at file:line, 2026-11-14)

| Surface | Where | What this feature does to it |
|---|---|---|
| Vet visits card | `components/vetvisits/VetVisitsCard.tsx:55–69` (*Add the next visit*, *Log a visit that already happened*): **the empty branch only**, rendered while the pet has no visits. `VetVisitsEmptyState.tsx:36–42` carries the same pair on the list. With a visit or a booking the card shows *Open visits* alone (:72–108), and the list's *Add* opens booking only | R7 renames the second button in both places behind the flag; R10 adds it to the non-empty card |
| The sheet | `components/vetvisits/BookVisitSheet.tsx`: *Has this visit happened?* `ChipGroup` (`MODE_OPTIONS`, :64); title :221; footnote :418–422; `alsoForPetIds` sent only when booked (:205) | §4.2 |
| The write | `lib/vetVisits.ts:1066` `logVetVisit` (local first; "never 'from today'") | gains `channel`, `contacted_at` |
| After screen | `app/vet-visits/after.tsx`, `components/vetvisits/AfterVisitBody.tsx` (title :141; trial verdicts :102–110; *Paperwork* :338–351) | §4.3 |
| Saved moment | `components/vetvisits/VisitSavedMoment.tsx` | §4.4 |
| Visit page | `components/vetvisits/VisitDetailBody.tsx` (title :47) | §4.6 |
| Vet Files link | `lib/visitPaperwork.ts`, `linkVetDocumentVisit` (Vet Files D7: a document links to a visit, never mints one) | reused unchanged |
| Diet trial window | `diet_trials.target_duration_days` + `target_duration_set_at` + `target_duration_vet_directed` (068); `lib/dietTrial.ts:371` | *Keep going until* writes these through the shipped path |
| Reader bound | `guards/visitReaders.test.ts` (visits never enter a count, a coverage line or an engine input) | §5.3 extends it |
| Readers that mean an exam | `lib/visitWindow.ts:108` (the window's visit days); `lib/careAnswers.ts:136` (latest visit for care answers); `lib/rundown.ts` `lastVisit` (:875, :988); `lib/vetVisits.ts:990` (visit days for appointments) and `:2125` (`readVisitConsequence`); `supabase/functions/generate-report/index.ts:1313` and the composer's rung 1; `supabase/functions/generate-signal/index.ts:1073` (care context visit date) | PR-03 filters each to `in_clinic` |
| Readers that mean any contact | `lib/vetVisits.ts:627, 798, 840, 922` (lists, detail), `lib/vetVisitLink.ts:58`, `supabase/functions/report-visit-link/io.ts:34` (same-pet link checks), `lib/vetDocumentDetail.ts:195` | declared *any contact*; unchanged |

The table is where the audit **starts**, not a proof it is complete: PR-03's guard is what makes it complete.

---

## 3. Data model (PR-02, own PR, Migration Safety Pre-flight)

```sql
-- Additive. Number: the next free one at build time (121 is the last on main today;
-- Vet instructions PR-02 also wants a number: whichever lands second takes the next).
ALTER TABLE vet_visits
  ADD COLUMN channel TEXT NOT NULL DEFAULT 'in_clinic'
    CHECK (channel IN ('in_clinic', 'phone', 'text', 'email')),
  ADD COLUMN contacted_at TIMESTAMPTZ;   -- the optional time; NULL = day only
COMMENT ON COLUMN vet_visits.channel IS
  'How the owner heard from the vet (CUL-2749). Only in_clinic is an exam: every reader that means "an exam happened" (the report window, since-the-last-visit, care state visit dates) filters to in_clinic, held by guards/visitReaders.test.ts. Default in_clinic, so every row before this column reads as the visit it was.';

-- The flag seed (mirrors daily_look / vet_instructions_enabled).
INSERT INTO app_config (key, value) VALUES
  ('vet_contacts_enabled', '{"enabled": false, "allowlist": []}'::jsonb)
  ON CONFLICT (key) DO NOTHING;
```

- **RLS:** unchanged (a column on an owned table). The existing same-pet triggers on `medications.vet_visit_id`, `diet_trials.vet_visit_id`, `vet_documents.vet_visit_id` and `care_acknowledgements.vet_visit_id` cover contacts as written.
- **No new table, bucket or secret.** Attachments are `vet_documents` rows with `vet_visit_id` and `document_date` (044).
- **Pre-flight:** rollback `ALTER TABLE vet_visits DROP COLUMN contacted_at, DROP COLUMN channel; DELETE FROM app_config WHERE key = 'vet_contacts_enabled';` · destructive **n** · backfill **N/A** (the default is the truth for every existing row).
- **Deletion and export:** the columns ride `vet_visits`' existing cascade from `pets` and its export scope line.

---

## 4. The proposal (mock round 3.1)

### 4.1 The way in (A1)
Behind `vet_contacts_enabled && useBetaOptIn('vet_contacts')`: the second button reads **Log a visit, call, text or email** and opens the sheet on a past contact, in three places: the card's empty branch, `VetVisitsEmptyState` on the list, and (R10) the non-empty card, under *Open visits*, with or without a booking. Flag off: byte-identical (C-36), so the non-empty card shows no second button.

### 4.2 The sheet (B1–B3)
- **No "Has this visit happened?"** on this path. The booking door (*Add the next visit*) keeps it and keeps clinic only.
- **How did you hear from the vet?** `ChipGroup`: At the clinic · Phone · Text · Email. Default At the clinic. Text's spoken label adds "or clinic app".
- **Day** defaults to **Today**; **Time** optional beside it.
- **What it was about** optional; **Clinic** optional beneath it on a remote contact.
- **Also about** `ChipGroup` of the household's other pets, multi pet homes only; one row per pet.
- Title, Save label and footnote follow the chip:

| Channel | Title | Save | Footnote |
|---|---|---|---|
| At the clinic | A visit that happened | Save {pet}'s visit | Your next vet report starts from this visit. *(shipped, unchanged)* |
| Phone | A call with the vet | Save {pet}'s call | Goes on {pet}'s vet report as a phone call. No exam. |
| Text | Texts from the vet | Save {pet}'s texts | Goes on {pet}'s vet report as texts with the vet. No exam. |
| Email | An email from the vet | Save {pet}'s email | Goes on {pet}'s vet report as an email. No exam. |

Every string passes `nyx-voice`. Never "from today" (the shipped rule).

**Editing a saved contact (R12).** *Edit* shows all four channel chips; the title and footnote follow the chip as they do on a new contact. Changing Phone, Text or Email to At the clinic makes the record an exam, and the reverse makes it a contact; every exam reader filters when it reads (§5.3), so the report window follows the corrected record.

### 4.3 "What did the vet say?" (C1–C3)
The shipped after screen, with a fixed order on a remote contact:
1. **What the vet sent** — the shipped *Paperwork* row, renamed and moved first. Each document is its own row with its `document_date` ("Texts · Nov 9", "Text with the drug name · Nov 10"); *Add more*. The picker is Vet Files' (screenshots multi-select into one grouped document, a file, a photo). EXIF stripped.
2. **The diet trial**, when one is running — first among the plan rows. *Keep* gains **Keep going until {date}**, seeded from the trial's current end, writing `target_duration_days` with `target_duration_vet_directed = true` through the shipped trial path. Hidden when the trial has no target.
3. **The plan** — *Start a medicine or supplement* (renamed on this screen), food and recheck rows as shipped. A course started here carries `vet_visit_id`.
4. **Anything to watch for?** — the Vet instructions row and capture screen, unchanged, opened with the contact as its parent (`vet_instructions.vet_visit_id` = the contact). Source line "from the {Mon d} call | texts | email". Renders only when `vet_instructions_enabled` is on too.

Title: *How did it go?* on a visit (shipped); **What did the vet say?** on a remote contact. *Paperwork* keeps its name on a visit.

### 4.4 The saved moment (C4)
- With **no live warning for the pet and no watched instruction** from this contact: the shipped check and copy, channel-worded ("{pet}'s call is saved").
- With either: **no check mark** (a neutral mark), the date Culprit will ask again when an instruction exists, "Nothing on Home changes because you {called | texted | emailed}.", and the species safety line from the Vet instructions spec. Never "handled", "done", "all set".

"Live warning" = a Signal card at a call or visit rung, or an intake card, in the pet's cached Signal (read only; no new engine read).

### 4.5 Home (E1–E2) — awareness only (R5)
- A live concern, intake or escalation card for the pet keeps its sentence, count, ask and slot **byte for byte**.
- It may gain **one** context line: "You {called | texted | emailed} the vet {today, h:mm | on Ddd, Mon d}." — the care state spec's "You called on" shape (its mock 4b), from the newest remote contact in the card's own window, dated at or after the card's first day.
- **On a card that already carries the shipped "You called on {day}." line** (`calledOnLine`, `lib/vetCallState.ts`; the owner answered the warning with "I've called"), that line is unchanged, and the contact line is added beneath it only when its day or channel differs (R11). A phone contact on the same day adds nothing.
- No care state answer, acknowledgement, follow-up or `vet_calls` row is written by a contact. `care_acknowledgements.source` gains nothing.
- A contact is never an exam to `generate-signal`'s care context (§2: filtered to `in_clinic` in PR-03).

### 4.6 The record (D1–D3)
- **Vet visits list:** one list; each row carries a channel tag (Visit | Phone | Text | Email) and "No exam" on a remote one. Watching (Vet instructions R4) stays above.
- **The contact's page:** subtitle "{Channel} · {Ddd, Mon d} · no exam"; *What your vet asked you to watch* leads (Vet instructions R4); *What the vet sent* with dates; *What the vet started*; footnote "Your vet report shows this {call} and {what it started}. Screenshots stay in Vet Files; share them from there."
- **A course's page:** one source row, "Started after a {call | text | email} with the vet, {Mon d}" or "…a visit, {Mon d}", tapping to the contact.
- **History:** the contact's day shows the shipped date-only visit row (square mark, no time, a door to the record), with its title following the channel: "Phone call | Texts | Email with the vet · {reason} · no exam". A clinic visit keeps "Vet visit"; the shipped "Called the vet" row (`vet_calls`) is unchanged. The day's count stays over logged events only.

### 4.7 The vet report (F1)
- **Window:** unchanged rung 1 = the last `in_clinic` visit strictly before today (R8).
- **A section "Vet contacts in this period"**, listing every visit and contact inside the report's window in date order: `[Phone]` "Consult, no exam. {reason}." with "Started: {course}" and, when documents are linked, "{Texts | Email | Documents} on the owner's phone, not attached." Owner notes print as visit notes do today.
- **A course** started from a contact gains "Started after the {Mon d} phone consult".
- Documents never render (Vet Files D14). Typed instructions never reach the report (Vet instructions R8).

---

## 5. Architecture

### 5.1 Local first
- `lib/localSchema.ts`: `channel TEXT NOT NULL DEFAULT 'in_clinic'`, `contacted_at TEXT` on the local `vet_visits` (an additive local migration in the shipped pattern).
- `lib/sync.ts`: the `vet_visits` push **enumerates columns** — add both, or the remote row keeps its default and the contact becomes an exam on the server (the CUL-1184 class). Hydration maps both back.
- `logVetVisit` takes `channel` and `contactedAt`; `alsoForPetIds` honoured on a past contact.

### 5.2 The flag
`vet_contacts_enabled` in `ALLOWLIST_FLAG_KEYS` / `ALLOWLIST_FLAGS_UNSET` (`lib/appConfig.ts`); a `BETA_REGISTRY` row (`lib/betaFeatures.ts`): owner, `addedDate`, `reviewBy` 90 days out, `serverCost: false`. Flag off: no surface changes and no row is written with another channel. Readers filter regardless (a `phone` row from an allowlisted device must never anchor a window on any device).

### 5.3 The guard (R9's condition)
`guards/visitReaders.test.ts` gains a second rule: every `vet_visits` read under `lib/`, `app/`, `components/`, `store/`, `hooks/` and `supabase/functions/` is registered as **`exam`** (its SQL or query carries `channel = 'in_clinic'` / `.eq('channel', 'in_clinic')`) or **`anyContact`** (with a one-line reason). An unregistered reader reds; an `exam` reader without the filter reds; proven by a planted violation of each (C-18).

---

## 6. Safety

### 6.1 Clinical
- **R5 is a test, not a sentence:** a fixture with a live intake card, then a phone contact the same day → the card's rendered sentence, count, ask and order are identical; one context line is added (AC 9).
- **The report window** cannot move to a contact (AC 6), on device or server.
- **n=1:** a contact asserts nothing about the pet. "No exam" is said, never implied away.

### 6.2 Intake is not preference (Sam)
Nothing started from a contact — a food change, a trial, "try warming the food" in the notes — changes how intake is read or phrased. A diet change started while an intake decline is live never reframes the decline as a taste question (AC 11).

### 6.3 Privacy
No new boundary: attachments are the owner's own files in the shipped private bucket, EXIF stripped, linked by the shipped same-pet trigger. No model reads screenshots, notes or typed instructions (Vet Files D8). Culprit never reads Messages or an inbox. The `rls-privacy-reviewer` probes the new columns only for the cross-pet link (an `Also about` copy linking a document to the other pet's contact).

### 6.4 Pets > $
Contacts, attachments, instructions and the report line are core logging: free forever (`docs/monetization-and-throttling-requirements.md` §3 row 1).

---

## 7. Acceptance criteria

1. **Flag off** (or opt-in off): the Vet visits card, sheet, after screen, saved moment, visit page, History and report are byte-identical to `main` (C-36 differential).
2. The logging door opens on a past contact with no *Has this visit happened?*; the booking door keeps it and shows no channel chips.
3. Saving with Phone writes `channel = 'phone'`, the chosen day, and `contacted_at` only when a time was set; it syncs with both columns (a remote read after push shows `phone`).
4. *Also about Juniper* writes two independent rows; editing one leaves the other unchanged.
5. Every pre-existing `vet_visits` row reads `in_clinic` after the migration.
6. **Window:** with a Sep 18 visit and a Nov 9 phone contact, the report's rung 1 on Nov 14 is Sep 18, on device (`lib/visitWindow.ts`) and server (composer); Rundown's "since the last visit" names Sep 18.
7. A course started from a contact carries its `vet_visit_id`; its page shows the source row; the report shows "Started after the Nov 9 phone consult".
8. A document added from *What the vet sent* is a `vet_documents` row with `vet_visit_id` = the contact and its own `document_date`; it never renders on the report; the report line says "on the owner's phone, not attached".
9. **Awareness only:** a live intake card plus a same-day email contact → the card's sentence, count, ask and Home order are identical (string and index equality); one context line is added; no `care_acknowledgements`, `vet_calls` or follow-up row exists.
10. `generate-signal`'s care context ignores remote contacts (a phone contact yesterday sets no visit date).
11. A diet change started from a contact while an intake decline is live leaves every intake string and count unchanged.
12. The saved moment shows no check mark when the pet has a live warning or this contact has a watched instruction; it never says "handled", "done" or "all set".
13. On a pet with a running trial, the trial row is first among plan rows; *Keep going until Dec 1* moves `target_duration_days` and sets `target_duration_vet_directed`; hidden with no target.
14. *Anything to watch for?* appears on a remote contact only when both flags are on, and writes a `vet_instructions` row whose parent is the contact.
15. The visit-readers guard reds on an unregistered reader and on an `exam` reader without the filter (planted violations).
16. Theme tokens only; `ChipGroup` for the chips; hit areas ≥44pt; `ThemedText`; every surface names the record's pet (C-9); VoiceOver reads the channel tag.
17. **The non-empty card (R10):** flag on, a pet with a visit, with and without a booking, shows the logging button under *Open visits* and it opens the sheet on a past contact; flag off, that card is byte-identical to `main`.
18. **The double line (R11):** a card with a shipped "You called on Nov 13." line plus a phone contact on Nov 13 shows one line; plus an email contact on Nov 14 it shows both; the card's sentence, count, ask and order are identical in each case.
19. **Editing the channel (R12):** editing a Nov 9 contact from Phone to At the clinic moves the report's rung 1 to Nov 9, on device and server; editing it back returns rung 1 to Sep 18.

---

## 8. Out of scope (filed or parked)

- **Share into Culprit** — CUL-2762 (R6).
- **The trial read accounting for a supplement started mid trial** — this feature *shows* the course on the trial; changing the trial's statistics is an engine change for its own issue.
- **A results PDF listed on the report** — a Vet Files D14 question.
- **Contacts on Ask** — Ask reads visits through its own tools; whether it may say "you called the vet on…" is Ask's D2 process.
- **Reading or summarising what the vet sent** — Vet Files Phase 2 (D8).

---

## 9. Run order (the Linear project carries the same table and the build notes)

| PR | What | After | Gate |
|---|---|---|---|
| 01 | Build-ready mock round (the contract) | — | docs |
| 02 | Migration: `channel`, `contacted_at`, the flag seed | PR-01 | plan-gated (migration) |
| 03 | Local mirror, sync, the flag and beta row, the exam filters, the guard | PR-02 | plan-gated (clinical: the window) |
| 04 | The entry and the sheet | PR-03 | routine |
| 05 | "What did the vet say?" and the saved moment | PR-04 | plan-gated (clinical: C4) |
| 06 | The record: list, contact page, course source, History | PR-03 | routine |
| 07 | Home: the awareness line | PR-03 | plan-gated (clinical) |
| 08 | The vet report | PR-03 | plan-gated (report) |

**Forecast: 8 rows.** (The discovery brief said about six; R4 and R5 added PR-05's saved moment and PR-07.)

---

## 10. Persona sign-off at spec

Designer ✓ (one entry, the order on the after screen, no closure on C4) · Dir. of Engineering ✓ (channel field + guard; the push enumerates columns) · Data Scientist ✓ (exam readers filtered; contacts never counted) · Dr. Chen ✓ ("Phone consult, no exam"; the window) · Jordan ✓ (trial first) · Sam ✓ (no false closure; awareness only; Also about) · QA ✓ (AC 1–16) · Trust & Safety ✓ (no new boundary) · Product Owner ✓ (forecast restated at 8).

---

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-14 | First version, from CUL-2749's discovery: rulings R1–R9, the owner review, mock round 3.1. |
| 1.1 | 2026-11-19 | PR-01's build-ready round and its contract critique (CUL-2763): rulings R10–R12; §2 corrected (the shipped logging button renders only for a pet with no visits); §4.1, §4.2 (editing), §4.5 (the double line), §4.6 (History's title); AC 17–19. |
