#!/usr/bin/env bash
# The clinic-AI extraction test end to end (CUL-2292): dump → print (Chromium) → extract (pypdf,
# pdfminer) → check, then the canary. Usage: scripts/report-extract/run.sh [<dir>]
#
# The report embeds its own faces (VR2-11, CUL-2291), and extract.py refuses a PDF printed in any
# other. The canary cuts those faces out, so the sans falls to Inter (FONTCONFIG_FILE, fonts.conf),
# the face CUL-2385 was measured in, and re-adds `tabular-nums` to one fixture: the check must go
# RED there. A run whose canary stays green is measuring nothing, and fails. (With the embedded
# faces, tabular-nums selects nothing: their figures are already tabular in the cmap.)
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
  sed -e 's#@font-face{[^}]*}##g' -e 's#</style>#body{font-variant-numeric:tabular-nums;}</style>#' "$dir/$f" > "$canary/$f"
done
grep -q 'tabular-nums' "$canary/cooper.html" || { echo "canary: could not plant tabular-nums" >&2; exit 1; }
if grep -q '@font-face' "$canary/cooper.html"; then echo "canary: could not cut the embedded faces" >&2; exit 1; fi
echo '["cooper","cooper.s1"]' > "$canary/fixtures.json"
node "$here/print.mjs" "$canary" >/dev/null
python3 -I "$here/extract.py" "$canary" --face inter >/dev/null
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

# The embedded faces' canary (VR2-11): the same tabular-nums on the EMBEDDED faces must stay GREEN.
# Their subsets carry no GSUB, so the feature has no alternate glyph to swap in; a face re-subset with
# GSUB (and its tnum) back turns this red. That the default figures ARE tabular is proven from the
# bytes by printAssetsV2.test.ts.
frozen="$dir/frozen"
mkdir -p "$frozen"
for f in cooper.html cooper.s1.html; do
  sed 's#</style>#body{font-variant-numeric:tabular-nums;}</style>#' "$dir/$f" > "$frozen/$f"
done
grep -q '@font-face' "$frozen/cooper.html" || { echo "freeze canary: the embedded faces are missing" >&2; exit 1; }
echo '["cooper","cooper.s1"]' > "$frozen/fixtures.json"
node "$here/print.mjs" "$frozen" >/dev/null
python3 -I "$here/extract.py" "$frozen" >/dev/null
if ! deno run --allow-read --allow-env "$here/check.deno.ts" "$frozen" --only cooper >"$frozen/check.log" 2>&1; then
  echo "freeze canary: tabular-nums on the embedded faces lost text; an alternate glyph is back:" >&2
  cat "$frozen/check.log" >&2
  exit 1
fi
echo "freeze canary: tabular-nums on the embedded faces loses nothing"
