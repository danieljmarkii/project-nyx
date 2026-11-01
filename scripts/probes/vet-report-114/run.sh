#!/usr/bin/env bash
# Replays migrations 110, 113 and 114 on a LOCAL scratch Postgres and runs the
# behaviour probe for 114 (CUL-2339). Never point this at production.
#   PGHOST=/tmp/pg114 PGPORT=54114 PGUSER=postgres scripts/probes/vet-report-114/run.sh
# MIGRATION_114=/dev/null replays without 114: E3 and E4 then land (the
# cases that want a refusal fail), which is the proof the probe can see them.
# Exits non-zero on any case whose SQLSTATE differs from the one it wants.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
db="probe_vet_report_114"
case "${PGHOST:-}" in
  /tmp/*|localhost|127.0.0.1) ;;
  *) echo "refusing: PGHOST must be a local scratch server" >&2; exit 2 ;;
esac
# 113's probe database holds grants to the same cluster-wide roles, so it goes
# too, or the roles below cannot be dropped.
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS probe_vet_report_113" \
  -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
# Roles are cluster-wide; tolerate a re-run.
psql -X -q -d postgres -c "DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    DROP OWNED BY anon, authenticated, service_role CASCADE;
    DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;
  END IF; END \$\$" 2>/dev/null || true
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$1"; }
# 113's stub of the Supabase pieces the guards touch (see its header).
run "$root/scripts/probes/vet-report-113/bootstrap.sql"
run "$root/supabase/migrations/110_vet_reports_policy_rewrite.sql"
run "$root/supabase/migrations/113_vet_report_saved_copies.sql"
run "${MIGRATION_114:-$root/supabase/migrations/114_vet_reports_kept_ids_never_reused.sql}"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -P pager=off -f "$here/cases.sql"
