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
# P16 locked and dirty: a live agent's worktree with work in progress is
# reported locked, and nothing reads its status or touches its index
git -C "$R" worktree add -q "$WTS/wt-live-dirty" -b wt-live-dirty
git -C "$R" worktree lock --reason "claude agent agent-d4e5f6 (pid 4343 start Sat Sep 27 17:05:00 2026)" "$WTS/wt-live-dirty"
printf 'work\n' > "$WTS/wt-live-dirty/untracked.txt"
touch -t 200001010000 "$WTS/wt-live-dirty/a"
LIVE_DIRTY_INDEX="$(git -C "$WTS/wt-live-dirty" rev-parse --absolute-git-dir)/index"
LIVE_DIRTY_INDEX_SUM=$(cksum < "$LIVE_DIRTY_INDEX")
# P17 locked and missing: git worktree prune keeps a locked entry, so it stays
# registered, and its scratch is kept
git -C "$R" worktree add -q "$WTS/wt-live-gone" -b wt-live-gone
git -C "$R" worktree lock --reason "claude agent agent-0a1b2c (pid 4444 start Sat Sep 27 17:06:00 2026)" "$WTS/wt-live-gone"
rm -rf "$WTS/wt-live-gone"
# P15 missing: registered, but its directory was deleted by hand
git -C "$R" worktree add -q "$WTS/wt-missing" -b wt-missing
rm -rf "$WTS/wt-missing"
# S12: a live wt-a, whose encoded name is a prefix of a removed wt-ab's
git -C "$R" worktree add -q "$WTS/wt-a" -b wt-a
printf 'work\n' > "$WTS/wt-a/untracked.txt"
# P11: a config that hides untracked files from git status must not hide them
# from the clean check
git -C "$R" config status.showUntrackedFiles no
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
S12="$ER--claude-worktrees-wt-ab"
SGONE="$ER--claude-worktrees-wt-live-gone"
for n in "$S01" "$S02" "$S03" "$S04" "$S05" "$S06" "$S10" "$SREF" "$SLIVE" "$S12" "$SGONE"; do
    mkdir -p "$SC/$n"
    printf 'x\n' > "$SC/$n/f"
done
ln -s "$TMP/link-target" "$SC/$S07"

MAIN_HEAD=$(git -C "$R" rev-parse HEAD)
MAIN_BRANCH=$(git -C "$R" symbolic-ref HEAD)
MAIN_STATUS=$(git -C "$R" status --porcelain)
UNMERGED_HEAD=$(git -C "$WTS/wt-unmerged" rev-parse HEAD)
# P14: a stale mtime makes a plain git status refresh the index and write it
# back, taking index.lock, which a live agent in that worktree may be holding.
# The clean check must read without writing.
touch -t 200001010000 "$WTS/wt-unmerged/b"
UNMERGED_INDEX="$(git -C "$WTS/wt-unmerged" rev-parse --absolute-git-dir)/index"
UNMERGED_INDEX_SUM=$(cksum < "$UNMERGED_INDEX")
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
check 'T04 the command does not say rm -rf'           absent grep -qF -- 'rm -rf' "$COMMAND"

# --- D01: a dry run changes nothing ------------------------------------------

printf '\nD01 --dry-run changes nothing and says what it would do\n'
GATE=1
prune "$SC" "$R" --dry-run
check 'D01 exits 0'                                   test "$RC" -eq 0
check 'D01 reports would-remove for wt-merged'        has_line "$(line would-remove "$WTS/wt-merged" wt-merged "$MAIN_HEAD")"
check 'D01 reports would-delete-scratch for the stale entry' has_line "$(line would-delete-scratch "$S01")"
check 'D01 predicts the scratch of wt-merged, which it would remove' has_line "$(line would-delete-scratch "$S10")"
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
check 'P01 git does not list it'                      absent wt_listed "$R" "$WTS/wt-merged"
check 'P01 its branch is deleted'                     absent branch_exists "$R" wt-merged

printf '\nP02 a dirty worktree is kept\n'
check 'P02 reports kept dirty'                        has_line "$(line kept "$WTS/wt-dirty" dirty)"
check 'P02 the untracked file still exists'           test -f "$WTS/wt-dirty/untracked.txt"
check 'P02 git still lists it'                        wt_listed "$R" "$WTS/wt-dirty"
check 'P11 status.showUntrackedFiles=no is set, and the untracked file still counts' test "$(git -C "$R" config status.showUntrackedFiles)" = no

printf '\nP03 an unmerged worktree is kept\n'
check 'P03 reports kept unmerged'                     has_line "$(line kept "$WTS/wt-unmerged" unmerged)"
check 'P03 its branch still exists'                   branch_exists "$R" wt-unmerged
check 'P03 its HEAD is unchanged'                     test "$(git -C "$WTS/wt-unmerged" rev-parse HEAD)" = "$UNMERGED_HEAD"
check 'P14 the clean check never rewrote its index'  test "$(cksum < "$UNMERGED_INDEX")" = "$UNMERGED_INDEX_SUM"

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

printf '\nP15 a registered worktree whose directory is gone\n'
check 'P15 reports kept missing, not dirty'           has_line "$(line kept "$WTS/wt-missing" missing)"
check 'P15 the prune drops its registration'          absent wt_listed "$R" "$WTS/wt-missing"

printf '\nP16 a locked worktree with work in progress is reported locked\n'
check 'P16 reports kept locked, not dirty'            has_line "$(line kept "$WTS/wt-live-dirty" locked)"
check 'P16 the untracked file still exists'           test -f "$WTS/wt-live-dirty/untracked.txt"
check 'P16 its index is untouched'                    test "$(cksum < "$LIVE_DIRTY_INDEX")" = "$LIVE_DIRTY_INDEX_SUM"

printf '\nP17 a locked worktree whose directory is gone is reported locked\n'
check 'P17 reports kept locked, not missing'          has_line "$(line kept "$WTS/wt-live-gone" locked)"
check 'P17 it is still registered after the prune'    wt_listed "$R" "$WTS/wt-live-gone"
check 'P17 its scratch entry is kept'                 is_dir "$SC/$SGONE"
check 'P17 and not reported'                          absent has_line "$(line scratch "$SGONE")"

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
check 'S12 wt-a is live and kept dirty'               has_line "$(line kept "$WTS/wt-a" dirty)"
check 'S12 the stale wt-ab entry, prefixed by live wt-a, is deleted' absent test -e "$SC/$S12"
check 'S12 and reported'                              has_line "$(line scratch "$S12")"

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
# The resolver reads the HEAD of a remote git lists, as a clone has.
git -C "$P8" remote add origin https://example.invalid/p8.git
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

# --- P18: baseBranch names the trunk (CF-209.2) -----------------------------

# wt-maino is merged into main alone, wt-baseo into develop alone, and wt-remo
# into origin/develop alone, with origin/HEAD naming main.
printf '\nP18 with baseBranch set, merged means merged into that branch or its remote copy\n'
mkdir -p "$TMP/p18"
P18=$(cd "$TMP/p18" && pwd -P)
new_repo "$P18"
git -C "$P18" remote add origin https://example.invalid/p18.git
git -C "$P18" update-ref refs/remotes/origin/main main
git -C "$P18" symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
git -C "$P18" branch develop
for w in maino baseo remo; do
    git -C "$P18" worktree add -q "$P18/.claude/worktrees/wt-$w" -b "wt-$w"
    printf '%s\n' "$w" > "$P18/.claude/worktrees/wt-$w/$w"
    git -C "$P18/.claude/worktrees/wt-$w" add "$w"
    git -C "$P18/.claude/worktrees/wt-$w" commit -qm "$w"
done
git -C "$P18" merge -q --ff-only wt-maino
git -C "$P18" update-ref refs/heads/develop wt-baseo
git -C "$P18" update-ref refs/remotes/origin/develop wt-remo
BASEO_HEAD=$(git -C "$P18" rev-parse wt-baseo)
REMO_HEAD=$(git -C "$P18" rev-parse wt-remo)
printf '%s' '{"baseBranch": "develop"}' > "$P18/.claude/coder-fleet.json"
prune "$TMP/p18-scratch" "$P18"
check 'P18 exits 0'                                   test "$RC" -eq 0
check 'P18 merged into main but not develop: kept unmerged' has_line "$(line kept "$P18/.claude/worktrees/wt-maino" unmerged)"
check 'P18 that one is still there'                   is_dir "$P18/.claude/worktrees/wt-maino"
check 'P18 merged into develop but not main: removed' has_line "$(line removed "$P18/.claude/worktrees/wt-baseo" wt-baseo "$BASEO_HEAD")"
check 'P18 its directory is gone'                     absent test -e "$P18/.claude/worktrees/wt-baseo"
check 'P18 merged into origin/develop alone: removed' has_line "$(line removed "$P18/.claude/worktrees/wt-remo" wt-remo "$REMO_HEAD")"

printf '\nP19 a baseBranch the resolver cannot use changes nothing and says why\n'
mkdir -p "$TMP/p19"
P19=$(cd "$TMP/p19" && pwd -P)
new_repo "$P19"
git -C "$P19" worktree add -q "$P19/.claude/worktrees/wt-merged" -b wt-merged
printf '%s' '{"baseBranch": "nope"}' > "$P19/.claude/coder-fleet.json"
prune "$TMP/p19-scratch" "$P19"
GATE=0
check 'P19 exits 1'                                   test "$RC" -eq 1
check 'P19 prints no verdict'                         test -z "$OUT"
check 'P19 the reason names the setting'              grep -qF 'baseBranch is "nope"' "$TMP/stderr"
check 'P19 the merged worktree is still there'        is_dir "$P19/.claude/worktrees/wt-merged"
GATE=1

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

# --- P12: a squash merge leaves the worktree unmerged ------------------------

printf '\nP12 a squash-merged worktree is kept unmerged\n'
mkdir -p "$TMP/p12"
P12=$(cd "$TMP/p12" && pwd -P)
new_repo "$P12"
git -C "$P12" worktree add -q "$P12/.claude/worktrees/wt-squash" -b wt-squash
printf 's\n' > "$P12/.claude/worktrees/wt-squash/s"
git -C "$P12/.claude/worktrees/wt-squash" add s
git -C "$P12/.claude/worktrees/wt-squash" commit -qm squashed
git -C "$P12" merge -q --squash wt-squash >/dev/null
git -C "$P12" commit -qm 'squash wt-squash'
prune "$TMP/p12-scratch" "$P12"
check 'P12 exits 0'                                   test "$RC" -eq 0
check 'P12 reports kept unmerged'                     has_line "$(line kept "$P12/.claude/worktrees/wt-squash" unmerged)"
check 'P12 the worktree is still there'               is_dir "$P12/.claude/worktrees/wt-squash"
check 'P12 its branch still exists'                   branch_exists "$P12" wt-squash

# --- P20: under push base-only a squashed landing counts as merged (CF-2.1) --

# wt-landed's two commits land on main as one squashed commit, as
# lead-procedures' base-only Shipping does; wt-notlanded's never land, and a
# later commit on main moves the trunk past both.
printf '\nP20 under push base-only, a worktree landed as one squashed commit is removed and one not landed is kept\n'
mkdir -p "$TMP/p20"
P20=$(cd "$TMP/p20" && pwd -P)
new_repo "$P20"
for w in landed notlanded; do
    git -C "$P20" worktree add -q "$P20/.claude/worktrees/wt-$w" -b "wt-$w"
    printf '%s 1\n' "$w" > "$P20/.claude/worktrees/wt-$w/$w"
    git -C "$P20/.claude/worktrees/wt-$w" add "$w"
    git -C "$P20/.claude/worktrees/wt-$w" commit -qm "$w 1"
    printf '%s 2\n' "$w" >> "$P20/.claude/worktrees/wt-$w/$w"
    git -C "$P20/.claude/worktrees/wt-$w" commit -qam "$w 2"
done
git -C "$P20" merge -q --squash wt-landed >/dev/null
git -C "$P20" commit -qm 'CF-1: land wt-landed'
printf 'later\n' > "$P20/later"
git -C "$P20" add later
git -C "$P20" commit -qm 'CF-2: a later landing'
LANDED_HEAD=$(git -C "$P20" rev-parse wt-landed)
printf '%s' '{"push": "base-only", "release": "off"}' > "$P20/.claude/coder-fleet.json"
prune "$TMP/p20-scratch" "$P20"
check 'P20 exits 0'                                   test "$RC" -eq 0
check 'P20 the squash-landed worktree is removed'     has_line "$(line removed "$P20/.claude/worktrees/wt-landed" wt-landed "$LANDED_HEAD")"
check 'P20 its directory is gone'                     absent test -e "$P20/.claude/worktrees/wt-landed"
check 'P20 the worktree never landed is kept unmerged' has_line "$(line kept "$P20/.claude/worktrees/wt-notlanded" unmerged)"
check 'P20 that one is still there'                   is_dir "$P20/.claude/worktrees/wt-notlanded"
check 'P20 its branch still exists'                   branch_exists "$P20" wt-notlanded

# --- P13: the default branch is never deleted -------------------------------

printf '\nP13 removing a worktree on the default branch keeps the branch\n'
mkdir -p "$TMP/p13"
P13=$(cd "$TMP/p13" && pwd -P)
new_repo "$P13"
git -C "$P13" switch -q -c side
git -C "$P13" worktree add -q "$P13/.claude/worktrees/wt-main" main
P13_HEAD=$(git -C "$P13" rev-parse main)
prune "$TMP/p13-scratch" "$P13"
check 'P13 exits 0'                                   test "$RC" -eq 0
check 'P13 the worktree on main is removed'           has_line "$(line removed "$P13/.claude/worktrees/wt-main" main "$P13_HEAD")"
check 'P13 the main branch still exists'              branch_exists "$P13" main
check 'P13 no refusal is reported for main'           absent has_prefix "$(line refused main '')"

# --- P14: the board's state worktree is never removed ----------------------

printf '\nP14 the state worktree is kept even when clean and merged\n'
mkdir -p "$TMP/p14"
P14=$(cd "$TMP/p14" && pwd -P)
new_repo "$P14"
git -C "$P14" worktree add -q "$P14/.claude/worktrees/coder-fleet-state" -b coder-fleet/state
git -C "$P14" worktree add -q "$P14/.claude/worktrees/wt-plain" -b wt-plain
P14_HEAD=$(git -C "$P14" rev-parse main)
prune "$TMP/p14-scratch" "$P14"
check 'P14 exits 0'                                     test "$RC" -eq 0
check 'P14 the state worktree is kept as state'         has_line "$(line kept "$P14/.claude/worktrees/coder-fleet-state" state)"
check 'P14 and is still there'                          is_dir "$P14/.claude/worktrees/coder-fleet-state"
check 'P14 the state branch still exists'               branch_exists "$P14" coder-fleet/state
check 'P14 an ordinary merged worktree beside it is removed' has_line "$(line removed "$P14/.claude/worktrees/wt-plain" wt-plain "$P14_HEAD")"

printf '\nP14b a worktree on the state branch at another path is kept as state\n'
mkdir -p "$TMP/p14b"
P14B=$(cd "$TMP/p14b" && pwd -P)
new_repo "$P14B"
git -C "$P14B" worktree add -q "$P14B/.claude/worktrees/renamed-state" -b coder-fleet/state
prune "$TMP/p14b-scratch" "$P14B"
check 'P14b exits 0'                                    test "$RC" -eq 0
check 'P14b it is kept as state'                        has_line "$(line kept "$P14B/.claude/worktrees/renamed-state" state)"
check 'P14b and is still there'                         is_dir "$P14B/.claude/worktrees/renamed-state"

# --- M01: memory records of worktrees that are gone --------------------------

printf '\nM01 the memory hook'"'"'s records of worktrees git no longer lists are removed\n'
mkdir -p "$TMP/m1" "$TMP/m1-outside"
M1=$(cd "$TMP/m1" && pwd -P)
new_repo "$M1"
M1W="$M1/.claude/worktrees"
git -C "$M1" worktree add -q "$M1W/coder-fleet-state" -b coder-fleet/state
git -C "$M1" worktree add -q "$M1W/wt-live" -b wt-live
printf 'work\n' > "$M1W/wt-live/untracked.txt"
git -C "$M1" worktree add -q "$M1W/wt-done" -b wt-done
# The hook names a checkout's records by the first 16 hex digits of the sha1
# of its real path, case folded.
mkey() { python3 -c 'import hashlib, sys; print(hashlib.sha1(sys.argv[1].casefold().encode()).hexdigest()[:16])' "$1"; }
CFD="$M1/.git/coder-fleet"
K_MAIN=$(mkey "$M1"); K_STATE=$(mkey "$M1W/coder-fleet-state"); K_LIVE=$(mkey "$M1W/wt-live")
K_DONE=$(mkey "$M1W/wt-done"); K_GONE=$(mkey "$M1W/wt-long-gone")
for area in memory-start memory-base; do
    for k in "$K_MAIN" "$K_STATE" "$K_LIVE" "$K_DONE" "$K_GONE"; do
        mkdir -p "$CFD/$area/$k/coder-fleet-coder"
        printf 'note\n' > "$CFD/$area/$k/coder-fleet-coder/MEMORY.md"
    done
    mkdir -p "$CFD/$area/not-a-record"
done
printf 'keep\n' > "$TMP/m1-outside/file"
ln -s "$TMP/m1-outside" "$CFD/memory-base/0123456789abcdef"
printf 'x\n' > "$CFD/other"

GATE=1
prune "$TMP/m1-scratch" "$M1" --dry-run
check 'M01 a dry run exits 0'                           test "$RC" -eq 0
check 'M01 a dry run predicts the start record of the worktree it would remove' has_line "$(line would-delete-memory "memory-start/$K_DONE")"
check 'M01 and its base record'                         has_line "$(line would-delete-memory "memory-base/$K_DONE")"
check 'M01 and those of a worktree long gone'           has_line "$(line would-delete-memory "memory-base/$K_GONE")"
check 'M01 and deletes none of them'                    is_dir "$CFD/memory-start/$K_DONE"
check 'M01 nor the long-gone one'                       is_dir "$CFD/memory-base/$K_GONE"
check 'M01 and reports no memory line'                  absent has_prefix "$(line memory '')"

prune "$TMP/m1-scratch" "$M1"
check 'M01 exits 0'                                     test "$RC" -eq 0
check 'M01 the worktree removed this run'"'"'s start record is gone' absent test -e "$CFD/memory-start/$K_DONE"
check 'M01 and its base record'                         absent test -e "$CFD/memory-base/$K_DONE"
check 'M01 and both are reported'                       has_line "$(line memory "memory-base/$K_DONE")"
check 'M01 a long-gone worktree'"'"'s records are gone' absent test -e "$CFD/memory-start/$K_GONE"
check 'M01 and its base record'                         absent test -e "$CFD/memory-base/$K_GONE"
check 'M01 and reported'                                has_line "$(line memory "memory-start/$K_GONE")"
m01_kept() {
    local area k
    for area in memory-start memory-base; do
        for k in "$K_MAIN" "$K_STATE" "$K_LIVE"; do
            test -f "$CFD/$area/$k/coder-fleet-coder/MEMORY.md" || return 1
        done
    done
}
check 'M01 the main checkout'"'"'s, the state worktree'"'"'s and a live worktree'"'"'s records are kept' m01_kept
check 'M01 and none of them is reported'                absent has_line "$(line memory "memory-start/$K_LIVE")"
check 'M01 an entry not named like a record is kept'    is_dir "$CFD/memory-start/not-a-record"
check 'M01 a symlink named like a record is kept'       is_link "$CFD/memory-base/0123456789abcdef"
check 'M01 and its target is untouched'                 test -f "$TMP/m1-outside/file"
check 'M01 a file beside the records is untouched'      test -f "$CFD/other"

printf '\nM02 the state worktree'"'"'s records are kept even while git does not list it\n'
mkdir -p "$TMP/m2"
M2=$(cd "$TMP/m2" && pwd -P)
new_repo "$M2"
K2_STATE=$(mkey "$M2/.claude/worktrees/coder-fleet-state")
K2_OTHER=$(mkey "$M2/.claude/worktrees/wt-other")
for k in "$K2_STATE" "$K2_OTHER"; do mkdir -p "$M2/.git/coder-fleet/memory-start/$k"; done
prune "$TMP/m2-scratch" "$M2"
check 'M02 exits 0'                                     test "$RC" -eq 0
check 'M02 the unlisted state worktree'"'"'s record is kept' is_dir "$M2/.git/coder-fleet/memory-start/$K2_STATE"
check 'M02 an unlisted agent worktree'"'"'s record beside it is removed' absent test -e "$M2/.git/coder-fleet/memory-start/$K2_OTHER"

printf '\nM03 a dry run predicts the records of a missing worktree the real run'"'"'s git worktree prune drops\n'
mkdir -p "$TMP/m3"
M3=$(cd "$TMP/m3" && pwd -P)
new_repo "$M3"
git -C "$M3" worktree add -q "$M3/.claude/worktrees/wt-missing" -b wt-missing
K3_MISSING=$(mkey "$M3/.claude/worktrees/wt-missing")
mkdir -p "$M3/.git/coder-fleet/memory-base/$K3_MISSING"
rm -rf "$M3/.claude/worktrees/wt-missing"
prune "$TMP/m3-scratch" "$M3" --dry-run
check 'M03 a dry run exits 0'                           test "$RC" -eq 0
check 'M03 it predicts the missing worktree'"'"'s base record' has_line "$(line would-delete-memory "memory-base/$K3_MISSING")"

printf '\nM04 a helper that fails part way keeps the deletions it reported and names its own error\n'
mkdir -p "$TMP/m4" "$TMP/m4-plugin/scripts" "$TMP/m4-plugin/hooks/lib"
M4=$(cd "$TMP/m4" && pwd -P)
new_repo "$M4"
cp "$SCRIPT" "$TMP/m4-plugin/scripts/prune-worktrees.sh"
cp "$PLUGIN_ROOT/hooks/lib/fleet-config.sh" "$PLUGIN_ROOT/hooks/lib/fleet-config.py" "$TMP/m4-plugin/hooks/lib/"
# The script is a shim onto the boards binary, reached through ../boards/boards.sh (CF-1.2).
ln -s "$PLUGIN_ROOT/boards" "$TMP/m4-plugin/boards"
printf '%s\n' 'import sys' \
    'print("memory\tmemory-base/0123456789abcdef", flush=True)' \
    'sys.stderr.write("Traceback (most recent call last):\n  File \"x\", line 1\nPermissionError: boom\n")' \
    'sys.exit(1)' > "$TMP/m4-plugin/hooks/lib/memory-state.py"
OUT=$(cd "$M4" && CODER_FLEET_SCRATCH_ROOT="$TMP/m4-scratch" "$BASH" "$TMP/m4-plugin/scripts/prune-worktrees.sh" 2>"$TMP/stderr")
RC=$?
check 'M04 exits 0'                                     test "$RC" -eq 0
check 'M04 the deletion the helper printed is reported' has_line "$(line memory memory-base/0123456789abcdef)"
check 'M04 and the refusal names the error'             has_line "$(line refused 'memory records' 'PermissionError: boom')"

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

printf '\nS11 a live worktree path with an unverified encoding skips the sweep\n'
mkdir -p "$TMP/s11"
P11R=$(cd "$TMP/s11" && pwd -P)
new_repo "$P11R"
git -C "$P11R" worktree add -q "$P11R/.claude/worktrees/wt sp" -b wt-sp
printf 'work\n' > "$P11R/.claude/worktrees/wt sp/untracked.txt"
S11="$(enc "$P11R")--claude-worktrees-wt-gone"
mkdir -p "$TMP/s11-scratch/$S11"
prune "$TMP/s11-scratch" "$P11R"
check 'S11 exits 0'                                   test "$RC" -eq 0
check 'S11 the worktree with a space is live, kept dirty' has_line "$(line kept "$P11R/.claude/worktrees/wt sp" dirty)"
check 'S11 reports sweep-skipped encoding-unverified' has_line "$(line sweep-skipped encoding-unverified)"
check 'S11 the stale entry is kept'                   is_dir "$TMP/s11-scratch/$S11"
check 'S11 and not reported'                          absent has_prefix "$(line scratch '')"

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
