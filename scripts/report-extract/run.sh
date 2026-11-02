#!/usr/bin/env bash
# The clinic-AI extraction test end to end (CUL-2292): dump → print (Chromium) → extract (pypdf,
# pdfminer) → check, then the canary. Usage: scripts/report-extract/run.sh [<dir>]
#
# FONTCONFIG_FILE makes the sans Inter wherever this runs (fonts.conf); extract.py refuses a PDF
# that embedded anything else. The canary re-adds `tabular-nums` (CUL-2385) to one fixture and
# requires the check to go RED: a run whose canary stays green is measuring nothing, and fails.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dir="${1:-$(mktemp -d)}"
export FONTCONFIG_FILE="$here/fonts.conf"

deno run --allow-read --allow-write --allow-env "$here/dump.deno.ts" "$dir"
node "$here/print.mjs" "$dir"
python3 -I "$here/extract.py" "$dir"
deno run --allow-read --allow-env "$here/check.deno.ts" "$dir"

canary="$dir/canary"
mkdir -p "$canary"
for f in cooper.html cooper.s1.html; do
  sed 's#</style>#body{font-variant-numeric:tabular-nums;}</style>#' "$dir/$f" > "$canary/$f"
done
grep -q 'tabular-nums' "$canary/cooper.html" || { echo "canary: could not plant tabular-nums" >&2; exit 1; }
echo '["cooper","cooper.s1"]' > "$canary/fixtures.json"
node "$here/print.mjs" "$canary" >/dev/null
python3 -I "$here/extract.py" "$canary" >/dev/null
if deno run --allow-read --allow-env "$here/check.deno.ts" "$canary" --only cooper >"$canary/check.log" 2>&1; then
  echo "canary: re-adding tabular-nums stayed GREEN, so this run measures nothing (wrong face?)" >&2
  exit 1
fi
# Red for the right reason: lost text in the body (the band or the record lines), not a crash and
# not only a bold heading (adversarial pass 2).
if ! grep -qE 'lost \((band|record-lines)\)' "$canary/check.log"; then
  echo "canary: the check failed, but not on lost body text; its log:" >&2
  cat "$canary/check.log" >&2
  exit 1
fi
echo "canary: re-adding tabular-nums turns the check red ($(grep -m1 -o '^[0-9]* extraction failures' "$canary/check.log" || true))"
