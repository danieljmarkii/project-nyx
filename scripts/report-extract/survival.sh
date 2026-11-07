#!/usr/bin/env bash
# The print-survival test end to end (CUL-2291, row VR2-11; v2 spec §7), then its canaries.
# Usage: scripts/report-extract/survival.sh <dir>   (<dir> holds run.sh's dumped HTML)
#
# survival.mjs prints each sheet 1 (and once per mark class with that class hidden); survival.py
# rasterises at 200 dpi, blurs, thresholds, and holds the marks, the labels and the QR to the spec.
#
# THE CANARIES. A test that stays green when the marks it guards are broken is measuring nothing, so
# every run then breaks them on purpose, one regression per copy of a fixture, and requires each to
# fail for its own reason: the faint hatch and the pale partly-eaten fill this row replaced, a grey
# axis, a filled "so far" bar, a dashed line drawn solid and a solid one dashed, a QR printed under
# 0.5 mm a module or pointing somewhere with a query string, a caption that wraps, a label erased.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dir="${1:?usage: survival.sh <dir>}"

node "$here/survival.mjs" "$dir"
python3 -I "$here/survival.py" "$dir"

canary="$dir/survival-canary"
rm -rf "$canary"
mkdir -p "$canary"
# name | fixture | CSS (or an attribute edit) | the failure it must produce
mutants=(
  "hatch|mira|svg .hatch{stroke:#c8c9cc !important;}|hatch is"
  "partly|cooper|svg .bar.partly{fill:#d9a3b0 !important;}|a filled bar is"
  "grey-axis|cooper|svg .ax{fill:#a6a8ad !important;}|did not OCR"
  "erased|cooper|svg .rl{fill:#ffffff !important;}|did not OCR"
  "hollow|cooper|svg .bar.sofar{fill:#565961 !important;}|reads as filled"
  "dashed|trial-report-clean|svg .span.hollow{stroke-dasharray:none !important;}|reads as solid"
  "solid|mira|svg .span:not(.hollow):not(.dose){stroke-dasharray:3 3 !important;}|reads as dashed"
  "qr-small|cooper|svg.qr{width:13mm !important;height:13mm !important;}|QR modules print at"
  "caption|cooper|.qrcap{white-space:normal !important;word-break:break-all;display:block;width:24pt;}|caption wraps"
  "colophon|cooper|.colo{color:#8a8d94 !important;}|did not OCR"
  "qr-query|cooper|ATTR|decoded to"
)
names=()
for m in "${mutants[@]}"; do
  IFS='|' read -r name fixture css _ <<<"$m"
  src="$dir/$fixture.s1.html"
  [ -f "$src" ] || { echo "survival canary: fixture $fixture is missing" >&2; exit 1; }
  if [ "$css" = "ATTR" ]; then
    # The report names one URL and the QR encodes another: the decode must notice.
    sed 's#data-qr="https://getculprit.app[^"]*"#data-qr="https://getculprit.app/?r=1"#' "$src" > "$canary/m-$name.s1.html"
    grep -q 'data-qr="https://getculprit.app/?r=1"' "$canary/m-$name.s1.html" || { echo "survival canary: could not plant $name" >&2; exit 1; }
  else
    sed "s@</style>@${css}</style>@" "$src" > "$canary/m-$name.s1.html"
    grep -qF "$css" "$canary/m-$name.s1.html" || { echo "survival canary: could not plant $name" >&2; exit 1; }
  fi
  names+=("\"m-$name.s1\"")
done
(IFS=,; echo "[${names[*]}]") > "$canary/fixtures.json"
node "$here/survival.mjs" "$canary" >/dev/null
if python3 -I "$here/survival.py" "$canary" >"$canary/log" 2>&1; then
  echo "survival canary: every regression stayed GREEN, so the test measures nothing" >&2
  exit 1
fi
missed=0
for m in "${mutants[@]}"; do
  IFS='|' read -r name _ _ expect <<<"$m"
  if grep -E "m-$name · (A4|Letter)" "$canary/log" | grep -qF "$expect"; then
    echo "survival canary: $name turns the test red ($expect)"
  else
    echo "survival canary: $name stayed green (wanted \"$expect\")" >&2
    missed=1
  fi
done
if [ "$missed" -ne 0 ]; then
  echo "survival canary log:" >&2
  cat "$canary/log" >&2
  exit 1
fi
