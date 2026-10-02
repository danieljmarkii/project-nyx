#!/usr/bin/env bash
# Prune remote branches whose pull request already merged (CUL-1490).
#
# Why: the repo never deleted head branches on merge, so by 2026-10 it carried
# ~958 remote branches, nearly all of them squash-merged long ago. Turning on
# "Automatically delete head branches" stops new ones; this clears the backlog.
#
# What it deletes, and only this: a branch with NO open PR whose CURRENT head is
# exactly the head of a merged PR. The SHA match is the safety: a branch someone
# pushed to after its PR merged has a different head and is kept. A branch with
# no PR at all is kept (it may be someone's unpublished work). Closed-but-unmerged
# PRs are kept unless you pass --include-closed, since their branch can be the
# only easy copy of a rejected design.
#
# Reversible: a deleted PR branch can be restored from its PR page ("Restore
# branch") for as long as GitHub keeps the commits.
#
# Usage (from the repo root, with `gh` authenticated):
#   scripts/repo-hygiene/prune-merged-branches.sh                   # dry run: list and count
#   scripts/repo-hygiene/prune-merged-branches.sh --delete          # delete merged-PR branches
#   scripts/repo-hygiene/prune-merged-branches.sh --delete --include-closed
set -euo pipefail

DELETE=0
INCLUDE_CLOSED=0
for arg in "$@"; do
  case "$arg" in
    --delete) DELETE=1 ;;
    --include-closed) INCLUDE_CLOSED=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

KEEP=(main)
current=$(git rev-parse --abbrev-ref HEAD)
KEEP+=("$current")

command -v gh >/dev/null || { echo "needs the GitHub CLI (gh), authenticated" >&2; exit 1; }

# Every PR from this repo (not forks): head branch, head SHA, state.
declare -A open_pr=() merged=() closed=() any_pr=()
while IFS=$'\t' read -r ref oid state; do
  [ -z "$ref" ] && continue
  any_pr["$ref"]=1
  case "$state" in
    OPEN) open_pr["$ref"]=1 ;;
    MERGED) merged["$ref $oid"]=1 ;;
    CLOSED) closed["$ref $oid"]=1 ;;
  esac
done < <(gh pr list --state all --limit 10000 \
  --json headRefName,headRefOid,state,isCrossRepository \
  --jq '.[] | select(.isCrossRepository | not) | [.headRefName, .headRefOid, .state] | @tsv')

# A failed `gh` inside the process substitution would leave the maps empty and
# report every branch as "no PR": safe (nothing deletes) but a lying dry run.
if [ "${#any_pr[@]}" -eq 0 ]; then
  echo "gh returned no pull requests; is it authenticated for this repo?" >&2
  exit 1
fi

candidates=()
total=0 kept_open=0 kept_closed=0 kept_moved=0 kept_no_pr=0
while read -r sha ref; do
  name=${ref#refs/heads/}
  total=$((total + 1))
  for k in "${KEEP[@]}"; do
    if [ "$name" = "$k" ]; then kept_open=$((kept_open + 1)); continue 2; fi
  done
  if [ -n "${open_pr[$name]:-}" ]; then
    kept_open=$((kept_open + 1))
  elif [ -n "${merged[$name $sha]:-}" ]; then
    candidates+=("$name")
  elif [ -n "${closed[$name $sha]:-}" ]; then
    if [ "$INCLUDE_CLOSED" -eq 1 ]; then candidates+=("$name"); else kept_closed=$((kept_closed + 1)); fi
  elif [ -n "${any_pr[$name]:-}" ]; then
    kept_moved=$((kept_moved + 1))
  else
    kept_no_pr=$((kept_no_pr + 1))
  fi
done < <(git ls-remote --heads origin)

echo "remote branches:                 $total"
echo "main, current or open PR (kept): $kept_open"
echo "closed unmerged PR (kept):       $kept_closed"
echo "pushed to after its PR (kept):   $kept_moved"
echo "no PR at all (kept):             $kept_no_pr"
echo "deletable:                       ${#candidates[@]}"

if [ "$DELETE" -eq 0 ]; then
  printf '  %s\n' "${candidates[@]}"
  echo
  echo "Dry run. Re-run with --delete to remove the ${#candidates[@]} branches above."
  exit 0
fi

# Batches keep each push small enough to retry by hand if the network drops.
for ((i = 0; i < ${#candidates[@]}; i += 50)); do
  git push origin --delete "${candidates[@]:i:50}"
done
echo "Deleted ${#candidates[@]} branches."
