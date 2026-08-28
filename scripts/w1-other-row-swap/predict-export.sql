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
-- SCOPED THE SAME WAY candidates.sql IS, and for the same reason: a bare
-- `pet_id = '<uuid>'` is not an ownership check. It is correct today only because
-- that literal happens to name the owner's pet, which is a fact about this file's
-- contents rather than a property the query enforces — and this whole directory
-- exists because a service-role statement that "happens to be right" is the failure
-- mode. Pairing the id with its owner makes a mistyped or copy-pasted pet id return
-- ZERO rows instead of another account's record. The mealRows subquery collapses to
-- one row per distinct UTC day on purpose: ⑦ reads meals ONLY as "was the app used
-- on this day" evidence for the §4.3 logging-eligibility guard, and it buckets by
-- UTC day, so one instant per day is exactly equivalent and far smaller.
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
     WHERE e.pet_id = ANY(SELECT id FROM pets
                           WHERE id = 'bf7b196e-6db1-4a34-af34-f1759d380042'
                             AND user_id = (SELECT id FROM auth.users WHERE email = 'danieljmarkii@gmail.com'))
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
     WHERE e.pet_id = ANY(SELECT id FROM pets
                           WHERE id = 'bf7b196e-6db1-4a34-af34-f1759d380042'
                             AND user_id = (SELECT id FROM auth.users WHERE email = 'danieljmarkii@gmail.com'))
       AND e.deleted_at IS NULL
       AND e.event_type = 'meal'
  ), '[]'::json)
) AS predict_input;
