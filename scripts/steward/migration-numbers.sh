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
# WHO HOLDS A NUMBER. The PR opened first (the lower PR number). A symmetric rule would
# turn BOTH PRs red with nothing that re-runs either once one renumbers, so the job fails
# only the later PR, and tells the earlier one in its log. The base branch outranks every
# PR. Renumbering an unmerged file is safe even after `apply_migration` ran: the database
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
#   - GitHub lists at most 3,000 files per PR; a migration past that is not seen.

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

mine=$(awk -F'\t' -v pr="$pr" '$1 == pr { print $2 }' "$tmp/held" | sort -u)
if [ -z "$mine" ]; then
  echo "migration-numbers: #$pr adds no migration"
  exit 0
fi

fail=0
while IFS= read -r file; do
  num=${file%%_*}
  echo "#$pr adds $file"
  # The base branch already has this number in another file.
  on_base=$(grep -E "^${num}_" "$tmp/base" | grep -vxF "$file" | paste -sd ',' - | sed 's/,/, /g')
  if [ -n "$on_base" ]; then
    echo "::error::migration $num is already on $base as $on_base; renumber $file"
    fail=1
  fi
  # This PR adds the number twice.
  twice=$(printf '%s\n' "$mine" | grep -E "^${num}_" | grep -vxF "$file" | paste -sd ',' - | sed 's/,/, /g')
  if [ -n "$twice" ]; then
    echo "::error::this PR adds migration $num twice: $file and $twice"
    fail=1
  fi
  # Another open PR adds the same number in another file. The earlier PR holds it.
  while IFS=$'\t' read -r other theirs; do
    [ -n "$other" ] || continue
    if [ "$other" -lt "$pr" ]; then
      echo "::error::migration $num is held by #$other ($theirs), opened before this PR; renumber $file"
      fail=1
    else
      echo "note: #$other, opened after this PR, also adds migration $num ($theirs); it is that PR's to renumber"
    fi
  done < <(awk -F'\t' -v pr="$pr" -v num="$num" -v f="$file" \
    '$1 != pr && index($2, num "_") == 1 && $2 != f' "$tmp/held")
done <<<"$mine"

if [ "$fail" -eq 1 ]; then
  echo "migration-numbers: FAIL. Take the next number free on $base and on every open PR, rename the file, and push."
  exit 1
fi
echo "migration-numbers: no clash"
exit 0
