-- Clinical voice: the outcome-loop baseline (CUL-2667, inventory §5; the Data Scientist's
-- condition on the PM's 2026-11-07 ruling). READ-ONLY: one SELECT, aggregates only, no row
-- ever leaves the database.
--
-- Run it once before the deferential copy ships and again 30 days after, unchanged. Reading:
-- the "I've called" rate on deferential calls may fall a little; the FLOOR's rate must hold.
-- A floor rate that falls is a regression and reverts the floor's words.
--
-- Population: every per-incident read that stood as a call (tier call_now / call_today, or
-- the earlier-rule recommendation worth_a_call) on a live event in the last 90 days. The
-- reason bucket mirrors lib/incidentAskWords.ts: any floor reason wins (call_now first, then
-- blood, foreign material, the cat intake flag), then the non-floor contextual flags, then a
-- call with no reason at all (the model's own call).
WITH reads AS (
  SELECT
    a.event_id,
    COALESCE(a.tier, 'earlier:' || a.recommendation) AS tier,
    CASE
      WHEN a.tier = 'call_now' THEN 'floor:call_now'
      WHEN a.blood_present IN ('fresh_red', 'coffee_ground')
        OR a.stool_blood_present = 'yes'
        OR (a.edited_at IS NULL AND 'blood' = ANY (a.visual_flags)) THEN 'floor:blood'
      WHEN a.foreign_material_present = 'yes'
        OR (a.edited_at IS NULL AND 'suspected_foreign_material' = ANY (a.visual_flags)) THEN 'floor:foreign'
      WHEN 'feline_reduced_intake' = ANY (a.contextual_flags) THEN 'floor:cat_intake'
      WHEN cardinality(a.contextual_flags) > 0 THEN 'deferential:' || array_to_string(ARRAY(SELECT unnest(a.contextual_flags) ORDER BY 1), '+')
      ELSE 'deferential:model_only'
    END AS reason
  FROM public.event_ai_analysis a
  JOIN public.events e ON e.id = a.event_id
  WHERE e.deleted_at IS NULL
    AND e.occurred_at >= now() - interval '90 days'
    AND (a.tier IN ('call_now', 'call_today') OR (a.tier IS NULL AND a.recommendation = 'worth_a_call'))
),
called AS (
  -- A live call on the event: not an Undo row, and not superseded by one.
  SELECT DISTINCT c.event_id
  FROM public.vet_calls c
  WHERE NOT c.withdrawn
    AND NOT EXISTS (SELECT 1 FROM public.vet_calls u WHERE u.supersedes = c.id AND u.withdrawn)
),
answers AS (
  SELECT f.event_id,
         bool_or(f.worth_it = 'yes') AS worth_yes,
         bool_or(f.worth_it = 'no') AS worth_no,
         bool_or(f.status = 'answered') AS answered
  FROM public.vet_call_follow_ups f
  WHERE f.reason = 'called'
  GROUP BY f.event_id
)
SELECT
  r.tier,
  r.reason,
  count(*)                                         AS call_reads,
  count(c.event_id)                                AS said_called,
  round(100.0 * count(c.event_id) / count(*), 1)   AS called_pct,
  count(*) FILTER (WHERE a.answered)               AS follow_ups_answered,
  count(*) FILTER (WHERE a.worth_yes)              AS worth_it_yes,
  count(*) FILTER (WHERE a.worth_no)               AS worth_it_no
FROM reads r
LEFT JOIN called c ON c.event_id = r.event_id
LEFT JOIN answers a ON a.event_id = r.event_id
GROUP BY r.tier, r.reason
ORDER BY r.reason, r.tier;
