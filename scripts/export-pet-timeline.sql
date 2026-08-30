-- ============================================================
-- Export: full event timeline for a single pet
-- ============================================================
-- Ad-hoc analysis script, not a migration. Flattens the event
-- timeline (meals, symptoms, medications, weight checks) into
-- one row per event so it can be dropped straight into an AI
-- chat to look for food <-> incident patterns.
--
-- Usage:
--   1. Set BOTH values in target_pet below — the pet id and its
--      owner's email. They are one unit; never change one alone.
--   2. Set the date range in the WHERE clause at the bottom
--      (defaults to all history)
--   3. Run via Supabase SQL Editor / MCP execute_sql and export
--      the result as CSV
--
-- Soft-deleted events (deleted_at) are excluded — this matches
-- what the owner actually sees in the app.
--
-- ─────────────────────────────────────────────────────────────
-- THE OWNER PREDICATE IS LOAD-BEARING. Read this before editing
-- target_pet. (CUL-696)
--
-- This runs on the service-role path, where RLS does not apply,
-- so the query itself is the only thing scoping it to one
-- account. Until 2026-08-30 the subject was selected as
-- `WHERE name = 'Nyx' LIMIT 1` — no account predicate, on a
-- column that is neither unique nor owner-scoped, with no
-- ORDER BY, so which pet won was decided by the query plan.
-- Two pets are in fact named "Nyx", both cats: the owner's and
-- a QA mirror account's. The loser is not an obviously empty
-- stub you would notice — it is hundreds of events of plausible
-- cat health data, and the export carried nothing that said
-- which one it had picked.
--
-- Pairing the id with its owner is what makes a wrong or stale
-- id return ZERO rows instead of another account's record. A
-- bare `id = '<uuid>'` is NOT an ownership check: it is correct
-- only while that literal happens to name the right pet, which
-- is a fact about this file's contents rather than a property
-- the query enforces.
--
-- Retargeting: replace both values together, in target_pet, and
-- nowhere else — the pair is deliberately written ONCE in this
-- file. If the pet is not yours, stop: this is a dogfood-era
-- single-account tool, and nothing here authorises exporting
-- someone else's record.
--
-- Which means ZERO ROWS HAS THREE CAUSES, and "this pet has
-- no events" is only one of them: the pair did not resolve,
-- the date filter below excludes everything, or every event in
-- range is soft-deleted. Settle the first before concluding
-- anything — run the target_pet block below on its own, as
-- written, and append:
--
--   SELECT * FROM target_pet;
--
-- No rows: the pair is wrong, and nothing was exported at all.
-- One row: the pair resolves, so look to the other two causes.
-- Do not re-type the id or email to check — a second copy that
-- drifts from target_pet answers a question you did not ask.
-- ─────────────────────────────────────────────────────────────
-- ============================================================

WITH target_pet AS (
  -- Both predicates, always. See the block above.
  SELECT p.id
    FROM pets p
   WHERE p.id = 'bf7b196e-6db1-4a34-af34-f1759d380042'
     AND p.user_id = (SELECT id FROM auth.users
                       WHERE email = 'danieljmarkii@gmail.com')
)

SELECT
  -- The export's SUBJECT, on every row, so a CSV read detached
  -- from this file still names the pet it came from — the two
  -- cats called "Nyx" cannot be told apart by name, and two
  -- exports cannot be told apart at all without this.
  --
  -- Be clear what it does NOT do: it is tp.id by construction,
  -- so it restates the pair above and can never contradict it.
  -- It is not an audit of the pair, and it says nothing about
  -- where the joined food/medication columns came from — see
  -- the join note below. The owner's email is deliberately not
  -- exported; the id identifies the record and the address is
  -- not needed downstream.
  e.pet_id                      AS pet_id,
  e.id                          AS event_id,
  e.event_type,
  e.occurred_at,
  e.occurred_at_confidence,     -- witnessed / estimated / window
  e.occurred_at_earliest,
  e.occurred_at_latest,
  e.severity,                   -- 1-5, symptom events only
  e.notes                       AS event_notes,

  -- Meal detail (event_type = 'meal')
  f.brand                       AS food_brand,
  f.product_name                AS food_product_name,
  f.format                      AS food_format,
  f.primary_protein             AS food_primary_protein,
  f.is_novel_protein             AS food_is_novel_protein,
  f.is_grain_free                AS food_is_grain_free,
  f.is_prescription              AS food_is_prescription,
  m.quantity                    AS meal_quantity,
  m.is_full_portion              AS meal_is_full_portion,
  m.intake_rating                AS meal_intake_rating,
  m.notes                       AS meal_notes,

  -- Medication detail (event_type = 'medication')
  med.drug_name                 AS medication_drug_name,
  ma.dose_amount                AS medication_dose_amount,
  med.route                     AS medication_route,
  ma.adherence                  AS medication_adherence,
  ma.how_given                  AS medication_how_given,
  ma.notes                      AS medication_notes,

  -- Weight checks (event_type = 'weight_check')
  w.weight_kg,

  -- AI read on symptom photos (vomit / stool / skin), when present
  aia.status                    AS ai_analysis_status,
  aia.colour                    AS ai_colour,
  aia.contents                  AS ai_contents,
  aia.consistency               AS ai_consistency,
  aia.blood_present             AS ai_blood_present,
  aia.bile_present              AS ai_bile_present,
  aia.foreign_material_present  AS ai_foreign_material_present,
  aia.foreign_material_note     AS ai_foreign_material_note,
  aia.description               AS ai_description,
  aia.recommendation            AS ai_recommendation,
  aia.read_text                 AS ai_read_text,

  (SELECT COUNT(*) FROM event_attachments ea WHERE ea.event_id = e.id) AS attachment_count

FROM events e
JOIN target_pet tp           ON tp.id = e.pet_id
-- KNOWN LIMIT, recorded by the CUL-696 rls-privacy-reviewer pass and
-- tracked as CUL-736: the joins below are keyed on ids alone.
-- `meals.food_item_id` and `medication_administrations.medication_id`
-- are bare FKs with no same-account guard — unlike `paired_event_id`,
-- `diet_trial_id` and `vet_visit_id`, which got BEFORE triggers in
-- migrations 023/041/044 precisely because service-role callers bypass
-- RLS, which is this script's execution context. So a row referencing
-- another account's food or medication would export that row's brand or
-- drug name under this pet's pet_id, and nothing in the output would
-- show it. Verified against production 2026-08-30: ZERO such references
-- exist, repo-wide across every account, so this has never fired. The
-- fix belongs in the schema, not here — one trigger covers every
-- consumer, this file is only the one that noticed.
LEFT JOIN meals m             ON m.event_id = e.id
LEFT JOIN food_items f        ON f.id = m.food_item_id
LEFT JOIN medication_administrations ma ON ma.event_id = e.id
LEFT JOIN medications med     ON med.id = ma.medication_id
LEFT JOIN weight_checks w     ON w.event_id = e.id
LEFT JOIN event_ai_analysis aia ON aia.event_id = e.id

WHERE e.deleted_at IS NULL
  -- AND e.occurred_at >= NOW() - INTERVAL '7 days'   -- uncomment + adjust for a windowed pull

ORDER BY e.occurred_at ASC;
