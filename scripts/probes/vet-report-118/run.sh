#!/usr/bin/env bash
# Replays 110, 113, 114, 100, 112 and 118 on a LOCAL scratch Postgres and runs
# the behaviour probe for 118 (CUL-2377). Never point this at production.
#   PGHOST=/tmp/pg118 PGPORT=54118 PGUSER=postgres scripts/probes/vet-report-118/run.sh
# 118's §3 (pg_cron and the job) is cut before the replay: a scratch Postgres
# has no pg_cron or pg_net. The schedule is checked by 118's VERIFY block.
# VARIANT=no118 replays without 118: W1 and W2 then leave the summary on the
# draft (the hole). VARIANT=no-arm replays 118 without §2's freeze arm: the
# clear then fails inside the withdrawal, the "no" still commits (W6's shape),
# and the summary stays. Both prove the probe sees what 118 changes.
# Exits non-zero on any case whose result differs from the one it wants.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
db="probe_vet_report_118"
case "${PGHOST:-}" in
  /tmp/*|localhost|127.0.0.1) ;;
  *) echo "refusing: PGHOST must be a local scratch server" >&2; exit 2 ;;
esac
variant="${VARIANT:-full}"
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
psql -X -q -d postgres -c "DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    DROP OWNED BY anon, authenticated, service_role CASCADE;
    DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;
  END IF; END \$\$" 2>/dev/null || true
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$1"; }
cut118="$(mktemp)"
trap 'rm -f "$cut118"' EXIT
python3 - "$root/supabase/migrations/118_vet_report_draft_lifetime.sql" "$variant" > "$cut118" <<'PY'
import sys
src, variant = sys.argv[1], sys.argv[2]
s = open(src).read()
bar = '-- ============================================================\n'
def section(title):
    i = s.index(bar + title + '\n')
    return i
s3, verify = section('-- §3. The schedule'), section('-- VERIFY (after apply)')
out = s[:s3] + s[verify:]
if variant == 'no-arm':
    s2 = out.index(bar + "-- §2. 110's client freeze: the withdrawal-clear arm\n")
    end = out.index(bar + '-- VERIFY (after apply)')
    out = out[:s2] + out[end:]
if variant == 'no118':
    out = '-- 118 left out (VARIANT=no118)\n'
sys.stdout.write(out)
PY
run "$root/scripts/probes/vet-report-113/bootstrap.sql"
run "$root/supabase/migrations/110_vet_reports_policy_rewrite.sql"
run "$root/supabase/migrations/113_vet_report_saved_copies.sql"
run "$root/supabase/migrations/114_vet_reports_kept_ids_never_reused.sql"
# 112 seeds two app_config keys; the stand-in holds only the shape it writes.
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "CREATE TABLE public.app_config (key text PRIMARY KEY, value jsonb NOT NULL)"
# Supabase's default privileges give service_role every new public table; 100
# then revokes what it revokes. 113's bootstrap granted only tables it made.
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role"
run "$root/supabase/migrations/100_ai_consent.sql"
run "$root/supabase/migrations/112_report_summary_consent.sql"
run "$cut118"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -P pager=off -v variant="$variant" -f "$here/cases.sql"
