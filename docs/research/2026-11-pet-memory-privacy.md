# "What Culprit knows about {pet}": privacy evidence for a fact page or a fact store

**Date:** 2026-11-15 · **Status:** frozen point-in-time brief · **Issue:** [CUL-2787](https://linear.app/projectnyx/issue/CUL-2787) · **Method:** read-only audit of the repo at commit `13d6ac194`: all 121 migrations, every `.from()` in `supabase/functions/`, the client write paths for each standing-fact table, the specs named in each section, `docs/legal/`, and the unmerged household sharing draft (v2.0, CUL-1935, session scratchpad). No SQL was run against production. No model was called. · **Lens:** Trust & Safety / Privacy

**Builds on, and does not redo:** the CUL-2753 privacy brief of 2026-11-14 (`2026-11-visit-summary-privacy.md`, session scratchpad; consent shape, injection threat model, its section J red team and fourteen read path requirements) and the CUL-2753 input audit of the same date (`2026-11-visit-summary-input-audit.md`; what Signals, Ask and the report read). Where this brief repeats one of their facts it was re-checked at this commit.

**Tags:** [E] evidenced by file and line. [A] this lens's inference. [not verified] could not be confirmed from the repository. This is evidence only. It makes no product recommendation. Section H is questions. Nothing here is legal advice.

**The two shapes under comparison.** Shape V is a view: a page composed on the phone from rows that already exist, with at most a small nullable origin marker on rows an AI proposal started. Shape S is a store: a new table of facts that engines and the model read, possibly with AI-proposed rows in a pending state.

---

## A. What persists today that a model wrote

### A.1 Inventory

| Where | What the model wrote | Who writes the row | RLS | Deletion |
|---|---|---|---|---|
| `event_ai_analysis` (migration 013:145-200) | `ai_raw_payload` (the raw tool payload), `ai_confidence`, the structured fields, `description`, `recommendation`, `read_text`, `visual_flags`; later `model_id` (075:172) | Service role, in `_shared/incident-analysis.ts` (the `adminClient` writes at :1629, :2078, :2088, :2368) [E] | `event_ai_analysis_owner`, `FOR ALL`, keyed on the pet's owner (013:222). The owner may edit structured fields and dismiss the read. Stamp columns are frozen by trigger (075:240). [E] | Cascades from `events` and from `pets` (013:150, :154). `dismissed_at` is a reversible hide (013:192). The parent event soft-deletes, so the read stays at rest under a deleted event. [E] |
| `ai_signals` (005:8-16; later `findings`, `summary`, `coverage`) | One phrased sentence per finding and the Home summary, when phrasing is on. Templates otherwise. | The caller's own JWT client, not the service role (`generate-signal/index.ts:623`, write at :983-984). The policy is `FOR ALL`, so a client can also write its own pet's row. [E] | `ai_signals_owner`, `FOR ALL` (005:26) [E] | Hard-deleted and replaced on every regeneration (`index.ts:983`). 24 hour expiry by default (005:15). Cascades from `pets`. [E] |
| `signal_shown_log` (075:412) | Not text. Identity, tier and a hash of the text. | Service role (`index.ts:1011-1015`) | Read own, column-granted insert (075:448-471) | Append-only. Cascades from `pets` (075:59). [E] |
| `vet_reports.ai_lead_text`, `ai_lead_verdict`, `ai_lead_model` (113:232-234) | The report's AI summary, the checker's verdict, the model id | Service role (`generate-report/aiLead/run.ts:39`, :58). Client writes of these columns are refused by trigger (118:200-239). [E] | Select and update for the owner; every column frozen for client callers (110:143-219, 118:312) [E] | A draft's lead is nulled when the owner says no to either consent scope (118:147-165). Drafts are reaped by `reap-report-drafts`. A kept copy is frozen with its snapshot and lead. Cascades from `pets`. [E] |
| `food_items` extraction columns (007:22-32) | Brand, product, ingredients, proteins, format, `ai_extraction_confidence`, `ai_extraction_status`, `ai_extraction_error` | Service role, with an owner predicate on every write (`extract-food-from-photo/index.ts:756-776`, :793) [E] | Per account (migration 033) | Hard delete by the owner's policy; archive is the app's path (035). Cascades from `auth.users`. [E] |
| `medication_items` extraction columns (020:128-130) | Drug name and dose details from a label photo | The client. `extract-medication-from-photo` returns the extraction and writes no row (`index.ts:522`; no `.from('medication_items')` in the file). [E] | Per account (020:262-266) | Owner delete policy (020:265). On account deletion the row survives with attribution nulled and its label photo is purged (`delete-account/index.ts:8-11`). [E] |
| `event_ai_analysis.may_wait` and tier columns (079, 087) | Code-computed from the read plus context, not free model text | Service role | As above | As above |

Not found: any table holding a prompt, a conversation, a model "memory", or a model-written fact about a pet outside these. [E: the `.from()` sweep of `supabase/functions/`, non-test files]

### A.2 What every existing model-written row has in common

Each one is attached to a single source the owner made: one event, one photo, one food label, one report draft, or one day's findings. None is a standing statement about the pet. `ai_signals` is the closest, and it is replaced whole on each run. [A]

Two existing behaviours bear on a pending proposal state. First, withdrawal of consent already reaches stored model output in one place: draft report summaries are cleared by trigger (118:147-165), while photo reads stay ("Reads that already ran stay on their records.", `constants/aiConsentCopy.ts:200`). Second, the raw model payload is kept for photo reads (`ai_raw_payload`, 013:167-170). The CUL-2753 brief's position for the visit summary was the opposite: never store the raw response. [E]

### A.3 Ask: the rule, and what the code does

The rule text, with its dates:

- D8 (PM, 2026-07-18, v2.2): the conversation "is held in **ephemeral in-memory client state** (Zustand)" and "No durable transcript is persisted". `docs/nyx-ask-requirements.md:52` [E]
- §6.5 (ratified 2026-07-18, v2.1): "Nothing new is persisted (§10; the one write is §6.2's read-cache write through the shipped path)." `:153` [E]
- §10: "**No new persistence in v1**", then "no transcripts, no query log, no memories", and "Future telemetry/query log = its own T&S-gated decision". `:219` [E]
- §6.1 (same date): "The question picks the events; the tools return those events' data", "never a bulk serialization of the record." `:138` [E]

What it protected, as written: a conversation holds the owner's question and the model's words about the pet. Keeping neither means deletion, export and a breach have nothing to reach. §6.1 protects against the record crossing wholesale. [A]

Code check at this commit:

| Question | Finding |
|---|---|
| Does `supabase/functions/ask/` write any table? | No. No `.insert(`, `.upsert(`, `.update(` or `.delete(` in any non-test file of the directory. [E] |
| What does it persist? | One call: `record_ai_usage` (`index.ts:195`), which increments a count in `ai_usage`. That table holds a user id, a function key, a UTC day, a scope id and a count, and no text (031:60-68). [E] |
| The §6.2 exception | A live photo read invokes `analyze-vomit` or `analyze-stool` with the caller's JWT (`index.ts:617`). That function writes `event_ai_analysis` through the shipped path. [E] |
| Logs | Sixteen `console.*` calls. They carry error messages, HTTP status, a validator reason code (`:451`), a pet id (`:1026`, `:1072`) and an event id (`:622`, `:625`). No call logs the question, a note or the answer text. [E] Whether an upstream error message can embed request content was not tested. [not verified] Function logs sit outside the deletion cascade. [A] |
| The client | `store/askStore.ts:16` states that no durable transcript is persisted. No `persist`, `AsyncStorage` or SQLite call in `store/askStore.ts` or `lib/ask.ts` writes a turn. [E] |
| Is Ask live? | No. `ask_enabled` is seeded off with an empty allowlist (037:55); `docs/app-privacy-answers.md:154` records it as off for everyone. The live value was not re-read. [not verified] |

Verdict: the code matches the rule. A fact store, or a pending proposal row, would be the first persisted model statement about a pet that is not tied to one photo, one label or one report draft. [A]

---

## B. The rules a persisted fact class touches

| Rule | Date | Text | What it protected | Touches |
|---|---|---|---|---|
| Ask no persistence | 2026-07-18 | §A.3 above | Nothing of a conversation at rest | A "memory" that Ask reads or writes. §10 names "no memories" for v1 and gates any future log behind its own decision. |
| Vet Files D7 | 2026-07-26 (spec v1.0) | "uploading a document never creates, dates, or re-dates a `vet_visits` row", "A document may *link* to an existing visit; it may never *mint* one." `docs/nyx-vet-files-requirements.md:21` | The report's window starts at a visit date. A minted visit moves the report. | Any fact whose source is a document. Shape S `source_ref` to a document must not create or date a visit. |
| Vet Files D8 | same | Phase 2 (AI over the corpus) "Requires a **D2-class PM ruling with T&S at the table** before any build". `:22` | No AI read of clinic-authored documents without a ruling | A fact proposed from a document |
| Vet Files §7 | same | The five mechanisms end with "**nothing new persisted**" (`:163`). "OCR'd document text is third-party-authored content" (`:164`). "Extraction never silently mints records", "no auto-created visits, medications, weights, or conditions. AI-proposed, owner-confirmed only" (`:165`). | A model never becomes a silent author of the record | A pending proposal row is new persistence under item 1 and is the owner-confirmed lane of item 3. Both apply at once. |
| Vet Files D10 | same | "any future AI read is an annotation linked back to it, never a replacement". `:24` | The original stays primary | Provenance lines |
| Vet Visits G6 | 2026-09-10, amended 2026-10-04 and 2026-10-05 | "**Deterministic first.**" The summary and phrased questions "are v2 behind a D2-class ruling". `docs/nyx-vet-visits-requirements.md:21` | No model over a visit without a ruling | CUL-2753's summary, and any fact drawn from visit notes |
| Vet Visits AC 10 | 2026-09-10, amended 2026-09-28 | "visits never appear in any count, coverage line, Patterns panel or engine input" (`:316`). The amendment lets the Signal shell read dates and owner answers by column list, and "Notes, reasons, clinic and vet names never leave the vet tables for an engine." (`:317`) | One population, one count (CUL-746). Free text stays out of engines. | Shape S is a second place visit-derived text could live. `guards/visitReaders.test.ts` scans five tables by name (`:400`); a new table is outside its scan until added. [E] |
| Vet Visits §6.2 | 2026-09-10 | Typed notes "are the owner's own words" and "**soft-delete** like every other record". A transcript "is a **verbatim capture of a third party's speech** and **hard-deletes**". "The line is verbatim capture". "Flagged for the Dir. of Engineering as the second documented exception to the soft-delete rule." `:281` | Reversible deletes for the owner's words; real erasure for other people's words | A fact row that quotes a vet's words or a document sits on the verbatim side of this line. A fact in the owner's words sits on the other. One table could hold both. |
| Care state §3.4 | spec v1.6, 2026-11-08; ruling 2026-09-28 | The vet report and every off-device share show "dated facts only" and never "a care state, a tier, a tap, a call answer or a note". `docs/nyx-care-state-requirements.md:147` | The owner's "my vet knows" answers and call notes stay on the device and server; a vet never reads them as findings | "My vet knows" answers on a page that can be copied, shared or printed. §8.4 adds "No model reads any of it." (`:384`) |
| Care record note | 2026-09-30 (migration 082) | `vet_calls.note` is "OWNER-ONLY: no model reads it and no Edge Function selects it" (082 column comment; guard allow-set empty, 082:137-141) | The owner's private words about a call | A fact page listing call notes; a model reading them |
| Soft deletes only on events | CLAUDE.md, engineering hard constraints | "Soft deletes only on events (`deleted_at`, never `DELETE`)." | A delete can be undone; a report window can move back | See B.1 |

### B.1 Recorded departures from soft delete

The constraint names events. These are the places the repo hard-deletes or cannot delete at all, each recorded where it was made:

1. Account deletion hard-deletes everything (resolved 2026-06-19, `docs/decisions-archive.md:43`; `delete-account/index.ts:5-7`). [E]
2. A future visit transcript hard-deletes on request (Vet Visits §6.2, called there "the second documented exception"). Which exception it counts as the first is not stated in that file. [not verified]
3. `food_items`: the owner's policy grants a hard delete; stale pending rows are reaped (`lib/sync.ts:2400-2420`, "NOT the events-only soft-delete rule"). [E]
4. Event photos: removing one deletes the `event_attachments` row (`lib/attachments.ts:71`, :216). [E]
5. `ai_signals`: replaced by delete then insert (`generate-signal/index.ts:983`). [E]
6. Report drafts: reaped; kept copies frozen (113, 118). [E]
7. The care record cannot be deleted or updated by any role, the service role included. Only the cascade removes it. A correction is a new row (082:33-41, :449-451). [E]
8. `pets`: no client delete since migration 116 (:198). A pet leaves only with its account. Archive is `is_active`. [E]

Tables created since migration 044 with a `deleted_at` use a three-verb policy with no DELETE (044:261-264, 066:219-225). Older standing-fact tables keep `FOR ALL` (see D.2). [E]

---

## C. Consent

### C.1 How it works today

- One table, `ai_consent`, one row per account and scope. `scope` admits only `'ai_boundary'` (migration 100:86-94). A second scope, `report_summary`, was added by migration 112 for the report's AI summary. [E]
- The scope was ruled wide: "A 'no' closes every Anthropic call: photos, the Signal's phrasing", "Ask, and later looks and notes." (100:32-34, PM ruling D10 of 2026-10-11) [E]
- Absence is never a yes. A decline is a row (100:27-30). History is kept in `ai_consent_events`, which no client or service role can write (100:290-295). [E]
- The server reads consent through the service role, keyed on the JWT-verified caller, and fails closed (`_shared/aiConsent.ts:11-17`, :44-62). The file notes that once households exist "the pet's owner's answer joins this" (`:22-23`). [E]
- CUL-1836 lifted the six deploy holds, so the server enforces each owner's answer (CLAUDE.md, At a glance). [E]
- Copy version on every row: `AI_CONSENT_COPY_VERSION = '2026-10-12'` (`lib/aiConsent.ts:33`). [E]

### C.2 What the owner was told is sent (quoted)

| Surface | Words | Where |
|---|---|---|
| Label door | "To do this, Culprit sends these photos to" Anthropic. "It also sends {pet}'s name with the patterns Culprit spots, so Home can describe them in a sentence." | `constants/aiConsentCopy.ts:86-87` |
| Ask door | "Culprit sends your question and the parts of {pet}'s record it needs" | `:71` |
| What's sent, patterns row | "{Pet}'s name with the symptom, food and counts in a pattern. Your full log and your photos are never sent for this." | `:135-136` |
| What's sent, Ask row | "Your question and the parts of {pet}'s record it needs." | `:139-140` |
| What's sent, labels row | "A prescription label can show your name, your clinic and an Rx number." | `:132` |
| Settings sublabel | "Photos, labels and patterns" | `:156` |
| Policy §3, pattern phrasing | "it sends Anthropic only the computed, structured finding (for example, event counts and the food or time window involved). Your raw log history and your photos are never sent for this purpose." | `docs/legal/privacy-policy.md:63` |
| Policy §3, report summary | Sends "your pet's name and species, the report's dates, its findings with their counts and dates, including the names of the foods and medicines involved, and any diet trial line". "Your notes, the questions you add for your vet, your name, your vet's or clinic's details, and your photos are never sent for this" purpose. | `:65` |

Policy §3 names four AI flows plus the report summary. It does not name Ask (`docs/app-privacy-answers.md:155`). [E]

### C.3 Which standing-fact fields already reach a model

| Field | Signal phrasing | Ask (dark) | Report AI lead (flagged, second scope) |
|---|---|---|---|
| Pet name | Yes (`phrasing.ts:1109`, every payload) | Yes [A, from the door copy] | Yes (`aiLead/facts.ts:189`) |
| Species | Intake decline only (`phrasing.ts:1308`) | Yes (`index.ts:1004` reads it) | Yes (`facts.ts:190`) |
| Weight | Two readings in pounds on a weight loss finding (`phrasing.ts:1281-1282`) | Read (`index.ts:710`) | Only as text of a printed line |
| Trial | Day number and target length (`:1251-1252`). Not the indication, the protein or the vet's name: none appears in `phrasing.ts` or `summary.ts`. | Dates and status (`index.ts:766`) | The trial line and trial reading sentences as printed (`facts.ts:156-176`) |
| Medicines | None in the phrasing or summary payload | `drug_name`, `dose_amount`, status, dates (`index.ts:722-724`) | Names inside printed lines; the gate's header says food, medicine and trial protein names "do go in, by design" (`_shared/reportSummaryGate.ts:41-43`) |
| Foods and proteins | Protein names; a refused food's label (`:1111`, :1310) | Brand, product, protein | Names inside printed lines |
| Conditions | Not read by `generate-signal` at all | Not read by `ask` at all | Read by the report (`generate-report/index.ts:1594`) and printed on the masthead (`documentV2.ts:444-448`). The masthead is not part of the lead payload, whose keys are band, record lines, trial line and record edge (`facts.ts:36-45`). [E] |
| Visit notes, reason, clinic, vet name | Never. The shell reads `visited_at` only (`index.ts:1073-1076`) | Never (`guards/visitReaders.test.ts` pins `ask/index.ts` clean) | Never. `vet_name`, `clinic_name`, `notes`, `questions` are in `OWNER_WORDS_KEYS`, which can never join the allowlist (`reportSummaryGate.ts:319-324`) |
| "My vet knows" answers | Read by the shell behind a flag (`index.ts:1185`), used in code. No acknowledgement field appears in `phrasingPayload`. The care state sentence is composed in code. [E] Whether a composed state sentence can enter the summary's draft sentences was not traced end to end. [not verified] | Ask may relay "the cached finding text, with its state sentence" (care state §3.4) | Never (care state §3.4) |
| Vet call notes | Never (guard, allow-set empty) | Never | Never |
| Event notes | Never | Yes, event-scoped (`index.ts:686`, Ask §6.3) | Never (`facts.ts:5-9`) |
| Vet instructions text | No table exists yet. `vet_instructions` appears only in `docs/nyx-vet-contacts-requirements.md`. | same | same |
| Sensitivities | No table or column for sensitivities or allergies exists in any migration. [E] | same | same |

The input audit adds that the Signal's visit, acknowledgement and weight reads are behind flags that were off for all but one account on 2026-11-14. [E: input audit §1]

### C.4 Would the current words cover sending these to a model?

| Data | Switch (`ai_boundary`) | Shipped words |
|---|---|---|
| Conditions | Would block on a no [E: D10] | Not covered by the label door or the patterns row ("the symptom, food and counts in a pattern"). Covered only by the Ask door's "the parts of {pet}'s record it needs", which a label-door owner never read, and only for Ask. [A] |
| Vet instructions text | Would block | Not covered. No sentence names a vet's instructions. The report paragraph says clinic details are never sent for that purpose (`privacy-policy.md:65`). [A] |
| Sensitivities | Would block | Same position as conditions. [A] |
| "My vet knows" answers | Would block | Not covered, and care state §8.4 says no model reads the care record. [E] |
| Medicines and the trial | Would block | Partly: named for the report summary under its own scope; named for Ask by the general phrase; not named for pattern phrasing. [A] |

The CUL-2753 brief reached the same finding for visit notes and documents: "The switch covers this; the words do not." [E: that brief §1, §A.2]

### C.5 Shape V with no model

A page composed on the phone from the owner's own rows sends nothing to Anthropic, so `ai_boundary` is not engaged and Apple 5.1.2(i) (third-party AI sharing) is not engaged. [A] Three edges remain. If the page shows a model-written item (a photo read's description, a phrased Signal sentence), it shows output the owner already consented to produce; nothing new is sent. If the page offers copy, share or print, the care state §3.4 off-device rule applies to any care answer on it. If a row carries an origin marker saying an AI proposal started it, that marker exists only because a model call happened earlier, under that call's own consent. [A]

---

## D. Deletion

### D.1 Account deletion and pet deletion

- Account: `delete-account` purges Storage, then deletes the `auth.users` row, "which fires the existing `ON DELETE CASCADE` FK graph", "so there is NO table-by-table delete loop" (`delete-account/index.ts:5-8`). Order: collect paths, purge, delete the user last, then sweep owned folders (`:42-48`). [E]
- Pet: there is no pet deletion. Clients lost DELETE on `pets` in migration 116 (:198); archive sets `is_active`. An archived pet's facts stay at rest and readable by its owner. [E]
- Every standing-fact table below carries `pet_id ... REFERENCES pets(id) ON DELETE CASCADE`, so all are hard-deleted with the account. [E: 001:39, 001:149, 001:167, 018:62, 020:155, 024:72, 040:158, 066:161, 082:184, 082:228, 082:259]
- On the device: `wipeLocalSession` (`lib/session.ts:197`) deletes every table in `LOCAL_WIPE_TABLES`; `lib/hydration.test.ts:458-470` fails when a local table is in neither that list nor the named exceptions. [E]

### D.2 Per-row "remove" today, and what a server reader still sees

All three engines read these tables with the caller's JWT, so RLS scopes them. The service role is used for consent, Storage, usage and model-output writes (`generate-signal/index.ts:586-591`; `generate-report/index.ts:2047-2062`; `ask/index.ts:987`). The exception is `report-visit-link`, which reads visits and appointments as the service role with explicit owner, pet and `deleted_at` predicates (`io.ts:14`, :34-41, :44-51). [E]

| Table | `deleted_at`? | Client policy | What "remove" does in the app today | Server readers and their filter |
|---|---|---|---|---|
| `conditions` | No (001:37-46) | `FOR ALL` (001:221); hard delete is permitted, no app path uses it | "Resolve" sets `status = 'resolved'` (`app/(tabs)/profile.tsx:1017-1024`). The profile hides resolved rows (`:653`). No delete control. `notes` exists and the app's add and edit payload never writes it (`components/profile/AddConditionModal.tsx:128-132`). Online only; no local mirror. | Report only (`generate-report/index.ts:1594-1597`): no status filter in the query; the masthead filters `status === 'active'` in code (`documentV2.ts:445`). A resolved condition is still pulled. [E] |
| `medications` | No ("a regimen is 'ended', not soft-deleted", `index.ts:1560`) | `FOR ALL` (020:269) | End the course: `status` and `ended_at`. No delete. | Signal (`generate-signal/index.ts:762-767`, :1229), Ask (`ask/index.ts:722-727`), report (`generate-report/index.ts:1564-1576`). None can filter deleted rows, because the table has no such state. An ended course is read on purpose as a historical confounder. [E] |
| `diet_trials` | No (001:147-158) | `FOR ALL` (001:226) | Status lifecycle (completed, abandoned), `ended_at`. No delete. | Signal filters `status = 'active'` (`:729-733`); Ask the same (`:766`); the report reads every trial (`:1328-1355`). [E] |
| `diet_trial_foods` | Yes (040:164) | `FOR ALL` with a write check (040:273-280); 041 records the hard delete grant as debt | Removing a food sets `deleted_at` (`lib/dietTrialMirror.ts:415-420`) | Report filters in the embed (`:1350`). Signal and Ask do not read the table. [E] |
| `weight_checks` | No; deletedness rides the parent event (024:69-76) | `FOR ALL` (024:98) | Soft delete of the parent event | Signal filters `events.deleted_at` (`:1150-1151`); Ask the same (`:713`); the report selects `deleted_at` and drops deleted rows in code (`:1536`, mapping at :686-775). [E] |
| `vet_visits` | Yes, since 066:264 | `FOR ALL` (001:231) | `deleted_at` | Signal filters (`:1076`); report filters (`:1314`); `report-visit-link` filters (`io.ts:38`). Ask does not read it. [E] |
| `vet_appointments` | Yes, plus `cancelled_at` (066:177-179) | Select, insert, update; no DELETE (066:237-256) | `deleted_at` | Signal selects `deleted_at` and `cancelled_at` with no filter and refuses such rows in the rule (`:1204-1206`, comment at :1175). `report-visit-link` filters both. [E] |
| `care_acknowledgements` | No; append-only; `retracts` is the correction (082:182-205) | Select and column-granted insert only (082:415-420, :461-463) | A retraction is a new row | Signal reads every row, retractions included, and resolves them in code (`:1185-1191`). Nothing is ever removed short of the cascade. [E] |
| `vet_calls`, `vet_call_follow_ups` | No; append-only; `withdrawn` and `supersedes` (082:226-240) | Select and column-granted insert only | Undo is a new withdrawn row. An edited note is a new row; the earlier note stays at rest. | No function reads either table (input audit, unread sources). [E] |
| `feeding_arrangements` | Yes (018, `deleted_at`), plus `ended_at` (076) | `FOR ALL` (018:117) | `deleted_at` | Signal (`:745`), Ask (`:754`), report (`:1589`), `analyze-vomit` (`:852`). All four filter `deleted_at IS NULL`. [E] |
| `pets` columns | No | Select, insert, update (116:187-196) | Edit in place; archive | All three read by id under RLS |

Findings a reviewer may weigh. No server reader of a standing-fact table was found that reads soft-deleted rows as live. Three tables have no removed state at all (`conditions`, `medications`, `diet_trials`), so "remove a fact" on them today means resolve, end or abandon, and the row stays readable by every reader. Three more cannot be removed by anyone short of account deletion (the care record). One aside outside the standing-fact set: Ask's cached-read pull selects `event_ai_analysis` by pet with no join to the parent event's `deleted_at` (`ask/index.ts:757-763`); whether a read under a deleted event can reach an answer depends on the event list it is matched against, which was not traced. [not verified]

One more place a removed fact stays: a kept vet report copy is frozen with its snapshot, which includes the conditions and trial lines printed that day (113; `report.ts:7044-7048`). Removing the fact later does not change the copy. [E]

### D.3 What a new table would have to add

No single guard listing every table against the cascade was found. Coverage is by construction (the FK) plus per-feature guards. The pieces a new pet-scoped table has needed in recent migrations:

1. `pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE`, with every other FK set to cascade or null so no parent delete is blocked. `guards/careRecord.test.ts:354-381` asserts exactly this for its three tables, and that no DELETE trigger exists, because one "would abort account deletion". [E]
2. A local mirror, if any, in `LOCAL_WIPE_TABLES` (`lib/hydration.test.ts:458-470`). [E]
3. Any bucket in `STORAGE_BUCKETS` (`delete-account/plan.ts:54-62`) with owned-id path scoping. A table with no bytes needs none. [E]
4. A row in `guards/visitReaders.test.ts` if the table can hold visit-derived content (`:400` lists the scanned tables by name). [E]
5. The export scope line, which is prose only today (section E). [E]
6. Policy §6 and §7 name what is kept and erased (`docs/legal/privacy-policy.md:85-99`). [E]

Shape V adds no table. Its origin marker is a column on existing tables, each already in the cascade. [A]

---

## E. Export

- No export exists. `supabase/functions/` has no export function, and no client screen offers one. [E: directory listing; grep of `app/`, `components/`, `lib/`, `store/`]
- It is owed and tracked as B-041 ("User data export (GDPR Art. 20)", `docs/app-store-readiness.md:86`) and classed free forever (`docs/monetization-and-throttling-requirements.md:51`). [E]
- The policy offers export by email and says a self-serve export is planned (`docs/legal/privacy-policy.md:109`). [E]
- Specs carry scope lines as prose: vet visits ("doc-only today", `docs/nyx-vet-visits-requirements.md:278`), the care record (082:149-150), Vet Files (`docs/nyx-vet-files-requirements.md:155`). [E]
- What the report already exports by another route: conditions (masthead), courses, trials including "Trial directed by {vet name}" in the v1 renderer (`generate-report/render.ts:3450`, :3958), weights. The report is the only off-device path for standing facts today. [E]

What each shape would add to an export's scope. Shape V: nothing new at rest except the origin marker per row; the page is a rendering of rows already in scope. Shape S: the fact table itself, including pending, dismissed and removed rows if they are kept, plus each row's provenance fields. The CUL-2753 brief framed the owner's question as "what did the AI write about my pet"; a pending-proposal table is the direct answer to it. [A]

---

## F. Household sharing (unmerged v2.0 draft, CUL-1935)

The draft is discovery output. Nothing in it is ruled. Its relevant text: partners get "read, insert and update on the record's tables" and on `pets` "members read only" (H2). A partner may "never edit the pet's profile" (§3.1). "A partner can start, end and extend a trial and add or change a medicine. Each change is an append-only act, dated and named" (H7). Author is stamped on "events, photos, the care record", "intake answers, Noticed's looks", "visits and appointments" (RC1). "The free-text note on a vet call stays visible to its author only; the call, its time and its answers are shared." (H13). "An edit or soft delete stamps its author; the owner can restore a soft delete a partner made." (H14). "Hard delete stays the owner's" except a partner's own event photo (H2, §0.3). Consent: "a photo or free text goes only with a yes from the owner, the person sending it and the person who wrote it" (D8, recommended). "AI consent answers, author-only notes" "never pool" (G7).

| Fact class | Would a partner see it? | Edit it? | Remove it? | Author's private words? |
|---|---|---|---|---|
| Conditions | Yes, if `conditions` counts as a record table | Unclear. Conditions are edited on the profile screen, and the draft bars a partner from the pet's profile, but they live in their own table. The draft does not name the table. | Unclear; and "resolve" is an update, not a soft delete, so H14's restore does not describe it | `condition_name` is free text. `notes` is unwritten today. |
| Medicines | Yes | Yes (H7) | End a course, yes (H7). No delete exists. | `prescribed_by`, `indication`, `schedule_notes`, `notes` |
| Trial and its foods | Yes | Yes: start, end, extend (H7); library references must be the owner's rows (H6) | End, yes; "an early end is undoable to the same trial" | `vet_name`, `notes`, `outcome_notes` |
| Weight | Yes | Yes (H10 moves the snapshot into a trigger) | Soft delete through the event; author stamped | `weight_checks.notes` |
| Vet visits and appointments | Yes (RC1 names them) | Yes | Soft delete, restorable by the owner (H14) | `notes`, `reason`, `questions`, `notes_draft`. The draft does not make visit notes author-only. |
| "My vet knows" answers | Yes ("the call, its time and its answers are shared"; the care record is in RC1) | Append-only for everyone | A retraction row; the draft does not say whether one person may retract another's answer | None; structured |
| Vet calls | The call and its answers, yes. The note, author only (H13). | Append-only | Undo row | **Yes: `vet_calls.note`** |
| Feeding arrangements | Yes, by H6's reference rule | Not named in H7 or RC1 | `deleted_at` exists; authorship not named | `notes` |
| Vet instructions (coming) | Not in the draft; the table did not exist when it was written | n/a | n/a | Free text of a vet's words |

Other reach, from the draft. The card carries "what the pet can eat, what not to give, how to give each medicine, who to call" to anyone, with no account (§3.1). The sitter link shows "the rules", "the owner's instructions and numbers", today's care, "no names" (§3.1, SL6), and writes only from a fixed set (SL7). "Keep a copy" renames people to roles and "author-only items never copy" (EA4). A partner who deletes their account "leaves their entries on the pet's record, unattributed", and their author-only notes are erased through a new path in the append-only rule (H11).

Questions a fact page raises that the draft does not answer:

1. Who "said" a fact when two people can write? RC1 stamps who recorded a row. A provenance line also wants who stated it (the vet, per the owner; the vet, per the partner). These are different columns.
2. RC1's list does not name `conditions`, `medications`, `diet_trials` or `feeding_arrangements`. H7 calls care plan changes "dated and named". Is authorship on those tables a stamp on the row or a separate act log?
3. Can a partner remove a fact the owner entered? For tables with no removed state, what would the owner restore?
4. Does a provenance line show a name ("Alex added this"), a role, or nothing? D7 puts names in the app and roles on the report, and bars names from the off-diet list.
5. Does an author-only vet call note appear on the page for its author and vanish for everyone else, and does the page say something is hidden?
6. If any part of the page or store is model-read, whose yes governs: the owner's, the viewer's, and the author of each free-text fact (D8's three-way rule)? CP1 says Ask "excludes text whose author has not said yes".
7. Does a sitter link or the card ever render facts from this page (conditions, instructions)? Both leave the account boundary with no login.
8. For Shape S: is a pending proposal visible to a partner, and can a partner confirm a proposal built from the owner's notes?
9. After a partner leaves and becomes a role, what does a provenance line that named them say?

---

## G. Free text and third parties

| Field | Can carry a clinic's or vet's name or words? | Leaves the device today? | Reaches a model today? |
|---|---|---|---|
| `conditions.condition_name` | A diagnosis as the vet named it | Synced; printed on the report masthead | No |
| `conditions.notes` | Yes; unwritten by the app | Synced if written | No |
| `medications.prescribed_by` | A vet's or clinic's name | Synced; selected by the report and not consumed (input audit §1.5) | No. `drug_name` and `dose_amount` reach Ask. |
| `medications.indication`, `schedule_notes`, `notes` | A vet's instructions in the owner's words | Synced; the report selects the first two | Not by column. A printed course line can enter the report lead. |
| `diet_trials.vet_name` | A vet's name | Synced; printed by the v1 report ("Trial directed by") | No; blocked from the lead by key |
| `diet_trials.notes`, `outcome_notes`, `stopped_reason` | Yes | Synced; the report selects `outcome_notes` and `stopped_reason` | Not found in any model payload |
| `diet_trials.target_protein` | "the word the vet named" (053 column comment) | Synced | Report lead, as a name inside a printed line |
| `vet_visits.clinic_name`, `vet_name`, `reason` | Yes | Synced; selected by the report and printed nowhere (input audit) | No |
| `vet_visits.notes` | Yes, and may quote the vet | Synced | No. CUL-2753 proposes it. |
| `vet_appointments.clinic_name`, `vet_name`, `reason`, `questions`, `notes_draft` | Yes | Synced | No |
| `vet_calls.note` | The owner's account of what a clinic said | Synced; owner-only | No, by guard |
| `weight_checks.notes`, `feeding_arrangements.notes` | Possible | Synced | No |
| `pets.name`, `breed`, `microchip_number` | No third party; the name is owner-typed | Synced; name and breed print on the report | Name and species, yes |
| `vet_instructions` text (coming) | By definition a vet's words, as the owner captured them | n/a | n/a |
| Vet documents and their `notes` | Clinic-authored | Stored in a private bucket [not verified: bucket privacy is a dashboard setting] | No |

The CUL-2753 brief found names in free text cannot be reliably masked and that only columns can be withheld (its §B.1). The same holds for any fact text. [E: that brief]

---

## H. Attack surface notes (questions for the red team; not resolved here)

### Shape S (a store)

1. Who may insert a pending row? If the client may, what stops a client writing a row that claims a model or a document as its source? If only the service role may, which function, and does it re-derive the pet from the source row?
2. Can a client forge "confirmed"? The repo's two patterns are column grants that leave a column out (082:461-467 leaves out `created_at`; 100:287-288 leaves out `decided_at`) and a trigger that overwrites what arrived (100, `stamp_ai_consent_decided_at`). Which columns of a fact row are the owner's to set (`status`, `confirmed_at`, `stated_by`, `source`), and which must be the server's?
3. Can `source`, `source_ref` or `stated_by` be edited after insert? A "vet said" label on an owner-typed row is the forgery that matters to a reader.
4. Can a proposal outlive its source? Visits soft-delete, so `ON DELETE CASCADE` from `vet_visits` never fires on an app delete (CUL-2753 brief J.1 item 3). Documents soft-delete too. What removes the row, and its quote, when the source is removed or its text edited?
5. The same-pet pattern. Migration 109 (and 108, 082) checks in a `BEFORE` trigger that every linked parent belongs to the row's own `pet_id`, with a caller arm so another account gets one error code whatever it names (109:33-40; 082:73-100). Does every link a fact row carries (visit, document, appointment, trial, course, another fact) get that check, including a polymorphic `source_ref` that no FK can express?
6. C-38: what else can move? A parent's `pet_id`, a fact's own `pet_id`, a `kind` change that turns a note into a condition.
7. Column grants and verbs. Three-verb policy with no DELETE (044, 066), or append-only (082)? Does the service role keep UPDATE and DELETE?
8. Is `anon` revoked on the table, as 108 and 109 did for theirs?
9. Row-id existence: 082 records a platform-generic oracle on primary key reuse. Does a fact table with client-chosen ids repeat it?
10. Readers. Which functions may select the table, and is that pinned by a guard with a must-stay-clean list for `detection.ts`, `phrasing.ts`, `ask/` and `generate-report/`? Can a pending row ever be read by an engine or printed on a report or a kept copy?
11. If text sits in the store and a model reads the store, is each row's text delimited as untrusted input, and can one fact's text instruct the model about another?
12. Consent withdrawal: does a no clear pending rows (the 118 draft precedent) or leave them (the photo read precedent)?
13. Does a removed fact stay at rest (`deleted_at`, `status`) and so stay readable by any function that forgets the filter? D.2 shows three tables where readers filter in code, not in the query.
14. Under household sharing, whose rows may a partner confirm, edit or remove, and is the actor stamped by the server?

### Shape V (a view)

1. Can the origin marker be client-forged? The tables it would sit on (`medications`, `diet_trials`, `conditions`, `weight_checks`) are `FOR ALL` to the owner, so absent a grant or trigger the owner's client can set or clear it.
2. Does that matter? It is the owner's own record and the reader is the owner. It starts to matter if the marker is read by an engine, printed on the report, used to find rows after a model fault, or shown to a partner as "the AI proposed this".
3. Can the marker be cleared by an ordinary edit or a last-write-wins sync of an older row?
4. `weight_checks.source` and `source_basis` already exist as client-written provenance (081:143-149). Is there a precedent there for how much the server trusts them?
5. The page composes on the phone from the local mirror. `conditions` has no local mirror. Does the page add a new online read, and what does it show offline?
6. Does the page select `vet_calls.note`, and does that put the note on a surface with copy, share or print?
7. Removing a fact from the page is the row's existing write. For `conditions`, `medications` and `diet_trials` that is not a delete. Does the page's word "remove" match what happens at rest?
8. Under household sharing, each existing write keeps its own policy. Does the page let a partner do through it anything the source screen would not?

---

## Sources

- Migrations: 001, 005, 007, 013, 018, 020, 024, 031, 037, 040, 041, 044, 053, 066, 068, 075, 081, 082, 084, 100, 108, 109, 110, 112, 113, 116, 118 (line numbers as cited).
- Functions: `generate-signal/index.ts`, `phrasing.ts`, `summary.ts`; `ask/index.ts`; `generate-report/index.ts`, `documentV2.ts`, `render.ts`, `report.ts`, `aiLead/facts.ts`, `aiLead/run.ts`; `_shared/aiConsent.ts`, `_shared/reportSummaryGate.ts`, `_shared/incident-analysis.ts`; `extract-food-from-photo/index.ts`; `extract-medication-from-photo/index.ts`; `delete-account/index.ts`, `plan.ts`; `report-visit-link/io.ts`.
- Client: `app/(tabs)/profile.tsx`, `components/profile/AddConditionModal.tsx`, `lib/dietTrialMirror.ts`, `lib/medications.ts`, `lib/attachments.ts`, `lib/sync.ts`, `lib/session.ts`, `lib/hydration.test.ts`, `store/askStore.ts`, `constants/aiConsentCopy.ts`, `lib/aiConsent.ts`.
- Guards: `guards/visitReaders.test.ts`, `guards/careRecord.test.ts`.
- Specs: `docs/nyx-ask-requirements.md` v2.4; `docs/nyx-vet-files-requirements.md` v1.0; `docs/nyx-vet-visits-requirements.md` v1.6; `docs/nyx-care-state-requirements.md` v1.6; `docs/legal/privacy-policy.md` (draft); `docs/app-privacy-answers.md`; `docs/decisions-archive.md`.
- Unmerged: the household sharing requirements draft v2.0 (CUL-1935) and the two CUL-2753 briefs, all in the session scratchpad.

**Limits.** Live `app_config` values, bucket privacy and deployed function versions were not read. The household draft is unruled and may change. Line numbers are as of `13d6ac194`.

---

## I. Red team on the proposed shape

The `rls-privacy-reviewer` ran isolated on the proposed shape on 2026-11-15: a view over existing rows, with `conditions` extended to carry provenance, a second kind, and a soft delete (the shape is in `docs/pet-memory-discovery-2026-11.md` §4). It read this brief, the CUL-2753 privacy brief, the household draft, and the code.

**Verdict: FAIL as written, on two blockers. PASS WITH CONDITIONS once both controls are stated.** The reviewer judged the view the smaller attack surface of the two shapes.

### I.1 Blockers

1. **A removed condition would still reach the vet.** The report pulls `conditions` with no status or delete predicate (`generate-report/index.ts:1594`) and its appendix prints every row (`render.ts:12167`). Adding `deleted_at` without changing the query means a row the owner removed still prints. Control: the predicate lives in the query, and a guard lists every reader of `conditions` and fails when one lacks it.
2. **"Keeps its RLS" is the hole.** The policy on `conditions` (`001_schema.sql:221`) is the one-clause `FOR ALL USING` idiom with no `WITH CHECK`. Under it a client can hard delete a row (bypassing a soft delete), un-delete one, write any marker column, and move a row between the owner's own pets. Another account's pet is refused; the owner's second pet is not. Control: the three-verb policy pattern of migrations 044 and 066 with no client DELETE; column grants that leave out the origin marker, `pet_id`, `created_at` and any author stamp; the same-pet trigger of migration 082 with its caller arm, on INSERT and on any UPDATE of `pet_id` or the visit link.

### I.2 Highs

- **A forged visit link.** A foreign key ignores RLS, so a link naming another account's visit passes it. Only the 082 caller arm stops it, with one error whatever is named.
- **"Origin set by the server" has no writer in the proposal.** Confirming a proposal opens the client's ordinary form, so the client would write the marker. Either a server path consumes the pending proposal and stamps it, or the marker is client-trusted, display-only, never read by an engine and never printed.
- **Provenance is forgeable by design.** An owner can type that a vet said something and that it was confirmed. No server check can stop that. The containment is wording: the report never prints "confirmed" or a vet's name without "the owner reports", pinned by a test.
- **Pending proposals inherit CUL-2753's open break.** That design's stored summary can outlive a soft-deleted visit, a deleted document and an edited note. This page would be a second reader and a second place where quoted third-party text shows. Gate: no proposal renders here until removal lands on all three, the page is under the visit reader guard, and quotes taken from an image are marked unchecked.
- **The consent words do not cover it.** Sending condition names to a model contradicts the consent sheet's patterns row (`constants/aiConsentCopy.ts:135-136`) and the policy's "only the computed, structured finding" (`docs/legal/privacy-policy.md:63`). A cheaper route exists: compose the context line in code and send nothing new. A "no" needs to clear nothing stored, because no model text would land in `conditions`.

### I.3 Mediums

- Condition names and vet names are free text. Sent to a model they are untrusted input and, under household sharing, an injection channel from one person into another's Ask.
- A care state line ("Because of this, Home is not asking you to book") is covered by the care state spec's off-device rule (§3.4). A first build should have no share, copy or print.
- "Remove" as a soft delete leaves the row at rest and leaves kept report copies frozen. The confirm copy must say both. Whether "entered by mistake" should hard delete is a question for the PM.
- An origin marker on `conditions` alone gives no complete answer to "what did the AI start": confirmed medicines and weights would carry none unless CUL-2753 adds the same marker.
- Household (unruled draft): the author must be stamped by the server; a partner must not confirm a proposal built from the owner's notes; sitter links never render the page; the draft's three-way consent rule must govern facts the other person typed.

### I.4 What held

- Cross-account reads and writes on `conditions`.
- Derived "from your logs" lines: computed on the phone, stored nowhere, absent from the widget snapshot.
- Account deletion: `conditions` cascades from `pets`; there is no local mirror to wipe.
- The page itself makes no model call.
- The store would do better on three things only: one deletion point, one export inventory, one audit trail. The view matches them if a spec writes the export column list and puts every reader under a guard.

### I.5 The attacks tried

A client move of a condition to another account's pet (refused). The same move to the owner's own second pet (allowed; broke). Un-delete, hard delete and a forged origin under the current policy (all allowed; broke). A soft-deleted condition through the report pull (prints; broke). A visit link naming another account's visit (held only with the caller arm). A forged "vet said, confirmed" (cannot be stopped; contained by wording). A pending proposal outliving its deleted visit (inherits the CUL-2753 break). Derived lines reaching the widget (held). The Stage 2 send against the shipped consent copy (not covered).

Not verifiable from the repo: the live value of the Ask flag, and whether a deployed report version differs from the repo.
