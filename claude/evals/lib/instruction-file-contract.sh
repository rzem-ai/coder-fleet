#!/usr/bin/env bash
#
# instruction-file-contract.sh - the project instruction file the fleet writes
# and checks is AGENTS.md, never CLAUDE.md.
#
# Claude Code reads AGENTS.md directly from v2.1.277, but only when no
# CLAUDE.md, .claude/CLAUDE.md or CLAUDE.local.md exists in the working
# directory or any directory above it. When one does, AGENTS.md is ignored
# without a message. So init must offer to rename an existing CLAUDE.md rather
# than write a second file beside it, and kickoff must fail on a shadow.
#
# Every CLAUDE.md mention left under claude/coder-fleet, docs (bar docs/plans)
# and README.md is whitelisted below by file and pattern, with its reason, so
# a new stray mention fails this check.
#
# Usage:  claude/evals/lib/instruction-file-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)

INIT="$PLUGIN_ROOT/commands/init.md"
KICKOFF="$PLUGIN_ROOT/commands/kickoff.md"

PASSED=0
FAILED=0

check() {
    # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$label"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s\n' "$label"
    fi
    return 0
}

absent() { ! "$@"; }

kickoff_skeleton_line() { grep -E '^3\. \*\*Skeleton\.\*\*' "$KICKOFF"; }
skeleton_names() { kickoff_skeleton_line | grep -qF -- "$1"; }

printf '\nThe template is AGENTS.md\n'
check 'templates/AGENTS.md exists'                 test -f "$PLUGIN_ROOT/templates/AGENTS.md"
check 'templates/CLAUDE.md does not'               absent test -e "$PLUGIN_ROOT/templates/CLAUDE.md"

printf '\ninit writes AGENTS.md and offers the rename\n'
check 'init copies templates/AGENTS.md'            grep -qF 'templates/AGENTS.md' "$INIT"
check 'init offers to rename it to AGENTS.md'      grep -qF 'rename it to AGENTS.md' "$INIT"
check 'init never copies to CLAUDE.md'             absent grep -qF -- '-> `CLAUDE.md`' "$INIT"

printf '\nkickoff checks AGENTS.md and a shadow\n'
check 'the skeleton step names AGENTS.md'          skeleton_names 'AGENTS.md'
check 'the skeleton step checks for a shadow'      skeleton_names 'shadow'
check 'the shadow check names .claude/CLAUDE.md'   skeleton_names '.claude/CLAUDE.md'
check 'the shadow check names CLAUDE.local.md'     skeleton_names 'CLAUDE.local.md'
check 'the shadow check walks up to /'             skeleton_names 'up to `/`'
check 'the fix names claude-md-and-agents-md'      skeleton_names 'claude-md-and-agents-md'
check 'the user file is said not to count'         skeleton_names '`~/.claude/CLAUDE.md` does not count'

# file (relative to the repo root) <TAB> extended regex the line must match.
# Anything not listed here is a stray.
WHITELIST=$(cat <<'EOF'
claude/coder-fleet/commands/init.md	If a `CLAUDE\.md` exists at the project root and no `AGENTS\.md` does
claude/coder-fleet/commands/kickoff.md	^3\. \*\*Skeleton\.\*\*.*Then check for a shadow
docs/fleet-design.md	shadows it, which is why init offers the rename
docs/fleet-design.md	Cowork skips a symlinked `~/\.claude/CLAUDE\.md`
README.md	The user-scope half: the hardened `~/\.claude/settings\.json`, the user CLAUDE\.md
README.md	Cowork ignores a symlinked `~/\.claude/CLAUDE\.md`
README.md	If the project root has a `CLAUDE\.md` and no `AGENTS\.md`, init offers to rename it
README.md	and fails if a `CLAUDE\.md` or `CLAUDE\.local\.md` at the project root or above it shadows `AGENTS\.md`
EOF
)

whitelisted() {
    # $1 relative file, $2 line text
    local file pattern
    while IFS=$'\t' read -r file pattern; do
        [ "$file" = "$1" ] || continue
        printf '%s\n' "$2" | grep -qE -- "$pattern" && return 0
    done <<< "$WHITELIST"
    return 1
}

printf '\nNo stray CLAUDE.md mention\n'
strays=0
while IFS= read -r hit; do
    rel=${hit#"$REPO_ROOT"/}
    file=${rel%%:*}
    rest=${rel#*:}
    text=${rest#*:}
    case "$file" in docs/plans/*) continue ;; esac
    if ! whitelisted "$file" "$text"; then
        strays=$((strays + 1))
        printf '  stray %s\n' "${rel:0:200}"
    fi
done < <(grep -rnIF --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
            'CLAUDE.md' "$PLUGIN_ROOT" "$REPO_ROOT/docs" "$REPO_ROOT/README.md")
check 'every CLAUDE.md mention is whitelisted'     test "$strays" -eq 0

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The fleet still writes or checks CLAUDE.md somewhere, or can leave an AGENTS.md that never loads.\n'
    exit 1
fi
printf 'The fleet writes and checks AGENTS.md, and init and kickoff handle a shadow.\n'
