#!/bin/bash
# SessionStart hook. Prints the orientation a session needs before it reads anything,
# and COMPUTES the triggers that a sentence in the manual would never fire.
#
# Why a hook and not a rule in CLAUDE.md: in the project this kit came from, a rule
# enforced by prose fired approximately never, and a rule enforced by a guard or a
# scheduled job had zero recorded misses. "Run a retro every ~10 sessions" was written
# into the manual on day X and ran zero times in the next ~36 owed. There is no third tier.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ── 1. Remote-only setup ──────────────────────────────────────────────────────────
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  # Cloud sessions arrive as a SHALLOW clone. Anything that reasons over history
  # (grooming, "has this shipped?", blame) silently sees only the last few dozen
  # commits and still looks complete. Deepen origin/main once, quietly.
  if [ -f .git/shallow ]; then
    timeout 60 git fetch --quiet --unshallow origin main 2>/dev/null \
      || timeout 30 git fetch --quiet origin main 2>/dev/null || true
  fi
  # {{INSTALL_COMMAND}}   e.g. `npm install --silent` — keep it idempotent and quiet.
fi

# ── 2. Orientation ────────────────────────────────────────────────────────────────
echo "── Session orientation ─────────────────────────────"
if [ -d docs/sessions ]; then
  echo "Newest session records:"
  ls docs/sessions/ 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}-' | sort -r | head -3 | sed 's/^/  • /'
fi

# ── 3. Retro trigger (computed, not remembered) ──────────────────────────────────
RETRO_EVERY=10
last_retro="$(ls docs/retros/ 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort -r | head -1 | cut -c1-10)"
if [ -n "$last_retro" ]; then
  since=$(ls docs/sessions/ 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}-' \
            | awk -v d="$last_retro" 'substr($0,1,10) > d' | wc -l | tr -d ' ')
  label="since the last retro ($last_retro)"
else
  since=$(ls docs/sessions/ 2>/dev/null | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-' || true)
  label="and no retro has run yet"
fi
if [ "${since:-0}" -ge "$RETRO_EVERY" ]; then
  echo "RETRO DUE — ${since} sessions ${label}. Run /retro before new work unless the PM says otherwise."
else
  echo "Retro: ${since:-0}/${RETRO_EVERY} sessions ${label}."
fi

# ── 4. Manual budget ─────────────────────────────────────────────────────────────
if [ -f CLAUDE.md ]; then
  size=$(wc -c < CLAUDE.md | tr -d ' ')
  ceiling=$(grep -oE 'CEILING_BYTES = [0-9_]+' guards/claudeMdBudget.test.ts 2>/dev/null | head -1 | sed -E 's/.*= //; s/_//g')
  echo "CLAUDE.md: ${size} B${ceiling:+ of a ${ceiling} B ceiling} (an addition is paid for by a deletion)."
fi
echo "Tracker: check the Needs PM state and In Progress claims before starting (/kickoff)."
echo "────────────────────────────────────────────────────"
exit 0
