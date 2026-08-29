-- CUL-677 / W1-PR-4 — §11 step 1: the account-scoped candidate read.
--
-- Run this on SWAP DAY, not once at review time. `reviewed-ids.json` is a snapshot
-- (taken 2026-08-28) and the run is gated behind a TestFlight cut: `other` grew +11
-- rows in the 13 days before the review, so a delta is expected, not exceptional.
-- Review the delta per-row, add it to reviewed-ids.json, re-emit, then run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE SCOPE PREDICATE IS LOAD-BEARING. Read this before deleting it.
--
-- This runs on the service-role MCP path, which sees EVERY account. Verified live
-- on 2026-08-28: the QA mirror account holds 16 `other` rows, on a pet ALSO named
-- "Nyx", in the SAME date range, with the SAME cough/sneeze note text. Unscoped,
-- this query returns 50 rows across two accounts and the reviewer cannot tell them
-- apart, because (id, occurred_at, note) carries no account signal. Human review
-- therefore cannot substitute for the predicate, and RLS does not backstop a
-- service-role write. D3's consent basis — "the script's reviewer IS the rows'
-- owner" — is only true while this WHERE clause is here.
--
-- Anyone else's rows wait for the future product re-type flow. Never widen this.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Replace the email if the reviewing owner differs — and if it does, stop: this
-- script is dogfood-era, single-account, and D3 does not authorise it elsewhere.

SELECT
  e.id,
  e.occurred_at,
  -- The owner's local wall clock, which is the frame the notes were written in.
  -- Change the zone if the reviewer's is not America/New_York.
  (e.occurred_at AT TIME ZONE 'America/New_York') AS local_ts,
  p.name    AS pet,
  p.species AS species,
  e.occurred_at_source,
  e.occurred_at_confidence,
  e.severity,
  -- The provenance the swap decision rests on. FOR REVIEW ONLY — note text never
  -- enters reviewed-ids.json, the emitted SQL, or the run log.
  e.notes
FROM events e
JOIN pets p ON p.id = e.pet_id
WHERE e.event_type = 'other'
  AND e.deleted_at IS NULL
  AND e.pet_id IN (
    SELECT id FROM pets
     WHERE user_id = (SELECT id FROM auth.users WHERE email = 'danieljmarkii@gmail.com')
  )
ORDER BY e.occurred_at;
