-- CUL-677 / W1-PR-4 — §11 step 4: the input export for predictChronicity.deno.ts.
--
-- Mirrors `generate-signal/index.ts`'s own two fetches exactly (symptoms =
-- CORRELATION_SYMPTOM_TYPES, meals = event_type 'meal', both un-deleted), so the
-- predictor runs the shipped detector over the shipped input shape rather than an
-- approximation of it. Account-scoped for the same reason candidates.sql is.
--
-- Deliberately NOT lookback-filtered: chronicity applies its own 56-day window, and
-- passing extra older rows cannot change its result (both logging-eligibility halves
-- lie inside that window by construction). Wider input, identical verdict.
--
-- Save the single returned JSON value as predict-input.json beside this file.

SELECT json_build_object(
  'pet', (
    SELECT json_build_object('name', p.name, 'species', p.species, 'dietTrialActive', false)
      FROM pets p
     WHERE p.id = 'bf7b196e-6db1-4a34-af34-f1759d380042'
       AND p.user_id = (SELECT id FROM auth.users WHERE email = 'danieljmarkii@gmail.com')
  ),
  'symptomRows', coalesce((
    SELECT json_agg(json_build_object(
             'id', e.id, 'type', e.event_type::text, 'occurredAt', e.occurred_at,
             'occurredAtConfidence', e.occurred_at_confidence, 'severity', e.severity
           ) ORDER BY e.occurred_at)
      FROM events e
     WHERE e.pet_id = 'bf7b196e-6db1-4a34-af34-f1759d380042'
       AND e.deleted_at IS NULL
       -- The engine's fetch union. `other` is included ON PURPOSE: the predictor
       -- re-keys the reviewed ids in memory, so the pre-swap export must still
       -- carry the rows that are about to become cough. It drops any `other` the
       -- reviewed list does not name.
       AND e.event_type::text IN (
             -- CORRELATION_SYMPTOM_TYPES, verbatim (detection.ts:167). The predictor
             -- asserts this list against the module's own export, so a future wave
             -- widening the union fails loudly here instead of exporting too little.
             'vomit','diarrhea','itch','scratch','skin_reaction','cough',
             'other'
           )
  ), '[]'::json),
  'mealRows', coalesce((
    SELECT json_agg(json_build_object('id', e.id, 'occurredAt', e.occurred_at)
           ORDER BY e.occurred_at)
      FROM events e
     WHERE e.pet_id = 'bf7b196e-6db1-4a34-af34-f1759d380042'
       AND e.deleted_at IS NULL
       AND e.event_type = 'meal'
  ), '[]'::json)
) AS predict_input;
