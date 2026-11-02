#!/usr/bin/env bash
# Replays 021 and 117 on a LOCAL scratch Postgres over a minimal stand-in for
# Supabase's auth and storage schemas, and runs the behaviour probe for 117
# (CUL-2327, CUL-2397). Never point this at production.
#   PGHOST=/tmp/pg117 PGPORT=54117 PGUSER=postgres scripts/probes/vet-report-117/run.sh
# MIGRATION_117=/dev/null replays without 117: D1, D2 and D3 (a deleted
# account's still-valid token writing a label) then land, which is the proof
# the probe sees the hole 117 closes.
# Exits non-zero on any case whose result differs from the one it wants.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
db="probe_vet_report_117"
case "${PGHOST:-}" in
  /tmp/*|localhost|127.0.0.1) ;;
  *) echo "refusing: PGHOST must be a local scratch server" >&2; exit 2 ;;
esac
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
psql -X -q -d postgres -c "DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    DROP OWNED BY anon, authenticated, service_role CASCADE;
    DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;
  END IF; END \$\$" 2>/dev/null || true
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$1"; }
run "$here/bootstrap.sql"
run "$root/supabase/migrations/021_medication_photos_rls.sql"
run "$here/seed.sql"
run "${MIGRATION_117:-$root/supabase/migrations/117_medication_photos_live_account_only.sql}"
run "$here/cases.sql"
