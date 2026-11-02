#!/usr/bin/env bash
# The two-session races on migration 118 §1b (CUL-2377; rls-privacy-reviewer
# pass 1, F1). Called by run.sh (full variant) after cases.sql, against the
# same scratch database. DA0 is A's draft with no summary yet.
#   S1: A's "no" is being written (held open 3 s) while the pipeline writes a
#       summary to DA0. The write must not wait, and must be refused.
#   S2: the pipeline's write is held open 3 s while A says no. The "no" must
#       wait for it, and §1's clear must then remove the summary.
set -euo pipefail
db="$1"
A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
DA0='d5d5d5d5-0000-4000-8000-000000000005'
WRITE="UPDATE public.vet_reports SET ai_lead_text = 'Late.', ai_lead_model = 'model-x', ai_lead_verdict = '{\"outcome\":\"printed\",\"sentences\":[{\"text\":\"Late.\"}]}' WHERE id = '$DA0'"
NO="UPDATE public.ai_consent SET granted = false WHERE user_id = '$A' AND scope = 'report_summary'"
q() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$db" -c "$1"; }
reset() {
  q "UPDATE public.ai_consent SET granted = true WHERE user_id = '$A'" >/dev/null
  q "UPDATE public.vet_reports SET ai_lead_text = NULL, ai_lead_verdict = NULL, ai_lead_model = NULL WHERE id = '$DA0'" >/dev/null
}
state() { q "SELECT (ai_lead_text IS NULL AND ai_lead_verdict IS NULL)::text || ',' || (SELECT granted::text FROM public.ai_consent WHERE user_id = '$A' AND scope = 'report_summary') FROM public.vet_reports WHERE id = '$DA0'"; }
fail=0

# S1: the "no" first, held open; the write arrives during it.
reset
( printf '%s\n' "BEGIN;" "SET LOCAL ROLE authenticated;" "SELECT set_config('request.jwt.claim.sub', '$A', true);" \
    "$NO;" "SELECT pg_sleep(3);" "COMMIT;" | psql -X -q -v ON_ERROR_STOP=1 -d "$db" >/dev/null ) &
t1=$!
sleep 1
out=$(printf '%s\n' "SET ROLE service_role;" "$WRITE;" | psql -X -q -d "$db" 2>&1 || true)
wait "$t1"
if grep -q 'needs the maker' <<<"$out" && [ "$(state)" = "true,false" ]; then
  echo "PASS  S1: a write during the no skipped its locked consent row and was refused"
else
  echo "FAIL  S1: write got '${out:-UPDATE landed}', state $(state)"; fail=1
fi

# S2: the write first, held open; the "no" arrives during it.
reset
( printf '%s\n' "BEGIN;" "SET LOCAL ROLE service_role;" "$WRITE;" "SELECT pg_sleep(3);" "COMMIT;" \
    | psql -X -q -v ON_ERROR_STOP=1 -d "$db" >/dev/null ) &
t1=$!
sleep 1
out=$(printf '%s\n' "BEGIN;" "SET LOCAL ROLE authenticated;" "SELECT set_config('request.jwt.claim.sub', '$A', true);" "$NO;" "COMMIT;" \
  | psql -X -q -d "$db" 2>&1 || true)
wait "$t1"
if ! grep -q 'ERROR' <<<"$out" && [ "$(state)" = "true,false" ]; then
  echo "PASS  S2: the no waited for the write, then cleared it"
else
  echo "FAIL  S2: no got '${out:-ok}', state $(state)"; fail=1
fi

# S3: a draft holding a summary is locked by another write for 5 s while A says
# no under the authenticated role's statement timeout (8 s on Supabase; 4 s
# here). lock_timeout (2 s) turns the wait into a caught 55P03: the "no" commits.
reset
q "UPDATE public.vet_reports SET ai_lead_text = 'Held.', ai_lead_model = 'model-x', ai_lead_verdict = '{\"outcome\":\"printed\",\"sentences\":[{\"text\":\"Held.\"}]}' WHERE id = '$DA0'" >/dev/null
( printf '%s\n' "BEGIN;" "SELECT 1 FROM public.vet_reports WHERE id = '$DA0' FOR UPDATE;" "SELECT pg_sleep(5);" "COMMIT;" \
    | psql -X -q -v ON_ERROR_STOP=1 -d "$db" >/dev/null ) &
t1=$!
sleep 1
out=$(printf '%s\n' "SET statement_timeout = '4s';" "BEGIN;" "SET LOCAL ROLE authenticated;" "SELECT set_config('request.jwt.claim.sub', '$A', true);" "$NO;" "COMMIT;" \
  | psql -X -q -d "$db" 2>&1 || true)
wait "$t1"
if grep -q '55P03' <<<"$out" && ! grep -q 'ERROR' <<<"$out" && [ "$(state)" = "false,false" ]; then
  echo "PASS  S3: a locked draft did not refuse the no (WARNING 55P03); the reaper bounds the summary left"
else
  echo "FAIL  S3: no got '${out:-ok}', state $(state)"; fail=1
fi

# S4 (pass 2, F1): a draft already holding a summary; the pipeline's write and
# A's "no" fired at the same moment, 100 times. A plain FOR SHARE deadlocked
# here and left the summary behind the "no". Every round must end clear.
left=0; refusedno=0
for i in $(seq 1 100); do
  reset
  q "UPDATE public.vet_reports SET ai_lead_text = 'Old.', ai_lead_model = 'model-x', ai_lead_verdict = '{\"outcome\":\"printed\",\"sentences\":[{\"text\":\"Old.\"}]}' WHERE id = '$DA0'" >/dev/null
  ( printf '%s\n' "SET ROLE service_role;" "$WRITE;" | psql -X -q -d "$db" >/dev/null 2>&1 || true ) &
  w1=$!
  out=$(printf '%s\n' "BEGIN;" "SET LOCAL ROLE authenticated;" "SELECT set_config('request.jwt.claim.sub', '$A', true);" "$NO;" "COMMIT;" \
    | psql -X -q -d "$db" 2>&1 || true)
  wait "$w1"
  grep -q 'ERROR' <<<"$out" && refusedno=$((refusedno + 1))
  [ "$(state)" = "true,false" ] || left=$((left + 1))
done
if [ "$left" = 0 ] && [ "$refusedno" = 0 ]; then
  echo "PASS  S4: 100 concurrent write-vs-no rounds, no summary left, no no refused"
else
  echo "FAIL  S4: $left rounds left a summary or lost the no; $refusedno refused the no"; fail=1
fi

# S5 (pass 2, F1a): the clear was skipped (S3's shape), so a summary sits on
# the draft after the "no". Send's settle must still land and clear it, as
# settleLeadForKeep writes it since pass 2 (no sentences or checker carried).
reset
q "UPDATE public.vet_reports SET ai_lead_text = 'Old.', ai_lead_model = 'model-x', ai_lead_verdict = '{\"outcome\":\"printed\",\"sentences\":[{\"text\":\"Old.\"}]}' WHERE id = '$DA0'" >/dev/null
q "ALTER TABLE public.ai_consent DISABLE TRIGGER trg_ai_consent_clear_draft_summary" >/dev/null
q "$NO" >/dev/null
q "ALTER TABLE public.ai_consent ENABLE TRIGGER trg_ai_consent_clear_draft_summary" >/dev/null
out=$(printf '%s\n' "SET ROLE service_role;" \
  "UPDATE public.vet_reports SET ai_lead_text = NULL, ai_lead_model = NULL, ai_lead_verdict = '{\"outcome\":\"printed\",\"fact_hash\":\"h\",\"at_send\":{\"printed\":false,\"reason\":\"not_on_sent_copy\"}}' WHERE id = '$DA0';" \
  | psql -X -q -d "$db" 2>&1 || true)
if ! grep -q 'ERROR' <<<"$out" && [ "$(state)" = "false,false" ] \
   && [ "$(q "SELECT ai_lead_text IS NULL AND ai_lead_verdict ? 'at_send' AND NOT ai_lead_verdict ? 'sentences' FROM public.vet_reports WHERE id = '$DA0'")" = t ]; then
  echo "PASS  S5: Send's settle lands after a skipped clear and leaves no model text"
else
  echo "FAIL  S5: settle got '${out:-ok}'"; fail=1
fi

if [ "$fail" = 0 ]; then echo "RACE PASS"; else echo "RACE FAILED"; exit 1; fi
