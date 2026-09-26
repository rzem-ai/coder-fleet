#!/usr/bin/env bash
#
# install-home-migration.sh - prove install-home.sh migrates a machine still
# on the old name, per docs/plans/coder-fleet-migration.md "Machines already
# running the fleet" and Task 4 of docs/plans/coder-fleet-migration-plan.md.
#
# Everything here runs against a temporary HOME under ${TMPDIR:-/tmp} and
# never touches the real ~/.config or ~/.claude. install-home.sh is sourced
# with INSTALL_HOME_LIB=1, which makes it define its functions and return
# before the main flow runs, so migrate_previous_install can be called
# directly and its effect on the filesystem checked without a 1Password
# session or a home/ tree to install.
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
    mode=$(stat -f '%Lp' "$T1/.config/coder-fleet/secrets.spec" 2>/dev/null || stat -c '%a' "$T1/.config/coder-fleet/secrets.spec")
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

if printf '%s' "$out2" | grep -q 'both exist'; then
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

if printf '%s' "$out5" | grep -q 'would move' && printf '%s' "$out5" | grep -q 'would repoint'; then
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
if printf '%s' "$out6" | grep -q '(0 listed' || printf '%s' "$out6" | grep -q 'skipping 1Password'; then
    fail "--dry-run counted no secrets though the old directory holds one (got: $out6)"
else
    pass "--dry-run counts the secrets in a directory it would move"
fi

# --- Assertion 4: the closing text names the new install id ---

if grep -q 'claude plugin install coder-fleet@rzem' "$INSTALL_SCRIPT"; then
    pass "the closing text names 'claude plugin install coder-fleet@rzem'"
else
    fail "install-home.sh never prints 'claude plugin install coder-fleet@rzem'"
fi

if [ "$FAILED" -eq 0 ]; then
    printf 'install-home-migration: all assertions pass\n'
    exit 0
else
    printf 'install-home-migration: FAILED\n'
    exit 1
fi
