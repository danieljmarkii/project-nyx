#!/usr/bin/env bash
#
# Preflight for the backlog-grooming pass — ASSERT the evidence base, never assume it.
#
# WHY THIS FILE EXISTS (CUL-921; docs/workflow-retro-2026-09.md §2 F3).
#
# Step 0 of the groomer skill used to be one line:
#
#     test -f .git/shallow && git fetch --unshallow
#
# which returns exit 1 whenever the clone is ALREADY complete — the success case.
# Measured 2026-09-12 by running it in both states: exit 0 while shallow (there was
# work to do), exit 1 once healthy. An unattended run that checks $? therefore aborts
# precisely when nothing is wrong, and a run that ignores $? learns nothing either way.
# The check was decoration in both directions.
#
# It also could not FETCH. `--unshallow` is the only fetch that line ever ran, so on a
# complete clone step 0 ran no fetch at all and left `origin/main` exactly as stale as
# the previous session left it — the other half of CUL-919's defect, and the reason
# step 1 had to carry a fetch of its own.
#
# So this script fetches unconditionally, then asserts two things and prints the value
# that failed:
#
#   (a) no shallow boundary lies on `origin/main`'s history;
#   (b) `git rev-list --count origin/main` >= the committed watermark in floor.json.
#
# WHY (a) IS NOT `test -f .git/shallow`, which is what CUL-921 literally specifies.
# A shallow boundary is per-fetch, not per-repo, and THE GROOMING PASS ITSELF CREATES
# ONE: step 4 needs a claim branch's tip date, and `git fetch --depth=1 origin <branch>`
# writes a fresh root into `.git/shallow`. Measured 2026-09-12 — after one such fetch
# `.git/shallow` exists while `git rev-list --count origin/main` still reads 837, i.e.
# main's history is completely intact and the pass has nothing to repair. The literal
# check would fail the next preflight over a branch nobody is reconciling, which is the
# C-38 shape: a guard that re-validates on every run also bricks what it failed to
# protect. The question this script exists to answer is "is the history I am about to
# reason about truncated?", so it asks exactly that, of exactly the ref it reasons about.
#
# The watermark is bumped BY HAND in an ordinary PR. Never by the pass: a floor the
# pass can lower is not a floor.
#
# Exit codes are distinct so an unattended caller can report WHICH assertion failed:
#   0  evidence base is sound
#   2  no `origin/main` — not a clone of this repo, or the remote is misnamed
#   3  floor.json missing or unparseable
#   4  assertion (a) failed — `origin/main`'s history is truncated
#   5  assertion (b) failed — `origin/main` is below the committed watermark

set -uo pipefail

REMOTE=origin
BRANCH=main
REF="$REMOTE/$BRANCH"

# Test seam, deliberately not a secret: the guard drives this script against a fixture
# repo with its own watermark. It is PRINTED on every run (see the evidence line at the
# bottom), so a pass that quietly pointed the floor somewhere lower would say so in its
# own output. The grooming pass never sets it.
default_floor="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/floor.json"
FLOOR_FILE="${GROOM_FLOOR_FILE:-$default_floor}"

die() { printf 'groom/preflight: %s\n' "$1" >&2; exit "$2"; }

# ---- fetch, unconditionally -------------------------------------------------------
# Failure is not fatal by itself: an offline run can still be sound if the clone is
# already complete and above the watermark. The assertions below decide, not the fetch.
if ! git fetch --quiet "$REMOTE" "$BRANCH" 2>/dev/null; then
  printf 'groom/preflight: warning — `git fetch %s %s` failed; judging the clone as-is\n' \
    "$REMOTE" "$BRANCH" >&2
fi

git rev-parse --verify --quiet "refs/remotes/$REF" >/dev/null \
  || die "no refs/remotes/$REF — is this a clone of the project repo?" 2

# ---- deepen, if and only if the boundary is on the ref we reason about -------------
shallow_file="$(git rev-parse --git-path shallow)"

# Number of commits reachable from the ref that are also shallow boundaries. 0 = intact.
truncation_depth() {
  [ -f "$shallow_file" ] || { printf '0'; return 0; }
  # `grep -c` prints its count AND exits 1 when that count is zero, so the fallback
  # replaces the value rather than being appended to it — the first draft did the
  # latter and produced the string "0\n0", which `[ -gt ]` rejects as non-numeric and
  # which reported a healthy clone as truncated. Caught by running it, not by reading it.
  local n
  n="$(git rev-list "$REF" 2>/dev/null | grep -c -F -x -f "$shallow_file")" || n=0
  printf '%s' "${n:-0}"
}

if [ "$(truncation_depth)" -gt 0 ]; then
  # Deepen the one ref that matters. Tolerate failure and re-assert below rather than
  # trusting the exit code — which is the whole lesson of the line this replaces.
  git fetch --quiet --unshallow "$REMOTE" "$BRANCH" 2>/dev/null \
    || git fetch --quiet --unshallow 2>/dev/null \
    || true
fi

boundary="$(truncation_depth)"
[ "$boundary" -eq 0 ] \
  || die "assertion (a) failed — $REF is TRUNCATED: $boundary of its commits are shallow boundaries. Run \`git fetch --unshallow\` and re-run." 4

# ---- assertion (b): the committed watermark ---------------------------------------
[ -r "$FLOOR_FILE" ] || die "floor file not readable: $FLOOR_FILE" 3

floor="$(sed -n 's/.*"min_commits_on_origin_main"[[:space:]]*:[[:space:]]*\([0-9]\{1,\}\).*/\1/p' "$FLOOR_FILE" | head -1)"
case "$floor" in
  ''|*[!0-9]*) die "could not read a numeric \"min_commits_on_origin_main\" from $FLOOR_FILE" 3 ;;
esac
[ "$floor" -gt 0 ] || die "\"min_commits_on_origin_main\" must be > 0 in $FLOOR_FILE (read: $floor)" 3

count="$(git rev-list --count "$REF")"
[ "$count" -ge "$floor" ] \
  || die "assertion (b) failed — $REF has $count commits, below the committed watermark of $floor. The clone is shallow, stale or partial; nothing in the grooming procedure is trustworthy until this passes." 5

printf 'groom/preflight: OK — %s at %s commits (watermark %s, %s) · history intact\n' \
  "$REF" "$count" "$floor" "$FLOOR_FILE"
