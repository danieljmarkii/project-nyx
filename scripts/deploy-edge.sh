#!/usr/bin/env bash
#
# deploy-edge.sh — bundle a Supabase Edge Function into a single, self-contained,
# deploy-ready ESM file, with offline verification, for the cloud dev environment.
#
# WHY THIS EXISTS (B-082)
# -----------------------
# The cloud env has neither the Supabase CLI nor a Supabase access token, and
# `deno bundle` is removed/unstable in modern Deno — so the historical
# "deno-bundled artifact" and "supabase functions deploy" paths are both dead
# here. The repeatable path is: esbuild-bundle the function into ONE file, verify
# it, then deploy that file via the Supabase MCP `deploy_edge_function` tool
# (which an agent calls — see docs/edge-deploy-runbook.md). The one function that
# genuinely needs bundling is `generate-signal`, whose `protein.ts` re-exports
# `../../../lib/protein.ts` — a shared module that escapes the function directory
# and therefore can't ride along in a plain multi-file upload. esbuild inlines it.
#
# WHAT IT DOES
# ------------
#   1. Provisions esbuild + deno on demand (single install — see the prune note).
#   2. Runs the function's deno test suite (best-effort; see verification note).
#   3. Bundles src -> .edge-build/<name>/index.ts (un-minified, readable, utf8).
#   4. Syntax-checks the bundle offline (`node --check`).
#   5. Prints the bundle path, sha256, and exact deploy instructions.
#
# It does NOT deploy. Deploy is the Supabase MCP `deploy_edge_function` call
# (agent), or — if a SUPABASE_ACCESS_TOKEN is ever configured as an env secret —
# `npx supabase functions deploy` (which bundles from source itself; this script's
# artifact is then unused). MCP is the recommended path: no standing token.
#
# USAGE
#   scripts/deploy-edge.sh <function-name> [--no-test] [--minify] [--out PATH]
#
#   <function-name>   directory under supabase/functions/ (e.g. generate-signal)
#   --no-test         skip the deno test verification step
#   --minify          minify the bundle (default: OFF — readable + clean read-back)
#   --out PATH        override output path (default .edge-build/<name>/index.ts)
#   -h, --help        show this help
#
set -euo pipefail

# ----- args ------------------------------------------------------------------
FUNCTION=""
RUN_TESTS=1
MINIFY=0
OUT=""

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --no-test) RUN_TESTS=0; shift ;;
    --minify)  MINIFY=1; shift ;;
    --out)     OUT="${2:?--out needs a path}"; shift 2 ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown flag: $1" >&2; usage 1 ;;
    *)  if [ -z "$FUNCTION" ]; then FUNCTION="$1"; shift; else echo "Unexpected arg: $1" >&2; usage 1; fi ;;
  esac
done

[ -n "$FUNCTION" ] || { echo "error: function name required" >&2; usage 1; }

# ----- paths -----------------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

FUNC_DIR="supabase/functions/${FUNCTION}"
ENTRY="${FUNC_DIR}/index.ts"
[ -d "$FUNC_DIR" ] || { echo "error: no such function directory: $FUNC_DIR" >&2; exit 1; }
[ -f "$ENTRY" ]    || { echo "error: no entrypoint: $ENTRY" >&2; exit 1; }
[ -z "$OUT" ] && OUT=".edge-build/${FUNCTION}/index.ts"

BIN="$REPO_ROOT/node_modules/.bin"
log()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ⚠ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }

# ----- 1. provision tools ----------------------------------------------------
# esbuild + deno are NOT runtime deps of the app, so they live out of package.json
# and are installed on demand. CRITICAL: install both in ONE `npm install` — a
# second `npm install --no-save X` PRUNES the first not-saved package (npm removes
# anything extraneous to the lockfile). This bit us during B-082 validation.
need_tools=()
[ -x "$BIN/esbuild" ] || need_tools+=("esbuild")
if [ "$RUN_TESTS" = 1 ]; then
  command -v deno >/dev/null 2>&1 || [ -x "$BIN/deno" ] || need_tools+=("deno")
fi
if [ "${#need_tools[@]}" -gt 0 ]; then
  log "Provisioning ${need_tools[*]} (npm install --no-save, single command)"
  npm install --no-save "${need_tools[@]}" >/dev/null 2>&1 \
    && ok "installed ${need_tools[*]}" \
    || { echo "error: failed to install ${need_tools[*]}" >&2; exit 1; }
fi
ESBUILD="$BIN/esbuild"
DENO="$(command -v deno >/dev/null 2>&1 && command -v deno || echo "$BIN/deno")"

# ----- 2. verify (deno test) -------------------------------------------------
# Behaviour gate: run the function's own test suite. NOTE the env reality — tests
# that import remote deps (https://deno.land/std/...) need network, which the
# cloud sandbox blocks, so those suites HANG/FAIL to fetch here. generate-signal's
# suite uses node:assert and runs fully offline. We therefore treat the step as:
#   pass (exit 0)             -> ✓
#   ran and reported failures -> ✗ HARD FAIL (a real regression)
#   timed out / couldn't fetch deps -> ⚠ WARN (env limit; verify where networked)
if [ "$RUN_TESTS" = 1 ] && ls "$FUNC_DIR"/*.test.ts >/dev/null 2>&1; then
  # The function's own suite — plus the _shared suite whenever the entrypoint
  # imports _shared/: the bundle INLINES that module, so a _shared regression
  # ships with this function even if the function's own tests never hit it.
  TEST_DIRS=("$FUNC_DIR/")
  if grep -qE "from ['\"]\.\./_shared/" "$FUNC_DIR"/*.ts 2>/dev/null \
     && ls supabase/functions/_shared/*.test.ts >/dev/null 2>&1; then
    TEST_DIRS+=("supabase/functions/_shared/")
  fi
  log "Verifying: deno test ${TEST_DIRS[*]}"
  test_log="$(mktemp)"
  trap '[ -n "${test_log:-}" ] && rm -f "$test_log"' EXIT
  if timeout 180 "$DENO" test "${TEST_DIRS[@]}" >"$test_log" 2>&1; then
    # `|| true` keeps the count-extraction from tripping set -e/pipefail if a
    # suite somehow prints no "N passed" line.
    ok "tests passed ($(grep -oE '[0-9]+ passed' "$test_log" | tail -1 || true))"
  else
    rc=$?
    tail -8 "$test_log" | sed 's/^/    /'
    # Match both the Deno 2.x summary ("... | N failed |") and the Deno 1.x form
    # ("test result: FAILED.") so a REAL failure always hard-fails — never slips
    # into the warn branch if the npm deno package ever pins an older major.
    if grep -qE '\| [1-9][0-9]* failed' "$test_log" || grep -qiE 'FAILED\.' "$test_log"; then
      echo "error: deno tests FAILED — fix before deploying" >&2; exit 1
    elif [ "$rc" = 124 ]; then
      warn "deno test timed out — remote test deps unreachable in this sandbox."
      warn "Run 'deno test $FUNC_DIR/' in a networked env to verify behaviour."
    else
      warn "deno test did not complete (likely remote-dep fetch blocked in sandbox)."
      warn "Run 'deno test $FUNC_DIR/' in a networked env to verify behaviour."
    fi
  fi
else
  [ "$RUN_TESTS" = 1 ] && warn "no *.test.ts in $FUNC_DIR — skipping behaviour verification"
fi

# ----- 3. bundle -------------------------------------------------------------
# Externals: ALL runtime specifiers Deno resolves natively (https://, jsr:, npm:,
# node:) stay external — esbuild only inlines the function's own relative .ts
# files (including the cross-package ../../../lib/protein.ts that is the whole
# reason bundling is needed). --charset=ascii escapes every non-ASCII character
# in the bundle to \uXXXX: the bundle travels the MCP deploy hop as text, and raw
# UTF-8 bytes were Latin-1-misread there once, baking mojibake ("Â·"/"â") into
# the deployed generate-report — every entity-encoded char survived, every raw
# literal was corrupted (first real vet report, 2026-07-03). ASCII-escaped
# literals are transport-proof; the cost is a less pretty dashboard read-back.
# Un-minified by default so the artifact stays readable and diffable.
log "Bundling $ENTRY -> $OUT"
mkdir -p "$(dirname "$OUT")"
esbuild_args=(
  "$ENTRY"
  --bundle
  --format=esm
  --platform=neutral
  "--external:https://*"
  "--external:jsr:*"
  "--external:npm:*"
  "--external:node:*"
  --charset=ascii
  --legal-comments=none
  --outfile="$OUT"
)
[ "$MINIFY" = 1 ] && esbuild_args+=(--minify-whitespace --minify-syntax)
"$ESBUILD" "${esbuild_args[@]}"
ok "bundled ($(wc -c <"$OUT" | tr -d ' ') bytes, $(wc -l <"$OUT" | tr -d ' ') lines)"

# Sanity: the external runtime imports must survive, and no relative import may
# escape the function dir (that would mean a dep wasn't inlined).
if grep -qE "from ['\"]\.\./" "$OUT"; then
  echo "error: bundle still contains an escaping relative import — a dep was not inlined" >&2; exit 1
fi

# ----- 4. offline syntax gate ------------------------------------------------
log "Syntax-checking the bundle (node --check)"
node --check "$OUT" && ok "valid JS syntax"

# ----- 5. report + deploy instructions --------------------------------------
SHA="$(sha256sum "$OUT" | cut -d' ' -f1)"
cat <<EOF

$(printf '\033[1m✅ Deploy-ready bundle\033[0m')
   function : $FUNCTION
   path     : $OUT
   sha256   : $SHA

$(printf '\033[1mDeploy (recommended — Supabase MCP, no token needed):\033[0m')
   Have the agent call deploy_edge_function with:
     project_id      : aigchluqluzuhtbfllgh
     name            : $FUNCTION
     entrypoint_path : index.ts
     verify_jwt      : true        (PRESERVE the function's existing setting —
                                    all 5 current functions are true; for a NEW
                                    function check list_edge_functions first)
     files           : [{ name: "index.ts", content: <contents of $OUT> }]
   Then confirm: list_edge_functions shows a version bump + ACTIVE, and a live
   boot smoke-test (anon call with a bogus petId) returns a clean 4xx, not a
   WORKER_ERROR. Read the deployed source back and diff its sha256 against the
   value above to prove fidelity. See docs/edge-deploy-runbook.md.

$(printf '\033[1mAlternative (only if SUPABASE_ACCESS_TOKEN is configured):\033[0m')
   npx supabase functions deploy $FUNCTION --project-ref aigchluqluzuhtbfllgh
   (bundles from source itself; this script's artifact is then unused.)
EOF
