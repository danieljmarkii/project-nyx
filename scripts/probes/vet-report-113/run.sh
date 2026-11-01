#!/usr/bin/env bash
# Replays migrations 110 and 113 on a LOCAL scratch Postgres and runs the
# behaviour probe (CUL-2287). Never point this at production.
#   PGHOST=/tmp/pg113 PGPORT=54113 PGUSER=postgres scripts/probes/vet-report-113/run.sh
# Exits non-zero on any case whose SQLSTATE differs from the one it wants.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
db="probe_vet_report_113"
case "${PGHOST:-}" in
  /tmp/*|localhost|127.0.0.1) ;;
  *) echo "refusing: PGHOST must be a local scratch server" >&2; exit 2 ;;
esac
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
# Roles are cluster-wide; tolerate a re-run.
psql -X -q -d postgres -c "DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    DROP OWNED BY anon, authenticated, service_role CASCADE;
    DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;
  END IF; END \$\$" 2>/dev/null || true
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$1"; }
run "$here/bootstrap.sql"
run "$root/supabase/migrations/110_vet_reports_policy_rewrite.sql"
run "${MIGRATION_113:-$root/supabase/migrations/113_vet_report_saved_copies.sql}"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -P pager=off -f "$here/cases.sql"
