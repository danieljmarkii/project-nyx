#!/bin/bash
set -euo pipefail

# Only run in remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "Installing dependencies..."
npm install

# Deno, pinned to CI's version (guards/sessionStart.test.ts holds the two together), so a
# session can run the Edge Functions suite before it pushes. Sweep 1 (CUL-2700): the run's
# only CI failure was a Deno test its session could not run. A failure here never stops
# the session; it only leaves `deno test` to CI.
DENO_VERSION=2.9.4
if ! deno --version 2>/dev/null | grep -q "^deno ${DENO_VERSION} "; then
  echo "Installing Deno ${DENO_VERSION}..."
  npm install -g "deno@${DENO_VERSION}" --silent || echo "Deno install failed: deno test runs in CI only."
fi

# Full history, so the steward's merge check finds a merge base with older open branches
# (sweep 1: four of six sessions hit REVIEW on a stale PR in a 50-commit clone).
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  echo "Fetching full git history..."
  git fetch --unshallow --quiet origin || echo "Unshallow failed: the merge check may need git fetch --unshallow."
fi

echo "Session start complete."
