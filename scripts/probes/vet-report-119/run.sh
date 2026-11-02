#!/usr/bin/env bash
# Replays migrations 110, 113, 114 and 119 on a LOCAL scratch Postgres and runs
# the behaviour probe for 119 (CUL-2445). Never point this at production.
#   PGHOST=/tmp/pg119 PGPORT=54119 PGUSER=postgres scripts/probes/vet-report-119/run.sh
# 118 is not replayed: 119 touches neither freeze function, and 118's other
# triggers fire on the AI summary columns only. MIGRATION_119=<file> replays a
# mutated copy instead (the PR records which mutants this probe kills).
# Exits non-zero on any case whose result differs from the one it wants.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
db="probe_vet_report_119"
case "${PGHOST:-}" in
  /tmp/*|localhost|127.0.0.1) ;;
  *) echo "refusing: PGHOST must be a local scratch server" >&2; exit 2 ;;
esac
# Earlier probes' databases hold grants to the same cluster-wide roles.
for old in probe_vet_report_113 probe_vet_report_114 probe_vet_report_118; do
  psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $old"
done
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
psql -X -q -d postgres -c "DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    DROP OWNED BY anon, authenticated, service_role CASCADE;
    DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;
  END IF; END \$\$" 2>/dev/null || true
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$1"; }
run "$root/scripts/probes/vet-report-113/bootstrap.sql"
run "$root/supabase/migrations/110_vet_reports_policy_rewrite.sql"
run "$root/supabase/migrations/113_vet_report_saved_copies.sql"
run "$root/supabase/migrations/114_vet_reports_kept_ids_never_reused.sql"
# 119's §6 backfill runs over this one kept copy, made before 119 exists.
run "$here/seed.sql"
# Supabase's default privileges give service_role every new public table; 119
# must revoke what it does not mean to grant.
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role"
run "${MIGRATION_119:-$root/supabase/migrations/119_vet_report_departures.sql}"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -P pager=off -f "$here/cases.sql"
