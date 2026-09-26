#!/usr/bin/env bash
#
# install-home.sh - put the port's user-scope runtime on this machine.
#
# Two jobs, plan Phase 1:
#
#   1. Render the rzem-memory bearer token into
#      ~/.config/claude-agents/memory-token at mode 600.
#   2. Merge the rzem-memory `mcp` entry into ~/.config/opencode/opencode.json,
#      leaving every other server in that file alone.
#
# Why both live outside the repository: OpenCode merges config.json,
# opencode.json and opencode.jsonc from the global config directory into
# whatever the project supplies (packages/opencode/src/config/config.ts:270-274),
# so the credential-bearing entry never needs to be committed. A tree that does
# not contain the configuration cannot leak it.
#
# Why the token is a {file:} reference and never {env:}: an unset environment
# variable resolves to an empty string silently
# (packages/opencode/src/config/variable.ts:36-38), so the agent authenticates as
# nobody and the failure presents as a server-side auth error. A missing {file:}
# throws `bad file reference` at config load, before any session starts. That is
# measured, not assumed - see docs/measurements/runtime.md, observation 4.
#
# This script never prints a secret value. Sources are printed freely so a
# failure is diagnosable; values are not.
#
# Usage:
#   scripts/install-home.sh                 render the token and merge the entry
#   scripts/install-home.sh --dry-run       show what would change, change nothing
#   scripts/install-home.sh --token-only    skip the config merge
#   scripts/install-home.sh --config-only   skip the token, do not require the source
#   scripts/install-home.sh --help
#
# Safe to re-run. An unchanged token is left alone, and the config merge is
# idempotent.

set -euo pipefail

# ---------------------------------------------------------------------------
# Where the token comes from
# ---------------------------------------------------------------------------
#
# The fleet renders its secrets from 1Password with `op read`. The fleet vault
# does not exist yet - every op:// reference in
# claude-agents/scripts/install-home.sh is still a PLACEHOLDER - so this script
# reads the live source instead, and switches to 1Password by filling OP_REF in.
#
# The live source is the token the memory server itself checks:
# /etc/agent-memory/auth_token.secret on slarti, named by
# `secret = { file = ... }` under [[auth.tokens]] name = "claude-code" in
# /etc/agent-memory/mcp.toml. Note that is NOT the AGENT_MEMORY_TOKEN_CLAUDE_CODE
# variable in /etc/agent-memory/agent-memory.env - that variable is stale and the
# server does not read it. A token rendered from it gets a 401.

OP_REF=""   # PLACEHOLDER: e.g. op://Fleet/rzem-memory/credential. Empty means use the ssh source.

TOKEN_HOST="${RZEM_MEMORY_TOKEN_HOST:-slarti}"
TOKEN_PATH="${RZEM_MEMORY_TOKEN_PATH:-/etc/agent-memory/auth_token.secret}"

MCP_KEY="rzem-memory"
MCP_URL="https://memory-mcp.rzem.ai/mcp"

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------

SCRIPT_NAME=$(basename "$0")

SECRETS_DIR="$HOME/.config/claude-agents"
TOKEN_FILE="$SECRETS_DIR/memory-token"
OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
OPENCODE_CONFIG="$OPENCODE_DIR/opencode.json"

DRY_RUN=0
DO_TOKEN=1
DO_CONFIG=1

N_TOKEN_WRITTEN=0
N_TOKEN_UNCHANGED=0
N_TOKEN_FAILED=0
N_CONFIG_CHANGED=0
N_CONFIG_UNCHANGED=0

say()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '%s: warning: %s\n' "$SCRIPT_NAME" "$*" >&2; }
die()  { printf '%s: error: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }

usage() {
    sed -n '3,40p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
    case "$1" in
        -n|--dry-run)  DRY_RUN=1 ;;
        --token-only)  DO_CONFIG=0 ;;
        --config-only) DO_TOKEN=0 ;;
        -h|--help)     usage; exit 0 ;;
        *)             die "unknown argument: $1 (try --help)" ;;
    esac
    shift
done

# Tracing would print the token. Refuse rather than leak.
case "$-" in
    *x*) die "refusing to run under 'set -x' - tracing would print the token" ;;
esac

command -v python3 >/dev/null 2>&1 || die 'python3 is required to merge the OpenCode config'

# ---------------------------------------------------------------------------
# The token
# ---------------------------------------------------------------------------
#
# Written through a temporary file in the same directory, so a failed fetch
# leaves an existing working token untouched rather than truncating it to zero
# bytes. A zero-byte token is the worst outcome available: {file:} resolves it
# without throwing, and the agent then authenticates as nobody - exactly the
# failure the {file:} choice exists to prevent.

fetch_token() {
    # Writes the token to stdout. Never logs it.
    if [ -n "$OP_REF" ]; then
        command -v op >/dev/null 2>&1 || { warn "1Password CLI (op) not found and OP_REF is set"; return 1; }
        op read --no-newline "$OP_REF" 2>/dev/null
    else
        ssh "$TOKEN_HOST" "sudo -n head -c 4096 $TOKEN_PATH" 2>/dev/null
    fi
}

install_token() {
    local source_desc tmp
    if [ -n "$OP_REF" ]; then
        source_desc="$OP_REF"
    else
        source_desc="$TOKEN_HOST:$TOKEN_PATH"
    fi

    say ""
    say "Token ($TOKEN_FILE, mode 600)"
    info "source        $source_desc"

    if [ "$DRY_RUN" -eq 1 ]; then
        if [ -f "$TOKEN_FILE" ]; then
            info "would refresh memory-token"
        else
            info "would render  memory-token"
        fi
        return 0
    fi

    mkdir -p "$SECRETS_DIR"
    chmod 0700 "$SECRETS_DIR"

    tmp=$(mktemp "$SECRETS_DIR/.tmp.XXXXXX")
    chmod 0600 "$tmp"

    # The trailing newline is stripped here as well as by OpenCode, which trims
    # and JSON-escapes file content before substitution. Stripping it locally
    # means the file is byte-comparable across runs.
    if ! fetch_token | tr -d '\r\n' > "$tmp"; then
        rm -f "$tmp"
        warn "could not read the token from $source_desc - leaving memory-token as it is."
        N_TOKEN_FAILED=$((N_TOKEN_FAILED + 1))
        return 0
    fi

    if [ ! -s "$tmp" ]; then
        rm -f "$tmp"
        warn "$source_desc resolved to an empty value - leaving memory-token as it is."
        warn "an empty token file would authenticate as nobody without throwing."
        N_TOKEN_FAILED=$((N_TOKEN_FAILED + 1))
        return 0
    fi

    if [ -f "$TOKEN_FILE" ] && cmp -s "$tmp" "$TOKEN_FILE"; then
        rm -f "$tmp"
        chmod 0600 "$TOKEN_FILE"
        N_TOKEN_UNCHANGED=$((N_TOKEN_UNCHANGED + 1))
        info "unchanged     memory-token"
        return 0
    fi

    mv "$tmp" "$TOKEN_FILE"
    chmod 0600 "$TOKEN_FILE"
    N_TOKEN_WRITTEN=$((N_TOKEN_WRITTEN + 1))
    info "rendered      memory-token"
}

# ---------------------------------------------------------------------------
# The OpenCode global config
# ---------------------------------------------------------------------------
#
# Merged, never copied. The live file carries the user's own MCP servers,
# instructions and plugins, and a copy would delete all of it.
#
# `oauth: false` is load-bearing. Without it OpenCode attaches an OAuth provider
# to any remote server (packages/opencode/src/mcp/index.ts:250-265), and this
# server advertises /.well-known/oauth-protected-resource, so the static bearer
# header is not guaranteed to be what authenticates.

merge_config() {
    local status
    say ""
    say "OpenCode config ($OPENCODE_CONFIG)"
    info "entry         $MCP_KEY -> $MCP_URL"

    if [ "$DRY_RUN" -eq 0 ]; then
        mkdir -p "$OPENCODE_DIR"
    fi

    set +e
    python3 - "$OPENCODE_CONFIG" "$MCP_KEY" "$MCP_URL" "$TOKEN_FILE" "$DRY_RUN" <<'PY'
import collections, json, os, sys

path, key, url, token_file, dry = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] == "1"

# The reference is written with a literal ~ so the config stays portable across
# machines; OpenCode expands a leading ~/ itself.
home = os.path.expanduser("~")
ref = token_file[len(home):].lstrip("/") if token_file.startswith(home) else token_file
ref = "~/" + ref if not ref.startswith("/") else ref

entry = collections.OrderedDict([
    ("type", "remote"),
    ("url", url),
    ("enabled", True),
    ("oauth", False),
    ("headers", collections.OrderedDict([("Authorization", "Bearer {file:%s}" % ref)])),
])

if os.path.exists(path):
    with open(path) as fh:
        text = fh.read().strip()
    doc = json.loads(text, object_pairs_hook=collections.OrderedDict) if text else collections.OrderedDict()
else:
    doc = collections.OrderedDict([("$schema", "https://opencode.ai/config.json")])

doc.setdefault("mcp", collections.OrderedDict())
if doc["mcp"].get(key) == entry:
    sys.exit(2)

if dry:
    sys.exit(0)

doc["mcp"][key] = entry
tmp = path + ".tmp"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
os.replace(tmp, path)
os.chmod(path, 0o600)
sys.exit(0)
PY
    status=$?
    set -e

    case "$status" in
        0)
            if [ "$DRY_RUN" -eq 1 ]; then
                info "would merge   $MCP_KEY (other servers preserved)"
            else
                info "merged        $MCP_KEY (other servers preserved)"
            fi
            N_CONFIG_CHANGED=$((N_CONFIG_CHANGED + 1))
            ;;
        2)
            info "unchanged     $MCP_KEY"
            N_CONFIG_UNCHANGED=$((N_CONFIG_UNCHANGED + 1))
            ;;
        *)
            die "merging $OPENCODE_CONFIG failed; the existing file has not been touched"
            ;;
    esac
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

say "$SCRIPT_NAME"
say "  secrets     $SECRETS_DIR"
say "  opencode    $OPENCODE_CONFIG"
if [ "$DRY_RUN" -eq 1 ]; then
    say "  mode        DRY RUN - nothing is written"
fi

[ "$DO_TOKEN" -eq 1 ] && install_token
[ "$DO_CONFIG" -eq 1 ] && merge_config

say ""
say "Summary"
if [ "$DO_TOKEN" -eq 1 ]; then
    say "  token     written $N_TOKEN_WRITTEN, unchanged $N_TOKEN_UNCHANGED, failed $N_TOKEN_FAILED"
fi
if [ "$DO_CONFIG" -eq 1 ]; then
    say "  config    changed $N_CONFIG_CHANGED, unchanged $N_CONFIG_UNCHANGED"
fi

if [ "$N_TOKEN_FAILED" -gt 0 ]; then
    say ""
    say "The token could not be rendered. Check that you can reach the source:"
    say "  ssh $TOKEN_HOST 'sudo -n test -r $TOKEN_PATH && echo readable'"
    exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
    say ""
    say "Dry run. Re-run without --dry-run to apply."
fi
