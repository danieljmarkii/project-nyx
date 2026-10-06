#!/usr/bin/env bash
#
# The `migration-numbers` CI job (CUL-1522). Fails a pull request that adds a migration
# whose NUMBER another open PR already holds, or that the base branch already carries
# under another name.
#
# WHY. Migrations are numbered by hand, so two PRs can each add the next number in
# different files: no textual conflict, and git never says a word. On 2026-10-05 two
# projects' dispatchers each kept their own migrations one at a time and both picked 084
# (#1064 parked, #1074 merged and applied to production). `scripts/steward/merge-check.sh`
# reports the same clash, but only against the branches a session names; this job reads
# every open PR, on every push, where nobody can skip it.
#
# A CLASH FAILS BOTH SIDES. This job re-runs only on its own PR's pushes, so a rule that
# failed only one side would leave the other's green standing even after the clash
# appeared (an older PR pushing a number a newer PR already took, measured by review
# before merge): a stale green could then merge a duplicate. Failing every run that sees
# the clash is fail-closed. The message says which PR renumbers: the one opened LATER
# (the higher PR number), and the base branch outranks every PR. The other side's check
# stays red until it is re-run (the Re-run button, or its next push) once the renumber
# lands: a stale red costs a click, a stale green costs a duplicate. Renumbering an unmerged file is safe even after `apply_migration` ran: the database
# keys a migration by its apply timestamp and name, never by the file's number (the
# steward skill §4).
#
# USAGE (the workflow passes these; locally, `gh` must be authenticated)
#   scripts/steward/migration-numbers.sh <owner/repo> <pr number> <base branch>
#
# EXIT 0 no clash · 1 a clash this PR must fix · 3 could not check (a failed read is never
# a pass).
#
# STATED BLIND SPOTS (C-38):
#   - A file counts as a migration when its name matches `supabase/migrations/<digits>_*.sql`
#     and the PR's diff ADDS it (added, renamed or copied in). Editing an existing file is
#     not a new number.
#   - A PR's files are what GitHub's PR files list says at the moment the job runs. A
#     clash made later, by another PR's push, shows up on that PR's run (it is the later
#     one) or on this PR's next run; nothing re-runs this job when the other PR changes.
#   - GitHub lists at most 3,000 files per PR, and a directory listing at 1,000 entries;
#     past either, a migration is not seen.
#   - A PR that renames a merged migration (080_a to 080_b) reads as adding 080_b, and
#     clashes with main's 080_a. Accepted: a renamed applied migration deserves a look.

set -uo pipefail
export LC_ALL=C

die() {
  echo "migration-numbers: $*" >&2
  exit 3
}

[ $# -eq 3 ] || die "usage: migration-numbers.sh <owner/repo> <pr number> <base branch>"
repo=$1
pr=$2
base=$3
case "$pr" in '' | *[!0-9]*) die "not a PR number: $pr" ;; esac
command -v gh >/dev/null 2>&1 || die "needs gh on PATH"
command -v jq >/dev/null 2>&1 || die "needs jq on PATH"

tmp=$(mktemp -d) || die "cannot create a temporary directory"
trap 'rm -rf "$tmp"' EXIT

MIG_RE='^supabase/migrations/[0-9]+_[^/]*\.sql$'

# gh --paginate prints one JSON array per page, back to back; jq reads that stream.
gh api --paginate "repos/$repo/pulls?state=open&per_page=100" >"$tmp/pulls.json" 2>"$tmp/err" ||
  die "could not list open PRs: $(head -c 200 "$tmp/err")"
jq -r '.[] | .number' "$tmp/pulls.json" >"$tmp/open" 2>"$tmp/err" ||
  die "could not read the open PR list: $(head -c 200 "$tmp/err")"
# This run's own PR is always checked, even if the listing raced its opening.
{ cat "$tmp/open"; echo "$pr"; } | sort -n -u >"$tmp/prs"

# One line per added migration: "<pr>\t<file name>".
: >"$tmp/held"
while read -r n; do
  [ -n "$n" ] || continue
  gh api --paginate "repos/$repo/pulls/$n/files?per_page=100" >"$tmp/files.json" 2>"$tmp/err" ||
    die "could not list the files of #$n: $(head -c 200 "$tmp/err")"
  jq -r --arg re "$MIG_RE" --arg n "$n" '.[]
      | select(.status == "added" or .status == "renamed" or .status == "copied")
      | select(.filename | test($re))
      | "\($n)\t\(.filename | sub("^.*/"; ""))"' "$tmp/files.json" >>"$tmp/held" 2>"$tmp/err" ||
    die "could not read the files of #$n: $(head -c 200 "$tmp/err")"
done <"$tmp/prs"

gh api "repos/$repo/contents/supabase/migrations?ref=$base" >"$tmp/base.json" 2>"$tmp/err" ||
  die "could not list supabase/migrations on $base: $(head -c 200 "$tmp/err")"
jq -r '.[] | select(.type == "file") | .name' "$tmp/base.json" 2>"$tmp/err" | grep -E '^[0-9]+_.*\.sql$' | sort -u >"$tmp/base" ||
  true
[ -s "$tmp/base" ] || die "no migrations listed on $base; refusing to read an empty list as no clash"

# Names on stdin with the same migration number as $1, other than $2. Numbers compare as
# numbers: 84_ and 084_ are one slot.
same_slot() {
  awk -v n="$1" -v f="$2" '$0 != f && $0 ~ /^[0-9]+_/ && substr($0, 1, index($0, "_") - 1) + 0 == n'
}

mine=$(awk -F'\t' -v pr="$pr" '$1 == pr { print $2 }' "$tmp/held" | sort -u)
if [ -z "$mine" ]; then
  echo "migration-numbers: #$pr adds no migration"
  exit 0
fi

fail=0
while IFS= read -r file; do
  num=$((10#${file%%_*}))
  shown=$(printf "%03d" "$num")
  echo "#$pr adds $file"
  # The base branch already has this number in another file.
  on_base=$(same_slot "$num" "$file" <"$tmp/base" | paste -sd ',' - | sed 's/,/, /g')
  if [ -n "$on_base" ]; then
    echo "::error::migration $shown is already on $base as $on_base; renumber $file"
    fail=1
  fi
  # This PR adds the number twice.
  twice=$(printf '%s\n' "$mine" | same_slot "$num" "$file" | paste -sd ',' - | sed 's/,/, /g')
  if [ -n "$twice" ]; then
    echo "::error::this PR adds migration $shown twice: $file and $twice"
    fail=1
  fi
  # Another open PR adds the same number in another file: this run fails either way, and
  # the message names the side that renumbers (the later PR).
  while IFS=$'\t' read -r other theirs; do
    [ -n "$other" ] || continue
    if [ "$other" -lt "$pr" ]; then
      echo "::error::migration $shown is held by #$other ($theirs), opened before this PR; renumber $file"
    else
      echo "::error::migration $shown is also added by #$other ($theirs), opened after this PR; #$other renumbers, then re-run this check here"
    fi
    fail=1
  done < <(awk -F'\t' -v pr="$pr" -v num="$num" -v f="$file" \
    '$1 != pr && $2 != f && substr($2, 1, index($2, "_") - 1) + 0 == num' "$tmp/held")
done <<<"$mine"

if [ "$fail" -eq 1 ]; then
  echo "migration-numbers: FAIL. Take the next number free on $base and on every open PR, rename the file, and push."
  exit 1
fi
echo "migration-numbers: no clash"
exit 0
