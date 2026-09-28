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
# Every CLAUDE.md mention anywhere in the repo is either in a path excluded
# below, with its reason, or whitelisted as its exact line, so a new stray
# mention fails this check, and so does a second one added to an allowed line.
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

# The scan covers the whole repo. What it skips entirely, and why. Everything
# else that names CLAUDE.md must be a line in WHITELIST below.
excluded() {
    case "$1" in
        # This test, which has to name the file it hunts for.
        claude/evals/lib/instruction-file-contract.sh) return 0 ;;
        # Board items: comments and history the board binary appends, quoting
        # whatever an item was about at the time.
        .boards/*) return 0 ;;
        # The OpenCode scope gate and its tests use `cat CLAUDE.md > pwned.txt`
        # as a fixture: a file every project has, read and redirected.
        opencode/coder-fleet/lib/scope.ts) return 0 ;;
        opencode/test/invariants/scope.test.ts) return 0 ;;
        opencode/test/invariants/live.test.ts) return 0 ;;
        # The ports' specs, registers, reviews and run articles: the record of
        # how each port got here, including the CLAUDE.md files they had then.
        opencode/docs/*|codex/docs/*) return 0 ;;
    esac
    return 1
}

# Every line allowed to name CLAUDE.md, as its exact current text: a second
# mention added inside one of these lines changes the line, and it fails.
# `F <file>` names the file (relative to the repo root) for the `L <line>`
# entries after it; each entry licenses one line; `#` lines are comments.
WHITELIST=$(cat <<'EOF'
# init and kickoff handle a pre-existing CLAUDE.md and the shadowing rule.
F claude/coder-fleet/commands/kickoff.md
L 3. **Skeleton.** `AGENTS.md` exists at the project root and contains no `<FILL: ...>` markers. A marker left in place is a line the session reads literally on every turn, so surviving markers are a failure, not a note. Then check for a shadow: a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the project root or any directory above it, up to `/` - Glob each of the three names in each directory, or run `d=$PWD; while :; do for f in CLAUDE.md .claude/CLAUDE.md CLAUDE.local.md; do [ -e "$d/$f" ] && [ "$d/$f" != "$HOME/.claude/CLAUDE.md" ] && echo "$d/$f"; done; [ "$d" = / ] && break; d=$(dirname "$d"); done` from the root, which prints every shadow and nothing else. `~/.claude/CLAUDE.md` does not count, even though the walk passes the home directory: it is the user's global file and loads alongside `AGENTS.md`. A `CLAUDE.md` directly in the home directory does count. If a shadow exists, the check fails and names the path, with the fix: rename that file to `AGENTS.md` (at the project root, where an `AGENTS.md` already exists, merge its content into that file and delete it), or set the project-instructions setting to `claude-md-and-agents-md` so Claude Code reads both (the `instructionFiles` option of the built-in `agents-md` plugin, reachable through `/config`); until then Claude Code reads the shadow and ignores `AGENTS.md` without a message.
F claude/coder-fleet/commands/init.md
L - `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md` -> `AGENTS.md` at the project root. If an `AGENTS.md` already exists, do not touch it - note the skip and, in the final report, list which sections of the template (stack, conventions, glossary pointer, where work lives, writing conventions) the existing file lacks, so the human can decide what to add. If a `CLAUDE.md` exists at the project root and no `AGENTS.md` does, offer with the AskUserQuestion tool to rename it to AGENTS.md (recommended: Claude Code reads only `CLAUDE.md` when both exist, so a new `AGENTS.md` beside it would never load) or to leave it and skip the skeleton; on rename, append the template sections the file lacks, marked, and continue to the marker walk.
# The suite's own description of this check.
F claude/evals/lib/check-all.sh
L #                         shadowing CLAUDE.md, and names CLAUDE.md nowhere else
# The user-scope ~/.claude/CLAUDE.md that install-home.sh copies from claude/home.
F claude/scripts/merge-settings.py
L for a CLAUDE.md and wrong for settings: the live file carries machine state the
F claude/scripts/install-home.sh
L #   1. Copy `home/` into `~/.claude` - settings.json, CLAUDE.md, rules/ and any
L #      ~/.claude/CLAUDE.md (section 8).
L         # Cowork skips a symlinked ~/.claude/CLAUDE.md, so a symlink here is a
L     if [ ! -f "$HOME_SRC/CLAUDE.md" ]; then
L         warn "home/CLAUDE.md does not exist yet, so ~/.claude/CLAUDE.md will not be installed."
# The design and the README: the user-scope file, and the shadowing rule.
F docs/fleet-design.md
L AGENTS.md is for things that must be true on every turn and fit in a sentence: stack, conventions, the glossary pointer, where specs live, "Australian English, hyphens not em dashes". Under 200 lines, no procedures. `@import` up to four hops if you want to compose it. Cowork skips a symlinked `~/.claude/CLAUDE.md`, so the install script copies that file rather than linking it.
L Every machine runs `claude/scripts/install-home.sh`, which copies `claude/home/` into `~/.claude` - today that is `settings.json`, merged rather than overwritten - renders any credentials listed in a local, uncommitted secret spec with `op read` from 1Password (none by default), and builds the board binary into `~/.local/bin/board`. The board itself is created per repository by `/coder-fleet:init`, which also writes the project's `AGENTS.md`. Claude Code reads AGENTS.md directly from v2.1.277; a CLAUDE.md or CLAUDE.local.md at the project root or above it shadows it, which is why init offers the rename and kickoff checks for a shadow. `~/.claude/projects/`, sessions, history, debug and `plugins/cache` are never touched. The plugin is installed at user scope from the marketplace, so `claude plugin marketplace update rzem` plus the install script is the whole sync story, and there is no dotfiles manager.
F README.md
L **The command route.** With the plugin installed, `/coder-fleet:init` inside a session does the whole per-project setup in one pass: it merges the three settings keys, copies the AGENTS.md skeleton and the glossary rule into the project, creates `docs/specs/` and `docs/plans/`, then reads the repo and interviews you to fill every `<FILL: ...>` marker. If the project root has a `CLAUDE.md` and no `AGENTS.md`, init offers to rename it, because Claude Code ignores an `AGENTS.md` that a `CLAUDE.md` shadows. Re-running it is safe - it skips what already exists and only offers to fill markers still present.
L Nothing init writes is live until the next session - settings, `AGENTS.md` and the plugin itself all load at startup - so init ends by telling you to restart, trust the folder, and run `/coder-fleet:kickoff`. Kickoff preflights the install (agents present, lead in charge, no markers left, skeleton and work directories in place), and fails if a `CLAUDE.md` or `CLAUDE.local.md` at the project root or above it shadows `AGENTS.md`. It then checks the board when the binary answers - `.boards/config.yml` here, its five statuses, the outcome labels, the `.gitignore` - and ends by stating the conventions: root, the `BD` prefix, status names, labels, and the item-ref binding. It cannot tell whether the binary on this machine is current, and says so. On a green preflight it takes the idea you typed after it - or asks for one - and starts the spec pipeline on it. On a red preflight it lists the fixes and stops; declining the board is never red.
L The user-scope half: the hardened `~/.claude/settings.json`, the user CLAUDE.md, rules and any local agent copies that live in `claude/home/`. Run it on any machine that spawns fleet agents.
L - Everything else in `claude/home/` is copied, not symlinked, because Cowork ignores a symlinked `~/.claude/CLAUDE.md`. An existing symlink is replaced with a real file.
# The OpenCode port's init and kickoff: OpenCode reads CLAUDE.md when no
# AGENTS.md exists, so its commands handle one the other way round.
F opencode/coder-fleet/command/kickoff.md
L 3. **Skeleton.** `AGENTS.md` exists at the project root and contains no `<FILL: ...>` markers. A marker left in place is a line the session reads literally on every turn, so surviving markers are a failure, not a note. If the project has a `CLAUDE.md` and no `AGENTS.md`, that is fine and OpenCode reads it - check the same two things about that file instead, and say which file you checked.
F opencode/coder-fleet/command/init.md
L   - Neither `AGENTS.md` nor `CLAUDE.md` exists: copy the template.
L   - `CLAUDE.md` exists and `AGENTS.md` does not: do not write `AGENTS.md`. OpenCode reads the first instruction file it finds in the order `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` and stops there (`packages/opencode/src/session/instruction.ts:64-68`, `:121-131`), so writing the skeleton would silently take the project's existing instructions out of every prompt. Report it, say which sections of the template the existing `CLAUDE.md` lacks - stack, conventions, glossary pointer, where work lives, writing conventions - and let the human decide whether to add them there or rename the file.
EOF
)

whitelist_entries() {
    local line file=""
    while IFS= read -r line; do
        case "$line" in
            'F '*) file=${line#F } ;;
            'L '*) printf '%s\t%s\n' "$file" "${line#L }" ;;
        esac
    done <<< "$WHITELIST"
}

printf '\nNo stray CLAUDE.md mention\n'
SCAN=$(mktemp -d "${TMPDIR:-/tmp}/instruction-file.XXXXXX") || exit 2
trap 'rm -rf "$SCAN"' EXIT
# .claude is skipped for the worktrees a main checkout holds under
# .claude/worktrees/; the repo tracks nothing under any .claude directory.
while IFS= read -r hit; do
    rel=${hit#"$REPO_ROOT"/}
    file=${rel%%:*}
    rest=${rel#*:}
    text=${rest#*:}
    excluded "$file" && continue
    printf '%s\t%s\n' "$file" "$text"
done < <(grep -rnIF --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
            --exclude-dir=.claude 'CLAUDE.md' "$REPO_ROOT") | LC_ALL=C sort > "$SCAN/hits"
whitelist_entries | LC_ALL=C sort > "$SCAN/allowed"
# comm counts duplicates, so the same line twice in one file needs two entries.
LC_ALL=C comm -23 "$SCAN/hits" "$SCAN/allowed" > "$SCAN/strays"
while IFS=$'\t' read -r file text; do
    printf '  stray %s: %s\n' "$file" "${text:0:160}"
done < "$SCAN/strays"
strays=$(grep -c . "$SCAN/strays" || true)
check 'every CLAUDE.md mention is whitelisted'     test "$strays" -eq 0

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The fleet still writes or checks CLAUDE.md somewhere, or can leave an AGENTS.md that never loads.\n'
    exit 1
fi
printf 'The fleet writes and checks AGENTS.md, and init and kickoff handle a shadow.\n'
