#!/usr/bin/env bash
# The clinic-AI extraction test end to end (CUL-2292): dump → print (Chromium) → extract (pypdf,
# pdfminer) → check. Usage: scripts/report-extract/run.sh [<dir>]   (default: a fresh temp dir)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dir="${1:-$(mktemp -d)}"
deno run --allow-read --allow-write --allow-env "$here/dump.deno.ts" "$dir"
node "$here/print.mjs" "$dir"
python3 -I "$here/extract.py" "$dir"
deno run --allow-read --allow-env "$here/check.deno.ts" "$dir"
