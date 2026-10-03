#!/usr/bin/env bash
#
# Merge check for a session branch (CUL-1497). Answers, without touching the working
# tree, the index or any branch:
#
#   1. Does this branch land clean on main?
#   2. If it does, would landing it drop lines that main has and this branch never saw,
#      add a duplicate migration number, or commit a conflict marker? The first is the
#      shape of a conflict fix that reverts someone else's merged work.
#   3. Which other open PRs does it collide with, and which collisions would landing it
#      cause?
#
# WHY THIS FILE EXISTS. Sessions end with `/wrap and merge`, and until this script the
# "and merge" half was improvised. Clean merges were never the risk; the resolution is,
# and a session never notices a resolution that quietly dropped someone else's lines. So
# this script decides the mechanical questions and leaves only judgment to the session.
# The rules for acting on its verdict are `.claude/skills/steward/SKILL.md`; the
# measurements behind it are `docs/engineering-lessons.md` §P-15.
#
# USAGE
#   scripts/steward/merge-check.sh [--base <ref>] [--head <ref>] [--no-fetch] [--all] [<branch> ...]
#
#   --base      what the branch lands on (default origin/main)
#   --head      what is checked (default HEAD). After a merge, `--head origin/main` asks
#               only question 3: which open PRs now conflict with main.
#   --no-fetch  skip the fetch (offline, or the refs are already current)
#   --all       list every lost line, not the first 20
#   <branch>    other open PRs' head branches as named on origin (claude/foo)
#
#   Runs from anywhere in the repository; every path is taken from its root.
#
# VERDICT (the last line) and exit code:
#   MERGE CHECK: CLEAN      0  lands clean; nothing below is reported
#   MERGE CHECK: CONFLICT   1  conflicts with the base: merge it in, resolve, run this again
#   MERGE CHECK: REVIEW     2  lands clean, but read the lost lines, duplicate migration
#                              numbers or conflict markers first
#   (exit 3)                   could not check (usage, environment, a shallow clone, a file
#                              name it cannot read), on stderr. Never a pass.
#
# Collisions with other PRs are reported and never move the verdict: they are the other
# PR's to resolve after this one merges, and nothing on this branch can fix them. The
# landing is simulated as the squash merge this repo uses, so a PR stacked on this one
# shows the conflict it will meet once this one is squashed.
#
# STATED BLIND SPOTS, because an undocumented one reads as coverage (C-38):
#   - Only lines main ADDED after the fork are audited. A resolution that brings back a
#     line main DELETED after the fork is not reported.
#   - A lost line is matched by its exact text, within its own file. A line that existed
#     anywhere in the file at the fork point counts as seen, and one that still appears
#     anywhere in the landed file counts as kept. So dropping a second copy of a line main
#     added is not reported, and neither is a removal inside a binary file or a line with
#     no ASCII letter or digit in it (a lone `}`).
#   - Reported and harmless, by design: a line the session rewrote after merging main in
#     (tagged "replaced"), and a line it moved to another file (tagged "deleted"). The
#     session reads each and says why in the PR. A "replaced" tag is not reassurance:
#     reverting main's text to the branch's old text is also a replacement.
#   - The fork point is read off the branch's first-parent chain, so a branch that was
#     rebased has its fork moved up, and a rebased resolution reads as seen.
#   - Duplicate migration numbers are checked against main only, not between open PRs;
#     nor are other hand-numbered lists (the §C / §P entries of engineering-lessons.md).
#   - A changed path that git still quotes with core.quotePath off (a tab, a quote or a
#     backslash in its name) stops the check with exit 3 rather than being skipped.
#   - The check reads commits. Uncommitted work is not checked; a note says so.
#   - It finds textual collisions only. Two PRs that merge clean and break each other at
#     runtime are CI's to catch on main.

set -uo pipefail
export LC_ALL=C               # one collation for every sort and comm below
export GIT_LITERAL_PATHSPECS=1 # `app/event/[id].tsx` is a file name, never a glob

die() {
  echo "merge-check: $*" >&2
  exit 3
}

# Paths with non-ASCII characters print raw rather than C-quoted. Every git call below
# goes through this, so a quoted name can only mean a character the check refuses.
git() {
  command git -c core.quotePath=false "$@"
}

base_ref="origin/main"
head_ref="HEAD"
fetch=1
max_list=20
others=()

while [ $# -gt 0 ]; do
  case "$1" in
    --base)
      [ $# -ge 2 ] || die "--base needs a ref"
      base_ref="$2"
      shift 2
      ;;
    --head)
      [ $# -ge 2 ] || die "--head needs a ref"
      head_ref="$2"
      shift 2
      ;;
    --no-fetch)
      fetch=0
      shift
      ;;
    --all)
      max_list=0
      shift
      ;;
    -h | --help)
      awk '/^# USAGE/ { on = 1 } /^# VERDICT/ { on = 0 } on' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown option $1 (see --help)" ;;
    *)
      others+=("$1")
      shift
      ;;
  esac
done

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git work tree"
# Pathspecs are relative to the working directory, and `diff --name-only` prints paths
# relative to the root: run from a subdirectory, the two disagree and every per-file
# check silently reads nothing. So the check always runs from the root.
cd "$(git rev-parse --show-toplevel)" || die "cannot reach the repository root"

# `merge-tree --write-tree` (a merge computed without a working tree) arrived in git 2.38.
read -r git_major git_minor < <(command git version | sed -E 's/^git version ([0-9]+)\.([0-9]+).*/\1 \2/')
if [ "${git_major:-0}" -lt 2 ] || { [ "$git_major" -eq 2 ] && [ "${git_minor:-0}" -lt 38 ]; }; then
  die "needs git 2.38 or newer for merge-tree --write-tree (have: $(command git version))"
fi

tmp=$(mktemp -d) || die "cannot create a temporary directory"
trap 'rm -rf "$tmp"' EXIT

# origin/foo -> foo, anything else -> empty (a local ref is never fetched).
branch_on_origin() {
  case "$1" in
    origin/*) printf '%s' "${1#origin/}" ;;
    *) printf '' ;;
  esac
}

# Merge $2 into $1 without a working tree. Sets mt_tree (the result, conflict markers and
# all) and mt_conflicts (the conflicted paths, one per line). Returns 0 clean, 1 conflict;
# anything else ends the script. Called directly, never inside $(...): a `die` in a
# subshell would exit only the subshell and read as a conflict. Only stdout is data; a
# warning on stderr must never be read as the tree id.
mt_tree=""
mt_conflicts=""
merge_of() {
  local out rc
  out=$(git merge-tree --write-tree --name-only --no-messages "$1" "$2" 2>"$tmp/merge-tree.err")
  rc=$?
  case $rc in
    0 | 1) ;;
    *) die "git merge-tree failed on $1 and $2: $(cat "$tmp/merge-tree.err")" ;;
  esac
  mt_tree=$(printf '%s\n' "$out" | head -n 1)
  git cat-file -e "$mt_tree^{tree}" 2>/dev/null || die "git merge-tree printed no tree for $1 and $2"
  if [ "$rc" -eq 0 ]; then
    mt_conflicts=""
    return 0
  fi
  mt_conflicts=$(printf '%s\n' "$out" | tail -n +2 | sed '/^$/d' | sort -u)
  [ -n "$mt_conflicts" ] || die "git merge-tree reported a conflict on $1 and $2 but named no file"
  return 1
}

# Paths changed between two tree-ish, one per line. Renames count as a delete plus an add,
# so a moved file's lines are judged like any other removal.
changed_paths() {
  git diff --name-only --no-renames --no-ext-diff "$1" "$2" | sort -u
}

refuse_quoted() {
  if printf '%s\n' "$1" | grep -q '^"'; then
    die "a changed path has a character git quotes (a tab, a quote or a backslash); check it by hand: $(printf '%s\n' "$1" | grep '^"' | head -n 1)"
  fi
}

count_lines() {
  if [ -z "$1" ]; then echo 0; else printf '%s\n' "$1" | wc -l | tr -d ' '; fi
}

# Up to three items, then "+N more".
short_list() {
  local n
  n=$(count_lines "$1")
  if [ "$n" -le 3 ]; then
    printf '%s\n' "$1" | paste -sd ',' - | sed 's/,/, /g'
  else
    printf '%s, +%s more\n' "$(printf '%s\n' "$1" | head -n 3 | paste -sd ',' - | sed 's/,/, /g')" "$((n - 3))"
  fi
}

# Migration files are numbered by hand, so two branches can each add the next number in
# different files: no textual conflict, and git never says a word.
mig_dups() {
  git ls-tree --name-only "$1" -- supabase/migrations/ |
    sed 's#.*/##' | grep -oE '^[0-9]+' | sort | uniq -d
}

notes=()
if [ "$fetch" -eq 1 ]; then
  for ref in "$base_ref" "$head_ref"; do
    b=$(branch_on_origin "$ref")
    if [ -n "$b" ]; then
      git fetch --quiet origin "+refs/heads/$b:refs/remotes/origin/$b" || die "could not fetch $b from origin"
    fi
  done
  for b in ${others[@]+"${others[@]}"}; do
    b=${b#origin/}
    git fetch --quiet origin "+refs/heads/$b:refs/remotes/origin/$b" 2>/dev/null ||
      notes+=("could not fetch $b; it is reported from the last fetch, if any")
  done
fi

base=$(git rev-parse --verify --quiet "$base_ref^{commit}") || die "no such ref: $base_ref"
head=$(git rev-parse --verify --quiet "$head_ref^{commit}") || die "no such ref: $head_ref"
git merge-base "$base" "$head" >/dev/null 2>&1 ||
  die "no merge base between $base_ref and $head_ref (a shallow clone? run: git fetch --unshallow origin)"

name=$(git rev-parse --abbrev-ref "$head_ref" 2>/dev/null || printf '%s' "$head_ref")
[ "$name" = "HEAD" ] && name="(detached)"
read -r behind ahead < <(git rev-list --left-right --count "$base...$head")
echo "merge-check: $name @ ${head:0:7} on $base_ref @ ${base:0:7} ($ahead ahead, $behind behind)"

# --no-optional-locks: a plain `status` refreshes and rewrites the index, and this script
# promises not to touch it (and must not race another git process for index.lock).
if [ "$head_ref" = "HEAD" ] && [ -n "$(git --no-optional-locks status --porcelain)" ]; then
  notes+=("uncommitted changes are not checked; commit them and run this again")
fi

# ---- 1. Does it land clean? -------------------------------------------------------------

conflicts=""
landed_tree=""
landed_files=""
if merge_of "$base" "$head"; then
  landed_tree=$mt_tree
  landed_files=$(changed_paths "$base" "$landed_tree") || die "git diff failed on the landed tree"
  refuse_quoted "$landed_files"
  echo "main: clean (lands $(count_lines "$landed_files") files)"
else
  conflicts=$mt_conflicts
  echo "main: CONFLICT in $(count_lines "$conflicts") files"
  printf '%s\n' "$conflicts" | sed 's/^/  /'
fi

# ---- 2. Would landing drop lines this branch never saw? ---------------------------------

lost_total=0
new_dups=""
markers=0
if [ -n "$landed_tree" ]; then
  # The fork point is where this branch left main: the first commit on its FIRST-PARENT
  # chain that main contains. A merge of main into the branch is not first-parent, so the
  # walk steps over it to the commit the session actually started from. Every line main
  # added after that point is a line the session never saw.
  fork=""
  while read -r c; do
    if git merge-base --is-ancestor "$c" "$base"; then
      fork=$c
      break
    fi
  done < <(git rev-list --first-parent "$head")
  # No fork point means the check that matters most cannot run: a shallow clone whose
  # history stops between the branch's commits and main's (the merge base can still be
  # found through a merge of main), or a branch that never left main's history at all.
  # A check that could not run is never a pass.
  [ -n "$fork" ] ||
    die "no fork point: $name's first-parent history never reaches $base_ref within this clone (a shallow clone? run: git fetch --unshallow origin)"

  : >"$tmp/lost"
  : >"$tmp/markers"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    git show "$fork:$f" >"$tmp/fork" 2>/dev/null || : >"$tmp/fork"
    git show "$landed_tree:$f" >"$tmp/landed" 2>/dev/null || : >"$tmp/landed"
    # Removed lines, each tagged by its hunk: "replaced" when the hunk also adds lines
    # (a rewrite, or a revert to the branch's old text; the tag cannot tell which),
    # "deleted" when it only removes. Everything before the first hunk is the header.
    git diff --no-renames --no-ext-diff --no-color -U0 "$base" "$landed_tree" -- "$f" >"$tmp/diff" ||
      die "git diff failed on $f"
    awk 'function flush(  i) { for (i = 1; i <= n; i++) print (adds ? "replaced" : "deleted") "\t" buf[i]; n = 0; adds = 0 }
      /^@@/ { if (inhunk) flush(); inhunk = 1; next }
      inhunk && /^-/ { buf[++n] = substr($0, 2); next }
      inhunk && /^\+/ { adds = 1; next }
      END { if (inhunk) flush() }' "$tmp/diff" >"$tmp/removed"
    # A removed line is LOST when the session never saw it (absent at the fork point)
    # and it is gone from the result (absent from the landed file, so a line that only
    # moved is not reported). FILENAME, not NR==FNR: an input that is empty because the
    # file did not exist on that side would otherwise swallow the next input as its set.
    awk -v f="$f" 'FILENAME == ARGV[1] { seen[$0] = 1; next }
      FILENAME == ARGV[2] { kept[$0] = 1; next }
      { tab = index($0, "\t"); kind = substr($0, 1, tab - 1); line = substr($0, tab + 1)
        if (line ~ /[[:alnum:]]/ && !(line in seen) && !(line in kept))
          print kind "\t" f ": " substr(line, 1, 120) }' \
      "$tmp/fork" "$tmp/landed" "$tmp/removed" >>"$tmp/lost"
    # A resolution committed with its conflict markers still in loses nothing (both sides
    # sit between the markers) and lands clean; only the markers say what happened.
    awk '/^@@/ { inhunk = 1; next } inhunk && /^\+(<<<<<<<|>>>>>>>)( |$)/ { n++ } END { print n + 0 }' \
      "$tmp/diff" >>"$tmp/markers"
  done <<<"$landed_files"
  markers=$(awk '{ s += $1 } END { print s + 0 }' "$tmp/markers")

  lost_total=$(count_lines "$(cat "$tmp/lost")")
  if [ "$lost_total" -eq 0 ]; then
    echo "lost lines: none"
  else
    deleted=$(grep -c '^deleted' "$tmp/lost")
    per_file=$(cut -f2- "$tmp/lost" | awk -F': ' '{ n[$1]++ } END { for (p in n) print p " " n[p] }' | sort)
    echo "lost lines: $lost_total in $(count_lines "$per_file") file(s) ($(short_list "$per_file")), added on main after this branch forked and dropped by landing it: $deleted deleted outright, $((lost_total - deleted)) replaced in their hunk"
    # Outright deletions first: they are the ones with nothing standing in their place.
    { grep '^deleted' "$tmp/lost"; grep '^replaced' "$tmp/lost"; } >"$tmp/lost.sorted"
    if [ "$max_list" -gt 0 ]; then head -n "$max_list" "$tmp/lost.sorted"; else cat "$tmp/lost.sorted"; fi |
      awk '{ tab = index($0, "\t"); printf "  %-8s  %s\n", substr($0, 1, tab - 1), substr($0, tab + 1) }'
    if [ "$max_list" -gt 0 ] && [ "$lost_total" -gt "$max_list" ]; then
      echo "  (+$((lost_total - max_list)) more; --all lists them)"
    fi
  fi

  if [ "$markers" -gt 0 ]; then
    echo "conflict markers: landing adds $markers line(s) opening or closing a conflict"
  fi

  # Only a duplicate that landing would ADD counts; one main already carries is history.
  new_dups=$(comm -13 <(mig_dups "$base") <(mig_dups "$landed_tree"))
  if [ -z "$new_dups" ]; then
    echo "migration numbers: no new duplicates"
  else
    echo "migration numbers: landing adds a duplicate $(printf '%s\n' "$new_dups" | paste -sd ',' - | sed 's/,/, /g')"
  fi
else
  echo "lost lines: skipped until the conflict is resolved"
fi

# ---- 3. Other open PRs --------------------------------------------------------------------

if [ ${#others[@]} -gt 0 ]; then
  merged=0
  git merge-base --is-ancestor "$head" "$base" && merged=1
  my_files=$(changed_paths "$(git merge-base "$base" "$head")" "$head") || die "git diff failed on $name"

  # What main looks like after this branch lands. This repo squash merges, so the landing
  # is one new commit on main holding the landed tree, never a merge of the branch's own
  # commits: a PR stacked on this branch still carries those commits, and only the squash
  # shape shows the conflict it meets once they arrive on main under a different id.
  landed=""
  if [ "$merged" -eq 1 ]; then
    landed=$base
  elif [ -n "$landed_tree" ]; then
    landed=$(GIT_AUTHOR_NAME=merge-check GIT_AUTHOR_EMAIL=merge-check@example.invalid \
      GIT_COMMITTER_NAME=merge-check GIT_COMMITTER_EMAIL=merge-check@example.invalid \
      git commit-tree "$landed_tree" -p "$base" -m "merge-check: simulated squash") ||
      die "could not simulate the landing"
  fi

  echo "other open PRs:"
  for b in "${others[@]}"; do
    b=${b#origin/}
    rev=$(git rev-parse --verify --quiet "refs/remotes/origin/$b^{commit}") || {
      echo "  $b: not found on origin"
      continue
    }
    if [ "$rev" = "$head" ]; then
      continue
    fi
    mb=$(git merge-base "$base" "$rev") || {
      echo "  $b: no merge base with $base_ref (a shallow clone?)"
      continue
    }
    line="  $b:"
    # Once this branch is inside main there is nothing of its own left to share; the line
    # that matters is the next one.
    if [ "$merged" -eq 0 ]; then
      shared=$(comm -12 <(printf '%s\n' "$my_files" | sed '/^$/d') <(changed_paths "$mb" "$rev"))
      if [ -z "$shared" ]; then
        line="$line shares nothing;"
      else
        line="$line shares $(count_lines "$shared") file(s) ($(short_list "$shared"));"
      fi
    fi
    merge_of "$base" "$rev"
    now=$mt_conflicts
    if [ -n "$now" ]; then
      line="$line conflicts with main now: $(short_list "$now")"
    else
      line="$line conflicts with main now: none"
    fi
    if [ -n "$landed" ] && [ "$landed" != "$base" ]; then
      merge_of "$landed" "$rev"
      caused=$(comm -13 <(printf '%s\n' "$now" | sed '/^$/d') <(printf '%s\n' "$mt_conflicts" | sed '/^$/d'))
      if [ -n "$caused" ]; then
        line="$line; new conflicts if you land: $(short_list "$caused")"
      else
        line="$line; new conflicts if you land: none"
      fi
    fi
    echo "$line"
  done
fi

for n in ${notes[@]+"${notes[@]}"}; do
  echo "note: $n"
done

if [ -n "$conflicts" ]; then
  echo "next: git merge $base_ref, resolve per the steward skill, then run this again"
  echo "MERGE CHECK: CONFLICT"
  exit 1
fi
if [ "$lost_total" -gt 0 ] || [ -n "$new_dups" ] || [ "$markers" -gt 0 ]; then
  echo "next: restore each lost line or say in the PR why it goes; renumber a duplicate migration; remove every conflict marker"
  echo "MERGE CHECK: REVIEW"
  exit 2
fi
echo "MERGE CHECK: CLEAN"
exit 0
