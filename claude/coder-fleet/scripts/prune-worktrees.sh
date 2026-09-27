#!/usr/bin/env bash
#
# prune-worktrees.sh - remove the agent worktrees whose work has been adopted,
# then sweep the scratch directories of worktrees that no longer exist.
#
# Run by /coder-fleet:prune-worktrees, from anywhere inside the repository. A
# worktree is removed only when all of these hold, each answered by git:
#   - its path is under <main checkout>/.claude/worktrees/
#   - it does not hold the current directory
#   - it is not locked: the harness locks an agent worktree while its agent
#     runs, so a lock means it may be in use, and is never lifted here
#   - git status shows nothing, untracked files included
#   - its HEAD is an ancestor of the default branch, local or origin's
# Every verdict is taken before anything is removed. Removal is git worktree
# remove, then git branch -d, then one git worktree prune. A git refusal is
# reported and left as it is; nothing is ever forced.
#
# The scratch sweep reads CODER_FLEET_SCRATCH_ROOT, else /private/tmp/claude-<uid>
# when /private/tmp exists, else /tmp/claude-<uid>. The harness names each entry
# by encoding a working directory with tr '/.' '--', so every name starts with
# '-' and is compared only with quoted case patterns and [ = ], never handed to
# a tool as a pattern. Only a real directory named <enc(main)>--claude-worktrees-
# something, matching no live worktree's encoded path exactly or as a prefix
# followed by '-', is deleted. If any path involved holds a character whose
# encoding is unverified, the sweep is skipped.
#
# Output, one tab-separated line per verdict:
#   removed <path> <branch|-> <head>      would-remove under --dry-run
#   kept <path> <not-agent|current|locked|dirty|unmerged>
#   scratch <name>                        would-delete-scratch under --dry-run
#   refused <path-or-branch> <first line of git's stderr>
#   sweep-skipped <encoding-unverified|no-scratch-root>
# Exit 0 whenever it ran, refusals included; 2 on a usage error or outside a
# git repository.
#
# Usage:  prune-worktrees.sh [--dry-run]

set -uo pipefail
export LC_ALL=C

usage() { printf 'usage: prune-worktrees.sh [--dry-run]\n' >&2; exit 2; }

DRY=0
case $# in
    0) ;;
    1) if [ "$1" = "--dry-run" ]; then DRY=1; else usage; fi ;;
    *) usage ;;
esac

NL=$'\n'
CR=$'\r'
emit() { local IFS=$'\t'; printf '%s\n' "$*"; }
first_line() { local s=${1%%"$NL"*}; printf '%s' "${s%"$CR"}"; }
real_path() { if [ -d "$1" ]; then (cd "$1" && pwd -P); else printf '%s' "$1"; fi; }
enc() { printf '%s' "$1" | tr '/.' '--'; }

git rev-parse --path-format=absolute --git-common-dir >/dev/null 2>&1 || {
    printf 'prune-worktrees.sh: not inside a git repository\n' >&2; exit 2; }

CWD_REAL=$(pwd -P)

# Fills WT_PATH, WT_HEAD, WT_BRANCH, WT_LOCKED and N from the porcelain
# listing. Entry 0 is the main checkout.
read_worktrees() {
    WT_PATH=(); WT_HEAD=(); WT_BRANCH=(); WT_LOCKED=(); N=0
    local field p="" h="" b="-" lk=0
    while IFS= read -r -d '' field; do
        if [ -z "$field" ]; then
            if [ -n "$p" ]; then
                WT_PATH[N]=$p; WT_HEAD[N]=$h; WT_BRANCH[N]=$b; WT_LOCKED[N]=$lk
                N=$((N + 1))
            fi
            p=""; h=""; b="-"; lk=0
            continue
        fi
        case "$field" in
            "worktree "*) p=${field#worktree } ;;
            "HEAD "*) h=${field#HEAD } ;;
            "branch "*) b=${field#branch }; b=${b#refs/heads/} ;;
            detached) b="-" ;;
            locked|"locked "*) lk=1 ;;
        esac
    done < <(git worktree list --porcelain -z)
    if [ -n "$p" ]; then
        WT_PATH[N]=$p; WT_HEAD[N]=$h; WT_BRANCH[N]=$b; WT_LOCKED[N]=$lk
        N=$((N + 1))
    fi
}

read_worktrees
[ "$N" -gt 0 ] || { printf 'prune-worktrees.sh: git listed no worktrees\n' >&2; exit 2; }
MAIN=${WT_PATH[0]}
MAIN_REAL=$(real_path "$MAIN")
AGENT_PREFIX="$MAIN_REAL/.claude/worktrees/"

# The default branch: what origin/HEAD names, else main. Either the local
# branch or origin's copy proves the commits exist outside the worktree.
DEFAULT=$(git -C "$MAIN" symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null)
DEFAULT=${DEFAULT#refs/remotes/origin/}
[ -n "$DEFAULT" ] || DEFAULT=main
DEFAULT_REFS=()
for ref in "refs/heads/$DEFAULT" "refs/remotes/origin/$DEFAULT"; do
    git -C "$MAIN" show-ref --verify -q "$ref" && DEFAULT_REFS+=("$ref")
done

is_merged() {
    local ref
    [ -n "$1" ] || return 1
    for ref in ${DEFAULT_REFS[@]+"${DEFAULT_REFS[@]}"}; do
        git -C "$MAIN" merge-base --is-ancestor "$1" "$ref" 2>/dev/null && return 0
    done
    return 1
}

is_clean() {
    local out
    out=$(git -C "$1" status --porcelain --untracked-files=normal --ignore-submodules=none 2>/dev/null) || return 1
    [ -z "$out" ]
}

# --- verdicts, all taken before anything is removed --------------------------

REMOVE=()
i=1
while [ "$i" -lt "$N" ]; do
    p=${WT_PATH[i]}
    pr=$(real_path "$p")
    case "$pr" in
        "$AGENT_PREFIX"?*) ;;
        *) emit kept "$p" not-agent; i=$((i + 1)); continue ;;
    esac
    if [ "$CWD_REAL" = "$pr" ]; then emit kept "$p" current; i=$((i + 1)); continue; fi
    case "$CWD_REAL" in "$pr"/*) emit kept "$p" current; i=$((i + 1)); continue ;; esac
    if [ "${WT_LOCKED[i]}" -eq 1 ]; then emit kept "$p" locked; i=$((i + 1)); continue; fi
    if ! is_clean "$p"; then emit kept "$p" dirty; i=$((i + 1)); continue; fi
    if ! is_merged "${WT_HEAD[i]}"; then emit kept "$p" unmerged; i=$((i + 1)); continue; fi
    REMOVE+=("$i")
    i=$((i + 1))
done

# --- removal -----------------------------------------------------------------

REMOVED_PATHS=()
for i in ${REMOVE[@]+"${REMOVE[@]}"}; do
    p=${WT_PATH[i]}; b=${WT_BRANCH[i]}; h=${WT_HEAD[i]}
    if [ "$DRY" -eq 1 ]; then
        emit would-remove "$p" "$b" "$h"
        REMOVED_PATHS+=("$p")
        continue
    fi
    if err=$(git -C "$MAIN" worktree remove "$p" 2>&1 >/dev/null); then
        emit removed "$p" "$b" "$h"
        REMOVED_PATHS+=("$p")
        if [ "$b" != "-" ] && [ "$b" != "$DEFAULT" ]; then
            if ! err=$(git -C "$MAIN" branch -d "$b" 2>&1 >/dev/null); then
                emit refused "$b" "$(first_line "$err")"
            fi
        fi
    else
        emit refused "$p" "$(first_line "$err")"
    fi
done

if [ "$DRY" -eq 0 ]; then
    err=$(git -C "$MAIN" worktree prune 2>&1 >/dev/null) || emit refused "worktree prune" "$(first_line "$err")"
fi

# --- scratch sweep, against the worktrees live now ---------------------------

ROOT=${CODER_FLEET_SCRATCH_ROOT:-}
if [ -z "$ROOT" ]; then
    if [ -d /private/tmp ]; then ROOT="/private/tmp/claude-$(id -u)"; else ROOT="/tmp/claude-$(id -u)"; fi
fi

if [ ! -d "$ROOT" ]; then
    emit sweep-skipped no-scratch-root
    exit 0
fi

read_worktrees
unverified() { case "$1" in *[!A-Za-z0-9/._-]*) return 0 ;; esac; return 1; }

unverified "$MAIN_REAL" && { emit sweep-skipped encoding-unverified; exit 0; }
LIVE_ENC=()
i=1
while [ "$i" -lt "$N" ]; do
    p=${WT_PATH[i]}
    gone=0
    for q in ${REMOVED_PATHS[@]+"${REMOVED_PATHS[@]}"}; do
        [ "$q" = "$p" ] && gone=1
    done
    if [ "$gone" -eq 0 ]; then
        pr=$(real_path "$p")
        unverified "$pr" && { emit sweep-skipped encoding-unverified; exit 0; }
        LIVE_ENC+=("$(enc "$pr")")
    fi
    i=$((i + 1))
done

SCRATCH_PREFIX="$(enc "$MAIN_REAL")--claude-worktrees-"

is_live() {
    local e
    for e in ${LIVE_ENC[@]+"${LIVE_ENC[@]}"}; do
        [ "$1" = "$e" ] && return 0
        case "$1" in "$e"-*) return 0 ;; esac
    done
    return 1
}

for entry in "$ROOT"/*; do
    [ -L "$entry" ] && continue
    [ -d "$entry" ] || continue
    name=${entry##*/}
    case "$name" in "$SCRATCH_PREFIX"?*) ;; *) continue ;; esac
    is_live "$name" && continue
    if [ "$DRY" -eq 1 ]; then
        emit would-delete-scratch "$name"
    elif err=$(rm -rf -- "$ROOT/$name" 2>&1); then
        emit scratch "$name"
    else
        emit refused "$ROOT/$name" "$(first_line "$err")"
    fi
done

exit 0
