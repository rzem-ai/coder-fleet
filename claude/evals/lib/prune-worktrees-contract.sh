#!/usr/bin/env bash
#
# prune-worktrees-contract.sh - scripts/prune-worktrees.sh removes only adopted
# agent worktrees, never forces anything, and sweeps only the scratch of
# worktrees that no longer exist.
#
# Every case runs the real script against throwaway repositories with real
# linked worktrees under a mktemp root. Each case asserts both the effect on
# disk or in git and the exact report line, so a negative case cannot pass
# while the script is absent. The harness names scratch directories by encoding
# a path with tr '/.' '--', so every name starts with '-'; S02 and S03 are the
# class of the incident that deleted live worktrees' scratch.
#
# The scratch root is always CODER_FLEET_SCRATCH_ROOT under this test's own
# temporary directory. The run aborts if it is ever unset or points anywhere
# else, so this test cannot reach the machine's real scratch root.
#
# Usage:  claude/evals/lib/prune-worktrees-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
SCRIPT="$PLUGIN_ROOT/scripts/prune-worktrees.sh"
COMMAND="$PLUGIN_ROOT/commands/prune-worktrees.md"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/prune-worktrees-contract.XXXXXX") || exit 2
# macOS hands back /var/..., a symlink to /private/var/...; git and the harness
# see real paths, so every expected name is built from the real one.
TMP=$(cd "$TMP" && pwd -P) || exit 2
cleanup() { chmod -R u+w "$TMP" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

export CODER_FLEET_SCRATCH_ROOT="$TMP/scratch"

# A caller's git environment or user config must not leak into the fixtures.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

PASSED=0
FAILED=0
# While GATE is 1, a check also needs the last run to have exited 0, so a case
# about something being kept cannot pass because the script never ran.
GATE=0

check() {
    # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if { [ "$GATE" -eq 0 ] || [ "$RC" -eq 0 ]; } && "$@" >/dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$label"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s\n' "$label"
    fi
    return 0
}

absent() { ! "$@"; }

enc() { printf '%s' "$1" | tr '/.' '--'; }

OUT=""
RC=0
prune() {
    # $1 scratch root, $2 directory to run from, rest: script arguments.
    # Sets OUT and RC. Runs the script under the same bash as this test, so a
    # /bin/bash run proves the script on 3.2 as well.
    local root="$1" dir="$2"; shift 2
    case "${CODER_FLEET_SCRATCH_ROOT:-}" in
        "$TMP"/*) ;;
        *) printf 'prune-worktrees-contract: CODER_FLEET_SCRATCH_ROOT is unset or outside %s; aborting\n' "$TMP" >&2; exit 2 ;;
    esac
    case "$root" in
        "$TMP"/*) ;;
        *) printf 'prune-worktrees-contract: scratch root %s is outside %s; aborting\n' "$root" "$TMP" >&2; exit 2 ;;
    esac
    OUT=$(cd "$dir" && CODER_FLEET_SCRATCH_ROOT="$root" "$BASH" "$SCRIPT" "$@" 2>"$TMP/stderr")
    RC=$?
    return 0
}

has_line() {
    # $1 exact line expected in OUT
    local l
    while IFS= read -r l; do
        [ "$l" = "$1" ] && return 0
    done <<EOF
$OUT
EOF
    return 1
}

has_prefix() {
    # $1 a line in OUT starts with this
    local l
    while IFS= read -r l; do
        case "$l" in "$1"*) return 0 ;; esac
    done <<EOF
$OUT
EOF
    return 1
}

line() { local IFS=$'\t'; printf '%s' "$*"; }

wt_listed() {
    # $1 repo, $2 worktree path
    local l
    while IFS= read -r l; do
        [ "$l" = "worktree $2" ] && return 0
    done < <(git -C "$1" worktree list --porcelain)
    return 1
}

wt_lock_line() {
    # $1 repo, $2 worktree path; prints the entry's locked line, if any
    local l in=0
    while IFS= read -r l; do
        case "$l" in
            "worktree $2") in=1 ;;
            "worktree "*) in=0 ;;
            locked*) [ "$in" -eq 1 ] && { printf '%s\n' "$l"; return 0; } ;;
        esac
    done < <(git -C "$1" worktree list --porcelain)
    return 1
}

wt_locked_with() { [ "$(wt_lock_line "$1" "$2")" = "locked $3" ]; }
branch_exists() { git -C "$1" show-ref --verify -q "refs/heads/$2"; }
is_dir() { [ -d "$1" ] && [ ! -L "$1" ]; }
is_link() { [ -L "$1" ]; }
script_exists() { [ -f "$SCRIPT" ]; }

new_repo() {
    # $1 path; a repository on main with one base commit and .claude/ excluded
    mkdir -p "$1"
    git -C "$1" init -q -b main
    printf 'base\n' > "$1/a"
    git -C "$1" add a
    git -C "$1" commit -qm base
    printf '.claude/\n' >> "$1/.git/info/exclude"
}

# --- the main fixture -------------------------------------------------------

mkdir -p "$TMP/repo"
R=$(cd "$TMP/repo" && pwd -P)
new_repo "$R"
WTS="$R/.claude/worktrees"

# P01 adopted: unlocked, as the harness leaves a finished agent's worktree,
# merged, clean
git -C "$R" worktree add -q "$WTS/wt-merged" -b wt-merged
# P10 live: the harness locks an agent worktree only while its agent runs, and
# a freshly cut one is clean and an ancestor of main, so the lock is the only
# sign it is in use
LIVE_REASON="claude agent agent-a1b2c3 (pid 4242 start Sat Sep 27 17:00:00 2026)"
git -C "$R" worktree add -q "$WTS/wt-live" -b wt-live
git -C "$R" worktree lock --reason "$LIVE_REASON" "$WTS/wt-live"
# P02 dirty: an untracked file
git -C "$R" worktree add -q "$WTS/wt-dirty" -b wt-dirty
printf 'work\n' > "$WTS/wt-dirty/untracked.txt"
# P03 unmerged: a commit that is not in main
git -C "$R" worktree add -q "$WTS/wt-unmerged" -b wt-unmerged
printf 'more\n' > "$WTS/wt-unmerged/b"
git -C "$WTS/wt-unmerged" add b
git -C "$WTS/wt-unmerged" commit -qm unmerged
# P04 not-agent: merged and clean, but outside .claude/worktrees/
git -C "$R" worktree add -q "$TMP/elsewhere" -b elsewhere
git -C "$R" worktree add -q "$R/.claude/worktrees-x/y" -b y
# P05 detached: merged, clean, no branch
git -C "$R" worktree add -q --detach "$WTS/wt-detached"
# P06 refused: merged, clean and unlocked, but git refuses the remove. A
# modules directory in the worktree's admin directory is git's own submodule
# guard, checked before anything is deleted, so the refusal leaves the
# worktree whole.
git -C "$R" worktree add -q "$WTS/wt-refused" -b wt-refused
mkdir "$(git -C "$WTS/wt-refused" rev-parse --absolute-git-dir)/modules"

ER=$(enc "$R")
SC="$TMP/scratch"
mkdir -p "$SC" "$TMP/link-target"
printf 'keep\n' > "$TMP/link-target/file"
S01="$ER--claude-worktrees-wt-gone"
S02="$ER--claude-worktrees-wt-dirty"
S03="$ER--claude-worktrees-wt-dirty-claude-coder-fleet"
S04="$ER"
S05="$ER-sibling--claude-worktrees-wt-x"
S06="-some-other-project--claude-worktrees-a"
S07="$ER--claude-worktrees-wt-link"
S10="$ER--claude-worktrees-wt-merged"
SREF="$ER--claude-worktrees-wt-refused"
SLIVE="$ER--claude-worktrees-wt-live"
for n in "$S01" "$S02" "$S03" "$S04" "$S05" "$S06" "$S10" "$SREF" "$SLIVE"; do
    mkdir -p "$SC/$n"
    printf 'x\n' > "$SC/$n/f"
done
ln -s "$TMP/link-target" "$SC/$S07"

MAIN_HEAD=$(git -C "$R" rev-parse HEAD)
MAIN_BRANCH=$(git -C "$R" symbolic-ref HEAD)
MAIN_STATUS=$(git -C "$R" status --porcelain)
UNMERGED_HEAD=$(git -C "$WTS/wt-unmerged" rev-parse HEAD)
DETACHED_HEAD=$(git -C "$WTS/wt-detached" rev-parse HEAD)

# --- static checks, first so a missing script shows at the top ---------------

printf '\nThe script exists and is safe by inspection\n'
check 'T03 the script exists'                         script_exists
check 'T03 the script passes bash -n'                 bash -n "$SCRIPT"
t01_no_force() { script_exists && absent grep -qF -- '--force' "$SCRIPT"; }
t01_no_remove_f() { script_exists && absent grep -qE -- 'worktree[[:space:]]+remove[[:space:]]+-f' "$SCRIPT"; }
t01_no_branch_D() { script_exists && absent grep -qE -- 'branch[[:space:]]+-D' "$SCRIPT"; }
t02_greps_end_options() {
    local l
    script_exists || return 1
    while IFS= read -r l; do
        case "$l" in
            *grep*) case "$l" in *' -- '*) ;; *) return 1 ;; esac ;;
        esac
    done < "$SCRIPT"
    return 0
}
check 'T01 no --force anywhere in the script'         t01_no_force
check 'T01 no worktree remove -f'                     t01_no_remove_f
check 'T01 no branch -D'                              t01_no_branch_D
check 'T02 every grep in the script ends options with --' t02_greps_end_options
t04_calls_script() { grep -qF -- '"${CLAUDE_PLUGIN_ROOT}/scripts/prune-worktrees.sh"' "$COMMAND"; }
check 'T04 the command calls the script by ${CLAUDE_PLUGIN_ROOT}, double-quoted' t04_calls_script
check 'T04 the command no longer says rm -rf'         absent grep -qF -- 'rm -rf' "$COMMAND"

# --- D01: a dry run changes nothing ------------------------------------------

printf '\nD01 --dry-run changes nothing and says what it would do\n'
GATE=1
prune "$SC" "$R" --dry-run
check 'D01 exits 0'                                   test "$RC" -eq 0
check 'D01 reports would-remove for wt-merged'        has_line "$(line would-remove "$WTS/wt-merged" wt-merged "$MAIN_HEAD")"
check 'D01 reports would-delete-scratch for the stale entry' has_line "$(line would-delete-scratch "$S01")"
check 'D01 reports no removed line'                   absent has_prefix "$(line removed '')"
check 'D01 reports no scratch line'                   absent has_prefix "$(line scratch '')"
check 'D01 wt-merged is still there'                  is_dir "$WTS/wt-merged"
check 'D01 wt-merged is still listed'                 wt_listed "$R" "$WTS/wt-merged"
check 'D01 the wt-merged branch still exists'         branch_exists "$R" wt-merged
check 'D01 reports kept locked for wt-live'           has_line "$(line kept "$WTS/wt-live" locked)"
check 'D01 wt-live is still locked with its reason'   wt_locked_with "$R" "$WTS/wt-live" "$LIVE_REASON"
check 'D01 wt-detached is still there'                is_dir "$WTS/wt-detached"
d01_scratch_untouched() {
    local n
    for n in "$S01" "$S02" "$S03" "$S04" "$S05" "$S06" "$S10" "$SREF" "$SLIVE"; do
        is_dir "$SC/$n" || return 1
    done
    is_link "$SC/$S07"
}
check 'D01 every scratch entry is still there'        d01_scratch_untouched

# --- the main run, from the main checkout -----------------------------------

prune "$SC" "$R"
printf '\nThe run from the main checkout\n'
check 'exits 0, refusals included'                    test "$RC" -eq 0

printf '\nP01 an adopted worktree is removed\n'
check 'P01 reports removed with path, branch and HEAD' has_line "$(line removed "$WTS/wt-merged" wt-merged "$MAIN_HEAD")"
check 'P01 the directory is gone'                     absent test -e "$WTS/wt-merged"
check 'P01 git no longer lists it'                    absent wt_listed "$R" "$WTS/wt-merged"
check 'P01 its branch is deleted'                     absent branch_exists "$R" wt-merged

printf '\nP02 a dirty worktree is kept\n'
check 'P02 reports kept dirty'                        has_line "$(line kept "$WTS/wt-dirty" dirty)"
check 'P02 the untracked file still exists'           test -f "$WTS/wt-dirty/untracked.txt"
check 'P02 git still lists it'                        wt_listed "$R" "$WTS/wt-dirty"

printf '\nP03 an unmerged worktree is kept\n'
check 'P03 reports kept unmerged'                     has_line "$(line kept "$WTS/wt-unmerged" unmerged)"
check 'P03 its branch still exists'                   branch_exists "$R" wt-unmerged
check 'P03 its HEAD is unchanged'                     test "$(git -C "$WTS/wt-unmerged" rev-parse HEAD)" = "$UNMERGED_HEAD"

printf '\nP04 a worktree outside .claude/worktrees/ is kept\n'
check 'P04 reports kept not-agent for $TMP/elsewhere' has_line "$(line kept "$TMP/elsewhere" not-agent)"
check 'P04 $TMP/elsewhere is still there'             wt_listed "$R" "$TMP/elsewhere"
check 'P04 reports kept not-agent for .claude/worktrees-x/y' has_line "$(line kept "$R/.claude/worktrees-x/y" not-agent)"
check 'P04 .claude/worktrees-x/y is still there'      wt_listed "$R" "$R/.claude/worktrees-x/y"

printf '\nP05 a detached adopted worktree is removed\n'
check 'P05 reports removed with - for the branch'     has_line "$(line removed "$WTS/wt-detached" - "$DETACHED_HEAD")"
check 'P05 the directory is gone'                     absent test -e "$WTS/wt-detached"
check 'P05 no branch refusal is reported'             absent has_prefix "$(line refused -)"

printf '\nP06 a refusal is reported and the worktree left as found\n'
check 'P06 reports refused for the path'              has_prefix "$(line refused "$WTS/wt-refused" '')"
check 'P06 the directory still exists'                is_dir "$WTS/wt-refused"
check 'P06 git still lists it'                        wt_listed "$R" "$WTS/wt-refused"
check 'P06 its branch still exists'                   branch_exists "$R" wt-refused

printf '\nP10 a locked worktree is never unlocked or removed\n'
check 'P10 reports kept locked'                       has_line "$(line kept "$WTS/wt-live" locked)"
check 'P10 the directory still exists'                is_dir "$WTS/wt-live"
check 'P10 it is still locked with its reason'        wt_locked_with "$R" "$WTS/wt-live" "$LIVE_REASON"
check 'P10 its branch still exists'                   branch_exists "$R" wt-live
check 'P10 its scratch entry is kept'                 is_dir "$SC/$SLIVE"
check 'P10 and not reported'                          absent has_line "$(line scratch "$SLIVE")"

printf '\nP07 the main checkout is untouched\n'
check 'P07 main HEAD unchanged'                       test "$(git -C "$R" rev-parse HEAD)" = "$MAIN_HEAD"
check 'P07 main branch unchanged'                     test "$(git -C "$R" symbolic-ref HEAD)" = "$MAIN_BRANCH"
check 'P07 main working tree unchanged'               test "$(git -C "$R" status --porcelain)" = "$MAIN_STATUS"
check 'P07 main is never reported'                    absent has_line "$(line kept "$R" not-agent)"

printf '\nScratch sweep\n'
check 'S01 the stale entry is deleted'                absent test -e "$SC/$S01"
check 'S01 and reported'                              has_line "$(line scratch "$S01")"
check 'S02 a live worktree'"'"'s entry, name starting with -, is kept' is_dir "$SC/$S02"
check 'S02 and not reported'                          absent has_line "$(line scratch "$S02")"
check 'S03 a live worktree subdirectory'"'"'s entry is kept' is_dir "$SC/$S03"
check 'S03 and not reported'                          absent has_line "$(line scratch "$S03")"
check 'S04 the main checkout'"'"'s entry is kept'     is_dir "$SC/$S04"
check 'S04 and not reported'                          absent has_line "$(line scratch "$S04")"
check 'S05 a sibling repository'"'"'s entry is kept'  is_dir "$SC/$S05"
check 'S05 and not reported'                          absent has_line "$(line scratch "$S05")"
check 'S06 another project'"'"'s entry is kept'       is_dir "$SC/$S06"
check 'S06 and not reported'                          absent has_line "$(line scratch "$S06")"
check 'S07 a symlink named like a stale entry is kept' is_link "$SC/$S07"
check 'S07 its target is untouched'                   test -f "$TMP/link-target/file"
check 'S07 and not reported'                          absent has_line "$(line scratch "$S07")"
check 'S10 the entry of a worktree removed this run is deleted' absent test -e "$SC/$S10"
check 'S10 and reported'                              has_line "$(line scratch "$S10")"
check 'the refused worktree'"'"'s entry is kept'      is_dir "$SC/$SREF"

printf '\nS08 a missing scratch root\n'
prune "$TMP/no-such-root" "$R"
check 'S08 exits 0'                                   test "$RC" -eq 0
check 'S08 reports the P02 verdict, so the script ran' has_line "$(line kept "$WTS/wt-dirty" dirty)"
check 'S08 reports no scratch line'                   absent has_prefix "$(line scratch '')"
check 'S08 creates no scratch root'                   absent test -e "$TMP/no-such-root"

# --- P08: the default branch comes from origin/HEAD -------------------------

printf '\nP08 the default branch is what origin/HEAD names\n'
mkdir -p "$TMP/p8"
P8=$(cd "$TMP/p8" && pwd -P)
new_repo "$P8"
git -C "$P8" worktree add -q "$P8/.claude/worktrees/wt-trunk" -b wt-trunk
printf 't\n' > "$P8/.claude/worktrees/wt-trunk/t"
git -C "$P8/.claude/worktrees/wt-trunk" add t
git -C "$P8/.claude/worktrees/wt-trunk" commit -qm trunk
TRUNK_HEAD=$(git -C "$P8/.claude/worktrees/wt-trunk" rev-parse HEAD)
git -C "$P8" update-ref refs/remotes/origin/trunk "$TRUNK_HEAD"
git -C "$P8" symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/trunk
printf 'm\n' > "$P8/m"
git -C "$P8" add m
git -C "$P8" commit -qm main-only
git -C "$P8" worktree add -q "$P8/.claude/worktrees/wt-mainonly" -b wt-mainonly
prune "$TMP/p8-scratch" "$P8"
check 'P08 exits 0'                                   test "$RC" -eq 0
check 'P08 merged only into origin/trunk: removed'    has_line "$(line removed "$P8/.claude/worktrees/wt-trunk" wt-trunk "$TRUNK_HEAD")"
check 'P08 its directory is gone'                     absent test -e "$P8/.claude/worktrees/wt-trunk"
check 'P08 merged only into local main: kept unmerged' has_line "$(line kept "$P8/.claude/worktrees/wt-mainonly" unmerged)"
check 'P08 that one is still there'                   is_dir "$P8/.claude/worktrees/wt-mainonly"

# --- P09: run from inside a linked worktree ---------------------------------

printf '\nP09 a run from inside a worktree acts on the main repository\n'
mkdir -p "$TMP/p9"
P9=$(cd "$TMP/p9" && pwd -P)
new_repo "$P9"
git -C "$P9" worktree add -q "$P9/.claude/worktrees/wt-here" -b wt-here
git -C "$P9" worktree add -q "$P9/.claude/worktrees/wt-other" -b wt-other
mkdir -p "$P9/.claude/worktrees/wt-here/sub"
P9_HEAD=$(git -C "$P9" rev-parse HEAD)
prune "$TMP/p9-scratch" "$P9/.claude/worktrees/wt-here/sub"
check 'P09 exits 0'                                   test "$RC" -eq 0
check 'P09 the worktree holding the cwd is kept current' has_line "$(line kept "$P9/.claude/worktrees/wt-here" current)"
check 'P09 it is still there'                         is_dir "$P9/.claude/worktrees/wt-here"
check 'P09 a sibling adopted worktree is removed'     has_line "$(line removed "$P9/.claude/worktrees/wt-other" wt-other "$P9_HEAD")"
check 'P09 the main checkout is never reported'       absent has_prefix "$(line kept "$P9" '')"

# --- S09: a path whose encoding is unverified -------------------------------

printf '\nS09 a path with an unverified encoding skips the sweep\n'
mkdir -p "$TMP/with space/repo"
P9S=$(cd "$TMP/with space/repo" && pwd -P)
new_repo "$P9S"
git -C "$P9S" worktree add -q "$P9S/.claude/worktrees/wt-a" -b wt-a
S09="$(enc "$P9S")--claude-worktrees-wt-gone"
mkdir -p "$TMP/s9-scratch/$S09"
prune "$TMP/s9-scratch" "$P9S"
check 'S09 exits 0'                                   test "$RC" -eq 0
check 'S09 reports sweep-skipped encoding-unverified' has_line "$(line sweep-skipped encoding-unverified)"
check 'S09 the stale-looking entry is kept'           is_dir "$TMP/s9-scratch/$S09"
check 'S09 and not reported'                          absent has_prefix "$(line scratch '')"

# --- usage ------------------------------------------------------------------

printf '\nUsage errors\n'
GATE=0
prune "$SC" "$R" --bogus
check 'an unknown argument exits 2'                   test "$RC" -eq 2
mkdir -p "$TMP/not-a-repo"
prune "$SC" "$TMP/not-a-repo"
check 'a run outside a repository exits 2'            test "$RC" -eq 2

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'prune-worktrees.sh can remove unadopted work, force something, or delete live scratch.\n'
    exit 1
fi
printf 'prune-worktrees.sh removes only adopted worktrees and only the scratch of worktrees that are gone.\n'
