#!/usr/bin/env bash
# The two-session races on migration 118 §1b (CUL-2377; rls-privacy-reviewer
# pass 1, F1). Called by run.sh (full variant) after cases.sql, against the
# same scratch database. DA0 is A's draft with no summary yet.
#   S1: A's "no" is being written (held open 3 s) while the pipeline writes a
#       summary to DA0. The write must wait for the "no" and then be refused.
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
  echo "PASS  S1: the late write waited for the no and was refused"
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

if [ "$fail" = 0 ]; then echo "RACE PASS"; else echo "RACE FAILED"; exit 1; fi
