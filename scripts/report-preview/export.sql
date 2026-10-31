-- Report preview export (CUL-2308). ONE read-only statement; run it unchanged through the
-- Supabase MCP `execute_sql` from a session, after replacing the two literals in the CTE.
-- Save the result to a file OUTSIDE the repository (the MCP writes an oversized result to
-- the session's tool-results directory itself) and pass that path to run.deno.ts.
--
-- What it returns: one row per read `generateReportForPet` makes (scripts/report-preview/
-- reads.ts names them), each with `n` (its row count), `body` (its rows as compact JSON in
-- the shape PostgREST returns for the loader's select) and `md5` (of `body`, taken here).
-- snapshot.ts re-takes every md5 from the file and refuses on any mismatch. The `meta` row
-- carries the statement's now(): one statement is one snapshot, so every row is as of that
-- instant, and the run sets the report's clock to it.
--
-- Service-role discipline (C-27): the subject is named by id PAIRED WITH ITS OWNER, written
-- exactly once, in the CTE; every read below takes the pet and the owner from it and never
-- from a literal. A wrong pair comes back as `subjects: 0` with every read empty, and the
-- loader refuses it, so a typo never renders as an empty record.
--
-- WHOSE PET (PMD-12, CUL-1314). `execute_sql` is the service role and skips RLS. The CTE
-- matches only the evaluation subjects listed in scripts/engine-replay/evaluationSubjects.ts
-- (the PM's own pets until the in-app opt in, CUL-1825), so run as written any other pair
-- returns nothing; the loader refuses any other pet id as well. The query is pinned
-- (exportPin.test.ts): changing anything Postgres would execute reds the build until the
-- rls-privacy-reviewer re-reads it. That binds the committed file, not an edited copy: the
-- rule is followed, never enforced.
--
-- RLS, restated where the service role drops it. In production every read runs on the
-- caller's JWT. Here: the pet's own rows are scoped by pet id; the household and the
-- profile by the subject's owner; food_items and medication_items embeds by
-- created_by_user_id = the owner, as their read policies are (migration 033), so a food row
-- RLS would hide comes back null, as it would for the owner.
--
-- Taken out, because no render the harness makes prints them:
--   * looks.notes is returned as null (a look's note prints only on the owner's appendix
--     with Include your notes on; run.deno.ts never turns that on);
--   * event_attachments.storage_path is returned as withheld/<attachment id> (the run never
--     reads Storage; photos render as placeholders);
--   * app_config allowlists are cut to the subject's owner (in or out), which leaves every
--     flag resolving exactly as it does for the owner and carries no other account's id.
-- Kept, because the report prints them: event notes, the owner's display name, and the
-- trial window's provenance columns (the vet report is their one sanctioned reader,
-- guards/dietTrialProvenance.test.ts).

with subj as (
  select p.id, p.user_id
  from pets p
  where p.id = '<pet uuid>'
    and p.user_id = (select id from auth.users where email = '<owner email>')
    -- The evaluation subjects (evaluationSubjects.ts, PMD-12). Not a literal to replace.
    and p.id in ('bf7b196e-6db1-4a34-af34-f1759d380042', '892f29cb-fdc7-4add-a374-bc082e028825')
),
reads as (
  select 'meta' as read, 1::bigint as n, json_build_object(
      'subjects', (select count(*) from subj),
      'pet_id', (select id from subj),
      'owner_id', (select user_id from subj),
      'cutoff', now())::text as body
  union all
  select 'pet', count(*), coalesce(json_agg(json_build_object(
      'id', p.id, 'user_id', p.user_id, 'name', p.name, 'species', p.species, 'breed', p.breed,
      'sex', p.sex, 'date_of_birth', p.date_of_birth, 'date_of_birth_precision', p.date_of_birth_precision,
      'weight_kg', p.weight_kg))::text, '[]')
    from pets p where p.id = (select id from subj) and p.user_id = (select user_id from subj)
  union all
  select 'user_profiles', count(*), coalesce(json_agg(json_build_object(
      'display_name', up.display_name, 'timezone', up.timezone))::text, '[]')
    from user_profiles up where up.id = (select user_id from subj)
  union all
  select 'vet_visits', count(*), coalesce(json_agg(json_build_object(
      'id', v.id, 'visited_at', v.visited_at, 'clinic_name', v.clinic_name, 'vet_name', v.vet_name,
      'reason', v.reason) order by v.visited_at desc, v.id desc)::text, '[]')
    from vet_visits v where v.pet_id = (select id from subj) and v.deleted_at is null
  union all
  select 'diet_trials', count(*), coalesce(json_agg(json_build_object(
      'id', t.id, 'food_item_id', t.food_item_id, 'started_at', t.started_at,
      'target_duration_days', t.target_duration_days, 'status', t.status,
      'completed_at', t.completed_at, 'ended_at', t.ended_at, 'indication', t.indication,
      'outcome', t.outcome, 'outcome_notes', t.outcome_notes, 'stopped_reason', t.stopped_reason,
      'food_label', t.food_label, 'vet_name', t.vet_name, 'target_protein', t.target_protein,
      'target_protein_set_at', t.target_protein_set_at,
      'target_duration_days_initial', t.target_duration_days_initial,
      'target_duration_set_at', t.target_duration_set_at,
      'target_duration_vet_directed', t.target_duration_vet_directed,
      'food_items', (select json_build_object(
          'food_type', fi.food_type, 'format', fi.format, 'primary_protein', fi.primary_protein,
          'proteins', fi.proteins, 'ingredients_notes', fi.ingredients_notes,
          'ai_extraction_confidence', fi.ai_extraction_confidence, 'brand', fi.brand,
          'product_name', fi.product_name)
        from food_items fi where fi.id = t.food_item_id and fi.created_by_user_id = (select user_id from subj)),
      'diet_trial_foods', (select coalesce(json_agg(json_build_object(
          'food_item_id', d.food_item_id, 'food_label', d.food_label, 'role', d.role,
          'allowed_from', d.allowed_from, 'allowed_until', d.allowed_until,
          'food_items', (select json_build_object(
              'primary_protein', fi.primary_protein, 'proteins', fi.proteins,
              'ingredients_notes', fi.ingredients_notes,
              'ai_extraction_confidence', fi.ai_extraction_confidence, 'brand', fi.brand,
              'product_name', fi.product_name, 'format', fi.format)
            from food_items fi where fi.id = d.food_item_id and fi.created_by_user_id = (select user_id from subj))
        ) order by d.id), '[]'::json)
        from diet_trial_foods d where d.diet_trial_id = t.id and d.deleted_at is null)
    ) order by t.started_at desc, t.id desc)::text, '[]')
    from diet_trials t where t.pet_id = (select id from subj)
  union all
  select 'household', count(*), coalesce(json_agg(json_build_object(
      'id', h.id, 'species', h.species, 'user_id', h.user_id) order by h.created_at desc, h.id desc)::text, '[]')
    from pets h where h.user_id = (select user_id from subj) and h.is_active = true
  union all
  select 'app_config', count(*), coalesce(json_agg(json_build_object(
      'key', c.key,
      'value', case when jsonb_typeof(c.value -> 'allowlist') = 'array'
        then jsonb_set(c.value, '{allowlist}', case when (c.value -> 'allowlist') ? ((select user_id from subj)::text)
          then jsonb_build_array((select user_id from subj)::text) else '[]'::jsonb end)
        else c.value end) order by c.key)::text, '[]')
    from app_config c where c.key like 'engines_v3_%'
  union all
  select 'events', count(*), coalesce(json_agg(json_build_object(
      'id', e.id, 'event_type', e.event_type, 'occurred_at', e.occurred_at,
      'occurred_at_confidence', e.occurred_at_confidence,
      'occurred_at_earliest', e.occurred_at_earliest, 'occurred_at_latest', e.occurred_at_latest,
      'severity', e.severity, 'notes', e.notes, 'created_at', e.created_at,
      'meals', (select json_build_object(
          'food_item_id', m.food_item_id, 'intake_rating', m.intake_rating, 'quantity', m.quantity,
          'component_count', m.component_count,
          'food_items', (select json_build_object(
              'food_type', fi.food_type, 'format', fi.format, 'primary_protein', fi.primary_protein,
              'proteins', fi.proteins, 'ingredients_notes', fi.ingredients_notes,
              'ai_extraction_confidence', fi.ai_extraction_confidence, 'brand', fi.brand,
              'product_name', fi.product_name)
            from food_items fi where fi.id = m.food_item_id and fi.created_by_user_id = (select user_id from subj)))
        from meals m where m.event_id = e.id),
      'meal_components', (select coalesce(json_agg(json_build_object(
          'id', mc.id, 'position', mc.position, 'food_item_id', mc.food_item_id,
          'food_label', mc.food_label, 'share', mc.share, 'share_source', mc.share_source,
          'amount_value', mc.amount_value, 'amount_unit', mc.amount_unit,
          'updated_at', mc.updated_at, 'deleted_at', mc.deleted_at,
          'food_items', (select json_build_object(
              'food_type', fi.food_type, 'format', fi.format, 'primary_protein', fi.primary_protein,
              'proteins', fi.proteins, 'ingredients_notes', fi.ingredients_notes,
              'ai_extraction_confidence', fi.ai_extraction_confidence, 'brand', fi.brand,
              'product_name', fi.product_name)
            from food_items fi where fi.id = mc.food_item_id and fi.created_by_user_id = (select user_id from subj))
        ) order by mc.id), '[]'::json)
        from meal_components mc where mc.event_id = e.id and mc.pet_id = (select id from subj))
    ) order by e.occurred_at desc, e.id desc)::text, '[]')
    from events e where e.pet_id = (select id from subj) and e.deleted_at is null
  union all
  select 'event_ai_analysis', count(*), coalesce(json_agg(json_build_object(
      'event_id', a.event_id, 'status', a.status, 'colour', a.colour, 'contents', a.contents,
      'consistency', a.consistency, 'blood_present', a.blood_present, 'bile_present', a.bile_present,
      'foreign_material_present', a.foreign_material_present,
      'foreign_material_note', a.foreign_material_note, 'stool_consistency', a.stool_consistency,
      'stool_colour', a.stool_colour, 'stool_blood_present', a.stool_blood_present,
      'stool_blood_type', a.stool_blood_type, 'stool_mucus_present', a.stool_mucus_present,
      'edited_at', a.edited_at) order by a.created_at desc, a.id desc)::text, '[]')
    from event_ai_analysis a where a.pet_id = (select id from subj)
  union all
  select 'weight_checks', count(*), coalesce(json_agg(json_build_object(
      'event_id', w.event_id, 'weight_kg', w.weight_kg, 'source', w.source,
      'source_basis', w.source_basis,
      'events', (select json_build_object('occurred_at', ev.occurred_at, 'deleted_at', ev.deleted_at)
        from events ev where ev.id = w.event_id and ev.pet_id = (select id from subj))
    ) order by w.created_at desc, w.id desc)::text, '[]')
    from weight_checks w where w.pet_id = (select id from subj)
  union all
  select 'medication_administrations', count(*), coalesce(json_agg(json_build_object(
      'event_id', ma.event_id, 'medication_id', ma.medication_id,
      'medication_item_id', ma.medication_item_id, 'adherence', ma.adherence,
      'dose_amount', ma.dose_amount, 'paired_event_id', ma.paired_event_id,
      'events', (select json_build_object('occurred_at', ev.occurred_at, 'deleted_at', ev.deleted_at)
        from events ev where ev.id = ma.event_id and ev.pet_id = (select id from subj))
    ) order by ma.created_at desc, ma.id desc)::text, '[]')
    from medication_administrations ma where ma.pet_id = (select id from subj)
  union all
  select 'medications', count(*), coalesce(json_agg(json_build_object(
      'id', md.id, 'medication_item_id', md.medication_item_id, 'drug_name', md.drug_name,
      'dose_amount', md.dose_amount, 'route', md.route, 'doses_per_day', md.doses_per_day,
      'schedule_notes', md.schedule_notes, 'indication', md.indication,
      'prescribed_by', md.prescribed_by, 'started_at', md.started_at,
      'target_duration_days', md.target_duration_days,
      'target_duration_doses', md.target_duration_doses, 'status', md.status,
      'ended_at', md.ended_at,
      'medication_items', (select json_build_object('is_prescription', mi.is_prescription, 'strength', mi.strength)
        from medication_items mi where mi.id = md.medication_item_id and mi.created_by_user_id = (select user_id from subj))
    ) order by md.created_at desc, md.id desc)::text, '[]')
    from medications md where md.pet_id = (select id from subj)
  union all
  select 'feeding_arrangements', count(*), coalesce(json_agg(json_build_object(
      'id', fa.id, 'food_item_id', fa.food_item_id, 'method', fa.method,
      'created_at', fa.created_at, 'ended_at', fa.ended_at, 'active_from', fa.active_from,
      'active_until', fa.active_until, 'is_shared', fa.is_shared,
      'food_items', (select json_build_object(
          'primary_protein', fi.primary_protein, 'proteins', fi.proteins,
          'ingredients_notes', fi.ingredients_notes,
          'ai_extraction_confidence', fi.ai_extraction_confidence, 'brand', fi.brand,
          'product_name', fi.product_name, 'format', fi.format)
        from food_items fi where fi.id = fa.food_item_id and fi.created_by_user_id = (select user_id from subj))
    ) order by fa.created_at desc, fa.id desc)::text, '[]')
    from feeding_arrangements fa where fa.pet_id = (select id from subj) and fa.deleted_at is null
  union all
  select 'conditions', count(*), coalesce(json_agg(json_build_object(
      'id', cn.id, 'condition_name', cn.condition_name, 'status', cn.status,
      'diagnosed_at', cn.diagnosed_at) order by cn.created_at desc, cn.id desc)::text, '[]')
    from conditions cn where cn.pet_id = (select id from subj)
  union all
  select 'event_attachments', count(*), coalesce(json_agg(json_build_object(
      'id', ea.id, 'event_id', ea.event_id, 'storage_path', 'withheld/' || ea.id::text,
      'mime_type', ea.mime_type, 'sort_order', ea.sort_order) order by ea.created_at desc, ea.id desc)::text, '[]')
    from event_attachments ea where ea.pet_id = (select id from subj)
  union all
  select 'looks', count(*), coalesce(json_agg(json_build_object(
      'event_id', l.event_id, 'local_day', l.local_day, 'outcome', l.outcome, 'words', l.words,
      'notes', null, 'vocab_version', l.vocab_version, 'created_at', l.created_at,
      'events', (select json_build_object('occurred_at', ev.occurred_at, 'deleted_at', ev.deleted_at)
        from events ev where ev.id = l.event_id and ev.pet_id = (select id from subj))
    ) order by l.local_day desc, l.created_at desc)::text, '[]')
    from looks l where l.pet_id = (select id from subj)
  union all
  select 'capture_changes', count(*), coalesce(json_agg(json_build_object(
      'change_key', cc.change_key, 'first_seen_at', cc.first_seen_at,
      'created_at', cc.created_at))::text, '[]')
    from capture_changes cc where cc.pet_id = (select id from subj) and cc.change_key = 'fab_stool_split'
  union all
  select 'medication_items', count(*), coalesce(json_agg(json_build_object(
      'id', mi.id, 'generic_name', mi.generic_name, 'brand_name', mi.brand_name,
      'strength', mi.strength, 'default_route', mi.default_route,
      'is_prescription', mi.is_prescription, 'form', mi.form) order by mi.created_at desc, mi.id desc)::text, '[]')
    from medication_items mi
    where mi.created_by_user_id = (select user_id from subj)
      and mi.id in (select ma.medication_item_id from medication_administrations ma where ma.pet_id = (select id from subj))
)
select r.read, r.n, md5(r.body) as md5, r.body from reads r;
