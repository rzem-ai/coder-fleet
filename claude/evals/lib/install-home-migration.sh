#!/usr/bin/env bash
#
# install-home-migration.sh - prove install-home.sh migrates a machine still
# on the old name, per "Machines already running the fleet" in the coder-fleet
# migration design and Task 4 of its task list. Both files were deleted in
# CF-58 and are in git history before commit 612f84f.
#
# Everything here runs against a temporary HOME under ${TMPDIR:-/tmp} and
# never touches the real ~/.config or ~/.claude. Most cases source
# install-home.sh with INSTALL_HOME_LIB=1, which makes it define its functions
# and return before the main flow runs, so migrate_previous_install can be
# called directly and its effect on the filesystem checked without a
# 1Password session. The end-to-end cases near the bottom run the script
# itself, with --dry-run and for real under a stub op, so the main flow's
# order - every preflight check before the move - is covered too.
#
# Usage:  evals/lib/install-home-migration.sh

set -euo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)
HARNESS_ROOT=$(cd "$EVAL_ROOT/.." && pwd)
INSTALL_SCRIPT="$HARNESS_ROOT/scripts/install-home.sh"

FAILED=0
fail() { printf 'FAIL: %s\n' "$*" >&2; FAILED=1; }
pass() { printf 'ok: %s\n' "$*"; }

# run_migrate <HOME> [install-home.sh args...] - source install-home.sh under
# that HOME and call migrate_previous_install once. Any arguments after HOME
# (e.g. --dry-run) are passed to the sourced script itself, so its own
# argument-parsing loop sets DRY_RUN exactly as a real invocation would.
# Prints whatever the function prints.
run_migrate() {
    local home="$1"; shift
    (
        HOME="$home"
        INSTALL_HOME_LIB=1
        # Sourcing passes "$@" on as the sourced script's own positional
        # parameters; with none left after the shift above, that is an empty
        # list rather than a leak of this function's own arguments.
        # shellcheck disable=SC1090
        source "$INSTALL_SCRIPT" "$@"
        migrate_previous_install
    )
}

T=$(mktemp -d "${TMPDIR:-/tmp}/install-home-migration.XXXXXX")
trap 'rm -rf "$T"' EXIT

# --- Assertion 1: a machine on the old secrets directory and marketplace ---

T1="$T/case1"
mkdir -p "$T1/.config/claudecode-agents" "$T1/.claude"
printf 'old' > "$T1/.config/claudecode-agents/secrets.spec"
cat > "$T1/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/claudecode-agents" } }
  },
  "enabledPlugins": { "claudecode-agents@rzem": true }
}
JSON

run_migrate "$T1" >"$T/case1-output.txt" 2>&1 || { fail "migrate_previous_install exited non-zero on case 1"; cat "$T/case1-output.txt" >&2; }

if [ -f "$T1/.config/coder-fleet/secrets.spec" ] \
    && [ "$(cat "$T1/.config/coder-fleet/secrets.spec")" = old ] \
    && [ ! -e "$T1/.config/claudecode-agents" ]; then
    # Python, not stat: BSD and GNU stat disagree on -f, and GNU's -f succeeds
    # with filesystem details instead of failing over to the other form.
    mode=$(python3 -c 'import os,stat,sys; print(format(stat.S_IMODE(os.stat(sys.argv[1]).st_mode), "o"))' "$T1/.config/coder-fleet/secrets.spec")
    if [ "$mode" = "600" ]; then
        pass "moves the secrets directory to the new path at mode 600"
    else
        fail "secrets.spec mode is $mode, expected 600"
    fi
else
    fail "did not move ~/.config/claudecode-agents to ~/.config/coder-fleet"
fi

# --- Assertion 3: the marketplace source is repointed ---

repo=$(jq -r '.extraKnownMarketplaces.rzem.source.repo' "$T1/.claude/settings.json")
if [ "$repo" = rzem-ai/coder-fleet ]; then
    pass "repoints extraKnownMarketplaces.rzem.source.repo to rzem-ai/coder-fleet"
else
    fail "extraKnownMarketplaces.rzem.source.repo is '$repo', expected rzem-ai/coder-fleet"
fi

# --- Assertion 2: both directories present, leave both alone ---

T2="$T/case2"
mkdir -p "$T2/.config/claudecode-agents" "$T2/.config/coder-fleet" "$T2/.claude"
printf 'old' > "$T2/.config/claudecode-agents/secrets.spec"
printf 'new' > "$T2/.config/coder-fleet/secrets.spec"
chmod 600 "$T2/.config/coder-fleet/secrets.spec"
cat > "$T2/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/claudecode-agents" } }
  }
}
JSON

out2=$(run_migrate "$T2" 2>&1) || { fail "migrate_previous_install exited non-zero on case 2"; printf '%s\n' "$out2" >&2; }

if [ "$(cat "$T2/.config/coder-fleet/secrets.spec")" = new ] \
    && [ -d "$T2/.config/claudecode-agents" ] \
    && [ "$(cat "$T2/.config/claudecode-agents/secrets.spec")" = old ]; then
    pass "leaves both secrets directories alone when both exist"
else
    fail "case 2 touched a directory it should have left alone"
fi

if grep -q 'both exist' <<<"$out2"; then
    pass "prints a line naming 'both exist' when it declines to move"
else
    fail "did not print a line containing 'both exist' (got: $out2)"
fi

# --- Assertion 5 (this task's addition): a settings.json already on the new
# name, or with no rzem entry at all, is untouched byte-for-byte. ---

T3="$T/case3-already-new"
mkdir -p "$T3/.claude"
cat > "$T3/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/coder-fleet" } }
  }
}
JSON
cp "$T3/.claude/settings.json" "$T/case3-before.json"
run_migrate "$T3" >/dev/null 2>&1 || { fail "migrate_previous_install exited non-zero on case 3"; }
if cmp -s "$T3/.claude/settings.json" "$T/case3-before.json"; then
    pass "leaves a settings.json already on rzem-ai/coder-fleet byte-identical"
else
    fail "a settings.json already on the new name was rewritten"
fi

T4="$T/case4-no-rzem"
mkdir -p "$T4/.claude"
cat > "$T4/.claude/settings.json" <<'JSON'
{
  "model": "opus"
}
JSON
cp "$T4/.claude/settings.json" "$T/case4-before.json"
run_migrate "$T4" >/dev/null 2>&1 || { fail "migrate_previous_install exited non-zero on case 4"; }
if cmp -s "$T4/.claude/settings.json" "$T/case4-before.json"; then
    pass "leaves a settings.json with no rzem entry byte-identical"
else
    fail "a settings.json with no rzem entry was rewritten"
fi

# --- Assertion (fix round): --dry-run changes nothing and names both actions ---

T5="$T/case5-dry-run"
mkdir -p "$T5/.config/claudecode-agents" "$T5/.claude"
printf 'old' > "$T5/.config/claudecode-agents/secrets.spec"
cat > "$T5/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/claudecode-agents" } }
  }
}
JSON
cp "$T5/.claude/settings.json" "$T/case5-before.json"

out5=$(run_migrate "$T5" --dry-run 2>&1) || { fail "migrate_previous_install exited non-zero on case 5 (--dry-run)"; printf '%s\n' "$out5" >&2; }

if [ -d "$T5/.config/claudecode-agents" ] \
    && [ "$(cat "$T5/.config/claudecode-agents/secrets.spec")" = old ] \
    && [ ! -e "$T5/.config/coder-fleet" ]; then
    pass "--dry-run leaves the old secrets directory in place and creates no new one"
else
    fail "--dry-run touched the secrets directories"
fi

if cmp -s "$T5/.claude/settings.json" "$T/case5-before.json"; then
    pass "--dry-run leaves settings.json byte-identical"
else
    fail "--dry-run rewrote settings.json"
fi

if grep -q 'would move' <<<"$out5" && grep -q 'would repoint' <<<"$out5"; then
    pass "--dry-run prints both 'would move' and 'would repoint' lines"
else
    fail "--dry-run output is missing a 'would' line (got: $out5)"
fi

# --- End to end: install-home.sh --dry-run, the real main flow ---
#
# Everything above calls migrate_previous_install directly, so it cannot see
# what the main flow does around the call. These cases run the script itself.
# The environment the script reads for paths is cleared so nothing points at
# the real machine, and a stub op that always fails sits first on PATH, so
# the 1Password preflight never reaches a real vault. A dry run never builds
# the board: install_board only prints "would build" in that mode.

STUB_BIN="$T/stub-bin"
mkdir -p "$STUB_BIN"
printf '#!/bin/sh\nexit 1\n' > "$STUB_BIN/op"
chmod 755 "$STUB_BIN/op"

# run_install_dry <HOME> - run install-home.sh --dry-run under that HOME.
run_install_dry() {
    env -u CLAUDE_CONFIG_DIR -u CODER_FLEET_SECRET_SPEC -u CODER_FLEET_BACKUP_DIR \
        -u XDG_STATE_HOME -u OP_SERVICE_ACCOUNT_TOKEN \
        HOME="$1" PATH="$STUB_BIN:$PATH" \
        bash "$INSTALL_SCRIPT" --dry-run
}

T6="$T/case6-e2e-dry-run"
mkdir -p "$T6/.config/claudecode-agents" "$T6/.claude"
printf 'token|op://vault/item/field\n' > "$T6/.config/claudecode-agents/secrets.spec"
# Already rendered once under the old name, so a real run would refresh it.
printf 'old-value' > "$T6/.config/claudecode-agents/token"
cat > "$T6/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/claudecode-agents" } }
  }
}
JSON

out6=$(run_install_dry "$T6" 2>&1) || { fail "install-home.sh --dry-run exited non-zero on case 6"; printf '%s\n' "$out6" >&2; }

# The spec is still at the old path during a dry run, and a real first run
# counted before the move; either way the script must see the one secret.
if grep -q '(0 listed' <<<"$out6" || grep -q 'skipping 1Password' <<<"$out6"; then
    fail "--dry-run counted no secrets though the old directory holds one (got: $out6)"
else
    pass "--dry-run counts the secrets in a directory it would move"
fi

# The main flow calls the migration: without the call these lines never
# reach the output, whatever the function itself would print.
if grep -q '^would move .*/\.config/claudecode-agents to .*/\.config/coder-fleet$' <<<"$out6"; then
    pass "the real --dry-run output says it would move the secrets directory"
else
    fail "the real --dry-run output has no 'would move' line (got: $out6)"
fi

if grep -qx 'would repoint marketplace rzem to rzem-ai/coder-fleet' <<<"$out6"; then
    pass "the real --dry-run output says it would repoint the marketplace"
else
    fail "the real --dry-run output has no 'would repoint' line (got: $out6)"
fi

# While a move is pending the secrets lines describe the directory that will
# arrive, not an empty new one: nothing is created, and a secret already
# rendered in the old directory is refreshed, not rendered for the first time.
if grep -q 'would create .*coder-fleet' <<<"$out6"; then
    fail "--dry-run says it would create the secrets directory it would move (got: $out6)"
else
    pass "--dry-run does not claim to create the secrets directory it would move"
fi
if grep -q 'would refresh  *token' <<<"$out6"; then
    pass "--dry-run reports a secret already in the old directory as a refresh"
else
    fail "--dry-run did not report the existing secret as a refresh (got: $out6)"
fi

# --- Assertion 4: the closing text names the new install id, in the output ---

if grep -qx '  claude plugin install coder-fleet@rzem' <<<"$out6"; then
    pass "the real --dry-run output closes with 'claude plugin install coder-fleet@rzem'"
else
    fail "the real --dry-run output never prints 'claude plugin install coder-fleet@rzem' (got: $out6)"
fi

# --- board.env still on the old variable names: warn, name them, never rewrite ---
#
# The board hooks read CODER_FLEET_* now and ignore the old names, so a
# board.env carried across by the move silently stops configuring anything.
# The warning names each old variable and its new name, and never a value.

seed_board_env() {
    # $1 directory to write board.env into
    mkdir -p "$1"
    cat > "$1/board.env" <<'ENV'
# CLAUDECODE_AGENTS_COMMENTED=not-an-assignment
CLAUDECODE_AGENTS_REPO=/value/that/must/not/print
  export CLAUDECODE_AGENTS_BOARD_ROOT="another-secret-value"
CODER_FLEET_STATE_DIR=/already/new
ENV
}

check_board_env_warning() {
    # $1 label, $2 output, $3 board.env path, $4 its copy from before the run
    if grep -q 'CLAUDECODE_AGENTS_REPO (now CODER_FLEET_REPO)' <<<"$2" \
        && grep -q 'CLAUDECODE_AGENTS_BOARD_ROOT (now CODER_FLEET_BOARD_ROOT)' <<<"$2"; then
        pass "$1: warns with each old name in board.env and its new name"
    else
        fail "$1: no warning naming the old board.env variables (got: $2)"
    fi
    if grep -q 'COMMENTED' <<<"$2"; then
        fail "$1: the warning named a commented-out line"
    else
        pass "$1: a commented-out line is not an assignment"
    fi
    if grep -q -e 'must/not/print' -e 'another-secret-value' <<<"$2"; then
        fail "$1: the output printed a board.env value"
    else
        pass "$1: the output prints no board.env value"
    fi
    if cmp -s "$3" "$4"; then
        pass "$1: board.env is left byte-identical"
    else
        fail "$1: board.env was rewritten"
    fi
}

T7="$T/case7-board-env-dry-run"
mkdir -p "$T7/.claude"
seed_board_env "$T7/.config/claudecode-agents"
cp "$T7/.config/claudecode-agents/board.env" "$T/case7-before.env"
out7=$(run_install_dry "$T7" 2>&1) || { fail "install-home.sh --dry-run exited non-zero on case 7"; printf '%s\n' "$out7" >&2; }
check_board_env_warning "--dry-run" "$out7" "$T7/.config/claudecode-agents/board.env" "$T/case7-before.env"

# A real run, after the move. No secrets.spec, so 1Password is skipped, and
# every PATH entry holding bun is dropped, so the board is not built: without
# bun the script warns and carries on.
NO_BUN_PATH="$STUB_BIN"
IFS=: read -r -a path_dirs <<< "$PATH"
for d in "${path_dirs[@]}"; do
    [ -n "$d" ] && [ ! -x "$d/bun" ] && NO_BUN_PATH="$NO_BUN_PATH:$d"
done

T8="$T/case8-board-env-real"
mkdir -p "$T8/.claude"
seed_board_env "$T8/.config/claudecode-agents"
cp "$T8/.config/claudecode-agents/board.env" "$T/case8-before.env"
out8=$(env -u CLAUDE_CONFIG_DIR -u CODER_FLEET_SECRET_SPEC -u CODER_FLEET_BACKUP_DIR \
        -u XDG_STATE_HOME -u OP_SERVICE_ACCOUNT_TOKEN \
        HOME="$T8" PATH="$NO_BUN_PATH" \
        bash "$INSTALL_SCRIPT" 2>&1) || { fail "install-home.sh exited non-zero on case 8"; printf '%s\n' "$out8" >&2; }
if [ -f "$T8/.config/coder-fleet/board.env" ]; then
    check_board_env_warning "a real run" "$out8" "$T8/.config/coder-fleet/board.env" "$T/case8-before.env"
else
    fail "a real run did not move board.env to ~/.config/coder-fleet"
fi

# --- A real run that dies at a preflight check has changed nothing ---
#
# The 1Password check dies with "nothing has been changed". On a machine still
# on the old name that message is only true if the move and the repoint wait
# until every check has passed. The failing stub op is first on PATH here.

T9="$T/case9-real-op-fails"
mkdir -p "$T9/.config/claudecode-agents" "$T9/.claude"
printf 'token|op://vault/item/field\n' > "$T9/.config/claudecode-agents/secrets.spec"
cat > "$T9/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/claudecode-agents" } }
  }
}
JSON
cp "$T9/.claude/settings.json" "$T/case9-before.json"
rc9=0
out9=$(env -u CLAUDE_CONFIG_DIR -u CODER_FLEET_SECRET_SPEC -u CODER_FLEET_BACKUP_DIR \
        -u XDG_STATE_HOME -u OP_SERVICE_ACCOUNT_TOKEN \
        HOME="$T9" PATH="$NO_BUN_PATH" \
        bash "$INSTALL_SCRIPT" 2>&1) || rc9=$?
if [ "$rc9" -ne 0 ]; then
    pass "a real run exits non-zero when 1Password is not usable"
else
    fail "a real run exited 0 though op whoami fails (got: $out9)"
fi
if [ -f "$T9/.config/claudecode-agents/secrets.spec" ] && [ ! -e "$T9/.config/coder-fleet" ]; then
    pass "a real run that dies at the 1Password check leaves the old directory and creates no new one"
else
    fail "a real run that died at the 1Password check moved the secrets directory"
fi
if cmp -s "$T9/.claude/settings.json" "$T/case9-before.json"; then
    pass "a real run that dies at the 1Password check leaves settings.json byte-identical"
else
    fail "a real run that died at the 1Password check rewrote settings.json"
fi
if grep -q 'nothing has been changed' <<<"$out9"; then
    pass "a real run that dies at the 1Password check says nothing has been changed"
else
    fail "a real run that died at the 1Password check did not say nothing has been changed (got: $out9)"
fi

# --- A real run whose checks pass migrates, then renders into the new place ---

STUB_OK="$T/stub-bin-ok"
mkdir -p "$STUB_OK"
cat > "$STUB_OK/op" <<'SH'
#!/bin/sh
case "$1" in
    whoami) exit 0 ;;
    read) printf 'rendered-value'; exit 0 ;;
esac
exit 1
SH
chmod 755 "$STUB_OK/op"

T10="$T/case10-real-op-ok"
mkdir -p "$T10/.config/claudecode-agents" "$T10/.claude"
printf 'token|op://vault/item/field\n' > "$T10/.config/claudecode-agents/secrets.spec"
cat > "$T10/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/claudecode-agents" } }
  }
}
JSON
cp "$T10/.claude/settings.json" "$T/case10-before.json"
chmod 644 "$T10/.claude/settings.json"
out10=$(env -u CLAUDE_CONFIG_DIR -u CODER_FLEET_SECRET_SPEC -u CODER_FLEET_BACKUP_DIR \
        -u XDG_STATE_HOME -u OP_SERVICE_ACCOUNT_TOKEN \
        HOME="$T10" PATH="$STUB_OK:$NO_BUN_PATH" \
        bash "$INSTALL_SCRIPT" 2>&1) || { fail "install-home.sh exited non-zero on case 10"; printf '%s\n' "$out10" >&2; }
if [ ! -e "$T10/.config/claudecode-agents" ] && [ -f "$T10/.config/coder-fleet/secrets.spec" ]; then
    pass "a real run whose checks pass moves the secrets directory"
else
    fail "a real run whose checks pass did not move the secrets directory (got: $out10)"
fi
repo10=$(jq -r '.extraKnownMarketplaces.rzem.source.repo' "$T10/.claude/settings.json")
if [ "$repo10" = rzem-ai/coder-fleet ]; then
    pass "a real run whose checks pass repoints the marketplace"
else
    fail "a real run whose checks pass left the marketplace at '$repo10'"
fi
# The repoint is the first write to settings.json, so the backup must hold the
# file as it was before it, and the file keeps its mode.
bak10=$(find "$T10/.local/state/coder-fleet/backups" -name settings.json -type f 2>/dev/null | head -1)
if [ -n "$bak10" ] && cmp -s "$bak10" "$T/case10-before.json"; then
    pass "a real run backs up settings.json as it was before the repoint"
else
    fail "a real run left no backup of the original settings.json (found: '${bak10:-none}')"
fi
mode10=$(python3 -c 'import os,stat,sys; print(oct(stat.S_IMODE(os.stat(sys.argv[1]).st_mode)))' "$T10/.claude/settings.json")
if [ "$mode10" = 0o644 ]; then
    pass "the repoint keeps settings.json's mode"
else
    fail "the repoint changed settings.json's mode to $mode10"
fi
if [ "$(cat "$T10/.config/coder-fleet/token" 2>/dev/null)" = rendered-value ]; then
    pass "a real run renders the secret into the new directory after the move"
else
    fail "a real run did not render the secret into ~/.config/coder-fleet (got: $out10)"
fi

# --- A real run whose move fails stops there, with nothing else written ---
#
# ~/.config is made read-only, so the rename of the old directory fails. The
# run must stop at the move rather than carry on pointed at a new directory
# that does not exist, and must not repoint the marketplace afterwards.

T11="$T/case11-real-mv-fails"
mkdir -p "$T11/.config/claudecode-agents" "$T11/.claude"
printf 'token|op://vault/item/field\n' > "$T11/.config/claudecode-agents/secrets.spec"
cat > "$T11/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/claudecode-agents" } }
  }
}
JSON
cp "$T11/.claude/settings.json" "$T/case11-before.json"
chmod 555 "$T11/.config"
rc11=0
out11=$(env -u CLAUDE_CONFIG_DIR -u CODER_FLEET_SECRET_SPEC -u CODER_FLEET_BACKUP_DIR \
        -u XDG_STATE_HOME -u OP_SERVICE_ACCOUNT_TOKEN \
        HOME="$T11" PATH="$STUB_OK:$NO_BUN_PATH" \
        bash "$INSTALL_SCRIPT" 2>&1) || rc11=$?
chmod 755 "$T11/.config"
if [ "$rc11" -ne 0 ]; then
    pass "a real run exits non-zero when the secrets directory cannot be moved"
else
    fail "a real run exited 0 though the move failed (got: $out11)"
fi
if [ -f "$T11/.config/claudecode-agents/secrets.spec" ] && [ ! -e "$T11/.config/coder-fleet" ]; then
    pass "a failed move leaves the old directory and creates no new one"
else
    fail "a failed move left a new directory behind or lost the old one"
fi
if cmp -s "$T11/.claude/settings.json" "$T/case11-before.json"; then
    pass "a failed move leaves settings.json byte-identical"
else
    fail "a failed move still repointed settings.json"
fi
if grep -q 'could not move' <<<"$out11"; then
    pass "a failed move says it could not move the directory"
else
    fail "a failed move did not say so (got: $out11)"
fi

if [ "$FAILED" -eq 0 ]; then
    printf 'install-home-migration: all assertions pass\n'
    exit 0
else
    printf 'install-home-migration: FAILED\n'
    exit 1
fi
