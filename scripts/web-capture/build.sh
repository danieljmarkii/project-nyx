#!/usr/bin/env bash
# Builds the web bundle the capture script photographs (CUL-1895).
# The Supabase host is a name that cannot resolve (.invalid, RFC 6761) and the capture
# script answers every request to it from the fixture, so no build of this path can
# reach a real project or a real account's rows.
set -euo pipefail
OUT="${1:?usage: build.sh <out-dir>}"
cd "$(dirname "$0")/../.."
rm -rf "$OUT"
NYX_WEB_CAPTURE=1 \
EXPO_PUBLIC_SUPABASE_URL=https://fixture.nyx-capture.invalid \
EXPO_PUBLIC_SUPABASE_ANON_KEY=fixture-anon-key \
CI=1 npx expo export --clear --no-minify --platform web --output-dir "$OUT"
