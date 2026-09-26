-- Engine replay export (CUL-1117). Two queries; run each through the Supabase MCP
-- `execute_sql` from a session. The MCP writes an oversized result to a file in the
-- session's tool-results directory; pass that file straight to the replay scripts
-- (record.deno.ts unwraps it). DATA NEVER ENTERS THE REPO: keep the outputs in the
-- session scratchpad.
--
-- Service-role discipline (C-27): the subject is named by id PAIRED WITH ITS OWNER,
-- written exactly once, in the CTE. Replace both literals before running. A wrong id or
-- owner does NOT come back as zero rows: each query is one json_build_object, so it comes
-- back as one row of nulls. That is why each also returns `subjects` (how many pets the
-- CTE matched) and `pet_id`: record.deno.ts refuses anything but the same one pet in both
-- (CUL-1276), so a typo can never replay as an empty record.
--
-- Deliberately NOT exported: diet_trials.target_duration_days_initial,
-- target_duration_set_at and target_duration_vet_directed. They carry a treatment-response
-- inference the repo keeps for the vet report alone (guards/dietTrialProvenance.test.ts).
-- The replay reads the trial at its current length and says so in record.deno.ts.
-- Also not exported: any free-text note, any photo path, any owner name.

-- ── Query 1: the record (everything but meals) → record.json ──────────────────────────
with subj as (
  select p.id
  from pets p
  where p.id = '<pet uuid>'
    and p.user_id = (select id from auth.users where email = '<owner email>')
)
select json_build_object(
  'subjects', (select count(*) from subj),
  'pet_id', (select id from subj),
  'tz', (select up.timezone from user_profiles up join pets p on p.user_id = up.id where p.id = (select id from subj)),
  'pet', (select json_build_object('name', p.name, 'species', p.species) from pets p where p.id = (select id from subj)),
  'events', (select json_agg(json_build_object(
      'id', e.id, 'ty', e.event_type, 'at', e.occurred_at, 'cf', e.occurred_at_confidence,
      'ea', e.occurred_at_earliest, 'la', e.occurred_at_latest, 'cr', e.created_at,
      'del', e.deleted_at, 'sev', e.severity) order by e.occurred_at)
    from events e where e.pet_id = (select id from subj) and e.event_type <> 'meal'),
  'trials', (select json_agg(json_build_object(
      'started_at', t.started_at, 'target_duration_days', t.target_duration_days,
      'status', t.status, 'created_at', t.created_at))
    from diet_trials t where t.pet_id = (select id from subj)),
  'arr', (select json_agg(json_build_object(
      'id', fa.id, 'food_item_id', fa.food_item_id, 'is_shared', fa.is_shared,
      'active_from', fa.active_from, 'active_until', fa.active_until, 'method', fa.method,
      'deleted_at', fa.deleted_at, 'created_at', fa.created_at,
      'primary_protein', fi.primary_protein, 'proteins', fi.proteins))
    from feeding_arrangements fa left join food_items fi on fi.id = fa.food_item_id
    where fa.pet_id = (select id from subj)),
  'meds', (select json_agg(json_build_object(
      'id', m.id, 'drug_name', m.drug_name, 'medication_item_id', m.medication_item_id,
      'started_at', m.started_at, 'ended_at', m.ended_at, 'route', m.route, 'created_at', m.created_at))
    from medications m where m.pet_id = (select id from subj)),
  'admins', (select json_agg(json_build_object(
      'event_id', ma.event_id, 'medication_id', ma.medication_id,
      'medication_item_id', ma.medication_item_id, 'adherence', ma.adherence,
      'paired_event_id', ma.paired_event_id))
    from medication_administrations ma where ma.pet_id = (select id from subj)),
  'ana', (select json_agg(json_build_object(
      'event_id', a.event_id, 'incident_type', a.incident_type, 'status', a.status,
      'blood_present', a.blood_present, 'stool_blood_present', a.stool_blood_present,
      'foreign_material_present', a.foreign_material_present, 'contents', a.contents,
      'bile_present', a.bile_present, 'created_at', a.created_at, 'updated_at', a.updated_at, 'edited_at', a.edited_at,
      'recommendation', a.recommendation, 'contextual_flags', a.contextual_flags,
      'visual_flags', a.visual_flags,
      'rb', a.ai_raw_payload->>'blood_present', 'rf', a.ai_raw_payload->>'foreign_material_present'))
    from event_ai_analysis a where a.pet_id = (select id from subj))
) as dump;

-- ── Query 2: meals + the foods they reference → meals.json ────────────────────────────
-- Rows are positional arrays to keep a months-long meal stream under the MCP's size cap:
-- [event id, occurred_at, occurred_at_confidence, created_at, deleted_at, food_item_id, intake_rating, updated_at]
with subj as (
  select p.id
  from pets p
  where p.id = '<pet uuid>'
    and p.user_id = (select id from auth.users where email = '<owner email>')
)
select json_build_object(
  'subjects', (select count(*) from subj),
  'pet_id', (select id from subj),
  'meals', (select json_agg(json_build_array(
      e.id, e.occurred_at, e.occurred_at_confidence, e.created_at, e.deleted_at,
      m.food_item_id, m.intake_rating, m.updated_at) order by e.occurred_at)
    from events e join meals m on m.event_id = e.id
    where e.pet_id = (select id from subj) and e.event_type = 'meal'),
  'foods', (select json_agg(json_build_array(
      f.id, f.primary_protein, f.proteins, f.food_type, f.format, f.brand, f.product_name))
    from food_items f
    where f.id in (select m.food_item_id from meals m where m.pet_id = (select id from subj))
       or f.id in (select fa.food_item_id from feeding_arrangements fa where fa.pet_id = (select id from subj)))
) as dump;
