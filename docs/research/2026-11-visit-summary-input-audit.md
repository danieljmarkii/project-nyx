# Visit summary discovery: input audit (what Signals, Ask and the vet report read today)

**Date:** 2026-11-14 · **Status:** frozen point-in-time brief · **Issue:** CUL-2753 · **Method:** every `.from()` / `.select()` in `supabase/functions/generate-signal/`, `ask/` and `generate-report/`, plus the `_shared/` and `lib/` modules they import, read against the schema resolved from all 121 migrations. An isolated agent did the sweep; the flag values in §1 were then checked against live `app_config` by read-only SQL (2026-11-14). Line numbers are as of commit `fbbcb45cb`.

## 1. What the audit says, in order of consequence

1. **For every owner except the PM, Signals reads nothing from a vet and no weight at all.** The visit date (`engines_v3_en10` / `en9`), the appointment dates and "my vet knows" answers (`en9`) and every weigh-in (`en8`) are each behind a flag whose live value is `enabled: false` with an allowlist of one. The gap the PM named is wider than "no notes": for a new App Store user the engine cannot see that a visit happened or what the pet weighs. [E: live `app_config`, 2026-11-14]
2. **Vet side, unread by all three functions:** visit notes, the recheck date, every appointment text field including the owner's questions, every Vet Files document, every vet call and its follow up, and all four `vet_visit_id` links. The report selects a visit's clinic, vet and reason and prints none of them.
3. **Signals is the blindest of the three.** Ask and the report both read event notes, photo presence, dose amounts and every weigh-in. The report alone reads the daily look, conditions, the trial's allowed foods, a trial's outcome and history, and the regimen detail (route, doses per day, schedule, indication). Signals knows a trial is running and not which foods it permits.
4. **Structured answers the owner already gave reach no engine:** `intake_checks` (the one tap intake answer under a vomit read), `vet_calls`, `diet_trials.phase`, `meals.is_full_portion`, the food flags `is_novel_protein` / `is_prescription`. These need no model, no consent change and no ruling beyond the one that parked each.
5. **Dead selects:** the report pulls `pets.weight_kg`, `meals.quantity`, `medications.prescribed_by` and the three visit text fields and uses none. Harmless, and a sign of where the report meant to go.

## 2. The cheapest honest way in, per unread source

"Way in" is one of three, in rising cost and risk: **(S)** a structured field the deterministic engine can read as it is; **(C)** an owner confirmed fact, proposed by a model from free text or a document, written into an existing table; **(P)** context handed to a model on one surface at the owner's request (Ask's scoped recall, or the visit summary itself), never to the engine.

| Unread source | Way in | Why that one | Collides with |
|---|---|---|---|
| Visit date, appointment dates, "my vet knows" (flag gated) | S | already built; a GA call per flag | nothing new; each flag has its own GA gate |
| Weigh-ins and their scale (flag gated) | S | already built (`en8`) | nothing new |
| `vet_visits.next_visit_at` | S | a date the owner set; the care state already reads appointment dates | AC 10's column list (a Tier 2 edit) |
| `medications.vet_visit_id`, `diet_trials.vet_visit_id` | S | provenance only: lets a context line say "started at the Sep 16 visit" | AC 10 (links are provenance, never numbers); holds if it stays a label |
| `intake_checks` | S | the owner's own answer about one vomit | its migration comment: "never reaches the report or Ask until ruled" |
| `vet_calls`, `vet_call_follow_ups` | S | dates and closed answers | care state spec §3.4 (never off device); engine use needs its own ruling |
| `diet_trial_foods` (the allowed set) | S | lets Signals tell an off trial food from an allowed one | `lib/dietTrial.ts` owns the one off diet predicate; the engine must import it, never restate it |
| Regimen detail (route, doses per day, indication) | S | already structured; the report reads it | none found |
| Clinic weight, courses started, injections given, trial changes, stated in notes or documents | **C** | free text today; the owner confirms each into the table that already holds its kind | Vet Files D8 and §5.3; vet visits G6. D7 holds: proposed, never minted |
| "Call me if" instructions | **C**, into CUL-2731's capture | the instruction's home is already ruled and building | CUL-2731's "no AI extraction" team call (a prefill offered for confirmation, not an extraction that writes) |
| Visit notes and the owner's questions as text | **P** | a model may summarize them for the owner on request; Ask may recall one visit's note when asked about that visit | vet visits G6 ("never read by a model in v1"); Ask §6.1 scoped retrieval fits as written |
| Vet Files documents as text | **P**, then C for facts | third party text; read once, on request, per visit or per document | Vet Files D8; the injection posture tightens |
| Exam findings, diagnoses, lab values | P only for now | no table holds them as facts except `conditions`; counting them needs a clinical ruling per type | the no reassurance rule (most findings are absences) |
| The vet's opinion ("not concerned") | **none** | quoted in the summary as the owner's note, never an input | n=1 never reassures. Not up for replacement |
| Event notes, look notes, medication notes (free text) | P via Ask (shipped for event notes) | free text has no honest count | "LLM as Phraser, never Analyst" if handed to the Signal's model |

The pattern: **most of "give Signals everything" is S, and S needs no model.** The visit summary is the C route for the one class of data that only exists as prose.

## 3. The full table



| Table | Field(s) | generate-signal | ask | generate-report | Note |
|---|---|---|---|---|---|
| user_profiles | timezone | reads S:753 | reads A:768 | reads R:1304 | |
| user_profiles | display_name | no | no | reads R:1304 | v1 owner line |
| user_profiles | first_name, last_name | no | no | reads R:2245 | v2 colophon only |
| user_profiles | id, onboarding_completed_at, created_at, updated_at | no | no | no | id is RLS scope only |
| pets | name, species | reads S:698 | reads A:1004 | reads R:1301 | |
| pets | id, user_id | filter only S:698 | filter only (RLS) | filter only R:1301, R:1375, R:2230 | user_id feeds the flag allowlist (S:857, R:1395) and the household owner check |
| pets | date_of_birth | reads S:1144 (only under `engines_v3_en8`) | no | reads R:1301 | Signal uses it for the weight lane's "young" rule only |
| pets | date_of_birth_precision, breed, sex | no | no | reads R:1301 | |
| pets | weight_kg | no | no | selected, unused R:1301 | mapped at R:516; no consumer in report.ts / render.ts (weights come from weight_checks) |
| pets | species of the caller's OTHER pets, is_active | no | no | reads R:1375 | household count; is_active is filter only |
| pets | microchip_number, photo_path, created_at, updated_at | no | no | no | created_at is an ORDER BY in R:1375 |
| conditions | condition_name, status, diagnosed_at | no | no | reads R:1594 | |
| conditions | notes, created_at, updated_at | no | no | no | |
| events | id, event_type, occurred_at, occurred_at_confidence | reads S:702 (symptom types), pipeline.ts:181 (meals), S:782 (doses) | reads A:687 | reads R:1498 | |
| events | severity | reads S:702 (symptom types only) | no | reads R:1499 | |
| events | notes | no | reads A:687 | reads R:1499 | Ask: recall tools only (tools.ts:334); report prints it (render.ts:10215) |
| events | occurred_at_earliest, occurred_at_latest | no | reads A:687 | reads R:1498 | |
| events | created_at | no | no | reads R:1499 | appendix "logged" column |
| events | deleted_at, pet_id | filter only | filter only | filter only | |
| events | source, occurred_at_source, logged_via, updated_at | no | no | no | |
| events (any type, id + occurred_at) | logging-day presence | reads S:1084 (en10 or en9), S:1325 (en9 history) | (covered by A:687) | (covered by R:1498) | Signal excludes `check_in`; never a content read |
| events (lethargy) | id, occurred_at | reads S:1194 (en9 only) | (A:687, all types) | (R:1498, all types) | lethargy is not in the Signal's symptom pull otherwise |
| meals | food_item_id, intake_rating, component_count | reads pipeline.ts:181 | reads meals.ts:12 | reads R:1500 | |
| meals | quantity | no | no | selected, unused R:1500 | mapped R:594/617; no consumer found |
| meals | is_full_portion, notes, logged_via, created_at, updated_at | no | no | no | tools.ts:365 declares a meal note field; meals.ts:52/71 always sets it null |
| meal_components | position, food_item_id, food_label, share, share_source, updated_at, deleted_at | reads mealBowl.ts:22 via pipeline.ts:181 | reads via meals.ts:12 | reads via R:1501 | Ask keeps only food id / label / type per component (meals.ts:55) |
| meal_components | amount_value, amount_unit | selected (mealBowl.ts:22) | selected, not relayed | reads (render.ts) | |
| meal_components | created_at | no | no | no | |
| food_items | primary_protein, proteins | reads pipeline.ts:178, S:742 | reads meals.ts:8, A:749 (primary_protein only for arrangements) | reads R:213 | |
| food_items | brand, product_name | reads pipeline.ts:178 (meals only) | reads meals.ts:8, A:749 | reads R:1500, R:1341, R:1585 | |
| food_items | food_type | reads pipeline.ts:178 | reads meals.ts:8 | reads R:1500 | |
| food_items | format | reads pipeline.ts:178 | no | reads R:1500 | |
| food_items | ingredients_notes, ai_extraction_confidence | no | no | reads R:213 | protein-set completeness and hydrolysed check (report.ts:5351, 6657) |
| food_items | is_novel_protein, is_grain_free, is_prescription, upc_barcode, source, archived_at, photo_path(s), ai_extraction_status/error, created_by_user_id, created_at, updated_at | no | no | no | |
| diet_trials | started_at, target_duration_days | reads S:730 | reads A:766 | reads R:1330 | all three; Signal and Ask read the ACTIVE trial only |
| diet_trials | status | filter only S:732 | reads A:766 | reads R:1330 | |
| diet_trials | indication, target_protein | reads S:730 (used only by en10's trial line) | no | reads R:1331, R:1336 | |
| diet_trials | ended_at, target_duration_days_initial | reads S:1221 (en9, only trials an answer names) | no | reads R:1330, R:1340 | |
| diet_trials | completed_at, outcome, outcome_notes, stopped_reason, food_label, vet_name, food_item_id, target_protein_set_at, target_duration_set_at, target_duration_vet_directed | no | no | reads R:1330–1340 | vet_name prints "directed by" (render.ts:3450, 3958) |
| diet_trials | notes, phase, transition_started_at, vet_visit_id, created_at, updated_at | no | no | no | |
| diet_trial_foods | food_item_id, food_label, role, allowed_from, allowed_until | no | no | reads R:1346 | deleted_at filter only (R:1350) |
| diet_trial_foods | id, diet_trial_id, pet_id, updated_at, created_at | no | no | no | |
| vet_visits | visited_at | reads S:1073 (en10 or en9 on; newest one row before today) | no | reads R:1313 | report: scope rung 1 (report.ts:1203, composer.ts:175) |
| vet_visits | id, clinic_name, vet_name, reason | no | no | selected, unused R:1313 | mapped R:883–885; only `visitedAt` is consumed |
| vet_visits | notes, next_visit_at, created_at, updated_at | no | no | no | deleted_at is filter only (S, R) |
| vet_appointments | scheduled_at, cancelled_at, deleted_at | reads S:1205 (en9 only) | no | no | date only; quiets a raised concern |
| vet_appointments | clinic_name, vet_name, reason, questions, notes_draft, vet_visit_id, created_at, updated_at | no | no | no | |
| vet_documents | all columns | no | no | no | |
| vet_visit_attachments | all columns | no | no | no | |
| vet_reports | ai_lead_*, snapshot, params, status, storage_path, content_sha256, created_at, shared_at, id | no | no | reads aiLead/run.ts:39, savedCopy.ts:214, :233 | the report's own saved-copy store, not a record input |
| vet_reports | vet_appointment_id, vet_visit_id, short_id, share_token, the rest | no | no | no (written, not read) | |
| ai_signals | findings | reads S:915 (prior row, stand-down) | reads A:156, A:770 | reads R:1411 | |
| ai_signals | generated_at | reads S:915 | filter only (order) | reads R:1411 | |
| ai_signals | engine_flags | reads S:915 | no | no | |
| ai_signals | signal_text, is_building, coverage, summary, engine_fingerprint, expires_at | no (written S:984) | no | no | expires_at is an ORDER BY in S and R |
| event_ai_analysis | event_id, status, contents, blood_present, bile_present, foreign_material_present, stool_blood_present | reads S:812 | reads A:548 | reads R:1522 | |
| event_ai_analysis | incident_type, recommendation, tier, engine_flags | reads S:812 | reads A:548 | no | |
| event_ai_analysis | updated_at, call_said_at | reads S:812 | no | no | |
| event_ai_analysis | colour, consistency, foreign_material_note, stool_consistency, stool_mucus_present, edited_at | no | reads A:548 | reads R:1522 | |
| event_ai_analysis | stool_colour, stool_blood_type | no | no | reads R:1524 | |
| event_ai_analysis | description, read_text, visual_flags, contextual_flags, dismissed_at, intake_correction_at / _meals / _unrated / _most_or_all | no | reads A:548 | no | |
| event_ai_analysis | stool_content, ai_confidence, ai_raw_payload, error, may_wait, may_wait_decided_at, intake_read_at, photo_set_key, model_id, prompt_hash, rule_version, created_at | no | no | no | created_at is an ORDER BY |
| event_attachments | id (presence), event_id | no | reads A:687, meals.ts:13 | reads R:1604 | Ask: "has a photo" only |
| event_attachments | storage_path, mime_type, sort_order | no | no | reads R:1604 | bytes fetched R:980 |
| event_attachments | taken_at, created_at | no | no | no | |
| feeding_arrangements | food_item_id, active_from, active_until | reads S:741 | reads A:749 | reads R:1585 | free_choice rows only in S and A |
| feeding_arrangements | ended_at, is_shared, created_at | reads S:741 | no | reads R:1585 | Ask does not see `ended_at` (migration 076) |
| feeding_arrangements | method | filter only S:745 | filter only A:751 | reads R:1585 | |
| feeding_arrangements | notes, updated_at | no | no | no | deleted_at is filter only |
| medications | drug_name, medication_item_id, started_at, ended_at, status | reads S:765 | reads A:723 | reads R:1566 | |
| medications | dose_amount | no | reads A:723 | reads R:1566 | |
| medications | target_duration_days, target_duration_doses | reads S:1230 (en9, only courses an answer names) | no | reads R:1567 | |
| medications | route, doses_per_day, schedule_notes, indication | no | no | reads R:1566 | |
| medications | prescribed_by | no | no | selected, unused R:1567 | mapped R:815; only a type declaration in report.ts:557 |
| medications | notes, vet_visit_id, created_at, updated_at | no | no | no | created_at is an ORDER BY |
| medication_items | generic_name | reads S:765, S:784 | reads A:737 | reads R:1689 | |
| medication_items | brand_name | reads S:765, S:784 | no | reads R:1689 | |
| medication_items | strength, is_prescription | no | no | reads R:1568, R:1689 | |
| medication_items | default_route, form | no | no | reads R:1689 | `form` = the chewable rule |
| medication_items | is_critical, notes, photo_paths, ai_extraction_*, created_by_user_id, created_at, updated_at | no | no | no | |
| medication_administrations | medication_id, medication_item_id, adherence | reads S:784 | reads A:737 | reads R:1551 | |
| medication_administrations | paired_event_id | reads S:784 | no | reads R:1551 | |
| medication_administrations | dose_amount, how_given | no | no | reads R:1551 | |
| medication_administrations | notes, logged_via, created_at, updated_at | no | no | no | |
| weight_checks | weight_kg | reads S:1148 (en8 only) | reads A:711 | reads R:1536 | |
| weight_checks | source, source_basis | reads S:1148 (en8 only) | no | reads R:1536 | |
| weight_checks | notes, created_at, updated_at | no | no | no | |
| pet_weight_displacements | all columns | no | no | no | |
| looks | local_day, outcome, words, notes, vocab_version, created_at | no | no | reads R:1628 | the only server read of a look's note |
| looks | observer, updated_at, id | no | no | no | |
| intake_checks | all columns | no | no | no | only `event_ai_analysis.intake_correction_*` (Ask) carries any of it |
| care_acknowledgements | symptom_type, source, anchor_on, diet_trial_id, medication_id, retracts, created_at | reads S:1186 (en9 only) | no | no | |
| care_acknowledgements | vet_visit_id | no | no | no | |
| vet_calls | all columns | no | no | no | |
| vet_call_follow_ups | all columns | no | no | no | |
| capture_changes | change_key, first_seen_at, created_at | no | no | reads R:1649 | one key (`FAB_STOOL_SPLIT_KEY`) |
| notification_preferences | all columns | no | no | no | |
| signal_shown_log | all columns | no (insert only, engineStamps.ts:259) | no | no | |
| ai_consent | granted (scope ai boundary) | filter only aiConsent.ts:50 via S:652 | filter only via A:1020 | filter only reportSummaryGate.ts:255 (+ scope, copy_version) | a gate, not an input |
| ai_consent_events | granted, decided_at | no | no | no | read at aiConsent.ts:148 (`readConsentOnSince`), not called by these three |
| ai_usage | day, count | filter only S:506 | filter only A:213 | no | cap gate |
| app_config | key, value | filter only S:472, engineFlagsRead.ts:15 | filter only A:1009 | filter only documentFlag.ts:19, reportSummaryGate.ts:264, engineFlagsRead.ts:15 | flags and caps |
| legal_acceptances | all columns | no | no | no | |
| food_item_retired_ids, vet_report_kept_ids, pet_ids_retired, vet_report_departures | all | no | no | no | server-only id reservation / departure log |

Not a table read, but an input: the phone sends `unsentRows` / `refusedRows` booleans in the generate-signal request body (S:149–166); they mark the run's record incomplete.

## Unread sources (none of the three reads them)

### (a) Vet side
- `vet_visits.notes`, `vet_visits.next_visit_at` (never selected). `clinic_name`, `vet_name`, `reason` are selected by the report (R:1313) but nothing consumes them; no function uses them.
- `vet_appointments.clinic_name`, `vet_name`, `reason`, `questions`, `notes_draft`, `vet_visit_id`.
- `vet_documents`: every column (kind, title, document_date, notes, files).
- `vet_visit_attachments`: every column.
- `vet_calls`: every column (called_on, note, covers_rank, covers_from, supersedes, withdrawn).
- `vet_call_follow_ups`: every column (reason, status, answer, worth_it, due_at).
- `care_acknowledgements.vet_visit_id` (the answer's other columns are read by the Signal under en9).
- `medications.vet_visit_id`, `diet_trials.vet_visit_id`, `vet_reports.vet_visit_id` / `vet_appointment_id`.
- `medications.prescribed_by` (selected by the report, not consumed).

### (b) Not vet side
- `intake_checks`: every column (since, form, answer, answered_at).
- `pet_weight_displacements`: every column.
- `conditions.notes`.
- `pets.microchip_number`, `pets.photo_path`; `pets.weight_kg` is selected by the report but not consumed.
- `events.source`, `events.occurred_at_source`, `events.logged_via`.
- `meals.is_full_portion`, `meals.notes`, `meals.logged_via`; `meals.quantity` is selected by the report but not consumed.
- `feeding_arrangements.notes`.
- `medications.notes`; `medication_administrations.notes`, `logged_via`; `medication_items.notes`, `is_critical`.
- `weight_checks.notes`.
- `diet_trials.notes`, `phase`, `transition_started_at`.
- `food_items.is_novel_protein`, `is_grain_free`, `is_prescription`, `upc_barcode`, `source`, `archived_at`.
- `looks.observer`.
- `event_attachments.taken_at`.
- `event_ai_analysis.stool_content`, `ai_confidence`, `may_wait`, `may_wait_decided_at`, `intake_read_at`.
- `notification_preferences`, `legal_acceptances`, `signal_shown_log` (write only).
- Phone-only stores no function can see: local SQLite `incident_tier_shown` (lib/localSchema.ts:638, "LOCAL ONLY and never pushed"), `event_ai_verdicts` (a pulled copy), `food_items_cache`, `sync_watermarks`, the outboxes (`food_photo_uploads`, `incident_floor_queue`, `pending_report_keeps`); and AsyncStorage marks such as `lib/appointmentAsked.ts`, `lib/careQuestionAsked.ts`, `lib/lookWithheld.ts`.

Contrary to the brief's guess list, these ARE read: `events.notes` (Ask, report), `event_attachments` (Ask presence, report photos), `looks.notes` (report), `conditions` name/status/date (report), `feeding_arrangements` (all three), `pets.date_of_birth` (report; Signal under en8), `pets.sex` / `breed` (report), `medications.schedule_notes` / `indication` (report), `diet_trials.outcome_notes` (report), `food_items.ingredients_notes` (report), `weight_checks.source` (report; Signal under en8).

## Read by one, not the others

Report only (Signals and Ask never see it):
- `looks` (the whole Noticed record, notes included).
- `conditions`.
- `diet_trial_foods` (the allowed set). The Signal knows a trial is running but not which foods it permits.
- Trial history and outcome: `diet_trials.outcome`, `outcome_notes`, `stopped_reason`, `completed_at`, `vet_name`, `food_label`, the window-change columns. Signal and Ask read the active trial only.
- Regimen detail: `medications.route`, `doses_per_day`, `schedule_notes`, `indication`; `medication_items.strength`, `is_prescription`, `form`, `default_route`; `medication_administrations.dose_amount`, `how_given`.
- `pets.breed`, `sex`, `date_of_birth_precision`; `user_profiles.display_name`, `first_name`, `last_name`; the household species count.
- `food_items.ingredients_notes`, `ai_extraction_confidence`.
- `event_ai_analysis.stool_colour`, `stool_blood_type`; `events.created_at`; `capture_changes`; attachment bytes.

Signal only:
- `care_acknowledgements`, `vet_appointments` dates (both en9), `event_ai_analysis.call_said_at` / `updated_at`, `ai_signals.engine_flags`.

Ask only:
- `event_ai_analysis.description`, `read_text`, `visual_flags`, `contextual_flags`, `dismissed_at`, `intake_correction_*`.

Signal blind spots the other two cover:
- `events.notes` and the `occurred_at_earliest` / `_latest` bounds (Ask and report read them).
- Non-symptom event types outside meals and doses: the Signal reads content only for `CORRELATION_SYMPTOM_TYPES`, meals and medication doses; every other type reaches it only as "something was logged at this instant" (S:1084, flag-gated).
- `weight_checks`: Ask and the report read every weigh-in always; the Signal reads none unless `engines_v3_en8` is on.
- `medications.dose_amount` (Ask and report).
- `event_attachments` presence, and the structured read fields `colour`, `consistency`, `stool_consistency`, `stool_mucus_present`, `foreign_material_note`.

Ask blind spots:
- `feeding_arrangements.ended_at` and `is_shared` (Signal and report read both), `food_items.format`, `medication_items.brand_name`, `weight_checks.source`, `events.severity`, `diet_trials.indication` / `target_protein`.

## Flags and holds

- `vet_visits.visited_at` is gated, but by two keys: the read at S:1073 runs when `engines_v3_en10` **or** `engines_v3_en9` is on for the pet's owner (S:864–872). With both off the Signal makes no `vet_visits` read at all. It reads one column of one row (the newest non-deleted visit strictly before the owner's today).
- Resolution: `readEngineFlags` (`_shared/engineFlagsRead.ts:15`) selects `app_config` `key, value` for `ENGINE_KEYS`; `resolveEngineFlags` (`_shared/engineFlags.ts`) runs each value through `resolveAllowlistFlag(value, ownerUid, false)` (`_shared/flags.ts:19`): a bare boolean wins; `{enabled: true}` is on for everyone; `{enabled: false, allowlist: [...]}` is on only for a listed owner uid; a missing or malformed row is off; a failed read is `{on: [], readOk: false}` (fails closed, flag-off engine).
- Seeded value: migration `098_engines_v3_en10_seed.sql` writes `{"enabled": false, "allowlist": ["<PM uid>"]}` with `ON CONFLICT DO NOTHING`; migration 102 seeds en4/en8/en9/en11 the same way. So in the repo the visit read is on for the PM account only. The live `app_config` row was not checked (this audit ran no query against the project).
- Other gated Signal reads: `engines_v3_en9` → `care_acknowledgements`, `vet_appointments`, the named trial / course rows, lethargy instants, the pre-lookback history (S:1172 on); `engines_v3_en8` → `weight_checks` and `pets.date_of_birth` (S:1140).
- The report reads the same flags (R:1395) but its `vet_visits` pull is not gated by any of them.
- `guards/visitReaders.test.ts` registers the Signal shell as the one engine reader of a vet table.
