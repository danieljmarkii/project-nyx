#!/usr/bin/env bash
# The two-session race on migration 114 (CUL-2339; rls-privacy-reviewer pass 1,
# R1 / R2). Called by run.sh after cases.sql, against the same scratch
# database. tx1 deletes the pet (the cascade removes the kept copy) and
# re-creates it under the same id, then holds its transaction open; tx2, a
# second READ COMMITTED session, re-inserts a kept copy meanwhile. Against the
# first cut (a ledger written at DELETE) tx2 landed once tx1 committed.
set -euo pipefail
db="$1"
PA='a1a1a1a1-0000-4000-8000-000000000001'
A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
q() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$db" -c "$1"; }
fail=0

race() { # $1 label, $2 the INSERT tx2 runs
  ( printf '%s\n' "BEGIN;" "SET LOCAL ROLE service_role;" \
      "DELETE FROM public.pets WHERE id = '$PA';" \
      "INSERT INTO public.pets VALUES ('$PA', '$A');" \
      "SELECT pg_sleep(3);" "COMMIT;" \
    | psql -X -q -v ON_ERROR_STOP=1 -d "$db" >/dev/null ) &
  local t1=$!
  sleep 1
  local out
  out=$(printf '%s\n' "\\set VERBOSITY verbose" "SET ROLE service_role;" "$2;" \
        | psql -X -q -d "$db" 2>&1 || true)
  wait "$t1"
  if grep -q 'ERROR:  23514' <<<"$out"; then
    echo "PASS  $1: tx2 refused (23514)"
  else
    echo "FAIL  $1: tx2 got: ${out:-INSERT landed}"; fail=1
  fi
}

# R1: the same id and label, a softer snapshot.
race 'R1 same id, softer snapshot' \
  "$(q "SELECT kins('d2d2d2d2-0000-4000-8000-00000000000a', 'K7Q2', '{\"facts\":[]}')")"
n=$(q "SELECT count(*) FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'")
[ "$n" = 0 ] && echo "PASS  R1 after: no row under the old id" || { echo "FAIL  R1 after: $n rows"; fail=1; }

# R2: a new id wearing a live kept copy's label.
q "$(q "SELECT kins('c1c1c1c1-0000-4000-8000-00000000000f', 'Q8R9', '{\"facts\":[3]}')")" >/dev/null
race 'R2 new id, old label' \
  "$(q "SELECT kins('c2c2c2c2-0000-4000-8000-000000000010', 'Q8R9', '{\"facts\":[]}')")"
n=$(q "SELECT count(*) FROM public.vet_reports WHERE short_id = 'Q8R9'")
[ "$n" = 0 ] && echo "PASS  R2 after: no row wears the old label" || { echo "FAIL  R2 after: $n rows"; fail=1; }

if [ "$fail" = 0 ]; then echo "RACE PASS"; else echo "RACE FAILED"; exit 1; fi
