#!/usr/bin/env bash
# Replays migrations 104, 110, 113, 114, 115 and 116 on a LOCAL scratch Postgres
# and runs the behaviour probe for 116 (CUL-2336, CUL-2375). Never point this
# at production.
#   PGHOST=/tmp/pg116 PGPORT=54116 PGUSER=postgres scripts/probes/vet-report-116/run.sh
# MIGRATION_116=/dev/null replays without 116: D1 (the client deletes its own
# pet) and X1 (the service role deletes A's pet and re-inserts its id as B's)
# then land ('ok'), which is the proof the probe sees the holes 116 closes.
# (The L* and B* cases then fail on the missing ledger, as they should.)
# Exits non-zero on any case whose result differs from the one it wants.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
db="probe_vet_report_116"
case "${PGHOST:-}" in
  /tmp/*|localhost|127.0.0.1) ;;
  *) echo "refusing: PGHOST must be a local scratch server" >&2; exit 2 ;;
esac
# The sibling probes' databases hold grants to the same cluster-wide roles.
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS probe_vet_report_113" \
  -c "DROP DATABASE IF EXISTS probe_vet_report_114" \
  -c "DROP DATABASE IF EXISTS probe_vet_report_115" \
  -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
psql -X -q -d postgres -c "DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    DROP OWNED BY anon, authenticated, service_role CASCADE;
    DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;
  END IF; END \$\$" 2>/dev/null || true
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$1"; }
run "$root/scripts/probes/vet-report-113/bootstrap.sql"
run "$root/supabase/migrations/104_pets_server_id.sql"
run "$root/supabase/migrations/110_vet_reports_policy_rewrite.sql"
run "$root/supabase/migrations/113_vet_report_saved_copies.sql"
run "$root/supabase/migrations/114_vet_reports_kept_ids_never_reused.sql"
run "$root/supabase/migrations/115_pets_owner_immutable.sql"
run "$here/seed.sql"
run "${MIGRATION_116:-$root/supabase/migrations/116_pets_no_client_delete_ids_never_reused.sql}"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -P pager=off -f "$here/cases.sql"
